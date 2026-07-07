import type { ActorRef, AppendableKnowledgeEvent, KnowledgeEventOf } from "../../ontology/src/contracts.js";
import type { AppendOptions, EventLedger } from "../../ontology/src/event-ledger.js";
import { buildAgentProjection } from "./projection.js";
import type {
  AgentFailureCategory,
  AgentSpecialistRunType,
  AgentTaskPriority
} from "./projection-types.js";
import type {
  CredentialReference,
  ModelInvocationResult,
  ModelProviderAdapter,
  ProviderDescriptor
} from "./provider.js";
import { assertCredentialReferenceIsSafe, providerDescriptorSchema } from "./provider.js";
import type { AgentRuntimeDiagnosticDto, AgentRuntimeResult, AgentStatusDto } from "./runtime-types.js";
import { createAgentToolGateway } from "./tool-gateway.js";

const agentCoreVersion = "0.1.0";
const agentPackVersions = { core: "0.1.0", agent: "0.1.0" } as const;
const defaultResidentAgentId = "agent_default";
const defaultResidentLabel = "Cestus Agent";
const defaultPolicyId = "agent_policy_default";
const defaultMemoryProjectionVersion = "0.1.0";
const defaultAllowedRunTypes = [
  "ontology-bootstrap",
  "prr-negotiation",
  "evidence-triage",
  "timeline-builder",
  "contradiction-finder",
  "investigation-planner",
  "report-builder"
] as const satisfies readonly AgentSpecialistRunType[];

export interface CreateAgentRuntimeInput {
  readonly ledger: EventLedger;
  readonly actor: ActorRef;
  readonly now: () => string;
  readonly providers?: readonly ModelProviderAdapter[];
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
}

export function createAgentRuntime(input: CreateAgentRuntimeInput) {
  const providerRegistry = createProviderRegistry(input.providers ?? []);

  return {
    async status(): Promise<AgentStatusDto> {
      const projection = buildAgentProjection(await input.ledger.readAll());
      const dto = projection.toDto();
      return Object.freeze({
        schemaVersion: "agent-status.v1",
        generatedAt: input.now(),
        ...dto,
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

    async invokeModel(command: InvokeAgentModelInput): Promise<AgentRuntimeResult<InvokeAgentModelResult>> {
      const projection = buildAgentProjection(await input.ledger.readAll());
      if (!projection.runs.has(command.runId)) {
        return failedResult(agentDiagnostic("agent", "Agent run was not found.", ["start the specialist run before invoking a model"]));
      }

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
          safetyClass: command.safetyClass ?? "workspace-safe",
          credentialRefId: command.credentialRef.credentialRefId,
          credentialKind: command.credentialRef.kind
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

      let providerResult: ModelInvocationResult;
      try {
        providerResult = await provider.adapter.invoke({
          invocationId: command.invocationId,
          runId: command.runId,
          modelFamily: command.modelFamily,
          inputArtifactHash: command.inputArtifactHash,
          credentialRef: command.credentialRef
        });
      } catch {
        return await failModelInvocation(input.ledger, input, command, requested, {
          diagnosticCategory: "provider",
          eventCategory: "external-effect-failed",
          message: "Provider invocation failed.",
          retryable: true,
          allowedActions: ["inspect provider setup before retrying"]
        });
      }

      if (!isValidModelInvocationResult(providerResult)) {
        return await failModelInvocation(input.ledger, input, command, requested, {
          diagnosticCategory: "provider",
          eventCategory: "model-output-invalid",
          message: "Provider returned invalid output.",
          retryable: false,
          allowedActions: ["inspect provider adapter output validation"]
        });
      }

      const completedEvent: AppendableKnowledgeEvent<"agent.model-invocation.completed"> = {
        type: "agent.model-invocation.completed",
        version: 1,
        streamId: modelInvocationStreamId(command.invocationId),
        context: agentContext(input, `corr_${command.invocationId}`, input.actor, requested.id),
        payload: {
          invocationId: command.invocationId,
          runId: command.runId,
          providerId: command.providerId,
          outputArtifactHash: providerResult.outputArtifactHash,
          completedAt: input.now(),
          modelFamily: command.modelFamily,
          usage: {
            inputTokens: providerResult.usage.inputUnits,
            outputTokens: providerResult.usage.outputUnits,
            totalTokens: providerResult.usage.inputUnits + providerResult.usage.outputUnits
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
        outputArtifactHash: providerResult.outputArtifactHash,
        usage: providerResult.usage,
        eventIds: Object.freeze([requested.id, completed.id])
      };
    },

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

function isValidModelInvocationResult(value: unknown): value is ModelInvocationResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<ModelInvocationResult>;
  return typeof candidate.outputArtifactHash === "string" &&
    /^sha256:[a-f0-9]{64}$/.test(candidate.outputArtifactHash) &&
    typeof candidate.outputText === "string" &&
    typeof candidate.usage === "object" &&
    candidate.usage !== null &&
    isNonnegativeInteger(candidate.usage.inputUnits) &&
    isNonnegativeInteger(candidate.usage.outputUnits);
}

function isNonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
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
