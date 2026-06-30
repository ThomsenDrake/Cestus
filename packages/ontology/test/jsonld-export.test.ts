import { describe, expect, it } from "vitest";
import { buildGraphProjection } from "../src/graph-projection.js";
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
});
