import { describe, expect, it } from "vitest";
import { buildLegacyImportProjection } from "../src/legacy-projection.js";
import { buildLegacyMigrationReviewDto } from "../src/legacy-read-api.js";
import { goldenLegacyLedgerEvents } from "./fixtures/golden-legacy-ledger.js";

describe("legacy read API", () => {
  it("builds stable review DTOs with the first artifact ask", () => {
    const dto = buildLegacyMigrationReviewDto(buildLegacyImportProjection(goldenLegacyLedgerEvents), "src_old_cestus");

    expect(dto).toMatchObject({
      sourceCollectionId: "src_old_cestus",
      latestReportId: "legacy_report_001",
      rawImportRequiresApproval: true,
      ontologyStagingApproved: true
    });
    expect(dto.firstArtifactAsk).toEqual([
      "Read-only folder tree listing of the old Cestus root",
      "Two to five sanitized metadata or ontology files",
      "Any old manifest, index, registry, or graph export file if present"
    ]);
  });
});
