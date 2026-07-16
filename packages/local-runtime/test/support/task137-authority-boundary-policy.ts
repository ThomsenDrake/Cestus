import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import * as ts from "typescript";

export interface Task137PolicyViolation {
  readonly category: string;
  readonly path: string;
  readonly detail: string;
}

export const task137GrammarVersion = "task137-authority-import-grammar.v1" as const;
export const task137CorpusVersion = "task137-authority-import-corpus.v1" as const;

type ImportPosition = "value" | "type";

interface ProtectedModule {
  readonly sourcePath: string;
  readonly stem: string;
}

interface DynamicImportExemption {
  readonly path: string;
  readonly specifier: string;
}

const sourceExtensions = new Set([".ts", ".tsx", ".mts", ".cts"]);
const protectedModules: readonly ProtectedModule[] = [
  {
    sourcePath: "packages/local-runtime/src/mounted-artifact-authority-operation.ts",
    stem: "mounted-artifact-authority-operation"
  },
  {
    sourcePath: "packages/local-runtime/src/portable-workspace-lifecycle.ts",
    stem: "portable-workspace-lifecycle"
  }
];
const runtimeFactoryAuthorityModule: ProtectedModule = {
  sourcePath: "packages/local-runtime/src/runtime-factory.ts",
  stem: "runtime-factory"
};
const runtimeFactoryAuthorityNames = new Set([
  "captureFactoryIssuedMountedRuntime",
  "inspectFactoryIssuedMountedRuntimeCapture",
  "FactoryIssuedMountedRuntimeCapture",
  "FactoryIssuedMountedRuntimeSourceHighWater",
  "FactoryIssuedMountedWorkspaceSnapshot"
]);

const dynamicImportExemptions: readonly DynamicImportExemption[] = [
  { path: "packages/ingestion/src/cli-runner.ts", specifier: "./index.js" },
  { path: "packages/workspace-ops/src/node-runner.ts", specifier: "node:sqlite" }
];

const allowedAuthorityImports = new Map<string, Map<string, Map<string, ImportPosition>>>([
  [
    "packages/local-runtime/src/mounted-artifact-authority-operation.ts",
    new Map([
      [
        "packages/local-runtime/src/portable-workspace-lifecycle.ts",
        allowedNames({
          value: [
            "assertPortableWorkspaceLifecyclePortsForMountedArtifactAuthority",
            "inspectCurrentPortableWorkspaceAdmissionForMountedArtifactAuthority"
          ],
          type: ["PortableWorkspaceLifecyclePorts", "PortableWorkspaceMountedFacts"]
        })
      ],
      [
        "packages/local-runtime/src/runtime-factory.ts",
        allowedNames({
          value: ["captureFactoryIssuedMountedRuntime", "inspectFactoryIssuedMountedRuntimeCapture"],
          type: [
            "FactoryIssuedMountedRuntimeCapture",
            "FactoryIssuedMountedRuntimeSourceHighWater",
            "FactoryIssuedMountedWorkspaceSnapshot",
            "LocalRuntimeHandle"
          ]
        })
      ]
    ])
  ],
  [
    "packages/local-runtime/src/wake-supervisor-runtime.ts",
    new Map([
      [
        "packages/local-runtime/src/mounted-artifact-authority-operation.ts",
        allowedNames({ value: ["registerMountedArtifactAuthorityIssuerForWakeRuntime"], type: [] })
      ]
    ])
  ],
  [
    "packages/local-runtime/src/agent-runtime-factory.ts",
    new Map([
      [
        "packages/local-runtime/src/mounted-artifact-authority-operation.ts",
        allowedNames({ value: ["issueMountedArtifactAuthorityOperationForFactory"], type: [] })
      ]
    ])
  ],
  [
    "packages/local-runtime/src/portable-mounted-agent-artifact-stores.ts",
    new Map([
      [
        "packages/local-runtime/src/mounted-artifact-authority-operation.ts",
        allowedNames({
          value: ["inspectMountedArtifactAuthorityOperationForPortableMountedAgentArtifactStores"],
          type: ["MountedArtifactAuthorityOperation", "PortableMountedArtifactAuthorityOperationInspection"]
        })
      ]
    ])
  ]
]);

const protectedSymbols = new Set(
  [...allowedAuthorityImports.values()]
    .flatMap((byModule) => [...byModule.values()])
    .flatMap((names) => [...names.keys()])
);

export function inspectTask137AuthorityBoundary(root: string): readonly Task137PolicyViolation[] {
  const repositoryRoot = resolve(root);
  const violations: Task137PolicyViolation[] = [];
  const dynamicExemptionCounts = new Map<string, number>();

  for (const path of productionSourceFiles(repositoryRoot)) {
    const absolutePath = join(repositoryRoot, path);
    const sourceFile = ts.createSourceFile(
      path,
      readFileSync(absolutePath, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    );
    inspectSourceFile(path, sourceFile, violations, dynamicExemptionCounts);
  }

  inspectPackageManifests(repositoryRoot, violations);

  return violations.sort((left, right) =>
    left.path.localeCompare(right.path) ||
    left.category.localeCompare(right.category) ||
    left.detail.localeCompare(right.detail)
  );
}

function allowedNames(input: {
  readonly value: readonly string[];
  readonly type: readonly string[];
}): Map<string, ImportPosition> {
  return new Map([
    ...input.value.map((name) => [name, "value"] as const),
    ...input.type.map((name) => [name, "type"] as const)
  ]);
}

function inspectSourceFile(
  path: string,
  sourceFile: ts.SourceFile,
  violations: Task137PolicyViolation[],
  dynamicExemptionCounts: Map<string, number>
): void {
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      inspectImportDeclaration(path, node, violations);
    } else if (ts.isExportDeclaration(node)) {
      inspectExportDeclaration(path, node, violations);
    } else if (ts.isImportEqualsDeclaration(node)) {
      inspectImportEquals(path, node, violations);
    } else if (ts.isImportTypeNode(node)) {
      inspectImportType(path, node, violations);
    } else if (ts.isCallExpression(node)) {
      inspectCallExpression(path, node, violations, dynamicExemptionCounts);
    } else if (ts.isNewExpression(node)) {
      inspectNewExpression(path, node, violations);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
}

function inspectImportDeclaration(
  path: string,
  node: ts.ImportDeclaration,
  violations: Task137PolicyViolation[]
): void {
  const specifier = stringLiteralText(node.moduleSpecifier);
  if (specifier === undefined) return;
  inspectCreateRequireImport(path, specifier, node, violations);
  const protectedModule =
    resolveRuntimeFactoryAuthorityImport(path, specifier, node) ??
    resolveProtectedModule(path, specifier);
  if (protectedModule === undefined) return;

  const importClause = node.importClause;
  if (importClause === undefined) {
    addViolation(violations, "unauthorized-owner", path, `side-effect import of ${protectedModule.sourcePath}`);
    return;
  }

  if (importClause.name !== undefined) {
    addViolation(violations, "default-import", path, `default import from ${protectedModule.sourcePath}`);
    return;
  }

  const bindings = importClause.namedBindings;
  if (bindings === undefined) {
    addViolation(violations, "unauthorized-owner", path, `empty import from ${protectedModule.sourcePath}`);
    return;
  }
  if (ts.isNamespaceImport(bindings)) {
    addViolation(violations, "namespace-import", path, `namespace import from ${protectedModule.sourcePath}`);
    return;
  }

  const allowedByModule = allowedAuthorityImports.get(path);
  if (allowedByModule === undefined) {
    addViolation(violations, "unauthorized-owner", path, `may not import ${protectedModule.sourcePath}`);
    return;
  }
  const allowedNamesForModule = allowedByModule.get(protectedModule.sourcePath);
  if (allowedNamesForModule === undefined) {
    addViolation(violations, "wrong-protected-module", path, `may not import ${protectedModule.sourcePath}`);
    return;
  }

  for (const element of bindings.elements) {
    const importedName = (element.propertyName ?? element.name).text;
    if (element.propertyName !== undefined) {
      addViolation(violations, "alias", path, `alias for ${importedName}`);
      continue;
    }

    const expectedPosition = allowedNamesForModule.get(importedName);
    if (expectedPosition === undefined) {
      addViolation(violations, "wrong-role-symbol", path, `symbol ${importedName} is not permitted`);
      continue;
    }

    const actualPosition: ImportPosition =
      importClause.isTypeOnly || element.isTypeOnly ? "type" : "value";
    if (actualPosition === "type" && expectedPosition === "value") {
      addViolation(violations, "unauthorized-type-import", path, `value symbol ${importedName} imported as type`);
      continue;
    }
    if (actualPosition === "value" && expectedPosition === "type") {
      addViolation(violations, "wrong-role-symbol", path, `type symbol ${importedName} imported as value`);
    }
  }
}

function inspectCreateRequireImport(
  path: string,
  specifier: string,
  node: ts.ImportDeclaration,
  violations: Task137PolicyViolation[]
): void {
  if (specifier !== "node:module" && specifier !== "module") return;
  const bindings = node.importClause?.namedBindings;
  if (bindings === undefined || !ts.isNamedImports(bindings)) return;
  for (const element of bindings.elements) {
    const importedName = (element.propertyName ?? element.name).text;
    if (importedName !== "createRequire") continue;
    addViolation(
      violations,
      element.propertyName === undefined ? "direct-create-require" : "aliased-create-require",
      path,
      "createRequire import is prohibited"
    );
  }
}

function resolveRuntimeFactoryAuthorityImport(
  importerPath: string,
  specifier: string,
  node: ts.ImportDeclaration
): ProtectedModule | undefined {
  if (resolveSpecifierToSourcePath(importerPath, specifier) !== runtimeFactoryAuthorityModule.sourcePath) {
    return undefined;
  }
  const bindings = node.importClause?.namedBindings;
  if (bindings === undefined || !ts.isNamedImports(bindings)) return undefined;
  return bindings.elements.some((element) =>
    runtimeFactoryAuthorityNames.has((element.propertyName ?? element.name).text)
  )
    ? runtimeFactoryAuthorityModule
    : undefined;
}

function inspectExportDeclaration(
  path: string,
  node: ts.ExportDeclaration,
  violations: Task137PolicyViolation[]
): void {
  const specifier = node.moduleSpecifier === undefined ? undefined : stringLiteralText(node.moduleSpecifier);
  if (specifier === undefined) return;
  const protectedModule = resolveProtectedModule(path, specifier);
  if (protectedModule === undefined) return;

  if (node.exportClause === undefined || ts.isNamespaceExport(node.exportClause)) {
    addViolation(violations, "star-re-export", path, `star re-export from ${protectedModule.sourcePath}`);
    return;
  }
  addViolation(violations, "named-re-export", path, `named re-export from ${protectedModule.sourcePath}`);
}

function inspectImportEquals(
  path: string,
  node: ts.ImportEqualsDeclaration,
  violations: Task137PolicyViolation[]
): void {
  if (ts.isExternalModuleReference(node.moduleReference)) {
    addViolation(violations, "import-equals-require", path, "TypeScript import equals require is prohibited");
  }
}

function inspectImportType(
  path: string,
  node: ts.ImportTypeNode,
  violations: Task137PolicyViolation[]
): void {
  const argument = node.argument;
  const literal = ts.isLiteralTypeNode(argument) ? argument.literal : undefined;
  const specifier = literal !== undefined && ts.isStringLiteralLike(literal) ? literal.text : undefined;
  if (specifier !== undefined && resolveProtectedModule(path, specifier) !== undefined) {
    addViolation(violations, "import-query", path, `import type query for ${specifier}`);
  }
}

function inspectCallExpression(
  path: string,
  node: ts.CallExpression,
  violations: Task137PolicyViolation[],
  dynamicExemptionCounts: Map<string, number>
): void {
  if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
    inspectDynamicImport(path, node, violations, dynamicExemptionCounts);
    return;
  }

  const expression = skipTransparentExpression(node.expression);
  if (ts.isIdentifier(expression)) {
    if (expression.text === "require") {
      addViolation(violations, "direct-require", path, "direct require call is prohibited");
      return;
    }
    if (expression.text === "createRequire") {
      addViolation(violations, "direct-create-require", path, "direct createRequire call is prohibited");
      return;
    }
    if (expression.text === "eval") {
      addViolation(violations, "direct-evaluator-call", path, "direct eval call is prohibited");
      return;
    }
    if (expression.text === "Function") {
      addViolation(violations, "direct-function-constructor", path, "direct Function call is prohibited");
      return;
    }
  }

  if (ts.isPropertyAccessExpression(expression)) {
    if (isNamedExpression(expression.expression, "module") && expression.name.text === "require") {
      addViolation(violations, "module-require", path, "module.require call is prohibited");
      return;
    }
    if (isNamedExpression(expression.expression, "globalThis") && expression.name.text === "eval") {
      addViolation(violations, "direct-evaluator-call", path, "globalThis.eval call is prohibited");
      return;
    }
    if (isNamedExpression(expression.expression, "globalThis") && expression.name.text === "Function") {
      addViolation(violations, "direct-function-constructor", path, "globalThis.Function call is prohibited");
      return;
    }
    if (expression.name.text === "createRequire") {
      addViolation(violations, "direct-create-require", path, "createRequire property call is prohibited");
    }
  }
}

function inspectDynamicImport(
  path: string,
  node: ts.CallExpression,
  violations: Task137PolicyViolation[],
  dynamicExemptionCounts: Map<string, number>
): void {
  const [argument] = node.arguments;
  if (argument === undefined) {
    addViolation(violations, "computed-dynamic-import", path, "dynamic import without a literal specifier");
    return;
  }

  const specifier = stringLiteralText(skipTransparentExpression(argument));
  if (specifier === undefined) {
    addViolation(violations, "computed-dynamic-import", path, "computed dynamic import is prohibited");
    return;
  }

  const exemption = dynamicImportExemptions.find(
    (candidate) => candidate.path === path && candidate.specifier === specifier
  );
  if (exemption === undefined) {
    addViolation(violations, "protected-literal-dynamic-import", path, `dynamic import ${specifier} is not exempt`);
    return;
  }

  const key = `${path}\0${specifier}`;
  const priorCount = dynamicExemptionCounts.get(key) ?? 0;
  dynamicExemptionCounts.set(key, priorCount + 1);
  if (priorCount > 0) {
    addViolation(violations, "extra-dynamic-import-occurrence", path, `extra dynamic import ${specifier}`);
  }
}

function inspectNewExpression(
  path: string,
  node: ts.NewExpression,
  violations: Task137PolicyViolation[]
): void {
  const expression = skipTransparentExpression(node.expression);
  if (isNamedExpression(expression, "Function")) {
    addViolation(violations, "direct-function-constructor", path, "new Function is prohibited");
    return;
  }
  if (
    ts.isPropertyAccessExpression(expression) &&
    isNamedExpression(expression.expression, "globalThis") &&
    expression.name.text === "Function"
  ) {
    addViolation(violations, "direct-function-constructor", path, "new globalThis.Function is prohibited");
  }
}

function inspectPackageManifests(root: string, violations: Task137PolicyViolation[]): void {
  for (const path of packageManifestPaths(root)) {
    const manifest = JSON.parse(readFileSync(join(root, path), "utf8")) as unknown;
    if (manifestContainsProtectedExport(manifest)) {
      addViolation(violations, "protected-package-export", path, "package manifest exports protected authority");
    }
  }
}

function packageManifestPaths(root: string): string[] {
  const paths = existsSync(join(root, "package.json")) ? ["package.json"] : [];
  const packagesRoot = join(root, "packages");
  if (!existsSync(packagesRoot)) return paths;
  for (const name of readdirSync(packagesRoot, { withFileTypes: true })) {
    if (!name.isDirectory()) continue;
    const path = `packages/${name.name}/package.json`;
    if (existsSync(join(root, path))) paths.push(path);
  }
  return paths.sort();
}

function manifestContainsProtectedExport(value: unknown): boolean {
  if (typeof value === "string") return includesProtectedSurface(value);
  if (Array.isArray(value)) return value.some((entry) => manifestContainsProtectedExport(entry));
  if (value !== null && typeof value === "object") {
    return Object.entries(value).some(([key, entry]) =>
      includesProtectedSurface(key) || manifestContainsProtectedExport(entry)
    );
  }
  return false;
}

function includesProtectedSurface(text: string): boolean {
  return protectedModules.some((module) => text.includes(module.stem)) ||
    [...protectedSymbols].some((symbol) => text.includes(symbol));
}

function productionSourceFiles(root: string): string[] {
  const packagesRoot = join(root, "packages");
  if (!existsSync(packagesRoot)) return [];
  const files: string[] = [];
  collectSourceFiles(packagesRoot, root, files);
  return files.sort();
}

function collectSourceFiles(current: string, root: string, files: string[]): void {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const absolutePath = join(current, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(absolutePath, root, files);
      continue;
    }
    if (!entry.isFile() || !sourceExtensions.has(extname(entry.name))) continue;
    const path = toRepoPath(root, absolutePath);
    if (path.includes("/src/")) files.push(path);
  }
}

function resolveProtectedModule(importerPath: string, specifier: string): ProtectedModule | undefined {
  const sourcePath = resolveSpecifierToSourcePath(importerPath, specifier);
  if (sourcePath !== undefined) {
    const exact = protectedModules.find((candidate) => candidate.sourcePath === sourcePath);
    if (exact !== undefined) return exact;
  }
  return protectedModules.find((candidate) => specifier.includes(candidate.stem));
}

function resolveSpecifierToSourcePath(importerPath: string, specifier: string): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const resolved = normalizeRepoPath(`${dirname(importerPath)}/${specifier}`);
  return withTypeScriptSourceExtension(resolved);
}

function withTypeScriptSourceExtension(path: string): string {
  for (const extension of [".js", ".jsx", ".mjs", ".cjs"]) {
    if (path.endsWith(extension)) return `${path.slice(0, -extension.length)}.ts`;
  }
  return path;
}

function stringLiteralText(node: ts.Node): string | undefined {
  return ts.isStringLiteralLike(node) ? node.text : undefined;
}

function skipTransparentExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isTypeAssertionExpression(current)) {
    current = current.expression;
  }
  return current;
}

function isNamedExpression(expression: ts.Expression, name: string): boolean {
  return ts.isIdentifier(expression) && expression.text === name;
}

function addViolation(
  violations: Task137PolicyViolation[],
  category: string,
  path: string,
  detail: string
): void {
  violations.push(Object.freeze({ category, path, detail }));
}

function toRepoPath(root: string, absolutePath: string): string {
  return normalizeRepoPath(relative(root, absolutePath));
}

function normalizeRepoPath(path: string): string {
  return path.split("\\").join("/");
}
