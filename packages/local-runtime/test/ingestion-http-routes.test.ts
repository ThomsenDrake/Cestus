import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import type { MountedWorkspace } from "../../ingestion/src/mount-contract.js";
import { resolveLocalRuntimeConfig } from "../src/config.js";
import {
  createLocalRuntimeHttpHandler,
  type CreateLocalRuntimeHttpHandlerInput,
  type LocalRuntimeHttpHandler
} from "../src/http-handler.js";

const actor = {
  id: "actor_http_ingestion",
  kind: "human",
  label: "HTTP Ingestion"
} as const;
const tempDirs: string[] = [];
const handlers: LocalRuntimeHttpHandler[] = [];

afterEach(() => {
  for (const handler of handlers.splice(0)) {
    handler.close();
  }

  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("local runtime ingestion HTTP routes", () => {
  it.each([
    "workspace",
    "workspaceRoot",
    "workspacePath",
    "storagePath",
    "sqlitePath",
    "blobRoot"
  ])("rejects request bodies with forbidden storage path field %s", async (field) => {
    const runtimeFactory = vi.fn();
    const resolver = mountedResolver();
    const handler = testHandler({
      ingestionMountResolver: resolver,
      ingestionRuntimeFactory: runtimeFactory
    });

    const response = await handler({
      method: "POST",
      url: "/api/ingestion/scans/dry-run",
      body: JSON.stringify({
        sourceCollectionId: "src_drive_001",
        scanBatchId: "scan_001",
        nested: [{ [field]: "/tmp/forbidden" }]
      })
    });

    expect(response.status).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({
      ok: false,
      error: { code: "INGESTION_HTTP_STORAGE_PATH_FORBIDDEN" }
    });
    expect(runtimeFactory).not.toHaveBeenCalled();
  });

  it("calls the runtime for dry-run without encoding workflow semantics in HTTP", async () => {
    const dryRunScan = vi.fn(async () => ({
      ok: true as const,
      scanBatchId: "scan_001",
      inventoryHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      review: reviewDto(),
      eventIds: ["evt_scan"]
    }));
    const runtimeFactory = vi.fn(() => ({ dryRunScan }));
    const handler = testHandler({
      ingestionMountResolver: mountedResolver(),
      ingestionRuntimeFactory: runtimeFactory
    });

    const response = await handler({
      method: "POST",
      url: "/api/ingestion/scans/dry-run",
      body: JSON.stringify({ sourceCollectionId: "src_drive_001", scanBatchId: "scan_001" })
    });

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ ok: true, scanBatchId: "scan_001" });
    expect(dryRunScan).toHaveBeenCalledWith({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001"
    });
    expect(runtimeFactory).toHaveBeenCalledWith({
      mountedWorkspace: expect.objectContaining({ workspaceId: "ws_http_001" }),
      actor
    });
  });

  it("provider approval route records approval only and does not parse provider bytes", async () => {
    const approveProviderParsing = vi.fn(async () => ({
      ok: true as const,
      review: reviewDto(),
      eventIds: ["evt_provider_approval"]
    }));
    const providerParse = vi.fn();
    const runtimeFactory = vi.fn(() => ({ approveProviderParsing, providerParse }));
    const handler = testHandler({
      ingestionMountResolver: mountedResolver(),
      ingestionRuntimeFactory: runtimeFactory
    });

    const body = {
      providerJobId: "provider_001",
      sourceCollectionId: "src_drive_001",
      importBatchId: "imp_001",
      provider: { name: "mistral-document-ai", version: "0.1.0" },
      approvedBy: "actor_investigator",
      eligibleMediaTypes: ["application/pdf"],
      maxBytesPerFile: 50000000
    };
    const response = await handler({
      method: "POST",
      url: "/api/ingestion/provider-parsing/approve",
      body: JSON.stringify(body)
    });

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body).eventIds).toEqual(["evt_provider_approval"]);
    expect(approveProviderParsing).toHaveBeenCalledWith(body);
    expect(approveProviderParsing).toHaveBeenCalledTimes(1);
    expect(providerParse).not.toHaveBeenCalled();
  });

  it("returns stable JSON diagnostics when the workspace is not mounted", async () => {
    const runtimeFactory = vi.fn();
    const handler = testHandler({
      ingestionMountResolver: {
        resolve: vi.fn(async () => ({
          ok: false as const,
          error: {
            code: "INGESTION_WORKSPACE_NOT_MOUNTED",
            message: "Portable workspace is not mounted.",
            allowedRepairActions: ["mount the workspace"]
          } as const
        }))
      },
      ingestionRuntimeFactory: runtimeFactory
    });

    const response = await handler({ method: "GET", url: "/api/ingestion/jobs" });

    expect(response.status).toBe(503);
    expect(JSON.parse(response.body)).toEqual({
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

  it("returns stable JSON diagnostics when mount resolution throws", async () => {
    const runtimeFactory = vi.fn();
    const handler = testHandler({
      ingestionMountResolver: {
        resolve: vi.fn(async () => {
          throw new Error("mount resolver unavailable");
        })
      },
      ingestionRuntimeFactory: runtimeFactory
    });

    const response = await handler({ method: "GET", url: "/api/ingestion/diagnostics" });

    expect(response.status).toBe(503);
    expect(JSON.parse(response.body)).toEqual({
      ok: false,
      error: {
        code: "INGESTION_WORKSPACE_NOT_MOUNTED",
        message: "Portable workspace could not be resolved.",
        allowedRepairActions: ["mount the portable workspace", "retry the ingestion action"],
        diagnostics: [
          {
            severity: "error",
            category: "ingestion.mount",
            message: "Mounted workspace resolution failed before runtime construction."
          }
        ]
      }
    });
    expect(runtimeFactory).not.toHaveBeenCalled();
  });

  it("returns safe mounted workspace status without constructing runtime", async () => {
    const runtimeFactory = vi.fn();
    const handler = testHandler({
      ingestionMountResolver: mountedResolver(),
      ingestionRuntimeFactory: runtimeFactory
    });

    const response = await handler({ method: "GET", url: "/api/ingestion/workspace" });

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      mounted: true,
      workspaceId: "ws_http_001",
      label: "HTTP workspace",
      capabilities: {
        canReadLedger: true,
        canAppendLedger: true,
        canWriteBlobs: true,
        canWriteDerivatives: true,
        canWriteJobState: true
      },
      diagnostics: []
    });
    expect(runtimeFactory).not.toHaveBeenCalled();
  });

  it("dispatches source listing through the ingestion runtime", async () => {
    const listSources = vi.fn(async () => ({
      ok: true as const,
      sources: [{
        sourceCollectionId: "src_drive_001",
        label: "Old archive",
        scanBatchIds: [],
        importBatchIds: [],
        diagnosticIds: []
      }]
    }));
    const runtimeFactory = vi.fn(() => ({ listSources }));
    const handler = testHandler({
      ingestionMountResolver: mountedResolver(),
      ingestionRuntimeFactory: runtimeFactory
    });

    const response = await handler({ method: "GET", url: "/api/ingestion/sources" });

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      ok: true,
      sources: [{
        sourceCollectionId: "src_drive_001",
        label: "Old archive",
        scanBatchIds: [],
        importBatchIds: [],
        diagnosticIds: []
      }]
    });
    expect(response.body).not.toContain("rootUri");
    expect(listSources).toHaveBeenCalledWith({});
    expect(runtimeFactory).toHaveBeenCalledWith({
      mountedWorkspace: expect.objectContaining({ workspaceId: "ws_http_001" }),
      actor
    });
  });

  it("does not expose non-approved source or import alias routes", async () => {
    const runtimeFactory = vi.fn();
    const handler = testHandler({
      ingestionMountResolver: mountedResolver(),
      ingestionRuntimeFactory: runtimeFactory
    });

    const registerAlias = await handler({
      method: "POST",
      url: "/api/ingestion/sources/register",
      body: JSON.stringify(sourceRegistration())
    });
    const importAlias = await handler({
      method: "POST",
      url: "/api/ingestion/imports/import",
      body: JSON.stringify(importExecution())
    });

    expect(registerAlias.status).toBe(404);
    expect(importAlias.status).toBe(404);
    expect(runtimeFactory).not.toHaveBeenCalled();
  });

  it("dispatches jobs, retry, diagnostics, source registration, raw approval, and import routes directly", async () => {
    const runtime = {
      listJobs: vi.fn(async () => ({ ok: true as const, jobs: [] })),
      retryJob: vi.fn(async () => ({ ok: true as const, job: jobDto(), eventIds: ["evt_retry"] })),
      diagnostics: vi.fn(async () => ({ ok: true as const, diagnostics: [] })),
      registerSource: vi.fn(async () => ({ ok: true as const, review: reviewDto(), eventIds: ["evt_source"] })),
      approveRawImport: vi.fn(async () => ({ ok: true as const, review: reviewDto(), eventIds: ["evt_approve"] })),
      importApproved: vi.fn(async () => ({
        ok: true as const,
        importBatchId: "imp_001",
        totals: { evidenceCreated: 1, occurrencesLinked: 1, duplicatesReused: 0, skipped: 0 },
        review: reviewDto(),
        eventIds: ["evt_import"]
      }))
    };
    const handler = testHandler({
      ingestionMountResolver: mountedResolver(),
      ingestionRuntimeFactory: () => runtime
    });

    await expectJson(handler({ method: "GET", url: "/api/ingestion/jobs?sourceCollectionId=src_drive_001" }));
    await expectJson(handler({
      method: "POST",
      url: "/api/ingestion/jobs/retry",
      body: JSON.stringify({ jobId: "job_001" })
    }));
    await expectJson(handler({
      method: "GET",
      url: "/api/ingestion/diagnostics?sourceCollectionId=src_drive_001"
    }));
    await expectJson(handler({
      method: "POST",
      url: "/api/ingestion/sources",
      body: JSON.stringify(sourceRegistration())
    }));
    await expectJson(handler({
      method: "POST",
      url: "/api/ingestion/imports/approve",
      body: JSON.stringify(importApproval())
    }));
    await expectJson(handler({
      method: "POST",
      url: "/api/ingestion/imports/run",
      body: JSON.stringify(importExecution())
    }));

    expect(runtime.listJobs).toHaveBeenCalledWith({ sourceCollectionId: "src_drive_001" });
    expect(runtime.retryJob).toHaveBeenCalledWith({ jobId: "job_001" });
    expect(runtime.diagnostics).toHaveBeenCalledWith({ sourceCollectionId: "src_drive_001" });
    expect(runtime.registerSource).toHaveBeenCalledWith(sourceRegistration());
    expect(runtime.approveRawImport).toHaveBeenCalledWith(importApproval());
    expect(runtime.importApproved).toHaveBeenCalledWith(importExecution());
  });
});

async function expectJson(responsePromise: Promise<{ readonly status: number; readonly body: string }>) {
  const response = await responsePromise;
  expect(response.status).toBe(200);
  expect(JSON.parse(response.body).ok).toBe(true);
}

function testHandler(
  input: Omit<CreateLocalRuntimeHttpHandlerInput, "config" | "actor">
): LocalRuntimeHttpHandler {
  const handler = createLocalRuntimeHttpHandler({
    config: resolveLocalRuntimeConfig({ cwd: tempDir(), env: {} }),
    actor,
    ...input
  });
  handlers.push(handler);
  return handler;
}

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "cestus-ingestion-http-"));
  tempDirs.push(dir);
  return dir;
}

function mountedResolver() {
  return {
    resolve: vi.fn(async () => ({
      ok: true as const,
      workspace: mountedWorkspace()
    }))
  };
}

function mountedWorkspace(): MountedWorkspace {
  return {
    workspaceId: "ws_http_001",
    label: "HTTP workspace",
    ledger: new InMemoryEventLedger(),
    blobStore: blobStore(),
    derivativeStore: blobStore(),
    jobStateRoot: "/tmp/cestus-http-ingestion-jobs",
    capabilities: {
      canReadLedger: true,
      canAppendLedger: true,
      canWriteBlobs: true,
      canWriteDerivatives: true,
      canWriteJobState: true
    }
  };
}

function blobStore() {
  return {
    async put(content: Buffer) {
      return {
        contentHash: `sha256:${"0".repeat(64)}` as const,
        sizeBytes: content.byteLength,
        path: "blob"
      };
    },
    async get() {
      return Buffer.from("");
    }
  };
}

function reviewDto() {
  return {
    sourceCollectionId: "src_drive_001",
    label: "Old archive",
    totals: emptyTotals(),
    approvalRequired: false,
    duplicateGroups: [],
    evidenceLinks: [],
    parseJobs: [],
    diagnostics: []
  };
}

function emptyTotals() {
  return {
    observedFiles: 0,
    uniqueContent: 0,
    duplicateOccurrences: 0,
    skipped: 0,
    bytes: 0,
    estimatedNewBlobBytes: 0
  };
}

function jobDto() {
  return {
    jobId: "job_001",
    kind: "local-parse" as const,
    state: "queued" as const,
    retryable: true,
    sourceCollectionId: "src_drive_001",
    diagnosticIds: []
  };
}

function sourceRegistration() {
  return {
    sourceCollectionId: "src_drive_001",
    label: "Old archive",
    rootUri: "file:///archive",
    sourceRoot: "/archive"
  };
}

function importApproval() {
  return {
    sourceCollectionId: "src_drive_001",
    scanBatchId: "scan_001",
    importBatchId: "imp_001",
    approvedBy: "actor_investigator"
  };
}

function importExecution() {
  return {
    sourceCollectionId: "src_drive_001",
    scanBatchId: "scan_001",
    importBatchId: "imp_001"
  };
}
