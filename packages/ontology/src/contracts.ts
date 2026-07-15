import { z } from "zod";
import { validateGovernancePolicy } from "./governance-policy.js";

const credentialShapedTextPattern = /api[_-]?key|authorization|bearer|token|secret|password|oauth|credential/i;
const secretSafeStringSchema = z.string().refine((value) => !credentialShapedTextPattern.test(value), {
  message: "must not contain credential-shaped text"
});

export const actorRefSchema = z.object({
  id: secretSafeStringSchema.min(3),
  kind: z.enum(["human", "extractor", "system", "agent"]),
  label: secretSafeStringSchema.min(1)
}).strict();

export type ActorRef = z.infer<typeof actorRefSchema>;

export const eventContextSchema = z.object({
  actor: actorRefSchema,
  occurredAt: z.string().datetime(),
  causationId: z.string().regex(/^evt_[a-zA-Z0-9_-]+$/).optional(),
  correlationId: z.string().min(3),
  coreVersion: z.string().min(1),
  packVersions: z.record(z.string(), z.string())
}).strict();

export const sourceRefSchema = z.object({
  kind: z.enum(["file", "url", "dataset", "message", "annotation", "manual"]),
  label: z.string().min(1),
  uri: z.string().optional()
}).strict();

const evidenceIngestedPayloadSchema = z.object({
  evidenceId: z.string().regex(/^ev_[a-zA-Z0-9_-]+$/),
  source: sourceRefSchema,
  contentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  mediaType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative()
}).strict();

const assertionProposedPayloadSchema = z.object({
  assertionId: z.string().regex(/^as_[a-zA-Z0-9_-]+$/),
  evidenceId: z.string().regex(/^ev_[a-zA-Z0-9_-]+$/),
  subjectRef: z.string().optional(),
  predicate: z.string().min(1),
  object: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  confidence: z.number().min(0).max(1),
  reviewState: z.literal("proposed")
}).strict();

const assertionAcceptedPayloadSchema = z.object({
  assertionId: z.string().regex(/^as_[a-zA-Z0-9_-]+$/),
  acceptedBy: z.string().min(3),
  rationale: z.string().min(1)
}).strict();

const entityResolvedPayloadSchema = z.object({
  entityId: z.string().regex(/^ent_[a-zA-Z0-9_-]+$/),
  assertionIds: z.array(z.string().regex(/^as_[a-zA-Z0-9_-]+$/)).min(1),
  canonicalLabel: z.string().min(1),
  entityType: z.string().min(1)
}).strict();

const relationshipAcceptedPayloadSchema = z.object({
  relationshipId: z.string().regex(/^rel_[a-zA-Z0-9_-]+$/),
  fromEntityId: z.string().regex(/^ent_[a-zA-Z0-9_-]+$/),
  toEntityId: z.string().regex(/^ent_[a-zA-Z0-9_-]+$/),
  relationshipType: z.string().min(1),
  assertionIds: z.array(z.string().regex(/^as_[a-zA-Z0-9_-]+$/)).min(1)
}).strict();

const claimCreatedPayloadSchema = z.object({
  claimId: z.string().regex(/^cl_[a-zA-Z0-9_-]+$/),
  investigationId: z.string().regex(/^inv_[a-zA-Z0-9_-]+$/),
  statement: z.string().min(1)
}).strict();

const secretTextPattern =
  /(?:^|[^a-z0-9])(?:access[\s._-]*token|api[\s._-]*key|authorization|bearer|token|password|private[\s._-]*key|client[\s._-]*secret|refresh[\s._-]*secret|session[\s._-]*secret|oauth(?:[\s._-]*(?:token|secret))?|credential[\s._-]*(?:id|key|secret|token)?)(?:\s*[:=]\s*|\s+(?=[a-z0-9._~+/=-]{3,})(?=[a-z0-9._~+/=-]*[0-9])[a-z0-9][a-z0-9._~+/=-]*)/i;

const secretSafeTextSchema = z.string().min(1).refine((value) => !secretTextPattern.test(value), {
  message: "text must not contain secrets or credentials"
});

const diagnosticRecordedPayloadSchema = z.object({
  diagnosticId: z.string().regex(/^diag_[a-zA-Z0-9_-]+$/),
  severity: z.enum(["info", "warning", "error"]),
  category: z.enum([
    "ingestion",
    "validation",
    "projection",
    "migration",
    "deduplication",
    "governance",
    "security",
    "export",
    "network",
    "incident"
  ]),
  message: secretSafeTextSchema,
  repairHint: z.object({
    contract: secretSafeTextSchema,
    violatedPath: secretSafeTextSchema,
    allowedActions: z.array(secretSafeTextSchema).min(1)
  }).strict()
}).strict();

const ontologyPackInstalledPayloadSchema = z.object({
  packName: z.string().min(1),
  packVersion: z.string().min(1),
  scope: z.enum(["core", "org", "investigation"])
}).strict();

const projectionCheckpointedPayloadSchema = z.object({
  projectionName: z.string().min(1),
  highWaterMark: z.number().int().nonnegative(),
  status: z.enum(["ready", "rebuilding", "failed"])
}).strict();

const sourceCollectionIdSchema = z.string().regex(/^src_[a-zA-Z0-9_-]+$/);
const scanBatchIdSchema = z.string().regex(/^scan_[a-zA-Z0-9_-]+$/);
const importBatchIdSchema = z.string().regex(/^imp_[a-zA-Z0-9_-]+$/);
const occurrenceIdSchema = z.string().regex(/^occ_[a-zA-Z0-9_-]+$/);
const parseJobIdSchema = z.string().regex(/^parse_[a-zA-Z0-9_-]+$/);
const providerJobIdSchema = z.string().regex(/^provider_[a-zA-Z0-9_-]+$/);
const contentHashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const eventIdSchema = z.string().regex(/^evt_[a-zA-Z0-9_-]+$/);
const actorIdSchema = secretSafeStringSchema.min(3);
const secretLikeIdFragmentPattern =
  /(?:^|[_-])(?:sk[_-](?:live|test|proj)|gh[pousr]_|github[_-]?pat[_-]|glpat[_-]|xox[baprs]?[_-]|AKIA|ASIA|AIza|ya29|eyJ|hf[_-]|rk[_-]live|pk[_-]live|sg[._-])/i;

function agentSecretSafeIdSchema(pattern: RegExp) {
  return secretSafeStringSchema.regex(pattern).refine((value) => !secretLikeIdFragmentPattern.test(value), {
    message: "must not contain secret-looking ID fragments"
  });
}

const agentSecretSafeRelatedIdSchema = secretSafeStringSchema.min(1).refine(
  (value) => !secretLikeIdFragmentPattern.test(value),
  { message: "must not contain secret-looking ID fragments" }
);

const residentAgentIdSchema = agentSecretSafeIdSchema(/^agent_[a-zA-Z0-9_-]+$/);
const agentPolicyIdSchema = agentSecretSafeIdSchema(/^agent_policy_[a-zA-Z0-9_-]+$/);
const agentWorkspaceIdSchema = agentSecretSafeIdSchema(/^ws_[a-zA-Z0-9_-]+$/);
const agentTaskIdSchema = agentSecretSafeIdSchema(/^task_[a-zA-Z0-9_-]+$/);
const agentRunIdSchema = agentSecretSafeIdSchema(/^run_[a-zA-Z0-9_-]+$/);
const agentRunStepIdSchema = agentSecretSafeIdSchema(/^step_[a-zA-Z0-9_-]+$/);
const agentToolRequestIdSchema = agentSecretSafeIdSchema(/^toolreq_[a-zA-Z0-9_-]+$/);
const agentMemoryIdSchema = agentSecretSafeIdSchema(/^mem_[a-zA-Z0-9_-]+$/);
const agentPermissionIdSchema = agentSecretSafeIdSchema(/^perm_[a-zA-Z0-9_-]+$/);
const agentLockIdSchema = agentSecretSafeIdSchema(/^lock_[a-zA-Z0-9_-]+$/);
const agentProviderIdSchema = agentSecretSafeIdSchema(/^provider_[a-zA-Z0-9_-]+$/);
const agentCredentialRefIdSchema = agentSecretSafeIdSchema(/^agent_credref_[a-zA-Z0-9_-]+$/);
const agentInvocationIdSchema = agentSecretSafeIdSchema(/^inv_[a-zA-Z0-9_-]+$/);
const agentArtifactHashSchema = contentHashSchema;
const agentTaskStatusSchema = z.enum([
  "queued",
  "running",
  "waiting-for-approval",
  "blocked",
  "completed",
  "failed",
  "canceled"
]);
const agentSpecialistRunTypeSchema = z.enum([
  "ontology-bootstrap",
  "prr-negotiation",
  "evidence-triage",
  "timeline-builder",
  "contradiction-finder",
  "investigation-planner",
  "report-builder"
]);
const agentCredentialKindSchema = z.enum([
  "api-key-bearer",
  "workload-identity-token",
  "subscription-oauth",
  "device-code-oauth",
  "local-no-secret",
  "mtls-certificate",
  "enterprise-gateway"
]);
const agentToolSideEffectClassSchema = z.enum([
  "read-only",
  "local-derivative",
  "ledger-proposal",
  "ledger-review",
  "external-byte-transfer",
  "external-message-send",
  "export-or-publication",
  "destructive-or-repair",
  "legal-escalation"
]);
const agentToolApprovalClassSchema = z.enum([
  "none",
  "human-review",
  "provider-byte-transfer",
  "external-message-send",
  "export-or-publication",
  "destructive-or-repair",
  "legal-escalation",
  "ledger-review"
]);
type AgentToolSideEffectClass = z.infer<typeof agentToolSideEffectClassSchema>;
type AgentToolApprovalClass = z.infer<typeof agentToolApprovalClassSchema>;

const agentApprovalClassesBySideEffectClass: Record<AgentToolSideEffectClass, readonly AgentToolApprovalClass[]> = {
  "read-only": ["none", "human-review"],
  "local-derivative": ["none", "human-review"],
  "ledger-proposal": ["none", "human-review"],
  "ledger-review": ["ledger-review"],
  "external-byte-transfer": ["provider-byte-transfer"],
  "external-message-send": ["external-message-send"],
  "export-or-publication": ["export-or-publication"],
  "destructive-or-repair": ["destructive-or-repair"],
  "legal-escalation": ["legal-escalation"]
};

function agentApprovalClassMatchesSideEffect(
  sideEffectClass: AgentToolSideEffectClass,
  approvalClass: AgentToolApprovalClass
): boolean {
  return agentApprovalClassesBySideEffectClass[sideEffectClass].includes(approvalClass);
}

const agentTaskPrioritySchema = z.enum(["low", "normal", "high", "urgent"]);
const agentMemoryScopeSchema = z.enum(["workspace", "investigation", "task", "provider", "policy"]);
const agentMemoryKindSchema = z.enum([
  "operator-preference",
  "agent-observation",
  "policy-caveat",
  "provider-note"
]);
const agentFailureCategorySchema = z.enum([
  "provider-unavailable",
  "provider-rate-limited",
  "credential-missing",
  "credential-revoked",
  "approval-required",
  "approval-denied",
  "approval-stale",
  "permission-denied",
  "secret-detected",
  "legal-lock-active",
  "lock-active",
  "projection-lag",
  "context-budget-exceeded",
  "missing-provenance",
  "provenance-missing",
  "model-output-invalid",
  "domain-gate-failed",
  "stale-source",
  "external-effect-failed",
  "data-loss-risk"
]);
const agentLockKindSchema = z.enum([
  "legal-escalation",
  "export",
  "secret",
  "governance",
  "data-loss",
  "provider-byte-transfer"
]);
const agentSourceEventIdsSchema = z.array(eventIdSchema);
const agentArtifactHashesSchema = z.array(agentArtifactHashSchema);
const agentSafeActionsSchema = z.array(secretSafeTextSchema).min(1);
const agentContextPackScopeSchema = z.object({
  kind: secretSafeStringSchema.min(1),
  id: secretSafeStringSchema.min(1)
}).strict();
const agentContextPackStalenessInputSchema = z.object({
  kind: secretSafeStringSchema.min(1),
  ref: secretSafeStringSchema.min(1),
  value: secretSafeStringSchema.min(1)
}).strict();
const agentContextPackRefSchema = z.object({
  contextPackId: secretSafeStringSchema.min(1),
  version: z.number().int().positive(),
  contentHash: agentArtifactHashSchema,
  sizeBytes: z.number().int().nonnegative(),
  generatedAt: z.string().datetime(),
  safeSummary: secretSafeTextSchema,
  provenanceRefs: z.array(secretSafeStringSchema.min(1)).min(1),
  projectionHighWaterMark: z.number().int().nonnegative().optional(),
  sourceEventIds: agentSourceEventIdsSchema.optional(),
  artifactHashes: agentArtifactHashesSchema.optional(),
  policyVersion: secretSafeStringSchema.min(1).optional(),
  scope: agentContextPackScopeSchema.optional(),
  sizeBudgetBytes: z.number().int().positive().optional(),
  stalenessInputs: z.array(agentContextPackStalenessInputSchema).optional()
}).strict().superRefine((contextPackRef, ctx) => {
  if (
    contextPackRef.sizeBudgetBytes !== undefined &&
    contextPackRef.sizeBudgetBytes < contextPackRef.sizeBytes
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["sizeBudgetBytes"],
      message: "sizeBudgetBytes must be at least sizeBytes"
    });
  }
});
const agentPromptArtifactOmissionSchema = z.object({
  reason: secretSafeTextSchema,
  sourceRef: secretSafeStringSchema.min(1),
  safeSummary: secretSafeTextSchema
}).strict();
const agentProductionAuditIdSchema = agentSecretSafeIdSchema(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/);
const agentProductionContextRequirementSchema = z.object({
  contextPackId: agentProductionAuditIdSchema,
  requirementMode: z.enum(["always", "when-scope-associated-prr"]),
  status: z.enum(["applicable", "not-applicable"]),
  contentHash: contentHashSchema.optional(),
  omissionReason: z.literal("no-associated-prr").optional()
}).strict().superRefine((requirement, ctx) => {
  if (requirement.status === "applicable" && (requirement.contentHash === undefined || requirement.omissionReason !== undefined)) {
    ctx.addIssue({ code: "custom", message: "applicable production context requirements require contentHash and no omissionReason" });
  }
  if (
    requirement.status === "not-applicable" && (
      requirement.requirementMode !== "when-scope-associated-prr" ||
      requirement.contentHash !== undefined ||
      requirement.omissionReason !== "no-associated-prr"
    )
  ) {
    ctx.addIssue({
      code: "custom",
      message: "not-applicable production context requirements require conditional PRR mode, no contentHash, and no-associated-prr"
    });
  }
});
const agentProductionResolvedPayloadAuditSchema = z.object({
  contextPackId: agentProductionAuditIdSchema,
  contentHash: contentHashSchema,
  sizeBytes: z.number().int().nonnegative(),
  schemaId: agentProductionAuditIdSchema
}).strict();
const agentProductionPromptAuditBindingSchema = z.object({
  rendererId: agentProductionAuditIdSchema,
  rendererVersion: z.number().int().positive(),
  rendererHash: contentHashSchema,
  renderedPromptHash: contentHashSchema,
  providerOutputSchemaId: agentProductionAuditIdSchema,
  providerOutputSchemaVersion: z.number().int().positive(),
  handoffSchemaId: agentProductionAuditIdSchema,
  handoffSchemaVersion: z.number().int().positive(),
  scopeApplicabilityHash: contentHashSchema,
  evaluatedContextRequirements: z.array(agentProductionContextRequirementSchema).min(1),
  resolvedPayloadAudits: z.array(agentProductionResolvedPayloadAuditSchema).min(1)
}).strict().superRefine((binding, ctx) => {
  const requirementsByPackId = new Map(binding.evaluatedContextRequirements.map((requirement) => [requirement.contextPackId, requirement]));
  if (requirementsByPackId.size !== binding.evaluatedContextRequirements.length) {
    ctx.addIssue({ code: "custom", path: ["evaluatedContextRequirements"], message: "production context requirements must be unique by contextPackId" });
  }
  const auditsByPackId = new Map(binding.resolvedPayloadAudits.map((audit) => [audit.contextPackId, audit]));
  if (auditsByPackId.size !== binding.resolvedPayloadAudits.length) {
    ctx.addIssue({ code: "custom", path: ["resolvedPayloadAudits"], message: "production resolved payload audits must be unique by contextPackId" });
  }
  for (const requirement of binding.evaluatedContextRequirements) {
    const audit = auditsByPackId.get(requirement.contextPackId);
    if (requirement.status === "applicable" && (audit === undefined || audit.contentHash !== requirement.contentHash)) {
      ctx.addIssue({ code: "custom", path: ["resolvedPayloadAudits"], message: "applicable production context requirements require a matching resolved payload audit" });
    }
    if (requirement.status === "not-applicable" && audit !== undefined) {
      ctx.addIssue({ code: "custom", path: ["resolvedPayloadAudits"], message: "not-applicable production context requirements must not have a resolved payload audit" });
    }
  }
  for (const audit of binding.resolvedPayloadAudits) {
    const requirement = requirementsByPackId.get(audit.contextPackId);
    if (requirement === undefined || requirement.status !== "applicable") {
      ctx.addIssue({ code: "custom", path: ["resolvedPayloadAudits"], message: "resolved payload audits require an applicable context requirement" });
    }
  }
});
const agentReadModelChangeSchema = z.object({
  projectionName: secretSafeStringSchema.min(1),
  change: secretSafeTextSchema,
  relatedIds: z.array(agentSecretSafeRelatedIdSchema).optional()
}).strict();

const agentIdentityInitializedPayloadSchema = z.object({
  residentAgentId: residentAgentIdSchema,
  workspaceId: agentWorkspaceIdSchema,
  label: secretSafeTextSchema,
  policyId: agentPolicyIdSchema,
  initializedBy: actorIdSchema,
  allowedRunTypes: z.array(agentSpecialistRunTypeSchema).optional(),
  memoryProjectionVersion: secretSafeStringSchema.min(1).optional()
}).strict();

const agentIdentityUpdatedPayloadSchema = z.object({
  residentAgentId: residentAgentIdSchema,
  updatedBy: actorIdSchema,
  rationale: secretSafeTextSchema,
  label: secretSafeTextSchema.optional(),
  policyId: agentPolicyIdSchema.optional(),
  allowedRunTypes: z.array(agentSpecialistRunTypeSchema).optional(),
  previousEventId: eventIdSchema.optional()
}).strict();

const agentPolicyInstalledPayloadSchema = z.object({
  policyId: agentPolicyIdSchema,
  residentAgentId: residentAgentIdSchema,
  version: secretSafeStringSchema.min(1),
  installedBy: actorIdSchema,
  humanGatedActionClasses: z.array(agentToolSideEffectClassSchema).min(1),
  allowedRunTypes: z.array(agentSpecialistRunTypeSchema).min(1),
  credentialKinds: z.array(agentCredentialKindSchema).min(1),
  rationale: secretSafeTextSchema
}).strict();

const agentTaskCreatedPayloadSchema = z.object({
  taskId: agentTaskIdSchema,
  residentAgentId: residentAgentIdSchema,
  title: secretSafeTextSchema,
  requestedBy: actorIdSchema,
  priority: agentTaskPrioritySchema,
  description: secretSafeTextSchema.optional(),
  sourceEventIds: agentSourceEventIdsSchema.optional(),
  inputArtifactHashes: agentArtifactHashesSchema.optional()
}).strict();

const agentTaskStatusChangedPayloadSchema = z.object({
  taskId: agentTaskIdSchema,
  status: agentTaskStatusSchema,
  changedBy: actorIdSchema,
  reason: secretSafeTextSchema.optional(),
  runId: agentRunIdSchema.optional()
}).strict();

const agentTaskOrchestrationAttemptIdSchema = agentSecretSafeIdSchema(/^attempt_[a-f0-9]{64}$/);

const agentTaskOrchestrationOrderingPositionSchema = z.object({
  priorityRank: z.number().int().nonnegative(),
  queuedAt: z.string().datetime(),
  taskId: agentTaskIdSchema,
  runType: agentSpecialistRunTypeSchema,
  retryGeneration: z.number().int().nonnegative()
}).strict();

const agentTaskOrchestrationBudgetSnapshotSchema = z.object({
  maxProviderInvocations: z.number().int().nonnegative(),
  remainingProviderInvocations: z.number().int().nonnegative(),
  contextByteBudget: z.number().int().nonnegative(),
  promptByteBudget: z.number().int().nonnegative(),
  derivativeArtifactByteBudget: z.number().int().nonnegative(),
  wallClockBudgetMs: z.number().int().positive()
}).strict().superRefine((budget, ctx) => {
  if (budget.remainingProviderInvocations > budget.maxProviderInvocations) {
    ctx.addIssue({
      code: "custom",
      path: ["remainingProviderInvocations"],
      message: "remainingProviderInvocations cannot exceed maxProviderInvocations"
    });
  }
});

const agentTaskOrchestrationClaimedPayloadSchema = z.object({
  taskId: agentTaskIdSchema,
  runType: agentSpecialistRunTypeSchema,
  attemptId: agentTaskOrchestrationAttemptIdSchema,
  retryGeneration: z.number().int().nonnegative(),
  leaseClaimGeneration: z.number().int().positive(),
  workerId: actorIdSchema,
  claimedAt: z.string().datetime(),
  leaseExpiresAt: z.string().datetime(),
  idempotencyKey: secretSafeStringSchema.min(1),
  selectedOrderingPosition: agentTaskOrchestrationOrderingPositionSchema,
  activeBudgetSnapshot: agentTaskOrchestrationBudgetSnapshotSchema,
  causationEventId: eventIdSchema
}).strict().superRefine((claim, ctx) => {
  if (Date.parse(claim.leaseExpiresAt) <= Date.parse(claim.claimedAt)) {
    ctx.addIssue({
      code: "custom",
      path: ["leaseExpiresAt"],
      message: "leaseExpiresAt must be after claimedAt"
    });
  }
  if (
    claim.selectedOrderingPosition.taskId !== claim.taskId ||
    claim.selectedOrderingPosition.runType !== claim.runType ||
    claim.selectedOrderingPosition.retryGeneration !== claim.retryGeneration
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["selectedOrderingPosition"],
      message: "selectedOrderingPosition must bind the same task, run type, and retry generation"
    });
  }
});

const agentTaskOrchestrationContextBindingSchema = z.object({
  contextPackId: secretSafeStringSchema.min(1),
  contentHash: contentHashSchema,
  sizeBytes: z.number().int().nonnegative(),
  schemaId: secretSafeStringSchema.min(1),
  provenanceEventIds: z.array(eventIdSchema).min(1),
  projectionHighWaterMark: z.number().int().nonnegative().optional(),
  stalenessInputCount: z.number().int().nonnegative().optional()
}).strict();

const agentTaskOrchestrationProviderPostureSchema = z.object({
  providerId: agentProviderIdSchema,
  modelFamily: secretSafeStringSchema.min(1),
  adapterVersion: secretSafeStringSchema.min(1),
  capabilityIds: z.array(secretSafeStringSchema.min(1)).min(1),
  credentialRefId: agentCredentialRefIdSchema.optional(),
  credentialKind: agentCredentialKindSchema.optional(),
  readinessState: z.enum(["ready", "degraded", "blocked", "unavailable", "approval-required"]),
  approvalProfile: agentToolApprovalClassSchema,
  dataHandlingPosture: secretSafeStringSchema.min(1),
  selectionPolicyVersion: secretSafeStringSchema.min(1),
  sensitivityClass: secretSafeStringSchema.min(1),
  requiredApprovalClass: agentToolApprovalClassSchema
}).strict();

const agentTaskOrchestrationApprovalRequirementSchema = z.object({
  approvalClass: agentToolApprovalClassSchema,
  previewHash: contentHashSchema,
  approvalRequestEventId: eventIdSchema
}).strict();

const agentTaskOrchestrationLockSnapshotSchema = z.object({
  activeLockIds: z.array(agentLockIdSchema),
  highWaterMark: z.number().int().nonnegative()
}).strict();

const agentTaskOrchestrationCheckpointKindSchema = z.enum([
  "planning",
  "context-ready",
  "prompt-ready",
  "approval-wait",
  "runner-dispatching",
  "handoff-pending",
  "blocked"
]);

const agentTaskOrchestrationCheckpointedPayloadSchema = z.object({
  taskId: agentTaskIdSchema,
  runType: agentSpecialistRunTypeSchema,
  attemptId: agentTaskOrchestrationAttemptIdSchema,
  retryGeneration: z.number().int().nonnegative(),
  leaseClaimGeneration: z.number().int().positive(),
  checkpointKind: agentTaskOrchestrationCheckpointKindSchema,
  checkpointedAt: z.string().datetime(),
  runId: agentRunIdSchema.optional(),
  resumeIdempotencyKey: secretSafeStringSchema.min(1),
  toolRequestIds: z.array(agentToolRequestIdSchema).optional(),
  approvalRequirement: agentTaskOrchestrationApprovalRequirementSchema.optional(),
  providerPosture: agentTaskOrchestrationProviderPostureSchema.optional(),
  contextBindings: z.array(agentTaskOrchestrationContextBindingSchema),
  sourceEventIds: agentSourceEventIdsSchema.optional(),
  inputArtifactHashes: agentArtifactHashesSchema.optional(),
  promptArtifactHash: contentHashSchema.optional(),
  lockSnapshot: agentTaskOrchestrationLockSnapshotSchema.optional(),
  safeNextActions: agentSafeActionsSchema
}).strict().superRefine((checkpoint, ctx) => {
  if (checkpoint.checkpointKind !== "approval-wait") {
    return;
  }

  for (const [field, value] of [
    ["runId", checkpoint.runId],
    ["approvalRequirement", checkpoint.approvalRequirement],
    ["providerPosture", checkpoint.providerPosture],
    ["promptArtifactHash", checkpoint.promptArtifactHash],
    ["lockSnapshot", checkpoint.lockSnapshot]
  ] as const) {
    if (value === undefined) {
      ctx.addIssue({
        code: "custom",
        path: [field],
        message: `approval-wait checkpoints require ${field}`
      });
    }
  }

  for (const [field, value] of [
    ["toolRequestIds", checkpoint.toolRequestIds],
    ["contextBindings", checkpoint.contextBindings],
    ["sourceEventIds", checkpoint.sourceEventIds],
    ["inputArtifactHashes", checkpoint.inputArtifactHashes]
  ] as const) {
    if (value === undefined || value.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: [field],
        message: `approval-wait checkpoints require at least one ${field} entry`
      });
    }
  }
});

const agentTaskOrchestrationReleaseReasonSchema = z.enum([
  "approval-suspended",
  "stale-recovered",
  "budget-blocked",
  "canceled-before-dispatch",
  "handoff-pending",
  "worker-shutdown"
]);

const agentTaskOrchestrationReleasedPayloadSchema = z.object({
  taskId: agentTaskIdSchema,
  runType: agentSpecialistRunTypeSchema,
  attemptId: agentTaskOrchestrationAttemptIdSchema,
  retryGeneration: z.number().int().nonnegative(),
  leaseClaimGeneration: z.number().int().positive(),
  releasedBy: actorIdSchema,
  releasedAt: z.string().datetime(),
  releaseReason: agentTaskOrchestrationReleaseReasonSchema,
  claimEventId: eventIdSchema,
  checkpointEventId: eventIdSchema.optional(),
  safeNextActions: agentSafeActionsSchema
}).strict().superRefine((release, ctx) => {
  if (release.releaseReason === "approval-suspended" && release.checkpointEventId === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["checkpointEventId"],
      message: "approval-suspended releases require the suspended checkpoint event ID"
    });
  }
});

const agentTaskOrchestrationHandoffReadbackSchema = z.object({
  handoffId: z.string().regex(/^handoff_[a-zA-Z0-9_-]+_[a-f0-9]{16}$/),
  handoffManifestHash: contentHashSchema,
  handoffRecordedEventId: eventIdSchema,
  verifiedAt: z.string().datetime()
}).strict();

const agentTaskOrchestrationCompletedPayloadSchema = z.object({
  taskId: agentTaskIdSchema,
  runType: agentSpecialistRunTypeSchema,
  attemptId: agentTaskOrchestrationAttemptIdSchema,
  retryGeneration: z.number().int().nonnegative(),
  runId: agentRunIdSchema,
  completedAt: z.string().datetime(),
  specialistRunCompletedEventId: eventIdSchema,
  finalOutputStepEventId: eventIdSchema,
  handoffPreparedEventId: eventIdSchema,
  handoffRecordedEventId: eventIdSchema,
  handoffReadback: agentTaskOrchestrationHandoffReadbackSchema
}).strict().superRefine((completion, ctx) => {
  if (completion.handoffReadback.handoffRecordedEventId !== completion.handoffRecordedEventId) {
    ctx.addIssue({
      code: "custom",
      path: ["handoffReadback", "handoffRecordedEventId"],
      message: "handoff readback must reference the same recorded event as orchestration completion"
    });
  }
});

const agentTaskOrchestrationFailedPayloadSchema = z.object({
  taskId: agentTaskIdSchema,
  runType: agentSpecialistRunTypeSchema,
  attemptId: agentTaskOrchestrationAttemptIdSchema,
  retryGeneration: z.number().int().nonnegative(),
  failedAt: z.string().datetime(),
  category: agentFailureCategorySchema,
  message: secretSafeTextSchema,
  retryable: z.boolean(),
  allowedActions: agentSafeActionsSchema,
  runId: agentRunIdSchema.optional(),
  relatedEventIds: agentSourceEventIdsSchema.optional()
}).strict();

const residentLoopIdentitySchema = z.object({
  residentAgentId: z.literal("agent_default"),
  taskId: agentTaskIdSchema,
  attemptId: agentTaskOrchestrationAttemptIdSchema,
  runId: agentRunIdSchema,
  policyId: agentPolicyIdSchema,
  policyVersion: secretSafeStringSchema.min(1),
  policyHash: contentHashSchema,
  authorityHash: contentHashSchema,
  sourceEventIds: agentSourceEventIdsSchema.min(1),
  contextArtifactHashes: agentArtifactHashesSchema.min(1),
  budget: z.object({
    maxSteps: z.number().int().positive(),
    remainingSteps: z.number().int().nonnegative(),
    contextBytes: z.number().int().nonnegative()
  }).strict(),
  causationEventId: eventIdSchema,
  correlationId: secretSafeStringSchema.min(3)
}).strict().superRefine((value, ctx) => {
  if (value.budget.remainingSteps > value.budget.maxSteps) {
    ctx.addIssue({
      code: "custom",
      path: ["budget", "remainingSteps"],
      message: "remainingSteps cannot exceed maxSteps"
    });
  }
});

const residentPlanReadbackSchema = z.object({
  planRecordEventId: eventIdSchema,
  taskId: agentTaskIdSchema,
  attemptId: agentTaskOrchestrationAttemptIdSchema,
  runId: agentRunIdSchema
}).strict();

const residentFinalObservationReadbackSchema = z.object({
  observationEventId: eventIdSchema,
  taskId: agentTaskIdSchema,
  attemptId: agentTaskOrchestrationAttemptIdSchema,
  runId: agentRunIdSchema
}).strict();

const residentTerminalReadbackSchema = z.object({
  finalObservationEventId: eventIdSchema,
  taskId: agentTaskIdSchema,
  attemptId: agentTaskOrchestrationAttemptIdSchema,
  runId: agentRunIdSchema
}).strict();

function addResidentReadbackIdentityIssues(
  value: z.infer<typeof residentLoopIdentitySchema>,
  readback: z.infer<typeof residentPlanReadbackSchema> | z.infer<typeof residentFinalObservationReadbackSchema> | z.infer<typeof residentTerminalReadbackSchema>,
  path: string,
  ctx: z.RefinementCtx
): void {
  for (const field of ["taskId", "attemptId", "runId"] as const) {
    if (readback[field] !== value[field]) {
      ctx.addIssue({
        code: "custom",
        path: [path, field],
        message: `${path} must bind the same task, attempt, and run identity`
      });
    }
  }
}

const agentResidentPlanRecordedPayloadSchema = residentLoopIdentitySchema.extend({
  planRevision: z.number().int().positive(),
  descriptorHash: contentHashSchema
}).strict();

const agentResidentObservationRecordedPayloadSchema = residentLoopIdentitySchema.extend({
  planReadback: residentPlanReadbackSchema,
  observationOrdinal: z.number().int().positive(),
  category: secretSafeStringSchema.min(1),
  observationHash: contentHashSchema
}).strict().superRefine((value, ctx) => addResidentReadbackIdentityIssues(value, value.planReadback, "planReadback", ctx));

const agentResidentToolStepRecordedPayloadSchema = residentLoopIdentitySchema.extend({
  planReadback: residentPlanReadbackSchema,
  stepOrdinal: z.number().int().positive(),
  toolRequestId: agentToolRequestIdSchema,
  toolId: secretSafeStringSchema.min(3),
  toolVersion: secretSafeStringSchema.min(1),
  previewHash: contentHashSchema,
  toolEventId: eventIdSchema
}).strict().superRefine((value, ctx) => addResidentReadbackIdentityIssues(value, value.planReadback, "planReadback", ctx));

const agentResidentLoopSuspendedPayloadSchema = residentLoopIdentitySchema.extend({
  planReadback: residentPlanReadbackSchema,
  finalObservationReadback: residentFinalObservationReadbackSchema,
  suspensionCategory: z.enum(["budget-exhausted", "approval-required", "authority-stale", "context-stale", "provider-unavailable"]),
  resumeIdempotencyKey: secretSafeStringSchema.min(1)
}).strict().superRefine((value, ctx) => {
  addResidentReadbackIdentityIssues(value, value.planReadback, "planReadback", ctx);
  addResidentReadbackIdentityIssues(value, value.finalObservationReadback, "finalObservationReadback", ctx);
});

const agentResidentLoopResultRecordedPayloadSchema = residentLoopIdentitySchema.extend({
  planReadback: residentPlanReadbackSchema,
  finalObservationReadback: residentFinalObservationReadbackSchema,
  outcome: z.enum(["completed", "failed"]),
  resultHash: contentHashSchema,
  terminalReadback: residentTerminalReadbackSchema
}).strict().superRefine((value, ctx) => {
  addResidentReadbackIdentityIssues(value, value.planReadback, "planReadback", ctx);
  addResidentReadbackIdentityIssues(value, value.finalObservationReadback, "finalObservationReadback", ctx);
  addResidentReadbackIdentityIssues(value, value.terminalReadback, "terminalReadback", ctx);
});

const residentLoopV2RunModeSchema = z.enum([
  "evidence-triage",
  "ontology-bootstrap",
  "investigation-planner",
  "prr-negotiation",
  "timeline-builder",
  "contradiction-finder",
  "report-builder",
  "memory-curation"
]);

const residentLoopV2ToolSideEffectClassSchema = z.enum([
  "read-only",
  "local-derivative",
  "ledger-proposal",
  "ledger-review",
  "external-byte-transfer",
  "external-message-send",
  "export-or-publication",
  "destructive-or-repair",
  "legal-escalation"
]);

const residentLoopV2ApprovalClassSchema = z.enum([
  "none",
  "human-review",
  "provider-byte-transfer",
  "external-message-send",
  "export-or-publication",
  "destructive-or-repair",
  "legal-escalation",
  "ledger-review"
]);

const residentLoopV2ResultCategorySchema = z.enum([
  "handoff-recorded",
  "validation-failed",
  "budget-exhausted",
  "approval-required",
  "approval-denied",
  "approval-stale",
  "workspace-unavailable",
  "provider-unavailable",
  "source-stale",
  "policy-changed",
  "claim-conflict",
  "persistence-unconfirmed",
  "tool-failed"
]);

const residentLoopV2BudgetUsageSchema = z.object({
  planRevisions: z.number().int().nonnegative(),
  observationRecords: z.number().int().nonnegative(),
  toolSteps: z.number().int().nonnegative(),
  providerInvocations: z.number().int().nonnegative(),
  providerRequestBytes: z.number().int().nonnegative(),
  providerResponseBytes: z.number().int().nonnegative(),
  contextBytes: z.number().int().nonnegative(),
  derivativeArtifactBytes: z.number().int().nonnegative(),
  activeExecutionMs: z.number().int().nonnegative(),
  approvalSuspensionMs: z.number().int().nonnegative()
}).strict();

const residentLoopV2BudgetSchema = z.object({
  ceilings: residentLoopV2BudgetUsageSchema,
  consumed: residentLoopV2BudgetUsageSchema,
  remaining: residentLoopV2BudgetUsageSchema
}).strict().superRefine((value, ctx) => {
  for (const field of [
    "planRevisions",
    "observationRecords",
    "toolSteps",
    "providerInvocations",
    "providerRequestBytes",
    "providerResponseBytes",
    "contextBytes",
    "derivativeArtifactBytes",
    "activeExecutionMs",
    "approvalSuspensionMs"
  ] as const) {
    if (value.consumed[field] + value.remaining[field] !== value.ceilings[field]) {
      ctx.addIssue({
        code: "custom",
        path: ["remaining", field],
        message: `${field} consumed plus remaining must equal its ceiling`
      });
    }
  }
});

const residentLoopV2WorkflowDescriptorSchema = z.object({
  workflowDescriptorId: agentSecretSafeIdSchema(/^workflow_[a-zA-Z0-9_-]+$/),
  workflowDescriptorVersion: secretSafeStringSchema.min(1),
  workflowDescriptorHash: contentHashSchema
}).strict();

const residentLoopV2PolicySchema = z.object({
  policyId: agentPolicyIdSchema,
  policyVersion: secretSafeStringSchema.min(1),
  policyHash: contentHashSchema
}).strict();

const residentLoopV2AuthoritySchema = z.object({
  workspaceIdentityHash: contentHashSchema,
  mountGeneration: secretSafeStringSchema.min(1),
  ledgerStoreIdentity: secretSafeStringSchema.min(1),
  artifactStoreIdentity: secretSafeStringSchema.min(1),
  ledgerHighWaterEventId: eventIdSchema,
  policyHash: contentHashSchema,
  activeLocksHash: contentHashSchema
}).strict();

const residentLoopV2ContextPackRefSchema = z.object({
  contextPackId: agentSecretSafeIdSchema(/^context_pack_[a-zA-Z0-9_-]+$/),
  contentHash: contentHashSchema
}).strict();

function addResidentLoopV2OrderedUniqueIssues(
  values: readonly string[],
  path: readonly (string | number)[],
  label: string,
  ctx: z.RefinementCtx
): void {
  const expected = [...values].sort((left, right) => left.localeCompare(right));
  if (expected.some((value, index) => value !== values[index])) {
    ctx.addIssue({ code: "custom", path, message: `${label} must be canonically ordered` });
  }
  if (new Set(values).size !== values.length) {
    ctx.addIssue({ code: "custom", path, message: `${label} must not contain duplicates` });
  }
}

const residentLoopV2BindingSchema = z.object({
  residentAgentId: z.literal("agent_default"),
  workspaceId: agentWorkspaceIdSchema,
  taskId: agentTaskIdSchema,
  attemptId: agentTaskOrchestrationAttemptIdSchema,
  runId: agentRunIdSchema,
  runMode: residentLoopV2RunModeSchema,
  workflowDescriptor: residentLoopV2WorkflowDescriptorSchema,
  policy: residentLoopV2PolicySchema,
  authority: residentLoopV2AuthoritySchema,
  sourceEventIds: z.array(eventIdSchema).min(1),
  contextPackRefs: z.array(residentLoopV2ContextPackRefSchema).min(1),
  budget: residentLoopV2BudgetSchema,
  causationId: eventIdSchema,
  correlationId: secretSafeStringSchema.min(3)
}).strict().superRefine((value, ctx) => {
  if (value.authority.policyHash !== value.policy.policyHash) {
    ctx.addIssue({
      code: "custom",
      path: ["authority", "policyHash"],
      message: "mounted authority policy hash must equal the bound policy hash"
    });
  }
  if (value.authority.ledgerHighWaterEventId !== value.sourceEventIds[value.sourceEventIds.length - 1]) {
    ctx.addIssue({
      code: "custom",
      path: ["authority", "ledgerHighWaterEventId"],
      message: "mounted ledger high-water must equal the final ordered source event"
    });
  }
  addResidentLoopV2OrderedUniqueIssues(value.sourceEventIds, ["sourceEventIds"], "source event IDs", ctx);
  const contextPackIds = value.contextPackRefs.map((ref) => ref.contextPackId);
  addResidentLoopV2OrderedUniqueIssues(contextPackIds, ["contextPackRefs"], "context pack references", ctx);
});

const residentLoopV2PlanReadbackSchema = z.object({
  planRecordEventId: eventIdSchema,
  workspaceId: agentWorkspaceIdSchema,
  residentAgentId: z.literal("agent_default"),
  taskId: agentTaskIdSchema,
  attemptId: agentTaskOrchestrationAttemptIdSchema,
  runId: agentRunIdSchema,
  planId: agentSecretSafeIdSchema(/^plan_[a-zA-Z0-9_-]+$/),
  planRevision: z.number().int().nonnegative()
}).strict();

const residentLoopV2PriorPlanReadbackSchema = residentLoopV2PlanReadbackSchema.extend({
  priorPlanRecordEventId: eventIdSchema
}).strict().superRefine((value, ctx) => {
  if (value.priorPlanRecordEventId !== value.planRecordEventId) {
    ctx.addIssue({
      code: "custom",
      path: ["priorPlanRecordEventId"],
      message: "prior plan readback must carry its exact prior plan record event ID"
    });
  }
});

const residentLoopV2FinalObservationReadbackSchema = z.object({
  observationEventId: eventIdSchema,
  workspaceId: agentWorkspaceIdSchema,
  residentAgentId: z.literal("agent_default"),
  taskId: agentTaskIdSchema,
  attemptId: agentTaskOrchestrationAttemptIdSchema,
  runId: agentRunIdSchema,
  planId: agentSecretSafeIdSchema(/^plan_[a-zA-Z0-9_-]+$/),
  planRevision: z.number().int().nonnegative()
}).strict();

function addResidentLoopV2PlanReadbackIssues(
  value: z.infer<typeof residentLoopV2BindingSchema> & { readonly planId: string; readonly planRevision: number },
  readback: z.infer<typeof residentLoopV2PlanReadbackSchema>,
  path: string,
  ctx: z.RefinementCtx
): void {
  for (const field of ["workspaceId", "residentAgentId", "taskId", "attemptId", "runId", "planId", "planRevision"] as const) {
    if (readback[field] !== value[field]) {
      ctx.addIssue({ code: "custom", path: [path, field], message: `${path} must preserve the exact plan binding` });
    }
  }
}

function addResidentLoopV2FinalObservationReadbackIssues(
  value: z.infer<typeof residentLoopV2BindingSchema> & { readonly planId: string; readonly planRevision: number },
  readback: z.infer<typeof residentLoopV2FinalObservationReadbackSchema>,
  path: string,
  ctx: z.RefinementCtx
): void {
  for (const field of ["workspaceId", "residentAgentId", "taskId", "attemptId", "runId", "planId", "planRevision"] as const) {
    if (readback[field] !== value[field]) {
      ctx.addIssue({ code: "custom", path: [path, field], message: `${path} must preserve the exact observation binding` });
    }
  }
}

const residentLoopV2PlannedStepSchema = z.object({
  ordinal: z.number().int().positive(),
  purpose: secretSafeTextSchema,
  toolId: secretSafeStringSchema.min(3),
  toolVersion: secretSafeStringSchema.min(1),
  allowlistEntryHash: contentHashSchema,
  expectedSafeOutputClass: z.enum(["observation", "derivative", "proposal", "approval-request"]),
  prerequisiteStepOrdinals: z.array(z.number().int().positive())
}).strict();

const agentResidentPlanRecordedV2PayloadSchema = residentLoopV2BindingSchema.extend({
  schemaVersion: z.literal("resident-plan-record.v2"),
  planId: agentSecretSafeIdSchema(/^plan_[a-zA-Z0-9_-]+$/),
  planRevision: z.number().int().nonnegative(),
  priorPlanReadback: residentLoopV2PriorPlanReadbackSchema.nullable(),
  steps: z.array(residentLoopV2PlannedStepSchema).min(1)
}).strict().superRefine((value, ctx) => {
  if ((value.planRevision === 0) !== (value.priorPlanReadback === null)) {
    ctx.addIssue({
      code: "custom",
      path: ["priorPlanReadback"],
      message: "initial plans require null prior readback and replans require an exact prior readback"
    });
  }
  if (value.priorPlanReadback !== null) {
    for (const field of ["workspaceId", "residentAgentId", "taskId", "attemptId", "runId"] as const) {
      if (value.priorPlanReadback[field] !== value[field]) {
        ctx.addIssue({ code: "custom", path: ["priorPlanReadback", field], message: "prior plan readback must preserve loop identity" });
      }
    }
    if (value.priorPlanReadback.planRevision + 1 !== value.planRevision) {
      ctx.addIssue({ code: "custom", path: ["priorPlanReadback", "planRevision"], message: "replans must increment the exact prior plan revision" });
    }
  }
  const ordinals = value.steps.map((step) => step.ordinal);
  if (new Set(ordinals).size !== ordinals.length) {
    ctx.addIssue({ code: "custom", path: ["steps"], message: "planned-step ordinals must be unique" });
  }
  if (ordinals.some((ordinal, index) => index > 0 && ordinal <= ordinals[index - 1]!)) {
    ctx.addIssue({ code: "custom", path: ["steps"], message: "planned steps must be ordered by ordinal" });
  }
});

const agentResidentObservationRecordedV2PayloadSchema = residentLoopV2BindingSchema.extend({
  schemaVersion: z.literal("resident-observation-record.v2"),
  observationId: agentSecretSafeIdSchema(/^observation_[a-zA-Z0-9_-]+$/),
  planId: agentSecretSafeIdSchema(/^plan_[a-zA-Z0-9_-]+$/),
  planRevision: z.number().int().nonnegative(),
  planReadback: residentLoopV2PlanReadbackSchema,
  stepOrdinal: z.number().int().positive(),
  kind: z.enum(["context-verified", "tool-result", "provider-result", "budget", "approval", "recovery", "failure"]),
  safeSummary: secretSafeTextSchema,
  artifactHashes: z.array(contentHashSchema),
  toolRequestId: agentToolRequestIdSchema.optional(),
  modelInvocationEventId: eventIdSchema.optional()
}).strict().superRefine((value, ctx) => addResidentLoopV2PlanReadbackIssues(value, value.planReadback, "planReadback", ctx));

const residentLoopV2GatewayReadbacksSchema = z.object({
  requestEventId: eventIdSchema,
  decisionEventId: eventIdSchema,
  resultEventId: eventIdSchema
}).strict();

const agentResidentToolStepRecordedV2PayloadSchema = residentLoopV2BindingSchema.extend({
  schemaVersion: z.literal("resident-tool-step-record.v2"),
  planId: agentSecretSafeIdSchema(/^plan_[a-zA-Z0-9_-]+$/),
  planRevision: z.number().int().nonnegative(),
  planReadback: residentLoopV2PlanReadbackSchema,
  stepOrdinal: z.number().int().positive(),
  toolRequestId: agentToolRequestIdSchema,
  toolId: secretSafeStringSchema.min(3),
  toolVersion: secretSafeStringSchema.min(1),
  allowlistEntryHash: contentHashSchema,
  sideEffectClass: residentLoopV2ToolSideEffectClassSchema,
  requiredApprovalClass: residentLoopV2ApprovalClassSchema,
  state: z.enum(["requested", "suspended", "executed", "denied", "failed"]),
  previewHash: contentHashSchema,
  gatewayReadbacks: residentLoopV2GatewayReadbacksSchema,
  inputArtifactHashes: z.array(contentHashSchema),
  resultArtifactHashes: z.array(contentHashSchema)
}).strict().superRefine((value, ctx) => addResidentLoopV2PlanReadbackIssues(value, value.planReadback, "planReadback", ctx));

const residentLoopV2CheckpointSchema = z.object({
  checkpointEventId: eventIdSchema,
  requestEventId: eventIdSchema,
  decisionEventId: eventIdSchema,
  resumptionDeadlineAt: z.string().datetime(),
  nextSafeAction: secretSafeStringSchema.min(1)
}).strict();

const agentResidentLoopSuspendedV2PayloadSchema = residentLoopV2BindingSchema.extend({
  schemaVersion: z.literal("resident-loop-suspension.v2"),
  planId: agentSecretSafeIdSchema(/^plan_[a-zA-Z0-9_-]+$/),
  planRevision: z.number().int().nonnegative(),
  planReadback: residentLoopV2PlanReadbackSchema,
  finalObservationReadback: residentLoopV2FinalObservationReadbackSchema,
  suspensionCategory: z.enum(["budget-exhausted", "approval-required", "authority-stale", "context-stale", "provider-unavailable"]),
  checkpoint: residentLoopV2CheckpointSchema
}).strict().superRefine((value, ctx) => {
  addResidentLoopV2PlanReadbackIssues(value, value.planReadback, "planReadback", ctx);
  addResidentLoopV2FinalObservationReadbackIssues(value, value.finalObservationReadback, "finalObservationReadback", ctx);
});

const residentLoopV2HandoffReadbackSchema = z.object({
  outcome: z.literal("verified"),
  handoffId: z.string().regex(/^handoff_[a-zA-Z0-9_-]+_[a-f0-9]{16}$/),
  taskId: agentTaskIdSchema,
  attemptId: agentTaskOrchestrationAttemptIdSchema,
  runId: agentRunIdSchema,
  manifestHash: contentHashSchema,
  finalOutputEventId: eventIdSchema,
  preparedEventId: eventIdSchema,
  recordedEventId: eventIdSchema,
  terminalRunEventId: eventIdSchema,
  taskStatusEventId: eventIdSchema,
  authorityBinding: residentLoopV2AuthoritySchema,
  safeDiagnostics: z.array(z.object({
    category: residentLoopV2ResultCategorySchema,
    nextSafeAction: secretSafeStringSchema.min(1)
  }).strict()).min(1)
}).strict();

const residentLoopV2ResumeAnchorSchema = z.object({
  checkpointEventId: eventIdSchema,
  nextSafeAction: secretSafeStringSchema.min(1),
  resumptionDeadlineAt: z.string().datetime()
}).strict();

const agentResidentLoopResultRecordedV2PayloadSchema = residentLoopV2BindingSchema.extend({
  schemaVersion: z.literal("resident-loop-result.v2"),
  planId: agentSecretSafeIdSchema(/^plan_[a-zA-Z0-9_-]+$/),
  planRevision: z.number().int().nonnegative(),
  planReadback: residentLoopV2PlanReadbackSchema,
  finalObservationReadback: residentLoopV2FinalObservationReadbackSchema,
  outcome: z.enum(["completed", "failed", "resumable"]),
  category: residentLoopV2ResultCategorySchema,
  resultHash: contentHashSchema,
  handoffReadback: residentLoopV2HandoffReadbackSchema.optional(),
  resumeAnchor: residentLoopV2ResumeAnchorSchema.optional()
}).strict().superRefine((value, ctx) => {
  addResidentLoopV2PlanReadbackIssues(value, value.planReadback, "planReadback", ctx);
  addResidentLoopV2FinalObservationReadbackIssues(value, value.finalObservationReadback, "finalObservationReadback", ctx);
  if (value.outcome === "completed") {
    if (value.category !== "handoff-recorded") {
      ctx.addIssue({ code: "custom", path: ["category"], message: "completed results require handoff-recorded category" });
    }
    if (value.handoffReadback === undefined) {
      ctx.addIssue({ code: "custom", path: ["handoffReadback"], message: "completed results require complete H handoff readback proof" });
    } else {
      for (const field of ["taskId", "attemptId", "runId"] as const) {
        if (value.handoffReadback[field] !== value[field]) {
          ctx.addIssue({ code: "custom", path: ["handoffReadback", field], message: "H handoff readback must preserve result identity" });
        }
      }
      if (JSON.stringify(value.handoffReadback.authorityBinding) !== JSON.stringify(value.authority)) {
        ctx.addIssue({ code: "custom", path: ["handoffReadback", "authorityBinding"], message: "H handoff authority must equal mounted authority" });
      }
    }
    if (value.resumeAnchor !== undefined) {
      ctx.addIssue({ code: "custom", path: ["resumeAnchor"], message: "completed results cannot carry a resumable anchor" });
    }
    return;
  }
  if (value.handoffReadback !== undefined) {
    ctx.addIssue({ code: "custom", path: ["handoffReadback"], message: "only completed results may carry H handoff proof" });
  }
  if (value.outcome === "resumable" && value.resumeAnchor === undefined) {
    ctx.addIssue({ code: "custom", path: ["resumeAnchor"], message: "resumable results require a durable resume anchor" });
  }
  if (value.outcome === "failed" && value.resumeAnchor !== undefined) {
    ctx.addIssue({ code: "custom", path: ["resumeAnchor"], message: "failed results cannot carry a resumable anchor" });
  }
});

const triggerIdSchema = agentSecretSafeIdSchema(/^trigger_[a-zA-Z0-9_-]+$/);
const triggerRequestIdSchema = agentSecretSafeIdSchema(/^trq_[a-zA-Z0-9_-]+$/);
const triggerContentHashSchema = contentHashSchema.transform((value) => value as `sha256:${string}`);
const triggerSubjectRefSchema = z.object({
  kind: secretSafeStringSchema.min(1),
  id: secretSafeStringSchema.min(1)
}).strict();
const triggerSourceRefSchema = z.object({
  sourceEventId: eventIdSchema,
  sourceStreamId: secretSafeStringSchema.min(1),
  sourceSequence: z.number().int().positive(),
  sourceKind: secretSafeStringSchema.min(1),
  contentHash: triggerContentHashSchema.optional(),
  observedAt: z.string().datetime()
}).strict();
const triggerHighWaterMarkSchema = z.object({
  workspaceId: agentWorkspaceIdSchema,
  triggerId: triggerIdSchema,
  policyVersion: secretSafeStringSchema.min(1),
  sourcePartition: secretSafeStringSchema.min(1),
  sourceStreamId: secretSafeStringSchema.min(1),
  sourceSequence: z.number().int().positive(),
  sourceEventId: eventIdSchema
}).strict();
const triggerAdmissionScopeSchema = z.object({
  admissionScopeVersion: z.literal("resident-trigger-admission-scope.v1"),
  workspaceId: agentWorkspaceIdSchema,
  residentAgentId: z.literal("agent_default"),
  triggerId: triggerIdSchema,
  policyVersion: secretSafeStringSchema.min(1),
  policyArtifactHash: triggerContentHashSchema,
  cooldownScopeSelector: z.enum(["workspace-trigger", "workspace-trigger-subject"]),
  budgetScopeSelector: z.enum(["workspace-trigger", "workspace-trigger-subject"]),
  policySubjectScope: z.enum(["none", "subject-ref"]),
  scopedSubjectRef: triggerSubjectRefSchema.optional(),
  policySourcePartition: secretSafeStringSchema.min(1)
}).strict().superRefine((scope, ctx) => {
  if (scope.cooldownScopeSelector !== scope.budgetScopeSelector) {
    ctx.addIssue({ code: "custom", path: ["budgetScopeSelector"], message: "trigger cooldown and budget selectors must be equal" });
  }
  if (scope.cooldownScopeSelector === "workspace-trigger" && (scope.policySubjectScope !== "none" || scope.scopedSubjectRef !== undefined)) {
    ctx.addIssue({ code: "custom", path: ["scopedSubjectRef"], message: "workspace-trigger scope cannot carry a subject reference" });
  }
  if (scope.cooldownScopeSelector === "workspace-trigger-subject" && (scope.policySubjectScope !== "subject-ref" || scope.scopedSubjectRef === undefined)) {
    ctx.addIssue({ code: "custom", path: ["scopedSubjectRef"], message: "workspace-trigger-subject scope requires a subject reference" });
  }
});
const triggerRequestProvenanceSchema = z.object({
  descriptorRevision: secretSafeStringSchema.min(1),
  policyVersion: secretSafeStringSchema.min(1),
  policyArtifactHash: triggerContentHashSchema,
  workspaceIdentityEventId: eventIdSchema,
  mountInstanceId: secretSafeStringSchema.min(1),
  mountHash: triggerContentHashSchema,
  lockHash: triggerContentHashSchema,
  evaluationSourceEventIds: z.array(eventIdSchema).min(1),
  causationId: eventIdSchema,
  correlationId: triggerRequestIdSchema
}).strict();

const agentTriggerRequestedPayloadSchema = z.object({
  requestId: triggerRequestIdSchema,
  dedupeKey: triggerContentHashSchema,
  requestFingerprint: triggerContentHashSchema,
  admissionScope: triggerAdmissionScopeSchema,
  triggerGateKey: triggerContentHashSchema,
  residentAgentId: z.literal("agent_default"),
  workspaceId: agentWorkspaceIdSchema,
  triggerId: triggerIdSchema,
  triggerFamily: z.enum([
    "prr-monitoring",
    "ingestion-production",
    "evidence-gap-contradiction",
    "investigation-cadence",
    "workspace-recovery"
  ]),
  policyVersion: secretSafeStringSchema.min(1),
  policyArtifactHash: triggerContentHashSchema,
  subjectRef: triggerSubjectRefSchema,
  sourceRefs: z.array(triggerSourceRefSchema).min(1),
  sourceHighWaterMark: triggerHighWaterMarkSchema,
  requestedRunType: secretSafeStringSchema.min(1),
  provenance: triggerRequestProvenanceSchema
}).strict().superRefine((request, ctx) => {
  const ordered = [...request.sourceRefs].sort((left, right) =>
    left.sourceStreamId.localeCompare(right.sourceStreamId) ||
    left.sourceSequence - right.sourceSequence ||
    left.sourceEventId.localeCompare(right.sourceEventId)
  );
  if (ordered.some((source, index) => source !== request.sourceRefs[index])) {
    ctx.addIssue({ code: "custom", path: ["sourceRefs"], message: "trigger source refs must be canonically sorted" });
  }
  const high = ordered[ordered.length - 1]!;
  if (
    request.sourceHighWaterMark.workspaceId !== request.workspaceId ||
    request.sourceHighWaterMark.triggerId !== request.triggerId ||
    request.sourceHighWaterMark.policyVersion !== request.policyVersion ||
    request.sourceHighWaterMark.sourcePartition !== request.admissionScope.policySourcePartition ||
    request.sourceHighWaterMark.sourceStreamId !== high.sourceStreamId ||
    request.sourceHighWaterMark.sourceSequence !== high.sourceSequence ||
    request.sourceHighWaterMark.sourceEventId !== high.sourceEventId
  ) {
    ctx.addIssue({ code: "custom", path: ["sourceHighWaterMark"], message: "trigger high-water must bind the canonical final source ref" });
  }
  const scope = request.admissionScope;
  if (
    scope.workspaceId !== request.workspaceId ||
    scope.residentAgentId !== request.residentAgentId ||
    scope.triggerId !== request.triggerId ||
    scope.policyVersion !== request.policyVersion ||
    scope.policyArtifactHash !== request.policyArtifactHash ||
    (scope.scopedSubjectRef !== undefined && (scope.scopedSubjectRef.kind !== request.subjectRef.kind || scope.scopedSubjectRef.id !== request.subjectRef.id))
  ) {
    ctx.addIssue({ code: "custom", path: ["admissionScope"], message: "trigger admission scope must bind the request identity" });
  }
  if (
    request.provenance.policyVersion !== request.policyVersion ||
    request.provenance.policyArtifactHash !== request.policyArtifactHash ||
    request.provenance.correlationId !== request.requestId ||
    request.provenance.causationId !== request.sourceRefs[0]!.sourceEventId ||
    request.provenance.evaluationSourceEventIds.length !== request.sourceRefs.length ||
    request.provenance.evaluationSourceEventIds.some((eventId, index) => eventId !== request.sourceRefs[index]!.sourceEventId)
  ) {
    ctx.addIssue({ code: "custom", path: ["provenance"], message: "trigger provenance must bind the canonical source set" });
  }
  const identity = deterministicTriggerRequestIdentity(request);
  if (
    request.requestFingerprint !== identity.requestFingerprint ||
    request.requestId !== identity.requestId ||
    request.dedupeKey !== identity.dedupeKey
  ) {
    ctx.addIssue({ code: "custom", path: ["requestFingerprint"], message: "trigger identity must match the canonical persisted request" });
  }
});

function deterministicTriggerRequestIdentity(request: {
  residentAgentId: string;
  workspaceId: string;
  triggerId: string;
  triggerFamily: string;
  policyVersion: string;
  policyArtifactHash: string;
  subjectRef: unknown;
  sourceRefs: unknown;
  sourceHighWaterMark: unknown;
  requestedRunType: string;
  provenance: { descriptorRevision: string; workspaceIdentityEventId: string; causationId: string };
}): { requestFingerprint: string; requestId: string; dedupeKey: string } {
  const requestFingerprint = triggerSha256(triggerCanonicalJson({
    fingerprintVersion: "resident-trigger-request-fingerprint.v1",
    residentAgentId: request.residentAgentId,
    workspaceId: request.workspaceId,
    triggerId: request.triggerId,
    triggerFamily: request.triggerFamily,
    descriptorRevision: request.provenance.descriptorRevision,
    policyVersion: request.policyVersion,
    policyArtifactHash: request.policyArtifactHash,
    subjectRef: request.subjectRef,
    requestedRunType: request.requestedRunType,
    sourceRefs: request.sourceRefs,
    sourceHighWaterMark: request.sourceHighWaterMark,
    workspaceIdentityEventId: request.provenance.workspaceIdentityEventId,
    causationId: request.provenance.causationId
  }));
  return {
    requestFingerprint,
    requestId: triggerRequestIdFor(requestFingerprint),
    dedupeKey: triggerSha256(triggerCanonicalJson({ dedupeVersion: "resident-trigger-dedupe.v1", requestFingerprint }))
  };
}

function triggerCanonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(triggerCanonicalJson).join(",")}]`;
  if (typeof value !== "object") throw new Error("non-json canonical trigger input");
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${triggerCanonicalJson(record[key])}`).join(",")}}`;
}

const triggerSha256Constants = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
] as const;

function triggerSha256(value: string): `sha256:${string}` {
  const input = new TextEncoder().encode(value);
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
  const bytes = new Uint8Array(paddedLength);
  bytes.set(input);
  bytes[input.length] = 0x80;
  const bitLength = input.length * 8;
  const view = new DataView(bytes.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x1_0000_0000), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);
  const state = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const words = new Uint32Array(64);
  const rotateRight = (word: number, bits: number) => (word >>> bits) | (word << (32 - bits));
  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4, false);
    for (let index = 16; index < 64; index += 1) {
      const first = words[index - 15]!;
      const second = words[index - 2]!;
      const sigma0 = rotateRight(first, 7) ^ rotateRight(first, 18) ^ (first >>> 3);
      const sigma1 = rotateRight(second, 17) ^ rotateRight(second, 19) ^ (second >>> 10);
      words[index] = (words[index - 16]! + sigma0 + words[index - 7]! + sigma1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = state as [number, number, number, number, number, number, number, number];
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temporary1 = (h + sum1 + choice + triggerSha256Constants[index]! + words[index]!) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }
    state[0] = (state[0]! + a) >>> 0;
    state[1] = (state[1]! + b) >>> 0;
    state[2] = (state[2]! + c) >>> 0;
    state[3] = (state[3]! + d) >>> 0;
    state[4] = (state[4]! + e) >>> 0;
    state[5] = (state[5]! + f) >>> 0;
    state[6] = (state[6]! + g) >>> 0;
    state[7] = (state[7]! + h) >>> 0;
  }
  return `sha256:${state.map((word) => word.toString(16).padStart(8, "0")).join("")}`;
}

function triggerRequestIdFor(fingerprint: string): string {
  const bytes = Array.from({ length: 32 }, (_, index) => Number.parseInt(fingerprint.slice(7 + index * 2, 9 + index * 2), 16));
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return `trq_${output}`;
}

const agentSpecialistRunStartedPayloadSchema = z.object({
  runId: agentRunIdSchema,
  residentAgentId: residentAgentIdSchema,
  runType: agentSpecialistRunTypeSchema,
  startedBy: actorIdSchema,
  taskId: agentTaskIdSchema.optional(),
  workspaceId: agentWorkspaceIdSchema.optional(),
  investigationId: secretSafeStringSchema.min(3).optional(),
  sourceEventIds: agentSourceEventIdsSchema.optional(),
  inputArtifactHashes: agentArtifactHashesSchema.optional()
}).strict();

const agentSpecialistRunStepKindSchema = z.enum([
  "audit",
  "model-review",
  "tool-request",
  "local-derivative",
  "final-output"
]);

const agentSpecialistRunStepRecordedPayloadSchema = z.object({
  runId: agentRunIdSchema,
  stepId: agentRunStepIdSchema,
  summary: secretSafeTextSchema,
  stepKind: agentSpecialistRunStepKindSchema.optional(),
  stepSchemaId: secretSafeStringSchema.min(1).optional(),
  idempotencyKey: secretSafeStringSchema.min(1).optional(),
  handoffMaterialArtifactHash: agentArtifactHashSchema.optional(),
  sourceEventIds: agentSourceEventIdsSchema.optional(),
  inputArtifactHashes: agentArtifactHashesSchema.optional(),
  outputArtifactHashes: agentArtifactHashesSchema.optional(),
  invocationId: agentInvocationIdSchema.optional(),
  toolRequestId: agentToolRequestIdSchema.optional()
}).strict();

const agentSpecialistHandoffStatusSchema = z.enum([
  "ready-for-review",
  "waiting-for-approval",
  "blocked",
  "failed"
]);

function expectedAgentSpecialistHandoffIdempotencyKey(value: {
  readonly runId: string;
  readonly taskId?: string | undefined;
  readonly runType: string;
  readonly status: string;
  readonly handoffManifestHash: string;
}): string {
  return `specialist-handoff:${value.runId}:${value.taskId ?? "none"}:${value.runType}:${value.status}:${value.handoffManifestHash}`;
}

const agentSpecialistHandoffCompactBindingObjectSchema = z.object({
  handoffId: z.string().regex(/^handoff_[a-zA-Z0-9_-]+_[a-f0-9]{16}$/),
  handoffRevision: z.number().int().positive(),
  idempotencyKey: z.string().min(1),
  handoffManifestHash: contentHashSchema,
  handoffDtoHash: contentHashSchema,
  handoffMaterialArtifactHash: contentHashSchema,
  runId: z.string().regex(/^run_[a-zA-Z0-9_-]+$/),
  taskId: z.string().regex(/^task_[a-zA-Z0-9_-]+$/).optional(),
  runType: agentSpecialistRunTypeSchema,
  residentAgentId: z.literal("agent_default"),
  status: agentSpecialistHandoffStatusSchema,
  safeSummary: secretSafeStringSchema,
  finalOutputStepId: z.string().min(3),
  finalOutputEventId: z.string().regex(/^evt_[a-zA-Z0-9_-]+$/),
  contextPackHashes: z.array(contentHashSchema),
  promptArtifactHash: contentHashSchema.optional(),
  outputArtifactHashes: z.array(contentHashSchema),
  toolRequestIds: z.array(z.string().regex(/^toolreq_[a-zA-Z0-9_-]+$/)),
  sourceEventIds: z.array(z.string().regex(/^evt_[a-zA-Z0-9_-]+$/)),
  relatedEventIds: z.array(z.string().regex(/^evt_[a-zA-Z0-9_-]+$/)),
  supersedesHandoffId: z.string().regex(/^handoff_[a-zA-Z0-9_-]+_[a-f0-9]{16}$/).optional(),
  supersedesEventId: z.string().regex(/^evt_[a-zA-Z0-9_-]+$/).optional()
}).strict();

function addAgentSpecialistHandoffIdempotencyIssue(
  value: z.infer<typeof agentSpecialistHandoffCompactBindingObjectSchema>,
  ctx: z.RefinementCtx
): void {
  if (value.idempotencyKey !== expectedAgentSpecialistHandoffIdempotencyKey(value)) {
    ctx.addIssue({
      code: "custom",
      path: ["idempotencyKey"],
      message: "must match the deterministic specialist handoff idempotency key"
    });
  }
}

const agentSpecialistHandoffCompactBindingSchema = agentSpecialistHandoffCompactBindingObjectSchema
  .superRefine((value, ctx) => addAgentSpecialistHandoffIdempotencyIssue(value, ctx));

const agentSpecialistHandoffPreparedPayloadSchema = agentSpecialistHandoffCompactBindingSchema;

const agentSpecialistHandoffRecordedPayloadSchema = agentSpecialistHandoffCompactBindingObjectSchema.extend({
  preparedEventId: z.string().regex(/^evt_[a-zA-Z0-9_-]+$/),
  verifiedAt: z.string().datetime()
}).strict().superRefine((value, ctx) => addAgentSpecialistHandoffIdempotencyIssue(value, ctx));

const agentSpecialistRunCompletedPayloadSchema = z.object({
  runId: agentRunIdSchema,
  completedAt: z.string().datetime(),
  outputArtifactHashes: agentArtifactHashesSchema,
  relatedEventIds: agentSourceEventIdsSchema.optional(),
  summary: secretSafeTextSchema.optional()
}).strict();

const agentSpecialistRunFailedPayloadSchema = z.object({
  runId: agentRunIdSchema,
  failedAt: z.string().datetime(),
  category: agentFailureCategorySchema,
  message: secretSafeTextSchema,
  retryable: z.boolean(),
  allowedActions: agentSafeActionsSchema,
  relatedEventIds: agentSourceEventIdsSchema.optional(),
  toolRequestId: agentToolRequestIdSchema.optional()
}).strict();

const agentModelInvocationRequestedPayloadSchema = z.object({
  invocationId: agentInvocationIdSchema,
  runId: agentRunIdSchema,
  providerId: agentProviderIdSchema,
  modelFamily: secretSafeStringSchema.min(1),
  inputArtifactHash: agentArtifactHashSchema,
  safetyClass: z.enum(["workspace-safe", "public-safe", "sensitive-local-only", "provider-approved"]),
  credentialRefId: agentCredentialRefIdSchema.optional(),
  credentialKind: agentCredentialKindSchema.optional(),
  contextPackRefs: z.array(agentContextPackRefSchema).optional(),
  promptTemplateId: secretSafeStringSchema.min(1).optional(),
  promptTemplateVersion: z.number().int().positive().optional(),
  runType: agentSpecialistRunTypeSchema.optional(),
  safePromptSummary: secretSafeTextSchema.optional(),
  omissions: z.array(agentPromptArtifactOmissionSchema).optional(),
  transferApprovalClass: z.enum(["none", "provider-byte-transfer"]).optional(),
  production: agentProductionPromptAuditBindingSchema.optional()
}).strict();

const agentModelInvocationCompletedPayloadSchema = z.object({
  invocationId: agentInvocationIdSchema,
  runId: agentRunIdSchema,
  providerId: agentProviderIdSchema,
  outputArtifactHash: agentArtifactHashSchema,
  completedAt: z.string().datetime(),
  modelFamily: secretSafeStringSchema.min(1).optional(),
  usage: z.object({
    inputTokens: z.number().int().nonnegative().optional(),
    outputTokens: z.number().int().nonnegative().optional(),
    totalTokens: z.number().int().nonnegative().optional()
  }).strict().optional()
}).strict();

const agentModelInvocationFailedPayloadSchema = z.object({
  invocationId: agentInvocationIdSchema,
  runId: agentRunIdSchema,
  providerId: agentProviderIdSchema,
  category: agentFailureCategorySchema,
  message: secretSafeTextSchema,
  retryable: z.boolean(),
  allowedActions: agentSafeActionsSchema
}).strict();

const agentToolRequestedPayloadSchema = z.object({
  toolRequestId: agentToolRequestIdSchema,
  runId: agentRunIdSchema,
  toolId: secretSafeStringSchema.min(3),
  toolVersion: secretSafeStringSchema.min(1),
  requestedBy: residentAgentIdSchema,
  sideEffectClass: agentToolSideEffectClassSchema,
  requiredApprovalClass: agentToolApprovalClassSchema,
  previewHash: agentArtifactHashSchema,
  scope: secretSafeTextSchema,
  estimatedEffect: secretSafeTextSchema,
  sourceEventIds: agentSourceEventIdsSchema.optional(),
  inputArtifactHashes: agentArtifactHashesSchema.optional()
}).strict().superRefine((toolRequest, ctx) => {
  if (!agentApprovalClassMatchesSideEffect(toolRequest.sideEffectClass, toolRequest.requiredApprovalClass)) {
    ctx.addIssue({
      code: "custom",
      path: ["requiredApprovalClass"],
      message: "requiredApprovalClass must match the sideEffectClass risk"
    });
  }
});

const agentToolApprovedPayloadSchema = z.object({
  toolRequestId: agentToolRequestIdSchema,
  approvedBy: actorIdSchema,
  approvedPreviewHash: agentArtifactHashSchema,
  approvalClass: agentToolApprovalClassSchema,
  rationale: secretSafeTextSchema,
  approvedAt: z.string().datetime().optional()
}).strict();

const agentToolExecutionClaimedPayloadSchema = z.object({
  toolRequestId: agentToolRequestIdSchema,
  claimedBy: actorIdSchema,
  claimedAt: z.string().datetime(),
  approvedPreviewHash: agentArtifactHashSchema,
  leaseExpiresAt: z.string().datetime()
}).strict().superRefine((claim, ctx) => {
  if (Date.parse(claim.leaseExpiresAt) <= Date.parse(claim.claimedAt)) {
    ctx.addIssue({
      code: "custom",
      path: ["leaseExpiresAt"],
      message: "leaseExpiresAt must be after claimedAt"
    });
  }
});

const agentToolDeniedPayloadSchema = z.object({
  toolRequestId: agentToolRequestIdSchema,
  deniedBy: actorIdSchema,
  rationale: secretSafeTextSchema,
  deniedAt: z.string().datetime().optional(),
  approvalClass: agentToolApprovalClassSchema.optional()
}).strict();

const agentToolCompletedPayloadSchema = z.object({
  toolRequestId: agentToolRequestIdSchema,
  completedAt: z.string().datetime(),
  eventIds: agentSourceEventIdsSchema,
  artifactHashes: agentArtifactHashesSchema,
  readModelChanges: z.array(agentReadModelChangeSchema),
  resultSummary: secretSafeTextSchema
}).strict();

const agentToolFailedPayloadSchema = z.object({
  toolRequestId: agentToolRequestIdSchema,
  failedAt: z.string().datetime(),
  category: agentFailureCategorySchema,
  message: secretSafeTextSchema,
  retryable: z.boolean(),
  allowedActions: agentSafeActionsSchema
}).strict();

const agentMemoryRecordedPayloadSchema = z.object({
  memoryId: agentMemoryIdSchema,
  residentAgentId: residentAgentIdSchema,
  scope: agentMemoryScopeSchema,
  memoryKind: agentMemoryKindSchema.optional(),
  summary: secretSafeTextSchema,
  sourceEventIds: agentSourceEventIdsSchema.optional(),
  artifactHashes: agentArtifactHashesSchema.optional(),
  confidence: z.number().min(0).max(1),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional()
}).strict().superRefine((memory, ctx) => {
  if ((memory.sourceEventIds?.length ?? 0) === 0 && (memory.artifactHashes?.length ?? 0) === 0) {
    ctx.addIssue({
      code: "custom",
      path: ["sourceEventIds"],
      message: "memory requires sourceEventIds or artifactHashes provenance"
    });
  }
});

const agentMemorySupersededPayloadSchema = z.object({
  memoryId: agentMemoryIdSchema,
  supersededByMemoryId: agentMemoryIdSchema,
  supersededBy: actorIdSchema,
  rationale: secretSafeTextSchema,
  supersededAt: z.string().datetime().optional()
}).strict();

const agentMemoryRetractedPayloadSchema = z.object({
  memoryId: agentMemoryIdSchema,
  retractedBy: actorIdSchema,
  rationale: secretSafeTextSchema,
  retractedAt: z.string().datetime().optional()
}).strict();

const agentPermissionGrantedPayloadSchema = z.object({
  permissionId: agentPermissionIdSchema,
  residentAgentId: residentAgentIdSchema,
  grantedBy: actorIdSchema,
  scope: secretSafeTextSchema,
  sideEffectClasses: z.array(agentToolSideEffectClassSchema).min(1),
  rationale: secretSafeTextSchema,
  grantedAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional()
}).strict();

const agentPermissionRevokedPayloadSchema = z.object({
  permissionId: agentPermissionIdSchema,
  revokedBy: actorIdSchema,
  rationale: secretSafeTextSchema,
  revokedAt: z.string().datetime().optional()
}).strict();

const agentLockActivatedPayloadSchema = z.object({
  lockId: agentLockIdSchema,
  residentAgentId: residentAgentIdSchema,
  kind: agentLockKindSchema,
  activatedBy: actorIdSchema,
  reason: secretSafeTextSchema,
  activatedAt: z.string().datetime().optional(),
  relatedEventIds: agentSourceEventIdsSchema.optional()
}).strict();

const agentLockClearedPayloadSchema = z.object({
  lockId: agentLockIdSchema,
  clearedBy: actorIdSchema,
  rationale: secretSafeTextSchema,
  clearedAt: z.string().datetime().optional(),
  relatedEventIds: agentSourceEventIdsSchema.optional()
}).strict();
const evidenceIdSchema = z.string().regex(/^ev_[a-zA-Z0-9_-]+$/);
const legacyReportIdSchema = z.string().regex(/^legacy_report_[a-zA-Z0-9_-]+$/);
const legacyStagingBatchIdSchema = z.string().regex(/^legacy_stage_[a-zA-Z0-9_-]+$/);
const legacyCandidateIdSchema = z.string().regex(/^legacy_candidate_[a-zA-Z0-9_-]+$/);
const ingestionAdapterRefSchema = z.object({ name: z.string().min(1), version: z.string().min(1) }).strict();
const secretSafeIngestionAdapterRefSchema = z.object({
  name: secretSafeStringSchema.min(1),
  version: secretSafeStringSchema.min(1)
}).strict();

const ingestionTotalsSchema = z.object({
  observedFiles: z.number().int().nonnegative(),
  uniqueContent: z.number().int().nonnegative(),
  duplicateOccurrences: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  bytes: z.number().int().nonnegative(),
  estimatedNewBlobBytes: z.number().int().nonnegative()
}).strict();

const ingestionImportTotalsSchema = z.object({
  evidenceCreated: z.number().int().nonnegative(),
  occurrencesLinked: z.number().int().nonnegative(),
  duplicatesReused: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative()
}).strict();

const legacyReportTotalsSchema = z.object({
  inspectedFiles: z.number().int().nonnegative(),
  candidateMetadataFiles: z.number().int().nonnegative(),
  proposedAssertionCandidates: z.number().int().nonnegative(),
  quarantineEntries: z.number().int().nonnegative(),
  unresolvedReferences: z.number().int().nonnegative()
}).strict();

const ingestionSourceRegisteredPayloadSchema = z.object({
  sourceCollectionId: sourceCollectionIdSchema,
  label: z.string().min(1),
  mode: z.literal("read-only"),
  adapter: ingestionAdapterRefSchema,
  rootUri: z.string().min(1),
  workspaceUri: z.string().min(1)
}).strict();

const ingestionScanStartedPayloadSchema = z.object({
  scanBatchId: scanBatchIdSchema,
  sourceCollectionId: sourceCollectionIdSchema,
  hashPolicy: z.string().min(1),
  startedAt: z.string().datetime()
}).strict();

const archiveOccurrenceFields = ["containerPath", "containerHash", "internalPath", "archiveAdapter"] as const;

const ingestionOccurrenceObservedPayloadSchema = z.object({
  occurrenceId: occurrenceIdSchema,
  scanBatchId: scanBatchIdSchema,
  sourceCollectionId: sourceCollectionIdSchema,
  contentHash: contentHashSchema,
  sourcePath: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  observedAt: z.string().datetime(),
  status: z.enum(["new", "duplicate", "changed", "missing", "skipped"]),
  adapter: ingestionAdapterRefSchema.optional(),
  containerPath: z.string().min(1).optional(),
  containerHash: contentHashSchema.optional(),
  internalPath: z.string().min(1).optional(),
  archiveAdapter: ingestionAdapterRefSchema.optional()
}).strict().superRefine((occurrence, ctx) => {
  const presentArchiveFields = archiveOccurrenceFields.filter((field) => occurrence[field] !== undefined);

  if (presentArchiveFields.length > 0 && presentArchiveFields.length < archiveOccurrenceFields.length) {
    ctx.addIssue({
      code: "custom",
      path: ["containerPath"],
      message: "archive occurrence provenance fields must be provided together"
    });
  }
});

const ingestionScanCompletedPayloadSchema = z.object({
  scanBatchId: scanBatchIdSchema,
  sourceCollectionId: sourceCollectionIdSchema,
  completedAt: z.string().datetime(),
  inventoryHash: contentHashSchema,
  totals: ingestionTotalsSchema
}).strict();

const ingestionImportApprovedPayloadSchema = z.object({
  importBatchId: importBatchIdSchema,
  scanBatchId: scanBatchIdSchema,
  sourceCollectionId: sourceCollectionIdSchema,
  approvedBy: z.string().min(3),
  approvedAt: z.string().datetime()
}).strict();

const ingestionImportCompletedPayloadSchema = z.object({
  importBatchId: importBatchIdSchema,
  scanBatchId: scanBatchIdSchema,
  sourceCollectionId: sourceCollectionIdSchema,
  completedAt: z.string().datetime(),
  totals: ingestionImportTotalsSchema
}).strict();

const ingestionEvidenceLinkedPayloadSchema = z.object({
  evidenceId: evidenceIdSchema,
  importBatchId: importBatchIdSchema,
  sourceCollectionId: sourceCollectionIdSchema,
  contentHash: contentHashSchema,
  occurrenceIds: z.array(occurrenceIdSchema).min(1)
}).strict();

const ingestionParseJobCreatedPayloadSchema = z.object({
  parseJobId: parseJobIdSchema,
  sourceCollectionId: sourceCollectionIdSchema,
  importBatchId: importBatchIdSchema,
  evidenceId: evidenceIdSchema,
  lane: z.enum(["local", "provider"]),
  parser: ingestionAdapterRefSchema,
  state: z.enum(["queued", "running"])
}).strict();

const ingestionParseCompletedPayloadSchema = z.object({
  parseJobId: parseJobIdSchema,
  sourceCollectionId: sourceCollectionIdSchema,
  importBatchId: importBatchIdSchema,
  evidenceId: evidenceIdSchema,
  lane: z.enum(["local", "provider"]),
  parser: ingestionAdapterRefSchema,
  outputHash: contentHashSchema,
  outputMediaType: z.string().min(1),
  completedAt: z.string().datetime()
}).strict();

const ingestionParseFailedPayloadSchema = z.object({
  parseJobId: parseJobIdSchema,
  sourceCollectionId: sourceCollectionIdSchema,
  importBatchId: importBatchIdSchema,
  evidenceId: evidenceIdSchema,
  lane: z.enum(["local", "provider"]),
  parser: ingestionAdapterRefSchema,
  failedAt: z.string().datetime(),
  message: z.string().min(1),
  retryable: z.boolean()
}).strict();

const ingestionProviderApprovedPayloadSchema = z.object({
  providerJobId: providerJobIdSchema,
  sourceCollectionId: sourceCollectionIdSchema,
  importBatchId: importBatchIdSchema,
  provider: secretSafeIngestionAdapterRefSchema,
  approvedBy: secretSafeStringSchema.min(3),
  approvedAt: z.string().datetime(),
  eligibleMediaTypes: z.array(secretSafeStringSchema.min(1)).min(1),
  maxBytesPerFile: z.number().int().positive(),
  policy: z.literal("send-all-technically-eligible")
}).strict();

const legacyImportReportGeneratedPayloadSchema = z.object({
  legacyReportId: legacyReportIdSchema,
  sourceCollectionId: sourceCollectionIdSchema,
  scanBatchId: scanBatchIdSchema,
  reportHash: contentHashSchema,
  candidateSetHash: contentHashSchema,
  generatedAt: z.string().datetime(),
  generator: secretSafeIngestionAdapterRefSchema,
  totals: legacyReportTotalsSchema
}).strict();

const legacyOntologyStagingApprovedPayloadSchema = z.object({
  stagingBatchId: legacyStagingBatchIdSchema,
  legacyReportId: legacyReportIdSchema,
  sourceCollectionId: sourceCollectionIdSchema,
  scanBatchId: scanBatchIdSchema,
  reportHash: contentHashSchema,
  candidateSetHash: contentHashSchema,
  approvedBy: secretSafeStringSchema.min(3),
  approvedAt: z.string().datetime(),
  approvedAssertionCandidateIds: z.array(legacyCandidateIdSchema)
}).strict();

const governanceTagSchema = z.enum([
  "public_record",
  "public_safe",
  "contains_pii",
  "source_identity",
  "private_correspondence",
  "legal_risk",
  "credential_risk",
  "export_restricted",
  "law_enforcement_sensitive"
]);

const governancePolicyRefSchema = z.object({
  policyId: z.string().regex(/^gov_policy_[a-zA-Z0-9_-]+$/),
  version: z.string().min(1)
}).strict();

const governanceTagDecisionSchema = z.object({
  tag: governanceTagSchema,
  confidence: z.number().min(0).max(1),
  rationale: secretSafeTextSchema
}).strict();

const governanceClassifierSchema = z.object({
  actorId: z.string().min(3),
  kind: z.enum(["ai", "human", "system", "ruleset"]),
  label: secretSafeTextSchema,
  model: secretSafeTextSchema.optional(),
  tool: secretSafeTextSchema.optional()
}).strict();

const governancePolicyInstalledPayloadSchema = z.object({
  policyId: z.string().regex(/^gov_policy_[a-zA-Z0-9_-]+$/),
  version: z.string().min(1),
  installedBy: z.string().min(3),
  confidenceThreshold: z.number().min(0).max(1),
  tags: z.array(z.object({
    tag: governanceTagSchema,
    description: secretSafeTextSchema,
    defaultExportBehavior: z.enum(["include-by-default", "exclude-unless-opted-in"]),
    unlocksNormalWorkflowsAtHighConfidence: z.boolean()
  }).strict()).min(1)
}).strict();

const evidenceGovernanceClassifiedPayloadSchema = z.object({
  evidenceId: z.string().regex(/^ev_[a-zA-Z0-9_-]+$/),
  evidenceEventId: z.string().regex(/^evt_[a-zA-Z0-9_-]+$/),
  contentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  policy: governancePolicyRefSchema,
  classifier: governanceClassifierSchema,
  tags: z.array(governanceTagDecisionSchema).min(1)
}).strict();

const evidenceGovernanceReviewedPayloadSchema = z.object({
  evidenceId: z.string().regex(/^ev_[a-zA-Z0-9_-]+$/),
  reviewedBy: z.string().min(3),
  policy: governancePolicyRefSchema,
  decisions: z.array(z.object({
    tag: governanceTagSchema,
    action: z.enum(["affirm", "add", "remove", "supersede"]),
    rationale: secretSafeTextSchema,
    supersedesEventId: z.string().regex(/^evt_[a-zA-Z0-9_-]+$/).optional()
  }).strict()).min(1)
}).strict();

const evidenceRedactionAppliedPayloadSchema = z.object({
  evidenceId: z.string().regex(/^ev_[a-zA-Z0-9_-]+$/),
  redactionId: z.string().regex(/^redaction_[a-zA-Z0-9_-]+$/),
  appliedBy: z.string().min(3),
  rationale: secretSafeTextSchema,
  redactedContentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional()
}).strict();

const evidenceQuarantinedPayloadSchema = z.object({
  evidenceId: z.string().regex(/^ev_[a-zA-Z0-9_-]+$/),
  quarantineId: z.string().regex(/^quarantine_[a-zA-Z0-9_-]+$/),
  quarantinedBy: z.string().min(3),
  reason: secretSafeTextSchema,
  lockLevel: z.enum(["workflow", "export", "all"])
}).strict();

const evidenceTombstonedPayloadSchema = z.object({
  evidenceId: z.string().regex(/^ev_[a-zA-Z0-9_-]+$/),
  tombstoneId: z.string().regex(/^tombstone_[a-zA-Z0-9_-]+$/),
  tombstonedBy: z.string().min(3),
  reason: secretSafeTextSchema
}).strict();

const networkExposureEnabledPayloadSchema = z.object({
  exposureId: z.string().regex(/^netexp_[a-zA-Z0-9_-]+$/),
  mode: z.enum(["lan", "tailnet"]),
  bindScope: z.enum(["lan", "tailnet"]),
  enabledBy: z.string().min(3),
  enabledAt: z.string().datetime(),
  visibleWarning: z.literal(true),
  policy: governancePolicyRefSchema
}).strict();

const networkExposureDisabledPayloadSchema = z.object({
  exposureId: z.string().regex(/^netexp_[a-zA-Z0-9_-]+$/),
  disabledBy: z.string().min(3),
  disabledAt: z.string().datetime(),
  reason: secretSafeTextSchema
}).strict();

const deviceSessionApprovedPayloadSchema = z.object({
  sessionId: z.string().regex(/^devsess_[a-zA-Z0-9_-]+$/),
  deviceLabel: secretSafeTextSchema,
  approvedBy: z.string().min(3),
  approvedAt: z.string().datetime(),
  exposureId: z.string().regex(/^netexp_[a-zA-Z0-9_-]+$/),
  capabilities: z.array(z.enum(["read", "write"])).min(1),
  policy: governancePolicyRefSchema
}).strict();

const deviceSessionRevokedPayloadSchema = z.object({
  sessionId: z.string().regex(/^devsess_[a-zA-Z0-9_-]+$/),
  revokedBy: z.string().min(3),
  revokedAt: z.string().datetime(),
  reason: secretSafeTextSchema
}).strict();

const sensitiveOptInSchema = z.object({
  tag: governanceTagSchema,
  approvedBy: z.string().min(3),
  rationale: secretSafeTextSchema
}).strict();

const exportGeneratedPayloadSchema = z.object({
  exportId: z.string().regex(/^exp_[a-zA-Z0-9_-]+$/),
  generatedBy: z.string().min(3),
  generatedAt: z.string().datetime(),
  policy: governancePolicyRefSchema,
  includedEvidenceIds: z.array(z.string().regex(/^ev_[a-zA-Z0-9_-]+$/)),
  includedContentHashes: z.array(z.string().regex(/^sha256:[a-f0-9]{64}$/)),
  sensitiveOptIns: z.array(sensitiveOptInSchema),
  defaultPublicSafeOnly: z.boolean()
}).strict();

const reportGeneratedPayloadSchema = z.object({
  reportId: z.string().regex(/^report_[a-zA-Z0-9_-]+$/),
  generatedBy: z.string().min(3),
  generatedAt: z.string().datetime(),
  policy: governancePolicyRefSchema,
  includedEvidenceIds: z.array(z.string().regex(/^ev_[a-zA-Z0-9_-]+$/)),
  includedContentHashes: z.array(z.string().regex(/^sha256:[a-f0-9]{64}$/)),
  sensitiveOptIns: z.array(sensitiveOptInSchema),
  defaultPublicSafeOnly: z.boolean()
}).strict();

const incidentRecordedPayloadSchema = z.object({
  incidentId: z.string().regex(/^incident_[a-zA-Z0-9_-]+$/),
  severity: z.enum(["info", "warning", "error", "critical"]),
  category: z.enum(["classification", "secret-leak", "export", "network", "device", "quarantine", "projection"]),
  recordedBy: z.string().min(3),
  summary: secretSafeTextSchema,
  relatedEvidenceIds: z.array(z.string().regex(/^ev_[a-zA-Z0-9_-]+$/)),
  relatedEventIds: z.array(z.string().regex(/^evt_[a-zA-Z0-9_-]+$/))
}).strict();

const incidentRepairRecordedPayloadSchema = z.object({
  incidentId: z.string().regex(/^incident_[a-zA-Z0-9_-]+$/),
  repairId: z.string().regex(/^repair_[a-zA-Z0-9_-]+$/),
  severity: z.enum(["info", "warning", "error", "critical"]),
  category: z.enum(["classification", "secret-leak", "export", "network", "device", "quarantine", "projection"]),
  repairedBy: z.string().min(3),
  repairedAt: z.string().datetime(),
  action: secretSafeTextSchema,
  relatedEvidenceIds: z.array(z.string().regex(/^ev_[a-zA-Z0-9_-]+$/)),
  relatedEventIds: z.array(z.string().regex(/^evt_[a-zA-Z0-9_-]+$/)),
  closesIncident: z.boolean()
}).strict();

const prrStatusSchema = z.enum([
  "draft",
  "sent",
  "acknowledged",
  "inNegotiation",
  "awaitingProduction",
  "partiallyProduced",
  "produced",
  "denied",
  "appealed",
  "closed"
]);

const correspondenceProviderSchema = z.enum(["gmail", "imap-smtp", "himalaya"]);
const rawMetadataKeySchema = z.string().min(1).refine((key) => !/token|secret|password|oauth|credential|config/i.test(key), {
  message: "rawMetadata keys must not reference secrets or credentials"
});
const rawMetadataSchema = z.record(rawMetadataKeySchema, z.string());

const jurisdictionPackRefSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1)
}).strict();

const prrContactSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().min(3).optional()
}).strict();

const prrRequestCreatedPayloadSchema = z.object({
  prrRequestId: z.string().regex(/^prr_[a-zA-Z0-9_-]+$/),
  jurisdictionPack: jurisdictionPackRefSchema,
  agency: prrContactSchema,
  requester: prrContactSchema,
  requestText: z.string().min(1),
  status: z.literal("draft")
}).strict();

const prrRequestSentPayloadSchema = z.object({
  prrRequestId: z.string().regex(/^prr_[a-zA-Z0-9_-]+$/),
  correspondenceId: z.string().regex(/^corr_[a-zA-Z0-9_-]+$/),
  provider: correspondenceProviderSchema,
  providerMessageId: z.string().min(1),
  providerThreadId: z.string().min(1).optional(),
  idempotencyKey: z.string().min(1),
  subject: z.string().min(1),
  bodyHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  attachmentEvidenceIds: z.array(z.string().regex(/^ev_[a-zA-Z0-9_-]+$/)),
  sentAt: z.string().datetime(),
  approvedBy: z.string().min(3),
  rawMetadata: rawMetadataSchema
}).strict();

const prrCorrespondenceReceivedPayloadSchema = z.object({
  prrRequestId: z.string().regex(/^prr_[a-zA-Z0-9_-]+$/),
  correspondenceId: z.string().regex(/^corr_[a-zA-Z0-9_-]+$/),
  provider: correspondenceProviderSchema,
  providerMessageId: z.string().min(1),
  providerThreadId: z.string().min(1).optional(),
  subject: z.string().min(1),
  from: prrContactSchema,
  receivedAt: z.string().datetime(),
  bodyHash: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional(),
  evidenceIds: z.array(z.string().regex(/^ev_[a-zA-Z0-9_-]+$/))
}).strict();

const prrRequestRefSchema = z.object({
  prrRequestId: z.string().regex(/^prr_[a-zA-Z0-9_-]+$/)
}).strict();

const citedRuleSchema = z.object({
  jurisdictionPack: jurisdictionPackRefSchema,
  label: z.string().min(1),
  citation: z.string().min(1),
  url: z.string().url().optional()
}).strict();

const prrFollowupDraftedPayloadSchema = prrRequestRefSchema.extend({
  correspondenceId: z.string().regex(/^corr_[a-zA-Z0-9_-]+$/),
  subject: z.string().min(1),
  bodyHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  citedRules: z.array(citedRuleSchema)
}).strict();

const prrFollowupSentPayloadSchema = prrRequestRefSchema.extend({
  correspondenceId: z.string().regex(/^corr_[a-zA-Z0-9_-]+$/),
  provider: correspondenceProviderSchema,
  providerMessageId: z.string().min(1),
  subject: z.string().min(1),
  bodyHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  sentAt: z.string().datetime(),
  approvedBy: z.string().min(3)
}).strict();

const prrDeadlineEstimatedPayloadSchema = prrRequestRefSchema.extend({
  deadlineDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  confidence: z.enum(["statutory", "workflow"]),
  explanation: z.string().min(1),
  citedRules: z.array(citedRuleSchema).min(1)
}).strict();

const prrDeadlineConfirmedPayloadSchema = prrRequestRefSchema.extend({
  deadlineDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  confirmedBy: z.string().min(3),
  rationale: z.string().min(1),
  citedRules: z.array(citedRuleSchema).min(1)
}).strict();

const prrFeeEstimatedPayloadSchema = prrRequestRefSchema.extend({
  amountCents: z.number().int().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  sourceEvidenceId: z.string().regex(/^ev_[a-zA-Z0-9_-]+$/).optional()
}).strict();

const prrFeeChallengedPayloadSchema = prrRequestRefSchema.extend({
  feeChallengeId: z.string().regex(/^fee_challenge_[a-zA-Z0-9_-]+$/),
  amountCents: z.number().int().nonnegative(),
  rationale: z.string().min(1),
  approvedBy: z.string().min(3),
  citedRules: z.array(citedRuleSchema)
}).strict();

const prrScopeNarrowingProposedPayloadSchema = prrRequestRefSchema.extend({
  narrowingId: z.string().regex(/^narrow_[a-zA-Z0-9_-]+$/),
  proposedScope: z.string().min(1),
  proposedBy: z.string().min(3),
  sourceEvidenceId: z.string().regex(/^ev_[a-zA-Z0-9_-]+$/).optional()
}).strict();

const prrScopeNarrowingAcceptedPayloadSchema = prrRequestRefSchema.extend({
  narrowingId: z.string().regex(/^narrow_[a-zA-Z0-9_-]+$/),
  acceptedScope: z.string().min(1),
  acceptedBy: z.string().min(3),
  rationale: z.string().min(1)
}).strict();

const prrProductionReceivedPayloadSchema = prrRequestRefSchema.extend({
  productionId: z.string().regex(/^prod_[a-zA-Z0-9_-]+$/),
  label: z.string().min(1),
  receivedAt: z.string().datetime(),
  evidenceIds: z.array(z.string().regex(/^ev_[a-zA-Z0-9_-]+$/)).min(1)
}).strict();

const prrExemptionClaimedPayloadSchema = prrRequestRefSchema.extend({
  exemptionId: z.string().regex(/^exemption_[a-zA-Z0-9_-]+$/),
  claimedBy: z.string().min(1),
  citedRules: z.array(citedRuleSchema).min(1),
  sourceEvidenceId: z.string().regex(/^ev_[a-zA-Z0-9_-]+$/).optional()
}).strict();

const prrDenialRecordedPayloadSchema = prrRequestRefSchema.extend({
  denialId: z.string().regex(/^denial_[a-zA-Z0-9_-]+$/),
  receivedAt: z.string().datetime(),
  reason: z.string().min(1),
  sourceEvidenceId: z.string().regex(/^ev_[a-zA-Z0-9_-]+$/).optional()
}).strict();

const prrAppealCreatedPayloadSchema = prrRequestRefSchema.extend({
  appealId: z.string().regex(/^appeal_[a-zA-Z0-9_-]+$/),
  correspondenceId: z.string().regex(/^corr_[a-zA-Z0-9_-]+$/),
  filedAt: z.string().datetime(),
  approvedBy: z.string().min(3),
  citedRules: z.array(citedRuleSchema)
}).strict();

const stallingSignalSchema = z.object({
  kind: z.enum([
    "deadline-breached",
    "repeated-vague-delays",
    "high-fee-estimate",
    "silence-after-followup",
    "narrowing-pressure",
    "exemption-review-needed"
  ]),
  explanation: z.string().min(1)
}).strict();

const prrStallingDetectedPayloadSchema = prrRequestRefSchema.extend({
  detectedAt: z.string().datetime(),
  signals: z.array(stallingSignalSchema).min(1)
}).strict();

const prrStallingConfirmedPayloadSchema = prrRequestRefSchema.extend({
  confirmedBy: z.string().min(3),
  rationale: z.string().min(1),
  signalKinds: z.array(stallingSignalSchema.shape.kind).min(1)
}).strict();

const prrLegalEscalationConfirmedPayloadSchema = prrRequestRefSchema.extend({
  confirmedBy: z.string().min(3),
  rationale: z.string().min(1),
  citedRules: z.array(citedRuleSchema).min(1),
  evidenceIds: z.array(z.string().regex(/^ev_[a-zA-Z0-9_-]+$/)).min(1)
}).strict();

const prrRequestClosedPayloadSchema = prrRequestRefSchema.extend({
  closedAt: z.string().datetime(),
  closedBy: z.string().min(3),
  reason: z.enum(["fulfilled", "withdrawn", "abandoned", "denied-final", "merged"])
}).strict();

export const payloadSchemas = {
  "evidence.ingested": evidenceIngestedPayloadSchema,
  "assertion.proposed": assertionProposedPayloadSchema,
  "assertion.accepted": assertionAcceptedPayloadSchema,
  "entity.resolved": entityResolvedPayloadSchema,
  "relationship.accepted": relationshipAcceptedPayloadSchema,
  "claim.created": claimCreatedPayloadSchema,
  "diagnostic.recorded": diagnosticRecordedPayloadSchema,
  "ontology.pack.installed": ontologyPackInstalledPayloadSchema,
  "projection.checkpointed": projectionCheckpointedPayloadSchema,
  "agent.identity.initialized": agentIdentityInitializedPayloadSchema,
  "agent.identity.updated": agentIdentityUpdatedPayloadSchema,
  "agent.policy.installed": agentPolicyInstalledPayloadSchema,
  "agent.task.created": agentTaskCreatedPayloadSchema,
  "agent.task.status.changed": agentTaskStatusChangedPayloadSchema,
  "agent.task.orchestration.claimed": agentTaskOrchestrationClaimedPayloadSchema,
  "agent.task.orchestration.checkpointed": agentTaskOrchestrationCheckpointedPayloadSchema,
  "agent.task.orchestration.released": agentTaskOrchestrationReleasedPayloadSchema,
  "agent.task.orchestration.completed": agentTaskOrchestrationCompletedPayloadSchema,
  "agent.task.orchestration.failed": agentTaskOrchestrationFailedPayloadSchema,
  "agent.resident-plan.recorded.v1": agentResidentPlanRecordedPayloadSchema,
  "agent.resident-observation.recorded.v1": agentResidentObservationRecordedPayloadSchema,
  "agent.resident-tool-step.recorded.v1": agentResidentToolStepRecordedPayloadSchema,
  "agent.resident-loop.suspended.v1": agentResidentLoopSuspendedPayloadSchema,
  "agent.resident-loop.result.recorded.v1": agentResidentLoopResultRecordedPayloadSchema,
  "agent.resident-plan.recorded.v2": agentResidentPlanRecordedV2PayloadSchema,
  "agent.resident-observation.recorded.v2": agentResidentObservationRecordedV2PayloadSchema,
  "agent.resident-tool-step.recorded.v2": agentResidentToolStepRecordedV2PayloadSchema,
  "agent.resident-loop.suspended.v2": agentResidentLoopSuspendedV2PayloadSchema,
  "agent.resident-loop.result.recorded.v2": agentResidentLoopResultRecordedV2PayloadSchema,
  "agent.trigger.requested.v1": agentTriggerRequestedPayloadSchema,
  "agent.specialist-run.started": agentSpecialistRunStartedPayloadSchema,
  "agent.specialist-run.step.recorded": agentSpecialistRunStepRecordedPayloadSchema,
  "agent.specialist-run.completed": agentSpecialistRunCompletedPayloadSchema,
  "agent.specialist-run.failed": agentSpecialistRunFailedPayloadSchema,
  "agent.specialist-handoff.prepared": agentSpecialistHandoffPreparedPayloadSchema,
  "agent.specialist-handoff.recorded": agentSpecialistHandoffRecordedPayloadSchema,
  "agent.model-invocation.requested": agentModelInvocationRequestedPayloadSchema,
  "agent.model-invocation.completed": agentModelInvocationCompletedPayloadSchema,
  "agent.model-invocation.failed": agentModelInvocationFailedPayloadSchema,
  "agent.tool.requested": agentToolRequestedPayloadSchema,
  "agent.tool.approved": agentToolApprovedPayloadSchema,
  "agent.tool.execution.claimed": agentToolExecutionClaimedPayloadSchema,
  "agent.tool.denied": agentToolDeniedPayloadSchema,
  "agent.tool.completed": agentToolCompletedPayloadSchema,
  "agent.tool.failed": agentToolFailedPayloadSchema,
  "agent.memory.recorded": agentMemoryRecordedPayloadSchema,
  "agent.memory.superseded": agentMemorySupersededPayloadSchema,
  "agent.memory.retracted": agentMemoryRetractedPayloadSchema,
  "agent.permission.granted": agentPermissionGrantedPayloadSchema,
  "agent.permission.revoked": agentPermissionRevokedPayloadSchema,
  "agent.lock.activated": agentLockActivatedPayloadSchema,
  "agent.lock.cleared": agentLockClearedPayloadSchema,
  "ingestion.source.registered": ingestionSourceRegisteredPayloadSchema,
  "ingestion.scan.started": ingestionScanStartedPayloadSchema,
  "ingestion.scan.completed": ingestionScanCompletedPayloadSchema,
  "ingestion.occurrence.observed": ingestionOccurrenceObservedPayloadSchema,
  "ingestion.import.approved": ingestionImportApprovedPayloadSchema,
  "ingestion.import.completed": ingestionImportCompletedPayloadSchema,
  "ingestion.evidence.linked": ingestionEvidenceLinkedPayloadSchema,
  "ingestion.parse.job.created": ingestionParseJobCreatedPayloadSchema,
  "ingestion.parse.completed": ingestionParseCompletedPayloadSchema,
  "ingestion.parse.failed": ingestionParseFailedPayloadSchema,
  "ingestion.provider.approved": ingestionProviderApprovedPayloadSchema,
  "legacy.import.report.generated": legacyImportReportGeneratedPayloadSchema,
  "legacy.ontology.staging.approved": legacyOntologyStagingApprovedPayloadSchema,
  "governance.policy.installed": governancePolicyInstalledPayloadSchema,
  "evidence.governance.classified": evidenceGovernanceClassifiedPayloadSchema,
  "evidence.governance.reviewed": evidenceGovernanceReviewedPayloadSchema,
  "evidence.redaction.applied": evidenceRedactionAppliedPayloadSchema,
  "evidence.quarantined": evidenceQuarantinedPayloadSchema,
  "evidence.tombstoned": evidenceTombstonedPayloadSchema,
  "network.exposure.enabled": networkExposureEnabledPayloadSchema,
  "network.exposure.disabled": networkExposureDisabledPayloadSchema,
  "device.session.approved": deviceSessionApprovedPayloadSchema,
  "device.session.revoked": deviceSessionRevokedPayloadSchema,
  "export.generated": exportGeneratedPayloadSchema,
  "report.generated": reportGeneratedPayloadSchema,
  "incident.recorded": incidentRecordedPayloadSchema,
  "incident.repair.recorded": incidentRepairRecordedPayloadSchema,
  "prr.request.created": prrRequestCreatedPayloadSchema,
  "prr.request.sent": prrRequestSentPayloadSchema,
  "prr.correspondence.received": prrCorrespondenceReceivedPayloadSchema,
  "prr.followup.drafted": prrFollowupDraftedPayloadSchema,
  "prr.followup.sent": prrFollowupSentPayloadSchema,
  "prr.deadline.estimated": prrDeadlineEstimatedPayloadSchema,
  "prr.deadline.confirmed": prrDeadlineConfirmedPayloadSchema,
  "prr.fee.estimated": prrFeeEstimatedPayloadSchema,
  "prr.fee.challenged": prrFeeChallengedPayloadSchema,
  "prr.scope.narrowing.proposed": prrScopeNarrowingProposedPayloadSchema,
  "prr.scope.narrowing.accepted": prrScopeNarrowingAcceptedPayloadSchema,
  "prr.production.received": prrProductionReceivedPayloadSchema,
  "prr.exemption.claimed": prrExemptionClaimedPayloadSchema,
  "prr.denial.recorded": prrDenialRecordedPayloadSchema,
  "prr.appeal.created": prrAppealCreatedPayloadSchema,
  "prr.stalling.detected": prrStallingDetectedPayloadSchema,
  "prr.stalling.confirmed": prrStallingConfirmedPayloadSchema,
  "prr.legal-escalation.confirmed": prrLegalEscalationConfirmedPayloadSchema,
  "prr.request.closed": prrRequestClosedPayloadSchema
} as const;

export type KnowledgeEventType = keyof typeof payloadSchemas;

type PayloadByEventType = {
  [Type in KnowledgeEventType]: z.infer<(typeof payloadSchemas)[Type]>;
};

export interface EventContract {
  type: KnowledgeEventType;
  version: 1;
  description: string;
  agentGuidance: string;
  invariants: string[];
  examples?: unknown[];
  counterexamples?: unknown[];
  allowedTransitions?: string[];
  migrations?: string[];
  queryExamples?: string[];
}

type EventContractMap = {
  [Type in KnowledgeEventType]: EventContract & { type: Type };
};

export const eventContracts = {
  "evidence.ingested": {
    type: "evidence.ingested",
    version: 1,
    description: "Records that raw evidence entered Cestus with source metadata and a content hash.",
    agentGuidance: "Use this before any assertion is proposed. Store large payloads outside the ledger and reference them by hash.",
    invariants: ["contentHash must be sha256", "evidenceId must be stable"]
  },
  "assertion.proposed": {
    type: "assertion.proposed",
    version: 1,
    description: "Records a candidate fact extracted or written from evidence before human or policy review.",
    agentGuidance: "Never create this without evidenceId. Use reviewState proposed and let review events promote it.",
    invariants: ["evidenceId is required", "confidence is between 0 and 1"]
  },
  "assertion.accepted": {
    type: "assertion.accepted",
    version: 1,
    description: "Records review acceptance of a previously proposed assertion.",
    agentGuidance: "Use this only when a reviewer or trusted policy accepts a specific assertion.",
    invariants: ["assertionId must reference a proposed assertion", "rationale is required"]
  },
  "entity.resolved": {
    type: "entity.resolved",
    version: 1,
    description: "Records that assertions resolve into a durable shared entity.",
    agentGuidance: "Use after evidence-backed assertions justify the entity identity.",
    invariants: ["at least one assertionId is required"]
  },
  "relationship.accepted": {
    type: "relationship.accepted",
    version: 1,
    description: "Records an accepted relationship between two resolved entities.",
    agentGuidance: "Use only when relationship evidence is represented by accepted assertions.",
    invariants: ["fromEntityId and toEntityId are required", "assertionIds cannot be empty"]
  },
  "claim.created": {
    type: "claim.created",
    version: 1,
    description: "Records an investigation-specific claim or hypothesis.",
    agentGuidance: "Use claims for uncertain or investigation-local reasoning instead of polluting shared graph truth.",
    invariants: ["investigationId is required", "statement is required"]
  },
  "diagnostic.recorded": {
    type: "diagnostic.recorded",
    version: 1,
    description: "Records structured operational or investigative diagnostics tied to ontology work.",
    agentGuidance: "Use when validation, ingestion, projection, migration, or deduplication produces inspectable failure state.",
    invariants: ["repairHint must include allowed actions", "diagnostic text fields must be secret-safe"]
  },
  "ontology.pack.installed": {
    type: "ontology.pack.installed",
    version: 1,
    description: "Records installation of a core, organization, or investigation ontology pack.",
    agentGuidance: "Use for governed ontology changes. Do not mutate pack scope silently.",
    invariants: ["packName and packVersion are required"]
  },
  "projection.checkpointed": {
    type: "projection.checkpointed",
    version: 1,
    description: "Records projection high-water mark and rebuild status.",
    agentGuidance: "Use to make projection state inspectable and rebuildable from the ledger.",
    invariants: ["highWaterMark cannot be negative"]
  },
  "agent.identity.initialized": {
    type: "agent.identity.initialized",
    version: 1,
    description: "Records the default resident Cestus Agent identity for a workspace.",
    agentGuidance: "Required provenance fields: residentAgentId, workspaceId, policyId, initializedBy, and context actor. Forbidden autonomous effects: this does not grant permissions, clear locks, or accept graph state.",
    invariants: ["residentAgentId must route the stream", "workspaceId is required", "identity initialization does not imply provider credentials"]
  },
  "agent.identity.updated": {
    type: "agent.identity.updated",
    version: 1,
    description: "Records a reviewed update to resident agent identity metadata or capabilities.",
    agentGuidance: "Required provenance fields: residentAgentId, updatedBy, rationale, and human context actor. Forbidden autonomous effects: the resident agent must not update its own identity or expand capabilities without human review.",
    invariants: ["context actor must be human", "residentAgentId must route the stream", "updates are append-only"]
  },
  "agent.policy.installed": {
    type: "agent.policy.installed",
    version: 1,
    description: "Records installation of a resident-agent capability policy and gate classes.",
    agentGuidance: "Required provenance fields: policyId, residentAgentId, installedBy, credentialKinds, allowedRunTypes, and human context actor. Forbidden autonomous effects: policy install must not approve provider byte transfer, PRR sends, export, repair, or legal escalation.",
    invariants: ["context actor must be human", "policyId must route the stream", "credential kinds are references to allowed auth classes only"]
  },
  "agent.task.created": {
    type: "agent.task.created",
    version: 1,
    description: "Records a durable user or workflow task for the resident agent.",
    agentGuidance: "Required provenance fields: taskId, residentAgentId, requestedBy, priority, and context actor, with sourceEventIds or inputArtifactHashes when available. Forbidden autonomous effects: task creation is not permission to execute external actions.",
    invariants: ["taskId must route the stream", "priority must be explicit", "tasks do not mutate domain state by themselves"]
  },
  "agent.task.status.changed": {
    type: "agent.task.status.changed",
    version: 1,
    description: "Records an append-only status transition for a resident-agent task.",
    agentGuidance: "Required provenance fields: taskId, status, changedBy, and optional runId when a run caused the transition. Forbidden autonomous effects: status changes must not stand in for approvals or domain events.",
    invariants: ["taskId must route the stream", "status must use the agent task status set", "terminal status does not delete task history"]
  },
  "agent.task.orchestration.claimed": {
    type: "agent.task.orchestration.claimed",
    version: 1,
    description: "Records a lease-backed claim on one resident task and specialist run-type boundary.",
    agentGuidance: "Required provenance fields: taskId, runType, stable attemptId, retryGeneration, leaseClaimGeneration, workerId, lease bounds, selected ordering position, active budget snapshot, and causationEventId. This is distinct from agent.tool.execution.claimed and must not execute approved tools or domain effects.",
    invariants: [
      "task orchestration claims route to agent_task_orchestration_<taskId>_<runType>",
      "retryGeneration is required",
      "leaseExpiresAt must be after claimedAt",
      "claim events do not approve provider transfer or domain execution"
    ]
  },
  "agent.task.orchestration.checkpointed": {
    type: "agent.task.orchestration.checkpointed",
    version: 1,
    description: "Records restart-safe orchestration progress, including approval waits and recoverable handoff boundaries.",
    agentGuidance: "Bind refs, content hashes, schema IDs, byte counts, provenance event IDs, source event IDs, input artifact hashes, provider posture, prompt artifact hashes, approval request IDs, lock snapshots, and safe next actions only. Never store resolved context payload bytes, rendered prompt text, synthetic approval proof, domainProof, or raw provider material.",
    invariants: [
      "retryGeneration is required",
      "approval-wait checkpoints require exact run, tool request, approval, context, source, input artifact, prompt, provider, and lock metadata",
      "context bindings are refs and hashes only",
      "checkpoint events do not hold the worker lease indefinitely"
    ]
  },
  "agent.task.orchestration.released": {
    type: "agent.task.orchestration.released",
    version: 1,
    description: "Records release of a task orchestration lease for approval suspension, stale recovery, budget blocking, handoff pending, cancellation, or worker shutdown.",
    agentGuidance: "Use after an approval-wait checkpoint or when recovery makes the current lease inactive. Releasing a task orchestration claim does not release or claim any approved-tool execution request.",
    invariants: [
      "retryGeneration is required",
      "claimEventId is required",
      "releaseReason must be explicit",
      "task orchestration release is separate from tool execution claims"
    ]
  },
  "agent.task.orchestration.completed": {
    type: "agent.task.orchestration.completed",
    version: 1,
    description: "Records that the orchestrator observed final output, durable handoff preparation, handoff recording, verified readback, and terminal run completion for an attempt.",
    agentGuidance: "Append only after the durable handoff lane records and reads back the canonical handoff and the specialist run has a terminal completion event. Completion must precede a causally linked agent.task.status.changed terminal event and must not be inferred from output hashes alone.",
    invariants: [
      "retryGeneration is required",
      "handoffReadback is required",
      "specialistRunCompletedEventId is required",
      "completion does not execute PRR send, export, legal escalation, repair, or accepted graph review"
    ]
  },
  "agent.task.orchestration.failed": {
    type: "agent.task.orchestration.failed",
    version: 1,
    description: "Records a terminal or operator-repairable safe failure for one resident task orchestration attempt.",
    agentGuidance: "Use when retry, provider, context, handoff, policy, lock, or projection conditions block the attempt. Failure diagnostics must be secret-safe and must not fabricate provider proof, approvals, handoffs, or domain effects.",
    invariants: [
      "retryGeneration is required",
      "message must be secret-safe",
      "allowedActions must be explicit",
      "failed attempts remain replayable"
    ]
  },
  "agent.resident-plan.recorded.v1": {
    type: "agent.resident-plan.recorded.v1",
    version: 1,
    description: "Records the immutable resident-loop plan admission for one task, attempt, and run.",
    agentGuidance: "Bind the resident identity, task/attempt/run, policy, authority, source and context hashes, budget, causation, correlation, and descriptor hash. Append the plan before later records read back its assigned event ID. This is a schema record only and does not authorize a provider, tool, scheduler, store, projection, or domain effect.",
    invariants: ["residentAgentId is agent_default", "task/attempt/run identity is explicit", "policy and authority hashes are content-addressed", "plan records remain replayable"]
  },
  "agent.resident-observation.recorded.v1": {
    type: "agent.resident-observation.recorded.v1",
    version: 1,
    description: "Records one resident-loop observation bound to an exact resident plan readback.",
    agentGuidance: "Carry the same resident identity, policy, authority, source, context, budget, causation, and correlation bindings as the plan. The plan readback task, attempt, and run must match this record; do not treat an observation as tool approval or execution.",
    invariants: ["plan readback identity must match", "observation ordinal is positive", "unknown fields and unsafe object shapes are rejected"]
  },
  "agent.resident-tool-step.recorded.v1": {
    type: "agent.resident-tool-step.recorded.v1",
    version: 1,
    description: "Records a resident-loop tool-step fact bound to its plan readback and gateway references.",
    agentGuidance: "Bind the exact plan readback, tool request/event IDs, tool version, preview hash, policy, authority, budget, source, context, causation, and correlation. This record is not a tool approval or execution.",
    invariants: ["plan readback identity must match", "previewHash is content-addressed", "tool step records do not grant an effect"]
  },
  "agent.resident-loop.suspended.v1": {
    type: "agent.resident-loop.suspended.v1",
    version: 1,
    description: "Records an explicitly resumable resident-loop suspension with plan and final-observation readbacks.",
    agentGuidance: "Use only with exact task/attempt/run-matching plan and observation readbacks, an explicit safe suspension category, and a resume idempotency key. Suspension does not bypass any later tool or provider gate.",
    invariants: ["both readbacks must match the resident identity", "suspension category is explicit", "resume key is required"]
  },
  "agent.resident-loop.result.recorded.v1": {
    type: "agent.resident-loop.result.recorded.v1",
    version: 1,
    description: "Records a terminal resident-loop result only with exact plan, final-observation, and terminal readbacks.",
    agentGuidance: "Bind task/attempt/run, policy, authority, budget, source, context, causation, correlation, plan and final-observation readbacks, result hash, and terminal readback. Never emit terminal-looking completion without its required readback; this record does not send PRRs, execute tools, or accept graph state.",
    invariants: ["all readback identities must match", "terminalReadback is required", "resultHash is content-addressed", "result records do not authorize an effect"]
  },
  "agent.resident-plan.recorded.v2": {
    type: "agent.resident-plan.recorded.v2",
    version: 1,
    description: "Records a strict versioned resident plan with complete descriptor, policy, authority, source/context, and ten-counter bindings.",
    agentGuidance: "Bind the resident/workspace/task/attempt/run identity, exact workflow descriptor, policy identity, ordered sources and context packs, mounted authority, all budget ceilings and consumed/remaining values, plan ID/revision, and prior plan readback. This parser records no store, provider, tool, scheduler, or graph effect.",
    invariants: ["v1 plan behavior remains unchanged", "authority policy hash equals bound policy", "ten counters reconcile exactly", "replans bind the exact prior readback"]
  },
  "agent.resident-observation.recorded.v2": {
    type: "agent.resident-observation.recorded.v2",
    version: 1,
    description: "Records a strict resident observation bound to an exact v2 plan readback and complete mounted loop binding.",
    agentGuidance: "Carry the exact plan ID/revision/readback plus descriptor, policy, authority, source/context, ten-counter, causation, and correlation bindings. This observation does not grant a tool, provider, or domain effect.",
    invariants: ["plan readback preserves workspace and loop identity", "budget reconciles exactly", "unknown and unsafe own-data are rejected"]
  },
  "agent.resident-tool-step.recorded.v2": {
    type: "agent.resident-tool-step.recorded.v2",
    version: 1,
    description: "Records a strict resident tool-step binding with exact allowlist, preview, durable gateway readbacks, and artifact hashes.",
    agentGuidance: "Bind exact tool ID/version, allowlist hash, side-effect and approval classes, preview, request/decision/result readbacks, input/output artifact hashes, and the complete v2 plan equality surface. This event never authorizes or completes a tool effect.",
    invariants: ["tool identity is exact", "all durable gateway readbacks are present", "tool-step records do not grant an effect"]
  },
  "agent.resident-loop.suspended.v2": {
    type: "agent.resident-loop.suspended.v2",
    version: 1,
    description: "Records a strict resumable resident-loop suspension with exact plan and final-observation readbacks plus durable checkpoint/deadline proof.",
    agentGuidance: "Bind the complete v2 loop surface, exact plan and observation readbacks, and a durable checkpoint with request/decision references and resumption deadline. Suspension is not completion and does not authorize continuation after restart.",
    invariants: ["both readbacks preserve the exact loop binding", "checkpoint and deadline are required", "suspension remains nonterminal"]
  },
  "agent.resident-loop.result.recorded.v2": {
    type: "agent.resident-loop.result.recorded.v2",
    version: 1,
    description: "Records a strict terminal or resumable resident-loop outcome with exact plan/observation and H lifecycle proof where completion is claimed.",
    agentGuidance: "A completed handoff-recorded result carries the complete H readback verbatim with exact identity, lifecycle, provenance, authority, and safe diagnostics. A resumable result carries only a durable resume anchor. Incomplete terminal-looking values fail closed.",
    invariants: ["completed results require verified complete H proof", "resumable results require a durable anchor", "results do not authorize external or graph effects"]
  },
  "agent.trigger.requested.v1": {
    type: "agent.trigger.requested.v1",
    version: 1,
    description: "Records one provenance-bound demand for the default resident to consider an eligible authoritative workspace fact.",
    agentGuidance: "Append only through mounted conditional admission and exact event readback. Persist canonical fingerprint, deterministic request ID, dedupe key, admission scope, gate key, sources, high-water, policy, mount, lock, and causation bindings. This request is demand only: it does not create a prompt, provider invocation, approval, task claim, handoff, artifact, scheduler action, parser action, or graph mutation.",
    invariants: ["residentAgentId is agent_default", "source refs and high-water are canonical", "admission scope is persisted", "request records are append-only and replayable"]
  },
  "agent.specialist-run.started": {
    type: "agent.specialist-run.started",
    version: 1,
    description: "Records the start of a specialist workflow under the resident identity.",
    agentGuidance: "Required provenance fields: runId, residentAgentId, runType, startedBy, and sourceEventIds or inputArtifactHashes when scoped evidence exists. Forbidden autonomous effects: a run start must not import accepted truth, send messages, or transfer provider bytes.",
    invariants: ["runId must route the stream", "runType must use the approved specialist vocabulary", "providers are not agent identities"]
  },
  "agent.specialist-run.step.recorded": {
    type: "agent.specialist-run.step.recorded",
    version: 1,
    description: "Records a summarized reasoning, model, or tool step for a specialist run.",
    agentGuidance: "Required provenance fields: runId, stepId, summary, and any invocationId, toolRequestId, sourceEventIds, or artifact hashes that caused the step. Forbidden autonomous effects: step records are audit notes, not accepted ontology facts.",
    invariants: ["runId must route the stream", "summary must be secret-safe", "steps do not bypass tool approval"]
  },
  "agent.specialist-run.completed": {
    type: "agent.specialist-run.completed",
    version: 1,
    description: "Records completion of a specialist run with output artifact references.",
    agentGuidance: "Required provenance fields: runId, completedAt, outputArtifactHashes, and relatedEventIds when domain events were produced. Forbidden autonomous effects: completion must not imply PRR send, legal escalation, export, or accepted graph changes.",
    invariants: ["runId must route the stream", "outputs are content-addressed", "completion preserves replay order"]
  },
  "agent.specialist-run.failed": {
    type: "agent.specialist-run.failed",
    version: 1,
    description: "Records a secret-safe specialist run failure and allowed repair actions.",
    agentGuidance: "Required provenance fields: runId, failedAt, category, message, retryable, and allowedActions. Forbidden autonomous effects: failure recovery must not clear locks, approve tools, or retry external effects without the required gate.",
    invariants: ["runId must route the stream", "message must be secret-safe", "allowedActions must be explicit"]
  },
  "agent.specialist-handoff.prepared": {
    type: "agent.specialist-handoff.prepared",
    version: 1,
    description: "Records a compact, content-addressed specialist handoff prepared from a final output step.",
    agentGuidance: "Required provenance fields: handoffId, handoffRevision, runId, finalOutputStepId, finalOutputEventId, manifest and DTO hashes, and all source artifact references. Store no raw DTO or output content. Forbidden autonomous effects: preparation does not approve, dispatch, or accept the handoff.",
    invariants: ["runId must route the stream", "handoff artifacts are content-addressed", "final output references are explicit"]
  },
  "agent.specialist-handoff.recorded": {
    type: "agent.specialist-handoff.recorded",
    version: 1,
    description: "Records verification of a prepared compact specialist handoff on its originating run stream.",
    agentGuidance: "Required provenance fields: the complete compact binding, preparedEventId, verifiedAt, and final-output references. Store no raw DTO or output content. Forbidden autonomous effects: recording does not execute a tool, send a message, or accept graph state.",
    invariants: ["runId must route the stream", "preparedEventId is explicit", "verification is append-only"]
  },
  "agent.model-invocation.requested": {
    type: "agent.model-invocation.requested",
    version: 1,
    description: "Records a requested model invocation through a provider adapter.",
    agentGuidance: "Required provenance fields: invocationId, runId, providerId, modelFamily, inputArtifactHash, safetyClass, and optional credentialRefId. Prompt artifact audit metadata may include context pack refs, prompt template ID/version, run type, omission records, safe prompt summary, and transfer approval class; never store prompt text. Forbidden autonomous effects: this event does not send bytes unless a separate approved tool or provider gate permits it.",
    invariants: ["invocationId must route the stream", "credentialRefId must be an ID reference only", "inputArtifactHash must be sha256"]
  },
  "agent.model-invocation.completed": {
    type: "agent.model-invocation.completed",
    version: 1,
    description: "Records successful model invocation output and safe usage metadata.",
    agentGuidance: "Required provenance fields: invocationId, runId, providerId, outputArtifactHash, and completedAt. Forbidden autonomous effects: model output is derivative material and must not become accepted graph state without evidence-backed review.",
    invariants: ["invocationId must route the stream", "outputArtifactHash must be sha256", "usage metadata must be nonnegative when present"]
  },
  "agent.model-invocation.failed": {
    type: "agent.model-invocation.failed",
    version: 1,
    description: "Records a secret-safe model provider failure for a resident-agent run.",
    agentGuidance: "Required provenance fields: invocationId, runId, providerId, category, retryable, and allowedActions. Forbidden autonomous effects: do not store raw provider errors, credentials, or retry provider calls past approval boundaries.",
    invariants: ["invocationId must route the stream", "message must be secret-safe", "credential failures expose no secret value"]
  },
  "agent.tool.requested": {
    type: "agent.tool.requested",
    version: 1,
    description: "Records a typed resident-agent tool request with side-effect and approval class.",
    agentGuidance: "Required provenance fields: toolRequestId, runId, toolId, sideEffectClass, requiredApprovalClass, previewHash, scope, estimatedEffect, and source artifacts when available. The exact preview hash binds any later approval; changed previews require a new approval. Forbidden autonomous effects: this request does not execute external byte transfer, messages, export, repair, legal escalation, or accepted graph review.",
    invariants: ["toolRequestId must route the stream", "previewHash must be sha256", "approval must bind the exact preview hash"]
  },
  "agent.tool.approved": {
    type: "agent.tool.approved",
    version: 1,
    description: "Records human approval for a specific resident-agent tool request preview.",
    agentGuidance: "Required provenance fields: toolRequestId, approvedBy, approvedPreviewHash, approvalClass, rationale, and human context actor. Forbidden autonomous effects: an agent actor must not approve its own tools or broaden approval beyond the bound preview hash.",
    invariants: ["context actor must be human", "toolRequestId must route the stream", "approvedPreviewHash must match the reviewed preview"]
  },
  "agent.tool.execution.claimed": {
    type: "agent.tool.execution.claimed",
    version: 1,
    description: "Records a scheduler execution claim for an approved tool request before descriptor side effects run.",
    agentGuidance: "Append this through the tool gateway using expected stream sequence semantics after consume-time validation and before executeApproved. The lease lets a later wake retry if the claiming process dies before terminal completion or failure.",
    invariants: ["toolRequestId must route the stream", "approvedPreviewHash must match the approved preview", "leaseExpiresAt must be after claimedAt"]
  },
  "agent.tool.denied": {
    type: "agent.tool.denied",
    version: 1,
    description: "Records denial of a resident-agent tool request by a person or policy.",
    agentGuidance: "Required provenance fields: toolRequestId, deniedBy, and rationale. Forbidden autonomous effects: denial closes or blocks execution by projection and must not delete the original request.",
    invariants: ["toolRequestId must route the stream", "rationale must be secret-safe", "denial is append-only"]
  },
  "agent.tool.completed": {
    type: "agent.tool.completed",
    version: 1,
    description: "Records completed tool execution with returned event and artifact references.",
    agentGuidance: "Required provenance fields: toolRequestId, completedAt, eventIds, artifactHashes, readModelChanges, and resultSummary. Forbidden autonomous effects: completion may report domain-service results but must not fabricate accepted graph, PRR send, export, repair, or legal events.",
    invariants: ["toolRequestId must route the stream", "returned event IDs are explicit", "artifact hashes are content-addressed", "readModelChanges relatedIds must be secret-safe"]
  },
  "agent.tool.failed": {
    type: "agent.tool.failed",
    version: 1,
    description: "Records secret-safe failure of a resident-agent tool request.",
    agentGuidance: "Required provenance fields: toolRequestId, failedAt, category, message, retryable, and allowedActions. Forbidden autonomous effects: failed tools must not retry external or destructive side effects without a still-valid gate.",
    invariants: ["toolRequestId must route the stream", "message must be secret-safe", "allowedActions must be explicit"]
  },
  "agent.memory.recorded": {
    type: "agent.memory.recorded",
    version: 1,
    description: "Records scoped durable resident-agent memory with source provenance.",
    agentGuidance: "Required provenance fields: memoryId, residentAgentId, scope, memoryKind, summary, confidence, createdAt, and sourceEventIds or artifactHashes. Memory is not accepted graph state. Forbidden autonomous effects include accepting assertions, resolving entities, creating relationships, sending PRRs, exporting material, clearing locks, running provider byte transfer, executing repair, or mutating source trees from memory alone.",
    invariants: ["memoryId must route the stream", "sourceEventIds or artifactHashes are required", "memory cannot become accepted graph state"]
  },
  "agent.memory.superseded": {
    type: "agent.memory.superseded",
    version: 1,
    description: "Records that a memory item has been replaced by a newer memory item.",
    agentGuidance: "Required provenance fields: memoryId, supersededByMemoryId, supersededBy, and rationale. Forbidden autonomous effects: supersession changes active memory projections only and must not alter ledger history or graph truth.",
    invariants: ["memoryId must route the stream", "replacement memory ID is explicit", "superseded memory remains replayable"]
  },
  "agent.memory.retracted": {
    type: "agent.memory.retracted",
    version: 1,
    description: "Records removal of a memory item from active projections without deleting history.",
    agentGuidance: "Required provenance fields: memoryId, retractedBy, and rationale. Forbidden autonomous effects: retraction cannot erase source events, accepted graph state, or prior audit records.",
    invariants: ["memoryId must route the stream", "rationale must be secret-safe", "history remains append-only"]
  },
  "agent.permission.granted": {
    type: "agent.permission.granted",
    version: 1,
    description: "Records a bounded human-granted permission for resident-agent actions.",
    agentGuidance: "Required provenance fields: permissionId, residentAgentId, grantedBy, sideEffectClasses, rationale, and human context actor. Forbidden autonomous effects: permission grants must not execute tools, send messages, transfer bytes, clear locks, or accept graph state.",
    invariants: ["context actor must be human", "permissionId must route the stream", "sideEffectClasses must be explicit"]
  },
  "agent.permission.revoked": {
    type: "agent.permission.revoked",
    version: 1,
    description: "Records revocation of a resident-agent permission.",
    agentGuidance: "Required provenance fields: permissionId, revokedBy, rationale, and human context actor. Forbidden autonomous effects: revocation updates projections only and must not delete the original grant event.",
    invariants: ["context actor must be human", "permissionId must route the stream", "revocation is append-only"]
  },
  "agent.lock.activated": {
    type: "agent.lock.activated",
    version: 1,
    description: "Records an active legal, export, secret, governance, data-loss, or provider-transfer lock.",
    agentGuidance: "Required provenance fields: lockId, residentAgentId, kind, activatedBy, reason, and relatedEventIds when a prior event caused the lock. Forbidden autonomous effects: activating a lock blocks rather than authorizes risky actions.",
    invariants: ["lockId must route the stream", "kind must be explicit", "reason must be secret-safe"]
  },
  "agent.lock.cleared": {
    type: "agent.lock.cleared",
    version: 1,
    description: "Records human-cleared resident-agent lock state with rationale.",
    agentGuidance: "Required provenance fields: lockId, clearedBy, rationale, and human context actor. Forbidden autonomous effects: agent actors must not clear legal, export, secret, data-loss, provider-transfer, or governance locks.",
    invariants: ["context actor must be human", "lockId must route the stream", "clearing a lock does not approve a separate side effect"]
  },
  "ingestion.source.registered": {
    type: "ingestion.source.registered",
    version: 1,
    description: "Records registration of a read-only source collection and the workspace that will receive imported evidence.",
    agentGuidance: "Use once per logical source collection before scans. Never imply that the source tree can be mutated.",
    invariants: ["sourceCollectionId must be stable", "mode must remain read-only", "adapter metadata is required"]
  },
  "ingestion.scan.started": {
    type: "ingestion.scan.started",
    version: 1,
    description: "Records the start of a dry-run inventory scan for a source collection.",
    agentGuidance: "Use before occurrence observations. This is an inventory event, not raw evidence import approval.",
    invariants: ["scanBatchId must be stable", "sourceCollectionId is required", "startedAt must be an ISO datetime"]
  },
  "ingestion.scan.completed": {
    type: "ingestion.scan.completed",
    version: 1,
    description: "Records completion of a dry-run inventory scan with a manifest hash and reviewable totals.",
    agentGuidance: "Use after all occurrence observations for the scan are recorded. Do not create evidence from this event alone.",
    invariants: ["inventoryHash must be sha256", "totals must be nonnegative", "completedAt must be an ISO datetime"]
  },
  "ingestion.occurrence.observed": {
    type: "ingestion.occurrence.observed",
    version: 1,
    description: "Records one source occurrence observed during dry-run scanning, including duplicate or container provenance when applicable.",
    agentGuidance: "Use for path and archive-child observations. Preserve source context without treating folders as investigations.",
    invariants: [
      "contentHash must be sha256",
      "occurrenceId must be stable",
      "archive child provenance fields must be all present or all absent",
      "observations do not delete prior evidence"
    ]
  },
  "ingestion.import.approved": {
    type: "ingestion.import.approved",
    version: 1,
    description: "Records human approval to import raw artifacts from a completed dry-run scan.",
    agentGuidance: "Use only after a person reviews scan totals and approves the import batch.",
    invariants: ["approvedBy is required", "scanBatchId is required", "approval must precede import completion"]
  },
  "ingestion.import.completed": {
    type: "ingestion.import.completed",
    version: 1,
    description: "Records completion of an approved import batch with evidence creation and occurrence linkage totals.",
    agentGuidance: "Use after blob copy, evidence creation, and occurrence linkage work completes or deterministically skips items.",
    invariants: ["importBatchId is required", "totals must be nonnegative", "completedAt must be an ISO datetime"]
  },
  "ingestion.evidence.linked": {
    type: "ingestion.evidence.linked",
    version: 1,
    description: "Links imported canonical ontology evidence to one or more source occurrences and a content hash.",
    agentGuidance: "Use to preserve detailed source lineage without overloading the generic evidence.ingested payload.",
    invariants: ["evidenceId is required", "occurrenceIds cannot be empty", "contentHash must be sha256"]
  },
  "ingestion.parse.job.created": {
    type: "ingestion.parse.job.created",
    version: 1,
    description: "Records creation of a local or provider parse job for imported evidence.",
    agentGuidance: "Use for queued or running parsing work. Parse output is derivative material, not accepted ontology fact.",
    invariants: [
      "parseJobId is required",
      "sourceCollectionId and importBatchId are required",
      "state must be queued or running",
      "lane must be local or provider"
    ]
  },
  "ingestion.parse.completed": {
    type: "ingestion.parse.completed",
    version: 1,
    description: "Records successful parse completion with a derivative output hash and media type.",
    agentGuidance: "Use after derivative output is content-addressed, preserving source collection and import batch identity. Future assertion extraction still needs provenance and review.",
    invariants: ["sourceCollectionId and importBatchId are required", "outputHash must be sha256", "completedAt must be an ISO datetime"]
  },
  "ingestion.parse.failed": {
    type: "ingestion.parse.failed",
    version: 1,
    description: "Records a secret-safe parse failure for imported evidence.",
    agentGuidance: "Use instead of silent logs when local or provider parsing fails, preserving source collection and import batch identity. Do not include credentials or raw document bodies.",
    invariants: ["sourceCollectionId and importBatchId are required", "message must be secret-safe", "retryable must be explicit"]
  },
  "ingestion.provider.approved": {
    type: "ingestion.provider.approved",
    version: 1,
    description: "Records human approval for a provider parse batch before document bytes may leave the machine.",
    agentGuidance: "Use only for batch-level provider approval. Never record provider credentials or imply autonomous outbound parsing.",
    invariants: ["approvedBy is required", "eligibleMediaTypes cannot be empty", "policy must be send-all-technically-eligible"]
  },
  "legacy.import.report.generated": {
    type: "legacy.import.report.generated",
    version: 1,
    description: "Records a content-addressed migration report for a read-only old-Cestus inspection batch.",
    agentGuidance: "Use after deterministic inspection and plugin parsing. This event references report artifacts and candidate sets; it does not import accepted graph truth.",
    invariants: [
      "reportHash and candidateSetHash must be sha256",
      "totals must be nonnegative",
      "accepted graph event IDs are not allowed in the payload"
    ]
  },
  "legacy.ontology.staging.approved": {
    type: "legacy.ontology.staging.approved",
    version: 1,
    description: "Records human approval to stage selected evidence-tied legacy observations as proposed assertions.",
    agentGuidance: "Use only after raw evidence import and report review. This event permits assertion.proposed only, never accepted assertions or entity resolution.",
    invariants: [
      "context actor must be human",
      "reportHash and candidateSetHash must match the reviewed report",
      "approved candidates can only become assertion.proposed"
    ]
  },
  "governance.policy.installed": {
    type: "governance.policy.installed",
    version: 1,
    description: "Records installation of an active governance policy, tag definitions, confidence threshold, and export defaults.",
    agentGuidance: "Use for governed policy changes only. Do not infer policy state from configuration that is not represented by ledger events.",
    invariants: ["policyId must use the gov_policy_ prefix", "tags must be known governance tags", "confidenceThreshold is between 0 and 1"]
  },
  "evidence.governance.classified": {
    type: "evidence.governance.classified",
    version: 1,
    description: "Records AI, system, ruleset, or human classification of evidence with independent governance tags.",
    agentGuidance: "Use after evidence ingestion to record tag confidence and rationale. Classification never accepts graph facts or bypasses human gates.",
    invariants: ["evidenceId and evidenceEventId are required", "contentHash must be sha256", "tag rationales must be secret-safe"]
  },
  "evidence.governance.reviewed": {
    type: "evidence.governance.reviewed",
    version: 1,
    description: "Records append-only human review decisions for evidence governance tags.",
    agentGuidance: "Use only for explicit human review. Add, affirm, remove, or supersede prior tag decisions without mutating earlier events.",
    invariants: ["reviewedBy is required", "decisions cannot be empty", "review rationale must be secret-safe"]
  },
  "evidence.redaction.applied": {
    type: "evidence.redaction.applied",
    version: 1,
    description: "Records a redaction decision and safe references to redacted evidence views or hashes.",
    agentGuidance: "Use for append-only redaction history. Do not delete original ledger events or store redacted raw content in the payload.",
    invariants: ["redactionId must be stable", "appliedBy is required", "rationale must be secret-safe", "context actor must be human"]
  },
  "evidence.quarantined": {
    type: "evidence.quarantined",
    version: 1,
    description: "Records a quarantine or access-lock decision that removes evidence from normal workflows by projection.",
    agentGuidance: "Use when evidence should be excluded from workflow, export, or all access paths while preserving append-only history.",
    invariants: ["quarantineId must be stable", "lockLevel must be explicit", "reason must be secret-safe", "context actor must be human"]
  },
  "evidence.tombstoned": {
    type: "evidence.tombstoned",
    version: 1,
    description: "Records append-only removal semantics for evidence without deleting source history.",
    agentGuidance: "Use for tombstone decisions only after review. Projections should hide tombstoned evidence while replay still sees the event.",
    invariants: ["tombstoneId must be stable", "tombstonedBy is required", "reason must be secret-safe", "context actor must be human"]
  },
  "network.exposure.enabled": {
    type: "network.exposure.enabled",
    version: 1,
    description: "Records explicit LAN or tailnet exposure with visible warning state and active governance policy.",
    agentGuidance: "Use only when local network exposure is intentionally enabled and visibly surfaced to the user.",
    invariants: ["visibleWarning must be true", "enabledAt must be an ISO datetime", "policy is required", "context actor must be human"]
  },
  "network.exposure.disabled": {
    type: "network.exposure.disabled",
    version: 1,
    description: "Records disabling of a previously enabled LAN or tailnet exposure.",
    agentGuidance: "Use to close exposure state by projection. Do not erase the prior exposure-enabled event.",
    invariants: ["exposureId is required", "disabledBy is required", "reason must be secret-safe"]
  },
  "device.session.approved": {
    type: "device.session.approved",
    version: 1,
    description: "Records human approval for a local device or browser session to access an exposed Cestus instance.",
    agentGuidance: "Use only after local human approval. AI agents must not approve sessions or devices.",
    invariants: ["approvedBy is required", "capabilities cannot be empty", "policy is required", "context actor must be human"]
  },
  "device.session.revoked": {
    type: "device.session.revoked",
    version: 1,
    description: "Records revocation of a previously approved local device or browser session.",
    agentGuidance: "Use to remove session access in projections while preserving the prior approval history.",
    invariants: ["sessionId is required", "revokedBy is required", "reason must be secret-safe"]
  },
  "export.generated": {
    type: "export.generated",
    version: 1,
    description: "Records generation of an export artifact with public-safe defaults and sensitive evidence opt-in audit fields.",
    agentGuidance: "Use whenever a durable export is generated. Sensitive or private evidence requires explicit opt-in records.",
    invariants: ["included evidence references are recorded", "sensitiveOptIns are explicit", "defaultPublicSafeOnly is recorded", "sensitive opt-ins require a human context actor"]
  },
  "report.generated": {
    type: "report.generated",
    version: 1,
    description: "Records generation of a report artifact with public-safe defaults and sensitive evidence opt-in audit fields.",
    agentGuidance: "Use whenever a durable report is generated. Do not infer public safety from UI state alone.",
    invariants: ["reportId must be stable", "included content hashes are recorded", "sensitiveOptIns are explicit", "sensitive opt-ins require a human context actor"]
  },
  "incident.recorded": {
    type: "incident.recorded",
    version: 1,
    description: "Records governance, security, export, network, device, quarantine, or projection incidents with safe references.",
    agentGuidance: "Use for inspectable incident state. Summaries must not include secrets, raw private content, or source-identifying text.",
    invariants: ["incidentId must be stable", "summary must be secret-safe", "related references are arrays"]
  },
  "incident.repair.recorded": {
    type: "incident.repair.recorded",
    version: 1,
    description: "Records append-only repair action for a governance or security incident.",
    agentGuidance: "Use to document repair progress or closure. Do not rewrite the incident event or hide failed repairs.",
    invariants: ["repairId must be stable", "severity and category are required", "related references are arrays", "action must be secret-safe", "closesIncident is explicit", "closing an incident requires a human context actor"]
  },
  "prr.request.created": {
    type: "prr.request.created",
    version: 1,
    description: "Records creation of a draft public records request with jurisdiction, agency, requester, and request text.",
    agentGuidance: "Use only for initial request drafts. Keep status draft and preserve enough metadata for replayable lifecycle projections.",
    invariants: ["status must be draft", "prrRequestId must be stable", "jurisdictionPack is required"]
  },
  "prr.request.sent": {
    type: "prr.request.sent",
    version: 1,
    description: "Records the human-approved initial send of a public records request through a correspondence provider.",
    agentGuidance: "Use after a person approves the rendered request body and the provider returns message identifiers.",
    invariants: [
      "approvedBy is required",
      "bodyHash records the rendered body",
      "idempotencyKey records the provider send attempt",
      "attachmentEvidenceIds links reviewed outbound attachments when present"
    ]
  },
  "prr.correspondence.received": {
    type: "prr.correspondence.received",
    version: 1,
    description: "Records inbound correspondence matched to a public records request with provider identifiers and optional evidence links.",
    agentGuidance: "Use for confident inbound matches. Uncertain mailbox matches should enter review in later workflow services instead.",
    invariants: ["providerMessageId is required", "receivedAt must be an ISO datetime", "evidenceIds must reference evidence events when present"]
  },
  "prr.followup.drafted": {
    type: "prr.followup.drafted",
    version: 1,
    description: "Records a drafted follow-up message for a public records request before provider send occurs.",
    agentGuidance: "Use for reviewable draft state. Do not treat a draft as evidence that correspondence was sent.",
    invariants: ["bodyHash records the rendered body", "correspondenceId must be stable"]
  },
  "prr.followup.sent": {
    type: "prr.followup.sent",
    version: 1,
    description: "Records a human-approved follow-up message sent through a configured correspondence provider.",
    agentGuidance: "Use only after a person approves the follow-up and the provider returns durable message metadata.",
    invariants: ["approvedBy is required", "bodyHash records the rendered body"]
  },
  "prr.deadline.estimated": {
    type: "prr.deadline.estimated",
    version: 1,
    description: "Records an estimated public records deadline produced from jurisdiction pack rules or workflow heuristics.",
    agentGuidance: "Use for reminder and queue prioritization projections. Do not unlock legal escalation from estimates alone.",
    invariants: ["citedRules cannot be empty", "confidence must distinguish statutory from workflow"]
  },
  "prr.deadline.confirmed": {
    type: "prr.deadline.confirmed",
    version: 1,
    description: "Records a user-reviewed public records deadline confirmation or override with rationale and cited rules.",
    agentGuidance: "Use when a human confirms the deadline basis. Confirmed deadlines take precedence over estimates in projections.",
    invariants: ["confirmedBy is required", "citedRules cannot be empty", "rationale is required"]
  },
  "prr.fee.estimated": {
    type: "prr.fee.estimated",
    version: 1,
    description: "Records an agency fee estimate or fee amount associated with a public records request.",
    agentGuidance: "Use sourceEvidenceId when the estimate came from correspondence or an attachment ingested as evidence.",
    invariants: ["amountCents cannot be negative", "currency must be an uppercase three-letter code"]
  },
  "prr.fee.challenged": {
    type: "prr.fee.challenged",
    version: 1,
    description: "Records a human-approved challenge to a fee estimate for a public records request.",
    agentGuidance: "Use after human review of the challenge rationale. Cite jurisdiction guidance where applicable.",
    invariants: ["approvedBy is required", "amountCents cannot be negative", "rationale is required"]
  },
  "prr.scope.narrowing.proposed": {
    type: "prr.scope.narrowing.proposed",
    version: 1,
    description: "Records a proposed narrowing of a public records request scope before the requester accepts it.",
    agentGuidance: "Use for agency or requester proposals that need review. Do not replace request text until accepted.",
    invariants: ["narrowingId must be stable", "proposedScope is required", "proposedBy is required"]
  },
  "prr.scope.narrowing.accepted": {
    type: "prr.scope.narrowing.accepted",
    version: 1,
    description: "Records accepted narrowed scope language for a public records request with rationale.",
    agentGuidance: "Use only after a person accepts the narrowed scope and records why the change preserves intent.",
    invariants: ["narrowingId must reference a proposal", "acceptedBy is required", "rationale is required"]
  },
  "prr.production.received": {
    type: "prr.production.received",
    version: 1,
    description: "Records receipt of a production batch and the evidence artifacts linked to that production.",
    agentGuidance: "Use after production files or metadata have evidence identifiers. Do not store large production content directly in payloads.",
    invariants: ["evidenceIds cannot be empty", "receivedAt must be an ISO datetime"]
  },
  "prr.exemption.claimed": {
    type: "prr.exemption.claimed",
    version: 1,
    description: "Records an exemption claimed by an agency in a public records request response.",
    agentGuidance: "Use citations and source evidence where available so reviewers can evaluate the claimed exemption.",
    invariants: ["citedRules cannot be empty", "claimedBy is required"]
  },
  "prr.denial.recorded": {
    type: "prr.denial.recorded",
    version: 1,
    description: "Records a denial or final refusal associated with a public records request.",
    agentGuidance: "Use sourceEvidenceId when denial correspondence or attachments have been ingested as evidence.",
    invariants: ["denialId must be stable", "reason is required", "receivedAt must be an ISO datetime"]
  },
  "prr.appeal.created": {
    type: "prr.appeal.created",
    version: 1,
    description: "Records creation or filing of an appeal for a public records request denial or inadequate response.",
    agentGuidance: "Use only after human approval. Preserve cited rules and correspondence linkage for auditability.",
    invariants: ["approvedBy is required", "correspondenceId is required", "filedAt must be an ISO datetime"]
  },
  "prr.stalling.detected": {
    type: "prr.stalling.detected",
    version: 1,
    description: "Records possible stalling signals detected from deadlines, silence, fees, narrowing pressure, or exemption review needs.",
    agentGuidance: "Use as inspectable possible-stalling state only. Do not treat detection as a legal conclusion.",
    invariants: ["signals cannot be empty", "detectedAt must be an ISO datetime"]
  },
  "prr.stalling.confirmed": {
    type: "prr.stalling.confirmed",
    version: 1,
    description: "Records a human confirmation that one or more possible stalling signals are meaningful for a request.",
    agentGuidance: "Use only after a person reviews the signals and records a rationale for treating them as confirmed.",
    invariants: ["confirmedBy is required", "signalKinds cannot be empty", "rationale is required"]
  },
  "prr.legal-escalation.confirmed": {
    type: "prr.legal-escalation.confirmed",
    version: 1,
    description: "Records human confirmation that legal-escalation language is appropriate for a public records request.",
    agentGuidance: "Use only with user confirmation, cited rules, and evidence of correspondence history. Never create this autonomously.",
    invariants: ["confirmedBy is required", "citedRules cannot be empty", "legal escalation is never autonomous"]
  },
  "prr.request.closed": {
    type: "prr.request.closed",
    version: 1,
    description: "Records closure of a public records request with the closeout actor, timestamp, and reason.",
    agentGuidance: "Use to end active workflow state while preserving all prior events for replay and audit.",
    invariants: ["closedBy is required", "reason must be an allowed closeout reason", "closedAt must be an ISO datetime"]
  }
} satisfies EventContractMap;

interface KnowledgeEventBase<Type extends KnowledgeEventType> {
  id: string;
  type: Type;
  version: 1;
  streamId: string;
  sequence: number;
  context: z.infer<typeof eventContextSchema>;
  payload: PayloadByEventType[Type];
}

export type KnowledgeEvent = {
  [Type in KnowledgeEventType]: KnowledgeEventBase<Type>;
}[KnowledgeEventType];

export type KnowledgeEventOf<Type extends KnowledgeEventType> = Extract<KnowledgeEvent, { type: Type }>;

export type AppendableKnowledgeEvent<Type extends KnowledgeEventType = KnowledgeEventType> =
  Type extends KnowledgeEventType ? Omit<KnowledgeEventOf<Type>, "id" | "sequence"> : never;

function isKnowledgeEventType(value: unknown): value is KnowledgeEventType {
  return typeof value === "string" && Object.hasOwn(payloadSchemas, value);
}

const alwaysHumanGatedEventTypes = new Set<KnowledgeEventType>([
  "assertion.accepted",
  "entity.resolved",
  "relationship.accepted",
  "agent.identity.updated",
  "agent.policy.installed",
  "agent.tool.approved",
  "agent.permission.granted",
  "agent.permission.revoked",
  "agent.lock.cleared",
  "governance.policy.installed",
  "evidence.governance.reviewed",
  "evidence.redaction.applied",
  "evidence.quarantined",
  "evidence.tombstoned",
  "network.exposure.enabled",
  "device.session.approved",
  "legacy.ontology.staging.approved",
  "prr.request.sent",
  "prr.followup.sent",
  "prr.deadline.confirmed",
  "prr.fee.challenged",
  "prr.scope.narrowing.accepted",
  "prr.appeal.created",
  "prr.stalling.confirmed",
  "prr.legal-escalation.confirmed"
]);

function hasSensitiveOptIns(payload: unknown): boolean {
  return typeof payload === "object" &&
    payload !== null &&
    "sensitiveOptIns" in payload &&
    Array.isArray(payload.sensitiveOptIns) &&
    payload.sensitiveOptIns.length > 0;
}

function closesIncident(payload: unknown): boolean {
  return typeof payload === "object" &&
    payload !== null &&
    "closesIncident" in payload &&
    payload.closesIncident === true;
}

function requiresHumanContextActor(type: KnowledgeEventType, payload: unknown): boolean {
  if (alwaysHumanGatedEventTypes.has(type)) {
    return true;
  }

  if ((type === "export.generated" || type === "report.generated") && hasSensitiveOptIns(payload)) {
    return true;
  }

  return type === "incident.repair.recorded" && closesIncident(payload);
}

function expectedAgentStreamId(type: KnowledgeEventType, payload: unknown): string | undefined {
  if (!type.startsWith("agent.") || typeof payload !== "object" || payload === null) {
    return undefined;
  }

  const agentPayload = payload as Record<string, unknown>;

  if (type.startsWith("agent.identity.")) {
    return `agent_identity_${agentPayload.residentAgentId}`;
  }

  if (type === "agent.policy.installed") {
    return `agent_policy_${agentPayload.policyId}`;
  }

  if (
    type === "agent.resident-plan.recorded.v1" ||
    type === "agent.resident-observation.recorded.v1" ||
    type === "agent.resident-tool-step.recorded.v1" ||
    type === "agent.resident-loop.suspended.v1" ||
    type === "agent.resident-loop.result.recorded.v1" ||
    type === "agent.resident-plan.recorded.v2" ||
    type === "agent.resident-observation.recorded.v2" ||
    type === "agent.resident-tool-step.recorded.v2" ||
    type === "agent.resident-loop.suspended.v2" ||
    type === "agent.resident-loop.result.recorded.v2"
  ) {
    return `agent_resident_loop_${agentPayload.taskId}_${agentPayload.attemptId}_${agentPayload.runId}`;
  }

  if (type === "agent.trigger.requested.v1") {
    return `agent_trigger_${agentPayload.workspaceId}_${agentPayload.triggerId}`;
  }

  if (type.startsWith("agent.task.orchestration.")) {
    return `agent_task_orchestration_${agentPayload.taskId}_${agentPayload.runType}`;
  }

  if (type.startsWith("agent.task.")) {
    return `agent_task_${agentPayload.taskId}`;
  }

  if (type.startsWith("agent.specialist-run.")) {
    return `agent_run_${agentPayload.runId}`;
  }

  if (type.startsWith("agent.specialist-handoff.")) {
    return `agent_run_${agentPayload.runId}`;
  }

  if (type.startsWith("agent.model-invocation.")) {
    return `agent_model_invocation_${agentPayload.invocationId}`;
  }

  if (type.startsWith("agent.tool.")) {
    return `agent_tool_request_${agentPayload.toolRequestId}`;
  }

  if (type.startsWith("agent.memory.")) {
    return `agent_memory_${agentPayload.memoryId}`;
  }

  if (type.startsWith("agent.permission.")) {
    return `agent_permission_${agentPayload.permissionId}`;
  }

  if (type.startsWith("agent.lock.")) {
    return `agent_lock_${agentPayload.lockId}`;
  }

  return undefined;
}

const knowledgeEventBaseSchema = z.object({
  id: z.string().regex(/^evt_[a-zA-Z0-9_-]+$/),
  type: z.custom<KnowledgeEventType>(isKnowledgeEventType),
  version: z.literal(1),
  streamId: z.string().min(3),
  sequence: z.number().int().positive(),
  context: eventContextSchema,
  payload: z.record(z.string(), z.unknown())
}).strict();

type PlainOwnDataNormalization =
  | { readonly success: true; readonly data: unknown }
  | { readonly success: false };

/**
 * Copies untrusted boundary data through property descriptors before the
 * event parser reads it. Accessor-, proxy-, symbol-, sparse-, hidden-, and
 * custom-prototype shapes are invalid input, never values for Zod to inspect.
 */
function normalizePlainOwnData(value: unknown): PlainOwnDataNormalization {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean" || typeof value === "undefined") {
    return { success: true, data: value };
  }
  if (typeof value !== "object") return { success: false };

  try {
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key === "symbol")) return { success: false };

    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) return { success: false };
      const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
      if (lengthDescriptor === undefined || !("value" in lengthDescriptor) ||
        typeof lengthDescriptor.value !== "number" || !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0 ||
        keys.length !== lengthDescriptor.value + 1) return { success: false };

      const normalized: unknown[] = [];
      for (let index = 0; index < lengthDescriptor.value; index += 1) {
        const key = String(index);
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) return { success: false };
        const child = normalizePlainOwnData(descriptor.value);
        if (!child.success) return child;
        normalized.push(child.data);
      }
      return { success: true, data: Object.freeze(normalized) };
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return { success: false };
    const normalized: Record<string, unknown> = {};
    for (const key of keys) {
      if (typeof key !== "string" || key.length === 0) return { success: false };
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) return { success: false };
      const child = normalizePlainOwnData(descriptor.value);
      if (!child.success) return child;
      Object.defineProperty(normalized, key, {
        value: child.data,
        enumerable: true,
        writable: false,
        configurable: false
      });
    }
    return { success: true, data: Object.freeze(normalized) };
  } catch {
    return { success: false };
  }
}

function isPlainOwnData(value: unknown): boolean {
  return normalizePlainOwnData(value).success;
}

function isResidentLoopEventType(type: KnowledgeEventType): boolean {
  return type === "agent.resident-plan.recorded.v1" ||
    type === "agent.resident-observation.recorded.v1" ||
    type === "agent.resident-tool-step.recorded.v1" ||
    type === "agent.resident-loop.suspended.v1" ||
    type === "agent.resident-loop.result.recorded.v1" ||
    type === "agent.resident-plan.recorded.v2" ||
    type === "agent.resident-observation.recorded.v2" ||
    type === "agent.resident-tool-step.recorded.v2" ||
    type === "agent.resident-loop.suspended.v2" ||
    type === "agent.resident-loop.result.recorded.v2";
}

function isTriggerEventType(type: KnowledgeEventType): boolean {
  return type === "agent.trigger.requested.v1";
}

function serializableIssue(issue: z.ZodIssue): Record<string, unknown> {
  return JSON.parse(JSON.stringify(issue)) as Record<string, unknown>;
}

function payloadIssueParams(issue: z.ZodIssue): Record<string, unknown> {
  const originalIssue = serializableIssue(issue);
  const params: Record<string, unknown> = {
    originalCode: issue.code,
    originalIssue
  };
  const issueDetails = issue as unknown as Record<string, unknown>;

  for (const key of ["expected", "minimum", "maximum", "inclusive", "origin", "format", "pattern", "keys"] as const) {
    if (key in issueDetails) {
      params[key] = issueDetails[key];
    }
  }

  return params;
}

const rawKnowledgeEventSchema = knowledgeEventBaseSchema
  .superRefine((event, ctx) => {
    const payloadSchema = payloadSchemas[event.type] as z.ZodType<unknown>;

    if ((isResidentLoopEventType(event.type) || isTriggerEventType(event.type)) && !isPlainOwnData(event.payload)) {
      ctx.addIssue({
        code: "custom",
        message: "resident-agent payload must be plain own-data only",
        path: ["payload"]
      });
      return;
    }
    const payload = payloadSchema.safeParse(event.payload);

    if (!payload.success) {
      for (const issue of payload.error.issues) {
        ctx.addIssue({
          code: "custom",
          message: issue.message,
          path: ["payload", ...issue.path],
          params: payloadIssueParams(issue)
        });
      }
      return;
    }

    if (requiresHumanContextActor(event.type, payload.data) && event.context.actor.kind !== "human") {
      ctx.addIssue({
        code: "custom",
        message: "human-gated events require a human context actor",
        path: ["context", "actor", "kind"]
      });
    }

    const agentStreamId = expectedAgentStreamId(event.type, payload.data);
    if (agentStreamId !== undefined && event.streamId !== agentStreamId) {
      ctx.addIssue({
        code: "custom",
        message: "agent event streamId must match payload identity",
        path: ["streamId"]
      });
    }

    if (event.type === "governance.policy.installed") {
      try {
        const { installedBy: _installedBy, ...policy } = payload.data as z.infer<typeof governancePolicyInstalledPayloadSchema>;
        validateGovernancePolicy(policy);
      } catch (error) {
        ctx.addIssue({
          code: "custom",
          message: error instanceof Error ? error.message : "Invalid governance policy",
          path: ["payload"]
        });
      }
    }

    if (event.type === "ingestion.provider.approved") {
      const providerPayload = payload.data as PayloadByEventType["ingestion.provider.approved"];
      const expectedStreamId =
        `ingestion_provider_${providerPayload.sourceCollectionId}_${providerPayload.importBatchId}_${providerPayload.providerJobId}`;

      if (event.streamId !== expectedStreamId) {
        ctx.addIssue({
          code: "custom",
          message: "provider approval streamId must match source, import, and provider job identity",
          path: ["streamId"]
        });
      }
    }

    if (event.type === "legacy.import.report.generated") {
      const legacyPayload = payload.data as PayloadByEventType["legacy.import.report.generated"];
      const expectedStreamId =
        `legacy_report_${legacyPayload.sourceCollectionId}_${legacyPayload.scanBatchId}_${legacyPayload.legacyReportId}`;

      if (event.streamId !== expectedStreamId) {
        ctx.addIssue({
          code: "custom",
          message: "legacy report streamId must match source, scan, and report identity",
          path: ["streamId"]
        });
      }
    }

    if (event.type === "legacy.ontology.staging.approved") {
      const legacyPayload = payload.data as PayloadByEventType["legacy.ontology.staging.approved"];
      const expectedStreamId =
        `legacy_staging_${legacyPayload.sourceCollectionId}_${legacyPayload.scanBatchId}_${legacyPayload.stagingBatchId}`;

      if (event.streamId !== expectedStreamId) {
        ctx.addIssue({
          code: "custom",
          message: "legacy staging streamId must match source, scan, and staging identity",
          path: ["streamId"]
        });
      }
    }

    if (isResidentLoopEventType(event.type)) {
      const residentPayload = payload.data as Record<string, unknown>;
      const residentCausationId = event.type.endsWith(".v2")
        ? residentPayload.causationId
        : residentPayload.causationEventId;
      if (event.context.causationId !== residentCausationId) {
        ctx.addIssue({
          code: "custom",
          message: "resident-loop causation must match the event context",
          path: ["context", "causationId"]
        });
      }
      if (event.context.correlationId !== residentPayload.correlationId) {
        ctx.addIssue({
          code: "custom",
          message: "resident-loop correlation must match the event context",
          path: ["context", "correlationId"]
        });
      }
    }

    if (isTriggerEventType(event.type)) {
      const triggerPayload = payload.data as PayloadByEventType["agent.trigger.requested.v1"];
      if (event.context.causationId !== triggerPayload.provenance.causationId) {
        ctx.addIssue({ code: "custom", message: "trigger causation must match the event context", path: ["context", "causationId"] });
      }
      if (event.context.correlationId !== triggerPayload.provenance.correlationId) {
        ctx.addIssue({ code: "custom", message: "trigger correlation must match the event context", path: ["context", "correlationId"] });
      }
    }
  })
  .transform((event): KnowledgeEvent => event as KnowledgeEvent);

/**
 * The public event parser never exposes the raw Zod object to caller-owned
 * values. Its preprocess boundary supplies the one descriptor-copied,
 * immutable snapshot that every later parse and refinement consumes.
 */
export const knowledgeEventSchema = z.preprocess((event) => {
  const normalized = normalizePlainOwnData(event);
  return normalized.success ? normalized.data : undefined;
}, rawKnowledgeEventSchema);

export function validateKnowledgeEvent(event: unknown) {
  return knowledgeEventSchema.safeParse(event);
}

export type ResidentLoopSequenceValidation =
  | { readonly success: true }
  | { readonly success: false; readonly issues: readonly string[] };

function validateResidentLoopV2EventSequence(events: readonly KnowledgeEvent[]): ResidentLoopSequenceValidation {
  const expectedTypes = [
    "agent.resident-plan.recorded.v2",
    "agent.resident-observation.recorded.v2",
    "agent.resident-tool-step.recorded.v2",
    "agent.resident-loop.suspended.v2",
    "agent.resident-loop.result.recorded.v2"
  ] as const;
  const issues: string[] = [];

  if (events.length !== expectedTypes.length) {
    return { success: false, issues: ["resident-loop v2 replay must contain exactly five events"] };
  }
  const [plan, observation, step, suspended, result] = events;
  if (plan === undefined || observation === undefined || step === undefined || suspended === undefined || result === undefined) {
    return { success: false, issues: ["resident-loop v2 replay is incomplete"] };
  }
  for (const [index, expectedType] of expectedTypes.entries()) {
    const event = events[index]!;
    if (event.type !== expectedType) issues.push(`event ${index + 1} must be ${expectedType}`);
    if (event.sequence !== index + 1) issues.push(`event ${index + 1} must have sequence ${index + 1}`);
    if (event.streamId !== plan.streamId) issues.push(`event ${index + 1} must use the plan stream`);
    if (!validateKnowledgeEvent(event).success) issues.push(`event ${index + 1} must satisfy its strict v2 parser`);
  }

  const planPayload = plan.payload as Record<string, unknown>;
  const bindingFields = [
    "residentAgentId",
    "workspaceId",
    "taskId",
    "attemptId",
    "runId",
    "runMode",
    "workflowDescriptor",
    "policy",
    "authority",
    "sourceEventIds",
    "contextPackRefs",
    "budget",
    "causationId",
    "correlationId"
  ] as const;
  const sameBinding = (payload: Record<string, unknown>, label: string) => {
    for (const field of bindingFields) {
      if (JSON.stringify(payload[field]) !== JSON.stringify(planPayload[field])) {
        issues.push(`${label} must preserve ${field}`);
      }
    }
  };
  const planReadbackMatches = (payload: Record<string, unknown>, label: string) => {
    const readback = payload.planReadback as Record<string, unknown> | undefined;
    if (readback?.planRecordEventId !== plan.id) issues.push(`${label} must read back the exact v2 plan event`);
    for (const field of ["workspaceId", "residentAgentId", "taskId", "attemptId", "runId", "planId", "planRevision"] as const) {
      if (readback?.[field] !== planPayload[field]) issues.push(`${label} plan readback must preserve ${field}`);
    }
  };
  const observationReadbackMatches = (payload: Record<string, unknown>, label: string) => {
    const readback = payload.finalObservationReadback as Record<string, unknown> | undefined;
    if (readback?.observationEventId !== observation.id) issues.push(`${label} must read back the exact final v2 observation`);
    for (const field of ["workspaceId", "residentAgentId", "taskId", "attemptId", "runId", "planId", "planRevision"] as const) {
      if (readback?.[field] !== planPayload[field]) issues.push(`${label} final observation readback must preserve ${field}`);
    }
  };

  for (const [event, label] of [[observation, "observation"], [step, "step"], [suspended, "suspension"], [result, "result"]] as const) {
    const payload = event.payload as Record<string, unknown>;
    sameBinding(payload, label);
    planReadbackMatches(payload, label);
  }
  observationReadbackMatches(suspended.payload as Record<string, unknown>, "suspension");
  observationReadbackMatches(result.payload as Record<string, unknown>, "result");

  const checkpoint = (suspended.payload as Record<string, unknown>).checkpoint as Record<string, unknown> | undefined;
  if (checkpoint?.checkpointEventId !== suspended.id) issues.push("suspension must read back its exact durable checkpoint event");

  const resultPayload = result.payload as Record<string, unknown>;
  if (resultPayload.outcome === "completed") {
    const handoff = resultPayload.handoffReadback as Record<string, unknown> | undefined;
    if (handoff?.outcome !== "verified") issues.push("completed result requires verified H readback");
    for (const field of ["taskId", "attemptId", "runId"] as const) {
      if (handoff?.[field] !== planPayload[field]) issues.push(`H handoff readback must preserve ${field}`);
    }
    if (JSON.stringify(handoff?.authorityBinding) !== JSON.stringify(planPayload.authority)) {
      issues.push("H handoff authority binding must equal the mounted authority");
    }
  }
  if (resultPayload.outcome === "resumable" && resultPayload.resumeAnchor === undefined) {
    issues.push("resumable result requires a durable resume anchor");
  }
  return issues.length === 0 ? { success: true } : { success: false, issues };
}

/**
 * Validates the replayable resident-loop five-event fixture after ledger
 * readback. Individual payload parsing cannot prove that a supplied event ID
 * is a real prior event; this pure parser binds every readback to the ordered
 * append-only stream without executing a store, provider, tool, or domain
 * effect.
 */
export function validateResidentLoopEventSequence(events: readonly KnowledgeEvent[]): ResidentLoopSequenceValidation {
  if (events[0]?.type === "agent.resident-plan.recorded.v2") {
    return validateResidentLoopV2EventSequence(events);
  }
  const expectedTypes = [
    "agent.resident-plan.recorded.v1",
    "agent.resident-observation.recorded.v1",
    "agent.resident-tool-step.recorded.v1",
    "agent.resident-loop.suspended.v1",
    "agent.resident-loop.result.recorded.v1"
  ] as const;
  const issues: string[] = [];

  if (events.length !== expectedTypes.length) {
    return { success: false, issues: ["resident-loop replay must contain exactly five events"] };
  }
  const [plan, observation, step, suspended, result] = events;
  if (plan === undefined || observation === undefined || step === undefined || suspended === undefined || result === undefined) {
    return { success: false, issues: ["resident-loop replay is incomplete"] };
  }
  for (const [index, expectedType] of expectedTypes.entries()) {
    const event = events[index]!;
    if (event.type !== expectedType) issues.push(`event ${index + 1} must be ${expectedType}`);
    if (event.sequence !== index + 1) issues.push(`event ${index + 1} must have sequence ${index + 1}`);
    if (event.streamId !== plan.streamId) issues.push(`event ${index + 1} must use the plan stream`);
  }

  const identity = plan.payload as Record<string, unknown>;
  const sameIdentity = (payload: Record<string, unknown>, label: string) => {
    for (const field of ["residentAgentId", "taskId", "attemptId", "runId", "policyId", "policyHash", "authorityHash", "causationEventId", "correlationId"] as const) {
      if (payload[field] !== identity[field]) issues.push(`${label} must preserve ${field}`);
    }
  };
  const planReadbackMatches = (payload: Record<string, unknown>, label: string) => {
    const readback = payload.planReadback as Record<string, unknown> | undefined;
    if (readback?.planRecordEventId !== plan.id) issues.push(`${label} must read back the exact plan event`);
    for (const field of ["taskId", "attemptId", "runId"] as const) {
      if (readback?.[field] !== identity[field]) issues.push(`${label} plan readback must preserve ${field}`);
    }
  };
  const observationReadbackMatches = (payload: Record<string, unknown>, label: string) => {
    const readback = payload.finalObservationReadback as Record<string, unknown> | undefined;
    if (readback?.observationEventId !== observation.id) issues.push(`${label} must read back the exact final observation`);
    for (const field of ["taskId", "attemptId", "runId"] as const) {
      if (readback?.[field] !== identity[field]) issues.push(`${label} observation readback must preserve ${field}`);
    }
  };

  for (const [event, label] of [[observation, "observation"], [step, "step"], [suspended, "suspension"], [result, "result"]] as const) {
    const payload = event.payload as Record<string, unknown>;
    sameIdentity(payload, label);
    planReadbackMatches(payload, label);
  }
  observationReadbackMatches(suspended.payload as Record<string, unknown>, "suspension");
  observationReadbackMatches(result.payload as Record<string, unknown>, "result");
  const terminalReadback = (result.payload as Record<string, unknown>).terminalReadback as Record<string, unknown> | undefined;
  if (terminalReadback?.finalObservationEventId !== observation.id) {
    issues.push("result must read back the exact final observation before terminal output");
  }
  for (const field of ["taskId", "attemptId", "runId"] as const) {
    if (terminalReadback?.[field] !== identity[field]) issues.push(`terminal readback must preserve ${field}`);
  }
  return issues.length === 0 ? { success: true } : { success: false, issues };
}
