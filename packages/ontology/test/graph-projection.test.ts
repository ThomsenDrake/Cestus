import { describe, expect, it } from "vitest";
import {
  buildGraphProjection,
  buildOntologyWorkspaceReadDto,
  validateKnowledgeEvent,
  type KnowledgeEvent
} from "../src/index.js";
import { goldenLedgerEvents } from "./fixtures/golden-ledger.js";
import { goldenOntologyWorkspaceEvents } from "./fixtures/golden-ontology-workspace.js";

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

  it("rebuilds accepted relationships only from accepted assertions and resolved endpoints", () => {
    expect(goldenOntologyWorkspaceEvents.every((event) => validateKnowledgeEvent(event).success)).toBe(true);

    const projection = buildGraphProjection(goldenOntologyWorkspaceEvents);

    expect(projection.relationships.get("rel_agency_signed_contract")).toEqual({
      relationshipId: "rel_agency_signed_contract",
      fromEntityId: "ent_example_agency",
      toEntityId: "ent_example_contract",
      relationshipType: "signed",
      assertionIds: ["as_contract_party"],
      reviewState: "accepted",
      acceptedByEventId: "evt_accept_agency_contract_relationship"
    });
    expect(projection.assertions.has("as_contract_dispute")).toBe(false);
  });

  it("builds a deterministic provenance DTO while keeping proposed contradictions outside accepted graph state", () => {
    const first = buildOntologyWorkspaceReadDto(goldenOntologyWorkspaceEvents);
    const replayed = buildOntologyWorkspaceReadDto(structuredClone(goldenOntologyWorkspaceEvents));

    expect(replayed).toEqual(first);
    expect(first.status).toBe("ready");
    expect(first.relationships).toEqual([
      expect.objectContaining({
        relationshipId: "rel_agency_signed_contract",
        reviewState: "accepted",
        supportingAssertionIds: ["as_contract_party"],
        contradictingAssertionIds: ["as_contract_dispute"],
        evidenceIds: ["ev_contract_pdf"],
        eventIds: expect.arrayContaining([
          "evt_accept_agency_contract_relationship",
          "evt_propose_contract_party",
          "evt_accept_contract_party",
          "evt_propose_contract_dispute",
          "evt_ingest_contract_pdf"
        ]),
        packVersions: [
          { name: "core", version: "0.1.0" },
          { name: "public-records", version: "1.2.0" }
        ]
      })
    ]);
    expect(first.assertions.find((assertion) => assertion.assertionId === "as_contract_dispute")?.reviewState)
      .toBe("proposed");
    expect(first.relationships.map((relationship) => relationship.relationshipId)).not.toContain(
      "as_contract_dispute"
    );
  });

  it("fails closed with repairable diagnostics for lag and unknown events", () => {
    const laggingCheckpoint: KnowledgeEvent = {
      id: "evt_checkpoint_lagging_ontology",
      type: "projection.checkpointed",
      version: 1,
      streamId: "projection_ontology_graph",
      sequence: 1,
      context,
      payload: {
        projectionName: "ontology-graph",
        highWaterMark: 0,
        status: "rebuilding"
      }
    };
    const lagging = buildOntologyWorkspaceReadDto([...goldenOntologyWorkspaceEvents, laggingCheckpoint]);
    const unknown = buildOntologyWorkspaceReadDto([
      ...goldenOntologyWorkspaceEvents,
      { id: "evt_unknown", type: "ontology.unknown", payload: {} }
    ]);

    expect(lagging.status).toBe("degraded");
    expect(lagging.relationships).toEqual([]);
    expect(lagging.diagnostics).toContainEqual(expect.objectContaining({ code: "projection-lag" }));
    expect(unknown.status).toBe("degraded");
    expect(unknown.entities).toEqual([]);
    expect(unknown.diagnostics).toContainEqual(expect.objectContaining({ code: "unknown-event" }));
    expect(unknown.diagnostics[0]?.repairActions.length).toBeGreaterThan(0);
  });

  it("diagnoses missing accepted provenance without promoting proposed material", () => {
    const validPrematureResolution = proposedOnlyEvents.map((event): KnowledgeEvent =>
      event.type === "entity.resolved"
        ? {
            ...event,
            context: {
              ...event.context,
              actor: { id: "human_reviewer", kind: "human", label: "Human reviewer" }
            }
          }
        : event
    );
    const workspace = buildOntologyWorkspaceReadDto(validPrematureResolution);

    expect(workspace.status).toBe("degraded");
    expect(workspace.entities).toEqual([]);
    expect(workspace.relationships).toEqual([]);
    expect(workspace.assertions).toEqual([
      expect.objectContaining({ assertionId: "as_unreviewed_name", reviewState: "proposed" })
    ]);
    expect(workspace.diagnostics).toContainEqual(expect.objectContaining({ code: "missing-provenance" }));
  });

  it("does not let a later proposal reuse an older acceptance for the same assertion ID", () => {
    const repeatedProposalEvents: KnowledgeEvent[] = [
      ...goldenOntologyWorkspaceEvents,
      {
        id: "evt_ingest_contract_revision",
        type: "evidence.ingested",
        version: 1,
        streamId: "evidence_ev_contract_revision",
        sequence: 1,
        context: {
          ...context,
          packVersions: { core: "0.1.0", "public-records": "1.3.0" }
        },
        payload: {
          evidenceId: "ev_contract_revision",
          source: { kind: "file", label: "contract-revision.pdf" },
          contentHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          mediaType: "application/pdf",
          sizeBytes: 512
        }
      },
      {
        id: "evt_repropose_contract_party",
        type: "assertion.proposed",
        version: 1,
        streamId: "assertion_as_contract_party",
        sequence: 3,
        context: {
          ...context,
          actor: { id: "extractor_contract", kind: "extractor", label: "Contract extractor" },
          causationId: "evt_ingest_contract_revision",
          packVersions: { core: "0.1.0", "public-records": "1.3.0" }
        },
        payload: {
          assertionId: "as_contract_party",
          evidenceId: "ev_contract_revision",
          subjectRef: "rel_agency_signed_contract",
          predicate: "supports",
          object: "A revised record requires fresh review",
          confidence: 0.74,
          reviewState: "proposed"
        }
      }
    ];

    const workspace = buildOntologyWorkspaceReadDto(repeatedProposalEvents);
    const assertion = workspace.assertions.find((item) => item.assertionId === "as_contract_party");

    expect(assertion).toMatchObject({
      reviewState: "proposed",
      evidenceId: "ev_contract_revision",
      eventIds: ["evt_ingest_contract_revision", "evt_repropose_contract_party"]
    });
    expect(assertion?.eventIds).not.toContain("evt_accept_contract_party");
    expect(workspace.relationships).toEqual([]);
    expect(workspace.diagnostics).toContainEqual(expect.objectContaining({ code: "missing-provenance" }));
  });

  it("merges every governed pack version used by relationship provenance", () => {
    const mixedPackEvents = goldenOntologyWorkspaceEvents.map((event): KnowledgeEvent =>
      event.id === "evt_propose_contract_dispute"
        ? {
            ...event,
            context: {
              ...event.context,
              packVersions: {
                ...event.context.packVersions,
                "public-records": "1.3.0",
                "records-annotations": "2.0.0"
              }
            }
          }
        : event
    );

    const relationship = buildOntologyWorkspaceReadDto(mixedPackEvents).relationships[0];

    expect(relationship?.packVersions).toEqual([
      { name: "core", version: "0.1.0" },
      { name: "public-records", version: "1.2.0" },
      { name: "public-records", version: "1.3.0" },
      { name: "records-annotations", version: "2.0.0" }
    ]);
  });

  it("emits one deterministic row per repeated entity and relationship stable ID", () => {
    const repeatedGraphEvents: KnowledgeEvent[] = [
      ...goldenOntologyWorkspaceEvents,
      {
        id: "evt_reresolve_example_agency",
        type: "entity.resolved",
        version: 1,
        streamId: "entity_ent_example_agency",
        sequence: 2,
        context: {
          ...context,
          actor: { id: "human_reviewer", kind: "human", label: "Human reviewer" },
          causationId: "evt_accept_agency_name",
          packVersions: { core: "0.1.0", "public-records": "1.4.0" }
        },
        payload: {
          entityId: "ent_example_agency",
          assertionIds: ["as_agency_name"],
          canonicalLabel: "Example Agency (reviewed)",
          entityType: "GovernmentAgency"
        }
      },
      {
        id: "evt_reaccept_agency_contract_relationship",
        type: "relationship.accepted",
        version: 1,
        streamId: "relationship_rel_agency_signed_contract",
        sequence: 2,
        context: {
          ...context,
          actor: { id: "human_reviewer", kind: "human", label: "Human reviewer" },
          causationId: "evt_accept_contract_party",
          packVersions: { core: "0.1.0", "public-records": "1.4.0" }
        },
        payload: {
          relationshipId: "rel_agency_signed_contract",
          fromEntityId: "ent_example_agency",
          toEntityId: "ent_example_contract",
          relationshipType: "executed",
          assertionIds: ["as_contract_party"]
        }
      }
    ];

    const workspace = buildOntologyWorkspaceReadDto(repeatedGraphEvents);
    const replayed = buildOntologyWorkspaceReadDto(structuredClone(repeatedGraphEvents));
    const entities = workspace.entities.filter((entity) => entity.entityId === "ent_example_agency");
    const relationships = workspace.relationships.filter(
      (relationship) => relationship.relationshipId === "rel_agency_signed_contract"
    );

    expect(replayed).toEqual(workspace);
    expect(entities).toHaveLength(1);
    expect(entities[0]).toMatchObject({ canonicalLabel: "Example Agency (reviewed)" });
    expect(entities[0]?.eventIds).toContain("evt_reresolve_example_agency");
    expect(entities[0]?.eventIds).not.toContain("evt_resolve_example_agency");
    expect(relationships).toHaveLength(1);
    expect(relationships[0]).toMatchObject({ relationshipType: "executed" });
    expect(relationships[0]?.eventIds).toContain("evt_reaccept_agency_contract_relationship");
    expect(relationships[0]?.eventIds).not.toContain("evt_accept_agency_contract_relationship");
  });
});
