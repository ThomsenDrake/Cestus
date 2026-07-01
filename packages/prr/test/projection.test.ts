import { describe, expect, it } from "vitest";
import {
  validateKnowledgeEvent,
  type KnowledgeEvent,
  type KnowledgeEventOf
} from "../../ontology/src/contracts.js";
import { buildPrrProjection as exportedBuildPrrProjection } from "../src/index.js";
import { buildPrrProjection } from "../src/projection.js";
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
