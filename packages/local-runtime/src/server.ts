import { appendFileSync, mkdirSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { join } from "node:path";
import type { ActorRef } from "../../prr/src/draft-events.js";
import { resolveLocalRuntimeConfig, type ResolvedLocalRuntimeConfig } from "./config.js";
import { createLocalRuntimeHttpHandler } from "./http-handler.js";
import { readStaticUiFile } from "./static-files.js";

export interface StartLocalRuntimeServerInput {
  readonly config?: ResolvedLocalRuntimeConfig;
  readonly actor?: ActorRef;
  readonly env?: Record<string, string | undefined>;
  readonly cwd?: string;
}

export interface LocalRuntimeServerHandle {
  readonly config: ResolvedLocalRuntimeConfig;
  readonly server: Server;
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

  const server = createServer(async (request, response) => {
    try {
      const path = pathnameFromRequestUrl(request.url);
      if (path?.startsWith("/api/") === true) {
        const headers = headersFrom(request);
        if (isProtectedApiPath(path) && !authorized(config, headers)) {
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

  return Object.freeze({
    config,
    server,
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

function authorized(
  config: ResolvedLocalRuntimeConfig,
  headers: Record<string, string | undefined>
): boolean {
  if (!config.http.authRequired) {
    return true;
  }

  return config.http.authToken !== undefined && headers.authorization === `Bearer ${config.http.authToken}`;
}

function writeResponse(
  response: ServerResponse,
  status: number,
  contentType: string | undefined,
  body: Buffer
): void {
  response.statusCode = status;
  response.setHeader("content-type", contentType ?? "application/octet-stream");
  response.end(body);
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
      /(token|secret|password|authorization|api_key)(["'\s:=]+)[^\s"',;}]*/gi,
      "$1$2[redacted]"
    );
}

class RequestBodyTooLargeError extends Error {
  constructor() {
    super("Local runtime request body is too large");
  }
}
