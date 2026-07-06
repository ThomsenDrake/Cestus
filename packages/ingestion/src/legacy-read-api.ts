import { firstLegacyArtifactAsk } from "./legacy-types.js";
import type { LegacyImportProjection } from "./legacy-projection.js";

export interface LegacyMigrationReviewDto {
  sourceCollectionId: string;
  latestReportId?: string;
  rawImportRequiresApproval: boolean;
  ontologyStagingApproved: boolean;
  firstArtifactAsk: readonly string[];
  diagnostics: Array<{
    diagnosticId: string;
    severity: "info" | "warning" | "error";
    category: string;
    message: string;
  }>;
}

export function buildLegacyMigrationReviewDto(
  projection: LegacyImportProjection,
  sourceCollectionId: string
): LegacyMigrationReviewDto {
  const latestReportId = projection.latestReportBySource.get(sourceCollectionId);
  const report = latestReportId === undefined ? undefined : projection.reports.get(latestReportId);
  const stagingApproved = [...projection.stagingApprovals.values()].some(
    (approval) => approval.sourceCollectionId === sourceCollectionId && approval.legacyReportId === latestReportId
  );

  return {
    sourceCollectionId,
    ...(latestReportId === undefined ? {} : { latestReportId }),
    rawImportRequiresApproval: report !== undefined,
    ontologyStagingApproved: stagingApproved,
    firstArtifactAsk: firstLegacyArtifactAsk,
    diagnostics: diagnosticsForSource(projection, sourceCollectionId)
  };
}

function diagnosticsForSource(
  projection: LegacyImportProjection,
  sourceCollectionId: string
): LegacyMigrationReviewDto["diagnostics"] {
  const diagnosticIds = projection.diagnosticsBySourceCollectionId.get(sourceCollectionId) ?? [];

  return diagnosticIds
    .map((diagnosticId) => projection.diagnostics.get(diagnosticId))
    .filter((diagnostic) => diagnostic !== undefined)
    .map((diagnostic) => ({
      diagnosticId: diagnostic.diagnosticId,
      severity: diagnostic.severity,
      category: diagnostic.category,
      message: diagnostic.message
    }))
    .sort((left, right) => compareCodeUnits(left.diagnosticId, right.diagnosticId));
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
