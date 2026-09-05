import { z } from "zod";
import type {
  GovernanceExportApprovalId,
  GovernanceExportPreviewDto
} from "../../../ontology/src/governance-export-preview.js";
import type { GovernanceReviewDto } from "../../../ontology/src/governance-read-model.js";
import {
  assertSecretSafeText,
  governanceTags,
  restrictedExportTags,
  type GovernanceTag
} from "../../../ontology/src/governance-policy.js";
import {
  governanceExportPreviewDtoFromJson,
  governanceReviewDtoFromJson
} from "../governance/governance-adapter.js";
import type { AppendGovernanceReviewInput } from "../governance/governance-types.js";
import type {
  AppendEvidenceGovernanceReviewResult,
  EvidenceWorkspaceDto,
  PrepareEvidenceAssertionCandidateInput,
  PrepareEvidenceAssertionCandidateResult
} from "./evidence-types.js";

const safeTextSchema = z.string().min(1).refine(
  (value) => !containsCredentialShapedText(value),
  { message: "text must not contain credential-shaped material" }
);
const evidenceIdSchema = z.string().regex(/^ev_[a-zA-Z0-9_-]+$/).refine(
  (value) => !containsCredentialShapedText(value),
  { message: "ID must not contain credential-shaped material" }
);
const assertionIdSchema = z.string().regex(/^as_[a-zA-Z0-9_-]+$/).refine(
  (value) => !containsCredentialShapedText(value),
  { message: "ID must not contain credential-shaped material" }
);
const eventIdSchema = z.string().regex(/^evt_[a-zA-Z0-9_-]+$/).refine(
  (value) => !containsCredentialShapedText(value),
  { message: "ID must not contain credential-shaped material" }
);
const governanceSafeTextSchema = z.string().min(1).refine(
  isSecretSafeGovernanceText,
  { message: "governance text must not contain credential-shaped material" }
);
const governanceEventRefSchema = z.string().regex(/^evt_[a-zA-Z0-9_-]+$/).refine(
  isSecretSafeGovernanceText,
  { message: "governance event reference must not contain credential-shaped material" }
);
const contentHashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const adapterRefSchema = z.object({ name: safeTextSchema, version: safeTextSchema }).strict();
const occurrenceSchema = z.object({
  occurrenceId: z.string().regex(/^occ_[a-zA-Z0-9_-]+$/),
  sourceCollectionId: z.string().regex(/^src_[a-zA-Z0-9_-]+$/),
  scanBatchId: z.string().regex(/^scan_[a-zA-Z0-9_-]+$/),
  sourcePath: safeTextSchema,
  contentHash: contentHashSchema,
  sizeBytes: z.number().int().nonnegative(),
  status: z.enum(["new", "duplicate", "changed", "missing", "skipped"]),
  adapter: adapterRefSchema.optional(),
  archive: z.object({
    containerPath: safeTextSchema,
    containerHash: contentHashSchema,
    internalPath: safeTextSchema,
    adapter: adapterRefSchema
  }).strict().optional()
}).strict();
const parseJobSchema = z.object({
  parseJobId: z.string().regex(/^parse_[a-zA-Z0-9_-]+$/),
  sourceCollectionId: z.string().regex(/^src_[a-zA-Z0-9_-]+$/),
  importBatchId: z.string().regex(/^imp_[a-zA-Z0-9_-]+$/),
  lane: z.enum(["local", "provider"]),
  parser: adapterRefSchema,
  state: z.enum(["queued", "running", "succeeded", "failed"]),
  coverageStatus: z.enum(["complete", "partial"]).optional(),
  derivative: z.object({ contentHash: contentHashSchema, mediaType: safeTextSchema }).strict().optional()
}).strict();
const governanceTagSchema = z.object({
  tag: z.enum(governanceTags),
  confidence: z.number().min(0).max(1),
  rationale: governanceSafeTextSchema,
  source: z.enum(["ai", "human"]),
  status: z.enum(["active", "removed"]),
  eventId: governanceEventRefSchema
}).strict();
const linkedReferenceSchema = z.object({
  kind: z.enum(["prr", "investigation"]),
  id: safeTextSchema,
  eventIds: z.array(eventIdSchema)
}).strict();
const evidenceReferenceSchema = z.object({
  evidenceId: evidenceIdSchema,
  contentHash: contentHashSchema,
  eventIds: z.array(eventIdSchema)
}).strict();
const assertionCandidateSchema = z.object({
  assertionId: assertionIdSchema,
  evidenceReferences: z.array(evidenceReferenceSchema).min(1),
  predicate: safeTextSchema,
  confidence: z.number().min(0).max(1),
  reviewState: z.literal("proposed"),
  reviewRequired: z.literal(true),
  eventId: eventIdSchema
}).strict();
const evidenceItemSchema = z.object({
  evidenceId: evidenceIdSchema,
  contentHash: contentHashSchema.optional(),
  mediaType: safeTextSchema.optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  source: z.object({ kind: safeTextSchema, label: safeTextSchema }).strict().optional(),
  sourceCollections: z.array(z.object({
    sourceCollectionId: z.string().regex(/^src_[a-zA-Z0-9_-]+$/),
    label: safeTextSchema
  }).strict()),
  importBatchIds: z.array(z.string().regex(/^imp_[a-zA-Z0-9_-]+$/)),
  occurrences: z.array(occurrenceSchema),
  parseJobs: z.array(parseJobSchema),
  governanceTags: z.array(governanceTagSchema),
  quarantined: z.boolean(),
  quarantineLockLevels: z.array(z.enum(["workflow", "export", "all"])),
  tombstoned: z.boolean(),
  linkedReferences: z.array(linkedReferenceSchema),
  provenanceComplete: z.boolean(),
  selectableForAssertionCandidate: z.boolean(),
  blockingReasons: z.array(safeTextSchema)
}).strict();
type ParsedEvidenceItemDto = z.infer<typeof evidenceItemSchema>;
const diagnosticSchema = z.object({
  code: z.enum(["projection-error", "missing-provenance", "secret-safety"]),
  severity: z.enum(["warning", "error"]),
  message: safeTextSchema,
  repairActions: z.array(safeTextSchema).min(1)
}).strict();
const evidenceWorkspaceSchema = z.object({
  schemaVersion: z.literal("evidence-workspace.v1"),
  status: z.enum(["ready", "degraded"]),
  sourceHighWaterMark: z.number().int().nonnegative(),
  items: z.array(evidenceItemSchema),
  assertionCandidates: z.array(assertionCandidateSchema),
  diagnostics: z.array(diagnosticSchema),
  governance: z.object({
    schemaVersion: z.literal("evidence-governance-workspace.v1"),
    reviews: z.array(z.unknown()),
    exportPreview: z.unknown()
  }).strict()
}).strict();
const preparationResultSchema = z.object({
  ok: z.literal(true),
  candidate: assertionCandidateSchema,
  workspace: z.unknown()
}).strict();
const governanceReviewResultSchema = z.object({
  ok: z.literal(true),
  workspace: z.unknown()
}).strict();
const actionDiagnosticSchema = z.object({
  ok: z.literal(false),
  diagnostic: z.object({
    code: z.enum([
      "EVIDENCE_ASSERTION_INPUT_INVALID",
      "EVIDENCE_ASSERTION_PREPARATION_BLOCKED",
      "EVIDENCE_GOVERNANCE_REVIEW_INPUT_INVALID",
      "EVIDENCE_GOVERNANCE_REVIEW_BLOCKED"
    ]),
    message: safeTextSchema,
    repairActions: z.array(safeTextSchema).min(1)
  }).strict()
}).strict();
const appendGovernanceReviewInputSchema = z.object({
  evidenceRef: z.string().regex(/^ev_[a-zA-Z0-9_-]+$/).refine(
    isSecretSafeGovernanceText,
    { message: "evidence reference must not contain credential-shaped material" }
  ),
  tag: z.enum(governanceTags),
  action: z.enum(["affirm", "add", "remove", "supersede"]),
  rationale: governanceSafeTextSchema,
  supersedesEventRef: governanceEventRefSchema.optional()
}).strict().superRefine((value, context) => {
  if (value.action === "supersede" && value.supersedesEventRef === undefined) {
    context.addIssue({
      code: "custom",
      path: ["supersedesEventRef"],
      message: "supersede requires an earlier governance event reference"
    });
  }
});

export interface EvidenceWorkspaceAdapter {
  loadWorkspace(): Promise<EvidenceWorkspaceDto>;
  prepareAssertionCandidate(
    input: PrepareEvidenceAssertionCandidateInput
  ): Promise<PrepareEvidenceAssertionCandidateResult>;
  appendGovernanceReview(
    input: AppendGovernanceReviewInput
  ): Promise<AppendEvidenceGovernanceReviewResult>;
}

export function evidenceWorkspaceDtoFromJson(value: unknown): EvidenceWorkspaceDto {
  const parsed = evidenceWorkspaceSchema.parse(value);
  const reviews = parsed.governance.reviews.map(governanceReviewDtoFromJson);
  const exportPreview = governanceExportPreviewDtoFromJson(parsed.governance.exportPreview);
  assertGovernanceWorkspaceCoverage(
    parsed.items,
    reviews,
    exportPreview
  );
  return deepFreeze({
    ...parsed,
    governance: {
      schemaVersion: "evidence-governance-workspace.v1",
      reviews,
      exportPreview
    }
  } as EvidenceWorkspaceDto);
}

export function createHttpEvidenceWorkspaceAdapter(
  input: { readonly fetcher?: typeof fetch } = {}
): EvidenceWorkspaceAdapter {
  const fetcher = input.fetcher ?? fetch;
  return Object.freeze({
    async loadWorkspace() {
      const response = await fetcher("/api/evidence/workspace", {
        method: "GET",
        headers: { accept: "application/json" }
      });
      const value: unknown = await response.json();
      try {
        return evidenceWorkspaceDtoFromJson(value);
      } catch {
        throw new Error("Evidence workspace could not be loaded safely.");
      }
    },
    async prepareAssertionCandidate(candidateInput: PrepareEvidenceAssertionCandidateInput) {
      const response = await fetcher("/api/evidence/assertion-candidates", {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify(candidateInput)
      });
      const value: unknown = await response.json();
      if (!response.ok) {
        const failed = actionDiagnosticSchema.safeParse(value);
        throw new Error(failed.success
          ? failed.data.diagnostic.message
          : "Evidence assertion preparation was blocked safely.");
      }
      const parsed = preparationResultSchema.safeParse(value);
      if (!parsed.success) {
        throw new Error("Evidence assertion result could not be loaded safely.");
      }
      return deepFreeze({
        candidate: parsed.data.candidate,
        workspace: evidenceWorkspaceDtoFromJson(parsed.data.workspace)
      } as PrepareEvidenceAssertionCandidateResult);
    },
    async appendGovernanceReview(reviewInput: AppendGovernanceReviewInput) {
      const safeInput = appendGovernanceReviewInputSchema.safeParse(reviewInput);
      if (!safeInput.success) {
        throw new Error("Governance review input could not be prepared safely.");
      }
      const response = await fetcher("/api/evidence/governance-reviews", {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify(safeInput.data)
      });
      const value: unknown = await response.json();
      if (!response.ok) {
        const failed = actionDiagnosticSchema.safeParse(value);
        throw new Error(failed.success
          ? failed.data.diagnostic.message
          : "Governance review was blocked safely.");
      }
      const parsed = governanceReviewResultSchema.safeParse(value);
      if (!parsed.success) {
        throw new Error("Governance review result could not be loaded safely.");
      }
      return deepFreeze({
        workspace: evidenceWorkspaceDtoFromJson(parsed.data.workspace)
      });
    }
  });
}

export const httpEvidenceWorkspaceAdapter = createHttpEvidenceWorkspaceAdapter();

export function createStaticEvidenceWorkspaceAdapter(
  workspace: EvidenceWorkspaceDto
): EvidenceWorkspaceAdapter {
  const snapshot = evidenceWorkspaceDtoFromJson(structuredClone(workspace));
  return Object.freeze({
    async loadWorkspace() {
      return deepFreeze(structuredClone(snapshot));
    },
    async prepareAssertionCandidate() {
      throw new Error("Static evidence workspace does not record assertion candidates.");
    },
    async appendGovernanceReview() {
      throw new Error("Static evidence workspace does not record governance reviews.");
    }
  });
}

function assertGovernanceWorkspaceCoverage(
  items: readonly ParsedEvidenceItemDto[],
  reviews: readonly GovernanceReviewDto[],
  preview: GovernanceExportPreviewDto
): void {
  const expected = items.map((item) => item.evidenceId).sort(compareCodeUnits);
  const reviewRefs = reviews.map((review) => review.evidenceRef).sort(compareCodeUnits);
  const previewRefs = [
    ...preview.includedEvidence.map((item) => item.evidenceRef),
    ...preview.excludedEvidence.map((item) => item.evidenceRef)
  ].sort(compareCodeUnits);
  if (
    new Set(expected).size !== expected.length ||
    new Set(reviewRefs).size !== reviewRefs.length ||
    !sameRefs(expected, reviewRefs) ||
    !sameRefs(expected, previewRefs)
  ) {
    throw new Error("Evidence workspace governance coverage is inconsistent.");
  }

  const itemsByEvidenceRef = new Map(items.map((item) => [item.evidenceId, item]));
  const reviewsByEvidenceRef = new Map(reviews.map((review) => [review.evidenceRef, review]));
  for (const item of items) {
    const review = reviewsByEvidenceRef.get(item.evidenceId);
    if (review === undefined || !itemGovernanceStateMatchesReview(item, review)) {
      throw new Error("Evidence workspace governance eligibility is inconsistent.");
    }
  }
  for (const included of preview.includedEvidence) {
    const item = itemsByEvidenceRef.get(included.evidenceRef);
    const review = reviewsByEvidenceRef.get(included.evidenceRef);
    const activePublicSafeEventRefs = item?.governanceTags
      .filter((tag) => tag.tag === "public_safe" && tag.status === "active")
      .map((tag) => tag.eventId) ?? [];
    if (
      item === undefined ||
      review === undefined ||
      !eligibleForDefaultPreviewInclusion(item, review) ||
      activePublicSafeEventRefs.some((eventRef) => !included.governanceEventRefs.includes(eventRef))
    ) {
      throw new Error("Evidence workspace governance eligibility is inconsistent.");
    }
  }

  for (const excluded of preview.excludedEvidence) {
    const item = itemsByEvidenceRef.get(excluded.evidenceRef);
    const review = reviewsByEvidenceRef.get(excluded.evidenceRef);
    if (item === undefined || review === undefined) {
      throw new Error("Evidence workspace governance eligibility is inconsistent.");
    }
    const previewDiagnostics = preview.diagnostics.filter(
      (diagnostic) => diagnostic.evidenceRef === excluded.evidenceRef
    );
    const expectedApprovals = expectedExcludedApprovalIds(item, review, previewDiagnostics);
    const actualApprovals = excluded.requiredApprovals
      .map((approval) => approval.approvalId)
      .sort(compareCodeUnits);
    if (!sameRefs(expectedApprovals, actualApprovals)) {
      throw new Error("Evidence workspace governance eligibility is inconsistent.");
    }
  }
}

function eligibleForDefaultPreviewInclusion(
  item: ParsedEvidenceItemDto,
  review: GovernanceReviewDto
): boolean {
  const hasActivePublicSafe = item.governanceTags.some(
    (tag) => tag.tag === "public_safe" && tag.status === "active"
  );
  const hasActiveRestrictedTag = item.governanceTags.some(
    (tag) => tag.status === "active" && restrictedExportTags.some((restricted) => restricted === tag.tag)
  );
  return !item.quarantined &&
    item.quarantineLockLevels.length === 0 &&
    !item.tombstoned &&
    hasActivePublicSafe &&
    !hasActiveRestrictedTag &&
    review.classificationStatus === "succeeded" &&
    review.diagnostics.length === 0;
}

function itemGovernanceStateMatchesReview(
  item: ParsedEvidenceItemDto,
  review: GovernanceReviewDto
): boolean {
  type ItemGovernanceTag = ParsedEvidenceItemDto["governanceTags"][number];
  const expected = new Map<GovernanceTag, ItemGovernanceTag>();
  for (const proposal of review.proposedTags) {
    if (proposal.workflowAccess !== "ordinary-internal-only") {
      continue;
    }
    expected.set(proposal.tag, {
      tag: proposal.tag,
      confidence: proposal.confidence,
      rationale: proposal.rationale,
      source: "ai",
      status: "active",
      eventId: proposal.eventRef
    });
  }
  for (const decision of review.humanDecisions) {
    expected.set(decision.tag, {
      tag: decision.tag,
      confidence: 1,
      rationale: decision.rationale,
      source: "human",
      status: decision.action === "remove" ? "removed" : "active",
      eventId: decision.eventRef
    });
  }
  if (expected.size !== item.governanceTags.length) {
    return false;
  }
  const actual = new Map(item.governanceTags.map((tag) => [tag.tag, tag]));
  if (actual.size !== item.governanceTags.length) {
    return false;
  }
  return [...expected.entries()].every(([tag, expectedTag]) => {
    const actualTag = actual.get(tag);
    return actualTag !== undefined &&
      actualTag.confidence === expectedTag.confidence &&
      actualTag.rationale === expectedTag.rationale &&
      actualTag.source === expectedTag.source &&
      actualTag.status === expectedTag.status &&
      actualTag.eventId === expectedTag.eventId;
  });
}

function expectedExcludedApprovalIds(
  item: ParsedEvidenceItemDto,
  review: GovernanceReviewDto,
  previewDiagnostics: GovernanceExportPreviewDto["diagnostics"]
): readonly GovernanceExportApprovalId[] {
  if (review.classificationStatus === "failed" || review.classificationStatus === "unknown-tag") {
    throw new Error("Evidence workspace governance eligibility is inconsistent.");
  }

  if (review.classificationStatus === "missing") {
    if (
      review.proposedTags.length !== 0 ||
      review.humanDecisions.length !== 0 ||
      review.diagnostics.length !== 1 ||
      review.diagnostics[0]?.code !== "classification-missing" ||
      item.governanceTags.length !== 0 ||
      previewDiagnostics.length !== 1
    ) {
      throw new Error("Evidence workspace governance eligibility is inconsistent.");
    }

    if (previewDiagnostics[0]?.code === "evidence-state-missing") {
      if (
        item.source !== undefined ||
        item.provenanceComplete ||
        item.selectableForAssertionCandidate ||
        !item.blockingReasons.includes("Evidence ingestion provenance is missing.") ||
        item.governanceTags.length !== 0 ||
        item.quarantined ||
        item.quarantineLockLevels.length !== 0 ||
        item.tombstoned
      ) {
        throw new Error("Evidence workspace governance eligibility is inconsistent.");
      }
      return Object.freeze(["human-affirm-public-safe-eligibility"]);
    }
    if (previewDiagnostics[0]?.code !== "classification-missing") {
      throw new Error("Evidence workspace governance eligibility is inconsistent.");
    }
    return expectedApprovalIdsForState(item, true);
  }

  if (review.diagnostics.length !== 0 || previewDiagnostics.length !== 0) {
    throw new Error("Evidence workspace governance eligibility is inconsistent.");
  }
  return expectedApprovalIdsForState(item, false);
}

function expectedApprovalIdsForState(
  item: ParsedEvidenceItemDto,
  classificationMissing: boolean
): readonly GovernanceExportApprovalId[] {
  const activeRestrictedTags = item.governanceTags
    .filter((tag) => tag.status === "active")
    .map((tag) => tag.tag)
    .filter(isRestrictedGovernanceTag);
  const approvalIds: GovernanceExportApprovalId[] = classificationMissing
    ? ["governance-classification-required-before-preview"]
    : [];
  approvalIds.push(...activeRestrictedTags.map(restrictedApprovalId));
  if (item.quarantined || item.quarantineLockLevels.length !== 0) {
    approvalIds.push("quarantine-release-unavailable-in-preview");
  }
  if (item.tombstoned) {
    approvalIds.push("tombstone-reversal-unavailable-in-preview");
  }
  const hasActivePublicSafe = item.governanceTags.some(
    (tag) => tag.tag === "public_safe" && tag.status === "active"
  );
  if (activeRestrictedTags.length === 0 && !hasActivePublicSafe) {
    approvalIds.push("human-affirm-public-safe-eligibility");
  }
  return Object.freeze([...new Set(approvalIds)].sort(compareCodeUnits));
}

function restrictedApprovalId(
  tag: (typeof restrictedExportTags)[number]
): GovernanceExportApprovalId {
  switch (tag) {
    case "contains_pii":
    case "private_correspondence":
      return "human-approve-private-evidence-inclusion";
    case "source_identity":
      return "human-approve-source-identity-inclusion";
    case "credential_risk":
      return "human-approve-credential-risk-inclusion";
    case "export_restricted":
      return "human-approve-export-restricted-inclusion";
    case "legal_risk":
    case "law_enforcement_sensitive":
      return "human-approve-other-unsafe-evidence-inclusion";
  }
}

function isRestrictedGovernanceTag(
  tag: GovernanceTag
): tag is (typeof restrictedExportTags)[number] {
  return restrictedExportTags.some((restricted) => restricted === tag);
}

function sameRefs(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

const canonicalCredentialShapedPattern = /api[\s._-]*key|authorization|bearer|token|secret|password|oauth|credential|(?:^|[\s;])(?:(?:(?:x|set)-)?cookie\s*:|session\s*=\s*\S+)/i;
const commonSecretValuePattern = /(?:^|[^a-z0-9])(?:sk[_-](?:live|test|proj)[_-]?|gh[pousr]_|github[_-]?pat[_-]|glpat[_-]|xox[baprs]?[_-]|AKIA|ASIA|AIza|ya29|eyJ|hf[_-]|rk[_-]live|pk[_-]live|sg[._-])[a-z0-9._-]{3,}/i;

function containsCredentialShapedText(value: string): boolean {
  return canonicalCredentialShapedPattern.test(value) || commonSecretValuePattern.test(value);
}

function isSecretSafeGovernanceText(value: string): boolean {
  try {
    assertSecretSafeText(value);
  } catch {
    return false;
  }
  return !commonSecretValuePattern.test(value);
}
