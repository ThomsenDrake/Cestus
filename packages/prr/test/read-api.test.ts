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
    ...(overrides.activeDeadline === undefined ? {} : { activeDeadline: overrides.activeDeadline })
  };
}
