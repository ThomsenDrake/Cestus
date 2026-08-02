import { describe, expect, it } from "vitest";
import { buildPrrProjection, type PrrProjection, type PrrRequestReadModel } from "../src/projection.js";
import { buildPrrWorkspaceDto, buildRequestQueueRows } from "../src/read-api.js";
import { goldenPrrLedgerEvents } from "./fixtures/golden-prr-ledger.js";

describe("PRR read API DTOs", () => {
  it("builds a rich workspace DTO from the golden projection", () => {
    const workspace = buildPrrWorkspaceDto(buildPrrProjection(goldenPrrLedgerEvents), {
      now: "2026-07-20T12:00:00.000Z"
    });

    expect(workspace.savedViews.map((view) => view.id)).toEqual([
      "all-active",
      "overdue",
      "florida-fees",
      "productions-arrived"
    ]);
    expect(workspace.laneOrder).toEqual([
      "drafting",
      "ready-to-send",
      "awaiting-agency",
      "needs-follow-up",
      "review-fee-scope",
      "production-arrived",
      "appeal-escalation"
    ]);
    expect(workspace.cards.map((card) => card.prrRequestId)).toContain("prr_fee_building_permits");
    expect(workspace.requestDetails.map((detail) => detail.prrRequestId)).toContain("prr_req_001");
    expect(workspace.signalMap.edges).toEqual([]);
    expect(workspace.builder.steps.every((step) => step.suggestedFills.length === 0)).toBe(true);
  });

  it("derives deterministic lane and gate posture from replayed events", () => {
    const workspace = buildPrrWorkspaceDto(buildPrrProjection(goldenPrrLedgerEvents), {
      now: "2026-07-20T12:00:00.000Z"
    });

    expect(cardById(workspace, "prr_draft_city_budget")).toMatchObject({
      laneId: "drafting",
      severity: "low",
      deadlineSource: "estimated"
    });
    expect(cardById(workspace, "prr_fee_building_permits")).toMatchObject({
      laneId: "review-fee-scope",
      severity: "high",
      feeSignal: "$1,850.00 challenged"
    });
    expect(cardById(workspace, "prr_stalling_vendor_emails")).toMatchObject({
      laneId: "appeal-escalation",
      severity: "critical"
    });

    const stallingDetail = detailById(workspace, "prr_stalling_vendor_emails");
    expect(stallingDetail.escalationGate.some((check) => check.id === "user-confirmed-escalation")).toBe(true);
    expect(stallingDetail.escalationGate.every((check) => typeof check.detail === "string")).toBe(true);
  });

  it("prepares a routine follow-up preview from an estimated deadline while keeping exact send review locked", () => {
    const request = requestReadModel({
      prrRequestId: "prr_followup_estimated",
      status: "sent",
      agency: { name: "Records Office", email: "records@example.gov" },
      requester: { name: "Avery Investigator", email: "avery@example.org" },
      requestText: "Please provide the requested meeting records.",
      activeDeadline: {
        deadlineDate: "2026-07-15",
        source: "estimated",
        confidence: "workflow",
        explanation: "Workflow estimate for a routine status check.",
        citedRules: [
          {
            jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
            label: "FOIA determination deadline",
            citation: "5 U.S.C. 552(a)(6)(A)(i)"
          }
        ]
      },
      latestOutboundCorrespondence: {
        correspondenceId: "corr_followup_estimated_sent",
        provider: "gmail",
        providerMessageId: "provider-message-followup-estimated",
        providerThreadId: "provider-thread-followup-estimated",
        subject: "Public records request for meeting records",
        occurredAt: "2026-07-01T12:00:00.000Z",
        bodyHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        evidenceIds: [],
        attachmentEvidenceIds: ["ev_original_request"]
      },
      latestInboundCorrespondence: {
        correspondenceId: "corr_followup_estimated_ack",
        provider: "gmail",
        providerMessageId: "provider-message-followup-estimated-ack",
        providerThreadId: "provider-thread-followup-estimated",
        subject: "Re: Public records request for meeting records",
        occurredAt: "2026-07-02T12:00:00.000Z",
        evidenceIds: ["ev_agency_acknowledgement"]
      }
    });
    const workspace = buildPrrWorkspaceDto(projectionFromRequests([request]), {
      now: "2026-07-20T12:00:00.000Z"
    });
    const detail = detailById(workspace, request.prrRequestId);

    expect(detail).toMatchObject({
      laneId: "needs-follow-up",
      followUpDraft: {
        kind: "routine-follow-up",
        deadlineBasis: {
          source: "estimated",
          deadlineDate: "2026-07-15"
        },
        recipients: ["records@example.gov"],
        subject: "Re: Public records request for meeting records",
        citations: [{ citation: "5 U.S.C. 552(a)(6)(A)(i)" }],
        attachmentEvidenceIds: [],
        evidenceIds: [],
        providerState: {
          provider: "gmail",
          reviewState: "requires-review"
        }
      }
    });
    expect(detail.sendGate.map((check) => check.id)).toEqual([
      "draft-body",
      "recipients",
      "subject",
      "citations",
      "attachments",
      "evidence",
      "risk-review",
      "provider-ready"
    ]);
    expect(detail.sendGate.every((check) => check.locked && !check.ready)).toBe(true);
    expect(detail.followUpDraft?.body).toContain("an estimated response date of 2026-07-15");
    expect(detail.followUpDraft?.body).not.toMatch(/appeal|enforcement|lawsuit|violation/i);

    const confirmedRequest: PrrRequestReadModel = {
      ...request,
      prrRequestId: "prr_followup_confirmed",
      activeDeadline: {
        ...request.activeDeadline!,
        source: "confirmed",
        confirmedBy: "actor_investigator"
      }
    };
    const confirmedDetail = detailById(
      buildPrrWorkspaceDto(projectionFromRequests([confirmedRequest]), {
        now: "2026-07-20T12:00:00.000Z"
      }),
      confirmedRequest.prrRequestId
    );
    expect(confirmedDetail.followUpDraft?.body).toContain("a confirmed response date of 2026-07-15");
    expect(confirmedDetail.followUpDraft?.body).not.toContain("an estimated response date");
  });

  it("defensively owns nested DTO data from projection inputs", () => {
    const deadlineRule = {
      jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
      label: "Original rule",
      citation: "Original citation"
    };
    const activeDeadline = {
      deadlineDate: "2026-07-30",
      source: "estimated" as const,
      confidence: "statutory" as const,
      explanation: "Original explanation",
      citedRules: [deadlineRule]
    };
    const productionBatch = {
      productionId: "prod_mutable",
      label: "Original production",
      receivedAt: "2026-07-15T12:00:00.000Z",
      evidenceIds: ["ev_original"]
    };
    const timelinePayload = {
      prrRequestId: "prr_mutable",
      evidenceIds: ["ev_timeline_original"],
      nested: { citedRules: [{ citation: "Timeline citation" }] }
    };
    const mutableRequest = requestReadModel({
      prrRequestId: "prr_mutable",
      activeDeadline,
      productionBatches: [productionBatch],
      productionEvidenceIds: productionBatch.evidenceIds
    });
    const projection: PrrProjection = {
      requests: new Map([[mutableRequest.prrRequestId, mutableRequest]]),
      diagnostics: [],
      timelineForRequest() {
        return [
          {
            eventId: "evt_mutable",
            type: "prr.production.received",
            occurredAt: "2026-07-15T12:00:00.000Z",
            payload: timelinePayload
          } as unknown as ReturnType<PrrProjection["timelineForRequest"]>[number]
        ];
      }
    };

    const workspace = buildPrrWorkspaceDto(projection, { now: "2026-07-20T12:00:00.000Z" });
    const detail = detailById(workspace, "prr_mutable");

    activeDeadline.deadlineDate = "2099-01-01";
    deadlineRule.citation = "Mutated citation";
    productionBatch.evidenceIds.push("ev_mutated");
    timelinePayload.evidenceIds.push("ev_timeline_mutated");
    timelinePayload.nested.citedRules[0]!.citation = "Mutated timeline citation";

    expect(detail.activeDeadline?.deadlineDate).toBe("2026-07-30");
    expect(detail.activeDeadline?.citedRules[0]?.citation).toBe("Original citation");
    expect(detail.productionBatches[0]?.evidenceIds).toEqual(["ev_original"]);
    expect(workspace.timeline[0]?.payload).toMatchObject({
      evidenceIds: ["ev_timeline_original"],
      nested: { citedRules: [{ citation: "Timeline citation" }] }
    });

    expect(() =>
      (detail.productionBatches as unknown as { push(batch: unknown): number }).push({
        productionId: "prod_returned_mutation"
      })
    ).toThrow(TypeError);
    expect(() =>
      (workspace.timeline[0]?.payload as { evidenceIds: string[] }).evidenceIds.push("ev_returned_mutation")
    ).toThrow(TypeError);
  });

  it("builds request queue rows without requiring workspace timelines", () => {
    const projection: PrrProjection = {
      requests: new Map([
        [
          "prr_req_queue_only",
          requestReadModel({
            prrRequestId: "prr_req_queue_only",
            agencyName: "Queue Only Agency"
          })
        ]
      ]),
      diagnostics: [],
      timelineForRequest() {
        throw new Error("queue rows must not request timelines");
      }
    };

    expect(buildRequestQueueRows(projection)).toStrictEqual([
      {
        prrRequestId: "prr_req_queue_only",
        agencyName: "Queue Only Agency",
        status: "sent",
        possibleStalling: false,
        confirmedStalling: false,
        productionCount: 0
      }
    ]);
  });

  it("uses collision-safe deterministic signal map node ids", () => {
    const workspace = buildPrrWorkspaceDto(
      projectionFromRequests([
        requestReadModel({ prrRequestId: "prr_req_a_slash_b", agencyName: "A/B" }),
        requestReadModel({ prrRequestId: "prr_req_a_space_b", agencyName: "A B" }),
        requestReadModel({ prrRequestId: "prr_req_a_dash_b", agencyName: "A--B" })
      ]),
      { now: "2026-07-20T12:00:00.000Z" }
    );

    const nodeIds = workspace.signalMap.nodes.map((node) => node.id);
    expect(new Set(nodeIds).size).toBe(3);
    expect(nodeIds).toEqual([...nodeIds].sort());
  });

  it("locks down high-signal workspace derivations for consumers", () => {
    const workspace = buildPrrWorkspaceDto(buildPrrProjection(goldenPrrLedgerEvents), {
      now: "2026-07-20T12:00:00.000Z"
    });

    expect(viewById(workspace, "florida-fees").cardIds).toEqual(["prr_fee_building_permits"]);
    expect(viewById(workspace, "productions-arrived").cardIds).toEqual(["prr_req_001"]);
    expect(laneById(workspace, "review-fee-scope").agencyGroups).toEqual([
      {
        agencyName: "Building Services Department",
        tone: "high",
        cardIds: ["prr_fee_building_permits"]
      },
      {
        agencyName: "Procurement Department",
        tone: "medium",
        cardIds: ["prr_scope_vendor_contracts"]
      }
    ]);
    expect(workspace.evidencePackets.map((packet) => packet.id)).toContain(
      "prr_req_001:production:prod_prr_req_001"
    );
    expect(actionById(workspace, "prr_fee_building_permits:review-fee-scope")).toMatchObject({
      kind: "review-fee-scope",
      severity: "high"
    });
    expect(workspace.builder.jurisdictionPacks.map((pack) => pack.name)).toEqual([
      "us-federal-foia",
      "florida-public-records"
    ]);
  });

  it("builds request queue rows without UI business logic", () => {
    const projection = buildPrrProjection(goldenPrrLedgerEvents);

    expect(buildRequestQueueRows(projection)).toHaveLength(9);
    expect(buildRequestQueueRows(projection)).toContainEqual({
      prrRequestId: "prr_req_001",
      agencyName: "Example Agency",
      status: "awaitingProduction",
      deadlineDate: "2026-07-30",
      deadlineSource: "estimated",
      possibleStalling: false,
      confirmedStalling: false,
      productionCount: 2
    });
  });

  it("sorts request queue rows by request id", () => {
    const projection = projectionFromRequests([
      requestReadModel({ prrRequestId: "prr_req_b", agencyName: "Beta Agency" }),
      requestReadModel({ prrRequestId: "prr_req_a", agencyName: "Alpha Agency" })
    ]);

    expect(buildRequestQueueRows(projection).map((row) => row.prrRequestId)).toStrictEqual([
      "prr_req_a",
      "prr_req_b"
    ]);
  });

  it("omits deadline fields when a request has no active deadline", () => {
    const projection = projectionFromRequests([
      requestReadModel({ prrRequestId: "prr_req_no_deadline" })
    ]);

    const [row] = buildRequestQueueRows(projection);

    expect(row).toStrictEqual({
      prrRequestId: "prr_req_no_deadline",
      agencyName: "Example Agency",
      status: "sent",
      possibleStalling: false,
      confirmedStalling: false,
      productionCount: 0
    });
    expect(row === undefined ? true : "deadlineDate" in row).toBe(false);
    expect(row === undefined ? true : "deadlineSource" in row).toBe(false);
  });
});

function projectionFromRequests(requests: readonly PrrRequestReadModel[]): PrrProjection {
  return {
    requests: new Map(requests.map((request) => [request.prrRequestId, request])),
    diagnostics: [],
    timelineForRequest() {
      return [];
    }
  };
}

function cardById(workspace: ReturnType<typeof buildPrrWorkspaceDto>, prrRequestId: string) {
  const card = workspace.cards.find((candidate) => candidate.prrRequestId === prrRequestId);
  if (card === undefined) {
    throw new Error(`Missing workspace card ${prrRequestId}`);
  }
  return card;
}

function detailById(workspace: ReturnType<typeof buildPrrWorkspaceDto>, prrRequestId: string) {
  const detail = workspace.requestDetails.find((candidate) => candidate.prrRequestId === prrRequestId);
  if (detail === undefined) {
    throw new Error(`Missing workspace detail ${prrRequestId}`);
  }
  return detail;
}

function viewById(workspace: ReturnType<typeof buildPrrWorkspaceDto>, viewId: string) {
  const view = workspace.savedViews.find((candidate) => candidate.id === viewId);
  if (view === undefined) {
    throw new Error(`Missing workspace view ${viewId}`);
  }
  return view;
}

function laneById(workspace: ReturnType<typeof buildPrrWorkspaceDto>, laneId: string) {
  const lane = workspace.lanes.find((candidate) => candidate.id === laneId);
  if (lane === undefined) {
    throw new Error(`Missing workspace lane ${laneId}`);
  }
  return lane;
}

function actionById(workspace: ReturnType<typeof buildPrrWorkspaceDto>, actionId: string) {
  const action = workspace.actionPackets.find((candidate) => candidate.id === actionId);
  if (action === undefined) {
    throw new Error(`Missing workspace action ${actionId}`);
  }
  return action;
}

function requestReadModel(
  overrides: Partial<PrrRequestReadModel> & Pick<PrrRequestReadModel, "prrRequestId">
): PrrRequestReadModel {
  return {
    prrRequestId: overrides.prrRequestId,
    status: overrides.status ?? "sent",
    agencyName: overrides.agencyName ?? "Example Agency",
    jurisdictionPack: overrides.jurisdictionPack ?? { name: "us-federal-foia", version: "0.1.0" },
    agency: overrides.agency ?? { name: overrides.agencyName ?? "Example Agency" },
    requester: overrides.requester ?? { name: "Example Requester" },
    requestText: overrides.requestText ?? "Please provide records.",
    possibleStalling: overrides.possibleStalling ?? false,
    confirmedStalling: overrides.confirmedStalling ?? false,
    stallingSignals: overrides.stallingSignals ?? [],
    productionBatches: overrides.productionBatches ?? [],
    productionEvidenceIds: overrides.productionEvidenceIds ?? [],
    exemptions: overrides.exemptions ?? [],
    ...(overrides.activeDeadline === undefined ? {} : { activeDeadline: overrides.activeDeadline }),
    ...(overrides.latestOutboundCorrespondence === undefined
      ? {}
      : { latestOutboundCorrespondence: overrides.latestOutboundCorrespondence }),
    ...(overrides.latestInboundCorrespondence === undefined
      ? {}
      : { latestInboundCorrespondence: overrides.latestInboundCorrespondence })
  };
}
