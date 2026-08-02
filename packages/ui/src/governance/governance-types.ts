import type { GovernanceTag } from "../../../ontology/src/governance-policy.js";

export type { GovernanceExportPreviewDto } from "../../../ontology/src/governance-export-preview.js";
export type {
  EvidenceGovernanceWorkspaceDto,
  GovernanceReviewDecisionDto,
  GovernanceReviewDiagnosticDto,
  GovernanceReviewDto,
  GovernanceReviewProposedTagDto
} from "../../../ontology/src/governance-read-model.js";

export interface AppendGovernanceReviewInput {
  readonly evidenceRef: string;
  readonly tag: GovernanceTag;
  readonly action: "affirm" | "add" | "remove" | "supersede";
  readonly rationale: string;
  readonly supersedesEventRef?: string;
}
