import { describe, expect, it } from "vitest";
import { handleIngestionCommand } from "../src/cli.js";
import type { LegacyMigrationReviewDto } from "../src/legacy-read-api.js";

describe("legacy ingestion CLI handlers", () => {
  it("prints the first artifact ask as stable JSON", async () => {
    const expected = {
      firstArtifactAsk: [
        "Read-only folder tree listing of the old Cestus root",
        "Two to five sanitized metadata or ontology files",
        "Any old manifest, index, registry, or graph export file if present"
      ]
    };

    const output = await handleIngestionCommand({ command: "legacy-artifact-ask-json" });

    expect(output).toBe(`${JSON.stringify(expected, null, 2)}\n`);
    expect(JSON.parse(output)).toEqual(expected);
  });

  it("prints legacy migration report DTOs as stable JSON", async () => {
    const dto: LegacyMigrationReviewDto = {
      sourceCollectionId: "src_old_cestus",
      latestReportId: "legacy_report_001",
      rawImportRequiresApproval: true,
      ontologyStagingApproved: false,
      firstArtifactAsk: [
        "Read-only folder tree listing of the old Cestus root",
        "Two to five sanitized metadata or ontology files",
        "Any old manifest, index, registry, or graph export file if present"
      ],
      diagnostics: []
    };

    const output = await handleIngestionCommand({
      command: "legacy-report-json",
      dto
    });

    expect(output).toBe(`${JSON.stringify(dto, null, 2)}\n`);
    expect(JSON.parse(output)).toEqual(dto);
  });

  it("rejects legacy migration report JSON without a DTO", () => {
    expect(() => handleIngestionCommand({ command: "legacy-report-json" } as any))
      .toThrow("Command legacy-report-json needs a legacy migration review DTO.");
  });
});
