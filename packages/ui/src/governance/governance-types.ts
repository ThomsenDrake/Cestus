import type { GovernanceExportPreviewDto as OntologyGovernanceExportPreviewDto } from "../../../ontology/src/governance-export-preview.js";
import type { GovernanceTag } from "../../../ontology/src/governance-policy.js";

export type GovernanceExportPreviewDto = OntologyGovernanceExportPreviewDto;

export interface GovernanceReviewProposedTagDto {
  readonly tag: GovernanceTag;
  readonly confidence: number;
  readonly rationale: string;
  readonly eventRef: string;
  readonly workflowAccess: "ordinary-internal-only" | "locked";
  readonly repairHint?:
    | "request-human-governance-review"
    | "record-governance-classification"
    | "retry-or-review-classification"
    | "replace-unknown-governance-tag";
}

export interface GovernanceReviewDecisionDto {
  readonly tag: GovernanceTag;
  readonly action: "affirm" | "add" | "remove" | "supersede";
  readonly rationale: string;
  readonly eventRef: string;
  readonly supersedesEventRef?: string;
}

export interface GovernanceReviewDiagnosticDto {
  readonly code: "classification-missing" | "classification-failed" | "unknown-tag" | "projection-failed";
  readonly evidenceRef: string;
  readonly repairHint:
    | "record-governance-classification"
    | "retry-or-review-classification"
    | "replace-unknown-governance-tag"
    | "rebuild-governance-projection";
}

export interface GovernanceReviewDto {
  readonly schemaVersion: "governance-review.v1";
  readonly evidenceRef: string;
  readonly classificationStatus: "succeeded" | "missing" | "failed" | "unknown-tag";
  readonly confidenceThreshold: number;
  readonly proposedTags: readonly GovernanceReviewProposedTagDto[];
  readonly humanDecisions: readonly GovernanceReviewDecisionDto[];
  readonly diagnostics: readonly GovernanceReviewDiagnosticDto[];
}

export interface AppendGovernanceReviewInput {
  readonly evidenceRef: string;
  readonly tag: GovernanceTag;
  readonly action: "affirm" | "add" | "remove" | "supersede";
  readonly rationale: string;
  readonly supersedesEventRef?: string;
}
