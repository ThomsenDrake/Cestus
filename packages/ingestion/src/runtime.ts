import { fileURLToPath } from "node:url";
import type { z } from "zod";
import {
  actorRefSchema,
  type AppendableKnowledgeEvent,
  type KnowledgeEventOf
} from "../../ontology/src/contracts.js";
import { IngestionImportService } from "./import-service.js";
import { LocalFilesystemScanner } from "./local-filesystem.js";
import type { MountedWorkspace } from "./mount-contract.js";
import {
  buildIngestionProjection,
  type IngestionOccurrenceSummary,
  type IngestionProjection
} from "./projection.js";
import { buildIngestionReviewDto } from "./read-api.js";
import {
  stableIngestionError,
  type IngestionImportResultDto,
  type IngestionRuntimeResult
} from "./runtime-types.js";
import { IngestionSourceRegistry } from "./source-registry.js";
import { materializeApprovedOccurrences } from "./source-materializer.js";

type ActorRef = z.infer<typeof actorRefSchema>;
type IngestionReview = ReturnType<typeof buildIngestionReviewDto>;

export interface CreateIngestionRuntimeInput {
  readonly mountedWorkspace?: MountedWorkspace | undefined;
  readonly actor: ActorRef;
}

export interface RegisterSourceInput {
  readonly sourceCollectionId: string;
  readonly label: string;
  readonly rootUri: string;
  readonly sourceRoot: string;
}

export interface DryRunScanInput {
  readonly sourceCollectionId: string;
  readonly scanBatchId: string;
}

export interface ApproveRawImportInput {
  readonly sourceCollectionId: string;
  readonly scanBatchId: string;
  readonly importBatchId: string;
  readonly approvedBy: string;
}

export interface ImportApprovedInput {
  readonly sourceCollectionId: string;
  readonly scanBatchId: string;
  readonly importBatchId: string;
}

export function createIngestionRuntime(input: CreateIngestionRuntimeInput) {
  return {
    async registerSource(command: RegisterSourceInput): Promise<IngestionRuntimeResult<{
      review: IngestionReview;
      eventIds: string[];
    }>> {
      const workspace = requireMountedWorkspace(input.mountedWorkspace, "write");
      if (!workspace.ok) {
        return workspace;
      }

      const registry = new IngestionSourceRegistry({
        ledger: workspace.workspace.ledger,
        actor: input.actor
      });

      try {
        const event = await registry.registerLocalSource({
          sourceCollectionId: command.sourceCollectionId,
          label: command.label,
          rootUri: command.rootUri,
          workspaceUri: `cestus-workspace://${workspace.workspace.workspaceId}`
        });

        return {
          ok: true,
          review: await reviewFor(workspace.workspace, command.sourceCollectionId),
          eventIds: [event.id]
        };
      } catch {
        return runtimeInternalError("source registration");
      }
    },

    async dryRunScan(command: DryRunScanInput): Promise<IngestionRuntimeResult<{
      scanBatchId: string;
      inventoryHash: string;
      review: IngestionReview;
      eventIds: string[];
    }>> {
      const workspace = requireMountedWorkspace(input.mountedWorkspace, "write");
      if (!workspace.ok) {
        return workspace;
      }

      const source = await sourceFor(workspace.workspace, command.sourceCollectionId);
      if (source === undefined) {
        return stableIngestionError({
          code: "INGESTION_SOURCE_NOT_REGISTERED",
          message: `Source collection ${command.sourceCollectionId} is not registered.`,
          allowedRepairActions: ["register the source collection", "retry dry-run"]
        });
      }

      const scanner = new LocalFilesystemScanner({
        ledger: workspace.workspace.ledger,
        actor: input.actor
      });
      const rootDir = rootDirFromRegisteredSource(source.rootUri);
      if (!rootDir.ok) {
        return rootDir;
      }

      try {
        const result = await scanner.scan({
          sourceCollectionId: command.sourceCollectionId,
          scanBatchId: command.scanBatchId,
          rootDir: rootDir.rootDir
        });

        return {
          ok: true,
          scanBatchId: result.scanBatchId,
          inventoryHash: result.inventoryHash,
          review: await reviewFor(workspace.workspace, command.sourceCollectionId),
          eventIds: await scanEventIdsFor(
            workspace.workspace,
            command.sourceCollectionId,
            command.scanBatchId
          )
        };
      } catch {
        return runtimeInternalError("dry-run");
      }
    },

    async approveRawImport(command: ApproveRawImportInput): Promise<IngestionRuntimeResult<{
      review: IngestionReview;
      eventIds: string[];
    }>> {
      const workspace = requireMountedWorkspace(input.mountedWorkspace, "write");
      if (!workspace.ok) {
        return workspace;
      }

      const projection = await projectionFor(workspace.workspace);
      if (!projection.sources.has(command.sourceCollectionId)) {
        return sourceNotRegisteredError(command.sourceCollectionId);
      }
      if (completedScanFor(projection, command.sourceCollectionId, command.scanBatchId) === undefined) {
        return scanRequiredError();
      }

      try {
        const service = new IngestionImportService({
          ledger: workspace.workspace.ledger,
          blobStore: workspace.workspace.blobStore,
          actor: input.actor
        });
        const event = await service.approveImport(command);

        return {
          ok: true,
          review: await reviewFor(workspace.workspace, command.sourceCollectionId),
          eventIds: [event.id]
        };
      } catch {
        return runtimeInternalError("raw import approval");
      }
    },

    async importApproved(command: ImportApprovedInput): Promise<IngestionRuntimeResult<IngestionImportResultDto>> {
      const workspace = requireMountedWorkspace(input.mountedWorkspace, "write");
      if (!workspace.ok) {
        return workspace;
      }
      if (!workspace.workspace.capabilities.canWriteBlobs) {
        return workspaceNotWritableError();
      }

      const projection = await projectionFor(workspace.workspace);
      const source = projection.sources.get(command.sourceCollectionId);
      if (source === undefined) {
        return sourceNotRegisteredError(command.sourceCollectionId);
      }
      const approval = approvalFor(projection, command);
      if (approval === undefined) {
        return stableIngestionError({
          code: "INGESTION_IMPORT_APPROVAL_REQUIRED",
          message: "Raw import approval is required before import execution.",
          allowedRepairActions: ["approve the raw import batch", "retry import"]
        });
      }
      if (completedScanFor(projection, command.sourceCollectionId, command.scanBatchId) === undefined) {
        return scanRequiredError();
      }

      const rootDir = rootDirFromRegisteredSource(source.rootUri, "import");
      if (!rootDir.ok) {
        return rootDir;
      }

      const approvedOccurrences = await occurrencesApprovedByCompletedScan(workspace.workspace, command);
      if (!approvedOccurrences.ok) {
        try {
          await appendStaleSourceDiagnostic(
            workspace.workspace,
            command,
            input.actor,
            approvedOccurrences.error.allowedRepairActions,
            approval.approvedEventId
          );
        } catch {
          return runtimeInternalError("import");
        }
        return { ok: false, error: approvedOccurrences.error };
      }

      const materialized = materializeApprovedOccurrences({
        sourceRoot: rootDir.rootDir,
        sourceCollectionId: command.sourceCollectionId,
        scanBatchId: command.scanBatchId,
        importBatchId: command.importBatchId,
        occurrences: approvedOccurrences.occurrences
      });

      if (!materialized.ok) {
        try {
          await appendStaleSourceDiagnostic(
            workspace.workspace,
            command,
            input.actor,
            materialized.error.allowedRepairActions,
            approval.approvedEventId
          );
        } catch {
          return runtimeInternalError("import");
        }
        return { ok: false, error: materialized.error };
      }

      const beforeEvents = await workspace.workspace.ledger.readAll();

      try {
        const service = new IngestionImportService({
          ledger: workspace.workspace.ledger,
          blobStore: workspace.workspace.blobStore,
          actor: input.actor
        });
        const result = await service.importApprovedOccurrences({
          sourceCollectionId: command.sourceCollectionId,
          scanBatchId: command.scanBatchId,
          importBatchId: command.importBatchId,
          occurrences: materialized.occurrences.map((occurrence) => ({
            occurrenceId: occurrence.occurrenceId,
            content: occurrence.content,
            sourcePath: occurrence.sourcePath,
            mediaType: occurrence.mediaType
          }))
        });
        const afterEvents = await workspace.workspace.ledger.readAll();

        return {
          ok: true,
          importBatchId: command.importBatchId,
          totals: result.totals,
          review: await reviewFor(workspace.workspace, command.sourceCollectionId),
          eventIds: eventIdsAddedAfter(beforeEvents, afterEvents)
        };
      } catch {
        return runtimeInternalError("import");
      }
    }
  };
}

async function projectionFor(workspace: MountedWorkspace): Promise<IngestionProjection> {
  return buildIngestionProjection(await workspace.ledger.readAll());
}

async function reviewFor(workspace: MountedWorkspace, sourceCollectionId: string): Promise<IngestionReview> {
  return buildIngestionReviewDto(
    await projectionFor(workspace),
    sourceCollectionId
  );
}

async function sourceFor(workspace: MountedWorkspace, sourceCollectionId: string) {
  return (await projectionFor(workspace)).sources.get(sourceCollectionId);
}

function requireMountedWorkspace(
  workspace: MountedWorkspace | undefined,
  mode: "read" | "write"
): IngestionRuntimeResult<{ workspace: MountedWorkspace }> {
  if (workspace === undefined) {
    return stableIngestionError({
      code: "INGESTION_WORKSPACE_NOT_MOUNTED",
      message: "Portable workspace is not mounted.",
      allowedRepairActions: ["mount the portable workspace", "retry the ingestion action"]
    });
  }

  if (!workspace.capabilities.canReadLedger) {
    return workspaceNotWritableError();
  }

  if (mode === "write" && (!workspace.capabilities.canAppendLedger || !workspace.capabilities.canWriteJobState)) {
    return workspaceNotWritableError();
  }

  return { ok: true, workspace };
}

function rootDirFromRegisteredSource(
  rootUri: string,
  action: RuntimeAction = "dry-run"
): IngestionRuntimeResult<{ rootDir: string }> {
  try {
    return { ok: true, rootDir: fileURLToPath(rootUri) };
  } catch {
    return runtimeInternalError(action);
  }
}

async function scanEventIdsFor(
  workspace: MountedWorkspace,
  sourceCollectionId: string,
  scanBatchId: string
): Promise<string[]> {
  const events = await workspace.ledger.readStream(`ingestion_scan_${scanBatchId}`);
  const streamBelongsToRequestedScan = events.some((event) =>
    event.type === "ingestion.scan.started"
    && event.payload.sourceCollectionId === sourceCollectionId
    && event.payload.scanBatchId === scanBatchId
  );

  return streamBelongsToRequestedScan ? events.map((event) => event.id) : [];
}

function completedScanFor(
  projection: IngestionProjection,
  sourceCollectionId: string,
  scanBatchId: string
) {
  const scan = projection.scans.get(scanBatchId);
  return scan?.sourceCollectionId === sourceCollectionId && scan.state === "completed" ? scan : undefined;
}

function approvalFor(
  projection: IngestionProjection,
  input: Pick<ApproveRawImportInput, "sourceCollectionId" | "scanBatchId" | "importBatchId">
) {
  const approval = projection.importApprovals.get(input.importBatchId);
  return approval?.sourceCollectionId === input.sourceCollectionId && approval.scanBatchId === input.scanBatchId
    ? approval
    : undefined;
}

async function appendStaleSourceDiagnostic(
  workspace: MountedWorkspace,
  input: Pick<ImportApprovedInput, "sourceCollectionId" | "scanBatchId" | "importBatchId">,
  actor: ActorRef,
  allowedRepairActions: readonly string[],
  approvalEventId: string
): Promise<void> {
  const event: AppendableKnowledgeEvent<"diagnostic.recorded"> = {
    type: "diagnostic.recorded",
    version: 1,
    streamId: diagnosticStreamId(input),
    context: {
      actor,
      occurredAt: new Date().toISOString(),
      causationId: approvalEventId,
      correlationId: `corr_${input.importBatchId}`,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", ingestion: "0.1.0" }
    },
    payload: {
      diagnosticId: staleSourceDiagnosticId(input),
      severity: "error",
      category: "ingestion",
      message: "Approved dry-run inventory no longer matches current source bytes.",
      repairHint: {
        contract: "IngestionRuntime.importApproved",
        violatedPath: "approvedDryRunInventory",
        allowedActions: [...allowedRepairActions]
      }
    }
  };

  await workspace.ledger.append(event);
}

function staleSourceDiagnosticId(
  input: Pick<ImportApprovedInput, "sourceCollectionId" | "scanBatchId" | "importBatchId">
): string {
  return `diag_ingestion_stale_${input.sourceCollectionId}_${input.scanBatchId}_${input.importBatchId}`;
}

function diagnosticStreamId(
  input: Pick<ImportApprovedInput, "sourceCollectionId" | "scanBatchId" | "importBatchId">
): string {
  return `ingestion_diagnostic_v1.${base64Url(input.sourceCollectionId)}.${base64Url(input.scanBatchId)}.${base64Url(input.importBatchId)}`;
}

function base64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

async function occurrencesApprovedByCompletedScan(
  workspace: MountedWorkspace,
  input: Pick<ImportApprovedInput, "sourceCollectionId" | "scanBatchId">
): Promise<IngestionRuntimeResult<{ occurrences: IngestionOccurrenceSummary[] }>> {
  const events = await workspace.ledger.readStream(`ingestion_scan_${input.scanBatchId}`);
  const occurrences: IngestionOccurrenceSummary[] = [];
  let completed = false;

  for (const event of events) {
    if (
      event.type === "ingestion.scan.completed" &&
      event.payload.sourceCollectionId === input.sourceCollectionId &&
      event.payload.scanBatchId === input.scanBatchId
    ) {
      completed = true;
      continue;
    }

    if (
      event.type === "ingestion.occurrence.observed" &&
      event.payload.sourceCollectionId === input.sourceCollectionId &&
      event.payload.scanBatchId === input.scanBatchId
    ) {
      if (completed) {
        return staleApprovedInventoryError();
      }
      occurrences.push(occurrenceSummaryForObservedEvent(event));
    }
  }

  return completed ? { ok: true, occurrences } : scanRequiredError();
}

function occurrenceSummaryForObservedEvent(
  event: KnowledgeEventOf<"ingestion.occurrence.observed">
): IngestionOccurrenceSummary {
  return {
    ...event.payload,
    ...(event.payload.adapter === undefined ? {} : { adapter: { ...event.payload.adapter } }),
    ...(event.payload.archiveAdapter === undefined ? {} : { archiveAdapter: { ...event.payload.archiveAdapter } }),
    observedEventId: event.id
  };
}

function eventIdsAddedAfter(
  beforeEvents: Awaited<ReturnType<MountedWorkspace["ledger"]["readAll"]>>,
  afterEvents: Awaited<ReturnType<MountedWorkspace["ledger"]["readAll"]>>
): string[] {
  const beforeIds = new Set(beforeEvents.map((event) => event.id));
  return afterEvents
    .filter((event) => !beforeIds.has(event.id))
    .map((event) => event.id);
}

function sourceNotRegisteredError(sourceCollectionId: string): IngestionRuntimeResult<never> {
  return stableIngestionError({
    code: "INGESTION_SOURCE_NOT_REGISTERED",
    message: `Source collection ${sourceCollectionId} is not registered.`,
    allowedRepairActions: ["register the source collection", "retry dry-run"]
  });
}

function scanRequiredError(): IngestionRuntimeResult<never> {
  return stableIngestionError({
    code: "INGESTION_SCAN_REQUIRED",
    message: "A completed dry-run scan is required before raw import approval or execution.",
    allowedRepairActions: ["run a dry-run scan", "retry the ingestion action"]
  });
}

function staleApprovedInventoryError(): IngestionRuntimeResult<never> {
  return stableIngestionError({
    code: "INGESTION_SOURCE_CHANGED_SINCE_APPROVAL",
    message: "Approved dry-run inventory no longer matches current source bytes.",
    allowedRepairActions: ["rerun dry-run scan", "review source changes", "approve a new import batch"],
    diagnostics: [{
      severity: "error",
      category: "ingestion.stale-source",
      message: "Current source bytes differ from the approved dry-run inventory."
    }]
  });
}

function workspaceNotWritableError(): IngestionRuntimeResult<never> {
  return stableIngestionError({
    code: "INGESTION_WORKSPACE_NOT_WRITABLE",
    message: "Mounted workspace is not readable/writable for ingestion.",
    allowedRepairActions: ["remount the workspace read-write", "retry the ingestion action"]
  });
}

type RuntimeAction = "dry-run" | "source registration" | "raw import approval" | "import";

function runtimeInternalError(action: RuntimeAction): IngestionRuntimeResult<never> {
  return stableIngestionError({
    code: "INGESTION_RUNTIME_INTERNAL",
    message: `Ingestion runtime could not complete the requested ${action}.`,
    allowedRepairActions: repairActionsFor(action)
  });
}

function repairActionsFor(action: RuntimeAction): string[] {
  switch (action) {
    case "dry-run":
      return ["verify the registered source", "retry dry-run", "inspect runtime diagnostics"];
    case "source registration":
      return ["verify the source registration input", "retry source registration", "inspect runtime diagnostics"];
    case "raw import approval":
      return ["verify the completed scan", "retry raw import approval", "inspect runtime diagnostics"];
    case "import":
      return ["verify the approved import batch", "retry import", "inspect runtime diagnostics"];
  }
}
