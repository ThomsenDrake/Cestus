import { describe, expect, it } from "vitest";
import type { KnowledgeEvent } from "../../ontology/src/contracts.js";
import { buildIngestionProjection } from "../src/projection.js";
import { buildEvidenceWorkspaceDto, buildIngestionReviewDto } from "../src/read-api.js";
import { diagnosticRecordedEvent, goldenIngestionLedgerEvents } from "./fixtures/golden-ingestion-ledger.js";

const evidenceIngestedEvent: KnowledgeEvent = {
  id: "evt_ing_evidence_ingested",
  type: "evidence.ingested",
  version: 1,
  streamId: "evidence_ev_ing_001",
  sequence: 1,
  context: {
    actor: { id: "actor_investigator", kind: "human", label: "Investigator" },
    occurredAt: "2026-07-05T12:04:00.000Z",
    correlationId: "corr_ingestion_golden",
    coreVersion: "0.1.0",
    packVersions: { core: "0.1.0", ingestion: "0.1.0" }
  },
  payload: {
    evidenceId: "ev_ing_001",
    source: { kind: "file", label: "a.txt", uri: "file:///source/contracts/a.txt" },
    contentHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    mediaType: "text/plain",
    sizeBytes: 4
  }
};

const classifiedEvent: KnowledgeEvent = {
  id: "evt_ing_evidence_classified",
  type: "evidence.governance.classified",
  version: 1,
  streamId: "evidence_ev_ing_001",
  sequence: 2,
  context: {
    actor: { id: "actor_ruleset", kind: "extractor", label: "Governance ruleset" },
    occurredAt: "2026-07-05T12:05:00.000Z",
    causationId: evidenceIngestedEvent.id,
    correlationId: "corr_ingestion_golden",
    coreVersion: "0.1.0",
    packVersions: { core: "0.1.0" }
  },
  payload: {
    evidenceId: "ev_ing_001",
    evidenceEventId: evidenceIngestedEvent.id,
    contentHash: evidenceIngestedEvent.payload.contentHash,
    policy: { policyId: "gov_policy_default", version: "0.1.0" },
    classifier: { actorId: "actor_ruleset", kind: "ruleset", label: "Governance ruleset" },
    tags: [{ tag: "public_record", confidence: 0.99, rationale: "Imported public record." }]
  }
};

const quarantinedEvent: KnowledgeEvent = {
  id: "evt_ing_evidence_quarantined",
  type: "evidence.quarantined",
  version: 1,
  streamId: "evidence_ev_ing_001",
  sequence: 3,
  context: {
    actor: { id: "actor_investigator", kind: "human", label: "Investigator" },
    occurredAt: "2026-07-05T12:06:00.000Z",
    causationId: classifiedEvent.id,
    correlationId: "corr_ingestion_golden",
    coreVersion: "0.1.0",
    packVersions: { core: "0.1.0" }
  },
  payload: {
    evidenceId: "ev_ing_001",
    quarantineId: "quarantine_ing_001",
    quarantinedBy: "actor_investigator",
    reason: "Governance review is required.",
    lockLevel: "workflow"
  }
};

describe("ingestion read API", () => {
  it("resolves duplicate occurrences into one provenance-complete evidence item", () => {
    const dto = buildEvidenceWorkspaceDto([
      ...goldenIngestionLedgerEvents,
      evidenceIngestedEvent
    ]);

    expect(dto.items).toHaveLength(1);
    expect(dto.items[0]).toMatchObject({
      evidenceId: "ev_ing_001",
      contentHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      mediaType: "text/plain",
      sourceCollections: [{ sourceCollectionId: "src_drive_001", label: "External investigation archive" }],
      importBatchIds: ["imp_001"],
      occurrences: [
        { occurrenceId: "occ_001", sourcePath: "contracts/a.txt" },
        { occurrenceId: "occ_002", sourcePath: "duplicates/a-copy.txt" }
      ],
      parseJobs: [{
        parseJobId: "parse_001",
        parser: { name: "local-text", version: "0.1.0" },
        state: "succeeded",
        derivative: {
          contentHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
          mediaType: "text/plain"
        }
      }],
      provenanceComplete: true,
      selectableForAssertionCandidate: true,
      blockingReasons: []
    });
  });

  it("surfaces governance and PRR linkage while blocking quarantined evidence", () => {
    const prrEvent: KnowledgeEvent = {
      id: "evt_prr_production_ing_001",
      type: "prr.production.received",
      version: 1,
      streamId: "prr_prr_evidence_review_001",
      sequence: 1,
      context: {
        actor: { id: "actor_investigator", kind: "human", label: "Investigator" },
        occurredAt: "2026-07-05T12:07:00.000Z",
        correlationId: "corr_prr_evidence_review",
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0" }
      },
      payload: {
        prrRequestId: "prr_evidence_review_001",
        productionId: "prod_evidence_review_001",
        label: "Evidence review production",
        receivedAt: "2026-07-05T12:07:00.000Z",
        evidenceIds: ["ev_ing_001"]
      }
    };
    const dto = buildEvidenceWorkspaceDto([
      ...goldenIngestionLedgerEvents,
      evidenceIngestedEvent,
      classifiedEvent,
      quarantinedEvent,
      prrEvent
    ]);

    expect(dto.items[0]).toMatchObject({
      governanceTags: [{ tag: "public_record", source: "ai", status: "active" }],
      quarantined: true,
      linkedReferences: [{ kind: "prr", id: "prr_evidence_review_001", eventIds: [prrEvent.id] }],
      provenanceComplete: true,
      selectableForAssertionCandidate: false,
      blockingReasons: ["Quarantined evidence is excluded from ordinary assertion preparation."]
    });
  });

  it("keeps provenance-incomplete evidence visible but ineligible for assertion preparation", () => {
    const dto = buildEvidenceWorkspaceDto([evidenceIngestedEvent]);

    expect(dto).toMatchObject({
      status: "degraded",
      items: [{
        evidenceId: "ev_ing_001",
        provenanceComplete: false,
        selectableForAssertionCandidate: false,
        blockingReasons: ["Evidence occurrence lineage is missing."]
      }],
      diagnostics: [{ code: "missing-provenance", severity: "error" }]
    });
  });

  it("retains archive-container and internal paths for every canonical occurrence", () => {
    const archiveOccurrence: KnowledgeEvent = {
      id: "evt_ing_occurrence_archive_001",
      type: "ingestion.occurrence.observed",
      version: 1,
      streamId: "ingestion_scan_scan_001",
      sequence: 4,
      context: goldenIngestionLedgerEvents[2]!.context,
      payload: {
        occurrenceId: "occ_archive_001",
        scanBatchId: "scan_001",
        sourceCollectionId: "src_drive_001",
        contentHash: evidenceIngestedEvent.payload.contentHash,
        sourcePath: "archives/records.zip::inside/a.txt",
        sizeBytes: 4,
        observedAt: "2026-07-05T12:01:45.000Z",
        status: "duplicate",
        containerPath: "archives/records.zip",
        containerHash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
        internalPath: "inside/a.txt",
        archiveAdapter: { name: "zip", version: "0.1.0" }
      }
    };
    const events = goldenIngestionLedgerEvents.map((event) =>
      event.type === "ingestion.evidence.linked"
        ? { ...event, payload: { ...event.payload, occurrenceIds: [...event.payload.occurrenceIds, "occ_archive_001"] } }
        : event
    );
    const dto = buildEvidenceWorkspaceDto([...events, archiveOccurrence, evidenceIngestedEvent]);

    expect(dto.items[0]?.occurrences).toContainEqual(expect.objectContaining({
      occurrenceId: "occ_archive_001",
      sourcePath: "archives/records.zip::inside/a.txt",
      archive: {
        containerPath: "archives/records.zip",
        containerHash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
        internalPath: "inside/a.txt",
        adapter: { name: "zip", version: "0.1.0" }
      }
    }));
  });

  it("builds a dry-run review DTO for CLI and UI use", () => {
    const dto = buildIngestionReviewDto(buildIngestionProjection(goldenIngestionLedgerEvents), "src_drive_001");

    expect(dto).toMatchObject({
      sourceCollectionId: "src_drive_001",
      latestScanBatchId: "scan_001",
      totals: {
        observedFiles: 2,
        uniqueContent: 1,
        duplicateOccurrences: 1,
        skipped: 0,
        bytes: 8,
        estimatedNewBlobBytes: 4
      },
      approvalRequired: false,
      duplicateGroups: [{ contentHash: expect.stringMatching(/^sha256:/), occurrenceCount: 2 }]
    });
  });

  it("includes diagnostics from non-scan ingestion streams in the source review DTO", () => {
    const dto = buildIngestionReviewDto(
      buildIngestionProjection([
        ...goldenIngestionLedgerEvents,
        diagnosticRecordedEvent(
          "evt_diag_import_warning",
          "ingestion_import_src_drive_001_scan_001_imp_001",
          "diag_import_warning",
          "import stream warning"
        ),
        diagnosticRecordedEvent(
          "evt_diag_evidence_link_warning",
          "ingestion_evidence_link_src_drive_001_scan_001_imp_001_1111111111111111111111111111111111111111111111111111111111111111",
          "diag_evidence_link_warning",
          "evidence link stream warning"
        ),
        diagnosticRecordedEvent(
          "evt_diag_parse_warning",
          "ingestion_parse_parse_001",
          "diag_parse_warning",
          "parse stream warning"
        )
      ]),
      "src_drive_001"
    );

    expect(dto.diagnostics.map((diagnostic) => diagnostic.diagnosticId)).toEqual([
      "diag_evidence_link_warning",
      "diag_import_warning",
      "diag_parse_warning"
    ]);
  });

  it("returns fresh totals objects without mutating projection state or later DTOs", () => {
    const projection = buildIngestionProjection(goldenIngestionLedgerEvents);
    const firstDto = buildIngestionReviewDto(projection, "src_drive_001");

    firstDto.totals.observedFiles = 999;

    expect(projection.scans.get("scan_001")?.totals?.observedFiles).toBe(2);
    expect(buildIngestionReviewDto(projection, "src_drive_001").totals.observedFiles).toBe(2);

    const noScanProjection = buildIngestionProjection([goldenIngestionLedgerEvents[0]]);
    const firstNoScanDto = buildIngestionReviewDto(noScanProjection, "src_drive_001");
    firstNoScanDto.totals.observedFiles = 999;

    expect(buildIngestionReviewDto(noScanProjection, "src_drive_001").totals.observedFiles).toBe(0);
  });
});
