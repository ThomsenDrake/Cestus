import { describe, expect, it } from "vitest";
import { buildIngestionProjection } from "../src/projection.js";
import { buildIngestionReviewDto } from "../src/read-api.js";
import { diagnosticRecordedEvent, goldenIngestionLedgerEvents } from "./fixtures/golden-ingestion-ledger.js";

describe("ingestion read API", () => {
  it("builds a dry-run review DTO for CLI and UI use", () => {
    const dto = buildIngestionReviewDto(buildIngestionProjection(goldenIngestionLedgerEvents), "src_drive_001");

    expect(dto).toMatchObject({
      sourceCollectionId: "src_drive_001",
      latestScanBatchId: "scan_001",
      totals: {
        observedFiles: 2,
        uniqueContent: 1,
        duplicateOccurrences: 1,
        skipped: 0,
        bytes: 8,
        estimatedNewBlobBytes: 4
      },
      approvalRequired: false,
      duplicateGroups: [{ contentHash: expect.stringMatching(/^sha256:/), occurrenceCount: 2 }]
    });
  });

  it("includes diagnostics from non-scan ingestion streams in the source review DTO", () => {
    const dto = buildIngestionReviewDto(
      buildIngestionProjection([
        ...goldenIngestionLedgerEvents,
        diagnosticRecordedEvent(
          "evt_diag_import_warning",
          "ingestion_import_src_drive_001_scan_001_imp_001",
          "diag_import_warning",
          "import stream warning"
        ),
        diagnosticRecordedEvent(
          "evt_diag_evidence_link_warning",
          "ingestion_evidence_link_src_drive_001_scan_001_imp_001_1111111111111111111111111111111111111111111111111111111111111111",
          "diag_evidence_link_warning",
          "evidence link stream warning"
        ),
        diagnosticRecordedEvent(
          "evt_diag_parse_warning",
          "ingestion_parse_parse_001",
          "diag_parse_warning",
          "parse stream warning"
        )
      ]),
      "src_drive_001"
    );

    expect(dto.diagnostics.map((diagnostic) => diagnostic.diagnosticId)).toEqual([
      "diag_evidence_link_warning",
      "diag_import_warning",
      "diag_parse_warning"
    ]);
  });
});
