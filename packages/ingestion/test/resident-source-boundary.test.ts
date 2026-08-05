import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createResidentSourceBoundaryService,
  type ResidentSourceMetadataFilesystem
} from "../src/resident-source-boundary.js";
import { createFakeMountedWorkspace } from "./runtime-test-helpers.js";

describe("resident source boundary", () => {
  it("discovers virtual metadata without opening file bytes and produces a path-free preview", async () => {
    const workspace = createFakeMountedWorkspace();
    const filesystem: ResidentSourceMetadataFilesystem = {
      listDirectory: (path) => path === "/selected" ? ["notes/finding.md", "settings.json", "linked"] : [],
      lstat: (path) => ({
        path,
        type: path === "/selected" ? "directory" : path === "/selected/linked" ? "symlink" : "file",
        sizeBytes: path.endsWith("finding.md") ? 12 : 8,
        mtimeMs: 1,
        device: 7,
        inode: path.endsWith("finding.md") ? 2 : 3
      }),
      readFile: () => { throw new Error("discovery must never read bytes"); }
    };
    const service = createResidentSourceBoundaryService({ workspace, filesystem });

    const discovery = await service.discover({
      workflowId: "workflow_001",
      sourceCollectionId: "src_001",
      sourceRoot: "/selected"
    });

    expect(discovery.preview).toMatchObject({ workflowId: "workflow_001", regularFileCount: 2, symlinkCount: 1 });
    expect(JSON.stringify(discovery.preview)).not.toContain("finding.md");
    await expect(service.proposeBoundary({
      workflowId: "workflow_001",
      discoveryArtifactHash: discovery.discoveryArtifactHash,
      includedRelativePaths: ["notes/finding.md"],
      excludedRelativePaths: ["settings.json"]
    })).resolves.toMatchObject({ includedFileCount: 1, excludedFileCount: 1 });
  });

  it("rejects an escaping directory result before derivative storage and rejects archive inclusion", async () => {
    const workspace = createFakeMountedWorkspace();
    const escaping: ResidentSourceMetadataFilesystem = {
      listDirectory: () => ["../../outside.txt"],
      lstat: (path) => ({ type: path === "/selected" ? "directory" : "file", sizeBytes: 1, mtimeMs: 1, device: 1, inode: 1 })
    };
    await expect(createResidentSourceBoundaryService({ workspace, filesystem: escaping }).discover({
      workflowId: "workflow_002", sourceCollectionId: "src_002", sourceRoot: "/selected"
    })).rejects.toThrow(/escapes/i);

    const archiveFilesystem: ResidentSourceMetadataFilesystem = {
      listDirectory: () => ["archive.zip"],
      lstat: (path) => ({ type: path === "/selected" ? "directory" : "file", sizeBytes: 9, mtimeMs: 1, device: 1, inode: 2 })
    };
    const service = createResidentSourceBoundaryService({ workspace, filesystem: archiveFilesystem });
    const discovery = await service.discover({
      workflowId: "workflow_003", sourceCollectionId: "src_003", sourceRoot: "/selected"
    });
    await expect(service.proposeBoundary({
      workflowId: "workflow_003", discoveryArtifactHash: discovery.discoveryArtifactHash,
      includedRelativePaths: ["archive.zip"], excludedRelativePaths: []
    })).rejects.toThrow(/archive/i);
    await expect(service.readProtectedDiscovery({ actorKind: "agent", discoveryArtifactHash: discovery.discoveryArtifactHash }))
      .rejects.toThrow(/human/i);
  });

  it("derives source identity from selected-root metadata instead of caller text", async () => {
    const workspace = createFakeMountedWorkspace();
    const filesystem: ResidentSourceMetadataFilesystem = {
      listDirectory: () => [],
      lstat: (path) => ({
        path,
        type: "directory",
        sizeBytes: 0,
        mtimeMs: 9,
        device: path === "/selected-a" ? 7 : 8,
        inode: path === "/selected-a" ? 3 : 4
      })
    };
    const service = createResidentSourceBoundaryService({ workspace, filesystem });
    const first = await service.discover({
      workflowId: "workflow_identity_001", sourceCollectionId: "src_identity_001", sourceRoot: "/selected-a"
    } as never);
    const second = await service.discover({
      workflowId: "workflow_identity_002", sourceCollectionId: "src_identity_001", sourceRoot: "/selected-b"
    } as never);
    expect(first.preview.sourceIdentity).not.toBe("caller-controlled");
    expect(second.preview.sourceIdentity).not.toBe(first.preview.sourceIdentity);
  });

  it("fails closed for a content-addressed but duplicate-path protected discovery artifact", async () => {
    const workspace = createFakeMountedWorkspace();
    const entry = { relativePath: "a.txt", type: "regular-file", sizeBytes: 1, mtimeMs: 1, device: 1, inode: 2, symlink: false };
    const unsigned = {
      schemaVersion: "resident-source-discovery.v1", workflowId: "workflow_decode_001", workspaceId: workspace.workspaceId,
      sourceCollectionId: "src_decode_001", sourceIdentity: `source_${"a".repeat(64)}`, sourceRoot: "/selected",
      sourceRootHash: `sha256:${"1".repeat(64)}`, entries: [entry, entry]
    };
    const artifact = { ...unsigned, discoveryHash: digest(canonical(unsigned)) };
    const stored = await workspace.derivativeStore.put(Buffer.from(canonical(artifact)));
    await expect(createResidentSourceBoundaryService({ workspace }).readProtectedDiscovery({
      actorKind: "human", discoveryArtifactHash: stored.contentHash
    })).rejects.toThrow(/canonical|duplicate/i);
  });
});

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
function digest(value: string): `sha256:${string}` { return `sha256:${createHash("sha256").update(value).digest("hex")}`; }
