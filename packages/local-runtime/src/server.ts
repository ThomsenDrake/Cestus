import { appendFileSync, mkdirSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { networkInterfaces, type NetworkInterfaceInfo } from "node:os";
import { join } from "node:path";
import {
  authorizedLocalRuntimeRequest,
  createLocalRuntimeSessions
} from "./auth.js";
import type { ActorRef } from "../../prr/src/draft-events.js";
import { resolveLocalRuntimeConfig, type ResolvedLocalRuntimeConfig } from "./config.js";
import { observeServerWorkspace, unavailableWorkspaceDiagnostic } from "./server-workspace.js";
import { createLocalRuntimeHttpHandler, type LocalRuntimeHttpHandler } from "./http-handler.js";
import { readStaticUiFile } from "./static-files.js";
import { assertTailnetAddress, ipAddressesEquivalent, isTailnetAddress } from "./tailnet-address.js";

export interface StartLocalRuntimeServerInput {
  readonly config?: ResolvedLocalRuntimeConfig;
  readonly actor?: ActorRef;
  readonly env?: Record<string, string | undefined>;
  readonly cwd?: string;
  readonly networkInterfaces?: () => NodeJS.Dict<NetworkInterfaceInfo[]>;
}

export interface LocalRuntimeServerHandle {
  readonly config: ResolvedLocalRuntimeConfig;
  readonly server: Server;
  readonly sessionBootstrapUrl?: string;
  readonly sessionBootstrapUrls?: readonly string[];
  close(): Promise<void>;
}

export const MAX_LOCAL_RUNTIME_REQUEST_BODY_BYTES = 1_048_576;

export async function startLocalRuntimeServer(
  input: StartLocalRuntimeServerInput = {}
): Promise<LocalRuntimeServerHandle> {
  const config =
    input.config ??
    resolveLocalRuntimeConfig({
      ...(input.cwd === undefined ? {} : { cwd: input.cwd }),
      ...(input.env === undefined ? {} : { env: input.env })
    });
  const interfaces = input.networkInterfaces ?? networkInterfaces;
  assertTailnetAuthentication(config);
  assertTailnetHostAssigned(config, interfaces);
  if (!config.http.authRequired || !config.http.authToken?.trim()) {
    throw new Error("Local runtime requires authentication. Run local:runtime:configure first.");
  }
  const actor = input.actor ?? config.operator;
  if (!actor || actor.kind !== "human" || !actor.id.trim() || !actor.label?.trim()) {
    throw new Error("A configured human operator is required. Run local:runtime:configure first.");
  }
  let handler: LocalRuntimeHttpHandler | undefined;
  let workspace: ReturnType<typeof observeServerWorkspace> | undefined;
  let unavailable = false;
  try {
    workspace = observeServerWorkspace(config);
  } catch {
    unavailable = true;
  }
  if (!unavailable) {
    try {
      mkdirSync(config.logs.dir, { recursive: true });
    } catch {
      throw new Error("Local runtime log directory is unavailable. Check its configured path and write permissions, then restart Cestus.");
    }
    try {
      handler = createLocalRuntimeHttpHandler({ config, actor });
    } catch (error) {
      appendSafeRuntimeLog(config, error);
      throw new Error("Local runtime initialization failed. Inspect the local runtime logs and workspace database, then restart Cestus.");
    }
  }
  let closed = false;
  const sessions = createLocalRuntimeSessions(config);
  const sessionBootstrapCode = sessions.bootstrapCode;
  function storageAvailable(): boolean {
    if (unavailable) return false;
    try {
      if (observeServerWorkspace(config).identity !== workspace?.identity) unavailable = true;
    } catch { unavailable = true; }
    return !unavailable;
  }

  const server = createServer(async (request, response) => {
    try {
      response.setHeader("cache-control", "no-store");
      response.setHeader("referrer-policy", "no-referrer");
      response.setHeader("x-content-type-options", "nosniff");
      response.setHeader("x-frame-options", "DENY");
      const path = pathnameFromRequestUrl(request.url);
      const headers = headersFrom(request);
      const allowedOrigins = buildServerOrigins(config, server, interfaces);
      const hostOrigin = new URL(`http://${headers.host}`).origin;
      const origin = headers.origin;
      if (!allowedOrigins.includes(hostOrigin) ||
          (origin !== undefined && (origin !== hostOrigin || !allowedOrigins.includes(origin))) ||
          headers["sec-fetch-site"] === "cross-site" || headers["sec-fetch-site"] === "same-site") {
        writeJsonDiagnostic(response, 403, "This browser origin is not authorized.", ["open the local runtime URL from the server output"]);
        return;
      }
      if (request.method === "GET" && path === "/api/local-session") {
        writeLocalSessionResponse(sessions, request, response);
        return;
      }

      if (path?.startsWith("/api/") === true) {
        if (isProtectedApiPath(path) && !sessions.authorized(headers)) {
          writeJsonDiagnostic(response, 401, "Authentication is required for this local runtime route.", [
            "provide the configured local runtime auth token"
          ]);
          return;
        }

        if (shouldReadRequestBody(request) && !authorizedLocalRuntimeRequest(config, headers) && origin !== hostOrigin) {
          writeJsonDiagnostic(response, 403, "Browser mutations require the same origin.", ["reload Cestus from its session URL"]);
          return;
        }
        const available = storageAvailable();
        if (request.method === "GET" && (path === "/api/health" || path === "/api/workspace-status")) {
          const state = available ? workspace?.state ?? "unavailable" : "unavailable";
          writeResponse(response, available ? 200 : 503, "application/json; charset=utf-8", Buffer.from(JSON.stringify({
            ok: available, backend: "running", workspaceState: state,
            authRequired: true, devSeedEnabled: config.http.devSeedEnabled,
            ...(path === "/api/workspace-status" && available ? {
              workspaceId: workspace?.workspaceId, label: workspace?.label,
              storageLocation: workspace?.storageLocation, operator: actor
            } : {}),
            ...(available ? {} : { diagnostic: unavailableWorkspaceDiagnostic })
          })));
          return;
        }
        if (!available || !handler) {
          writeJsonDiagnostic(response, 503, unavailableWorkspaceDiagnostic.message, unavailableWorkspaceDiagnostic.allowedRepairActions);
          return;
        }
        const readsBody = shouldReadRequestBody(request);
        const body = readsBody ? await readRequestBody(request) : undefined;
        // Body reads can yield while a drive is disconnected. Recheck before dispatch.
        if (readsBody && !storageAvailable()) {
          writeJsonDiagnostic(response, 503, unavailableWorkspaceDiagnostic.message, unavailableWorkspaceDiagnostic.allowedRepairActions);
          return;
        }
        const handled = await handler({
          method: request.method ?? "GET",
          url: request.url ?? path,
          headers: { ...headers, authorization: `Bearer ${config.http.authToken}` },
          ...(body === undefined ? {} : { body })
        });
        writeResponse(
          response,
          handled.status,
          handled.headers["content-type"],
          Buffer.from(handled.body)
        );
        return;
      }

      const staticResponse = readStaticUiFile(config.staticUi.distDir, request.url ?? "/");
      writeResponse(response, staticResponse.status, staticResponse.contentType, staticResponse.body);
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        writeJsonDiagnostic(response, 413, "Request body is too large.", ["send a smaller JSON request body"]);
        return;
      }
      if (storageAvailable()) appendSafeRuntimeLog(config, error);
      writeResponse(
        response,
        500,
        "application/json; charset=utf-8",
        Buffer.from(
          JSON.stringify({
            ok: false,
            diagnostic: {
              message: "Local runtime request failed.",
              allowedRepairActions: ["inspect local runtime logs", "restart the local runtime"]
            }
          })
        )
      );
    }
  });

  try {
    await listen(server, config);
  } catch (error) {
    await handler?.close();
    throw error;
  }

  const sessionBootstrapUrls =
    sessionBootstrapCode === undefined
      ? []
      : buildSessionBootstrapUrls(config, server, sessionBootstrapCode, interfaces);

  return Object.freeze({
    config,
    server,
    ...(sessionBootstrapUrls.length === 0
      ? {}
      : {
          sessionBootstrapUrl: sessionBootstrapUrls[0],
          sessionBootstrapUrls: Object.freeze(sessionBootstrapUrls)
        }),
    async close() {
      if (closed) {
        return;
      }
      closed = true;
      try {
        await closeServer(server);
      } finally {
        await handler?.close();
      }
    }
  });
}

function pathnameFromRequestUrl(url: string | undefined): string | undefined {
  if (url === undefined) {
    return undefined;
  }
  try {
    return new URL(url, "http://localhost").pathname;
  } catch {
    return undefined;
  }
}

function headersFrom(request: IncomingMessage): Record<string, string | undefined> {
  const headers: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(request.headers)) {
    headers[key.toLowerCase()] = Array.isArray(value) ? value.join(", ") : value;
  }
  return headers;
}

async function readRequestBody(request: IncomingMessage): Promise<string | undefined> {
  const declaredLength = contentLengthFrom(request);
  if (
    declaredLength !== undefined &&
    declaredLength > MAX_LOCAL_RUNTIME_REQUEST_BODY_BYTES
  ) {
    throw new RequestBodyTooLargeError();
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > MAX_LOCAL_RUNTIME_REQUEST_BODY_BYTES) {
      throw new RequestBodyTooLargeError();
    }
    chunks.push(buffer);
  }
  return chunks.length === 0 ? undefined : Buffer.concat(chunks).toString("utf8");
}

function contentLengthFrom(request: IncomingMessage): number | undefined {
  const value = request.headers["content-length"];
  if (typeof value !== "string") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function shouldReadRequestBody(request: IncomingMessage): boolean {
  return request.method !== "GET" && request.method !== "HEAD";
}

function isProtectedApiPath(path: string): boolean {
  return path.startsWith("/api/") && path !== "/api/health";
}

function writeLocalSessionResponse(
  sessions: ReturnType<typeof createLocalRuntimeSessions>,
  request: IncomingMessage,
  response: ServerResponse
): void {
  const setCookie = sessions.establish(sessionCodeFrom(request.url));
  if (setCookie === undefined) {
    writeJsonDiagnostic(response, 401, "Local browser session link is expired or already used.", [
      "restart Cestus and open the new session URL from the server output"
    ]);
    return;
  }
  writeRedirect(response, "/", { "set-cookie": setCookie });
}

function buildServerOrigins(
  config: ResolvedLocalRuntimeConfig,
  server: Server,
  interfaces: () => NodeJS.Dict<NetworkInterfaceInfo[]>
): readonly string[] {
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : config.http.port;
  const hosts = [...browserHostsFor(config, interfaces)];
  if (isWildcardHost(config.http.host)) hosts.push(config.http.host === "::" ? "::1" : "127.0.0.1");
  if (config.http.bindMode === "loopback") hosts.push("localhost");
  return hosts.map(host => new URL(`http://${hostForUrl(host)}:${port}`).origin);
}

function sessionCodeFrom(url: string | undefined): string | undefined {
  if (url === undefined) {
    return undefined;
  }
  try {
    return new URL(url, "http://localhost").searchParams.get("code") ?? undefined;
  } catch {
    return undefined;
  }
}

function buildSessionBootstrapUrls(
  config: ResolvedLocalRuntimeConfig,
  server: Server,
  code: string,
  interfaces: () => NodeJS.Dict<NetworkInterfaceInfo[]>
): readonly string[] {
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : config.http.port;
  return browserHostsFor(config, interfaces).map(
    (host) => `http://${hostForUrl(host)}:${port}/api/local-session?code=${encodeURIComponent(code)}`
  );
}

export function browserHostsFor(
  config: ResolvedLocalRuntimeConfig,
  interfaces: () => NodeJS.Dict<NetworkInterfaceInfo[]>
): readonly string[] {
  if (!isWildcardHost(config.http.host)) {
    return Object.freeze([config.http.host]);
  }

  const candidates = publicIpv4Hosts(interfaces());
  const bindCandidates =
    config.http.bindMode === "tailnet" ? candidates.filter(isTailnetIpv4Host) : candidates;

  return Object.freeze(uniqueStrings(bindCandidates.length > 0 ? bindCandidates : candidates.length > 0 ? candidates : ["127.0.0.1"]));
}

function publicIpv4Hosts(interfaces: NodeJS.Dict<NetworkInterfaceInfo[]>): readonly string[] {
  return Object.values(interfaces)
    .flatMap((items) => items ?? [])
    .filter((item) => item.family === "IPv4" && !item.internal)
    .map((item) => item.address);
}

function isWildcardHost(host: string): boolean {
  return host === "0.0.0.0" || host === "::";
}

function isTailnetIpv4Host(host: string): boolean {
  return isTailnetAddress(host);
}

function assertTailnetHostAssigned(
  config: ResolvedLocalRuntimeConfig,
  interfaces: () => NodeJS.Dict<NetworkInterfaceInfo[]>
): void {
  if (config.http.bindMode !== "tailnet") {
    return;
  }

  assertTailnetAddress(config.http.host);
  const assigned = Object.values(interfaces())
    .flatMap((items) => items ?? [])
    .some((item) => ipAddressesEquivalent(item.address, config.http.host));
  if (!assigned) {
    throw new Error("Tailnet local runtime host must be assigned to a local network interface");
  }
}

function assertTailnetAuthentication(config: ResolvedLocalRuntimeConfig): void {
  if (config.http.bindMode !== "tailnet") {
    return;
  }
  const token = config.http.authToken;
  if (config.http.authRequired !== true || token === undefined || token.trim().length === 0) {
    throw new Error("Tailnet local runtime requires authentication");
  }
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

function hostForUrl(host: string): string {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

function writeResponse(
  response: ServerResponse,
  status: number,
  contentType: string | undefined,
  body: Buffer,
  headers: Record<string, string> = {}
): void {
  response.statusCode = status;
  for (const [name, value] of Object.entries(headers)) {
    response.setHeader(name, value);
  }
  response.setHeader("content-type", contentType ?? "application/octet-stream");
  response.end(body);
}

function writeRedirect(
  response: ServerResponse,
  location: string,
  headers: Record<string, string>
): void {
  response.statusCode = 303;
  response.setHeader("location", location);
  for (const [name, value] of Object.entries(headers)) {
    response.setHeader(name, value);
  }
  response.setHeader("content-type", "text/plain; charset=utf-8");
  response.end("");
}

function writeJsonDiagnostic(
  response: ServerResponse,
  status: number,
  message: string,
  allowedRepairActions: readonly string[]
): void {
  writeResponse(
    response,
    status,
    "application/json; charset=utf-8",
    Buffer.from(
      JSON.stringify({
        ok: false,
        diagnostic: {
          message,
          allowedRepairActions
        }
      })
    )
  );
}

async function listen(server: Server, config: ResolvedLocalRuntimeConfig): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(config.http.port, config.http.host);
  });
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error !== undefined) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function appendSafeRuntimeLog(config: ResolvedLocalRuntimeConfig, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const line = `${new Date().toISOString()} ${redactSecretMaterial(message)}\n`;
  try { appendFileSync(join(config.logs.dir, "runtime.log"), line); } catch { /* Logging must not recreate missing storage. */ }
}

function redactSecretMaterial(message: string): string {
  return message
    .replaceAll(/bearer\s+[a-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replaceAll(
      /(token|secret|password|authorization|api_key|oauth|credential|private_key|session)(["'\s:=]+)[^\s"',;}]*/gi,
      "$1$2[redacted]"
    );
}

class RequestBodyTooLargeError extends Error {
  constructor() {
    super("Local runtime request body is too large");
  }
}
