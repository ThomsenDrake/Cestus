import { describe, expect, it } from "vitest";
import {
  calculateEstimatedDeadline,
  chooseActiveDeadline
} from "../src/deadlines.js";
import { calculateEstimatedDeadline as exportedCalculateEstimatedDeadline } from "../src/index.js";
import { floridaPublicRecordsPack, usFederalFoiaPack } from "../src/jurisdiction-packs.js";

describe("deadline calculators", () => {
  it("calculates a federal FOIA 20-working-day estimate", () => {
    const result = calculateEstimatedDeadline(usFederalFoiaPack, {
      prrRequestId: "prr_req_001",
      receivedAt: "2026-07-01T12:00:00.000Z"
    });

    expect(result.deadlineDate).toBe("2026-07-29");
    expect(result.confidence).toBe("statutory");
    expect(result.citedRules[0]?.citation).toContain("5 U.S.C. 552");
  });

  it("labels Florida deadlines as workflow estimates", () => {
    const result = calculateEstimatedDeadline(floridaPublicRecordsPack, {
      prrRequestId: "prr_req_002",
      receivedAt: "2026-07-01T12:00:00.000Z"
    });

    expect(result.confidence).toBe("workflow");
    expect(result.explanation).toContain("not a fixed statutory response-day deadline");
  });

  it("prefers confirmed deadlines over estimates", () => {
    expect(
      chooseActiveDeadline({
        estimated: { deadlineDate: "2026-07-29", source: "estimated" },
        confirmed: { deadlineDate: "2026-07-25", source: "confirmed" }
      })
    ).toEqual({ deadlineDate: "2026-07-25", source: "confirmed" });
  });

  it("falls back to estimates when no confirmed deadline exists", () => {
    expect(
      chooseActiveDeadline({
        estimated: { deadlineDate: "2026-07-29", source: "estimated" }
      })
    ).toEqual({ deadlineDate: "2026-07-29", source: "estimated" });
  });

  it("exports deadline helpers from the package entrypoint", () => {
    expect(exportedCalculateEstimatedDeadline).toBe(calculateEstimatedDeadline);
  });
});
