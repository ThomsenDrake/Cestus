import type { GraphProjection } from "./graph-projection.js";

export interface JsonLdDocument {
  "@context": {
    cestus: string;
    evidence: string;
    assertion: string;
  };
  "@graph": Array<Record<string, unknown>>;
}

export function exportGraphToJsonLd(graph: GraphProjection): JsonLdDocument {
  return {
    "@context": {
      cestus: "https://cestus.local/ontology#",
      evidence: "cestus:evidence",
      assertion: "cestus:assertion"
    },
    "@graph": [
      ...[...graph.entities.values()].map((entity) => ({
        "@id": entity.entityId,
        "@type": entity.entityType,
        "cestus:label": entity.canonicalLabel,
        "cestus:supportedBy": [...entity.assertionIds]
      })),
      ...[...graph.assertions.values()]
        .filter((assertion) => assertion.reviewState === "accepted")
        .map((assertion) => ({
          "@id": assertion.assertionId,
          "@type": "cestus:Assertion",
          "cestus:predicate": assertion.predicate,
          "cestus:object": assertion.object,
          "cestus:evidence": assertion.evidenceId,
          "cestus:reviewState": assertion.reviewState
        }))
    ]
  };
}
