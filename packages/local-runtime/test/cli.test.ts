import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runLocalRuntimeCli } from "../src/cli.js";

let tempDir: string | undefined;

afterEach(() => {
  if (tempDir !== undefined) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("runLocalRuntimeCli", () => {
  it("prints resolved config without secrets", async () => {
    const stdout: string[] = [];

    const exitCode = await runLocalRuntimeCli(["config"], {
      cwd: "/tmp/cestus-cli-test",
      env: {
        CESTUS_LOCAL_AUTH_TOKEN: "secret-token"
      },
      stdout: (line) => stdout.push(line),
      stderr: () => undefined
    });

    expect(exitCode).toBe(0);
    expect(stdout.join("\n")).toContain('"host": "127.0.0.1"');
    expect(stdout.join("\n")).not.toContain("secret-token");
  });

  it("dispatches explicit seed through an injected seed action", async () => {
    const stdout: string[] = [];
    const calls: string[] = [];

    const exitCode = await runLocalRuntimeCli(["seed-prr"], {
      cwd: "/tmp/cestus-cli-test",
      env: {},
      stdout: (line) => stdout.push(line),
      stderr: () => undefined,
      seedPrr: async () => {
        calls.push("seed");
        return { appendedCount: 9 };
      }
    });

    expect(exitCode).toBe(0);
    expect(calls).toEqual(["seed"]);
    expect(stdout.join("\n")).toContain('"appendedCount": 9');
  });

  it("dispatches serve through an injected server action", async () => {
    const calls: string[] = [];

    const exitCode = await runLocalRuntimeCli(["serve"], {
      cwd: "/tmp/cestus-cli-test",
      env: {},
      stdout: () => undefined,
      stderr: () => undefined,
      serve: async () => {
        calls.push("serve");
      }
    });

    expect(exitCode).toBe(0);
    expect(calls).toEqual(["serve"]);
  });

  it("authenticates the explicit seed action when local exposure requires auth", async () => {
    const stdout: string[] = [];
    tempDir = mkdtempSync(join(tmpdir(), "cestus-cli-"));

    const exitCode = await runLocalRuntimeCli(["seed-prr"], {
      cwd: tempDir,
      env: {
        CESTUS_LOCAL_BIND: "tailnet",
        CESTUS_LOCAL_AUTH_TOKEN: "secret-token"
      },
      stdout: (line) => stdout.push(line),
      stderr: () => undefined
    });

    const body = JSON.parse(stdout.join("\n")) as { readonly ok?: boolean };
    expect(exitCode).toBe(0);
    expect(body.ok).toBe(true);
    expect(stdout.join("\n")).not.toContain("secret-token");
  });

  it("writes generated tailnet config without printing the auth token", async () => {
    const stdout: string[] = [];
    tempDir = mkdtempSync(join(tmpdir(), "cestus-cli-"));

    const exitCode = await runLocalRuntimeCli(
      ["configure", "--bind", "tailnet", "--host", "100.126.143.105", "--port", "8790"],
      {
        cwd: tempDir,
        env: {},
        stdout: (line) => stdout.push(line),
        stderr: () => undefined
      }
    );

    const file = JSON.parse(readFileSync(join(tempDir, ".cestus/local/runtime.config.json"), "utf8")) as {
      readonly http: {
        readonly bindMode: string;
        readonly host: string;
        readonly port: number;
        readonly authToken: string;
      };
    };
    const output = stdout.join("\n");

    expect(exitCode).toBe(0);
    expect(file.http.bindMode).toBe("tailnet");
    expect(file.http.host).toBe("100.126.143.105");
    expect(file.http.port).toBe(8790);
    expect(file.http.authToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(output).toContain('"authToken": "[redacted]"');
    expect(output).not.toContain(file.http.authToken);
  });

  it("uses written config for later config diagnostics", async () => {
    const stdout: string[] = [];
    tempDir = mkdtempSync(join(tmpdir(), "cestus-cli-"));

    expect(
      await runLocalRuntimeCli(["configure", "--bind", "lan"], {
        cwd: tempDir,
        env: {},
        stdout: () => undefined,
        stderr: () => undefined
      })
    ).toBe(0);

    const exitCode = await runLocalRuntimeCli(["config"], {
      cwd: tempDir,
      env: {},
      stdout: (line) => stdout.push(line),
      stderr: () => undefined
    });

    expect(exitCode).toBe(0);
    expect(stdout.join("\n")).toContain('"bindMode": "lan"');
    expect(stdout.join("\n")).toContain('"authRequired": true');
    expect(stdout.join("\n")).toContain('"authToken": "[redacted]"');
  });

  it("configures portable workspace storage with --workspace", async () => {
    const stdout: string[] = [];
    tempDir = mkdtempSync(join(tmpdir(), "cestus-cli-"));

    const exitCode = await runLocalRuntimeCli(
      ["configure", "--storage", "portable-workspace", "--workspace", "external/case-a"],
      {
        cwd: tempDir,
        env: {},
        stdout: (line) => stdout.push(line),
        stderr: () => undefined
      }
    );

    expect(exitCode).toBe(0);
    expect(stdout.join("\n")).toContain('"strategy": "portable-workspace"');
    expect(stdout.join("\n")).toContain('"workspaceRoot": "external/case-a"');

    const configExitCode = await runLocalRuntimeCli(["config"], {
      cwd: tempDir,
      env: {},
      stdout: (line) => stdout.push(line),
      stderr: () => undefined
    });

    expect(configExitCode).toBe(0);
    expect(stdout.join("\n")).toContain(
      '"sqlitePath": "' + join(tempDir, "external/case-a/ledger/ontology.sqlite") + '"'
    );
  });

  it("explicitly creates a portable workspace without printing secret material", async () => {
    const stdout: string[] = [];
    tempDir = mkdtempSync(join(tmpdir(), "cestus-cli-"));
    const workspaceRoot = join(tempDir, "external-case");

    const exitCode = await runLocalRuntimeCli(
      [
        "create-workspace",
        "--workspace",
        workspaceRoot,
        "--workspace-id",
        "ws_cli_001",
        "--label",
        "CLI Portable Workspace",
        "--created-at",
        "2026-07-06T12:00:00.000Z"
      ],
      {
        cwd: tempDir,
        env: {},
        stdout: (line) => stdout.push(line),
        stderr: () => undefined
      }
    );

    expect(exitCode).toBe(0);
    const output = JSON.parse(stdout.join("\n")) as {
      ok: true;
      workspace: {
        workspaceId: string;
        manifestPath: string;
        paths: { ledgerPath: string };
      };
    };
    expect(output.workspace.workspaceId).toBe("ws_cli_001");
    expect(output.workspace.paths.ledgerPath).toBe(join(workspaceRoot, "ledger", "ontology.sqlite"));
    expect(readFileSync(join(workspaceRoot, "cestus-workspace.json"), "utf8")).toContain('"workspaceId": "ws_cli_001"');
    expect(stdout.join("\n")).not.toMatch(/token|secret|password|oauth|credential|api[_-]?key|private[_-]?key|session/i);
  });

  it("rejects create-workspace without the required workspace id", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    tempDir = mkdtempSync(join(tmpdir(), "cestus-cli-"));

    const exitCode = await runLocalRuntimeCli(
      [
        "create-workspace",
        "--workspace",
        join(tempDir, "external-case"),
        "--label",
        "CLI Portable Workspace"
      ],
      {
        cwd: tempDir,
        env: {},
        stdout: (line) => stdout.push(line),
        stderr: (line) => stderr.push(line)
      }
    );

    expect(exitCode).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr.join("\n")).toContain("create-workspace requires --workspace-id <id>");
  });

  it("rejects unknown create-workspace flags without writing output", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    tempDir = mkdtempSync(join(tmpdir(), "cestus-cli-"));

    const exitCode = await runLocalRuntimeCli(
      [
        "create-workspace",
        "--workspace",
        join(tempDir, "external-case"),
        "--workspace-id",
        "ws_cli_001",
        "--label",
        "CLI Portable Workspace",
        "--unexpected"
      ],
      {
        cwd: tempDir,
        env: {},
        stdout: (line) => stdout.push(line),
        stderr: (line) => stderr.push(line)
      }
    );

    expect(exitCode).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr.join("\n")).toContain("Unknown create-workspace flag");
  });

  it("rejects repeated create-workspace without changing the existing manifest", async () => {
    const firstStdout: string[] = [];
    const secondStdout: string[] = [];
    const secondStderr: string[] = [];
    tempDir = mkdtempSync(join(tmpdir(), "cestus-cli-"));
    const workspaceRoot = join(tempDir, "external-case");
    const manifestPath = join(workspaceRoot, "cestus-workspace.json");

    const firstExitCode = await runLocalRuntimeCli(
      [
        "create-workspace",
        "--workspace",
        workspaceRoot,
        "--workspace-id",
        "ws_cli_first",
        "--label",
        "First CLI Portable Workspace",
        "--created-at",
        "2026-07-06T12:00:00.000Z"
      ],
      {
        cwd: tempDir,
        env: {},
        stdout: (line) => firstStdout.push(line),
        stderr: () => undefined
      }
    );
    const originalManifest = readFileSync(manifestPath, "utf8");

    const secondExitCode = await runLocalRuntimeCli(
      [
        "create-workspace",
        "--workspace",
        workspaceRoot,
        "--workspace-id",
        "ws_cli_second",
        "--label",
        "Second CLI Portable Workspace",
        "--created-at",
        "2026-07-06T13:00:00.000Z"
      ],
      {
        cwd: tempDir,
        env: {},
        stdout: (line) => secondStdout.push(line),
        stderr: (line) => secondStderr.push(line)
      }
    );

    expect(firstExitCode).toBe(0);
    expect(secondExitCode).toBe(1);
    expect(secondStdout).toEqual([]);
    expect(secondStderr.join("\n")).toMatch(/EEXIST|exist|already/i);
    expect(readFileSync(manifestPath, "utf8")).toBe(originalManifest);
    expect(readFileSync(manifestPath, "utf8")).toContain('"workspaceId": "ws_cli_first"');
    expect(readFileSync(manifestPath, "utf8")).not.toContain("ws_cli_second");
  });

  it("rejects configure flags that would write an unusable exposed loopback config", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    tempDir = mkdtempSync(join(tmpdir(), "cestus-cli-"));

    const exitCode = await runLocalRuntimeCli(["configure", "--host", "0.0.0.0"], {
      cwd: tempDir,
      env: {},
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line)
    });

    expect(exitCode).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr.join("\n")).toContain("Loopback local runtime config cannot use a non-loopback host");
  });

  it("rejects configure explicit-path storage without a SQLite path", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    tempDir = mkdtempSync(join(tmpdir(), "cestus-cli-"));

    const exitCode = await runLocalRuntimeCli(["configure", "--storage", "explicit-path"], {
      cwd: tempDir,
      env: {},
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line)
    });

    expect(exitCode).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr.join("\n")).toContain("explicit-path storage requires a sqlitePath");
  });
});
