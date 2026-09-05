/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildEvidenceWorkspaceDto } from "../../ingestion/src/read-api.js";
import type { AppendableKnowledgeEvent } from "../../ontology/src/contracts.js";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { buildEvidenceGovernanceWorkspaceDto } from "../../ontology/src/governance-read-model.js";
import { defaultGovernancePolicy } from "../../ontology/src/governance-policy.js";
import type { GovernanceTag } from "../../ontology/src/governance-policy.js";
import { GovernanceService } from "../../ontology/src/governance-service.js";
import { EvidenceWorkspace } from "../src/evidence/EvidenceWorkspace.js";
import { evidenceWorkspaceDtoFromJson } from "../src/evidence/evidence-adapter.js";
import type {
  EvidenceAssertionCandidateDto
} from "../src/evidence/evidence-types.js";
import { workspaceDto } from "./fixtures/evidence.js";

describe("EvidenceWorkspace", () => {
  it("preserves partial coverage through the adapter and distinguishes it in job labels and filters", () => {
    const fixture = workspaceDto();
    const workspace = evidenceWorkspaceDtoFromJson({ ...fixture, items: fixture.items.map((item, index) => index === 0 ? { ...item, parseJobs: item.parseJobs.map(job => ({ ...job, coverageStatus: "partial" })) } : item) });
    render(<EvidenceWorkspace workspace={workspace} loadState="loaded" loadError={undefined} onRetry={vi.fn()} onPrepareAssertionCandidate={vi.fn()} onAppendGovernanceReview={vi.fn()} />);
    expect(screen.getByRole("region", { name: "Evidence detail" })).toHaveTextContent("partial text extraction");
    fireEvent.change(screen.getByLabelText("Parse state"), { target: { value: "partial" } });
    expect(screen.getByRole("button", { name: "Inspect evidence ev_ing_001" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Inspect evidence ev_ing_blocked" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Parse state"), { target: { value: "succeeded" } });
    expect(screen.queryByRole("button", { name: "Inspect evidence ev_ing_001" })).not.toBeInTheDocument();
  });
  it("renders one canonical item with every duplicate occurrence and full review provenance", () => {
    renderWorkspace();

    const corpus = screen.getByRole("region", { name: "Evidence corpus" });
    expect(within(corpus).getAllByRole("button", { name: /Inspect evidence/ })).toHaveLength(2);
    expect(within(corpus).getByText(/2 occurrences/)).toBeInTheDocument();

    const detail = screen.getByRole("region", { name: "Evidence detail" });
    expect(detail).toHaveTextContent("sha256:1111111111111111111111111111111111111111111111111111111111111111");
    expect(detail).toHaveTextContent("External investigation archive");
    expect(detail).toHaveTextContent("imp_001");
    expect(detail).toHaveTextContent("contracts/a.txt");
    expect(detail).toHaveTextContent("duplicates/a-copy.txt");
    expect(detail).toHaveTextContent("local-text@0.1.0");
    expect(detail).toHaveTextContent("public_record");
    expect(detail).toHaveTextContent("prr_evidence_review_001");
  });

  it("filters by text, governance tag, and parse state", () => {
    renderWorkspace();

    fireEvent.change(screen.getByRole("searchbox", { name: "Filter evidence" }), {
      target: { value: "restricted" }
    });
    expect(screen.getByRole("button", { name: "Inspect evidence ev_ing_blocked" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Inspect evidence ev_ing_001" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Filter evidence" }), {
      target: { value: "" }
    });
    fireEvent.change(screen.getByLabelText("Governance tag"), { target: { value: "public_record" } });
    fireEvent.change(screen.getByLabelText("Parse state"), { target: { value: "succeeded" } });
    expect(screen.getByRole("button", { name: "Inspect evidence ev_ing_001" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Inspect evidence ev_ing_blocked" })).not.toBeInTheDocument();
  });

  it("explains proposal blocks and prepares only review-required assertion candidates", async () => {
    const onPrepare = vi.fn(async (): Promise<EvidenceAssertionCandidateDto> => ({
      assertionId: "as_evidence_ui_001",
      evidenceReferences: [{
        evidenceId: "ev_ing_001",
        contentHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
        eventIds: ["evt_ing_evidence_ingested", "evt_ing_evidence_linked"]
      }],
      predicate: "agency.name",
      confidence: 0.84,
      reviewState: "proposed",
      reviewRequired: true,
      eventId: "evt_assertion_proposed_ui_001"
    }));
    renderWorkspace(onPrepare);

    fireEvent.click(screen.getByRole("button", { name: "Inspect evidence ev_ing_blocked" }));
    expect(screen.getByText("Quarantined evidence is excluded from ordinary assertion preparation.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Evidence detail" })).toHaveTextContent("workflow lock");
    expect(screen.getByRole("button", { name: "Prepare assertion candidate" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Inspect evidence ev_ing_001" }));
    fireEvent.change(screen.getByLabelText("Assertion ID"), { target: { value: "as_evidence_ui_001" } });
    fireEvent.change(screen.getByLabelText("Predicate"), { target: { value: "agency.name" } });
    fireEvent.change(screen.getByLabelText("Object"), { target: { value: "Example Agency" } });
    fireEvent.change(screen.getByLabelText("Confidence"), { target: { value: "0.84" } });
    fireEvent.click(screen.getByRole("button", { name: "Prepare assertion candidate" }));

    await waitFor(() => expect(onPrepare).toHaveBeenCalledWith({
      assertionId: "as_evidence_ui_001",
      evidenceId: "ev_ing_001",
      predicate: "agency.name",
      object: "Example Agency",
      confidence: 0.84
    }));
    const result = await screen.findByRole("status", { name: "Assertion candidate prepared" });
    expect(result).toHaveTextContent("review required");
    expect(result).toHaveTextContent("ev_ing_001");
  });

  it("strictly parses immutable browser-safe DTOs", () => {
    const parsed = evidenceWorkspaceDtoFromJson(workspaceDto());

    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.items)).toBe(true);
    expect(() => evidenceWorkspaceDtoFromJson({ ...parsed, rawContent: "not browser safe" })).toThrow();
    expect(() => evidenceWorkspaceDtoFromJson({
      ...parsed,
      status: "degraded",
      diagnostics: [{
        code: "projection-error",
        severity: "error",
        message: "Authorization Bearer secret-value",
        repairActions: ["retry"]
      }]
    })).toThrow(/credential-shaped/i);
    expect(() => evidenceWorkspaceDtoFromJson({
      ...workspaceDto(),
      items: [{
        ...workspaceDto().items[0]!,
        source: { kind: "file", label: "ghp_abcdefghijklmnopqrstuvwxyz1234567890" }
      }]
    })).toThrow(/credential-shaped/i);
    const fixture = workspaceDto();
    expect(() => evidenceWorkspaceDtoFromJson({
      ...fixture,
      items: fixture.items.map((item, index) => index === 0 ? {
        ...item,
        governanceTags: [...item.governanceTags, {
          tag: "credential_risk",
          confidence: 1,
          rationale: "Human-confirmed credential-risk handling remains excluded by default.",
          source: "human",
          status: "active",
          eventId: "evt_governance_credential_risk"
        }]
      } : item),
      governance: {
        ...fixture.governance,
        reviews: fixture.governance.reviews.map((review) =>
          review.evidenceRef === "ev_ing_001"
            ? {
                ...review,
                humanDecisions: [...review.humanDecisions, {
                  tag: "credential_risk",
                  action: "add",
                  rationale: "Human-confirmed credential-risk handling remains excluded by default.",
                  eventRef: "evt_governance_credential_risk"
                }]
              }
            : review
        ),
        exportPreview: {
          ...fixture.governance.exportPreview,
          excludedEvidence: fixture.governance.exportPreview.excludedEvidence.map((item) =>
            item.evidenceRef === "ev_ing_001"
              ? {
                  ...item,
                  requiredApprovals: [{
                    category: "credential-risk",
                    approvalId: "human-approve-credential-risk-inclusion",
                    optInAvailableInPreview: true
                  }]
                }
              : item
          )
        }
      }
    })).not.toThrow();
    expect(() => evidenceWorkspaceDtoFromJson({
      ...fixture,
      governance: {
        ...fixture.governance,
        reviews: fixture.governance.reviews.slice(1)
      }
    })).toThrow("Evidence workspace governance coverage is inconsistent.");
    expect(() => evidenceWorkspaceDtoFromJson({
      ...fixture,
      governance: {
        ...fixture.governance,
        exportPreview: {
          ...fixture.governance.exportPreview,
          excludedEvidence: fixture.governance.exportPreview.excludedEvidence.slice(1)
        }
      }
    })).toThrow("Evidence workspace governance coverage is inconsistent.");
  });

  it.each([
    {
      caseName: "quarantined evidence",
      quarantined: true,
      quarantineLockLevels: ["workflow"] as const,
      tombstoned: false,
      governanceTags: [publicSafeTag()],
      classificationStatus: "succeeded" as const
    },
    {
      caseName: "tombstoned evidence",
      quarantined: false,
      quarantineLockLevels: [] as const,
      tombstoned: true,
      governanceTags: [publicSafeTag()],
      classificationStatus: "succeeded" as const
    },
    {
      caseName: "contains-pii evidence",
      quarantined: false,
      quarantineLockLevels: [] as const,
      tombstoned: false,
      governanceTags: [publicSafeTag(), restrictedTag("contains_pii")],
      classificationStatus: "succeeded" as const
    },
    {
      caseName: "public-safe export-restricted evidence",
      quarantined: false,
      quarantineLockLevels: [] as const,
      tombstoned: false,
      governanceTags: [publicSafeTag(), restrictedTag("export_restricted")],
      classificationStatus: "succeeded" as const
    },
    {
      caseName: "missing-classification evidence",
      quarantined: false,
      quarantineLockLevels: [] as const,
      tombstoned: false,
      governanceTags: [publicSafeTag()],
      classificationStatus: "missing" as const
    },
    {
      caseName: "evidence with a hidden export lock",
      quarantined: false,
      quarantineLockLevels: ["export"] as const,
      tombstoned: false,
      governanceTags: [publicSafeTag()],
      classificationStatus: "succeeded" as const
    },
    {
      caseName: "evidence without active public-safe state",
      quarantined: false,
      quarantineLockLevels: [] as const,
      tombstoned: false,
      governanceTags: [restrictedTag("public_record")],
      classificationStatus: "succeeded" as const
    }
  ])("rejects $caseName when the preview marks it included", (probe) => {
    expect(() => evidenceWorkspaceDtoFromJson(workspaceWithFirstEvidenceIncluded(probe))).toThrow(
      "Evidence workspace governance eligibility is inconsistent."
    );
  });

  it("accepts included evidence only when item and review eligibility agree", () => {
    expect(() => evidenceWorkspaceDtoFromJson(workspaceWithFirstEvidenceIncluded({
      caseName: "eligible public-safe evidence",
      quarantined: false,
      quarantineLockLevels: [],
      tombstoned: false,
      governanceTags: [publicSafeTag()],
      classificationStatus: "succeeded"
    }))).not.toThrow();
  });

  it("rejects included public-safe state without matching visible review provenance", () => {
    expect(() => evidenceWorkspaceDtoFromJson(workspaceWithFirstEvidenceIncluded({
      caseName: "forged public-safe evidence",
      quarantined: false,
      quarantineLockLevels: [],
      tombstoned: false,
      governanceTags: [publicSafeTag()],
      classificationStatus: "succeeded",
      traceGovernanceTags: false
    }))).toThrow("Evidence workspace governance eligibility is inconsistent.");
  });

  it("rejects included public-safe state when preview provenance omits its active event", () => {
    expect(() => evidenceWorkspaceDtoFromJson(workspaceWithFirstEvidenceIncluded({
      caseName: "preview provenance missing public-safe event",
      quarantined: false,
      quarantineLockLevels: [],
      tombstoned: false,
      governanceTags: [publicSafeTag()],
      classificationStatus: "succeeded",
      includeTagEventRefs: false
    }))).toThrow("Evidence workspace governance eligibility is inconsistent.");
  });

  it("rejects inclusion when an active restricted proposal is omitted from item state", () => {
    expect(() => evidenceWorkspaceDtoFromJson(workspaceWithFirstEvidenceIncluded({
      caseName: "omitted restricted proposal",
      quarantined: false,
      quarantineLockLevels: [],
      tombstoned: false,
      governanceTags: [publicSafeTag()],
      classificationStatus: "succeeded",
      additionalProposedTags: [{
        tag: "contains_pii",
        confidence: 0.99,
        confidenceThreshold: 0.9,
        rationale: "Classifier found active private evidence handling.",
        eventRef: "evt_classify_contains_pii_omitted",
        workflowAccess: "ordinary-internal-only"
      }]
    }))).toThrow("Evidence workspace governance eligibility is inconsistent.");
  });

  it("rejects inclusion when a high-confidence restricted proposal falsely claims locked access", () => {
    expect(() => evidenceWorkspaceDtoFromJson(workspaceWithFirstEvidenceIncluded({
      caseName: "high-confidence restricted proposal claiming locked access",
      quarantined: false,
      quarantineLockLevels: [],
      tombstoned: false,
      governanceTags: [publicSafeTag()],
      classificationStatus: "succeeded",
      additionalProposedTags: [{
        tag: "contains_pii",
        confidence: 0.99,
        confidenceThreshold: 0.9,
        rationale: "Classifier found active private evidence handling.",
        eventRef: "evt_classify_contains_pii_false_lock",
        workflowAccess: "locked",
        repairHint: "request-human-governance-review"
      }]
    }))).toThrow();
  });

  it("rejects stale public-safe item state after a later human remove decision", () => {
    expect(() => evidenceWorkspaceDtoFromJson(workspaceWithFirstEvidenceIncluded({
      caseName: "stale public-safe item",
      quarantined: false,
      quarantineLockLevels: [],
      tombstoned: false,
      governanceTags: [publicSafeTag()],
      classificationStatus: "succeeded",
      additionalHumanDecisions: [{
        tag: "public_safe",
        action: "remove",
        rationale: "Later human review removed public-safe eligibility.",
        eventRef: "evt_review_public_safe_removed"
      }]
    }))).toThrow("Evidence workspace governance eligibility is inconsistent.");
  });

  it("rejects an active AI public-safe tag backed only by a locked proposal", () => {
    const lockedAiTag = aiPublicSafeTag();
    expect(() => evidenceWorkspaceDtoFromJson(workspaceWithFirstEvidenceIncluded({
      caseName: "locked AI public-safe proposal",
      quarantined: false,
      quarantineLockLevels: [],
      tombstoned: false,
      governanceTags: [lockedAiTag],
      classificationStatus: "succeeded",
      additionalProposedTags: [{
        tag: lockedAiTag.tag,
        confidence: lockedAiTag.confidence,
        confidenceThreshold: 0.9,
        rationale: lockedAiTag.rationale,
        eventRef: lockedAiTag.eventId,
        workflowAccess: "locked",
        repairHint: "request-human-governance-review"
      }]
    }))).toThrow("Evidence workspace governance eligibility is inconsistent.");
  });

  it("rejects a contains-pii exclusion carrying only the public-safe affirmation approval", () => {
    expect(() => evidenceWorkspaceDtoFromJson(workspaceWithFirstEvidenceExcluded({
      quarantined: false,
      quarantineLockLevels: [],
      tombstoned: false,
      governanceTags: [restrictedTag("contains_pii")],
      classificationStatus: "succeeded",
      requiredApprovals: [humanAffirmPublicSafeApproval()],
      previewDiagnostics: []
    }))).toThrow("Evidence workspace governance eligibility is inconsistent.");
  });

  it("rejects quarantined evidence when the quarantine-release approval is omitted", () => {
    expect(() => evidenceWorkspaceDtoFromJson(workspaceWithFirstEvidenceExcluded({
      quarantined: true,
      quarantineLockLevels: ["workflow"],
      tombstoned: false,
      governanceTags: [publicSafeTag()],
      classificationStatus: "succeeded",
      requiredApprovals: [humanAffirmPublicSafeApproval()],
      previewDiagnostics: []
    }))).toThrow("Evidence workspace governance eligibility is inconsistent.");
  });

  it("rejects unclassified evidence without its classification approval and preview diagnostic", () => {
    expect(() => evidenceWorkspaceDtoFromJson(workspaceWithFirstEvidenceExcluded({
      quarantined: false,
      quarantineLockLevels: [],
      tombstoned: false,
      governanceTags: [],
      classificationStatus: "missing",
      requiredApprovals: [humanAffirmPublicSafeApproval()],
      previewDiagnostics: []
    }))).toThrow("Evidence workspace governance eligibility is inconsistent.");
  });

  it("rejects unrelated extra approvals on an otherwise exact exclusion", () => {
    expect(() => evidenceWorkspaceDtoFromJson(workspaceWithFirstEvidenceExcluded({
      quarantined: false,
      quarantineLockLevels: [],
      tombstoned: false,
      governanceTags: [restrictedTag("public_record")],
      classificationStatus: "succeeded",
      requiredApprovals: [humanAffirmPublicSafeApproval(), quarantineReleaseApproval()],
      previewDiagnostics: []
    }))).toThrow("Evidence workspace governance eligibility is inconsistent.");
  });

  it.each(["failed", "unknown-tag"] as const)(
    "rejects non-builder %s classification status in the combined workspace boundary",
    (classificationStatus) => {
      expect(() => evidenceWorkspaceDtoFromJson(workspaceWithFirstEvidenceExcluded({
        quarantined: false,
        quarantineLockLevels: [],
        tombstoned: false,
        governanceTags: [],
        classificationStatus,
        requiredApprovals: [humanAffirmPublicSafeApproval()],
        previewDiagnostics: [{
          code: "evidence-state-missing",
          evidenceRef: "ev_ing_001",
          repairHint: "verify-evidence-reference"
        }]
      }))).toThrow("Evidence workspace governance eligibility is inconsistent.");
    }
  );

  it("accepts exact classification-missing approvals and diagnostic for existing unclassified state", () => {
    expect(() => evidenceWorkspaceDtoFromJson(workspaceWithFirstEvidenceExcluded({
      quarantined: false,
      quarantineLockLevels: [],
      tombstoned: false,
      governanceTags: [],
      classificationStatus: "missing",
      requiredApprovals: [classificationRequiredApproval(), humanAffirmPublicSafeApproval()],
      previewDiagnostics: [{
        code: "classification-missing",
        evidenceRef: "ev_ing_001",
        repairHint: "record-governance-classification"
      }]
    }))).not.toThrow();
  });

  it("rejects evidence-state-missing for source-backed ingestion state", () => {
    expect(() => evidenceWorkspaceDtoFromJson(workspaceWithFirstEvidenceExcluded({
      quarantined: false,
      quarantineLockLevels: [],
      tombstoned: false,
      governanceTags: [],
      classificationStatus: "missing",
      requiredApprovals: [humanAffirmPublicSafeApproval()],
      previewDiagnostics: [{
        code: "evidence-state-missing",
        evidenceRef: "ev_ing_001",
        repairHint: "verify-evidence-reference"
      }]
    }))).toThrow("Evidence workspace governance eligibility is inconsistent.");
  });

  it("accepts exact evidence-state-missing approval and diagnostic for a link-derived item", () => {
    expect(() => evidenceWorkspaceDtoFromJson(workspaceWithFirstEvidenceExcluded({
      quarantined: false,
      quarantineLockLevels: [],
      tombstoned: false,
      governanceTags: [],
      classificationStatus: "missing",
      requiredApprovals: [humanAffirmPublicSafeApproval()],
      previewDiagnostics: [{
        code: "evidence-state-missing",
        evidenceRef: "ev_ing_001",
        repairHint: "verify-evidence-reference"
      }],
      missingIngestionState: true
    }))).not.toThrow();
  });

  it.each([
    {
      caseName: "a later policy raises the threshold",
      classificationThreshold: 0.8,
      activeThreshold: 0.9,
      expectedWorkflowAccess: "ordinary-internal-only" as const,
      expectedProjectedTagCount: 1
    },
    {
      caseName: "a later policy lowers the threshold",
      classificationThreshold: 0.9,
      activeThreshold: 0.8,
      expectedWorkflowAccess: "locked" as const,
      expectedProjectedTagCount: 0
    }
  ])("replays event-time policy semantics when $caseName", async (testCase) => {
    const events = await policyHistoryEvents(
      testCase.classificationThreshold,
      testCase.activeThreshold
    );
    const parsed = evidenceWorkspaceDtoFromJson({
      ...buildEvidenceWorkspaceDto(events),
      governance: buildEvidenceGovernanceWorkspaceDto(events, ["ev_policy_history"])
    });

    expect(parsed.items[0]?.governanceTags).toHaveLength(testCase.expectedProjectedTagCount);
    expect(parsed.governance.reviews[0]).toMatchObject({
      confidenceThreshold: testCase.activeThreshold,
      proposedTags: [{
        tag: "public_record",
        confidence: 0.85,
        confidenceThreshold: testCase.classificationThreshold,
        workflowAccess: testCase.expectedWorkflowAccess
      }]
    });
  });
});

function renderWorkspace(onPrepare = vi.fn()) {
  return render(
    <EvidenceWorkspace
      workspace={workspaceDto()}
      loadState="loaded"
      loadError={undefined}
      onRetry={() => undefined}
      onPrepareAssertionCandidate={onPrepare}
      onAppendGovernanceReview={vi.fn()}
    />
  );
}

type GovernanceEligibilityProbe = {
  readonly caseName: string;
  readonly quarantined: boolean;
  readonly quarantineLockLevels: readonly ("workflow" | "export" | "all")[];
  readonly tombstoned: boolean;
  readonly governanceTags: readonly TestGovernanceTag[];
  readonly classificationStatus: "succeeded" | "missing";
  readonly traceGovernanceTags?: boolean;
  readonly includeTagEventRefs?: boolean;
  readonly additionalProposedTags?: readonly TestProposedTag[];
  readonly additionalHumanDecisions?: readonly TestHumanDecision[];
};

type TestGovernanceTag = {
  readonly tag: GovernanceTag;
  readonly confidence: number;
  readonly rationale: string;
  readonly source: "ai" | "human";
  readonly status: "active" | "removed";
  readonly eventId: string;
};

type TestProposedTag = {
  readonly tag: TestGovernanceTag["tag"];
  readonly confidence: number;
  readonly confidenceThreshold: number;
  readonly rationale: string;
  readonly eventRef: string;
  readonly workflowAccess: "ordinary-internal-only" | "locked";
  readonly repairHint?: "request-human-governance-review";
};

type TestHumanDecision = {
  readonly tag: TestGovernanceTag["tag"];
  readonly action: "affirm" | "add" | "remove" | "supersede";
  readonly rationale: string;
  readonly eventRef: string;
};

type ExcludedGovernanceProbe = {
  readonly quarantined: boolean;
  readonly quarantineLockLevels: readonly ("workflow" | "export" | "all")[];
  readonly tombstoned: boolean;
  readonly governanceTags: readonly TestGovernanceTag[];
  readonly classificationStatus: "succeeded" | "missing" | "failed" | "unknown-tag";
  readonly requiredApprovals: readonly TestPreviewApproval[];
  readonly previewDiagnostics: readonly TestPreviewDiagnostic[];
  readonly missingIngestionState?: boolean;
};

type TestPreviewApproval = {
  readonly category: "private" | "other-unsafe" | "quarantine";
  readonly approvalId:
    | "human-approve-private-evidence-inclusion"
    | "human-affirm-public-safe-eligibility"
    | "governance-classification-required-before-preview"
    | "quarantine-release-unavailable-in-preview";
  readonly optInAvailableInPreview: boolean;
};

type TestPreviewDiagnostic = {
  readonly code: "classification-missing" | "evidence-state-missing";
  readonly evidenceRef: string;
  readonly repairHint: "record-governance-classification" | "verify-evidence-reference";
};

function workspaceWithFirstEvidenceIncluded(input: GovernanceEligibilityProbe): unknown {
  const workspace = workspaceDto();
  const item = workspace.items[0]!;
  const review = workspace.governance.reviews[0]!;
  const exclusion = workspace.governance.exportPreview.excludedEvidence.find(
    (candidate) => candidate.evidenceRef === item.evidenceId
  )!;
  const missingClassification = input.classificationStatus === "missing";
  const effectiveGovernanceTags = missingClassification
    ? input.governanceTags
    : mergeGovernanceTags(item.governanceTags, input.governanceTags);
  const tracedDecisions = input.traceGovernanceTags === false || missingClassification
    ? []
    : governanceDecisionsForTags(effectiveGovernanceTags);
  const tagEventRefs = input.includeTagEventRefs === false
    ? []
    : effectiveGovernanceTags.map((tag) => tag.eventId);
  return {
    ...workspace,
    items: [{
      ...item,
      quarantined: input.quarantined,
      quarantineLockLevels: input.quarantineLockLevels,
      tombstoned: input.tombstoned,
      governanceTags: effectiveGovernanceTags
    }, ...workspace.items.slice(1)],
    governance: {
      ...workspace.governance,
      reviews: [{
        ...review,
        classificationStatus: input.classificationStatus,
        ...(missingClassification ? {
          proposedTags: [],
          humanDecisions: [],
          diagnostics: [{
            code: "classification-missing",
            evidenceRef: item.evidenceId,
            repairHint: "record-governance-classification"
          }]
        } : {
          proposedTags: [...review.proposedTags, ...(input.additionalProposedTags ?? [])],
          humanDecisions: [
            ...review.humanDecisions,
            ...tracedDecisions,
            ...(input.additionalHumanDecisions ?? [])
          ]
        })
      }, ...workspace.governance.reviews.slice(1)],
      exportPreview: {
        ...workspace.governance.exportPreview,
        includedEvidence: [{
          evidenceRef: item.evidenceId,
          governanceEventRefs: [...new Set([...exclusion.governanceEventRefs, ...tagEventRefs])]
        }],
        excludedEvidence: workspace.governance.exportPreview.excludedEvidence.filter(
          (candidate) => candidate.evidenceRef !== item.evidenceId
        ),
        diagnostics: workspace.governance.exportPreview.diagnostics.filter(
          (diagnostic) => diagnostic.evidenceRef !== item.evidenceId
        )
      }
    }
  };
}

function workspaceWithFirstEvidenceExcluded(input: ExcludedGovernanceProbe): unknown {
  const workspace = workspaceDto();
  const item = workspace.items[0]!;
  const review = workspace.governance.reviews[0]!;
  const classificationDiagnostic = input.classificationStatus === "missing"
    ? {
        code: "classification-missing" as const,
        evidenceRef: item.evidenceId,
        repairHint: "record-governance-classification" as const
      }
    : input.classificationStatus === "failed"
      ? {
          code: "classification-failed" as const,
          evidenceRef: item.evidenceId,
          repairHint: "retry-or-review-classification" as const
        }
      : {
          code: "unknown-tag" as const,
          evidenceRef: item.evidenceId,
          repairHint: "replace-unknown-governance-tag" as const
        };
  const nonSucceeded = input.classificationStatus !== "succeeded";
  const effectiveGovernanceTags = nonSucceeded
    ? input.governanceTags
    : mergeGovernanceTags(item.governanceTags, input.governanceTags);
  const tracedDecisions = nonSucceeded ? [] : governanceDecisionsForTags(effectiveGovernanceTags);
  return {
    ...workspace,
    items: [{
      ...item,
      quarantined: input.quarantined,
      quarantineLockLevels: input.quarantineLockLevels,
      tombstoned: input.tombstoned,
      governanceTags: effectiveGovernanceTags,
      ...(input.missingIngestionState === true ? {
        source: undefined,
        provenanceComplete: false,
        selectableForAssertionCandidate: false,
        blockingReasons: ["Evidence ingestion provenance is missing."]
      } : {})
    }, ...workspace.items.slice(1)],
    governance: {
      ...workspace.governance,
      reviews: [{
        ...review,
        classificationStatus: input.classificationStatus,
        ...(nonSucceeded ? {
          proposedTags: [],
          humanDecisions: [],
          diagnostics: [classificationDiagnostic]
        } : {
          humanDecisions: [...review.humanDecisions, ...tracedDecisions]
        })
      }, ...workspace.governance.reviews.slice(1)],
      exportPreview: {
        ...workspace.governance.exportPreview,
        excludedEvidence: workspace.governance.exportPreview.excludedEvidence.map((candidate) =>
          candidate.evidenceRef === item.evidenceId
            ? { ...candidate, requiredApprovals: input.requiredApprovals }
            : candidate
        ),
        diagnostics: input.previewDiagnostics
      }
    }
  };
}

function publicSafeTag(): TestGovernanceTag {
  return {
    tag: "public_safe" as const,
    confidence: 1,
    rationale: "Human-confirmed public-safe evidence.",
    source: "human" as const,
    status: "active" as const,
    eventId: "evt_governance_public_safe"
  };
}

function aiPublicSafeTag(): TestGovernanceTag {
  return {
    tag: "public_safe",
    confidence: 0.4,
    rationale: "Low-confidence AI proposal must remain locked.",
    source: "ai",
    status: "active",
    eventId: "evt_classify_public_safe_locked"
  };
}

function restrictedTag(tag: "public_record" | "contains_pii" | "export_restricted"): TestGovernanceTag {
  return {
    ...publicSafeTag(),
    tag,
    rationale: `Governance classification recorded ${tag} handling.`,
    eventId: `evt_review_governance_${tag}`
  };
}

function governanceDecisionsForTags(tags: readonly TestGovernanceTag[]) {
  return tags.filter((tag) => tag.source === "human").map((tag) => ({
    tag: tag.tag,
    action: tag.status === "active" ? "add" as const : "remove" as const,
    rationale: tag.rationale,
    eventRef: tag.eventId
  }));
}

function mergeGovernanceTags(
  existing: readonly TestGovernanceTag[],
  replacements: readonly TestGovernanceTag[]
): readonly TestGovernanceTag[] {
  const replacementTags = new Set(replacements.map((tag) => tag.tag));
  return [...existing.filter((tag) => !replacementTags.has(tag.tag)), ...replacements];
}

function humanAffirmPublicSafeApproval(): TestPreviewApproval {
  return {
    category: "other-unsafe",
    approvalId: "human-affirm-public-safe-eligibility",
    optInAvailableInPreview: false
  };
}

function classificationRequiredApproval(): TestPreviewApproval {
  return {
    category: "other-unsafe",
    approvalId: "governance-classification-required-before-preview",
    optInAvailableInPreview: false
  };
}

function quarantineReleaseApproval(): TestPreviewApproval {
  return {
    category: "quarantine",
    approvalId: "quarantine-release-unavailable-in-preview",
    optInAvailableInPreview: false
  };
}

async function policyHistoryEvents(
  classificationThreshold: number,
  activeThreshold: number
) {
  const ledger = new InMemoryEventLedger();
  const humanActor = {
    id: "actor_policy_history_reviewer",
    kind: "human" as const,
    label: "Policy history reviewer"
  };
  const classifierActor = {
    id: "actor_policy_history_classifier",
    kind: "extractor" as const,
    label: "Policy history classifier"
  };
  await ledger.append({
    type: "evidence.ingested",
    version: 1,
    streamId: "evidence_ev_policy_history",
    context: {
      actor: humanActor,
      occurredAt: "2026-07-05T12:00:00.000Z",
      correlationId: "corr_policy_history",
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0" }
    },
    payload: {
      evidenceId: "ev_policy_history",
      source: { kind: "file", label: "policy-history.txt" },
      contentHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      mediaType: "text/plain",
      sizeBytes: 14
    }
  } satisfies AppendableKnowledgeEvent<"evidence.ingested">);

  const humanService = new GovernanceService({ ledger, actor: humanActor });
  const classificationPolicy = replayPolicy("classification", classificationThreshold);
  const activePolicy = replayPolicy("active", activeThreshold);
  await humanService.installPolicy({
    policy: classificationPolicy,
    installedBy: humanActor.id
  });
  await new GovernanceService({ ledger, actor: classifierActor }).classifyEvidence({
    evidenceId: "ev_policy_history",
    policy: {
      policyId: classificationPolicy.policyId,
      version: classificationPolicy.version
    },
    classifier: {
      actorId: classifierActor.id,
      kind: "ai",
      label: "Policy history classifier"
    },
    tags: [{
      tag: "public_record",
      confidence: 0.85,
      rationale: "Classifier recorded public-record handling under the event-time policy."
    }]
  });
  await humanService.installPolicy({
    policy: activePolicy,
    installedBy: humanActor.id
  });
  return ledger.readAll();
}

function replayPolicy(version: string, confidenceThreshold: number) {
  return {
    ...defaultGovernancePolicy,
    policyId: "gov_policy_replay_history",
    version,
    confidenceThreshold,
    tags: defaultGovernancePolicy.tags.map((tag) => ({ ...tag }))
  };
}
