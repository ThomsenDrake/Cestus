#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const entry = join(here, "..", "src", "node-cli.ts");
const result = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["tsx", entry, ...process.argv.slice(2)],
  { stdio: "inherit" }
);

process.exitCode = result.status ?? 1;
