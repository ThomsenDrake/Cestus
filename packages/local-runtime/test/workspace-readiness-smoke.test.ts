import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createPortableWorkspace } from "../../workspace/src/index.js";
import {
  runLocalWorkspaceReadinessSmoke,
  runLocalWorkspaceReadinessSmokeCli
} from "../src/workspace-readiness-smoke.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

describe("runLocalWorkspaceReadinessSmoke", () => {
  it("proves the fresh portable workspace, ingestion, and workspace ops chain", async () => {
    const workspaceRoot = tempDir("cestus-smoke-workspace-");
    const sourceRoot = tempDir("cestus-smoke-source-");

    const report = await runLocalWorkspaceReadinessSmoke({
      workspaceRoot,
      sourceRoot,
      workspaceId: "ws_smoke_001",
      workspaceLabel: "Smoke Workspace",
      sourceCollectionId: "src_smoke_001",
      sourceLabel: "Smoke Source",
      scanBatchId: "scan_smoke_001",
      importBatchId: "imp_smoke_001",
      approvedBy: "actor_smoke",
      now: () => "2026-07-06T12:00:00.000Z"
    });

    expect(report).toMatchObject({
      schemaVersion: "local-workspace-readiness-smoke.v1",
      ok: true,
      status: "ready",
      workspace: {
        workspaceId: "ws_smoke_001",
        label: "Smoke Workspace",
        manifestVersion: 1
      },
      source: {
        sourceCollectionId: "src_smoke_001",
        label: "Smoke Source",
        fixtureFileCount: 1
      },
      ingestion: {
        evidenceCount: 1,
        blobCount: 1,
        jobCount: 3,
        jobKinds: ["import", "local-parse", "scan"],
        diagnosticCount: 0
      },
      workspaceOps: {
        verifyStatus: "ready",
        diskUsageStatus: "ready",
        manifestExportStatus: "ready",
        backupCheckStatus: "ready"
      }
    });
    expect(report.checks.map((check) => check.checkId)).toEqual([
      "workspace.create",
      "workspace.mount",
      "ingestion.mount-adapter",
      "ingestion.register-source",
      "ingestion.dry-run",
      "ingestion.approve-import",
      "ingestion.import",
      "ingestion.jobs",
      "ingestion.diagnostics",
      "workspace-ops.verify",
      "workspace-ops.disk-usage",
      "workspace-ops.manifest-export",
      "workspace-ops.backup-check"
    ]);
    expect(report.checks.every((check) => check.ok)).toBe(true);
  });

  it("returns blocked JSON instead of throwing when the workspace already exists", async () => {
    const workspaceRoot = tempDir("cestus-smoke-existing-workspace-");
    const sourceRoot = tempDir("cestus-smoke-existing-source-");
    createPortableWorkspace({
      rootDir: workspaceRoot,
      workspaceId: "ws_smoke_existing_001",
      label: "Existing Smoke Workspace",
      createdAt: "2026-07-06T11:00:00.000Z",
      createdBy: "workspace-readiness-smoke-test"
    });

    const report = await runLocalWorkspaceReadinessSmoke({
      workspaceRoot,
      sourceRoot,
      workspaceId: "ws_smoke_existing_001",
      workspaceLabel: "Smoke token=secret123 Workspace",
      sourceCollectionId: "src_smoke_existing_001",
      sourceLabel: "Existing Smoke Source",
      scanBatchId: "scan_smoke_existing_001",
      importBatchId: "imp_smoke_existing_001",
      approvedBy: "actor_smoke",
      now: () => "2026-07-06T12:00:00.000Z"
    });

    expect(report).toMatchObject({
      schemaVersion: "local-workspace-readiness-smoke.v1",
      ok: false,
      status: "blocked"
    });
    expect(report.checks[0]).toMatchObject({
      checkId: "workspace.create",
      ok: false,
      status: "blocked"
    });
    expect(JSON.stringify(report.diagnostics)).not.toContain("secret123");
    expect(JSON.stringify(report.diagnostics)).not.toContain("token=");
  });
});

describe("runLocalWorkspaceReadinessSmokeCli", () => {
  it("prints stable JSON from argv", async () => {
    const workspaceRoot = tempDir("cestus-smoke-cli-workspace-");
    const sourceRoot = tempDir("cestus-smoke-cli-source-");
    const lines: string[] = [];

    const exitCode = await runLocalWorkspaceReadinessSmokeCli(
      [
        "--json",
        "--workspace",
        workspaceRoot,
        "--source",
        sourceRoot,
        "--workspace-id",
        "ws_smoke_cli_001",
        "--source-id",
        "src_smoke_cli_001",
        "--created-at",
        "2026-07-06T12:00:00.000Z"
      ],
      {
        stdout: (line) => lines.push(line)
      }
    );

    expect(exitCode).toBe(0);
    const output = JSON.parse(lines.join(""));
    expect(output).toMatchObject({
      schemaVersion: "local-workspace-readiness-smoke.v1",
      ok: true,
      status: "ready",
      workspace: {
        workspaceId: "ws_smoke_cli_001"
      },
      source: {
        sourceCollectionId: "src_smoke_cli_001"
      }
    });
  });

  it("fails closed without deleting or overwriting an initialized workspace", async () => {
    const workspaceRoot = tempDir("cestus-smoke-cli-existing-");
    const firstLines: string[] = [];
    const secondLines: string[] = [];

    expect(
      await runLocalWorkspaceReadinessSmokeCli(
        [
          "--json",
          "--workspace",
          workspaceRoot,
          "--workspace-id",
          "ws_smoke_existing_001",
          "--created-at",
          "2026-07-06T12:00:00.000Z"
        ],
        { stdout: (line) => firstLines.push(line) }
      )
    ).toBe(0);

    const exitCode = await runLocalWorkspaceReadinessSmokeCli(
      [
        "--json",
        "--workspace",
        workspaceRoot,
        "--workspace-id",
        "ws_smoke_existing_001",
        "--created-at",
        "2026-07-06T12:00:00.000Z"
      ],
      { stdout: (line) => secondLines.push(line) }
    );

    expect(exitCode).toBe(3);
    expect(JSON.parse(secondLines.join(""))).toMatchObject({
      schemaVersion: "local-workspace-readiness-smoke.v1",
      ok: false,
      status: "blocked"
    });
  });

  it("keeps the npm operator command stdout parseable as JSON", () => {
    const workspaceRoot = tempDir("cestus-smoke-npm-workspace-");
    const sourceRoot = tempDir("cestus-smoke-npm-source-");

    const result = spawnSync(
      "npm",
      [
        "run",
        "local:workspace:smoke",
        "--",
        "--json",
        "--workspace",
        workspaceRoot,
        "--source",
        sourceRoot,
        "--workspace-id",
        "ws_smoke_npm_001",
        "--source-id",
        "src_smoke_npm_001",
        "--created-at",
        "2026-07-06T12:00:00.000Z"
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: projectDefaultNpmEnv()
      }
    );

    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain("ExperimentalWarning");
    expect(JSON.parse(result.stdout)).toMatchObject({
      schemaVersion: "local-workspace-readiness-smoke.v1",
      ok: true,
      status: "ready"
    });
  });

  it("prints safe blocked JSON for unsupported secret-shaped options", async () => {
    const lines: string[] = [];

    const exitCode = await runLocalWorkspaceReadinessSmokeCli(
      ["--api-key=secret-123"],
      { stdout: (line) => lines.push(line) }
    );

    expect(exitCode).toBe(2);
    const output = JSON.parse(lines.join(""));
    expect(output).toMatchObject({
      schemaVersion: "local-workspace-readiness-smoke.v1",
      ok: false,
      status: "blocked",
      diagnostics: [
        expect.objectContaining({
          code: "unknown-option"
        })
      ]
    });
    expect(JSON.stringify(output)).not.toContain("api-key");
    expect(JSON.stringify(output)).not.toContain("secret-123");
  });

  it("prints safe blocked JSON for missing option values", async () => {
    const lines: string[] = [];

    const exitCode = await runLocalWorkspaceReadinessSmokeCli(
      ["--workspace"],
      { stdout: (line) => lines.push(line) }
    );

    expect(exitCode).toBe(2);
    expect(JSON.parse(lines.join(""))).toMatchObject({
      schemaVersion: "local-workspace-readiness-smoke.v1",
      ok: false,
      status: "blocked",
      diagnostics: [
        expect.objectContaining({
          code: "missing-option-value",
          optionName: "workspace"
        })
      ]
    });
  });

  it("prints usage for help", async () => {
    const lines: string[] = [];

    const exitCode = await runLocalWorkspaceReadinessSmokeCli(
      ["--help"],
      { stdout: (line) => lines.push(line) }
    );

    expect(exitCode).toBe(0);
    expect(lines.join("")).toContain("Usage: npm run local:workspace:smoke -- --json");
  });
});

function projectDefaultNpmEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.NPM_CONFIG_LOGLEVEL;
  delete env.npm_config_loglevel;
  return env;
}
