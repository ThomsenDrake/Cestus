import type { KnowledgeEvent } from "../../ontology/src/contracts.js";
import { type ActorRef, type CreateDraftRequestInput } from "../../prr/src/draft-events.js";
import type { DeadlineCalculator, PrrRuntimeNow } from "../../prr/src/runtime.js";
import { prrWorkspaceSeedEvents } from "../../prr/src/workspace-seed.js";
import type { IngestionWorkspaceMountResolver } from "../../ingestion/src/mount-contract.js";
import { mountedWorkspaceCapabilities, type MountedWorkspace } from "../../ingestion/src/mount-contract.js";
import { FileBlobStore } from "../../ontology/src/blob-store.js";
import {
  acquireMountedEvidenceTriageHandoffForLocalAgentRuntimeFactory,
  bindMountedAdvisoryHandoffForLocalAgentRuntimeFactory,
  bindMountedSourcedInvestigationHandoffForLocalAgentRuntimeFactory,
  contextFreeLocalAgentRuntimeFactory,
  type LocalAgentRuntimeFactory
} from "./agent-runtime-factory.js";
import { handleAgentHttpRoute } from "./agent-http-routes.js";
import {
  createMountedEvidenceTriageBackgroundExecutionPort,
  createMountedSourcedInvestigationExecutionPort,
  type MountedTaskBackgroundExecutionObservation
} from "./agent-runtime-mounted-task.js";
import {
  createResidentSupervisionRuntime,
  inspectPortableWorkspaceCurrentness,
  type ResidentBackgroundExecutionPort
} from "./wake-supervisor-runtime.js";
import { authorizedLocalRuntimeRequest } from "./auth.js";
import type { ResolvedLocalRuntimeConfig } from "./config.js";
import { handleEvidenceHttpRoute } from "./evidence-http-routes.js";
import { handleIngestionHttpRoute } from "./ingestion-http-routes.js";
import { humanIngestionMountResolver } from "./human-ingestion-mount.js";
import { createDocumentProcessingService } from "./document-processing.js";
import { handleDocumentProcessingHttpRoute } from "./document-processing-http-routes.js";
import { resolveExternalDocumentSelection } from "./evidence-content.js";
import type { LocalIngestionRuntimeFactory } from "./ingestion-runtime-factory.js";
import { createDefaultOperatorStatusProviders } from "./operator-status-providers.js";
import { handleOntologyHttpRoute } from "./ontology-http-routes.js";
import { handleOperatorStatusRoute } from "./operator-status-routes.js";
import type { OperatorStatusProviderSet } from "./operator-status.js";
import {
  createSqlitePrrRuntime,
  type ResidentIdentityBootstrapExecutor
} from "./runtime-factory.js";

export interface LocalRuntimeRequest {
  readonly method: string;
  readonly url: string;
  readonly headers?: Record<string, string | undefined>;
  readonly body?: string;
}

export interface LocalRuntimeResponse {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: string;
}

export interface LocalRuntimeHttpHandler {
  (request: LocalRuntimeRequest): Promise<LocalRuntimeResponse>;
  close(): Promise<void>;
}

export interface CreateLocalRuntimeHttpHandlerInput {
  readonly config: ResolvedLocalRuntimeConfig;
  readonly actor: ActorRef;
  readonly now?: PrrRuntimeNow;
  readonly requestIdFactory?: () => string;
  readonly deadlineCalculator?: DeadlineCalculator;
  readonly seedEvents?: readonly KnowledgeEvent[];
  readonly ingestionMountResolver?: IngestionWorkspaceMountResolver;
  readonly ingestionRuntimeFactory?: LocalIngestionRuntimeFactory;
  readonly operatorStatusProviders?: OperatorStatusProviderSet;
  readonly agentRuntimeFactory?: LocalAgentRuntimeFactory;
  readonly residentIdentityBootstrapForTest?: ResidentIdentityBootstrapExecutor;
  readonly mountedTaskAdmissionPrecommitForTest?: (() => void) | undefined;
  readonly residentBackgroundExecutionForTest?: ResidentBackgroundExecutionPort | undefined;
  readonly mountedTaskBeforeCompletionMemoryForTest?: (() => void | Promise<void>) | undefined;
  readonly mountedTaskBeforeLocalEffectForTest?: (() => void | Promise<void>) | undefined;
  readonly mountedTaskBeforeRunStartSnapshotForTest?: (() => void | Promise<void>) | undefined;
  readonly mountedTaskBeforeTaskRunningForTest?: (() => void | Promise<void>) | undefined;
  readonly mountedTaskAfterBackgroundExecutionForTest?: ((
    observation: MountedTaskBackgroundExecutionObservation
  ) => void) | undefined;
  readonly mountedTaskBackgroundScanForTest?: ((taskCount: number) => void) | undefined;
}

export function createLocalRuntimeHttpHandler(
  input: CreateLocalRuntimeHttpHandlerInput
): LocalRuntimeHttpHandler {
  const handle = createSqlitePrrRuntime({
    config: input.config,
    actor: input.actor,
    ...(input.now === undefined ? {} : { now: input.now }),
    ...(input.requestIdFactory === undefined ? {} : { requestIdFactory: input.requestIdFactory }),
    ...(input.deadlineCalculator === undefined ? {} : { deadlineCalculator: input.deadlineCalculator }),
    ...(input.residentIdentityBootstrapForTest === undefined
      ? {}
      : { residentIdentityBootstrapForTest: input.residentIdentityBootstrapForTest })
  });
  const humanMountResolver = humanIngestionMountResolver(handle, input.actor);
  const documentProcessing = humanMountResolver?.resolve({}).then(async mount => {
    if (!mount.ok) return undefined;
    const service = createDocumentProcessingService({
      ledger: mount.workspace.ledger, derivativeStore: mount.workspace.derivativeStore,
      resolveSelection: (selection, actor) => resolveExternalDocumentSelection(mount.workspace, actor, selection)
    });
    await service.recoverInterrupted();
    return service;
  }).catch(() => undefined);
  const seedEvents = input.seedEvents ?? prrWorkspaceSeedEvents;
  const runtimeNow = localRuntimeNow(input.now);
  const residentSupervision = createResidentSupervisionRuntime({
    runtimeHandle: handle,
    actor: input.actor,
    now: runtimeNow,
    issueMountedEvidenceTriageHandoff: async (wakeRuntime, task) =>
      await acquireMountedEvidenceTriageHandoffForLocalAgentRuntimeFactory({
        wakeRuntime,
        taskId: task.taskId,
        runId: task.runId
      }),
    issueMountedSourcedInvestigationHandoff: async (wakeRuntime, task) => {
      if (task.runType === "investigation-planner") {
        return await bindMountedAdvisoryHandoffForLocalAgentRuntimeFactory({
          wakeRuntime,
          taskId: task.taskId,
          runId: task.runId,
          runType: task.runType,
          investigationId: task.investigationId
        });
      }
      if (task.runType === "prr-negotiation") {
        return await bindMountedAdvisoryHandoffForLocalAgentRuntimeFactory({
          wakeRuntime,
          taskId: task.taskId,
          runId: task.runId,
          runType: task.runType
        });
      }
      return await bindMountedSourcedInvestigationHandoffForLocalAgentRuntimeFactory({
        wakeRuntime,
        taskId: task.taskId,
        runId: task.runId,
        runType: task.runType,
        ...(task.investigationId === undefined ? {} : { investigationId: task.investigationId })
      });
    },
    sourcedInvestigationExecution: createMountedSourcedInvestigationExecutionPort({
      handle,
      now: runtimeNow
    }),
    backgroundExecution: input.residentBackgroundExecutionForTest ??
      createMountedEvidenceTriageBackgroundExecutionPort({
        handle,
        now: runtimeNow,
        ...(input.mountedTaskBeforeCompletionMemoryForTest === undefined
          ? {}
          : { beforeCompletionMemoryForTest: input.mountedTaskBeforeCompletionMemoryForTest }),
        ...(input.mountedTaskBeforeLocalEffectForTest === undefined
          ? {}
          : { beforeLocalEffectForTest: input.mountedTaskBeforeLocalEffectForTest }),
        ...(input.mountedTaskBeforeRunStartSnapshotForTest === undefined
          ? {}
          : { beforeRunStartSnapshotForTest: input.mountedTaskBeforeRunStartSnapshotForTest }),
        ...(input.mountedTaskBeforeTaskRunningForTest === undefined
          ? {}
          : { beforeTaskRunningForTest: input.mountedTaskBeforeTaskRunningForTest }),
        ...(input.mountedTaskAfterBackgroundExecutionForTest === undefined
          ? {}
          : { afterExecutionSettledForTest: input.mountedTaskAfterBackgroundExecutionForTest }),
        ...(input.mountedTaskBackgroundScanForTest === undefined
          ? {}
          : {
              afterPendingScanForTest: (
                tasks: readonly { readonly taskId: string; readonly runId: string }[]
              ) => input.mountedTaskBackgroundScanForTest?.(tasks.length)
            })
      })
  });
  const defaultOperatorStatusProviders = createDefaultOperatorStatusProviders({
    config: input.config,
    actor: input.actor,
    handle,
    now: localRuntimeNow(input.now),
    ...(input.ingestionRuntimeFactory === undefined
      ? {}
      : { ingestionRuntimeFactory: input.ingestionRuntimeFactory }),
    ...(input.agentRuntimeFactory === undefined
      ? {}
      : { agentRuntimeFactory: input.agentRuntimeFactory })
  });

  const handler = (async (request: LocalRuntimeRequest): Promise<LocalRuntimeResponse> => {
    const path = new URL(request.url, "http://localhost").pathname;

    if (request.method === "GET" && path === "/api/health") {
      return json(200, {
        ok: true,
        storageStrategy: input.config.storage.strategy,
        bindMode: input.config.http.bindMode,
        authRequired: input.config.http.authRequired,
        devSeedEnabled: input.config.http.devSeedEnabled,
        workspaceMounted: handle.mountedWorkspace !== undefined,
        ...(handle.mountedWorkspace === undefined
          ? {}
          : { workspaceId: handle.mountedWorkspace.workspaceId })
      });
    }

    if (path.startsWith("/api/") && !authorized(input.config, request)) {
      return json(
        401,
        diagnostic("Authentication is required for this local runtime route.", [
          "provide the configured local runtime auth token"
        ])
      );
    }

    const operatorStatusResponse = await handleOperatorStatusRoute({
      request,
      config: input.config,
      runtime: { workspaceMounted: handle.mountedWorkspace !== undefined },
      now: localRuntimeNow(input.now),
      providers: {
        ...defaultOperatorStatusProviders,
        ...(input.operatorStatusProviders ?? {})
      }
    });
    if (operatorStatusResponse !== undefined) {
      return operatorStatusResponse;
    }

    if (path.startsWith("/api/agent/")) {
      const response = await handleAgentHttpRoute({
        request,
        handle,
        actor: input.actor,
        now: localRuntimeNow(input.now),
        supervision: residentSupervision,
        agentRuntimeFactory: input.agentRuntimeFactory ?? contextFreeLocalAgentRuntimeFactory,
        ...(input.mountedTaskAdmissionPrecommitForTest === undefined
          ? {}
          : { mountedTaskAdmissionPrecommitForTest: input.mountedTaskAdmissionPrecommitForTest })
      });
      if (response !== undefined) {
        return response;
      }
    }

    if (path.startsWith("/api/ingestion/")) {
      const ingestionMountResolver = input.ingestionMountResolver ?? (
        path.startsWith("/api/ingestion/resident-source-boundaries/")
          ? mountedBoundaryIngestionResolver(handle)
          : humanMountResolver
      );
      const response = await handleIngestionHttpRoute({
        request,
        actor: input.actor,
        ...(ingestionMountResolver === undefined ? {} : { ingestionMountResolver }),
        ...(input.ingestionRuntimeFactory === undefined
          ? {}
          : { ingestionRuntimeFactory: input.ingestionRuntimeFactory })
      });
      if (response !== undefined) {
        return response;
      }
    }

    if (path.startsWith("/api/document-processing/")) {
      return handleDocumentProcessingHttpRoute(request, await documentProcessing, input.actor);
    }

    if (path.startsWith("/api/evidence/")) {
      const evidenceMount = await humanMountResolver?.resolve({});
      const response = await handleEvidenceHttpRoute({
        request,
        ledger: handle.ledger,
        actor: input.actor,
        mountedWorkspace: evidenceMount?.ok ? evidenceMount.workspace : undefined,
        now: localRuntimeNow(input.now)
      });
      if (response !== undefined) {
        return response;
      }
    }

    if (path.startsWith("/api/ontology/")) {
      const response = await handleOntologyHttpRoute({ request, ledger: handle.ledger });
      if (response !== undefined) {
        return response;
      }
    }

    if (request.method === "GET" && path === "/api/requests/workspace") {
      return json(200, await handle.runtime.loadWorkspace());
    }

    if (request.method === "POST" && path === "/api/requests/drafts") {
      const parsed = parseJsonBody(request.body);
      if (!parsed.ok) {
        return json(400, parsed.body);
      }

      const draftInput = draftRequestInputFromBody(parsed.value);
      if (draftInput === undefined) {
        return json(400, invalidDraftRequestBodyDiagnostic());
      }

      return json(200, await handle.runtime.createDraftRequest(draftInput));
    }

    if (request.method === "POST" && path === "/api/dev/seed-prr") {
      if (!input.config.http.devSeedEnabled) {
        return json(
          404,
          diagnostic("PRR seed endpoint is disabled.", [
            "enable CESTUS_DEV_SEED_PRR for local development"
          ])
        );
      }

      const seed = await handle.runtime.seedIfEmpty(seedEvents);
      return json(200, {
        ok: true,
        seed,
        workspace: await handle.runtime.loadWorkspace()
      });
    }

    return json(
      404,
      diagnostic("Local runtime route was not found.", ["check the request path and method"])
    );
  }) as LocalRuntimeHttpHandler;

  let closePromise: Promise<void> | undefined;
  handler.close = () => {
    closePromise ??= (async () => {
      (await documentProcessing)?.close();
      await residentSupervision.stop();
    })().finally(() => handle.close());
    return closePromise;
  };
  return handler;
}

function mountedBoundaryIngestionResolver(handle: ReturnType<typeof createSqlitePrrRuntime>): IngestionWorkspaceMountResolver | undefined {
  if (handle.mountedWorkspace === undefined) return undefined;
  return {
    resolve: async () => {
      if (!inspectPortableWorkspaceCurrentness(handle).ok) {
        return {
          ok: false as const,
          error: {
            code: "INGESTION_WORKSPACE_NOT_MOUNTED" as const,
            message: "Portable workspace is unavailable or no longer current.",
            allowedRepairActions: ["mount the portable workspace", "retry the ingestion action"]
          }
        };
      }
      const mounted = handle.mountedWorkspace;
      if (mounted === undefined) {
        return {
          ok: false as const,
          error: {
            code: "INGESTION_WORKSPACE_NOT_MOUNTED" as const,
            message: "Portable workspace is unavailable or no longer current.",
            allowedRepairActions: ["mount the portable workspace", "retry the ingestion action"]
          }
        };
      }
      const workspace: MountedWorkspace = {
        workspaceId: mounted.workspaceId,
        label: mounted.label,
        ledger: handle.ledger,
        blobStore: new FileBlobStore(mounted.paths.blobRoot),
        derivativeStore: new FileBlobStore(mounted.paths.derivativeRoot),
        jobStateRoot: mounted.paths.jobRoot,
        capabilities: mountedWorkspaceCapabilities({
          canReadLedger: true,
          canAppendLedger: true,
          canWriteBlobs: false,
          canWriteDerivatives: true,
          canWriteJobState: false
        })
      };
      return { ok: true as const, workspace };
    }
  };
}

function draftRequestInputFromBody(value: unknown): CreateDraftRequestInput | undefined {
  if (!isJsonObject(value)) {
    return undefined;
  }

  const jurisdictionPack = jurisdictionPackRefFromBody(value.jurisdictionPack);
  const agency = contactRefFromBody(value.agency);
  const requester = contactRefFromBody(value.requester);
  const deadlineEstimateKind = value.deadlineEstimateKind;

  if (
    jurisdictionPack === undefined ||
    agency === undefined ||
    requester === undefined ||
    !isNonEmptyString(value.requestText) ||
    (Object.hasOwn(value, "receivedAt") && !isValidReceivedAt(value.receivedAt)) ||
    (Object.hasOwn(value, "deadlineEstimateKind") && !isDeadlineEstimateKind(deadlineEstimateKind))
  ) {
    return undefined;
  }

  const draftInput = {
    jurisdictionPack,
    agency,
    requester,
    requestText: value.requestText,
    ...(value.receivedAt === undefined ? {} : { receivedAt: value.receivedAt as string })
  };

  if (Object.hasOwn(value, "deadlineEstimateKind")) {
    return {
      ...draftInput,
      deadlineEstimateKind: deadlineEstimateKind as NonNullable<
        CreateDraftRequestInput["deadlineEstimateKind"]
      >
    };
  }

  return draftInput;
}

function jurisdictionPackRefFromBody(
  value: unknown
): CreateDraftRequestInput["jurisdictionPack"] | undefined {
  if (!isJsonObject(value) || !isNonEmptyString(value.name) || !isNonEmptyString(value.version)) {
    return undefined;
  }

  return {
    name: value.name,
    version: value.version
  };
}

function contactRefFromBody(value: unknown): CreateDraftRequestInput["agency"] | undefined {
  if (
    !isJsonObject(value) ||
    !isNonEmptyString(value.name) ||
    (value.email !== undefined && !isPlausibleEmail(value.email)) ||
    (value.phone !== undefined && !isValidPhone(value.phone))
  ) {
    return undefined;
  }

  return {
    name: value.name,
    ...(value.email === undefined ? {} : { email: value.email }),
    ...(value.phone === undefined ? {} : { phone: value.phone })
  };
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isDeadlineEstimateKind(
  value: unknown
): value is NonNullable<CreateDraftRequestInput["deadlineEstimateKind"]> {
  return value === "acknowledgement" || value === "productionReview";
}

function isPlausibleEmail(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) &&
    !/[<>]/.test(value)
  );
}

function isValidPhone(value: unknown): value is string {
  return typeof value === "string" && value.length >= 3;
}

function isValidReceivedAt(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?Z$/
  );
  if (match === null) {
    return false;
  }

  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const date = new Date(value);
  return (
    Number.isFinite(date.getTime()) &&
    date.getUTCFullYear() === Number(yearText) &&
    date.getUTCMonth() === Number(monthText) - 1 &&
    date.getUTCDate() === Number(dayText) &&
    date.getUTCHours() === Number(hourText) &&
    date.getUTCMinutes() === Number(minuteText) &&
    date.getUTCSeconds() === Number(secondText)
  );
}

function invalidDraftRequestBodyDiagnostic(): {
  readonly ok: false;
  readonly diagnostic: {
    readonly message: string;
    readonly allowedRepairActions: readonly string[];
  };
} {
  return diagnostic("Draft request body is invalid.", [
    "send agency, requester, jurisdiction, and request text; any supplied received timestamp must be a valid UTC datetime"
  ]);
}

function parseJsonBody(
  body: string | undefined
):
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly body: unknown } {
  try {
    return {
      ok: true,
      value: body === undefined || body.trim() === "" ? {} : JSON.parse(body)
    };
  } catch {
    return {
      ok: false,
      body: diagnostic("Request body must be valid JSON.", ["send a valid JSON request body"])
    };
  }
}

function authorized(config: ResolvedLocalRuntimeConfig, request: LocalRuntimeRequest): boolean {
  return authorizedLocalRuntimeRequest(config, request.headers ?? {});
}

function localRuntimeNow(now: PrrRuntimeNow | undefined): () => string {
  if (typeof now === "function") {
    return now;
  }
  if (now !== undefined) {
    return () => now;
  }
  return () => new Date().toISOString();
}

function diagnostic(message: string, allowedRepairActions: readonly string[]): {
  readonly ok: false;
  readonly diagnostic: {
    readonly message: string;
    readonly allowedRepairActions: readonly string[];
  };
} {
  return Object.freeze({
    ok: false,
    diagnostic: Object.freeze({
      message,
      allowedRepairActions: Object.freeze([...allowedRepairActions])
    })
  });
}

function json(status: number, body: unknown): LocalRuntimeResponse {
  return Object.freeze({
    status,
    headers: Object.freeze({ "content-type": "application/json; charset=utf-8" }),
    body: JSON.stringify(body)
  });
}
