import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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
    expect(existsSync(join(dir, "ledger", "ontology.sqlite"))).toBe(false);
    expect(readdirSync(join(dir, "blobs"))).toEqual([]);
    expect(readdirSync(join(dir, "derivatives"))).toEqual([]);
    expect(readdirSync(join(dir, "jobs"))).toEqual([]);

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

  it("fails create before writing the manifest when the ledger path is unavailable", () => {
    mkdirSync(join(dir, "ledger", "ontology.sqlite"), { recursive: true });

    expect(() =>
      createPortableWorkspace({
        rootDir: dir,
        workspaceId: "ws_portable_create_conflict",
        label: "Ledger conflict",
        createdAt: "2026-07-06T12:00:00.000Z",
        createdBy: "workspace-package-test",
        coreVersion: "0.1.0"
      })
    ).toThrow(/ledger path is unavailable/i);
    expect(existsSync(join(dir, "cestus-workspace.json"))).toBe(false);
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

  it.each([
    ["nested token", { nested: { token: "do-not-store" } }],
    ["array secret", { providers: [{ secret: "do-not-store" }] }],
    ["api_key", { api_key: "do-not-store" }],
    ["api-key", { "api-key": "do-not-store" }],
    ["privateKey", { privateKey: "do-not-store" }],
    ["credential", { credential: "do-not-store" }],
    ["oauth", { oauth: "do-not-store" }],
    ["session", { session: "do-not-store" }]
  ])("rejects secret-looking manifest keys in %s", (_label, extraFields) => {
    writeValidManifest(dir, "ws_portable_secret_matrix", extraFields);

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

  it("fails closed when a layout directory is a symlink outside the workspace root", () => {
    const outside = mkdtempSync(join(tmpdir(), "cestus-workspace-outside-"));
    try {
      mkdirSync(join(dir, "ledger"), { recursive: true });
      mkdirSync(join(dir, "derivatives"), { recursive: true });
      mkdirSync(join(dir, "jobs"), { recursive: true });
      mkdirSync(join(dir, "projections"), { recursive: true });
      mkdirSync(join(dir, "cache"), { recursive: true });
      mkdirSync(join(dir, "config"), { recursive: true });
      symlinkSync(outside, join(dir, "blobs"), "dir");
      writeValidManifest(dir, "ws_portable_symlink");

      expect(mountPortableWorkspace({ rootDir: dir })).toMatchObject({
        ok: false,
        diagnostic: { code: "workspace-layout-conflict" }
      });
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("fails closed when the ledger path exists as a non-regular file", () => {
    mkdirSync(join(dir, "ledger"), { recursive: true });
    mkdirSync(join(dir, "blobs"), { recursive: true });
    mkdirSync(join(dir, "derivatives"), { recursive: true });
    mkdirSync(join(dir, "jobs"), { recursive: true });
    mkdirSync(join(dir, "projections"), { recursive: true });
    mkdirSync(join(dir, "cache"), { recursive: true });
    mkdirSync(join(dir, "config"), { recursive: true });
    symlinkSync(join(dir, "missing-target.sqlite"), join(dir, "ledger", "ontology.sqlite"));
    writeValidManifest(dir, "ws_portable_non_regular_ledger");

    expect(mountPortableWorkspace({ rootDir: dir })).toMatchObject({
      ok: false,
      diagnostic: { code: "workspace-ledger-unavailable" }
    });
  });
});

function writeValidManifest(rootDir: string, workspaceId: string, extraFields: Record<string, unknown> = {}): void {
  writeFileSync(
    join(rootDir, "cestus-workspace.json"),
    JSON.stringify({
      version: 1,
      layoutVersion: 1,
      workspaceId,
      label: "Portable workspace",
      createdAt: "2026-07-06T12:00:00.000Z",
      createdBy: "test",
      coreVersion: "0.1.0",
      ...extraFields
    })
  );
}
