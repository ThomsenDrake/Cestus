import { lstatSync } from "node:fs";
import { mountPortableWorkspace } from "../../workspace/src/index.js";
import type { ResolvedLocalRuntimeConfig } from "./config.js";

/** Observe existing canonical storage without creating directories or databases. */
export function observeServerWorkspace(config: ResolvedLocalRuntimeConfig) {
  if (config.storage.strategy !== "portable-workspace") {
    return { state: "unmounted" as const, identity: "unmounted" };
  }
  const mounted = mountPortableWorkspace({
    rootDir: config.storage.workspaceRoot,
    ...(config.storage.expectedWorkspaceId === undefined ? {} : { expectedWorkspaceId: config.storage.expectedWorkspaceId })
  });
  if (!mounted.ok) throw new Error("Portable workspace is unavailable.");
  const { workspace } = mounted;
  const ledger = lstatSync(workspace.paths.ledgerPath);
  if (!ledger.isFile() || ledger.isSymbolicLink()) throw new Error("Existing workspace ledger is required.");
  const identity = JSON.stringify(Object.values(workspace.paths).map(path => {
    const stat = lstatSync(path);
    return [path, stat.dev, stat.ino];
  }));
  return {
    state: "ready" as const, identity, workspaceId: workspace.workspaceId,
    label: workspace.label, storageLocation: workspace.rootDir
  };
}

export const unavailableWorkspaceDiagnostic = Object.freeze({
  message: "Workspace storage is unavailable. Reconnect the configured storage or restore a stopped-runtime backup, then restart Cestus. No fallback workspace was opened.",
  allowedRepairActions: ["check the configured workspace path and identity", "reconnect storage or restore a backup", "restart Cestus"]
});
