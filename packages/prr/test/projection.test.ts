import { describe, expect, it } from "vitest";
import {
  validateKnowledgeEvent,
  type KnowledgeEvent,
  type KnowledgeEventOf
} from "../../ontology/src/contracts.js";
import { buildPrrProjection as exportedBuildPrrProjection } from "../src/index.js";
import { buildPrrProjection, type PrrRequestReadModel } from "../src/projection.js";
import { goldenPrrLedgerEvents } from "./fixtures/golden-prr-ledger.js";

const systemContext = {
  actor: { id: "actor_system", kind: "system", label: "projection test" },
  occurredAt: "2026-07-03T12:00:00.000Z",
  correlationId: "corr_projection_test",
  coreVersion: "0.1.0",
  packVersions: { core: "0.1.0", "us-federal-foia": "0.1.0" }
} as const;

describe("buildPrrProjection", () => {
  it("uses a golden ledger fixture whose events validate", () => {
    for (const event of goldenPrrLedgerEvents) {
      expect(validateKnowledgeEvent(event).success).toBe(true);
    }
  });

  it("rebuilds request state from golden PRR ledger events", () => {
    const projection = buildPrrProjection(goldenPrrLedgerEvents);

    expect(projection.requests.get("prr_req_001")).toMatchObject({
      prrRequestId: "prr_req_001",
      status: "awaitingProduction",
      agencyName: "Example Agency",
      jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
      agency: { name: "Example Agency", email: "foia@example.gov" },
      requester: { name: "Example Requester", email: "requester@example.org" },
      requestText: "Please provide records concerning public meeting notices.",
      activeDeadline: { deadlineDate: "2026-07-30", source: "estimated" },
      latestOutboundCorrespondence: {
        correspondenceId: "corr_prr_req_001_sent",
        provider: "gmail",
        providerMessageId: "provider-message-001",
        providerThreadId: "provider-thread-001",
        subject: "FOIA request for public meeting notices",
        occurredAt: "2026-07-01T12:05:00.000Z",
        bodyHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        evidenceIds: []
      },
      latestInboundCorrespondence: {
        correspondenceId: "corr_prr_req_001_ack",
        provider: "gmail",
        providerMessageId: "provider-message-ack-001",
        providerThreadId: "provider-thread-001",
        subject: "Re: FOIA request for public meeting notices",
        occurredAt: "2026-07-02T14:00:00.000Z",
        bodyHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        evidenceIds: ["ev_prr_correspondence_001"]
      },
      possibleStalling: false,
      confirmedStalling: false,
      stallingSignals: [],
      productionEvidenceIds: ["ev_prr_production_001", "ev_prr_production_002"],
      productionBatches: [
        {
          productionId: "prod_prr_req_001",
          label: "Initial production",
          receivedAt: "2026-07-15T16:00:00.000Z",
          evidenceIds: ["ev_prr_production_001", "ev_prr_production_002"]
        }
      ]
    });
  });

  it("rebuilds rich request state from golden PRR seed events", () => {
    const projection = buildPrrProjection(goldenPrrLedgerEvents);

    expect([...projection.requests.keys()].sort()).toEqual([
      "prr_ack_florida_records",
      "prr_appeal_personnel",
      "prr_denial_personnel",
      "prr_draft_city_budget",
      "prr_fee_building_permits",
      "prr_req_001",
      "prr_scope_vendor_contracts",
      "prr_sent_police_logs",
      "prr_stalling_vendor_emails"
    ]);

    expect(projection.requests.get("prr_fee_building_permits")).toMatchObject({
      prrRequestId: "prr_fee_building_permits",
      status: "inNegotiation",
      agencyName: "Building Services Department",
      feeEstimate: {
        amountCents: 185000,
        currency: "USD",
        challenged: true,
        challengeId: "fee_challenge_building_permits"
      }
    });

    expect(projection.requests.get("prr_scope_vendor_contracts")).toMatchObject({
      scopeNarrowing: {
        narrowingId: "narrow_vendor_contracts",
        proposedScope: "Contracts active between 2024-01-01 and 2026-06-30",
        acceptedScope: "Contracts active between 2025-01-01 and 2026-06-30"
      }
    });

    expect(projection.requests.get("prr_stalling_vendor_emails")).toMatchObject({
      possibleStalling: true,
      confirmedStalling: true,
      legalEscalation: {
        confirmedBy: "investigator@example.org"
      }
    });
  });

  it("projects sent status after replaying created and sent events", () => {
    const projection = buildPrrProjection(goldenPrrLedgerEvents.slice(0, 2));

    expect(projection.requests.get("prr_req_001")?.status).toBe("sent");
  });

  it("projects acknowledged status after replaying received correspondence", () => {
    const projection = buildPrrProjection(goldenPrrLedgerEvents.slice(0, 4));

    expect(projection.requests.get("prr_req_001")?.status).toBe("acknowledged");
  });

  it("keeps timeline entries in event replay order for the request", () => {
    const projection = buildPrrProjection(goldenPrrLedgerEvents);

    expect(projection.timelineForRequest("prr_req_001")).toMatchObject([
      {
        eventId: "evt_prr_req_001_created",
        type: "prr.request.created",
        occurredAt: "2026-07-01T12:00:00.000Z"
      },
      {
        eventId: "evt_prr_req_001_sent",
        type: "prr.request.sent",
        occurredAt: "2026-07-01T12:05:00.000Z"
      },
      {
        eventId: "evt_prr_req_001_deadline_estimated",
        type: "prr.deadline.estimated",
        occurredAt: "2026-07-01T12:06:00.000Z"
      },
      {
        eventId: "evt_prr_req_001_correspondence_received",
        type: "prr.correspondence.received",
        occurredAt: "2026-07-02T14:00:00.000Z"
      },
      {
        eventId: "evt_prr_req_001_production_received",
        type: "prr.production.received",
        occurredAt: "2026-07-15T16:00:00.000Z"
      }
    ]);
  });

  it("lets confirmed deadlines override estimated deadlines", () => {
    const projection = buildPrrProjection([
      ...goldenPrrLedgerEvents,
      confirmedDeadlineEvent("2026-07-25")
    ]);

    expect(projection.requests.get("prr_req_001")?.activeDeadline).toMatchObject({
      deadlineDate: "2026-07-25",
      source: "confirmed"
    });
  });

  it("does not replace a confirmed deadline with a later estimate", () => {
    const projection = buildPrrProjection([
      ...goldenPrrLedgerEvents,
      confirmedDeadlineEvent("2026-07-25"),
      estimatedDeadlineEvent("2026-08-01")
    ]);

    expect(projection.requests.get("prr_req_001")?.activeDeadline).toMatchObject({
      deadlineDate: "2026-07-25",
      source: "confirmed"
    });
  });

  it("ignores non-PRR events", () => {
    const projection = buildPrrProjection([
      evidenceIngestedEvent("evt_evidence_ignored_before", 1),
      ...goldenPrrLedgerEvents,
      evidenceIngestedEvent("evt_evidence_ignored_after", 6)
    ]);

    expect(projection.requests.size).toBe(9);
    expect(projection.timelineForRequest("prr_req_001").map((entry) => entry.type)).toEqual(
      goldenPrrLedgerEvents
        .filter((event) => event.streamId === "prr_req_001")
        .map((event) => event.type)
    );
  });

  it("ignores PRR events that cannot apply because the request was never created", () => {
    const projection = buildPrrProjection([
      sentEventForUncreatedRequest(),
      ...goldenPrrLedgerEvents
    ]);

    expect(projection.requests.has("prr_missing_001")).toBe(false);
    expect(projection.timelineForRequest("prr_missing_001")).toEqual([]);
    expect(projection.diagnostics).toEqual([
      {
        diagnosticId: "diag_prr_projection_evt_prr_missing_001_sent",
        prrRequestId: "prr_missing_001",
        eventId: "evt_prr_missing_001_sent",
        category: "projection",
        message: "Cannot project prr.request.sent before prr.request.created",
        repairHint: {
          violatedPath: "prr.request.created",
          allowedActions: ["replay a ledger containing prr.request.created before dependent PRR events"]
        }
      }
    ]);
    expect(projection.requests.has("prr_req_001")).toBe(true);
  });

  it("does not invent fee estimate state when a fee challenge has no prior estimate", () => {
    const projection = buildPrrProjection([
      createdRequestEvent("prr_fee_missing_estimate"),
      feeChallengeWithoutEstimateEvent()
    ]);

    expect(projection.requests.get("prr_fee_missing_estimate")?.feeEstimate).toBeUndefined();
    expect(projection.diagnostics).toEqual([
      {
        diagnosticId: "diag_prr_projection_evt_prr_fee_missing_estimate_challenged",
        prrRequestId: "prr_fee_missing_estimate",
        eventId: "evt_prr_fee_missing_estimate_challenged",
        category: "projection",
        message: "Cannot project prr.fee.challenged fee challenge state before prr.fee.estimated",
        repairHint: {
          violatedPath: "prr.fee.estimated",
          allowedActions: ["replay prr.fee.estimated before prr.fee.challenged"]
        }
      }
    ]);
  });

  it("does not invent scope narrowing state when an acceptance has no prior proposal", () => {
    const projection = buildPrrProjection([
      createdRequestEvent("prr_scope_missing_proposal"),
      scopeAcceptanceWithoutProposalEvent()
    ]);

    expect(projection.requests.get("prr_scope_missing_proposal")?.scopeNarrowing).toBeUndefined();
    expect(projection.diagnostics).toEqual([
      {
        diagnosticId: "diag_prr_projection_evt_prr_scope_missing_proposal_accepted",
        prrRequestId: "prr_scope_missing_proposal",
        eventId: "evt_prr_scope_missing_proposal_accepted",
        category: "projection",
        message:
          "Cannot project prr.scope.narrowing.accepted accepted scope for narrow_missing_proposal before matching prr.scope.narrowing.proposed",
        repairHint: {
          violatedPath: "prr.scope.narrowing.proposed",
          allowedActions: [
            "replay a matching prr.scope.narrowing.proposed before prr.scope.narrowing.accepted"
          ]
        }
      }
    ]);
  });

  it("does not merge accepted scope into a different proposed narrowing", () => {
    const projection = buildPrrProjection([
      createdRequestEvent("prr_scope_mismatched_narrowing"),
      scopeProposalEvent("prr_scope_mismatched_narrowing", "narrow_a"),
      scopeAcceptanceEvent("prr_scope_mismatched_narrowing", "narrow_b")
    ]);

    expect(projection.requests.get("prr_scope_mismatched_narrowing")?.scopeNarrowing).toEqual({
      narrowingId: "narrow_a",
      proposedScope: "Proposal for narrow_a",
      proposedBy: "Agency Records Office",
      sourceEvidenceId: "ev_scope_narrow_a"
    });
    expect(projection.diagnostics).toEqual([
      {
        diagnosticId: "diag_prr_projection_evt_prr_scope_mismatched_narrowing_narrow_b_accepted",
        prrRequestId: "prr_scope_mismatched_narrowing",
        eventId: "evt_prr_scope_mismatched_narrowing_narrow_b_accepted",
        category: "projection",
        message:
          "Cannot project prr.scope.narrowing.accepted accepted scope for narrow_b before matching prr.scope.narrowing.proposed",
        repairHint: {
          violatedPath: "prr.scope.narrowing.proposed",
          allowedActions: [
            "replay a matching prr.scope.narrowing.proposed before prr.scope.narrowing.accepted"
          ]
        }
      }
    ]);
  });

  it("projects created-request fields as required read model state", () => {
    const projection = buildPrrProjection(goldenPrrLedgerEvents);
    const request = projection.requests.get("prr_req_001");
    expect(request).toBeDefined();

    const createdFields: Pick<
      PrrRequestReadModel,
      | "jurisdictionPack"
      | "agency"
      | "requester"
      | "requestText"
      | "productionBatches"
      | "productionEvidenceIds"
      | "exemptions"
      | "stallingSignals"
    > = request!;

    expect(createdFields).toMatchObject({
      jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
      agency: { name: "Example Agency", email: "foia@example.gov" },
      requester: { name: "Example Requester", email: "requester@example.org" },
      requestText: "Please provide records concerning public meeting notices.",
      productionBatches: [
        {
          productionId: "prod_prr_req_001"
        }
      ],
      productionEvidenceIds: ["ev_prr_production_001", "ev_prr_production_002"],
      exemptions: [],
      stallingSignals: []
    });
  });

  it("protects projection diagnostics from caller mutation", () => {
    const projection = buildPrrProjection([
      sentEventForUncreatedRequest(),
      ...goldenPrrLedgerEvents
    ]);

    try {
      (projection.diagnostics as unknown as unknown[]).pop();
    } catch {
      // Frozen diagnostics are acceptable; the later read must still be unchanged.
    }
    try {
      (projection.diagnostics[0] as { message: string }).message = "mutated";
    } catch {
      // Frozen diagnostics are acceptable; the later read must still be unchanged.
    }
    try {
      (projection.diagnostics[0]!.repairHint.allowedActions as unknown as string[]).push("mutated");
    } catch {
      // Frozen diagnostics are acceptable; the later read must still be unchanged.
    }

    expect(projection.diagnostics).toEqual([
      {
        diagnosticId: "diag_prr_projection_evt_prr_missing_001_sent",
        prrRequestId: "prr_missing_001",
        eventId: "evt_prr_missing_001_sent",
        category: "projection",
        message: "Cannot project prr.request.sent before prr.request.created",
        repairHint: {
          violatedPath: "prr.request.created",
          allowedActions: ["replay a ledger containing prr.request.created before dependent PRR events"]
        }
      }
    ]);
  });

  it("updates possible and confirmed stalling flags from replayed events", () => {
    const projection = buildPrrProjection([
      ...goldenPrrLedgerEvents,
      stallingDetectedEvent(),
      stallingConfirmedEvent()
    ]);

    expect(projection.requests.get("prr_req_001")).toMatchObject({
      possibleStalling: true,
      confirmedStalling: true
    });
  });

  it("returns a copy from timelineForRequest", () => {
    const projection = buildPrrProjection(goldenPrrLedgerEvents);
    const firstTimeline = projection.timelineForRequest("prr_req_001");

    firstTimeline.pop();

    expect(projection.timelineForRequest("prr_req_001")).toHaveLength(5);
  });

  it("protects request read models from caller mutation", () => {
    const projection = buildPrrProjection([
      ...goldenPrrLedgerEvents,
      confirmedDeadlineEvent("2026-07-25")
    ]);
    const request = projection.requests.get("prr_req_001");
    expect(request).toBeDefined();

    const mutableRequest = request as unknown as {
      productionEvidenceIds: string[];
      activeDeadline: { deadlineDate: string; source: "estimated" | "confirmed" };
    };

    try {
      mutableRequest.productionEvidenceIds.push("ev_mutated");
    } catch {
      // Frozen read models are acceptable; the later read must still be unchanged.
    }
    try {
      mutableRequest.activeDeadline.deadlineDate = "2099-01-01";
    } catch {
      // Frozen read models are acceptable; the later read must still be unchanged.
    }

    expect(projection.requests.get("prr_req_001")?.productionEvidenceIds).toEqual([
      "ev_prr_production_001",
      "ev_prr_production_002"
    ]);
    expect(projection.requests.get("prr_req_001")?.activeDeadline).toMatchObject({
      deadlineDate: "2026-07-25",
      source: "confirmed"
    });
  });

  it("protects rich nested request fields from caller mutation", () => {
    const projection = buildPrrProjection(goldenPrrLedgerEvents);
    const req001 = mutableRequest(projection, "prr_req_001");
    const draft = mutableRequest(projection, "prr_draft_city_budget");
    const sent = mutableRequest(projection, "prr_sent_police_logs");
    const fee = mutableRequest(projection, "prr_fee_building_permits");
    const scope = mutableRequest(projection, "prr_scope_vendor_contracts");
    const denial = mutableRequest(projection, "prr_denial_personnel");
    const appeal = mutableRequest(projection, "prr_appeal_personnel");
    const stalling = mutableRequest(projection, "prr_stalling_vendor_emails");

    attemptMutation(() => {
      req001.agency.email = "mutated@example.org";
    });
    attemptMutation(() => {
      draft.activeDeadline.citedRules[0].citation = "mutated";
    });
    attemptMutation(() => {
      sent.latestOutboundCorrespondence.rawMetadata.provider = "mutated";
    });
    attemptMutation(() => {
      fee.feeEstimate.amountCents = 1;
    });
    attemptMutation(() => {
      scope.scopeNarrowing.acceptedScope = "mutated";
    });
    attemptMutation(() => {
      req001.productionBatches[0].evidenceIds.push("ev_mutated");
    });
    attemptMutation(() => {
      denial.denial.reason = "mutated";
    });
    attemptMutation(() => {
      appeal.appeal.citedRules[0].label = "mutated";
    });
    attemptMutation(() => {
      stalling.stallingSignals[0].explanation = "mutated";
    });
    attemptMutation(() => {
      stalling.legalEscalation.evidenceIds.push("ev_mutated");
    });

    expect(projection.requests.get("prr_req_001")).toMatchObject({
      agency: { email: "foia@example.gov" },
      productionBatches: [
        {
          evidenceIds: ["ev_prr_production_001", "ev_prr_production_002"]
        }
      ]
    });
    expect(projection.requests.get("prr_draft_city_budget")?.activeDeadline).toMatchObject({
      citedRules: [{ citation: "Fla. Stat. sec. 119.07(1)(a)" }]
    });
    expect(projection.requests.get("prr_sent_police_logs")?.latestOutboundCorrespondence).toMatchObject({
      rawMetadata: { provider: "gmail" }
    });
    expect(projection.requests.get("prr_fee_building_permits")?.feeEstimate).toMatchObject({
      amountCents: 185000
    });
    expect(projection.requests.get("prr_scope_vendor_contracts")?.scopeNarrowing).toMatchObject({
      acceptedScope: "Contracts active between 2025-01-01 and 2026-06-30"
    });
    expect(projection.requests.get("prr_denial_personnel")?.denial).toMatchObject({
      reason: "Personnel privacy exemption asserted for the requested file."
    });
    expect(projection.requests.get("prr_appeal_personnel")?.appeal).toMatchObject({
      citedRules: [{ label: "FOIA administrative appeal" }]
    });
    expect(projection.requests.get("prr_stalling_vendor_emails")).toMatchObject({
      stallingSignals: expect.arrayContaining([
        expect.objectContaining({
          explanation: "The active deadline passed without a substantive response."
        })
      ]),
      legalEscalation: {
        evidenceIds: ["ev_vendor_emails_followup", "ev_vendor_emails_delay"]
      }
    });
  });

  it("protects timeline entries from nested caller mutation", () => {
    const projection = buildPrrProjection(goldenPrrLedgerEvents);
    const timeline = projection.timelineForRequest("prr_fee_building_permits") as unknown as Array<{
      eventId: string;
      payload: { citedRules?: Array<{ citation: string }> };
    }>;

    attemptMutation(() => {
      timeline[2]!.payload.citedRules![0]!.citation = "mutated";
    });

    expect(projection.timelineForRequest("prr_fee_building_permits")[2]).toMatchObject({
      payload: {
        citedRules: [{ citation: "Fla. Stat. sec. 119.07(4)" }]
      }
    });
  });

  it("preserves readonly request map read and iteration behavior", () => {
    const projection = buildPrrProjection(goldenPrrLedgerEvents);

    expect(projection.requests.size).toBe(9);
    expect(projection.requests.has("prr_req_001")).toBe(true);
    expect(projection.requests.get("prr_req_001")?.agencyName).toBe("Example Agency");
    expect([...projection.requests.keys()][0]).toBe("prr_req_001");
    expect([...projection.requests.values()].map((request) => request.prrRequestId)).toContain(
      "prr_req_001"
    );
    expect([...projection.requests.entries()].map(([prrRequestId]) => prrRequestId)).toContain(
      "prr_req_001"
    );
    expect([...projection.requests].map(([prrRequestId]) => prrRequestId)).toContain("prr_req_001");

    const forEachRequestIds: string[] = [];
    projection.requests.forEach((request, prrRequestId, map) => {
      forEachRequestIds.push(`${prrRequestId}:${request.prrRequestId}:${map.size}`);
    });

    expect(forEachRequestIds).toContain("prr_req_001:prr_req_001:9");
  });

  it("prevents runtime set calls from mutating the request map", () => {
    const projection = buildPrrProjection(goldenPrrLedgerEvents);
    const mutableRequests = projection.requests as unknown as Map<string, PrrRequestReadModel>;

    try {
      mutableRequests.set("prr_req_mutated", fakeRequestReadModel("prr_req_mutated"));
    } catch {
      // Explicit runtime read-only errors are acceptable; later reads must be unchanged.
    }

    expect(projection.requests.size).toBe(9);
    expect(projection.requests.has("prr_req_mutated")).toBe(false);
    expect([...projection.requests.keys()]).toContain("prr_req_001");
  });

  it("prevents runtime delete calls from mutating the request map", () => {
    const projection = buildPrrProjection(goldenPrrLedgerEvents);
    const mutableRequests = projection.requests as unknown as Map<string, PrrRequestReadModel>;

    try {
      mutableRequests.delete("prr_req_001");
    } catch {
      // Explicit runtime read-only errors are acceptable; later reads must be unchanged.
    }

    expect(projection.requests.size).toBe(9);
    expect(projection.requests.has("prr_req_001")).toBe(true);
    expect(projection.requests.get("prr_req_001")?.status).toBe("awaitingProduction");
  });

  it("prevents runtime clear calls from mutating the request map", () => {
    const projection = buildPrrProjection(goldenPrrLedgerEvents);
    const mutableRequests = projection.requests as unknown as Map<string, PrrRequestReadModel>;

    try {
      mutableRequests.clear();
    } catch {
      // Explicit runtime read-only errors are acceptable; later reads must be unchanged.
    }

    expect(projection.requests.size).toBe(9);
    expect([...projection.requests.values()].map((request) => request.prrRequestId)).toContain(
      "prr_req_001"
    );
  });

  it("protects timeline entries from caller mutation", () => {
    const projection = buildPrrProjection(goldenPrrLedgerEvents);
    const firstEntry = projection.timelineForRequest("prr_req_001")[0];
    expect(firstEntry).toBeDefined();

    try {
      (firstEntry as { eventId: string }).eventId = "evt_mutated";
    } catch {
      // Frozen timeline entries are acceptable; the later read must still be unchanged.
    }

    expect(projection.timelineForRequest("prr_req_001")[0]).toMatchObject({
      eventId: "evt_prr_req_001_created",
      type: "prr.request.created",
      occurredAt: "2026-07-01T12:00:00.000Z"
    });
  });

  it("updates status when a denial is recorded", () => {
    const projection = buildPrrProjection([...goldenPrrLedgerEvents, denialRecordedEvent()]);

    expect(projection.requests.get("prr_req_001")?.status).toBe("denied");
  });

  it("updates status when an appeal is created", () => {
    const projection = buildPrrProjection([...goldenPrrLedgerEvents, appealCreatedEvent()]);

    expect(projection.requests.get("prr_req_001")?.status).toBe("appealed");
  });

  it("updates status when a request is closed", () => {
    const projection = buildPrrProjection([...goldenPrrLedgerEvents, requestClosedEvent()]);

    expect(projection.requests.get("prr_req_001")?.status).toBe("closed");
  });

  it("exports the projection builder from the package entrypoint", () => {
    expect(exportedBuildPrrProjection).toBe(buildPrrProjection);
  });
});

function estimatedDeadlineEvent(deadlineDate: string): KnowledgeEventOf<"prr.deadline.estimated"> {
  return {
    id: `evt_prr_req_001_deadline_estimated_${deadlineDate.replaceAll("-", "_")}`,
    type: "prr.deadline.estimated",
    version: 1,
    streamId: "prr_req_001",
    sequence: 7,
    context: {
      ...systemContext,
      occurredAt: "2026-07-04T12:00:00.000Z",
      causationId: "evt_prr_req_001_deadline_confirmed"
    },
    payload: {
      prrRequestId: "prr_req_001",
      deadlineDate,
      confidence: "workflow",
      explanation: "Later workflow estimate should not override a confirmed deadline.",
      citedRules: [
        {
          jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
          label: "FOIA determination deadline",
          citation: "5 U.S.C. 552(a)(6)(A)(i)"
        }
      ]
    }
  };
}

function confirmedDeadlineEvent(deadlineDate: string): KnowledgeEventOf<"prr.deadline.confirmed"> {
  return {
    id: "evt_prr_req_001_deadline_confirmed",
    type: "prr.deadline.confirmed",
    version: 1,
    streamId: "prr_req_001",
    sequence: 6,
    context: {
      ...systemContext,
      causationId: "evt_prr_req_001_deadline_estimated"
    },
    payload: {
      prrRequestId: "prr_req_001",
      deadlineDate,
      confirmedBy: "actor_prr_test",
      rationale: "Requester confirmed the agency's statutory deadline calculation.",
      citedRules: [
        {
          jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
          label: "FOIA determination deadline",
          citation: "5 U.S.C. 552(a)(6)(A)(i)"
        }
      ]
    }
  };
}

function createdRequestEvent(prrRequestId: string): KnowledgeEventOf<"prr.request.created"> {
  return {
    id: `evt_${prrRequestId}_created`,
    type: "prr.request.created",
    version: 1,
    streamId: prrRequestId,
    sequence: 1,
    context: systemContext,
    payload: {
      prrRequestId,
      jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
      agency: { name: "Example Agency", email: "foia@example.gov" },
      requester: { name: "Example Requester", email: "requester@example.org" },
      requestText: "Please provide records.",
      status: "draft"
    }
  };
}

function feeChallengeWithoutEstimateEvent(): KnowledgeEventOf<"prr.fee.challenged"> {
  return {
    id: "evt_prr_fee_missing_estimate_challenged",
    type: "prr.fee.challenged",
    version: 1,
    streamId: "prr_fee_missing_estimate",
    sequence: 2,
    context: {
      ...systemContext,
      causationId: "evt_prr_fee_missing_estimate_created"
    },
    payload: {
      prrRequestId: "prr_fee_missing_estimate",
      feeChallengeId: "fee_challenge_missing_estimate",
      amountCents: 42500,
      rationale: "Requester challenged an unsupported fee demand.",
      approvedBy: "actor_prr_test",
      citedRules: [
        {
          jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
          label: "FOIA fee limits",
          citation: "5 U.S.C. 552(a)(4)(A)"
        }
      ]
    }
  };
}

function scopeAcceptanceWithoutProposalEvent(): KnowledgeEventOf<"prr.scope.narrowing.accepted"> {
  return {
    id: "evt_prr_scope_missing_proposal_accepted",
    type: "prr.scope.narrowing.accepted",
    version: 1,
    streamId: "prr_scope_missing_proposal",
    sequence: 2,
    context: {
      ...systemContext,
      causationId: "evt_prr_scope_missing_proposal_created"
    },
    payload: {
      prrRequestId: "prr_scope_missing_proposal",
      narrowingId: "narrow_missing_proposal",
      acceptedScope: "Accepted scope without a projected proposal",
      acceptedBy: "actor_prr_test",
      rationale: "Requester accepted a scope that must have a proposal first."
    }
  };
}

function scopeProposalEvent(
  prrRequestId: string,
  narrowingId: string
): KnowledgeEventOf<"prr.scope.narrowing.proposed"> {
  return {
    id: `evt_${prrRequestId}_${narrowingId}_proposed`,
    type: "prr.scope.narrowing.proposed",
    version: 1,
    streamId: prrRequestId,
    sequence: 2,
    context: {
      ...systemContext,
      causationId: `evt_${prrRequestId}_created`
    },
    payload: {
      prrRequestId,
      narrowingId,
      proposedScope: `Proposal for ${narrowingId}`,
      proposedBy: "Agency Records Office",
      sourceEvidenceId: `ev_scope_${narrowingId}`
    }
  };
}

function scopeAcceptanceEvent(
  prrRequestId: string,
  narrowingId: string
): KnowledgeEventOf<"prr.scope.narrowing.accepted"> {
  return {
    id: `evt_${prrRequestId}_${narrowingId}_accepted`,
    type: "prr.scope.narrowing.accepted",
    version: 1,
    streamId: prrRequestId,
    sequence: 3,
    context: {
      ...systemContext,
      causationId: `evt_${prrRequestId}_${narrowingId}_proposed`
    },
    payload: {
      prrRequestId,
      narrowingId,
      acceptedScope: `Accepted scope for ${narrowingId}`,
      acceptedBy: "actor_prr_test",
      rationale: "Requester accepted the proposed narrowing."
    }
  };
}

function mutableRequest(
  projection: ReturnType<typeof buildPrrProjection>,
  prrRequestId: string
): Record<string, any> {
  const request = projection.requests.get(prrRequestId);
  expect(request).toBeDefined();
  return request as unknown as Record<string, any>;
}

function attemptMutation(mutator: () => void): void {
  try {
    mutator();
  } catch {
    // Frozen nested read models are acceptable; later reads must still be unchanged.
  }
}

function evidenceIngestedEvent(id: string, sequence: number): KnowledgeEventOf<"evidence.ingested"> {
  return {
    id,
    type: "evidence.ingested",
    version: 1,
    streamId: `evidence_${id}`,
    sequence,
    context: systemContext,
    payload: {
      evidenceId: `ev_${id.replace("evt_", "")}`,
      source: { kind: "file", label: "ignored.txt" },
      contentHash: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      mediaType: "text/plain",
      sizeBytes: 12
    }
  };
}

function sentEventForUncreatedRequest(): KnowledgeEventOf<"prr.request.sent"> {
  return {
    id: "evt_prr_missing_001_sent",
    type: "prr.request.sent",
    version: 1,
    streamId: "prr_missing_001",
    sequence: 1,
    context: systemContext,
    payload: {
      prrRequestId: "prr_missing_001",
      correspondenceId: "corr_prr_missing_001",
      provider: "gmail",
      providerMessageId: "provider-message-missing-001",
      providerThreadId: "provider-thread-missing-001",
      idempotencyKey: "send_prr_missing_001_corr_prr_missing_001",
      subject: "Orphan request",
      bodyHash: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      attachmentEvidenceIds: [],
      sentAt: "2026-07-03T12:00:00.000Z",
      approvedBy: "actor_prr_test",
      rawMetadata: {
        accountEmail: "requester@example.org",
        provider: "gmail"
      }
    }
  };
}

function stallingDetectedEvent(): KnowledgeEventOf<"prr.stalling.detected"> {
  return {
    id: "evt_prr_req_001_stalling_detected",
    type: "prr.stalling.detected",
    version: 1,
    streamId: "prr_req_001",
    sequence: 6,
    context: {
      ...systemContext,
      occurredAt: "2026-07-31T12:00:00.000Z",
      causationId: "evt_prr_req_001_deadline_estimated"
    },
    payload: {
      prrRequestId: "prr_req_001",
      detectedAt: "2026-07-31T12:00:00.000Z",
      signals: [
        {
          kind: "deadline-breached",
          explanation: "The active deadline passed without adequate production."
        }
      ]
    }
  };
}

function stallingConfirmedEvent(): KnowledgeEventOf<"prr.stalling.confirmed"> {
  return {
    id: "evt_prr_req_001_stalling_confirmed",
    type: "prr.stalling.confirmed",
    version: 1,
    streamId: "prr_req_001",
    sequence: 7,
    context: {
      ...systemContext,
      occurredAt: "2026-07-31T13:00:00.000Z",
      causationId: "evt_prr_req_001_stalling_detected"
    },
    payload: {
      prrRequestId: "prr_req_001",
      confirmedBy: "actor_prr_test",
      rationale: "Requester reviewed the signal and agreed it indicates stalling.",
      signalKinds: ["deadline-breached"]
    }
  };
}

function denialRecordedEvent(): KnowledgeEventOf<"prr.denial.recorded"> {
  return {
    id: "evt_prr_req_001_denial_recorded",
    type: "prr.denial.recorded",
    version: 1,
    streamId: "prr_req_001",
    sequence: 6,
    context: {
      ...systemContext,
      occurredAt: "2026-07-20T12:00:00.000Z",
      causationId: "evt_prr_req_001_correspondence_received"
    },
    payload: {
      prrRequestId: "prr_req_001",
      denialId: "denial_prr_req_001",
      receivedAt: "2026-07-20T12:00:00.000Z",
      reason: "Agency denied the request in full.",
      sourceEvidenceId: "ev_prr_correspondence_001"
    }
  };
}

function appealCreatedEvent(): KnowledgeEventOf<"prr.appeal.created"> {
  return {
    id: "evt_prr_req_001_appeal_created",
    type: "prr.appeal.created",
    version: 1,
    streamId: "prr_req_001",
    sequence: 6,
    context: {
      ...systemContext,
      occurredAt: "2026-07-21T12:00:00.000Z",
      causationId: "evt_prr_req_001_denial_recorded"
    },
    payload: {
      prrRequestId: "prr_req_001",
      appealId: "appeal_prr_req_001",
      correspondenceId: "corr_prr_req_001_appeal",
      filedAt: "2026-07-21T12:00:00.000Z",
      approvedBy: "actor_prr_test",
      citedRules: [
        {
          jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
          label: "FOIA administrative appeal",
          citation: "5 U.S.C. 552(a)(6)(A)(i)"
        }
      ]
    }
  };
}

function requestClosedEvent(): KnowledgeEventOf<"prr.request.closed"> {
  return {
    id: "evt_prr_req_001_closed",
    type: "prr.request.closed",
    version: 1,
    streamId: "prr_req_001",
    sequence: 6,
    context: {
      ...systemContext,
      occurredAt: "2026-07-22T12:00:00.000Z",
      causationId: "evt_prr_req_001_production_received"
    },
    payload: {
      prrRequestId: "prr_req_001",
      closedAt: "2026-07-22T12:00:00.000Z",
      closedBy: "actor_prr_test",
      reason: "fulfilled"
    }
  };
}

function fakeRequestReadModel(prrRequestId: string): PrrRequestReadModel {
  return {
    prrRequestId,
    status: "draft",
    agencyName: "Mutated Agency",
    jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
    agency: { name: "Mutated Agency" },
    requester: { name: "Mutated Requester" },
    requestText: "Mutated request text",
    possibleStalling: false,
    confirmedStalling: false,
    stallingSignals: [],
    productionBatches: [],
    productionEvidenceIds: [],
    exemptions: []
  };
}
