#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const tsxCli = resolve(repoRoot, "node_modules/tsx/dist/cli.mjs");
const runner = resolve(repoRoot, "packages/ingestion/src/cli-runner.ts");

if (!existsSync(tsxCli)) {
  console.error(JSON.stringify({
    ok: false,
    error: {
      code: "INGESTION_RUNTIME_WIRING_REQUIRED",
      command: "cestus-ingest",
      message: "The ingestion CLI requires local project dependencies. Run npm install before using this command."
    }
  }, null, 2));
  process.exit(1);
}

const result = spawnSync(process.execPath, [tsxCli, runner, ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(result.status ?? 1);
