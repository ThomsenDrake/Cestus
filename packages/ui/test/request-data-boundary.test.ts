import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Requests data boundary", () => {
  const prrRuntimeImport = "../../prr/src/" + "runtime";
  const prrRuntimeImportWithExtension = "../../prr/src/" + "runtime.js";
  const ledgerBackedSpecPath = "docs/superpowers/specs/2026-07-03-ledger-backed-prr-workspace-design.md";
  const ledgerBackedPlanPath = "docs/superpowers/plans/2026-07-03-ledger-backed-prr-workspace-implementation.md";
  const productUiBoundaryFiles = listSourceFiles("packages/ui/src");

  it("scans every product UI source file for browser boundary drift", () => {
    expect(productUiBoundaryFiles).toContain("packages/ui/src/workspace/CommandBand.tsx");
    expect(productUiBoundaryFiles).toContain("packages/ui/src/workspace/workspace-nav.ts");
    expect(productUiBoundaryFiles).toContain("packages/ui/src/main.tsx");
  });

  it("keeps product Requests code off local card fixtures and Node-only runtime imports", () => {
    for (const file of productUiBoundaryFiles) {
      const source = readFileSync(file, "utf8");
      const moduleSpecifiers = importedModuleSpecifiers(source);

      expect(moduleSpecifiers).not.toEqual(
        expect.arrayContaining([expect.stringMatching(/(?:^|\/)request-fixtures(?:\.js)?$/)])
      );
      expect(moduleSpecifiers).not.toEqual(expect.arrayContaining([expect.stringMatching(/^node:/)]));
      expect(moduleSpecifiers).not.toEqual(expect.arrayContaining([expect.stringMatching(nodeRuntimeModulePattern)]));
      expect(moduleSpecifiers).not.toEqual(
        expect.arrayContaining([expect.stringMatching(/(?:^|\/)(?:runtime|sqlite-event-ledger)(?:\.js)?$/)])
      );
      expect(source).not.toContain("SQLiteEventLedger");
    }
  });

  it("keeps UI tests off the Node-only PRR runtime module", () => {
    for (const file of listSourceFiles("packages/ui/test").filter((path) => !path.endsWith("request-data-boundary.test.ts"))) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toContain(prrRuntimeImport);
      expect(source).not.toContain(prrRuntimeImportWithExtension);
    }
  });

  it("requires the ledger-backed PRR workspace docs in factory readiness", () => {
    const readinessScript = readFileSync("scripts/check-agent-readiness.mjs", "utf8");
    const requiredFiles = stringArrayInitializer(readinessScript, "requiredFiles");

    expect(requiredFiles).toEqual(expect.arrayContaining([ledgerBackedSpecPath, ledgerBackedPlanPath]));
  });
});

const nodeRuntimeModulePattern = /^(?:fs|path|crypto|child_process|os|sqlite|http|https|stream|url|buffer|process|module|net|tls|worker_threads)$/;

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return listSourceFiles(path);
    }

    return /\.[tj]sx?$/.test(entry.name) ? [path] : [];
  });
}

function importedModuleSpecifiers(source: string): readonly string[] {
  return Object.freeze([
    ...matchesFor(source, /from\s+["']([^"']+)["']/g),
    ...matchesFor(source, /import\s+["']([^"']+)["']/g),
    ...matchesFor(source, /import\s*\(\s*["']([^"']+)["']\s*\)/g),
    ...matchesFor(source, /require\s*\(\s*["']([^"']+)["']\s*\)/g)
  ]);
}

function stringArrayInitializer(source: string, variableName: string): readonly string[] {
  const match = source.match(new RegExp(`const\\s+${variableName}\\s*=\\s*\\[([\\s\\S]*?)\\];`));
  if (match?.[1] === undefined) {
    return Object.freeze([]);
  }

  return Object.freeze(matchesFor(match[1], /"([^"]+)"/g));
}

function matchesFor(source: string, pattern: RegExp): string[] {
  return [...source.matchAll(pattern)].map((match) => match[1] ?? "");
}
