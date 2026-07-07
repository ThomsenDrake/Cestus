import type { LegacyMigrationReport } from "../../../ingestion/src/legacy-report.js";
import type { LegacyMigrationReviewDto } from "../../../ingestion/src/legacy-read-api.js";
import { assertLegacyConfidence, assertLegacySecretSafeDiagnosticText } from "../../../ingestion/src/legacy-types.js";

export const reportHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
export const candidateSetHash = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;
export const metadataHash = "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" as const;
export const rawHash = "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd" as const;

export const bootstrapReportFixture: LegacyMigrationReport = {
  sourceCollectionId: "src_old_cestus",
  scanBatchId: "scan_old_cestus_001",
  legacyReportId: "legacy_report_001",
  reportHash,
  candidateSetHash,
  generatedAt: "2026-07-06T00:00:00.000Z",
  generator: { name: "legacy-cestus-inspector", version: "0.1.0" },
  files: [
    {
      sourcePath: "ontology/claims.json",
      occurrenceId: "occ_claims",
      contentHash: metadataHash,
      sizeBytes: 128,
      mediaType: "application/json",
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      status: "new"
    },
    {
      sourcePath: "docs/contract.txt",
      occurrenceId: "occ_contract",
      contentHash: rawHash,
      sizeBytes: 64,
      mediaType: "text/plain",
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      status: "new"
    }
  ],
  detections: [
    {
      sourcePath: "ontology/claims.json",
      contentHash: metadataHash,
      plugin: { name: "legacy-json-metadata", version: "0.1.0" },
      shape: "json-legacy-metadata",
      confidence: assertLegacyConfidence(0.8),
      parserEligible: true,
      reasonCodes: ["json", "explicit-legacy-cestus-marker"]
    }
  ],
  proposedAssertionCandidates: [
    {
      candidateId: "legacy_candidate_001",
      observationId: "legacy_observation_001",
      evidenceContentHash: metadataHash,
      sourcePath: "ontology/claims.json",
      subjectRef: "legacy:agency:example",
      predicate: "agency.name",
      object: "Example Agency",
      confidence: assertLegacyConfidence(0.8)
    },
    {
      candidateId: "legacy_candidate_missing",
      observationId: "legacy_observation_missing",
      evidenceContentHash: rawHash,
      sourcePath: "docs/contract.txt",
      predicate: "contract.title",
      object: "Missing import",
      confidence: assertLegacyConfidence(0.7)
    }
  ],
  quarantineEntries: [
    {
      quarantineId: "legacy_quarantine_corrupt",
      sourcePath: "ontology/corrupt.json",
      contentHash: metadataHash,
      plugin: { name: "legacy-json-claim-parser", version: "0.1.0" },
      issueCategory: "malformed",
      message: assertLegacySecretSafeDiagnosticText("Legacy JSON could not be parsed."),
      legacyIds: [],
      repairActions: [assertLegacySecretSafeDiagnosticText("Review the legacy claims metadata shape.")]
    }
  ],
  totals: {
    inspectedFiles: 2,
    candidateMetadataFiles: 1,
    proposedAssertionCandidates: 2,
    quarantineEntries: 1,
    unresolvedReferences: 0
  },
  recommendedNextActions: [
    "Review raw import summary before evidence import",
    "Review proposed assertion candidates before ontology staging",
    "Keep candidate entity resolution and relationship material in the report"
  ]
};

export const bootstrapReviewFixture: LegacyMigrationReviewDto = {
  sourceCollectionId: "src_old_cestus",
  latestReportId: "legacy_report_001",
  rawImportRequiresApproval: false,
  ontologyStagingApproved: false,
  firstArtifactAsk: [
    "Read-only folder tree listing of the old Cestus root",
    "Two to five sanitized metadata or ontology files",
    "Any old manifest, index, registry, or graph export file if present"
  ],
  diagnostics: []
};

export const bootstrapEvidenceLinksFixture = [
  {
    sourceCollectionId: "src_old_cestus",
    evidenceId: "ev_legacy_claims",
    contentHash: metadataHash,
    occurrenceIds: ["occ_claims"]
  },
  {
    sourceCollectionId: "src_other_cestus",
    evidenceId: "ev_other_source",
    contentHash: rawHash,
    occurrenceIds: ["occ_contract"]
  }
] as const;
