import type { KnowledgeEvent } from "../../src/contracts.js";
import { goldenLedgerEvents } from "./golden-ledger.js";

const context = {
  actor: { id: "actor_system", kind: "system", label: "Cestus ontology workspace fixture" },
  occurredAt: "2026-06-30T18:05:00.000Z",
  correlationId: "corr_golden_ontology_workspace",
  coreVersion: "0.1.0",
  packVersions: { core: "0.1.0", "public-records": "1.2.0" }
} as const;

export const goldenOntologyWorkspaceEvents: KnowledgeEvent[] = [
  ...goldenLedgerEvents,
  {
    id: "evt_ingest_contract_pdf",
    type: "evidence.ingested",
    version: 1,
    streamId: "evidence_ev_contract_pdf",
    sequence: 1,
    context,
    payload: {
      evidenceId: "ev_contract_pdf",
      source: { kind: "file", label: "example-contract.pdf", uri: "file:///fixtures/example-contract.pdf" },
      contentHash: "sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
      mediaType: "application/pdf",
      sizeBytes: 8192
    }
  },
  {
    id: "evt_propose_contract_party",
    type: "assertion.proposed",
    version: 1,
    streamId: "assertion_as_contract_party",
    sequence: 1,
    context: {
      ...context,
      actor: { id: "extractor_contract", kind: "extractor", label: "Contract extractor" },
      causationId: "evt_ingest_contract_pdf"
    },
    payload: {
      assertionId: "as_contract_party",
      evidenceId: "ev_contract_pdf",
      subjectRef: "rel_agency_signed_contract",
      predicate: "supports",
      object: "Example Agency signed Example Contract",
      confidence: 0.92,
      reviewState: "proposed"
    }
  },
  {
    id: "evt_accept_contract_party",
    type: "assertion.accepted",
    version: 1,
    streamId: "assertion_as_contract_party",
    sequence: 2,
    context: {
      ...context,
      actor: { id: "human_reviewer", kind: "human", label: "Human reviewer" },
      causationId: "evt_propose_contract_party"
    },
    payload: {
      assertionId: "as_contract_party",
      acceptedBy: "human_reviewer",
      rationale: "The signature page names the agency as a party."
    }
  },
  {
    id: "evt_resolve_example_contract",
    type: "entity.resolved",
    version: 1,
    streamId: "entity_ent_example_contract",
    sequence: 1,
    context: {
      ...context,
      actor: { id: "human_reviewer", kind: "human", label: "Human reviewer" },
      causationId: "evt_accept_contract_party"
    },
    payload: {
      entityId: "ent_example_contract",
      assertionIds: ["as_contract_party"],
      canonicalLabel: "Example Contract",
      entityType: "Contract"
    }
  },
  {
    id: "evt_accept_agency_contract_relationship",
    type: "relationship.accepted",
    version: 1,
    streamId: "relationship_rel_agency_signed_contract",
    sequence: 1,
    context: {
      ...context,
      actor: { id: "human_reviewer", kind: "human", label: "Human reviewer" },
      causationId: "evt_accept_contract_party"
    },
    payload: {
      relationshipId: "rel_agency_signed_contract",
      fromEntityId: "ent_example_agency",
      toEntityId: "ent_example_contract",
      relationshipType: "signed",
      assertionIds: ["as_contract_party"]
    }
  },
  {
    id: "evt_propose_contract_dispute",
    type: "assertion.proposed",
    version: 1,
    streamId: "assertion_as_contract_dispute",
    sequence: 1,
    context: {
      ...context,
      actor: { id: "extractor_contract", kind: "extractor", label: "Contract extractor" },
      causationId: "evt_ingest_contract_pdf"
    },
    payload: {
      assertionId: "as_contract_dispute",
      evidenceId: "ev_contract_pdf",
      subjectRef: "rel_agency_signed_contract",
      predicate: "contradicts",
      object: "A later annotation disputes the signature authority",
      confidence: 0.61,
      reviewState: "proposed"
    }
  }
];
