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
import { ProviderParseApprovalService, type ApproveProviderBatchInput } from "./provider-adapter.js";
import {
  buildIngestionProjection,
  type IngestionDiagnosticReference,
  type IngestionOccurrenceSummary,
  type IngestionParseJobSummary,
  type IngestionProjection
} from "./projection.js";
import { buildIngestionReviewDto } from "./read-api.js";
import {
  type IngestionDiagnosticsDto,
  type IngestionJobDto,
  type IngestionJobListDto,
  type IngestionJobResultDto,
  type IngestionSourceListDto,
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
  readonly providerRegistry?: Readonly<Record<string, unknown>>;
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

export interface ListIngestionJobsInput {
  readonly sourceCollectionId?: string;
}

export interface ListIngestionSourcesInput {}

export interface RetryIngestionJobInput {
  readonly jobId: string;
}

export type ApproveProviderParsingInput = ApproveProviderBatchInput;

export interface IngestionDiagnosticsInput {
  readonly sourceCollectionId?: string;
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
        occurrences: approvedOccurrences.occurrences,
        approvedSkippedArchivePaths: approvedOccurrences.approvedSkippedArchivePaths
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
    },

    async listSources(_command: ListIngestionSourcesInput = {}): Promise<IngestionRuntimeResult<IngestionSourceListDto>> {
      const workspace = requireMountedWorkspace(input.mountedWorkspace, "read");
      if (!workspace.ok) {
        return workspace;
      }

      try {
        return {
          ok: true,
          sources: sourcesForProjection(await projectionFor(workspace.workspace))
        };
      } catch {
        return runtimeInternalError("sources");
      }
    },

    async listJobs(command: ListIngestionJobsInput): Promise<IngestionRuntimeResult<IngestionJobListDto>> {
      const workspace = requireMountedWorkspace(input.mountedWorkspace, "read");
      if (!workspace.ok) {
        return workspace;
      }

      try {
        return {
          ok: true,
          jobs: jobsForProjection(await projectionFor(workspace.workspace), command.sourceCollectionId)
        };
      } catch {
        return runtimeInternalError("jobs");
      }
    },

    async retryJob(command: RetryIngestionJobInput): Promise<IngestionRuntimeResult<IngestionJobResultDto>> {
      const workspace = requireMountedWorkspace(input.mountedWorkspace, "write");
      if (!workspace.ok) {
        return workspace;
      }

      try {
        const [job] = jobsForProjection(await projectionFor(workspace.workspace))
          .filter((candidate) => candidate.jobId === command.jobId);

        if (job === undefined || !job.retryable) {
          return jobNotRetryableError();
        }

        return jobNotRetryableError();
      } catch {
        return runtimeInternalError("retry");
      }
    },

    async approveProviderParsing(command: ApproveProviderParsingInput): Promise<IngestionRuntimeResult<{
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
      const completion = projection.importCompletions.get(command.importBatchId);
      if (completion === undefined || completion.sourceCollectionId !== command.sourceCollectionId) {
        return stableIngestionError({
          code: "INGESTION_IMPORT_APPROVAL_REQUIRED",
          message: "A completed raw import is required before provider parsing approval.",
          allowedRepairActions: ["approve and execute the raw import batch", "retry provider approval"]
        });
      }

      try {
        const service = new ProviderParseApprovalService({
          ledger: workspace.workspace.ledger,
          actor: input.actor
        });
        const event = await service.approveProviderBatch(command);

        return {
          ok: true,
          review: await reviewFor(workspace.workspace, command.sourceCollectionId),
          eventIds: [event.id]
        };
      } catch {
        return runtimeInternalError("provider approval");
      }
    },

    async diagnostics(command: IngestionDiagnosticsInput): Promise<IngestionRuntimeResult<IngestionDiagnosticsDto>> {
      const workspace = requireMountedWorkspace(input.mountedWorkspace, "read");
      if (!workspace.ok) {
        return workspace;
      }

      try {
        return {
          ok: true,
          diagnostics: diagnosticsForProjection(await projectionFor(workspace.workspace), command.sourceCollectionId)
        };
      } catch {
        return runtimeInternalError("diagnostics");
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
): Promise<IngestionRuntimeResult<{
  occurrences: IngestionOccurrenceSummary[];
  approvedSkippedArchivePaths: string[];
}>> {
  const events = await workspace.ledger.readStream(`ingestion_scan_${input.scanBatchId}`);
  const occurrences: IngestionOccurrenceSummary[] = [];
  const approvedSkippedArchivePaths: string[] = [];
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

    if (event.type === "diagnostic.recorded" && !completed) {
      const skippedArchivePath = skippedArchivePathFromScanDiagnostic(event);
      if (skippedArchivePath !== undefined && !approvedSkippedArchivePaths.includes(skippedArchivePath)) {
        approvedSkippedArchivePaths.push(skippedArchivePath);
      }
    }
  }

  return completed ? { ok: true, occurrences, approvedSkippedArchivePaths } : scanRequiredError();
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

function skippedArchivePathFromScanDiagnostic(
  event: KnowledgeEventOf<"diagnostic.recorded">
): string | undefined {
  const violatedPath = event.payload.repairHint.violatedPath;
  return event.payload.category === "ingestion" &&
    event.payload.repairHint.contract === "ZipArchiveAdapter.expand" &&
    isZipPath(violatedPath)
    ? violatedPath
    : undefined;
}

function isZipPath(relativePath: string): boolean {
  return relativePath.toLowerCase().endsWith(".zip");
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

function jobsForProjection(
  projection: IngestionProjection,
  sourceCollectionId: string | undefined = undefined
): IngestionJobDto[] {
  return [
    ...scanJobsForProjection(projection, sourceCollectionId),
    ...importJobsForProjection(projection, sourceCollectionId),
    ...parseJobsForProjection(projection, sourceCollectionId),
    ...providerJobsForProjection(projection, sourceCollectionId)
  ].sort((left, right) => compareJobDto(left, right));
}

function sourcesForProjection(projection: IngestionProjection): IngestionSourceListDto["sources"] {
  return [...projection.sources.values()]
    .sort((left, right) => compareCodeUnits(left.sourceCollectionId, right.sourceCollectionId))
    .map((source) => ({
      sourceCollectionId: source.sourceCollectionId,
      label: source.label,
      ...(source.latestScanBatchId === undefined ? {} : { latestScanBatchId: source.latestScanBatchId }),
      ...(source.latestImportBatchId === undefined ? {} : { latestImportBatchId: source.latestImportBatchId }),
      scanBatchIds: [...source.scanBatchIds],
      importBatchIds: [...source.importBatchIds],
      diagnosticIds: [...source.diagnosticIds]
    }));
}

function scanJobsForProjection(
  projection: IngestionProjection,
  sourceCollectionId: string | undefined
): IngestionJobDto[] {
  return [...projection.scans.values()]
    .filter((scan) => sourceCollectionId === undefined || scan.sourceCollectionId === sourceCollectionId)
    .map((scan) => ({
      jobId: scan.scanBatchId,
      kind: "scan" as const,
      state: scan.state === "completed" ? "succeeded" as const : "running" as const,
      retryable: false,
      sourceCollectionId: scan.sourceCollectionId,
      scanBatchId: scan.scanBatchId,
      diagnosticIds: [...scan.diagnosticIds].sort(compareCodeUnits)
    }));
}

function importJobsForProjection(
  projection: IngestionProjection,
  sourceCollectionId: string | undefined
): IngestionJobDto[] {
  const importBatchIds = new Set([
    ...projection.importApprovals.keys(),
    ...projection.importCompletions.keys()
  ]);
  const jobs: IngestionJobDto[] = [];

  for (const importBatchId of importBatchIds) {
    const completion = projection.importCompletions.get(importBatchId);
    const approval = projection.importApprovals.get(importBatchId);
    const sourceId = completion?.sourceCollectionId ?? approval?.sourceCollectionId;
    const scanBatchId = completion?.scanBatchId ?? approval?.scanBatchId;

    if (sourceId === undefined || scanBatchId === undefined) {
      continue;
    }

    if (sourceCollectionId !== undefined && sourceId !== sourceCollectionId) {
      continue;
    }

    jobs.push({
      jobId: importBatchId,
      kind: "import",
      state: completion === undefined ? "queued" : "succeeded",
      retryable: false,
      sourceCollectionId: sourceId,
      scanBatchId,
      importBatchId,
      diagnosticIds: diagnosticIdsFor(projection, sourceId, scanBatchId)
    });
  }

  return jobs;
}

function parseJobsForProjection(
  projection: IngestionProjection,
  sourceCollectionId: string | undefined
): IngestionJobDto[] {
  return [...projection.parseJobs.values()]
    .filter((job) => sourceCollectionId === undefined || job.sourceCollectionId === sourceCollectionId)
    .map((job) => ({
      jobId: job.parseJobId,
      kind: job.lane === "provider" ? "provider-parse" as const : "local-parse" as const,
      state: parseJobState(job),
      retryable: false,
      sourceCollectionId: job.sourceCollectionId,
      importBatchId: job.importBatchId,
      evidenceId: job.evidenceId,
      diagnosticIds: diagnosticIdsFor(projection, job.sourceCollectionId)
    }));
}

function providerJobsForProjection(
  projection: IngestionProjection,
  sourceCollectionId: string | undefined
): IngestionJobDto[] {
  return [...projection.providerApprovals.values()]
    .filter((approval) => sourceCollectionId === undefined || approval.sourceCollectionId === sourceCollectionId)
    .map((approval) => ({
      jobId: approval.providerJobId,
      kind: "provider-parse" as const,
      state: "queued" as const,
      retryable: false,
      sourceCollectionId: approval.sourceCollectionId,
      importBatchId: approval.importBatchId,
      diagnosticIds: diagnosticIdsFor(projection, approval.sourceCollectionId)
    }));
}

function parseJobState(job: IngestionParseJobSummary): IngestionJobDto["state"] {
  switch (job.state) {
    case "queued":
      return "queued";
    case "running":
      return "running";
    case "succeeded":
      return "succeeded";
    case "failed":
      return "failed";
  }
}

function diagnosticsForProjection(
  projection: IngestionProjection,
  sourceCollectionId: string | undefined
): IngestionDiagnosticsDto["diagnostics"] {
  return [...projection.diagnostics.values()]
    .filter((diagnostic) => sourceCollectionId === undefined || diagnostic.sourceCollectionId === sourceCollectionId)
    .map(stableDiagnosticDto)
    .sort((left, right) => compareCodeUnits(left.diagnosticId ?? "", right.diagnosticId ?? ""));
}

function stableDiagnosticDto(diagnostic: IngestionDiagnosticReference): IngestionDiagnosticsDto["diagnostics"][number] {
  return {
    diagnosticId: diagnostic.diagnosticId,
    severity: diagnostic.severity,
    category: diagnostic.category,
    message: diagnostic.message
  };
}

function diagnosticIdsFor(
  projection: IngestionProjection,
  sourceCollectionId: string,
  scanBatchId?: string
): string[] {
  if (scanBatchId !== undefined) {
    return [...(projection.scans.get(scanBatchId)?.diagnosticIds ?? [])].sort(compareCodeUnits);
  }

  return [...(projection.diagnosticsBySourceCollectionId.get(sourceCollectionId) ?? [])].sort(compareCodeUnits);
}

function compareJobDto(left: IngestionJobDto, right: IngestionJobDto): number {
  return compareCodeUnits(`${left.kind}:${left.jobId}`, `${right.kind}:${right.jobId}`);
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
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

function jobNotRetryableError(): IngestionRuntimeResult<never> {
  return stableIngestionError({
    code: "INGESTION_JOB_NOT_RETRYABLE",
    message: "The requested ingestion job is missing or is not retryable.",
    allowedRepairActions: ["refresh ingestion jobs", "choose a retryable failed job", "rerun the relevant workflow"]
  });
}

function workspaceNotWritableError(): IngestionRuntimeResult<never> {
  return stableIngestionError({
    code: "INGESTION_WORKSPACE_NOT_WRITABLE",
    message: "Mounted workspace is not readable/writable for ingestion.",
    allowedRepairActions: ["remount the workspace read-write", "retry the ingestion action"]
  });
}

type RuntimeAction =
  | "dry-run"
  | "source registration"
  | "raw import approval"
  | "import"
  | "sources"
  | "jobs"
  | "retry"
  | "provider approval"
  | "diagnostics";

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
    case "sources":
      return ["refresh ingestion workspace", "retry listing sources", "inspect runtime diagnostics"];
    case "jobs":
      return ["refresh ingestion workspace", "retry listing jobs", "inspect runtime diagnostics"];
    case "retry":
      return ["refresh ingestion jobs", "retry the job action", "inspect runtime diagnostics"];
    case "provider approval":
      return ["verify the provider approval input", "retry provider approval", "inspect runtime diagnostics"];
    case "diagnostics":
      return ["refresh ingestion workspace", "retry diagnostics", "inspect runtime diagnostics"];
  }
}
