import { isIP } from "node:net";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

export type LocalRuntimeStorageStrategy = "repo-local" | "explicit-path" | "app-data";
export type LocalRuntimeBindMode = "loopback" | "tailnet" | "lan";

export interface LocalRuntimeConfigInput {
  readonly cwd?: string;
  readonly env?: Record<string, string | undefined>;
}

export interface ResolvedLocalRuntimeConfig {
  readonly cwd: string;
  readonly storage: {
    readonly strategy: LocalRuntimeStorageStrategy;
    readonly sqlitePath: string;
  };
  readonly http: {
    readonly host: string;
    readonly port: number;
    readonly bindMode: LocalRuntimeBindMode;
    readonly authRequired: boolean;
    readonly authToken?: string;
    readonly devSeedEnabled: boolean;
  };
  readonly staticUi: {
    readonly distDir: string;
  };
  readonly logs: {
    readonly dir: string;
  };
}

export function resolveLocalRuntimeConfig(
  input: LocalRuntimeConfigInput = {}
): ResolvedLocalRuntimeConfig {
  const cwd = resolve(input.cwd ?? process.cwd());
  const env = input.env ?? process.env;
  const bindMode = parseBindMode(env.CESTUS_LOCAL_BIND);
  const host = resolveHost(bindMode, env);
  const authToken = normalizeOptional(env.CESTUS_LOCAL_AUTH_TOKEN);
  const authRequired = bindMode !== "loopback" || !isLoopbackHost(host);

  if (authRequired && authToken === undefined) {
    throw new Error("Auth is required for non-loopback local runtime exposure");
  }

  const config = {
    cwd,
    storage: resolveStorage(cwd, env),
    http: {
      host,
      port: parsePort(env.CESTUS_LOCAL_PORT),
      bindMode,
      authRequired,
      ...(authToken === undefined ? {} : { authToken }),
      devSeedEnabled: env.CESTUS_DEV_SEED_PRR === "true"
    },
    staticUi: {
      distDir: resolvePath(cwd, normalizeOptional(env.CESTUS_UI_DIST_DIR) ?? "dist")
    },
    logs: {
      dir: resolvePath(cwd, normalizeOptional(env.CESTUS_LOCAL_LOG_DIR) ?? ".cestus/local/logs")
    }
  } satisfies ResolvedLocalRuntimeConfig;

  return Object.freeze(config);
}

function resolveStorage(
  cwd: string,
  env: Record<string, string | undefined>
): ResolvedLocalRuntimeConfig["storage"] {
  const strategy = parseStorageStrategy(env.CESTUS_LOCAL_STORAGE);

  if (strategy === "repo-local") {
    return Object.freeze({
      strategy,
      sqlitePath: resolvePath(cwd, ".cestus/local/prr-ledger.sqlite")
    });
  }

  if (strategy === "explicit-path") {
    const sqlitePath = normalizeOptional(env.CESTUS_LOCAL_SQLITE_PATH);
    if (sqlitePath === undefined) {
      throw new Error("CESTUS_LOCAL_SQLITE_PATH is required for explicit-path storage");
    }
    return Object.freeze({
      strategy,
      sqlitePath: resolvePath(cwd, sqlitePath)
    });
  }

  const appDataDir = resolvePath(
    cwd,
    normalizeOptional(env.CESTUS_APP_DATA_DIR) ?? join(homedir(), ".local/share/cestus")
  );
  return Object.freeze({
    strategy,
    sqlitePath: join(appDataDir, "prr-ledger.sqlite")
  });
}

function parseStorageStrategy(value: string | undefined): LocalRuntimeStorageStrategy {
  if (value === undefined || value === "repo-local") {
    return "repo-local";
  }
  if (value === "explicit-path" || value === "app-data") {
    return value;
  }
  throw new Error(`Unsupported local runtime storage strategy: ${value}`);
}

function parseBindMode(value: string | undefined): LocalRuntimeBindMode {
  if (value === undefined || value === "loopback") {
    return "loopback";
  }
  if (value === "tailnet" || value === "lan") {
    return value;
  }
  throw new Error(`Unsupported local runtime bind mode: ${value}`);
}

function resolveHost(
  bindMode: LocalRuntimeBindMode,
  env: Record<string, string | undefined>
): string {
  const explicitHost = normalizeOptional(env.CESTUS_LOCAL_HOST);
  if (explicitHost !== undefined) {
    return explicitHost;
  }
  return bindMode === "loopback" ? "127.0.0.1" : "0.0.0.0";
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  if (normalized === "localhost") {
    return true;
  }
  if (isIP(normalized) === 4) {
    return normalized.startsWith("127.");
  }
  return normalized === "::1" || normalized === "0:0:0:0:0:0:0:1";
}

function parsePort(value: string | undefined): number {
  if (value === undefined) {
    return 8787;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid local runtime port: ${value}`);
  }
  return parsed;
}

function resolvePath(cwd: string, path: string): string {
  return isAbsolute(path) ? path : resolve(cwd, path);
}

function normalizeOptional(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}
