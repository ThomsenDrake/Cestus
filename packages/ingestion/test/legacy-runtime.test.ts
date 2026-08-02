import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLegacyImportRuntime } from "../src/legacy-runtime.js";
import { mountedWorkspaceCapabilities } from "../src/mount-contract.js";
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

describe("LegacyImportRuntime gated import and staging workflow", () => {
  it("approves raw import without copying bytes, then imports through stale-source verification", async () => {
    const workspace = createFakeMountedWorkspace("Legacy CLI workspace");
    const runtime = createLegacyImportRuntime({ mountedWorkspace: workspace, actor });
    await runtime.inspect({
      sourceCollectionId: "src_old_cestus",
      label: "Old Cestus",
      sourceRoot,
      scanBatchId: "scan_old_cestus_001"
    });

    const approved = await runtime.approveRawImport({
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      importBatchId: "imp_old_cestus_001",
      approvedBy: actor.id
    });
    expect(approved.ok).toBe(true);
    expect((await workspace.ledger.readAll()).map((event) => event.type)).not.toContain("evidence.ingested");

    const imported = await runtime.importApproved({
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      importBatchId: "imp_old_cestus_001"
    });

    expect(imported.ok).toBe(true);
    expect((await workspace.ledger.readAll()).map((event) => event.type)).toContain("evidence.ingested");
  });

  it("previews only evidence-tied staging candidates after raw import", async () => {
    const { runtime, inspected } = await preparedImportedRuntime();

    const preview = await runtime.stagingPreview({
      sourceCollectionId: "src_old_cestus",
      legacyReportId: inspected.legacyReportId
    });

    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.candidates).toHaveLength(1);
    expect(preview.candidates[0]).toMatchObject({
      candidateId: expect.stringMatching(/^legacy_candidate_/),
      evidenceId: expect.stringMatching(/^ev_/),
      predicate: "agency.name",
      object: "Example Agency"
    });
  });

  it("requires human staging approval before appending assertion.proposed only", async () => {
    const { workspace, runtime, inspected } = await preparedImportedRuntime();
    const preview = await runtime.stagingPreview({
      sourceCollectionId: "src_old_cestus",
      legacyReportId: inspected.legacyReportId
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;

    const approved = await runtime.approveStaging({
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      legacyReportId: inspected.legacyReportId,
      stagingBatchId: "legacy_stage_001",
      approvedBy: "actor_investigator",
      approvedAssertionCandidateIds: preview.candidates.map((candidate) => candidate.candidateId)
    });
    expect(approved.ok).toBe(true);

    const staged = await runtime.stageApproved({
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      legacyReportId: inspected.legacyReportId,
      stagingBatchId: "legacy_stage_001"
    });

    const eventTypes = (await workspace.ledger.readAll()).map((event) => event.type);
    expect(staged.ok).toBe(true);
    expect(eventTypes).toContain("legacy.ontology.staging.approved");
    expect(eventTypes).toContain("assertion.proposed");
    expect(eventTypes).not.toContain("assertion.accepted");
    expect(eventTypes).not.toContain("entity.resolved");
    expect(eventTypes).not.toContain("relationship.accepted");
  });

  it("does not treat same-hash evidence from another source as eligible staging provenance", async () => {
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
    expect(report.ok).toBe(true);
    if (!report.ok) return;
    const [reportCandidate] = report.report.proposedAssertionCandidates;
    expect(reportCandidate).toBeDefined();
    if (reportCandidate === undefined) return;
    await appendForeignEvidenceLink(workspace, reportCandidate.evidenceContentHash);

    const preview = await runtime.stagingPreview({
      sourceCollectionId: "src_old_cestus",
      legacyReportId: inspected.legacyReportId
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.candidates).toHaveLength(0);
    expect((preview as typeof preview & { proposedAssertionCandidates?: readonly unknown[] }).proposedAssertionCandidates ?? [])
      .toHaveLength(0);

    const approved = await runtime.approveStaging({
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      legacyReportId: inspected.legacyReportId,
      stagingBatchId: "legacy_stage_001",
      approvedBy: "actor_investigator",
      approvedAssertionCandidateIds: [reportCandidate.candidateId]
    });
    expect(approved.ok).toBe(false);
    if (approved.ok) return;
    expect(["LEGACY_IMPORT_CANDIDATE_SET_MISMATCH", "LEGACY_IMPORT_EVIDENCE_LINK_REQUIRED"])
      .toContain(approved.error.code);
  });

  it("does not expose raw report candidates as staging-preview eligible before source import", async () => {
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

    const preview = await runtime.stagingPreview({
      sourceCollectionId: "src_old_cestus",
      legacyReportId: inspected.legacyReportId
    });

    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.candidates).toHaveLength(0);
    expect((preview as typeof preview & { proposedAssertionCandidates?: readonly unknown[] }).proposedAssertionCandidates ?? [])
      .toHaveLength(0);
  });

  it("rejects empty staging approval candidate selections", async () => {
    const { runtime, inspected } = await preparedImportedRuntime();

    const approved = await runtime.approveStaging({
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      legacyReportId: inspected.legacyReportId,
      stagingBatchId: "legacy_stage_001",
      approvedBy: "actor_investigator",
      approvedAssertionCandidateIds: []
    });

    expect(approved.ok).toBe(false);
    if (approved.ok) return;
    expect(approved.error.code).toBe("LEGACY_IMPORT_CANDIDATE_SET_MISMATCH");
  });

  it("rejects duplicate staging approval candidate selections", async () => {
    const { runtime, inspected } = await preparedImportedRuntime();
    const preview = await runtime.stagingPreview({
      sourceCollectionId: "src_old_cestus",
      legacyReportId: inspected.legacyReportId
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    const [candidate] = preview.candidates;
    expect(candidate).toBeDefined();
    if (candidate === undefined) return;

    const approved = await runtime.approveStaging({
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      legacyReportId: inspected.legacyReportId,
      stagingBatchId: "legacy_stage_001",
      approvedBy: "actor_investigator",
      approvedAssertionCandidateIds: [candidate.candidateId, candidate.candidateId]
    });

    expect(approved.ok).toBe(false);
    if (approved.ok) return;
    expect(approved.error.code).toBe("LEGACY_IMPORT_CANDIDATE_SET_MISMATCH");
  });

  it("fails closed when staged approval ids are absent from current eligible candidates", async () => {
    const { workspace, runtime, inspected } = await preparedImportedRuntime();
    await appendUnknownCandidateStagingApproval(workspace, {
      legacyReportId: inspected.legacyReportId,
      reportHash: inspected.reportHash,
      candidateSetHash: inspected.candidateSetHash
    });

    const staged = await runtime.stageApproved({
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      legacyReportId: inspected.legacyReportId,
      stagingBatchId: "legacy_stage_001"
    });

    expect(staged.ok).toBe(false);
    if (staged.ok) return;
    expect(["LEGACY_IMPORT_CANDIDATE_SET_MISMATCH", "LEGACY_IMPORT_EVIDENCE_LINK_REQUIRED"])
      .toContain(staged.error.code);
    expect((await workspace.ledger.readAll()).map((event) => event.type)).not.toContain("assertion.proposed");
  });

  it("allows append-only legacy approval gates without job-state write capability", async () => {
    const { workspace, inspected } = await preparedImportedRuntime();
    const appendOnlyRuntime = createLegacyImportRuntime({
      mountedWorkspace: {
        ...workspace,
        capabilities: mountedWorkspaceCapabilities({
          ...workspace.capabilities,
          canWriteJobState: false
        })
      },
      actor
    });
    const preview = await appendOnlyRuntime.stagingPreview({
      sourceCollectionId: "src_old_cestus",
      legacyReportId: inspected.legacyReportId
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;

    const approved = await appendOnlyRuntime.approveStaging({
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      legacyReportId: inspected.legacyReportId,
      stagingBatchId: "legacy_stage_001",
      approvedBy: "actor_investigator",
      approvedAssertionCandidateIds: preview.candidates.map((candidate) => candidate.candidateId)
    });

    expect(approved.ok).toBe(true);
  });
});

async function preparedImportedRuntime() {
  const workspace = createFakeMountedWorkspace("Legacy CLI workspace");
  const runtime = createLegacyImportRuntime({ mountedWorkspace: workspace, actor });
  const inspected = await runtime.inspect({
    sourceCollectionId: "src_old_cestus",
    label: "Old Cestus",
    sourceRoot,
    scanBatchId: "scan_old_cestus_001"
  });
  expect(inspected.ok).toBe(true);
  if (!inspected.ok) throw new Error("inspect failed");
  await runtime.approveRawImport({
    sourceCollectionId: "src_old_cestus",
    scanBatchId: "scan_old_cestus_001",
    importBatchId: "imp_old_cestus_001",
    approvedBy: actor.id
  });
  await runtime.importApproved({
    sourceCollectionId: "src_old_cestus",
    scanBatchId: "scan_old_cestus_001",
    importBatchId: "imp_old_cestus_001"
  });
  return { workspace, runtime, inspected };
}

async function appendForeignEvidenceLink(
  workspace: ReturnType<typeof createFakeMountedWorkspace>,
  contentHash: `sha256:${string}`
) {
  await workspace.ledger.append({
    type: "ingestion.evidence.linked",
    version: 1,
    streamId: "ingestion_evidence_ev_other_source_same_hash",
    context: {
      actor,
      occurredAt: new Date().toISOString(),
      correlationId: "corr_imp_other_cestus_001",
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", ingestion: "0.1.0" }
    },
    payload: {
      evidenceId: "ev_other_source_same_hash",
      importBatchId: "imp_other_cestus_001",
      sourceCollectionId: "src_other_cestus",
      contentHash,
      occurrenceIds: ["occ_other_cestus_001"]
    }
  });
}

async function appendUnknownCandidateStagingApproval(
  workspace: ReturnType<typeof createFakeMountedWorkspace>,
  input: {
    legacyReportId: string;
    reportHash: `sha256:${string}`;
    candidateSetHash: `sha256:${string}`;
  }
) {
  await workspace.ledger.append({
    type: "legacy.ontology.staging.approved",
    version: 1,
    streamId: "legacy_staging_src_old_cestus_scan_old_cestus_001_legacy_stage_001",
    context: {
      actor,
      occurredAt: new Date().toISOString(),
      correlationId: "corr_legacy_stage_001",
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", ingestion: "0.1.0", legacy: "0.1.0" }
    },
    payload: {
      stagingBatchId: "legacy_stage_001",
      legacyReportId: input.legacyReportId,
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      reportHash: input.reportHash,
      candidateSetHash: input.candidateSetHash,
      approvedBy: "actor_investigator",
      approvedAt: new Date().toISOString(),
      approvedAssertionCandidateIds: ["legacy_candidate_unknown"]
    }
  });
}
