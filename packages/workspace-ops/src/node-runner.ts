import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";
import { validateKnowledgeEvent, type KnowledgeEvent } from "../../ontology/src/contracts.js";
import {
  checkBackupManifest,
  createWorkspaceOpsEnvelope,
  exportWorkspaceManifest,
  inspectWorkspaceDiagnostics,
  rebuildProjection,
  rebuildProjectionReadiness,
  reportDiskUsage,
  resolveWorkspaceLayout,
  verifyWorkspace,
  type BackupManifestInput,
  type ManifestExportDto,
  type ProjectionBuilder,
  type ResolvedWorkspaceLayout,
  type WorkspaceOpsCliCommand,
  type WorkspaceOpsCliOperationContext,
  type WorkspaceOpsEnvelope
} from "./index.js";
import { NodeWorkspaceFileSystem } from "./filesystem.js";

interface WorkspaceOpsNodeOptions {
  readonly root: string;
  readonly workspaceId?: string;
  readonly manifestPath?: string;
  readonly projectionName?: string;
  readonly rebuildId?: string;
}

interface StoredEventRow {
  readonly id: string;
  readonly type: string;
  readonly version: number | bigint;
  readonly stream_id: string;
  readonly stream_sequence: number | bigint;
  readonly context_json: string;
  readonly payload_json: string;
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
    if (context.command !== "verify workspace") {
      return blockedLayoutEnvelope(context.command, layout);
    }
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
    case "projection rebuild-readiness":
      return rebuildProjectionReadiness({
        layout: layout.layout,
        projectionName: options.projectionName ?? "workspace",
        fileSystem: new NodeProjectionArtifactFileSystem(layout.layout),
        eventReader
      });
    case "projection rebuild": {
      const projectionName = options.projectionName ?? "workspace";
      return rebuildProjection({
        layout: layout.layout,
        projectionName,
        fileSystem: new NodeProjectionArtifactFileSystem(layout.layout),
        eventReader,
        builder: defaultProjectionBuilder(projectionName),
        rebuildId: options.rebuildId ?? generatedRebuildId()
      });
    }
    case "diagnostics inspect": {
      const durableEvents = await safeReadDurableEventsForCommand(context.command, layout.layout, layout.workspace);
      if ("envelope" in durableEvents) {
        return durableEvents.envelope;
      }
      return inspectWorkspaceDiagnostics({
        durableEvents: durableEvents.events,
        derivedDiagnostics: layout.diagnostics
      });
    }
    case "manifest export": {
      const diskUsage = await reportDiskUsage({ layout: layout.layout, fileSystem });
      const events = await safeReadDurableEventsForCommand(context.command, layout.layout, layout.workspace);
      if ("envelope" in events) {
        return events.envelope;
      }
      return exportWorkspaceManifest({
        workspace: layout.workspace,
        layout: layout.layout,
        ledgerEventCount: events.events.length,
        ledgerHighWaterMark: events.events.length,
        categoryBytes: diskUsage.payload?.categories ?? [],
        createdAt: new Date().toISOString()
      });
    }
    case "backup check": {
      const events = await safeReadDurableEventsForCommand(context.command, layout.layout, layout.workspace);
      if ("envelope" in events) {
        return events.envelope;
      }
      return checkBackupManifest({
        workspace: layout.workspace,
        currentLedgerHighWaterMark: events.events.length,
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
  let projectionName: string | undefined;
  let rebuildId: string | undefined;
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
      continue;
    }
    if (arg === "--projection") {
      projectionName = requiredValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--rebuild-id") {
      rebuildId = requiredValue(argv, index, arg);
      index += 1;
    }
  }
  if (root === undefined) {
    throw new Error("Workspace ops commands require --root <workspace-root>.");
  }
  return {
    root,
    ...(workspaceId === undefined ? {} : { workspaceId }),
    ...(manifestPath === undefined ? {} : { manifestPath }),
    ...(projectionName === undefined ? {} : { projectionName }),
    ...(rebuildId === undefined ? {} : { rebuildId })
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
  const { DatabaseSync } = await import("node:sqlite");
  const ledger = new DatabaseSync(ledgerPath, { readOnly: true });
  try {
    const rows = ledger
      .prepare(`
        SELECT id, type, version, stream_id, stream_sequence, context_json, payload_json
        FROM ontology_events
        ORDER BY global_sequence ASC
      `)
      .all() as unknown as StoredEventRow[];
    return rows.map(eventFromRow);
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

function eventFromRow(row: StoredEventRow): KnowledgeEvent {
  let context: unknown;
  let payload: unknown;
  try {
    context = JSON.parse(row.context_json);
    payload = JSON.parse(row.payload_json);
  } catch {
    throw new Error("Stored workspace ledger event is invalid JSON.");
  }

  const result = validateKnowledgeEvent({
    id: row.id,
    type: row.type,
    version: Number(row.version),
    streamId: row.stream_id,
    sequence: Number(row.stream_sequence),
    context,
    payload
  });
  if (!result.success) {
    throw new Error("Stored workspace ledger event failed contract validation.");
  }
  return structuredClone(result.data);
}

async function safeReadDurableEventsForCommand(
  command: WorkspaceOpsCliCommand,
  layout: ResolvedWorkspaceLayout,
  workspace: NonNullable<Awaited<ReturnType<typeof resolveWorkspaceLayout>>["workspace"]>
): Promise<{ readonly events: readonly KnowledgeEvent[] } | { readonly envelope: WorkspaceOpsEnvelope }> {
  try {
    return { events: await readDurableEventsIfPresent(layout.ledgerPath) };
  } catch {
    return { envelope: ledgerReadBlockedEnvelope(command, workspace) };
  }
}

function blockedLayoutEnvelope(
  command: WorkspaceOpsCliCommand,
  layout: Awaited<ReturnType<typeof resolveWorkspaceLayout>>
): WorkspaceOpsEnvelope {
  return createWorkspaceOpsEnvelope({
    command,
    status: "blocked",
    diagnostics: layout.diagnostics,
    proposedActions: layout.proposedActions
  });
}

function ledgerReadBlockedEnvelope(
  command: WorkspaceOpsCliCommand,
  workspace: NonNullable<Awaited<ReturnType<typeof resolveWorkspaceLayout>>["workspace"]>
): WorkspaceOpsEnvelope {
  return createWorkspaceOpsEnvelope({
    command,
    status: "blocked",
    workspace,
    diagnostics: [
      {
        diagnosticId: "diag_workspace_ledger_read_failed",
        severity: "error",
        category: "ledger",
        message: "Workspace ledger could not be read safely.",
        durable: false,
        relatedIds: [],
        repairHint: {
          allowedNextCommands: ["diagnostics inspect"],
          requiresHumanApproval: true
        }
      }
    ],
    proposedActions: [
      {
        actionId: "repair_workspace_ledger_read_failed",
        kind: "append-repair-event-required",
        title: "Record a human-approved canonical ledger repair event.",
        severity: "error",
        requiresHumanApproval: true,
        mutatesCanonicalState: true,
        allowedNextCommands: ["diagnostics inspect"]
      }
    ]
  });
}

class NodeProjectionArtifactFileSystem {
  constructor(private readonly layout: ResolvedWorkspaceLayout) {}

  async exists(path: string): Promise<boolean> {
    this.assertProjectionPath(path);
    return new NodeWorkspaceFileSystem().exists(path);
  }

  async writeText(path: string, content: string): Promise<void> {
    this.assertProjectionPath(path);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, { encoding: "utf8", flag: "wx" });
  }

  async remove(path: string): Promise<void> {
    this.assertProjectionPath(path);
    await rm(path, { recursive: true, force: true });
  }

  async promoteDirectory(from: string, to: string): Promise<void> {
    this.assertProjectionPath(from);
    this.assertProjectionPath(to);
    await rename(from, to);
  }

  async availableBytes(path: string): Promise<number | undefined> {
    this.assertProjectionPath(path);
    return new NodeWorkspaceFileSystem().availableBytes(path);
  }

  private assertProjectionPath(path: string): void {
    const relativePath = relative(this.layout.projectionRoot, path);
    if (relativePath !== "" && (relativePath.startsWith("..") || isAbsolute(relativePath))) {
      throw new Error("Projection artifact path escaped projection root.");
    }
  }
}

function defaultProjectionBuilder(projectionName: string): ProjectionBuilder {
  return {
    projectionName,
    async build(events) {
      return {
        "projection.json": JSON.stringify({
          schemaVersion: "workspace-ops.projection-placeholder.v1",
          projectionName,
          eventCount: events.length
        })
      };
    }
  };
}

function generatedRebuildId(): string {
  return `rb_${randomUUID().replaceAll("-", "_")}`;
}
