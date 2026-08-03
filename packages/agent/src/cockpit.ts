import { z } from "zod";
import type { AgentApprovalCockpitDto } from "./approval-cockpit.js";
import { providerReadinessDtoSchema, type ProviderReadinessDto } from "./provider-readiness.js";
import { assertAgentSecretSafeText } from "./secret-safety.js";
import type { AgentStatusDto } from "./runtime-types.js";
import type { WakeStatusDto } from "./wake-supervisor.js";
import {
  agentSpecialistWorkflowReadinessDtoSchema,
  parseSpecialistWorkflowReadinessDto,
  projectSpecialistWorkflowReadiness,
  type SpecialistWorkflowReadinessDto
} from "./specialist-readiness.js";
import {
  specialistWorkflowDescriptors,
  specialistWorkflowRegistrySnapshot,
  type SpecialistWorkflowRegistrySnapshot
} from "./specialist-workflows.js";
import type { AgentDomainToolFamily } from "./domain-execution-descriptors.js";
import {
  parseSpecialistWorkflowHandoff,
  specialistWorkflowHandoffSchema,
  type SpecialistWorkflowHandoffDto
} from "./specialist-handoffs.js";

const schemaVersion = "agent-cockpit.v1" as const;

const terminalTaskStatuses = new Set(["completed", "failed", "canceled"]);
const forbiddenDirectEffects = [
  "provider-byte-transfer",
  "prr-send-followup",
  "export-publication",
  "destructive-repair",
  "legal-escalation",
  "lock-clearing",
  "accepted-graph-review",
  "legacy-raw-import",
  "legacy-staging-execution"
] as const;
function secretSafeStringSchema(label: string) {
  return z.string().min(1).superRefine((value, ctx) => {
    try {
      assertAgentSecretSafeText(value, label);
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : `${label} must be secret-safe`
      });
    }
  });
}

function secretSafeIdentifierSchema(label: string, pattern?: RegExp) {
  const baseSchema = secretSafeStringSchema(label);
  return pattern === undefined
    ? baseSchema
    : baseSchema.regex(pattern, { message: `${label} has an invalid format` });
}

const taskIdSchema = secretSafeIdentifierSchema("taskId", /^task_[a-zA-Z0-9_-]+$/);
const runIdSchema = secretSafeIdentifierSchema("runId", /^run_[a-zA-Z0-9_-]+$/);
const toolRequestIdSchema = secretSafeIdentifierSchema("toolRequestId", /^toolreq_[a-zA-Z0-9_-]+$/);
const lockIdSchema = secretSafeIdentifierSchema("lockId", /^lock_[a-zA-Z0-9_-]+$/);
const providerIdSchema = secretSafeIdentifierSchema("providerId", /^provider_[a-zA-Z0-9_-]+$/);
const invocationIdSchema = secretSafeIdentifierSchema("invocationId", /^inv_[a-zA-Z0-9_-]+$/);
const eventIdSchema = secretSafeIdentifierSchema("eventId", /^evt_[a-zA-Z0-9_-]+$/);
const memoryIdSchema = secretSafeIdentifierSchema("memoryId", /^mem_[a-zA-Z0-9_-]+$/);
const contentHashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const safeActionSchema = secretSafeIdentifierSchema("safeAction", /^[a-z][a-z-]*$/);

function addSchemaIssues(ctx: z.RefinementCtx, error: z.ZodError): void {
  for (const issue of error.issues) {
    ctx.addIssue({
      code: "custom",
      path: issue.path,
      message: issue.message
    });
  }
}

export const agentCockpitNeedDtoSchema = z.object({
  kind: z.enum([
    "approval",
    "lock",
    "retry",
    "queued-task",
    "handoff",
    "provider-readiness",
    "quiet"
  ]),
  severity: z.enum(["action-required", "warning", "info"]),
  label: secretSafeStringSchema("need label"),
  relatedTaskId: taskIdSchema.optional(),
  relatedRunId: runIdSchema.optional(),
  relatedToolRequestId: toolRequestIdSchema.optional(),
  relatedLockId: lockIdSchema.optional(),
  relatedProviderId: providerIdSchema.optional(),
  safeAction: safeActionSchema
}).strict();

export const agentCockpitTaskCardDtoSchema = z.object({
  taskId: taskIdSchema,
  title: secretSafeStringSchema("task title"),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  status: z.enum([
    "queued",
    "running",
    "waiting-for-approval",
    "blocked",
    "completed",
    "failed",
    "canceled"
  ]),
  createdAt: z.string().datetime(),
  runId: runIdSchema.optional(),
  statusReason: secretSafeStringSchema("task status reason").optional()
}).strict();

export const agentCockpitModelAuditDtoSchema = z.object({
  invocationId: invocationIdSchema,
  providerId: providerIdSchema,
  modelFamily: secretSafeStringSchema("model family"),
  status: z.enum(["requested", "completed", "failed"]),
  inputArtifactHash: contentHashSchema,
  outputArtifactHash: contentHashSchema.optional(),
  omissionCount: z.number().int().nonnegative(),
  usageSummary: secretSafeStringSchema("usage summary").optional(),
  failureCategory: secretSafeStringSchema("failure category").optional(),
  retryable: z.boolean().optional()
}).strict();

export const agentCockpitContextPackDtoSchema = z.object({
  contextPackId: secretSafeStringSchema("context pack id"),
  contentHash: contentHashSchema,
  safeSummary: secretSafeStringSchema("context pack safe summary"),
  generatedAt: z.string().datetime(),
  provenanceRefs: z.array(secretSafeStringSchema("context pack provenance ref")).min(1),
  stalenessInputCount: z.number().int().nonnegative(),
  sourceEventIds: z.array(eventIdSchema).optional(),
  artifactHashes: z.array(contentHashSchema).optional()
}).strict();

export const agentCockpitHandoffDtoSchema = specialistWorkflowHandoffSchema;

const specialistWorkflowRegistrySnapshotObjectSchema = z.object({
  schemaVersion: z.literal("agent-specialist-workflow-registry.v1"),
  descriptors: z.array(z.object({
    runType: z.enum([
      "prr-negotiation",
      "evidence-triage",
      "timeline-builder",
      "contradiction-finder",
      "investigation-planner",
      "report-builder"
    ]),
    residentIdentity: z.literal("agent_default"),
    label: secretSafeStringSchema("specialist label"),
    purpose: secretSafeStringSchema("specialist purpose"),
    executionEnabled: z.literal(false),
    prerequisiteContractIds: z.array(secretSafeStringSchema("specialist prerequisite contract id")),
    contextPacks: z.array(z.object({
      contextPackId: secretSafeStringSchema("specialist context pack id"),
      requirementMode: z.enum(["always", "when-scope-associated-prr"]),
      omissionWhenNotApplicable: z.literal("no-associated-prr").optional(),
      purpose: secretSafeStringSchema("specialist context pack purpose")
    }).strict()),
    promptTemplate: z.object({
      promptTemplateId: secretSafeStringSchema("specialist prompt template id"),
      promptTemplateVersion: z.number().int().positive(),
      outputSchemaId: secretSafeStringSchema("specialist output schema id"),
      providerOutputSchemaId: secretSafeStringSchema("specialist provider output schema id"),
      providerOutputSchemaVersion: z.number().int().positive(),
      handoffSchemaId: secretSafeStringSchema("specialist prompt handoff schema id"),
      handoffSchemaVersion: z.number().int().positive(),
      safetyClass: z.enum(["workspace-safe", "public-safe", "sensitive-local-only", "provider-approved"]),
      transferApprovalClass: z.enum(["none", "provider-byte-transfer"])
    }).strict(),
    allowedTools: z.array(z.object({
      toolId: secretSafeStringSchema("specialist tool id"),
      domainOwner: secretSafeStringSchema("specialist tool domain owner"),
      sideEffectClass: secretSafeStringSchema("specialist side effect class"),
      requiredApprovalClass: secretSafeStringSchema("specialist required approval class"),
      purpose: secretSafeStringSchema("specialist tool purpose")
    }).strict()),
    approvalRequirements: z.array(z.object({
      approvalClass: secretSafeStringSchema("specialist approval class"),
      requiredWhen: secretSafeStringSchema("specialist approval requiredWhen")
    }).strict()),
    outputArtifacts: z.array(z.object({
      artifactKind: secretSafeStringSchema("specialist output artifact kind"),
      schemaId: secretSafeStringSchema("specialist output schema id"),
      purpose: secretSafeStringSchema("specialist output purpose")
    }).strict()),
    handoffSchemaId: secretSafeStringSchema("specialist handoff schema id"),
    failureModes: z.array(secretSafeStringSchema("specialist failure mode"))
  }).strict())
}).strict();

const specialistWorkflowRegistrySnapshotSchema = z.unknown()
  .transform((value, ctx): SpecialistWorkflowRegistrySnapshot => {
    const result = specialistWorkflowRegistrySnapshotObjectSchema.safeParse(value);
    if (!result.success) {
      addSchemaIssues(ctx, result.error);
      return z.NEVER;
    }

    return result.data as SpecialistWorkflowRegistrySnapshot;
  });

const agentCockpitSpecialistReadinessDtoSchema = z.unknown()
  .transform((value, ctx): SpecialistWorkflowReadinessDto => {
    const result = agentSpecialistWorkflowReadinessDtoSchema.safeParse(value);
    if (!result.success) {
      addSchemaIssues(ctx, result.error);
      return z.NEVER;
    }

    return result.data as SpecialistWorkflowReadinessDto;
  });

export const agentCockpitSpecialistsDtoSchema = z.object({
  registry: specialistWorkflowRegistrySnapshotSchema,
  readiness: z.array(agentCockpitSpecialistReadinessDtoSchema)
}).strict();

export const agentCockpitRunCardDtoSchema = z.object({
  runId: runIdSchema,
  taskId: taskIdSchema.optional(),
  runType: z.enum([
    "ontology-bootstrap",
    "prr-negotiation",
    "evidence-triage",
    "timeline-builder",
    "contradiction-finder",
    "investigation-planner",
    "report-builder"
  ]),
  state: z.enum(["running", "completed", "failed"]),
  startedAt: z.string().datetime(),
  summary: secretSafeStringSchema("run summary").optional(),
  currentStepCount: z.number().int().nonnegative(),
  modelInvocationCount: z.number().int().nonnegative(),
  pendingApprovalCount: z.number().int().nonnegative(),
  blockedReasonCount: z.number().int().nonnegative()
}).strict();

export const agentCockpitResidentPlanDtoSchema = z.object({
  eventId: eventIdSchema,
  runId: runIdSchema,
  taskId: taskIdSchema,
  attemptId: secretSafeIdentifierSchema("resident attemptId", /^attempt_[a-f0-9]{64}$/),
  planId: secretSafeIdentifierSchema("resident planId", /^plan_[a-zA-Z0-9_-]+$/),
  planRevision: z.number().int().nonnegative(),
  recordedAt: z.string().datetime(),
  steps: z.array(z.object({
    ordinal: z.number().int().positive(),
    purpose: secretSafeStringSchema("resident plan step purpose"),
    toolId: secretSafeStringSchema("resident plan step toolId"),
    expectedSafeOutputClass: z.enum(["observation", "derivative", "proposal", "approval-request"])
  }).strict()).min(1)
}).strict();

export const agentCockpitResidentObservationDtoSchema = z.object({
  eventId: eventIdSchema,
  runId: runIdSchema,
  taskId: taskIdSchema,
  attemptId: secretSafeIdentifierSchema("resident observation attemptId", /^attempt_[a-f0-9]{64}$/),
  observationId: secretSafeIdentifierSchema("resident observationId", /^observation_[a-zA-Z0-9_-]+$/),
  planId: secretSafeIdentifierSchema("resident observation planId", /^plan_[a-zA-Z0-9_-]+$/),
  planRevision: z.number().int().nonnegative(),
  stepOrdinal: z.number().int().positive(),
  kind: z.enum(["context-verified", "tool-result", "provider-result", "budget", "approval", "recovery", "failure"]),
  safeSummary: secretSafeStringSchema("resident observation summary"),
  artifactHashes: z.array(contentHashSchema),
  toolRequestId: toolRequestIdSchema.optional(),
  modelInvocationEventId: eventIdSchema.optional(),
  recordedAt: z.string().datetime()
}).strict();

export const agentCockpitSelectedRunDtoSchema = agentCockpitRunCardDtoSchema.extend({
  stepIds: z.array(secretSafeStringSchema("stepId")),
  pendingApprovalIds: z.array(toolRequestIdSchema),
  blockedReasons: z.array(secretSafeStringSchema("blocked reason")),
  modelInvocations: z.array(agentCockpitModelAuditDtoSchema),
  contextPacks: z.array(agentCockpitContextPackDtoSchema),
  planHistory: z.array(agentCockpitResidentPlanDtoSchema).default([]),
  observationHistory: z.array(agentCockpitResidentObservationDtoSchema).default([]),
  handoff: agentCockpitHandoffDtoSchema.optional()
}).strict();

export const agentCockpitMemorySnippetDtoSchema = z.object({
  memoryId: memoryIdSchema,
  scope: z.enum(["workspace", "investigation", "task", "provider", "policy"]),
  summary: secretSafeStringSchema("memory summary"),
  createdAt: z.string().datetime(),
  sourceEventIds: z.array(eventIdSchema),
  artifactHashes: z.array(contentHashSchema),
  confidence: z.number().min(0).max(1)
}).strict();

export const agentSupervisionControlDtoSchema = z.object({
  action: z.enum(["pause", "resume", "retry", "cancel"]),
  label: secretSafeStringSchema("supervision control label"),
  enabled: z.boolean(),
  taskId: taskIdSchema.optional()
}).strict().superRefine((control, ctx) => {
  const taskScoped = control.action === "retry" || control.action === "cancel";
  if (taskScoped !== (control.taskId !== undefined)) {
    ctx.addIssue({
      code: "custom",
      path: ["taskId"],
      message: taskScoped
        ? "task-scoped supervision controls require taskId"
        : "supervisor controls must not carry taskId"
    });
  }
});

export const agentSupervisionDiagnosticDtoSchema = z.object({
  category: secretSafeIdentifierSchema("supervision diagnostic category", /^[a-z][a-z-]*$/),
  safeMessage: secretSafeStringSchema("supervision diagnostic message"),
  allowedRepairActions: z.array(secretSafeStringSchema("supervision repair action"))
}).strict();

export const agentSupervisionCockpitDtoSchema = z.object({
  schemaVersion: z.literal("agent-supervision-cockpit.v1"),
  observedAt: z.string().datetime(),
  supervisorState: z.enum([
    "initializing",
    "running",
    "pause-pending",
    "paused",
    "recovering",
    "workspace-unavailable",
    "degraded",
    "unrecoverable"
  ]),
  workspaceState: z.enum([
    "verifying",
    "available",
    "unavailable",
    "identity-mismatch",
    "stale",
    "lock-blocked",
    "unrecoverable"
  ]),
  workspaceId: secretSafeIdentifierSchema("supervision workspaceId", /^ws_[a-zA-Z0-9_-]+$/).optional(),
  nextWakeAt: z.string().datetime().optional(),
  safeMessage: secretSafeStringSchema("supervision safe message"),
  activeCycle: z.boolean(),
  provenanceEventIds: z.array(eventIdSchema),
  diagnostics: z.array(agentSupervisionDiagnosticDtoSchema),
  controls: z.array(agentSupervisionControlDtoSchema)
}).strict();

export const agentCockpitDtoSchema = z.object({
  schemaVersion: z.literal(schemaVersion),
  generatedAt: z.string().datetime(),
  summary: z.object({
    activeTaskCount: z.number().int().nonnegative(),
    activeRunCount: z.number().int().nonnegative(),
    pendingApprovalCount: z.number().int().nonnegative(),
    activeLockCount: z.number().int().nonnegative(),
    mergeAfterScheduler: z.boolean()
  }).strict(),
  taskQueue: z.array(agentCockpitTaskCardDtoSchema),
  runQueue: z.array(agentCockpitRunCardDtoSchema),
  selectedRun: agentCockpitSelectedRunDtoSchema.optional(),
  needsNext: z.array(agentCockpitNeedDtoSchema),
  memorySnippets: z.array(agentCockpitMemorySnippetDtoSchema),
  supervision: agentSupervisionCockpitDtoSchema.optional(),
  specialists: agentCockpitSpecialistsDtoSchema,
  forbiddenDirectEffects: z.array(secretSafeStringSchema("forbidden direct effect")),
  providerReadiness: providerReadinessDtoSchema.optional()
}).strict();

export type AgentCockpitNeedDto = z.infer<typeof agentCockpitNeedDtoSchema>;
export type AgentCockpitTaskCardDto = z.infer<typeof agentCockpitTaskCardDtoSchema>;
export type AgentCockpitModelAuditDto = z.infer<typeof agentCockpitModelAuditDtoSchema>;
export type AgentCockpitContextPackDto = z.infer<typeof agentCockpitContextPackDtoSchema>;
export type AgentCockpitHandoffDto = z.infer<typeof agentCockpitHandoffDtoSchema>;
export type AgentCockpitRunCardDto = z.infer<typeof agentCockpitRunCardDtoSchema>;
export type AgentCockpitResidentPlanDto = z.infer<typeof agentCockpitResidentPlanDtoSchema>;
export type AgentCockpitResidentObservationDto = z.infer<typeof agentCockpitResidentObservationDtoSchema>;
export type AgentCockpitSelectedRunDto = z.infer<typeof agentCockpitSelectedRunDtoSchema>;
export type AgentCockpitMemorySnippetDto = z.infer<typeof agentCockpitMemorySnippetDtoSchema>;
export type AgentSupervisionControlDto = z.infer<typeof agentSupervisionControlDtoSchema>;
export type AgentSupervisionCockpitDto = z.infer<typeof agentSupervisionCockpitDtoSchema>;
export type AgentCockpitSpecialistsDto = z.infer<typeof agentCockpitSpecialistsDtoSchema>;
export type AgentCockpitDto = z.infer<typeof agentCockpitDtoSchema>;

export interface BuildAgentCockpitInput {
  readonly status: AgentStatusDto;
  readonly approvalCockpit?: AgentApprovalCockpitDto;
  readonly selectedRunId?: string;
  readonly generatedAt?: string;
  readonly mergeAfterScheduler?: boolean;
  readonly specialistReadiness?: readonly SpecialistWorkflowReadinessDto[];
  readonly specialistHandoffs?: readonly SpecialistWorkflowHandoffDto[];
  readonly residentPlans?: readonly AgentCockpitResidentPlanDto[];
  readonly residentObservations?: readonly AgentCockpitResidentObservationDto[];
  readonly availableSpecialistContracts?: readonly string[];
  readonly availableDomainAdapterFamilies?: readonly AgentDomainToolFamily[];
  readonly supervision?: AgentSupervisionCockpitDto | undefined;
}

export function buildAgentCockpit(input: BuildAgentCockpitInput): AgentCockpitDto {
  const generatedAt = input.generatedAt ?? input.status.generatedAt;
  assertAgentSecretSafeText(generatedAt, "cockpit generatedAt");

  const modelInvocations = input.status.modelInvocations ?? [];
  const toolRequests = input.status.toolRequests;
  const activeLocks = input.status.locks.filter((lock) => lock.state === "active");
  const specialistHandoffs = (input.specialistHandoffs ?? []).map(parseSpecialistWorkflowHandoff);
  const specialists = projectSpecialists({
    generatedAt,
    providerReadiness: input.status.providerReadiness,
    activeLocks,
    suppliedReadiness: input.specialistReadiness ?? [],
    availableContracts: input.availableSpecialistContracts ?? [],
    availableDomainAdapterFamilies: input.availableDomainAdapterFamilies ?? []
  });
  const taskCards = [...input.status.tasks]
    .sort(compareTasks)
    .map((task) => ({
      taskId: task.taskId,
      title: task.title,
      priority: task.priority,
      status: task.status,
      createdAt: task.createdAt,
      ...(task.runId === undefined ? {} : { runId: task.runId }),
      ...(task.statusReason === undefined ? {} : { statusReason: task.statusReason })
    })) satisfies AgentCockpitTaskCardDto[];
  const runCards = (
    [...input.status.runs]
      .sort(compareRuns)
      .map((run) => projectRunCard(run, input.status.tasks, modelInvocations, toolRequests, activeLocks))
  ) satisfies AgentCockpitRunCardDto[];

  const selectedRunRecord = selectRun(input.status, input.selectedRunId);
  const selectedRun = selectedRunRecord === undefined
    ? undefined
    : projectSelectedRun(
        selectedRunRecord,
        input.status.tasks,
        modelInvocations,
        toolRequests,
        activeLocks,
        specialistHandoffs,
        input.residentPlans ?? [],
        input.residentObservations ?? []
      );

  const needsNext = deriveNeedsNext({
    status: input.status,
    approvalCockpit: input.approvalCockpit,
    taskCards,
    selectedRun,
    specialistHandoffs
  });

  const dto = agentCockpitDtoSchema.parse({
    schemaVersion,
    generatedAt,
    summary: {
      activeTaskCount: input.status.tasks.filter((task) => !terminalTaskStatuses.has(task.status)).length,
      activeRunCount: input.status.runs.filter((run) => run.state === "running").length,
      pendingApprovalCount: Math.max(
        input.approvalCockpit?.summary.pendingCount ?? 0,
        input.status.pendingApprovalCount,
        toolRequests.filter((request) => request.requiredApprovalClass !== "none" && request.state === "requested").length
      ),
      activeLockCount: activeLocks.length,
      mergeAfterScheduler: input.mergeAfterScheduler ?? false
    },
    taskQueue: taskCards,
    runQueue: runCards,
    ...(selectedRun === undefined ? {} : { selectedRun }),
    needsNext,
    memorySnippets: input.status.activeMemory
      .filter((memory) => memory.state === "active")
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map((memory) => ({
        memoryId: memory.memoryId,
        scope: memory.scope,
        summary: memory.summary,
        createdAt: memory.createdAt,
        sourceEventIds: [...memory.sourceEventIds],
        artifactHashes: [...memory.artifactHashes],
        confidence: memory.confidence
      })),
    ...(input.supervision === undefined ? {} : { supervision: input.supervision }),
    specialists,
    forbiddenDirectEffects: [...forbiddenDirectEffects],
    ...(input.status.providerReadiness === undefined ? {} : { providerReadiness: input.status.providerReadiness })
  });

  return deepFreeze(dto);
}

export interface BuildAgentSupervisionCockpitInput {
  readonly status: AgentStatusDto;
  readonly observedAt: string;
  readonly wakeStatus?: WakeStatusDto | undefined;
  readonly supervisorState?: AgentSupervisionCockpitDto["supervisorState"] | undefined;
  readonly workspaceState?: AgentSupervisionCockpitDto["workspaceState"] | undefined;
  readonly workspaceId?: string | undefined;
  readonly nextWakeAt?: string | undefined;
  readonly safeMessage?: string | undefined;
  readonly activeCycle?: boolean | undefined;
  readonly provenanceEventIds?: readonly string[] | undefined;
  readonly retryableTaskIds?: readonly string[] | undefined;
  readonly diagnostics?: AgentSupervisionCockpitDto["diagnostics"] | undefined;
}

export function buildAgentSupervisionCockpit(
  input: BuildAgentSupervisionCockpitInput
): AgentSupervisionCockpitDto {
  const workspaceState = input.workspaceState ?? input.wakeStatus?.workspaceState ?? "unavailable";
  const supervisorState = input.supervisorState ?? input.wakeStatus?.supervisorState ?? "workspace-unavailable";
  const workspaceId = input.workspaceId ?? input.wakeStatus?.workspaceId ?? input.status.identity?.workspaceId;
  const taskControls: AgentSupervisionControlDto[] = [];
  const retryableTaskIds = new Set(input.retryableTaskIds ?? []);
  const runsById = new Map(input.status.runs.map((run) => [run.runId, run]));
  for (const task of input.status.tasks) {
    const run = task.runId === undefined ? undefined : runsById.get(task.runId);
    const retryEnabled = workspaceState === "available" &&
      (task.status === "failed" || task.status === "blocked") &&
      (run?.retryable === true || retryableTaskIds.has(task.taskId));
    if (task.status === "failed" || task.status === "blocked") {
      taskControls.push({
        action: "retry",
        label: "Retry task",
        enabled: retryEnabled,
        taskId: task.taskId
      });
    }
    if (
      task.status === "queued" ||
      task.status === "running" ||
      task.status === "waiting-for-approval" ||
      task.status === "blocked"
    ) {
      taskControls.push({
        action: "cancel",
        label: "Cancel task",
        enabled: workspaceState === "available",
        taskId: task.taskId
      });
    }
  }
  const wakeDiagnostics = input.wakeStatus?.diagnostics.map((diagnostic) => ({
    category: diagnostic.category,
    safeMessage: supervisionDiagnosticMessage(diagnostic.category),
    allowedRepairActions: [...diagnostic.allowedCommandIds]
  })) ?? [];
  const supervision = agentSupervisionCockpitDtoSchema.parse({
    schemaVersion: "agent-supervision-cockpit.v1",
    observedAt: input.observedAt,
    supervisorState,
    workspaceState,
    ...(workspaceId === undefined ? {} : { workspaceId }),
    ...(input.nextWakeAt === undefined || supervisorState !== "running" || workspaceState !== "available"
      ? {}
      : { nextWakeAt: input.nextWakeAt }),
    safeMessage: input.safeMessage ?? supervisionSafeMessage(supervisorState, workspaceState),
    activeCycle: input.activeCycle ?? input.wakeStatus?.activeCycle ?? false,
    provenanceEventIds: input.provenanceEventIds ??
      input.wakeStatus?.lifecycleEvidence.map((evidence) => evidence.lifecycleEventId) ?? [],
    diagnostics: input.diagnostics ?? wakeDiagnostics,
    controls: [
      {
        action: "pause",
        label: "Pause resident work",
        enabled: workspaceState === "available" && supervisorState === "running"
      },
      {
        action: "resume",
        label: "Resume resident work",
        enabled: workspaceState === "available" && (
          supervisorState === "paused" ||
          supervisorState === "workspace-unavailable" ||
          supervisorState === "degraded"
        )
      },
      ...taskControls
    ]
  });
  return deepFreeze(supervision);
}

function supervisionSafeMessage(
  supervisorState: AgentSupervisionCockpitDto["supervisorState"],
  workspaceState: AgentSupervisionCockpitDto["workspaceState"]
): string {
  if (workspaceState === "identity-mismatch") return "A different portable workspace identity is connected; resident work remains blocked.";
  if (workspaceState !== "available") return "The portable workspace is unavailable; resident work and writes remain stopped.";
  if (supervisorState === "paused") return "Resident work is paused by the supervised local runtime.";
  if (supervisorState === "running") return "Resident work is supervised by the local runtime.";
  return "Resident supervision requires inspection before more work can start.";
}

function supervisionDiagnosticMessage(category: string): string {
  if (category === "workspace-identity-mismatch") return "The connected portable workspace identity does not match the admitted workspace.";
  if (category === "workspace-unavailable") return "The portable workspace is unavailable.";
  if (category === "active-lock") return "An active workspace lock blocks resident work.";
  if (category === "supervisor-lease-held") return "Another admitted local supervisor currently owns the resident wake lease.";
  return "Resident supervision requires a safe retry or inspection.";
}

function projectRunCard(
  run: AgentStatusDto["runs"][number],
  tasks: AgentStatusDto["tasks"],
  modelInvocations: readonly NonNullable<AgentStatusDto["modelInvocations"]>[number][],
  toolRequests: AgentStatusDto["toolRequests"],
  activeLocks: readonly AgentStatusDto["locks"][number][]
): AgentCockpitRunCardDto {
  const runToolRequests = toolRequestsForRun(run, toolRequests);
  const blockedReasons = blockedReasonsForRun(run, taskForRun(run, tasks), runToolRequests, activeLocks);

  return {
    runId: run.runId,
    ...(run.taskId === undefined ? {} : { taskId: run.taskId }),
    runType: run.runType,
    state: run.state,
    startedAt: run.startedAt,
    ...(run.summary === undefined ? {} : { summary: run.summary }),
    currentStepCount: run.stepIds.length,
    modelInvocationCount: modelInvocationsForRun(run, modelInvocations).length,
    pendingApprovalCount: runToolRequests.filter(isPendingApprovalRequest).length,
    blockedReasonCount: blockedReasons.length
  };
}

function projectSelectedRun(
  run: AgentStatusDto["runs"][number],
  tasks: AgentStatusDto["tasks"],
  modelInvocations: readonly NonNullable<AgentStatusDto["modelInvocations"]>[number][],
  toolRequests: AgentStatusDto["toolRequests"],
  activeLocks: readonly AgentStatusDto["locks"][number][],
  specialistHandoffs: readonly SpecialistWorkflowHandoffDto[],
  residentPlans: readonly AgentCockpitResidentPlanDto[],
  residentObservations: readonly AgentCockpitResidentObservationDto[]
): AgentCockpitSelectedRunDto {
  const runInvocations = modelInvocationsForRun(run, modelInvocations);
  const runToolRequests = toolRequestsForRun(run, toolRequests);
  const blockedReasons = blockedReasonsForRun(run, taskForRun(run, tasks), runToolRequests, activeLocks);
  const contextPacks = uniqueContextPacks(runInvocations);
  const handoff = handoffForRun(run, specialistHandoffs);

  return {
    ...projectRunCard(run, tasks, modelInvocations, toolRequests, activeLocks),
    stepIds: [...run.stepIds],
    pendingApprovalIds: runToolRequests.filter(isPendingApprovalRequest).map((request) => request.toolRequestId),
    blockedReasons,
    modelInvocations: [...runInvocations]
      .sort((left, right) => left.requestedAt.localeCompare(right.requestedAt))
      .map((invocation) => ({
        invocationId: invocation.invocationId,
        providerId: invocation.providerId,
        modelFamily: invocation.modelFamily,
        status: invocation.status,
        inputArtifactHash: invocation.inputArtifactHash,
        omissionCount: invocation.omissions.length,
        ...(invocation.providerOutputArtifactHash === undefined
          ? {}
          : { outputArtifactHash: invocation.providerOutputArtifactHash }),
        ...(formatUsageSummary(invocation.usage) === undefined
          ? {}
          : { usageSummary: formatUsageSummary(invocation.usage) }),
        ...(invocation.failureCategory === undefined ? {} : { failureCategory: invocation.failureCategory }),
        ...(invocation.retryable === undefined ? {} : { retryable: invocation.retryable })
      })),
    contextPacks,
    planHistory: residentPlans
      .filter((plan) => plan.runId === run.runId && plan.taskId === run.taskId)
      .toSorted((left, right) => left.planRevision - right.planRevision || left.recordedAt.localeCompare(right.recordedAt)),
    observationHistory: residentObservations
      .filter((observation) => observation.runId === run.runId && observation.taskId === run.taskId)
      .toSorted((left, right) => left.recordedAt.localeCompare(right.recordedAt) || left.stepOrdinal - right.stepOrdinal),
    ...(handoff === undefined ? {} : { handoff })
  };
}

function uniqueContextPacks(
  modelInvocations: readonly NonNullable<AgentStatusDto["modelInvocations"]>[number][]
): AgentCockpitContextPackDto[] {
  const packsByKey = new Map<string, AgentCockpitContextPackDto>();
  for (const invocation of modelInvocations) {
    for (const contextPackRef of invocation.contextPackRefs) {
      const key = `${contextPackRef.contextPackId}:${contextPackRef.contentHash}`;
      if (!packsByKey.has(key)) {
        packsByKey.set(key, {
          contextPackId: contextPackRef.contextPackId,
          contentHash: contextPackRef.contentHash,
          safeSummary: contextPackRef.safeSummary,
          generatedAt: contextPackRef.generatedAt,
          provenanceRefs: [...contextPackRef.provenanceRefs],
          stalenessInputCount: contextPackRef.stalenessInputs?.length ?? 0,
          ...(contextPackRef.sourceEventIds === undefined ? {} : { sourceEventIds: [...contextPackRef.sourceEventIds] }),
          ...(contextPackRef.artifactHashes === undefined ? {} : { artifactHashes: [...contextPackRef.artifactHashes] })
        });
      } else {
        const existing = packsByKey.get(key)!;
        packsByKey.set(key, {
          ...existing,
          stalenessInputCount: Math.max(
            existing.stalenessInputCount,
            contextPackRef.stalenessInputs?.length ?? 0
          )
        });
      }
    }
  }

  return [...packsByKey.values()].sort((left, right) => left.generatedAt.localeCompare(right.generatedAt));
}

function handoffForRun(
  run: AgentStatusDto["runs"][number],
  specialistHandoffs: readonly SpecialistWorkflowHandoffDto[]
): AgentCockpitHandoffDto | undefined {
  return specialistHandoffs.find((handoff) =>
    handoff.runId === run.runId &&
    handoff.runType === run.runType &&
    handoff.taskId === run.taskId
  );
}

function deriveNeedsNext(input: {
  readonly status: AgentStatusDto;
  readonly approvalCockpit: AgentApprovalCockpitDto | undefined;
  readonly taskCards: readonly AgentCockpitTaskCardDto[];
  readonly selectedRun: AgentCockpitSelectedRunDto | undefined;
  readonly specialistHandoffs: readonly SpecialistWorkflowHandoffDto[];
}): AgentCockpitNeedDto[] {
  const needs: AgentCockpitNeedDto[] = [];
  if (
    input.status.identityLifecycle.state === "blocked" ||
    input.status.identityLifecycle.state === "not-mounted"
  ) {
    needs.push({
      kind: "lock",
      severity: "action-required",
      label: input.status.identityLifecycle.safeMessage,
      safeAction: "refresh-status"
    });
  }
  const approvalNeed = approvalNeedFromCockpit(input.approvalCockpit);
  if (approvalNeed !== undefined) {
    needs.push(approvalNeed);
  } else {
    const pendingToolRequest = input.status.toolRequests.find(isPendingApprovalRequest);
    if (pendingToolRequest !== undefined) {
      const relatedTaskId = input.status.runs.find((run) => run.runId === pendingToolRequest.runId)?.taskId;
      needs.push({
        kind: "approval",
        severity: "action-required",
        label: `Review ${approvalLabelFor(normalizeApprovalClass(pendingToolRequest.requiredApprovalClass))} approval`,
        ...(relatedTaskId === undefined ? {} : { relatedTaskId }),
        relatedRunId: pendingToolRequest.runId,
        relatedToolRequestId: pendingToolRequest.toolRequestId,
        safeAction: "review-approval"
      });
    }
  }

  const activeLock = input.status.locks.find((lock) => lock.state === "active");
  if (activeLock !== undefined) {
    needs.push({
      kind: "lock",
      severity: "warning",
      label: `Review ${activeLock.kind} lock`,
      relatedLockId: activeLock.lockId,
      safeAction: "review-lock"
    });
  }

  const retryNeed = retryNeedFromStatus(input.status);
  if (retryNeed !== undefined) {
    needs.push(retryNeed);
  }

  for (const task of input.taskCards.filter((card) => card.status === "queued" && card.runId === undefined)) {
    needs.push({
      kind: "queued-task",
      severity: "info",
      label: `Queued for scheduler readiness: ${task.title}`,
      relatedTaskId: task.taskId,
      safeAction: "queued-task"
    });
  }

  for (const run of input.status.runs) {
    const handoff = handoffForRun(run, input.specialistHandoffs);
    if (handoff !== undefined) {
      needs.push({
        kind: "handoff",
        severity: "info",
        label: `Review ${run.runType} handoff`,
        relatedTaskId: run.taskId,
        relatedRunId: run.runId,
        safeAction: "review-handoff"
      });
    }
  }

  const providerActionCard = input.status.providerReadiness?.cards.find((card) =>
    card.state !== "ready" &&
    card.state !== "works-locally" &&
    card.safeActionIds.length > 0
  );
  if (providerActionCard !== undefined) {
    needs.push({
      kind: "provider-readiness",
      severity: "warning",
      label: `Review provider readiness for ${providerActionCard.label}`,
      relatedProviderId: providerActionCard.providerId,
      safeAction: "review-provider-readiness"
    });
  }

  if (needs.length === 0) {
    needs.push({
      kind: "quiet",
      severity: "info",
      label: "Resident agent is quiet.",
      safeAction: "refresh-status"
    });
  }

  return needs;
}

function approvalNeedFromCockpit(approvalCockpit: AgentApprovalCockpitDto | undefined): AgentCockpitNeedDto | undefined {
  const item = approvalCockpit?.queue.pending[0];
  if (item === undefined) {
    return undefined;
  }

  return {
    kind: "approval",
    severity: "action-required",
    label: `Review ${approvalLabelFor(item.approvalClass)} approval`,
    relatedTaskId: item.taskId,
    relatedRunId: item.runId,
    relatedToolRequestId: item.toolRequestId,
    safeAction: "review-approval"
  };
}

function retryNeedFromStatus(status: AgentStatusDto): AgentCockpitNeedDto | undefined {
  const retryableRun = status.runs.find((run) => run.state === "failed" && run.retryable === true);
  if (retryableRun !== undefined) {
    return {
      kind: "retry",
      severity: "warning",
      label: `Review retryable ${retryableRun.runType} run`,
      relatedTaskId: retryableRun.taskId,
      relatedRunId: retryableRun.runId,
      safeAction: "inspect-retry"
    };
  }

  const retryableInvocation = (status.modelInvocations ?? []).find((invocation) =>
    invocation.status === "failed" && invocation.retryable === true
  );
  if (retryableInvocation !== undefined) {
    return {
      kind: "retry",
      severity: "warning",
      label: `Review retryable ${retryableInvocation.modelFamily} model step`,
      relatedRunId: retryableInvocation.runId,
      safeAction: "inspect-retry"
    };
  }

  return undefined;
}

function projectSpecialists(input: {
  readonly generatedAt: string;
  readonly providerReadiness: ProviderReadinessDto | undefined;
  readonly activeLocks: readonly AgentStatusDto["locks"][number][];
  readonly suppliedReadiness: readonly SpecialistWorkflowReadinessDto[];
  readonly availableContracts: readonly string[];
  readonly availableDomainAdapterFamilies: readonly AgentDomainToolFamily[];
}): AgentCockpitSpecialistsDto {
  const registry = specialistWorkflowRegistrySnapshot();
  const suppliedByRunType = new Map(
    input.suppliedReadiness.map((readiness) => {
      const parsed = parseSpecialistWorkflowReadinessDto(readiness);
      return [parsed.runType, parsed] as const;
    })
  );
  const providerReadiness = input.providerReadiness ?? providerReadinessDtoSchema.parse({
    schemaVersion: "agent-provider-readiness.v1",
    generatedAt: input.generatedAt,
    cards: [],
    diagnostics: []
  });

  return {
    registry,
    readiness: specialistWorkflowDescriptors.map((descriptor) =>
      suppliedByRunType.get(descriptor.runType) ?? projectSpecialistWorkflowReadiness({
        runType: descriptor.runType,
        descriptor,
        availableContracts: input.availableContracts,
        scope: { kind: "workspace", refs: [] },
        contextPackRefs: [],
        resolvedContextPacks: [],
        providerReadiness,
        availableDomainAdapterFamilies: input.availableDomainAdapterFamilies,
        currentProjectionHighWaterMarks: {},
        activeLocks: input.activeLocks.map((lock) => ({
          lockId: lock.lockId,
          category: lock.kind,
          safeSummary: lock.reason
        })),
        satisfiedApprovalClasses: []
      })
    )
  };
}

function blockedReasonsForRun(
  run: AgentStatusDto["runs"][number],
  task: AgentStatusDto["tasks"][number] | undefined,
  toolRequests: readonly AgentStatusDto["toolRequests"][number][],
  activeLocks: readonly AgentStatusDto["locks"][number][]
): string[] {
  if (run.state === "completed") {
    return [];
  }

  const reasons = new Set<string>();

  if (run.state === "running" && (toolRequests.some(isPendingApprovalRequest) || task?.status === "waiting-for-approval")) {
    reasons.add("pending-approval");
  }

  if (run.state === "running") {
    for (const lock of activeLocks) {
      reasons.add(`lock-${lock.kind}`);
    }
  }

  if (run.state === "failed" && run.failureCategory !== undefined) {
    reasons.add(`run-${run.failureCategory}`);
  }

  if (task?.status === "blocked") {
    reasons.add("task-blocked");
  }

  return [...reasons];
}

function taskForRun(
  run: AgentStatusDto["runs"][number],
  tasks: AgentStatusDto["tasks"]
): AgentStatusDto["tasks"][number] | undefined {
  return tasks.find((task) => task.taskId === run.taskId);
}

function modelInvocationsForRun(
  run: AgentStatusDto["runs"][number],
  modelInvocations: readonly NonNullable<AgentStatusDto["modelInvocations"]>[number][]
): readonly NonNullable<AgentStatusDto["modelInvocations"]>[number][] {
  const invocationIds = new Set(run.invocationIds);
  return modelInvocations.filter((invocation) =>
    invocation.runId === run.runId || invocationIds.has(invocation.invocationId)
  );
}

function toolRequestsForRun(
  run: AgentStatusDto["runs"][number],
  toolRequests: AgentStatusDto["toolRequests"]
): readonly AgentStatusDto["toolRequests"][number][] {
  const toolRequestIds = new Set(run.toolRequestIds);
  return toolRequests.filter((request) =>
    request.runId === run.runId || toolRequestIds.has(request.toolRequestId)
  );
}

function isPendingApprovalRequest(request: AgentStatusDto["toolRequests"][number]): boolean {
  return request.requiredApprovalClass !== "none" && request.state === "requested";
}

function formatUsageSummary(
  usage: NonNullable<NonNullable<AgentStatusDto["modelInvocations"]>[number]["usage"]> | undefined
): string | undefined {
  if (usage?.inputTokens === undefined || usage.outputTokens === undefined || usage.totalTokens === undefined) {
    return undefined;
  }

  return `${usage.inputTokens} input, ${usage.outputTokens} output, ${usage.totalTokens} total`;
}

function compareTasks(
  left: AgentStatusDto["tasks"][number],
  right: AgentStatusDto["tasks"][number]
): number {
  const terminalDelta = Number(terminalTaskStatuses.has(left.status)) - Number(terminalTaskStatuses.has(right.status));
  if (terminalDelta !== 0) {
    return terminalDelta;
  }

  return left.createdAt.localeCompare(right.createdAt);
}

function compareRuns(
  left: AgentStatusDto["runs"][number],
  right: AgentStatusDto["runs"][number]
): number {
  const runningDelta = Number(left.state !== "running") - Number(right.state !== "running");
  if (runningDelta !== 0) {
    return runningDelta;
  }

  return left.startedAt.localeCompare(right.startedAt);
}

function selectRun(
  status: AgentStatusDto,
  selectedRunId: string | undefined
): AgentStatusDto["runs"][number] | undefined {
  if (selectedRunId !== undefined) {
    return status.runs.find((run) => run.runId === selectedRunId);
  }

  return [...status.runs].sort(compareRuns)[0];
}

function humanizeIdentifier(value: string): string {
  return value.replace(/-/g, " ");
}

function approvalLabelFor(approvalClass: string): string {
  switch (approvalClass) {
    case "provider-byte-transfer":
      return "provider byte-transfer";
    case "prr-send-followup":
      return "PRR send/follow-up";
    case "accepted-graph-review":
      return "accepted-graph review";
    default:
      return humanizeIdentifier(approvalClass);
  }
}

function normalizeApprovalClass(approvalClass: string): string {
  switch (approvalClass) {
    case "external-message-send":
      return "prr-send-followup";
    case "export-or-publication":
      return "export-publication";
    case "destructive-or-repair":
      return "destructive-repair";
    default:
      return approvalClass;
  }
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
    return Object.freeze(value);
  }

  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    deepFreeze(record[key]);
  }
  return Object.freeze(value);
}
