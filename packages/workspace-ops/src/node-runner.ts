import { existsSync } from "node:fs";
import {
  checkBackupManifest,
  exportWorkspaceManifest,
  inspectWorkspaceDiagnostics,
  reportDiskUsage,
  resolveWorkspaceLayout,
  verifyWorkspace,
  type BackupManifestInput,
  type ManifestExportDto,
  type WorkspaceOpsCliOperationContext,
  type WorkspaceOpsEnvelope
} from "./index.js";
import { NodeWorkspaceFileSystem } from "./filesystem.js";

interface WorkspaceOpsNodeOptions {
  readonly root: string;
  readonly workspaceId?: string;
  readonly manifestPath?: string;
}

export async function runNodeWorkspaceOperation(
  context: WorkspaceOpsCliOperationContext
): Promise<WorkspaceOpsEnvelope> {
  const options = parseWorkspaceOpsFlags(context.argv);
  const fileSystem = new NodeWorkspaceFileSystem();
  const layout = await resolveWorkspaceLayout(
    {
      rootPath: options.root,
      ...(options.workspaceId === undefined ? {} : { expectedWorkspaceId: options.workspaceId })
    },
    fileSystem
  );

  if (context.command === "detect drive") {
    return layout.envelope;
  }

  if (layout.layout === undefined) {
    return verifyWorkspace({
      layout,
      fileSystem,
      eventReader: missingEventReader()
    });
  }

  if (layout.workspace === undefined) {
    throw new Error("Resolved workspace layout is missing a safe workspace identity.");
  }

  const eventReader = sqliteEventReader();
  switch (context.command) {
    case "verify workspace":
      return verifyWorkspace({ layout, fileSystem, eventReader });
    case "disk usage":
      return reportDiskUsage({ layout: layout.layout, fileSystem });
    case "diagnostics inspect": {
      const durableEvents = await readDurableEventsIfPresent(layout.layout.ledgerPath);
      return inspectWorkspaceDiagnostics({
        durableEvents,
        derivedDiagnostics: layout.diagnostics
      });
    }
    case "manifest export": {
      const [diskUsage, events] = await Promise.all([
        reportDiskUsage({ layout: layout.layout, fileSystem }),
        readDurableEventsIfPresent(layout.layout.ledgerPath)
      ]);
      return exportWorkspaceManifest({
        workspace: layout.workspace,
        layout: layout.layout,
        ledgerEventCount: events.length,
        ledgerHighWaterMark: events.length,
        categoryBytes: diskUsage.payload?.categories ?? [],
        createdAt: new Date().toISOString()
      });
    }
    case "backup check": {
      const events = await readDurableEventsIfPresent(layout.layout.ledgerPath);
      return checkBackupManifest({
        workspace: layout.workspace,
        currentLedgerHighWaterMark: events.length,
        backupManifest: await readBackupManifestIfProvided(options, fileSystem)
      });
    }
    default:
      throw new Error(`Workspace ops command ${context.command} is not wired in the node runner.`);
  }
}

function parseWorkspaceOpsFlags(argv: readonly string[]): WorkspaceOpsNodeOptions {
  let root: string | undefined;
  let workspaceId: string | undefined;
  let manifestPath: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") {
      root = requiredValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--workspace-id") {
      workspaceId = requiredValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--manifest") {
      manifestPath = requiredValue(argv, index, arg);
      index += 1;
    }
  }
  if (root === undefined) {
    throw new Error("Workspace ops commands require --root <workspace-root>.");
  }
  return {
    root,
    ...(workspaceId === undefined ? {} : { workspaceId }),
    ...(manifestPath === undefined ? {} : { manifestPath })
  };
}

function requiredValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return value;
}

function sqliteEventReader() {
  return {
    async readAll(layout: { readonly ledgerPath: string }) {
      return readDurableEventsIfPresent(layout.ledgerPath);
    }
  };
}

function missingEventReader() {
  return {
    async readAll() {
      return [];
    }
  };
}

async function readDurableEventsIfPresent(ledgerPath: string) {
  if (!existsSync(ledgerPath)) {
    return [];
  }
  const { SQLiteEventLedger } = await import("../../ontology/src/sqlite-event-ledger.js");
  const ledger = new SQLiteEventLedger(ledgerPath);
  try {
    return await ledger.readAll();
  } finally {
    ledger.close();
  }
}

async function readBackupManifestIfProvided(
  options: WorkspaceOpsNodeOptions,
  fileSystem: NodeWorkspaceFileSystem
): Promise<BackupManifestInput | ManifestExportDto | undefined> {
  if (options.manifestPath === undefined) {
    return undefined;
  }
  return JSON.parse(await fileSystem.readText(options.manifestPath)) as BackupManifestInput | ManifestExportDto;
}
