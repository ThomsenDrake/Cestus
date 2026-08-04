import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveLocalRuntimeConfig } from "../src/config.js";
import {
  readLocalRuntimeConfigFile,
  redactLocalRuntimeConfigFile,
  resolveLocalRuntimeConfigFilePath,
  writeLocalRuntimeOnboardingConfig
} from "../src/config-file.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("local runtime config files", () => {
  it("writes deterministic ignored config with generated tailnet auth", () => {
    const cwd = tempDir();

    const written = writeLocalRuntimeOnboardingConfig({
      cwd,
      env: {},
      bindMode: "tailnet",
      host: "100.126.143.105",
      port: 8790
    });

    expect(written.path).toBe(join(cwd, ".cestus/local/runtime.config.json"));
    expect(existsSync(written.path)).toBe(true);
    expect(statSync(written.path).mode & 0o777).toBe(0o600);

    const file = JSON.parse(readFileSync(written.path, "utf8")) as {
      readonly http: {
        readonly bindMode: string;
        readonly host: string;
        readonly port: number;
        readonly authToken: string;
      };
    };
    expect(file.http).toMatchObject({
      bindMode: "tailnet",
      host: "100.126.143.105",
      port: 8790
    });
    expect(file.http.authToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const resolved = resolveLocalRuntimeConfig({ cwd, env: {} });
    expect(resolved.http).toMatchObject({
      bindMode: "tailnet",
      host: "100.126.143.105",
      port: 8790,
      authRequired: true,
      authToken: file.http.authToken
    });
  });

  it("preserves existing generated auth unless rotation is requested", () => {
    const cwd = tempDir();

    const first = writeLocalRuntimeOnboardingConfig({ cwd, env: {}, bindMode: "lan" });
    const second = writeLocalRuntimeOnboardingConfig({ cwd, env: {}, bindMode: "lan" });
    const rotated = writeLocalRuntimeOnboardingConfig({
      cwd,
      env: {},
      bindMode: "lan",
      rotateAuthToken: true
    });

    expect(second.config.http?.authToken).toBe(first.config.http?.authToken);
    expect(rotated.config.http?.authToken).not.toBe(first.config.http?.authToken);
  });

  it("rejects an invalid tailnet host before creating config or generating auth material", () => {
    const cwd = tempDir();
    const configPath = join(cwd, ".cestus/local/runtime.config.json");

    expect(() =>
      writeLocalRuntimeOnboardingConfig({
        cwd,
        env: {},
        bindMode: "tailnet",
        host: "0.0.0.0"
      })
    ).toThrow("Tailnet local runtime host must be an explicit address in the Tailscale IPv4 or IPv6 ranges");
    expect(existsSync(configPath)).toBe(false);
  });

  it("rejects a missing tailnet host before creating config or generating auth material", () => {
    const cwd = tempDir();
    const configPath = join(cwd, ".cestus/local/runtime.config.json");

    expect(() =>
      writeLocalRuntimeOnboardingConfig({
        cwd,
        env: {},
        bindMode: "tailnet"
      })
    ).toThrow("Tailnet local runtime host must be an explicit address in the Tailscale IPv4 or IPv6 ranges");
    expect(existsSync(configPath)).toBe(false);
  });

  it("rejects a missing tailnet host before changing an existing config", () => {
    const cwd = tempDir();
    const configDir = join(cwd, ".cestus/local");
    const configPath = join(configDir, "runtime.config.json");
    const existing = JSON.stringify({ http: { bindMode: "loopback", host: "127.0.0.1" } }, null, 2);
    mkdirSync(configDir, { recursive: true });
    writeFileSync(configPath, existing);

    expect(() =>
      writeLocalRuntimeOnboardingConfig({
        cwd,
        env: {},
        bindMode: "tailnet"
      })
    ).toThrow("Tailnet local runtime host must be an explicit address in the Tailscale IPv4 or IPv6 ranges");
    expect(readFileSync(configPath, "utf8")).toBe(existing);
  });

  it("resets host and auth material when changing exposed config back to loopback", () => {
    const cwd = tempDir();
    writeLocalRuntimeOnboardingConfig({
      cwd,
      env: {},
      bindMode: "tailnet",
      host: "100.126.143.105",
      port: 8790
    });

    const loopback = writeLocalRuntimeOnboardingConfig({ cwd, env: {}, bindMode: "loopback" });
    const resolved = resolveLocalRuntimeConfig({ cwd, env: {} });

    expect(loopback.config.http).toEqual({
      bindMode: "loopback",
      host: "127.0.0.1",
      port: 8790
    });
    expect(resolved.http).toMatchObject({
      bindMode: "loopback",
      host: "127.0.0.1",
      port: 8790,
      authRequired: false
    });
    expect("authToken" in resolved.http).toBe(false);
  });

  it("lets env vars override config-file defaults", () => {
    const cwd = tempDir();
    writeLocalRuntimeOnboardingConfig({
      cwd,
      env: {},
      bindMode: "tailnet",
      host: "100.126.143.105",
      port: 8790
    });

    const resolved = resolveLocalRuntimeConfig({
      cwd,
      env: {
        CESTUS_LOCAL_BIND: "lan",
        CESTUS_LOCAL_HOST: "0.0.0.0",
        CESTUS_LOCAL_PORT: "8791",
        CESTUS_LOCAL_AUTH_TOKEN: "env-token"
      }
    });

    expect(resolved.http).toMatchObject({
      bindMode: "lan",
      host: "0.0.0.0",
      port: 8791,
      authRequired: true,
      authToken: "env-token"
    });
  });

  it("supports explicit config path overrides and redacts auth material", () => {
    const cwd = tempDir();
    const configPath = join(cwd, "custom-runtime.json");

    const written = writeLocalRuntimeOnboardingConfig({
      cwd,
      env: { CESTUS_LOCAL_CONFIG_PATH: configPath },
      bindMode: "tailnet",
      host: "100.126.143.105"
    });
    const file = readLocalRuntimeConfigFile({ cwd, env: { CESTUS_LOCAL_CONFIG_PATH: configPath } });
    const redacted = redactLocalRuntimeConfigFile(file);

    expect(resolveLocalRuntimeConfigFilePath({ cwd, env: { CESTUS_LOCAL_CONFIG_PATH: configPath } })).toBe(
      configPath
    );
    expect(written.path).toBe(configPath);
    expect(JSON.stringify(redacted)).not.toContain(file?.http?.authToken ?? "missing-token");
    expect(redacted?.http?.authToken).toBe("[redacted]");
  });

  it("rejects hand-authored non-loopback config without auth", () => {
    const cwd = tempDir();
    const configPath = join(cwd, ".cestus/local/runtime.config.json");
    mkdirSync(join(cwd, ".cestus/local"), { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          http: {
            bindMode: "tailnet",
            host: "100.126.143.105"
          }
        },
        null,
        2
      )
    );

    expect(() => resolveLocalRuntimeConfig({ cwd, env: {} })).toThrow(
      "Auth is required for non-loopback local runtime exposure"
    );
  });

  it("repairs broad permissions before trusting auth material from config files", () => {
    const cwd = tempDir();
    const configPath = join(cwd, ".cestus/local/runtime.config.json");
    mkdirSync(join(cwd, ".cestus/local"), { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          http: {
            bindMode: "tailnet",
            host: "100.126.143.105",
            authToken: "file-secret"
          }
        },
        null,
        2
      )
    );
    chmodSync(configPath, 0o644);

    const resolved = resolveLocalRuntimeConfig({ cwd, env: {} });

    expect(resolved.http.authToken).toBe("file-secret");
    expect(statSync(configPath).mode & 0o777).toBe(0o600);
  });

  it("rejects loopback onboarding config that would expose a non-loopback host without auth", () => {
    expect(() =>
      writeLocalRuntimeOnboardingConfig({
        cwd: tempDir(),
        env: {},
        bindMode: "loopback",
        host: "0.0.0.0"
      })
    ).toThrow("Loopback local runtime config cannot use a non-loopback host");
  });

  it("rejects explicit-path onboarding config without a SQLite path", () => {
    expect(() =>
      writeLocalRuntimeOnboardingConfig({
        cwd: tempDir(),
        env: {},
        bindMode: "loopback",
        storageStrategy: "explicit-path"
      })
    ).toThrow("explicit-path storage requires a sqlitePath");
  });

  it("writes and reads secret-free portable workspace storage config", () => {
    const cwd = tempDir();

    const written = writeLocalRuntimeOnboardingConfig({
      cwd,
      env: {},
      bindMode: "loopback",
      storageStrategy: "portable-workspace",
      workspaceRoot: "external/case-a"
    });
    const resolved = resolveLocalRuntimeConfig({ cwd, env: {} });

    expect(written.config.storage).toEqual({
      strategy: "portable-workspace",
      workspaceRoot: "external/case-a"
    });
    expect(JSON.stringify(written.config)).not.toMatch(
      /token|secret|password|oauth|credential|api[_-]?key|private[_-]?key|session/i
    );
    expect(resolved.storage).toEqual({
      strategy: "portable-workspace",
      workspaceRoot: join(cwd, "external/case-a"),
      sqlitePath: join(cwd, "external/case-a", "ledger", "ontology.sqlite")
    });
  });

  it("writes portable workspace expected identity without secret material", () => {
    const cwd = tempDir();

    const written = writeLocalRuntimeOnboardingConfig({
      cwd,
      env: {},
      bindMode: "loopback",
      storageStrategy: "portable-workspace",
      workspaceRoot: "external/case-a",
      expectedWorkspaceId: "ws_config_case"
    });

    expect(written.config.storage).toEqual({
      strategy: "portable-workspace",
      workspaceRoot: "external/case-a",
      expectedWorkspaceId: "ws_config_case"
    });
    expect(JSON.stringify(written.config)).not.toMatch(
      /token|secret|password|oauth|credential|api[_-]?key|private[_-]?key|session/i
    );
  });

  it("does not carry stale portable workspace identity across a root change", () => {
    const cwd = tempDir();

    writeLocalRuntimeOnboardingConfig({
      cwd,
      env: {},
      bindMode: "loopback",
      storageStrategy: "portable-workspace",
      workspaceRoot: "external/old-case",
      expectedWorkspaceId: "ws_old_case"
    });

    const changed = writeLocalRuntimeOnboardingConfig({
      cwd,
      env: {},
      bindMode: "loopback",
      storageStrategy: "portable-workspace",
      workspaceRoot: "external/new-case"
    });

    expect(changed.config.storage).toEqual({
      strategy: "portable-workspace",
      workspaceRoot: "external/new-case"
    });
    expect(readLocalRuntimeConfigFile({ cwd, env: {} })?.storage).toEqual({
      strategy: "portable-workspace",
      workspaceRoot: "external/new-case"
    });
  });

  it("does not carry stale portable workspace identity across a generic root change", () => {
    const cwd = tempDir();

    writeLocalRuntimeOnboardingConfig({
      cwd,
      env: {},
      bindMode: "loopback",
      storageStrategy: "portable-workspace",
      workspaceRoot: "external/old-case",
      expectedWorkspaceId: "ws_old_case"
    });

    const changed = writeLocalRuntimeOnboardingConfig({
      cwd,
      env: {},
      bindMode: "loopback",
      workspaceRoot: "external/new-case"
    });

    expect(changed.config.storage).toEqual({
      strategy: "portable-workspace",
      workspaceRoot: "external/new-case"
    });
    expect(readLocalRuntimeConfigFile({ cwd, env: {} })?.storage).toEqual({
      strategy: "portable-workspace",
      workspaceRoot: "external/new-case"
    });
  });

  it("prunes stale portable workspace fields when changing storage strategies", () => {
    const cwd = tempDir();

    writeLocalRuntimeOnboardingConfig({
      cwd,
      env: {},
      bindMode: "loopback",
      storageStrategy: "portable-workspace",
      workspaceRoot: "external/case-a"
    });

    const repoLocal = writeLocalRuntimeOnboardingConfig({
      cwd,
      env: {},
      bindMode: "loopback",
      storageStrategy: "repo-local"
    });
    expect(repoLocal.config.storage).toEqual({
      strategy: "repo-local"
    });
    expect(readLocalRuntimeConfigFile({ cwd, env: {} })?.storage).toEqual({
      strategy: "repo-local"
    });

    const explicitPath = writeLocalRuntimeOnboardingConfig({
      cwd,
      env: {},
      bindMode: "loopback",
      storageStrategy: "explicit-path",
      sqlitePath: "compat/prr-ledger.sqlite"
    });
    expect(explicitPath.config.storage).toEqual({
      strategy: "explicit-path",
      sqlitePath: "compat/prr-ledger.sqlite"
    });
    expect(readLocalRuntimeConfigFile({ cwd, env: {} })?.storage).toEqual({
      strategy: "explicit-path",
      sqlitePath: "compat/prr-ledger.sqlite"
    });
  });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "cestus-local-config-file-"));
  tempDirs.push(dir);
  return dir;
}
