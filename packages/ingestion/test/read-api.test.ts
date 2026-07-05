import { describe, expect, it } from "vitest";
import { buildIngestionProjection } from "../src/projection.js";
import { buildIngestionReviewDto } from "../src/read-api.js";
import { goldenIngestionLedgerEvents } from "./fixtures/golden-ingestion-ledger.js";

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
});
