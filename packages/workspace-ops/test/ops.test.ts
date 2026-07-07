import { existsSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createPortableWorkspace, mountPortableWorkspace } from "../../workspace/src/index.js";
import {
  workspaceOpsEnvelopeSchema,
  workspaceOpsSchemaVersion,
  workspaceVerifyDtoSchema
} from "../src/contracts.js";
import { NodeWorkspaceFileSystem, type WorkspaceFileSystem, type WorkspaceStats } from "../src/filesystem.js";
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

function canonicalManifest(
  workspaceId = "ws_ops_001",
  label = "Ops Fixture",
  version = 1,
  extraFields: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    version,
    layoutVersion: 1,
    workspaceId,
    label,
    createdAt: "2026-07-06T12:00:00.000Z",
    createdBy: "workspace-ops-test",
    coreVersion: "0.1.0",
    ...extraFields
  };
}

class MemoryWorkspaceFs implements WorkspaceFileSystem {
  readonly files = new Map<string, string>();
  readonly directories = new Set<string>();
  readonly readFailures = new Set<string>();
  readonly statFailures = new Set<string>();
  readonly listFailures = new Set<string>();
  readonly existsCalls: string[] = [];
  readonly statCalls: string[] = [];
  readonly listCalls: string[] = [];
  readonly realpathCalls: string[] = [];
  availableBytesCalls = 0;

  clearRecordedCalls(): void {
    this.existsCalls.length = 0;
    this.statCalls.length = 0;
    this.listCalls.length = 0;
    this.realpathCalls.length = 0;
    this.availableBytesCalls = 0;
  }

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
    this.realpathCalls.push(path);
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
  fileSystem.files.set(manifestPath, JSON.stringify(canonicalManifest()));
  fileSystem.directories.add(join(rootPath, "ledger"));
  fileSystem.files.set(layout.ledgerPath, "sqlite");
  fileSystem.directories.add(layout.blobRoot);
  fileSystem.directories.add(layout.derivativeRoot);
  fileSystem.directories.add(layout.jobRoot);
  fileSystem.directories.add(layout.projectionRoot);
  fileSystem.directories.add(join(rootPath, "cache"));
  fileSystem.directories.add(join(rootPath, "config"));
  return layout;
}

function addCanonicalResolvedWorkspace(fileSystem: MemoryWorkspaceFs): ResolvedWorkspaceLayout {
  const layout = createProvisionalWorkspaceLayout(rootPath);
  fileSystem.directories.add(rootPath);
  fileSystem.files.set(
    manifestPath,
    JSON.stringify({
      version: 1,
      layoutVersion: 1,
      workspaceId: "ws_ops_001",
      label: "Ops Fixture",
      createdAt: "2026-07-06T12:00:00.000Z",
      createdBy: "workspace-ops-test",
      coreVersion: "0.1.0"
    })
  );
  fileSystem.directories.add(join(rootPath, "ledger"));
  fileSystem.files.set(layout.ledgerPath, "sqlite");
  fileSystem.directories.add(layout.blobRoot);
  fileSystem.directories.add(layout.derivativeRoot);
  fileSystem.directories.add(layout.jobRoot);
  fileSystem.directories.add(layout.projectionRoot);
  fileSystem.directories.add(layout.cacheRoot);
  fileSystem.directories.add(layout.configRoot);
  return layout;
}

function canonicalRootPaths(layout: ResolvedWorkspaceLayout): readonly string[] {
  return [
    join(layout.rootPath, "ledger"),
    layout.blobRoot,
    layout.derivativeRoot,
    layout.jobRoot,
    layout.projectionRoot,
    join(layout.rootPath, "cache"),
    join(layout.rootPath, "config")
  ];
}

function callsUnder(paths: readonly string[], calls: readonly string[]): readonly string[] {
  return calls.filter((call) => paths.some((path) => call === path || call.startsWith(`${path}/`)));
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
  it("verifies a fresh unopened canonical workspace without creating the SQLite ledger", async () => {
    const rootPath = mkdtempSync(join(tmpdir(), "cestus-ops-fresh-"));
    try {
      createPortableWorkspace({
        rootDir: rootPath,
        workspaceId: "ws_fresh_ops",
        label: "Fresh Ops Workspace",
        createdAt: "2026-07-06T12:00:00.000Z",
        createdBy: "workspace-ops-test",
        coreVersion: "0.1.0"
      });

      const fs = new NodeWorkspaceFileSystem();
      const layout = await resolveWorkspaceLayout({ rootPath, expectedWorkspaceId: "ws_fresh_ops" }, fs);
      const result = await verifyWorkspace({
        layout,
        fileSystem: fs,
        eventReader: {
          async readAll() {
            return [];
          }
        }
      });

      expect(result.status).toBe("ready");
      expect(result.payload?.ledger).toEqual({
        readable: true,
        eventCount: 0,
        highWaterMark: 0
      });
      expect(existsSync(join(rootPath, "ledger", "ontology.sqlite"))).toBe(false);
    } finally {
      rmSync(rootPath, { recursive: true, force: true });
    }
  });

  it("blocks an existing unsafe SQLite ledger path without opening ledger events", async () => {
    const rootPath = mkdtempSync(join(tmpdir(), "cestus-ops-ledger-link-"));
    try {
      createPortableWorkspace({
        rootDir: rootPath,
        workspaceId: "ws_linked_ledger",
        label: "Linked Ledger Workspace",
        createdAt: "2026-07-06T12:00:00.000Z",
        createdBy: "workspace-ops-test",
        coreVersion: "0.1.0"
      });
      const fs = new NodeWorkspaceFileSystem();
      const layout = await resolveWorkspaceLayout({ rootPath, expectedWorkspaceId: "ws_linked_ledger" }, fs);
      symlinkSync(join(rootPath, "missing-ledger.sqlite"), join(rootPath, "ledger", "ontology.sqlite"));
      expect(mountPortableWorkspace({ rootDir: rootPath })).toMatchObject({
        ok: false,
        diagnostic: { code: "workspace-ledger-unavailable" }
      });

      let readCalls = 0;
      const result = await verifyWorkspace({
        layout,
        fileSystem: fs,
        eventReader: {
          async readAll() {
            readCalls += 1;
            return [];
          }
        }
      });

      expect(readCalls).toBe(0);
      expect(result.status).toBe("blocked");
      expect(result.payload?.ledger).toEqual({ readable: false, eventCount: 0, highWaterMark: 0 });
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({
          diagnosticId: "diag_workspace_ledger_file_unavailable",
          category: "ledger"
        })
      );
      expect(workspaceVerifyDtoSchema.parse(result.payload)).toEqual(result.payload);
      expect(workspaceOpsEnvelopeSchema.parse(result)).toEqual(result);
    } finally {
      rmSync(rootPath, { recursive: true, force: true });
    }
  });

  it("treats canonical root symlinks that escape the workspace as unsafe", async () => {
    const rootPath = mkdtempSync(join(tmpdir(), "cestus-ops-root-link-"));
    const outsideRoot = mkdtempSync(join(tmpdir(), "cestus-ops-outside-"));
    try {
      createPortableWorkspace({
        rootDir: rootPath,
        workspaceId: "ws_linked_blob",
        label: "Linked Blob Workspace",
        createdAt: "2026-07-06T12:00:00.000Z",
        createdBy: "workspace-ops-test",
        coreVersion: "0.1.0"
      });
      const fs = new NodeWorkspaceFileSystem();
      const layout = await resolveWorkspaceLayout({ rootPath, expectedWorkspaceId: "ws_linked_blob" }, fs);
      rmSync(join(rootPath, "blobs"), { recursive: true, force: true });
      symlinkSync(outsideRoot, join(rootPath, "blobs"));

      const result = await verifyWorkspace({
        layout,
        fileSystem: fs,
        eventReader: {
          async readAll() {
            return [];
          }
        }
      });

      expect(result.status).toBe("degraded");
      expect(result.payload?.blobStore).toMatchObject({
        available: false,
        aggregateBytes: 0,
        missingBlobCount: 1
      });
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({
          diagnosticId: "diag_workspace_blob_root_unreadable",
          category: "blob-integrity"
        })
      );
      expect(workspaceVerifyDtoSchema.parse(result.payload)).toEqual(result.payload);
      expect(workspaceOpsEnvelopeSchema.parse(result)).toEqual(result);
    } finally {
      rmSync(rootPath, { recursive: true, force: true });
      rmSync(outsideRoot, { recursive: true, force: true });
    }
  });

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

  it("verifies a resolved canonical portable workspace manifest", async () => {
    const fileSystem = new MemoryWorkspaceFs();
    addCanonicalResolvedWorkspace(fileSystem);
    const layout = await resolveWorkspaceLayout({ rootPath }, fileSystem);

    const result = await verifyWorkspace({
      layout,
      fileSystem,
      eventReader: { readAll: async () => [validEvent] }
    });

    expect(layout.status).toBe("ready");
    expect(result.status).toBe("ready");
    expect(result.payload?.manifest).toMatchObject({
      readable: true,
      valid: true,
      manifestVersion: 1
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
    fileSystem.directories.delete(join(rootPath, "ledger"));
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

  it("blocks as wrong-drive without reading canonical ledger events when the manifest version changes", async () => {
    const fileSystem = new MemoryWorkspaceFs();
    const layoutShape = addResolvedWorkspace(fileSystem);
    const layout = await resolveWorkspaceLayout({ rootPath }, fileSystem);
    fileSystem.files.set(
      layoutShape.manifestPath,
      JSON.stringify(canonicalManifest("ws_ops_001", "Ops Fixture", 2))
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
    expect(result.payload?.mountStatus.status).toBe("wrong-drive");
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
        kind: "select-workspace",
        requiresHumanApproval: false,
        mutatesCanonicalState: false
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
      JSON.stringify(canonicalManifest("ws_ops_999"))
    );
    fileSystem.clearRecordedCalls();
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
    expect(result.payload?.mountStatus.status).toBe("wrong-drive");
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
        kind: "select-workspace",
        requiresHumanApproval: false,
        mutatesCanonicalState: false
      })
    );
    expect({
      exists: callsUnder(canonicalRootPaths(layoutShape), fileSystem.existsCalls),
      stat: callsUnder(canonicalRootPaths(layoutShape), fileSystem.statCalls),
      list: callsUnder(canonicalRootPaths(layoutShape), fileSystem.listCalls),
      realpath: callsUnder(canonicalRootPaths(layoutShape), fileSystem.realpathCalls)
    }).toEqual({
      exists: [],
      stat: [],
      list: [],
      realpath: []
    });
    expect(JSON.stringify(result)).not.toContain("ws_ops_999");
    expect(workspaceVerifyDtoSchema.parse(result.payload)).toEqual(result.payload);
    expect(workspaceOpsEnvelopeSchema.parse(result)).toEqual(result);
  });

  it("blocks as wrong-drive without reading canonical ledger events when the manifest version mismatches the resolved layout", async () => {
    const fileSystem = new MemoryWorkspaceFs();
    addResolvedWorkspace(fileSystem);
    const layout = await resolveWorkspaceLayout({ rootPath }, fileSystem);
    if (layout.workspace === undefined) {
      throw new Error("expected ready workspace layout");
    }
    const staleLayout = {
      ...layout,
      workspace: {
        ...layout.workspace,
        manifestVersion: 2
      }
    } satisfies WorkspaceLayoutResult;
    let readCalls = 0;

    const result = await verifyWorkspace({
      layout: staleLayout,
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
    expect(result.payload?.mountStatus.status).toBe("wrong-drive");
    expect(result.payload?.manifest).toMatchObject({ readable: true, valid: false });
    expect(result.payload?.ledger).toEqual({ readable: false, eventCount: 0, highWaterMark: 0 });
    expect(result.proposedActions).toContainEqual(
      expect.objectContaining({
        kind: "select-workspace",
        requiresHumanApproval: false,
        mutatesCanonicalState: false
      })
    );
    expect(workspaceVerifyDtoSchema.parse(result.payload)).toEqual(result.payload);
    expect(workspaceOpsEnvelopeSchema.parse(result)).toEqual(result);
  });

  it("blocks without reading canonical ledger events when the manifest gains extra fields", async () => {
    const fileSystem = new MemoryWorkspaceFs();
    const layoutShape = addResolvedWorkspace(fileSystem);
    const layout = await resolveWorkspaceLayout({ rootPath }, fileSystem);
    fileSystem.files.set(
      layoutShape.manifestPath,
      JSON.stringify(canonicalManifest("ws_ops_001", "Ops Fixture", 1, {
        extraField: "not part of the canonical contract"
      }))
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
