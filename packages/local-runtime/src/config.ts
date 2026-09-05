import { isIP } from "node:net";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { readLocalRuntimeConfigFile, type LocalRuntimeConfigFile } from "./config-file.js";
import { assertTailnetAddress } from "./tailnet-address.js";

export type LocalRuntimeStorageStrategy =
  | "repo-local"
  | "explicit-path"
  | "app-data"
  | "portable-workspace";
export type LocalRuntimeBindMode = "loopback" | "tailnet" | "lan";

export interface LocalRuntimeConfigInput {
  readonly cwd?: string;
  readonly env?: Record<string, string | undefined>;
  readonly repairSecretConfigPermissions?: boolean;
}

export interface ResolvedLocalRuntimeConfig {
  readonly cwd: string;
  readonly operator?: { readonly id: string; readonly kind: "human"; readonly label: string };
  readonly storage:
    | {
        readonly strategy: "repo-local" | "explicit-path" | "app-data";
        readonly sqlitePath: string;
      }
    | {
        readonly strategy: "portable-workspace";
        readonly workspaceRoot: string;
        readonly expectedWorkspaceId?: string;
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
  const environmentBindMode = normalizeOptional(env.CESTUS_LOCAL_BIND);
  if (environmentBindMode === "tailnet" && env.CESTUS_LOCAL_HOST !== undefined) {
    assertTailnetAddress(env.CESTUS_LOCAL_HOST);
  }
  const configFile = readLocalRuntimeConfigFile({
    cwd,
    env,
    ...(input.repairSecretConfigPermissions === undefined
      ? {}
      : { repairSecretPermissions: input.repairSecretConfigPermissions })
  });
  const bindMode = parseBindMode(environmentBindMode ?? configFile?.http?.bindMode);
  const host = resolveHost(bindMode, env, configFile);
  const authToken = normalizeOptional(env.CESTUS_LOCAL_AUTH_TOKEN) ?? configFile?.http?.authToken;
  const authRequired = true;

  if ((bindMode !== "loopback" || !isLoopbackHost(host)) && authToken === undefined) {
    throw new Error("Auth is required for non-loopback local runtime exposure");
  }

  const config = {
    cwd,
    ...(configFile?.operator === undefined ? {} : { operator: { ...configFile.operator, kind: "human" as const } }),
    storage: resolveStorage(cwd, env, configFile),
    http: {
      host,
      port: parsePort(normalizeOptional(env.CESTUS_LOCAL_PORT) ?? configFile?.http?.port),
      bindMode,
      authRequired,
      ...(authToken === undefined ? {} : { authToken }),
      devSeedEnabled: resolveDevSeedEnabled(env, configFile)
    },
    staticUi: {
      distDir: resolvePath(cwd, normalizeOptional(env.CESTUS_UI_DIST_DIR) ?? configFile?.staticUi?.distDir ?? "dist")
    },
    logs: {
      dir: resolvePath(
        cwd,
        normalizeOptional(env.CESTUS_LOCAL_LOG_DIR) ?? configFile?.logs?.dir ?? ".cestus/local/logs"
      )
    }
  } satisfies ResolvedLocalRuntimeConfig;

  return Object.freeze(config);
}

function resolveStorage(
  cwd: string,
  env: Record<string, string | undefined>,
  configFile: LocalRuntimeConfigFile | undefined
): ResolvedLocalRuntimeConfig["storage"] {
  const strategy = parseStorageStrategy(
    normalizeOptional(env.CESTUS_LOCAL_STORAGE) ?? configFile?.storage?.strategy
  );

  if (strategy === "repo-local") {
    return Object.freeze({
      strategy,
      sqlitePath: resolvePath(cwd, ".cestus/local/prr-ledger.sqlite")
    });
  }

  if (strategy === "explicit-path") {
    const sqlitePath = normalizeOptional(env.CESTUS_LOCAL_SQLITE_PATH) ?? configFile?.storage?.sqlitePath;
    if (sqlitePath === undefined) {
      throw new Error("CESTUS_LOCAL_SQLITE_PATH is required for explicit-path storage");
    }
    return Object.freeze({
      strategy,
      sqlitePath: resolvePath(cwd, sqlitePath)
    });
  }

  if (strategy === "portable-workspace") {
    const workspaceRoot = normalizeOptional(env.CESTUS_WORKSPACE_ROOT) ?? configFile?.storage?.workspaceRoot;
    if (workspaceRoot === undefined) {
      throw new Error("CESTUS_WORKSPACE_ROOT is required for portable-workspace storage");
    }
    const resolvedRoot = resolvePath(cwd, workspaceRoot);
    const expectedWorkspaceId =
      normalizeOptional(env.CESTUS_WORKSPACE_ID) ?? configFile?.storage?.expectedWorkspaceId;
    return Object.freeze({
      strategy,
      workspaceRoot: resolvedRoot,
      ...(expectedWorkspaceId === undefined ? {} : { expectedWorkspaceId }),
      sqlitePath: join(resolvedRoot, "ledger", "ontology.sqlite")
    });
  }

  const appDataDir = resolvePath(
    cwd,
    normalizeOptional(env.CESTUS_APP_DATA_DIR) ??
      configFile?.storage?.appDataDir ??
      join(homedir(), ".local/share/cestus")
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
  if (value === "explicit-path" || value === "app-data" || value === "portable-workspace") {
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
  env: Record<string, string | undefined>,
  configFile: LocalRuntimeConfigFile | undefined
): string {
  const rawEnvironmentHost = env.CESTUS_LOCAL_HOST;
  if (bindMode === "tailnet" && rawEnvironmentHost !== undefined) {
    assertTailnetAddress(rawEnvironmentHost);
  }
  const explicitHost = normalizeOptional(rawEnvironmentHost) ?? configFile?.http?.host;
  if (bindMode === "tailnet") {
    assertTailnetAddress(explicitHost);
  }
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

function parsePort(value: string | number | undefined): number {
  if (value === undefined) {
    return 8787;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid local runtime port: ${value}`);
  }
  return parsed;
}

function resolveDevSeedEnabled(
  env: Record<string, string | undefined>,
  configFile: LocalRuntimeConfigFile | undefined
): boolean {
  const envValue = normalizeOptional(env.CESTUS_DEV_SEED_PRR);
  if (envValue !== undefined) {
    return envValue === "true";
  }
  return configFile?.http?.devSeedEnabled === true;
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
