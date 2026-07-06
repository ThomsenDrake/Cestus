import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createPortableWorkspace,
  mountPortableWorkspace,
  portableWorkspacePaths,
  readPortableWorkspaceManifest
} from "../src/index.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cestus-workspace-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("portable workspace contract", () => {
  it("creates and mounts the canonical secret-free layout", () => {
    const workspace = createPortableWorkspace({
      rootDir: dir,
      workspaceId: "ws_portable_001",
      label: "External drive case",
      createdAt: "2026-07-06T12:00:00.000Z",
      createdBy: "workspace-package-test",
      coreVersion: "0.1.0",
      description: "Portable accountability workspace"
    });

    expect(workspace).toEqual({
      workspaceId: "ws_portable_001",
      label: "External drive case",
      rootDir: resolve(dir),
      manifestPath: join(resolve(dir), "cestus-workspace.json"),
      paths: {
        ledgerPath: join(resolve(dir), "ledger", "ontology.sqlite"),
        blobRoot: join(resolve(dir), "blobs"),
        derivativeRoot: join(resolve(dir), "derivatives"),
        jobRoot: join(resolve(dir), "jobs"),
        projectionRoot: join(resolve(dir), "projections"),
        cacheRoot: join(resolve(dir), "cache"),
        configRoot: join(resolve(dir), "config")
      }
    });
    expect(existsSync(join(dir, "ledger"))).toBe(true);
    expect(existsSync(join(dir, "blobs"))).toBe(true);
    expect(existsSync(join(dir, "derivatives"))).toBe(true);
    expect(existsSync(join(dir, "jobs"))).toBe(true);
    expect(existsSync(join(dir, "projections"))).toBe(true);
    expect(existsSync(join(dir, "cache"))).toBe(true);
    expect(existsSync(join(dir, "config"))).toBe(true);

    const manifest = readPortableWorkspaceManifest({
      manifestPath: workspace.manifestPath
    });
    expect(manifest).toEqual({
      version: 1,
      layoutVersion: 1,
      workspaceId: "ws_portable_001",
      label: "External drive case",
      createdAt: "2026-07-06T12:00:00.000Z",
      createdBy: "workspace-package-test",
      coreVersion: "0.1.0",
      description: "Portable accountability workspace"
    });
    expect(JSON.stringify(manifest)).not.toMatch(/token|secret|password|oauth|credential|api[_-]?key|private[_-]?key|session/i);

    const mounted = mountPortableWorkspace({ rootDir: dir });
    expect(mounted.ok).toBe(true);
    if (mounted.ok) {
      expect(mounted.workspace.paths.ledgerPath).toBe(join(resolve(dir), "ledger", "ontology.sqlite"));
      expect(mounted.workspace.workspaceId).toBe("ws_portable_001");
    }
  });

  it("derives all canonical paths under the resolved root", () => {
    const paths = portableWorkspacePaths(dir);

    expect(paths).toEqual({
      manifestPath: join(resolve(dir), "cestus-workspace.json"),
      ledgerPath: join(resolve(dir), "ledger", "ontology.sqlite"),
      blobRoot: join(resolve(dir), "blobs"),
      derivativeRoot: join(resolve(dir), "derivatives"),
      jobRoot: join(resolve(dir), "jobs"),
      projectionRoot: join(resolve(dir), "projections"),
      cacheRoot: join(resolve(dir), "cache"),
      configRoot: join(resolve(dir), "config")
    });
    for (const value of Object.values(paths)) {
      expect(value.startsWith(resolve(dir))).toBe(true);
    }
  });

  it("fails closed when the root is missing or uninitialized", () => {
    const missing = mountPortableWorkspace({ rootDir: join(dir, "missing") });
    expect(missing).toEqual({
      ok: false,
      diagnostic: {
        code: "workspace-root-missing",
        message: "Portable workspace root does not exist.",
        allowedRepairActions: ["mount the external drive", "check CESTUS_WORKSPACE_ROOT"]
      }
    });

    const uninitialized = mountPortableWorkspace({ rootDir: dir });
    expect(uninitialized).toEqual({
      ok: false,
      diagnostic: {
        code: "workspace-manifest-missing",
        message: "Portable workspace manifest is missing.",
        allowedRepairActions: ["run the explicit portable workspace create command"]
      }
    });
  });

  it("rejects invalid JSON, unsupported versions, layout conflicts, and secret-looking keys", () => {
    writeFileSync(join(dir, "cestus-workspace.json"), "{not json");
    expect(mountPortableWorkspace({ rootDir: dir })).toMatchObject({
      ok: false,
      diagnostic: { code: "workspace-manifest-invalid-json" }
    });

    writeFileSync(
      join(dir, "cestus-workspace.json"),
      JSON.stringify({
        version: 2,
        layoutVersion: 1,
        workspaceId: "ws_portable_002",
        label: "Unsupported",
        createdAt: "2026-07-06T12:00:00.000Z",
        createdBy: "test",
        coreVersion: "0.1.0"
      })
    );
    expect(mountPortableWorkspace({ rootDir: dir })).toMatchObject({
      ok: false,
      diagnostic: { code: "workspace-manifest-unsupported-version" }
    });

    writeFileSync(
      join(dir, "cestus-workspace.json"),
      JSON.stringify({
        version: 1,
        layoutVersion: 1,
        workspaceId: "ws_portable_003",
        label: "Secret-bearing",
        createdAt: "2026-07-06T12:00:00.000Z",
        createdBy: "test",
        coreVersion: "0.1.0",
        authToken: "do-not-store"
      })
    );
    expect(mountPortableWorkspace({ rootDir: dir })).toMatchObject({
      ok: false,
      diagnostic: { code: "workspace-secret-material-rejected" }
    });
  });

  it("fails closed for layout conflicts and unavailable ledger paths", () => {
    writeFileSync(join(dir, "blobs"), "not a directory");
    writeFileSync(
      join(dir, "cestus-workspace.json"),
      JSON.stringify({
        version: 1,
        layoutVersion: 1,
        workspaceId: "ws_portable_004",
        label: "Layout conflict",
        createdAt: "2026-07-06T12:00:00.000Z",
        createdBy: "test",
        coreVersion: "0.1.0"
      })
    );

    expect(mountPortableWorkspace({ rootDir: dir })).toMatchObject({
      ok: false,
      diagnostic: { code: "workspace-layout-conflict" }
    });

    rmSync(dir, { recursive: true, force: true });
    mkdirSync(join(dir, "ledger", "ontology.sqlite"), { recursive: true });
    mkdirSync(join(dir, "blobs"), { recursive: true });
    mkdirSync(join(dir, "derivatives"), { recursive: true });
    mkdirSync(join(dir, "jobs"), { recursive: true });
    mkdirSync(join(dir, "projections"), { recursive: true });
    mkdirSync(join(dir, "cache"), { recursive: true });
    mkdirSync(join(dir, "config"), { recursive: true });
    writeFileSync(
      join(dir, "cestus-workspace.json"),
      JSON.stringify({
        version: 1,
        layoutVersion: 1,
        workspaceId: "ws_portable_005",
        label: "Ledger path unavailable",
        createdAt: "2026-07-06T12:00:00.000Z",
        createdBy: "test",
        coreVersion: "0.1.0"
      })
    );

    expect(mountPortableWorkspace({ rootDir: dir })).toMatchObject({
      ok: false,
      diagnostic: { code: "workspace-ledger-unavailable" }
    });
  });
});
