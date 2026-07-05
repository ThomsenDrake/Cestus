import { z } from "zod";

export const actorRefSchema = z.object({
  id: z.string().min(3),
  kind: z.enum(["human", "extractor", "system"]),
  label: z.string().min(1)
}).strict();

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
  message: z.string().min(1),
  repairHint: z.object({
    contract: z.string().min(1),
    violatedPath: z.string().min(1),
    allowedActions: z.array(z.string().min(1)).min(1)
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

const secretTextPattern =
  /(?:^|[^a-z0-9])(?:access[\s._-]*token|api[\s._-]*key|authorization|bearer|token|password|private[\s._-]*key|client[\s._-]*secret|refresh[\s._-]*secret|session[\s._-]*secret|oauth(?:[\s._-]*(?:token|secret))?|credential(?:[\s._-]*(?:id|key|secret|token))?)(?:\s*[:=]\s*|\s+[a-z0-9][a-z0-9._-]{2,})/i;

const secretSafeTextSchema = z.string().min(1).refine((value) => !secretTextPattern.test(value), {
  message: "text must not contain secrets or credentials"
});

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
    invariants: ["repairHint must include allowed actions"]
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
    invariants: ["redactionId must be stable", "appliedBy is required", "rationale must be secret-safe"]
  },
  "evidence.quarantined": {
    type: "evidence.quarantined",
    version: 1,
    description: "Records a quarantine or access-lock decision that removes evidence from normal workflows by projection.",
    agentGuidance: "Use when evidence should be excluded from workflow, export, or all access paths while preserving append-only history.",
    invariants: ["quarantineId must be stable", "lockLevel must be explicit", "reason must be secret-safe"]
  },
  "evidence.tombstoned": {
    type: "evidence.tombstoned",
    version: 1,
    description: "Records append-only removal semantics for evidence without deleting source history.",
    agentGuidance: "Use for tombstone decisions only after review. Projections should hide tombstoned evidence while replay still sees the event.",
    invariants: ["tombstoneId must be stable", "tombstonedBy is required", "reason must be secret-safe"]
  },
  "network.exposure.enabled": {
    type: "network.exposure.enabled",
    version: 1,
    description: "Records explicit LAN or tailnet exposure with visible warning state and active governance policy.",
    agentGuidance: "Use only when local network exposure is intentionally enabled and visibly surfaced to the user.",
    invariants: ["visibleWarning must be true", "enabledAt must be an ISO datetime", "policy is required"]
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
    invariants: ["approvedBy is required", "capabilities cannot be empty", "policy is required"]
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
    invariants: ["included evidence references are recorded", "sensitiveOptIns are explicit", "defaultPublicSafeOnly is recorded"]
  },
  "report.generated": {
    type: "report.generated",
    version: 1,
    description: "Records generation of a report artifact with public-safe defaults and sensitive evidence opt-in audit fields.",
    agentGuidance: "Use whenever a durable report is generated. Do not infer public safety from UI state alone.",
    invariants: ["reportId must be stable", "included content hashes are recorded", "sensitiveOptIns are explicit"]
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
    invariants: ["repairId must be stable", "severity and category are required", "related references are arrays", "action must be secret-safe", "closesIncident is explicit"]
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

const knowledgeEventBaseSchema = z.object({
  id: z.string().regex(/^evt_[a-zA-Z0-9_-]+$/),
  type: z.custom<KnowledgeEventType>(isKnowledgeEventType),
  version: z.literal(1),
  streamId: z.string().min(3),
  sequence: z.number().int().positive(),
  context: eventContextSchema,
  payload: z.record(z.string(), z.unknown())
}).strict();

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

export const knowledgeEventSchema = knowledgeEventBaseSchema
  .superRefine((event, ctx) => {
    if (event.type === "evidence.governance.reviewed" && event.context.actor.kind !== "human") {
      ctx.addIssue({
        code: "custom",
        message: "governance review events require a human context actor",
        path: ["context", "actor", "kind"]
      });
    }

    const payloadSchema = payloadSchemas[event.type] as z.ZodType<unknown>;
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
    }
  })
  .transform((event): KnowledgeEvent => event as KnowledgeEvent);

export function validateKnowledgeEvent(event: unknown) {
  return knowledgeEventSchema.safeParse(event);
}
