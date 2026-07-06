import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLegacyImportRuntime } from "../src/legacy-runtime.js";
import { createFakeMountedWorkspace } from "./runtime-test-helpers.js";
import { writeLegacyCestusFixture } from "./fixtures/legacy-cestus-fixtures.js";

let sourceRoot: string;

beforeEach(() => {
  sourceRoot = mkdtempSync(join(tmpdir(), "legacy-runtime-source-"));
  writeLegacyCestusFixture(sourceRoot);
});

afterEach(() => {
  rmSync(sourceRoot, { recursive: true, force: true });
});

const actor = { id: "actor_legacy_cli", kind: "human" as const, label: "Legacy CLI" };

describe("LegacyImportRuntime review workflow", () => {
  it("inspects, stores a report, and creates no evidence or accepted graph state", async () => {
    const workspace = createFakeMountedWorkspace("Legacy CLI workspace");
    const runtime = createLegacyImportRuntime({ mountedWorkspace: workspace, actor });

    const result = await runtime.inspect({
      sourceCollectionId: "src_old_cestus",
      label: "Old Cestus",
      sourceRoot,
      scanBatchId: "scan_old_cestus_001"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.command).toBe("legacy inspect");
    expect(result.sourceCollectionId).toBe("src_old_cestus");
    expect(result.totals.inspectedFiles).toBe(4);
    expect(result.totals.proposedAssertionCandidates).toBe(1);
    expect(result.nextActions).toContain("review legacy report");

    const events = await workspace.ledger.readAll();
    const eventTypes = events.map((event) => event.type);
    expect(eventTypes).toContain("ingestion.source.registered");
    expect(eventTypes).toContain("legacy.import.report.generated");
    expect(eventTypes).not.toContain("evidence.ingested");
    expect(eventTypes).not.toContain("assertion.proposed");
    expect(eventTypes).not.toContain("assertion.accepted");
    expect(eventTypes).not.toContain("entity.resolved");
    expect(eventTypes).not.toContain("relationship.accepted");
  });

  it("prints report and quarantine review DTOs from stored report artifacts", async () => {
    const workspace = createFakeMountedWorkspace("Legacy CLI workspace");
    const runtime = createLegacyImportRuntime({ mountedWorkspace: workspace, actor });
    const inspected = await runtime.inspect({
      sourceCollectionId: "src_old_cestus",
      label: "Old Cestus",
      sourceRoot,
      scanBatchId: "scan_old_cestus_001"
    });
    expect(inspected.ok).toBe(true);
    if (!inspected.ok) return;

    const report = await runtime.report({
      sourceCollectionId: "src_old_cestus",
      legacyReportId: inspected.legacyReportId
    });
    const quarantine = await runtime.quarantine({
      sourceCollectionId: "src_old_cestus",
      legacyReportId: inspected.legacyReportId
    });

    expect(report.ok).toBe(true);
    expect(quarantine.ok).toBe(true);
    if (!report.ok || !quarantine.ok) return;
    expect(report.legacyReportId).toBe(inspected.legacyReportId);
    expect(quarantine.quarantineEntries.map((entry) => entry.sourcePath)).toContain("ontology/corrupt.json");
  });

  it("preserves the quarantine command in missing-report errors", async () => {
    const workspace = createFakeMountedWorkspace("Legacy CLI workspace");
    const runtime = createLegacyImportRuntime({ mountedWorkspace: workspace, actor });

    const result = await runtime.quarantine({
      sourceCollectionId: "src_old_cestus"
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("LEGACY_IMPORT_REPORT_REQUIRED");
    expect(result.error.command).toBe("legacy quarantine");
  });

  it("preserves the staging-preview command in missing-report errors", async () => {
    const workspace = createFakeMountedWorkspace("Legacy CLI workspace");
    const runtime = createLegacyImportRuntime({ mountedWorkspace: workspace, actor });

    const result = await runtime.stagingPreview({
      sourceCollectionId: "src_old_cestus"
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("LEGACY_IMPORT_REPORT_REQUIRED");
    expect(result.error.command).toBe("legacy staging-preview");
  });

  it("does not register a durable source when inspect cannot read the legacy root", async () => {
    const workspace = createFakeMountedWorkspace("Legacy CLI workspace");
    const runtime = createLegacyImportRuntime({ mountedWorkspace: workspace, actor });

    const result = await runtime.inspect({
      sourceCollectionId: "src_missing_cestus",
      label: "Missing Cestus",
      sourceRoot: join(sourceRoot, "missing"),
      scanBatchId: "scan_missing_cestus_001"
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("LEGACY_IMPORT_SOURCE_REQUIRED");
    expect(result.error.command).toBe("legacy inspect");

    const events = await workspace.ledger.readAll();
    expect(events).toEqual([]);
  });

  it("returns selected-report review fields when reporting an older stored report", async () => {
    const workspace = createFakeMountedWorkspace("Legacy CLI workspace");
    const runtime = createLegacyImportRuntime({ mountedWorkspace: workspace, actor });
    const first = await runtime.inspect({
      sourceCollectionId: "src_old_cestus",
      label: "Old Cestus",
      sourceRoot,
      scanBatchId: "scan_old_cestus_001"
    });
    const second = await runtime.inspect({
      sourceCollectionId: "src_old_cestus",
      label: "Old Cestus",
      sourceRoot,
      scanBatchId: "scan_old_cestus_002"
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.legacyReportId).not.toBe(second.legacyReportId);

    const report = await runtime.report({
      sourceCollectionId: "src_old_cestus",
      legacyReportId: first.legacyReportId
    });

    expect(report.ok).toBe(true);
    if (!report.ok) return;
    expect(report.legacyReportId).toBe(first.legacyReportId);
    expect(report.review.selectedReportId).toBe(first.legacyReportId);
    expect(report.review.latestReportId).toBe(second.legacyReportId);
    expect(report.review.isLatestReport).toBe(false);
  });

  it("fails closed when a stored report artifact does not match the ledger summary", async () => {
    const workspace = createFakeMountedWorkspace("Legacy CLI workspace");
    const runtime = createLegacyImportRuntime({ mountedWorkspace: workspace, actor });
    const inspected = await runtime.inspect({
      sourceCollectionId: "src_old_cestus",
      label: "Old Cestus",
      sourceRoot,
      scanBatchId: "scan_old_cestus_001"
    });
    expect(inspected.ok).toBe(true);
    if (!inspected.ok) return;

    await workspace.ledger.append({
      type: "legacy.import.report.generated",
      version: 1,
      streamId: "legacy_report_src_old_cestus_scan_old_cestus_999_legacy_report_mismatch",
      context: {
        actor,
        occurredAt: new Date().toISOString(),
        correlationId: "corr_legacy_report_mismatch",
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0", ingestion: "0.1.0", legacy: "0.1.0" }
      },
      payload: {
        legacyReportId: "legacy_report_mismatch",
        sourceCollectionId: "src_old_cestus",
        scanBatchId: "scan_old_cestus_999",
        reportHash: inspected.reportHash,
        candidateSetHash: inspected.candidateSetHash,
        generatedAt: "2026-07-06T00:00:00.000Z",
        generator: { name: "legacy-cestus-inspector", version: "0.1.0" },
        totals: inspected.totals
      }
    });

    const report = await runtime.report({
      sourceCollectionId: "src_old_cestus",
      legacyReportId: "legacy_report_mismatch"
    });

    expect(report.ok).toBe(false);
    if (report.ok) return;
    expect(report.error.code).toBe("LEGACY_IMPORT_REPORT_NOT_FOUND");
    expect(report.error.command).toBe("legacy report");
  });
});
