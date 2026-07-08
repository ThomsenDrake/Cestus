import { createHash } from "node:crypto";
import { z } from "zod";
import {
  ontologyBootstrapDossierSchema,
  ontologyBootstrapSafeTextSchema,
  ontologyBootstrapToolPreviewSchema,
  type OntologyBootstrapCandidate,
  type OntologyBootstrapDossier,
  type OntologyBootstrapToolPreview
} from "../../ontology-bootstrap/src/contracts.js";
import { buildContextPackRef, type ContextPackRef } from "./context-packs.js";
import type { AgentToolPreview } from "./tool-gateway.js";

const agentBootstrapReviewSchemaVersion = "agent-ontology-bootstrap-review.v1" as const;
const contentHashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const runIdSchema = z.string().regex(/^run_[a-zA-Z0-9_-]+$/);
const taskIdSchema = z.string().regex(/^task_[a-zA-Z0-9_-]+$/);
const candidateIdSchema = z.string().regex(/^legacy_candidate_[a-zA-Z0-9_-]+$/);
const safeBootstrapIdSchema = z.string().regex(/^bootstrap_[a-zA-Z0-9_-]+$/);
const safeObjectSchema = z.union([ontologyBootstrapSafeTextSchema, z.number(), z.boolean(), z.null()]);
const candidateBundleStatusSchema = z.enum(["eligible", "blocked", "rejected", "review-only"]);
const allowedBootstrapEventTypes = new Set(["assertion.proposed"]);

const agentBootstrapEvidenceRefSchema = z.object({
  candidateId: candidateIdSchema,
  evidenceContentHash: contentHashSchema,
  sourcePath: ontologyBootstrapSafeTextSchema,
  sourceCollectionId: ontologyBootstrapSafeTextSchema,
  scanBatchId: ontologyBootstrapSafeTextSchema,
  reportHash: contentHashSchema,
  candidateSetHash: contentHashSchema,
  evidenceId: z.string().regex(/^ev_[a-zA-Z0-9_-]+$/).optional()
}).strict();

const agentBootstrapCandidateBundleItemSchema = z.object({
  candidateId: candidateIdSchema,
  observationId: z.string().regex(/^legacy_observation_[a-zA-Z0-9_-]+$/),
  bundleId: safeBootstrapIdSchema,
  chunkId: safeBootstrapIdSchema,
  status: candidateBundleStatusSchema,
  proposedAssertion: z.object({
    predicate: ontologyBootstrapSafeTextSchema,
    object: safeObjectSchema,
    confidence: z.number().min(0).max(1),
    reviewState: z.literal("proposed-material"),
    subjectRef: ontologyBootstrapSafeTextSchema.optional()
  }).strict(),
  evidenceRefs: z.array(agentBootstrapEvidenceRefSchema).min(1),
  sourceArtifactHashes: z.array(contentHashSchema).min(3),
  rationale: ontologyBootstrapSafeTextSchema,
  alternatives: z.array(ontologyBootstrapSafeTextSchema).min(1),
  uncertainty: ontologyBootstrapSafeTextSchema,
  blockedReasons: z.array(ontologyBootstrapSafeTextSchema)
}).strict();

const agentBootstrapCandidateBundleSchema = z.object({
  bundleId: safeBootstrapIdSchema,
  chunkId: safeBootstrapIdSchema,
  sourceCollectionId: ontologyBootstrapSafeTextSchema,
  scanBatchId: ontologyBootstrapSafeTextSchema,
  legacyReportId: ontologyBootstrapSafeTextSchema,
  reportHash: contentHashSchema,
  candidateSetHash: contentHashSchema,
  generatedAt: z.string().datetime(),
  cursor: z.object({
    currentOffset: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    totalCandidates: z.number().int().nonnegative(),
    nextOffset: z.number().int().positive().optional()
  }).strict(),
  candidateCount: z.number().int().nonnegative(),
  eligibleCount: z.number().int().nonnegative(),
  blockedCount: z.number().int().nonnegative(),
  rejectedCount: z.number().int().nonnegative(),
  reviewOnlyCount: z.number().int().nonnegative(),
  candidates: z.array(agentBootstrapCandidateBundleItemSchema),
  bundleHash: contentHashSchema
}).strict();

const agentBootstrapReviewBundleSchema = z.object({
  schemaVersion: z.literal(agentBootstrapReviewSchemaVersion),
  runId: runIdSchema,
  taskId: taskIdSchema.optional(),
  generatedAt: z.string().datetime(),
  dossier: ontologyBootstrapDossierSchema,
  stagingReview: z.object({
    selectedCandidateIds: z.array(candidateIdSchema),
    toolPreviewHashes: z.array(contentHashSchema),
    requiresHumanApproval: z.boolean()
  }).strict(),
  candidateBundles: z.array(agentBootstrapCandidateBundleSchema),
  toolPreviews: z.array(ontologyBootstrapToolPreviewSchema),
  nextSafeAction: z.object({
    actionId: safeBootstrapIdSchema,
    label: ontologyBootstrapSafeTextSchema,
    kind: z.enum(["read", "ask-operator", "request-tool", "review"]),
    effect: z.enum(["none", "local-derivative", "ledger-review", "ledger-proposal"])
  }).strict()
}).strict();

export type OntologyBootstrapCandidateBundleStatus = z.infer<typeof candidateBundleStatusSchema>;
export type OntologyBootstrapCandidateBundleItem = z.infer<typeof agentBootstrapCandidateBundleItemSchema>;
export type OntologyBootstrapCandidateBundle = z.infer<typeof agentBootstrapCandidateBundleSchema>;
export type OntologyBootstrapAgentReviewBundle = z.infer<typeof agentBootstrapReviewBundleSchema>;

export interface BuildOntologyBootstrapCandidateBundlesInput {
  readonly dossier: OntologyBootstrapDossier;
  readonly generatedAt: string;
  readonly maxCandidatesPerBundle?: number;
}

export interface BuildOntologyBootstrapAgentReviewBundleInput extends BuildOntologyBootstrapCandidateBundlesInput {
  readonly runId: string;
  readonly taskId?: string;
  readonly toolPreviews: readonly OntologyBootstrapToolPreview[];
}

export interface BuildOntologyBootstrapDossierContextPackInput {
  readonly generatedAt: string;
  readonly dossier: OntologyBootstrapDossier;
  readonly reviewBundleHash: `sha256:${string}`;
  readonly selectedCandidateIds?: readonly string[];
  readonly projectionHighWaterMark?: number;
}

interface CandidateBundleDraft {
  readonly candidate: OntologyBootstrapCandidate;
  readonly status: OntologyBootstrapCandidateBundleStatus;
}

export function buildOntologyBootstrapAgentReviewBundle(
  input: BuildOntologyBootstrapAgentReviewBundleInput
): OntologyBootstrapAgentReviewBundle {
  const dossier = ontologyBootstrapDossierSchema.parse(input.dossier);
  const toolPreviews = input.toolPreviews.map((preview) => parseAndAssertBootstrapToolPreview(preview));
  const candidateBundles = buildOntologyBootstrapCandidateBundles({
    dossier,
    generatedAt: input.generatedAt,
    ...(input.maxCandidatesPerBundle === undefined ? {} : { maxCandidatesPerBundle: input.maxCandidatesPerBundle })
  });
  const selectedCandidateIds = sortedUnique(
    toolPreviews.flatMap((preview) => preview.selectedCandidateIds)
  );
  const draft = {
    schemaVersion: agentBootstrapReviewSchemaVersion,
    runId: input.runId,
    ...(input.taskId === undefined ? {} : { taskId: input.taskId }),
    generatedAt: input.generatedAt,
    dossier,
    stagingReview: {
      selectedCandidateIds,
      toolPreviewHashes: sortedUnique(toolPreviews.map((preview) => preview.previewHash)),
      requiresHumanApproval: toolPreviews.some((preview) => preview.requiresHumanApproval)
    },
    candidateBundles,
    toolPreviews,
    nextSafeAction: dossier.nextSafeAction
  };

  return agentBootstrapReviewBundleSchema.parse(draft);
}

export function buildOntologyBootstrapCandidateBundles(
  input: BuildOntologyBootstrapCandidateBundlesInput
): readonly OntologyBootstrapCandidateBundle[] {
  const dossier = ontologyBootstrapDossierSchema.parse(input.dossier);
  const limit = normalizedCandidateLimit(input.maxCandidatesPerBundle);
  const candidates = flattenDossierCandidates(dossier);
  const bundles: OntologyBootstrapCandidateBundle[] = [];

  for (let offset = 0; offset < candidates.length; offset += limit) {
    const bundleNumber = bundles.length + 1;
    const suffix = padBundleNumber(bundleNumber);
    const bundleId = `bootstrap_bundle_${dossier.sourceCollectionId}_${dossier.scanBatchId}_${suffix}`;
    const chunkId = `bootstrap_chunk_${dossier.sourceCollectionId}_${dossier.scanBatchId}_${suffix}`;
    const candidateItems = candidates.slice(offset, offset + limit)
      .map((draft) => buildCandidateBundleItem({
        dossier,
        bundleId,
        chunkId,
        candidate: draft.candidate,
        status: draft.status
      }));
    const bundleDraft = {
      bundleId,
      chunkId,
      sourceCollectionId: dossier.sourceCollectionId,
      scanBatchId: dossier.scanBatchId,
      legacyReportId: dossier.legacyReportId,
      reportHash: dossier.reportHash,
      candidateSetHash: dossier.candidateSetHash,
      generatedAt: input.generatedAt,
      cursor: {
        currentOffset: offset,
        limit,
        totalCandidates: candidates.length,
        ...(offset + limit >= candidates.length ? {} : { nextOffset: offset + limit })
      },
      candidateCount: candidateItems.length,
      eligibleCount: countByStatus(candidateItems, "eligible"),
      blockedCount: countByStatus(candidateItems, "blocked"),
      rejectedCount: countByStatus(candidateItems, "rejected"),
      reviewOnlyCount: countByStatus(candidateItems, "review-only"),
      candidates: candidateItems
    };
    bundles.push(agentBootstrapCandidateBundleSchema.parse({
      ...bundleDraft,
      bundleHash: sha256(stableJson(bundleDraft))
    }));
  }

  return Object.freeze(bundles);
}

export function buildOntologyBootstrapDossierContextPack(
  input: BuildOntologyBootstrapDossierContextPackInput
): ContextPackRef {
  const dossier = ontologyBootstrapDossierSchema.parse(input.dossier);
  const selectedCandidateIds = sortedUnique(input.selectedCandidateIds ?? []);

  return buildContextPackRef({
    contextPackId: "ontology-bootstrap-dossier.v1",
    version: 1,
    generatedAt: input.generatedAt,
    payload: {
      schemaVersion: "agent-ontology-bootstrap-dossier-context.v1",
      generatedAt: input.generatedAt,
      dossier,
      reviewBundleHash: input.reviewBundleHash,
      selectedCandidateIds
    },
    safeSummary: safeText(
      `Ontology bootstrap dossier ${dossier.legacyReportId} with ${dossier.summary.eligibleAssertionCandidates} eligible candidates.`
    ),
    provenanceRefs: [
      dossier.reportHash,
      dossier.candidateSetHash,
      input.reviewBundleHash,
      ...selectedCandidateIds
    ],
    ...(input.projectionHighWaterMark === undefined ? {} : {
      projectionHighWaterMark: input.projectionHighWaterMark
    })
  });
}

export function toAgentOntologyBootstrapToolPreview(input: OntologyBootstrapToolPreview): AgentToolPreview {
  const preview = parseAndAssertBootstrapToolPreview(input);
  const affectedRefs = [
    ...optionalAffectedRef("legacy-report", preview.legacyReportId, preview.reportHash),
    ...optionalAffectedRef("candidate-set", preview.legacyReportId, preview.candidateSetHash),
    ...preview.selectedCandidateIds.map((candidateId) => ({ kind: "legacy-candidate", id: candidateId })),
    ...preview.evidenceRefs.map((ref) => ({
      kind: "evidence",
      id: ref.evidenceId,
      hash: ref.evidenceContentHash,
      candidateId: ref.candidateId
    }))
  ];

  return {
    summary: preview.summary,
    scope: preview.legacyReportId === undefined
      ? `Ontology bootstrap ${preview.sourceCollectionId}`
      : `Ontology bootstrap ${preview.legacyReportId}`,
    estimatedEffect: effectSummaryFor(preview),
    artifactHashes: sortedUnique([
      preview.previewHash,
      ...(preview.reportHash === undefined ? [] : [preview.reportHash]),
      ...(preview.candidateSetHash === undefined ? [] : [preview.candidateSetHash]),
      ...preview.evidenceRefs.map((ref) => ref.evidenceContentHash)
    ]),
    bootstrapPreviewId: preview.previewId,
    bootstrapPreviewHash: preview.previewHash,
    bootstrapToolId: preview.toolId,
    bootstrapEffect: preview.effect,
    sourceCollectionId: preview.sourceCollectionId,
    ...(preview.scanBatchId === undefined ? {} : { scanBatchId: preview.scanBatchId }),
    ...(preview.importBatchId === undefined ? {} : { importBatchId: preview.importBatchId }),
    ...(preview.stagingBatchId === undefined ? {} : { stagingBatchId: preview.stagingBatchId }),
    ...(preview.legacyReportId === undefined ? {} : { legacyReportId: preview.legacyReportId }),
    ...(preview.reportHash === undefined ? {} : { reportHash: preview.reportHash }),
    ...(preview.candidateSetHash === undefined ? {} : { candidateSetHash: preview.candidateSetHash }),
    selectedCandidateIds: preview.selectedCandidateIds,
    evidenceRefs: preview.evidenceRefs,
    allowedEventTypes: preview.allowedEventTypes,
    requiresHumanApproval: preview.requiresHumanApproval,
    affectedRefs
  };
}

export function hashOntologyBootstrapReviewBundle(
  bundle: OntologyBootstrapAgentReviewBundle
): `sha256:${string}` {
  return sha256(stableJson(agentBootstrapReviewBundleSchema.parse(bundle)));
}

function buildCandidateBundleItem(input: {
  readonly dossier: OntologyBootstrapDossier;
  readonly bundleId: string;
  readonly chunkId: string;
  readonly candidate: OntologyBootstrapCandidate;
  readonly status: OntologyBootstrapCandidateBundleStatus;
}): OntologyBootstrapCandidateBundleItem {
  const sourceArtifactHashes = sortedUnique([
    input.dossier.reportHash,
    input.dossier.candidateSetHash,
    input.candidate.evidenceContentHash
  ]);
  const item = {
    candidateId: input.candidate.candidateId,
    observationId: input.candidate.observationId,
    bundleId: input.bundleId,
    chunkId: input.chunkId,
    status: input.status,
    proposedAssertion: {
      predicate: input.candidate.predicate,
      object: input.candidate.object,
      confidence: input.candidate.confidence,
      reviewState: "proposed-material" as const,
      ...(input.candidate.subjectRef === undefined ? {} : { subjectRef: input.candidate.subjectRef })
    },
    evidenceRefs: [{
      candidateId: input.candidate.candidateId,
      ...(input.candidate.evidenceId === undefined ? {} : { evidenceId: input.candidate.evidenceId }),
      evidenceContentHash: input.candidate.evidenceContentHash,
      sourcePath: input.candidate.sourcePath,
      sourceCollectionId: input.dossier.sourceCollectionId,
      scanBatchId: input.dossier.scanBatchId,
      reportHash: input.dossier.reportHash,
      candidateSetHash: input.dossier.candidateSetHash
    }],
    sourceArtifactHashes,
    rationale: rationaleFor(input),
    alternatives: alternativesFor(input),
    uncertainty: uncertaintyFor(input),
    blockedReasons: blockedReasonsFor(input)
  };

  return agentBootstrapCandidateBundleItemSchema.parse(item);
}

function flattenDossierCandidates(dossier: OntologyBootstrapDossier): CandidateBundleDraft[] {
  return dossier.candidateBatches.flatMap((batch) =>
    batch.candidates.map((candidate) => ({
      candidate,
      status: statusForReadiness(batch.readiness)
    }))
  );
}

function statusForReadiness(readiness: OntologyBootstrapDossier["candidateBatches"][number]["readiness"]):
  OntologyBootstrapCandidateBundleStatus {
  if (readiness === "eligible" || readiness === "blocked") {
    return readiness;
  }
  return "review-only";
}

function rationaleFor(input: {
  readonly candidate: OntologyBootstrapCandidate;
  readonly status: OntologyBootstrapCandidateBundleStatus;
}): string {
  if (input.status === "eligible") {
    return safeText(`Legacy parser linked same-source evidence for ${input.candidate.predicate}.`);
  }
  if (input.status === "blocked") {
    return safeText(`Legacy parser found ${input.candidate.predicate} but same-source evidence is missing.`);
  }
  if (input.status === "review-only") {
    return safeText(`Legacy parser found ${input.candidate.predicate} for investigator review.`);
  }
  return safeText(`Legacy parser candidate ${input.candidate.candidateId} was rejected for this review bundle.`);
}

function alternativesFor(input: {
  readonly candidate: OntologyBootstrapCandidate;
  readonly status: OntologyBootstrapCandidateBundleStatus;
}): readonly string[] {
  if (input.status === "eligible") {
    return [
      safeText(`Review predicate ${input.candidate.predicate} with linked evidence.`),
      "Reject or revise during ontology staging review."
    ];
  }
  if (input.status === "blocked") {
    return [
      "Import matching evidence before staging review.",
      "Keep this item as report-only material for now."
    ];
  }
  return [
    "Ask an investigator to classify this candidate shape.",
    "Keep this item out of staging until a supported assertion contract exists."
  ];
}

function uncertaintyFor(input: {
  readonly candidate: OntologyBootstrapCandidate;
  readonly status: OntologyBootstrapCandidateBundleStatus;
}): string {
  if (input.status === "eligible") {
    return safeText(
      `Confidence ${input.candidate.confidence} reflects legacy parser evidence, not accepted ontology truth.`
    );
  }
  if (input.status === "blocked") {
    return safeText(
      `Confidence ${input.candidate.confidence} is held because matching imported evidence is unavailable.`
    );
  }
  return safeText(`Confidence ${input.candidate.confidence} still needs human ontology review.`);
}

function blockedReasonsFor(input: {
  readonly candidate: OntologyBootstrapCandidate;
  readonly status: OntologyBootstrapCandidateBundleStatus;
}): readonly string[] {
  if (input.status === "blocked" && input.candidate.evidenceId === undefined) {
    return ["evidence-link-required"];
  }
  if (input.status === "review-only") {
    return ["unsupported-shape"];
  }
  if (input.status === "rejected") {
    return ["rejected-by-bootstrap-filter"];
  }
  return [];
}

function parseAndAssertBootstrapToolPreview(input: OntologyBootstrapToolPreview): OntologyBootstrapToolPreview {
  const preview = ontologyBootstrapToolPreviewSchema.parse(input);
  const forbiddenEventTypes = preview.allowedEventTypes.filter((eventType) => !allowedBootstrapEventTypes.has(eventType));
  if (forbiddenEventTypes.length > 0) {
    throw new Error("Ontology bootstrap tool previews cannot allow accepted graph events.");
  }

  if (preview.toolId === "legacy.staging.approval.request") {
    const evidenceRefCandidateIds = new Set(preview.evidenceRefs.map((ref) => ref.candidateId));
    for (const candidateId of preview.selectedCandidateIds) {
      if (!evidenceRefCandidateIds.has(candidateId)) {
        throw new Error(`Evidence ref is required for selected ontology bootstrap candidate ${candidateId}.`);
      }
    }
  }

  return preview;
}

function effectSummaryFor(preview: OntologyBootstrapToolPreview): string {
  if (preview.effect === "ledger-review") {
    return "Human ledger review is required before any follow-up event can be recorded.";
  }
  if (preview.effect === "ledger-proposal") {
    return "Follow-up execution may only propose assertions after the required review gates.";
  }
  if (preview.effect === "local-derivative") {
    return "Creates local derivative review material only.";
  }
  return "Read-only review material only.";
}

function normalizedCandidateLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return 50;
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new Error("maxCandidatesPerBundle must be an integer from 1 to 500.");
  }
  return limit;
}

function countByStatus(
  candidates: readonly OntologyBootstrapCandidateBundleItem[],
  status: OntologyBootstrapCandidateBundleStatus
): number {
  return candidates.filter((candidate) => candidate.status === status).length;
}

function optionalAffectedRef(
  kind: string,
  id: string | undefined,
  hash: string | undefined
): readonly { readonly kind: string; readonly id: string; readonly hash: string }[] {
  if (id === undefined || hash === undefined) {
    return [];
  }
  return [{ kind, id, hash }];
}

function sortedUnique<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort(compareCodeUnits);
}

function safeText(value: string): string {
  return ontologyBootstrapSafeTextSchema.parse(value);
}

function padBundleNumber(value: number): string {
  return value.toString().padStart(4, "0");
}

function sha256(text: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(text).digest("hex")}`;
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortStable(value));
}

function sortStable(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortStable);
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => compareCodeUnits(left, right))
        .map(([key, item]) => [key, sortStable(item)])
    );
  }
  return value;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
