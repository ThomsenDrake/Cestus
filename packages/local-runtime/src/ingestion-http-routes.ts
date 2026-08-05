import type { CreateIngestionRuntimeInput } from "../../ingestion/src/runtime.js";
import type {
  IngestionMountResult,
  IngestionWorkspaceMountResolver
} from "../../ingestion/src/mount-contract.js";
import type { IngestionErrorCode, IngestionRuntimeError } from "../../ingestion/src/runtime-types.js";
import type { LocalRuntimeRequest, LocalRuntimeResponse } from "./http-handler.js";
import {
  createResidentSourceBoundaryService,
  type ResidentSourceBoundaryService
} from "../../ingestion/src/resident-source-boundary.js";
import { createAgentToolGateway, requestResidentSourceBoundaryApproval } from "../../agent/src/index.js";
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
  if (route.kind === "workspace") {
    return json(200, workspaceDto(mount));
  }

  if (!mount.ok) {
    return json(503, ingestionErrorBody(mount.error));
  }

  if (route.kind === "resident-source-boundary") {
    if (input.actor.kind !== "human") {
      return json(403, ingestionErrorBody({
        code: "INGESTION_RUNTIME_INTERNAL",
        message: "Resident source boundary selection and protected readback require a human actor.",
        allowedRepairActions: ["sign in as an authenticated human operator"]
      }));
    }
    try {
      const service = residentSourceBoundaryService(mount.workspace, input.ingestionMountResolver);
      if (route.action === "discover") return json(200, await service.discover(requiredDiscoveryInput(payload.value)));
      if (route.action === "review-discovery") {
        return json(200, await service.readProtectedDiscovery({ actorKind: "human", discoveryArtifactHash: route.artifactHash }));
      }
      if (route.action === "review-boundary") {
        return json(200, await service.readProtectedBoundary({ actorKind: "human", manifestArtifactHash: route.artifactHash }));
      }
      const proposal = await service.proposeBoundary(requiredBoundaryProposal(payload.value));
      const request = await requestResidentSourceBoundaryApproval({
        ledger: mount.workspace.ledger,
        gateway: createAgentToolGateway({
          ledger: mount.workspace.ledger,
          actor: { id: "agent_default", kind: "agent", label: "Resident Cestus Agent" },
          now: () => new Date().toISOString()
        }),
        toolRequestId: requiredIdentifier(payload.value.toolRequestId, "tool request id"),
        taskId: requiredIdentifier(payload.value.taskId, "task id"),
        runId: requiredIdentifier(payload.value.runId, "run id"),
        workflowId: proposal.workflowId,
        workspaceId: proposal.workspaceId,
        sourceCollectionId: proposal.sourceCollectionId,
        sourceIdentity: proposal.sourceIdentity,
        sourceRootHash: proposal.sourceRootHash,
        discoveryArtifactHash: proposal.discoveryArtifactHash,
        discoveryHash: proposal.discoveryHash,
        manifestArtifactHash: proposal.manifestArtifactHash,
        manifestHash: proposal.manifestHash,
        archivePolicy: proposal.archivePolicy,
        regularFileCount: proposal.includedFileCount + proposal.excludedFileCount,
        includedFileCount: proposal.includedFileCount,
        excludedFileCount: proposal.excludedFileCount,
        includedBytes: proposal.includedBytes,
        excludedBytes: proposal.excludedBytes,
        totalBytes: proposal.totalBytes
      });
      return json(200, { ...proposal, toolRequestId: request.payload.toolRequestId, previewHash: request.payload.previewHash });
    } catch (error) {
      return json(409, ingestionErrorBody({
        code: "INGESTION_RUNTIME_INTERNAL",
        message: "Resident source boundary request was rejected before a protected write or authority decision.",
        allowedRepairActions: ["review the mounted workspace and exact boundary selection"]
      }));
    }
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
    return json(200, await method(runtimePayload(route, payload.value, input.actor) as never));
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

function runtimePayload(
  route: RuntimeRoute,
  payload: Record<string, unknown>,
  actor: CreateIngestionRuntimeInput["actor"]
): Record<string, unknown> {
  if (route.runtimeMethod === "approveRawImport" || route.runtimeMethod === "approveProviderParsing") {
    return { ...payload, approvedBy: actor.id };
  }

  return payload;
}

type WorkspaceRoute = {
  readonly kind: "workspace";
  readonly bodyKind: "query";
  readonly queryFields?: readonly string[];
};

type ResidentSourceBoundaryRoute = {
  readonly kind: "resident-source-boundary";
  readonly bodyKind: "json" | "query";
  readonly action: "discover" | "propose" | "review-discovery" | "review-boundary";
  readonly artifactHash?: `sha256:${string}`;
};

type Route = RuntimeRoute | WorkspaceRoute | ResidentSourceBoundaryRoute;

type RuntimeRoute = {
  readonly kind: "runtime";
  readonly runtimeMethod:
    | "listJobs"
    | "listSources"
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
  if (method === "POST" && path === "/api/ingestion/resident-source-boundaries/discover") {
    return { kind: "resident-source-boundary", bodyKind: "json", action: "discover" };
  }
  if (method === "POST" && path === "/api/ingestion/resident-source-boundaries/propose") {
    return { kind: "resident-source-boundary", bodyKind: "json", action: "propose" };
  }
  const protectedReview = /^\/api\/ingestion\/resident-source-boundaries\/(discoveries|manifests)\/(sha256:[a-f0-9]{64})$/.exec(path);
  if (method === "GET" && protectedReview !== null) {
    return {
      kind: "resident-source-boundary",
      bodyKind: "query",
      action: protectedReview[1] === "discoveries" ? "review-discovery" : "review-boundary",
      artifactHash: protectedReview[2] as `sha256:${string}`
    };
  }
  if (method === "GET" && path === "/api/ingestion/workspace") {
    return { kind: "workspace", bodyKind: "query" };
  }
  if (method === "GET" && path === "/api/ingestion/sources") {
    return { kind: "runtime", runtimeMethod: "listSources", bodyKind: "query" };
  }
  if (method === "GET" && path === "/api/ingestion/jobs") {
    return { kind: "runtime", runtimeMethod: "listJobs", bodyKind: "query", queryFields: ["sourceCollectionId"] };
  }
  if (method === "POST" && path === "/api/ingestion/jobs/retry") {
    return { kind: "runtime", runtimeMethod: "retryJob", bodyKind: "json" };
  }
  if (method === "POST" && path === "/api/ingestion/sources") {
    return { kind: "runtime", runtimeMethod: "registerSource", bodyKind: "json" };
  }
  if (method === "POST" && path === "/api/ingestion/scans/dry-run") {
    return { kind: "runtime", runtimeMethod: "dryRunScan", bodyKind: "json" };
  }
  if (method === "POST" && path === "/api/ingestion/imports/approve") {
    return { kind: "runtime", runtimeMethod: "approveRawImport", bodyKind: "json" };
  }
  if (method === "POST" && path === "/api/ingestion/imports/run") {
    return { kind: "runtime", runtimeMethod: "importApproved", bodyKind: "json" };
  }
  if (method === "POST" && path === "/api/ingestion/provider-parsing/approve") {
    return { kind: "runtime", runtimeMethod: "approveProviderParsing", bodyKind: "json" };
  }
  if (method === "GET" && path === "/api/ingestion/diagnostics") {
    return { kind: "runtime", runtimeMethod: "diagnostics", bodyKind: "query", queryFields: ["sourceCollectionId"] };
  }

  return undefined;
}

function residentSourceBoundaryService(
  workspace: Extract<IngestionMountResult, { readonly ok: true }> ["workspace"],
  resolver: IngestionWorkspaceMountResolver | undefined
): ResidentSourceBoundaryService {
  return createResidentSourceBoundaryService({
    workspace,
    assertCurrent: async () => {
      if (!workspace.capabilities.canReadLedger || !workspace.capabilities.canWriteDerivatives) {
        throw new Error("Mounted workspace is unavailable or read-only.");
      }
      if (resolver === undefined) throw new Error("Mounted workspace resolver is unavailable.");
      const current = await resolver.resolve({});
      if (!current.ok || current.workspace.workspaceId !== workspace.workspaceId) {
        throw new Error("Mounted workspace was replaced or became unavailable.");
      }
    }
  });
}

function requiredDiscoveryInput(payload: Record<string, unknown>) {
  if (Object.hasOwn(payload, "sourceIdentity")) throw new Error("Source identity is observed from selected-root metadata.");
  assertOnlyFields(payload, ["workflowId", "sourceCollectionId", "sourceRoot"]);
  return {
    workflowId: requiredIdentifier(payload.workflowId, "workflow id"),
    sourceCollectionId: requiredIdentifier(payload.sourceCollectionId, "source collection id"),
    sourceRoot: requiredSourceRoot(payload.sourceRoot)
  };
}

function requiredBoundaryProposal(payload: Record<string, unknown>) {
  assertOnlyFields(payload, ["workflowId", "discoveryArtifactHash", "includedRelativePaths", "excludedRelativePaths", "toolRequestId", "taskId", "runId"]);
  return {
    workflowId: requiredIdentifier(payload.workflowId, "workflow id"),
    discoveryArtifactHash: requiredArtifactHash(payload.discoveryArtifactHash),
    includedRelativePaths: requiredPathArray(payload.includedRelativePaths),
    excludedRelativePaths: requiredPathArray(payload.excludedRelativePaths),
    archivePolicy: "reject" as const
  };
}

function assertOnlyFields(payload: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(payload).some((key) => !allowed.includes(key))) throw new Error("Resident source boundary request contains an unsupported authority field.");
}

function requiredIdentifier(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{3,200}$/.test(value)) throw new Error(`Invalid ${label}.`);
  return value;
}
function requiredSourceRoot(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 4096 || value.includes("\0")) throw new Error("Invalid selected source root.");
  return value;
}
function requiredArtifactHash(value: unknown): `sha256:${string}` {
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value)) throw new Error("Invalid protected artifact hash.");
  return value;
}
function requiredPathArray(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new Error("Boundary paths must be a string array.");
  return value;
}

function workspaceDto(mount: IngestionMountResult | MountResolverFailure) {
  if (!mount.ok) {
    return {
      mounted: false,
      diagnostics: diagnosticsFromMountError(mount.error)
    };
  }

  return {
    mounted: true,
    workspaceId: mount.workspace.workspaceId,
    label: mount.workspace.label,
    capabilities: { ...mount.workspace.capabilities },
    diagnostics: []
  };
}

function diagnosticsFromMountError(
  error: {
    readonly message: string;
    readonly diagnostics?: IngestionRuntimeError["diagnostics"];
  }
) {
  return [
    ...(error.diagnostics ?? []),
    {
      severity: "error" as const,
      category: "ingestion.mount",
      message: error.message
    }
  ];
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
