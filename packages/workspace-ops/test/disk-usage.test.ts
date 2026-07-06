import { describe, expect, it } from "vitest";
import {
  diskUsageDtoSchema,
  workspaceOpsEnvelopeSchema,
  workspaceOpsSchemaVersion
} from "../src/contracts.js";
import type { WorkspaceFileSystem, WorkspaceStats } from "../src/filesystem.js";
import { createProvisionalWorkspaceLayout } from "../src/layout.js";
import { reportDiskUsage } from "../src/ops.js";

type TreeEntry = {
  readonly kind: "file" | "directory";
  readonly sizeBytes: number;
  readonly children?: readonly string[];
};

class TreeWorkspaceFs implements WorkspaceFileSystem {
  availableBytesCalls = 0;

  constructor(
    private readonly entries: ReadonlyMap<string, TreeEntry>,
    private readonly freeBytes: number | undefined,
    private readonly failAvailableBytes = false
  ) {}

  async exists(path: string): Promise<boolean> {
    return this.entries.has(path);
  }

  async readText(): Promise<string> {
    return "";
  }

  async stat(path: string): Promise<WorkspaceStats> {
    const entry = this.entries.get(path);
    if (entry === undefined) {
      throw new Error(`missing ${path}`);
    }
    return { kind: entry.kind, sizeBytes: entry.sizeBytes };
  }

  async list(path: string): Promise<readonly string[]> {
    return this.entries.get(path)?.children ?? [];
  }

  async realpath(path: string): Promise<string> {
    return path;
  }

  async availableBytes(): Promise<number | undefined> {
    this.availableBytesCalls += 1;
    if (this.failAvailableBytes) {
      throw new Error("private adapter free-space failure");
    }
    return this.freeBytes;
  }
}

const layout = createProvisionalWorkspaceLayout("/workspace");

class CyclicWorkspaceFs implements WorkspaceFileSystem {
  readonly realpathCalls: string[] = [];
  readonly listCalls: string[] = [];
  private readonly listCounts = new Map<string, number>();

  async exists(path: string): Promise<boolean> {
    return path === layout.blobRoot;
  }

  async readText(): Promise<string> {
    return "";
  }

  async stat(path: string): Promise<WorkspaceStats> {
    if (path.startsWith(layout.blobRoot)) {
      return { kind: "directory", sizeBytes: 0 };
    }
    throw new Error(`missing ${path}`);
  }

  async list(path: string): Promise<readonly string[]> {
    this.listCalls.push(path);
    const count = this.listCounts.get(path) ?? 0;
    this.listCounts.set(path, count + 1);
    if (path === layout.blobRoot && count === 0) {
      return ["private-cycle-name"];
    }
    if (path === `${layout.blobRoot}/private-cycle-name`) {
      return [".."];
    }
    return [];
  }

  async realpath(path: string): Promise<string> {
    this.realpathCalls.push(path);
    if (path === `${layout.blobRoot}/private-cycle-name/..`) {
      return layout.blobRoot;
    }
    return path;
  }

  async availableBytes(): Promise<number | undefined> {
    return 10_000;
  }
}

describe("reportDiskUsage", () => {
  it("reports root and aggregate category totals without raw filenames", async () => {
    const fileSystem = new TreeWorkspaceFs(
      new Map([
        [layout.manifestPath, { kind: "file", sizeBytes: 4 }],
        [layout.ledgerPath, { kind: "file", sizeBytes: 20 }],
        [layout.blobRoot, { kind: "directory", sizeBytes: 0, children: ["sha256"] }],
        [`${layout.blobRoot}/sha256`, { kind: "directory", sizeBytes: 0, children: ["aa"] }],
        [`${layout.blobRoot}/sha256/aa`, { kind: "directory", sizeBytes: 0, children: ["private-case-notes.pdf"] }],
        [`${layout.blobRoot}/sha256/aa/private-case-notes.pdf`, { kind: "file", sizeBytes: 12 }],
        [layout.derivativeRoot, { kind: "directory", sizeBytes: 0, children: ["ocr-private-output.txt"] }],
        [`${layout.derivativeRoot}/ocr-private-output.txt`, { kind: "file", sizeBytes: 3 }],
        [layout.jobRoot, { kind: "directory", sizeBytes: 0, children: [] }],
        [layout.projectionRoot, { kind: "directory", sizeBytes: 0, children: ["graph.json"] }],
        [`${layout.projectionRoot}/graph.json`, { kind: "file", sizeBytes: 7 }],
        [layout.diagnosticsRoot, { kind: "directory", sizeBytes: 0, children: [] }],
        [layout.backupRoot, { kind: "directory", sizeBytes: 0, children: [] }]
      ]),
      10_000
    );

    const result = await reportDiskUsage({ layout, fileSystem });

    expect(result.status).toBe("ready");
    expect(result.payload).toEqual({
      schemaVersion: workspaceOpsSchemaVersion,
      estimatedFreeBytes: 10_000,
      thresholdWarnings: [],
      roots: [
        { rootId: "manifest", category: "manifest", bytes: 4, exists: true, safeUri: "file:///workspace/cestus-workspace.json" },
        { rootId: "ledger", category: "ledger", bytes: 20, exists: true, safeUri: "file:///workspace/ledger/ontology.sqlite" },
        { rootId: "blobs", category: "blobs", bytes: 12, exists: true, safeUri: "file:///workspace/blobs" },
        { rootId: "derivatives", category: "derivatives", bytes: 3, exists: true, safeUri: "file:///workspace/derivatives" },
        { rootId: "jobs", category: "jobs", bytes: 0, exists: true, safeUri: "file:///workspace/jobs" },
        { rootId: "projections", category: "projections", bytes: 7, exists: true, safeUri: "file:///workspace/projections" },
        { rootId: "diagnostics", category: "diagnostics", bytes: 0, exists: true, safeUri: "file:///workspace/diagnostics" },
        { rootId: "backups", category: "backups", bytes: 0, exists: true, safeUri: "file:///workspace/backups" }
      ],
      categories: [
        { category: "manifest", bytes: 4, exists: true },
        { category: "ledger", bytes: 20, exists: true },
        { category: "blobs", bytes: 12, exists: true },
        { category: "derivatives", bytes: 3, exists: true },
        { category: "jobs", bytes: 0, exists: true },
        { category: "projections", bytes: 7, exists: true },
        { category: "diagnostics", bytes: 0, exists: true },
        { category: "backups", bytes: 0, exists: true }
      ],
      totalBytes: 46
    });
    expect(fileSystem.availableBytesCalls).toBe(1);
    expect(JSON.stringify(result)).not.toContain("private-case-notes.pdf");
    expect(JSON.stringify(result)).not.toContain("ocr-private-output.txt");
    expect(JSON.stringify(result)).not.toContain("graph.json");
    expect(diskUsageDtoSchema.parse(result.payload)).toEqual(result.payload);
    expect(workspaceOpsEnvelopeSchema.parse(result)).toEqual(result);
  });

  it("omits free-space fields when the filesystem cannot report available bytes", async () => {
    const fileSystem = new TreeWorkspaceFs(
      new Map([[layout.manifestPath, { kind: "file", sizeBytes: 4 }]]),
      undefined
    );

    const result = await reportDiskUsage({ layout, fileSystem, warningThresholdBytes: 100 });

    expect(result.status).toBe("ready");
    expect(result.payload?.estimatedFreeBytes).toBeUndefined();
    expect(result.payload?.thresholdWarnings).toEqual([]);
    expect(fileSystem.availableBytesCalls).toBe(1);
    expect(diskUsageDtoSchema.parse(result.payload)).toEqual(result.payload);
  });

  it("reports disk usage when free-space inspection fails without leaking adapter errors", async () => {
    const fileSystem = new TreeWorkspaceFs(
      new Map([
        [layout.manifestPath, { kind: "file", sizeBytes: 4 }],
        [layout.blobRoot, { kind: "directory", sizeBytes: 0, children: ["private-child-name"] }],
        [`${layout.blobRoot}/private-child-name`, { kind: "file", sizeBytes: 12 }]
      ]),
      undefined,
      true
    );

    const result = await reportDiskUsage({ layout, fileSystem, warningThresholdBytes: 100 });

    expect(result.status).toBe("degraded");
    expect(result.payload?.estimatedFreeBytes).toBeUndefined();
    expect(result.payload?.thresholdWarnings).toEqual([]);
    expect(result.payload?.categories.find((category) => category.category === "blobs")).toEqual({
      category: "blobs",
      bytes: 12,
      exists: true
    });
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        diagnosticId: "diag_workspace_disk_available_bytes_unreadable",
        category: "disk"
      })
    );
    expect(fileSystem.availableBytesCalls).toBe(1);
    expect(JSON.stringify(result)).not.toContain("private adapter free-space failure");
    expect(JSON.stringify(result)).not.toContain("private-child-name");
    expect(diskUsageDtoSchema.parse(result.payload)).toEqual(result.payload);
    expect(workspaceOpsEnvelopeSchema.parse(result)).toEqual(result);
  });

  it("uses realpath cycle protection while keeping raw child names out of output", async () => {
    const fileSystem = new CyclicWorkspaceFs();

    const result = await reportDiskUsage({ layout, fileSystem });

    expect(result.status).toBe("ready");
    expect(result.payload?.categories.find((category) => category.category === "blobs")).toEqual({
      category: "blobs",
      bytes: 0,
      exists: true
    });
    expect(fileSystem.realpathCalls.length).toBeGreaterThan(0);
    expect(fileSystem.listCalls.filter((path) => path === layout.blobRoot)).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain("private-cycle-name");
    expect(diskUsageDtoSchema.parse(result.payload)).toEqual(result.payload);
    expect(workspaceOpsEnvelopeSchema.parse(result)).toEqual(result);
  });
});
