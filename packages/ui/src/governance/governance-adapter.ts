import { z } from "zod";
import {
  governanceExportApprovalIds,
  type GovernanceExportPreviewDto
} from "../../../ontology/src/governance-export-preview.js";
import {
  assertSecretSafeText,
  governanceTags,
  type GovernanceTag
} from "../../../ontology/src/governance-policy.js";
import type { GovernanceReviewDto } from "./governance-types.js";

const safeRefSchema = (prefix: "ev" | "evt") => z.string()
  .regex(new RegExp(`^${prefix}_[a-zA-Z0-9_-]+$`))
  .refine((value) => !containsCredentialShapedText(value), {
    message: "reference must not contain credential-shaped material"
  });
const evidenceRefSchema = safeRefSchema("ev");
const eventRefSchema = safeRefSchema("evt");
const safeRationaleSchema = z.string().min(1).refine(
  (value) => !containsCredentialShapedText(value),
  { message: "rationale must not contain credential-shaped material" }
);
const governanceTagSchema = z.enum(governanceTags);
const workflowRepairHintSchema = z.enum([
  "request-human-governance-review",
  "record-governance-classification",
  "retry-or-review-classification",
  "replace-unknown-governance-tag"
]);
const proposedTagSchema = z.object({
  tag: governanceTagSchema,
  confidence: z.number().min(0).max(1),
  rationale: safeRationaleSchema,
  eventRef: eventRefSchema,
  workflowAccess: z.enum(["ordinary-internal-only", "locked"]),
  repairHint: workflowRepairHintSchema.optional()
}).strict().superRefine((value, context) => {
  if (value.workflowAccess === "locked" && value.repairHint === undefined) {
    context.addIssue({ code: "custom", message: "locked proposals require a repair hint" });
  }
  if (value.workflowAccess === "ordinary-internal-only" && value.repairHint !== undefined) {
    context.addIssue({ code: "custom", message: "unlocked ordinary proposals must not carry a repair hint" });
  }
});
const humanDecisionSchema = z.object({
  tag: governanceTagSchema,
  action: z.enum(["affirm", "add", "remove", "supersede"]),
  rationale: safeRationaleSchema,
  eventRef: eventRefSchema,
  supersedesEventRef: eventRefSchema.optional()
}).strict().superRefine((value, context) => {
  if (value.action === "supersede" && value.supersedesEventRef === undefined) {
    context.addIssue({ code: "custom", message: "supersede requires a valid earlier governance event reference" });
  }
  if (value.supersedesEventRef === value.eventRef) {
    context.addIssue({ code: "custom", message: "governance decisions cannot supersede themselves" });
  }
});
const governanceReviewDiagnosticSchema = z.object({
  code: z.enum(["classification-missing", "classification-failed", "unknown-tag", "projection-failed"]),
  evidenceRef: evidenceRefSchema,
  repairHint: z.enum([
    "record-governance-classification",
    "retry-or-review-classification",
    "replace-unknown-governance-tag",
    "rebuild-governance-projection"
  ])
}).strict().superRefine((value, context) => {
  const expectedRepairHint = {
    "classification-missing": "record-governance-classification",
    "classification-failed": "retry-or-review-classification",
    "unknown-tag": "replace-unknown-governance-tag",
    "projection-failed": "rebuild-governance-projection"
  } as const;
  if (value.repairHint !== expectedRepairHint[value.code]) {
    context.addIssue({ code: "custom", path: ["repairHint"], message: "diagnostic repair hint must match its code" });
  }
});
const governanceReviewSchema = z.object({
  schemaVersion: z.literal("governance-review.v1"),
  evidenceRef: evidenceRefSchema,
  classificationStatus: z.enum(["succeeded", "missing", "failed", "unknown-tag"]),
  confidenceThreshold: z.number().min(0.8).max(1),
  proposedTags: z.array(proposedTagSchema),
  humanDecisions: z.array(humanDecisionSchema),
  diagnostics: z.array(governanceReviewDiagnosticSchema)
}).strict().superRefine((value, context) => {
  for (const [index, proposal] of value.proposedTags.entries()) {
    if (proposal.workflowAccess === "ordinary-internal-only" && proposal.confidence < value.confidenceThreshold) {
      context.addIssue({
        code: "custom",
        path: ["proposedTags", index, "workflowAccess"],
        message: "ordinary workflow access requires active-policy confidence"
      });
    }
  }

  const proposalTagsByEventRef = new Map<string, Set<GovernanceTag>>();
  for (const proposal of value.proposedTags) {
    const tags = proposalTagsByEventRef.get(proposal.eventRef) ?? new Set<GovernanceTag>();
    tags.add(proposal.tag);
    proposalTagsByEventRef.set(proposal.eventRef, tags);
  }
  const reviewEvents = new Map<string, {
    firstIndex: number;
    lastIndex: number;
    tags: Set<GovernanceTag>;
  }>();
  for (const [index, decision] of value.humanDecisions.entries()) {
    const reviewEvent = reviewEvents.get(decision.eventRef);
    if (reviewEvent === undefined) {
      reviewEvents.set(decision.eventRef, {
        firstIndex: index,
        lastIndex: index,
        tags: new Set([decision.tag])
      });
    } else {
      reviewEvent.lastIndex = index;
      reviewEvent.tags.add(decision.tag);
    }

    if (proposalTagsByEventRef.has(decision.eventRef)) {
      context.addIssue({
        code: "custom",
        path: ["humanDecisions", index, "eventRef"],
        message: "classifier and review events require distinct references"
      });
    }
  }
  for (const [index, decision] of value.humanDecisions.entries()) {
    if (decision.supersedesEventRef === undefined) {
      continue;
    }

    const currentReviewEvent = reviewEvents.get(decision.eventRef)!;
    const proposedTargetTags = proposalTagsByEventRef.get(decision.supersedesEventRef);
    const reviewTarget = reviewEvents.get(decision.supersedesEventRef);
    const priorReviewTargetTags = reviewTarget !== undefined &&
      reviewTarget.lastIndex < currentReviewEvent.firstIndex
      ? reviewTarget.tags
      : undefined;
    const targetTags = proposedTargetTags ?? priorReviewTargetTags;
    if (targetTags === undefined) {
      context.addIssue({
        code: "custom",
        path: ["humanDecisions", index, "supersedesEventRef"],
        message: "governance provenance must resolve to a visible earlier event"
      });
      continue;
    }

    if (decision.action === "supersede" && !targetTags.has(decision.tag)) {
      context.addIssue({
        code: "custom",
        path: ["humanDecisions", index, "supersedesEventRef"],
        message: "supersede provenance must contain the same governance tag"
      });
    }
  }

  if (
    value.diagnostics.some((diagnostic) => diagnostic.code === "projection-failed") &&
    value.proposedTags.some((proposal) => proposal.workflowAccess !== "locked")
  ) {
    context.addIssue({
      code: "custom",
      path: ["proposedTags"],
      message: "projection failure requires every proposal to remain locked"
    });
  }

  const statusDiagnostic = {
    missing: "classification-missing",
    failed: "classification-failed",
    "unknown-tag": "unknown-tag"
  } as const;
  if (value.classificationStatus === "succeeded") {
    if (value.proposedTags.length === 0) {
      context.addIssue({ code: "custom", path: ["proposedTags"], message: "succeeded classification requires proposals" });
    }
    if (value.diagnostics.some((diagnostic) => diagnostic.code !== "projection-failed")) {
      context.addIssue({ code: "custom", path: ["diagnostics"], message: "succeeded classification has contradictory diagnostics" });
    }
  } else {
    if (value.proposedTags.length > 0) {
      context.addIssue({ code: "custom", path: ["proposedTags"], message: "non-succeeded classification cannot expose proposals" });
    }
    const expectedCode = statusDiagnostic[value.classificationStatus];
    if (!value.diagnostics.some(
      (diagnostic) => diagnostic.code === expectedCode && diagnostic.evidenceRef === value.evidenceRef
    )) {
      context.addIssue({ code: "custom", path: ["diagnostics"], message: "classification status requires its safe repair diagnostic" });
    }
  }

  if (value.diagnostics.some((diagnostic) => diagnostic.evidenceRef !== value.evidenceRef)) {
    context.addIssue({ code: "custom", path: ["diagnostics"], message: "diagnostics must reference the reviewed evidence" });
  }
});

const allowedPreviewApprovals = {
  private: [["human-approve-private-evidence-inclusion", true]],
  "source-identity": [["human-approve-source-identity-inclusion", true]],
  "credential-risk": [["human-approve-credential-risk-inclusion", true]],
  "export-restricted": [["human-approve-export-restricted-inclusion", true]],
  "other-unsafe": [
    ["human-approve-other-unsafe-evidence-inclusion", true],
    ["human-affirm-public-safe-eligibility", false],
    ["governance-classification-required-before-preview", false]
  ],
  quarantine: [["quarantine-release-unavailable-in-preview", false]],
  tombstoned: [["tombstone-reversal-unavailable-in-preview", false]]
} as const;
const governanceExportApprovalSchema = z.object({
  category: z.enum([
    "private",
    "source-identity",
    "credential-risk",
    "export-restricted",
    "other-unsafe",
    "quarantine",
    "tombstoned"
  ]),
  approvalId: z.enum(governanceExportApprovalIds),
  optInAvailableInPreview: z.boolean()
}).strict().superRefine((value, context) => {
  const matchesCategory = allowedPreviewApprovals[value.category].some(
    ([approvalId, optInAvailable]) =>
      value.approvalId === approvalId && value.optInAvailableInPreview === optInAvailable
  );
  if (!matchesCategory) {
    context.addIssue({ code: "custom", message: "approval category, identifier, and availability must match" });
  }
});
const uniqueGovernanceEventRefsSchema = z.array(eventRefSchema).superRefine((refs, context) => {
  if (new Set(refs).size !== refs.length) {
    context.addIssue({ code: "custom", message: "governance event references must be unique" });
  }
});
const governanceEvidenceRefSchema = z.object({
  evidenceRef: evidenceRefSchema,
  governanceEventRefs: uniqueGovernanceEventRefsSchema
}).strict();
const governanceIncludedEvidenceSchema = z.object({
  evidenceRef: evidenceRefSchema,
  governanceEventRefs: z.array(eventRefSchema).min(1).superRefine((refs, context) => {
    if (new Set(refs).size !== refs.length) {
      context.addIssue({ code: "custom", message: "governance event references must be unique" });
    }
  })
}).strict();
const governanceExcludedEvidenceSchema = governanceEvidenceRefSchema.extend({
  requiredApprovals: z.array(governanceExportApprovalSchema).min(1)
}).strict();
const governanceExportDiagnosticSchema = z.object({
  code: z.enum(["classification-missing", "evidence-state-missing"]),
  evidenceRef: evidenceRefSchema,
  repairHint: z.enum(["record-governance-classification", "verify-evidence-reference"])
}).strict().superRefine((value, context) => {
  const expectedRepairHint = value.code === "classification-missing"
    ? "record-governance-classification"
    : "verify-evidence-reference";
  if (value.repairHint !== expectedRepairHint) {
    context.addIssue({ code: "custom", message: "export diagnostic repair hint must match its code" });
  }
});
const governanceExportPreviewSchema = z.object({
  schemaVersion: z.literal("governance-export-preview.v1"),
  mode: z.literal("preview-only"),
  includedEvidence: z.array(governanceIncludedEvidenceSchema),
  excludedEvidence: z.array(governanceExcludedEvidenceSchema),
  diagnostics: z.array(governanceExportDiagnosticSchema)
}).strict().superRefine((value, context) => {
  const includedRefs = value.includedEvidence.map((item) => item.evidenceRef);
  const excludedRefs = value.excludedEvidence.map((item) => item.evidenceRef);
  const includedRefSet = new Set(includedRefs);
  const excludedRefSet = new Set(excludedRefs);

  if (includedRefSet.size !== includedRefs.length) {
    context.addIssue({ code: "custom", path: ["includedEvidence"], message: "included evidence must be unique" });
  }
  if (excludedRefSet.size !== excludedRefs.length) {
    context.addIssue({ code: "custom", path: ["excludedEvidence"], message: "excluded evidence must be unique" });
  }
  if (includedRefs.some((evidenceRef) => excludedRefSet.has(evidenceRef))) {
    context.addIssue({ code: "custom", message: "included and excluded evidence must be disjoint" });
  }

  for (const [index, excluded] of value.excludedEvidence.entries()) {
    const approvalIds = excluded.requiredApprovals.map((approval) => approval.approvalId);
    if (new Set(approvalIds).size !== approvalIds.length) {
      context.addIssue({
        code: "custom",
        path: ["excludedEvidence", index, "requiredApprovals"],
        message: "required approvals must be unique"
      });
    }
  }

  if (value.diagnostics.some((diagnostic) => !excludedRefSet.has(diagnostic.evidenceRef))) {
    context.addIssue({
      code: "custom",
      path: ["diagnostics"],
      message: "diagnostics must reference excluded evidence"
    });
  }
});

export function governanceReviewDtoFromJson(value: unknown): GovernanceReviewDto {
  const parsed = governanceReviewSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("Governance review DTO could not be parsed safely.");
  }
  return deepFreeze(parsed.data as GovernanceReviewDto);
}

export function governanceExportPreviewDtoFromJson(value: unknown): GovernanceExportPreviewDto {
  const parsed = governanceExportPreviewSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("Governance export preview DTO could not be parsed safely.");
  }
  return deepFreeze(parsed.data as GovernanceExportPreviewDto);
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

const commonSecretValuePattern = /(?:^|[^a-z0-9])(?:sk[_-](?:live|test|proj)[_-]?|gh[pousr]_|github[_-]?pat[_-]|glpat[_-]|xox[baprs]?[_-]|AKIA|ASIA|AIza|ya29|eyJ|hf[_-]|rk[_-]live|pk[_-]live|sg[._-])[a-z0-9._-]{3,}/i;

function containsCredentialShapedText(value: string): boolean {
  try {
    assertSecretSafeText(value);
  } catch {
    return true;
  }
  return commonSecretValuePattern.test(value);
}
