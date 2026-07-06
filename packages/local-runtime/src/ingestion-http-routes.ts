import type { CreateIngestionRuntimeInput } from "../../ingestion/src/runtime.js";
import type {
  IngestionMountResult,
  IngestionWorkspaceMountResolver
} from "../../ingestion/src/mount-contract.js";
import type { IngestionErrorCode, IngestionRuntimeError } from "../../ingestion/src/runtime-types.js";
import type { LocalRuntimeRequest, LocalRuntimeResponse } from "./http-handler.js";
import {
  defaultLocalIngestionRuntimeFactory,
  type LocalIngestionRuntimeFactory
} from "./ingestion-runtime-factory.js";

const forbiddenStoragePathFields = new Set([
  "workspace",
  "workspaceRoot",
  "workspacePath",
  "storagePath",
  "sqlitePath",
  "blobRoot"
]);

export interface HandleIngestionHttpRouteInput {
  readonly request: LocalRuntimeRequest;
  readonly actor: CreateIngestionRuntimeInput["actor"];
  readonly ingestionMountResolver?: IngestionWorkspaceMountResolver;
  readonly ingestionRuntimeFactory?: LocalIngestionRuntimeFactory;
}

export async function handleIngestionHttpRoute(
  input: HandleIngestionHttpRouteInput
): Promise<LocalRuntimeResponse | undefined> {
  const url = new URL(input.request.url, "http://localhost");
  const route = routeFor(input.request.method, url.pathname);
  if (route === undefined) {
    return undefined;
  }

  const payload = route.bodyKind === "json"
    ? parseJsonBody(input.request.body)
    : { ok: true as const, value: queryPayload(url.searchParams, route.queryFields) };
  if (!payload.ok) {
    return json(400, payload.error);
  }

  const forbiddenField = firstForbiddenStoragePathField(payload.value);
  if (forbiddenField !== undefined) {
    return json(
      400,
      ingestionErrorBody({
        code: "INGESTION_HTTP_STORAGE_PATH_FORBIDDEN",
        message: `Ingestion HTTP request body must not include storage path field ${forbiddenField}.`,
        allowedRepairActions: [
          "remove workspace and storage paths from the request body",
          "mount the workspace through the configured workspace layer"
        ]
      })
    );
  }

  const mount = await resolveMountedWorkspace(input.ingestionMountResolver);
  if (!mount.ok) {
    return json(503, ingestionErrorBody(mount.error));
  }

  const runtimeFactory = input.ingestionRuntimeFactory ?? defaultLocalIngestionRuntimeFactory;
  const runtime = runtimeFactory({
    mountedWorkspace: mount.workspace,
    actor: input.actor
  });
  const method = runtime[route.runtimeMethod];
  if (typeof method !== "function") {
    return json(
      500,
      ingestionErrorBody({
        code: "INGESTION_RUNTIME_INTERNAL",
        message: "Ingestion runtime method is unavailable for this route.",
        allowedRepairActions: ["check local runtime wiring", "retry the ingestion action"]
      })
    );
  }

  try {
    return json(200, await method(payload.value as never));
  } catch {
    return json(
      500,
      ingestionErrorBody({
        code: "INGESTION_RUNTIME_INTERNAL",
        message: "Ingestion runtime threw while handling the HTTP route.",
        allowedRepairActions: ["retry the ingestion action", "inspect ingestion diagnostics"]
      })
    );
  }
}

type Route = {
  readonly runtimeMethod:
    | "listJobs"
    | "retryJob"
    | "registerSource"
    | "dryRunScan"
    | "approveRawImport"
    | "importApproved"
    | "approveProviderParsing"
    | "diagnostics";
  readonly bodyKind: "json" | "query";
  readonly queryFields?: readonly string[];
};

function routeFor(method: string, path: string): Route | undefined {
  if (method === "GET" && path === "/api/ingestion/jobs") {
    return { runtimeMethod: "listJobs", bodyKind: "query", queryFields: ["sourceCollectionId"] };
  }
  if (method === "POST" && path === "/api/ingestion/jobs/retry") {
    return { runtimeMethod: "retryJob", bodyKind: "json" };
  }
  if (method === "POST" && path === "/api/ingestion/sources/register") {
    return { runtimeMethod: "registerSource", bodyKind: "json" };
  }
  if (method === "POST" && path === "/api/ingestion/scans/dry-run") {
    return { runtimeMethod: "dryRunScan", bodyKind: "json" };
  }
  if (method === "POST" && path === "/api/ingestion/imports/approve") {
    return { runtimeMethod: "approveRawImport", bodyKind: "json" };
  }
  if (method === "POST" && path === "/api/ingestion/imports/import") {
    return { runtimeMethod: "importApproved", bodyKind: "json" };
  }
  if (method === "POST" && path === "/api/ingestion/provider-parsing/approve") {
    return { runtimeMethod: "approveProviderParsing", bodyKind: "json" };
  }
  if (method === "GET" && path === "/api/ingestion/diagnostics") {
    return { runtimeMethod: "diagnostics", bodyKind: "query", queryFields: ["sourceCollectionId"] };
  }

  return undefined;
}

function parseJsonBody(
  body: string | undefined
):
  | { readonly ok: true; readonly value: Record<string, unknown> }
  | { readonly ok: false; readonly error: { readonly ok: false; readonly error: IngestionRuntimeError } } {
  try {
    const value = body === undefined || body.trim() === "" ? {} : JSON.parse(body);
    if (!isJsonObject(value)) {
      return {
        ok: false,
        error: ingestionErrorBody({
          code: "INGESTION_RUNTIME_INTERNAL",
          message: "Ingestion HTTP request body must be a JSON object.",
          allowedRepairActions: ["send a JSON object request body"]
        })
      };
    }

    return { ok: true, value };
  } catch {
    return {
      ok: false,
      error: ingestionErrorBody({
        code: "INGESTION_RUNTIME_INTERNAL",
        message: "Ingestion HTTP request body must be valid JSON.",
        allowedRepairActions: ["send a valid JSON request body"]
      })
    };
  }
}

function queryPayload(
  params: URLSearchParams,
  fields: readonly string[] | undefined
): Record<string, string> {
  const payload: Record<string, string> = {};
  for (const field of fields ?? []) {
    const value = params.get(field);
    if (value !== null && value.trim().length > 0) {
      payload[field] = value;
    }
  }
  return payload;
}

async function resolveMountedWorkspace(
  resolver: IngestionWorkspaceMountResolver | undefined
): Promise<IngestionMountResult | MountResolverFailure> {
  if (resolver === undefined) {
    return {
      ok: false,
      error: {
        code: "INGESTION_WORKSPACE_NOT_MOUNTED",
        message: "Portable workspace is not mounted.",
        allowedRepairActions: ["mount the portable workspace", "retry the ingestion action"]
      }
    };
  }

  try {
    return await resolver.resolve({});
  } catch {
    return {
      ok: false,
      error: {
        code: "INGESTION_WORKSPACE_NOT_MOUNTED",
        message: "Portable workspace could not be resolved.",
        allowedRepairActions: ["mount the portable workspace", "retry the ingestion action"],
        diagnostics: [
          {
            severity: "error",
            category: "ingestion.mount",
            message: "Mounted workspace resolution failed before runtime construction."
          }
        ]
      }
    };
  }
}

type MountResolverFailure = {
  readonly ok: false;
  readonly error: {
    readonly code: "INGESTION_WORKSPACE_NOT_MOUNTED";
    readonly message: string;
    readonly allowedRepairActions: readonly string[];
    readonly diagnostics: IngestionRuntimeError["diagnostics"];
  };
};

function firstForbiddenStoragePathField(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const field = firstForbiddenStoragePathField(item);
      if (field !== undefined) {
        return field;
      }
    }
    return undefined;
  }

  if (!isJsonObject(value)) {
    return undefined;
  }

  for (const [key, nested] of Object.entries(value)) {
    if (forbiddenStoragePathFields.has(key)) {
      return key;
    }

    const field = firstForbiddenStoragePathField(nested);
    if (field !== undefined) {
      return field;
    }
  }

  return undefined;
}

function ingestionErrorBody(input: {
  readonly code: IngestionErrorCode;
  readonly message: string;
  readonly allowedRepairActions: readonly string[];
  readonly diagnostics?: IngestionRuntimeError["diagnostics"];
}): { readonly ok: false; readonly error: IngestionRuntimeError } {
  return Object.freeze({
    ok: false,
    error: Object.freeze({
      code: input.code,
      message: input.message,
      allowedRepairActions: Object.freeze([...input.allowedRepairActions]),
      diagnostics: Object.freeze((input.diagnostics ?? []).map((diagnostic) => Object.freeze({
        ...(diagnostic.diagnosticId === undefined ? {} : { diagnosticId: diagnostic.diagnosticId }),
        severity: diagnostic.severity,
        category: diagnostic.category,
        message: diagnostic.message
      })))
    })
  });
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function json(status: number, body: unknown): LocalRuntimeResponse {
  return Object.freeze({
    status,
    headers: Object.freeze({ "content-type": "application/json; charset=utf-8" }),
    body: JSON.stringify(body)
  });
}
