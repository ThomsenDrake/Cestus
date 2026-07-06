import { describe, expect, it, vi } from "vitest";
import { firstLegacyArtifactAsk } from "../src/legacy-types.js";
import { formatIngestionCliUsage, handleIngestionCommand, normalizeIngestionCliArgs } from "../src/cli.js";
import type { LegacyImportRuntime } from "../src/legacy-runtime.js";

describe("legacy operator CLI workflow", () => {
  it("normalizes nested cestus ingest legacy commands", () => {
    expect(normalizeIngestionCliArgs(["ingest", "legacy", "inspect", "--workspace", "/w"])).toEqual({
      kind: "command",
      command: "legacy inspect",
      argv: ["--workspace", "/w"]
    });
  });

  it("normalizes direct cestus-ingest legacy commands", () => {
    expect(normalizeIngestionCliArgs(["legacy", "report", "--workspace", "/w"])).toEqual({
      kind: "command",
      command: "legacy report",
      argv: ["--workspace", "/w"]
    });
  });

  it("normalizes help for nested ingest commands", () => {
    expect(normalizeIngestionCliArgs(["ingest", "--help"])).toEqual({ kind: "help" });
    expect(normalizeIngestionCliArgs(["--help"])).toEqual({ kind: "help" });
  });

  it("prints legacy workflow help examples", () => {
    expect(formatIngestionCliUsage("cestus-ingest")).toContain(
      "cestus ingest legacy inspect --workspace <root> --source <old-root>"
    );
  });

  it("prints legacy artifact ask without resolving workspace or constructing runtime", async () => {
    const mountResolver = { resolve: vi.fn() };
    const legacyRuntimeFactory = vi.fn(() => fakeLegacyRuntime());

    const output = await handleIngestionCommand({
      command: "legacy artifact-ask",
      argv: [],
      mountResolver,
      legacyRuntimeFactory
    });

    expect(JSON.parse(output)).toEqual({
      ok: true,
      command: "legacy artifact-ask",
      firstArtifactAsk: firstLegacyArtifactAsk
    });
    expect(mountResolver.resolve).not.toHaveBeenCalled();
    expect(legacyRuntimeFactory).not.toHaveBeenCalled();
  });

  it("delegates legacy inspect through mount resolver and runtime factory", async () => {
    const inspect = vi.fn(async () => ({
      ok: true,
      command: "legacy inspect",
      workspace: { workspaceId: "ws_cli", label: "CLI" },
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      legacyReportId: "legacy_report_001",
      eventIds: ["evt_report"],
      nextActions: ["review legacy report"]
    }));
    const output = await handleIngestionCommand({
      command: "legacy inspect",
      argv: [
        "--workspace", "/Volumes/Cestus",
        "--source", "/Volumes/OldCestus",
        "--source-id", "src_old_cestus",
        "--scan", "scan_old_cestus_001",
        "--label", "Old Cestus"
      ],
      mountResolver: fakeMountResolver(),
      legacyRuntimeFactory: () => fakeLegacyRuntime({ inspect })
    });

    expect(inspect).toHaveBeenCalledWith({
      sourceCollectionId: "src_old_cestus",
      label: "Old Cestus",
      sourceRoot: "/Volumes/OldCestus",
      scanBatchId: "scan_old_cestus_001"
    });
    expect(JSON.parse(output)).toMatchObject({
      ok: true,
      command: "legacy inspect",
      legacyReportId: "legacy_report_001"
    });
  });

  it("maps all legacy runtime commands", async () => {
    const runtime = fakeLegacyRuntime({
      report: vi.fn(async () => legacyOk("legacy report")),
      quarantine: vi.fn(async () => legacyOk("legacy quarantine")),
      approveRawImport: vi.fn(async () => legacyOk("legacy approve-import")),
      importApproved: vi.fn(async () => legacyOk("legacy import")),
      stagingPreview: vi.fn(async () => legacyOk("legacy staging-preview")),
      stageApproved: vi.fn(async () => legacyOk("legacy stage"))
    });
    const cases = [
      ["legacy report", "report", ["--source-id", "src_old_cestus", "--report", "legacy_report_001"]],
      ["legacy quarantine", "quarantine", ["--source-id", "src_old_cestus", "--report", "legacy_report_001"]],
      ["legacy approve-import", "approveRawImport", [
        "--source-id", "src_old_cestus",
        "--scan", "scan_old_cestus_001",
        "--import", "imp_old_cestus_001",
        "--approved-by", "operator_001"
      ]],
      ["legacy import", "importApproved", [
        "--source-id", "src_old_cestus",
        "--scan", "scan_old_cestus_001",
        "--import", "imp_old_cestus_001"
      ]],
      ["legacy staging-preview", "stagingPreview", ["--source-id", "src_old_cestus", "--report", "legacy_report_001"]],
      ["legacy stage", "stageApproved", [
        "--source-id", "src_old_cestus",
        "--scan", "scan_old_cestus_001",
        "--report", "legacy_report_001",
        "--staging", "legacy_stage_001"
      ]]
    ] as const;

    for (const [command, methodName, argv] of cases) {
      await handleIngestionCommand({
        command,
        argv: ["--workspace", "/Volumes/Cestus", ...argv],
        mountResolver: fakeMountResolver(),
        legacyRuntimeFactory: () => runtime
      });
      expect(runtime[methodName]).toHaveBeenCalledTimes(1);
    }

    expect(runtime.report).toHaveBeenCalledWith({
      sourceCollectionId: "src_old_cestus",
      legacyReportId: "legacy_report_001"
    });
    expect(runtime.quarantine).toHaveBeenCalledWith({
      sourceCollectionId: "src_old_cestus",
      legacyReportId: "legacy_report_001"
    });
    expect(runtime.approveRawImport).toHaveBeenCalledWith({
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      importBatchId: "imp_old_cestus_001",
      approvedBy: "operator_001"
    });
    expect(runtime.importApproved).toHaveBeenCalledWith({
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      importBatchId: "imp_old_cestus_001"
    });
    expect(runtime.stagingPreview).toHaveBeenCalledWith({
      sourceCollectionId: "src_old_cestus",
      legacyReportId: "legacy_report_001"
    });
    expect(runtime.stageApproved).toHaveBeenCalledWith({
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      legacyReportId: "legacy_report_001",
      stagingBatchId: "legacy_stage_001"
    });
  });

  it("passes repeatable staging approval candidates", async () => {
    const approveStaging = vi.fn(async () => legacyOk("legacy approve-staging"));
    const output = await handleIngestionCommand({
      command: "legacy approve-staging",
      argv: [
        "--workspace", "/Volumes/Cestus",
        "--source-id", "src_old_cestus",
        "--scan", "scan_old_cestus_001",
        "--report", "legacy_report_001",
        "--staging", "legacy_stage_001",
        "--approved-by", "operator_001",
        "--candidate", "legacy_candidate_001",
        "--candidate", "legacy_candidate_002"
      ],
      mountResolver: fakeMountResolver(),
      legacyRuntimeFactory: () => fakeLegacyRuntime({ approveStaging })
    });

    expect(approveStaging).toHaveBeenCalledWith({
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      legacyReportId: "legacy_report_001",
      stagingBatchId: "legacy_stage_001",
      approvedBy: "operator_001",
      approvedAssertionCandidateIds: ["legacy_candidate_001", "legacy_candidate_002"]
    });
    expect(JSON.parse(output)).toMatchObject({ ok: true, command: "legacy approve-staging" });
  });

  it("rejects missing staging approval candidates before resolving workspace", async () => {
    const mountResolver = { resolve: vi.fn() };
    const output = await handleIngestionCommand({
      command: "legacy approve-staging",
      argv: [
        "--workspace", "/Volumes/Cestus",
        "--source-id", "src_old_cestus",
        "--scan", "scan_old_cestus_001",
        "--report", "legacy_report_001",
        "--staging", "legacy_stage_001",
        "--approved-by", "operator_001"
      ],
      mountResolver,
      legacyRuntimeFactory: () => fakeLegacyRuntime()
    });

    expect(JSON.parse(output)).toMatchObject({
      ok: false,
      error: {
        code: "LEGACY_IMPORT_INVALID_ARGUMENTS",
        command: "legacy approve-staging",
        message: "Missing required ingestion CLI option --candidate."
      }
    });
    expect(mountResolver.resolve).not.toHaveBeenCalled();
  });

  it("rejects missing legacy command options before resolving workspace", async () => {
    const mountResolver = { resolve: vi.fn() };
    const output = await handleIngestionCommand({
      command: "legacy inspect",
      argv: ["--workspace", "/Volumes/Cestus"],
      mountResolver,
      legacyRuntimeFactory: () => fakeLegacyRuntime()
    });

    expect(JSON.parse(output)).toMatchObject({
      ok: false,
      error: {
        code: "LEGACY_IMPORT_INVALID_ARGUMENTS",
        command: "legacy inspect",
        message: "Missing required ingestion CLI option --source."
      }
    });
    expect(mountResolver.resolve).not.toHaveBeenCalled();
  });

  it("rejects malformed legacy option values before resolving workspace", async () => {
    const mountResolver = { resolve: vi.fn() };
    const output = await handleIngestionCommand({
      command: "legacy stage",
      argv: ["--workspace", "--source-id", "src_old_cestus"],
      mountResolver,
      legacyRuntimeFactory: () => fakeLegacyRuntime()
    });

    expect(JSON.parse(output)).toMatchObject({
      ok: false,
      error: {
        code: "LEGACY_IMPORT_INVALID_ARGUMENTS",
        command: "legacy stage",
        message: "Missing value for ingestion CLI option --workspace."
      }
    });
    expect(mountResolver.resolve).not.toHaveBeenCalled();
  });
});

function fakeMountResolver() {
  return {
    resolve: vi.fn(async () => ({
      ok: true as const,
      workspace: {
        workspaceId: "ws_cli",
        label: "CLI",
        ledger: {},
        blobStore: {},
        derivativeStore: {},
        jobStateRoot: "/tmp/jobs",
        capabilities: {
          canReadLedger: true,
          canAppendLedger: true,
          canWriteBlobs: true,
          canWriteDerivatives: true,
          canWriteJobState: true
        }
      } as any
    }))
  };
}

function fakeLegacyRuntime(overrides: Partial<Record<keyof LegacyImportRuntime, any>> = {}): LegacyImportRuntime {
  return {
    inspect: vi.fn(),
    report: vi.fn(),
    quarantine: vi.fn(),
    approveRawImport: vi.fn(),
    importApproved: vi.fn(),
    stagingPreview: vi.fn(),
    approveStaging: vi.fn(),
    stageApproved: vi.fn(),
    ...overrides
  };
}

function legacyOk(command: string) {
  return {
    ok: true,
    command,
    workspace: { workspaceId: "ws_cli", label: "CLI" },
    sourceCollectionId: "src_old_cestus",
    scanBatchId: "scan_old_cestus_001",
    eventIds: [],
    nextActions: []
  };
}
