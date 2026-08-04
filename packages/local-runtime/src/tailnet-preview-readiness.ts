import { statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import {
  resolveLocalRuntimeConfig,
  type LocalRuntimeConfigInput,
  type ResolvedLocalRuntimeConfig
} from "./config.js";
import { assertTailnetAddress } from "./tailnet-address.js";

export interface TailnetPreviewReadinessInput extends LocalRuntimeConfigInput {
  readonly config?: ResolvedLocalRuntimeConfig;
  readonly stat?: (path: string) => { isFile(): boolean };
}

export interface TailnetPreviewReadinessResult {
  readonly bindMode: "tailnet";
  readonly host: string;
  readonly port: number;
  readonly authConfigured: boolean;
  readonly devSeedDisabled: true;
  readonly storageStrategy: ResolvedLocalRuntimeConfig["storage"]["strategy"];
  readonly staticUiPath: string;
  readonly ready: true;
}

export function checkTailnetPreviewReadiness(
  input: TailnetPreviewReadinessInput = {}
): TailnetPreviewReadinessResult {
  const config =
    input.config ??
    resolveLocalRuntimeConfig({
      ...(input.cwd === undefined ? {} : { cwd: input.cwd }),
      ...(input.env === undefined ? {} : { env: input.env }),
      repairSecretConfigPermissions: false
    });
  const staticUiPath = resolve(config.staticUi.distDir, "index.html");
  const stat = input.stat ?? statSync;

  if (config.http.bindMode !== "tailnet") {
    throw new Error("Tailnet preview readiness requires tailnet bind mode");
  }
  assertTailnetAddress(config.http.host);
  if (config.http.authToken === undefined) {
    throw new Error("Tailnet preview readiness requires configured authentication");
  }
  if (config.http.devSeedEnabled) {
    throw new Error("Tailnet preview readiness requires development seed to be disabled");
  }
  for (const path of [config.storage.sqlitePath, config.logs.dir]) {
    if (isPathContainedBy(config.cwd, path)) {
      throw new Error("Tailnet preview readiness requires durable storage outside the repository");
    }
  }
  try {
    if (!stat(staticUiPath).isFile()) {
      throw new Error("not a regular file");
    }
  } catch {
    throw new Error(`Tailnet preview readiness requires built static UI entry point at ${staticUiPath}`);
  }

  return Object.freeze({
    bindMode: "tailnet",
    host: config.http.host,
    port: config.http.port,
    authConfigured: true,
    devSeedDisabled: true,
    storageStrategy: config.storage.strategy,
    staticUiPath,
    ready: true
  });
}

function isPathContainedBy(repositoryRoot: string, path: string): boolean {
  const relativePath = relative(resolve(repositoryRoot), resolve(path));
  return relativePath === "" || (!relativePath.startsWith(`..${sep}`) && relativePath !== ".." && !isAbsolute(relativePath));
}
