import { describe, expect, it } from "vitest";
import { prrPackageName } from "../src/index.js";

describe("prr package", () => {
  it("exposes a stable package name", () => {
    expect(prrPackageName).toBe("@cestus/prr");
  });
});
