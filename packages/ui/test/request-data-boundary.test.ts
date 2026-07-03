import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Requests data boundary", () => {
  it("keeps product Requests code off local card fixtures and Node-only runtime imports", () => {
    const productFiles = [
      "packages/ui/src/App.tsx",
      "packages/ui/src/requests/request-model.ts",
      "packages/ui/src/requests/request-adapter.ts",
      "packages/ui/src/requests/RequestWorkspace.tsx"
    ];

    for (const file of productFiles) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toContain("request-fixtures");
      expect(source).not.toContain("node:sqlite");
      expect(source).not.toContain("SQLiteEventLedger");
      expect(source).not.toContain("../../../prr/src/runtime");
    }
  });
});
