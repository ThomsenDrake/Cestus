import { describe, expect, it } from "vitest";
import { buildGraphProjection, validateKnowledgeEvent, type KnowledgeEvent } from "../src/index.js";
import { goldenLedgerEvents } from "./fixtures/golden-ledger.js";

const context = {
  actor: { id: "actor_system", kind: "system" as const, label: "fixture" },
  occurredAt: "2026-06-30T18:00:00.000Z",
  correlationId: "corr_projection_review",
  coreVersion: "0.1.0",
  packVersions: { core: "0.1.0" }
};

const proposedOnlyEvents: KnowledgeEvent[] = [
  {
    id: "evt_ingest_unreviewed_pdf",
    type: "evidence.ingested",
    version: 1,
    streamId: "evidence_ev_unreviewed_pdf",
    sequence: 1,
    context,
    payload: {
      evidenceId: "ev_unreviewed_pdf",
      source: { kind: "file", label: "unreviewed.pdf" },
      contentHash: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      mediaType: "application/pdf",
      sizeBytes: 256
    }
  },
  {
    id: "evt_propose_unreviewed_name",
    type: "assertion.proposed",
    version: 1,
    streamId: "assertion_as_unreviewed_name",
    sequence: 1,
    context: { ...context, causationId: "evt_ingest_unreviewed_pdf" },
    payload: {
      assertionId: "as_unreviewed_name",
      evidenceId: "ev_unreviewed_pdf",
      predicate: "agency.name",
      object: "Unreviewed Agency",
      confidence: 0.7,
      reviewState: "proposed"
    }
  },
  {
    id: "evt_resolve_unreviewed_agency",
    type: "entity.resolved",
    version: 1,
    streamId: "entity_ent_unreviewed_agency",
    sequence: 1,
    context: { ...context, causationId: "evt_propose_unreviewed_name" },
    payload: {
      entityId: "ent_unreviewed_agency",
      assertionIds: ["as_unreviewed_name"],
      canonicalLabel: "Unreviewed Agency",
      entityType: "GovernmentAgency"
    }
  }
];

describe("graph projection", () => {
  it("rebuilds accepted assertions, resolved entities, and assertion provenance from ledger events", () => {
    expect(goldenLedgerEvents.every((event) => validateKnowledgeEvent(event).success)).toBe(true);

    const projection = buildGraphProjection(goldenLedgerEvents);

    expect(projection.assertions.get("as_agency_name")).toEqual({
      assertionId: "as_agency_name",
      reviewState: "accepted",
      evidenceId: "ev_agency_pdf",
      predicate: "agency.name",
      object: "Example Agency",
      confidence: 0.94,
      proposedByEventId: "evt_propose_agency_name",
      acceptedByEventId: "evt_accept_agency_name"
    });

    expect(projection.entities.get("ent_example_agency")).toEqual({
      entityId: "ent_example_agency",
      canonicalLabel: "Example Agency",
      entityType: "GovernmentAgency",
      assertionIds: ["as_agency_name"]
    });

    expect(projection.provenanceForAssertion("as_agency_name")).toEqual({
      assertionId: "as_agency_name",
      evidenceId: "ev_agency_pdf",
      proposedByEventId: "evt_propose_agency_name",
      acceptedByEventId: "evt_accept_agency_name"
    });
  });

  it("does not expose proposed-only assertions or entities supported by unaccepted assertions", () => {
    const projection = buildGraphProjection(proposedOnlyEvents);

    expect(projection.assertions.has("as_unreviewed_name")).toBe(false);
    expect(projection.entities.has("ent_unreviewed_agency")).toBe(false);
    expect(projection.provenanceForAssertion("as_unreviewed_name")).toBeUndefined();
  });
});
