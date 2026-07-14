import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  type ActorRef,
  type AppendableKnowledgeEvent,
  type KnowledgeEvent
} from "../../ontology/src/contracts.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";
import {
  readCanonicalStagedLegacyReport,
  type LegacyMigrationReport
} from "../../ingestion/src/legacy-report.js";
import type { LegacyMigrationReviewDto } from "../../ingestion/src/legacy-read-api.js";
import {
  ontologyBootstrapDossierSchema,
  ontologyBootstrapSafeTextSchema,
  ontologyBootstrapToolPreviewSchema,
  type OntologyBootstrapCandidate,
  type OntologyBootstrapDossier,
  type OntologyBootstrapToolPreview
} from "../../ontology-bootstrap/src/contracts.js";
import {
  runFakeOntologyBootstrapSpecialist,
  type FakeOntologyBootstrapSpecialistResult
} from "../../ontology-bootstrap/src/fake-runtime.js";
import type { OntologyBootstrapEvidenceLink } from "../../ontology-bootstrap/src/dossier-builder.js";
import { buildContextPackRef, type ContextPackRef } from "./context-packs.js";
import type { OntologyBootstrapNousMemo } from "./ontology-bootstrap-nous.js";
import { buildAgentProjection } from "./projection.js";
import type { AgentFailureCategory, AgentToolSideEffectClass } from "./projection-types.js";
import { buildSpecialistHandoffMaterial } from "./specialist-handoff-manifest.js";
import {
  appendSpecialistFinalOutputStep,
  finalizeSpecialistRunAfterHandoff,
  recordSpecialistHandoff,
  type SpecialistHandoffManifestStore
} from "./specialist-runner-kernel.js";
import { createAgentToolGateway } from "./tool-gateway.js";
import type { AgentToolPreview } from "./tool-gateway.js";

const agentBootstrapReviewSchemaVersion = "agent-ontology-bootstrap-review.v1" as const;
const agentCoreVersion = "0.1.0";
const agentPackVersions = { core: "0.1.0", agent: "0.1.0" } as const;
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

export interface RunOntologyBootstrapResidentWorkflowInput {
  readonly ledger: EventLedger;
  readonly actor: ActorRef;
  readonly residentAgentId: string;
  readonly runId: string;
  readonly taskId?: string;
  readonly sourceCollectionId: string;
  /** Canonical staged-report identity; the workflow never consumes caller-supplied report bytes. */
  readonly stagedReport: CanonicalStagedReportIdentity;
  readonly reportEventId: string;
  readonly derivativeStore: SpecialistHandoffManifestStore;
  readonly review: LegacyMigrationReviewDto;
  readonly evidenceLinks: readonly OntologyBootstrapEvidenceLink[];
  readonly selectedCandidateIds: readonly string[];
  readonly importBatchId?: string;
  readonly stagingBatchId?: string;
  readonly maxCandidatesPerBundle?: number;
  readonly nousMemo?: OntologyBootstrapNousMemoAttachment;
  readonly now: () => string;
}

export interface CanonicalStagedReportIdentity {
  readonly sourceCollectionId: string;
  readonly scanBatchId: string;
  readonly legacyReportId: string;
  readonly reportHash: `sha256:${string}`;
}

interface ResolvedOntologyBootstrapResidentWorkflowInput extends RunOntologyBootstrapResidentWorkflowInput {
  readonly report: LegacyMigrationReport;
}

export interface OntologyBootstrapNousMemoAttachment {
  readonly invocationId: string;
  readonly outputArtifactHash: `sha256:${string}`;
  readonly memo: OntologyBootstrapNousMemo;
}

export type RunOntologyBootstrapResidentWorkflowResult =
  | {
      readonly ok: true;
      readonly reviewBundle: OntologyBootstrapAgentReviewBundle;
      readonly reviewBundleHash: `sha256:${string}`;
      readonly contextPack: ContextPackRef;
      readonly candidateBundleHashes: readonly `sha256:${string}`[];
      readonly nousMemoHash?: `sha256:${string}`;
      readonly pendingApprovalToolRequestIds: readonly string[];
      readonly eventIds: readonly string[];
    }
  | {
      readonly ok: false;
      readonly category: AgentFailureCategory;
      readonly message: string;
      readonly eventIds: readonly string[];
    };

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

export async function runOntologyBootstrapResidentWorkflow(
  input: RunOntologyBootstrapResidentWorkflowInput
): Promise<RunOntologyBootstrapResidentWorkflowResult> {
  const eventIds: string[] = [];
  const initialProjection = buildAgentProjection(await input.ledger.readAll());
  const run = initialProjection.runs.get(input.runId);
  if (run === undefined || run.runType !== "ontology-bootstrap") {
    return {
      ok: false,
      category: "provenance-missing",
      message: "Ontology bootstrap run was not found.",
      eventIds: []
    };
  }

  const taskId = input.taskId ?? run.taskId;
  if (input.taskId !== undefined && run.taskId !== undefined && input.taskId !== run.taskId) {
    return await appendRunFailure(input, {
      category: "provenance-missing",
      message: "Ontology bootstrap task does not match the target run.",
      retryable: false,
      allowedActions: ["restart the ontology bootstrap run with the matching task"]
    });
  }

  const canonicalInput = await canonicalizeOntologyBootstrapInput(input);
  if (canonicalInput === undefined) {
    return await appendRunFailure(input, {
      category: "provenance-missing",
      message: "Ontology bootstrap requires one exact canonical staged-report event and artifact readback before effects.",
      retryable: false,
      allowedActions: ["repair the staged legacy report event and derivative artifact binding"]
    });
  }

  const bootstrap = safeRunBootstrapSpecialist(canonicalInput);
  if (!bootstrap.ok) {
    return await appendRunFailure(input, failureForBootstrapResult(bootstrap));
  }

  const invalidSelectionFailure = selectedCandidateFailure(input.selectedCandidateIds, bootstrap.dossier);
  if (invalidSelectionFailure !== undefined) {
    return await appendRunFailure(input, invalidSelectionFailure);
  }

  const reviewBundle = buildOntologyBootstrapAgentReviewBundle({
    runId: canonicalInput.runId,
    ...(taskId === undefined ? {} : { taskId }),
    generatedAt: canonicalInput.now(),
    dossier: bootstrap.dossier,
    toolPreviews: bootstrap.toolPreviews,
    ...(input.maxCandidatesPerBundle === undefined ? {} : {
      maxCandidatesPerBundle: input.maxCandidatesPerBundle
    })
  });
  const reviewBundleHash = hashOntologyBootstrapReviewBundle(reviewBundle);
  const contextPack = buildOntologyBootstrapDossierContextPack({
    generatedAt: canonicalInput.now(),
    dossier: bootstrap.dossier,
    reviewBundleHash,
    selectedCandidateIds: reviewBundle.stagingReview.selectedCandidateIds
  });
  const candidateBundleHashes = reviewBundle.candidateBundles.map(
    (bundle) => bundle.bundleHash as `sha256:${string}`
  );

  const projectionBeforeSteps = buildAgentProjection(await canonicalInput.ledger.readAll());
  const runCausationId = lastValue(projectionBeforeSteps.runs.get(canonicalInput.runId)?.eventIds ?? []);
  const stepEvent = await appendDossierStepIfNeeded(canonicalInput, {
    projectionStepIds: projectionBeforeSteps.runs.get(canonicalInput.runId)?.stepIds ?? [],
    ...(runCausationId === undefined ? {} : { runCausationId }),
    reviewBundleHash,
    contextPackHash: contextPack.contentHash as `sha256:${string}`,
    candidateBundleHashes
  });
  if (stepEvent !== undefined) {
    eventIds.push(stepEvent.id);
  }

  const nousStepEvent = await appendNousMemoStepIfNeeded(canonicalInput, {
    reviewBundleHash,
    projectionStepIds: buildAgentProjection(await canonicalInput.ledger.readAll()).runs.get(canonicalInput.runId)?.stepIds ?? []
  });
  if (nousStepEvent !== undefined) {
    eventIds.push(nousStepEvent.id);
  }

  const toolRequestEventIds: string[] = [];
  const pendingApprovalToolRequestIds: string[] = [];
  for (const preview of bootstrap.toolPreviews) {
    if (!isApprovalPreview(preview)) {
      continue;
    }
    if (taskId === undefined) {
      return await appendRunFailure(canonicalInput, {
        category: "approval-required",
        message: "Ontology bootstrap approval requests require a linked agent task.",
        retryable: false,
        allowedActions: ["create a task before requesting ontology bootstrap approval"]
      });
    }

    const toolRequestId = toolRequestIdForBootstrapPreview(preview);
    pendingApprovalToolRequestIds.push(toolRequestId);
    const currentProjection = buildAgentProjection(await canonicalInput.ledger.readAll());
    const existingToolRequest = currentProjection.toolRequests.get(toolRequestId);
    if (existingToolRequest !== undefined) {
      if (!existingToolRequest.inputArtifactHashes.includes(preview.previewHash)) {
        return await appendRunFailure(canonicalInput, {
          category: "approval-stale",
          message: "Ontology bootstrap approval preview changed after the existing tool request.",
          retryable: false,
          allowedActions: ["start a fresh ontology bootstrap run for the changed preview"]
        });
      }
      continue;
    }

    const gateway = createAgentToolGateway({
      ledger: canonicalInput.ledger,
      actor: canonicalInput.actor,
      now: canonicalInput.now
    });
    const agentPreview = toAgentOntologyBootstrapToolPreview(preview);
    const toolScope = agentPreview.scope ?? agentPreview.summary;
    const estimatedEffect = agentPreview.estimatedEffect ?? agentPreview.summary;
    const inputArtifactHashes = agentPreview.artifactHashes ?? [];
    const requested = await gateway.requestTool({
      toolRequestId,
      residentAgentId: canonicalInput.residentAgentId,
      taskId,
      runId: canonicalInput.runId,
      toolId: preview.toolId,
      sideEffectClass: sideEffectClassForBootstrapPreview(preview),
      requiredApprovalClass: "ledger-review",
      preview: agentPreview,
      scope: toolScope,
      estimatedEffect,
      inputArtifactHashes
    });
    toolRequestEventIds.push(requested.id);
    eventIds.push(requested.id);
  }

  if (taskId !== undefined && pendingApprovalToolRequestIds.length > 0) {
    const statusCausationId = lastValue(toolRequestEventIds);
    const statusEvent = await appendWaitingForApprovalIfNeeded(canonicalInput, {
      taskId,
      ...(statusCausationId === undefined ? {} : { causationId: statusCausationId })
    });
    if (statusEvent !== undefined) {
      eventIds.push(statusEvent.id);
    }
  }

  try {
    const terminal = await persistCanonicalOntologyBootstrapHandoff({
      input: canonicalInput,
      taskId,
      reviewBundle,
      reviewBundleHash,
      pendingApprovalToolRequestIds,
      relatedEventIds: await canonicalBootstrapHandoffRelatedEventIds(canonicalInput.ledger, canonicalInput.runId, taskId)
    });
    eventIds.push(...terminal);
  } catch {
    return await appendRunFailure(canonicalInput, {
      category: "external-effect-failed",
      message: "Ontology bootstrap handoff could not complete an exact durable lifecycle readback.",
      retryable: true,
      allowedActions: ["inspect canonical ontology bootstrap handoff storage and retry"]
    });
  }

  return {
    ok: true,
    reviewBundle,
    reviewBundleHash,
    contextPack,
    candidateBundleHashes,
    ...(input.nousMemo === undefined ? {} : { nousMemoHash: input.nousMemo.memo.memoHash as `sha256:${string}` }),
    pendingApprovalToolRequestIds,
    eventIds: Object.freeze(eventIds)
  };
}

async function canonicalizeOntologyBootstrapInput(
  input: RunOntologyBootstrapResidentWorkflowInput
): Promise<ResolvedOntologyBootstrapResidentWorkflowInput | undefined> {
  if (!isCanonicalStagedReportIdentity(input.stagedReport) ||
    typeof input.reportEventId !== "string" ||
    input.reportEventId.length === 0 ||
    input.derivativeStore === undefined ||
    typeof input.derivativeStore.get !== "function" ||
    typeof input.derivativeStore.put !== "function" ||
    input.stagedReport.sourceCollectionId !== input.sourceCollectionId
  ) {
    return undefined;
  }
  try {
    const canonical = await readCanonicalStagedLegacyReport({
      ledger: input.ledger,
      derivativeStore: input.derivativeStore,
      reportEventId: input.reportEventId,
      sourceCollectionId: input.stagedReport.sourceCollectionId,
      scanBatchId: input.stagedReport.scanBatchId,
      legacyReportId: input.stagedReport.legacyReportId,
      reportHash: input.stagedReport.reportHash
    });
    if (!canonical.ok ||
      canonical.report.sourceCollectionId !== input.sourceCollectionId ||
      canonical.report.scanBatchId !== input.stagedReport.scanBatchId ||
      canonical.report.legacyReportId !== input.stagedReport.legacyReportId ||
      canonical.report.reportHash !== input.stagedReport.reportHash
    ) {
      return undefined;
    }
    const run = buildAgentProjection(await input.ledger.readAll()).runs.get(input.runId);
    if (run === undefined ||
      run.runType !== "ontology-bootstrap" ||
      !run.sourceEventIds.includes(input.reportEventId) ||
      !run.inputArtifactHashes.includes(canonical.report.reportHash) ||
      !run.inputArtifactHashes.includes(canonical.report.candidateSetHash)
    ) {
      return undefined;
    }
    return Object.freeze({ ...input, report: canonical.report });
  } catch {
    return undefined;
  }
}

function isCanonicalStagedReportIdentity(value: unknown): value is CanonicalStagedReportIdentity {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.sourceCollectionId === "string" &&
    typeof candidate.scanBatchId === "string" &&
    typeof candidate.legacyReportId === "string" &&
    typeof candidate.reportHash === "string" &&
    /^sha256:[a-f0-9]{64}$/.test(candidate.reportHash);
}

async function canonicalBootstrapHandoffRelatedEventIds(
  ledger: EventLedger,
  runId: string,
  taskId: string | undefined
): Promise<readonly string[]> {
  const events = await ledger.readAll();
  return Object.freeze(events.filter((event) => {
    if (event.type === "agent.specialist-run.step.recorded") {
      return event.payload.runId === runId &&
        (event.payload.stepId === "step_ontology_bootstrap_dossier" || event.payload.stepId === "step_ontology_bootstrap_nous_review");
    }
    if (event.type === "agent.tool.requested") {
      return event.payload.runId === runId;
    }
    return event.type === "agent.task.status.changed" &&
      taskId !== undefined &&
      event.payload.taskId === taskId &&
      event.payload.runId === runId;
  }).map((event) => event.id));
}

async function persistCanonicalOntologyBootstrapHandoff(input: {
  readonly input: ResolvedOntologyBootstrapResidentWorkflowInput;
  readonly taskId: string | undefined;
  readonly reviewBundle: OntologyBootstrapAgentReviewBundle;
  readonly reviewBundleHash: `sha256:${string}`;
  readonly pendingApprovalToolRequestIds: readonly string[];
  readonly relatedEventIds: readonly string[];
}): Promise<readonly string[]> {
  const store = input.input.derivativeStore;
  if (store === undefined) throw new Error("Canonical ontology bootstrap handoff requires a derivative read/write capability.");
  const reviewBytes = Buffer.from(stableJson(input.reviewBundle), "utf8");
  const reviewStored = await store.put(reviewBytes);
  if (reviewStored.contentHash !== input.reviewBundleHash || reviewStored.sizeBytes !== reviewBytes.byteLength) {
    throw new Error("Canonical ontology bootstrap review artifact hash mismatch.");
  }
  const reviewReadback = await store.get(input.reviewBundleHash);
  if (!Buffer.isBuffer(reviewReadback) || !reviewReadback.equals(reviewBytes)) {
    throw new Error("Canonical ontology bootstrap review artifact readback mismatch.");
  }
  const artifactId = `artifact_${input.input.runId}_ontology_bootstrap_review_bundle`;
  const handoffMaterial = buildSpecialistHandoffMaterial({
    status: input.pendingApprovalToolRequestIds.length === 0 ? "ready-for-review" : "waiting-for-approval",
    safeSummary: "Canonical ontology bootstrap review material is durable and remains proposal-only.",
    contextPackRefs: [],
    outputArtifacts: [{
      artifactId,
      artifactKind: "ontology-bootstrap-review-bundle",
      schemaId: agentBootstrapReviewSchemaVersion,
      artifactHash: input.reviewBundleHash,
      safeSummary: "Evidence-first ontology bootstrap review bundle; no ontology truth is established."
    }],
    toolRequestIds: [...input.pendingApprovalToolRequestIds],
    approvalRequirements: input.pendingApprovalToolRequestIds.map((toolRequestId) => ({
      approvalClass: "ledger-review" as const,
      reason: "Human staging review is required before any later proposal work.",
      toolRequestId
    })),
    nextSafeActions: [{
      actionId: `action_${input.input.runId}_review_ontology_bootstrap_bundle`,
      label: "Review proposal-only ontology bootstrap evidence bundle",
      kind: "review" as const,
      effect: "none" as const,
      artifactId
    }],
    sourceEventIds: [input.input.reportEventId],
    relatedEventIds: [...input.relatedEventIds]
  });
  const finalOutput = await appendSpecialistFinalOutputStep({
    ledger: input.input.ledger,
    materialStore: store,
    actor: input.input.actor,
    now: input.input.now,
    runId: input.input.runId,
    ...(input.taskId === undefined ? {} : { taskId: input.taskId }),
    handoffMaterial
  });
  const recorded = await recordSpecialistHandoff({
    ledger: input.input.ledger,
    manifestStore: store,
    actor: input.input.actor,
    now: input.input.now,
    runId: input.input.runId,
    ...(input.taskId === undefined ? {} : { taskId: input.taskId })
  });
  const finalized = await finalizeSpecialistRunAfterHandoff({
    ledger: input.input.ledger,
    actor: input.input.actor,
    now: input.input.now,
    recorded
  });
  await assertCanonicalOntologyBootstrapTerminalReadback({
    ledger: input.input.ledger,
    runId: input.input.runId,
    actorId: input.input.actor.id,
    finalOutput,
    prepared: recorded.prepared,
    recorded: recorded.recorded,
    terminal: finalized.terminal
  });
  return Object.freeze([finalOutput.id, recorded.prepared.id, recorded.recorded.id, finalized.terminal.id]);
}

async function assertCanonicalOntologyBootstrapTerminalReadback(input: {
  readonly ledger: EventLedger;
  readonly runId: string;
  readonly actorId: string;
  readonly finalOutput: KnowledgeEvent;
  readonly prepared: KnowledgeEvent;
  readonly recorded: KnowledgeEvent;
  readonly terminal: KnowledgeEvent;
}): Promise<void> {
  const stream = await input.ledger.readStream(runStreamId(input.runId));
  const chain = [input.finalOutput, input.prepared, input.recorded, input.terminal].map((event) =>
    stream.find((candidate) => candidate.id === event.id)
  );
  const [finalOutput, prepared, recorded, terminal] = chain;
  if (finalOutput === undefined || prepared === undefined || recorded === undefined || terminal === undefined) {
    throw new Error("Canonical ontology bootstrap lifecycle readback is incomplete.");
  }
  if (
    finalOutput.type !== "agent.specialist-run.step.recorded" ||
    finalOutput.payload.stepKind !== "final-output" ||
    prepared.type !== "agent.specialist-handoff.prepared" ||
    recorded.type !== "agent.specialist-handoff.recorded" ||
    (terminal.type !== "agent.specialist-run.completed" && terminal.type !== "agent.specialist-run.failed") ||
    ![finalOutput, prepared, recorded, terminal].every((event) => event.context.actor.id === input.actorId) ||
    finalOutput.context.correlationId !== `corr_${input.runId}_final_output` ||
    prepared.context.correlationId !== `corr_${input.runId}_handoff_prepared` ||
    recorded.context.correlationId !== `corr_${input.runId}_handoff_recorded` ||
    terminal.context.correlationId !== `corr_${input.runId}_${terminal.type === "agent.specialist-run.failed" ? "failed" : "completed"}` ||
    prepared.context.causationId !== finalOutput.id ||
    recorded.context.causationId !== prepared.id ||
    terminal.context.causationId !== recorded.id ||
    !(finalOutput.sequence < prepared.sequence && prepared.sequence < recorded.sequence && recorded.sequence < terminal.sequence)
  ) {
    throw new Error("Canonical ontology bootstrap lifecycle actor, event type, causation, or order readback failed.");
  }
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

function safeRunBootstrapSpecialist(
  input: ResolvedOntologyBootstrapResidentWorkflowInput
): FakeOntologyBootstrapSpecialistResult {
  try {
    return runFakeOntologyBootstrapSpecialist({
      sourceCollectionId: input.sourceCollectionId,
      report: input.report,
      review: input.review,
      evidenceLinks: input.evidenceLinks,
      selectedCandidateIds: input.selectedCandidateIds,
      ...(input.importBatchId === undefined ? {} : { importBatchId: input.importBatchId }),
      ...(input.stagingBatchId === undefined ? {} : { stagingBatchId: input.stagingBatchId }),
      now: input.now
    });
  } catch {
    return {
      ok: false,
      failure: {
        code: "secret-detected",
        message: "Ontology bootstrap input failed safe DTO validation.",
        allowedRepairActions: ["review sanitized legacy report and evidence links"]
      }
    };
  }
}

function selectedCandidateFailure(
  selectedCandidateIds: readonly string[],
  dossier: OntologyBootstrapDossier
): {
  readonly category: AgentFailureCategory;
  readonly message: string;
  readonly retryable: boolean;
  readonly allowedActions: readonly string[];
} | undefined {
  if (selectedCandidateIds.length === 0) {
    return undefined;
  }

  const eligibleIds = new Set(
    dossier.candidateBatches
      .filter((batch) => batch.readiness === "eligible")
      .flatMap((batch) => batch.candidates.map((candidate) => candidate.candidateId))
  );
  const missingEligible = selectedCandidateIds.filter((candidateId) => !eligibleIds.has(candidateId));
  if (missingEligible.length === 0) {
    return undefined;
  }

  return {
    category: "provenance-missing",
    message: "Selected ontology bootstrap candidates must have same-source evidence links.",
    retryable: true,
    allowedActions: ["import matching evidence before staging approval", "remove blocked candidates from the selection"]
  };
}

function failureForBootstrapResult(
  result: Extract<FakeOntologyBootstrapSpecialistResult, { readonly ok: false }>
): {
  readonly category: AgentFailureCategory;
  readonly message: string;
  readonly retryable: boolean;
  readonly allowedActions: readonly string[];
} {
  return {
    category: failureCategoryFor(result.failure.code),
    message: result.failure.message,
    retryable: result.failure.code !== "secret-detected",
    allowedActions: result.failure.allowedRepairActions
  };
}

function failureCategoryFor(code: Extract<FakeOntologyBootstrapSpecialistResult, { readonly ok: false }>["failure"]["code"]):
  AgentFailureCategory {
  if (code === "secret-detected") {
    return "secret-detected";
  }
  if (code === "provider-unavailable") {
    return "provider-unavailable";
  }
  if (code === "projection-lag") {
    return "projection-lag";
  }
  if (code === "raw-import-approval-required" || code === "staging-approval-required") {
    return "approval-required";
  }
  if (code === "accepted-event-forbidden") {
    return "permission-denied";
  }
  return "provenance-missing";
}

async function appendDossierStepIfNeeded(
  input: ResolvedOntologyBootstrapResidentWorkflowInput,
  command: {
    readonly projectionStepIds: readonly string[];
    readonly runCausationId?: string;
    readonly reviewBundleHash: `sha256:${string}`;
    readonly contextPackHash: `sha256:${string}`;
    readonly candidateBundleHashes: readonly `sha256:${string}`[];
  }
): Promise<KnowledgeEvent | undefined> {
  if (command.projectionStepIds.includes("step_ontology_bootstrap_dossier")) {
    return undefined;
  }

  const event: AppendableKnowledgeEvent<"agent.specialist-run.step.recorded"> = {
    type: "agent.specialist-run.step.recorded",
    version: 1,
    streamId: runStreamId(input.runId),
    context: agentContext(input, `corr_${input.runId}_ontology_bootstrap_dossier`, input.actor, command.runCausationId),
    payload: {
      runId: input.runId,
      stepId: "step_ontology_bootstrap_dossier",
      summary: "Built ontology bootstrap dossier and review bundle for human staging review.",
      inputArtifactHashes: [input.report.reportHash, input.report.candidateSetHash],
      outputArtifactHashes: [
        command.reviewBundleHash,
        command.contextPackHash,
        ...command.candidateBundleHashes
      ]
    }
  };
  return await input.ledger.append(event);
}

async function appendWaitingForApprovalIfNeeded(
  input: ResolvedOntologyBootstrapResidentWorkflowInput,
  command: {
    readonly taskId: string;
    readonly causationId?: string;
  }
): Promise<KnowledgeEvent | undefined> {
  const projection = buildAgentProjection(await input.ledger.readAll());
  if (projection.tasks.get(command.taskId)?.status === "waiting-for-approval") {
    return undefined;
  }

  const event: AppendableKnowledgeEvent<"agent.task.status.changed"> = {
    type: "agent.task.status.changed",
    version: 1,
    streamId: taskStreamId(command.taskId),
    context: agentContext(input, `corr_${command.taskId}_ontology_bootstrap_waiting`, input.actor, command.causationId),
    payload: {
      taskId: command.taskId,
      status: "waiting-for-approval",
      changedBy: input.actor.id,
      reason: "Ontology bootstrap staging approval requires human ledger review.",
      runId: input.runId
    }
  };
  return await input.ledger.append(event);
}

async function appendNousMemoStepIfNeeded(
  input: ResolvedOntologyBootstrapResidentWorkflowInput,
  command: {
    readonly reviewBundleHash: `sha256:${string}`;
    readonly projectionStepIds: readonly string[];
  }
): Promise<KnowledgeEvent | undefined> {
  if (input.nousMemo === undefined || command.projectionStepIds.includes("step_ontology_bootstrap_nous_review")) {
    return undefined;
  }

  const event: AppendableKnowledgeEvent<"agent.specialist-run.step.recorded"> = {
    type: "agent.specialist-run.step.recorded",
    version: 1,
    streamId: runStreamId(input.runId),
    context: agentContext(input, `corr_${input.runId}_ontology_bootstrap_nous`, input.actor),
    payload: {
      runId: input.runId,
      stepId: "step_ontology_bootstrap_nous_review",
      summary: `Attached Nous review note: ${input.nousMemo.memo.summary}`,
      invocationId: input.nousMemo.invocationId,
      inputArtifactHashes: [command.reviewBundleHash],
      outputArtifactHashes: [
        input.nousMemo.outputArtifactHash,
        input.nousMemo.memo.memoHash as `sha256:${string}`
      ]
    }
  };
  return await input.ledger.append(event);
}

async function appendCompletionIfNeeded(
  input: RunOntologyBootstrapResidentWorkflowInput,
  command: {
    readonly reviewBundleHash: `sha256:${string}`;
    readonly contextPackHash: `sha256:${string}`;
    readonly candidateBundleHashes: readonly `sha256:${string}`[];
    readonly relatedEventIds: readonly string[];
  }
): Promise<KnowledgeEvent | undefined> {
  const projection = buildAgentProjection(await input.ledger.readAll());
  if (projection.runs.get(input.runId)?.state === "completed") {
    return undefined;
  }

  const event: AppendableKnowledgeEvent<"agent.specialist-run.completed"> = {
    type: "agent.specialist-run.completed",
    version: 1,
    streamId: runStreamId(input.runId),
    context: agentContext(input, `corr_${input.runId}_ontology_bootstrap_completed`, input.actor, lastValue(command.relatedEventIds)),
    payload: {
      runId: input.runId,
      completedAt: input.now(),
      outputArtifactHashes: [
        command.reviewBundleHash,
        command.contextPackHash,
        ...command.candidateBundleHashes
      ],
      ...(command.relatedEventIds.length === 0 ? {} : { relatedEventIds: [...command.relatedEventIds] }),
      summary: "Ontology bootstrap review bundle is ready; no human approval request is pending."
    }
  };
  return await input.ledger.append(event);
}

async function appendRunFailure(
  input: RunOntologyBootstrapResidentWorkflowInput,
  failure: {
    readonly category: AgentFailureCategory;
    readonly message: string;
    readonly retryable: boolean;
    readonly allowedActions: readonly string[];
  }
): Promise<RunOntologyBootstrapResidentWorkflowResult> {
  const projection = buildAgentProjection(await input.ledger.readAll());
  if (projection.runs.get(input.runId)?.state === "failed") {
    return {
      ok: false,
      category: failure.category,
      message: failure.message,
      eventIds: []
    };
  }

  const event: AppendableKnowledgeEvent<"agent.specialist-run.failed"> = {
    type: "agent.specialist-run.failed",
    version: 1,
    streamId: runStreamId(input.runId),
    context: agentContext(input, `corr_${input.runId}_ontology_bootstrap_failed`, input.actor, lastValue(projection.runs.get(input.runId)?.eventIds ?? [])),
    payload: {
      runId: input.runId,
      failedAt: input.now(),
      category: failure.category,
      message: failure.message,
      retryable: failure.retryable,
      allowedActions: [...failure.allowedActions]
    }
  };
  const committed = await input.ledger.append(event);
  return {
    ok: false,
    category: failure.category,
    message: failure.message,
    eventIds: Object.freeze([committed.id])
  };
}

function isApprovalPreview(preview: OntologyBootstrapToolPreview): boolean {
  return preview.toolId === "legacy.raw-import.approval.request" ||
    preview.toolId === "legacy.staging.approval.request";
}

function toolRequestIdForBootstrapPreview(preview: OntologyBootstrapToolPreview): string {
  if (preview.toolId === "legacy.raw-import.approval.request") {
    return "toolreq_ontology_bootstrap_raw_import_approval";
  }
  if (preview.toolId === "legacy.staging.approval.request") {
    return "toolreq_ontology_bootstrap_staging_approval";
  }
  return `toolreq_${preview.previewId}`;
}

function sideEffectClassForBootstrapPreview(preview: OntologyBootstrapToolPreview): AgentToolSideEffectClass {
  if (preview.effect === "read-only" || preview.effect === "local-derivative" || preview.effect === "ledger-review") {
    return preview.effect;
  }
  return "ledger-proposal";
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

function agentContext(
  input: Pick<RunOntologyBootstrapResidentWorkflowInput, "actor" | "now">,
  correlationId: string,
  actor = input.actor,
  causationId?: string
) {
  return {
    actor,
    occurredAt: input.now(),
    correlationId,
    coreVersion: agentCoreVersion,
    packVersions: agentPackVersions,
    ...(causationId === undefined ? {} : { causationId })
  };
}

function taskStreamId(taskId: string): string {
  return `agent_task_${taskId}`;
}

function runStreamId(runId: string): string {
  return `agent_run_${runId}`;
}

function lastValue<T>(values: readonly T[]): T | undefined {
  return values.length === 0 ? undefined : values[values.length - 1];
}
