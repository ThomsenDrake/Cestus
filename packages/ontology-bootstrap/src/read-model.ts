import type { LegacyMigrationReport } from "../../ingestion/src/legacy-report.js";
import type { LegacyMigrationReviewDto } from "../../ingestion/src/legacy-read-api.js";
import {
  ontologyBootstrapFailureSchema,
  type OntologyBootstrapFailure,
  type OntologyBootstrapPhase
} from "./contracts.js";
import type { OntologyBootstrapEvidenceLink } from "./dossier-builder.js";

export interface BuildOntologyBootstrapReadinessInput {
  readonly sourceCollectionId: string;
  readonly review: LegacyMigrationReviewDto;
  readonly report?: LegacyMigrationReport;
  readonly evidenceLinks: readonly OntologyBootstrapEvidenceLink[];
}

export interface OntologyBootstrapReadiness {
  readonly sourceCollectionId: string;
  readonly phase: OntologyBootstrapPhase;
  readonly latestReportId?: string;
  readonly eligibleCandidateCount: number;
  readonly blockedCandidateCount: number;
  readonly failures: readonly OntologyBootstrapFailure[];
}

export function buildOntologyBootstrapReadiness(
  input: BuildOntologyBootstrapReadinessInput
): OntologyBootstrapReadiness {
  const mismatch = identityMismatch(input);
  if (mismatch !== undefined) {
    return {
      sourceCollectionId: input.sourceCollectionId,
      phase: "blocked",
      ...(input.review.latestReportId === undefined ? {} : { latestReportId: input.review.latestReportId }),
      eligibleCandidateCount: 0,
      blockedCandidateCount: 0,
      failures: [mismatch]
    };
  }

  if (input.report === undefined || input.review.latestReportId === undefined) {
    return {
      sourceCollectionId: input.sourceCollectionId,
      phase: "report-required",
      ...(input.review.latestReportId === undefined ? {} : { latestReportId: input.review.latestReportId }),
      eligibleCandidateCount: 0,
      blockedCandidateCount: 0,
      failures: [
        failure({
          code: "legacy-report-required",
          message: "A legacy migration report is required before ontology bootstrap.",
          allowedRepairActions: ["run legacy inspect", "review the first artifact ask"]
        })
      ]
    };
  }

  const sameSourceHashes = new Set(
    input.evidenceLinks
      .filter((link) => link.sourceCollectionId === input.sourceCollectionId)
      .map((link) => link.contentHash)
  );
  const eligibleCandidateCount = input.report.proposedAssertionCandidates.filter((candidate) =>
    sameSourceHashes.has(candidate.evidenceContentHash)
  ).length;
  const blockedCandidateCount = input.report.proposedAssertionCandidates.length - eligibleCandidateCount;

  return {
    sourceCollectionId: input.sourceCollectionId,
    phase: phaseFor(input, eligibleCandidateCount),
    latestReportId: input.review.latestReportId,
    eligibleCandidateCount,
    blockedCandidateCount,
    failures: []
  };
}

function identityMismatch(input: BuildOntologyBootstrapReadinessInput): OntologyBootstrapFailure | undefined {
  if (input.review.sourceCollectionId !== input.sourceCollectionId) {
    return legacyReportMismatchFailure();
  }
  if (input.report !== undefined && input.report.sourceCollectionId !== input.sourceCollectionId) {
    return legacyReportMismatchFailure();
  }
  if (
    input.report !== undefined &&
    input.review.latestReportId !== undefined &&
    input.review.latestReportId !== input.report.legacyReportId
  ) {
    return legacyReportMismatchFailure();
  }
  return undefined;
}

function legacyReportMismatchFailure(): OntologyBootstrapFailure {
  return failure({
    code: "legacy-report-mismatch",
    message: "Legacy report identity does not match the ontology bootstrap launch context.",
    allowedRepairActions: ["select the matching legacy report", "refresh the legacy review projection"]
  });
}

function phaseFor(input: BuildOntologyBootstrapReadinessInput, eligibleCandidateCount: number): OntologyBootstrapPhase {
  if (input.review.rawImportRequiresApproval) {
    return "raw-import-review";
  }
  if (eligibleCandidateCount === 0) {
    return "evidence-import";
  }
  if (input.review.ontologyStagingApproved) {
    return "ready-to-stage";
  }
  return "staging-review";
}

function failure(input: OntologyBootstrapFailure): OntologyBootstrapFailure {
  return ontologyBootstrapFailureSchema.parse(input);
}
