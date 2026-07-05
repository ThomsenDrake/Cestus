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

  const server = createServer(async (request, response) => {
    try {
      if (request.url?.startsWith("/api/") === true) {
        const body = await readRequestBody(request);
        const handled = await handler({
          method: request.method ?? "GET",
          url: request.url,
          headers: headersFrom(request),
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
      handler.close();
      await closeServer(server);
    }
  });
}

function headersFrom(request: IncomingMessage): Record<string, string | undefined> {
  const headers: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(request.headers)) {
    headers[key.toLowerCase()] = Array.isArray(value) ? value.join(", ") : value;
  }
  return headers;
}

async function readRequestBody(request: IncomingMessage): Promise<string | undefined> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return chunks.length === 0 ? undefined : Buffer.concat(chunks).toString("utf8");
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
