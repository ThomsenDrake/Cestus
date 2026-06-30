import type { KnowledgeEvent } from "../../src/contracts.js";

const baseContext = {
  actor: { id: "actor_system", kind: "system", label: "Cestus test fixture" },
  occurredAt: "2026-06-30T18:00:00.000Z",
  correlationId: "corr_golden_ledger",
  coreVersion: "0.1.0",
  packVersions: { core: "0.1.0" }
} as const;

export const goldenLedgerEvents: KnowledgeEvent[] = [
  {
    id: "evt_ingest_agency_pdf",
    type: "evidence.ingested",
    version: 1,
    streamId: "evidence_ev_agency_pdf",
    sequence: 1,
    context: baseContext,
    payload: {
      evidenceId: "ev_agency_pdf",
      source: { kind: "file", label: "example-agency.pdf", uri: "file:///fixtures/example-agency.pdf" },
      contentHash: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      mediaType: "application/pdf",
      sizeBytes: 4096
    }
  },
  {
    id: "evt_propose_agency_name",
    type: "assertion.proposed",
    version: 1,
    streamId: "assertion_as_agency_name",
    sequence: 2,
    context: {
      ...baseContext,
      actor: { id: "extractor_pdf", kind: "extractor", label: "PDF text extractor" },
      causationId: "evt_ingest_agency_pdf"
    },
    payload: {
      assertionId: "as_agency_name",
      evidenceId: "ev_agency_pdf",
      predicate: "agency.name",
      object: "Example Agency",
      confidence: 0.94,
      reviewState: "proposed"
    }
  },
  {
    id: "evt_accept_agency_name",
    type: "assertion.accepted",
    version: 1,
    streamId: "assertion_as_agency_name",
    sequence: 3,
    context: {
      ...baseContext,
      actor: { id: "human_reviewer", kind: "human", label: "Human reviewer" },
      causationId: "evt_propose_agency_name"
    },
    payload: {
      assertionId: "as_agency_name",
      acceptedBy: "human_reviewer",
      rationale: "The agency name appears on the first page of the source PDF."
    }
  },
  {
    id: "evt_resolve_example_agency",
    type: "entity.resolved",
    version: 1,
    streamId: "entity_ent_example_agency",
    sequence: 4,
    context: {
      ...baseContext,
      actor: { id: "human_reviewer", kind: "human", label: "Human reviewer" },
      causationId: "evt_accept_agency_name"
    },
    payload: {
      entityId: "ent_example_agency",
      assertionIds: ["as_agency_name"],
      canonicalLabel: "Example Agency",
      entityType: "agency"
    }
  }
];
