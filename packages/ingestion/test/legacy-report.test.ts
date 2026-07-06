import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileBlobStore } from "../../ontology/src/blob-store.js";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { LegacyMigrationReportService, buildLegacyMigrationReport } from "../src/legacy-report.js";
import type { LegacyInspectedFile } from "../src/legacy-inspector.js";
import {
  assertLegacyConfidence,
  assertLegacySecretSafeDiagnosticText,
  type LegacyDetection,
  type LegacyProposedAssertionCandidate,
  type LegacyQuarantineEntry
} from "../src/legacy-types.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "legacy-report-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("legacy migration report", () => {
  it("builds stable totals and hashes from sorted report inputs", () => {
    const first = buildLegacyMigrationReport({
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      files: [claimFile(), rawFile()],
      detections: [claimDetection()],
      proposedAssertionCandidates: [legacyCandidate("legacy_candidate_002"), legacyCandidate("legacy_candidate_001")],
      quarantineEntries: [staleReferenceQuarantine(), malformedQuarantine()]
    });
    const second = buildLegacyMigrationReport({
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      files: [rawFile(), claimFile()],
      detections: [claimDetection()],
      proposedAssertionCandidates: [legacyCandidate("legacy_candidate_001"), legacyCandidate("legacy_candidate_002")],
      quarantineEntries: [malformedQuarantine(), staleReferenceQuarantine()]
    });

    expect(first.totals).toEqual({
      inspectedFiles: 2,
      candidateMetadataFiles: 1,
      proposedAssertionCandidates: 2,
      quarantineEntries: 2,
      unresolvedReferences: 1
    });
    expect(first.reportHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.candidateSetHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.reportHash).toBe(second.reportHash);
    expect(first.candidateSetHash).toBe(second.candidateSetHash);
  });

  it("sorts and hashes archive children by explicit archive identity", () => {
    const archiveHash = "sha256:9999999999999999999999999999999999999999999999999999999999999999" as const;
    const childA = archiveChild({
      occurrenceId: "occ_archive_a",
      internalPath: "a/claims.json",
      containerHash: archiveHash
    });
    const childB = archiveChild({
      occurrenceId: "occ_archive_b",
      internalPath: "b/claims.json",
      containerHash: archiveHash
    });
    const report = buildLegacyMigrationReport({
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      files: [childB, childA],
      detections: [],
      proposedAssertionCandidates: [],
      quarantineEntries: []
    });
    const changedIdentity = buildLegacyMigrationReport({
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      files: [
        archiveChild({
          occurrenceId: "occ_archive_c",
          internalPath: "c/claims.json",
          containerHash: archiveHash
        })
      ],
      detections: [],
      proposedAssertionCandidates: [],
      quarantineEntries: []
    });

    expect(report.files.map((file) => file.internalPath)).toEqual(["a/claims.json", "b/claims.json"]);
    expect(report.reportHash).not.toBe(changedIdentity.reportHash);
  });

  it("stores report JSON without reportHash and appends one strict report event", async () => {
    const ledger = new InMemoryEventLedger();
    const reportStore = new FileBlobStore(dir);
    const service = new LegacyMigrationReportService({
      ledger,
      reportStore,
      actor: { id: "actor_system", kind: "system", label: "Legacy reporter" }
    });
    const report = buildLegacyMigrationReport({
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      files: [claimFile()],
      detections: [claimDetection()],
      proposedAssertionCandidates: [legacyCandidate("legacy_candidate_001")],
      quarantineEntries: []
    });

    const event = await service.recordReport(report);
    const storedReport = JSON.parse((await reportStore.get(report.reportHash)).toString("utf8")) as Record<string, unknown>;
    const events = await ledger.readAll();

    expect(storedReport).not.toHaveProperty("reportHash");
    expect(event.type).toBe("legacy.import.report.generated");
    expect(event.payload.reportHash).toBe(report.reportHash);
    expect(events).toHaveLength(1);
    expect(Object.keys(event.payload).sort()).toEqual([
      "candidateSetHash",
      "generatedAt",
      "generator",
      "legacyReportId",
      "reportHash",
      "scanBatchId",
      "sourceCollectionId",
      "totals"
    ]);
    expect(event.payload).not.toHaveProperty("acceptedAssertionIds");
    expect(event.payload).not.toHaveProperty("acceptedEntityIds");
    expect(event.payload).not.toHaveProperty("entityIds");
    expect(event.payload).not.toHaveProperty("relationshipIds");
  });
});

function rawFile(): LegacyInspectedFile {
  return {
    sourceCollectionId: "src_old_cestus",
    scanBatchId: "scan_old_cestus_001",
    occurrenceId: "occ_raw_contract",
    sourcePath: "docs/contract.txt",
    contentHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    sizeBytes: 13,
    mediaType: "text/plain",
    status: "new"
  };
}

function claimFile(): LegacyInspectedFile {
  return {
    sourceCollectionId: "src_old_cestus",
    scanBatchId: "scan_old_cestus_001",
    occurrenceId: "occ_claims",
    sourcePath: "ontology/claims.json",
    contentHash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    sizeBytes: 60,
    mediaType: "application/json",
    status: "new"
  };
}

function archiveChild(input: {
  occurrenceId: string;
  internalPath: string;
  containerHash: `sha256:${string}`;
}): LegacyInspectedFile {
  return {
    sourceCollectionId: "src_old_cestus",
    scanBatchId: "scan_old_cestus_001",
    occurrenceId: input.occurrenceId,
    sourcePath: "archives/legacy.zip",
    internalPath: input.internalPath,
    containerPath: "archives/legacy.zip",
    containerHash: input.containerHash,
    archiveAdapter: { name: "zip", version: "0.1.0" },
    contentHash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    sizeBytes: 60,
    mediaType: "application/json",
    status: "new"
  };
}

function claimDetection(): LegacyDetection & { sourcePath: string; contentHash: `sha256:${string}` } {
  return {
    sourcePath: "ontology/claims.json",
    contentHash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    plugin: { name: "legacy-json-metadata", version: "0.1.0" },
    shape: "json-legacy-metadata",
    confidence: assertLegacyConfidence(0.8),
    parserEligible: true,
    reasonCodes: ["json", "explicit-legacy-cestus-marker"]
  };
}

function legacyCandidate(candidateId: string): LegacyProposedAssertionCandidate {
  return {
    candidateId,
    observationId: `legacy_obs_${candidateId}`,
    evidenceContentHash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    sourcePath: "ontology/claims.json",
    predicate: "agency.name",
    object: "Example Agency",
    confidence: assertLegacyConfidence(0.8)
  };
}

function malformedQuarantine(): LegacyQuarantineEntry {
  return {
    quarantineId: "legacy_quarantine_malformed",
    sourcePath: "ontology/corrupt.json",
    contentHash: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
    plugin: { name: "legacy-json-metadata", version: "0.1.0" },
    issueCategory: "malformed",
    message: assertLegacySecretSafeDiagnosticText("Legacy JSON metadata could not be parsed."),
    legacyIds: [],
    repairActions: [assertLegacySecretSafeDiagnosticText("Review the metadata file manually.")]
  };
}

function staleReferenceQuarantine(): LegacyQuarantineEntry {
  return {
    quarantineId: "legacy_quarantine_stale",
    sourcePath: "ontology/claims.json",
    contentHash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    plugin: { name: "legacy-json-metadata", version: "0.1.0" },
    issueCategory: "stale-reference",
    message: assertLegacySecretSafeDiagnosticText("Legacy claim references a missing source artifact."),
    legacyIds: ["legacy_claim_missing"],
    repairActions: [assertLegacySecretSafeDiagnosticText("Find the missing source file before staging.")]
  };
}
