import { z } from "zod";

export const ontologyBootstrapSchemaVersion = "ontology-bootstrap.v1" as const;

const contentHashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const sourceCollectionIdSchema = z.string().regex(/^src_[a-zA-Z0-9_-]+$/);
const scanBatchIdSchema = z.string().regex(/^scan_[a-zA-Z0-9_-]+$/);
const legacyReportIdSchema = z.string().regex(/^legacy_report_[a-zA-Z0-9_-]+$/);
const legacyCandidateIdSchema = z.string().regex(/^legacy_candidate_[a-zA-Z0-9_-]+$/);
const evidenceIdSchema = z.string().regex(/^ev_[a-zA-Z0-9_-]+$/);
const bootstrapIdSchema = z.string().regex(/^bootstrap_[a-zA-Z0-9_-]+$/);

const secretPattern =
  /(?:^|[^a-z0-9])(?:access[\s._-]*token|api[\s._-]*key|authorization|bearer|token|password|private[\s._-]*key|client[\s._-]*secret|refresh[\s._-]*secret|session[\s._-]*secret|oauth|credential)(?:\s*[:=]\s*|\s+(?=[a-z0-9._~+/=-]{3,})(?=[a-z0-9._~+/=-]*[0-9])[a-z0-9][a-z0-9._~+/=-]*)/i;

export const ontologyBootstrapSafeTextSchema = z.string()
  .min(1)
  .max(500)
  .refine((value) => !/[\r\n]/.test(value), {
    message: "ontology bootstrap text must be a single line"
  })
  .refine((value) => !secretPattern.test(value), {
    message: "ontology bootstrap text must be secret-safe"
  });

export const ontologyBootstrapPhaseSchema = z.enum([
  "report-required",
  "raw-import-review",
  "evidence-import",
  "dossier-review",
  "staging-review",
  "ready-to-stage",
  "completed",
  "blocked"
]);

export const ontologyBootstrapFailureCodeSchema = z.enum([
  "workspace-unavailable",
  "legacy-report-required",
  "legacy-report-mismatch",
  "legacy-source-required",
  "raw-import-approval-required",
  "raw-import-stale-source",
  "evidence-link-required",
  "candidate-set-mismatch",
  "staging-approval-required",
  "accepted-event-forbidden",
  "secret-detected",
  "projection-lag",
  "provider-unavailable",
  "plugin-sample-needed"
]);

export const ontologyBootstrapFailureSchema = z.object({
  code: ontologyBootstrapFailureCodeSchema,
  message: ontologyBootstrapSafeTextSchema,
  allowedRepairActions: z.array(ontologyBootstrapSafeTextSchema).min(1)
}).strict();

export const ontologyBootstrapCandidateProvenanceSchema = z.object({
  legacyReportId: legacyReportIdSchema,
  reportHash: contentHashSchema,
  candidateSetHash: contentHashSchema,
  sourceCollectionId: sourceCollectionIdSchema,
  scanBatchId: scanBatchIdSchema,
  sourceEventIds: z.array(z.string().regex(/^evt_[a-zA-Z0-9_-]+$/)).default([])
}).strict();

export const ontologyBootstrapCandidateSchema = z.object({
  candidateId: legacyCandidateIdSchema,
  observationId: z.string().regex(/^legacy_observation_[a-zA-Z0-9_-]+$/),
  evidenceContentHash: contentHashSchema,
  evidenceId: evidenceIdSchema.optional(),
  sourcePath: ontologyBootstrapSafeTextSchema,
  subjectRef: ontologyBootstrapSafeTextSchema.optional(),
  predicate: ontologyBootstrapSafeTextSchema,
  object: z.union([ontologyBootstrapSafeTextSchema, z.number(), z.boolean(), z.null()]),
  confidence: z.number().min(0).max(1),
  provenance: ontologyBootstrapCandidateProvenanceSchema
}).strict();

export const ontologyBootstrapDossierSchema = z.object({
  schemaVersion: z.literal(ontologyBootstrapSchemaVersion),
  dossierId: bootstrapIdSchema,
  generatedAt: z.string().datetime(),
  phase: ontologyBootstrapPhaseSchema,
  sourceCollectionId: sourceCollectionIdSchema,
  scanBatchId: scanBatchIdSchema,
  legacyReportId: legacyReportIdSchema,
  reportHash: contentHashSchema,
  candidateSetHash: contentHashSchema,
  summary: z.object({
    evidenceFiles: z.number().int().nonnegative(),
    importedEvidenceFiles: z.number().int().nonnegative(),
    parserDetections: z.number().int().nonnegative(),
    eligibleAssertionCandidates: z.number().int().nonnegative(),
    blockedAssertionCandidates: z.number().int().nonnegative(),
    quarantineEntries: z.number().int().nonnegative(),
    localExtensionSuggestions: z.number().int().nonnegative()
  }).strict(),
  evidenceInventory: z.array(z.object({
    sourcePath: ontologyBootstrapSafeTextSchema,
    contentHash: contentHashSchema,
    mediaType: ontologyBootstrapSafeTextSchema,
    sizeBytes: z.number().int().nonnegative(),
    imported: z.boolean(),
    evidenceId: evidenceIdSchema.optional()
  }).strict()),
  parserConfidence: z.array(z.object({
    pluginName: ontologyBootstrapSafeTextSchema,
    pluginVersion: ontologyBootstrapSafeTextSchema,
    shape: ontologyBootstrapSafeTextSchema,
    sourcePath: ontologyBootstrapSafeTextSchema,
    confidence: z.number().min(0).max(1),
    parserEligible: z.boolean()
  }).strict()),
  quarantineGroups: z.array(z.object({
    issueCategory: ontologyBootstrapSafeTextSchema,
    count: z.number().int().positive(),
    sourcePaths: z.array(ontologyBootstrapSafeTextSchema),
    repairActions: z.array(ontologyBootstrapSafeTextSchema)
  }).strict()),
  candidateBatches: z.array(z.object({
    batchId: bootstrapIdSchema,
    label: ontologyBootstrapSafeTextSchema,
    readiness: z.enum(["eligible", "blocked", "review-only"]),
    candidates: z.array(ontologyBootstrapCandidateSchema)
  }).strict()),
  reportOnlyNotes: z.array(z.object({
    noteId: bootstrapIdSchema,
    kind: z.enum(["candidate-entity", "candidate-relationship", "local-extension", "caveat"]),
    message: ontologyBootstrapSafeTextSchema,
    sourceRefs: z.array(ontologyBootstrapSafeTextSchema)
  }).strict()),
  questions: z.array(z.object({
    questionId: bootstrapIdSchema,
    prompt: ontologyBootstrapSafeTextSchema,
    reason: ontologyBootstrapSafeTextSchema,
    relatedRefs: z.array(ontologyBootstrapSafeTextSchema)
  }).strict()),
  localExtensionSuggestions: z.array(z.object({
    suggestionId: bootstrapIdSchema,
    scope: z.literal("investigation-local"),
    label: ontologyBootstrapSafeTextSchema,
    rationale: ontologyBootstrapSafeTextSchema,
    exampleCandidateIds: z.array(legacyCandidateIdSchema)
  }).strict()),
  nextSafeAction: z.object({
    actionId: bootstrapIdSchema,
    label: ontologyBootstrapSafeTextSchema,
    kind: z.enum(["read", "ask-operator", "request-tool", "review"]),
    effect: z.enum(["none", "local-derivative", "ledger-review", "ledger-proposal"])
  }).strict(),
  provenanceRefs: z.array(ontologyBootstrapSafeTextSchema)
}).strict();

const allowedBootstrapEventTypes = ["assertion.proposed"] as const;

export const ontologyBootstrapToolPreviewSchema = z.object({
  previewId: bootstrapIdSchema,
  toolId: ontologyBootstrapSafeTextSchema,
  effect: z.enum(["read-only", "local-derivative", "ledger-review", "ledger-proposal"]),
  previewHash: contentHashSchema,
  summary: ontologyBootstrapSafeTextSchema,
  sourceCollectionId: sourceCollectionIdSchema,
  legacyReportId: legacyReportIdSchema.optional(),
  reportHash: contentHashSchema.optional(),
  candidateSetHash: contentHashSchema.optional(),
  selectedCandidateIds: z.array(legacyCandidateIdSchema).default([]),
  allowedEventTypes: z.array(z.string()).default([]),
  requiresHumanApproval: z.boolean()
}).strict().superRefine((preview, ctx) => {
  const forbidden = preview.allowedEventTypes.filter(
    (type) => !allowedBootstrapEventTypes.includes(type as "assertion.proposed")
  );

  if (forbidden.length > 0) {
    ctx.addIssue({
      code: "custom",
      path: ["allowedEventTypes"],
      message: "ontology bootstrap previews cannot allow accepted graph events"
    });
  }
});

export type OntologyBootstrapPhase = z.infer<typeof ontologyBootstrapPhaseSchema>;
export type OntologyBootstrapFailure = z.infer<typeof ontologyBootstrapFailureSchema>;
export type OntologyBootstrapDossier = z.infer<typeof ontologyBootstrapDossierSchema>;
export type OntologyBootstrapCandidate = z.infer<typeof ontologyBootstrapCandidateSchema>;
export type OntologyBootstrapToolPreview = z.infer<typeof ontologyBootstrapToolPreviewSchema>;
