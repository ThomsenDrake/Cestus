import {
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
      bindMode: "tailnet"
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
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "cestus-local-config-file-"));
  tempDirs.push(dir);
  return dir;
}
