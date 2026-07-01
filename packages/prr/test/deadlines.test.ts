import { describe, expect, it } from "vitest";
import {
  calculateEstimatedDeadline,
  chooseActiveDeadline
} from "../src/deadlines.js";
import { calculateEstimatedDeadline as exportedCalculateEstimatedDeadline } from "../src/index.js";
import {
  floridaPublicRecordsPack,
  jurisdictionPackSchema,
  usFederalFoiaPack
} from "../src/jurisdiction-packs.js";

describe("deadline calculators", () => {
  it("calculates a federal FOIA 20-working-day estimate excluding observed legal public holidays", () => {
    const result = calculateEstimatedDeadline(usFederalFoiaPack, {
      prrRequestId: "prr_req_001",
      receivedAt: "2026-07-01T12:00:00.000Z"
    });

    expect(result.deadlineDate).toBe("2026-07-30");
    expect(result.confidence).toBe("statutory");
    expect(result.citedRules[0]?.citation).toContain("5 U.S.C. 552");
  });

  it("includes jurisdiction pack references in cited rules", () => {
    const result = calculateEstimatedDeadline(usFederalFoiaPack, {
      prrRequestId: "prr_req_001",
      receivedAt: "2026-07-01T12:00:00.000Z"
    });

    expect(result.citedRules[0]).toEqual(
      expect.objectContaining({
        jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
        citation: expect.stringContaining("5 U.S.C. 552")
      })
    );
  });

  it("returns cited rule copies so one calculation cannot mutate later calculations", () => {
    const firstResult = calculateEstimatedDeadline(usFederalFoiaPack, {
      prrRequestId: "prr_req_001",
      receivedAt: "2026-07-01T12:00:00.000Z"
    });

    try {
      (firstResult.citedRules[0] as { citation: string }).citation = "mutated citation";
    } catch {
      // Frozen output is also acceptable; the next calculation must stay clean either way.
    }

    const secondResult = calculateEstimatedDeadline(usFederalFoiaPack, {
      prrRequestId: "prr_req_002",
      receivedAt: "2026-07-01T12:00:00.000Z"
    });

    expect(secondResult.citedRules[0]?.citation).toContain("5 U.S.C. 552");
    expect(usFederalFoiaPack.rules[0]?.citations[0]?.citation).toContain("5 U.S.C. 552");
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
        estimated: { deadlineDate: "2026-07-30", source: "estimated" },
        confirmed: { deadlineDate: "2026-07-25", source: "confirmed" }
      })
    ).toEqual({ deadlineDate: "2026-07-25", source: "confirmed" });
  });

  it("falls back to estimates when no confirmed deadline exists", () => {
    expect(
      chooseActiveDeadline({
        estimated: { deadlineDate: "2026-07-30", source: "estimated" }
      })
    ).toEqual({ deadlineDate: "2026-07-30", source: "estimated" });
  });

  it("throws a clear error for unsupported jurisdiction packs", () => {
    const unsupportedPack = jurisdictionPackSchema.parse({
      ...usFederalFoiaPack,
      name: "unsupported-public-records",
      jurisdiction: "Unsupported jurisdiction",
      description: "Schema-valid pack that has no deadline calculator implementation."
    });

    expect(() =>
      calculateEstimatedDeadline(unsupportedPack, {
        prrRequestId: "prr_req_003",
        receivedAt: "2026-07-01T12:00:00.000Z"
      })
    ).toThrow("Unsupported jurisdiction pack unsupported-public-records@0.1.0");
  });

  it("throws a clear error for invalid receivedAt values", () => {
    expect(() =>
      calculateEstimatedDeadline(usFederalFoiaPack, {
        prrRequestId: "prr_req_004",
        receivedAt: "not-a-date"
      })
    ).toThrow("Invalid receivedAt");
  });

  it("exports deadline helpers from the package entrypoint", () => {
    expect(exportedCalculateEstimatedDeadline).toBe(calculateEstimatedDeadline);
  });
});
