import { describe, expect, it } from "vitest";
import { buildPrrProjection } from "../../prr/src/projection.js";
import { buildPrrWorkspaceDto } from "../../prr/src/read-api.js";
import { prrWorkspaceSeedEvents } from "../../prr/src/workspace-seed.js";
import {
  buildPrrWorkspaceViewModel,
  getSelectedPrrRequest,
  prrLaneOrder,
  sendGateArmed,
  unresolvedEscalationPrerequisites
} from "../src/requests/request-model.js";

describe("PRR workspace model", () => {
  const visibleCards = (model: ReturnType<typeof buildPrrWorkspaceViewModel>) =>
    model.lanes.flatMap((lane) => lane.agencyGroups.flatMap((group) => group.cards));

  function buildTestRequestsWorkspace() {
    return buildPrrWorkspaceDto(buildPrrProjection(prrWorkspaceSeedEvents), {
      now: "2026-07-20T12:00:00.000Z"
    });
  }

  it("builds the approved seven-lane board grouped by agency by default", () => {
    const model = buildPrrWorkspaceViewModel(buildTestRequestsWorkspace(), {
      savedViewId: "all-active",
      selectedRequestId: "prr_fee_building_permits",
      viewMode: "board"
    });

    expect(model.lanes.map((lane) => lane.id)).toEqual(prrLaneOrder);
    expect(model.activeView.grouping).toBe("agency");
    expect(model.lanes.find((lane) => lane.id === "review-fee-scope")?.agencyGroups[0]).toMatchObject({
      agencyName: "Building Services Department",
      jurisdictionLabel: "Florida Public Records"
    });
  });

  it("applies saved views to mode, grouping, and filtered cards", () => {
    const model = buildPrrWorkspaceViewModel(buildTestRequestsWorkspace(), {
      savedViewId: "florida-fees",
      selectedRequestId: undefined,
      viewMode: undefined
    });

    expect(model.activeView.id).toBe("florida-fees");
    expect(model.viewMode).toBe("board");
    expect(model.activeView.grouping).toBe("agency");
    expect(visibleCards(model).map((card) => card.prrRequestId)).toEqual(["prr_fee_building_permits"]);
    expect(visibleCards(model)[0]).toMatchObject({
      laneId: "review-fee-scope",
      feeSignal: "$1,850.00 challenged",
      jurisdictionLabel: "Florida Public Records"
    });
  });

  it("filters the signal map to the active saved view request agencies", () => {
    const model = buildPrrWorkspaceViewModel(buildTestRequestsWorkspace(), {
      savedViewId: "productions-arrived",
      selectedRequestId: undefined,
      viewMode: undefined
    });
    const visibleNodeIds = new Set(model.signalMap.nodes.map((node) => node.id));

    expect(model.viewMode).toBe("signal-map");
    expect(model.signalMap.nodes.map((node) => node.agencyName)).toEqual(["Example Agency"]);
    expect(model.signalMap.edges).toEqual([]);
    expect(model.signalMap.edges.every((edge) => visibleNodeIds.has(edge.from) && visibleNodeIds.has(edge.to))).toBe(true);
  });

  it("derives selected request, send gate, and escalation prerequisites", () => {
    const selected = getSelectedPrrRequest(buildTestRequestsWorkspace(), "prr_fee_building_permits");

    expect(selected?.nextAction.label).toBe("Review fee or scope");
    expect(sendGateArmed(selected?.sendGate)).toBe(false);
    expect(unresolvedEscalationPrerequisites(selected?.escalationGate)).toEqual([
      "Confirmed basis",
      "Jurisdiction guidance",
      "Correspondence evidence",
      "User confirmed escalation"
    ]);
  });
});
