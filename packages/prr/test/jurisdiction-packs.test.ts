import { describe, expect, it } from "vitest";
import {
  floridaPublicRecordsPack,
  jurisdictionPackSchema,
  usFederalFoiaPack
} from "../src/jurisdiction-packs.js";
import {
  floridaPublicRecordsPack as exportedFloridaPublicRecordsPack,
  usFederalFoiaPack as exportedUsFederalFoiaPack
} from "../src/index.js";

describe("jurisdiction packs", () => {
  it("ships US Federal FOIA and Florida starter packs with agent guidance", () => {
    expect(jurisdictionPackSchema.parse(usFederalFoiaPack).rules.length).toBeGreaterThan(0);
    expect(jurisdictionPackSchema.parse(floridaPublicRecordsPack).rules.length).toBeGreaterThan(0);
    expect(usFederalFoiaPack.agentGuidance).toContain("20 working days");
    expect(floridaPublicRecordsPack.agentGuidance).toContain("workflow estimate");
  });

  it("includes the approved federal FOIA citation URL", () => {
    expect(usFederalFoiaPack.rules[0]?.citations).toContainEqual(
      expect.objectContaining({
        citation: expect.stringContaining("5 U.S.C. 552"),
        url: "https://www.justice.gov/oip/freedom-information-act-5-usc-552"
      })
    );
  });

  it("labels Florida dates as workflow estimates and cites approved sources", () => {
    expect(floridaPublicRecordsPack.agentGuidance).toContain("workflow estimate");
    expect(floridaPublicRecordsPack.agentGuidance).toContain(
      "not a fixed statutory response-day deadline"
    );
    expect(floridaPublicRecordsPack.rules[0]?.citations.map((citation) => citation.url)).toEqual([
      "https://www.flsenate.gov/laws/statutes/2025/119.07",
      "https://www.myfloridalegal.com/open-government/citizens"
    ]);
  });

  it("rejects packs without citations", () => {
    const result = jurisdictionPackSchema.safeParse({
      ...usFederalFoiaPack,
      rules: [{ ...usFederalFoiaPack.rules[0], citations: [] }]
    });

    expect(result.success).toBe(false);
  });

  it("exports starter packs from the package entrypoint", () => {
    expect(exportedUsFederalFoiaPack.name).toBe("us-federal-foia");
    expect(exportedFloridaPublicRecordsPack.name).toBe("florida-public-records");
  });
});
