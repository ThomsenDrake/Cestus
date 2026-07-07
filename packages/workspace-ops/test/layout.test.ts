import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatWorkspaceOpsJson, workspaceOpsEnvelopeSchema } from "../src/contracts.js";
import { NodeWorkspaceFileSystem, type WorkspaceFileSystem, type WorkspaceStats } from "../src/filesystem.js";
import {
  provisionalWorkspaceLayoutContractVersion,
  resolveWorkspaceLayout
} from "../src/layout.js";

class RecordingReadOnlyFs implements WorkspaceFileSystem {
  readonly files = new Map<string, string>();
  readonly directories = new Set<string>();
  readonly readFailures = new Set<string>();
  readonly statCalls: string[] = [];
  readonly readCalls: string[] = [];
  readonly listCalls: string[] = [];
  readonly realpathCalls: string[] = [];

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.directories.has(path);
  }

  async readText(path: string): Promise<string> {
    this.readCalls.push(path);
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
    return [];
  }

  async realpath(path: string): Promise<string> {
    this.realpathCalls.push(path);
    return path;
  }

  async availableBytes(): Promise<number | undefined> {
    return 1_000_000;
  }
}

describe("resolveWorkspaceLayout", () => {
  it("reports a missing root without creating directories at the expected mount path", async () => {
    const missingRoot = join(tmpdir(), `cestus-missing-root-${randomUUID()}`);
    const fileSystem = new NodeWorkspaceFileSystem();

    expect(existsSync(missingRoot)).toBe(false);

    const result = await resolveWorkspaceLayout({ rootPath: missingRoot }, fileSystem);

    expect(result.mountStatus.status).toBe("missing");
    expect(result.workspace).toBeUndefined();
    expect(result.layout).toBeUndefined();
    expect(result.mountStatus.nextCommandHints[0]).toMatchObject({
      allowedNextCommands: ["detect drive"],
      requiresHumanApproval: false
    });
    expect(result.envelope.payload).toEqual(result.mountStatus);
    expect(workspaceOpsEnvelopeSchema.parse(result.envelope)).toEqual(result.envelope);
    expect(JSON.parse(formatWorkspaceOpsJson(result.envelope))).toMatchObject({
      command: "detect drive",
      status: "blocked",
      payload: result.mountStatus
    });
    expect(existsSync(missingRoot)).toBe(false);
  });

  it("reports a wrong drive when the root exists without the workspace manifest", async () => {
    const rootPath = mkdtempSync(join(tmpdir(), "cestus-wrong-drive-"));
    const fileSystem = new NodeWorkspaceFileSystem();

    try {
      const result = await resolveWorkspaceLayout({ rootPath }, fileSystem);

      expect(result.mountStatus.status).toBe("wrong-drive");
      expect(result.workspace).toBeUndefined();
      expect(result.diagnostics[0]?.category).toBe("manifest");
      expect(result.proposedActions[0]).toMatchObject({
        kind: "select-workspace",
        mutatesCanonicalState: false
      });
      expect(existsSync(join(rootPath, "cestus-workspace.json"))).toBe(false);
      expect(existsSync(join(rootPath, "ledger"))).toBe(false);
      expect(result.envelope.payload).toEqual(result.mountStatus);
      expect(workspaceOpsEnvelopeSchema.parse(result.envelope)).toEqual(result.envelope);
    } finally {
      rmSync(rootPath, { recursive: true, force: true });
    }
  });

  it("reports a wrong drive when the manifest identity does not match the expected workspace", async () => {
    const fileSystem = new RecordingReadOnlyFs();
    fileSystem.directories.add("/mnt/portable");
    fileSystem.files.set(
      "/mnt/portable/cestus-workspace.json",
      JSON.stringify({ workspaceId: "ws_other_workspace", label: "Other workspace", version: 1 })
    );

    const result = await resolveWorkspaceLayout(
      { rootPath: "/mnt/portable", expectedWorkspaceId: "ws_expected_workspace" },
      fileSystem
    );

    expect(result.mountStatus.status).toBe("wrong-drive");
    expect(result.workspace).toBeUndefined();
    expect(result.layout).toBeUndefined();
    expect(result.diagnostics[0]).toMatchObject({
      category: "manifest",
      durable: false
    });
    expect(JSON.stringify(result)).not.toContain("ws_other_workspace");
  });

  it("rejects traversal manifest names without reading outside the selected root", async () => {
    const fileSystem = new RecordingReadOnlyFs();
    fileSystem.directories.add("/mnt/wrong-drive");
    fileSystem.directories.add("/mnt/real-drive");
    fileSystem.files.set(
      "/mnt/real-drive/cestus-workspace.json",
      JSON.stringify({ workspaceId: "ws_real_workspace", label: "Real workspace", version: 1 })
    );

    const result = await resolveWorkspaceLayout(
      { rootPath: "/mnt/wrong-drive", manifestName: "../real-drive/cestus-workspace.json" },
      fileSystem
    );

    expect(result.mountStatus.status).not.toBe("available");
    expect(result.workspace).toBeUndefined();
    expect(result.layout).toBeUndefined();
    expect(fileSystem.readCalls).toEqual([]);
    expect(result.diagnostics[0]).toMatchObject({
      diagnosticId: "diag_workspace_manifest_name_unsafe",
      category: "manifest"
    });
    expect(JSON.stringify(result.envelope)).not.toContain("ws_real_workspace");
  });

  it("rejects absolute manifest names without reading outside the selected root", async () => {
    const fileSystem = new RecordingReadOnlyFs();
    fileSystem.directories.add("/mnt/wrong-drive");
    fileSystem.directories.add("/mnt/real-drive");
    fileSystem.files.set(
      "/mnt/real-drive/cestus-workspace.json",
      JSON.stringify({ workspaceId: "ws_real_workspace", label: "Real workspace", version: 1 })
    );

    const result = await resolveWorkspaceLayout(
      { rootPath: "/mnt/wrong-drive", manifestName: "/mnt/real-drive/cestus-workspace.json" },
      fileSystem
    );

    expect(result.mountStatus.status).not.toBe("available");
    expect(result.workspace).toBeUndefined();
    expect(result.layout).toBeUndefined();
    expect(fileSystem.readCalls).toEqual([]);
    expect(result.diagnostics[0]).toMatchObject({
      diagnosticId: "diag_workspace_manifest_name_unsafe",
      category: "manifest"
    });
    expect(JSON.stringify(result.envelope)).not.toContain("ws_real_workspace");
  });

  it("reports an unreadable manifest without leaking manifest content", async () => {
    const fileSystem = new RecordingReadOnlyFs();
    fileSystem.directories.add("/mnt/portable");
    fileSystem.files.set(
      "/mnt/portable/cestus-workspace.json",
      JSON.stringify({ workspaceId: "ws_ops_001", label: "api key abcdef", version: 1 })
    );

    const result = await resolveWorkspaceLayout({ rootPath: "/mnt/portable" }, fileSystem);

    expect(result.mountStatus.status).toBe("unreadable");
    expect(result.workspace).toBeUndefined();
    expect(result.layout).toBeUndefined();
    expect(result.diagnostics[0]).toMatchObject({
      category: "manifest",
      durable: false
    });
    expect(formatWorkspaceOpsJson(result.envelope)).not.toMatch(/api key|abcdef/i);
  });

  it("resolves the provisional layout through a replaceable adapter without creating layout roots", async () => {
    const rootPath = mkdtempSync(join(tmpdir(), "cestus-layout-"));
    const fileSystem = new NodeWorkspaceFileSystem();
    writeFileSync(
      join(rootPath, "cestus-workspace.json"),
      `${JSON.stringify({ workspaceId: "ws_ops_001", label: "Ops Fixture", version: 1 })}\n`,
      "utf8"
    );

    try {
      const result = await resolveWorkspaceLayout({ rootPath }, fileSystem);

      expect(result.mountStatus.status).toBe("available");
      expect(result.workspace).toMatchObject({
        workspaceId: "ws_ops_001",
        label: "Ops Fixture",
        manifestVersion: 1,
        layoutContractVersion: provisionalWorkspaceLayoutContractVersion
      });
      expect(result.layout).toMatchObject({
        manifestPath: join(rootPath, "cestus-workspace.json"),
        ledgerPath: join(rootPath, "ledger", "ontology.sqlite"),
        blobRoot: join(rootPath, "blobs"),
        derivativeRoot: join(rootPath, "derivatives"),
        jobRoot: join(rootPath, "jobs"),
        projectionRoot: join(rootPath, "projections"),
        diagnosticsRoot: join(rootPath, "diagnostics"),
        backupRoot: join(rootPath, "backups")
      });
      expect(Object.keys(result.envelope)).not.toContain("layout");
      expect(result.envelope.payload).toEqual(result.mountStatus);
      expect(workspaceOpsEnvelopeSchema.parse(result.envelope)).toEqual(result.envelope);
      expect(JSON.parse(formatWorkspaceOpsJson(result.envelope))).toMatchObject({
        command: "detect drive",
        status: "ready",
        workspace: result.workspace,
        payload: result.mountStatus
      });
      expect(existsSync(join(rootPath, "ledger"))).toBe(false);
      expect(existsSync(join(rootPath, "projections"))).toBe(false);
    } finally {
      rmSync(rootPath, { recursive: true, force: true });
    }
  });

  it("accepts the portable workspace manifest shape without accepting arbitrary extra fields", async () => {
    const fileSystem = new RecordingReadOnlyFs();
    fileSystem.directories.add("/mnt/portable");
    fileSystem.files.set(
      "/mnt/portable/cestus-workspace.json",
      JSON.stringify({
        version: 1,
        layoutVersion: 1,
        workspaceId: "ws_portable_workspace",
        label: "Portable workspace",
        createdAt: "2026-07-07T00:20:00.000Z",
        createdBy: "layout-test",
        coreVersion: "0.1.0",
        description: "Investigation workspace"
      })
    );

    const result = await resolveWorkspaceLayout({ rootPath: "/mnt/portable" }, fileSystem);

    expect(result.mountStatus.status).toBe("available");
    expect(result.workspace).toMatchObject({
      workspaceId: "ws_portable_workspace",
      label: "Portable workspace",
      manifestVersion: 1
    });
    expect(result.layout).toBeDefined();
    expect(formatWorkspaceOpsJson(result.envelope)).not.toContain("createdBy");
  });
});
