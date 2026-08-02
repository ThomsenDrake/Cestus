import type { KnowledgeEvent } from "./contracts.js";
import type { EvidenceGovernanceState } from "./governance-projection.js";
import { buildGovernanceProjection } from "./governance-projection.js";
import { restrictedExportTags, type GovernanceTag } from "./governance-policy.js";

export const governanceExportApprovalIds = [
  "human-approve-private-evidence-inclusion",
  "human-approve-source-identity-inclusion",
  "human-approve-credential-risk-inclusion",
  "human-approve-export-restricted-inclusion",
  "human-approve-other-unsafe-evidence-inclusion",
  "human-affirm-public-safe-eligibility",
  "governance-classification-required-before-preview",
  "quarantine-release-unavailable-in-preview",
  "tombstone-reversal-unavailable-in-preview"
] as const;

export type GovernanceExportApprovalId = (typeof governanceExportApprovalIds)[number];
export type GovernanceExportExclusionCategory =
  | "private"
  | "source-identity"
  | "credential-risk"
  | "export-restricted"
  | "other-unsafe"
  | "quarantine"
  | "tombstoned";

export interface GovernanceExportPreviewApproval {
  readonly category: GovernanceExportExclusionCategory;
  readonly approvalId: GovernanceExportApprovalId;
  readonly optInAvailableInPreview: boolean;
}

export interface GovernanceExportPreviewEvidenceRef {
  readonly evidenceRef: string;
  readonly governanceEventRefs: readonly string[];
}

export interface GovernanceExportPreviewExcludedEvidence extends GovernanceExportPreviewEvidenceRef {
  readonly requiredApprovals: readonly GovernanceExportPreviewApproval[];
}

export interface GovernanceExportPreviewDiagnostic {
  readonly code: "classification-missing" | "evidence-state-missing";
  readonly evidenceRef: string;
  readonly repairHint: "record-governance-classification" | "verify-evidence-reference";
}

export interface GovernanceExportPreviewDto {
  readonly schemaVersion: "governance-export-preview.v1";
  readonly mode: "preview-only";
  readonly includedEvidence: readonly GovernanceExportPreviewEvidenceRef[];
  readonly excludedEvidence: readonly GovernanceExportPreviewExcludedEvidence[];
  readonly diagnostics: readonly GovernanceExportPreviewDiagnostic[];
}

export function buildGovernanceExportPreview(
  events: readonly KnowledgeEvent[],
  requestedEvidenceIds?: readonly string[]
): GovernanceExportPreviewDto {
  const projection = buildGovernanceProjection(events);
  const governanceEventRefs = governanceEventRefsByEvidence(events);
  const evidenceRefs = [...new Set(requestedEvidenceIds ?? projection.evidenceGovernance.keys())]
    .map((evidenceRef) => assertSafeGovernanceRef(evidenceRef, /^ev_[a-zA-Z0-9_-]+$/))
    .sort();
  const includedEvidence: GovernanceExportPreviewEvidenceRef[] = [];
  const excludedEvidence: GovernanceExportPreviewExcludedEvidence[] = [];
  const diagnostics: GovernanceExportPreviewDiagnostic[] = [];

  for (const evidenceRef of evidenceRefs) {
    const state = projection.evidenceGovernance.get(evidenceRef);
    const eventRefs = Object.freeze([...(governanceEventRefs.get(evidenceRef) ?? [])]);
    if (state === undefined) {
      excludedEvidence.push({
        evidenceRef,
        governanceEventRefs: eventRefs,
        requiredApprovals: Object.freeze([approval(
          "other-unsafe",
          "human-affirm-public-safe-eligibility",
          false
        )])
      });
      diagnostics.push({
        code: "evidence-state-missing",
        evidenceRef,
        repairHint: "verify-evidence-reference"
      });
      continue;
    }

    if (state.classifiedEventIds.length === 0) {
      diagnostics.push({
        code: "classification-missing",
        evidenceRef,
        repairHint: "record-governance-classification"
      });
    }

    const requiredApprovals = exportApprovalsForState(state);
    if (requiredApprovals.length > 0) {
      excludedEvidence.push({
        evidenceRef,
        governanceEventRefs: eventRefs,
        requiredApprovals: Object.freeze(requiredApprovals)
      });
      continue;
    }

    includedEvidence.push({ evidenceRef, governanceEventRefs: eventRefs });
  }

  return Object.freeze({
    schemaVersion: "governance-export-preview.v1",
    mode: "preview-only",
    includedEvidence: Object.freeze(includedEvidence.map((item) => Object.freeze(item))),
    excludedEvidence: Object.freeze(excludedEvidence.map((item) => Object.freeze(item))),
    diagnostics: Object.freeze(diagnostics.map((item) => Object.freeze(item)))
  });
}

function exportApprovalsForState(state: EvidenceGovernanceState): GovernanceExportPreviewApproval[] {
  const approvals: GovernanceExportPreviewApproval[] = [];
  if (state.classifiedEventIds.length === 0) {
    approvals.push(approval(
      "other-unsafe",
      "governance-classification-required-before-preview",
      false
    ));
  }
  const activeRestrictedTags = restrictedExportTags.filter(
    (tag) => state.currentTags.get(tag)?.status === "active"
  );
  approvals.push(...activeRestrictedTags.map(approvalForRestrictedTag));

  if (state.quarantined) {
    approvals.push(approval("quarantine", "quarantine-release-unavailable-in-preview", false));
  }

  if (state.tombstoned) {
    approvals.push(approval("tombstoned", "tombstone-reversal-unavailable-in-preview", false));
  }

  if (activeRestrictedTags.length === 0 && state.currentTags.get("public_safe")?.status !== "active") {
    approvals.push(approval("other-unsafe", "human-affirm-public-safe-eligibility", false));
  }

  return deduplicateApprovals(approvals);
}

function approvalForRestrictedTag(tag: GovernanceTag): GovernanceExportPreviewApproval {
  switch (tag) {
    case "contains_pii":
    case "private_correspondence":
      return approval("private", "human-approve-private-evidence-inclusion", true);
    case "source_identity":
      return approval("source-identity", "human-approve-source-identity-inclusion", true);
    case "credential_risk":
      return approval("credential-risk", "human-approve-credential-risk-inclusion", true);
    case "export_restricted":
      return approval("export-restricted", "human-approve-export-restricted-inclusion", true);
    case "legal_risk":
    case "law_enforcement_sensitive":
      return approval("other-unsafe", "human-approve-other-unsafe-evidence-inclusion", true);
    case "public_record":
    case "public_safe":
      return approval("other-unsafe", "human-affirm-public-safe-eligibility", false);
  }
}

function approval(
  category: GovernanceExportExclusionCategory,
  approvalId: GovernanceExportApprovalId,
  optInAvailableInPreview: boolean
): GovernanceExportPreviewApproval {
  return Object.freeze({ category, approvalId, optInAvailableInPreview });
}

function deduplicateApprovals(
  approvals: readonly GovernanceExportPreviewApproval[]
): GovernanceExportPreviewApproval[] {
  return [...new Map(approvals.map((item) => [item.approvalId, item])).values()]
    .sort((left, right) => left.category.localeCompare(right.category));
}

function governanceEventRefsByEvidence(events: readonly KnowledgeEvent[]): ReadonlyMap<string, readonly string[]> {
  const refs = new Map<string, string[]>();
  for (const event of events) {
    if (
      event.type !== "evidence.governance.classified" &&
      event.type !== "evidence.governance.reviewed" &&
      event.type !== "evidence.quarantined" &&
      event.type !== "evidence.tombstoned"
    ) {
      continue;
    }

    const evidenceRef = assertSafeGovernanceRef(event.payload.evidenceId, /^ev_[a-zA-Z0-9_-]+$/);
    const eventRef = assertSafeGovernanceRef(event.id, /^evt_[a-zA-Z0-9_-]+$/);
    const evidenceRefs = refs.get(evidenceRef) ?? [];
    evidenceRefs.push(eventRef);
    refs.set(evidenceRef, evidenceRefs);
  }
  return refs;
}

const unsafeGovernanceRefPattern = /(?:^|[_-])(?:sk[_-](?:live|test|proj)|gh[pousr]|github[_-]?pat|glpat|xox[baprs]?|AKIA|ASIA|AIza|ya29|eyJ|hf|rk[_-]live|pk[_-]live|sg)(?:[_-]|$)/i;
const awsAccessKeyRefPattern = /(?:^|[_-])(?:AKIA|ASIA)[a-z0-9]{16}/i;

function assertSafeGovernanceRef(value: string, pattern: RegExp): string {
  if (!pattern.test(value) || unsafeGovernanceRefPattern.test(value) || awsAccessKeyRefPattern.test(value)) {
    throw new Error("Governance export preview requires safe evidence and event references");
  }
  return value;
}
