import { describe, expect, it } from "vitest";
import { prrWorkspaceFixture } from "../src/requests/request-fixtures.js";
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

  it("builds the approved seven-lane board grouped by agency by default", () => {
    const model = buildPrrWorkspaceViewModel(prrWorkspaceFixture, {
      savedViewId: "all-active",
      selectedRequestId: "prr_req_airport_022",
      viewMode: "board"
    });

    expect(model.lanes.map((lane) => lane.id)).toEqual(prrLaneOrder);
    expect(model.activeView.grouping).toBe("agency");
    expect(model.lanes.find((lane) => lane.id === "ready-to-send")?.agencyGroups[0]).toMatchObject({
      agencyName: "Federal Aviation Administration",
      jurisdictionLabel: "US Federal FOIA"
    });
  });

  it("applies saved views to mode, grouping, and filtered cards", () => {
    const model = buildPrrWorkspaceViewModel(prrWorkspaceFixture, {
      savedViewId: "florida-fees",
      selectedRequestId: undefined,
      viewMode: undefined
    });

    expect(model.activeView.id).toBe("florida-fees");
    expect(model.viewMode).toBe("board");
    expect(model.activeView.grouping).toBe("agency");
    expect(visibleCards(model).map((card) => card.prrRequestId)).toEqual(["prr_req_sheriff_045"]);
    expect(visibleCards(model)[0]).toMatchObject({
      laneId: "review-fee-scope",
      feeSignal: "$4,500 estimate",
      jurisdictionLabel: "Florida Public Records"
    });
  });

  it("filters saved views by agency IDs", () => {
    const agencyFilteredFixture = Object.freeze({
      ...prrWorkspaceFixture,
      savedViews: Object.freeze([
        ...prrWorkspaceFixture.savedViews,
        Object.freeze({
          id: "faa-only",
          label: "FAA only",
          mode: "board",
          grouping: "agency",
          filters: Object.freeze({ agencyIds: Object.freeze(["agency_faa"] as const) })
        })
      ])
    });

    const model = buildPrrWorkspaceViewModel(agencyFilteredFixture, {
      savedViewId: "faa-only",
      selectedRequestId: undefined,
      viewMode: undefined
    });

    expect(visibleCards(model).map((card) => card.prrRequestId)).toEqual(["prr_req_001"]);
    expect(visibleCards(model).every((card) => card.agencyId === "agency_faa")).toBe(true);
  });

  it("filters the signal map to the active saved view request agencies", () => {
    const model = buildPrrWorkspaceViewModel(prrWorkspaceFixture, {
      savedViewId: "productions-arrived",
      selectedRequestId: undefined,
      viewMode: undefined
    });
    const visibleNodeIds = new Set(model.signalMap.nodes.map((node) => node.id));

    expect(model.viewMode).toBe("signal-map");
    expect(model.signalMap.nodes.map((node) => node.agencyId)).toEqual(["agency_city"]);
    expect(model.signalMap.edges.every((edge) => visibleNodeIds.has(edge.from) && visibleNodeIds.has(edge.to))).toBe(true);
  });

  it("derives selected request, send gate, and escalation prerequisites", () => {
    const selected = getSelectedPrrRequest(prrWorkspaceFixture, "prr_req_transit_031");

    expect(selected?.nextAction.label).toBe("Confirm escalation basis");
    expect(sendGateArmed(selected?.sendGate)).toBe(false);
    expect(unresolvedEscalationPrerequisites(selected?.escalationGate)).toEqual(["User confirmation"]);
  });
});
