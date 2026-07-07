import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { isIP } from "node:net";
import { dirname, isAbsolute, resolve } from "node:path";

export interface LocalRuntimeConfigFile {
  readonly storage?: {
    readonly strategy?: "repo-local" | "explicit-path" | "app-data" | "portable-workspace";
    readonly sqlitePath?: string;
    readonly appDataDir?: string;
    readonly workspaceRoot?: string;
    readonly expectedWorkspaceId?: string;
  };
  readonly http?: {
    readonly host?: string;
    readonly port?: number;
    readonly bindMode?: "loopback" | "tailnet" | "lan";
    readonly authToken?: string;
    readonly devSeedEnabled?: boolean;
  };
  readonly staticUi?: {
    readonly distDir?: string;
  };
  readonly logs?: {
    readonly dir?: string;
  };
}

export interface WriteLocalRuntimeOnboardingConfigInput {
  readonly cwd?: string;
  readonly env?: Record<string, string | undefined>;
  readonly bindMode: "loopback" | "tailnet" | "lan";
  readonly host?: string;
  readonly port?: number;
  readonly storageStrategy?: "repo-local" | "explicit-path" | "app-data" | "portable-workspace";
  readonly sqlitePath?: string;
  readonly appDataDir?: string;
  readonly workspaceRoot?: string;
  readonly expectedWorkspaceId?: string;
  readonly distDir?: string;
  readonly logDir?: string;
  readonly devSeedEnabled?: boolean;
  readonly rotateAuthToken?: boolean;
}

export interface LocalRuntimeConfigFileInput {
  readonly cwd?: string;
  readonly env?: Record<string, string | undefined>;
}

export interface WrittenLocalRuntimeOnboardingConfig {
  readonly path: string;
  readonly config: LocalRuntimeConfigFile;
}

export function resolveLocalRuntimeConfigFilePath(input: LocalRuntimeConfigFileInput = {}): string {
  const cwd = resolve(input.cwd ?? process.cwd());
  const env = input.env ?? process.env;
  const explicitPath = normalizeOptional(env.CESTUS_LOCAL_CONFIG_PATH);
  return explicitPath === undefined ? resolve(cwd, ".cestus/local/runtime.config.json") : resolvePath(cwd, explicitPath);
}

export function readLocalRuntimeConfigFile(
  input: LocalRuntimeConfigFileInput = {}
): LocalRuntimeConfigFile | undefined {
  const path = resolveLocalRuntimeConfigFilePath(input);
  if (!existsSync(path)) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid local runtime config JSON at ${path}: ${reason}`);
  }

  const config = parseLocalRuntimeConfigFile(parsed, path);
  repairSecretConfigPermissions(path, config);
  return config;
}

export function writeLocalRuntimeOnboardingConfig(
  input: WriteLocalRuntimeOnboardingConfigInput
): WrittenLocalRuntimeOnboardingConfig {
  const path = resolveLocalRuntimeConfigFilePath(input);
  const existing = readLocalRuntimeConfigFile(input) ?? {};
  const config = mergeOnboardingConfig(existing, input);
  validateWritableConfig(config);

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);

  return Object.freeze({
    path,
    config
  });
}

export function redactLocalRuntimeConfigFile(
  config: LocalRuntimeConfigFile | undefined
): LocalRuntimeConfigFile | undefined {
  if (config === undefined) {
    return undefined;
  }

  return Object.freeze({
    ...(config.storage === undefined ? {} : { storage: Object.freeze({ ...config.storage }) }),
    ...(config.http === undefined
      ? {}
      : {
          http: Object.freeze({
            ...config.http,
            ...(config.http.authToken === undefined ? {} : { authToken: "[redacted]" })
          })
        }),
    ...(config.staticUi === undefined ? {} : { staticUi: Object.freeze({ ...config.staticUi }) }),
    ...(config.logs === undefined ? {} : { logs: Object.freeze({ ...config.logs }) })
  });
}

function mergeOnboardingConfig(
  existing: LocalRuntimeConfigFile,
  input: WriteLocalRuntimeOnboardingConfigInput
): LocalRuntimeConfigFile {
  const storage = mergeStorageConfig(existing, input);
  const http = mergeHttpConfig(existing, input);
  const staticUi = {
    ...(existing.staticUi ?? {}),
    ...(input.distDir === undefined ? {} : { distDir: input.distDir })
  };
  const logs = {
    ...(existing.logs ?? {}),
    ...(input.logDir === undefined ? {} : { dir: input.logDir })
  };

  return Object.freeze({
    ...(storage === undefined ? {} : { storage: Object.freeze(storage) }),
    http: Object.freeze(http),
    ...(Object.keys(staticUi).length === 0 ? {} : { staticUi: Object.freeze(staticUi) }),
    ...(Object.keys(logs).length === 0 ? {} : { logs: Object.freeze(logs) })
  });
}

function mergeStorageConfig(
  existing: LocalRuntimeConfigFile,
  input: WriteLocalRuntimeOnboardingConfigInput
): LocalRuntimeConfigFile["storage"] {
  const workspaceRootChanged = workspaceRootChangedFor(existing.storage ?? {}, input);
  if (input.storageStrategy !== undefined) {
    return storageConfigForStrategy(existing.storage ?? {}, input.storageStrategy, input, workspaceRootChanged);
  }

  const { expectedWorkspaceId: _staleExpectedWorkspaceId, ...existingStorageWithoutExpectedId } =
    existing.storage ?? {};
  const baseStorage = workspaceRootChanged ? existingStorageWithoutExpectedId : existing.storage ?? {};
  const storage = {
    ...baseStorage,
    ...(input.sqlitePath === undefined ? {} : { sqlitePath: input.sqlitePath }),
    ...(input.appDataDir === undefined ? {} : { appDataDir: input.appDataDir }),
    ...(input.workspaceRoot === undefined ? {} : { workspaceRoot: input.workspaceRoot }),
    ...(input.expectedWorkspaceId === undefined ? {} : { expectedWorkspaceId: input.expectedWorkspaceId })
  };

  return Object.keys(storage).length === 0 ? undefined : storage;
}

function storageConfigForStrategy(
  existing: NonNullable<LocalRuntimeConfigFile["storage"]>,
  strategy: NonNullable<WriteLocalRuntimeOnboardingConfigInput["storageStrategy"]>,
  input: WriteLocalRuntimeOnboardingConfigInput,
  workspaceRootChanged: boolean
): NonNullable<LocalRuntimeConfigFile["storage"]> {
  if (strategy === "repo-local") {
    return { strategy };
  }

  if (strategy === "explicit-path") {
    const sqlitePath = input.sqlitePath ?? existing.sqlitePath;
    return {
      strategy,
      ...(sqlitePath === undefined ? {} : { sqlitePath })
    };
  }

  if (strategy === "app-data") {
    const appDataDir = input.appDataDir ?? existing.appDataDir;
    return {
      strategy,
      ...(appDataDir === undefined ? {} : { appDataDir })
    };
  }

  const workspaceRoot = input.workspaceRoot ?? existing.workspaceRoot;
  const expectedWorkspaceId =
    input.expectedWorkspaceId ?? (workspaceRootChanged ? undefined : existing.expectedWorkspaceId);
  return {
    strategy,
    ...(workspaceRoot === undefined ? {} : { workspaceRoot }),
    ...(expectedWorkspaceId === undefined ? {} : { expectedWorkspaceId })
  };
}

function workspaceRootChangedFor(
  existing: NonNullable<LocalRuntimeConfigFile["storage"]>,
  input: WriteLocalRuntimeOnboardingConfigInput
): boolean {
  return (
    input.workspaceRoot !== undefined &&
    existing.workspaceRoot !== undefined &&
    input.workspaceRoot !== existing.workspaceRoot
  );
}

function mergeHttpConfig(
  existing: LocalRuntimeConfigFile,
  input: WriteLocalRuntimeOnboardingConfigInput
): NonNullable<LocalRuntimeConfigFile["http"]> {
  const http: {
    host?: string;
    port?: number;
    bindMode: "loopback" | "tailnet" | "lan";
    authToken?: string;
    devSeedEnabled?: boolean;
  } = {
    ...(existing.http ?? {}),
    bindMode: input.bindMode,
    ...(input.host === undefined ? {} : { host: input.host }),
    ...(input.port === undefined ? {} : { port: input.port }),
    ...(input.devSeedEnabled === undefined ? {} : { devSeedEnabled: input.devSeedEnabled })
  };

  if (input.bindMode === "loopback") {
    const { authToken: _authToken, ...loopbackHttp } = http;
    return {
      ...loopbackHttp,
      host: input.host ?? "127.0.0.1"
    };
  }

  return {
    ...http,
    authToken:
      input.rotateAuthToken === true || http.authToken === undefined ? generateAuthToken() : http.authToken
  };
}

function parseLocalRuntimeConfigFile(value: unknown, path: string): LocalRuntimeConfigFile {
  const root = expectObject(value, "local runtime config");
  assertAllowedKeys(root, ["storage", "http", "staticUi", "logs"], "local runtime config");

  const storage = parseOptionalSection(root, "storage", path, parseStorageConfig);
  const http = parseOptionalSection(root, "http", path, parseHttpConfig);
  const staticUi = parseOptionalSection(root, "staticUi", path, parseStaticUiConfig);
  const logs = parseOptionalSection(root, "logs", path, parseLogsConfig);

  return Object.freeze({
    ...(storage === undefined ? {} : { storage }),
    ...(http === undefined ? {} : { http }),
    ...(staticUi === undefined ? {} : { staticUi }),
    ...(logs === undefined ? {} : { logs })
  });
}

function parseStorageConfig(
  record: Record<string, unknown>,
  path: string
): NonNullable<LocalRuntimeConfigFile["storage"]> {
  assertAllowedKeys(
    record,
    ["strategy", "sqlitePath", "appDataDir", "workspaceRoot", "expectedWorkspaceId"],
    "storage"
  );
  return Object.freeze({
    ...parseOptionalEnum(record, "strategy", path, [
      "repo-local",
      "explicit-path",
      "app-data",
      "portable-workspace"
    ]),
    ...parseOptionalString(record, "sqlitePath", path),
    ...parseOptionalString(record, "appDataDir", path),
    ...parseOptionalString(record, "workspaceRoot", path),
    ...parseOptionalString(record, "expectedWorkspaceId", path)
  });
}

function parseHttpConfig(
  record: Record<string, unknown>,
  path: string
): NonNullable<LocalRuntimeConfigFile["http"]> {
  assertAllowedKeys(record, ["host", "port", "bindMode", "authToken", "devSeedEnabled"], "http");
  return Object.freeze({
    ...parseOptionalString(record, "host", path),
    ...parseOptionalPort(record, "port", path),
    ...parseOptionalEnum(record, "bindMode", path, ["loopback", "tailnet", "lan"]),
    ...parseOptionalString(record, "authToken", path),
    ...parseOptionalBoolean(record, "devSeedEnabled", path)
  });
}

function parseStaticUiConfig(
  record: Record<string, unknown>,
  path: string
): NonNullable<LocalRuntimeConfigFile["staticUi"]> {
  assertAllowedKeys(record, ["distDir"], "staticUi");
  return Object.freeze({
    ...parseOptionalString(record, "distDir", path)
  });
}

function parseLogsConfig(
  record: Record<string, unknown>,
  path: string
): NonNullable<LocalRuntimeConfigFile["logs"]> {
  assertAllowedKeys(record, ["dir"], "logs");
  return Object.freeze({
    ...parseOptionalString(record, "dir", path)
  });
}

function parseOptionalSection<T>(
  root: Record<string, unknown>,
  key: string,
  path: string,
  parse: (record: Record<string, unknown>, path: string) => T
): T | undefined {
  if (!Object.prototype.hasOwnProperty.call(root, key)) {
    return undefined;
  }
  return parse(expectObject(root[key], `${key} in ${path}`), path);
}

function parseOptionalString(
  record: Record<string, unknown>,
  key: string,
  path: string
): Record<string, string> {
  if (!Object.prototype.hasOwnProperty.call(record, key)) {
    return {};
  }
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid local runtime config at ${path}: ${key} must be a non-empty string`);
  }
  return { [key]: value };
}

function parseOptionalBoolean(
  record: Record<string, unknown>,
  key: string,
  path: string
): Record<string, boolean> {
  if (!Object.prototype.hasOwnProperty.call(record, key)) {
    return {};
  }
  const value = record[key];
  if (typeof value !== "boolean") {
    throw new Error(`Invalid local runtime config at ${path}: ${key} must be a boolean`);
  }
  return { [key]: value };
}

function parseOptionalPort(
  record: Record<string, unknown>,
  key: string,
  path: string
): Record<string, number> {
  if (!Object.prototype.hasOwnProperty.call(record, key)) {
    return {};
  }
  const value = record[key];
  if (!Number.isInteger(value) || typeof value !== "number" || value < 1 || value > 65535) {
    throw new Error(`Invalid local runtime config at ${path}: ${key} must be an integer port`);
  }
  return { [key]: value };
}

function parseOptionalEnum<T extends string>(
  record: Record<string, unknown>,
  key: string,
  path: string,
  allowed: readonly T[]
): Record<string, T> {
  if (!Object.prototype.hasOwnProperty.call(record, key)) {
    return {};
  }
  const value = record[key];
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(
      `Invalid local runtime config at ${path}: ${key} must be one of ${allowed.join(", ")}`
    );
  }
  return { [key]: value as T };
}

function expectObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Invalid ${label}: expected an object`);
  }
  return value as Record<string, unknown>;
}

function assertAllowedKeys(record: Record<string, unknown>, allowed: readonly string[], label: string): void {
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) {
      throw new Error(`Invalid ${label}: unsupported key ${key}`);
    }
  }
}

function generateAuthToken(): string {
  return randomBytes(32).toString("base64url");
}

function repairSecretConfigPermissions(path: string, config: LocalRuntimeConfigFile): void {
  if (config.http?.authToken === undefined) {
    return;
  }

  const mode = statSync(path).mode & 0o777;
  if ((mode & 0o077) === 0) {
    return;
  }

  try {
    chmodSync(path, 0o600);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Local runtime config at ${path} contains auth material but permissions could not be restricted: ${reason}`
    );
  }
}

function validateWritableConfig(config: LocalRuntimeConfigFile): void {
  if (
    config.http?.bindMode === "loopback" &&
    config.http.host !== undefined &&
    !isLoopbackHost(config.http.host)
  ) {
    throw new Error("Loopback local runtime config cannot use a non-loopback host");
  }

  if (config.storage?.strategy === "explicit-path" && config.storage.sqlitePath === undefined) {
    throw new Error("explicit-path storage requires a sqlitePath");
  }

  if (config.storage?.strategy === "portable-workspace" && config.storage.workspaceRoot === undefined) {
    throw new Error("portable-workspace storage requires a workspaceRoot");
  }
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
