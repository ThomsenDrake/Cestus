import { describe, expect, it } from "vitest";
import { buildPrrProjection, type PrrProjection, type PrrRequestReadModel } from "../src/projection.js";
import { buildRequestQueueRows } from "../src/read-api.js";
import { goldenPrrLedgerEvents } from "./fixtures/golden-prr-ledger.js";

describe("PRR read API DTOs", () => {
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

function requestReadModel(
  overrides: Partial<PrrRequestReadModel> & Pick<PrrRequestReadModel, "prrRequestId">
): PrrRequestReadModel {
  return {
    prrRequestId: overrides.prrRequestId,
    status: overrides.status ?? "sent",
    agencyName: overrides.agencyName ?? "Example Agency",
    possibleStalling: overrides.possibleStalling ?? false,
    confirmedStalling: overrides.confirmedStalling ?? false,
    productionEvidenceIds: overrides.productionEvidenceIds ?? [],
    ...(overrides.activeDeadline === undefined ? {} : { activeDeadline: overrides.activeDeadline })
  };
}
