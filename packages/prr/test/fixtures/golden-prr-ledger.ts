import type { KnowledgeEvent } from "../../../ontology/src/contracts.js";

const contextBase = {
  actor: { id: "actor_prr_test", kind: "human", label: "PRR Test Requester" },
  correlationId: "corr_prr_req_001",
  coreVersion: "0.1.0",
  packVersions: { core: "0.1.0", "us-federal-foia": "0.1.0" }
} as const;

const bodyHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

export const goldenPrrLedgerEvents: KnowledgeEvent[] = [
  {
    id: "evt_prr_req_001_created",
    type: "prr.request.created",
    version: 1,
    streamId: "prr_req_001",
    sequence: 1,
    context: {
      ...contextBase,
      occurredAt: "2026-07-01T12:00:00.000Z"
    },
    payload: {
      prrRequestId: "prr_req_001",
      jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
      agency: { name: "Example Agency", email: "foia@example.gov" },
      requester: { name: "Example Requester", email: "requester@example.org" },
      requestText: "Please provide records concerning public meeting notices.",
      status: "draft"
    }
  },
  {
    id: "evt_prr_req_001_sent",
    type: "prr.request.sent",
    version: 1,
    streamId: "prr_req_001",
    sequence: 2,
    context: {
      ...contextBase,
      occurredAt: "2026-07-01T12:05:00.000Z",
      causationId: "evt_prr_req_001_created"
    },
    payload: {
      prrRequestId: "prr_req_001",
      correspondenceId: "corr_prr_req_001_sent",
      provider: "gmail",
      providerMessageId: "provider-message-001",
      subject: "FOIA request for public meeting notices",
      bodyHash,
      sentAt: "2026-07-01T12:05:00.000Z",
      approvedBy: "actor_prr_test"
    }
  },
  {
    id: "evt_prr_req_001_deadline_estimated",
    type: "prr.deadline.estimated",
    version: 1,
    streamId: "prr_req_001",
    sequence: 3,
    context: {
      ...contextBase,
      occurredAt: "2026-07-01T12:06:00.000Z",
      causationId: "evt_prr_req_001_sent"
    },
    payload: {
      prrRequestId: "prr_req_001",
      deadlineDate: "2026-07-30",
      confidence: "statutory",
      explanation: "Federal FOIA requires a determination within 20 working days.",
      citedRules: [
        {
          jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
          label: "FOIA determination deadline",
          citation: "5 U.S.C. 552(a)(6)(A)(i)"
        }
      ]
    }
  },
  {
    id: "evt_prr_req_001_correspondence_received",
    type: "prr.correspondence.received",
    version: 1,
    streamId: "prr_req_001",
    sequence: 4,
    context: {
      ...contextBase,
      occurredAt: "2026-07-02T14:00:00.000Z",
      causationId: "evt_prr_req_001_sent"
    },
    payload: {
      prrRequestId: "prr_req_001",
      correspondenceId: "corr_prr_req_001_ack",
      provider: "gmail",
      providerMessageId: "provider-message-ack-001",
      providerThreadId: "provider-thread-001",
      subject: "Re: FOIA request for public meeting notices",
      from: { name: "Example Agency FOIA Office", email: "foia@example.gov" },
      receivedAt: "2026-07-02T14:00:00.000Z",
      bodyHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      evidenceIds: ["ev_prr_correspondence_001"]
    }
  },
  {
    id: "evt_prr_req_001_production_received",
    type: "prr.production.received",
    version: 1,
    streamId: "prr_req_001",
    sequence: 5,
    context: {
      ...contextBase,
      occurredAt: "2026-07-15T16:00:00.000Z",
      causationId: "evt_prr_req_001_correspondence_received"
    },
    payload: {
      prrRequestId: "prr_req_001",
      productionId: "prod_prr_req_001",
      label: "Initial production",
      receivedAt: "2026-07-15T16:00:00.000Z",
      evidenceIds: ["ev_prr_production_001", "ev_prr_production_002"]
    }
  }
];
