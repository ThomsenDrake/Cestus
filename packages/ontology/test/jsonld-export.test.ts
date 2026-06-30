import { describe, expect, it } from "vitest";
import { buildGraphProjection, type GraphProjection } from "../src/graph-projection.js";
import { exportGraphToJsonLd } from "../src/jsonld-export.js";
import { goldenLedgerEvents } from "./fixtures/golden-ledger.js";

describe("exportGraphToJsonLd", () => {
  it("exports accepted graph state with provenance references", () => {
    const graph = buildGraphProjection(goldenLedgerEvents);
    const jsonld = exportGraphToJsonLd(graph);

    expect(jsonld["@context"]).toEqual({
      cestus: "https://cestus.local/ontology#",
      evidence: "cestus:evidence",
      assertion: "cestus:assertion"
    });
    expect(jsonld["@graph"]).toContainEqual({
      "@id": "ent_example_agency",
      "@type": "GovernmentAgency",
      "cestus:label": "Example Agency",
      "cestus:supportedBy": ["as_agency_name"]
    });
    expect(jsonld["@graph"]).toContainEqual({
      "@id": "as_agency_name",
      "@type": "cestus:Assertion",
      "cestus:predicate": "agency.name",
      "cestus:object": "Example Agency",
      "cestus:evidence": "ev_agency_pdf",
      "cestus:reviewState": "accepted"
    });
  });

  it("does not export proposed assertions as shared graph state", () => {
    const graph: GraphProjection = {
      assertions: new Map([
        [
          "as_unreviewed_name",
          {
            assertionId: "as_unreviewed_name",
            reviewState: "proposed",
            evidenceId: "ev_unreviewed_pdf",
            predicate: "agency.name",
            object: "Unreviewed Agency",
            confidence: 0.7,
            proposedByEventId: "evt_propose_unreviewed_name"
          }
        ]
      ]),
      entities: new Map(),
      provenanceForAssertion: () => undefined
    };

    const jsonld = exportGraphToJsonLd(graph);

    expect(jsonld["@graph"]).not.toContainEqual(
      expect.objectContaining({
        "@id": "as_unreviewed_name"
      })
    );
  });
});
