import type { KnowledgeEvent } from "./contracts.js";

type AssertionObject = string | number | boolean | null;

export interface ProjectedAssertion {
  assertionId: string;
  reviewState: "proposed" | "accepted";
  evidenceId: string;
  predicate: string;
  object: AssertionObject;
  confidence: number;
  proposedByEventId: string;
  acceptedByEventId?: string;
}

export interface ProjectedEntity {
  entityId: string;
  canonicalLabel: string;
  entityType: string;
  assertionIds: string[];
}

export interface AssertionProvenance {
  assertionId: string;
  evidenceId: string;
  proposedByEventId: string;
  acceptedByEventId?: string;
}

export interface GraphProjection {
  assertions: Map<string, ProjectedAssertion>;
  entities: Map<string, ProjectedEntity>;
  provenanceForAssertion(assertionId: string): AssertionProvenance | undefined;
}

export function buildGraphProjection(events: readonly KnowledgeEvent[]): GraphProjection {
  const assertions = new Map<string, ProjectedAssertion>();
  const entities = new Map<string, ProjectedEntity>();

  for (const event of events) {
    switch (event.type) {
      case "assertion.proposed":
        assertions.set(event.payload.assertionId, {
          assertionId: event.payload.assertionId,
          reviewState: "proposed",
          evidenceId: event.payload.evidenceId,
          predicate: event.payload.predicate,
          object: event.payload.object,
          confidence: event.payload.confidence,
          proposedByEventId: event.id
        });
        break;

      case "assertion.accepted": {
        const assertion = assertions.get(event.payload.assertionId);
        if (assertion) {
          assertion.reviewState = "accepted";
          assertion.acceptedByEventId = event.id;
        }
        break;
      }

      case "entity.resolved":
        entities.set(event.payload.entityId, {
          entityId: event.payload.entityId,
          canonicalLabel: event.payload.canonicalLabel,
          entityType: event.payload.entityType,
          assertionIds: [...event.payload.assertionIds]
        });
        break;

      default:
        break;
    }
  }

  return {
    assertions,
    entities,
    provenanceForAssertion(assertionId) {
      const assertion = assertions.get(assertionId);
      if (!assertion) {
        return undefined;
      }

      const provenance: AssertionProvenance = {
        assertionId: assertion.assertionId,
        evidenceId: assertion.evidenceId,
        proposedByEventId: assertion.proposedByEventId
      };
      if (assertion.acceptedByEventId) {
        provenance.acceptedByEventId = assertion.acceptedByEventId;
      }

      return provenance;
    }
  };
}
