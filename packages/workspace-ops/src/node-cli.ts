import { pathToFileURL } from "node:url";
import { runWorkspaceOpsCli } from "./cli.js";
import { runNodeWorkspaceOperation } from "./node-runner.js";

const operations = {
  verifyWorkspace: runNodeWorkspaceOperation,
  diskUsage: runNodeWorkspaceOperation,
  detectDrive: runNodeWorkspaceOperation,
  diagnosticsInspect: runNodeWorkspaceOperation,
  manifestExport: runNodeWorkspaceOperation,
  backupCheck: runNodeWorkspaceOperation
};

const entrypoint = process.argv[1] === undefined ? undefined : pathToFileURL(process.argv[1]).href;

if (import.meta.url === entrypoint) {
  const exitCode = await runWorkspaceOpsCli(process.argv.slice(2), { operations });
  process.exitCode = exitCode;
}
