import type { KnowledgeEvent } from "../../ontology/src/contracts.js";

const contextBase = {
  actor: { id: "actor_prr_test", kind: "human", label: "PRR Test Requester" },
  correlationId: "corr_golden_prr_workspace",
  coreVersion: "0.1.0",
  packVersions: {
    core: "0.1.0",
    "us-federal-foia": "0.1.0",
    "florida-public-records": "0.1.0"
  }
} as const;

const bodyHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const replyHash = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const feeHash = "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
const appealHash = "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";

const federalRule = {
  jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
  label: "FOIA determination deadline",
  citation: "5 U.S.C. 552(a)(6)(A)(i)"
} as const;

const floridaPromptAccessRule = {
  jurisdictionPack: { name: "florida-public-records", version: "0.1.0" },
  label: "Florida prompt access",
  citation: "Fla. Stat. sec. 119.07(1)(a)"
} as const;

const floridaFeeRule = {
  jurisdictionPack: { name: "florida-public-records", version: "0.1.0" },
  label: "Florida fee limitation",
  citation: "Fla. Stat. sec. 119.07(4)"
} as const;

export const prrWorkspaceSeedEvents: KnowledgeEvent[] = [
  {
    id: "evt_prr_req_001_created",
    type: "prr.request.created",
    version: 1,
    streamId: "prr_req_001",
    sequence: 1,
    context: {
      ...contextBase,
      occurredAt: "2026-07-01T12:00:00.000Z",
      correlationId: "corr_prr_req_001"
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
      correlationId: "corr_prr_req_001",
      causationId: "evt_prr_req_001_created"
    },
    payload: {
      prrRequestId: "prr_req_001",
      correspondenceId: "corr_prr_req_001_sent",
      provider: "gmail",
      providerMessageId: "provider-message-001",
      providerThreadId: "provider-thread-001",
      idempotencyKey: "send_prr_req_001_corr_prr_req_001_sent",
      subject: "FOIA request for public meeting notices",
      bodyHash,
      attachmentEvidenceIds: [],
      sentAt: "2026-07-01T12:05:00.000Z",
      approvedBy: "actor_prr_test",
      rawMetadata: {
        accountEmail: "requester@example.org",
        provider: "gmail"
      }
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
      correlationId: "corr_prr_req_001",
      causationId: "evt_prr_req_001_sent"
    },
    payload: {
      prrRequestId: "prr_req_001",
      deadlineDate: "2026-07-30",
      confidence: "statutory",
      explanation: "Federal FOIA requires a determination within 20 working days.",
      citedRules: [federalRule]
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
      correlationId: "corr_prr_req_001",
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
      bodyHash: replyHash,
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
      correlationId: "corr_prr_req_001",
      causationId: "evt_prr_req_001_correspondence_received"
    },
    payload: {
      prrRequestId: "prr_req_001",
      productionId: "prod_prr_req_001",
      label: "Initial production",
      receivedAt: "2026-07-15T16:00:00.000Z",
      evidenceIds: ["ev_prr_production_001", "ev_prr_production_002"]
    }
  },
  {
    id: "evt_prr_draft_city_budget_created",
    type: "prr.request.created",
    version: 1,
    streamId: "prr_draft_city_budget",
    sequence: 1,
    context: {
      ...contextBase,
      occurredAt: "2026-07-03T13:00:00.000Z",
      correlationId: "corr_prr_draft_city_budget"
    },
    payload: {
      prrRequestId: "prr_draft_city_budget",
      jurisdictionPack: { name: "florida-public-records", version: "0.1.0" },
      agency: { name: "City Budget Office", email: "records@city.example.gov" },
      requester: { name: "Investigator", email: "investigator@example.org" },
      requestText: "Draft request for city budget workpapers and department submissions.",
      status: "draft"
    }
  },
  {
    id: "evt_prr_draft_city_budget_deadline_estimated",
    type: "prr.deadline.estimated",
    version: 1,
    streamId: "prr_draft_city_budget",
    sequence: 2,
    context: {
      ...contextBase,
      occurredAt: "2026-07-03T13:01:00.000Z",
      correlationId: "corr_prr_draft_city_budget",
      causationId: "evt_prr_draft_city_budget_created"
    },
    payload: {
      prrRequestId: "prr_draft_city_budget",
      deadlineDate: "2026-07-10",
      confidence: "workflow",
      explanation: "Florida public records workflow estimate for prompt access review.",
      citedRules: [floridaPromptAccessRule]
    }
  },
  {
    id: "evt_prr_sent_police_logs_created",
    type: "prr.request.created",
    version: 1,
    streamId: "prr_sent_police_logs",
    sequence: 1,
    context: {
      ...contextBase,
      occurredAt: "2026-07-01T15:00:00.000Z",
      correlationId: "corr_prr_sent_police_logs"
    },
    payload: {
      prrRequestId: "prr_sent_police_logs",
      jurisdictionPack: { name: "florida-public-records", version: "0.1.0" },
      agency: { name: "Police Records Unit", email: "records@police.example.gov" },
      requester: { name: "Investigator", email: "investigator@example.org" },
      requestText: "Please provide incident logs for the downtown district for June 2026.",
      status: "draft"
    }
  },
  {
    id: "evt_prr_sent_police_logs_sent",
    type: "prr.request.sent",
    version: 1,
    streamId: "prr_sent_police_logs",
    sequence: 2,
    context: {
      ...contextBase,
      occurredAt: "2026-07-01T15:10:00.000Z",
      correlationId: "corr_prr_sent_police_logs",
      causationId: "evt_prr_sent_police_logs_created"
    },
    payload: {
      prrRequestId: "prr_sent_police_logs",
      correspondenceId: "corr_prr_sent_police_logs_sent",
      provider: "gmail",
      providerMessageId: "provider-message-police-logs",
      providerThreadId: "provider-thread-police-logs",
      idempotencyKey: "send_prr_sent_police_logs",
      subject: "Public records request for police incident logs",
      bodyHash,
      attachmentEvidenceIds: ["ev_police_logs_request_pdf"],
      sentAt: "2026-07-01T15:10:00.000Z",
      approvedBy: "investigator@example.org",
      rawMetadata: {
        accountEmail: "investigator@example.org",
        provider: "gmail"
      }
    }
  },
  {
    id: "evt_prr_ack_florida_records_created",
    type: "prr.request.created",
    version: 1,
    streamId: "prr_ack_florida_records",
    sequence: 1,
    context: {
      ...contextBase,
      occurredAt: "2026-07-01T16:00:00.000Z",
      correlationId: "corr_prr_ack_florida_records"
    },
    payload: {
      prrRequestId: "prr_ack_florida_records",
      jurisdictionPack: { name: "florida-public-records", version: "0.1.0" },
      agency: { name: "County Records Office", email: "records@county.example.gov" },
      requester: { name: "Investigator", email: "investigator@example.org" },
      requestText: "Please provide county commission calendar records for May 2026.",
      status: "draft"
    }
  },
  {
    id: "evt_prr_ack_florida_records_sent",
    type: "prr.request.sent",
    version: 1,
    streamId: "prr_ack_florida_records",
    sequence: 2,
    context: {
      ...contextBase,
      occurredAt: "2026-07-01T16:05:00.000Z",
      correlationId: "corr_prr_ack_florida_records",
      causationId: "evt_prr_ack_florida_records_created"
    },
    payload: {
      prrRequestId: "prr_ack_florida_records",
      correspondenceId: "corr_prr_ack_florida_records_sent",
      provider: "gmail",
      providerMessageId: "provider-message-florida-sent",
      providerThreadId: "provider-thread-florida",
      idempotencyKey: "send_prr_ack_florida_records",
      subject: "Public records request for commission calendar records",
      bodyHash,
      attachmentEvidenceIds: [],
      sentAt: "2026-07-01T16:05:00.000Z",
      approvedBy: "investigator@example.org",
      rawMetadata: {
        accountEmail: "investigator@example.org",
        provider: "gmail"
      }
    }
  },
  {
    id: "evt_prr_ack_florida_records_received",
    type: "prr.correspondence.received",
    version: 1,
    streamId: "prr_ack_florida_records",
    sequence: 3,
    context: {
      ...contextBase,
      occurredAt: "2026-07-02T10:00:00.000Z",
      correlationId: "corr_prr_ack_florida_records",
      causationId: "evt_prr_ack_florida_records_sent"
    },
    payload: {
      prrRequestId: "prr_ack_florida_records",
      correspondenceId: "corr_prr_ack_florida_records_ack",
      provider: "gmail",
      providerMessageId: "provider-message-florida-ack",
      providerThreadId: "provider-thread-florida",
      subject: "Re: Public records request for commission calendar records",
      from: { name: "County Records Office", email: "records@county.example.gov" },
      receivedAt: "2026-07-02T10:00:00.000Z",
      bodyHash: replyHash,
      evidenceIds: ["ev_ack_florida_records"]
    }
  },
  {
    id: "evt_prr_fee_building_permits_created",
    type: "prr.request.created",
    version: 1,
    streamId: "prr_fee_building_permits",
    sequence: 1,
    context: {
      ...contextBase,
      occurredAt: "2026-07-01T17:00:00.000Z",
      correlationId: "corr_prr_fee_building_permits"
    },
    payload: {
      prrRequestId: "prr_fee_building_permits",
      jurisdictionPack: { name: "florida-public-records", version: "0.1.0" },
      agency: { name: "Building Services Department", email: "permits@example.gov" },
      requester: { name: "Investigator", email: "investigator@example.org" },
      requestText: "Please provide building permit inspection records for the riverfront project.",
      status: "draft"
    }
  },
  {
    id: "evt_prr_fee_building_permits_fee_estimated",
    type: "prr.fee.estimated",
    version: 1,
    streamId: "prr_fee_building_permits",
    sequence: 2,
    context: {
      ...contextBase,
      occurredAt: "2026-07-02T17:00:00.000Z",
      correlationId: "corr_prr_fee_building_permits",
      causationId: "evt_prr_fee_building_permits_created"
    },
    payload: {
      prrRequestId: "prr_fee_building_permits",
      amountCents: 185000,
      currency: "USD",
      sourceEvidenceId: "ev_fee_building_permits"
    }
  },
  {
    id: "evt_prr_fee_building_permits_fee_challenged",
    type: "prr.fee.challenged",
    version: 1,
    streamId: "prr_fee_building_permits",
    sequence: 3,
    context: {
      ...contextBase,
      occurredAt: "2026-07-03T17:00:00.000Z",
      correlationId: "corr_prr_fee_building_permits",
      causationId: "evt_prr_fee_building_permits_fee_estimated"
    },
    payload: {
      prrRequestId: "prr_fee_building_permits",
      feeChallengeId: "fee_challenge_building_permits",
      amountCents: 185000,
      rationale: "The estimate appears to include review time not permitted for inspection-only copies.",
      approvedBy: "investigator@example.org",
      citedRules: [floridaFeeRule]
    }
  },
  {
    id: "evt_prr_scope_vendor_contracts_created",
    type: "prr.request.created",
    version: 1,
    streamId: "prr_scope_vendor_contracts",
    sequence: 1,
    context: {
      ...contextBase,
      occurredAt: "2026-07-01T18:00:00.000Z",
      correlationId: "corr_prr_scope_vendor_contracts"
    },
    payload: {
      prrRequestId: "prr_scope_vendor_contracts",
      jurisdictionPack: { name: "florida-public-records", version: "0.1.0" },
      agency: { name: "Procurement Department", email: "procurement@example.gov" },
      requester: { name: "Investigator", email: "investigator@example.org" },
      requestText: "Please provide active vendor contracts for technology services.",
      status: "draft"
    }
  },
  {
    id: "evt_prr_scope_vendor_contracts_proposed",
    type: "prr.scope.narrowing.proposed",
    version: 1,
    streamId: "prr_scope_vendor_contracts",
    sequence: 2,
    context: {
      ...contextBase,
      occurredAt: "2026-07-02T18:00:00.000Z",
      correlationId: "corr_prr_scope_vendor_contracts",
      causationId: "evt_prr_scope_vendor_contracts_created"
    },
    payload: {
      prrRequestId: "prr_scope_vendor_contracts",
      narrowingId: "narrow_vendor_contracts",
      proposedScope: "Contracts active between 2024-01-01 and 2026-06-30",
      proposedBy: "Procurement Department",
      sourceEvidenceId: "ev_vendor_contracts_scope"
    }
  },
  {
    id: "evt_prr_scope_vendor_contracts_accepted",
    type: "prr.scope.narrowing.accepted",
    version: 1,
    streamId: "prr_scope_vendor_contracts",
    sequence: 3,
    context: {
      ...contextBase,
      occurredAt: "2026-07-03T18:00:00.000Z",
      correlationId: "corr_prr_scope_vendor_contracts",
      causationId: "evt_prr_scope_vendor_contracts_proposed"
    },
    payload: {
      prrRequestId: "prr_scope_vendor_contracts",
      narrowingId: "narrow_vendor_contracts",
      acceptedScope: "Contracts active between 2025-01-01 and 2026-06-30",
      acceptedBy: "investigator@example.org",
      rationale: "The narrower date range still covers the procurement window under review."
    }
  },
  {
    id: "evt_prr_denial_personnel_created",
    type: "prr.request.created",
    version: 1,
    streamId: "prr_denial_personnel",
    sequence: 1,
    context: {
      ...contextBase,
      occurredAt: "2026-07-01T19:00:00.000Z",
      correlationId: "corr_prr_denial_personnel"
    },
    payload: {
      prrRequestId: "prr_denial_personnel",
      jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
      agency: { name: "Human Resources Agency", email: "foia@hr.example.gov" },
      requester: { name: "Investigator", email: "investigator@example.org" },
      requestText: "Please provide the final personnel investigation file for Case 24-118.",
      status: "draft"
    }
  },
  {
    id: "evt_prr_denial_personnel_denied",
    type: "prr.denial.recorded",
    version: 1,
    streamId: "prr_denial_personnel",
    sequence: 2,
    context: {
      ...contextBase,
      occurredAt: "2026-07-05T19:00:00.000Z",
      correlationId: "corr_prr_denial_personnel",
      causationId: "evt_prr_denial_personnel_created"
    },
    payload: {
      prrRequestId: "prr_denial_personnel",
      denialId: "denial_personnel",
      receivedAt: "2026-07-05T19:00:00.000Z",
      reason: "Personnel privacy exemption asserted for the requested file.",
      sourceEvidenceId: "ev_denial_personnel"
    }
  },
  {
    id: "evt_prr_appeal_personnel_created",
    type: "prr.request.created",
    version: 1,
    streamId: "prr_appeal_personnel",
    sequence: 1,
    context: {
      ...contextBase,
      occurredAt: "2026-07-01T20:00:00.000Z",
      correlationId: "corr_prr_appeal_personnel"
    },
    payload: {
      prrRequestId: "prr_appeal_personnel",
      jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
      agency: { name: "Human Resources Agency", email: "foia@hr.example.gov" },
      requester: { name: "Investigator", email: "investigator@example.org" },
      requestText: "Please provide the final personnel investigation file for Case 24-118.",
      status: "draft"
    }
  },
  {
    id: "evt_prr_appeal_personnel_denied",
    type: "prr.denial.recorded",
    version: 1,
    streamId: "prr_appeal_personnel",
    sequence: 2,
    context: {
      ...contextBase,
      occurredAt: "2026-07-05T20:00:00.000Z",
      correlationId: "corr_prr_appeal_personnel",
      causationId: "evt_prr_appeal_personnel_created"
    },
    payload: {
      prrRequestId: "prr_appeal_personnel",
      denialId: "denial_appeal_personnel",
      receivedAt: "2026-07-05T20:00:00.000Z",
      reason: "Agency denied the personnel request in full.",
      sourceEvidenceId: "ev_appeal_personnel_denial"
    }
  },
  {
    id: "evt_prr_appeal_personnel_created_appeal",
    type: "prr.appeal.created",
    version: 1,
    streamId: "prr_appeal_personnel",
    sequence: 3,
    context: {
      ...contextBase,
      occurredAt: "2026-07-06T20:00:00.000Z",
      correlationId: "corr_prr_appeal_personnel",
      causationId: "evt_prr_appeal_personnel_denied"
    },
    payload: {
      prrRequestId: "prr_appeal_personnel",
      appealId: "appeal_personnel",
      correspondenceId: "corr_prr_appeal_personnel",
      filedAt: "2026-07-06T20:00:00.000Z",
      approvedBy: "investigator@example.org",
      citedRules: [
        {
          jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
          label: "FOIA administrative appeal",
          citation: "5 U.S.C. 552(a)(6)(A)(i)"
        }
      ]
    }
  },
  {
    id: "evt_prr_stalling_vendor_emails_created",
    type: "prr.request.created",
    version: 1,
    streamId: "prr_stalling_vendor_emails",
    sequence: 1,
    context: {
      ...contextBase,
      occurredAt: "2026-07-01T21:00:00.000Z",
      correlationId: "corr_prr_stalling_vendor_emails"
    },
    payload: {
      prrRequestId: "prr_stalling_vendor_emails",
      jurisdictionPack: { name: "florida-public-records", version: "0.1.0" },
      agency: { name: "Economic Development Office", email: "records@economic.example.gov" },
      requester: { name: "Investigator", email: "investigator@example.org" },
      requestText: "Please provide emails with vendors about the incentive package.",
      status: "draft"
    }
  },
  {
    id: "evt_prr_stalling_vendor_emails_deadline_estimated",
    type: "prr.deadline.estimated",
    version: 1,
    streamId: "prr_stalling_vendor_emails",
    sequence: 2,
    context: {
      ...contextBase,
      occurredAt: "2026-07-01T21:01:00.000Z",
      correlationId: "corr_prr_stalling_vendor_emails",
      causationId: "evt_prr_stalling_vendor_emails_created"
    },
    payload: {
      prrRequestId: "prr_stalling_vendor_emails",
      deadlineDate: "2026-07-08",
      confidence: "workflow",
      explanation: "Florida workflow estimate for prompt access follow-up.",
      citedRules: [floridaPromptAccessRule]
    }
  },
  {
    id: "evt_prr_stalling_vendor_emails_detected",
    type: "prr.stalling.detected",
    version: 1,
    streamId: "prr_stalling_vendor_emails",
    sequence: 3,
    context: {
      ...contextBase,
      occurredAt: "2026-07-09T12:00:00.000Z",
      correlationId: "corr_prr_stalling_vendor_emails",
      causationId: "evt_prr_stalling_vendor_emails_deadline_estimated"
    },
    payload: {
      prrRequestId: "prr_stalling_vendor_emails",
      detectedAt: "2026-07-09T12:00:00.000Z",
      signals: [
        {
          kind: "deadline-breached",
          explanation: "The active deadline passed without a substantive response."
        },
        {
          kind: "repeated-vague-delays",
          explanation: "The agency sent repeated non-specific delay notices."
        }
      ]
    }
  },
  {
    id: "evt_prr_stalling_vendor_emails_confirmed",
    type: "prr.stalling.confirmed",
    version: 1,
    streamId: "prr_stalling_vendor_emails",
    sequence: 4,
    context: {
      ...contextBase,
      occurredAt: "2026-07-09T13:00:00.000Z",
      correlationId: "corr_prr_stalling_vendor_emails",
      causationId: "evt_prr_stalling_vendor_emails_detected"
    },
    payload: {
      prrRequestId: "prr_stalling_vendor_emails",
      confirmedBy: "investigator@example.org",
      rationale: "Requester reviewed the delay pattern and confirmed stalling.",
      signalKinds: ["deadline-breached", "repeated-vague-delays"]
    }
  },
  {
    id: "evt_prr_stalling_vendor_emails_legal_escalation",
    type: "prr.legal-escalation.confirmed",
    version: 1,
    streamId: "prr_stalling_vendor_emails",
    sequence: 5,
    context: {
      ...contextBase,
      occurredAt: "2026-07-09T14:00:00.000Z",
      correlationId: "corr_prr_stalling_vendor_emails",
      causationId: "evt_prr_stalling_vendor_emails_confirmed"
    },
    payload: {
      prrRequestId: "prr_stalling_vendor_emails",
      confirmedBy: "investigator@example.org",
      rationale: "Escalation language is appropriate after confirmed stalling and cited guidance review.",
      citedRules: [floridaPromptAccessRule],
      evidenceIds: ["ev_vendor_emails_followup", "ev_vendor_emails_delay"]
    }
  }
];
