import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runLocalRuntimeCli } from "../src/cli.js";
import { checkTailnetPreviewReadiness } from "../src/tailnet-preview-readiness.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("checkTailnetPreviewReadiness", () => {
  it("reports only safe facts without listening or creating configuration", () => {
    const cwd = tempDir();
    const env = previewEnv(cwd);
    const token = env.CESTUS_LOCAL_AUTH_TOKEN ?? "";
    writeBuiltUi(cwd);

    const result = checkTailnetPreviewReadiness({ cwd, env });

    expect(result).toEqual({
      bindMode: "tailnet",
      host: "100.99.12.34",
      port: 8787,
      authConfigured: true,
      devSeedDisabled: true,
      storageStrategy: "app-data",
      staticUiPath: join(cwd, "dist/index.html"),
      ready: true
    });
    expect(JSON.stringify(result)).not.toContain(token);
    expect(existsSync(join(cwd, ".cestus/local/runtime.config.json"))).toBe(false);
    expect(existsSync(join(cwd, ".cestus/local/logs"))).toBe(false);
  });

  it("does not repair config permissions while checking readiness", () => {
    const cwd = tempDir();
    const configDir = join(cwd, ".cestus/local");
    const configPath = join(configDir, "runtime.config.json");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify({
        storage: { strategy: "app-data", appDataDir: join(tmpdir(), "cestus-preview-app-data") },
        http: { bindMode: "tailnet", host: "100.99.12.34", authToken: "test-only-token" },
        staticUi: { distDir: "dist" },
        logs: { dir: join(tmpdir(), "cestus-preview-logs") }
      })
    );
    chmodSync(configPath, 0o644);
    writeBuiltUi(cwd);

    expect(checkTailnetPreviewReadiness({ cwd, env: {} }).ready).toBe(true);
    expect(statSync(configPath).mode & 0o777).toBe(0o644);
  });

  it("rejects a non-tailnet mode, enabled seed, missing auth, or missing built entry point", () => {
    const cwd = tempDir();
    writeBuiltUi(cwd);

    expect(() => checkTailnetPreviewReadiness({ cwd, env: { ...previewEnv(cwd), CESTUS_LOCAL_BIND: "lan" } })).toThrow(
      "Tailnet preview readiness requires tailnet bind mode"
    );
    expect(() =>
      checkTailnetPreviewReadiness({
        cwd,
        env: { ...previewEnv(cwd), CESTUS_DEV_SEED_PRR: "true" }
      })
    ).toThrow("Tailnet preview readiness requires development seed to be disabled");
    expect(() => {
      const { CESTUS_LOCAL_AUTH_TOKEN: _token, ...withoutAuth } = previewEnv(cwd);
      return checkTailnetPreviewReadiness({ cwd, env: withoutAuth });
    }).toThrow("Auth is required for non-loopback local runtime exposure");
    rmSync(join(cwd, "dist/index.html"));
    expect(() => checkTailnetPreviewReadiness({ cwd, env: previewEnv(cwd) })).toThrow(
      "Tailnet preview readiness requires built static UI entry point"
    );
  });

  it("rejects every resolved durable path inside the repository regardless of storage label", () => {
    const cwd = tempDir();
    writeBuiltUi(cwd);

    expect(() =>
      checkTailnetPreviewReadiness({
        cwd,
        env: { ...previewEnv(cwd), CESTUS_APP_DATA_DIR: "state/app-data" }
      })
    ).toThrow("Tailnet preview readiness requires durable storage outside the repository");
    expect(() =>
      checkTailnetPreviewReadiness({
        cwd,
        env: { ...previewEnv(cwd), CESTUS_LOCAL_LOG_DIR: ".cestus/local/logs" }
      })
    ).toThrow("Tailnet preview readiness requires durable storage outside the repository");
  });

  it("runs the CLI check without revealing auth material", async () => {
    const cwd = tempDir();
    const env = previewEnv(cwd);
    const stdout: string[] = [];
    const stderr: string[] = [];
    writeBuiltUi(cwd);

    const exitCode = await runLocalRuntimeCli(["tailnet-preview-check"], {
      cwd,
      env,
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line)
    });

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout.join("\n")).toContain('"authConfigured": true');
    expect(stdout.join("\n")).not.toContain(env.CESTUS_LOCAL_AUTH_TOKEN ?? "");
  });
});

function previewEnv(cwd: string): Record<string, string> {
  return {
    CESTUS_LOCAL_BIND: "tailnet",
    CESTUS_LOCAL_HOST: "100.99.12.34",
    CESTUS_LOCAL_AUTH_TOKEN: "test-only-token",
    CESTUS_LOCAL_STORAGE: "app-data",
    CESTUS_APP_DATA_DIR: join(tmpdir(), "cestus-preview-app-data"),
    CESTUS_LOCAL_LOG_DIR: join(tmpdir(), "cestus-preview-logs"),
    CESTUS_UI_DIST_DIR: join(cwd, "dist")
  };
}

function writeBuiltUi(cwd: string): void {
  mkdirSync(join(cwd, "dist"), { recursive: true });
  writeFileSync(join(cwd, "dist/index.html"), "<main>Cestus</main>");
}

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "cestus-tailnet-preview-"));
  tempDirs.push(dir);
  return dir;
}
