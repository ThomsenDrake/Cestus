/** @vitest-environment jsdom */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ExportPreview } from "../src/governance/ExportPreview.js";
import { governanceExportPreviewDtoFromJson } from "../src/governance/governance-adapter.js";
import type { GovernanceExportPreviewDto } from "../src/governance/governance-types.js";

const previewDto = (): GovernanceExportPreviewDto => ({
  schemaVersion: "governance-export-preview.v1",
  mode: "preview-only",
  includedEvidence: [{
    evidenceRef: "ev_source_public",
    governanceEventRefs: ["evt_classify_governance_public", "evt_review_governance_public"]
  }],
  excludedEvidence: [
    {
      evidenceRef: "ev_source_private",
      governanceEventRefs: ["evt_classify_governance_private"],
      requiredApprovals: [{
        category: "private",
        approvalId: "human-approve-private-evidence-inclusion",
        optInAvailableInPreview: true
      }]
    },
    {
      evidenceRef: "ev_source_identity",
      governanceEventRefs: ["evt_classify_ev_source_identity"],
      requiredApprovals: [{
        category: "source-identity",
        approvalId: "human-approve-source-identity-inclusion",
        optInAvailableInPreview: true
      }]
    },
    {
      evidenceRef: "ev_credential_risk",
      governanceEventRefs: ["evt_classify_ev_credential_risk"],
      requiredApprovals: [{
        category: "credential-risk",
        approvalId: "human-approve-credential-risk-inclusion",
        optInAvailableInPreview: true
      }]
    },
    {
      evidenceRef: "ev_export_restricted",
      governanceEventRefs: ["evt_classify_ev_export_restricted"],
      requiredApprovals: [{
        category: "export-restricted",
        approvalId: "human-approve-export-restricted-inclusion",
        optInAvailableInPreview: true
      }]
    },
    {
      evidenceRef: "ev_other_unsafe",
      governanceEventRefs: ["evt_classify_ev_other_unsafe"],
      requiredApprovals: [{
        category: "other-unsafe",
        approvalId: "human-affirm-public-safe-eligibility",
        optInAvailableInPreview: false
      }]
    }
  ],
  diagnostics: []
});

describe("ExportPreview", () => {
  it("shows public-safe defaults, exact approval names, and no export or publication action", () => {
    render(<ExportPreview preview={previewDto()} />);

    expect(screen.getByText("Preview only — no export or publication occurs.")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Included by default" })).getByText("ev_source_public")).toBeInTheDocument();
    const excluded = screen.getByRole("region", { name: "Excluded by default" });
    expect(within(excluded).getByText("Human approval: include private evidence")).toBeInTheDocument();
    expect(within(excluded).getByText("Human approval: include source-identity evidence")).toBeInTheDocument();
    expect(within(excluded).getByText("Human approval: include credential-risk evidence")).toBeInTheDocument();
    expect(within(excluded).getByText("Human approval: include export-restricted evidence")).toBeInTheDocument();
    expect(within(excluded).getByText("Human review: affirm public-safe eligibility")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /export|publish/i })).not.toBeInTheDocument();
  });

  it("strictly parses a reference-only preview DTO", () => {
    const parsed = governanceExportPreviewDtoFromJson(previewDto());
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(() => governanceExportPreviewDtoFromJson({ ...previewDto(), rawContent: "private body" })).toThrow();
    expect(() => governanceExportPreviewDtoFromJson({
      ...previewDto(),
      excludedEvidence: [{
        ...previewDto().excludedEvidence[0],
        sourceIdentity: "confidential source"
      }]
    })).toThrow();
    const providerErrorDto = {
      ...previewDto(),
      diagnostics: [{
        code: "classification-missing",
        evidenceRef: "ev_source_public",
        repairHint: "record-governance-classification",
        providerError: "Authorization Bearer abc123"
      }]
    };
    expect(captureParserError(() => governanceExportPreviewDtoFromJson(providerErrorDto))).toBe(
      "Governance export preview DTO could not be parsed safely."
    );
    expect(captureParserError(() => governanceExportPreviewDtoFromJson(providerErrorDto))).not.toMatch(
      /Authorization|Bearer|abc123/
    );
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
