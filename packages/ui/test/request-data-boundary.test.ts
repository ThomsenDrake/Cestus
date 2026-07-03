import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Requests data boundary", () => {
  it("keeps product Requests code off local card fixtures and Node-only runtime imports", () => {
    const productFiles = [
      "packages/ui/src/App.tsx",
      ...listRequestSourceFiles("packages/ui/src/requests").filter(
        (file) => !file.endsWith("request-fixtures.ts")
      )
    ];

    for (const file of productFiles) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toContain("request-fixtures");
      expect(source).not.toMatch(/from\s+["'][^"']*request-fixtures(?:\.js)?["']/);
      expect(source).not.toContain("node:sqlite");
      expect(source).not.toContain("SQLiteEventLedger");
      expect(source).not.toContain("../../../prr/src/runtime");
    }
  });
});

function listRequestSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return listRequestSourceFiles(path);
    }

    return /\.[tj]sx?$/.test(entry.name) ? [path] : [];
  });
}
