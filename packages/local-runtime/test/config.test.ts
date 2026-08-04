import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
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

  it("requires a workspace root for portable workspace storage", () => {
    expect(() =>
      resolveLocalRuntimeConfig({
        cwd,
        env: {
          CESTUS_LOCAL_STORAGE: "portable-workspace"
        }
      })
    ).toThrow("CESTUS_WORKSPACE_ROOT is required for portable-workspace storage");
  });

  it("resolves portable workspace storage to the canonical ontology ledger path", () => {
    const config = resolveLocalRuntimeConfig({
      cwd,
      env: {
        CESTUS_LOCAL_STORAGE: "portable-workspace",
        CESTUS_WORKSPACE_ROOT: "external/case-a"
      }
    });

    expect(config.storage).toEqual({
      strategy: "portable-workspace",
      workspaceRoot: resolve(cwd, "external/case-a"),
      sqlitePath: resolve(cwd, "external/case-a/ledger/ontology.sqlite")
    });
    expect(config.http.bindMode).toBe("loopback");
    expect(config.http.authRequired).toBe(false);
  });

  it("resolves expected portable workspace identity from env over config", () => {
    const configCwd = mkdtempSync(join(tmpdir(), "cestus-runtime-config-"));
    try {
      mkdirSync(join(configCwd, ".cestus/local"), { recursive: true });
      writeFileSync(
        join(configCwd, ".cestus/local/runtime.config.json"),
        JSON.stringify({
          storage: {
            strategy: "portable-workspace",
            workspaceRoot: "external/case-a",
            expectedWorkspaceId: "ws_config_case"
          }
        })
      );

      const config = resolveLocalRuntimeConfig({
        cwd: configCwd,
        env: {
          CESTUS_LOCAL_STORAGE: "portable-workspace",
          CESTUS_WORKSPACE_ROOT: "external/case-a",
          CESTUS_WORKSPACE_ID: "ws_env_case"
        }
      });

      expect(config.storage).toEqual({
        strategy: "portable-workspace",
        workspaceRoot: resolve(configCwd, "external/case-a"),
        expectedWorkspaceId: "ws_env_case",
        sqlitePath: resolve(configCwd, "external/case-a/ledger/ontology.sqlite")
      });
    } finally {
      rmSync(configCwd, { recursive: true, force: true });
    }
  });

  it("keeps explicit SQLite storage as a compatibility mode", () => {
    const config = resolveLocalRuntimeConfig({
      cwd,
      env: {
        CESTUS_LOCAL_STORAGE: "explicit-path",
        CESTUS_LOCAL_SQLITE_PATH: "compat/prr-ledger.sqlite",
        CESTUS_WORKSPACE_ROOT: "external/case-a"
      }
    });

    expect(config.storage).toEqual({
      strategy: "explicit-path",
      sqlitePath: resolve(cwd, "compat/prr-ledger.sqlite")
    });
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

  it("resolves relative app-data storage directories from cwd", () => {
    const config = resolveLocalRuntimeConfig({
      cwd,
      env: {
        CESTUS_LOCAL_STORAGE: "app-data",
        CESTUS_APP_DATA_DIR: "state/app-data"
      }
    });

    expect(config.storage).toEqual({
      strategy: "app-data",
      sqlitePath: resolve(cwd, "state/app-data/prr-ledger.sqlite")
    });
  });

  it.each(["0.0.0.0", "::"])(
    "rejects unauthenticated loopback bind with non-loopback host %s",
    (host) => {
      expect(() =>
        resolveLocalRuntimeConfig({
          cwd,
          env: {
            CESTUS_LOCAL_HOST: host
          }
        })
      ).toThrow("Auth is required for non-loopback local runtime exposure");
    }
  );

  it("requires auth when a loopback bind uses an authenticated non-loopback host override", () => {
    const config = resolveLocalRuntimeConfig({
      cwd,
      env: {
        CESTUS_LOCAL_HOST: "0.0.0.0",
        CESTUS_LOCAL_AUTH_TOKEN: "local-secret"
      }
    });

    expect(config.http).toMatchObject({
      host: "0.0.0.0",
      bindMode: "loopback",
      authRequired: true,
      authToken: "local-secret"
    });
  });

  it("falls back to default optional paths when env values are empty", () => {
    const config = resolveLocalRuntimeConfig({
      cwd,
      env: {
        CESTUS_UI_DIST_DIR: "",
        CESTUS_LOCAL_LOG_DIR: ""
      }
    });

    expect(config.staticUi.distDir).toBe(resolve(cwd, "dist"));
    expect(config.logs.dir).toBe(resolve(cwd, ".cestus/local/logs"));
  });

  it.each(["tailnet", "lan"] as const)("rejects %s exposure without auth", (bindMode) => {
    expect(() =>
      resolveLocalRuntimeConfig({
        cwd,
        env: {
          CESTUS_LOCAL_BIND: bindMode,
          CESTUS_LOCAL_HOST: "100.126.143.105"
        }
      })
    ).toThrow("Auth is required for non-loopback local runtime exposure");
  });

  it.each([
    undefined,
    "0.0.0.0",
    "::",
    "127.0.0.1",
    "192.168.1.20",
    "203.0.113.20",
    "fd7a:115c:a1e0::1%tailscale0",
    "not-an-ip"
  ])(
    "rejects invalid tailnet host %s before resolving auth",
    (host) => {
      expect(() =>
        resolveLocalRuntimeConfig({
          cwd,
          env: {
            CESTUS_LOCAL_BIND: "tailnet",
            ...(host === undefined ? {} : { CESTUS_LOCAL_HOST: host }),
            CESTUS_LOCAL_AUTH_TOKEN: "local-secret"
          }
        })
      ).toThrow("Tailnet local runtime host must be an explicit address in the Tailscale IPv4 or IPv6 ranges");
    }
  );

  it.each([" 100.99.12.34 ", " fd7a:115c:a1e0::1 "])(
    "rejects a whitespace-padded raw tailnet environment host %s before resolving config",
    (host) => {
      expect(() =>
        resolveLocalRuntimeConfig({
          cwd,
          env: {
            CESTUS_LOCAL_BIND: "tailnet",
            CESTUS_LOCAL_HOST: host,
            CESTUS_LOCAL_AUTH_TOKEN: "local-secret"
          }
        })
      ).toThrow("Tailnet local runtime host must be an explicit address in the Tailscale IPv4 or IPv6 ranges");
    }
  );

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

  it("accepts an exact IPv6 tailnet environment host", () => {
    const config = resolveLocalRuntimeConfig({
      cwd,
      env: {
        CESTUS_LOCAL_BIND: "tailnet",
        CESTUS_LOCAL_HOST: "fd7a:115c:a1e0::1",
        CESTUS_LOCAL_AUTH_TOKEN: "local-secret"
      }
    });

    expect(config.http.host).toBe("fd7a:115c:a1e0::1");
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
