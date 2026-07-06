import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createIngestionRuntime } from "../src/runtime.js";
import { createFakeMountedWorkspace } from "./runtime-test-helpers.js";

const actor = { id: "actor_jobs_provider", kind: "human" as const, label: "Jobs Provider" };
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("IngestionRuntime jobs, retry, provider approval, and diagnostics", () => {
  it("lists scan, import, and parse jobs from rebuildable projection state", async () => {
    const { runtime, workspace } = await preparedRuntime();

    await runtime.approveRawImport({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001",
      importBatchId: "imp_001",
      approvedBy: "actor_investigator"
    });
    await runtime.importApproved({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001",
      importBatchId: "imp_001"
    });
    await appendLocalParseJob(workspace);

    const jobs = await runtime.listJobs({ sourceCollectionId: "src_drive_001" });

    expect(jobs).toMatchObject({
      ok: true,
      jobs: expect.arrayContaining([
        expect.objectContaining({
          kind: "scan",
          jobId: "scan_001",
          state: "succeeded",
          sourceCollectionId: "src_drive_001",
          scanBatchId: "scan_001",
          retryable: false,
          diagnosticIds: []
        }),
        expect.objectContaining({
          kind: "import",
          jobId: "imp_001",
          state: "succeeded",
          sourceCollectionId: "src_drive_001",
          scanBatchId: "scan_001",
          importBatchId: "imp_001",
          retryable: false,
          diagnosticIds: []
        }),
        expect.objectContaining({
          kind: "local-parse",
          jobId: "parse_001",
          state: "queued",
          sourceCollectionId: "src_drive_001",
          importBatchId: "imp_001",
          evidenceId: expect.stringMatching(/^ev_ing_/),
          retryable: false,
          diagnosticIds: []
        })
      ])
    });
  });

  it("provider approval records approval only and does not call provider parse", async () => {
    const { runtime, providerParse } = await preparedImportedRuntime();

    const approved = await runtime.approveProviderParsing({
      providerJobId: "provider_001",
      sourceCollectionId: "src_drive_001",
      importBatchId: "imp_001",
      provider: { name: "mistral-document-ai", version: "0.1.0" },
      approvedBy: "actor_investigator",
      eligibleMediaTypes: ["application/pdf"],
      maxBytesPerFile: 50000000
    });

    expect(approved).toMatchObject({
      ok: true,
      review: { sourceCollectionId: "src_drive_001" },
      eventIds: [expect.stringMatching(/^evt_/)]
    });
    expect(providerParse).not.toHaveBeenCalled();
  });

  it("rejects provider approval before the target import completes", async () => {
    const { runtime, workspace, providerParse } = await preparedRuntime();

    const rejected = await runtime.approveProviderParsing({
      providerJobId: "provider_001",
      sourceCollectionId: "src_drive_001",
      importBatchId: "imp_001",
      provider: { name: "mistral-document-ai", version: "0.1.0" },
      approvedBy: "actor_investigator",
      eligibleMediaTypes: ["application/pdf"],
      maxBytesPerFile: 50000000
    });

    expect(rejected).toMatchObject({
      ok: false,
      error: { code: "INGESTION_IMPORT_APPROVAL_REQUIRED" }
    });
    expect(providerParse).not.toHaveBeenCalled();
    expect((await workspace.ledger.readAll()).some((event) => event.type === "ingestion.provider.approved")).toBe(false);
  });

  it("rejects missing and terminal non-retryable jobs with a stable runtime error", async () => {
    const { runtime, workspace } = await preparedRuntime();

    const missing = await runtime.retryJob({ jobId: "missing_job" });
    await appendTerminalParseFailure(workspace);
    const terminal = await runtime.retryJob({ jobId: "parse_terminal" });

    expect(missing).toMatchObject({
      ok: false,
      error: { code: "INGESTION_JOB_NOT_RETRYABLE" }
    });
    expect(terminal).toMatchObject({
      ok: false,
      error: { code: "INGESTION_JOB_NOT_RETRYABLE" }
    });
  });

  it("does not advertise retryability until retry execution exists", async () => {
    const { runtime, workspace } = await preparedRuntime();
    await appendRetryableParseFailure(workspace);

    const jobs = await runtime.listJobs({ sourceCollectionId: "src_drive_001" });
    const retry = await runtime.retryJob({ jobId: "parse_retryable" });

    expect(jobs).toMatchObject({
      ok: true,
      jobs: expect.arrayContaining([
        expect.objectContaining({
          kind: "local-parse",
          jobId: "parse_retryable",
          state: "failed",
          retryable: false
        })
      ])
    });
    expect(retry).toMatchObject({
      ok: false,
      error: { code: "INGESTION_JOB_NOT_RETRYABLE" }
    });
  });

  it("returns diagnostics from projection in stable DTO form", async () => {
    const { runtime, workspace } = await preparedRuntime();
    await appendRuntimeDiagnostic(workspace);

    const diagnostics = await runtime.diagnostics({ sourceCollectionId: "src_drive_001" });

    expect(diagnostics).toEqual({
      ok: true,
      diagnostics: [{
        diagnosticId: "diag_runtime_jobs_warning",
        severity: "warning",
        category: "ingestion",
        message: "Runtime jobs warning."
      }]
    });
  });
});

async function preparedRuntime() {
  const workspace = createFakeMountedWorkspace();
  roots.push(workspace.rootDir);
  const sourceRoot = join(workspace.rootDir, "source");
  mkdirSync(sourceRoot, { recursive: true });
  writeFileSync(join(sourceRoot, "a.txt"), "alpha");
  const providerParse = vi.fn();
  const runtime = createIngestionRuntime({
    mountedWorkspace: workspace,
    actor,
    providerRegistry: {
      "mistral-document-ai": { parse: providerParse }
    }
  });
  await runtime.registerSource({
    sourceCollectionId: "src_drive_001",
    label: "Old archive",
    rootUri: `file://${sourceRoot}`,
    sourceRoot
  });
  await runtime.dryRunScan({ sourceCollectionId: "src_drive_001", scanBatchId: "scan_001" });
  return { workspace, runtime, providerParse };
}

async function preparedImportedRuntime() {
  const prepared = await preparedRuntime();
  await prepared.runtime.approveRawImport({
    sourceCollectionId: "src_drive_001",
    scanBatchId: "scan_001",
    importBatchId: "imp_001",
    approvedBy: "actor_investigator"
  });
  await prepared.runtime.importApproved({
    sourceCollectionId: "src_drive_001",
    scanBatchId: "scan_001",
    importBatchId: "imp_001"
  });
  return prepared;
}

async function appendLocalParseJob(workspace: ReturnType<typeof createFakeMountedWorkspace>): Promise<void> {
  const evidenceLink = (await workspace.ledger.readAll()).find((event) => event.type === "ingestion.evidence.linked");
  if (evidenceLink?.type !== "ingestion.evidence.linked") {
    throw new Error("Expected imported evidence before appending parse job");
  }

  await workspace.ledger.append({
    type: "ingestion.parse.job.created",
    version: 1,
    streamId: "ingestion_parse_parse_001",
    context: {
      actor,
      occurredAt: "2026-07-06T16:15:00.000Z",
      causationId: evidenceLink.id,
      correlationId: "corr_parse_001",
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", ingestion: "0.1.0" }
    },
    payload: {
      parseJobId: "parse_001",
      sourceCollectionId: "src_drive_001",
      importBatchId: "imp_001",
      evidenceId: evidenceLink.payload.evidenceId,
      lane: "local",
      parser: { name: "local-text", version: "0.1.0" },
      state: "queued"
    }
  });
}

async function appendTerminalParseFailure(workspace: ReturnType<typeof createFakeMountedWorkspace>): Promise<void> {
  await workspace.ledger.append({
    type: "ingestion.parse.failed",
    version: 1,
    streamId: "ingestion_parse_parse_terminal",
    context: {
      actor,
      occurredAt: "2026-07-06T16:16:00.000Z",
      correlationId: "corr_parse_terminal",
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", ingestion: "0.1.0" }
    },
    payload: {
      parseJobId: "parse_terminal",
      sourceCollectionId: "src_drive_001",
      importBatchId: "imp_001",
      evidenceId: "ev_ing_terminal",
      lane: "local",
      parser: { name: "local-text", version: "0.1.0" },
      failedAt: "2026-07-06T16:16:00.000Z",
      message: "terminal parser failure",
      retryable: false
    }
  });
}

async function appendRetryableParseFailure(workspace: ReturnType<typeof createFakeMountedWorkspace>): Promise<void> {
  await workspace.ledger.append({
    type: "ingestion.parse.failed",
    version: 1,
    streamId: "ingestion_parse_parse_retryable",
    context: {
      actor,
      occurredAt: "2026-07-06T16:16:30.000Z",
      correlationId: "corr_parse_retryable",
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", ingestion: "0.1.0" }
    },
    payload: {
      parseJobId: "parse_retryable",
      sourceCollectionId: "src_drive_001",
      importBatchId: "imp_001",
      evidenceId: "ev_ing_retryable",
      lane: "local",
      parser: { name: "local-text", version: "0.1.0" },
      failedAt: "2026-07-06T16:16:30.000Z",
      message: "retryable parser failure",
      retryable: true
    }
  });
}

async function appendRuntimeDiagnostic(workspace: ReturnType<typeof createFakeMountedWorkspace>): Promise<void> {
  await workspace.ledger.append({
    type: "diagnostic.recorded",
    version: 1,
    streamId: "ingestion_scan_scan_001",
    context: {
      actor,
      occurredAt: "2026-07-06T16:17:00.000Z",
      correlationId: "corr_runtime_jobs_warning",
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", ingestion: "0.1.0" }
    },
    payload: {
      diagnosticId: "diag_runtime_jobs_warning",
      severity: "warning",
      category: "ingestion",
      message: "Runtime jobs warning.",
      repairHint: {
        contract: "IngestionRuntime.listJobs",
        violatedPath: "jobState",
        allowedActions: ["inspect ingestion jobs", "rerun projection"]
      }
    }
  });
}
