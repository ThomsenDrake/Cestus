import type { ActorRef, AppendableKnowledgeEvent, KnowledgeEventOf } from "../../ontology/src/contracts.js";
import type { AppendOptions, EventLedger } from "../../ontology/src/event-ledger.js";
import { buildAgentMemoryDetail, buildAgentMemoryList } from "./memory.js";
import { buildAgentProjection } from "./projection.js";
import type {
  AgentFailureCategory,
  AgentMemoryKind,
  AgentMemoryScope,
  AgentMemoryState,
  AgentTaskPriority
} from "./projection-types.js";
import type {
  CredentialReference,
  ModelInvocationResult,
  ModelProviderAdapter,
  ProviderDescriptor
} from "./provider.js";
import { assertCredentialReferenceIsSafe, providerDescriptorSchema } from "./provider.js";
import {
  assertPromptArtifactCanTransferToRemoteProvider,
  promptArtifactAuditMetadata,
  type PromptArtifactAuditMetadata,
  type PromptArtifactEnvelope
} from "./prompt-artifacts.js";
import type {
  AgentMemoryMutationResult,
  AgentRuntimeDiagnosticDto,
  AgentRuntimeResult,
  AgentStatusDto,
  RecordAgentMemoryInput,
  RetractAgentMemoryInput,
  SupersedeAgentMemoryInput
} from "./runtime-types.js";
import {
  approvedAgentSpecialistRunTypes,
  specialistExecutionStatusFor,
  type AgentSpecialistRunType
} from "./specialists.js";
import { createAgentScheduler } from "./scheduler.js";
import type { AgentApprovedToolExecutorDescriptor } from "./scheduler-types.js";
import { assertAgentSecretSafeText } from "./secret-safety.js";
import { createAgentToolGateway } from "./tool-gateway.js";
import {
  notMountedResidentIdentityLifecycle,
  type ResidentIdentityLifecycleDto
} from "./identity-bootstrap.js";

const agentCoreVersion = "0.1.0";
const agentPackVersions = { core: "0.1.0", agent: "0.1.0" } as const;
const defaultResidentAgentId = "agent_default";
const defaultResidentLabel = "Cestus Agent";
const defaultPolicyId = "agent_policy_default";
const defaultMemoryProjectionVersion = "0.1.0";
const defaultAllowedRunTypes = approvedAgentSpecialistRunTypes;

export interface CreateAgentRuntimeInput {
  readonly ledger: EventLedger;
  readonly actor: ActorRef;
  readonly now: () => string;
  readonly identityLifecycle?: ResidentIdentityLifecycleDto | (() => ResidentIdentityLifecycleDto);
  readonly providers?: readonly ModelProviderAdapter[];
  readonly approvedToolExecutors?: readonly AgentApprovedToolExecutorDescriptor[];
}

export interface InitializeDefaultIdentityInput {
  readonly workspaceId: string;
  readonly residentAgentId?: string;
  readonly label?: string;
  readonly policyId?: string;
  readonly initializedBy?: string;
  readonly allowedRunTypes?: readonly AgentSpecialistRunType[];
  readonly memoryProjectionVersion?: string;
}

export interface CreateAgentTaskInput {
  readonly taskId: string;
  readonly title: string;
  readonly requestedBy: string;
  readonly priority: AgentTaskPriority;
  readonly description?: string;
  readonly sourceEventIds?: readonly string[];
  readonly inputArtifactHashes?: readonly string[];
}

export interface StartAgentRunInput {
  readonly runId: string;
  readonly taskId?: string;
  readonly runType: AgentSpecialistRunType;
  readonly scope: AgentRunScopeInput;
  readonly startedBy?: string;
  readonly sourceEventIds?: readonly string[];
  readonly inputArtifactHashes?: readonly string[];
}

export type AgentRunScopeInput =
  | { readonly kind: "workspace"; readonly refs: readonly string[] }
  | { readonly kind: "investigation"; readonly refs: readonly string[] };

export interface InvokeAgentModelInput {
  readonly invocationId: string;
  readonly runId: string;
  readonly providerId: string;
  readonly modelFamily: string;
  readonly inputArtifactHash: string;
  readonly credentialRef: CredentialReference;
  readonly safetyClass?: "workspace-safe" | "public-safe" | "sensitive-local-only" | "provider-approved";
  readonly promptArtifact?: PromptArtifactEnvelope;
  readonly returnOutputText?: boolean;
}

export interface InitializeDefaultIdentityResult {
  readonly residentAgentId: string;
  readonly alreadyInitialized: boolean;
  readonly eventIds: readonly string[];
}

export interface CreateAgentTaskResult {
  readonly taskId: string;
  readonly eventIds: readonly string[];
}

export interface StartAgentRunResult {
  readonly runId: string;
  readonly eventIds: readonly string[];
}

export interface InvokeAgentModelResult {
  readonly invocationId: string;
  readonly outputArtifactHash: string;
  readonly eventIds: readonly string[];
  readonly usage?: ModelInvocationResult["usage"] | undefined;
  readonly outputText?: string | undefined;
}

export function createAgentRuntime(input: CreateAgentRuntimeInput) {
  const providerRegistry = createProviderRegistry(input.providers ?? []);
  const scheduler = createAgentScheduler({
    ledger: input.ledger,
    actor: input.actor,
    now: input.now,
    descriptors: input.approvedToolExecutors ?? []
  });

  return {
    async status(): Promise<AgentStatusDto> {
      const configuredLifecycle = configuredIdentityLifecycle(input.identityLifecycle);
      let projection: ReturnType<typeof buildAgentProjection>;
      try {
        projection = buildAgentProjection(await input.ledger.readAll());
      } catch (error) {
        if (configuredLifecycle?.state !== "blocked") {
          throw error;
        }
        projection = buildAgentProjection([]);
      }
      const dto = projection.toDto();
      return Object.freeze({
        schemaVersion: "agent-status.v1",
        generatedAt: input.now(),
        ...dto,
        identityLifecycle: currentIdentityLifecycle(configuredLifecycle, projection.identity),
        identity: projection.identity,
        providers: Object.freeze([...providerRegistry.providers.values()].map((provider) => provider.descriptor)),
        pendingApprovalCount: [...projection.toolRequests.values()].filter((request) => request.state === "requested").length,
        activeLockCount: [...projection.locks.values()].filter((lock) => lock.state === "active").length,
        diagnostics: Object.freeze([...providerRegistry.diagnostics])
      });
    },

    async initializeDefaultIdentity(
      command: InitializeDefaultIdentityInput
    ): Promise<AgentRuntimeResult<InitializeDefaultIdentityResult>> {
      const projection = buildAgentProjection(await input.ledger.readAll());
      if (projection.identity !== undefined) {
        return {
          ok: true,
          residentAgentId: projection.identity.residentAgentId,
          alreadyInitialized: true,
          eventIds: projection.identity.eventIds
        };
      }

      const residentAgentId = command.residentAgentId ?? defaultResidentAgentId;
      const event: AppendableKnowledgeEvent<"agent.identity.initialized"> = {
        type: "agent.identity.initialized",
        version: 1,
        streamId: identityStreamId(residentAgentId),
        context: agentContext(input, `corr_${residentAgentId}`),
        payload: {
          residentAgentId,
          workspaceId: command.workspaceId,
          label: command.label ?? defaultResidentLabel,
          policyId: command.policyId ?? defaultPolicyId,
          initializedBy: command.initializedBy ?? input.actor.id,
          allowedRunTypes: [...(command.allowedRunTypes ?? defaultAllowedRunTypes)],
          memoryProjectionVersion: command.memoryProjectionVersion ?? defaultMemoryProjectionVersion
        }
      };
      const committed = await appendRuntimeEvent(input.ledger, event, { expectedNextSequence: 1 });
      return { ok: true, residentAgentId, alreadyInitialized: false, eventIds: Object.freeze([committed.id]) };
    },

    async listMemory(filters: { readonly scope?: AgentMemoryScope | "all"; readonly state?: AgentMemoryState | "all" } = {}) {
      return buildAgentMemoryList({
        projection: buildAgentProjection(await input.ledger.readAll()),
        generatedAt: input.now(),
        filters
      });
    },

    async memoryDetail(memoryId: string) {
      return buildAgentMemoryDetail({
        projection: buildAgentProjection(await input.ledger.readAll()),
        memoryId,
        generatedAt: input.now()
      });
    },

    async createTask(command: CreateAgentTaskInput): Promise<AgentRuntimeResult<CreateAgentTaskResult>> {
      const projection = buildAgentProjection(await input.ledger.readAll());
      const identity = projection.identity;
      if (identity === undefined) {
        return failedResult(agentDiagnostic("agent", "Resident identity is not initialized.", ["initialize the default resident identity"]));
      }

      const taskEvent: AppendableKnowledgeEvent<"agent.task.created"> = {
        type: "agent.task.created",
        version: 1,
        streamId: taskStreamId(command.taskId),
        context: agentContext(input, `corr_${command.taskId}`, input.actor, lastValue(identity.eventIds)),
        payload: {
          taskId: command.taskId,
          residentAgentId: identity.residentAgentId,
          title: command.title,
          requestedBy: command.requestedBy,
          priority: command.priority,
          ...optionalValue("description", command.description),
          ...optionalArray("sourceEventIds", command.sourceEventIds),
          ...optionalArray("inputArtifactHashes", command.inputArtifactHashes)
        }
      };
      const created = await appendRuntimeEvent(input.ledger, taskEvent, { expectedNextSequence: 1 });

      const statusEvent: AppendableKnowledgeEvent<"agent.task.status.changed"> = {
        type: "agent.task.status.changed",
        version: 1,
        streamId: taskStreamId(command.taskId),
        context: agentContext(input, `corr_${command.taskId}`, input.actor, created.id),
        payload: {
          taskId: command.taskId,
          status: "queued",
          changedBy: input.actor.id,
          reason: "Task queued."
        }
      };
      const queued = await appendRuntimeEvent(input.ledger, statusEvent, { expectedNextSequence: created.sequence + 1 });
      return { ok: true, taskId: command.taskId, eventIds: Object.freeze([created.id, queued.id]) };
    },

    async startRun(command: StartAgentRunInput): Promise<AgentRuntimeResult<StartAgentRunResult>> {
      const projection = buildAgentProjection(await input.ledger.readAll());
      const identity = projection.identity;
      if (identity === undefined) {
        return failedResult(agentDiagnostic("agent", "Resident identity is not initialized.", ["initialize the default resident identity"]));
      }

      if (!isApprovedAgentSpecialistRunType(command.runType)) {
        const status = specialistExecutionStatusFor(command.runType);
        return failedResult(agentDiagnostic(
          "agent",
          "Specialist workflow is not enabled for this run type.",
          status.allowedRepairActions
        ));
      }

      const task = command.taskId === undefined ? undefined : projection.tasks.get(command.taskId);
      if (command.taskId !== undefined && task === undefined) {
        return failedResult(agentDiagnostic("agent", "Agent task was not found.", ["create the task before starting a run"]));
      }

      const runEvent: AppendableKnowledgeEvent<"agent.specialist-run.started"> = {
        type: "agent.specialist-run.started",
        version: 1,
        streamId: runStreamId(command.runId),
        context: agentContext(input, `corr_${command.runId}`, input.actor, lastValue(task?.eventIds ?? identity.eventIds)),
        payload: {
          runId: command.runId,
          residentAgentId: identity.residentAgentId,
          runType: command.runType,
          startedBy: command.startedBy ?? input.actor.id,
          ...optionalValue("taskId", command.taskId),
          ...scopePayload(command.scope),
          ...optionalArray("sourceEventIds", command.sourceEventIds),
          ...optionalArray("inputArtifactHashes", command.inputArtifactHashes)
        }
      };
      const started = await appendRuntimeEvent(input.ledger, runEvent, { expectedNextSequence: 1 });
      const eventIds = [started.id];

      if (command.taskId !== undefined) {
        const streamEvents = await input.ledger.readStream(taskStreamId(command.taskId));
        const statusEvent: AppendableKnowledgeEvent<"agent.task.status.changed"> = {
          type: "agent.task.status.changed",
          version: 1,
          streamId: taskStreamId(command.taskId),
          context: agentContext(input, `corr_${command.taskId}`, input.actor, started.id),
          payload: {
            taskId: command.taskId,
            status: "running",
            changedBy: input.actor.id,
            reason: "Specialist run started.",
            runId: command.runId
          }
        };
        const running = await appendRuntimeEvent(input.ledger, statusEvent, { expectedNextSequence: streamEvents.length + 1 });
        eventIds.push(running.id);
      }

      return { ok: true, runId: command.runId, eventIds: Object.freeze(eventIds) };
    },

    async recordMemory(command: RecordAgentMemoryInput): Promise<AgentRuntimeResult<AgentMemoryMutationResult>> {
      const projection = buildAgentProjection(await input.ledger.readAll());
      const identity = projection.identity;
      if (identity === undefined) {
        return failedResult(agentDiagnostic("agent", "Resident identity is not initialized.", ["initialize the default resident identity"]));
      }
      if (rejectsOperatorPreferenceMemory(input, command.memoryKind)) {
        return failedResult(
          agentDiagnostic("agent", "Memory could not be recorded safely.", ["review memory provenance and safe summary"])
        );
      }

      const event = memoryRecordedEvent(input, identity.residentAgentId, command, lastValue(identity.eventIds));
      try {
        const committed = await appendRuntimeEvent(input.ledger, event, { expectedNextSequence: 1 });
        return { ok: true, memoryId: command.memoryId, eventIds: Object.freeze([committed.id]) };
      } catch {
        return failedResult(
          agentDiagnostic("agent", "Memory could not be recorded safely.", ["review memory provenance and safe summary"])
        );
      }
    },

    async supersedeMemory(command: SupersedeAgentMemoryInput): Promise<AgentRuntimeResult<AgentMemoryMutationResult>> {
      const projection = buildAgentProjection(await input.ledger.readAll());
      const previous = projection.memoryHistory.get(command.memoryId);
      const identity = projection.identity;
      if (identity === undefined || previous === undefined || previous.state !== "active") {
        return failedResult(agentDiagnostic("agent", "Active memory item was not found.", ["refresh memory before superseding"]));
      }
      if (rejectsOperatorPreferenceCorrection(input, previous.memoryKind)) {
        return failedResult(
          agentDiagnostic("agent", "Memory could not be superseded safely.", ["refresh memory and review provenance"])
        );
      }
      if (rejectsOperatorPreferenceMemory(input, command.memoryKind)) {
        return failedResult(
          agentDiagnostic("agent", "Memory could not be superseded safely.", ["refresh memory and review provenance"])
        );
      }

      try {
        const replacement = await appendRuntimeEvent(
          input.ledger,
          memoryRecordedEvent(
            input,
            identity.residentAgentId,
            { ...command, memoryId: command.supersededByMemoryId },
            lastValue(previous.eventIds)
          ),
          { expectedNextSequence: 1 }
        );
        let superseded: KnowledgeEventOf<"agent.memory.superseded">;
        try {
          const streamEvents = await input.ledger.readStream(memoryStreamId(command.memoryId));
          superseded = await appendRuntimeEvent(input.ledger, {
            type: "agent.memory.superseded",
            version: 1,
            streamId: memoryStreamId(command.memoryId),
            context: agentContext(input, `corr_${command.memoryId}`, input.actor, replacement.id),
            payload: {
              memoryId: command.memoryId,
              supersededByMemoryId: command.supersededByMemoryId,
              supersededBy: input.actor.id,
              rationale: command.rationale,
              supersededAt: input.now()
            }
          }, { expectedNextSequence: streamEvents.length + 1 });
        } catch {
          try {
            await appendCompensatingMemoryRetraction(input, command.supersededByMemoryId, replacement.id);
          } catch {
            return failedResult(memorySupersessionPartialFailureDiagnostic());
          }
          throw new Error("memory supersession failed");
        }
        return {
          ok: true,
          memoryId: command.supersededByMemoryId,
          eventIds: Object.freeze([replacement.id, superseded.id])
        };
      } catch {
        return failedResult(
          agentDiagnostic("agent", "Memory could not be superseded safely.", ["refresh memory and review provenance"])
        );
      }
    },

    async retractMemory(command: RetractAgentMemoryInput): Promise<AgentRuntimeResult<AgentMemoryMutationResult>> {
      const projection = buildAgentProjection(await input.ledger.readAll());
      const previous = projection.memoryHistory.get(command.memoryId);
      if (previous === undefined || previous.state !== "active") {
        return failedResult(agentDiagnostic("agent", "Active memory item was not found.", ["refresh memory before retracting"]));
      }
      if (rejectsOperatorPreferenceCorrection(input, previous.memoryKind)) {
        return failedResult(
          agentDiagnostic("agent", "Memory could not be retracted safely.", ["refresh memory and review rationale"])
        );
      }

      try {
        const streamEvents = await input.ledger.readStream(memoryStreamId(command.memoryId));
        const retracted = await appendRuntimeEvent(input.ledger, {
          type: "agent.memory.retracted",
          version: 1,
          streamId: memoryStreamId(command.memoryId),
          context: agentContext(input, `corr_${command.memoryId}`, input.actor, lastValue(previous.eventIds)),
          payload: {
            memoryId: command.memoryId,
            retractedBy: input.actor.id,
            rationale: command.rationale,
            retractedAt: input.now()
          }
        }, { expectedNextSequence: streamEvents.length + 1 });
        return { ok: true, memoryId: command.memoryId, eventIds: Object.freeze([retracted.id]) };
      } catch {
        return failedResult(
          agentDiagnostic("agent", "Memory could not be retracted safely.", ["refresh memory and review rationale"])
        );
      }
    },

    async invokeModel(command: InvokeAgentModelInput): Promise<AgentRuntimeResult<InvokeAgentModelResult>> {
      const projection = buildAgentProjection(await input.ledger.readAll());
      if (!projection.runs.has(command.runId)) {
        return failedResult(agentDiagnostic("agent", "Agent run was not found.", ["start the specialist run before invoking a model"]));
      }
      const promptAudit = auditPromptArtifact(command.promptArtifact);
      const matchedPromptAudit = promptAudit.ok && promptAudit.metadata.inputArtifactHash === command.inputArtifactHash
        ? promptAudit.metadata
        : undefined;

      const requestedEvent: AppendableKnowledgeEvent<"agent.model-invocation.requested"> = {
        type: "agent.model-invocation.requested",
        version: 1,
        streamId: modelInvocationStreamId(command.invocationId),
        context: agentContext(
          input,
          `corr_${command.invocationId}`,
          input.actor,
          lastValue(projection.runs.get(command.runId)?.eventIds ?? [])
        ),
        payload: {
          invocationId: command.invocationId,
          runId: command.runId,
          providerId: command.providerId,
          modelFamily: command.modelFamily,
          inputArtifactHash: command.inputArtifactHash,
          safetyClass: matchedPromptAudit?.safetyClass ?? command.safetyClass ?? "workspace-safe",
          credentialRefId: command.credentialRef.credentialRefId,
          credentialKind: command.credentialRef.kind,
          ...promptAuditPayload(matchedPromptAudit)
        }
      };

      let requested: KnowledgeEventOf<"agent.model-invocation.requested">;
      try {
        requested = await appendRuntimeEvent(input.ledger, requestedEvent, { expectedNextSequence: 1 });
      } catch {
        return failedResult(agentDiagnostic("runtime", "Model invocation request was not safe to record.", ["inspect the safe invocation identifiers"]));
      }

      const provider = providerRegistry.providers.get(command.providerId);
      if (provider === undefined) {
        return await failModelInvocation(input.ledger, input, command, requested, {
          diagnosticCategory: "provider",
          eventCategory: "provider-unavailable",
          message: "Model provider is unavailable.",
          retryable: false,
          allowedActions: ["choose a configured provider"]
        });
      }

      const descriptor = provider.descriptor;
      if (!descriptor.modelFamilies.includes(command.modelFamily)) {
        return await failModelInvocation(input.ledger, input, command, requested, {
          diagnosticCategory: "provider",
          eventCategory: "provider-unavailable",
          message: "Model family is unavailable for this provider.",
          retryable: false,
          allowedActions: ["choose a supported model family"]
        });
      }

      let providerInputText: string | undefined;
      if (requiresPromptArtifactForProvider(descriptor)) {
        if (command.promptArtifact === undefined) {
          return await failModelInvocation(input.ledger, input, command, requested, {
            diagnosticCategory: "runtime",
            eventCategory: "provenance-missing",
            message: "Prompt artifact provenance is missing.",
            retryable: false,
            allowedActions: ["build a prompt artifact for this model invocation"]
          });
        }

        if (!promptAudit.ok) {
          return await failModelInvocation(input.ledger, input, command, requested, {
            diagnosticCategory: "runtime",
            eventCategory: "secret-detected",
            message: "Prompt artifact audit metadata was rejected.",
            retryable: false,
            allowedActions: ["rebuild the prompt artifact from safe context packs"]
          });
        }

        if (promptAudit.metadata.inputArtifactHash !== command.inputArtifactHash) {
          return await failModelInvocation(input.ledger, input, command, requested, {
            diagnosticCategory: "runtime",
            eventCategory: "provenance-missing",
            message: "Prompt artifact hash does not match the invocation input.",
            retryable: false,
            allowedActions: ["rebuild the prompt artifact for the requested input hash"]
          });
        }

        try {
          assertPromptArtifactCanTransferToRemoteProvider(command.promptArtifact);
        } catch {
          return await failModelInvocation(input.ledger, input, command, requested, {
            diagnosticCategory: "policy",
            eventCategory: "permission-denied",
            message: "Prompt artifact is not approved for remote provider transfer.",
            retryable: false,
            allowedActions: ["request provider byte transfer approval for this prompt artifact"]
          });
        }

        providerInputText = command.promptArtifact.text;
      }

      try {
        assertCredentialReferenceIsSafe(command.credentialRef);
      } catch {
        return await failModelInvocation(input.ledger, input, command, requested, {
          diagnosticCategory: "credential",
          eventCategory: "secret-detected",
          message: "Selected auth reference is unsafe.",
          retryable: false,
          allowedActions: ["select a local safe auth reference"]
        });
      }

      if (command.credentialRef.providerId !== command.providerId) {
        return await failModelInvocation(input.ledger, input, command, requested, {
          diagnosticCategory: "credential",
          eventCategory: "credential-missing",
          message: "Selected auth reference does not match the provider.",
          retryable: false,
          allowedActions: ["select a matching local auth reference"]
        });
      }

      if (!descriptor.credentialKinds.includes(command.credentialRef.kind)) {
        return await failModelInvocation(input.ledger, input, command, requested, {
          diagnosticCategory: "credential",
          eventCategory: "credential-missing",
          message: "Selected auth kind is unavailable.",
          retryable: false,
          allowedActions: ["select a supported local auth kind"]
        });
      }

      let providerResult: unknown;
      try {
        const providerRequest = {
          invocationId: command.invocationId,
          runId: command.runId,
          modelFamily: command.modelFamily,
          inputArtifactHash: command.inputArtifactHash,
          credentialRef: command.credentialRef,
          ...optionalValue("inputText", providerInputText)
        };
        providerResult = await provider.adapter.invoke(providerRequest);
      } catch {
        return await failModelInvocation(input.ledger, input, command, requested, {
          diagnosticCategory: "provider",
          eventCategory: "external-effect-failed",
          message: "Provider invocation failed.",
          retryable: true,
          allowedActions: ["inspect provider setup before retrying"]
        });
      }

      let safeProviderResult: ModelInvocationResult | undefined;
      try {
        safeProviderResult = sanitizedModelInvocationResult(providerResult);
      } catch {
        safeProviderResult = undefined;
      }

      if (safeProviderResult === undefined) {
        return await failModelInvocation(input.ledger, input, command, requested, {
          diagnosticCategory: "provider",
          eventCategory: "model-output-invalid",
          message: "Provider returned invalid output.",
          retryable: false,
          allowedActions: ["inspect provider adapter output validation"]
        });
      }
      if (command.returnOutputText === true) {
        try {
          assertAgentSecretSafeText(safeProviderResult.outputText, "provider output text");
        } catch {
          return await failModelInvocation(input.ledger, input, command, requested, {
            diagnosticCategory: "provider",
            eventCategory: "model-output-invalid",
            message: "Provider returned unsafe output.",
            retryable: false,
            allowedActions: ["inspect provider adapter output validation"]
          });
        }
      }
      const usage = safeProviderResult.usage;

      const completedEvent: AppendableKnowledgeEvent<"agent.model-invocation.completed"> = {
        type: "agent.model-invocation.completed",
        version: 1,
        streamId: modelInvocationStreamId(command.invocationId),
        context: agentContext(input, `corr_${command.invocationId}`, input.actor, requested.id),
        payload: {
          invocationId: command.invocationId,
          runId: command.runId,
          providerId: command.providerId,
          outputArtifactHash: safeProviderResult.outputArtifactHash,
          completedAt: input.now(),
          modelFamily: command.modelFamily,
          usage: {
            inputTokens: usage.inputUnits,
            outputTokens: usage.outputUnits,
            totalTokens: usage.inputUnits + usage.outputUnits
          }
        }
      };
      let completed: KnowledgeEventOf<"agent.model-invocation.completed">;
      try {
        completed = await appendRuntimeEvent(input.ledger, completedEvent, { expectedNextSequence: requested.sequence + 1 });
      } catch {
        return await failModelInvocation(input.ledger, input, command, requested, {
          diagnosticCategory: "provider",
          eventCategory: "model-output-invalid",
          message: "Provider output could not be recorded.",
          retryable: false,
          allowedActions: ["inspect provider adapter output validation"]
        });
      }
      return {
        ok: true,
        invocationId: command.invocationId,
        outputArtifactHash: safeProviderResult.outputArtifactHash,
        usage,
        ...(command.returnOutputText === true ? { outputText: safeProviderResult.outputText } : {}),
        eventIds: Object.freeze([requested.id, completed.id])
      };
    },

    scheduler,
    gateway: createAgentToolGateway({ ledger: input.ledger, actor: input.actor, now: input.now })
  };
}

interface RuntimeProviderRecord {
  readonly adapter: ModelProviderAdapter;
  readonly descriptor: ProviderDescriptor;
}

interface RuntimeProviderRegistry {
  readonly providers: ReadonlyMap<string, RuntimeProviderRecord>;
  readonly diagnostics: readonly AgentRuntimeDiagnosticDto[];
}

function currentIdentityLifecycle(
  input: ResidentIdentityLifecycleDto | undefined,
  identity: ReturnType<typeof buildAgentProjection>["identity"]
): ResidentIdentityLifecycleDto {
  if (input !== undefined) {
    return input;
  }
  if (identity === undefined) {
    return notMountedResidentIdentityLifecycle();
  }
  return Object.freeze({
    schemaVersion: "resident-identity-lifecycle.v1",
    state: "ready",
    residentAgentId: "agent_default",
    workspaceId: identity.workspaceId,
    initialized: true,
    eventIds: Object.freeze([...identity.eventIds]),
    safeMessage: "Resident identity is ready.",
    allowedRepairActions: Object.freeze([])
  });
}

function configuredIdentityLifecycle(
  input: CreateAgentRuntimeInput["identityLifecycle"]
): ResidentIdentityLifecycleDto | undefined {
  return typeof input === "function" ? input() : input;
}

function createProviderRegistry(providerAdapters: readonly ModelProviderAdapter[]): RuntimeProviderRegistry {
  const providers = new Map<string, RuntimeProviderRecord>();
  const diagnostics: AgentRuntimeDiagnosticDto[] = [];

  for (const adapter of providerAdapters) {
    let descriptor: ProviderDescriptor;
    try {
      descriptor = freezeProviderDescriptor(providerDescriptorSchema.parse(adapter.describe()));
    } catch {
      diagnostics.push(providerDescriptorRejectedDiagnostic());
      continue;
    }

    if (providers.has(descriptor.providerId)) {
      diagnostics.push(providerDescriptorRejectedDiagnostic());
      continue;
    }

    providers.set(descriptor.providerId, Object.freeze({ adapter, descriptor }));
  }

  return Object.freeze({
    providers,
    diagnostics: Object.freeze(diagnostics)
  });
}

function providerDescriptorRejectedDiagnostic(): AgentRuntimeDiagnosticDto {
  return agentDiagnostic("provider", "Provider descriptor was rejected.", ["inspect provider adapter metadata"]);
}

function freezeProviderDescriptor(descriptor: ProviderDescriptor): ProviderDescriptor {
  return Object.freeze({
    ...descriptor,
    modelFamilies: Object.freeze([...descriptor.modelFamilies]),
    credentialKinds: Object.freeze([...descriptor.credentialKinds])
  }) as ProviderDescriptor;
}

function sanitizedModelInvocationResult(value: unknown): ModelInvocationResult | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const candidate = value as Partial<ModelInvocationResult>;
  const outputArtifactHash = candidate.outputArtifactHash;
  const outputText = candidate.outputText;
  const usage = candidate.usage;

  if (typeof outputArtifactHash !== "string" ||
    !/^sha256:[a-f0-9]{64}$/.test(outputArtifactHash) ||
    typeof outputText !== "string" ||
    typeof usage !== "object" ||
    usage === null ||
    !isNonnegativeInteger(usage.inputUnits) ||
    !isNonnegativeInteger(usage.outputUnits)) {
    return undefined;
  }

  return Object.freeze({
    outputText,
    outputArtifactHash,
    usage: sanitizedModelUsage(usage)
  });
}

function isNonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function sanitizedModelUsage(usage: ModelInvocationResult["usage"]): ModelInvocationResult["usage"] {
  return Object.freeze({
    inputUnits: usage.inputUnits,
    outputUnits: usage.outputUnits
  });
}

type PromptArtifactAuditResult =
  | { readonly ok: true; readonly metadata: PromptArtifactAuditMetadata }
  | { readonly ok: false };

function auditPromptArtifact(promptArtifact: PromptArtifactEnvelope | undefined): PromptArtifactAuditResult {
  if (promptArtifact === undefined) {
    return { ok: false };
  }

  try {
    return { ok: true, metadata: promptArtifactAuditMetadata(promptArtifact) };
  } catch {
    return { ok: false };
  }
}

function promptAuditPayload(metadata: PromptArtifactAuditMetadata | undefined) {
  if (metadata === undefined) {
    return {};
  }

  return {
    contextPackRefs: metadata.contextPackRefs.map((ref) => ({
      contextPackId: ref.contextPackId,
      version: ref.version,
      contentHash: ref.contentHash,
      sizeBytes: ref.sizeBytes,
      generatedAt: ref.generatedAt,
      safeSummary: ref.safeSummary,
      provenanceRefs: [...ref.provenanceRefs],
      ...optionalValue("projectionHighWaterMark", ref.projectionHighWaterMark),
      ...optionalArray("sourceEventIds", ref.sourceEventIds),
      ...optionalArray("artifactHashes", ref.artifactHashes),
      ...optionalValue("policyVersion", ref.policyVersion),
      ...optionalValue("scope", ref.scope === undefined ? undefined : { ...ref.scope }),
      ...optionalValue("sizeBudgetBytes", ref.sizeBudgetBytes),
      ...optionalValue(
        "stalenessInputs",
        ref.stalenessInputs?.map((stalenessInput) => ({ ...stalenessInput }))
      )
    })),
    promptTemplateId: metadata.promptTemplateId,
    promptTemplateVersion: metadata.promptTemplateVersion,
    runType: metadata.runType,
    safePromptSummary: metadata.safeSummary,
    omissions: metadata.omissions.map((omission) => ({ ...omission })),
    transferApprovalClass: metadata.transferApprovalClass
  };
}

function requiresPromptArtifactForProvider(descriptor: ProviderDescriptor): boolean {
  return descriptor.endpointKind !== "local-engine";
}

interface RuntimeModelFailure {
  readonly diagnosticCategory: AgentRuntimeDiagnosticDto["category"];
  readonly eventCategory: AgentFailureCategory;
  readonly message: string;
  readonly retryable: boolean;
  readonly allowedActions: readonly string[];
}

async function failModelInvocation(
  ledger: EventLedger,
  input: CreateAgentRuntimeInput,
  command: InvokeAgentModelInput,
  requested: KnowledgeEventOf<"agent.model-invocation.requested">,
  failure: RuntimeModelFailure
): Promise<AgentRuntimeResult<InvokeAgentModelResult>> {
  const failedEvent: AppendableKnowledgeEvent<"agent.model-invocation.failed"> = {
    type: "agent.model-invocation.failed",
    version: 1,
    streamId: modelInvocationStreamId(command.invocationId),
    context: agentContext(input, `corr_${command.invocationId}`, input.actor, requested.id),
    payload: {
      invocationId: command.invocationId,
      runId: command.runId,
      providerId: command.providerId,
      category: failure.eventCategory,
      message: failure.message,
      retryable: failure.retryable,
      allowedActions: [...failure.allowedActions]
    }
  };
  await appendRuntimeEvent(ledger, failedEvent, { expectedNextSequence: requested.sequence + 1 });
  return failedResult(agentDiagnostic(failure.diagnosticCategory, failure.message, failure.allowedActions));
}

type RuntimeEventType =
  | "agent.identity.initialized"
  | "agent.task.created"
  | "agent.task.status.changed"
  | "agent.specialist-run.started"
  | "agent.memory.recorded"
  | "agent.memory.superseded"
  | "agent.memory.retracted"
  | "agent.model-invocation.requested"
  | "agent.model-invocation.completed"
  | "agent.model-invocation.failed";

async function appendRuntimeEvent<Type extends RuntimeEventType>(
  ledger: EventLedger,
  event: AppendableKnowledgeEvent<Type>,
  options?: AppendOptions
): Promise<KnowledgeEventOf<Type>> {
  return await ledger.append(event, options) as KnowledgeEventOf<Type>;
}

function agentContext(input: CreateAgentRuntimeInput, correlationId: string, actor = input.actor, causationId?: string) {
  return {
    actor,
    occurredAt: input.now(),
    correlationId,
    coreVersion: agentCoreVersion,
    packVersions: agentPackVersions,
    ...optionalValue("causationId", causationId)
  };
}

function agentDiagnostic(
  category: AgentRuntimeDiagnosticDto["category"],
  message: string,
  allowedRepairActions: readonly string[]
): AgentRuntimeDiagnosticDto {
  return Object.freeze({
    severity: "error",
    category,
    message,
    allowedRepairActions: Object.freeze([...allowedRepairActions])
  });
}

function failedResult<T>(error: AgentRuntimeDiagnosticDto): AgentRuntimeResult<T> {
  return { ok: false, error };
}

function isApprovedAgentSpecialistRunType(value: unknown): value is AgentSpecialistRunType {
  return typeof value === "string" && (approvedAgentSpecialistRunTypes as readonly string[]).includes(value);
}

function scopePayload(scope: AgentRunScopeInput): { readonly workspaceId?: string; readonly investigationId?: string } {
  const firstRef = scope.refs[0];
  if (firstRef === undefined) {
    return {};
  }

  if (scope.kind === "workspace") {
    return { workspaceId: firstRef };
  }

  return { investigationId: firstRef };
}

function identityStreamId(residentAgentId: string): string {
  return `agent_identity_${residentAgentId}`;
}

function taskStreamId(taskId: string): string {
  return `agent_task_${taskId}`;
}

function runStreamId(runId: string): string {
  return `agent_run_${runId}`;
}

function modelInvocationStreamId(invocationId: string): string {
  return `agent_model_invocation_${invocationId}`;
}

function memoryStreamId(memoryId: string): string {
  return `agent_memory_${memoryId}`;
}

function memoryRecordedEvent(
  input: CreateAgentRuntimeInput,
  residentAgentId: string,
  command: RecordAgentMemoryInput,
  causationId?: string
): AppendableKnowledgeEvent<"agent.memory.recorded"> {
  return {
    type: "agent.memory.recorded",
    version: 1,
    streamId: memoryStreamId(command.memoryId),
    context: agentContext(input, `corr_${command.memoryId}`, input.actor, causationId),
    payload: {
      memoryId: command.memoryId,
      residentAgentId,
      scope: command.scope,
      ...optionalValue("memoryKind", command.memoryKind),
      summary: command.summary,
      ...optionalArray("sourceEventIds", command.sourceEventIds),
      ...optionalArray("artifactHashes", command.artifactHashes),
      confidence: command.confidence,
      createdAt: input.now(),
      ...optionalValue("expiresAt", command.expiresAt)
    }
  };
}

function rejectsOperatorPreferenceMemory(
  input: CreateAgentRuntimeInput,
  memoryKind: AgentMemoryKind | undefined
): boolean {
  return memoryKind === "operator-preference" && input.actor.kind !== "human";
}

function rejectsOperatorPreferenceCorrection(
  input: CreateAgentRuntimeInput,
  memoryKind: AgentMemoryKind
): boolean {
  return rejectsOperatorPreferenceMemory(input, memoryKind);
}

function memorySupersessionPartialFailureDiagnostic(): AgentRuntimeDiagnosticDto {
  return agentDiagnostic(
    "runtime",
    "Memory supersession was partially applied. The replacement memory requires operator review or retraction.",
    ["inspect memory history", "review the replacement memory", "retract the replacement memory if needed"]
  );
}

async function appendCompensatingMemoryRetraction(
  input: CreateAgentRuntimeInput,
  memoryId: string,
  causationId: string
): Promise<void> {
  const streamEvents = await input.ledger.readStream(memoryStreamId(memoryId));
  await appendRuntimeEvent(input.ledger, {
    type: "agent.memory.retracted",
    version: 1,
    streamId: memoryStreamId(memoryId),
    context: agentContext(input, `corr_${memoryId}`, input.actor, causationId),
    payload: {
      memoryId,
      retractedBy: input.actor.id,
      rationale: "Compensating retraction after incomplete supersession.",
      retractedAt: input.now()
    }
  }, { expectedNextSequence: streamEvents.length + 1 });
}

function optionalValue<Key extends string, Value>(
  key: Key,
  value: Value | undefined
): { readonly [Property in Key]?: Value } {
  return value === undefined ? {} : { [key]: value } as { readonly [Property in Key]?: Value };
}

function optionalArray<Key extends string, Value>(
  key: Key,
  values: readonly Value[] | undefined
): { readonly [Property in Key]?: Value[] } {
  return values === undefined ? {} : { [key]: [...values] } as { readonly [Property in Key]?: Value[] };
}

function lastValue(values: readonly string[]): string | undefined {
  return values.at(-1);
}
