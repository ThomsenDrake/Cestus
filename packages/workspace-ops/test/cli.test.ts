import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { createPortableWorkspace } from "../../workspace/src/index.js";
import { createWorkspaceOpsEnvelope } from "../src/contracts.js";
import { runWorkspaceOpsCli } from "../src/cli.js";

const execFileAsync = promisify(execFile);

interface RejectedExecFileError extends Error {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

async function expectRejectedExecFile(args: readonly string[]): Promise<RejectedExecFileError> {
  try {
    await execFileAsync("node", [...args]);
  } catch (error) {
    return error as RejectedExecFileError;
  }
  throw new Error("Expected executable command to fail.");
}

describe("runWorkspaceOpsCli", () => {
  it("prints JSON for a supported command and maps ready status to exit code 0", async () => {
    const lines: string[] = [];
    const exitCode = await runWorkspaceOpsCli(["verify", "workspace", "--root", "/workspace"], {
      stdout: (line) => lines.push(line),
      operations: {
        verifyWorkspace: async () =>
          createWorkspaceOpsEnvelope({
            command: "verify workspace",
            status: "ready",
            payload: {
              schemaVersion: "workspace-ops.v1",
              mountStatus: {
                status: "available",
                safeMessage: "Workspace is available.",
                nextCommandHints: [
                  {
                    allowedNextCommands: ["verify workspace"],
                    safeReason: "Workspace can be verified.",
                    requiresHumanApproval: false
                  }
                ]
              },
              manifest: {
                readable: true,
                valid: true,
                manifestVersion: 1,
                safeSummary: "Workspace manifest is readable."
              },
              layout: {
                contractVersion: "portable-workspace-layout.v1-provisional",
                readable: true,
                requiredRoots: []
              },
              ledger: { readable: true, eventCount: 0, highWaterMark: 0 },
              blobStore: {
                available: true,
                contentAddressedRootCount: 0,
                aggregateBytes: 0,
                missingBlobCount: 0,
                hashMismatchCount: 0
              },
              projections: { available: true, staleCount: 0, rebuildable: true },
              jobs: { available: true, queuedCount: 0, failedCount: 0 },
              diagnostics: { visible: true, errorCount: 0, warningCount: 0 },
              backup: { manifestAvailable: false, stale: false }
            }
          })
      }
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(lines.join(""))).toMatchObject({
      schemaVersion: "workspace-ops.v1",
      command: "verify workspace",
      status: "ready"
    });
  });

  it("maps degraded and blocked envelopes to deterministic exit codes", async () => {
    const degraded = await runWorkspaceOpsCli(["disk", "usage", "--root", "/workspace"], {
      stdout: () => undefined,
      operations: {
        diskUsage: async () =>
          createWorkspaceOpsEnvelope({
            command: "disk usage",
            status: "degraded",
            payload: {
              schemaVersion: "workspace-ops.v1",
              thresholdWarnings: ["Disk space is below the warning threshold."],
              roots: [],
              categories: [],
              totalBytes: 0
            },
            diagnostics: [
              {
                diagnosticId: "diag_disk_warning",
                severity: "warning",
                category: "disk",
                message: "Disk space is below the warning threshold.",
                durable: false,
                relatedIds: [],
                repairHint: { allowedNextCommands: ["disk usage"], requiresHumanApproval: false }
              }
            ]
          })
      }
    });
    const blocked = await runWorkspaceOpsCli(["detect", "drive", "--root", "/missing"], {
      stdout: () => undefined,
      operations: {
        detectDrive: async () =>
          createWorkspaceOpsEnvelope({
            command: "detect drive",
            status: "blocked",
            payload: {
              status: "missing",
              safeMessage: "Workspace root is not available.",
              nextCommandHints: [
                {
                  allowedNextCommands: ["detect drive"],
                  safeReason: "Mount the drive and rerun drive detection.",
                  requiresHumanApproval: false
                }
              ]
            }
          })
      }
    });

    expect(degraded).toBe(2);
    expect(blocked).toBe(3);
  });

  it("prints stable JSON errors for unsupported commands", async () => {
    const lines: string[] = [];
    const exitCode = await runWorkspaceOpsCli(["unknown"], {
      stdout: (line) => lines.push(line),
      operations: {}
    });

    expect(exitCode).toBe(1);
    expect(JSON.parse(lines.join(""))).toEqual({
      ok: false,
      error: {
        code: "WORKSPACE_OPS_COMMAND_UNSUPPORTED",
        command: "unknown",
        message: "Unsupported workspace ops command unknown."
      }
    });
  });

  it("redacts secret-shaped argv in unsupported command errors", async () => {
    const lines: string[] = [];
    const exitCode = await runWorkspaceOpsCli(["unknown", "--access-token", "abc123"], {
      stdout: (line) => lines.push(line),
      operations: {}
    });

    const output = lines.join("");
    expect(exitCode).toBe(1);
    expect(JSON.parse(output)).toEqual({
      ok: false,
      error: {
        code: "WORKSPACE_OPS_COMMAND_UNSUPPORTED",
        command: "unsupported command",
        message: "Unsupported workspace ops command unsupported command."
      }
    });
    expect(output).not.toContain("access-token");
    expect(output).not.toContain("abc123");
  });

  it("redacts no-value secret flags in unsupported command errors", async () => {
    const lines: string[] = [];
    const exitCode = await runWorkspaceOpsCli(["unknown", "--access-token"], {
      stdout: (line) => lines.push(line),
      operations: {}
    });

    const output = lines.join("");
    expect(exitCode).toBe(1);
    expect(JSON.parse(output)).toEqual({
      ok: false,
      error: {
        code: "WORKSPACE_OPS_COMMAND_UNSUPPORTED",
        command: "unsupported command",
        message: "Unsupported workspace ops command unsupported command."
      }
    });
    expect(output).not.toContain("access-token");
  });

  it("prints stable JSON runtime-wiring errors for supported but uninjected commands", async () => {
    const lines: string[] = [];
    const exitCode = await runWorkspaceOpsCli(["verify", "workspace"], {
      stdout: (line) => lines.push(line),
      operations: {}
    });

    expect(exitCode).toBe(1);
    expect(JSON.parse(lines.join(""))).toEqual({
      ok: false,
      error: {
        code: "WORKSPACE_OPS_RUNTIME_WIRING_REQUIRED",
        command: "verify workspace",
        message: "Workspace ops command verify workspace requires injected operations; pure CLI handlers do not use hidden globals."
      }
    });
  });

  it("does not echo no-value secret flags in pure runtime-wiring errors", async () => {
    const lines: string[] = [];
    const exitCode = await runWorkspaceOpsCli(["verify", "workspace", "--authorization"], {
      stdout: (line) => lines.push(line),
      operations: {}
    });

    const output = lines.join("");
    expect(exitCode).toBe(1);
    expect(JSON.parse(output)).toEqual({
      ok: false,
      error: {
        code: "WORKSPACE_OPS_RUNTIME_WIRING_REQUIRED",
        command: "verify workspace",
        message: "Workspace ops command verify workspace requires injected operations; pure CLI handlers do not use hidden globals."
      }
    });
    expect(output).not.toContain("authorization");
  });

  it("returns JSON when an injected operation throws without leaking raw error text", async () => {
    const lines: string[] = [];
    const exitCode = await runWorkspaceOpsCli(["diagnostics", "inspect"], {
      stdout: (line) => lines.push(line),
      operations: {
        diagnosticsInspect: async () => {
          throw new Error("access_token=abc123");
        }
      }
    });

    const output = lines.join("");
    expect(exitCode).toBe(1);
    expect(JSON.parse(output)).toEqual({
      ok: false,
      error: {
        code: "WORKSPACE_OPS_OPERATION_FAILED",
        command: "diagnostics inspect",
        message: "Workspace ops command diagnostics inspect failed before producing a JSON envelope."
      }
    });
    expect(output).not.toContain("access_token");
    expect(output).not.toContain("abc123");
  });

  it("prints usage text for help", async () => {
    const lines: string[] = [];
    const exitCode = await runWorkspaceOpsCli(["--help"], {
      stdout: (line) => lines.push(line),
      operations: {}
    });

    expect(exitCode).toBe(0);
    expect(lines.join("")).toContain("Usage: cestus-workspace");
  });
});

describe("cestus-workspace executable", () => {
  it("exposes help without runtime wiring", async () => {
    const { stdout, stderr } = await execFileAsync("node", [
      "packages/workspace-ops/bin/cestus-workspace.mjs",
      "--help"
    ]);

    expect(stdout).toContain("Usage: cestus-workspace");
    expect(stderr).toBe("");
  });

  it("runs real executable detect and verify commands against a canonical workspace", async () => {
    const rootPath = mkdtempSync(join(tmpdir(), "cestus-workspace-cli-"));
    try {
      createPortableWorkspace({
        rootDir: rootPath,
        workspaceId: "ws_cli_ops",
        label: "CLI Ops Workspace",
        createdAt: "2026-07-06T12:00:00.000Z",
        createdBy: "workspace-ops-cli-test",
        coreVersion: "0.1.0"
      });

      const detected = await execFileAsync("node", [
        "packages/workspace-ops/bin/cestus-workspace.mjs",
        "detect",
        "drive",
        "--root",
        rootPath,
        "--workspace-id",
        "ws_cli_ops"
      ]);
      expect(JSON.parse(detected.stdout)).toMatchObject({
        schemaVersion: "workspace-ops.v1",
        command: "detect drive",
        status: "ready",
        workspace: { workspaceId: "ws_cli_ops" }
      });

      const verified = await execFileAsync("node", [
        "packages/workspace-ops/bin/cestus-workspace.mjs",
        "verify",
        "workspace",
        "--root",
        rootPath,
        "--workspace-id",
        "ws_cli_ops"
      ]);
      expect(JSON.parse(verified.stdout)).toMatchObject({
        schemaVersion: "workspace-ops.v1",
        command: "verify workspace",
        status: "ready",
        payload: { ledger: { eventCount: 0 } }
      });
      expect(verified.stderr).toBe("");
    } finally {
      rmSync(rootPath, { recursive: true, force: true });
    }
  });

  it("blocks existing zero-byte ledgers without mutating the file or leaking raw SQLite errors", async () => {
    const rootPath = mkdtempSync(join(tmpdir(), "cestus-workspace-cli-"));
    try {
      createPortableWorkspace({
        rootDir: rootPath,
        workspaceId: "ws_zero_byte_cli_ops",
        label: "Zero Byte CLI Ops Workspace",
        createdAt: "2026-07-06T12:00:00.000Z",
        createdBy: "workspace-ops-cli-test",
        coreVersion: "0.1.0"
      });
      const ledgerPath = join(rootPath, "ledger", "ontology.sqlite");
      writeFileSync(ledgerPath, "");
      const before = statSync(ledgerPath);

      const error = await expectRejectedExecFile([
        "packages/workspace-ops/bin/cestus-workspace.mjs",
        "verify",
        "workspace",
        "--root",
        rootPath,
        "--workspace-id",
        "ws_zero_byte_cli_ops"
      ]);

      expect(error.code).toBe(3);
      expect(error.stderr).toBe("");
      expect(JSON.parse(error.stdout)).toMatchObject({
        schemaVersion: "workspace-ops.v1",
        command: "verify workspace",
        status: "blocked",
        payload: { ledger: { readable: false, eventCount: 0, highWaterMark: 0 } }
      });
      expect(error.stdout).not.toMatch(/SQLITE|no such table|database disk image|malformed/i);
      expect(statSync(ledgerPath).size).toBe(before.size);
      expect(readFileSync(ledgerPath, "utf8")).toBe("");
    } finally {
      rmSync(rootPath, { recursive: true, force: true });
    }
  });

  it("returns command-specific blocked JSON for disk usage against a missing root", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "cestus-workspace-cli-"));
    const missingRoot = join(tempRoot, "missing-workspace");
    try {
      const error = await expectRejectedExecFile([
        "packages/workspace-ops/bin/cestus-workspace.mjs",
        "disk",
        "usage",
        "--root",
        missingRoot
      ]);

      expect(error.code).toBe(3);
      expect(error.stderr).toBe("");
      const output = JSON.parse(error.stdout);
      expect(output).toMatchObject({
        schemaVersion: "workspace-ops.v1",
        command: "disk usage",
        status: "blocked"
      });
      expect(output.command).not.toBe("verify workspace");
      expect(output.payload).toBeUndefined();
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("runs real executable projection rebuild-readiness commands against a canonical workspace", async () => {
    const rootPath = mkdtempSync(join(tmpdir(), "cestus-workspace-cli-"));
    try {
      createPortableWorkspace({
        rootDir: rootPath,
        workspaceId: "ws_projection_cli_ops",
        label: "Projection CLI Ops Workspace",
        createdAt: "2026-07-06T12:00:00.000Z",
        createdBy: "workspace-ops-cli-test",
        coreVersion: "0.1.0"
      });

      const result = await execFileAsync("node", [
        "packages/workspace-ops/bin/cestus-workspace.mjs",
        "projection",
        "rebuild-readiness",
        "--root",
        rootPath,
        "--workspace-id",
        "ws_projection_cli_ops"
      ]);

      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toMatchObject({
        schemaVersion: "workspace-ops.v1",
        command: "projection rebuild-readiness",
        status: "ready",
        payload: {
          mode: "readiness",
          requestedProjections: ["workspace"]
        }
      });
    } finally {
      rmSync(rootPath, { recursive: true, force: true });
    }
  });

  it("returns blocked JSON for a swapped workspace identity without leaking the actual id", async () => {
    const rootPath = mkdtempSync(join(tmpdir(), "cestus-workspace-cli-"));
    try {
      createPortableWorkspace({
        rootDir: rootPath,
        workspaceId: "ws_actual_cli_ops",
        label: "Actual CLI Ops Workspace",
        createdAt: "2026-07-06T12:00:00.000Z",
        createdBy: "workspace-ops-cli-test",
        coreVersion: "0.1.0"
      });

      await expect(
        execFileAsync("node", [
          "packages/workspace-ops/bin/cestus-workspace.mjs",
          "detect",
          "drive",
          "--root",
          rootPath,
          "--workspace-id",
          "ws_expected_cli_ops"
        ])
      ).rejects.toMatchObject({
        code: 3,
        stderr: ""
      });
    } finally {
      rmSync(rootPath, { recursive: true, force: true });
    }
  });

  it("redacts secret-shaped argv in executable operation failures", async () => {
    await expect(
      execFileAsync("node", [
        "packages/workspace-ops/bin/cestus-workspace.mjs",
        "verify",
        "workspace",
        "--access-token",
        "abc123"
      ])
    ).rejects.toMatchObject({
      code: 1,
      stderr: "",
      stdout: `${JSON.stringify({
        ok: false,
        error: {
          code: "WORKSPACE_OPS_OPERATION_FAILED",
          command: "verify workspace",
          message: "Workspace ops command verify workspace failed before producing a JSON envelope."
        }
      }, null, 2)}\n`
    });
  });

  it("redacts no-value secret flags in executable operation failures", async () => {
    await expect(
      execFileAsync("node", [
        "packages/workspace-ops/bin/cestus-workspace.mjs",
        "verify",
        "workspace",
        "--authorization"
      ])
    ).rejects.toMatchObject({
      code: 1,
      stderr: "",
      stdout: `${JSON.stringify({
        ok: false,
        error: {
          code: "WORKSPACE_OPS_OPERATION_FAILED",
          command: "verify workspace",
          message: "Workspace ops command verify workspace failed before producing a JSON envelope."
        }
      }, null, 2)}\n`
    });
  });

  it("redacts secret-shaped argv in unsupported executable errors", async () => {
    await expect(
      execFileAsync("node", [
        "packages/workspace-ops/bin/cestus-workspace.mjs",
        "unknown",
        "--access-token",
        "abc123"
      ])
    ).rejects.toMatchObject({
      code: 1,
      stderr: "",
      stdout: `${JSON.stringify({
        ok: false,
        error: {
          code: "WORKSPACE_OPS_COMMAND_UNSUPPORTED",
          command: "unsupported command",
          message: "Unsupported workspace ops command unsupported command."
        }
      }, null, 2)}\n`
    });
  });

  it("redacts no-value secret flags in unsupported executable errors", async () => {
    await expect(
      execFileAsync("node", [
        "packages/workspace-ops/bin/cestus-workspace.mjs",
        "unknown",
        "--access-token"
      ])
    ).rejects.toMatchObject({
      code: 1,
      stderr: "",
      stdout: `${JSON.stringify({
        ok: false,
        error: {
          code: "WORKSPACE_OPS_COMMAND_UNSUPPORTED",
          command: "unsupported command",
          message: "Unsupported workspace ops command unsupported command."
        }
      }, null, 2)}\n`
    });
  });

});
