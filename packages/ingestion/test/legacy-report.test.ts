import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileBlobStore } from "../../ontology/src/blob-store.js";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import {
  LegacyMigrationReportService,
  buildLegacyMigrationReport,
  readCanonicalStagedLegacyReport,
  reportArtifactJson,
  sha256
} from "../src/legacy-report.js";
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

  it("uses full report material for report ids so same candidate sets do not collide", async () => {
    const ledger = new InMemoryEventLedger();
    const service = new LegacyMigrationReportService({
      ledger,
      reportStore: new FileBlobStore(dir),
      actor: { id: "actor_system", kind: "system", label: "Legacy reporter" }
    });
    const first = buildLegacyMigrationReport({
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      files: [claimFile()],
      detections: [claimDetection()],
      proposedAssertionCandidates: [legacyCandidate("legacy_candidate_001")],
      quarantineEntries: []
    });
    const second = buildLegacyMigrationReport({
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      files: [claimFile(), rawFile()],
      detections: [claimDetection()],
      proposedAssertionCandidates: [legacyCandidate("legacy_candidate_001")],
      quarantineEntries: [staleReferenceQuarantine()]
    });

    expect(first.candidateSetHash).toBe(second.candidateSetHash);
    expect(first.legacyReportId).not.toBe(second.legacyReportId);
    expect(first.reportHash).not.toBe(second.reportHash);

    const firstEvent = await service.recordReport(first);
    const secondEvent = await service.recordReport(second);
    const events = await ledger.readAll();

    expect(firstEvent.streamId).not.toBe(secondEvent.streamId);
    expect(events).toHaveLength(2);
    expect([firstEvent.payload.reportHash, secondEvent.payload.reportHash]).toEqual([first.reportHash, second.reportHash]);
  });

  it("reads only an exact event-bound canonical staged report without append or derivative writes", async () => {
    const stored = await recordedReport();
    let appendAttempts = 0;
    let derivativeWriteAttempts = 0;

    const result = await readCanonicalStagedLegacyReport({
      ledger: {
        readAll: () => stored.ledger.readAll(),
        readStream: (streamId) => stored.ledger.readStream(streamId),
        append: async () => {
          appendAttempts += 1;
          throw new Error("reader must not append");
        }
      },
      derivativeStore: {
        get: (contentHash) => stored.reportStore.get(contentHash),
        put: async () => {
          derivativeWriteAttempts += 1;
          throw new Error("reader must not write derivatives");
        }
      },
      ...reportReference(stored)
    });

    expect(result).toEqual({
      ok: true,
      report: stored.report,
      reportEvent: stored.event
    });
    expect(appendAttempts).toBe(0);
    expect(derivativeWriteAttempts).toBe(0);
  });

  it.each([
    {
      label: "a forged report hash",
      override: { reportHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const }
    },
    {
      label: "a forged report event ID",
      override: { reportEventId: "evt_forged_report_event" }
    },
    {
      label: "a swapped source identity",
      override: { sourceCollectionId: "src_swapped" }
    },
    {
      label: "a swapped scan identity",
      override: { scanBatchId: "scan_swapped" }
    },
    {
      label: "a swapped report identity",
      override: { legacyReportId: "legacy_report_swapped" }
    }
  ])("fails closed without derivative reads for $label", async ({ override }) => {
    const stored = await recordedReport();
    let derivativeReadAttempts = 0;

    const result = await readCanonicalStagedLegacyReport({
      ledger: stored.ledger,
      derivativeStore: {
        get: async (contentHash) => {
          derivativeReadAttempts += 1;
          return stored.reportStore.get(contentHash);
        }
      },
      ...reportReference(stored),
      ...override
    });

    expect(result).toEqual({ ok: false, code: "LEGACY_STAGED_REPORT_EVENT_MISMATCH" });
    expect(derivativeReadAttempts).toBe(0);
  });

  it("fails closed for forged stored report bytes even when the store is callable", async () => {
    const stored = await recordedReport();
    let derivativeWriteAttempts = 0;
    const forgedBytes = Buffer.from(reportArtifactJson({
      ...stored.report,
      candidateSetHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    }), "utf8");

    const result = await readCanonicalStagedLegacyReport({
      ledger: stored.ledger,
      derivativeStore: {
        get: async () => forgedBytes,
        put: async () => {
          derivativeWriteAttempts += 1;
          throw new Error("reader must not write derivatives");
        }
      },
      ...reportReference(stored)
    });

    expect(result).toEqual({ ok: false, code: "LEGACY_STAGED_REPORT_ARTIFACT_MISMATCH" });
    expect(derivativeWriteAttempts).toBe(0);
  });

  it("fails closed for an accessor-bearing ledger readback without invoking it", async () => {
    const stored = await recordedReport();
    let accessorRead = false;
    let derivativeReadAttempts = 0;
    const accessorEvent = {};
    Object.defineProperty(accessorEvent, "id", {
      enumerable: true,
      get() {
        accessorRead = true;
        throw new Error("accessor must not run");
      }
    });

    const result = await readCanonicalStagedLegacyReport({
      ledger: {
        readAll: async () => [accessorEvent] as never[],
        readStream: () => stored.ledger.readStream(stored.event.streamId),
        append: stored.ledger.append.bind(stored.ledger)
      },
      derivativeStore: {
        get: async () => {
          derivativeReadAttempts += 1;
          return stored.reportStore.get(stored.report.reportHash);
        }
      },
      ...reportReference(stored)
    });

    expect(result).toEqual({ ok: false, code: "LEGACY_STAGED_REPORT_EVENT_MISMATCH" });
    expect(accessorRead).toBe(false);
    expect(derivativeReadAttempts).toBe(0);
  });

  it("fails closed for a hash-matched stored artifact with an extra malformed field", async () => {
    const stored = await recordedReport();
    const malformedBytes = Buffer.from(JSON.stringify({
      ...JSON.parse(reportArtifactJson(stored.report)),
      unexpected: true
    }), "utf8");
    const malformedHash = sha256(malformedBytes.toString("utf8"));
    const event = await appendReportEvent({
      ledger: new InMemoryEventLedger(),
      report: stored.report,
      reportHash: malformedHash
    });

    const result = await readCanonicalStagedLegacyReport({
      ledger: event.ledger,
      derivativeStore: { get: async () => malformedBytes },
      reportEventId: event.reportEvent.id,
      sourceCollectionId: stored.report.sourceCollectionId,
      scanBatchId: stored.report.scanBatchId,
      legacyReportId: stored.report.legacyReportId,
      reportHash: malformedHash
    });

    expect(result).toEqual({ ok: false, code: "LEGACY_STAGED_REPORT_ARTIFACT_MISMATCH" });
  });
});

async function recordedReport() {
  const ledger = new InMemoryEventLedger();
  const reportStore = new FileBlobStore(dir);
  const report = buildLegacyMigrationReport({
    sourceCollectionId: "src_old_cestus",
    scanBatchId: "scan_old_cestus_001",
    files: [claimFile()],
    detections: [claimDetection()],
    proposedAssertionCandidates: [legacyCandidate("legacy_candidate_001")],
    quarantineEntries: []
  });
  const event = await new LegacyMigrationReportService({
    ledger,
    reportStore,
    actor: { id: "actor_system", kind: "system", label: "Legacy reporter" }
  }).recordReport(report);
  return { ledger, reportStore, report, event };
}

function reportReference(stored: Awaited<ReturnType<typeof recordedReport>>) {
  return {
    reportEventId: stored.event.id,
    sourceCollectionId: stored.report.sourceCollectionId,
    scanBatchId: stored.report.scanBatchId,
    legacyReportId: stored.report.legacyReportId,
    reportHash: stored.report.reportHash
  };
}

async function appendReportEvent(input: {
  ledger: InMemoryEventLedger;
  report: ReturnType<typeof buildLegacyMigrationReport>;
  reportHash: `sha256:${string}`;
}) {
  const reportEvent = await input.ledger.append({
    type: "legacy.import.report.generated",
    version: 1,
    streamId: `legacy_report_${input.report.sourceCollectionId}_${input.report.scanBatchId}_${input.report.legacyReportId}`,
    context: {
      actor: { id: "actor_system", kind: "system", label: "Legacy reporter" },
      occurredAt: "2026-07-14T14:00:00.000Z",
      correlationId: `corr_${input.report.legacyReportId}`,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", ingestion: "0.1.0", legacy: "0.1.0" }
    },
    payload: {
      legacyReportId: input.report.legacyReportId,
      sourceCollectionId: input.report.sourceCollectionId,
      scanBatchId: input.report.scanBatchId,
      reportHash: input.reportHash,
      candidateSetHash: input.report.candidateSetHash,
      generatedAt: input.report.generatedAt,
      generator: input.report.generator,
      totals: input.report.totals
    }
  });
  return { ledger: input.ledger, reportEvent };
}

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
