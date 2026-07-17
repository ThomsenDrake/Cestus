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

type StaticValue =
  | { readonly kind: "string"; readonly value: string }
  | { readonly kind: "standard-loader" }
  | { readonly kind: "standard-module" };

function unwrapTransparentExpression(expression: TypeScript.Expression): TypeScript.Expression {
  let unwrapped = expression;
  while (
    ts.isParenthesizedExpression(unwrapped) ||
    ts.isAsExpression(unwrapped) ||
    ts.isTypeAssertionExpression(unwrapped) ||
    ts.isSatisfiesExpression(unwrapped) ||
    ts.isNonNullExpression(unwrapped)
  ) {
    unwrapped = unwrapped.expression;
  }
  return unwrapped;
}

function constAliasExpressions(sourceFile: TypeScript.SourceFile): ReadonlyMap<string, TypeScript.Expression> {
  const aliases = new Map<string, TypeScript.Expression>();
  const visit = (node: TypeScript.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isVariableDeclarationList(node.parent) &&
      (node.parent.flags & ts.NodeFlags.Const) !== 0 &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined
    ) {
      aliases.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return aliases;
}

function staticValue(
  expression: TypeScript.Expression,
  aliases: ReadonlyMap<string, TypeScript.Expression>,
  resolvingAliases = new Set<string>()
): StaticValue | undefined {
  const unwrapped = unwrapTransparentExpression(expression);
  if (ts.isStringLiteralLike(unwrapped)) {
    return { kind: "string", value: unwrapped.text };
  }
  if (ts.isTemplateExpression(unwrapped)) {
    let value = unwrapped.head.text;
    for (const span of unwrapped.templateSpans) {
      const interpolation = staticValue(span.expression, aliases, resolvingAliases);
      if (interpolation?.kind !== "string") {
        return undefined;
      }
      value += interpolation.value + span.literal.text;
    }
    return { kind: "string", value };
  }
  if (ts.isBinaryExpression(unwrapped) && unwrapped.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = staticValue(unwrapped.left, aliases, resolvingAliases);
    const right = staticValue(unwrapped.right, aliases, resolvingAliases);
    return left?.kind === "string" && right?.kind === "string"
      ? { kind: "string", value: left.value + right.value }
      : undefined;
  }
  if (ts.isIdentifier(unwrapped)) {
    const alias = aliases.get(unwrapped.text);
    if (alias !== undefined) {
      if (resolvingAliases.has(unwrapped.text)) {
        return undefined;
      }
      const nextResolvingAliases = new Set(resolvingAliases);
      nextResolvingAliases.add(unwrapped.text);
      return staticValue(alias, aliases, nextResolvingAliases);
    }
    if (unwrapped.text === "require") {
      return { kind: "standard-loader" };
    }
    if (unwrapped.text === "module") {
      return { kind: "standard-module" };
    }
    return undefined;
  }
  if (ts.isPropertyAccessExpression(unwrapped)) {
    return staticValue(unwrapped.expression, aliases, resolvingAliases)?.kind === "standard-module" &&
      unwrapped.name.text === "require"
      ? { kind: "standard-loader" }
      : undefined;
  }
  if (ts.isElementAccessExpression(unwrapped) && unwrapped.argumentExpression !== undefined) {
    const receiver = staticValue(unwrapped.expression, aliases, resolvingAliases);
    const key = staticValue(unwrapped.argumentExpression, aliases, resolvingAliases);
    return receiver?.kind === "standard-module" && key?.kind === "string" && key.value === "require"
      ? { kind: "standard-loader" }
      : undefined;
  }
  return undefined;
}

function importEqualsReferencesPrivateByokModule(
  root: string,
  sourcePath: string,
  declaration: TypeScript.ImportEqualsDeclaration
): boolean {
  return ts.isExternalModuleReference(declaration.moduleReference) &&
    declaration.moduleReference.expression !== undefined &&
    ts.isStringLiteralLike(declaration.moduleReference.expression) &&
    resolvesToPrivateByokModule(root, sourcePath, declaration.moduleReference.expression.text);
}

function importTypeReferencesPrivateByokModule(
  root: string,
  sourcePath: string,
  importType: TypeScript.ImportTypeNode
): boolean {
  return ts.isLiteralTypeNode(importType.argument) &&
    ts.isStringLiteralLike(importType.argument.literal) &&
    resolvesToPrivateByokModule(root, sourcePath, importType.argument.literal.text);
}

function standardLoaderReferencesPrivateByokModule(
  root: string,
  sourcePath: string,
  call: TypeScript.CallExpression,
  aliases: ReadonlyMap<string, TypeScript.Expression>
): boolean {
  const isStandardLoader = call.expression.kind === ts.SyntaxKind.ImportKeyword ||
    staticValue(call.expression, aliases)?.kind === "standard-loader";
  if (!isStandardLoader) {
    return false;
  }
  const target = call.arguments[0] === undefined
    ? undefined
    : staticValue(call.arguments[0], aliases);
  return target?.kind !== "string" || resolvesToPrivateByokModule(root, sourcePath, target.value);
}

function sourceReferencesPrivateByokModule(root: string, sourcePath: string, source: string): boolean {
  const sourceFile = ts.createSourceFile(
    sourcePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKindForFileName(sourcePath)
  );
  const aliases = constAliasExpressions(sourceFile);
  let referencesPrivateModule = false;
  const visit = (node: TypeScript.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteralLike(node.moduleSpecifier) &&
      resolvesToPrivateByokModule(root, sourcePath, node.moduleSpecifier.text)
    ) {
      referencesPrivateModule = true;
      return;
    }
    if (ts.isImportEqualsDeclaration(node) && importEqualsReferencesPrivateByokModule(root, sourcePath, node)) {
      referencesPrivateModule = true;
      return;
    }
    if (ts.isImportTypeNode(node) && importTypeReferencesPrivateByokModule(root, sourcePath, node)) {
      referencesPrivateModule = true;
      return;
    }
    if (ts.isCallExpression(node) && standardLoaderReferencesPrivateByokModule(root, sourcePath, node, aliases)) {
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

  it("recognizes split, concatenated, templated, aliased, and transparently wrapped standard loader targets", () => {
    const sourcePath = join(workspaceRoot, "packages", "agent", "src", "computed-byok-reader.ts");
    const privateStandardLoaderForms = [
      'const target = "./byok-" + "provider.js"; void import(target);',
      'const target = `./byok-${"provider.js"}`; void import(target);',
      'const prefix = "./byok-"; const suffix = "provider.js"; void import(prefix + suffix);',
      'const target = "./byok-" + "provider.js"; const loader = require; void loader(target);',
      'const target = "./byok-" + "provider.js"; void module.require(target);',
      'const target = "./byok-" + "provider.js"; void module["require"](target);',
      'const target = "./byok-" + "provider.js"; void ((require as (path: string) => unknown)!)(target as string);',
      'const target = "./byok-" + "provider.js"; void ((require satisfies (path: string) => unknown) as (path: string) => unknown)(target satisfies string);',
      'const target = "./byok-" + "provider.js"; void ((module as { require(path: string): unknown })!).require((target as string)!);',
      'const target = "./byok-" + "provider.js"; void module[(("require" as string) satisfies string)!]((target satisfies string)!);'
    ];

    for (const source of privateStandardLoaderForms) {
      expect(sourceReferencesPrivateByokModule(workspaceRoot, sourcePath, source)).toBe(true);
    }
  });

  it("fails closed for unresolved standard loader targets while allowing resolved unrelated roots and custom loaders", () => {
    const sourcePath = join(workspaceRoot, "packages", "agent", "src", "loader-policy-byok-reader.ts");
    const unresolvedStandardLoaders = [
      "void import(target);",
      "void require(target);",
      "void module.require(target);",
      "void module[\"require\"](target);"
    ];
    const allowedSources = [
      'void import("./byok-provider-lookalike.js");',
      'void import("../../local-runtime/src/byok-provider.js");',
      'void import("./nested/byok-provider.js");',
      'void customLoader("./byok-provider.js");',
      'const loader = customLoader; void loader("./byok-provider.js");',
      'const require = customLoader; void require("./byok-provider.js");',
      'const module = { require: customLoader }; void module.require("./byok-provider.js");'
    ];

    for (const source of unresolvedStandardLoaders) {
      expect(sourceReferencesPrivateByokModule(workspaceRoot, sourcePath, source)).toBe(true);
    }
    for (const source of allowedSources) {
      expect(sourceReferencesPrivateByokModule(workspaceRoot, sourcePath, source)).toBe(false);
    }
  });

  it("tracks only lexical standard loader bindings through destructuring, official createRequire, and comma indirection", () => {
    const sourcePath = join(workspaceRoot, "packages", "agent", "src", "lexical-byok-reader.ts");
    const privateLexicalLoaderForms = [
      'const { require: loader } = module; void loader("./byok-provider.js");',
      'const { ["require"]: loader } = module; void loader("./byok-provider.js");',
      'import { createRequire } from "node:module"; void createRequire(import.meta.url)("./byok-provider.js");',
      'import { createRequire } from "node:module"; const load = createRequire(import.meta.url); void load("./byok-provider.js");',
      'void (0, require)("./byok-provider.js");'
    ];
    const unrelatedLexicalLoaderForms = [
      'function load(require: (target: string) => unknown) { void require("./byok-provider.js"); }',
      'function load(module: { require(target: string): unknown }) { void module.require("./byok-provider.js"); }',
      'function load(createRequire: (url: string) => (target: string) => unknown) { void createRequire(import.meta.url)("./byok-provider.js"); }',
      'const require = customLoader; void require("./byok-provider.js");',
      'const module = { require: customLoader }; void module.require("./byok-provider.js");',
      'const createRequire = customLoader; void createRequire(import.meta.url)("./byok-provider.js");',
      'import { require } from "custom-loader"; void require("./byok-provider.js");',
      'import { module } from "custom-loader"; void module.require("./byok-provider.js");',
      'import { createRequire } from "custom-loader"; void createRequire(import.meta.url)("./byok-provider.js");',
      'const { require: loader } = customLoader; void loader("./byok-provider.js");',
      'const { ["require"]: loader } = customLoader; void loader("./byok-provider.js");'
    ];

    for (const source of privateLexicalLoaderForms) {
      expect(sourceReferencesPrivateByokModule(workspaceRoot, sourcePath, source)).toBe(true);
    }
    for (const source of unrelatedLexicalLoaderForms) {
      expect(sourceReferencesPrivateByokModule(workspaceRoot, sourcePath, source)).toBe(false);
    }
  });

  it("keeps the existing direct test-only reader mint separate from all production importers", () => {
    expect(readFileSync(join(workspaceRoot, "packages", "agent", "test", "byok-provider.test.ts"), "utf8"))
      .toContain('createByokProviderAuthorityReader');
    expect(privateByokImporters(workspaceRoot)).not.toContain(byokProviderPath);
  });
});
