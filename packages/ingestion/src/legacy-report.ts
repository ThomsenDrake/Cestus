import { createHash } from "node:crypto";
import type { z } from "zod";
import {
  actorRefSchema,
  type AppendableKnowledgeEvent,
  type KnowledgeEventOf
} from "../../ontology/src/contracts.js";
import type { FileBlobStore } from "../../ontology/src/blob-store.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";
import type { LegacyInspectedFile } from "./legacy-inspector.js";
import type {
  LegacyDetection,
  LegacyProposedAssertionCandidate,
  LegacyQuarantineEntry
} from "./legacy-types.js";

type ActorRef = z.infer<typeof actorRefSchema>;

export interface LegacyReportDetectionRecord extends LegacyDetection {
  sourcePath: string;
  contentHash: `sha256:${string}`;
}

export interface BuildLegacyMigrationReportInput {
  sourceCollectionId: string;
  scanBatchId: string;
  files: LegacyInspectedFile[];
  detections: LegacyReportDetectionRecord[];
  proposedAssertionCandidates: LegacyProposedAssertionCandidate[];
  quarantineEntries: LegacyQuarantineEntry[];
}

export interface LegacyReportTotals {
  inspectedFiles: number;
  candidateMetadataFiles: number;
  proposedAssertionCandidates: number;
  quarantineEntries: number;
  unresolvedReferences: number;
}

export interface LegacyMigrationReport extends BuildLegacyMigrationReportInput {
  legacyReportId: string;
  reportHash: `sha256:${string}`;
  candidateSetHash: `sha256:${string}`;
  generatedAt: string;
  generator: { name: "legacy-cestus-inspector"; version: "0.1.0" };
  totals: LegacyReportTotals;
  recommendedNextActions: string[];
}

export interface LegacyMigrationReportServiceDependencies {
  ledger: EventLedger;
  reportStore: FileBlobStore;
  actor: ActorRef;
}

const generatedAt = "2026-07-06T00:00:00.000Z";
const generator = { name: "legacy-cestus-inspector", version: "0.1.0" } as const;

export class LegacyMigrationReportService {
  constructor(private readonly dependencies: LegacyMigrationReportServiceDependencies) {
    const actor = actorRefSchema.safeParse(dependencies.actor);

    if (!actor.success) {
      throw new Error(`Invalid legacy report actor: ${actor.error.issues[0]?.message ?? actor.error.message}`);
    }
  }

  async recordReport(report: LegacyMigrationReport): Promise<KnowledgeEventOf<"legacy.import.report.generated">> {
    const reportArtifact = reportArtifactJson(report);
    const stored = await this.dependencies.reportStore.put(Buffer.from(reportArtifact, "utf8"));

    if (stored.contentHash !== report.reportHash) {
      throw new Error(`Report hash mismatch for ${report.legacyReportId}`);
    }

    const event: AppendableKnowledgeEvent<"legacy.import.report.generated"> = {
      type: "legacy.import.report.generated",
      version: 1,
      streamId: legacyReportStreamId(report),
      context: {
        actor: this.dependencies.actor,
        occurredAt: new Date().toISOString(),
        correlationId: `corr_${report.legacyReportId}`,
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0", ingestion: "0.1.0", legacy: "0.1.0" }
      },
      payload: {
        legacyReportId: report.legacyReportId,
        sourceCollectionId: report.sourceCollectionId,
        scanBatchId: report.scanBatchId,
        reportHash: report.reportHash,
        candidateSetHash: report.candidateSetHash,
        generatedAt: report.generatedAt,
        generator: report.generator,
        totals: report.totals
      }
    };
    const appended = await this.dependencies.ledger.append(event, { expectedNextSequence: 1 });

    if (appended.type !== "legacy.import.report.generated") {
      throw new Error(`Unexpected event type appended for legacy report: ${appended.type}`);
    }

    return appended;
  }
}

export function buildLegacyMigrationReport(input: BuildLegacyMigrationReportInput): LegacyMigrationReport {
  const sortedCandidates = sortProposedAssertionCandidates(input.proposedAssertionCandidates);
  const candidateSetHash = sha256(stableJson(sortedCandidates));
  const legacyReportId = `legacy_report_${sha256Hex(`${input.sourceCollectionId}:${input.scanBatchId}:${candidateSetHash}`)}`;
  const reportWithoutHash = {
    sourceCollectionId: input.sourceCollectionId,
    scanBatchId: input.scanBatchId,
    files: sortFiles(input.files),
    detections: sortDetections(input.detections),
    proposedAssertionCandidates: sortedCandidates,
    quarantineEntries: sortQuarantineEntries(input.quarantineEntries),
    legacyReportId,
    candidateSetHash,
    generatedAt,
    generator,
    totals: {
      inspectedFiles: input.files.length,
      candidateMetadataFiles: candidateMetadataFileCount(input.detections),
      proposedAssertionCandidates: input.proposedAssertionCandidates.length,
      quarantineEntries: input.quarantineEntries.length,
      unresolvedReferences: input.quarantineEntries.filter((entry) => entry.issueCategory === "stale-reference").length
    },
    recommendedNextActions: [
      "Review raw import summary before evidence import",
      "Review proposed assertion candidates before ontology staging",
      "Keep candidate entity resolution and relationship material in the report"
    ]
  } satisfies Omit<LegacyMigrationReport, "reportHash">;

  return {
    ...reportWithoutHash,
    reportHash: sha256(stableJson(reportWithoutHash))
  };
}

export function legacyReportStreamId(
  report: Pick<LegacyMigrationReport, "sourceCollectionId" | "scanBatchId" | "legacyReportId">
): string {
  return `legacy_report_${report.sourceCollectionId}_${report.scanBatchId}_${report.legacyReportId}`;
}

export function reportArtifactJson(report: LegacyMigrationReport): string {
  const { reportHash: _reportHash, ...reportWithoutHash } = report;
  return stableJson(reportWithoutHash);
}

export function stableJson(value: unknown): string {
  return JSON.stringify(sortStableJsonValue(value));
}

export function sha256(text: string): `sha256:${string}` {
  return `sha256:${sha256Hex(text)}`;
}

export function sortStableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortStableJsonValue);
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => compareCodeUnits(left, right))
        .map(([key, item]) => [key, sortStableJsonValue(item)])
    );
  }

  return value;
}

function sortFiles(files: readonly LegacyInspectedFile[]): LegacyInspectedFile[] {
  return [...files].sort((left, right) => compareTuple(fileIdentityTuple(left), fileIdentityTuple(right)));
}

function sortDetections(detections: readonly LegacyReportDetectionRecord[]): LegacyReportDetectionRecord[] {
  return [...detections].sort((left, right) =>
    compareTuple([
      left.sourcePath,
      left.contentHash,
      left.plugin.name,
      left.plugin.version,
      left.shape
    ], [
      right.sourcePath,
      right.contentHash,
      right.plugin.name,
      right.plugin.version,
      right.shape
    ])
  );
}

function sortProposedAssertionCandidates(
  candidates: readonly LegacyProposedAssertionCandidate[]
): LegacyProposedAssertionCandidate[] {
  return [...candidates].sort((left, right) =>
    compareTuple([
      left.candidateId,
      left.observationId,
      left.sourcePath,
      left.evidenceContentHash,
      left.predicate
    ], [
      right.candidateId,
      right.observationId,
      right.sourcePath,
      right.evidenceContentHash,
      right.predicate
    ])
  );
}

function sortQuarantineEntries(entries: readonly LegacyQuarantineEntry[]): LegacyQuarantineEntry[] {
  return [...entries].sort((left, right) =>
    compareTuple([
      left.sourcePath,
      left.quarantineId,
      left.contentHash,
      left.plugin.name,
      left.plugin.version
    ], [
      right.sourcePath,
      right.quarantineId,
      right.contentHash,
      right.plugin.name,
      right.plugin.version
    ])
  );
}

function fileIdentityTuple(file: LegacyInspectedFile): string[] {
  return [
    file.sourcePath,
    file.internalPath ?? "",
    file.occurrenceId,
    file.containerHash ?? ""
  ];
}

function candidateMetadataFileCount(detections: readonly LegacyReportDetectionRecord[]): number {
  return new Set(detections.map((detection) => `${detection.sourcePath}\u0000${detection.contentHash}`)).size;
}

function sha256Hex(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function compareTuple(left: readonly string[], right: readonly string[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const result = compareCodeUnits(left[index] ?? "", right[index] ?? "");

    if (result !== 0) {
      return result;
    }
  }

  return 0;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
