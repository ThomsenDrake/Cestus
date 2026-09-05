import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SQLiteEventLedger } from "../../ontology/src/sqlite-event-ledger.js";
import { createPortableWorkspace } from "../../workspace/src/index.js";
import { runLocalRuntimeCli } from "../src/cli.js";
import { resolveLocalRuntimeConfig } from "../src/config.js";
import { writeLocalRuntimeOnboardingConfig } from "../src/config-file.js";

let tempDir: string | undefined;

afterEach(() => {
  vi.unstubAllGlobals();
  if (tempDir !== undefined) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("runLocalRuntimeCli", () => {
  it.each([["0.0.0.0", "127.0.0.1"], ["::", "[::1]"]])("probes wildcard %s through loopback without opening a public listener", async (host, probeHost) => {
    tempDir = mkdtempSync(join(tmpdir(), "cestus-cli-"));
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, backend: "running" })));
    vi.stubGlobal("fetch", fetcher);
    expect(await runLocalRuntimeCli(["health"], {
      cwd: tempDir, env: { CESTUS_LOCAL_BIND: "lan", CESTUS_LOCAL_HOST: host, CESTUS_LOCAL_AUTH_TOKEN: "test-token" }, stdout: () => undefined
    })).toBe(0);
    expect(fetcher).toHaveBeenCalledWith(`http://${probeHost}:8787/api/health`, expect.any(Object));
  });
  it("prints resident agent status as stable JSON without live credentials", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const cwd = mkdtempSync(join(tmpdir(), "cestus-cli-"));
    tempDir = cwd;
    writeLocalRuntimeOnboardingConfig({ cwd, env: {}, bindMode: "loopback" });

    const exitCode = await runLocalRuntimeCli(["agent-status"], {
      cwd,
      env: {},
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line)
    });

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    const body = JSON.parse(stdout.join("\n")) as {
      readonly schemaVersion: string;
      readonly providers: readonly { readonly providerId: string }[];
      readonly identityLifecycle: { readonly state: string };
    };
    expect(body.schemaVersion).toBe("agent-status.v1");
    expect(body.identityLifecycle.state).toBe("not-mounted");
    expect(body.providers).toEqual([expect.objectContaining({ providerId: "provider_fake_local" })]);
    expect(stdout.join("\n")).not.toMatch(/sk_live|password|private key|bearer [a-z0-9._-]+/i);
    expect(await eventTypes(resolveLocalRuntimeConfig({ cwd, env: {} }))).toEqual([]);
  });

  it("creates resident agent tasks as stable JSON", async () => {
    const createStdout: string[] = [];
    const statusStdout: string[] = [];
    const stderr: string[] = [];
    tempDir = mkdtempSync(join(tmpdir(), "cestus-cli-"));
    writeLocalRuntimeOnboardingConfig({ cwd: tempDir, env: {}, bindMode: "loopback" });
    const workspaceRoot = join(tempDir, "task-workspace");
    createPortableWorkspace({
      rootDir: workspaceRoot,
      workspaceId: "ws_cli_task",
      label: "CLI Task Workspace",
      createdAt: "2026-07-10T12:00:00.000Z",
      createdBy: "cli-test"
    });
    const env = {
      CESTUS_LOCAL_STORAGE: "portable-workspace",
      CESTUS_WORKSPACE_ROOT: workspaceRoot
    };

    const exitCode = await runLocalRuntimeCli(
      ["agent-create-task", "--task-id", "task_cli_001", "--title", "Review resident status"],
      {
        cwd: tempDir,
        env,
        stdout: (line) => createStdout.push(line),
        stderr: (line) => stderr.push(line)
      }
    );

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    const body = JSON.parse(createStdout.join("\n")) as { readonly ok: boolean; readonly taskId: string };
    expect(body).toMatchObject({ ok: true, taskId: "task_cli_001" });
    expect(createStdout.join("\n")).not.toMatch(/sk_live|password|private key|bearer [a-z0-9._-]+/i);

    expect(
      await runLocalRuntimeCli(["agent-status"], {
        cwd: tempDir,
        env,
        stdout: (line) => statusStdout.push(line),
        stderr: (line) => stderr.push(line)
      })
    ).toBe(0);
    expect(JSON.parse(statusStdout.join("\n")).tasks.map((task: { readonly taskId: string }) => task.taskId)).toContain(
      "task_cli_001"
    );
  });

  it("redacts secret-shaped diagnostics from injected agent dependencies", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runLocalRuntimeCli(["agent-status"], {
      cwd: "/tmp/cestus-cli-test",
      env: {},
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line),
      agentStatus: async () => {
        throw new Error("provider failed with sk_live_unsafe and CESTUS_LOCAL_AUTH_TOKEN=route-secret");
      }
    });

    expect(exitCode).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr.join("\n")).toContain("redacted");
    expect(stderr.join("\n")).not.toMatch(/sk_live|route-secret|CESTUS_LOCAL_AUTH_TOKEN/i);
  });

  it("redacts secret-shaped values from injected agent status success output", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runLocalRuntimeCli(["agent-status"], {
      cwd: "/tmp/cestus-cli-test",
      env: {},
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line),
      agentStatus: async () => ({
        schemaVersion: "agent-status.v1",
        note: "provider returned sk_live_unsafe",
        nested: {
          warning: "password hunter2",
          ["sk_live_key"]: "private key abc123"
        },
        diagnostics: ["Bearer abc123"]
      })
    });

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout.join("\n")).toContain("redacted");
    expect(stdout.join("\n")).not.toMatch(/sk_live|hunter2|private key|Bearer abc123/i);
  });

  it("redacts secret-shaped values from injected agent task success output", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runLocalRuntimeCli(
      ["agent-create-task", "--task-id", "task_cli_secret_output", "--title", "Review safe output"],
      {
        cwd: "/tmp/cestus-cli-test",
        env: {},
        stdout: (line) => stdout.push(line),
        stderr: (line) => stderr.push(line),
        agentCreateTask: async () => ({
          ok: true,
          taskId: "task_cli_secret_output",
          diagnostic: "api key sk_live_unsafe",
          nested: [{ message: "private key abc123" }, { message: "bearer route-secret" }]
        })
      }
    );

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout.join("\n")).toContain("redacted");
    expect(stdout.join("\n")).not.toMatch(/sk_live|private key|route-secret/i);
  });

  it("does not echo secret-shaped unknown commands", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runLocalRuntimeCli(["sk_live_unsafe"], {
      cwd: "/tmp/cestus-cli-test",
      env: {},
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line)
    });

    expect(exitCode).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr.join("\n")).toContain("Unknown local runtime command");
    expect(stderr.join("\n")).not.toMatch(/sk_live/i);
  });

  it.each(["--access-token", "--api-key"])("does not echo secret-shaped unknown agent task flag %s", async (flag) => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runLocalRuntimeCli(
      ["agent-create-task", "--task-id", "task_cli_001", "--title", "Review resident status", flag],
      {
        cwd: "/tmp/cestus-cli-test",
        env: {},
        stdout: (line) => stdout.push(line),
        stderr: (line) => stderr.push(line)
      }
    );

    expect(exitCode).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr.join("\n")).toContain("Unknown agent-create-task flag");
    expect(stderr.join("\n")).not.toContain(flag);
  });

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
        CESTUS_LOCAL_HOST: "100.126.143.105",
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

  it("rejects invalid tailnet configuration before creating config or printing auth material", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    tempDir = mkdtempSync(join(tmpdir(), "cestus-cli-"));

    const exitCode = await runLocalRuntimeCli(["configure", "--bind", "tailnet", "--host", "0.0.0.0"], {
      cwd: tempDir,
      env: {},
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line)
    });

    expect(exitCode).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr.join("\n")).toContain("Tailnet local runtime host");
    expect(stderr.join("\n")).not.toMatch(/token|secret|password|oauth|credential|api[_-]?key|private[_-]?key|session/i);
    expect(existsSync(join(tempDir, ".cestus/local/runtime.config.json"))).toBe(false);
  });

  it("rejects a scoped IPv6 tailnet host before creating config or printing auth material", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    tempDir = mkdtempSync(join(tmpdir(), "cestus-cli-"));

    const exitCode = await runLocalRuntimeCli(
      ["configure", "--bind", "tailnet", "--host", "fd7a:115c:a1e0::1%tailscale0"],
      {
        cwd: tempDir,
        env: {},
        stdout: (line) => stdout.push(line),
        stderr: (line) => stderr.push(line)
      }
    );

    expect(exitCode).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr.join("\n")).toContain("Tailnet local runtime host");
    expect(stderr.join("\n")).not.toMatch(/token|secret|password|oauth|credential|api[_-]?key|private[_-]?key|session/i);
    expect(existsSync(join(tempDir, ".cestus/local/runtime.config.json"))).toBe(false);
  });

  it("rejects missing tailnet host before creating config or printing auth material", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    tempDir = mkdtempSync(join(tmpdir(), "cestus-cli-"));
    const configDir = join(tempDir, ".cestus/local");
    const configPath = join(configDir, "runtime.config.json");
    const existing = JSON.stringify({ http: { bindMode: "loopback", host: "127.0.0.1" } }, null, 2);
    mkdirSync(configDir, { recursive: true });
    writeFileSync(configPath, existing);

    const exitCode = await runLocalRuntimeCli(["configure", "--bind", "tailnet"], {
      cwd: tempDir,
      env: {},
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line)
    });

    expect(exitCode).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr.join("\n")).toContain("Tailnet local runtime host");
    expect(stderr.join("\n")).not.toMatch(/token|secret|password|oauth|credential|api[_-]?key|private[_-]?key|session/i);
    expect(readFileSync(configPath, "utf8")).toBe(existing);
  });

  it("rejects whitespace-padded tailnet host before changing config or printing auth material", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    tempDir = mkdtempSync(join(tmpdir(), "cestus-cli-"));
    const configDir = join(tempDir, ".cestus/local");
    const configPath = join(configDir, "runtime.config.json");
    const existing = JSON.stringify({ http: { bindMode: "loopback", host: "127.0.0.1" } }, null, 2);
    mkdirSync(configDir, { recursive: true });
    writeFileSync(configPath, existing);

    const exitCode = await runLocalRuntimeCli(
      ["configure", "--bind", "tailnet", "--host", " 100.99.12.34 "],
      {
        cwd: tempDir,
        env: {},
        stdout: (line) => stdout.push(line),
        stderr: (line) => stderr.push(line)
      }
    );

    expect(exitCode).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr.join("\n")).toContain("Tailnet local runtime host");
    expect(stderr.join("\n")).not.toMatch(/token|secret|password|oauth|credential|api[_-]?key|private[_-]?key|session/i);
    expect(readFileSync(configPath, "utf8")).toBe(existing);
  });

  it("rejects a whitespace-padded raw tailnet environment host before readiness output", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runLocalRuntimeCli(["tailnet-preview-check"], {
      cwd: "/tmp/cestus-cli-test",
      env: {
        CESTUS_LOCAL_BIND: "tailnet",
        CESTUS_LOCAL_HOST: " 100.99.12.34 ",
        CESTUS_LOCAL_AUTH_TOKEN: "secret-token"
      },
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line)
    });

    expect(exitCode).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr.join("\n")).toContain("Tailnet local runtime host");
    expect(stderr.join("\n")).not.toContain("secret-token");
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
    const stderr: string[] = [];
    tempDir = mkdtempSync(join(tmpdir(), "cestus-cli-"));
    createPortableWorkspace({
      rootDir: join(tempDir, "external/case-a"),
      workspaceId: "ws_manifest_case_a",
      label: "Manifest Case A",
      createdAt: "2026-07-06T12:00:00.000Z",
      createdBy: "local-runtime-test"
    });

    const exitCode = await runLocalRuntimeCli(
      ["configure", "--storage", "portable-workspace", "--workspace", "external/case-a"],
      {
        cwd: tempDir,
        env: {},
        stdout: (line) => stdout.push(line),
        stderr: (line) => stderr.push(line)
      }
    );

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout.join("\n")).toContain('"strategy": "portable-workspace"');
    expect(stdout.join("\n")).toContain('"workspaceRoot": "external/case-a"');
    expect(stdout.join("\n")).toContain('"expectedWorkspaceId": "ws_manifest_case_a"');

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
    expect(stdout.join("\n")).toContain('"expectedWorkspaceId": "ws_manifest_case_a"');
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
    expect(await identityEventTypes(join(workspaceRoot, "ledger", "ontology.sqlite"))).toEqual(["agent.identity.initialized"]);
    expect(stdout.join("\n")).not.toMatch(/token|secret|password|oauth|credential|api[_-]?key|private[_-]?key|session/i);
  });

  it("generates a portable workspace id when create-workspace omits one", async () => {
    const stdout: string[] = [];
    tempDir = mkdtempSync(join(tmpdir(), "cestus-cli-"));
    const workspaceRoot = join(tempDir, "external-case");

    const exitCode = await runLocalRuntimeCli(
      [
        "create-workspace",
        "--workspace",
        workspaceRoot,
        "--label",
        "Generated Id Workspace",
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

    const output = JSON.parse(stdout.join("\n")) as {
      ok: true;
      workspace: { workspaceId: string };
    };
    expect(exitCode).toBe(0);
    expect(output.workspace.workspaceId).toMatch(/^ws_[a-z0-9_]+$/);
    expect(stdout.join("\n")).not.toMatch(/token|secret|password|oauth|credential|api[_-]?key|private[_-]?key|session/i);
  });

  it("resolves relative create-workspace roots from the injected cwd", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    tempDir = mkdtempSync(join(tmpdir(), "cestus-cli-"));
    const relativeRoot = join(`relative-${basename(tempDir)}`, "external-case");
    const expectedWorkspaceRoot = join(tempDir, relativeRoot);
    const processCwdWorkspaceRoot = join(process.cwd(), relativeRoot);

    try {
      const exitCode = await runLocalRuntimeCli(
        [
          "create-workspace",
          "--workspace",
          relativeRoot,
          "--workspace-id",
          "ws_cli_relative",
          "--label",
          "Relative CLI Portable Workspace",
          "--created-at",
          "2026-07-06T12:00:00.000Z"
        ],
        {
          cwd: tempDir,
          env: {},
          stdout: (line) => stdout.push(line),
          stderr: (line) => stderr.push(line)
        }
      );

      expect(exitCode).toBe(0);
      expect(stderr).toEqual([]);
      const output = JSON.parse(stdout.join("\n")) as {
        workspace: {
          manifestPath: string;
          paths: { ledgerPath: string };
        };
      };
      expect(output.workspace.manifestPath).toBe(join(expectedWorkspaceRoot, "cestus-workspace.json"));
      expect(output.workspace.paths.ledgerPath).toBe(join(expectedWorkspaceRoot, "ledger", "ontology.sqlite"));
      expect(readFileSync(join(expectedWorkspaceRoot, "cestus-workspace.json"), "utf8")).toContain(
        '"workspaceId": "ws_cli_relative"'
      );
      expect(existsSync(join(processCwdWorkspaceRoot, "cestus-workspace.json"))).toBe(false);
    } finally {
      rmSync(join(process.cwd(), `relative-${basename(tempDir)}`), { recursive: true, force: true });
    }
  });

  it("creates a portable workspace without an explicit workspace id", async () => {
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

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    const output = JSON.parse(stdout.join("\n")) as {
      workspace: { workspaceId: string };
    };
    expect(output.workspace.workspaceId).toMatch(/^ws_[a-z0-9_]+$/);
  });

  it("configures expected portable workspace identity with --workspace-id", async () => {
    const stdout: string[] = [];
    tempDir = mkdtempSync(join(tmpdir(), "cestus-cli-"));

    const exitCode = await runLocalRuntimeCli(
      [
        "configure",
        "--storage",
        "portable-workspace",
        "--workspace",
        "external/case-a",
        "--workspace-id",
        "ws_cli_case"
      ],
      {
        cwd: tempDir,
        env: {},
        stdout: (line) => stdout.push(line),
        stderr: () => undefined
      }
    );

    expect(exitCode).toBe(0);
    expect(stdout.join("\n")).toContain('"expectedWorkspaceId": "ws_cli_case"');
  });

  it("creates and configures the same portable workspace identity for operator attachment", async () => {
    const createStdout: string[] = [];
    const configureStdout: string[] = [];
    tempDir = mkdtempSync(join(tmpdir(), "cestus-cli-"));
    const workspaceRoot = join(tempDir, "external-case");

    expect(
      await runLocalRuntimeCli(
        [
          "create-workspace",
          "--workspace",
          workspaceRoot,
          "--label",
          "Operator Case",
          "--created-at",
          "2026-07-06T12:00:00.000Z"
        ],
        {
          cwd: tempDir,
          env: {},
          stdout: (line) => createStdout.push(line),
          stderr: () => undefined
        }
      )
    ).toBe(0);

    const created = JSON.parse(createStdout.join("\n")) as {
      workspace: { workspaceId: string };
    };

    expect(
      await runLocalRuntimeCli(
        [
          "configure",
          "--storage",
          "portable-workspace",
          "--workspace",
          workspaceRoot,
          "--workspace-id",
          created.workspace.workspaceId
        ],
        {
          cwd: tempDir,
          env: {},
          stdout: (line) => configureStdout.push(line),
          stderr: () => undefined
        }
      )
    ).toBe(0);

    expect(configureStdout.join("\n")).toContain(`"expectedWorkspaceId": "${created.workspace.workspaceId}"`);
  });

  it("preserves expected portable workspace identity when unrelated configure runs after a drive swap", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    tempDir = mkdtempSync(join(tmpdir(), "cestus-cli-"));
    writeLocalRuntimeOnboardingConfig({
      cwd: tempDir,
      env: {},
      bindMode: "loopback",
      storageStrategy: "portable-workspace",
      workspaceRoot: "case",
      expectedWorkspaceId: "ws_expected_case"
    });
    createPortableWorkspace({
      rootDir: join(tempDir, "case"),
      workspaceId: "ws_actual_swapped",
      label: "Actual Swapped Workspace",
      createdAt: "2026-07-06T12:00:00.000Z",
      createdBy: "local-runtime-test"
    });

    const exitCode = await runLocalRuntimeCli(["configure", "--port", "8799"], {
      cwd: tempDir,
      env: {},
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line)
    });
    const configText = readFileSync(join(tempDir, ".cestus/local/runtime.config.json"), "utf8");

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout.join("\n")).toContain('"port": 8799');
    expect(stdout.join("\n")).toContain('"expectedWorkspaceId": "ws_expected_case"');
    expect(stdout.join("\n")).not.toContain("ws_actual_swapped");
    expect(configText).toContain('"expectedWorkspaceId": "ws_expected_case"');
    expect(configText).not.toContain("ws_actual_swapped");
  });

  it("preserves expected portable workspace identity when configure repeats the same workspace root", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    tempDir = mkdtempSync(join(tmpdir(), "cestus-cli-"));
    writeLocalRuntimeOnboardingConfig({
      cwd: tempDir,
      env: {},
      bindMode: "loopback",
      storageStrategy: "portable-workspace",
      workspaceRoot: "case",
      expectedWorkspaceId: "ws_expected_case"
    });
    createPortableWorkspace({
      rootDir: join(tempDir, "case"),
      workspaceId: "ws_actual_swapped",
      label: "Actual Swapped Workspace",
      createdAt: "2026-07-06T12:00:00.000Z",
      createdBy: "local-runtime-test"
    });

    const exitCode = await runLocalRuntimeCli(["configure", "--workspace", "case", "--port", "8799"], {
      cwd: tempDir,
      env: {},
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line)
    });
    const configText = readFileSync(join(tempDir, ".cestus/local/runtime.config.json"), "utf8");

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout.join("\n")).toContain('"workspaceRoot": "case"');
    expect(stdout.join("\n")).toContain('"expectedWorkspaceId": "ws_expected_case"');
    expect(stdout.join("\n")).not.toContain("ws_actual_swapped");
    expect(configText).toContain('"expectedWorkspaceId": "ws_expected_case"');
    expect(configText).not.toContain("ws_actual_swapped");
  });

  it("requires --workspace-id when portable configure cannot read the workspace manifest", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    tempDir = mkdtempSync(join(tmpdir(), "cestus-cli-"));

    const exitCode = await runLocalRuntimeCli(
      ["configure", "--storage", "portable-workspace", "--workspace", "missing-case"],
      {
        cwd: tempDir,
        env: {},
        stdout: (line) => stdout.push(line),
        stderr: (line) => stderr.push(line)
      }
    );

    expect(exitCode).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr.join("\n")).toContain(
      "portable-workspace configure requires --workspace-id or a readable workspace manifest"
    );
    expect(stderr.join("\n")).not.toMatch(/token|secret|password|oauth|credential|api[_-]?key|private[_-]?key|session/i);
  });

  it("replaces a stale expected identity when configuring a different readable workspace", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    tempDir = mkdtempSync(join(tmpdir(), "cestus-cli-"));
    createPortableWorkspace({
      rootDir: join(tempDir, "old-case"),
      workspaceId: "ws_old_case",
      label: "Old Case",
      createdAt: "2026-07-06T12:00:00.000Z",
      createdBy: "local-runtime-test"
    });
    createPortableWorkspace({
      rootDir: join(tempDir, "new-case"),
      workspaceId: "ws_new_case",
      label: "New Case",
      createdAt: "2026-07-06T12:00:00.000Z",
      createdBy: "local-runtime-test"
    });

    expect(
      await runLocalRuntimeCli(
        [
          "configure",
          "--storage",
          "portable-workspace",
          "--workspace",
          "old-case",
          "--workspace-id",
          "ws_old_case"
        ],
        {
          cwd: tempDir,
          env: {},
          stdout: () => undefined,
          stderr: (line) => stderr.push(line)
        }
      )
    ).toBe(0);

    const exitCode = await runLocalRuntimeCli(
      ["configure", "--storage", "portable-workspace", "--workspace", "new-case"],
      {
        cwd: tempDir,
        env: {},
        stdout: (line) => stdout.push(line),
        stderr: (line) => stderr.push(line)
      }
    );

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout.join("\n")).toContain('"workspaceRoot": "new-case"');
    expect(stdout.join("\n")).toContain('"expectedWorkspaceId": "ws_new_case"');
    expect(stdout.join("\n")).not.toContain("ws_old_case");
  });

  it("refreshes expected identity when changing workspace on existing portable config without --storage", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    tempDir = mkdtempSync(join(tmpdir(), "cestus-cli-"));
    createPortableWorkspace({
      rootDir: join(tempDir, "old-case"),
      workspaceId: "ws_old_case",
      label: "Old Case",
      createdAt: "2026-07-06T12:00:00.000Z",
      createdBy: "local-runtime-test"
    });
    createPortableWorkspace({
      rootDir: join(tempDir, "new-case"),
      workspaceId: "ws_new_case",
      label: "New Case",
      createdAt: "2026-07-06T12:00:00.000Z",
      createdBy: "local-runtime-test"
    });

    expect(
      await runLocalRuntimeCli(
        [
          "configure",
          "--storage",
          "portable-workspace",
          "--workspace",
          "old-case",
          "--workspace-id",
          "ws_old_case"
        ],
        {
          cwd: tempDir,
          env: {},
          stdout: () => undefined,
          stderr: (line) => stderr.push(line)
        }
      )
    ).toBe(0);

    const exitCode = await runLocalRuntimeCli(["configure", "--workspace", "new-case"], {
      cwd: tempDir,
      env: {},
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line)
    });

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout.join("\n")).toContain('"workspaceRoot": "new-case"');
    expect(stdout.join("\n")).toContain('"expectedWorkspaceId": "ws_new_case"');
    expect(stdout.join("\n")).not.toContain("ws_old_case");
  });

  it("fails when changing workspace on existing portable config without --storage and manifest is unreadable", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    tempDir = mkdtempSync(join(tmpdir(), "cestus-cli-"));
    createPortableWorkspace({
      rootDir: join(tempDir, "old-case"),
      workspaceId: "ws_old_case",
      label: "Old Case",
      createdAt: "2026-07-06T12:00:00.000Z",
      createdBy: "local-runtime-test"
    });

    expect(
      await runLocalRuntimeCli(
        [
          "configure",
          "--storage",
          "portable-workspace",
          "--workspace",
          "old-case",
          "--workspace-id",
          "ws_old_case"
        ],
        {
          cwd: tempDir,
          env: {},
          stdout: () => undefined,
          stderr: (line) => stderr.push(line)
        }
      )
    ).toBe(0);

    const exitCode = await runLocalRuntimeCli(["configure", "--workspace", "missing-case"], {
      cwd: tempDir,
      env: {},
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line)
    });

    expect(exitCode).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr.join("\n")).toContain(
      "portable-workspace configure requires --workspace-id or a readable workspace manifest"
    );
    expect(stderr.join("\n")).not.toMatch(/token|secret|password|oauth|credential|api[_-]?key|private[_-]?key|session/i);
  });

  it("derives expected identity from existing workspace root when configure repeats portable storage", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    tempDir = mkdtempSync(join(tmpdir(), "cestus-cli-"));
    createPortableWorkspace({
      rootDir: join(tempDir, "case-a"),
      workspaceId: "ws_case_a",
      label: "Case A",
      createdAt: "2026-07-06T12:00:00.000Z",
      createdBy: "local-runtime-test"
    });
    writeLocalRuntimeOnboardingConfig({
      cwd: tempDir,
      env: {},
      bindMode: "loopback",
      storageStrategy: "portable-workspace",
      workspaceRoot: "case-a"
    });

    const exitCode = await runLocalRuntimeCli(["configure", "--storage", "portable-workspace"], {
      cwd: tempDir,
      env: {},
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line)
    });

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout.join("\n")).toContain('"workspaceRoot": "case-a"');
    expect(stdout.join("\n")).toContain('"expectedWorkspaceId": "ws_case_a"');
  });

  it("fails when repeating portable storage with existing unreadable workspace root and no expected identity", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    tempDir = mkdtempSync(join(tmpdir(), "cestus-cli-"));
    writeLocalRuntimeOnboardingConfig({
      cwd: tempDir,
      env: {},
      bindMode: "loopback",
      storageStrategy: "portable-workspace",
      workspaceRoot: "missing-case"
    });

    const exitCode = await runLocalRuntimeCli(["configure", "--storage", "portable-workspace"], {
      cwd: tempDir,
      env: {},
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line)
    });

    expect(exitCode).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr.join("\n")).toContain(
      "portable-workspace configure requires --workspace-id or a readable workspace manifest"
    );
    expect(stderr.join("\n")).not.toMatch(/token|secret|password|oauth|credential|api[_-]?key|private[_-]?key|session/i);
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

async function eventTypes(config: ReturnType<typeof resolveLocalRuntimeConfig>): Promise<readonly string[]> {
  const ledger = new SQLiteEventLedger(config.storage.sqlitePath);
  try {
    return (await ledger.readAll()).map((event) => event.type);
  } finally {
    ledger.close();
  }
}

async function identityEventTypes(path: string): Promise<readonly string[]> {
  const ledger = new SQLiteEventLedger(path);
  try {
    return (await ledger.readStream("agent_identity_agent_default")).map((event) => event.type);
  } finally {
    ledger.close();
  }
}
