import { describe, expect, it } from "vitest";
import { dateNormalizationSchema, isGroundedDate, knowledgeTimeSchema, normalizeWrittenDate, partialDateSchema } from "../src/knowledge-dates.js";

describe("evidence-backed written dates", () => {
  it.each([
    ["September 5, 2026", "2026-09-05"], ["September 5 2026", "2026-09-05"],
    ["5 September 2026", "2026-09-05"], ["Sep. 5, 2026", "2026-09-05"],
    ["5 Sept 2026", "2026-09-05"], ["September 2026", "2026-09"],
    ["FEBRUARY 29, 2000", "2000-02-29"], ["January 1, 0099", "0099-01-01"]
  ])("normalizes %s retaining its precision", (sourceExpression, expected) => {
    expect(normalizeWrittenDate(sourceExpression)).toBe(expected);
    expect(isGroundedDate(expected, `The award occurred ${sourceExpression}.`, { method: "written-date.v1", sourceExpression, citationIndex: 0 })).toBe(true);
  });

  it.each(["09/05/2026", "05-09-2026", "September 5", "September", "5 September", "yesterday", "next September", "5 septembre 2026", "September 5, 26", "September 5, 2026 UTC", "September 5, 2026 12:00", "February 29, 2026", "April 31, 2026", "February 29, 1900"])("leaves unsupported or impossible expression %s unresolved", expression => {
    expect(normalizeWrittenDate(expression)).toBeUndefined();
  });

  it("requires the actual bounded expression and exact interpretation", () => {
    const normalization = { method: "written-date.v1" as const, sourceExpression: "5 September 2026", citationIndex: 0 };
    expect(isGroundedDate("2026-09-05", "The award occurred September 5, 2026.")).toBe(false);
    expect(isGroundedDate("2026-09-05", "On 15 September 2026", normalization)).toBe(false);
    expect(isGroundedDate("2026-09-05", "On 5 September 2026", normalization)).toBe(true);
    expect(isGroundedDate("2026-09-06", "On 5 September 2026", normalization)).toBe(false);
    expect(isGroundedDate("2026-09-05", "The amount was 2026. The award was 09/05.", normalization)).toBe(false);
    expect(isGroundedDate("2026-09-05", "On 5 September 2026", { ...normalization, method: "guess" } as never)).toBe(false);
    expect(dateNormalizationSchema.safeParse({ ...normalization, citationIndex: -1 }).success).toBe(false);
    expect(dateNormalizationSchema.safeParse({ ...normalization, locale: "en-US" }).success).toBe(false);
  });

  it("preserves exact ISO year, month and day without accepting unrelated number substrings", () => {
    for (const value of ["2026", "2026-09", "2026-09-05", "0000-02-29", "0099-01-01"]) expect(isGroundedDate(value, `Occurred ${value}.`)).toBe(true);
    for (const quote of ["Amount 12026", "Actor ID2026", "Amount 20260"]) expect(isGroundedDate("2026", quote)).toBe(false);
    expect(isGroundedDate("2026-09-05", "On 2026-09-050")).toBe(false);
  });
});

describe("calendar precision and time intervals", () => {
  it.each(["2026-02-29", "1900-02-29", "2026-04-31", "2026-00", "2026-13", "2026-01-00", "2026-01-32", "2026-9-5"])("rejects invalid calendar value %s", value => {
    expect(partialDateSchema.safeParse(value).success).toBe(false);
  });

  it("uses calendar bounds, not lexical ordering, for mixed precision", () => {
    for (const [start, end] of [["2026-09-05", "2026"], ["2026-09-05", "2026-09"], ["2026", "2026-01-01"], ["2026-09", "2026-09-05"]]) {
      expect(knowledgeTimeSchema.safeParse({ start, end, uncertain: true }).success).toBe(true);
    }
    for (const [start, end] of [["2027", "2026"], ["2026-10", "2026-09"], ["2026-09-06", "2026-09-05"], ["2026-10-01", "2026-09"]]) {
      expect(knowledgeTimeSchema.safeParse({ start, end, uncertain: true }).success).toBe(false);
    }
  });

  it("keeps normalized start and end provenance independently and requires an end for end provenance", () => {
    const startNormalization = { method: "written-date.v1", sourceExpression: "September 5, 2026", citationIndex: 0 };
    const endNormalization = { method: "written-date.v1", sourceExpression: "October 2026", citationIndex: 1 };
    const time = { start: "2026-09-05", end: "2026-10", uncertain: true, startNormalization, endNormalization };
    expect(knowledgeTimeSchema.parse(JSON.parse(JSON.stringify(time)))).toEqual(time);
    expect(knowledgeTimeSchema.safeParse({ start: "2026", uncertain: true, endNormalization }).success).toBe(false);
    expect(knowledgeTimeSchema.parse({ start: "2026", uncertain: false })).toEqual({ start: "2026", uncertain: false });
  });
});
