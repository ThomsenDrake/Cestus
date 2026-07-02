import { describe, expect, it } from "vitest";
import { detectStallingSignals } from "../src/stalling.js";

describe("stalling detection", () => {
  it("detects possible stalling without confirming it", () => {
    const result = detectStallingSignals({
      prrRequestId: "prr_req_001",
      activeDeadlineDate: "2026-07-01",
      today: "2026-07-10",
      responseCountAfterDeadline: 0,
      vagueDelayCount: 2,
      feeEstimateAmountCents: 450000
    });

    expect(result.possibleStalling).toBe(true);
    expect(result.confirmedStalling).toBe(false);
    expect(result.signals.map((signal) => signal.kind)).toEqual([
      "deadline-breached",
      "repeated-vague-delays",
      "high-fee-estimate"
    ]);
  });

  it("detects silence after the follow-up window", () => {
    const result = detectStallingSignals({
      prrRequestId: "prr_req_001",
      today: "2026-07-10",
      responseCountAfterDeadline: 0,
      vagueDelayCount: 0,
      daysSinceFollowup: 10
    });

    expect(result.possibleStalling).toBe(true);
    expect(result.confirmedStalling).toBe(false);
    expect(result.signals.map((signal) => signal.kind)).toEqual(["silence-after-followup"]);
  });

  it("does not propose stalling when no configured signal is present", () => {
    const result = detectStallingSignals({
      prrRequestId: "prr_req_001",
      activeDeadlineDate: "2026-07-10",
      today: "2026-07-10",
      responseCountAfterDeadline: 1,
      vagueDelayCount: 1,
      feeEstimateAmountCents: 99999,
      daysSinceFollowup: 9
    });

    expect(result).toEqual({
      prrRequestId: "prr_req_001",
      possibleStalling: false,
      confirmedStalling: false,
      signals: []
    });
  });

  it("does not flag a breached deadline when an adequate response was recorded after the deadline", () => {
    const result = detectStallingSignals({
      prrRequestId: "prr_req_001",
      activeDeadlineDate: "2026-07-01",
      today: "2026-07-10",
      responseCountAfterDeadline: 1,
      vagueDelayCount: 0
    });

    expect(result.signals.map((signal) => signal.kind)).not.toContain("deadline-breached");
  });

  it("throws clear errors for invalid identifiers, dates, and negative numeric inputs", () => {
    expect(() =>
      detectStallingSignals({
        prrRequestId: "request_001",
        today: "2026-07-10",
        responseCountAfterDeadline: 0,
        vagueDelayCount: 0
      })
    ).toThrow("Invalid prrRequestId");

    expect(() =>
      detectStallingSignals({
        prrRequestId: "prr_req_001",
        activeDeadlineDate: "2026-02-30",
        today: "2026-07-10",
        responseCountAfterDeadline: 0,
        vagueDelayCount: 0
      })
    ).toThrow("Invalid activeDeadlineDate");

    expect(() =>
      detectStallingSignals({
        prrRequestId: "prr_req_001",
        today: "2026-7-10",
        responseCountAfterDeadline: 0,
        vagueDelayCount: 0
      })
    ).toThrow("Invalid today");

    expect(() =>
      detectStallingSignals({
        prrRequestId: "prr_req_001",
        today: "2026-07-10",
        responseCountAfterDeadline: -1,
        vagueDelayCount: 0
      })
    ).toThrow("Invalid responseCountAfterDeadline");

    expect(() =>
      detectStallingSignals({
        prrRequestId: "prr_req_001",
        today: "2026-07-10",
        responseCountAfterDeadline: 0,
        vagueDelayCount: -1
      })
    ).toThrow("Invalid vagueDelayCount");

    expect(() =>
      detectStallingSignals({
        prrRequestId: "prr_req_001",
        today: "2026-07-10",
        responseCountAfterDeadline: 0,
        vagueDelayCount: 0,
        feeEstimateAmountCents: -1
      })
    ).toThrow("Invalid feeEstimateAmountCents");

    expect(() =>
      detectStallingSignals({
        prrRequestId: "prr_req_001",
        today: "2026-07-10",
        responseCountAfterDeadline: 0,
        vagueDelayCount: 0,
        daysSinceFollowup: -1
      })
    ).toThrow("Invalid daysSinceFollowup");
  });
});
