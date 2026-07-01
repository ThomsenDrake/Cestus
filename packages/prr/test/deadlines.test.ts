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

  it("accepts valid UTC datetimes without fractional seconds", () => {
    const result = calculateEstimatedDeadline(usFederalFoiaPack, {
      prrRequestId: "prr_req_001",
      receivedAt: "2026-07-01T12:00:00Z"
    });

    expect(result.deadlineDate).toBe("2026-07-30");
  });

  it("accepts valid UTC datetimes with higher-precision fractional seconds", () => {
    const result = calculateEstimatedDeadline(usFederalFoiaPack, {
      prrRequestId: "prr_req_001",
      receivedAt: "2026-07-01T12:00:00.123456Z"
    });

    expect(result.deadlineDate).toBe("2026-07-30");
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

  it("calculates Florida acknowledgement as a separate workflow estimate", () => {
    const productionEstimate = calculateEstimatedDeadline(floridaPublicRecordsPack, {
      prrRequestId: "prr_req_002",
      receivedAt: "2026-07-01T12:00:00.000Z"
    });
    const acknowledgementEstimate = calculateEstimatedDeadline(floridaPublicRecordsPack, {
      prrRequestId: "prr_req_002",
      receivedAt: "2026-07-01T12:00:00.000Z",
      estimateKind: "acknowledgement"
    });

    expect(productionEstimate.deadlineDate).toBe("2026-07-11");
    expect(acknowledgementEstimate.deadlineDate).toBe("2026-07-04");
    expect(acknowledgementEstimate.confidence).toBe("workflow");
    expect(acknowledgementEstimate.explanation).toContain("acknowledgement workflow estimate");
    expect(acknowledgementEstimate.explanation).toContain(
      "not a fixed statutory response-day deadline"
    );
    expect(acknowledgementEstimate.citedRules[0]).toEqual(
      expect.objectContaining({
        jurisdictionPack: { name: "florida-public-records", version: "0.1.0" },
        citation: "Fla. Stat. 119.07"
      })
    );
  });

  it("throws a clear error when the Florida acknowledgement rule ID is missing", () => {
    const packWithoutAcknowledgementRule = jurisdictionPackSchema.parse({
      ...floridaPublicRecordsPack,
      rules: floridaPublicRecordsPack.rules.filter(
        (rule) => rule.id !== "florida-acknowledgement-workflow-estimate"
      )
    });

    expect(() =>
      calculateEstimatedDeadline(packWithoutAcknowledgementRule, {
        prrRequestId: "prr_req_002",
        receivedAt: "2026-07-01T12:00:00.000Z",
        estimateKind: "acknowledgement"
      })
    ).toThrow(
      "Jurisdiction pack florida-public-records@0.1.0 is missing rule florida-acknowledgement-workflow-estimate"
    );
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

  it("throws a clear error for unsupported starter pack versions", () => {
    const unsupportedVersionPack = jurisdictionPackSchema.parse({
      ...usFederalFoiaPack,
      version: "9.9.9"
    });

    expect(() =>
      calculateEstimatedDeadline(unsupportedVersionPack, {
        prrRequestId: "prr_req_004",
        receivedAt: "2026-07-01T12:00:00.000Z"
      })
    ).toThrow("Unsupported jurisdiction pack us-federal-foia@9.9.9");
  });

  it("throws a clear error when the federal deadline rule ID is missing", () => {
    const packWithMissingDeadlineRule = jurisdictionPackSchema.parse({
      ...usFederalFoiaPack,
      rules: [
        {
          ...usFederalFoiaPack.rules[0],
          id: "not-the-deadline-rule"
        }
      ]
    });

    expect(() =>
      calculateEstimatedDeadline(packWithMissingDeadlineRule, {
        prrRequestId: "prr_req_005",
        receivedAt: "2026-07-01T12:00:00.000Z"
      })
    ).toThrow(
      "Jurisdiction pack us-federal-foia@0.1.0 is missing rule federal-determination-20-working-days"
    );
  });

  it("throws a clear error for invalid receivedAt values", () => {
    expect(() =>
      calculateEstimatedDeadline(usFederalFoiaPack, {
        prrRequestId: "prr_req_006",
        receivedAt: "not-a-date"
      })
    ).toThrow("Invalid receivedAt");
  });

  it("throws a clear error for non-round-tripping receivedAt dates", () => {
    expect(() =>
      calculateEstimatedDeadline(usFederalFoiaPack, {
        prrRequestId: "prr_req_007",
        receivedAt: "2026-02-30T12:00:00.000Z"
      })
    ).toThrow("Invalid receivedAt");
  });

  it("throws a clear error for date-only receivedAt values", () => {
    expect(() =>
      calculateEstimatedDeadline(usFederalFoiaPack, {
        prrRequestId: "prr_req_008",
        receivedAt: "2026-07-01"
      })
    ).toThrow("Invalid receivedAt");
  });

  it("exports deadline helpers from the package entrypoint", () => {
    expect(exportedCalculateEstimatedDeadline).toBe(calculateEstimatedDeadline);
  });
});
