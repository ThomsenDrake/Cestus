import { describe, expect, it } from "vitest";
import { ingestionPackageName } from "../src/index.js";

describe("ingestion package", () => {
  it("exposes a stable package name", () => {
    expect(ingestionPackageName).toBe("@cestus/ingestion");
  });
});
