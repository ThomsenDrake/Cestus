import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPortableIngestionWorkspace, readPortableWorkspaceManifest } from "../src/workspace.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cestus-ingestion-workspace-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("portable ingestion workspace", () => {
  it("creates a self-contained workspace layout with no secrets", () => {
    const workspace = createPortableIngestionWorkspace({
      rootDir: dir,
      workspaceId: "ws_ingestion_001",
      label: "External drive corpus"
    });

    expect(workspace).toEqual({
      workspaceId: "ws_ingestion_001",
      label: "External drive corpus",
      rootDir: dir,
      manifestPath: join(dir, "cestus-workspace.json"),
      ledgerPath: join(dir, "ledger", "ontology.sqlite"),
      blobRoot: join(dir, "blobs"),
      derivativeRoot: join(dir, "derivatives"),
      jobRoot: join(dir, "jobs")
    });
    expect(readPortableWorkspaceManifest(workspace.manifestPath)).toEqual({
      workspaceId: "ws_ingestion_001",
      label: "External drive corpus",
      version: 1
    });
    expect(JSON.stringify(readPortableWorkspaceManifest(workspace.manifestPath))).not.toMatch(/token|secret|password/i);
  });
});
