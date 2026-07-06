import { describe, expect, it, vi } from "vitest";
import { handleIngestionCommand, type IngestionCliRuntime } from "../src/cli.js";
import type { MountedWorkspace } from "../src/mount-contract.js";
import type { IngestionReviewDto } from "../src/read-api.js";

describe("ingestion CLI command handlers", () => {
  it("prints stable JSON for dry-run summaries", async () => {
    const dto = cliReviewDto();

    const output = await handleIngestionCommand({ command: "summary-json", dto });

    expect(output).toBe(`${JSON.stringify(dto, null, 2)}\n`);
    expect(JSON.parse(output)).toEqual(dto);
  });

  it("delegates --workspace to the mount resolver before running dry-run", async () => {
    const mountedWorkspace = fakeMountedWorkspaceForCli();
    const dryRunScan = vi.fn(async () => ({
      ok: true,
      scanBatchId: "scan_001",
      inventoryHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      review: cliReviewDto(),
      eventIds: ["evt_scan"]
    }));
    const mountResolver = {
      resolve: vi.fn(async () => ({
        ok: true as const,
        workspace: mountedWorkspace
      }))
    };
    const runtimeFactory = vi.fn(() => fakeRuntimeForCli({ dryRunScan }));

    const output = await handleIngestionCommand({
      command: "dry-run",
      argv: ["--workspace", "/Volumes/Cestus", "--source-id", "src_drive_001", "--scan", "scan_001"],
      mountResolver,
      runtimeFactory
    });

    expect(mountResolver.resolve).toHaveBeenCalledWith({
      workspaceRoot: "/Volumes/Cestus",
      env: expect.any(Object)
    });
    expect(runtimeFactory).toHaveBeenCalledWith({ mountedWorkspace });
    expect(dryRunScan).toHaveBeenCalledWith({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001"
    });
    expect(output.endsWith("\n")).toBe(true);
    expect(JSON.parse(output)).toMatchObject({ ok: true, scanBatchId: "scan_001" });
  });

  it("returns stable JSON when the workspace is not mounted and performs no runtime call", async () => {
    const runtimeFactory = vi.fn();
    const output = await handleIngestionCommand({
      command: "dry-run",
      argv: ["--workspace", "/Volumes/Missing", "--source-id", "src_drive_001", "--scan", "scan_001"],
      mountResolver: {
        resolve: vi.fn(async () => ({
          ok: false as const,
          error: {
            code: "INGESTION_WORKSPACE_NOT_MOUNTED" as const,
            message: "Portable workspace is not mounted.",
            allowedRepairActions: ["mount the workspace"]
          }
        }))
      },
      runtimeFactory
    });

    expect(JSON.parse(output)).toEqual({
      ok: false,
      error: {
        code: "INGESTION_WORKSPACE_NOT_MOUNTED",
        message: "Portable workspace is not mounted.",
        allowedRepairActions: ["mount the workspace"],
        diagnostics: []
      }
    });
    expect(runtimeFactory).not.toHaveBeenCalled();
  });

  it("uses CESTUS_WORKSPACE_ROOT when --workspace is absent", async () => {
    const mountResolver = {
      resolve: vi.fn(async () => ({
        ok: true as const,
        workspace: fakeMountedWorkspaceForCli()
      }))
    };
    const runtimeFactory = vi.fn(() => fakeRuntimeForCli({
      diagnostics: vi.fn(async () => ({ ok: true, diagnostics: [] }))
    }));

    await handleIngestionCommand({
      command: "diagnostics",
      argv: ["--source-id", "src_drive_001"],
      env: { CESTUS_WORKSPACE_ROOT: "/Volumes/EnvCestus" },
      mountResolver,
      runtimeFactory
    });

    expect(mountResolver.resolve).toHaveBeenCalledWith({
      workspaceRoot: "/Volumes/EnvCestus",
      env: { CESTUS_WORKSPACE_ROOT: "/Volumes/EnvCestus" }
    });
  });

  it("returns stable JSON for unsupported commands without resolving a workspace", async () => {
    const mountResolver = { resolve: vi.fn() };
    const runtimeFactory = vi.fn();
    const output = await handleIngestionCommand({
      command: "unknown",
      argv: [],
      mountResolver,
      runtimeFactory
    });

    expect(JSON.parse(output)).toEqual({
      ok: false,
      error: {
        code: "INGESTION_COMMAND_UNSUPPORTED",
        command: "unknown",
        message: "Unsupported ingestion command unknown."
      }
    });
    expect(mountResolver.resolve).not.toHaveBeenCalled();
    expect(runtimeFactory).not.toHaveBeenCalled();
  });

  it("maps operational commands to runtime methods", async () => {
    const calls: string[] = [];
    const runtime = {
      registerSource: vi.fn(async () => ({ ok: true, review: cliReviewDto(), eventIds: ["evt_register"] })),
      dryRunScan: vi.fn(async () => ({
        ok: true,
        scanBatchId: "scan_001",
        inventoryHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
        review: cliReviewDto(),
        eventIds: ["evt_scan"]
      })),
      approveRawImport: vi.fn(async () => ({ ok: true, review: cliReviewDto(), eventIds: ["evt_approve"] })),
      importApproved: vi.fn(async () => ({
        ok: true,
        importBatchId: "imp_001",
        totals: { evidenceCreated: 0, occurrencesLinked: 0, duplicatesReused: 0, skipped: 0 },
        review: cliReviewDto(),
        eventIds: ["evt_import"]
      })),
      listJobs: vi.fn(async () => ({ ok: true, jobs: [] })),
      retryJob: vi.fn(async () => ({
        ok: true,
        job: {
          jobId: "parse_001",
          kind: "local-parse" as const,
          state: "queued" as const,
          retryable: false,
          diagnosticIds: []
        },
        eventIds: []
      })),
      approveProviderParsing: vi.fn(async () => ({ ok: true, review: cliReviewDto(), eventIds: ["evt_provider"] })),
      diagnostics: vi.fn(async () => ({ ok: true, diagnostics: [] }))
    } satisfies IngestionCliRuntime;
    const commandCases = [
      ["register-source", "registerSource", ["--source-id", "src_drive_001", "--source", "/Volumes/Drive", "--label", "Drive"]],
      ["approve-import", "approveRawImport", ["--source-id", "src_drive_001", "--scan", "scan_001", "--import", "imp_001", "--approved-by", "cli_user"]],
      ["import", "importApproved", ["--source-id", "src_drive_001", "--scan", "scan_001", "--import", "imp_001"]],
      ["list-jobs", "listJobs", ["--source-id", "src_drive_001"]],
      ["retry", "retryJob", ["--job", "parse_001"]],
      ["approve-provider", "approveProviderParsing", [
        "--source-id", "src_drive_001",
        "--import", "imp_001",
        "--provider-job", "provider_001",
        "--provider", "mistral-document-ai",
        "--provider-version", "2026-07-06",
        "--approved-by", "cli_user",
        "--media-type", "application/pdf",
        "--max-bytes", "1024"
      ]],
      ["diagnostics", "diagnostics", ["--source-id", "src_drive_001"]]
    ] as const;

    for (const [command, methodName, argv] of commandCases) {
      const mountResolver = {
        resolve: vi.fn(async () => ({
          ok: true as const,
          workspace: fakeMountedWorkspaceForCli()
        }))
      };
      const runtimeFactory = vi.fn(() => runtime);

      await handleIngestionCommand({
        command,
        argv: ["--workspace", "/Volumes/Cestus", ...argv],
        mountResolver,
        runtimeFactory
      });
      calls.push(methodName);
    }

    expect(calls).toEqual([
      "registerSource",
      "approveRawImport",
      "importApproved",
      "listJobs",
      "retryJob",
      "approveProviderParsing",
      "diagnostics"
    ]);
    expect(runtime.registerSource).toHaveBeenCalledWith({
      sourceCollectionId: "src_drive_001",
      label: "Drive",
      rootUri: expect.stringMatching(/^file:\/\//),
      sourceRoot: "/Volumes/Drive"
    });
    expect(runtime.approveRawImport).toHaveBeenCalledWith({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001",
      importBatchId: "imp_001",
      approvedBy: "cli_user"
    });
    expect(runtime.importApproved).toHaveBeenCalledWith({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001",
      importBatchId: "imp_001"
    });
    expect(runtime.listJobs).toHaveBeenCalledWith({ sourceCollectionId: "src_drive_001" });
    expect(runtime.retryJob).toHaveBeenCalledWith({ jobId: "parse_001" });
    expect(runtime.approveProviderParsing).toHaveBeenCalledWith({
      providerJobId: "provider_001",
      sourceCollectionId: "src_drive_001",
      importBatchId: "imp_001",
      provider: { name: "mistral-document-ai", version: "2026-07-06" },
      approvedBy: "cli_user",
      eligibleMediaTypes: ["application/pdf"],
      maxBytesPerFile: 1024
    });
    expect(runtime.diagnostics).toHaveBeenCalledWith({ sourceCollectionId: "src_drive_001" });
  });
});

function fakeMountedWorkspaceForCli(): MountedWorkspace {
  return {
    workspaceId: "ws_cli",
    label: "CLI Workspace",
    ledger: {},
    blobStore: {},
    derivativeStore: {},
    jobStateRoot: "/tmp/cestus-jobs",
    capabilities: {
      canReadLedger: true,
      canAppendLedger: true,
      canWriteBlobs: true,
      canWriteDerivatives: true,
      canWriteJobState: true
    }
  } as unknown as MountedWorkspace;
}

function fakeRuntimeForCli(overrides: Partial<IngestionCliRuntime> = {}): IngestionCliRuntime {
  return {
    registerSource: vi.fn(),
    dryRunScan: vi.fn(),
    approveRawImport: vi.fn(),
    importApproved: vi.fn(),
    listJobs: vi.fn(),
    retryJob: vi.fn(),
    approveProviderParsing: vi.fn(),
    diagnostics: vi.fn(),
    ...overrides
  };
}

function cliReviewDto(): IngestionReviewDto {
  return {
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
}
