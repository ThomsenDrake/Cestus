import type { LegacyMigrationReport } from "../../ingestion/src/legacy-report.js";
import type { LegacyMigrationReviewDto } from "../../ingestion/src/legacy-read-api.js";
import {
  type OntologyBootstrapDossier,
  ontologyBootstrapFailureSchema,
  type OntologyBootstrapFailure,
  type OntologyBootstrapToolPreview
} from "./contracts.js";
import {
  buildOntologyBootstrapDossier,
  type OntologyBootstrapEvidenceLink
} from "./dossier-builder.js";
import { buildOntologyBootstrapReadiness } from "./read-model.js";
import {
  createRawImportApprovalPreview,
  createStagingApprovalPreview,
  createStagingExecutionPreview
} from "./tool-previews.js";

export interface RunFakeOntologyBootstrapSpecialistInput {
  readonly sourceCollectionId: string;
  readonly report?: LegacyMigrationReport;
  readonly review: LegacyMigrationReviewDto;
  readonly evidenceLinks: readonly OntologyBootstrapEvidenceLink[];
  readonly selectedCandidateIds: readonly string[];
  readonly importBatchId?: string;
  readonly stagingBatchId?: string;
  readonly now: () => string;
}

export type FakeOntologyBootstrapSpecialistResult =
  | {
      readonly ok: true;
      readonly dossier: OntologyBootstrapDossier;
      readonly toolPreviews: readonly OntologyBootstrapToolPreview[];
      readonly sideEffects: readonly never[];
    }
  | {
      readonly ok: false;
      readonly failure: OntologyBootstrapFailure;
    };

export function runFakeOntologyBootstrapSpecialist(
  input: RunFakeOntologyBootstrapSpecialistInput
): FakeOntologyBootstrapSpecialistResult {
  const readiness = buildOntologyBootstrapReadiness({
    sourceCollectionId: input.sourceCollectionId,
    review: input.review,
    ...(input.report === undefined ? {} : { report: input.report }),
    evidenceLinks: input.evidenceLinks
  });

  if (readiness.failures.length > 0 || input.report === undefined) {
    return {
      ok: false,
      failure: readiness.failures[0] ?? missingReportFailure()
    };
  }

  const dossier = buildOntologyBootstrapDossier({
    report: input.report,
    review: input.review,
    evidenceLinks: input.evidenceLinks,
    now: input.now
  });
  const runtimeInput = { ...input, report: input.report };

  return {
    ok: true,
    dossier,
    toolPreviews: toolPreviewsFor(runtimeInput, dossier),
    sideEffects: []
  };
}

function toolPreviewsFor(
  input: RunFakeOntologyBootstrapSpecialistInput & { readonly report: LegacyMigrationReport },
  dossier: OntologyBootstrapDossier
): OntologyBootstrapToolPreview[] {
  if (dossier.phase === "raw-import-review") {
    return [
      createRawImportApprovalPreview({
        sourceCollectionId: input.report.sourceCollectionId,
        scanBatchId: input.report.scanBatchId,
        importBatchId: input.importBatchId ?? "imp_ontology_bootstrap_preview",
        legacyReportId: input.report.legacyReportId,
        reportHash: input.report.reportHash
      })
    ];
  }

  if (dossier.phase === "staging-review") {
    const selected = selectCandidateIds(input, dossier);
    if (selected.length === 0) {
      return [];
    }

    return [
      createStagingApprovalPreview({
        report: input.report,
        stagingBatchId: input.stagingBatchId ?? "legacy_stage_ontology_bootstrap_preview",
        selectedCandidateIds: selected,
        evidenceRefs: evidenceRefsForSelected(dossier, selected)
      })
    ];
  }

  if (dossier.phase === "ready-to-stage") {
    const selected = selectCandidateIds(input, dossier);
    if (selected.length === 0) {
      return [];
    }

    return [
      createStagingExecutionPreview({
        report: input.report,
        stagingBatchId: input.stagingBatchId ?? "legacy_stage_ontology_bootstrap_preview",
        selectedCandidateIds: selected
      })
    ];
  }

  return [];
}

function selectCandidateIds(
  input: RunFakeOntologyBootstrapSpecialistInput,
  dossier: OntologyBootstrapDossier
): string[] {
  const eligibleIds = new Set(
    dossier.candidateBatches
      .filter((batch) => batch.readiness === "eligible")
      .flatMap((batch) => batch.candidates.map((candidate) => candidate.candidateId))
  );
  return input.selectedCandidateIds
    .filter((candidateId) => eligibleIds.has(candidateId))
    .sort(compareCodeUnits);
}

function evidenceRefsForSelected(dossier: OntologyBootstrapDossier, selectedCandidateIds: readonly string[]) {
  const selected = new Set(selectedCandidateIds);
  return dossier.candidateBatches
    .flatMap((batch) => batch.candidates)
    .flatMap((candidate) => {
      if (!selected.has(candidate.candidateId) || candidate.evidenceId === undefined) {
        return [];
      }

      return [{
        candidateId: candidate.candidateId,
        evidenceId: candidate.evidenceId,
        evidenceContentHash: candidate.evidenceContentHash as `sha256:${string}`
      }];
    })
    .sort((left, right) =>
      compareTuple([left.candidateId, left.evidenceId, left.evidenceContentHash], [
        right.candidateId,
        right.evidenceId,
        right.evidenceContentHash
      ])
    );
}

function missingReportFailure(): OntologyBootstrapFailure {
  return ontologyBootstrapFailureSchema.parse({
    code: "legacy-report-required",
    message: "A legacy migration report is required before ontology bootstrap.",
    allowedRepairActions: ["run legacy inspect", "review the first artifact ask"]
  });
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
