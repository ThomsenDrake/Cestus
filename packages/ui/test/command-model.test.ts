import { describe, expect, it } from "vitest";
import { buildPrrProjection } from "../../prr/src/projection.js";
import { buildRequestQueueRows, type RequestQueueRow } from "../../prr/src/read-api.js";
import { goldenPrrLedgerEvents } from "../../prr/test/fixtures/golden-prr-ledger.js";
import { buildCommandBoardViewModel, filterQueueItems, getSelectedCommandItem } from "../src/workspace/command-model.js";
import { commandWorkspaceFixture } from "../src/workspace/command-fixtures.js";

describe("CommandBoardViewModel", () => {
  it("turns PRR projection rows into operator-friendly queue items", () => {
    const projection = buildPrrProjection(goldenPrrLedgerEvents);
    const rows = buildRequestQueueRows(projection);

    const model = buildCommandBoardViewModel({
      requestRows: rows,
      diagnostics: projection.diagnostics,
      evidenceAlerts: [],
      todayIso: "2026-07-20",
      reviewedItemIds: []
    });

    expect(model.statusMetrics).toContainEqual({
      id: "open-requests",
      label: "Open requests",
      value: "1",
      tone: "cyan"
    });
    expect(model.statusMetrics).toContainEqual({
      id: "due-soon",
      label: "Due soon",
      value: "1",
      tone: "amber"
    });
    expect(model.queueItems[0]).toMatchObject({
      id: "deadline:prr_req_001",
      kind: "deadline",
      severity: "medium",
      title: "Example Agency response window",
      sourceLabel: "estimated deadline",
      actionLabel: "Review deadline"
    });
  });

  it("prioritizes confirmed stalling before routine deadline items", () => {
    const rows: RequestQueueRow[] = [
      {
        prrRequestId: "prr_req_stalled",
        agencyName: "Stalled Agency",
        status: "awaitingProduction",
        deadlineDate: "2026-07-18",
        deadlineSource: "confirmed",
        possibleStalling: true,
        confirmedStalling: true,
        productionCount: 0
      },
      {
        prrRequestId: "prr_req_due",
        agencyName: "Due Agency",
        status: "sent",
        deadlineDate: "2026-07-21",
        deadlineSource: "estimated",
        possibleStalling: false,
        confirmedStalling: false,
        productionCount: 0
      }
    ];

    const model = buildCommandBoardViewModel({
      requestRows: rows,
      diagnostics: [],
      evidenceAlerts: [],
      todayIso: "2026-07-20",
      reviewedItemIds: []
    });

    expect(model.queueItems.map((item) => item.id)).toStrictEqual([
      "signal:prr_req_stalled",
      "deadline:prr_req_stalled",
      "deadline:prr_req_due"
    ]);
    expect(model.statusMetrics).toContainEqual({
      id: "stalled-signals",
      label: "Stalled signals",
      value: "1",
      tone: "red"
    });
  });

  it("filters queue items and returns selected detail without mutating the model", () => {
    const model = buildCommandBoardViewModel(commandWorkspaceFixture);

    expect(filterQueueItems(model.queueItems, "evidence").every((item) => item.kind === "evidence")).toBe(true);
    expect(filterQueueItems(model.queueItems, "all")).toHaveLength(model.queueItems.length);
    expect(getSelectedCommandItem(model, "evidence:ev_prr_production_003")?.detail.provenanceRefs).toStrictEqual([
      "ev_prr_production_003"
    ]);
    expect(getSelectedCommandItem(model, "missing")).toBeUndefined();
  });

  it("adds decision votes to the default rail and selected queue details", () => {
    const model = buildCommandBoardViewModel(commandWorkspaceFixture);
    const stalled = getSelectedCommandItem(model, "signal:prr_req_airport_022");

    expect(model.decisionRail.defaultVotes.map((vote) => [vote.id, vote.state])).toStrictEqual([
      ["legal-risk", "review"],
      ["factual-confidence", "watch"],
      ["cost-pressure", "review"]
    ]);

    expect(stalled?.detail.decisionVotes.map((vote) => [vote.id, vote.state])).toStrictEqual([
      ["legal-risk", "human-decision-required"],
      ["factual-confidence", "review"],
      ["cost-pressure", "watch"]
    ]);
    expect(stalled?.detail.provenanceRefs).toContain("prr_req_airport_022");
  });
});
