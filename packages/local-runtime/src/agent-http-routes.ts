import {
  agentApprovalDecisionResultDtoSchema,
  approvedAgentSpecialistRunTypes,
  buildAgentCockpit,
  buildAgentApprovalCockpit,
  buildAgentProjection,
  createAgentToolGateway,
  isAgentSecretSafeText,
  type AgentTaskPriority
} from "../../agent/src/index.js";
import type { ActorRef, KnowledgeEvent } from "../../ontology/src/contracts.js";
import type { LocalRuntimeRequest, LocalRuntimeResponse } from "./http-handler.js";
import {
  defaultLocalAgentRuntimeFactory,
  type LocalAgentRuntimeFactory
} from "./agent-runtime-factory.js";
import { buildLocalAgentProviderReadiness } from "./agent-provider-readiness.js";
import { handleAgentOntologyBootstrapRoute } from "./agent-ontology-bootstrap-routes.js";
import type { LocalRuntimeHandle } from "./runtime-factory.js";

const defaultIdentityStreamId = "agent_identity_agent_default";
const approvalDetailSchemaVersion = "agent-approval-detail.v1" as const;
const localApprovalGatewayActor: ActorRef = Object.freeze({
  id: "actor_local_runtime_approval_gateway",
  kind: "system",
  label: "Local Runtime Approval Gateway"
});

export interface HandleAgentHttpRouteInput {
  readonly request: LocalRuntimeRequest;
  readonly handle: LocalRuntimeHandle;
  readonly actor: ActorRef;
  readonly now: () => string;
  readonly agentRuntimeFactory?: LocalAgentRuntimeFactory;
}

export async function handleAgentHttpRoute(
  input: HandleAgentHttpRouteInput
): Promise<LocalRuntimeResponse | undefined> {
  const path = new URL(input.request.url, "http://localhost").pathname;
  if (!path.startsWith("/api/agent/")) {
    return undefined;
  }

  try {
    if (input.request.method === "GET" && path === "/api/agent/providers/readiness") {
      return json(200, await buildLocalAgentProviderReadiness({
        cwd: input.handle.config.cwd,
        now: input.now
      }));
    }

    const runtimeFactory = input.agentRuntimeFactory ?? defaultLocalAgentRuntimeFactory;
    const runtime = runtimeFactory({
      handle: input.handle,
      actor: input.actor,
      now: input.now
    });

    if (path.startsWith("/api/agent/specialists/ontology-bootstrap/")) {
      const ontologyBootstrapResponse = await handleAgentOntologyBootstrapRoute({
        request: input.request,
        handle: input.handle,
        actor: input.actor,
        now: input.now,
        runtime
      });
      if (ontologyBootstrapResponse !== undefined) {
        return ontologyBootstrapResponse;
      }
    }

    if (input.request.method === "GET" && path === "/api/agent/status") {
      return json(200, await statusWithProviderReadiness(runtime, input));
    }

    if (input.request.method === "GET" && path === "/api/agent/cockpit") {
      const status = await statusWithProviderReadiness(runtime, input);
      const approvalCockpit = buildAgentApprovalCockpit({ status });
      return json(200, buildAgentCockpit({ status, approvalCockpit }));
    }

    if (input.request.method === "GET" && path === "/api/agent/tool-requests") {
      const status = await runtime.status();
      return json(200, {
        schemaVersion: "agent-tool-requests.v1",
        generatedAt: status.generatedAt,
        pendingApprovalCount: status.pendingApprovalCount,
        toolRequests: status.toolRequests
      });
    }

    if (input.request.method === "GET" && path === "/api/agent/approvals") {
      return json(200, await approvalCockpit(runtime));
    }

    const approvalRoute = matchApprovalRoute(path);
    if (approvalRoute !== undefined) {
      if (input.request.method === "GET" && approvalRoute.kind === "detail") {
        const cockpit = await approvalCockpit(runtime);
        const item = approvalItemById(cockpit, approvalRoute.toolRequestId);
        if (item === undefined) {
          return json(404, missingApprovalDiagnostic());
        }

        return json(200, {
          ok: true,
          schemaVersion: approvalDetailSchemaVersion,
          generatedAt: cockpit.generatedAt,
          item
        });
      }

      if (
        input.request.method === "POST" &&
        (approvalRoute.kind === "approve" || approvalRoute.kind === "deny")
      ) {
        if (input.actor.kind !== "human") {
          return json(403, humanApprovalActorDiagnostic());
        }

        const payload = parseJsonObjectBody(
          input.request.body,
          approvalRoute.kind === "approve" ? invalidApprovalBodyDiagnostic : invalidDenialBodyDiagnostic
        );
        if (!payload.ok) {
          return json(400, payload.body);
        }

        if (approvalRoute.kind === "approve") {
          const decision = approvalInputFromBody(payload.value);
          if (decision === undefined) {
            return json(400, invalidApprovalBodyDiagnostic());
          }

          const snapshotEvents = await input.handle.ledger.readAll();
          const cockpit = approvalCockpitFromEvents(snapshotEvents, input.now);
          const approvalItem = approvalItemById(cockpit, approvalRoute.toolRequestId);
          if (approvalItem === undefined) {
            return json(404, missingApprovalDiagnostic());
          }
          if (!approvalItemIsCurrentlyApprovable(cockpit, approvalItem)) {
            return json(409, blockedApprovalDiagnostic());
          }

          try {
            const gateway = createAgentToolGateway({
              ledger: input.handle.ledger,
              actor: localApprovalGatewayActor,
              now: input.now
            });
            const event = await gateway.approveTool({
              toolRequestId: approvalRoute.toolRequestId,
              approvedPreviewHash: decision.approvedPreviewHash,
              actor: input.actor,
              rationale: decision.rationale,
              expectedGlobalEventCount: snapshotEvents.length
            });
            const result = agentApprovalDecisionResultDtoSchema.parse({
              ok: true,
              schemaVersion: "agent-approval-decision-result.v1",
              eventIds: [event.id],
              approvalCockpit: await approvalCockpit(runtime)
            });
            return json(200, result);
          } catch (error) {
            return approvalDecisionErrorResponse(error);
          }
        }

        const denial = denialInputFromBody(payload.value);
        if (denial === undefined) {
          return json(400, invalidDenialBodyDiagnostic());
        }

        const snapshotEvents = await input.handle.ledger.readAll();
        const cockpit = approvalCockpitFromEvents(snapshotEvents, input.now);
        const approvalItem = approvalItemById(cockpit, approvalRoute.toolRequestId);
        if (approvalItem === undefined) {
          return json(404, missingApprovalDiagnostic());
        }

        try {
          const gateway = createAgentToolGateway({
            ledger: input.handle.ledger,
            actor: localApprovalGatewayActor,
            now: input.now
          });
          const event = await gateway.denyTool({
            toolRequestId: approvalRoute.toolRequestId,
            actor: input.actor,
            rationale: denial.rationale
          });
          const result = agentApprovalDecisionResultDtoSchema.parse({
            ok: true,
            schemaVersion: "agent-approval-decision-result.v1",
            eventIds: [event.id],
            approvalCockpit: await approvalCockpit(runtime)
          });
          return json(200, result);
        } catch (error) {
          return approvalDecisionErrorResponse(error);
        }
      }
    }

    if (input.request.method === "POST" && path === "/api/agent/runs") {
      const payload = parseJsonObjectBody(input.request.body, invalidRunBodyDiagnostic);
      if (!payload.ok) {
        return json(400, payload.body);
      }

      const runInput = runInputFromBody(payload.value);
      if (runInput === undefined) {
        return json(400, invalidRunBodyDiagnostic());
      }

      try {
        const started = await runtime.startRun({
          ...runInput,
          startedBy: input.actor.id
        });
        if (!started.ok) {
          return runStartRejectedResponse(started.error);
        }

        return json(200, {
          ok: true,
          schemaVersion: "agent-run-start-result.v1",
          runId: started.runId,
          eventIds: started.eventIds
        });
      } catch (error) {
        if (isDuplicateRunConflict(error, runInput.runId)) {
          return json(409, duplicateRunDiagnostic());
        }
        if (error instanceof Error && error.message.includes("Concurrency conflict")) {
          return json(409, runStartRejectedDiagnostic());
        }
        throw error;
      }
    }

    if (input.request.method === "POST" && path === "/api/agent/tasks") {
      const payload = parseJsonObjectBody(input.request.body, invalidTaskBodyDiagnostic);
      if (!payload.ok) {
        return json(400, payload.body);
      }

      const taskInput = taskInputFromBody(payload.value);
      if (taskInput === undefined) {
        return json(400, invalidTaskBodyDiagnostic());
      }

      const initialized = await ensureDefaultIdentity(runtime, input);
      if (!initialized.ok) {
        return json(500, initialized.body);
      }

      const status = await runtime.status();
      if (status.tasks.some((task) => task.taskId === taskInput.taskId)) {
        return json(409, duplicateTaskDiagnostic());
      }

      try {
        return json(200, await runtime.createTask({
          ...taskInput,
          requestedBy: input.actor.id
        }));
      } catch (error) {
        if (isDuplicateTaskConflict(error, taskInput.taskId)) {
          return json(409, duplicateTaskDiagnostic());
        }
        throw error;
      }
    }

    return undefined;
  } catch {
    return json(
      500,
      diagnostic("Agent runtime route failed.", ["retry the local agent request", "inspect agent diagnostics"])
    );
  }
}

type LocalAgentRuntime = ReturnType<LocalAgentRuntimeFactory>;

async function ensureDefaultIdentity(
  runtime: LocalAgentRuntime,
  input: HandleAgentHttpRouteInput
): Promise<{ readonly ok: true } | { readonly ok: false; readonly body: unknown }> {
  const command = {
    workspaceId: input.handle.mountedWorkspace?.workspaceId ?? "ws_local_runtime",
    initializedBy: input.actor.id
  };

  const result = await initializeDefaultIdentityRaceSafe(runtime, command);

  if (result.ok) {
    return { ok: true };
  }

  return {
    ok: false,
    body: diagnostic("Agent identity could not be initialized.", [
      "inspect the local agent runtime configuration"
    ])
  };
}

async function initializeDefaultIdentityRaceSafe(
  runtime: LocalAgentRuntime,
  command: {
    readonly workspaceId: string;
    readonly initializedBy: string;
  }
): ReturnType<LocalAgentRuntime["initializeDefaultIdentity"]> {
  try {
    return await runtime.initializeDefaultIdentity(command);
  } catch (error) {
    if (!isDefaultIdentityConflict(error)) {
      throw error;
    }
    return await runtime.initializeDefaultIdentity(command);
  }
}

async function statusWithProviderReadiness(
  runtime: LocalAgentRuntime,
  input: HandleAgentHttpRouteInput
) {
  const [status, providerReadiness] = await Promise.all([
    runtime.status(),
    buildLocalAgentProviderReadiness({
      cwd: input.handle.config.cwd,
      now: input.now
    })
  ]);
  return { ...status, providerReadiness };
}

function taskInputFromBody(value: Record<string, unknown>): {
  readonly taskId: string;
  readonly title: string;
  readonly priority: AgentTaskPriority;
  readonly description?: string;
} | undefined {
  if (!hasOnlyKeys(value, ["taskId", "title", "priority", "description"])) {
    return undefined;
  }

  const priority = value.priority ?? "normal";
  if (
    !isAgentTaskId(value.taskId) ||
    !isSafeNonEmptyText(value.title) ||
    !isRouteTaskPriority(priority) ||
    (value.description !== undefined && !isSafeNonEmptyText(value.description))
  ) {
    return undefined;
  }

  return {
    taskId: value.taskId,
    title: value.title,
    priority,
    ...(value.description === undefined ? {} : { description: value.description })
  };
}

function runInputFromBody(value: Record<string, unknown>): {
  readonly runId: string;
  readonly taskId: string;
  readonly runType: typeof approvedAgentSpecialistRunTypes[number];
  readonly scope: {
    readonly kind: "workspace" | "investigation";
    readonly refs: readonly string[];
  };
  readonly sourceEventIds?: readonly string[];
  readonly inputArtifactHashes?: readonly string[];
} | undefined {
  if (!hasOnlyKeys(value, ["runId", "taskId", "runType", "scope", "sourceEventIds", "inputArtifactHashes"])) {
    return undefined;
  }

  if (
    !isAgentRunId(value.runId) ||
    !isAgentTaskId(value.taskId) ||
    !isRouteRunType(value.runType) ||
    !isRouteRunScope(value.scope)
  ) {
    return undefined;
  }

  if (value.sourceEventIds !== undefined && !isRouteEventIdArray(value.sourceEventIds)) {
    return undefined;
  }

  if (value.inputArtifactHashes !== undefined && !isArtifactHashArray(value.inputArtifactHashes)) {
    return undefined;
  }

  return {
    runId: value.runId,
    taskId: value.taskId,
    runType: value.runType,
    scope: value.scope,
    ...(value.sourceEventIds === undefined ? {} : { sourceEventIds: value.sourceEventIds }),
    ...(value.inputArtifactHashes === undefined ? {} : { inputArtifactHashes: value.inputArtifactHashes })
  };
}

function parseJsonObjectBody(
  body: string | undefined,
  invalidBodyDiagnostic: () => {
    readonly ok: false;
    readonly diagnostic: {
      readonly message: string;
      readonly allowedRepairActions: readonly string[];
    };
  }
):
  | { readonly ok: true; readonly value: Record<string, unknown> }
  | { readonly ok: false; readonly body: unknown } {
  try {
    const value = body === undefined || body.trim() === "" ? {} : JSON.parse(body);
    if (!isJsonObject(value)) {
      return { ok: false, body: invalidBodyDiagnostic() };
    }
    return { ok: true, value };
  } catch {
    return { ok: false, body: invalidBodyDiagnostic() };
  }
}

function invalidTaskBodyDiagnostic(): {
  readonly ok: false;
  readonly diagnostic: {
    readonly message: string;
    readonly allowedRepairActions: readonly string[];
  };
} {
  return diagnostic("Agent task body is invalid.", [
    "send taskId, title, and optional priority as a JSON object"
  ]);
}

function duplicateTaskDiagnostic(): {
  readonly ok: false;
  readonly diagnostic: {
    readonly message: string;
    readonly allowedRepairActions: readonly string[];
  };
} {
  return diagnostic("Agent task already exists.", [
    "choose a different task id",
    "refresh agent status"
  ]);
}

function invalidRunBodyDiagnostic(): {
  readonly ok: false;
  readonly diagnostic: {
    readonly message: string;
    readonly allowedRepairActions: readonly string[];
  };
} {
  return diagnostic("Agent run body is invalid.", [
    "send runId, taskId, runType, scope, and optional sourceEventIds/inputArtifactHashes as a JSON object"
  ]);
}

function duplicateRunDiagnostic(): {
  readonly ok: false;
  readonly diagnostic: {
    readonly message: string;
    readonly allowedRepairActions: readonly string[];
  };
} {
  return diagnostic("Agent run already exists.", [
    "choose a different run id",
    "refresh the agent cockpit"
  ]);
}

function runStartRejectedDiagnostic(): {
  readonly ok: false;
  readonly diagnostic: {
    readonly message: string;
    readonly allowedRepairActions: readonly string[];
  };
} {
  return diagnostic("Agent run could not be recorded.", [
    "refresh the agent cockpit",
    "inspect agent diagnostics"
  ]);
}

function invalidApprovalBodyDiagnostic(): {
  readonly ok: false;
  readonly diagnostic: {
    readonly message: string;
    readonly allowedRepairActions: readonly string[];
  };
} {
  return diagnostic("Agent approval body is invalid.", [
    "send approvedPreviewHash and rationale as a JSON object"
  ]);
}

function invalidDenialBodyDiagnostic(): {
  readonly ok: false;
  readonly diagnostic: {
    readonly message: string;
    readonly allowedRepairActions: readonly string[];
  };
} {
  return diagnostic("Agent denial body is invalid.", [
    "send rationale as a JSON object"
  ]);
}

function humanApprovalActorDiagnostic(): {
  readonly ok: false;
  readonly diagnostic: {
    readonly message: string;
    readonly allowedRepairActions: readonly string[];
  };
} {
  return diagnostic("Approval decisions require a human actor.", [
    "sign in with a human local runtime session"
  ]);
}

function missingApprovalDiagnostic(): {
  readonly ok: false;
  readonly diagnostic: {
    readonly message: string;
    readonly allowedRepairActions: readonly string[];
  };
} {
  return diagnostic("Approval request was not found.", [
    "refresh the approval cockpit"
  ]);
}

function staleApprovalDiagnostic(): {
  readonly ok: false;
  readonly diagnostic: {
    readonly message: string;
    readonly allowedRepairActions: readonly string[];
  };
} {
  return diagnostic("Approval preview is stale.", [
    "refresh the approval cockpit",
    "request a revised preview"
  ]);
}

function blockedApprovalDiagnostic(): {
  readonly ok: false;
  readonly diagnostic: {
    readonly message: string;
    readonly allowedRepairActions: readonly string[];
  };
} {
  return diagnostic("Approval request is no longer approvable.", [
    "refresh the approval cockpit",
    "rebuild the preview",
    "request a revised preview"
  ]);
}

function approvalDecisionRejectedDiagnostic(): {
  readonly ok: false;
  readonly diagnostic: {
    readonly message: string;
    readonly allowedRepairActions: readonly string[];
  };
} {
  return diagnostic("Approval decision could not be recorded.", [
    "refresh the approval cockpit",
    "inspect agent diagnostics"
  ]);
}

function isDuplicateTaskConflict(error: unknown, taskId: string): boolean {
  return error instanceof Error &&
    error.message.includes("Concurrency conflict") &&
    error.message.includes(`agent_task_${taskId}`);
}

function isDefaultIdentityConflict(error: unknown): boolean {
  return error instanceof Error &&
    error.message.includes("Concurrency conflict") &&
    error.message.includes(defaultIdentityStreamId);
}

function isDuplicateRunConflict(error: unknown, runId: string): boolean {
  return error instanceof Error &&
    error.message.includes("Concurrency conflict") &&
    error.message.includes(`agent_run_${runId}`);
}

function isAgentTaskId(value: unknown): value is string {
  return typeof value === "string" && /^task_[a-zA-Z0-9_-]+$/.test(value) && isAgentSecretSafeText(value);
}

function isAgentRunId(value: unknown): value is string {
  return typeof value === "string" && /^run_[a-zA-Z0-9_-]+$/.test(value) && isAgentSecretSafeText(value);
}

function isSafeNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && isAgentSecretSafeText(value);
}

function isRouteTaskPriority(value: unknown): value is AgentTaskPriority {
  return value === "low" || value === "normal" || value === "high";
}

function isRouteRunType(value: unknown): value is typeof approvedAgentSpecialistRunTypes[number] {
  return typeof value === "string" &&
    isAgentSecretSafeText(value) &&
    (approvedAgentSpecialistRunTypes as readonly string[]).includes(value);
}

function isRouteRunScope(value: unknown): value is {
  readonly kind: "workspace" | "investigation";
  readonly refs: readonly string[];
} {
  if (!isJsonObject(value) || !hasOnlyKeys(value, ["kind", "refs"])) {
    return false;
  }

  if ((value.kind !== "workspace" && value.kind !== "investigation") || !isSafeIdentifierArray(value.refs)) {
    return false;
  }

  return value.refs.length > 0;
}

function isRouteEventIdArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) &&
    value.every((item) => typeof item === "string" && /^evt_[a-zA-Z0-9_-]+$/.test(item) && isAgentSecretSafeText(item));
}

function isArtifactHashArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) &&
    value.every((item) => typeof item === "string" && /^sha256:[a-f0-9]{64}$/.test(item));
}

function isSafeIdentifierArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => isSafeNonEmptyText(item));
}

function approvalInputFromBody(value: Record<string, unknown>): {
  readonly approvedPreviewHash: string;
  readonly rationale: string;
} | undefined {
  if (!hasOnlyKeys(value, ["approvedPreviewHash", "rationale"])) {
    return undefined;
  }

  if (!isSafeNonEmptyText(value.approvedPreviewHash) || !isSafeNonEmptyText(value.rationale)) {
    return undefined;
  }

  return {
    approvedPreviewHash: value.approvedPreviewHash,
    rationale: value.rationale
  };
}

function denialInputFromBody(value: Record<string, unknown>): {
  readonly rationale: string;
} | undefined {
  if (!hasOnlyKeys(value, ["rationale"]) || !isSafeNonEmptyText(value.rationale)) {
    return undefined;
  }

  return {
    rationale: value.rationale
  };
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function matchApprovalRoute(path: string):
  | { readonly kind: "detail"; readonly toolRequestId: string }
  | { readonly kind: "approve"; readonly toolRequestId: string }
  | { readonly kind: "deny"; readonly toolRequestId: string }
  | undefined {
  const match = /^\/api\/agent\/approvals\/([^/]+?)(?:\/(approve|deny))?$/.exec(path);
  if (match === null) {
    return undefined;
  }

  const toolRequestId = match[1];
  if (!isSafeNonEmptyText(toolRequestId)) {
    return undefined;
  }

  const action = match[2];
  if (action === undefined) {
    return { kind: "detail", toolRequestId };
  }

  return { kind: action as "approve" | "deny", toolRequestId };
}

async function approvalCockpit(runtime: LocalAgentRuntime) {
  return buildAgentApprovalCockpit({ status: await runtime.status() });
}

function approvalCockpitFromEvents(
  events: readonly KnowledgeEvent[],
  now: () => string
) {
  const projection = buildAgentProjection(events);
  return buildAgentApprovalCockpit({
    status: {
      schemaVersion: "agent-status.v1",
      generatedAt: now(),
      ...projection.toDto(),
      identity: projection.identity,
      providers: [],
      pendingApprovalCount: [...projection.toolRequests.values()].filter((request) => request.state === "requested").length,
      activeLockCount: [...projection.locks.values()].filter((lock) => lock.state === "active").length,
      diagnostics: []
    }
  });
}

function approvalItemById(
  cockpit: Awaited<ReturnType<typeof approvalCockpit>>,
  toolRequestId: string
) {
  return allApprovalItems(cockpit).find((item) => item.toolRequestId === toolRequestId);
}

function approvalItemIsCurrentlyApprovable(
  cockpit: Awaited<ReturnType<typeof approvalCockpit>>,
  item: NonNullable<ReturnType<typeof approvalItemById>>
): boolean {
  return cockpit.queue.pending.some((pendingItem) => pendingItem.toolRequestId === item.toolRequestId) &&
    item.staleness.approvable === true &&
    item.stale === false &&
    item.blockingReasons.length === 0 &&
    item.approval === undefined &&
    item.denial === undefined &&
    item.completion === undefined &&
    item.failure === undefined;
}

function allApprovalItems(cockpit: Awaited<ReturnType<typeof approvalCockpit>>) {
  return [
    ...cockpit.queue.pending,
    ...cockpit.queue.resumable,
    ...cockpit.queue.blocked,
    ...cockpit.queue.stale,
    ...cockpit.queue.denied,
    ...cockpit.queue.completed,
    ...cockpit.queue.failed
  ];
}

function approvalDecisionErrorResponse(error: unknown): LocalRuntimeResponse {
  if (error instanceof Error) {
    if (error.message.includes("Tool request was not found.")) {
      return json(404, missingApprovalDiagnostic());
    }
    if (error.message.includes("Stale approval preview hash")) {
      return json(409, staleApprovalDiagnostic());
    }
    if (
      error.message.includes("must be secret-safe") ||
      error.message.includes("requires a human actor") ||
      error.message.includes("requires an independent human actor") ||
      error.message.includes("cannot be denied") ||
      error.message.includes("already completed") ||
      error.message.includes("was denied")
    ) {
      return json(400, approvalDecisionRejectedDiagnostic());
    }
    if (error.message.includes("Concurrency conflict")) {
      return json(409, blockedApprovalDiagnostic());
    }
  }

  return json(500, diagnostic("Agent runtime route failed.", [
    "retry the local agent request",
    "inspect agent diagnostics"
  ]));
}

function runStartRejectedResponse(error: {
  readonly message: string;
  readonly allowedRepairActions?: readonly string[];
}): LocalRuntimeResponse {
  if (error.message === "Agent task was not found.") {
    return json(404, diagnostic(error.message, error.allowedRepairActions ?? ["create the task before starting a run"]));
  }

  if (error.message === "Resident identity is not initialized.") {
    return json(409, diagnostic(error.message, error.allowedRepairActions ?? ["initialize the default resident identity"]));
  }

  if (error.message === "Specialist workflow is not enabled for this run type.") {
    return json(400, diagnostic(error.message, error.allowedRepairActions ?? ["review the approved resident-agent foundation"]));
  }

  return json(409, runStartRejectedDiagnostic());
}

function json(status: number, body: unknown): LocalRuntimeResponse {
  return Object.freeze({
    status,
    headers: Object.freeze({ "content-type": "application/json; charset=utf-8" }),
    body: JSON.stringify(body)
  });
}
