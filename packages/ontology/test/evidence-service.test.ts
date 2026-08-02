import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileBlobStore } from "../src/blob-store.js";
import type { AppendableKnowledgeEvent, KnowledgeEvent } from "../src/contracts.js";
import { EvidenceReviewService, EvidenceService } from "../src/evidence-service.js";
import { InMemoryEventLedger } from "../src/event-ledger.js";
import { goldenIngestionLedgerEvents } from "../../ingestion/test/fixtures/golden-ingestion-ledger.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cestus-evidence-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("EvidenceService", () => {
  it("stores raw content and appends an evidence.ingested event", async () => {
    const blobStore = new FileBlobStore(dir);
    const ledger = new InMemoryEventLedger();
    const service = new EvidenceService({ blobStore, ledger });
    const content = Buffer.from("public record body");

    const event = await service.ingest({
      evidenceId: "ev_service_001",
      content,
      mediaType: "text/plain",
      source: { kind: "file", label: "record.txt", uri: "file:///records/record.txt" },
      actor: { id: "actor_reviewer", kind: "human", label: "Reviewer" }
    });

    const storedContent = await blobStore.get(event.payload.contentHash as `sha256:${string}`);
    const streamEvents = await ledger.readStream("evidence_ev_service_001");

    expect(storedContent.toString("utf8")).toBe("public record body");
    expect(streamEvents).toHaveLength(1);
    expect(streamEvents[0]).toEqual(event);
    expect(event).toMatchObject({
      type: "evidence.ingested",
      version: 1,
      streamId: "evidence_ev_service_001",
      sequence: 1,
      context: {
        actor: { id: "actor_reviewer", kind: "human", label: "Reviewer" },
        correlationId: "corr_ev_service_001",
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0" }
      },
      payload: {
        evidenceId: "ev_service_001",
        source: { kind: "file", label: "record.txt", uri: "file:///records/record.txt" },
        mediaType: "text/plain",
        sizeBytes: content.byteLength
      }
    });
    expect(event.context.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(event.payload.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("prepares an evidence-backed assertion proposal without accepting graph truth", async () => {
    const ledger = new InMemoryEventLedger();
    await seedEvents(ledger, [...goldenIngestionLedgerEvents, evidenceIngestedEvent()]);
    const service = new EvidenceReviewService({
      ledger,
      now: () => "2026-07-05T12:08:00.000Z"
    });

    const input = {
      assertionId: "as_evidence_candidate_001",
      evidenceId: "ev_ing_001",
      subjectRef: "ent_agency_001",
      predicate: "agency.name",
      object: "Example Agency",
      confidence: 0.82,
      actor: { id: "actor_reviewer", kind: "human" as const, label: "Reviewer" }
    };
    const result = await service.prepareAssertionCandidate(input);
    const replay = await service.prepareAssertionCandidate(input);
    const events = await ledger.readAll();

    expect(result).toMatchObject({
      assertionId: "as_evidence_candidate_001",
      evidenceReferences: [{
        evidenceId: "ev_ing_001",
        contentHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111"
      }],
      reviewState: "proposed",
      reviewRequired: true,
      event: {
        type: "assertion.proposed",
        payload: {
          assertionId: "as_evidence_candidate_001",
          evidenceId: "ev_ing_001",
          reviewState: "proposed"
        }
      }
    });
    expect(replay.event.id).toBe(result.event.id);
    expect(events.filter((event) => event.type === "assertion.proposed")).toHaveLength(1);

    await expect(service.prepareAssertionCandidate({
      ...input,
      object: "Different Agency"
    })).rejects.toThrow(/already exists with different proposal content/);
  });

  it("fails closed before proposing from quarantined or provenance-incomplete evidence", async () => {
    const quarantinedLedger = new InMemoryEventLedger();
    await seedEvents(quarantinedLedger, [
      ...goldenIngestionLedgerEvents,
      evidenceIngestedEvent(),
      quarantinedEvent()
    ]);
    const quarantinedService = new EvidenceReviewService({ ledger: quarantinedLedger });
    const input = {
      assertionId: "as_evidence_candidate_blocked",
      evidenceId: "ev_ing_001",
      predicate: "agency.name",
      object: "Example Agency",
      confidence: 0.82,
      actor: { id: "actor_reviewer", kind: "human" as const, label: "Reviewer" }
    };

    await expect(quarantinedService.prepareAssertionCandidate(input)).rejects.toThrow(/Quarantined evidence/);
    expect((await quarantinedLedger.readAll()).some((event) => event.type === "assertion.proposed")).toBe(false);

    const incompleteLedger = new InMemoryEventLedger();
    await seedEvents(incompleteLedger, [evidenceIngestedEvent()]);
    const incompleteService = new EvidenceReviewService({ ledger: incompleteLedger });
    await expect(incompleteService.prepareAssertionCandidate(input)).rejects.toThrow(/occurrence lineage is missing/);
    expect((await incompleteLedger.readAll()).some((event) => event.type === "assertion.proposed")).toBe(false);
  });

  it("requires human import approval for the exact completed scan before proposing", async () => {
    const ledger = new InMemoryEventLedger();
    const wrongScanEvents = goldenIngestionLedgerEvents.map((event) =>
      event.type === "ingestion.import.approved"
        ? { ...event, payload: { ...event.payload, scanBatchId: "scan_wrong" } }
        : event
    );
    await seedEvents(ledger, [...wrongScanEvents, evidenceIngestedEvent()]);
    const before = await ledger.readAll();

    await expect(new EvidenceReviewService({ ledger }).prepareAssertionCandidate({
      assertionId: "as_wrong_scan_candidate",
      evidenceId: "ev_ing_001",
      predicate: "agency.name",
      object: "Example Agency",
      confidence: 0.82,
      actor: { id: "actor_reviewer", kind: "human", label: "Reviewer" }
    })).rejects.toThrow(/Human import approval provenance is missing/);
    expect(await ledger.readAll()).toEqual(before);
  });

  it("rejects credential-shaped proposal material at the durable service boundary", async () => {
    const ledger = new InMemoryEventLedger();
    await seedEvents(ledger, [...goldenIngestionLedgerEvents, evidenceIngestedEvent()]);
    const before = await ledger.readAll();

    await expect(new EvidenceReviewService({ ledger }).prepareAssertionCandidate({
      assertionId: "as_credential_candidate",
      evidenceId: "ev_ing_001",
      predicate: "agency.name",
      object: "access_token=super-sensitive-value-123",
      confidence: 0.82,
      actor: { id: "actor_reviewer", kind: "human", label: "Reviewer" }
    })).rejects.toThrow(/credential-shaped/i);
    expect(await ledger.readAll()).toEqual(before);
  });
});

async function seedEvents(ledger: InMemoryEventLedger, events: readonly KnowledgeEvent[]): Promise<void> {
  for (const event of events) {
    const { id: _id, sequence: _sequence, ...appendable } = event;
    await ledger.append(appendable as AppendableKnowledgeEvent);
  }
}

function evidenceIngestedEvent(): KnowledgeEvent {
  return {
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
}

function quarantinedEvent(): KnowledgeEvent {
  return {
    id: "evt_ing_evidence_quarantined",
    type: "evidence.quarantined",
    version: 1,
    streamId: "evidence_ev_ing_001",
    sequence: 2,
    context: {
      actor: { id: "actor_investigator", kind: "human", label: "Investigator" },
      occurredAt: "2026-07-05T12:06:00.000Z",
      causationId: "evt_ing_evidence_ingested",
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
}
