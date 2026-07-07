import { createHash } from "node:crypto";
import type { LegacyMigrationReport } from "../../ingestion/src/legacy-report.js";
import {
  ontologyBootstrapToolPreviewSchema,
  type OntologyBootstrapToolPreview
} from "./contracts.js";

export interface RawImportApprovalPreviewInput {
  readonly sourceCollectionId: string;
  readonly scanBatchId: string;
  readonly importBatchId: string;
  readonly legacyReportId: string;
  readonly reportHash: `sha256:${string}`;
}

export interface StagingApprovalPreviewInput {
  readonly report: LegacyMigrationReport;
  readonly stagingBatchId: string;
  readonly selectedCandidateIds: readonly string[];
  readonly evidenceRefs: readonly {
    readonly candidateId: string;
    readonly evidenceId: string;
    readonly evidenceContentHash: `sha256:${string}`;
  }[];
}

export interface StagingExecutionPreviewInput {
  readonly report: LegacyMigrationReport;
  readonly stagingBatchId: string;
  readonly selectedCandidateIds: readonly string[];
}

export function createRawImportApprovalPreview(
  input: RawImportApprovalPreviewInput
): OntologyBootstrapToolPreview {
  return parsePreview({
    previewId: `bootstrap_preview_raw_import_${input.importBatchId}`,
    toolId: "legacy.raw-import.approval.request",
    effect: "ledger-review",
    summary: "Record human raw import approval; this does not copy bytes or stage ontology assertions.",
    sourceCollectionId: input.sourceCollectionId,
    scanBatchId: input.scanBatchId,
    importBatchId: input.importBatchId,
    legacyReportId: input.legacyReportId,
    reportHash: input.reportHash,
    selectedCandidateIds: [],
    evidenceRefs: [],
    allowedEventTypes: [],
    requiresHumanApproval: true,
    material: input
  });
}

export function createStagingApprovalPreview(
  input: StagingApprovalPreviewInput
): OntologyBootstrapToolPreview {
  const selectedCandidateIds = sortedCandidateIds(input.selectedCandidateIds);
  const evidenceRefs = sortedEvidenceRefs(input.evidenceRefs);
  const candidatesById = candidatesByIdFor(input.report);
  assertSelectedCandidates(selectedCandidateIds);
  assertSelectedCandidatesBelongToReport(candidatesById, selectedCandidateIds);
  assertEvidenceRefsMatchSelection(selectedCandidateIds, evidenceRefs);
  assertEvidenceRefsMatchReportCandidates(candidatesById, evidenceRefs);

  return parsePreview({
    previewId: `bootstrap_preview_staging_approval_${input.stagingBatchId}`,
    toolId: "legacy.staging.approval.request",
    effect: "ledger-review",
    summary: "Record human ontology staging approval for selected evidence-tied candidates only.",
    sourceCollectionId: input.report.sourceCollectionId,
    scanBatchId: input.report.scanBatchId,
    stagingBatchId: input.stagingBatchId,
    legacyReportId: input.report.legacyReportId,
    reportHash: input.report.reportHash,
    candidateSetHash: input.report.candidateSetHash,
    selectedCandidateIds,
    evidenceRefs,
    allowedEventTypes: [],
    requiresHumanApproval: true,
    material: {
      sourceCollectionId: input.report.sourceCollectionId,
      scanBatchId: input.report.scanBatchId,
      stagingBatchId: input.stagingBatchId,
      legacyReportId: input.report.legacyReportId,
      reportHash: input.report.reportHash,
      candidateSetHash: input.report.candidateSetHash,
      selectedCandidateIds,
      evidenceRefs
    }
  });
}

export function createStagingExecutionPreview(
  input: StagingExecutionPreviewInput
): OntologyBootstrapToolPreview {
  const selectedCandidateIds = sortedCandidateIds(input.selectedCandidateIds);
  const candidatesById = candidatesByIdFor(input.report);
  assertSelectedCandidates(selectedCandidateIds);
  assertSelectedCandidatesBelongToReport(candidatesById, selectedCandidateIds);

  return parsePreview({
    previewId: `bootstrap_preview_staging_execute_${input.stagingBatchId}`,
    toolId: "legacy.staging.execute",
    effect: "ledger-proposal",
    summary: "Execute approved staging through the legacy runtime; allowed output is assertion.proposed only.",
    sourceCollectionId: input.report.sourceCollectionId,
    scanBatchId: input.report.scanBatchId,
    stagingBatchId: input.stagingBatchId,
    legacyReportId: input.report.legacyReportId,
    reportHash: input.report.reportHash,
    candidateSetHash: input.report.candidateSetHash,
    selectedCandidateIds,
    evidenceRefs: [],
    allowedEventTypes: ["assertion.proposed"],
    requiresHumanApproval: false,
    material: {
      sourceCollectionId: input.report.sourceCollectionId,
      scanBatchId: input.report.scanBatchId,
      stagingBatchId: input.stagingBatchId,
      legacyReportId: input.report.legacyReportId,
      reportHash: input.report.reportHash,
      candidateSetHash: input.report.candidateSetHash,
      selectedCandidateIds,
      allowedEventTypes: ["assertion.proposed"]
    }
  });
}

interface PreviewDraft {
  readonly previewId: string;
  readonly toolId: string;
  readonly effect: "read-only" | "local-derivative" | "ledger-review" | "ledger-proposal";
  readonly summary: string;
  readonly sourceCollectionId: string;
  readonly scanBatchId?: string;
  readonly importBatchId?: string;
  readonly stagingBatchId?: string;
  readonly legacyReportId?: string;
  readonly reportHash?: `sha256:${string}`;
  readonly candidateSetHash?: `sha256:${string}`;
  readonly selectedCandidateIds: readonly string[];
  readonly evidenceRefs: readonly StagingApprovalPreviewInput["evidenceRefs"][number][];
  readonly allowedEventTypes: readonly string[];
  readonly requiresHumanApproval: boolean;
  readonly material: unknown;
}

function parsePreview(input: PreviewDraft): OntologyBootstrapToolPreview {
  const previewHash = sha256(stableJson(input.material));
  const { material: _material, ...preview } = input;
  return ontologyBootstrapToolPreviewSchema.parse({
    ...preview,
    previewHash
  });
}

function assertSelectedCandidates(candidateIds: readonly string[]): void {
  if (candidateIds.length === 0) {
    throw new Error("At least one selected candidate is required for ontology bootstrap staging previews.");
  }
}

function assertSelectedCandidatesBelongToReport(
  candidatesById: ReadonlyMap<string, LegacyMigrationReport["proposedAssertionCandidates"][number]>,
  selectedCandidateIds: readonly string[]
): void {
  for (const candidateId of selectedCandidateIds) {
    if (!candidatesById.has(candidateId)) {
      throw new Error(`Selected candidate ${candidateId} is not in the legacy report.`);
    }
  }
}

function assertEvidenceRefsMatchSelection(
  selectedCandidateIds: readonly string[],
  evidenceRefs: readonly StagingApprovalPreviewInput["evidenceRefs"][number][]
): void {
  const selected = new Set(selectedCandidateIds);
  for (const ref of evidenceRefs) {
    if (!selected.has(ref.candidateId)) {
      throw new Error(`Evidence ref ${ref.candidateId} is not in selected ontology bootstrap candidates.`);
    }
  }

  const evidenceRefCandidateIds = new Set(evidenceRefs.map((ref) => ref.candidateId));
  for (const candidateId of selectedCandidateIds) {
    if (!evidenceRefCandidateIds.has(candidateId)) {
      throw new Error(`Evidence ref is required for selected ontology bootstrap candidate ${candidateId}.`);
    }
  }
}

function assertEvidenceRefsMatchReportCandidates(
  candidatesById: ReadonlyMap<string, LegacyMigrationReport["proposedAssertionCandidates"][number]>,
  evidenceRefs: readonly StagingApprovalPreviewInput["evidenceRefs"][number][]
): void {
  for (const ref of evidenceRefs) {
    const candidate = candidatesById.get(ref.candidateId);
    if (candidate === undefined) {
      throw new Error(`Evidence ref ${ref.candidateId} is not in the legacy report.`);
    }
    if (candidate.evidenceContentHash !== ref.evidenceContentHash) {
      throw new Error(`Evidence content hash for candidate ${ref.candidateId} does not match the legacy report.`);
    }
  }
}

function candidatesByIdFor(
  report: LegacyMigrationReport
): Map<string, LegacyMigrationReport["proposedAssertionCandidates"][number]> {
  return new Map(report.proposedAssertionCandidates.map((candidate) => [candidate.candidateId, candidate]));
}

function sortedCandidateIds(candidateIds: readonly string[]): string[] {
  return [...candidateIds].sort(compareCodeUnits);
}

function sortedEvidenceRefs(
  evidenceRefs: readonly StagingApprovalPreviewInput["evidenceRefs"][number][]
): StagingApprovalPreviewInput["evidenceRefs"][number][] {
  return [...evidenceRefs].sort((left, right) =>
    compareTuple([
      left.candidateId,
      left.evidenceId,
      left.evidenceContentHash
    ], [
      right.candidateId,
      right.evidenceId,
      right.evidenceContentHash
    ])
  );
}

function sha256(text: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(text).digest("hex")}`;
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortStable(value));
}

function sortStable(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortStable);
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => compareCodeUnits(left, right))
        .map(([key, item]) => [key, sortStable(item)])
    );
  }
  return value;
}

function compareTuple(left: readonly string[], right: readonly string[]): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const comparison = compareCodeUnits(left[index] ?? "", right[index] ?? "");
    if (comparison !== 0) {
      return comparison;
    }
  }
  return left.length - right.length;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
