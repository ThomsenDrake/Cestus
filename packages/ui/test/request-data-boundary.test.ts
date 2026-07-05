import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Requests data boundary", () => {
  const prrRuntimeImport = "../../prr/src/" + "runtime";
  const prrRuntimeImportWithExtension = "../../prr/src/" + "runtime.js";
  const ledgerBackedSpecPath = "docs/superpowers/specs/2026-07-03-ledger-backed-prr-workspace-design.md";
  const ledgerBackedPlanPath = "docs/superpowers/plans/2026-07-03-ledger-backed-prr-workspace-implementation.md";
  const requestModalSpecPath = "docs/superpowers/specs/2026-07-04-requests-detail-modal-design.md";
  const requestModalPlanPath = "docs/superpowers/plans/2026-07-04-requests-detail-modal-implementation.md";
  const productUiBoundaryFiles = listSourceFiles("packages/ui/src");
  const forbiddenProductUiImportPatterns = [
    /(?:^|\/)request-fixtures(?:\.js)?$/,
    /^node:/,
    nodeRuntimeModulePattern,
    /(?:^|\/)(?:runtime|sqlite-event-ledger)(?:\.js)?$/,
    /(?:^|\/)prr\/src\/runtime(?:\.js)?$/,
    /(?:^|\/)local-runtime\/src\/(?:config|server|http-handler|runtime-factory)(?:\.js)?$/
  ];
  const forbiddenProductUiSourceFragments = [
    "SQLiteEventLedger",
    "sqlite-event-ledger",
    "packages/prr/src/runtime",
    "packages/local-runtime/src/config",
    "packages/local-runtime/src/server",
    "packages/local-runtime/src/http-handler",
    "packages/local-runtime/src/runtime-factory"
  ];

  it("scans every product UI source file for browser boundary drift", () => {
    expect(productUiBoundaryFiles).toContain("packages/ui/src/workspace/CommandBand.tsx");
    expect(productUiBoundaryFiles).toContain("packages/ui/src/workspace/workspace-nav.ts");
    expect(productUiBoundaryFiles).toContain("packages/ui/src/main.tsx");
    expect(productUiBoundaryFiles).toContain("packages/ui/src/requests/RequestDetailSections.tsx");
    expect(productUiBoundaryFiles).toContain("packages/ui/src/requests/RequestDetailModal.tsx");
    expect(productUiBoundaryFiles).toContain("packages/ui/src/requests/RequestWorkspaceIntelligenceRail.tsx");
  });

  it("keeps product Requests code off local card fixtures and Node-only runtime imports", () => {
    for (const file of productUiBoundaryFiles) {
      const source = readFileSync(file, "utf8");
      const moduleSpecifiers = importedModuleSpecifiers(source);

      for (const pattern of forbiddenProductUiImportPatterns) {
        expect(moduleSpecifiers).not.toEqual(expect.arrayContaining([expect.stringMatching(pattern)]));
      }
      for (const fragment of forbiddenProductUiSourceFragments) {
        expect(source).not.toContain(fragment);
      }
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
    expect(requiredFiles).toEqual(expect.arrayContaining([requestModalSpecPath, requestModalPlanPath]));
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
