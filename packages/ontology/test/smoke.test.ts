import { describe, expect, it } from "vitest";
import { ontologyPackageName } from "../src/index.js";

describe("ontology package", () => {
  it("exposes a stable package name", () => {
    expect(ontologyPackageName).toBe("@cestus/ontology");
  });
});
