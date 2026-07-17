import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type * as TypeScript from "typescript";
import { describe, expect, it } from "vitest";
import * as publicAgentApi from "../src/index.js";

const agentSourceRoot = join(dirname(fileURLToPath(import.meta.url)), "../src");
const workspaceRoot = resolve(agentSourceRoot, "../../..");
const byokProviderPath = "packages/agent/src/byok-provider.ts";
const publicByokBoundaryExports = [
  "createByokProviderBoundary",
  "evaluateByokProviderBoundary",
  "type:ByokProviderBoundary",
  "type:ByokProviderBoundaryResult",
  "type:ByokProviderBoundarySelection",
  "type:ByokProviderRequestedUse"
];
const productionSourceExtensions = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".mjs",
  ".cjs"
]);
const require = createRequire(import.meta.url);
const ts = require("typescript") as typeof import("typescript");

function collectProductionSourceFiles(sourceRoot: string): string[] {
  return readdirSync(sourceRoot, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(sourceRoot, entry.name);
    if (entry.isDirectory()) {
      return collectProductionSourceFiles(entryPath);
    }
    return entry.isFile() && productionSourceExtensions.has(extname(entry.name))
      ? [entryPath]
      : [];
  });
}

function productionSourceFiles(root: string): string[] {
  const packagesRoot = join(root, "packages");
  if (!existsSync(packagesRoot)) {
    return [];
  }
  return readdirSync(packagesRoot, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isDirectory()) {
      return [];
    }
    return ["src", "bin"].flatMap((productionRootName) => {
      const sourceRoot = join(packagesRoot, entry.name, productionRootName);
      return existsSync(sourceRoot) ? collectProductionSourceFiles(sourceRoot) : [];
    });
  });
}

function scriptKindForFileName(fileName: string): TypeScript.ScriptKind {
  switch (extname(fileName)) {
    case ".tsx":
      return ts.ScriptKind.TSX;
    case ".js":
    case ".mjs":
    case ".cjs":
      return ts.ScriptKind.JS;
    default:
      return ts.ScriptKind.TS;
  }
}

function byokProviderModulePath(root: string): string {
  return join(root, "packages", "agent", "src", "byok-provider");
}

function withoutModuleSuffix(moduleSpecifier: string): string {
  const suffixStart = [moduleSpecifier.indexOf("?"), moduleSpecifier.indexOf("#")]
    .filter((index) => index >= 0)
    .reduce((first, index) => Math.min(first, index), moduleSpecifier.length);
  return moduleSpecifier.slice(0, suffixStart);
}

function extensionlessPath(path: string): string {
  const extension = extname(path);
  return productionSourceExtensions.has(extension) ? path.slice(0, -extension.length) : path;
}

function resolvesToPrivateByokModule(root: string, sourcePath: string, moduleSpecifier: string): boolean {
  const suffixlessSpecifier = withoutModuleSuffix(moduleSpecifier);
  if (suffixlessSpecifier === "@cestus/agent/byok-provider") {
    return true;
  }
  if (!suffixlessSpecifier.startsWith("./") && !suffixlessSpecifier.startsWith("../")) {
    return false;
  }
  return extensionlessPath(resolve(dirname(sourcePath), suffixlessSpecifier)) === byokProviderModulePath(root);
}

function sourceReferencesPrivateByokModule(root: string, sourcePath: string, source: string): boolean {
  const sourceFile = ts.createSourceFile(
    sourcePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKindForFileName(sourcePath)
  );
  let referencesPrivateModule = false;
  const visit = (node: TypeScript.Node): void => {
    if (
      ts.isStringLiteralLike(node) &&
      resolvesToPrivateByokModule(root, sourcePath, node.text)
    ) {
      referencesPrivateModule = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return referencesPrivateModule;
}

function privateByokImporters(root: string): string[] {
  return productionSourceFiles(root)
    .filter((sourcePath) => sourceReferencesPrivateByokModule(root, sourcePath, readFileSync(sourcePath, "utf8")))
    .map((sourcePath) => relative(root, sourcePath).split(sep).join("/"))
    .sort();
}

function publicByokExports(root: string): string[] {
  const indexPath = join(root, "packages", "agent", "src", "index.ts");
  const sourceFile = ts.createSourceFile(
    indexPath,
    readFileSync(indexPath, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const exports: string[] = [];
  for (const statement of sourceFile.statements) {
    if (
      !ts.isExportDeclaration(statement) ||
      statement.moduleSpecifier === undefined ||
      !ts.isStringLiteralLike(statement.moduleSpecifier) ||
      !resolvesToPrivateByokModule(root, indexPath, statement.moduleSpecifier.text)
    ) {
      continue;
    }
    if (statement.exportClause === undefined || ts.isNamespaceExport(statement.exportClause)) {
      exports.push("*");
      continue;
    }
    for (const specifier of statement.exportClause.elements) {
      exports.push(`${statement.isTypeOnly || specifier.isTypeOnly ? "type:" : ""}${specifier.name.text}`);
    }
  }
  return exports.sort();
}

describe("BYOK authority-reader import boundary", () => {
  it("publishes only safe BYOK boundary APIs and never a reader mint from the agent barrel", () => {
    expect(publicAgentApi.createByokProviderBoundary).toBeTypeOf("function");
    expect(publicAgentApi.evaluateByokProviderBoundary).toBeTypeOf("function");
    expect("createByokProviderAuthorityReader" in publicAgentApi).toBe(false);
    expect(publicByokExports(workspaceRoot)).toEqual([...publicByokBoundaryExports].sort());
  });

  it("permits only the safe public barrel export and no production reader mint, re-export, alias, or loader path", () => {
    expect(privateByokImporters(workspaceRoot)).toEqual([
      "packages/agent/src/index.ts"
    ]);
  });

  it("recognizes named, aliased, namespace, default, dynamic, CommonJS, re-export, and type-only reader paths", () => {
    const sourcePath = join(workspaceRoot, "packages", "agent", "src", "unauthorized-byok-reader.ts");
    const privateModuleForms = [
      'import { createByokProviderAuthorityReader } from "./byok-provider.js";',
      'import { createByokProviderAuthorityReader as mintReader } from "./byok-provider.js";',
      'import defaultReader from "./byok-provider.js";',
      'import * as readerModule from "./byok-provider.js";',
      'import type { ByokProviderAuthorityReader } from "./byok-provider.js";',
      'export { createByokProviderAuthorityReader as mintReader } from "./byok-provider.js";',
      'export * from "./byok-provider.js";',
      'export * as readerModule from "./byok-provider.js";',
      'export type { ByokProviderAuthorityReader } from "./byok-provider.js";',
      'void import("./byok-provider.js");',
      'void require("./byok-provider.js");',
      'const loader = require; void loader("./byok-provider.js");',
      'type ForgedReader = import("./byok-provider.js").ByokProviderAuthorityReader;'
    ];

    for (const source of privateModuleForms) {
      expect(sourceReferencesPrivateByokModule(workspaceRoot, sourcePath, source)).toBe(true);
    }
  });

  it("keeps the existing direct test-only reader mint separate from all production importers", () => {
    expect(readFileSync(join(workspaceRoot, "packages", "agent", "test", "byok-provider.test.ts"), "utf8"))
      .toContain('createByokProviderAuthorityReader');
    expect(privateByokImporters(workspaceRoot)).not.toContain(byokProviderPath);
  });
});
