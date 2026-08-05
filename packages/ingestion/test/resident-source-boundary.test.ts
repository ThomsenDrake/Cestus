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
        type: path === "/selected/linked" ? "symlink" : "file",
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
      sourceIdentity: "source_001",
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
      lstat: () => ({ type: "file", sizeBytes: 1, mtimeMs: 1, device: 1, inode: 1 })
    };
    await expect(createResidentSourceBoundaryService({ workspace, filesystem: escaping }).discover({
      workflowId: "workflow_002", sourceCollectionId: "src_002", sourceIdentity: "source_002", sourceRoot: "/selected"
    })).rejects.toThrow(/escapes/i);

    const archiveFilesystem: ResidentSourceMetadataFilesystem = {
      listDirectory: () => ["archive.zip"],
      lstat: () => ({ type: "file", sizeBytes: 9, mtimeMs: 1, device: 1, inode: 2 })
    };
    const service = createResidentSourceBoundaryService({ workspace, filesystem: archiveFilesystem });
    const discovery = await service.discover({
      workflowId: "workflow_003", sourceCollectionId: "src_003", sourceIdentity: "source_003", sourceRoot: "/selected"
    });
    await expect(service.proposeBoundary({
      workflowId: "workflow_003", discoveryArtifactHash: discovery.discoveryArtifactHash,
      includedRelativePaths: ["archive.zip"], excludedRelativePaths: []
    })).rejects.toThrow(/archive/i);
    await expect(service.readProtectedDiscovery({ actorKind: "agent", discoveryArtifactHash: discovery.discoveryArtifactHash }))
      .rejects.toThrow(/human/i);
  });
});
