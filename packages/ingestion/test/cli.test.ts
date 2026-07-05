import { describe, expect, it } from "vitest";
import { handleIngestionCommand } from "../src/cli.js";
import type { IngestionReviewDto } from "../src/read-api.js";

describe("ingestion CLI command handlers", () => {
  it("prints stable JSON for dry-run summaries", async () => {
    const dto: IngestionReviewDto = {
      sourceCollectionId: "src_drive_001",
      label: "External drive",
      latestScanBatchId: "scan_001",
      totals: {
        observedFiles: 1,
        uniqueContent: 1,
        duplicateOccurrences: 0,
        skipped: 0,
        bytes: 4,
        estimatedNewBlobBytes: 4
      },
      approvalRequired: true,
      duplicateGroups: [],
      evidenceLinks: [],
      parseJobs: [],
      diagnostics: []
    };

    const output = await handleIngestionCommand({ command: "summary-json", dto });

    expect(output).toBe(`${JSON.stringify(dto, null, 2)}\n`);
    expect(JSON.parse(output)).toEqual(dto);
  });

  it("returns a structured runtime-wiring error for operational commands", async () => {
    const output = await handleIngestionCommand({ command: "dry-run" });

    expect(JSON.parse(output)).toEqual({
      ok: false,
      error: {
        code: "INGESTION_RUNTIME_WIRING_REQUIRED",
        command: "dry-run",
        message: "Command dry-run needs a runtime wiring object; pure CLI handlers do not use hidden globals."
      }
    });
  });
});
