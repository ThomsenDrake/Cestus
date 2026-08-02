/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GovernanceReview } from "../src/governance/GovernanceReview.js";
import { governanceReviewDtoFromJson } from "../src/governance/governance-adapter.js";
import type { GovernanceReviewDto } from "../src/governance/governance-types.js";

const reviewDto = (): GovernanceReviewDto => ({
  schemaVersion: "governance-review.v1",
  evidenceRef: "ev_source_public_restricted",
  classificationStatus: "succeeded",
  confidenceThreshold: 0.9,
  proposedTags: [
    {
      tag: "public_safe",
      confidence: 0.97,
      rationale: "Public filing appears suitable after review.",
      eventRef: "evt_classify_governance_public_restricted",
      workflowAccess: "ordinary-internal-only"
    },
    {
      tag: "contains_pii",
      confidence: 0.62,
      rationale: "Addresses may require human verification.",
      eventRef: "evt_classify_governance_public_restricted",
      workflowAccess: "locked",
      repairHint: "request-human-governance-review"
    },
    {
      tag: "public_record",
      confidence: 0.95,
      rationale: "Classifier proposed public-record handling.",
      eventRef: "evt_classify_governance_public_record",
      workflowAccess: "ordinary-internal-only"
    }
  ],
  humanDecisions: [{
    tag: "public_record",
    action: "supersede",
    rationale: "Human review replaced the earlier public-record proposal.",
    eventRef: "evt_review_governance_public_record",
    supersedesEventRef: "evt_classify_governance_public_record"
  }],
  diagnostics: []
});

describe("GovernanceReview", () => {
  it("shows independent proposals and prepares an append-only human supersede decision", async () => {
    const onAppendReview = vi.fn(async () => undefined);
    render(<GovernanceReview review={reviewDto()} onAppendReview={onAppendReview} />);

    const proposals = screen.getByRole("region", { name: "Proposed governance tags" });
    expect(within(proposals).getByText("public_safe")).toBeInTheDocument();
    expect(within(proposals).getByText("97% confidence")).toBeInTheDocument();
    expect(within(proposals).getByText("Public filing appears suitable after review.")).toBeInTheDocument();
    expect(within(proposals).getByText("contains_pii")).toBeInTheDocument();
    expect(within(proposals).getByText("62% confidence")).toBeInTheDocument();
    expect(within(proposals).getByText("request-human-governance-review")).toBeInTheDocument();
    expect(within(proposals).getAllByText("evt_classify_governance_public_restricted")).toHaveLength(2);
    const history = screen.getByRole("region", { name: "Human governance history" });
    expect(within(history).getByText("evt_review_governance_public_record")).toBeInTheDocument();
    expect(within(history).getByText("evt_classify_governance_public_record")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Review tag"), { target: { value: "public_safe" } });
    fireEvent.change(screen.getByLabelText("Review action"), { target: { value: "supersede" } });
    fireEvent.change(screen.getByLabelText("Review rationale"), {
      target: { value: "Human review requires restricted handling." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Append governance review" }));

    await waitFor(() => expect(onAppendReview).toHaveBeenCalledWith({
      evidenceRef: "ev_source_public_restricted",
      tag: "public_safe",
      action: "supersede",
      rationale: "Human review requires restricted handling.",
      supersedesEventRef: "evt_classify_governance_public_restricted"
    }));
    expect(within(proposals).getByText("Public filing appears suitable after review.")).toBeInTheDocument();
  });

  it("fails closed when supersede has no matching prior event and omits the ref for add", async () => {
    const onAppendReview = vi.fn(async () => undefined);
    render(<GovernanceReview review={reviewDto()} onAppendReview={onAppendReview} />);

    fireEvent.change(screen.getByLabelText("Review tag"), { target: { value: "legal_risk" } });
    fireEvent.change(screen.getByLabelText("Review action"), { target: { value: "supersede" } });
    fireEvent.change(screen.getByLabelText("Review rationale"), {
      target: { value: "Human review adds legal-risk handling." }
    });
    expect(screen.getByRole("button", { name: "Append governance review" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Supersede requires a prior governance event for this tag.");

    fireEvent.change(screen.getByLabelText("Review action"), { target: { value: "add" } });
    fireEvent.click(screen.getByRole("button", { name: "Append governance review" }));

    await waitFor(() => expect(onAppendReview).toHaveBeenCalledWith({
      evidenceRef: "ev_source_public_restricted",
      tag: "legal_risk",
      action: "add",
      rationale: "Human review adds legal-risk handling."
    }));
  });

  it("supersedes the latest matching human event before an earlier classifier proposal", async () => {
    const onAppendReview = vi.fn(async () => undefined);
    render(<GovernanceReview review={reviewDto()} onAppendReview={onAppendReview} />);

    fireEvent.change(screen.getByLabelText("Review tag"), { target: { value: "public_record" } });
    fireEvent.change(screen.getByLabelText("Review action"), { target: { value: "supersede" } });
    fireEvent.change(screen.getByLabelText("Review rationale"), {
      target: { value: "Later human review supersedes the prior human decision." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Append governance review" }));

    await waitFor(() => expect(onAppendReview).toHaveBeenCalledWith({
      evidenceRef: "ev_source_public_restricted",
      tag: "public_record",
      action: "supersede",
      rationale: "Later human review supersedes the prior human decision.",
      supersedesEventRef: "evt_review_governance_public_record"
    }));
  });

  it("renders missing, failed, and unknown-tag classification states as locked safe diagnostics", () => {
    const cases = [
      {
        classificationStatus: "missing" as const,
        code: "classification-missing" as const,
        repairHint: "record-governance-classification" as const
      },
      {
        classificationStatus: "failed" as const,
        code: "classification-failed" as const,
        repairHint: "retry-or-review-classification" as const
      },
      {
        classificationStatus: "unknown-tag" as const,
        code: "unknown-tag" as const,
        repairHint: "replace-unknown-governance-tag" as const
      }
    ];

    for (const testCase of cases) {
      const { unmount } = render(
        <GovernanceReview
          review={{
            ...reviewDto(),
            classificationStatus: testCase.classificationStatus,
            proposedTags: [],
            humanDecisions: [],
            diagnostics: [{
              code: testCase.code,
              evidenceRef: "ev_source_public_restricted",
              repairHint: testCase.repairHint
            }]
          }}
          onAppendReview={vi.fn()}
        />
      );
      const diagnostic = screen.getByRole("region", { name: "Locked governance diagnostic" });
      expect(within(diagnostic).getByText(testCase.code)).toBeInTheDocument();
      expect(within(diagnostic).getByText(testCase.repairHint)).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText("Review rationale"), { target: { value: "Attempted locked review." } });
      expect(screen.getByRole("button", { name: "Append governance review" })).toBeDisabled();
      unmount();
    }
  });

  it("renders projection failure as locked even when classification succeeded", () => {
    const onAppendReview = vi.fn();
    const lockedProposals = reviewDto().proposedTags.map((proposal) => ({
      ...proposal,
      workflowAccess: "locked" as const,
      repairHint: proposal.repairHint ?? "request-human-governance-review" as const
    }));
    render(
      <GovernanceReview
        review={{
          ...reviewDto(),
          proposedTags: lockedProposals,
          diagnostics: [{
            code: "projection-failed",
            evidenceRef: "ev_source_public_restricted",
            repairHint: "rebuild-governance-projection"
          }]
        }}
        onAppendReview={onAppendReview}
      />
    );

    const diagnostic = screen.getByRole("region", { name: "Locked governance diagnostic" });
    expect(within(diagnostic).getByText("projection-failed")).toBeInTheDocument();
    expect(within(diagnostic).getByText("rebuild-governance-projection")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Review rationale"), { target: { value: "Attempted failed projection review." } });
    expect(screen.getByRole("button", { name: "Append governance review" })).toBeDisabled();
    expect(onAppendReview).not.toHaveBeenCalled();
  });

  it("strictly accepts safe references and rejects private, identity, credential, and provider-error fields", () => {
    const parsed = governanceReviewDtoFromJson(reviewDto());
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.proposedTags)).toBe(true);
    expect(() => governanceReviewDtoFromJson({
      ...reviewDto(),
      humanDecisions: [
        reviewDto().humanDecisions[0]!,
        {
          tag: "contains_pii",
          action: "remove",
          rationale: "The same review event can carry another traceable decision.",
          eventRef: "evt_review_governance_public_record",
          supersedesEventRef: "evt_classify_governance_public_restricted"
        }
      ]
    })).not.toThrow();
    expect(() => governanceReviewDtoFromJson({ ...reviewDto(), rawContent: "private body" })).toThrow();
    expect(() => governanceReviewDtoFromJson({ ...reviewDto(), sourceIdentity: "confidential source" })).toThrow();
    const credentialBearingDto = {
      ...reviewDto(),
      proposedTags: [{
        ...reviewDto().proposedTags[0],
        rationale: "Authorization: Bearer abc123"
      }]
    };
    expect(() => governanceReviewDtoFromJson(credentialBearingDto)).toThrow(
      "Governance review DTO could not be parsed safely."
    );
    expect(captureParserError(() => governanceReviewDtoFromJson(credentialBearingDto))).not.toMatch(
      /Authorization|Bearer|abc123/
    );
    expect(() => governanceReviewDtoFromJson({
      ...reviewDto(),
      proposedTags: [{
        ...reviewDto().proposedTags[0],
        rationale: "Found password abc123"
      }]
    })).toThrow("Governance review DTO could not be parsed safely.");
    const providerErrorDto = {
      ...reviewDto(),
      diagnostics: [{
        code: "classification-failed",
        evidenceRef: "ev_source_public_restricted",
        repairHint: "retry-or-review-classification",
        providerError: "provider raw failure text"
      }]
    };
    expect(captureParserError(() => governanceReviewDtoFromJson(providerErrorDto))).toBe(
      "Governance review DTO could not be parsed safely."
    );
    expect(() => governanceReviewDtoFromJson({
      ...reviewDto(),
      humanDecisions: [{
        tag: "public_safe",
        action: "supersede",
        rationale: "Human supersede without a traceable prior event.",
        eventRef: "evt_review_missing_link"
      }]
    })).toThrow("Governance review DTO could not be parsed safely.");
    expect(() => governanceReviewDtoFromJson({
      ...reviewDto(),
      humanDecisions: [{
        tag: "public_safe",
        action: "supersede",
        rationale: "Self-reference is not valid provenance.",
        eventRef: "evt_review_self_reference",
        supersedesEventRef: "evt_review_self_reference"
      }]
    })).toThrow("Governance review DTO could not be parsed safely.");
    const invalidSupersedeProvenance = [
      [{
        tag: "public_safe",
        action: "supersede",
        rationale: "Unknown provenance is not visible in this review.",
        eventRef: "evt_review_unknown_target",
        supersedesEventRef: "evt_governance_not_visible"
      }],
      [
        {
          tag: "public_safe",
          action: "supersede",
          rationale: "A later review event is not prior provenance.",
          eventRef: "evt_review_before_later_target",
          supersedesEventRef: "evt_review_later_target"
        },
        {
          tag: "public_safe",
          action: "add",
          rationale: "This event appears later in the DTO history.",
          eventRef: "evt_review_later_target"
        }
      ],
      [{
        tag: "public_safe",
        action: "supersede",
        rationale: "The referenced classifier event contains another tag.",
        eventRef: "evt_review_wrong_tag_target",
        supersedesEventRef: "evt_classify_governance_public_record"
      }]
    ];
    for (const humanDecisions of invalidSupersedeProvenance) {
      expect(() => governanceReviewDtoFromJson({
        ...reviewDto(),
        humanDecisions
      })).toThrow("Governance review DTO could not be parsed safely.");
    }
    expect(() => governanceReviewDtoFromJson({
      ...reviewDto(),
      proposedTags: [{
        ...reviewDto().proposedTags[0],
        confidence: 0.2,
        workflowAccess: "ordinary-internal-only"
      }]
    })).toThrow("Governance review DTO could not be parsed safely.");
    for (const classificationStatus of ["missing", "failed", "unknown-tag"] as const) {
      expect(() => governanceReviewDtoFromJson({
        ...reviewDto(),
        classificationStatus,
        proposedTags: [],
        diagnostics: []
      })).toThrow("Governance review DTO could not be parsed safely.");
    }
    expect(() => governanceReviewDtoFromJson({
      ...reviewDto(),
      classificationStatus: "missing",
      proposedTags: [],
      diagnostics: [{
        code: "classification-missing",
        evidenceRef: "ev_source_public_restricted",
        repairHint: "retry-or-review-classification"
      }]
    })).toThrow("Governance review DTO could not be parsed safely.");
    const projectionFailure = {
      code: "projection-failed" as const,
      evidenceRef: "ev_source_public_restricted",
      repairHint: "rebuild-governance-projection" as const
    };
    expect(() => governanceReviewDtoFromJson({
      ...reviewDto(),
      diagnostics: [projectionFailure]
    })).toThrow("Governance review DTO could not be parsed safely.");
    expect(() => governanceReviewDtoFromJson({
      ...reviewDto(),
      proposedTags: reviewDto().proposedTags.map((proposal) => ({
        ...proposal,
        workflowAccess: "locked",
        repairHint: proposal.repairHint ?? "request-human-governance-review"
      })),
      diagnostics: [projectionFailure]
    })).not.toThrow();
  });
});

function captureParserError(parse: () => unknown): string {
  try {
    parse();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return "no error";
}
