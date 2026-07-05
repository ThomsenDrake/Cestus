import { describe, expect, it } from "vitest";
import {
  eventContracts,
  validateKnowledgeEvent,
  type AppendableKnowledgeEvent,
  type KnowledgeEvent
} from "../src/contracts.js";

const context = {
  actor: { id: "actor_system", kind: "system", label: "test runner" },
  occurredAt: "2026-06-30T17:00:00.000Z",
  correlationId: "corr_contracts",
  coreVersion: "0.1.0",
  packVersions: { core: "0.1.0" }
} as const;

describe("event contracts", () => {
  it("contains agent guidance for every event contract", () => {
    for (const contract of Object.values(eventContracts)) {
      expect(contract.description.length).toBeGreaterThan(20);
      expect(contract.agentGuidance.length).toBeGreaterThan(20);
      expect(contract.invariants.length).toBeGreaterThan(0);
    }
  });

  it("validates a self-describing evidence.ingested event", () => {
    const event: KnowledgeEvent = {
      id: "evt_000000000000000000000001",
      type: "evidence.ingested",
      version: 1,
      streamId: "evidence_ev_001",
      sequence: 1,
      context,
      payload: {
        evidenceId: "ev_001",
        source: { kind: "file", label: "invoice.pdf" },
        contentHash: "sha256:9f2c8b7a5f4e3d2c1b0a99887766554433221100ffeeddccbbaa998877665544",
        mediaType: "application/pdf",
        sizeBytes: 128
      }
    };

    expect(validateKnowledgeEvent(event).success).toBe(true);
  });

  it("rejects uncontracted payload fields", () => {
    const result = validateKnowledgeEvent({
      id: "evt_000000000000000000000003",
      type: "evidence.ingested",
      version: 1,
      streamId: "evidence_ev_002",
      sequence: 1,
      context,
      payload: {
        evidenceId: "ev_002",
        source: { kind: "file", label: "invoice.pdf" },
        contentHash: "sha256:9f2c8b7a5f4e3d2c1b0a99887766554433221100ffeeddccbbaa998877665544",
        mediaType: "application/pdf",
        sizeBytes: 128,
        uncontracted: true
      }
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((candidate) => candidate.path.join(".") === "payload");
      expect(issue).toMatchObject({
        code: "custom",
        params: { originalCode: "unrecognized_keys" }
      });
    }
  });

  it("rejects uncontracted event envelope and context fields", () => {
    const result = validateKnowledgeEvent({
      id: "evt_000000000000000000000006",
      type: "evidence.ingested",
      version: 1,
      streamId: "evidence_ev_006",
      sequence: 1,
      context: {
        ...context,
        actor: {
          ...context.actor,
          uncontractedActorField: true
        },
        uncontractedContextField: true
      },
      payload: {
        evidenceId: "ev_006",
        source: { kind: "file", label: "invoice.pdf" },
        contentHash: "sha256:9f2c8b7a5f4e3d2c1b0a99887766554433221100ffeeddccbbaa998877665544",
        mediaType: "application/pdf",
        sizeBytes: 128
      },
      uncontractedEventField: true
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join(".")).sort()).toEqual([
        "",
        "context",
        "context.actor"
      ]);
    }
  });

  it("rejects an assertion without provenance", () => {
    const result = validateKnowledgeEvent({
      id: "evt_000000000000000000000002",
      type: "assertion.proposed",
      version: 1,
      streamId: "assertion_as_001",
      sequence: 1,
      context,
      payload: {
        assertionId: "as_001",
        predicate: "agency.name",
        object: "Example Agency",
        confidence: 0.91,
        reviewState: "proposed"
      }
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toContain("payload.evidenceId");
    }
  });

  it("returns validation failure for inherited event type names", () => {
    let result: ReturnType<typeof validateKnowledgeEvent> | undefined;

    expect(() => {
      result = validateKnowledgeEvent({
        id: "evt_000000000000000000000005",
        type: "toString",
        version: 1,
        streamId: "event_to_string",
        sequence: 1,
        context,
        payload: {}
      });
    }).not.toThrow();
    expect(result?.success).toBe(false);
  });

  it("preserves payload validation details for diagnostics", () => {
    const result = validateKnowledgeEvent({
      id: "evt_000000000000000000000004",
      type: "assertion.proposed",
      version: 1,
      streamId: "assertion_as_002",
      sequence: 1,
      context,
      payload: {
        assertionId: "as_002",
        evidenceId: "ev_001",
        predicate: "agency.name",
        object: "Example Agency",
        confidence: 1.1,
        reviewState: "proposed"
      }
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((candidate) => candidate.path.join(".") === "payload.confidence");
      expect(issue).toMatchObject({
        code: "custom",
        params: {
          originalCode: "too_big",
          originalIssue: {
            code: "too_big",
            maximum: 1,
            path: ["confidence"]
          }
        }
      });
    }
  });

  it("exposes appendable event typing without losing payload correlation", () => {
    const appendableEvidenceEvent = {
      type: "evidence.ingested",
      version: 1,
      streamId: "evidence_ev_typed",
      context,
      payload: {
        evidenceId: "ev_typed",
        source: { kind: "file", label: "typed.pdf" },
        contentHash: "sha256:9f2c8b7a5f4e3d2c1b0a99887766554433221100ffeeddccbbaa998877665544",
        mediaType: "application/pdf",
        sizeBytes: 128
      }
    } satisfies AppendableKnowledgeEvent<"evidence.ingested">;

    expect(appendableEvidenceEvent.payload.evidenceId).toBe("ev_typed");
  });
});

const prrRequestId = "prr_req_001";
const validHash = "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const prrCitedRule = {
  jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
  label: "FOIA determination deadline",
  citation: "5 U.S.C. 552(a)(6)(A)(i)",
  url: "https://www.justice.gov/oip/freedom-information-act-5-usc-552"
};

const validPrrPayloadExamples = [
  {
    type: "prr.request.created",
    payload: {
      prrRequestId,
      jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
      agency: { name: "Example Agency", email: "foia@example.gov" },
      requester: { name: "Investigator", email: "investigator@example.org" },
      requestText: "Please provide contracts with Example Vendor from 2024.",
      status: "draft"
    }
  },
  {
    type: "prr.request.sent",
    payload: {
      prrRequestId,
      correspondenceId: "corr_prr_request_001",
      provider: "gmail",
      providerMessageId: "msg_request_001",
      providerThreadId: "thread_request_001",
      idempotencyKey: "send_prr_req_001_corr_prr_request_001",
      subject: "Records request",
      bodyHash: validHash,
      attachmentEvidenceIds: ["ev_prr_attachment_001"],
      sentAt: "2026-07-01T16:00:00.000Z",
      approvedBy: "actor_investigator",
      rawMetadata: {
        accountEmail: "investigator@example.org",
        provider: "gmail"
      }
    }
  },
  {
    type: "prr.correspondence.received",
    payload: {
      prrRequestId,
      correspondenceId: "corr_prr_received_001",
      provider: "imap-smtp",
      providerMessageId: "msg_received_001",
      providerThreadId: "thread_received_001",
      subject: "Re: Records request",
      from: { name: "FOIA Officer", email: "foia@example.gov" },
      receivedAt: "2026-07-02T16:00:00.000Z",
      bodyHash: validHash,
      evidenceIds: ["ev_prr_correspondence_001"]
    }
  },
  {
    type: "prr.followup.drafted",
    payload: {
      prrRequestId,
      correspondenceId: "corr_prr_followup_draft_001",
      subject: "Follow-up",
      bodyHash: validHash,
      citedRules: [prrCitedRule]
    }
  },
  {
    type: "prr.followup.sent",
    payload: {
      prrRequestId,
      correspondenceId: "corr_prr_followup_sent_001",
      provider: "gmail",
      providerMessageId: "msg_followup_001",
      subject: "Follow-up",
      bodyHash: validHash,
      sentAt: "2026-07-10T16:00:00.000Z",
      approvedBy: "actor_investigator"
    }
  },
  {
    type: "prr.deadline.estimated",
    payload: {
      prrRequestId,
      deadlineDate: "2026-07-29",
      confidence: "statutory",
      explanation: "Federal FOIA 20 working day estimate.",
      citedRules: [prrCitedRule]
    }
  },
  {
    type: "prr.deadline.confirmed",
    payload: {
      prrRequestId,
      deadlineDate: "2026-07-29",
      confirmedBy: "actor_investigator",
      rationale: "Receipt date confirmed from agency acknowledgement.",
      citedRules: [prrCitedRule]
    }
  },
  {
    type: "prr.fee.estimated",
    payload: {
      prrRequestId,
      amountCents: 2500,
      currency: "USD",
      sourceEvidenceId: "ev_fee_letter_001"
    }
  },
  {
    type: "prr.fee.challenged",
    payload: {
      prrRequestId,
      feeChallengeId: "fee_challenge_001",
      amountCents: 2500,
      rationale: "Fee waiver requested for public interest reporting.",
      approvedBy: "actor_investigator",
      citedRules: [prrCitedRule]
    }
  },
  {
    type: "prr.scope.narrowing.proposed",
    payload: {
      prrRequestId,
      narrowingId: "narrow_001",
      proposedScope: "Contracts from calendar year 2024 only.",
      proposedBy: "actor_agency",
      sourceEvidenceId: "ev_scope_email_001"
    }
  },
  {
    type: "prr.scope.narrowing.accepted",
    payload: {
      prrRequestId,
      narrowingId: "narrow_001",
      acceptedScope: "Contracts from calendar year 2024 only.",
      acceptedBy: "actor_investigator",
      rationale: "The narrower scope still covers the investigation need."
    }
  },
  {
    type: "prr.production.received",
    payload: {
      prrRequestId,
      productionId: "prod_001",
      label: "Initial production",
      receivedAt: "2026-07-15T16:00:00.000Z",
      evidenceIds: ["ev_production_file_001"]
    }
  },
  {
    type: "prr.exemption.claimed",
    payload: {
      prrRequestId,
      exemptionId: "exemption_001",
      claimedBy: "Example Agency",
      citedRules: [prrCitedRule],
      sourceEvidenceId: "ev_exemption_letter_001"
    }
  },
  {
    type: "prr.denial.recorded",
    payload: {
      prrRequestId,
      denialId: "denial_001",
      receivedAt: "2026-07-20T16:00:00.000Z",
      reason: "Agency denied the request citing exemption language.",
      sourceEvidenceId: "ev_denial_letter_001"
    }
  },
  {
    type: "prr.appeal.created",
    payload: {
      prrRequestId,
      appealId: "appeal_001",
      correspondenceId: "corr_prr_appeal_001",
      filedAt: "2026-07-21T16:00:00.000Z",
      approvedBy: "actor_investigator",
      citedRules: [prrCitedRule]
    }
  },
  {
    type: "prr.stalling.detected",
    payload: {
      prrRequestId,
      detectedAt: "2026-08-01T16:00:00.000Z",
      signals: [
        {
          kind: "deadline-breached",
          explanation: "Confirmed deadline passed without an adequate response."
        }
      ]
    }
  },
  {
    type: "prr.stalling.confirmed",
    payload: {
      prrRequestId,
      confirmedBy: "actor_investigator",
      rationale: "The agency has not responded after deadline and follow-up.",
      signalKinds: ["deadline-breached"]
    }
  },
  {
    type: "prr.legal-escalation.confirmed",
    payload: {
      prrRequestId,
      confirmedBy: "actor_investigator",
      rationale: "Escalation language approved after reviewing deadline, citations, and correspondence.",
      citedRules: [prrCitedRule],
      evidenceIds: ["ev_correspondence_history_001"]
    }
  },
  {
    type: "prr.request.closed",
    payload: {
      prrRequestId,
      closedAt: "2026-08-15T16:00:00.000Z",
      closedBy: "actor_investigator",
      reason: "fulfilled"
    }
  }
] as const;

function prrEvent(type: string, payload: Record<string, unknown>) {
  return {
    id: `evt_${type.replaceAll(".", "_")}_valid`,
    type,
    version: 1,
    streamId: prrRequestId,
    sequence: 1,
    context,
    payload
  };
}

describe("public records request event contracts", () => {
  it.each(validPrrPayloadExamples)("validates a valid $type payload", ({ type, payload }) => {
    expect(validateKnowledgeEvent(prrEvent(type, payload)).success).toBe(true);
  });

  it("validates a prr.request.created event", () => {
    const event = {
      id: "evt_prr_created_001",
      type: "prr.request.created",
      version: 1,
      streamId: "prr_req_001",
      sequence: 1,
      context,
      payload: {
        prrRequestId: "prr_req_001",
        jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
        agency: { name: "Example Agency", email: "foia@example.gov" },
        requester: { name: "Investigator", email: "investigator@example.org" },
        requestText: "Please provide contracts with Example Vendor from 2024.",
        status: "draft"
      }
    };

    expect(validateKnowledgeEvent(event).success).toBe(true);
  });

  it("rejects unknown keys in PRR payloads", () => {
    const result = validateKnowledgeEvent({
      id: "evt_prr_created_002",
      type: "prr.request.created",
      version: 1,
      streamId: "prr_req_002",
      sequence: 1,
      context,
      payload: {
        prrRequestId: "prr_req_002",
        jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
        agency: { name: "Example Agency" },
        requester: { name: "Investigator" },
        requestText: "Please provide records.",
        status: "draft",
        secretToken: "never-store-this"
      }
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toContain("payload");
    }
  });

  it("requires explicit evidenceIds on prr.correspondence.received payloads", () => {
    const result = validateKnowledgeEvent(
      prrEvent("prr.correspondence.received", {
        prrRequestId,
        correspondenceId: "corr_prr_received_002",
        provider: "gmail",
        providerMessageId: "msg_received_002",
        subject: "Re: Records request",
        from: { name: "FOIA Officer", email: "foia@example.gov" },
        receivedAt: "2026-07-02T16:00:00.000Z",
        bodyHash: validHash
      })
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toContain("payload.evidenceIds");
    }
  });

  it("rejects secret-looking raw metadata keys on prr.request.sent payloads", () => {
    const sentPayload = validPrrPayloadExamples.find((example) => example.type === "prr.request.sent")!
      .payload;
    const result = validateKnowledgeEvent(
      prrEvent("prr.request.sent", {
        ...sentPayload,
        rawMetadata: {
          oauthToken: "never-store-this"
        }
      })
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toContain(
        "payload.rawMetadata.oauthToken"
      );
    }
  });

  it("requires human approval before a prr.followup.sent event", () => {
    const result = validateKnowledgeEvent({
      id: "evt_prr_followup_001",
      type: "prr.followup.sent",
      version: 1,
      streamId: "prr_req_001",
      sequence: 2,
      context,
      payload: {
        prrRequestId: "prr_req_001",
        correspondenceId: "corr_prr_001",
        provider: "gmail",
        providerMessageId: "msg_123",
        subject: "Follow-up",
        bodyHash: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        sentAt: "2026-07-01T16:00:00.000Z"
      }
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toContain("payload.approvedBy");
    }
  });

  it("rejects invalid PRR evidence links", () => {
    const result = validateKnowledgeEvent(
      prrEvent("prr.production.received", {
        prrRequestId,
        productionId: "prod_002",
        label: "Invalid production",
        receivedAt: "2026-07-15T16:00:00.000Z",
        evidenceIds: ["not_evidence"]
      })
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toContain("payload.evidenceIds.0");
    }
  });

  it("requires citations for PRR deadline estimates", () => {
    const result = validateKnowledgeEvent(
      prrEvent("prr.deadline.estimated", {
        prrRequestId,
        deadlineDate: "2026-07-29",
        confidence: "statutory",
        explanation: "Federal FOIA 20 working day estimate.",
        citedRules: []
      })
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toContain("payload.citedRules");
    }
  });

  it("rejects lowercase PRR fee currencies", () => {
    const result = validateKnowledgeEvent(
      prrEvent("prr.fee.estimated", {
        prrRequestId,
        amountCents: 2500,
        currency: "usd"
      })
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toContain("payload.currency");
    }
  });

  it("requires legal escalation confirmation evidence and citations", () => {
    const result = validateKnowledgeEvent(
      prrEvent("prr.legal-escalation.confirmed", {
        prrRequestId,
        confirmedBy: "actor_investigator",
        rationale: "Escalation approved without complete support.",
        citedRules: [],
        evidenceIds: []
      })
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual(
        expect.arrayContaining(["payload.citedRules", "payload.evidenceIds"])
      );
    }
  });
});

describe("ingestion event contracts", () => {
  it("validates source registration, scan, occurrence, approval, evidence link, parse, and provider events", () => {
    const events: KnowledgeEvent[] = [
      ingestionEvent("evt_ing_source_registered", "ingestion.source.registered", {
        sourceCollectionId: "src_drive_001",
        label: "External investigation archive",
        mode: "read-only",
        adapter: { name: "local-filesystem", version: "0.1.0" },
        rootUri: "file:///mnt/investigation-drive/source",
        workspaceUri: "file:///mnt/investigation-drive/cestus-workspace"
      }),
      ingestionEvent("evt_ing_scan_started", "ingestion.scan.started", {
        scanBatchId: "scan_001",
        sourceCollectionId: "src_drive_001",
        hashPolicy: "sha256-dry-run",
        startedAt: "2026-07-05T12:00:00.000Z"
      }),
      ingestionEvent("evt_ing_occurrence_observed", "ingestion.occurrence.observed", {
        occurrenceId: "occ_001",
        scanBatchId: "scan_001",
        sourceCollectionId: "src_drive_001",
        contentHash: validHash,
        sourcePath: "/source/contracts/a.pdf",
        sizeBytes: 11,
        observedAt: "2026-07-05T12:01:00.000Z",
        status: "new"
      }),
      ingestionEvent("evt_ing_scan_completed", "ingestion.scan.completed", {
        scanBatchId: "scan_001",
        sourceCollectionId: "src_drive_001",
        completedAt: "2026-07-05T12:02:00.000Z",
        inventoryHash: validHash,
        totals: {
          observedFiles: 1,
          uniqueContent: 1,
          duplicateOccurrences: 0,
          skipped: 0,
          bytes: 11,
          estimatedNewBlobBytes: 11
        }
      }),
      ingestionEvent("evt_ing_import_approved", "ingestion.import.approved", {
        importBatchId: "imp_001",
        scanBatchId: "scan_001",
        sourceCollectionId: "src_drive_001",
        approvedBy: "actor_investigator",
        approvedAt: "2026-07-05T12:03:00.000Z"
      }),
      ingestionEvent("evt_ing_import_completed", "ingestion.import.completed", {
        importBatchId: "imp_001",
        scanBatchId: "scan_001",
        sourceCollectionId: "src_drive_001",
        completedAt: "2026-07-05T12:04:00.000Z",
        totals: { evidenceCreated: 1, occurrencesLinked: 1, duplicatesReused: 0, skipped: 0 }
      }),
      ingestionEvent("evt_ing_evidence_linked", "ingestion.evidence.linked", {
        evidenceId: "ev_ingested_001",
        importBatchId: "imp_001",
        sourceCollectionId: "src_drive_001",
        contentHash: validHash,
        occurrenceIds: ["occ_001"]
      }),
      ingestionEvent("evt_ing_parse_created", "ingestion.parse.job.created", {
        parseJobId: "parse_001",
        sourceCollectionId: "src_drive_001",
        importBatchId: "imp_001",
        evidenceId: "ev_ingested_001",
        lane: "local",
        parser: { name: "local-text", version: "0.1.0" },
        state: "queued"
      }),
      ingestionEvent("evt_ing_parse_completed", "ingestion.parse.completed", {
        parseJobId: "parse_001",
        sourceCollectionId: "src_drive_001",
        importBatchId: "imp_001",
        evidenceId: "ev_ingested_001",
        lane: "local",
        parser: { name: "local-text", version: "0.1.0" },
        outputHash: validHash,
        outputMediaType: "text/plain",
        completedAt: "2026-07-05T12:05:00.000Z"
      }),
      ingestionEvent("evt_ing_parse_failed", "ingestion.parse.failed", {
        parseJobId: "parse_002",
        sourceCollectionId: "src_drive_001",
        importBatchId: "imp_001",
        evidenceId: "ev_ingested_001",
        lane: "provider",
        parser: { name: "mistral-document-ai", version: "0.1.0" },
        failedAt: "2026-07-05T12:05:30.000Z",
        message: "provider rejected unsupported media type",
        retryable: false
      }),
      ingestionEvent("evt_ing_provider_approved", "ingestion.provider.approved", {
        providerJobId: "provider_001",
        sourceCollectionId: "src_drive_001",
        importBatchId: "imp_001",
        provider: { name: "mistral-document-ai", version: "0.1.0" },
        approvedBy: "actor_investigator",
        approvedAt: "2026-07-05T12:06:00.000Z",
        eligibleMediaTypes: ["application/pdf"],
        maxBytesPerFile: 50000000,
        policy: "send-all-technically-eligible"
      })
    ];

    for (const event of events) {
      expect(validateKnowledgeEvent(event).success, event.type).toBe(true);
    }
  });

  it("rejects uncontracted ingestion payload fields", () => {
    const badPayload = {
      scanBatchId: "scan_002",
      sourceCollectionId: "src_drive_001",
      completedAt: "2026-07-05T12:02:00.000Z",
      inventoryHash: validHash,
      totals: {
        observedFiles: 1,
        uniqueContent: 1,
        duplicateOccurrences: 0,
        skipped: 0,
        bytes: 11,
        estimatedNewBlobBytes: 11
      },
      extra: true
    } as unknown as Extract<KnowledgeEvent, { type: "ingestion.scan.completed" }>["payload"];

    const event = ingestionEvent("evt_ing_bad_scan", "ingestion.scan.completed", badPayload);

    expect(validateKnowledgeEvent(event).success).toBe(false);
  });
});

function ingestionEvent<Type extends KnowledgeEvent["type"]>(
  id: string,
  type: Type,
  payload: Extract<KnowledgeEvent, { type: Type }>["payload"]
): Extract<KnowledgeEvent, { type: Type }> {
  return {
    id,
    type,
    version: 1,
    streamId: `ingestion_${id}`,
    sequence: 1,
    context,
    payload
  } as unknown as Extract<KnowledgeEvent, { type: Type }>;
}
