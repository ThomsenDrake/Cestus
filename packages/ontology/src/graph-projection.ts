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

export interface ProjectedRelationship {
  relationshipId: string;
  fromEntityId: string;
  toEntityId: string;
  relationshipType: string;
  assertionIds: string[];
  reviewState: "accepted";
  acceptedByEventId: string;
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
  relationships: Map<string, ProjectedRelationship>;
  provenanceForAssertion(assertionId: string): AssertionProvenance | undefined;
}

export function buildGraphProjection(events: readonly KnowledgeEvent[]): GraphProjection {
  const proposedAssertions = new Map<string, ProjectedAssertion>();
  const assertions = new Map<string, ProjectedAssertion>();
  const entities = new Map<string, ProjectedEntity>();
  const relationships = new Map<string, ProjectedRelationship>();
  const entityCandidates: ProjectedEntity[] = [];
  const relationshipCandidates: ProjectedRelationship[] = [];

  for (const event of events) {
    switch (event.type) {
      case "assertion.proposed":
        assertions.delete(event.payload.assertionId);
        proposedAssertions.set(event.payload.assertionId, {
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
        const assertion = proposedAssertions.get(event.payload.assertionId);
        if (assertion && event.context.causationId === assertion.proposedByEventId) {
          assertions.set(event.payload.assertionId, {
            ...assertion,
            reviewState: "accepted",
            acceptedByEventId: event.id
          });
        }
        break;
      }

      case "entity.resolved":
        entityCandidates.push({
          entityId: event.payload.entityId,
          canonicalLabel: event.payload.canonicalLabel,
          entityType: event.payload.entityType,
          assertionIds: [...event.payload.assertionIds]
        });
        break;

      case "relationship.accepted":
        relationshipCandidates.push({
          relationshipId: event.payload.relationshipId,
          fromEntityId: event.payload.fromEntityId,
          toEntityId: event.payload.toEntityId,
          relationshipType: event.payload.relationshipType,
          assertionIds: [...event.payload.assertionIds],
          reviewState: "accepted",
          acceptedByEventId: event.id
        });
        break;

      default:
        break;
    }
  }

  for (const entity of entityCandidates) {
    const supportedByAcceptedAssertions = entity.assertionIds.every(
      (assertionId) => assertions.get(assertionId)?.reviewState === "accepted"
    );
    if (supportedByAcceptedAssertions) {
      entities.set(entity.entityId, entity);
    }
  }

  for (const relationship of relationshipCandidates) {
    const endpointsAreResolved =
      entities.has(relationship.fromEntityId) && entities.has(relationship.toEntityId);
    const supportedByAcceptedAssertions = relationship.assertionIds.every(
      (assertionId) => assertions.get(assertionId)?.reviewState === "accepted"
    );
    if (endpointsAreResolved && supportedByAcceptedAssertions) {
      relationships.set(relationship.relationshipId, relationship);
    }
  }

  return {
    assertions,
    entities,
    relationships,
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
