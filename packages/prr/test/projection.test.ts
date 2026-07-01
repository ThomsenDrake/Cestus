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

    expect(projection.requests.get("prr_req_001")).toEqual({
      prrRequestId: "prr_req_001",
      status: "awaitingProduction",
      agencyName: "Example Agency",
      activeDeadline: { deadlineDate: "2026-07-30", source: "estimated" },
      possibleStalling: false,
      confirmedStalling: false,
      productionEvidenceIds: ["ev_prr_production_001", "ev_prr_production_002"]
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

    expect(projection.timelineForRequest("prr_req_001")).toEqual([
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

    expect(projection.requests.get("prr_req_001")?.activeDeadline).toEqual({
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

    expect(projection.requests.get("prr_req_001")?.activeDeadline).toEqual({
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

    expect(projection.requests.size).toBe(1);
    expect(projection.timelineForRequest("prr_req_001").map((entry) => entry.type)).toEqual(
      goldenPrrLedgerEvents.map((event) => event.type)
    );
  });

  it("ignores PRR events that cannot apply because the request was never created", () => {
    const projection = buildPrrProjection([
      sentEventForUncreatedRequest(),
      ...goldenPrrLedgerEvents
    ]);

    expect(projection.requests.has("prr_missing_001")).toBe(false);
    expect(projection.timelineForRequest("prr_missing_001")).toEqual([]);
    expect(projection.requests.has("prr_req_001")).toBe(true);
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
    expect(projection.requests.get("prr_req_001")?.activeDeadline).toEqual({
      deadlineDate: "2026-07-25",
      source: "confirmed"
    });
  });

  it("preserves readonly request map read and iteration behavior", () => {
    const projection = buildPrrProjection(goldenPrrLedgerEvents);

    expect(projection.requests.size).toBe(1);
    expect(projection.requests.has("prr_req_001")).toBe(true);
    expect(projection.requests.get("prr_req_001")?.agencyName).toBe("Example Agency");
    expect([...projection.requests.keys()]).toEqual(["prr_req_001"]);
    expect([...projection.requests.values()].map((request) => request.prrRequestId)).toEqual([
      "prr_req_001"
    ]);
    expect([...projection.requests.entries()].map(([prrRequestId]) => prrRequestId)).toEqual([
      "prr_req_001"
    ]);
    expect([...projection.requests].map(([prrRequestId]) => prrRequestId)).toEqual([
      "prr_req_001"
    ]);

    const forEachRequestIds: string[] = [];
    projection.requests.forEach((request, prrRequestId, map) => {
      forEachRequestIds.push(`${prrRequestId}:${request.prrRequestId}:${map.size}`);
    });

    expect(forEachRequestIds).toEqual(["prr_req_001:prr_req_001:1"]);
  });

  it("prevents runtime set calls from mutating the request map", () => {
    const projection = buildPrrProjection(goldenPrrLedgerEvents);
    const mutableRequests = projection.requests as unknown as Map<string, PrrRequestReadModel>;

    try {
      mutableRequests.set("prr_req_mutated", fakeRequestReadModel("prr_req_mutated"));
    } catch {
      // Explicit runtime read-only errors are acceptable; later reads must be unchanged.
    }

    expect(projection.requests.size).toBe(1);
    expect(projection.requests.has("prr_req_mutated")).toBe(false);
    expect([...projection.requests.keys()]).toEqual(["prr_req_001"]);
  });

  it("prevents runtime delete calls from mutating the request map", () => {
    const projection = buildPrrProjection(goldenPrrLedgerEvents);
    const mutableRequests = projection.requests as unknown as Map<string, PrrRequestReadModel>;

    try {
      mutableRequests.delete("prr_req_001");
    } catch {
      // Explicit runtime read-only errors are acceptable; later reads must be unchanged.
    }

    expect(projection.requests.size).toBe(1);
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

    expect(projection.requests.size).toBe(1);
    expect([...projection.requests.values()].map((request) => request.prrRequestId)).toEqual([
      "prr_req_001"
    ]);
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

    expect(projection.timelineForRequest("prr_req_001")[0]).toEqual({
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
      subject: "Orphan request",
      bodyHash: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      sentAt: "2026-07-03T12:00:00.000Z",
      approvedBy: "actor_prr_test"
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
    possibleStalling: false,
    confirmedStalling: false,
    productionEvidenceIds: []
  };
}
