import { appendFileSync, mkdirSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { networkInterfaces, type NetworkInterfaceInfo } from "node:os";
import { join } from "node:path";
import {
  authorizedLocalRuntimeRequest,
  createLocalRuntimeSessionBootstrapCode,
  localRuntimeSessionSetCookie
} from "./auth.js";
import type { ActorRef } from "../../prr/src/draft-events.js";
import { resolveLocalRuntimeConfig, type ResolvedLocalRuntimeConfig } from "./config.js";
import { createLocalRuntimeHttpHandler } from "./http-handler.js";
import { readStaticUiFile } from "./static-files.js";

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

const defaultActor = {
  id: "actor_local_runtime",
  kind: "human",
  label: "Local Runtime User"
} as const;

export async function startLocalRuntimeServer(
  input: StartLocalRuntimeServerInput = {}
): Promise<LocalRuntimeServerHandle> {
  const config =
    input.config ??
    resolveLocalRuntimeConfig({
      ...(input.cwd === undefined ? {} : { cwd: input.cwd }),
      ...(input.env === undefined ? {} : { env: input.env })
    });
  const actor = input.actor ?? defaultActor;
  const handler = createLocalRuntimeHttpHandler({ config, actor });
  mkdirSync(config.logs.dir, { recursive: true });
  let closed = false;
  const sessionBootstrapCode = config.http.authRequired
    ? createLocalRuntimeSessionBootstrapCode()
    : undefined;

  const server = createServer(async (request, response) => {
    try {
      const path = pathnameFromRequestUrl(request.url);
      if (request.method === "GET" && path === "/api/local-session") {
        writeLocalSessionResponse(config, sessionBootstrapCode, request, response);
        return;
      }

      if (path?.startsWith("/api/") === true) {
        const headers = headersFrom(request);
        if (isProtectedApiPath(path) && !authorizedLocalRuntimeRequest(config, headers)) {
          writeJsonDiagnostic(response, 401, "Authentication is required for this local runtime route.", [
            "provide the configured local runtime auth token"
          ]);
          return;
        }

        const body = shouldReadRequestBody(request) ? await readRequestBody(request) : undefined;
        const handled = await handler({
          method: request.method ?? "GET",
          url: request.url ?? path,
          headers,
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
      appendSafeRuntimeLog(config, error);
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
    handler.close();
    throw error;
  }

  const sessionBootstrapUrls =
    sessionBootstrapCode === undefined
      ? []
      : buildSessionBootstrapUrls(config, server, sessionBootstrapCode, input.networkInterfaces ?? networkInterfaces);

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
        handler.close();
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
  config: ResolvedLocalRuntimeConfig,
  sessionBootstrapCode: string | undefined,
  request: IncomingMessage,
  response: ServerResponse
): void {
  if (!config.http.authRequired) {
    writeRedirect(response, "/", {});
    return;
  }

  const actualCode = sessionCodeFrom(request.url);
  if (
    sessionBootstrapCode === undefined ||
    actualCode === undefined ||
    actualCode !== sessionBootstrapCode
  ) {
    writeJsonDiagnostic(response, 401, "Local runtime browser session could not be established.", [
      "open the current local runtime session URL from the server output"
    ]);
    return;
  }

  const setCookie = localRuntimeSessionSetCookie(config);
  if (setCookie === undefined) {
    writeJsonDiagnostic(response, 500, "Local runtime session configuration is unavailable.", [
      "restart the local runtime"
    ]);
    return;
  }

  writeRedirect(response, "/", {
    "cache-control": "no-store",
    "set-cookie": setCookie
  });
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

function browserHostsFor(
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
  const parts = host.split(".").map((part) => Number(part));
  const [first, second] = parts;
  return parts.length === 4 && first === 100 && second !== undefined && second >= 64 && second <= 127;
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
  appendFileSync(join(config.logs.dir, "runtime.log"), line);
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
