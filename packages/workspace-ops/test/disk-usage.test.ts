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
    private readonly freeBytes: number | undefined
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
    return this.freeBytes;
  }
}

const layout = createProvisionalWorkspaceLayout("/workspace");

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
});
