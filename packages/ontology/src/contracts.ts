import { z } from "zod";

const credentialShapedTextPattern = /api[_-]?key|authorization|bearer|token|secret|password|oauth|credential/i;
const secretSafeStringSchema = z.string().refine((value) => !credentialShapedTextPattern.test(value), {
  message: "must not contain credential-shaped text"
});

export const actorRefSchema = z.object({
  id: secretSafeStringSchema.min(3),
  kind: z.enum(["human", "extractor", "system"]),
  label: secretSafeStringSchema.min(1)
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
  category: z.enum(["ingestion", "validation", "projection", "migration", "deduplication"]),
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

const sourceCollectionIdSchema = z.string().regex(/^src_[a-zA-Z0-9_-]+$/);
const scanBatchIdSchema = z.string().regex(/^scan_[a-zA-Z0-9_-]+$/);
const importBatchIdSchema = z.string().regex(/^imp_[a-zA-Z0-9_-]+$/);
const occurrenceIdSchema = z.string().regex(/^occ_[a-zA-Z0-9_-]+$/);
const parseJobIdSchema = z.string().regex(/^parse_[a-zA-Z0-9_-]+$/);
const providerJobIdSchema = z.string().regex(/^provider_[a-zA-Z0-9_-]+$/);
const contentHashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const evidenceIdSchema = z.string().regex(/^ev_[a-zA-Z0-9_-]+$/);
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
      return;
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
  })
  .transform((event): KnowledgeEvent => event as KnowledgeEvent);

export function validateKnowledgeEvent(event: unknown) {
  return knowledgeEventSchema.safeParse(event);
}
