import { describe, expect, it } from "vitest";
import { buildEvidenceGovernanceWorkspaceDto } from "../src/governance-read-model.js";
import { goldenGovernanceLedgerEvents } from "./fixtures/golden-governance-ledger.js";

describe("governance read model", () => {
  it("derives strict review history and a preview for the visible evidence workspace", () => {
    const readModel = buildEvidenceGovernanceWorkspaceDto(
      goldenGovernanceLedgerEvents,
      ["ev_source_public", "ev_source_private", "ev_missing"]
    );

    expect(readModel).toMatchObject({
      schemaVersion: "evidence-governance-workspace.v1",
      reviews: [
        {
          evidenceRef: "ev_missing",
          classificationStatus: "missing",
          proposedTags: [],
          diagnostics: [{
            code: "classification-missing",
            evidenceRef: "ev_missing",
            repairHint: "record-governance-classification"
          }]
        },
        {
          evidenceRef: "ev_source_private",
          classificationStatus: "succeeded"
        },
        {
          evidenceRef: "ev_source_public",
          classificationStatus: "succeeded",
          proposedTags: expect.arrayContaining([
            expect.objectContaining({ tag: "public_record", eventRef: "evt_classify_governance_public" })
          ]),
          humanDecisions: [expect.objectContaining({
            tag: "public_safe",
            action: "add",
            eventRef: "evt_review_governance_public"
          })]
        }
      ],
      exportPreview: {
        schemaVersion: "governance-export-preview.v1",
        mode: "preview-only",
        includedEvidence: [{ evidenceRef: "ev_source_public" }]
      }
    });
    expect(Object.isFrozen(readModel)).toBe(true);
    expect(Object.isFrozen(readModel.reviews)).toBe(true);
  });
});
