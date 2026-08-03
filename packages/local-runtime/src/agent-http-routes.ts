import { join } from "node:path";
import {
  agentApprovalDecisionResultDtoSchema,
  buildAgentCockpit,
  buildAgentSupervisionCockpit,
  buildAgentApprovalCockpit,
  buildAgentProjection,
  buildTaskOrchestratorProjection,
  createResidentAgentDomainAdapterRegistry,
  createAgentToolGateway,
  isAgentSecretSafeText,
  type AgentMemoryKind,
  type AgentMemoryScope,
  type AgentMemoryState,
  type AgentCockpitResidentObservationDto,
  type AgentCockpitResidentPlanDto,
  type AgentStatusDto,
  type AgentTaskPriority,
  type ResidentIdentityLifecycleDto,
  type SpecialistWorkflowHandoffDto
} from "../../agent/src/index.js";
import { buildResidentPlanObservationProjectionV2 } from "../../agent/src/plan-observation-projection.js";
import type { ActorRef, AppendableKnowledgeEvent, KnowledgeEvent } from "../../ontology/src/contracts.js";
import { FileBlobStore } from "../../ontology/src/blob-store.js";
import { hasPrecommitGuardedAppend } from "../../ontology/src/sqlite-event-ledger.js";
import { buildSpecialistHandoffProjection } from "../../agent/src/specialist-handoff-projection.js";
import type { LocalRuntimeRequest, LocalRuntimeResponse } from "./http-handler.js";
import {
  defaultLocalAgentRuntimeFactory,
  mountedResidentTaskLocalAgentRuntimeFactory,
  type LocalAgentRuntimeFactory
} from "./agent-runtime-factory.js";
import { buildLocalAgentProviderReadiness } from "./agent-provider-readiness.js";
import { handleAgentOntologyBootstrapRoute } from "./agent-ontology-bootstrap-routes.js";
import {
  MountedResidentTaskError,
  admitMountedEvidenceTriageTask,
  reconstructMountedEvidenceTriageTask,
  runMountedEvidenceTriageTask,
  type MountedEvidenceTriageProviderMode
} from "./agent-runtime-mounted-task.js";
import type { LocalRuntimeHandle } from "./runtime-factory.js";
import {
  inspectPortableWorkspaceCurrentness,
  ResidentSourcedInvestigationLeaseUnavailableError,
  type ResidentSupervisionRuntime,
  type ResidentSupervisionSnapshot
} from "./wake-supervisor-runtime.js";

const approvalDetailSchemaVersion = "agent-approval-detail.v1" as const;
const localSpecialistContractIds = Object.freeze([
  "agent.scheduler-resumer.v1",
  "agent.domain-adapter.v1"
] as const);
const localDomainAdapterFamilies = createResidentAgentDomainAdapterRegistry().listFamilies();
const localApprovalGatewayActor: ActorRef = Object.freeze({
  id: "actor_local_runtime_approval_gateway",
  kind: "system",
  label: "Local Runtime Approval Gateway"
});
const localMountedResidentActor: ActorRef = Object.freeze({
  id: "agent_default",
  kind: "agent",
  label: "Resident Cestus Agent"
});

export interface HandleAgentHttpRouteInput {
  readonly request: LocalRuntimeRequest;
  readonly handle: LocalRuntimeHandle;
  readonly actor: ActorRef;
  readonly now: () => string;
  readonly supervision?: ResidentSupervisionRuntime | undefined;
  readonly agentRuntimeFactory?: LocalAgentRuntimeFactory;
  readonly mountedTaskAdmissionPrecommitForTest?: (() => void) | undefined;
}

export async function handleAgentHttpRoute(
  input: HandleAgentHttpRouteInput
): Promise<LocalRuntimeResponse | undefined> {
  const path = new URL(input.request.url, "http://localhost").pathname;
  if (!path.startsWith("/api/agent/")) {
    return undefined;
  }

  try {
    if (input.request.method === "POST" && input.handle.mountedWorkspace !== undefined) {
      const currentness = inspectPortableWorkspaceCurrentness(input.handle);
      if (!currentness.ok) {
        return json(409, workspaceCurrentnessDiagnostic(
          currentness.category ?? "workspace-unavailable"
        ));
      }
    }

    if (input.request.method === "GET" && path === "/api/agent/providers/readiness") {
      return json(200, await buildLocalAgentProviderReadiness({
        cwd: input.handle.config.cwd,
        now: input.now
      }));
    }

    const runtimeFactory = input.agentRuntimeFactory ?? defaultLocalAgentRuntimeFactory;
    const mountedSourcedInvestigationRoute = matchMountedSourcedInvestigationRoute(path);
    if (input.request.method === "POST" && mountedSourcedInvestigationRoute !== undefined) {
      try {
        const payload = parseJsonObjectBody(
          input.request.body,
          invalidMountedSourcedInvestigationBodyDiagnostic
        );
        if (!payload.ok) return json(400, payload.body);
        const command = mountedSourcedInvestigationInputFromBody(payload.value);
        if (command === undefined) {
          return json(400, invalidMountedSourcedInvestigationBodyDiagnostic());
        }
        if (input.supervision === undefined) {
          return json(503, diagnostic("Mounted sourced investigation supervision is unavailable.", [
            "restart the local runtime with resident supervision enabled"
          ]));
        }
        return json(200, await input.supervision.executeSourcedInvestigation({
          taskId: mountedSourcedInvestigationRoute.taskId,
          ...command
        }));
      } catch (error) {
        if (error instanceof ResidentSourcedInvestigationLeaseUnavailableError) {
          return json(error.status, diagnostic(error.safeMessage, error.allowedRepairActions));
        }
        if (error instanceof MountedResidentTaskError) {
          return json(error.status, diagnostic(error.safeMessage, error.allowedRepairActions));
        }
        throw error;
      }
    }
    const mountedEvidenceTriageRoute = matchMountedEvidenceTriageRoute(path);
    if (mountedEvidenceTriageRoute !== undefined) {
      try {
        const mountedRuntime = mountedResidentTaskLocalAgentRuntimeFactory({
          handle: input.handle,
          actor: localMountedResidentActor,
          now: input.now
        });
        if (input.request.method === "POST" && mountedEvidenceTriageRoute.kind === "execute") {
          const payload = parseJsonObjectBody(input.request.body, invalidMountedEvidenceTriageBodyDiagnostic);
          if (!payload.ok) return json(400, payload.body);
          const command = mountedEvidenceTriageInputFromBody(payload.value);
          if (command === undefined) return json(400, invalidMountedEvidenceTriageBodyDiagnostic());
          const executionInput = {
            handle: input.handle,
            runtime: mountedRuntime,
            now: input.now,
            taskId: mountedEvidenceTriageRoute.taskId,
            ...command,
            ...(input.mountedTaskAdmissionPrecommitForTest === undefined
              ? {}
              : { beforeAdmissionPrecommitForTest: input.mountedTaskAdmissionPrecommitForTest })
          } as const;
          const admission = await admitMountedEvidenceTriageTask(executionInput);
          if (command.providerMode === "local-fake") {
            input.supervision?.signalLocalAdmission();
            return json(202, admission);
          }
          return json(200, await runMountedEvidenceTriageTask(executionInput));
        }
        if (input.request.method === "GET" && mountedEvidenceTriageRoute.kind === "readback") {
          return json(200, await reconstructMountedEvidenceTriageTask({
            handle: input.handle,
            runtime: mountedRuntime,
            taskId: mountedEvidenceTriageRoute.taskId,
            runId: mountedEvidenceTriageRoute.runId
          }));
        }
      } catch (error) {
        if (error instanceof MountedResidentTaskError) {
          return json(error.status, diagnostic(error.safeMessage, error.allowedRepairActions));
        }
        throw error;
      }
    }

    const runtime = runtimeFactory({
      handle: input.handle,
      actor: input.actor,
      now: input.now
    });

    if (path.startsWith("/api/agent/specialists/ontology-bootstrap/")) {
      if (input.request.method !== "GET" && !await requireResidentIdentityReady(input)) {
        return json(409, residentIdentityNotReadyDiagnostic());
      }
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

    const memoryRoute = matchMemoryRoute(path);
    if (memoryRoute !== undefined) {
      if (input.request.method === "GET" && memoryRoute.kind === "list") {
        const url = new URL(input.request.url, "http://localhost");
        const scope = memoryScopeFilter(url.searchParams.get("scope"));
        const state = memoryStateFilter(url.searchParams.get("state"));
        return json(200, await runtime.listMemory({
          ...(scope === undefined ? {} : { scope }),
          ...(state === undefined ? {} : { state })
        }));
      }

      if (input.request.method === "GET" && memoryRoute.kind === "detail") {
        const detail = await runtime.memoryDetail(memoryRoute.memoryId);
        return detail === undefined ? json(404, missingMemoryDiagnostic()) : json(200, detail);
      }

      if (
        input.request.method === "POST" &&
        (memoryRoute.kind === "list" || memoryRoute.kind === "supersede" || memoryRoute.kind === "retract")
      ) {
        if (input.actor.kind !== "human") {
          return json(403, humanMemoryActorDiagnostic());
        }

        const payload = parseJsonObjectBody(input.request.body, invalidMemoryBodyDiagnostic);
        if (!payload.ok) {
          return json(400, payload.body);
        }

        if (memoryRoute.kind === "list") {
          const command = memoryRecordInputFromBody(payload.value);
          if (command === undefined) {
            return json(400, invalidMemoryBodyDiagnostic());
          }

          if (!await requireResidentIdentityReady(input)) {
            return json(409, residentIdentityNotReadyDiagnostic());
          }

          return memoryMutationResponse(await runtime.recordMemory(command));
        }

        if (memoryRoute.kind === "supersede") {
          const command = memorySupersedeInputFromBody(memoryRoute.memoryId, payload.value);
          if (command === undefined) {
            return json(400, invalidMemoryBodyDiagnostic());
          }

          if (!await requireResidentIdentityReady(input)) {
            return json(409, residentIdentityNotReadyDiagnostic());
          }

          return memoryMutationResponse(await runtime.supersedeMemory(command));
        }

        const command = memoryRetractInputFromBody(memoryRoute.memoryId, payload.value);
        if (command === undefined) {
          return json(400, invalidMemoryBodyDiagnostic());
        }

        if (!await requireResidentIdentityReady(input)) {
          return json(409, residentIdentityNotReadyDiagnostic());
        }

        return memoryMutationResponse(await runtime.retractMemory(command));
      }
    }

    if (input.request.method === "GET" && path === "/api/agent/status") {
      return json(200, await statusWithProviderReadiness(runtime, input));
    }

    if (input.request.method === "GET" && path === "/api/agent/cockpit") {
      const status = await statusWithProviderReadiness(runtime, input);
      const approvalCockpit = buildAgentApprovalCockpit({ status });
      const supervisionSnapshot = await input.supervision?.snapshot();
      const events = await input.handle.ledger.readAll();
      const retryableTaskIds = retryableTaskIdsFromEvents(events);
      const residentHistory = projectResidentCockpitHistory(events);
      const specialistHandoffs = await projectMountedCockpitHandoffs(input.handle, status, events);
      return json(200, buildAgentCockpit({
        status,
        approvalCockpit,
        residentPlans: residentHistory.plans,
        residentObservations: residentHistory.observations,
        specialistHandoffs,
        ...(supervisionSnapshot === undefined ? {} : {
          supervision: buildSupervisionCockpit(status, input.now(), supervisionSnapshot, retryableTaskIds)
        }),
        availableSpecialistContracts: localSpecialistContractIds,
        availableDomainAdapterFamilies: localDomainAdapterFamilies
      }));
    }

    if (
      input.request.method === "POST" &&
      (path === "/api/agent/supervision/pause" || path === "/api/agent/supervision/resume")
    ) {
      if (!emptyPostBody(input.request.body)) {
        return json(400, invalidSupervisionControlBodyDiagnostic());
      }
      if (input.actor.kind !== "human") {
        return json(403, humanSupervisionActorDiagnostic());
      }
      if (input.supervision === undefined) {
        return json(503, supervisionUnavailableDiagnostic());
      }
      const snapshot = path.endsWith("/pause")
        ? await input.supervision.pause()
        : await input.supervision.resume();
      const status = await statusWithProviderReadiness(runtime, input);
      const retryableTaskIds = retryableTaskIdsFromEvents(await input.handle.ledger.readAll());
      return json(200, {
        schemaVersion: "agent-supervision-command-result.v1",
        supervision: buildSupervisionCockpit(status, input.now(), snapshot, retryableTaskIds)
      });
    }

    const taskControlRoute = matchTaskControlRoute(path);
    if (input.request.method === "POST" && taskControlRoute !== undefined) {
      if (!emptyPostBody(input.request.body)) {
        return json(400, invalidSupervisionControlBodyDiagnostic());
      }
      if (input.actor.kind !== "human") {
        return json(403, humanSupervisionActorDiagnostic());
      }
      const before = await runtime.status();
      const task = before.tasks.find((candidate) => candidate.taskId === taskControlRoute.taskId);
      if (task === undefined) return json(404, missingTaskDiagnostic());
      const controlEvents = await input.handle.ledger.readAll();
      if (!taskControlAllowed(before, taskControlRoute, retryableTaskIdsFromEvents(controlEvents))) {
        return json(409, taskControlUnavailableDiagnostic(taskControlRoute.kind));
      }
      try {
        await appendTaskControlStatus(input, taskControlRoute);
        if (taskControlRoute.kind === "cancel") {
          await input.supervision?.quiesceTask(taskControlRoute.taskId);
        }
      } catch (error) {
        if (error instanceof PortableWorkspaceCurrentnessError) {
          return json(409, workspaceCurrentnessDiagnostic(error.category));
        }
        if (error instanceof TaskControlWriteBoundaryUnavailableError) {
          return json(503, diagnostic(
            "Task control cannot be recorded through the required mounted write boundary.",
            ["restart the local runtime", "inspect agent diagnostics"]
          ));
        }
        throw error;
      }
      const status = await statusWithProviderReadiness(runtime, input);
      const updatedTask = status.tasks.find((candidate) => candidate.taskId === taskControlRoute.taskId);
      const snapshot = await input.supervision?.snapshot();
      const retryableTaskIds = retryableTaskIdsFromEvents(await input.handle.ledger.readAll());
      return json(200, {
        schemaVersion: "agent-task-supervision-result.v1",
        task: updatedTask,
        ...(snapshot === undefined ? {} : {
          supervision: buildSupervisionCockpit(status, input.now(), snapshot, retryableTaskIds)
        })
      });
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

          if (!await requireResidentIdentityReady(input)) {
            return json(409, residentIdentityNotReadyDiagnostic());
          }

          const identityLifecycle = (await runtime.status()).identityLifecycle;
          const snapshotEvents = await input.handle.ledger.readAll();
          const cockpit = approvalCockpitFromEvents(snapshotEvents, input.now, identityLifecycle);
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

        if (!await requireResidentIdentityReady(input)) {
          return json(409, residentIdentityNotReadyDiagnostic());
        }

        const identityLifecycle = (await runtime.status()).identityLifecycle;
        const snapshotEvents = await input.handle.ledger.readAll();
        const cockpit = approvalCockpitFromEvents(snapshotEvents, input.now, identityLifecycle);
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

    if (input.request.method === "POST" && path === "/api/agent/task-orchestrator/tick") {
      if (input.request.body !== undefined && input.request.body.trim().length > 0) {
        const payload = parseJsonObjectBody(input.request.body, invalidTaskOrchestratorTickBodyDiagnostic);
        if (!payload.ok || Object.keys(payload.value).length > 0) {
          return json(400, invalidTaskOrchestratorTickBodyDiagnostic());
        }
      }

      if (!await requireResidentIdentityReady(input)) {
        return json(409, residentIdentityNotReadyDiagnostic());
      }

      const summary = await runtime.tickTaskOrchestrator();
      return json(200, await taskOrchestratorTickResponse(input, summary));
    }

    if (input.request.method === "POST" && path === "/api/agent/wake") {
      if (input.request.body !== undefined && input.request.body.trim().length > 0) {
        const payload = parseJsonObjectBody(input.request.body, invalidRuntimeWakeBodyDiagnostic);
        if (!payload.ok || Object.keys(payload.value).length > 0) {
          return json(400, invalidRuntimeWakeBodyDiagnostic());
        }
      }

      if (!await requireResidentIdentityReady(input)) {
        return json(409, residentIdentityNotReadyDiagnostic());
      }

      return json(200, await runtime.wakeResidentAgent());
    }

    if (input.request.method === "POST" && path === "/api/agent/scheduler/wake") {
      if (input.request.body !== undefined && input.request.body.trim().length > 0) {
        const payload = parseJsonObjectBody(input.request.body, invalidSchedulerWakeBodyDiagnostic);
        if (!payload.ok || Object.keys(payload.value).length > 0) {
          return json(400, invalidSchedulerWakeBodyDiagnostic());
        }
      }

      if (!await requireResidentIdentityReady(input)) {
        return json(409, residentIdentityNotReadyDiagnostic());
      }

      return json(200, await runtime.scheduler.wake());
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

      if (!await requireResidentIdentityReady(input)) {
        return json(409, residentIdentityNotReadyDiagnostic());
      }

      const taskRuntime = runtimeFactory({
        handle: input.handle,
        actor: localMountedResidentActor,
        now: input.now
      });
      const status = await taskRuntime.status();
      if (status.tasks.some((task) => task.taskId === taskInput.taskId)) {
        return json(409, duplicateTaskDiagnostic());
      }

      try {
        return json(200, await taskRuntime.createTask({
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

type TaskControlRoute = {
  readonly kind: "retry" | "cancel";
  readonly taskId: string;
};

function buildSupervisionCockpit(
  status: AgentStatusDto,
  observedAt: string,
  snapshot: ResidentSupervisionSnapshot,
  retryableTaskIds: readonly string[]
) {
  return buildAgentSupervisionCockpit({
    status,
    observedAt,
    supervisorState: snapshot.supervisorState,
    workspaceState: snapshot.workspaceState,
    ...(snapshot.workspaceId === undefined ? {} : { workspaceId: snapshot.workspaceId }),
    ...(snapshot.nextWakeAt === undefined ? {} : { nextWakeAt: snapshot.nextWakeAt }),
    activeCycle: snapshot.activeCycle,
    provenanceEventIds: snapshot.provenanceEventIds,
    retryableTaskIds,
    diagnostics: snapshot.diagnostics.map((diagnostic) => ({
      category: diagnostic.category,
      safeMessage: diagnostic.safeMessage,
      allowedRepairActions: [...diagnostic.allowedRepairActions]
    }))
  });
}

function matchTaskControlRoute(path: string): TaskControlRoute | undefined {
  const segments = path.split("/").filter(Boolean);
  if (
    segments.length !== 5 ||
    segments[0] !== "api" ||
    segments[1] !== "agent" ||
    segments[2] !== "tasks" ||
    !isAgentTaskId(segments[3]) ||
    (segments[4] !== "retry" && segments[4] !== "cancel")
  ) {
    return undefined;
  }
  return Object.freeze({ kind: segments[4], taskId: segments[3] });
}

function taskControlAllowed(
  status: AgentStatusDto,
  route: TaskControlRoute,
  retryableTaskIds: readonly string[]
): boolean {
  const task = status.tasks.find((candidate) => candidate.taskId === route.taskId);
  if (task === undefined) return false;
  if (route.kind === "cancel") {
    return task.status === "queued" ||
      task.status === "running" ||
      task.status === "waiting-for-approval" ||
      task.status === "blocked";
  }
  const run = task.runId === undefined ? undefined : status.runs.find((candidate) => candidate.runId === task.runId);
  return (task.status === "failed" || task.status === "blocked") &&
    (run?.retryable === true || retryableTaskIds.includes(task.taskId));
}

function retryableTaskIdsFromEvents(events: readonly KnowledgeEvent[]): readonly string[] {
  const retryable = new Set<string>();
  const latestFailureByTask = new Map<string, KnowledgeEvent>();
  for (const event of events) {
    if (event.type === "agent.task.orchestration.failed") {
      latestFailureByTask.set(event.payload.taskId, event);
    }
  }
  for (const [taskId, event] of latestFailureByTask) {
    if (event.type === "agent.task.orchestration.failed" && event.payload.retryable) retryable.add(taskId);
  }
  return Object.freeze([...retryable].sort());
}

function projectResidentCockpitHistory(events: readonly KnowledgeEvent[]): {
  readonly plans: readonly AgentCockpitResidentPlanDto[];
  readonly observations: readonly AgentCockpitResidentObservationDto[];
} {
  const projection = buildResidentPlanObservationProjectionV2(events);
  if (projection.state !== "ready") {
    return Object.freeze({ plans: Object.freeze([]), observations: Object.freeze([]) });
  }
  return {
    plans: projection.plans.map((event) => ({
      eventId: event.id,
      runId: event.payload.runId,
      taskId: event.payload.taskId,
      attemptId: event.payload.attemptId,
      planId: event.payload.planId,
      planRevision: event.payload.planRevision,
      recordedAt: event.context.occurredAt,
      steps: event.payload.steps.map((step) => ({
        ordinal: step.ordinal,
        purpose: step.purpose,
        toolId: step.toolId,
        expectedSafeOutputClass: step.expectedSafeOutputClass
      }))
    })),
    observations: projection.observations.map((event) => ({
      eventId: event.id,
      runId: event.payload.runId,
      taskId: event.payload.taskId,
      attemptId: event.payload.attemptId,
      observationId: event.payload.observationId,
      planId: event.payload.planId,
      planRevision: event.payload.planRevision,
      stepOrdinal: event.payload.stepOrdinal,
      kind: event.payload.kind,
      safeSummary: event.payload.safeSummary,
      artifactHashes: [...event.payload.artifactHashes],
      ...(event.payload.toolRequestId === undefined ? {} : { toolRequestId: event.payload.toolRequestId }),
      ...(event.payload.modelInvocationEventId === undefined
        ? {}
        : { modelInvocationEventId: event.payload.modelInvocationEventId }),
      recordedAt: event.context.occurredAt
    }))
  };
}

async function projectMountedCockpitHandoffs(
  handle: LocalRuntimeHandle,
  status: AgentStatusDto,
  events: readonly KnowledgeEvent[]
): Promise<readonly SpecialistWorkflowHandoffDto[]> {
  const mounted = handle.mountedWorkspace;
  if (mounted === undefined || !inspectPortableWorkspaceCurrentness(handle).ok) return Object.freeze([]);
  const stores = [
    new FileBlobStore(join(mounted.paths.derivativeRoot, "specialist-handoff-manifest")),
    new FileBlobStore(join(mounted.paths.derivativeRoot, "specialist-handoff-material"))
  ] as const;
  const manifestReader = Object.freeze({
    async get(contentHash: `sha256:${string}`) {
      for (const store of stores) {
        requirePortableWorkspaceCurrent(handle);
        try {
          const bytes = await store.get(contentHash);
          requirePortableWorkspaceCurrent(handle);
          return bytes;
        } catch {
          if (!inspectPortableWorkspaceCurrentness(handle).ok) {
            throw new Error("Portable workspace became unavailable during handoff replay.");
          }
        }
      }
      throw new Error("Mounted handoff artifact is unavailable by its durable content hash.");
    }
  });
  const handoffs: SpecialistWorkflowHandoffDto[] = [];
  for (const run of status.runs) {
    const projection = await buildSpecialistHandoffProjection({
      events,
      manifestReader,
      runId: run.runId,
      ...(run.taskId === undefined ? {} : { taskId: run.taskId })
    });
    const handoff = projection.selectedHandoff;
    if (
      projection.state !== "legacy-unbound" &&
      projection.diagnostics.length === 0 &&
      handoff !== undefined &&
      handoff.runId === run.runId &&
      handoff.taskId === run.taskId
    ) {
      handoffs.push(handoff);
    }
  }
  return Object.freeze(handoffs);
}

function requirePortableWorkspaceCurrent(handle: LocalRuntimeHandle): void {
  const currentness = inspectPortableWorkspaceCurrentness(handle);
  if (!currentness.ok) {
    throw new PortableWorkspaceCurrentnessError(
      currentness.category ?? "workspace-unavailable"
    );
  }
}

class PortableWorkspaceCurrentnessError extends Error {
  constructor(readonly category: "workspace-unavailable" | "workspace-identity-mismatch") {
    super(category);
    this.name = "PortableWorkspaceCurrentnessError";
  }
}

class TaskControlWriteBoundaryUnavailableError extends Error {
  constructor() {
    super("Task control requires a precommit-guarded event ledger.");
    this.name = "TaskControlWriteBoundaryUnavailableError";
  }
}

async function appendTaskControlStatus(
  input: HandleAgentHttpRouteInput,
  route: TaskControlRoute
): Promise<void> {
  const events = await input.handle.ledger.readAll();
  const currentness = inspectPortableWorkspaceCurrentness(input.handle);
  if (!currentness.ok) throw new Error(currentness.category ?? "workspace-unavailable");
  const streamId = `agent_task_${route.taskId}`;
  const taskEvents = events.filter((event) => event.streamId === streamId);
  const causation = taskEvents.at(-1);
  if (causation === undefined) throw new Error("Agent task control lacks durable task provenance.");
  const event: AppendableKnowledgeEvent<"agent.task.status.changed"> = {
    type: "agent.task.status.changed",
    version: 1,
    streamId,
    context: {
      actor: input.actor,
      occurredAt: input.now(),
      causationId: causation.id,
      correlationId: `corr_${route.kind}_${route.taskId}_${taskEvents.length + 1}`,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", agent: "0.1.0" }
    },
    payload: {
      taskId: route.taskId,
      status: route.kind === "retry" ? "queued" : "canceled",
      changedBy: input.actor.id,
      reason: route.kind === "retry" ? "Human requested a retry." : "Human canceled resident work."
    }
  };
  if (!hasPrecommitGuardedAppend(input.handle.ledger)) {
    throw new TaskControlWriteBoundaryUnavailableError();
  }
  await input.handle.ledger.appendWithPrecommitGuard(event, {
    expectedGlobalEventCount: events.length,
    expectedNextSequence: taskEvents.length + 1
  }, () => requirePortableWorkspaceCurrent(input.handle));
}

async function requireResidentIdentityReady(input: HandleAgentHttpRouteInput): Promise<boolean> {
  return (await input.handle.residentIdentity.ready()).state === "ready";
}

function residentIdentityNotReadyDiagnostic() {
  return diagnostic("Resident identity is not ready for this workspace.", [
    "mount or create a portable workspace",
    "refresh agent status"
  ]);
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

async function taskOrchestratorTickResponse(
  input: HandleAgentHttpRouteInput,
  summary: Awaited<ReturnType<LocalAgentRuntime["tickTaskOrchestrator"]>>
) {
  return {
    schemaVersion: "agent-task-orchestrator-tick-result.v1" as const,
    generatedAt: input.now(),
    taskOrchestrator: summary,
    projection: buildTaskOrchestratorProjection(await input.handle.ledger.readAll(), { now: input.now() }).toDto()
  };
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

function mountedEvidenceTriageInputFromBody(value: Record<string, unknown>): {
  readonly runId: string;
  readonly evidenceIds: readonly string[];
  readonly providerMode: MountedEvidenceTriageProviderMode;
} | undefined {
  if (!hasOnlyKeys(value, ["runId", "evidenceIds", "providerMode"]) ||
    typeof value.runId !== "string" || !/^run_[a-zA-Z0-9_-]+$/.test(value.runId) ||
    !Array.isArray(value.evidenceIds) || value.evidenceIds.length === 0 ||
    value.evidenceIds.some((evidenceId) => typeof evidenceId !== "string" || !/^ev_[a-zA-Z0-9_-]+$/.test(evidenceId)) ||
    new Set(value.evidenceIds).size !== value.evidenceIds.length ||
    (value.providerMode !== "local-fake" && value.providerMode !== "remote-gated")) {
    return undefined;
  }
  return Object.freeze({
    runId: value.runId,
    evidenceIds: Object.freeze([...value.evidenceIds] as string[]),
    providerMode: value.providerMode
  });
}

function mountedSourcedInvestigationInputFromBody(value: Record<string, unknown>): {
  readonly runId: string;
  readonly runType: "timeline-builder" | "contradiction-finder";
  readonly evidenceIds: readonly string[];
} | undefined {
  if (!hasOnlyKeys(value, ["runId", "runType", "evidenceIds"]) ||
    typeof value.runId !== "string" || !/^run_[a-zA-Z0-9_-]+$/.test(value.runId) ||
    (value.runType !== "timeline-builder" && value.runType !== "contradiction-finder") ||
    !Array.isArray(value.evidenceIds) || value.evidenceIds.length === 0 ||
    value.evidenceIds.some((evidenceId) =>
      typeof evidenceId !== "string" || !/^ev_[a-zA-Z0-9_-]+$/.test(evidenceId)
    ) || new Set(value.evidenceIds).size !== value.evidenceIds.length) {
    return undefined;
  }
  return Object.freeze({
    runId: value.runId,
    runType: value.runType,
    evidenceIds: Object.freeze([...value.evidenceIds] as string[])
  });
}

function matchMountedSourcedInvestigationRoute(path: string):
  | { readonly taskId: string }
  | undefined {
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 5 && segments[0] === "api" && segments[1] === "agent" &&
    segments[2] === "tasks" && segments[4] === "sourced-investigation" &&
    isAgentTaskId(segments[3])) {
    return Object.freeze({ taskId: segments[3] });
  }
  return undefined;
}

function matchMountedEvidenceTriageRoute(path: string):
  | { readonly kind: "execute"; readonly taskId: string }
  | { readonly kind: "readback"; readonly taskId: string; readonly runId: string }
  | undefined {
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 5 && segments[0] === "api" && segments[1] === "agent" &&
    segments[2] === "tasks" && segments[4] === "evidence-triage" && isAgentTaskId(segments[3])) {
    return Object.freeze({ kind: "execute" as const, taskId: segments[3] });
  }
  if (segments.length === 6 && segments[0] === "api" && segments[1] === "agent" &&
    segments[2] === "tasks" && segments[4] === "evidence-triage" && isAgentTaskId(segments[3]) &&
    typeof segments[5] === "string" && /^run_[a-zA-Z0-9_-]+$/.test(segments[5])) {
    return Object.freeze({ kind: "readback" as const, taskId: segments[3], runId: segments[5] });
  }
  return undefined;
}

function memoryRecordInputFromBody(value: Record<string, unknown>) {
  if (!hasOnlyKeys(value, [
    "memoryId",
    "scope",
    "memoryKind",
    "summary",
    "sourceEventIds",
    "artifactHashes",
    "confidence",
    "expiresAt"
  ])) {
    return undefined;
  }

  const memoryKind = value.memoryKind ?? "agent-observation";
  const sourceEventIds = stringArray(value.sourceEventIds);
  const artifactHashes = stringArray(value.artifactHashes);
  if (
    !isSafeNonEmptyText(value.memoryId) ||
    !isMemoryScope(value.scope) ||
    !isMemoryKind(memoryKind) ||
    !isSafeNonEmptyText(value.summary) ||
    !isMemoryConfidence(value.confidence) ||
    (value.expiresAt !== undefined && !isSafeNonEmptyText(value.expiresAt)) ||
    sourceEventIds === undefined ||
    artifactHashes === undefined ||
    (sourceEventIds.length === 0 && artifactHashes.length === 0)
  ) {
    return undefined;
  }

  return {
    memoryId: value.memoryId,
    scope: value.scope,
    memoryKind,
    summary: value.summary,
    sourceEventIds,
    artifactHashes,
    confidence: value.confidence,
    ...(value.expiresAt === undefined ? {} : { expiresAt: value.expiresAt })
  };
}

function memorySupersedeInputFromBody(memoryId: string, value: Record<string, unknown>) {
  if (!hasOnlyKeys(value, [
    "supersededByMemoryId",
    "scope",
    "memoryKind",
    "summary",
    "sourceEventIds",
    "artifactHashes",
    "confidence",
    "expiresAt",
    "rationale"
  ])) {
    return undefined;
  }

  const memoryKind = value.memoryKind ?? "agent-observation";
  const sourceEventIds = stringArray(value.sourceEventIds);
  const artifactHashes = stringArray(value.artifactHashes);
  if (
    !isSafeNonEmptyText(memoryId) ||
    !isSafeNonEmptyText(value.supersededByMemoryId) ||
    !isMemoryScope(value.scope) ||
    !isMemoryKind(memoryKind) ||
    !isSafeNonEmptyText(value.summary) ||
    !isMemoryConfidence(value.confidence) ||
    (value.expiresAt !== undefined && !isSafeNonEmptyText(value.expiresAt)) ||
    !isSafeNonEmptyText(value.rationale) ||
    sourceEventIds === undefined ||
    artifactHashes === undefined ||
    (sourceEventIds.length === 0 && artifactHashes.length === 0)
  ) {
    return undefined;
  }

  return {
    memoryId,
    supersededByMemoryId: value.supersededByMemoryId,
    scope: value.scope,
    memoryKind,
    summary: value.summary,
    sourceEventIds,
    artifactHashes,
    confidence: value.confidence,
    rationale: value.rationale,
    ...(value.expiresAt === undefined ? {} : { expiresAt: value.expiresAt })
  };
}

function memoryRetractInputFromBody(memoryId: string, value: Record<string, unknown>) {
  if (!hasOnlyKeys(value, ["rationale"]) || !isSafeNonEmptyText(memoryId) || !isSafeNonEmptyText(value.rationale)) {
    return undefined;
  }

  return {
    memoryId,
    rationale: value.rationale
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

function invalidMountedEvidenceTriageBodyDiagnostic(): {
  readonly ok: false;
  readonly diagnostic: {
    readonly message: string;
    readonly allowedRepairActions: readonly string[];
  };
} {
  return diagnostic("Mounted evidence triage body is invalid.", [
    "send runId, unique evidenceIds, and providerMode as a JSON object"
  ]);
}

function invalidMountedSourcedInvestigationBodyDiagnostic(): {
  readonly ok: false;
  readonly diagnostic: {
    readonly message: string;
    readonly allowedRepairActions: readonly string[];
  };
} {
  return diagnostic("Mounted sourced investigation body is invalid.", [
    "send runId, timeline-builder or contradiction-finder runType, and unique evidenceIds"
  ]);
}

function invalidSchedulerWakeBodyDiagnostic(): {
  readonly ok: false;
  readonly diagnostic: {
    readonly message: string;
    readonly allowedRepairActions: readonly string[];
  };
} {
  return diagnostic("Agent scheduler wake does not accept tool input.", [
    "send an empty POST body to wake the scheduler",
    "use approval routes to append human decisions"
  ]);
}

function invalidTaskOrchestratorTickBodyDiagnostic(): {
  readonly ok: false;
  readonly diagnostic: {
    readonly message: string;
    readonly allowedRepairActions: readonly string[];
  };
} {
  return diagnostic("Agent task orchestrator tick does not accept tool input.", [
    "send an empty POST body to tick queued-task orchestration",
    "use approval routes to append human decisions"
  ]);
}

function invalidRuntimeWakeBodyDiagnostic(): {
  readonly ok: false;
  readonly diagnostic: {
    readonly message: string;
    readonly allowedRepairActions: readonly string[];
  };
} {
  return diagnostic("Agent runtime wake does not accept tool input.", [
    "send an empty POST body to wake task orchestration and approved-tool scheduling",
    "use approval routes to append human decisions"
  ]);
}

function emptyPostBody(body: string | undefined): boolean {
  if (body === undefined || body.trim().length === 0) return true;
  const parsed = parseJsonObjectBody(body, invalidSupervisionControlBodyDiagnostic);
  return parsed.ok && Object.keys(parsed.value).length === 0;
}

function invalidSupervisionControlBodyDiagnostic(): {
  readonly ok: false;
  readonly diagnostic: {
    readonly message: string;
    readonly allowedRepairActions: readonly string[];
  };
} {
  return diagnostic("Resident supervision controls do not accept effect input.", [
    "send an empty POST body",
    "refresh agent status"
  ]);
}

function humanSupervisionActorDiagnostic() {
  return diagnostic("Resident supervision controls require a human actor.", [
    "sign in with a human local runtime session"
  ]);
}

function supervisionUnavailableDiagnostic() {
  return diagnostic("Resident supervision is unavailable in this local runtime.", [
    "restart the local runtime",
    "refresh agent status"
  ]);
}

function missingTaskDiagnostic() {
  return diagnostic("Agent task was not found.", ["refresh agent status"]);
}

function taskControlUnavailableDiagnostic(kind: TaskControlRoute["kind"]) {
  return diagnostic(`Agent task ${kind} is not available for the current durable state.`, [
    "refresh agent status",
    "inspect the selected task and run"
  ]);
}

function workspaceCurrentnessDiagnostic(
  category: "workspace-unavailable" | "workspace-identity-mismatch"
): {
  readonly ok: false;
  readonly diagnostic: {
    readonly category: "workspace-unavailable" | "workspace-identity-mismatch";
    readonly message: string;
    readonly allowedRepairActions: readonly string[];
  };
} {
  return {
    ok: false,
    diagnostic: {
      category,
      message: category === "workspace-identity-mismatch"
        ? "The connected portable workspace identity does not match the admitted workspace."
        : "The portable workspace is unavailable; resident work and writes remain stopped.",
      allowedRepairActions: [
        "reconnect the same portable workspace",
        "refresh agent status"
      ]
    }
  };
}

function invalidMemoryBodyDiagnostic(): {
  readonly ok: false;
  readonly diagnostic: {
    readonly message: string;
    readonly allowedRepairActions: readonly string[];
  };
} {
  return diagnostic("Agent memory body is invalid.", [
    "send a safe provenance-backed memory JSON body"
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

function humanMemoryActorDiagnostic(): {
  readonly ok: false;
  readonly diagnostic: {
    readonly message: string;
    readonly allowedRepairActions: readonly string[];
  };
} {
  return diagnostic("Agent memory correction requires a human actor.", [
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

function missingMemoryDiagnostic(): {
  readonly ok: false;
  readonly diagnostic: {
    readonly message: string;
    readonly allowedRepairActions: readonly string[];
  };
} {
  return diagnostic("Agent memory item was not found.", [
    "refresh agent memory"
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

function isAgentTaskId(value: unknown): value is string {
  return typeof value === "string" && /^task_[a-zA-Z0-9_-]+$/.test(value) && isAgentSecretSafeText(value);
}

function isSafeNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && isAgentSecretSafeText(value);
}

function isMemoryKind(value: unknown): value is AgentMemoryKind {
  return value === "operator-preference" ||
    value === "agent-observation" ||
    value === "policy-caveat" ||
    value === "provider-note";
}

function isMemoryScope(value: unknown): value is AgentMemoryScope {
  return value === "workspace" ||
    value === "investigation" ||
    value === "task" ||
    value === "provider" ||
    value === "policy";
}

function isMemoryState(value: unknown): value is AgentMemoryState {
  return value === "active" || value === "superseded" || value === "retracted";
}

function isMemoryConfidence(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isRouteTaskPriority(value: unknown): value is AgentTaskPriority {
  return value === "low" || value === "normal" || value === "high" || value === "urgent";
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

function stringArray(value: unknown): readonly string[] | undefined {
  if (value === undefined) {
    return [];
  }

  return Array.isArray(value) && value.every((item) => isSafeNonEmptyText(item)) ? value : undefined;
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

function matchMemoryRoute(path: string):
  | { readonly kind: "list" }
  | { readonly kind: "detail"; readonly memoryId: string }
  | { readonly kind: "supersede"; readonly memoryId: string }
  | { readonly kind: "retract"; readonly memoryId: string }
  | undefined {
  if (path === "/api/agent/memory") {
    return { kind: "list" };
  }

  const match = /^\/api\/agent\/memory\/([^/]+?)(?:\/(supersede|retract))?$/.exec(path);
  if (match === null) {
    return undefined;
  }

  const memoryId = match[1];
  if (!isSafeNonEmptyText(memoryId)) {
    return undefined;
  }

  const action = match[2];
  if (action === "supersede") {
    return { kind: "supersede", memoryId };
  }
  if (action === "retract") {
    return { kind: "retract", memoryId };
  }

  return { kind: "detail", memoryId };
}

function memoryScopeFilter(value: string | null): AgentMemoryScope | "all" | undefined {
  if (value === null) {
    return undefined;
  }
  return value === "all" || isMemoryScope(value) ? value : undefined;
}

function memoryStateFilter(value: string | null): AgentMemoryState | "all" | undefined {
  if (value === null) {
    return undefined;
  }
  return value === "all" || isMemoryState(value) ? value : undefined;
}

async function approvalCockpit(runtime: LocalAgentRuntime) {
  return buildAgentApprovalCockpit({ status: await runtime.status() });
}

function approvalCockpitFromEvents(
  events: readonly KnowledgeEvent[],
  now: () => string,
  identityLifecycle: ResidentIdentityLifecycleDto
) {
  const projection = buildAgentProjection(events);
  return buildAgentApprovalCockpit({
    status: {
      schemaVersion: "agent-status.v1",
      generatedAt: now(),
      ...projection.toDto(),
      identityLifecycle,
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

function memoryMutationResponse(
  result: Awaited<ReturnType<LocalAgentRuntime["recordMemory"]>>
): LocalRuntimeResponse {
  if (result.ok) {
    return json(200, result);
  }

  if (result.error.message.includes("not found")) {
    return json(404, missingMemoryDiagnostic());
  }

  if (isMemoryRuntimeConflict(result.error)) {
    return json(409, runtimeDiagnostic(result.error));
  }

  return json(400, runtimeDiagnostic(result.error));
}

function isMemoryRuntimeConflict(
  error: { readonly category: string; readonly message: string }
): boolean {
  return error.category === "runtime" && error.message.includes("partially applied");
}

function runtimeDiagnostic(error: {
  readonly message: string;
  readonly allowedRepairActions?: readonly string[];
}): {
  readonly ok: false;
  readonly diagnostic: {
    readonly message: string;
    readonly allowedRepairActions: readonly string[];
  };
} {
  return diagnostic(error.message, error.allowedRepairActions ?? []);
}

function json(status: number, body: unknown): LocalRuntimeResponse {
  return Object.freeze({
    status,
    headers: Object.freeze({ "content-type": "application/json; charset=utf-8" }),
    body: JSON.stringify(body)
  });
}
