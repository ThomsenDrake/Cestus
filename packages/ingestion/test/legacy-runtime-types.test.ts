import { describe, expect, it } from "vitest";
import {
  legacyImportErrorCodes,
  legacyImportNextActions,
  stableLegacyImportError,
  stableLegacyImportSuccess,
  type LegacyImportRuntimeResult
} from "../src/legacy-runtime-types.js";

describe("legacy operator runtime contracts", () => {
  it("exports stable error codes for operator CLI automation", () => {
    expect(legacyImportErrorCodes).toEqual([
      "LEGACY_IMPORT_INVALID_ARGUMENTS",
      "LEGACY_IMPORT_WORKSPACE_NOT_MOUNTED",
      "LEGACY_IMPORT_WORKSPACE_NOT_WRITABLE",
      "LEGACY_IMPORT_SOURCE_REQUIRED",
      "LEGACY_IMPORT_SOURCE_NOT_REGISTERED",
      "LEGACY_IMPORT_REPORT_REQUIRED",
      "LEGACY_IMPORT_REPORT_NOT_FOUND",
      "LEGACY_IMPORT_RAW_IMPORT_APPROVAL_REQUIRED",
      "LEGACY_IMPORT_STAGING_APPROVAL_REQUIRED",
      "LEGACY_IMPORT_EVIDENCE_LINK_REQUIRED",
      "LEGACY_IMPORT_CANDIDATE_SET_MISMATCH",
      "LEGACY_IMPORT_ACCEPTED_EVENT_FORBIDDEN",
      "LEGACY_IMPORT_COMMAND_UNSUPPORTED",
      "LEGACY_IMPORT_RUNTIME_INTERNAL"
    ]);
  });

  it("creates stable secret-safe error envelopes", () => {
    const result = stableLegacyImportError({
      code: "LEGACY_IMPORT_REPORT_REQUIRED",
      command: "legacy staging-preview",
      message: "A migration report is required before ontology staging preview.",
      allowedRepairActions: ["run legacy inspect", "review legacy report"]
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "LEGACY_IMPORT_REPORT_REQUIRED",
        command: "legacy staging-preview",
        message: "A migration report is required before ontology staging preview.",
        allowedRepairActions: ["run legacy inspect", "review legacy report"],
        diagnostics: []
      }
    });
    expect(JSON.stringify(result)).not.toMatch(/token|secret|password/i);
  });

  it("creates stable success envelopes with next actions", () => {
    const result: LegacyImportRuntimeResult<{ legacyReportId: string }> = stableLegacyImportSuccess({
      command: "legacy inspect",
      workspace: { workspaceId: "ws_cli", label: "CLI Workspace" },
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      eventIds: ["evt_report"],
      nextActions: [legacyImportNextActions.reviewReport, legacyImportNextActions.approveRawImport],
      data: { legacyReportId: "legacy_report_001" }
    });

    expect(result).toEqual({
      ok: true,
      command: "legacy inspect",
      workspace: { workspaceId: "ws_cli", label: "CLI Workspace" },
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      legacyReportId: "legacy_report_001",
      eventIds: ["evt_report"],
      nextActions: ["review legacy report", "approve raw import"]
    });
  });
});
