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
});
