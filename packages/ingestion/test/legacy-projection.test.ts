import { describe, expect, it } from "vitest";
import { validateKnowledgeEvent } from "../../ontology/src/contracts.js";
import { buildLegacyImportProjection } from "../src/legacy-projection.js";
import { goldenLegacyLedgerEvents } from "./fixtures/golden-legacy-ledger.js";

describe("buildLegacyImportProjection", () => {
  it("rebuilds report, staging approval, and diagnostics", () => {
    for (const event of goldenLegacyLedgerEvents) {
      expect(validateKnowledgeEvent(event).success, event.type).toBe(true);
    }

    const projection = buildLegacyImportProjection(goldenLegacyLedgerEvents);

    expect(projection.reports.get("legacy_report_001")?.candidateSetHash).toBe(
      "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    );
    expect(projection.latestReportBySource.get("src_old_cestus")).toBe("legacy_report_001");
    expect(projection.stagingApprovals.get("legacy_stage_001")?.approvedAssertionCandidateIds).toEqual([
      "legacy_candidate_001"
    ]);
    expect(projection.diagnosticsBySourceCollectionId.get("src_old_cestus")).toEqual(["diag_legacy_quarantine"]);
  });
});
