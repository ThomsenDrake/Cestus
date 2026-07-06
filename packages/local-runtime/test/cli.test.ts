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
