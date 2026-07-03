import type { CommandBoardInput } from "./command-types.js";

export const commandWorkspaceFixture = Object.freeze({
  todayIso: "2026-07-20",
  reviewedItemIds: Object.freeze([]),
  requestRows: Object.freeze([
    {
      prrRequestId: "prr_req_001",
      agencyName: "Example Agency",
      status: "awaitingProduction",
      deadlineDate: "2026-07-30",
      deadlineSource: "estimated",
      possibleStalling: false,
      confirmedStalling: false,
      productionCount: 2
    },
    {
      prrRequestId: "prr_req_oversight_014",
      agencyName: "Florida Department of Corrections",
      status: "inNegotiation",
      deadlineDate: "2026-07-23",
      deadlineSource: "confirmed",
      possibleStalling: true,
      confirmedStalling: false,
      productionCount: 0
    },
    {
      prrRequestId: "prr_req_airport_022",
      agencyName: "Miami-Dade Aviation Department",
      status: "awaitingProduction",
      deadlineDate: "2026-07-19",
      deadlineSource: "confirmed",
      possibleStalling: true,
      confirmedStalling: true,
      productionCount: 0
    }
  ]),
  diagnostics: Object.freeze([
    {
      diagnosticId: "diag_projection_gap_001",
      prrRequestId: "prr_req_airport_022",
      category: "projection",
      message: "Projection lag detected for accepted request event",
      repairHint: {
        violatedPath: "prr.projection.highWaterMark",
        allowedActions: Object.freeze(["Replay PRR projection from the append-only ledger"])
      }
    }
  ]),
  evidenceAlerts: Object.freeze([
    {
      evidenceId: "ev_prr_production_003",
      title: "Vendor email production landed",
      sourceLabel: "Himalaya inbox sync",
      receivedAt: "2026-07-20T12:30:00.000Z",
      linkedRequestId: "prr_req_001"
    },
    {
      evidenceId: "ev_dataset_budget_001",
      title: "Budget ledger import has unmatched agency names",
      sourceLabel: "local CSV ingest",
      receivedAt: "2026-07-20T10:05:00.000Z"
    }
  ])
} satisfies CommandBoardInput);
