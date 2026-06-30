import { describe, expect, it } from "vitest";
import { buildGraphProjection, validateKnowledgeEvent } from "../src/index.js";
import { goldenLedgerEvents } from "./fixtures/golden-ledger.js";

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
      entityType: "agency",
      assertionIds: ["as_agency_name"]
    });

    expect(projection.provenanceForAssertion("as_agency_name")).toEqual({
      assertionId: "as_agency_name",
      evidenceId: "ev_agency_pdf",
      proposedByEventId: "evt_propose_agency_name",
      acceptedByEventId: "evt_accept_agency_name"
    });
  });
});
