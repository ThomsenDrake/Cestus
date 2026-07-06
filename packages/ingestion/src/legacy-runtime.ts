import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { z } from "zod";
import { actorRefSchema } from "../../ontology/src/contracts.js";
import type { KnowledgeEvent } from "../../ontology/src/contracts.js";
import type { FileBlobStore } from "../../ontology/src/blob-store.js";
import { InMemoryEventLedger, type EventLedger } from "../../ontology/src/event-ledger.js";
import { buildIngestionProjection } from "./projection.js";
import {
  LegacyCestusInspector,
  type LegacyDetectionRecord
} from "./legacy-inspector.js";
import { createIngestionRuntime } from "./runtime.js";
import type { IngestionRuntimeError } from "./runtime-types.js";
import {
  conservativeJsonMetadataPlugin,
  LegacyDetectorRegistry
} from "./legacy-plugins.js";
import {
  buildLegacyMigrationReport,
  LegacyMigrationReportService,
  reportArtifactJson,
  sha256,
  type LegacyMigrationReport,
  type LegacyReportTotals
} from "./legacy-report.js";
import { buildLegacyImportProjection, type LegacyImportProjection } from "./legacy-projection.js";
import { buildLegacyMigrationReviewDto, type LegacyMigrationReviewDto } from "./legacy-read-api.js";
import { parseLegacyClaimMetadata } from "./legacy-claim-parser.js";
import {
  LegacyOntologyStagingService,
  type LegacyApprovedAssertionCandidate
} from "./legacy-staging.js";
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
  type LegacyImportCommandName,
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

export interface LegacyRuntimeApproveRawImportInput {
  readonly sourceCollectionId: string;
  readonly scanBatchId: string;
  readonly importBatchId: string;
  readonly approvedBy: string;
}

export interface LegacyRuntimeImportApprovedInput {
  readonly sourceCollectionId: string;
  readonly scanBatchId: string;
  readonly importBatchId: string;
}

export interface LegacyRuntimeApproveStagingInput {
  readonly sourceCollectionId: string;
  readonly scanBatchId: string;
  readonly legacyReportId: string;
  readonly stagingBatchId: string;
  readonly approvedBy: string;
  readonly approvedAssertionCandidateIds: readonly string[];
}

export interface LegacyRuntimeStageApprovedInput {
  readonly sourceCollectionId: string;
  readonly scanBatchId: string;
  readonly legacyReportId: string;
  readonly stagingBatchId: string;
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
  readonly review: LegacyReportReviewDto;
}

export type LegacyReportReviewDto = LegacyMigrationReviewDto & {
  readonly selectedReportId: string;
  readonly isLatestReport: boolean;
};

export interface LegacyQuarantineData {
  readonly legacyReportId: string;
  readonly reportHash: `sha256:${string}`;
  readonly quarantineEntries: readonly LegacyQuarantineEntry[];
}

export interface LegacyStagingPreviewData {
  readonly legacyReportId: string;
  readonly reportHash: `sha256:${string}`;
  readonly candidateSetHash: `sha256:${string}`;
  readonly candidates: readonly LegacyApprovedAssertionCandidate[];
  readonly quarantineEntries: readonly LegacyQuarantineEntry[];
}

export interface LegacyRawImportApprovalData {
  readonly importBatchId: string;
}

export interface LegacyRawImportResultData {
  readonly importBatchId: string;
  readonly totals: {
    readonly evidenceCreated: number;
    readonly occurrencesLinked: number;
    readonly duplicatesReused: number;
    readonly skipped: number;
  };
}

export interface LegacyStagingApprovalData {
  readonly legacyReportId: string;
  readonly stagingBatchId: string;
  readonly reportHash: `sha256:${string}`;
  readonly candidateSetHash: `sha256:${string}`;
  readonly approvedAssertionCandidateIds: readonly string[];
}

export interface LegacyStageResultData {
  readonly legacyReportId: string;
  readonly stagingBatchId: string;
  readonly proposedAssertionIds: readonly string[];
}

export interface LegacyImportRuntime {
  inspect(input: LegacyRuntimeInspectInput): Promise<LegacyImportRuntimeResult<LegacyInspectData>>;
  report(input: LegacyRuntimeReportInput): Promise<LegacyImportRuntimeResult<LegacyReportData>>;
  quarantine(input: LegacyRuntimeQuarantineInput): Promise<LegacyImportRuntimeResult<LegacyQuarantineData>>;
  stagingPreview(input: LegacyRuntimeStagingPreviewInput): Promise<LegacyImportRuntimeResult<LegacyStagingPreviewData>>;
  approveRawImport(
    input: LegacyRuntimeApproveRawImportInput
  ): Promise<LegacyImportRuntimeResult<LegacyRawImportApprovalData>>;
  importApproved(input: LegacyRuntimeImportApprovedInput): Promise<LegacyImportRuntimeResult<LegacyRawImportResultData>>;
  approveStaging(input: LegacyRuntimeApproveStagingInput): Promise<LegacyImportRuntimeResult<LegacyStagingApprovalData>>;
  stageApproved(input: LegacyRuntimeStageApprovedInput): Promise<LegacyImportRuntimeResult<LegacyStageResultData>>;
}

export function createLegacyImportRuntime(input: CreateLegacyImportRuntimeInput): LegacyImportRuntime {
  const actor = actorRefSchema.parse(input.actor);

  return {
    async inspect(command): Promise<LegacyImportRuntimeResult<LegacyInspectData>> {
      const workspace = requireMountedWorkspace(input.mountedWorkspace, "legacy inspect", "inspect");
      if (!workspace.ok) {
        return workspace;
      }

      try {
        const sourceRoot = resolve(command.sourceRoot);
        const rootUri = pathToFileURL(sourceRoot).toString();
        const dryRun = await inspectAndParseLegacyRoot({
          ledger: new InMemoryEventLedger(),
          actor,
          sourceCollectionId: command.sourceCollectionId,
          scanBatchId: command.scanBatchId,
          sourceRoot
        });

        if (!dryRun.ok) {
          return sourceUnavailableError();
        }

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
        const inspected = await inspectAndParseLegacyRoot({
          ledger: workspace.workspace.ledger,
          actor,
          sourceCollectionId: command.sourceCollectionId,
          scanBatchId: command.scanBatchId,
          sourceRoot
        });
        if (!inspected.ok) {
          return sourceUnavailableError();
        }

        const report = buildLegacyMigrationReport({
          sourceCollectionId: inspected.reportInput.sourceCollectionId,
          scanBatchId: inspected.reportInput.scanBatchId,
          files: inspected.reportInput.files,
          detections: inspected.reportInput.detections,
          proposedAssertionCandidates: inspected.proposedAssertionCandidates,
          quarantineEntries: inspected.quarantineEntries
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
      const workspace = requireMountedWorkspace(input.mountedWorkspace, "legacy report", "read");
      if (!workspace.ok) {
        return workspace;
      }

      try {
        const resolved = await resolveStoredReport(workspace.workspace, "legacy report", command);
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
            review: buildLegacyReportReviewDto(projection, command.sourceCollectionId, resolved.report.legacyReportId)
          }
        });
      } catch {
        return internalError("legacy report");
      }
    },

    async quarantine(command): Promise<LegacyImportRuntimeResult<LegacyQuarantineData>> {
      const workspace = requireMountedWorkspace(input.mountedWorkspace, "legacy quarantine", "read");
      if (!workspace.ok) {
        return workspace;
      }

      try {
        const resolved = await resolveStoredReport(workspace.workspace, "legacy quarantine", command);
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

    async approveRawImport(
      command
    ): Promise<LegacyImportRuntimeResult<LegacyRawImportApprovalData>> {
      const workspace = requireMountedWorkspace(input.mountedWorkspace, "legacy approve-import", "append");
      if (!workspace.ok) {
        return workspace;
      }

      try {
        const approved = await createIngestionRuntime({
          mountedWorkspace: workspace.workspace,
          actor
        }).approveRawImport(command);
        if (!approved.ok) {
          return legacyErrorFromIngestion("legacy approve-import", approved.error);
        }

        return stableLegacyImportSuccess({
          command: "legacy approve-import",
          workspace: workspaceDto(workspace.workspace),
          sourceCollectionId: command.sourceCollectionId,
          scanBatchId: command.scanBatchId,
          eventIds: approved.eventIds,
          nextActions: [legacyImportNextActions.runRawImport],
          data: {
            importBatchId: command.importBatchId
          }
        });
      } catch {
        return internalError("legacy approve-import");
      }
    },

    async importApproved(command): Promise<LegacyImportRuntimeResult<LegacyRawImportResultData>> {
      const workspace = requireMountedWorkspace(input.mountedWorkspace, "legacy import", "blob-write");
      if (!workspace.ok) {
        return workspace;
      }

      try {
        const imported = await createIngestionRuntime({
          mountedWorkspace: workspace.workspace,
          actor
        }).importApproved(command);
        if (!imported.ok) {
          return legacyErrorFromIngestion("legacy import", imported.error);
        }

        return stableLegacyImportSuccess({
          command: "legacy import",
          workspace: workspaceDto(workspace.workspace),
          sourceCollectionId: command.sourceCollectionId,
          scanBatchId: command.scanBatchId,
          eventIds: imported.eventIds,
          nextActions: [
            legacyImportNextActions.previewStaging,
            legacyImportNextActions.approveStaging
          ],
          data: {
            importBatchId: imported.importBatchId,
            totals: imported.totals
          }
        });
      } catch {
        return internalError("legacy import");
      }
    },

    async stagingPreview(command): Promise<LegacyImportRuntimeResult<LegacyStagingPreviewData>> {
      const workspace = requireMountedWorkspace(input.mountedWorkspace, "legacy staging-preview", "read");
      if (!workspace.ok) {
        return workspace;
      }

      try {
        const resolved = await resolveStoredReport(workspace.workspace, "legacy staging-preview", command);
        if (!resolved.ok) {
          return resolved.result;
        }
        const candidates = await evidenceTiedCandidatesForReport(workspace.workspace, resolved.report);

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
            candidates,
            quarantineEntries: resolved.report.quarantineEntries
          }
        });
      } catch {
        return internalError("legacy staging-preview");
      }
    },

    async approveStaging(command): Promise<LegacyImportRuntimeResult<LegacyStagingApprovalData>> {
      const workspace = requireMountedWorkspace(input.mountedWorkspace, "legacy approve-staging", "append");
      if (!workspace.ok) {
        return workspace;
      }

      try {
        const resolved = await resolveStoredReport(workspace.workspace, "legacy approve-staging", command);
        if (!resolved.ok) {
          return resolved.result;
        }
        if (resolved.report.scanBatchId !== command.scanBatchId) {
          return reportMismatchError("legacy approve-staging");
        }

        const candidates = await evidenceTiedCandidatesForReport(workspace.workspace, resolved.report);
        const candidateIds = new Set(candidates.map((candidate) => candidate.candidateId));
        const requestedIds = [...command.approvedAssertionCandidateIds];
        if (requestedIds.some((candidateId) => !candidateIds.has(candidateId))) {
          return candidateSetMismatchError("legacy approve-staging");
        }

        const service = new LegacyOntologyStagingService({
          ledger: workspace.workspace.ledger,
          actor
        });
        const event = await service.approveStaging({
          sourceCollectionId: command.sourceCollectionId,
          scanBatchId: command.scanBatchId,
          legacyReportId: command.legacyReportId,
          stagingBatchId: command.stagingBatchId,
          reportHash: resolved.report.reportHash,
          candidateSetHash: resolved.report.candidateSetHash,
          approvedBy: command.approvedBy,
          approvedAssertionCandidateIds: requestedIds
        });

        return stableLegacyImportSuccess({
          command: "legacy approve-staging",
          workspace: workspaceDto(workspace.workspace),
          sourceCollectionId: command.sourceCollectionId,
          scanBatchId: command.scanBatchId,
          eventIds: [event.id],
          nextActions: [legacyImportNextActions.stageApprovedAssertions],
          data: {
            legacyReportId: resolved.report.legacyReportId,
            stagingBatchId: command.stagingBatchId,
            reportHash: resolved.report.reportHash,
            candidateSetHash: resolved.report.candidateSetHash,
            approvedAssertionCandidateIds: requestedIds
          }
        });
      } catch (error) {
        return stagingRuntimeError("legacy approve-staging", error);
      }
    },

    async stageApproved(command): Promise<LegacyImportRuntimeResult<LegacyStageResultData>> {
      const workspace = requireMountedWorkspace(input.mountedWorkspace, "legacy stage", "append");
      if (!workspace.ok) {
        return workspace;
      }

      try {
        const resolved = await resolveStoredReport(workspace.workspace, "legacy stage", command);
        if (!resolved.ok) {
          return resolved.result;
        }
        if (resolved.report.scanBatchId !== command.scanBatchId) {
          return reportMismatchError("legacy stage");
        }

        const candidates = await evidenceTiedCandidatesForReport(workspace.workspace, resolved.report);
        const service = new LegacyOntologyStagingService({
          ledger: workspace.workspace.ledger,
          actor
        });
        const beforeEvents = await workspace.workspace.ledger.readAll();
        const proposed = await service.stageApprovedAssertions({
          sourceCollectionId: command.sourceCollectionId,
          scanBatchId: command.scanBatchId,
          legacyReportId: command.legacyReportId,
          stagingBatchId: command.stagingBatchId,
          reportHash: resolved.report.reportHash,
          candidateSetHash: resolved.report.candidateSetHash,
          candidates
        });
        const afterEvents = await workspace.workspace.ledger.readAll();
        const newEvents = eventsAddedAfter(beforeEvents, afterEvents);
        if (newEvents.some((event) => forbiddenAcceptedEventTypes.has(event.type))) {
          return acceptedEventForbiddenError("legacy stage");
        }

        return stableLegacyImportSuccess({
          command: "legacy stage",
          workspace: workspaceDto(workspace.workspace),
          sourceCollectionId: command.sourceCollectionId,
          scanBatchId: command.scanBatchId,
          eventIds: newEvents.map((event) => event.id),
          nextActions: [legacyImportNextActions.reviewReport],
          data: {
            legacyReportId: resolved.report.legacyReportId,
            stagingBatchId: command.stagingBatchId,
            proposedAssertionIds: proposed.map((event) => event.payload.assertionId)
          }
        });
      } catch (error) {
        return stagingRuntimeError("legacy stage", error);
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

async function inspectAndParseLegacyRoot(input: {
  readonly ledger: EventLedger;
  readonly actor: ActorRef;
  readonly sourceCollectionId: string;
  readonly scanBatchId: string;
  readonly sourceRoot: string;
}): Promise<
  | {
      readonly ok: true;
      readonly reportInput: Awaited<ReturnType<LegacyCestusInspector["inspect"]>>;
      readonly proposedAssertionCandidates: LegacyProposedAssertionCandidate[];
      readonly quarantineEntries: LegacyQuarantineEntry[];
    }
  | { readonly ok: false }
> {
  try {
    const inspector = new LegacyCestusInspector({
      ledger: input.ledger,
      actor: input.actor,
      detectorRegistry: new LegacyDetectorRegistry([conservativeJsonMetadataPlugin])
    });
    const reportInput = await inspector.inspect({
      sourceCollectionId: input.sourceCollectionId,
      scanBatchId: input.scanBatchId,
      rootDir: input.sourceRoot
    });
    const parsed = await parseDetectedLegacyMetadata(input.sourceRoot, reportInput.detections);

    return {
      ok: true,
      reportInput,
      proposedAssertionCandidates: parsed.proposedAssertionCandidates,
      quarantineEntries: parsed.quarantineEntries
    };
  } catch {
    return { ok: false };
  }
}

async function resolveStoredReport(
  workspace: MountedWorkspace,
  command: Extract<
    LegacyImportCommandName,
    "legacy report" | "legacy quarantine" | "legacy staging-preview" | "legacy approve-staging" | "legacy stage"
  >,
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
        command,
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
        command,
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
    const reportWithHash = { ...report, reportHash };
    if (!reportArtifactMatchesSummary(reportWithHash, summary)) {
      return {
        ok: false,
        result: reportMismatchError(command)
      };
    }

    return {
      ok: true,
      report: reportWithHash
    };
  } catch {
    return {
      ok: false,
      result: stableLegacyImportError({
        code: "LEGACY_IMPORT_REPORT_NOT_FOUND",
        command,
        message: "Stored legacy migration report artifact was not found.",
        allowedRepairActions: ["rerun legacy inspect", "review workspace derivative storage"]
      })
    };
  }
}

function reportArtifactMatchesSummary(
  report: LegacyMigrationReport,
  summary: NonNullable<ReturnType<LegacyImportProjection["reports"]["get"]>>
): boolean {
  return report.legacyReportId === summary.legacyReportId &&
    report.sourceCollectionId === summary.sourceCollectionId &&
    report.scanBatchId === summary.scanBatchId &&
    report.candidateSetHash === summary.candidateSetHash &&
    sha256(reportArtifactJson(report)) === summary.reportHash;
}

function buildLegacyReportReviewDto(
  projection: LegacyImportProjection,
  sourceCollectionId: string,
  selectedReportId: string
): LegacyReportReviewDto {
  const base = buildLegacyMigrationReviewDto(projection, sourceCollectionId);
  const selectedReport = projection.reports.get(selectedReportId);
  const selectedStagingApproved = [...projection.stagingApprovals.values()].some(
    (approval) => approval.sourceCollectionId === sourceCollectionId && approval.legacyReportId === selectedReportId
  );

  return {
    ...base,
    selectedReportId,
    ...(base.latestReportId === undefined ? {} : { latestReportId: base.latestReportId }),
    rawImportRequiresApproval: selectedReport !== undefined,
    ontologyStagingApproved: selectedStagingApproved,
    isLatestReport: base.latestReportId === selectedReportId
  };
}

function reportMismatchError(
  command: Extract<
    LegacyImportCommandName,
    "legacy report" | "legacy quarantine" | "legacy staging-preview" | "legacy approve-staging" | "legacy stage"
  >
): LegacyImportRuntimeResult<never> {
  return stableLegacyImportError({
    code: "LEGACY_IMPORT_REPORT_NOT_FOUND",
    command,
    message: "Stored legacy migration report artifact does not match the ledger summary.",
    allowedRepairActions: ["rerun legacy inspect", "review workspace derivative storage"]
  });
}

function requireMountedWorkspace(
  workspace: MountedWorkspace | undefined,
  command: Extract<
    LegacyImportCommandName,
    | "legacy inspect"
    | "legacy report"
    | "legacy quarantine"
    | "legacy approve-import"
    | "legacy import"
    | "legacy staging-preview"
    | "legacy approve-staging"
    | "legacy stage"
  >,
  mode: "read" | "inspect" | "append" | "blob-write"
): LegacyWorkspaceRequirementResult {
  if (workspace === undefined || !workspace.capabilities.canReadLedger) {
    return stableLegacyImportError({
      code: "LEGACY_IMPORT_WORKSPACE_NOT_MOUNTED",
      command,
      message: "Mounted portable workspace with ledger read capability is required.",
      allowedRepairActions: ["mount the portable workspace", "retry the legacy import command"]
    });
  }

  if (
    (mode === "append" || mode === "blob-write") &&
    (!workspace.capabilities.canAppendLedger || !workspace.capabilities.canWriteJobState)
  ) {
    return stableLegacyImportError({
      code: "LEGACY_IMPORT_WORKSPACE_NOT_WRITABLE",
      command,
      message: "Legacy import gate requires append-capable workspace storage.",
      allowedRepairActions: ["remount the portable workspace read-write", "retry the legacy import command"]
    });
  }

  if (mode === "blob-write" && !workspace.capabilities.canWriteBlobs) {
    return stableLegacyImportError({
      code: "LEGACY_IMPORT_WORKSPACE_NOT_WRITABLE",
      command,
      message: "Legacy raw import requires blob-write workspace capability.",
      allowedRepairActions: ["remount the portable workspace read-write", "retry legacy import"]
    });
  }

  if (
    mode === "inspect" &&
    (!workspace.capabilities.canAppendLedger || !workspace.capabilities.canWriteDerivatives)
  ) {
    return stableLegacyImportError({
      code: "LEGACY_IMPORT_WORKSPACE_NOT_WRITABLE",
      command,
      message: "Legacy inspect requires append and derivative-write workspace capabilities.",
      allowedRepairActions: ["remount the portable workspace read-write", "retry legacy inspect"]
    });
  }

  return { ok: true, workspace };
}

type LegacyWorkspaceRequirementResult =
  | { readonly ok: true; readonly workspace: MountedWorkspace }
  | { readonly ok: false; readonly error: LegacyImportRuntimeResult<never>["error"] };

async function evidenceTiedCandidatesForReport(
  workspace: MountedWorkspace,
  report: LegacyMigrationReport
): Promise<LegacyApprovedAssertionCandidate[]> {
  const ingestionProjection = buildIngestionProjection(await workspace.ledger.readAll());
  const evidenceBySourceHash = new Map<`sha256:${string}`, string>();

  for (const link of ingestionProjection.evidenceLinks.values()) {
    if (link.sourceCollectionId === report.sourceCollectionId) {
      evidenceBySourceHash.set(link.contentHash as `sha256:${string}`, link.evidenceId);
    }
  }

  return report.proposedAssertionCandidates.flatMap((candidate) => {
    const evidenceId = evidenceBySourceHash.get(candidate.evidenceContentHash);

    if (evidenceId === undefined) {
      return [];
    }

    return [{
      candidateId: candidate.candidateId,
      observationId: candidate.observationId,
      evidenceContentHash: candidate.evidenceContentHash,
      sourcePath: candidate.sourcePath,
      predicate: candidate.predicate,
      object: candidate.object,
      confidence: candidate.confidence,
      ...(candidate.subjectRef === undefined ? {} : { subjectRef: candidate.subjectRef }),
      evidenceId
    }];
  });
}

function legacyErrorFromIngestion(
  command: Extract<LegacyImportCommandName, "legacy approve-import" | "legacy import">,
  error: IngestionRuntimeError
): LegacyImportRuntimeResult<never> {
  switch (error.code) {
    case "INGESTION_WORKSPACE_NOT_MOUNTED":
      return stableLegacyImportError({
        code: "LEGACY_IMPORT_WORKSPACE_NOT_MOUNTED",
        command,
        message: "Mounted portable workspace with ledger read capability is required.",
        allowedRepairActions: ["mount the portable workspace", "retry the legacy import command"]
      });
    case "INGESTION_WORKSPACE_NOT_WRITABLE":
      return stableLegacyImportError({
        code: "LEGACY_IMPORT_WORKSPACE_NOT_WRITABLE",
        command,
        message: "Legacy import requires writable workspace storage.",
        allowedRepairActions: ["remount the portable workspace read-write", "retry the legacy import command"]
      });
    case "INGESTION_SOURCE_NOT_REGISTERED":
      return stableLegacyImportError({
        code: "LEGACY_IMPORT_SOURCE_NOT_REGISTERED",
        command,
        message: "Legacy source collection is not registered.",
        allowedRepairActions: ["run legacy inspect", "retry the legacy import command"]
      });
    case "INGESTION_SCAN_REQUIRED":
      return stableLegacyImportError({
        code: "LEGACY_IMPORT_SOURCE_REQUIRED",
        command,
        message: "Completed legacy source scan is required before this import gate.",
        allowedRepairActions: ["run legacy inspect", "retry the legacy import command"]
      });
    case "INGESTION_IMPORT_APPROVAL_REQUIRED":
      return stableLegacyImportError({
        code: "LEGACY_IMPORT_RAW_IMPORT_APPROVAL_REQUIRED",
        command,
        message: "Human raw import approval is required before legacy import execution.",
        allowedRepairActions: ["run legacy approve-import", "retry legacy import"]
      });
    default:
      return stableLegacyImportError({
        code: "LEGACY_IMPORT_RUNTIME_INTERNAL",
        command,
        message: "Shared ingestion runtime rejected the legacy import gate.",
        allowedRepairActions: [...error.allowedRepairActions]
      });
  }
}

function candidateSetMismatchError(
  command: Extract<LegacyImportCommandName, "legacy approve-staging" | "legacy stage">
): LegacyImportRuntimeResult<never> {
  return stableLegacyImportError({
    code: "LEGACY_IMPORT_CANDIDATE_SET_MISMATCH",
    command,
    message: "Requested legacy staging candidates do not match the current evidence-tied report candidate set.",
    allowedRepairActions: ["rerun legacy staging-preview", "approve only listed candidate ids"]
  });
}

function stagingRuntimeError(
  command: Extract<LegacyImportCommandName, "legacy approve-staging" | "legacy stage">,
  error: unknown
): LegacyImportRuntimeResult<never> {
  const message = error instanceof Error ? error.message : "";

  if (/approval/i.test(message)) {
    return stableLegacyImportError({
      code: "LEGACY_IMPORT_STAGING_APPROVAL_REQUIRED",
      command,
      message: "Human ontology staging approval is required before staging legacy assertions.",
      allowedRepairActions: ["run legacy approve-staging", "retry legacy stage"]
    });
  }

  if (/candidate set hash/i.test(message)) {
    return candidateSetMismatchError(command);
  }

  if (/without evidence|content hash mismatch/i.test(message)) {
    return stableLegacyImportError({
      code: "LEGACY_IMPORT_EVIDENCE_LINK_REQUIRED",
      command,
      message: "Legacy staging candidates must be tied to imported evidence.",
      allowedRepairActions: ["run legacy import", "rerun legacy staging-preview"]
    });
  }

  return internalError(command);
}

const forbiddenAcceptedEventTypes = new Set<KnowledgeEvent["type"]>([
  "assertion.accepted",
  "entity.resolved",
  "relationship.accepted"
]);

function acceptedEventForbiddenError(command: "legacy stage"): LegacyImportRuntimeResult<never> {
  return stableLegacyImportError({
    code: "LEGACY_IMPORT_ACCEPTED_EVENT_FORBIDDEN",
    command,
    message: "Legacy ontology staging may append assertion proposals only.",
    allowedRepairActions: ["review the staging service implementation", "do not accept graph state in legacy stage"]
  });
}

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
  return eventsAddedAfter(beforeEvents, afterEvents).map((event) => event.id);
}

function eventsAddedAfter(beforeEvents: readonly KnowledgeEvent[], afterEvents: readonly KnowledgeEvent[]): KnowledgeEvent[] {
  const beforeIds = new Set(beforeEvents.map((event) => event.id));
  return afterEvents
    .filter((event) => !beforeIds.has(event.id));
}

function internalError(
  command: Extract<
    LegacyImportCommandName,
    | "legacy inspect"
    | "legacy report"
    | "legacy quarantine"
    | "legacy approve-import"
    | "legacy import"
    | "legacy staging-preview"
    | "legacy approve-staging"
    | "legacy stage"
  >
) {
  return stableLegacyImportError({
    code: "LEGACY_IMPORT_RUNTIME_INTERNAL",
    command,
    message: "Legacy import runtime failed while handling the command.",
    allowedRepairActions: ["retry the command", "inspect safe diagnostics"]
  });
}

function sourceUnavailableError(): LegacyImportRuntimeResult<never> {
  return stableLegacyImportError({
    code: "LEGACY_IMPORT_SOURCE_REQUIRED",
    command: "legacy inspect",
    message: "Readable legacy source root is required before inspection.",
    allowedRepairActions: ["check the legacy source root", "retry legacy inspect"]
  });
}
