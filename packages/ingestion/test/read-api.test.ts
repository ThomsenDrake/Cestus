import { describe, expect, it } from "vitest";
import { validateKnowledgeEvent, type KnowledgeEvent } from "../../ontology/src/contracts.js";
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
      quarantineLockLevels: ["workflow"],
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
      event.type === "ingestion.import.completed"
        ? {
            ...event,
            payload: {
              ...event.payload,
              totals: { ...event.payload.totals, occurrencesLinked: 3 }
            }
          }
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
    expect(dto.items[0]).toMatchObject({
      provenanceComplete: true,
      selectableForAssertionCandidate: true
    });
  });

  it("reconciles omitted duplicate links from the exact completed scan", () => {
    const events = goldenIngestionLedgerEvents.map((event) =>
      event.type === "ingestion.evidence.linked"
        ? { ...event, payload: { ...event.payload, occurrenceIds: ["occ_001"] } }
        : event
    );

    const dto = buildEvidenceWorkspaceDto([...events, evidenceIngestedEvent]);

    expect(dto.items[0]).toMatchObject({
      occurrences: [
        { occurrenceId: "occ_001", sourcePath: "contracts/a.txt" },
        { occurrenceId: "occ_002", sourcePath: "duplicates/a-copy.txt" }
      ],
      provenanceComplete: true,
      selectableForAssertionCandidate: true
    });
  });

  it("blocks a batch when completion totals do not match exact observed lineage", () => {
    const events = goldenIngestionLedgerEvents.map((event) => {
      if (event.type === "ingestion.evidence.linked") {
        return { ...event, payload: { ...event.payload, occurrenceIds: ["occ_001"] } };
      }
      if (event.type === "ingestion.import.completed") {
        return {
          ...event,
          payload: {
            ...event.payload,
            totals: { ...event.payload.totals, occurrencesLinked: 1 }
          }
        };
      }
      return event;
    });

    const dto = buildEvidenceWorkspaceDto([...events, evidenceIngestedEvent]);

    expect(dto.items[0]).toMatchObject({
      occurrences: [
        { occurrenceId: "occ_001" },
        { occurrenceId: "occ_002" }
      ],
      provenanceComplete: false,
      selectableForAssertionCandidate: false,
      blockingReasons: ["Import completion totals do not match observed occurrence lineage."]
    });
  });

  it("omits tombstoned and all-locked evidence while retaining workflow-locked evidence", () => {
    const base = [...goldenIngestionLedgerEvents, evidenceIngestedEvent];
    const workflow = buildEvidenceWorkspaceDto([...base, quarantinedEvent]);
    const allLocked = buildEvidenceWorkspaceDto([...base, {
      ...quarantinedEvent,
      id: "evt_ing_evidence_quarantined_all",
      payload: {
        ...quarantinedEvent.payload,
        quarantineId: "quarantine_ing_all",
        lockLevel: "all"
      }
    }]);
    const tombstoned = buildEvidenceWorkspaceDto([...base, tombstonedEvent()]);

    expect(workflow.items[0]).toMatchObject({
      quarantineLockLevels: ["workflow"],
      selectableForAssertionCandidate: false
    });
    expect(allLocked.items).toEqual([]);
    expect(tombstoned.items).toEqual([]);
  });

  it("links investigations through specialist-run source event provenance", () => {
    const runStarted: KnowledgeEvent = {
      id: "evt_agent_specialist_run_started_evidence",
      type: "agent.specialist-run.started",
      version: 1,
      streamId: "agent_run_run_evidence_review_001",
      sequence: 1,
      context: {
        ...evidenceIngestedEvent.context,
        occurredAt: "2026-07-05T12:07:00.000Z"
      },
      payload: {
        runId: "run_evidence_review_001",
        residentAgentId: "agent_default",
        runType: "evidence-triage",
        startedBy: "actor_investigator",
        investigationId: "inv_evidence_review_001",
        sourceEventIds: ["evt_ing_evidence_linked"]
      }
    };
    expect(validateKnowledgeEvent(runStarted).success).toBe(true);

    const dto = buildEvidenceWorkspaceDto([
      ...goldenIngestionLedgerEvents,
      evidenceIngestedEvent,
      runStarted
    ]);

    expect(dto.items[0]?.linkedReferences).toContainEqual({
      kind: "investigation",
      id: "inv_evidence_review_001",
      eventIds: [runStarted.id]
    });
  });

  it("never exposes credential-shaped evidence or assertion fields in the browser DTO", () => {
    const secret = "access_token=super-sensitive-value-123";
    const unsafeEvents = goldenIngestionLedgerEvents.map((event) => {
      if (event.type === "ingestion.source.registered") {
        return { ...event, payload: { ...event.payload, label: secret } };
      }
      if (event.type === "ingestion.occurrence.observed" && event.payload.occurrenceId === "occ_001") {
        return { ...event, payload: { ...event.payload, sourcePath: secret } };
      }
      return event;
    });
    const unsafeEvidence: KnowledgeEvent = {
      ...evidenceIngestedEvent,
      payload: {
        ...evidenceIngestedEvent.payload,
        source: { kind: "file", label: secret }
      }
    };
    const unsafeProposal: KnowledgeEvent = {
      id: "evt_assertion_proposed_unsafe",
      type: "assertion.proposed",
      version: 1,
      streamId: "assertion_as_unsafe_browser",
      sequence: 1,
      context: {
        ...evidenceIngestedEvent.context,
        occurredAt: "2026-07-05T12:07:00.000Z",
        causationId: evidenceIngestedEvent.id
      },
      payload: {
        assertionId: "as_unsafe_browser",
        evidenceId: "ev_ing_001",
        predicate: secret,
        object: "Example Agency",
        confidence: 0.8,
        reviewState: "proposed"
      }
    };

    const dto = buildEvidenceWorkspaceDto([...unsafeEvents, unsafeEvidence, unsafeProposal]);
    const serialized = JSON.stringify(dto);

    expect(serialized).not.toContain(secret);
    expect(dto.items).toEqual([]);
    expect(dto.assertionCandidates).toEqual([]);
    expect(dto.diagnostics).toContainEqual(expect.objectContaining({
      code: "secret-safety",
      severity: "error"
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

function tombstonedEvent(): KnowledgeEvent {
  return {
    id: "evt_ing_evidence_tombstoned",
    type: "evidence.tombstoned",
    version: 1,
    streamId: "evidence_ev_ing_001",
    sequence: 2,
    context: {
      ...evidenceIngestedEvent.context,
      occurredAt: "2026-07-05T12:06:00.000Z",
      causationId: evidenceIngestedEvent.id
    },
    payload: {
      evidenceId: "ev_ing_001",
      tombstoneId: "tombstone_ing_001",
      tombstonedBy: "actor_investigator",
      reason: "Superseded duplicate retained only for ledger replay."
    }
  };
}
