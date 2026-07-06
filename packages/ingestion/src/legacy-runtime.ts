import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { z } from "zod";
import { actorRefSchema } from "../../ontology/src/contracts.js";
import type { KnowledgeEvent } from "../../ontology/src/contracts.js";
import type { FileBlobStore } from "../../ontology/src/blob-store.js";
import { buildIngestionProjection } from "./projection.js";
import {
  LegacyCestusInspector,
  type LegacyDetectionRecord
} from "./legacy-inspector.js";
import {
  conservativeJsonMetadataPlugin,
  LegacyDetectorRegistry
} from "./legacy-plugins.js";
import {
  buildLegacyMigrationReport,
  LegacyMigrationReportService,
  type LegacyMigrationReport,
  type LegacyReportTotals
} from "./legacy-report.js";
import { buildLegacyImportProjection } from "./legacy-projection.js";
import { buildLegacyMigrationReviewDto, type LegacyMigrationReviewDto } from "./legacy-read-api.js";
import { parseLegacyClaimMetadata } from "./legacy-claim-parser.js";
import type { MountedWorkspace } from "./mount-contract.js";
import { IngestionSourceRegistry } from "./source-registry.js";
import type {
  LegacyProposedAssertionCandidate,
  LegacyQuarantineEntry
} from "./legacy-types.js";
import {
  legacyImportNextActions,
  stableLegacyImportError,
  stableLegacyImportSuccess,
  type LegacyImportRuntimeResult
} from "./legacy-runtime-types.js";

type ActorRef = z.infer<typeof actorRefSchema>;

export interface CreateLegacyImportRuntimeInput {
  readonly mountedWorkspace?: MountedWorkspace | undefined;
  readonly actor: ActorRef;
}

export interface LegacyRuntimeInspectInput {
  readonly sourceCollectionId: string;
  readonly label: string;
  readonly sourceRoot: string;
  readonly scanBatchId: string;
}

export interface LegacyRuntimeReportInput {
  readonly sourceCollectionId: string;
  readonly legacyReportId?: string;
}

export interface LegacyRuntimeQuarantineInput {
  readonly sourceCollectionId: string;
  readonly legacyReportId?: string;
}

export interface LegacyRuntimeStagingPreviewInput {
  readonly sourceCollectionId: string;
  readonly legacyReportId?: string;
}

export interface LegacyInspectData {
  readonly legacyReportId: string;
  readonly reportHash: `sha256:${string}`;
  readonly candidateSetHash: `sha256:${string}`;
  readonly totals: LegacyReportTotals;
}

export interface LegacyReportData {
  readonly legacyReportId: string;
  readonly reportHash: `sha256:${string}`;
  readonly candidateSetHash: `sha256:${string}`;
  readonly totals: LegacyReportTotals;
  readonly report: LegacyMigrationReport;
  readonly review: LegacyMigrationReviewDto;
}

export interface LegacyQuarantineData {
  readonly legacyReportId: string;
  readonly reportHash: `sha256:${string}`;
  readonly quarantineEntries: readonly LegacyQuarantineEntry[];
}

export interface LegacyStagingPreviewData {
  readonly legacyReportId: string;
  readonly reportHash: `sha256:${string}`;
  readonly candidateSetHash: `sha256:${string}`;
  readonly proposedAssertionCandidates: readonly LegacyProposedAssertionCandidate[];
  readonly quarantineEntries: readonly LegacyQuarantineEntry[];
}

export interface LegacyImportRuntime {
  inspect(input: LegacyRuntimeInspectInput): Promise<LegacyImportRuntimeResult<LegacyInspectData>>;
  report(input: LegacyRuntimeReportInput): Promise<LegacyImportRuntimeResult<LegacyReportData>>;
  quarantine(input: LegacyRuntimeQuarantineInput): Promise<LegacyImportRuntimeResult<LegacyQuarantineData>>;
  stagingPreview(input: LegacyRuntimeStagingPreviewInput): Promise<LegacyImportRuntimeResult<LegacyStagingPreviewData>>;
}

export function createLegacyImportRuntime(input: CreateLegacyImportRuntimeInput): LegacyImportRuntime {
  const actor = actorRefSchema.parse(input.actor);

  return {
    async inspect(command): Promise<LegacyImportRuntimeResult<LegacyInspectData>> {
      const workspace = requireMountedWorkspace(input.mountedWorkspace, "inspect");
      if (!workspace.ok) {
        return workspace;
      }

      try {
        const sourceRoot = resolve(command.sourceRoot);
        const rootUri = pathToFileURL(sourceRoot).toString();
        const sourceRegistration = await ensureSourceRegistration({
          workspace: workspace.workspace,
          actor,
          sourceCollectionId: command.sourceCollectionId,
          label: command.label,
          rootUri
        });

        if (!sourceRegistration.ok) {
          return sourceRegistration.result;
        }

        const beforeEvents = await workspace.workspace.ledger.readAll();
        const inspector = new LegacyCestusInspector({
          ledger: workspace.workspace.ledger,
          actor,
          detectorRegistry: new LegacyDetectorRegistry([conservativeJsonMetadataPlugin])
        });
        const inspected = await inspector.inspect({
          sourceCollectionId: command.sourceCollectionId,
          scanBatchId: command.scanBatchId,
          rootDir: sourceRoot
        });
        const parsed = await parseDetectedLegacyMetadata(sourceRoot, inspected.detections);
        const report = buildLegacyMigrationReport({
          sourceCollectionId: inspected.sourceCollectionId,
          scanBatchId: inspected.scanBatchId,
          files: inspected.files,
          detections: inspected.detections,
          proposedAssertionCandidates: parsed.proposedAssertionCandidates,
          quarantineEntries: parsed.quarantineEntries
        });
        const service = new LegacyMigrationReportService({
          ledger: workspace.workspace.ledger,
          reportStore: workspace.workspace.derivativeStore as unknown as FileBlobStore,
          actor
        });
        await service.recordReport(report);
        const afterEvents = await workspace.workspace.ledger.readAll();

        return stableLegacyImportSuccess({
          command: "legacy inspect",
          workspace: workspaceDto(workspace.workspace),
          sourceCollectionId: command.sourceCollectionId,
          scanBatchId: command.scanBatchId,
          eventIds: [
            ...sourceRegistration.eventIds,
            ...eventIdsAddedAfter(beforeEvents, afterEvents)
          ],
          nextActions: [
            legacyImportNextActions.reviewReport,
            legacyImportNextActions.inspectQuarantine,
            legacyImportNextActions.approveRawImport
          ],
          data: inspectData(report)
        });
      } catch {
        return internalError("legacy inspect");
      }
    },

    async report(command): Promise<LegacyImportRuntimeResult<LegacyReportData>> {
      const workspace = requireMountedWorkspace(input.mountedWorkspace, "read");
      if (!workspace.ok) {
        return workspace;
      }

      try {
        const resolved = await resolveStoredReport(workspace.workspace, command);
        if (!resolved.ok) {
          return resolved.result;
        }

        const projection = buildLegacyImportProjection(await workspace.workspace.ledger.readAll());
        return stableLegacyImportSuccess({
          command: "legacy report",
          workspace: workspaceDto(workspace.workspace),
          sourceCollectionId: command.sourceCollectionId,
          scanBatchId: resolved.report.scanBatchId,
          eventIds: [],
          nextActions: [
            legacyImportNextActions.inspectQuarantine,
            legacyImportNextActions.approveRawImport,
            legacyImportNextActions.previewStaging
          ],
          data: {
            ...inspectData(resolved.report),
            report: resolved.report,
            review: buildLegacyMigrationReviewDto(projection, command.sourceCollectionId)
          }
        });
      } catch {
        return internalError("legacy report");
      }
    },

    async quarantine(command): Promise<LegacyImportRuntimeResult<LegacyQuarantineData>> {
      const workspace = requireMountedWorkspace(input.mountedWorkspace, "read");
      if (!workspace.ok) {
        return workspace;
      }

      try {
        const resolved = await resolveStoredReport(workspace.workspace, command);
        if (!resolved.ok) {
          return resolved.result;
        }

        return stableLegacyImportSuccess({
          command: "legacy quarantine",
          workspace: workspaceDto(workspace.workspace),
          sourceCollectionId: command.sourceCollectionId,
          scanBatchId: resolved.report.scanBatchId,
          eventIds: [],
          nextActions: [
            legacyImportNextActions.reviewReport,
            legacyImportNextActions.approveRawImport
          ],
          data: {
            legacyReportId: resolved.report.legacyReportId,
            reportHash: resolved.report.reportHash,
            quarantineEntries: resolved.report.quarantineEntries
          }
        });
      } catch {
        return internalError("legacy quarantine");
      }
    },

    async stagingPreview(command): Promise<LegacyImportRuntimeResult<LegacyStagingPreviewData>> {
      const workspace = requireMountedWorkspace(input.mountedWorkspace, "read");
      if (!workspace.ok) {
        return workspace;
      }

      try {
        const resolved = await resolveStoredReport(workspace.workspace, command);
        if (!resolved.ok) {
          return resolved.result;
        }

        return stableLegacyImportSuccess({
          command: "legacy staging-preview",
          workspace: workspaceDto(workspace.workspace),
          sourceCollectionId: command.sourceCollectionId,
          scanBatchId: resolved.report.scanBatchId,
          eventIds: [],
          nextActions: [
            legacyImportNextActions.reviewReport,
            legacyImportNextActions.approveStaging
          ],
          data: {
            legacyReportId: resolved.report.legacyReportId,
            reportHash: resolved.report.reportHash,
            candidateSetHash: resolved.report.candidateSetHash,
            proposedAssertionCandidates: resolved.report.proposedAssertionCandidates,
            quarantineEntries: resolved.report.quarantineEntries
          }
        });
      } catch {
        return internalError("legacy staging-preview");
      }
    }
  };
}

async function ensureSourceRegistration(input: {
  readonly workspace: MountedWorkspace;
  readonly actor: ActorRef;
  readonly sourceCollectionId: string;
  readonly label: string;
  readonly rootUri: string;
}): Promise<
  | { readonly ok: true; readonly eventIds: readonly string[] }
  | { readonly ok: false; readonly result: LegacyImportRuntimeResult<never> }
> {
  const projection = buildIngestionProjection(await input.workspace.ledger.readAll());
  const existing = projection.sources.get(input.sourceCollectionId);

  if (existing !== undefined) {
    if (existing.rootUri === input.rootUri) {
      return { ok: true, eventIds: [] };
    }

    return {
      ok: false,
      result: stableLegacyImportError({
        code: "LEGACY_IMPORT_INVALID_ARGUMENTS",
        command: "legacy inspect",
        message: "Source collection is already registered for a different root URI.",
        allowedRepairActions: ["choose a new source id", "rerun legacy inspect with the original source root"]
      })
    };
  }

  const event = await new IngestionSourceRegistry({
    ledger: input.workspace.ledger,
    actor: input.actor
  }).registerLocalSource({
    sourceCollectionId: input.sourceCollectionId,
    label: input.label,
    rootUri: input.rootUri,
    workspaceUri: `cestus-workspace://${input.workspace.workspaceId}`
  });

  return { ok: true, eventIds: [event.id] };
}

async function parseDetectedLegacyMetadata(
  sourceRoot: string,
  detections: readonly LegacyDetectionRecord[]
): Promise<{
  readonly proposedAssertionCandidates: LegacyProposedAssertionCandidate[];
  readonly quarantineEntries: LegacyQuarantineEntry[];
}> {
  const proposedAssertionCandidates: LegacyProposedAssertionCandidate[] = [];
  const quarantineEntries: LegacyQuarantineEntry[] = [];

  for (const detection of detections) {
    if (!detection.parserEligible || detection.plugin.name !== conservativeJsonMetadataPlugin.name) {
      continue;
    }

    const text = await readFile(join(sourceRoot, detection.sourcePath), "utf8");
    const parsed = parseLegacyClaimMetadata({
      sourcePath: detection.sourcePath,
      contentHash: detection.contentHash,
      text
    });
    proposedAssertionCandidates.push(...parsed.candidates);
    quarantineEntries.push(...parsed.quarantineEntries);
  }

  return { proposedAssertionCandidates, quarantineEntries };
}

async function resolveStoredReport(
  workspace: MountedWorkspace,
  input: { readonly sourceCollectionId: string; readonly legacyReportId?: string }
): Promise<
  | { readonly ok: true; readonly report: LegacyMigrationReport }
  | { readonly ok: false; readonly result: LegacyImportRuntimeResult<never> }
> {
  const projection = buildLegacyImportProjection(await workspace.ledger.readAll());
  const legacyReportId = input.legacyReportId ?? projection.latestReportBySource.get(input.sourceCollectionId);

  if (legacyReportId === undefined) {
    return {
      ok: false,
      result: stableLegacyImportError({
        code: "LEGACY_IMPORT_REPORT_REQUIRED",
        command: "legacy report",
        message: "A migration report is required before legacy review.",
        allowedRepairActions: ["run legacy inspect", "review legacy report"]
      })
    };
  }

  const summary = projection.reports.get(legacyReportId);
  if (summary === undefined || summary.sourceCollectionId !== input.sourceCollectionId) {
    return {
      ok: false,
      result: stableLegacyImportError({
        code: "LEGACY_IMPORT_REPORT_NOT_FOUND",
        command: "legacy report",
        message: "Requested legacy migration report was not found for this source.",
        allowedRepairActions: ["run legacy inspect", "choose a listed report id"]
      })
    };
  }

  try {
    const reportHash = summary.reportHash as `sha256:${string}`;
    const report = JSON.parse((await workspace.derivativeStore.get(reportHash)).toString("utf8")) as Omit<
      LegacyMigrationReport,
      "reportHash"
    >;
    return {
      ok: true,
      report: { ...report, reportHash }
    };
  } catch {
    return {
      ok: false,
      result: stableLegacyImportError({
        code: "LEGACY_IMPORT_REPORT_NOT_FOUND",
        command: "legacy report",
        message: "Stored legacy migration report artifact was not found.",
        allowedRepairActions: ["rerun legacy inspect", "review workspace derivative storage"]
      })
    };
  }
}

function requireMountedWorkspace(
  workspace: MountedWorkspace | undefined,
  mode: "read" | "inspect"
): LegacyWorkspaceRequirementResult {
  if (workspace === undefined || !workspace.capabilities.canReadLedger) {
    return stableLegacyImportError({
      code: "LEGACY_IMPORT_WORKSPACE_NOT_MOUNTED",
      command: mode === "inspect" ? "legacy inspect" : "legacy report",
      message: "Mounted portable workspace with ledger read capability is required.",
      allowedRepairActions: ["mount the portable workspace", "retry the legacy import command"]
    });
  }

  if (
    mode === "inspect" &&
    (!workspace.capabilities.canAppendLedger || !workspace.capabilities.canWriteDerivatives)
  ) {
    return stableLegacyImportError({
      code: "LEGACY_IMPORT_WORKSPACE_NOT_WRITABLE",
      command: "legacy inspect",
      message: "Legacy inspect requires append and derivative-write workspace capabilities.",
      allowedRepairActions: ["remount the portable workspace read-write", "retry legacy inspect"]
    });
  }

  return { ok: true, workspace };
}

type LegacyWorkspaceRequirementResult =
  | { readonly ok: true; readonly workspace: MountedWorkspace }
  | { readonly ok: false; readonly error: LegacyImportRuntimeResult<never>["error"] };

function inspectData(report: LegacyMigrationReport): LegacyInspectData {
  return {
    legacyReportId: report.legacyReportId,
    reportHash: report.reportHash,
    candidateSetHash: report.candidateSetHash,
    totals: report.totals
  };
}

function workspaceDto(workspace: MountedWorkspace) {
  return {
    workspaceId: workspace.workspaceId,
    label: workspace.label
  };
}

function eventIdsAddedAfter(beforeEvents: readonly KnowledgeEvent[], afterEvents: readonly KnowledgeEvent[]): string[] {
  const beforeIds = new Set(beforeEvents.map((event) => event.id));
  return afterEvents
    .filter((event) => !beforeIds.has(event.id))
    .map((event) => event.id);
}

function internalError(command: "legacy inspect" | "legacy report" | "legacy quarantine" | "legacy staging-preview") {
  return stableLegacyImportError({
    code: "LEGACY_IMPORT_RUNTIME_INTERNAL",
    command,
    message: "Legacy import runtime failed while handling the command.",
    allowedRepairActions: ["retry the command", "inspect safe diagnostics"]
  });
}
