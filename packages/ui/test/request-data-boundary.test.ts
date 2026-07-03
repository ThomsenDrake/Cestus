import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Requests data boundary", () => {
  const prrRuntimeImport = "../../prr/src/" + "runtime";
  const prrRuntimeImportWithExtension = "../../prr/src/" + "runtime.js";
  const ledgerBackedSpecPath = "docs/superpowers/specs/2026-07-03-ledger-backed-prr-workspace-design.md";
  const ledgerBackedPlanPath = "docs/superpowers/plans/2026-07-03-ledger-backed-prr-workspace-implementation.md";

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
      expect(source).not.toContain("../../../prr/src/runtime.js");
      expect(source).not.toMatch(/from\s+["']node:[^"']+["']/);
      expect(source).not.toMatch(/from\s+["'](?:fs|path|crypto|child_process|os|sqlite)["']/);
      expect(source).not.toMatch(/from\s+["'][^"']*(?:sqlite-event-ledger|runtime)(?:\.js)?["']/);
    }
  });

  it("keeps UI tests off the Node-only PRR runtime module", () => {
    for (const file of listRequestSourceFiles("packages/ui/test").filter((path) => !path.endsWith("request-data-boundary.test.ts"))) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toContain(prrRuntimeImport);
      expect(source).not.toContain(prrRuntimeImportWithExtension);
    }
  });

  it("requires the ledger-backed PRR workspace docs in factory readiness", () => {
    const readinessScript = readFileSync("scripts/check-agent-readiness.mjs", "utf8");

    expect(readinessScript).toContain(ledgerBackedSpecPath);
    expect(readinessScript).toContain(ledgerBackedPlanPath);
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
