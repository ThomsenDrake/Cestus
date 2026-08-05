import type { KnowledgeEvent } from "../../ontology/src/contracts.js";
import { buildTaskOrchestratorProjection, type TaskOrchestratorProjection } from "./task-orchestrator-projection.js";
import type {
  AgentProjectionDto,
  ProjectedAgentContextPackRef,
  ProjectedAgentLock,
  ProjectedAgentMemory,
  ProjectedAgentMemoryHistoryEntry,
  ProjectedAgentModelInvocation,
  ProjectedAgentPermission,
  ProjectedAgentProductionPromptAudit,
  ProjectedAgentProductionPromptAuditV1,
  ProjectedAgentProductionPromptAuditV2,
  ProjectedAgentPromptArtifactOmission,
  ProjectedAgentRun,
  ProjectedAgentTask,
  ProjectedAgentToolRequest
} from "./projection-types.js";

export interface AgentProjectionIdentity {
  readonly residentAgentId: string;
  readonly workspaceId: string;
  readonly label: string;
  readonly policyId?: string | undefined;
  readonly initializedBy?: string | undefined;
  readonly allowedRunTypes: readonly string[];
  readonly memoryProjectionVersion?: string | undefined;
  readonly eventIds: readonly string[];
  readonly causationIds: readonly string[];
}

export interface AgentProjection {
  readonly identity?: AgentProjectionIdentity | undefined;
  readonly tasks: ReadonlyMap<string, ProjectedAgentTask>;
  readonly taskOrchestrator: TaskOrchestratorProjection;
  readonly runs: ReadonlyMap<string, ProjectedAgentRun>;
  readonly modelInvocations: ReadonlyMap<string, ProjectedAgentModelInvocation>;
  readonly toolRequests: ReadonlyMap<string, ProjectedAgentToolRequest>;
  readonly memoryHistory: ReadonlyMap<string, ProjectedAgentMemory>;
  readonly activeMemory: readonly ProjectedAgentMemory[];
  readonly permissions: ReadonlyMap<string, ProjectedAgentPermission>;
  readonly locks: ReadonlyMap<string, ProjectedAgentLock>;
  toDto(): AgentProjectionDto;
}

export interface BuildAgentProjectionOptions {
  readonly now?: string | Date | undefined;
}

const residentSourceBoundaryReviewBrand = new WeakSet<object>();

/** Runtime-only authority. It is never serialized into the agent status DTO. */
export function hasProjectedResidentSourceBoundaryReview(value: unknown): value is object {
  return value !== null && typeof value === "object" && residentSourceBoundaryReviewBrand.has(value);
}

export function buildAgentProjection(events: readonly KnowledgeEvent[], options: BuildAgentProjectionOptions = {}): AgentProjection {
  let identity: AgentProjectionIdentity | undefined;
  const taskOrchestrator = buildTaskOrchestratorProjection(events, { now: options.now });
  const tasks = new Map<string, ProjectedAgentTask>();
  const runs = new Map<string, ProjectedAgentRun>();
  const modelInvocations = new Map<string, ProjectedAgentModelInvocation>();
  const toolRequests = new Map<string, ProjectedAgentToolRequest>();
  const memoryHistory = new Map<string, ProjectedAgentMemory>();
  const permissions = new Map<string, ProjectedAgentPermission>();
  const locks = new Map<string, ProjectedAgentLock>();

  for (const event of events) {
    if (!event.type.startsWith("agent.")) {
      continue;
    }

    switch (event.type) {
      case "agent.identity.initialized":
        identity = freezeProjected({
          residentAgentId: event.payload.residentAgentId,
          workspaceId: event.payload.workspaceId,
          label: event.payload.label,
          policyId: event.payload.policyId,
          initializedBy: event.payload.initializedBy,
          allowedRunTypes: freezeArray(event.payload.allowedRunTypes ?? []),
          memoryProjectionVersion: event.payload.memoryProjectionVersion,
          ...nextProvenance(undefined, event)
        });
        break;

      case "agent.identity.updated":
        if (identity?.residentAgentId === event.payload.residentAgentId) {
          identity = freezeProjected({
            ...identity,
            label: event.payload.label ?? identity.label,
            policyId: event.payload.policyId ?? identity.policyId,
            allowedRunTypes: freezeArray(event.payload.allowedRunTypes ?? identity.allowedRunTypes),
            ...nextProvenance(identity, event)
          });
        }
        break;

      case "agent.policy.installed":
        if (identity?.residentAgentId === event.payload.residentAgentId) {
          identity = freezeProjected({
            ...identity,
            policyId: event.payload.policyId,
            allowedRunTypes: freezeArray(event.payload.allowedRunTypes),
            ...nextProvenance(identity, event)
          });
        }
        break;

      case "agent.task.created":
        tasks.set(
          event.payload.taskId,
          freezeProjected({
            taskId: event.payload.taskId,
            residentAgentId: event.payload.residentAgentId,
            title: event.payload.title,
            requestedBy: event.payload.requestedBy,
            priority: event.payload.priority,
            status: "queued",
            createdAt: event.context.occurredAt,
            description: event.payload.description,
            sourceEventIds: freezeArray(event.payload.sourceEventIds ?? []),
            inputArtifactHashes: freezeArray(event.payload.inputArtifactHashes ?? []),
            ...nextProvenance(undefined, event)
          })
        );
        break;

      case "agent.task.status.changed": {
        const previous = tasks.get(event.payload.taskId);
        if (previous) {
          tasks.set(
            event.payload.taskId,
            freezeProjected({
              ...previous,
              status: event.payload.status,
              updatedAt: event.context.occurredAt,
              changedBy: event.payload.changedBy,
              statusReason: event.payload.reason,
              runId: event.payload.runId ?? previous.runId,
              ...nextProvenance(previous, event)
            })
          );
        }
        break;
      }

      case "agent.specialist-run.started":
        runs.set(
          event.payload.runId,
          freezeProjected({
            runId: event.payload.runId,
            residentAgentId: event.payload.residentAgentId,
            runType: event.payload.runType,
            state: "running",
            startedBy: event.payload.startedBy,
            startedAt: event.context.occurredAt,
            taskId: event.payload.taskId,
            workspaceId: event.payload.workspaceId,
            investigationId: event.payload.investigationId,
            sourceEventIds: freezeArray(event.payload.sourceEventIds ?? []),
            inputArtifactHashes: freezeArray(event.payload.inputArtifactHashes ?? []),
            relatedEventIds: freezeArray([]),
            outputArtifactHashes: freezeArray([]),
            stepIds: freezeArray([]),
            invocationIds: freezeArray([]),
            toolRequestIds: freezeArray([]),
            allowedActions: freezeArray([]),
            ...nextProvenance(undefined, event)
          })
        );
        break;

      case "agent.specialist-run.step.recorded": {
        const previous = runs.get(event.payload.runId);
        if (previous) {
          runs.set(
            event.payload.runId,
            freezeProjected({
              ...previous,
              stepIds: appendValue(previous.stepIds, event.payload.stepId),
              invocationIds: appendOptionalValue(previous.invocationIds, event.payload.invocationId),
              toolRequestIds: appendOptionalValue(previous.toolRequestIds, event.payload.toolRequestId),
              outputArtifactHashes: appendValues(previous.outputArtifactHashes, event.payload.outputArtifactHashes ?? []),
              ...nextProvenance(previous, event)
            })
          );
        }
        break;
      }

      case "agent.specialist-run.completed": {
        const previous = runs.get(event.payload.runId);
        if (previous) {
          runs.set(
            event.payload.runId,
            freezeProjected({
              ...previous,
              state: "completed",
              completedAt: event.payload.completedAt,
              outputArtifactHashes: appendValues(previous.outputArtifactHashes, event.payload.outputArtifactHashes),
              relatedEventIds: appendValues(previous.relatedEventIds, event.payload.relatedEventIds ?? []),
              summary: event.payload.summary ?? previous.summary,
              ...nextProvenance(previous, event)
            })
          );
        }
        break;
      }

      case "agent.specialist-run.failed": {
        const previous = runs.get(event.payload.runId);
        if (previous) {
          runs.set(
            event.payload.runId,
            freezeProjected({
              ...previous,
              state: "failed",
              failedAt: event.payload.failedAt,
              failureCategory: event.payload.category,
              failureMessage: event.payload.message,
              retryable: event.payload.retryable,
              allowedActions: freezeArray(event.payload.allowedActions),
              relatedEventIds: appendValues(previous.relatedEventIds, event.payload.relatedEventIds ?? []),
              toolRequestIds: appendOptionalValue(previous.toolRequestIds, event.payload.toolRequestId),
              ...nextProvenance(previous, event)
            })
          );
        }
        break;
      }

      case "agent.model-invocation.requested":
        modelInvocations.set(
          event.payload.invocationId,
          freezeProjected({
            invocationId: event.payload.invocationId,
            runId: event.payload.runId,
            providerId: event.payload.providerId,
            modelFamily: event.payload.modelFamily,
            inputArtifactHash: event.payload.inputArtifactHash,
            safetyClass: event.payload.safetyClass,
            status: "requested",
            requestedAt: event.context.occurredAt,
            credentialRefId: event.payload.credentialRefId,
            credentialKind: event.payload.credentialKind,
            contextPackRefs: projectContextPackRefs(event.payload.contextPackRefs ?? []),
            promptTemplateId: event.payload.promptTemplateId,
            promptTemplateVersion: event.payload.promptTemplateVersion,
            runType: event.payload.runType,
            safePromptSummary: event.payload.safePromptSummary,
            omissions: projectPromptOmissions(event.payload.omissions ?? []),
            transferApprovalClass: event.payload.transferApprovalClass,
            production: projectProductionPromptAudit(event.payload.production),
            allowedActions: freezeArray([]),
            ...nextProvenance(undefined, event)
          })
        );
        rememberRunInvocation(runs, event.payload.runId, event.payload.invocationId, event);
        break;

      case "agent.model-invocation.completed": {
        const previous = modelInvocations.get(event.payload.invocationId);
        if (previous) {
          modelInvocations.set(
            event.payload.invocationId,
            freezeProjected({
              ...previous,
              status: "completed",
              providerOutputArtifactHash: event.payload.outputArtifactHash,
              completedAt: event.payload.completedAt,
              modelFamily: event.payload.modelFamily ?? previous.modelFamily,
              usage: event.payload.usage === undefined
                ? undefined
                : freezeProjected({
                  inputTokens: event.payload.usage.inputTokens,
                  outputTokens: event.payload.usage.outputTokens,
                  totalTokens: event.payload.usage.totalTokens
                }),
              ...nextProvenance(previous, event)
            })
          );
        }
        rememberRunInvocation(runs, event.payload.runId, event.payload.invocationId, event);
        break;
      }

      case "agent.model-invocation.failed": {
        const previous = modelInvocations.get(event.payload.invocationId);
        if (previous) {
          modelInvocations.set(
            event.payload.invocationId,
            freezeProjected({
              ...previous,
              status: "failed",
              failureCategory: event.payload.category,
              failureMessage: event.payload.message,
              retryable: event.payload.retryable,
              allowedActions: freezeArray(event.payload.allowedActions),
              ...nextProvenance(previous, event)
            })
          );
        }
        rememberRunInvocation(runs, event.payload.runId, event.payload.invocationId, event);
        break;
      }

      case "agent.tool.requested": {
        const residentSourceBoundaryReview = projectResidentSourceBoundaryReview(event);
        const toolRequest = {
          toolRequestId: event.payload.toolRequestId,
          runId: event.payload.runId,
          toolId: event.payload.toolId,
          toolVersion: event.payload.toolVersion,
          requestedBy: event.payload.requestedBy,
          sideEffectClass: event.payload.sideEffectClass,
          requiredApprovalClass: event.payload.requiredApprovalClass,
          previewHash: event.payload.previewHash,
          scope: event.payload.scope,
          estimatedEffect: event.payload.estimatedEffect,
          state: "requested" as const,
          requestedAt: event.context.occurredAt,
          sourceEventIds: freezeArray(event.payload.sourceEventIds ?? []),
          inputArtifactHashes: freezeArray(event.payload.inputArtifactHashes ?? []),
          resultEventIds: freezeArray([]),
          artifactHashes: freezeArray([]),
          readModelChanges: freezeArray([]),
          allowedActions: freezeArray([]),
          ...(residentSourceBoundaryReview === undefined ? {} : { residentSourceBoundaryReview }),
          ...nextProvenance(undefined, event)
        };
        if (residentSourceBoundaryReview !== undefined) {
          residentSourceBoundaryReviewBrand.add(toolRequest);
        }
        toolRequests.set(
          event.payload.toolRequestId,
          freezeProjected(toolRequest)
        );
        rememberRunToolRequest(runs, event.payload.runId, event.payload.toolRequestId, event);
        break;
      }

      case "agent.tool.approved": {
        const previous = toolRequests.get(event.payload.toolRequestId);
        if (previous) {
          toolRequests.set(
            event.payload.toolRequestId,
            freezeToolRequest(previous, {
              ...previous,
              state: "approved",
              approvedBy: event.payload.approvedBy,
              approvedPreviewHash: event.payload.approvedPreviewHash,
              approvalClass: event.payload.approvalClass,
              approvalRationale: event.payload.rationale,
              approvedAt: event.payload.approvedAt ?? event.context.occurredAt,
              ...nextProvenance(previous, event)
            })
          );
        }
        break;
      }

      case "agent.tool.execution.claimed": {
        const previous = toolRequests.get(event.payload.toolRequestId);
        if (previous && toolRequestCanAcceptExecutionClaim(previous.state)) {
          toolRequests.set(
            event.payload.toolRequestId,
            freezeToolRequest(previous, {
              ...previous,
              state: "executing",
              executionClaimedBy: event.payload.claimedBy,
              executionClaimedAt: event.payload.claimedAt,
              executionLeaseExpiresAt: event.payload.leaseExpiresAt,
              executionApprovedPreviewHash: event.payload.approvedPreviewHash,
              executionClaimEventId: event.id,
              ...nextProvenance(previous, event)
            })
          );
        }
        break;
      }

      case "agent.tool.denied": {
        const previous = toolRequests.get(event.payload.toolRequestId);
        if (previous) {
          toolRequests.set(
            event.payload.toolRequestId,
            freezeToolRequest(previous, {
              ...previous,
              state: "denied",
              deniedBy: event.payload.deniedBy,
              denialRationale: event.payload.rationale,
              deniedAt: event.payload.deniedAt ?? event.context.occurredAt,
              approvalClass: event.payload.approvalClass ?? previous.approvalClass,
              ...nextProvenance(previous, event)
            })
          );
        }
        break;
      }

      case "agent.tool.completed": {
        const previous = toolRequests.get(event.payload.toolRequestId);
        if (previous) {
          toolRequests.set(
            event.payload.toolRequestId,
            freezeToolRequest(previous, {
              ...previous,
              state: "completed",
              completedAt: event.payload.completedAt,
              resultEventIds: freezeArray(event.payload.eventIds),
              artifactHashes: freezeArray(event.payload.artifactHashes),
              readModelChanges: freezeArray(
                event.payload.readModelChanges.map((change) =>
                  freezeProjected({
                    projectionName: change.projectionName,
                    change: change.change,
                    relatedIds: change.relatedIds === undefined ? undefined : freezeArray(change.relatedIds)
                  })
                )
              ),
              resultSummary: event.payload.resultSummary,
              ...nextProvenance(previous, event)
            })
          );
        }
        break;
      }

      case "agent.tool.failed": {
        const previous = toolRequests.get(event.payload.toolRequestId);
        if (previous) {
          toolRequests.set(
            event.payload.toolRequestId,
            freezeToolRequest(previous, {
              ...previous,
              state: "failed",
              failedAt: event.payload.failedAt,
              failureCategory: event.payload.category,
              failureMessage: event.payload.message,
              retryable: event.payload.retryable,
              allowedActions: freezeArray(event.payload.allowedActions),
              ...nextProvenance(previous, event)
            })
          );
        }
        break;
      }

      case "agent.memory.recorded":
        memoryHistory.set(
          event.payload.memoryId,
          freezeProjected({
            memoryId: event.payload.memoryId,
            residentAgentId: event.payload.residentAgentId,
            scope: event.payload.scope,
            memoryKind: event.payload.memoryKind ?? "agent-observation",
            summary: event.payload.summary,
            recordedBy: event.context.actor.id,
            recordedByKind: event.context.actor.kind,
            sourceEventIds: freezeArray(event.payload.sourceEventIds ?? []),
            artifactHashes: freezeArray(event.payload.artifactHashes ?? []),
            confidence: event.payload.confidence,
            createdAt: event.payload.createdAt,
            expiresAt: event.payload.expiresAt,
            state: "active",
            memoryHistoryEntries: freezeArray([
              freezeProjected({
                eventId: event.id,
                eventType: event.type,
                occurredAt: event.payload.createdAt
              })
            ]),
            ...nextProvenance(undefined, event)
          })
        );
        break;

      case "agent.memory.superseded": {
        const previous = memoryHistory.get(event.payload.memoryId);
        if (previous) {
          memoryHistory.set(
            event.payload.memoryId,
            freezeProjected({
              ...previous,
              state: "superseded",
              supersededByMemoryId: event.payload.supersededByMemoryId,
              supersededBy: event.payload.supersededBy,
              supersededAt: event.payload.supersededAt ?? event.context.occurredAt,
              supersessionRationale: event.payload.rationale,
              memoryHistoryEntries: appendMemoryHistoryEntry(previous.memoryHistoryEntries, {
                eventId: event.id,
                eventType: event.type,
                occurredAt: event.payload.supersededAt ?? event.context.occurredAt
              }),
              ...nextProvenance(previous, event)
            })
          );
        }
        break;
      }

      case "agent.memory.retracted": {
        const previous = memoryHistory.get(event.payload.memoryId);
        if (previous) {
          memoryHistory.set(
            event.payload.memoryId,
            freezeProjected({
              ...previous,
              state: "retracted",
              retractedBy: event.payload.retractedBy,
              retractedAt: event.payload.retractedAt ?? event.context.occurredAt,
              retractionRationale: event.payload.rationale,
              memoryHistoryEntries: appendMemoryHistoryEntry(previous.memoryHistoryEntries, {
                eventId: event.id,
                eventType: event.type,
                occurredAt: event.payload.retractedAt ?? event.context.occurredAt
              }),
              ...nextProvenance(previous, event)
            })
          );
        }
        break;
      }

      case "agent.permission.granted":
        permissions.set(
          event.payload.permissionId,
          freezeProjected({
            permissionId: event.payload.permissionId,
            residentAgentId: event.payload.residentAgentId,
            grantedBy: event.payload.grantedBy,
            scope: event.payload.scope,
            sideEffectClasses: freezeArray(event.payload.sideEffectClasses),
            rationale: event.payload.rationale,
            grantedAt: event.payload.grantedAt ?? event.context.occurredAt,
            expiresAt: event.payload.expiresAt,
            state: "granted",
            ...nextProvenance(undefined, event)
          })
        );
        break;

      case "agent.permission.revoked": {
        const previous = permissions.get(event.payload.permissionId);
        if (previous) {
          permissions.set(
            event.payload.permissionId,
            freezeProjected({
              ...previous,
              state: "revoked",
              revokedBy: event.payload.revokedBy,
              revokedAt: event.payload.revokedAt ?? event.context.occurredAt,
              revocationRationale: event.payload.rationale,
              ...nextProvenance(previous, event)
            })
          );
        }
        break;
      }

      case "agent.lock.activated":
        locks.set(
          event.payload.lockId,
          freezeProjected({
            lockId: event.payload.lockId,
            residentAgentId: event.payload.residentAgentId,
            kind: event.payload.kind,
            activatedBy: event.payload.activatedBy,
            reason: event.payload.reason,
            activatedAt: event.payload.activatedAt ?? event.context.occurredAt,
            relatedEventIds: freezeArray(event.payload.relatedEventIds ?? []),
            state: "active",
            clearRelatedEventIds: freezeArray([]),
            ...nextProvenance(undefined, event)
          })
        );
        break;

      case "agent.lock.cleared": {
        const previous = locks.get(event.payload.lockId);
        if (previous) {
          locks.set(
            event.payload.lockId,
            freezeProjected({
              ...previous,
              state: "cleared",
              clearedBy: event.payload.clearedBy,
              clearedAt: event.payload.clearedAt ?? event.context.occurredAt,
              clearRationale: event.payload.rationale,
              clearRelatedEventIds: freezeArray(event.payload.relatedEventIds ?? []),
              ...nextProvenance(previous, event)
            })
          );
        }
        break;
      }

      default:
        break;
    }
  }

  const activeMemory = sortedById(
    [...memoryHistory.values()].filter((memory) => memory.state === "active"),
    (memory) => memory.memoryId
  );

  const taskSnapshot = readonlyMapSnapshot(tasks);
  const runSnapshot = readonlyMapSnapshot(runs);
  const modelInvocationSnapshot = readonlyMapSnapshot(modelInvocations);
  const toolRequestSnapshot = readonlyMapSnapshot(toolRequests);
  const memoryHistorySnapshot = readonlyMapSnapshot(memoryHistory);
  const permissionSnapshot = readonlyMapSnapshot(permissions);
  const lockSnapshot = readonlyMapSnapshot(locks);

  const projection: AgentProjection = {
    identity,
    tasks: taskSnapshot,
    taskOrchestrator,
    runs: runSnapshot,
    modelInvocations: modelInvocationSnapshot,
    toolRequests: toolRequestSnapshot,
    memoryHistory: memoryHistorySnapshot,
    activeMemory,
    permissions: permissionSnapshot,
    locks: lockSnapshot,
    toDto() {
      return freezeProjected({
        ...(identity === undefined ? {} : { residentAgentId: identity.residentAgentId }),
        tasks: sortedById([...taskSnapshot.values()], (task) => task.taskId),
        taskOrchestrator: taskOrchestrator.toDto(),
        runs: sortedById([...runSnapshot.values()], (run) => run.runId),
        modelInvocations: sortedById([...modelInvocationSnapshot.values()], (invocation) => invocation.invocationId),
        toolRequests: sortedById([...toolRequestSnapshot.values()], (toolRequest) => toolRequest.toolRequestId),
        activeMemory: sortedById(activeMemory, (memory) => memory.memoryId),
        permissions: sortedById([...permissionSnapshot.values()], (permission) => permission.permissionId),
        locks: sortedById([...lockSnapshot.values()], (lock) => lock.lockId)
      });
    }
  };

  return freezeProjected(projection);
}

function freezeToolRequest<T extends object>(previous: unknown, value: T): T {
  const frozen = freezeProjected(value);
  if (hasProjectedResidentSourceBoundaryReview(previous)) {
    residentSourceBoundaryReviewBrand.add(frozen);
  }
  return frozen;
}

function projectResidentSourceBoundaryReview(event: Extract<KnowledgeEvent, { readonly type: "agent.tool.requested" }>) {
  const binding = event.payload.residentSourceBoundary;
  if (
    binding === undefined ||
    event.payload.toolId !== "ingestion.source-boundary.approve" ||
    event.payload.sideEffectClass !== "ledger-proposal" ||
    event.payload.requiredApprovalClass !== "human-review" ||
    binding.archivePolicy !== "reject" ||
    binding.regularFileCount !== binding.includedFileCount + binding.excludedFileCount ||
    binding.totalBytes !== binding.includedBytes + binding.excludedBytes ||
    !/^source_[a-f0-9]{64}$/.test(binding.sourceIdentity) ||
    ![binding.sourceRootHash, binding.discoveryArtifactHash, binding.discoveryHash, binding.manifestArtifactHash, binding.manifestHash]
      .every((hash) => /^sha256:[a-f0-9]{64}$/.test(hash))
  ) {
    return undefined;
  }

  return Object.freeze({
    schemaVersion: "resident-source-boundary-review.v1" as const,
    requestEventId: event.id
  });
}

type AgentModelRequestedEvent = Extract<KnowledgeEvent, { type: "agent.model-invocation.requested" }>;
type AgentContextPackRefPayload = NonNullable<AgentModelRequestedEvent["payload"]["contextPackRefs"]>[number];
type AgentPromptOmissionPayload = NonNullable<AgentModelRequestedEvent["payload"]["omissions"]>[number];
type AgentProductionPromptAuditPayload = NonNullable<AgentModelRequestedEvent["payload"]["production"]>;

function projectContextPackRefs(refs: readonly AgentContextPackRefPayload[]): readonly ProjectedAgentContextPackRef[] {
  return freezeArray(
    refs.map((ref) =>
      freezeProjected({
        contextPackId: ref.contextPackId,
        version: ref.version,
        contentHash: ref.contentHash,
        sizeBytes: ref.sizeBytes,
        generatedAt: ref.generatedAt,
        safeSummary: ref.safeSummary,
        provenanceRefs: freezeArray(ref.provenanceRefs),
        projectionHighWaterMark: ref.projectionHighWaterMark,
        sourceEventIds: ref.sourceEventIds === undefined ? undefined : freezeArray(ref.sourceEventIds),
        artifactHashes: ref.artifactHashes === undefined ? undefined : freezeArray(ref.artifactHashes),
        policyVersion: ref.policyVersion,
        scope: ref.scope === undefined
          ? undefined
          : freezeProjected({
            kind: ref.scope.kind,
            id: ref.scope.id
          }),
        sizeBudgetBytes: ref.sizeBudgetBytes,
        stalenessInputs: ref.stalenessInputs === undefined
          ? undefined
          : freezeArray(
            ref.stalenessInputs.map((stalenessInput) =>
              freezeProjected({
                kind: stalenessInput.kind,
                ref: stalenessInput.ref,
                value: stalenessInput.value
              })
            )
          )
      })
    )
  );
}

function projectPromptOmissions(omissions: readonly AgentPromptOmissionPayload[]): readonly ProjectedAgentPromptArtifactOmission[] {
  return freezeArray(
    omissions.map((omission) =>
      freezeProjected({
        reason: omission.reason,
        sourceRef: omission.sourceRef,
        safeSummary: omission.safeSummary
      })
    )
  );
}

function projectProductionPromptAudit(
  production: AgentProductionPromptAuditPayload | undefined
): ProjectedAgentProductionPromptAudit | undefined {
  if (production === undefined) {
    return undefined;
  }
  const common = {
    rendererId: production.rendererId,
    rendererVersion: production.rendererVersion,
    rendererHash: production.rendererHash,
    renderedPromptHash: production.renderedPromptHash,
    providerOutputSchemaId: production.providerOutputSchemaId,
    providerOutputSchemaVersion: production.providerOutputSchemaVersion,
    handoffSchemaId: production.handoffSchemaId,
    handoffSchemaVersion: production.handoffSchemaVersion,
    scopeApplicabilityHash: production.scopeApplicabilityHash,
    evaluatedContextRequirements: freezeArray(production.evaluatedContextRequirements.map((requirement) => freezeProjected({
      contextPackId: requirement.contextPackId,
      requirementMode: requirement.requirementMode,
      status: requirement.status,
      contentHash: requirement.contentHash,
      omissionReason: requirement.omissionReason
    }))),
    resolvedPayloadAudits: freezeArray(production.resolvedPayloadAudits.map((audit) => freezeProjected({
      contextPackId: audit.contextPackId,
      contentHash: audit.contentHash,
      sizeBytes: audit.sizeBytes,
      schemaId: audit.schemaId
    })))
  };
  if (production.schemaVersion === "agent-production-prompt-binding.v1") {
    return freezeProjected({
      schemaVersion: production.schemaVersion,
      ...common
    }) satisfies ProjectedAgentProductionPromptAuditV1;
  }
  return freezeProjected({
    schemaVersion: production.schemaVersion,
    ...common,
    sourceApprovedPromptArtifactHash: production.sourceApprovedPromptArtifactHash,
    exactRunBinding: freezeProjected({
      taskId: production.exactRunBinding.taskId,
      attemptId: production.exactRunBinding.attemptId,
      approvedRunId: production.exactRunBinding.approvedRunId,
      runId: production.exactRunBinding.runId,
      runType: production.exactRunBinding.runType,
      residentAgentId: production.exactRunBinding.residentAgentId,
      workspaceId: production.exactRunBinding.workspaceId,
      mountInstanceId: production.exactRunBinding.mountInstanceId,
      workflowDescriptorHash: production.exactRunBinding.workflowDescriptorHash,
      policyVersion: production.exactRunBinding.policyVersion,
      providerPosture: freezeProjected({
        providerId: production.exactRunBinding.providerPosture.providerId,
        modelId: production.exactRunBinding.providerPosture.modelId,
        capabilityIds: freezeArray(production.exactRunBinding.providerPosture.capabilityIds),
        selectionPolicyVersion: production.exactRunBinding.providerPosture.selectionPolicyVersion,
        readinessState: production.exactRunBinding.providerPosture.readinessState,
        approvalRequirementId: production.exactRunBinding.providerPosture.approvalRequirementId
      })
    }),
    providerPostureHash: production.providerPostureHash,
    exactRunBindingHash: production.exactRunBindingHash
  }) satisfies ProjectedAgentProductionPromptAuditV2;
}

function toolRequestCanAcceptExecutionClaim(state: ProjectedAgentToolRequest["state"]): boolean {
  return state === "approved" || state === "executing";
}

function rememberRunInvocation(
  runs: Map<string, ProjectedAgentRun>,
  runId: string,
  invocationId: string,
  event: KnowledgeEvent
): void {
  const previous = runs.get(runId);
  if (!previous) {
    return;
  }

  runs.set(
    runId,
    freezeProjected({
      ...previous,
      invocationIds: appendValue(previous.invocationIds, invocationId),
      ...nextProvenance(previous, event)
    })
  );
}

function rememberRunToolRequest(
  runs: Map<string, ProjectedAgentRun>,
  runId: string,
  toolRequestId: string,
  event: KnowledgeEvent
): void {
  const previous = runs.get(runId);
  if (!previous) {
    return;
  }

  runs.set(
    runId,
    freezeProjected({
      ...previous,
      toolRequestIds: appendValue(previous.toolRequestIds, toolRequestId),
      ...nextProvenance(previous, event)
    })
  );
}

function nextProvenance(
  previous: ProjectedProvenance | undefined,
  event: KnowledgeEvent
): { readonly eventIds: readonly string[]; readonly causationIds: readonly string[] } {
  return {
    eventIds: appendValue(previous?.eventIds ?? [], event.id),
    causationIds: appendOptionalValue(previous?.causationIds ?? [], event.context.causationId)
  };
}

interface ProjectedProvenance {
  readonly eventIds: readonly string[];
  readonly causationIds: readonly string[];
}

function appendMemoryHistoryEntry(
  history: readonly ProjectedAgentMemoryHistoryEntry[],
  entry: ProjectedAgentMemoryHistoryEntry
): readonly ProjectedAgentMemoryHistoryEntry[] {
  return freezeArray([...history, freezeProjected(entry)]);
}

function appendOptionalValue(values: readonly string[], value: string | undefined): readonly string[] {
  return value === undefined ? freezeArray(values) : appendValue(values, value);
}

function appendValue(values: readonly string[], value: string): readonly string[] {
  if (values.includes(value)) {
    return freezeArray(values);
  }
  return freezeArray([...values, value]);
}

function appendValues(values: readonly string[], nextValues: readonly string[]): readonly string[] {
  let appended = [...values];
  for (const value of nextValues) {
    if (!appended.includes(value)) {
      appended = [...appended, value];
    }
  }
  return freezeArray(appended);
}

function sortedById<T>(values: readonly T[], idFor: (value: T) => string): readonly T[] {
  return freezeArray([...values].sort((left, right) => idFor(left).localeCompare(idFor(right))));
}

function readonlyMapSnapshot<K, V>(source: ReadonlyMap<K, V>): ReadonlyMap<K, V> {
  const snapshot = new Map(source);
  let readonlyMap: ReadonlyMap<K, V>;

  readonlyMap = Object.freeze({
    get size() {
      return snapshot.size;
    },
    get(key: K) {
      return snapshot.get(key);
    },
    has(key: K) {
      return snapshot.has(key);
    },
    forEach(callbackfn: (value: V, key: K, map: ReadonlyMap<K, V>) => void, thisArg?: unknown) {
      snapshot.forEach((value, key) => callbackfn.call(thisArg, value, key, readonlyMap));
    },
    entries() {
      return snapshot.entries();
    },
    keys() {
      return snapshot.keys();
    },
    values() {
      return snapshot.values();
    },
    [Symbol.iterator]() {
      return snapshot[Symbol.iterator]();
    },
    get [Symbol.toStringTag]() {
      return "ReadonlyMap";
    }
  });

  return readonlyMap;
}

function freezeArray<T>(values: readonly T[]): readonly T[] {
  return Object.freeze([...values]);
}

function freezeProjected<T extends object>(value: T): Readonly<T> {
  return Object.freeze(value);
}
