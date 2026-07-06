import { describe, expect, it } from "vitest";
import {
  workspaceOpsEnvelopeSchema,
  workspaceOpsSchemaVersion,
  workspaceVerifyDtoSchema
} from "../src/contracts.js";
import type { WorkspaceFileSystem, WorkspaceStats } from "../src/filesystem.js";
import {
  createProvisionalWorkspaceLayout,
  resolveWorkspaceLayout,
  type ResolvedWorkspaceLayout,
  type WorkspaceLayoutResult
} from "../src/layout.js";
import { verifyWorkspace, type WorkspaceEventReader } from "../src/ops.js";

const rootPath = "/workspace";
const manifestPath = "/workspace/cestus-workspace.json";

const validEvent = {
  id: "evt_ops_evidence",
  type: "evidence.ingested",
  version: 1,
  streamId: "evidence_ev_ops_001",
  sequence: 1,
  context: {
    actor: { id: "actor_system", kind: "system", label: "fixture" },
    occurredAt: "2026-07-06T12:00:00.000Z",
    correlationId: "corr_ops",
    coreVersion: "0.1.0",
    packVersions: { core: "0.1.0" }
  },
  payload: {
    evidenceId: "ev_ops_001",
    source: { kind: "file", label: "fixture.txt" },
    contentHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    mediaType: "text/plain",
    sizeBytes: 1
  }
} as const;

class MemoryWorkspaceFs implements WorkspaceFileSystem {
  readonly files = new Map<string, string>();
  readonly directories = new Set<string>();
  readonly readFailures = new Set<string>();
  readonly statFailures = new Set<string>();
  readonly listFailures = new Set<string>();
  readonly existsCalls: string[] = [];
  readonly statCalls: string[] = [];
  readonly listCalls: string[] = [];
  availableBytesCalls = 0;

  async exists(path: string): Promise<boolean> {
    this.existsCalls.push(path);
    return this.files.has(path) || this.directories.has(path);
  }

  async readText(path: string): Promise<string> {
    if (this.readFailures.has(path)) {
      throw new Error(`unreadable file ${path}`);
    }
    const value = this.files.get(path);
    if (value === undefined) {
      throw new Error(`missing file ${path}`);
    }
    return value;
  }

  async stat(path: string): Promise<WorkspaceStats> {
    this.statCalls.push(path);
    if (this.statFailures.has(path)) {
      throw new Error(`unreadable path ${path}`);
    }
    if (this.directories.has(path)) {
      return { kind: "directory", sizeBytes: 0 };
    }
    const value = this.files.get(path);
    if (value !== undefined) {
      return { kind: "file", sizeBytes: Buffer.byteLength(value) };
    }
    throw new Error(`missing path ${path}`);
  }

  async list(path: string): Promise<readonly string[]> {
    this.listCalls.push(path);
    if (this.listFailures.has(path)) {
      throw new Error(`unreadable directory ${path}`);
    }
    return [];
  }

  async realpath(path: string): Promise<string> {
    return path;
  }

  async availableBytes(): Promise<number | undefined> {
    this.availableBytesCalls += 1;
    return 1_000_000;
  }
}

function addResolvedWorkspace(fileSystem: MemoryWorkspaceFs): ResolvedWorkspaceLayout {
  const layout = createProvisionalWorkspaceLayout(rootPath);
  fileSystem.directories.add(rootPath);
  fileSystem.files.set(
    manifestPath,
    JSON.stringify({ workspaceId: "ws_ops_001", label: "Ops Fixture", version: 1 })
  );
  fileSystem.files.set(layout.ledgerPath, "sqlite");
  fileSystem.directories.add(layout.blobRoot);
  fileSystem.directories.add(layout.derivativeRoot);
  fileSystem.directories.add(layout.jobRoot);
  fileSystem.directories.add(layout.projectionRoot);
  fileSystem.directories.add(layout.diagnosticsRoot);
  fileSystem.directories.add(layout.backupRoot);
  return layout;
}

async function readyLayout(fileSystem: MemoryWorkspaceFs): Promise<WorkspaceLayoutResult> {
  addResolvedWorkspace(fileSystem);
  const result = await resolveWorkspaceLayout({ rootPath }, fileSystem);
  expect(result.status).toBe("ready");
  return result;
}

function neverCalledEventReader(): WorkspaceEventReader {
  return {
    async readAll() {
      throw new Error("event reader should not be called for blocked layouts");
    }
  };
}

describe("verifyWorkspace", () => {
  it("blocks verification when the drive is missing and proposes remount without reading canonical stores", async () => {
    const fileSystem = new MemoryWorkspaceFs();
    const layout = await resolveWorkspaceLayout({ rootPath: "/missing-workspace" }, fileSystem);

    const result = await verifyWorkspace({
      layout,
      fileSystem,
      eventReader: neverCalledEventReader()
    });

    expect(result.status).toBe("blocked");
    expect(result.payload?.mountStatus.status).toBe("missing");
    expect(result.payload?.ledger.readable).toBe(false);
    expect(result.proposedActions).toContainEqual(
      expect.objectContaining({
        kind: "remount-drive",
        requiresHumanApproval: false,
        mutatesCanonicalState: false
      })
    );
    expect(workspaceVerifyDtoSchema.parse(result.payload)).toEqual(result.payload);
    expect(workspaceOpsEnvelopeSchema.parse(result)).toEqual(result);
    expect(fileSystem.existsCalls).toEqual(["/missing-workspace"]);
  });

  it("uses injected ledger events to produce a contract-compatible ready verification DTO", async () => {
    const fileSystem = new MemoryWorkspaceFs();
    const layout = await readyLayout(fileSystem);

    const result = await verifyWorkspace({
      layout,
      fileSystem,
      eventReader: { readAll: async () => [validEvent] }
    });

    expect(result.status).toBe("ready");
    expect(result.payload).toMatchObject({
      schemaVersion: workspaceOpsSchemaVersion,
      ledger: { readable: true, eventCount: 1, highWaterMark: 1 },
      blobStore: {
        available: true,
        missingBlobCount: 0,
        hashMismatchCount: 0
      },
      projections: { available: true, rebuildable: true }
    });
    expect(workspaceVerifyDtoSchema.parse(result.payload)).toEqual(result.payload);
    expect(workspaceOpsEnvelopeSchema.parse(result)).toEqual(result);
  });

  it("uses event count as the provisional ledger high-water mark across streams", async () => {
    const fileSystem = new MemoryWorkspaceFs();
    const layout = await readyLayout(fileSystem);
    const events = [
      validEvent,
      {
        ...validEvent,
        id: "evt_ops_evidence_second_stream",
        streamId: "evidence_ev_ops_002",
        sequence: 1,
        payload: {
          ...validEvent.payload,
          evidenceId: "ev_ops_002"
        }
      },
      {
        ...validEvent,
        id: "evt_ops_evidence_first_stream_second_event",
        sequence: 2
      }
    ] as const;

    const result = await verifyWorkspace({
      layout,
      fileSystem,
      eventReader: { readAll: async () => events }
    });

    expect(result.status).toBe("ready");
    expect(result.payload?.ledger).toMatchObject({
      readable: true,
      eventCount: 3,
      highWaterMark: 3
    });
    expect(workspaceVerifyDtoSchema.parse(result.payload)).toEqual(result.payload);
    expect(workspaceOpsEnvelopeSchema.parse(result)).toEqual(result);
  });

  it("does not read canonical ledger events when the ledger path is unavailable", async () => {
    const fileSystem = new MemoryWorkspaceFs();
    const layoutShape = addResolvedWorkspace(fileSystem);
    fileSystem.files.delete(layoutShape.ledgerPath);
    const layout = await resolveWorkspaceLayout({ rootPath }, fileSystem);
    let readCalls = 0;

    const result = await verifyWorkspace({
      layout,
      fileSystem,
      eventReader: {
        readAll: async () => {
          readCalls += 1;
          return [validEvent];
        }
      }
    });

    expect(readCalls).toBe(0);
    expect(result.status).toBe("blocked");
    expect(result.payload?.ledger).toEqual({ readable: false, eventCount: 0, highWaterMark: 0 });
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        diagnosticId: "diag_workspace_ledger_root_unavailable",
        category: "ledger"
      })
    );
    expect(result.proposedActions).toContainEqual(
      expect.objectContaining({
        kind: "append-repair-event-required",
        requiresHumanApproval: true,
        mutatesCanonicalState: true
      })
    );
    expect(workspaceVerifyDtoSchema.parse(result.payload)).toEqual(result.payload);
  });

  it("blocks without reading canonical ledger events when the manifest disappears after detection", async () => {
    const fileSystem = new MemoryWorkspaceFs();
    const layoutShape = addResolvedWorkspace(fileSystem);
    const layout = await resolveWorkspaceLayout({ rootPath }, fileSystem);
    fileSystem.files.delete(layoutShape.manifestPath);
    let readCalls = 0;

    const result = await verifyWorkspace({
      layout,
      fileSystem,
      eventReader: {
        readAll: async () => {
          readCalls += 1;
          return [validEvent];
        }
      }
    });

    expect(readCalls).toBe(0);
    expect(result.status).toBe("blocked");
    expect(result.payload?.manifest).toMatchObject({ readable: false, valid: false });
    expect(result.payload?.ledger).toEqual({ readable: false, eventCount: 0, highWaterMark: 0 });
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        diagnosticId: "diag_workspace_manifest_unavailable",
        category: "manifest"
      })
    );
    expect(result.proposedActions).toContainEqual(
      expect.objectContaining({
        kind: "rerun-verify",
        requiresHumanApproval: false,
        mutatesCanonicalState: false
      })
    );
    expect(workspaceVerifyDtoSchema.parse(result.payload)).toEqual(result.payload);
    expect(workspaceOpsEnvelopeSchema.parse(result)).toEqual(result);
  });

  it("blocks without reading canonical ledger events when the manifest can no longer be read", async () => {
    const fileSystem = new MemoryWorkspaceFs();
    const layoutShape = addResolvedWorkspace(fileSystem);
    const layout = await resolveWorkspaceLayout({ rootPath }, fileSystem);
    fileSystem.readFailures.add(layoutShape.manifestPath);
    let readCalls = 0;

    const result = await verifyWorkspace({
      layout,
      fileSystem,
      eventReader: {
        readAll: async () => {
          readCalls += 1;
          return [validEvent];
        }
      }
    });

    expect(readCalls).toBe(0);
    expect(result.status).toBe("blocked");
    expect(result.payload?.manifest).toMatchObject({ readable: false, valid: false });
    expect(result.payload?.ledger).toEqual({ readable: false, eventCount: 0, highWaterMark: 0 });
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        diagnosticId: "diag_workspace_manifest_unavailable",
        category: "manifest"
      })
    );
    expect(result.proposedActions).toContainEqual(
      expect.objectContaining({
        kind: "rerun-verify",
        requiresHumanApproval: false,
        mutatesCanonicalState: false
      })
    );
    expect(workspaceVerifyDtoSchema.parse(result.payload)).toEqual(result.payload);
    expect(workspaceOpsEnvelopeSchema.parse(result)).toEqual(result);
  });

  it("blocks without reading canonical ledger events when the manifest content becomes invalid", async () => {
    const fileSystem = new MemoryWorkspaceFs();
    const layoutShape = addResolvedWorkspace(fileSystem);
    const layout = await resolveWorkspaceLayout({ rootPath }, fileSystem);
    fileSystem.files.set(
      layoutShape.manifestPath,
      JSON.stringify({ workspaceId: "ws_ops_001", label: "Ops Fixture", version: 2 })
    );
    let readCalls = 0;

    const result = await verifyWorkspace({
      layout,
      fileSystem,
      eventReader: {
        readAll: async () => {
          readCalls += 1;
          return [validEvent];
        }
      }
    });

    expect(readCalls).toBe(0);
    expect(result.status).toBe("blocked");
    expect(result.payload?.manifest).toMatchObject({ readable: true, valid: false });
    expect(result.payload?.ledger).toEqual({ readable: false, eventCount: 0, highWaterMark: 0 });
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        diagnosticId: "diag_workspace_manifest_unavailable",
        category: "manifest"
      })
    );
    expect(JSON.stringify(result)).not.toContain("\"version\":2");
    expect(workspaceVerifyDtoSchema.parse(result.payload)).toEqual(result.payload);
    expect(workspaceOpsEnvelopeSchema.parse(result)).toEqual(result);
  });

  it("blocks without reading canonical ledger events when the manifest belongs to another workspace", async () => {
    const fileSystem = new MemoryWorkspaceFs();
    const layoutShape = addResolvedWorkspace(fileSystem);
    const layout = await resolveWorkspaceLayout({ rootPath }, fileSystem);
    fileSystem.files.set(
      layoutShape.manifestPath,
      JSON.stringify({ workspaceId: "ws_ops_999", label: "Ops Fixture", version: 1 })
    );
    let readCalls = 0;

    const result = await verifyWorkspace({
      layout,
      fileSystem,
      eventReader: {
        readAll: async () => {
          readCalls += 1;
          return [validEvent];
        }
      }
    });

    expect(readCalls).toBe(0);
    expect(result.status).toBe("blocked");
    expect(result.payload?.manifest).toMatchObject({ readable: true, valid: false });
    expect(result.payload?.ledger).toEqual({ readable: false, eventCount: 0, highWaterMark: 0 });
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        diagnosticId: "diag_workspace_manifest_unavailable",
        category: "manifest"
      })
    );
    expect(JSON.stringify(result)).not.toContain("ws_ops_999");
    expect(workspaceVerifyDtoSchema.parse(result.payload)).toEqual(result.payload);
    expect(workspaceOpsEnvelopeSchema.parse(result)).toEqual(result);
  });

  it("blocks without reading canonical ledger events when the manifest gains extra fields", async () => {
    const fileSystem = new MemoryWorkspaceFs();
    const layoutShape = addResolvedWorkspace(fileSystem);
    const layout = await resolveWorkspaceLayout({ rootPath }, fileSystem);
    fileSystem.files.set(
      layoutShape.manifestPath,
      JSON.stringify({
        workspaceId: "ws_ops_001",
        label: "Ops Fixture",
        version: 1,
        extraField: "not part of the provisional contract"
      })
    );
    let readCalls = 0;

    const result = await verifyWorkspace({
      layout,
      fileSystem,
      eventReader: {
        readAll: async () => {
          readCalls += 1;
          return [validEvent];
        }
      }
    });

    expect(readCalls).toBe(0);
    expect(result.status).toBe("blocked");
    expect(result.payload?.manifest).toMatchObject({ readable: true, valid: false });
    expect(result.payload?.ledger).toEqual({ readable: false, eventCount: 0, highWaterMark: 0 });
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        diagnosticId: "diag_workspace_manifest_unavailable",
        category: "manifest"
      })
    );
    expect(result.proposedActions).toContainEqual(
      expect.objectContaining({
        kind: "rerun-verify",
        mutatesCanonicalState: false
      })
    );
    expect(JSON.stringify(result)).not.toContain("extraField");
    expect(workspaceVerifyDtoSchema.parse(result.payload)).toEqual(result.payload);
    expect(workspaceOpsEnvelopeSchema.parse(result)).toEqual(result);
  });

  it("reports blob subtree unreadability as proposed-only canonical repair", async () => {
    const fileSystem = new MemoryWorkspaceFs();
    const layoutShape = addResolvedWorkspace(fileSystem);
    fileSystem.listFailures.add(layoutShape.blobRoot);
    const layout = await resolveWorkspaceLayout({ rootPath }, fileSystem);

    const result = await verifyWorkspace({
      layout,
      fileSystem,
      eventReader: { readAll: async () => [validEvent] }
    });

    expect(result.status).toBe("degraded");
    expect(result.payload?.blobStore).toMatchObject({
      available: false,
      missingBlobCount: 1
    });
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        diagnosticId: "diag_workspace_blob_root_unreadable",
        category: "blob-integrity"
      })
    );
    expect(result.proposedActions).toContainEqual(
      expect.objectContaining({
        kind: "append-repair-event-required",
        requiresHumanApproval: true,
        mutatesCanonicalState: true
      })
    );
    expect(workspaceVerifyDtoSchema.parse(result.payload)).toEqual(result.payload);
    expect(workspaceOpsEnvelopeSchema.parse(result)).toEqual(result);
  });

  it("reports canonical ledger and blob repair as human-approved future append-only events only", async () => {
    const fileSystem = new MemoryWorkspaceFs();
    const layoutShape = addResolvedWorkspace(fileSystem);
    fileSystem.directories.delete(layoutShape.blobRoot);
    const layout = await resolveWorkspaceLayout({ rootPath }, fileSystem);

    const result = await verifyWorkspace({
      layout,
      fileSystem,
      eventReader: {
        readAll: async () => [
          {
            ...validEvent,
            id: "evt_invalid_private_report",
            payload: {
              source: { kind: "file", label: "private-report.pdf" },
              contentHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
              mediaType: "text/plain",
              sizeBytes: 1
            }
          }
        ]
      }
    });

    const canonicalActions = result.proposedActions.filter(
      (action) => action.kind === "append-repair-event-required"
    );

    expect(result.status).toBe("degraded");
    expect(result.payload?.ledger.readable).toBe(true);
    expect(result.payload?.blobStore.available).toBe(false);
    expect(canonicalActions).toHaveLength(2);
    expect(canonicalActions).toEqual([
      expect.objectContaining({
        requiresHumanApproval: true,
        mutatesCanonicalState: true,
        title: expect.stringContaining("future append-only repair event")
      }),
      expect.objectContaining({
        requiresHumanApproval: true,
        mutatesCanonicalState: true,
        title: expect.stringContaining("future append-only repair event")
      })
    ]);
    expect(JSON.stringify(result)).not.toContain("private-report.pdf");
    expect(workspaceVerifyDtoSchema.parse(result.payload)).toEqual(result.payload);
    expect(workspaceOpsEnvelopeSchema.parse(result)).toEqual(result);
  });

  it("proposes projection rebuild only for missing expendable projection artifacts", async () => {
    const fileSystem = new MemoryWorkspaceFs();
    const layoutShape = addResolvedWorkspace(fileSystem);
    fileSystem.directories.delete(layoutShape.projectionRoot);
    const layout = await resolveWorkspaceLayout({ rootPath }, fileSystem);

    const result = await verifyWorkspace({
      layout,
      fileSystem,
      eventReader: { readAll: async () => [validEvent] }
    });

    expect(result.status).toBe("degraded");
    expect(result.payload?.projections).toEqual({
      available: false,
      staleCount: 0,
      rebuildable: true
    });
    expect(result.proposedActions).toContainEqual(
      expect.objectContaining({
        kind: "rebuild-projection",
        requiresHumanApproval: false,
        mutatesCanonicalState: false
      })
    );
    expect(result.proposedActions).not.toContainEqual(
      expect.objectContaining({ kind: "append-repair-event-required" })
    );
    expect(workspaceVerifyDtoSchema.parse(result.payload)).toEqual(result.payload);
  });
});
