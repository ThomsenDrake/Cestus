import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveLocalRuntimeConfig } from "../src/config.js";

const cwd = "/tmp/cestus-runtime-test";

describe("resolveLocalRuntimeConfig", () => {
  it("defaults to repo-local SQLite storage and loopback bind", () => {
    const config = resolveLocalRuntimeConfig({ cwd, env: {} });

    expect(config.storage).toEqual({
      strategy: "repo-local",
      sqlitePath: resolve(cwd, ".cestus/local/prr-ledger.sqlite")
    });
    expect(config.http).toMatchObject({
      host: "127.0.0.1",
      port: 8787,
      bindMode: "loopback",
      authRequired: false,
      devSeedEnabled: false
    });
    expect(config.staticUi.distDir).toBe(resolve(cwd, "dist"));
    expect(config.logs.dir).toBe(resolve(cwd, ".cestus/local/logs"));
  });

  it("resolves explicit SQLite paths without changing bind defaults", () => {
    const config = resolveLocalRuntimeConfig({
      cwd,
      env: {
        CESTUS_LOCAL_STORAGE: "explicit-path",
        CESTUS_LOCAL_SQLITE_PATH: "state/custom.sqlite"
      }
    });

    expect(config.storage).toEqual({
      strategy: "explicit-path",
      sqlitePath: resolve(cwd, "state/custom.sqlite")
    });
    expect(config.http.bindMode).toBe("loopback");
    expect(config.http.authRequired).toBe(false);
  });

  it("represents app-data storage for packaged desktop builds", () => {
    const config = resolveLocalRuntimeConfig({
      cwd,
      env: {
        CESTUS_LOCAL_STORAGE: "app-data",
        CESTUS_APP_DATA_DIR: "/home/avery/.local/share/cestus"
      }
    });

    expect(config.storage).toEqual({
      strategy: "app-data",
      sqlitePath: join("/home/avery/.local/share/cestus", "prr-ledger.sqlite")
    });
  });

  it("rejects tailnet exposure without auth", () => {
    expect(() =>
      resolveLocalRuntimeConfig({
        cwd,
        env: {
          CESTUS_LOCAL_BIND: "tailnet",
          CESTUS_LOCAL_HOST: "100.126.143.105"
        }
      })
    ).toThrow("Auth is required for non-loopback local runtime exposure");
  });

  it("allows authenticated tailnet exposure without enabling dev seed", () => {
    const config = resolveLocalRuntimeConfig({
      cwd,
      env: {
        CESTUS_LOCAL_BIND: "tailnet",
        CESTUS_LOCAL_HOST: "100.126.143.105",
        CESTUS_LOCAL_AUTH_TOKEN: "local-secret"
      }
    });

    expect(config.http).toMatchObject({
      host: "100.126.143.105",
      bindMode: "tailnet",
      authRequired: true,
      authToken: "local-secret",
      devSeedEnabled: false
    });
  });

  it("keeps dev seed enablement separate from exposure mode", () => {
    const config = resolveLocalRuntimeConfig({
      cwd,
      env: {
        CESTUS_DEV_SEED_PRR: "true"
      }
    });

    expect(config.http.bindMode).toBe("loopback");
    expect(config.http.authRequired).toBe(false);
    expect(config.http.devSeedEnabled).toBe(true);
  });
});
