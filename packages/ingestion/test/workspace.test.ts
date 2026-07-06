import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readPortableWorkspaceManifest as readCanonicalManifest } from "../../workspace/src/index.js";
import { createPortableIngestionWorkspace, readPortableWorkspaceManifest } from "../src/workspace.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cestus-ingestion-workspace-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("portable ingestion workspace", () => {
  it("delegates to the canonical portable workspace layout with no secrets", () => {
    const workspace = createPortableIngestionWorkspace({
      rootDir: dir,
      workspaceId: "ws_ingestion_001",
      label: "External drive corpus",
      createdAt: "2026-07-06T12:00:00.000Z"
    });

    expect(workspace).toEqual({
      workspaceId: "ws_ingestion_001",
      label: "External drive corpus",
      rootDir: dir,
      manifestPath: join(dir, "cestus-workspace.json"),
      ledgerPath: join(dir, "ledger", "ontology.sqlite"),
      blobRoot: join(dir, "blobs"),
      derivativeRoot: join(dir, "derivatives"),
      jobRoot: join(dir, "jobs"),
      projectionRoot: join(dir, "projections"),
      cacheRoot: join(dir, "cache"),
      configRoot: join(dir, "config")
    });
    expect(readPortableWorkspaceManifest(workspace.manifestPath)).toEqual({
      version: 1,
      layoutVersion: 1,
      workspaceId: "ws_ingestion_001",
      label: "External drive corpus",
      createdAt: "2026-07-06T12:00:00.000Z",
      createdBy: "cestus-ingest",
      coreVersion: "0.1.0"
    });
    expect(readCanonicalManifest({ manifestPath: workspace.manifestPath })).toEqual(
      readPortableWorkspaceManifest(workspace.manifestPath)
    );
    expect(JSON.stringify(readPortableWorkspaceManifest(workspace.manifestPath))).not.toMatch(/token|secret|password/i);
  });
});
