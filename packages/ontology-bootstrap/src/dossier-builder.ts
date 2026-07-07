import type { LegacyMigrationReport } from "../../ingestion/src/legacy-report.js";
import type { LegacyMigrationReviewDto } from "../../ingestion/src/legacy-read-api.js";
import {
  ontologyBootstrapDossierSchema,
  type OntologyBootstrapDossier,
  type OntologyBootstrapPhase
} from "./contracts.js";

export interface OntologyBootstrapEvidenceLink {
  readonly sourceCollectionId: string;
  readonly evidenceId: string;
  readonly contentHash: `sha256:${string}`;
  readonly occurrenceIds: readonly string[];
}

export interface BuildOntologyBootstrapDossierInput {
  readonly report: LegacyMigrationReport;
  readonly review: LegacyMigrationReviewDto;
  readonly evidenceLinks: readonly OntologyBootstrapEvidenceLink[];
  readonly now: () => string;
  readonly provenanceRefs?: readonly string[];
}

export function buildOntologyBootstrapDossier(
  input: BuildOntologyBootstrapDossierInput
): OntologyBootstrapDossier {
  assertMatchingReportReviewIdentity(input.report, input.review);

  const evidenceByHash = sameSourceEvidenceByHash(input);
  const evidenceInventory = [...input.report.files]
    .sort((left, right) =>
      compareTuple([left.sourcePath, left.contentHash, left.occurrenceId], [
        right.sourcePath,
        right.contentHash,
        right.occurrenceId
      ])
    )
    .map((file) => {
      const evidenceId = evidenceByHash.get(file.contentHash);
      return {
        sourcePath: file.sourcePath,
        contentHash: file.contentHash,
        mediaType: file.mediaType,
        sizeBytes: file.sizeBytes,
        imported: evidenceId !== undefined,
        ...(evidenceId === undefined ? {} : { evidenceId })
      };
    });
  const candidates = [...input.report.proposedAssertionCandidates].sort((left, right) =>
    compareCodeUnits(left.candidateId, right.candidateId)
  );
  const eligible = candidates.flatMap((candidate) => {
    const evidenceId = evidenceByHash.get(candidate.evidenceContentHash);
    return evidenceId === undefined ? [] : [candidateWithEvidence(input.report, candidate, evidenceId)];
  });
  const blocked = candidates.flatMap((candidate) =>
    evidenceByHash.has(candidate.evidenceContentHash)
      ? []
      : [candidateWithProvenance(input.report, candidate)]
  );
  const candidateBatches = [
    ...(eligible.length === 0 ? [] : [{
      batchId: "bootstrap_batch_eligible",
      label: "Eligible assertion candidates",
      readiness: "eligible" as const,
      candidates: eligible
    }]),
    ...(blocked.length === 0 ? [] : [{
      batchId: "bootstrap_batch_blocked_evidence",
      label: "Candidates blocked on evidence links",
      readiness: "blocked" as const,
      candidates: blocked
    }])
  ];

  return ontologyBootstrapDossierSchema.parse({
    schemaVersion: "ontology-bootstrap.v1",
    dossierId: `bootstrap_dossier_${input.report.sourceCollectionId}_${input.report.scanBatchId}`,
    generatedAt: input.now(),
    phase: phaseFor(input, eligible.length),
    sourceCollectionId: input.report.sourceCollectionId,
    scanBatchId: input.report.scanBatchId,
    legacyReportId: input.report.legacyReportId,
    reportHash: input.report.reportHash,
    candidateSetHash: input.report.candidateSetHash,
    summary: {
      evidenceFiles: input.report.files.length,
      importedEvidenceFiles: evidenceInventory.filter((item) => item.imported).length,
      parserDetections: input.report.detections.length,
      eligibleAssertionCandidates: eligible.length,
      blockedAssertionCandidates: blocked.length,
      quarantineEntries: input.report.quarantineEntries.length,
      localExtensionSuggestions: 0
    },
    evidenceInventory,
    parserConfidence: parserConfidence(input.report),
    quarantineGroups: quarantineGroups(input.report),
    candidateBatches,
    reportOnlyNotes: [
      {
        noteId: "bootstrap_note_report_only_relationships",
        kind: "candidate-relationship",
        message: "Candidate entity and relationship material remains report-only until a reviewed candidate contract exists.",
        sourceRefs: [input.report.legacyReportId]
      }
    ],
    questions: questionsFor(input, eligible.length, blocked.length),
    localExtensionSuggestions: [],
    nextSafeAction: nextSafeActionFor(input, eligible.length),
    provenanceRefs: [...(input.provenanceRefs ?? [input.report.legacyReportId])]
  });
}

function assertMatchingReportReviewIdentity(
  report: LegacyMigrationReport,
  review: LegacyMigrationReviewDto
): void {
  if (
    review.sourceCollectionId !== report.sourceCollectionId ||
    (review.latestReportId !== undefined && review.latestReportId !== report.legacyReportId)
  ) {
    throw new Error("Legacy report identity does not match the ontology bootstrap review context.");
  }
}

function sameSourceEvidenceByHash(input: BuildOntologyBootstrapDossierInput): Map<`sha256:${string}`, string> {
  const pairs = input.evidenceLinks
    .filter((link) => link.sourceCollectionId === input.report.sourceCollectionId)
    .map((link) => [link.contentHash, link.evidenceId] as const)
    .sort((left, right) => compareTuple([left[0], left[1]], [right[0], right[1]]));
  return new Map(pairs);
}

function candidateWithEvidence(
  report: LegacyMigrationReport,
  candidate: LegacyMigrationReport["proposedAssertionCandidates"][number],
  evidenceId: string
) {
  return {
    ...candidate,
    evidenceId,
    provenance: candidateProvenance(report)
  };
}

function candidateWithProvenance(
  report: LegacyMigrationReport,
  candidate: LegacyMigrationReport["proposedAssertionCandidates"][number]
) {
  return {
    ...candidate,
    provenance: candidateProvenance(report)
  };
}

function candidateProvenance(report: LegacyMigrationReport) {
  return {
    legacyReportId: report.legacyReportId,
    reportHash: report.reportHash,
    candidateSetHash: report.candidateSetHash,
    sourceCollectionId: report.sourceCollectionId,
    scanBatchId: report.scanBatchId,
    sourceEventIds: []
  };
}

function phaseFor(input: BuildOntologyBootstrapDossierInput, eligibleCount: number): OntologyBootstrapPhase {
  if (input.review.rawImportRequiresApproval) {
    return "raw-import-review";
  }
  if (eligibleCount === 0) {
    return "evidence-import";
  }
  if (input.review.ontologyStagingApproved) {
    return "ready-to-stage";
  }
  return "staging-review";
}

function parserConfidence(report: LegacyMigrationReport) {
  return [...report.detections]
    .sort((left, right) =>
      compareTuple([left.sourcePath, left.contentHash, left.plugin.name, left.plugin.version, left.shape], [
        right.sourcePath,
        right.contentHash,
        right.plugin.name,
        right.plugin.version,
        right.shape
      ])
    )
    .map((detection) => ({
      pluginName: detection.plugin.name,
      pluginVersion: detection.plugin.version,
      shape: detection.shape,
      sourcePath: detection.sourcePath,
      confidence: detection.confidence,
      parserEligible: detection.parserEligible
    }));
}

function quarantineGroups(report: LegacyMigrationReport) {
  const groups = new Map<string, { sourcePaths: Set<string>; repairActions: Set<string>; count: number }>();
  for (const entry of report.quarantineEntries) {
    const group = groups.get(entry.issueCategory) ?? { sourcePaths: new Set(), repairActions: new Set(), count: 0 };
    group.count += 1;
    group.sourcePaths.add(entry.sourcePath);
    for (const action of entry.repairActions) {
      group.repairActions.add(action);
    }
    groups.set(entry.issueCategory, group);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => compareCodeUnits(left, right))
    .map(([issueCategory, group]) => ({
      issueCategory,
      count: group.count,
      sourcePaths: [...group.sourcePaths].sort(compareCodeUnits),
      repairActions: [...group.repairActions].sort(compareCodeUnits)
    }));
}

function questionsFor(input: BuildOntologyBootstrapDossierInput, eligibleCount: number, blockedCount: number) {
  if (input.review.rawImportRequiresApproval) {
    return [{
      questionId: "bootstrap_question_raw_import",
      prompt: "Should the reviewed legacy files be approved for raw evidence import?",
      reason: "Raw import approval is required before evidence copy.",
      relatedRefs: [input.report.legacyReportId]
    }];
  }
  if (eligibleCount > 0 && !input.review.ontologyStagingApproved) {
    return [{
      questionId: "bootstrap_question_staging_batch",
      prompt: "Which eligible assertion candidates should move to staging approval?",
      reason: "Evidence-tied candidates need human staging approval before assertion proposals.",
      relatedRefs: [input.report.candidateSetHash]
    }];
  }
  if (blockedCount > 0) {
    return [{
      questionId: "bootstrap_question_missing_evidence",
      prompt: "Should blocked candidates wait for raw import, be quarantined, or be ignored for this pass?",
      reason: "Blocked candidates lack same-source evidence links.",
      relatedRefs: [input.report.legacyReportId]
    }];
  }
  return [];
}

function nextSafeActionFor(input: BuildOntologyBootstrapDossierInput, eligibleCount: number) {
  if (input.review.rawImportRequiresApproval) {
    return {
      actionId: "bootstrap_action_approve_raw_import",
      label: "Review raw import approval",
      kind: "request-tool" as const,
      effect: "ledger-review" as const
    };
  }
  if (eligibleCount === 0) {
    return {
      actionId: "bootstrap_action_run_raw_import",
      label: "Run approved raw import or inspect missing evidence",
      kind: "review" as const,
      effect: "none" as const
    };
  }
  if (!input.review.ontologyStagingApproved) {
    return {
      actionId: "bootstrap_action_approve_staging",
      label: "Review staging approval preview",
      kind: "request-tool" as const,
      effect: "ledger-review" as const
    };
  }
  return {
    actionId: "bootstrap_action_stage_approved",
    label: "Stage approved assertion proposals",
    kind: "request-tool" as const,
    effect: "ledger-proposal" as const
  };
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
