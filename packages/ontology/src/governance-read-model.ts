import type { KnowledgeEvent, KnowledgeEventOf } from "./contracts.js";
import { containsCredentialShapedEvidenceText } from "./evidence-service.js";
import {
  buildGovernanceExportPreview,
  type GovernanceExportPreviewDto
} from "./governance-export-preview.js";
import { buildGovernanceProjection } from "./governance-projection.js";
import {
  assertSecretSafeText,
  defaultGovernancePolicy,
  evaluateGovernanceWorkflowAccess,
  validateGovernancePolicy,
  type GovernancePolicy,
  type GovernanceTag
} from "./governance-policy.js";

export interface GovernanceReviewProposedTagDto {
  readonly tag: GovernanceTag;
  readonly confidence: number;
  readonly confidenceThreshold: number;
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

export interface EvidenceGovernanceWorkspaceDto {
  readonly schemaVersion: "evidence-governance-workspace.v1";
  readonly reviews: readonly GovernanceReviewDto[];
  readonly exportPreview: GovernanceExportPreviewDto;
}

export interface ActiveGovernancePolicyRef {
  readonly policyId: string;
  readonly version: string;
}

export function governanceRationaleForDisplay(rationale: string): string {
  return containsCredentialShapedEvidenceText(rationale)
    ? "Rationale withheld by the metadata safety check."
    : rationale;
}

export function buildEvidenceGovernanceWorkspaceDto(
  events: readonly KnowledgeEvent[],
  requestedEvidenceIds: readonly string[]
): EvidenceGovernanceWorkspaceDto {
  const evidenceRefs = [...new Set(requestedEvidenceIds.map(assertSafeEvidenceRef))].sort(compareCodeUnits);
  const projection = buildGovernanceProjection(events);
  const validClassificationEventIds = new Set(
    [...projection.evidenceGovernance.values()].flatMap((state) => state.classifiedEventIds)
  );
  const validReviewEventIds = new Set(
    [...projection.evidenceGovernance.values()].flatMap((state) => state.reviewedEventIds)
  );
  const policyHistory = resolveGovernancePolicyHistory(events, validClassificationEventIds);
  const classificationsByEvidence = new Map<string, KnowledgeEventOf<"evidence.governance.classified">[]>();
  const reviewsByEvidence = new Map<string, KnowledgeEventOf<"evidence.governance.reviewed">[]>();

  for (const event of events) {
    if (event.type === "evidence.governance.classified" && validClassificationEventIds.has(event.id)) {
      appendEvent(classificationsByEvidence, event.payload.evidenceId, event);
    }
    if (event.type === "evidence.governance.reviewed" && validReviewEventIds.has(event.id)) {
      appendEvent(reviewsByEvidence, event.payload.evidenceId, event);
    }
  }

  const reviews = evidenceRefs.map((evidenceRef) => buildGovernanceReviewDto(
    evidenceRef,
    classificationsByEvidence.get(evidenceRef) ?? [],
    reviewsByEvidence.get(evidenceRef) ?? [],
    policyHistory.activePolicy,
    policyHistory.classificationPolicies
  ));

  return Object.freeze({
    schemaVersion: "evidence-governance-workspace.v1",
    reviews: Object.freeze(reviews),
    exportPreview: buildGovernanceExportPreview(events, evidenceRefs)
  });
}

export function activeGovernancePolicyRef(events: readonly KnowledgeEvent[]): ActiveGovernancePolicyRef {
  const policy = resolveGovernancePolicyHistory(events, new Set()).activePolicy;
  return Object.freeze({ policyId: policy.policyId, version: policy.version });
}

function buildGovernanceReviewDto(
  evidenceRef: string,
  classifications: readonly KnowledgeEventOf<"evidence.governance.classified">[],
  reviews: readonly KnowledgeEventOf<"evidence.governance.reviewed">[],
  activePolicy: GovernancePolicy,
  classificationPolicies: ReadonlyMap<string, GovernancePolicy>
): GovernanceReviewDto {
  const safeEvidenceRef = assertSafeEvidenceRef(evidenceRef);
  if (classifications.length === 0) {
    return Object.freeze({
      schemaVersion: "governance-review.v1",
      evidenceRef: safeEvidenceRef,
      classificationStatus: "missing",
      confidenceThreshold: activePolicy.confidenceThreshold,
      proposedTags: Object.freeze([]),
      humanDecisions: Object.freeze([]),
      diagnostics: Object.freeze([Object.freeze({
        code: "classification-missing",
        evidenceRef: safeEvidenceRef,
        repairHint: "record-governance-classification"
      })])
    });
  }

  const proposedTags = classifications.flatMap((event) => event.payload.tags.map((proposal) => {
    const eventPolicy = classificationPolicies.get(event.id) ?? defaultGovernancePolicy;
    const workflowDecision = evaluateGovernanceWorkflowAccess({
      capability: "ordinary_internal_workflow",
      classification: {
        status: "succeeded",
        proposedTag: proposal.tag,
        confidence: proposal.confidence
      },
      policy: eventPolicy
    });
    const eventRef = assertSafeEventRef(event.id);
    const rationale = governanceRationaleForDisplay(assertSafeGovernanceText(proposal.rationale));
    if (workflowDecision.allowed) {
      return Object.freeze({
        tag: proposal.tag,
        confidence: proposal.confidence,
        confidenceThreshold: eventPolicy.confidenceThreshold,
        rationale,
        eventRef,
        workflowAccess: "ordinary-internal-only" as const
      });
    }

    return Object.freeze({
      tag: proposal.tag,
      confidence: proposal.confidence,
      confidenceThreshold: eventPolicy.confidenceThreshold,
      rationale,
      eventRef,
      workflowAccess: "locked" as const,
      repairHint: workflowRepairHint(workflowDecision.repairHint?.action)
    });
  }));
  const humanDecisions = reviews.flatMap((event) => event.payload.decisions.map((decision) => Object.freeze({
    tag: decision.tag,
    action: decision.action,
    rationale: governanceRationaleForDisplay(assertSafeGovernanceText(decision.rationale)),
    eventRef: assertSafeEventRef(event.id),
    ...(decision.supersedesEventId === undefined
      ? {}
      : { supersedesEventRef: assertSafeEventRef(decision.supersedesEventId) })
  })));

  return Object.freeze({
    schemaVersion: "governance-review.v1",
    evidenceRef: safeEvidenceRef,
    classificationStatus: "succeeded",
    confidenceThreshold: activePolicy.confidenceThreshold,
    proposedTags: Object.freeze(proposedTags),
    humanDecisions: Object.freeze(humanDecisions),
    diagnostics: Object.freeze([])
  });
}

function resolveGovernancePolicyHistory(
  events: readonly KnowledgeEvent[],
  validClassificationEventIds: ReadonlySet<string>
): {
  readonly activePolicy: GovernancePolicy;
  readonly classificationPolicies: ReadonlyMap<string, GovernancePolicy>;
} {
  let activePolicy = defaultGovernancePolicy;
  const classificationPolicies = new Map<string, GovernancePolicy>();
  for (const event of events) {
    if (event.type === "evidence.governance.classified") {
      if (validClassificationEventIds.has(event.id)) {
        classificationPolicies.set(event.id, activePolicy);
      }
      continue;
    }
    if (event.type === "governance.policy.installed") {
      try {
        const { installedBy: _installedBy, ...policy } = event.payload;
        activePolicy = validateGovernancePolicy(policy);
      } catch {
        activePolicy = defaultGovernancePolicy;
      }
    }
  }
  return Object.freeze({ activePolicy, classificationPolicies });
}

function appendEvent<Event>(events: Map<string, Event[]>, evidenceRef: string, event: Event): void {
  const prior = events.get(evidenceRef) ?? [];
  prior.push(event);
  events.set(evidenceRef, prior);
}

function workflowRepairHint(
  action: "use-protected-human-workflow" | "request-human-governance-review" | "record-governance-classification" | "retry-or-review-classification" | "replace-unknown-governance-tag" | undefined
): NonNullable<GovernanceReviewProposedTagDto["repairHint"]> {
  switch (action) {
    case "request-human-governance-review":
    case "record-governance-classification":
    case "retry-or-review-classification":
    case "replace-unknown-governance-tag":
      return action;
    case "use-protected-human-workflow":
    case undefined:
      return "request-human-governance-review";
  }
}

const unsafeGovernanceRefPattern = /(?:^|[_-])(?:sk[_-](?:live|test|proj)|gh[pousr]|github[_-]?pat|glpat|xox[baprs]?|AKIA|ASIA|AIza|ya29|eyJ|hf|rk[_-]live|pk[_-]live|sg)(?:[_-]|$)/i;
const awsAccessKeyRefPattern = /(?:^|[_-])(?:AKIA|ASIA)[a-z0-9]{16}/i;
const commonSecretValuePattern = /(?:^|[^a-z0-9])(?:sk[_-](?:live|test|proj)[_-]?|gh[pousr]_|github[_-]?pat[_-]|glpat[_-]|xox[baprs]?[_-]|AKIA|ASIA|AIza|ya29|eyJ|hf[_-]|rk[_-]live|pk[_-]live|sg[._-])[a-z0-9._-]{3,}/i;

function assertSafeEvidenceRef(value: string): string {
  return assertSafeGovernanceRef(value, /^ev_[a-zA-Z0-9_-]+$/);
}

function assertSafeEventRef(value: string): string {
  return assertSafeGovernanceRef(value, /^evt_[a-zA-Z0-9_-]+$/);
}

function assertSafeGovernanceRef(value: string, pattern: RegExp): string {
  if (
    !pattern.test(value) ||
    unsafeGovernanceRefPattern.test(value) ||
    awsAccessKeyRefPattern.test(value)
  ) {
    throw new Error("Governance review requires safe evidence and event references");
  }
  return assertSafeGovernanceText(value);
}

function assertSafeGovernanceText(value: string): string {
  const safe = assertSecretSafeText(value);
  if (commonSecretValuePattern.test(safe)) {
    throw new Error("Governance review text must not contain secrets");
  }
  return safe;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
