import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type * as TypeScript from "typescript";
import { afterEach, describe, expect, it } from "vitest";

const runtimeSourceRoot = join(dirname(fileURLToPath(import.meta.url)), "../src");
const workspaceRoot = resolve(runtimeSourceRoot, "../../..");
const mountedAuthorityOperationPath =
  "packages/local-runtime/src/mounted-artifact-authority-operation.ts";
const productionSourceExtensions = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".mjs",
  ".cjs",
]);
const factoryCaptureExportNames = new Set([
  "FactoryIssuedMountedRuntimeCapture",
  "FactoryIssuedMountedRuntimeCaptureInspection",
  "FactoryIssuedPortableStorageSnapshot",
  "FactoryIssuedMountedWorkspaceSnapshot",
  "FactoryIssuedMountedRuntimeSourceHighWater",
  "captureFactoryIssuedMountedRuntime",
  "inspectFactoryIssuedMountedRuntimeCapture",
]);
const temporaryFixtureRoots: string[] = [];
const require = createRequire(import.meta.url);
const ts = require("typescript") as typeof import("typescript");

afterEach(() => {
  for (const fixtureRoot of temporaryFixtureRoots.splice(0)) {
    rmSync(fixtureRoot, { force: true, recursive: true });
  }
});

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

    const sourceRoot = join(packagesRoot, entry.name, "src");
    return existsSync(sourceRoot) ? collectProductionSourceFiles(sourceRoot) : [];
  });
}

function scriptKindForFileName(fileName: string): TypeScript.ScriptKind {
  const extension = extname(fileName);
  if (extension === ".tsx") {
    return ts.ScriptKind.TSX;
  }
  if (extension === ".js" || extension === ".mjs" || extension === ".cjs") {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

function sourceFileFor(fileName: string, source: string): TypeScript.SourceFile {
  return ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKindForFileName(fileName),
  );
}

function syntacticDiagnosticsFor(
  fileName: string,
  source: string,
): readonly TypeScript.Diagnostic[] {
  return (
    ts.transpileModule(source, {
      compilerOptions: {
        allowJs: true,
        jsx: ts.JsxEmit.Preserve,
        target: ts.ScriptTarget.Latest,
      },
      fileName,
      reportDiagnostics: true,
    }).diagnostics ?? []
  );
}

function moduleSpecifierWithoutSuffix(moduleSpecifier: string): string {
  const queryStart = moduleSpecifier.indexOf("?");
  const fragmentStart = moduleSpecifier.indexOf("#");
  const suffixStart = [queryStart, fragmentStart]
    .filter((index) => index >= 0)
    .reduce((first, index) => Math.min(first, index), moduleSpecifier.length);

  return moduleSpecifier.slice(0, suffixStart);
}

function extensionlessSourceTarget(sourcePath: string): string {
  const extension = extname(sourcePath);
  return productionSourceExtensions.has(extension)
    ? sourcePath.slice(0, -extension.length)
    : sourcePath;
}

function isProtectedModuleSpecifier(
  root: string,
  sourcePath: string,
  moduleSpecifier: TypeScript.Expression | undefined,
): boolean {
  if (moduleSpecifier === undefined || !ts.isStringLiteralLike(moduleSpecifier)) {
    return false;
  }

  const suffixlessSpecifier = moduleSpecifierWithoutSuffix(moduleSpecifier.text);
  if (
    !suffixlessSpecifier.startsWith("./") &&
    !suffixlessSpecifier.startsWith("../")
  ) {
    return false;
  }

  return (
    extensionlessSourceTarget(resolve(dirname(sourcePath), suffixlessSpecifier)) ===
    join(root, "packages", "local-runtime", "src", "runtime-factory")
  );
}

function namedSpecifierReferencesCapture(
  specifier: TypeScript.ImportSpecifier | TypeScript.ExportSpecifier,
): boolean {
  const sourceName = (specifier.propertyName ?? specifier.name).text;
  return sourceName === "default" || factoryCaptureExportNames.has(sourceName);
}

function declarationReferencesFactoryCapture(
  root: string,
  sourcePath: string,
  declaration: TypeScript.ImportDeclaration | TypeScript.ExportDeclaration,
): boolean {
  if (!isProtectedModuleSpecifier(root, sourcePath, declaration.moduleSpecifier)) {
    return false;
  }

  if (ts.isImportDeclaration(declaration)) {
    const importClause = declaration.importClause;
    if (importClause === undefined) {
      return false;
    }
    if (importClause.name !== undefined) {
      return true;
    }

    const bindings = importClause.namedBindings;
    if (bindings === undefined) {
      return false;
    }

    return (
      ts.isNamespaceImport(bindings) ||
      (ts.isNamedImports(bindings) &&
        bindings.elements.some(namedSpecifierReferencesCapture))
    );
  }

  if (declaration.exportClause === undefined) {
    return true;
  }

  return (
    ts.isNamespaceExport(declaration.exportClause) ||
    (ts.isNamedExports(declaration.exportClause) &&
      declaration.exportClause.elements.some(namedSpecifierReferencesCapture))
  );
}

function importEqualsReferencesFactoryCapture(
  root: string,
  sourcePath: string,
  declaration: TypeScript.ImportEqualsDeclaration,
): boolean {
  return (
    ts.isExternalModuleReference(declaration.moduleReference) &&
    isProtectedModuleSpecifier(
      root,
      sourcePath,
      declaration.moduleReference.expression,
    )
  );
}

function isStandardModuleRequireCall(expression: TypeScript.Expression): boolean {
  if (ts.isPropertyAccessExpression(expression)) {
    return (
      ts.isIdentifier(expression.expression) &&
      expression.expression.text === "module" &&
      expression.name.text === "require"
    );
  }

  return (
    ts.isElementAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === "module" &&
    expression.argumentExpression !== undefined &&
    ts.isStringLiteralLike(expression.argumentExpression) &&
    expression.argumentExpression.text === "require"
  );
}

function callReferencesFactoryCapture(
  root: string,
  sourcePath: string,
  call: TypeScript.CallExpression,
): boolean {
  const argument = call.arguments[0];
  if (!isProtectedModuleSpecifier(root, sourcePath, argument)) {
    return false;
  }

  return (
    call.expression.kind === ts.SyntaxKind.ImportKeyword ||
    (ts.isIdentifier(call.expression) && call.expression.text === "require") ||
    isStandardModuleRequireCall(call.expression)
  );
}

function sourceImportsFactoryCaptureSeam(
  root: string,
  sourcePath: string,
  source: string,
): boolean {
  const sourceFile = sourceFileFor(sourcePath, source);
  let capturesFactoryAuthority = false;

  const visit = (node: TypeScript.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      declarationReferencesFactoryCapture(root, sourcePath, node)
    ) {
      capturesFactoryAuthority = true;
      return;
    }

    if (
      ts.isImportEqualsDeclaration(node) &&
      importEqualsReferencesFactoryCapture(root, sourcePath, node)
    ) {
      capturesFactoryAuthority = true;
      return;
    }

    if (
      ts.isCallExpression(node) &&
      callReferencesFactoryCapture(root, sourcePath, node)
    ) {
      capturesFactoryAuthority = true;
      return;
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return capturesFactoryAuthority;
}

function captureSeamImporters(root: string): string[] {
  return productionSourceFiles(root)
    .filter((sourcePath) =>
      sourceImportsFactoryCaptureSeam(
        root,
        sourcePath,
        readFileSync(sourcePath, "utf8"),
      ),
    )
    .map((sourcePath) => relative(root, sourcePath).split(sep).join("/"))
    .sort();
}

function assertCaptureSeamImportersAreAllowed(root: string): void {
  const importers = captureSeamImporters(root);
  const expectedImporters = existsSync(join(root, mountedAuthorityOperationPath))
    ? [mountedAuthorityOperationPath]
    : [];

  if (JSON.stringify(importers) !== JSON.stringify(expectedImporters)) {
    throw new Error(
      `Factory-issued mounted runtime capture importers must be ${JSON.stringify(expectedImporters)}, received ${JSON.stringify(importers)}.`,
    );
  }
}

function createFixtureWorkspace(): string {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "task135d-mounted-runtime-imports-"));
  temporaryFixtureRoots.push(fixtureRoot);
  return fixtureRoot;
}

function writeFixtureSource(
  fixtureRoot: string,
  relativePath: string,
  source: string,
): void {
  const sourcePath = join(fixtureRoot, ...relativePath.split("/"));
  mkdirSync(dirname(sourcePath), { recursive: true });
  writeFileSync(sourcePath, source);
}

function decodedAstTokens(fileName: string, source: string): {
  identifiers: string[];
  stringLiterals: string[];
} {
  const sourceFile = sourceFileFor(fileName, source);
  const identifiers: string[] = [];
  const stringLiterals: string[] = [];

  const visit = (node: TypeScript.Node): void => {
    if (ts.isIdentifier(node)) {
      identifiers.push(node.text);
    }
    if (ts.isStringLiteralLike(node)) {
      stringLiterals.push(node.text);
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return { identifiers, stringLiterals };
}

describe("factory-issued mounted runtime capture production imports", () => {
  it("permits zero importers until the exact mounted authority operation exists", () => {
    expect(captureSeamImporters(workspaceRoot)).toEqual([]);
    expect(() => assertCaptureSeamImportersAreAllowed(workspaceRoot)).not.toThrow();
  });

  it("permits the future mounted authority operation as the sole importer", () => {
    const fixtureRoot = createFixtureWorkspace();
    writeFixtureSource(
      fixtureRoot,
      mountedAuthorityOperationPath,
      'import { captureFactoryIssuedMountedRuntime } from "./runtime-factory.js";\nvoid captureFactoryIssuedMountedRuntime;\n',
    );

    expect(captureSeamImporters(fixtureRoot)).toEqual([
      mountedAuthorityOperationPath,
    ]);
    expect(() => assertCaptureSeamImportersAreAllowed(fixtureRoot)).not.toThrow();
  });

  it("rejects deep cross-package imports and re-exports across every production source extension", () => {
    const fixtureRoot = createFixtureWorkspace();
    const deepImport = "../../../local-runtime/src/runtime-factory.js";
    const fragmentRuntimeFactoryImport = `${deepImport}#fragment`;
    const queryRuntimeFactoryImport = `${deepImport}?nonce`;
    const escapedRuntimeFactoryImport =
      "../../../local-runtime/src/\\u0072untime-factory.js";
    const fixtureSources = {
      "ast-commented-dynamic-import.ts": `void import(/* dynamic-argument */ "${escapedRuntimeFactoryImport}");\n`,
      "ast-commented-import-equals.ts": `import runtimeFactory = require(/* import-equals-argument */ "${escapedRuntimeFactoryImport}");\nvoid runtimeFactory;\n`,
      "ast-commented-named-import.ts": `import /* import-type */ type /* type-named */ { captureFactoryIssued\\u004dountedRuntime } from "${escapedRuntimeFactoryImport}";\n`,
      "ast-commented-named-reexport.ts": `export /* export-type */ type /* type-named */ { captureFactoryIssued\\u004dountedRuntime } from "${escapedRuntimeFactoryImport}";\n`,
      "ast-commented-namespace-import.ts": `import /* import-type */ type /* type-star */ * /* star-as */ as runtimeFactory from "${escapedRuntimeFactoryImport}";\n`,
      "ast-commented-namespace-reexport.ts": `export /* export-type */ type /* type-star */ * /* star-as */ as runtimeFactory from "${escapedRuntimeFactoryImport}";\n`,
      "ast-commented-require.ts": `void require(/* require-argument */ "${escapedRuntimeFactoryImport}");\n`,
      "ast-commented-star-reexport.ts": `export /* export-type */ type /* type-star */ * from "${escapedRuntimeFactoryImport}";\n`,
      "capture.cjs": `void require("${deepImport}");\n`,
      "capture.cts": `import type { FactoryIssuedMountedRuntimeCaptureInspection } from "${deepImport}";\n`,
      "capture.js": `void import("${deepImport}");\n`,
      "capture.mjs": `import * as runtimeFactory from "${deepImport}";\nvoid runtimeFactory;\n`,
      "capture.mts": `export { inspectFactoryIssuedMountedRuntimeCapture } from "${deepImport}";\n`,
      "capture.ts": `import { captureFactoryIssuedMountedRuntime } from "${deepImport}";\n`,
      "capture.tsx": `export type { FactoryIssuedMountedRuntimeCapture } from "${deepImport}";\n`,
      "default-import.ts": `import runtimeFactory from "${deepImport}";\nvoid runtimeFactory;\n`,
      "default-type-import.ts": `import type runtimeFactory from "${deepImport}";\n`,
      "fragment-dynamic-import.ts": `void import("${fragmentRuntimeFactoryImport}");\n`,
      "fragment-import-equals.ts": `import runtimeFactory = require("${fragmentRuntimeFactoryImport}");\nvoid runtimeFactory;\n`,
      "fragment-namespace-import.ts": `import * as runtimeFactory from "${fragmentRuntimeFactoryImport}";\nvoid runtimeFactory;\n`,
      "fragment-namespace-reexport.ts": `export * as runtimeFactory from "${fragmentRuntimeFactoryImport}";\n`,
      "module-element-require.cjs": `void module["require"]("${deepImport}");\n`,
      "module-require.cjs": `void module.require("${deepImport}");\n`,
      "named-default-import.ts": `import { default as runtimeFactory } from "${deepImport}";\nvoid runtimeFactory;\n`,
      "named-default-reexport.ts": `export { default as runtimeFactory } from "${deepImport}";\n`,
      "named-default-type-import.ts": `import type { default as runtimeFactory } from "${deepImport}";\n`,
      "named-default-type-reexport.ts": `export type { default as runtimeFactory } from "${deepImport}";\n`,
      "query-named-import.ts": `import { captureFactoryIssuedMountedRuntime } from "${queryRuntimeFactoryImport}";\n`,
      "query-named-reexport.ts": `export { inspectFactoryIssuedMountedRuntimeCapture } from "${queryRuntimeFactoryImport}";\n`,
      "query-require.cjs": `void require("${queryRuntimeFactoryImport}");\n`,
      "query-star-reexport.ts": `export * from "${queryRuntimeFactoryImport}";\n`,
      "star-reexport.mjs": `export * from "${deepImport}";\n`,
      "type-namespace-import.ts": `import type * as runtimeFactory from "${deepImport}";\nvoid runtimeFactory;\n`,
      "type-namespace-reexport.ts": `export type * as runtimeFactory from "${deepImport}";\n`,
      "type-star-reexport.ts": `export type * from "${deepImport}";\n`,
    };
    const decodedFixtureModuleSpecifiers = new Map<string, string>([
      ["fragment-dynamic-import.ts", fragmentRuntimeFactoryImport],
      ["fragment-import-equals.ts", fragmentRuntimeFactoryImport],
      ["fragment-namespace-import.ts", fragmentRuntimeFactoryImport],
      ["fragment-namespace-reexport.ts", fragmentRuntimeFactoryImport],
      ["query-named-import.ts", queryRuntimeFactoryImport],
      ["query-named-reexport.ts", queryRuntimeFactoryImport],
      ["query-require.cjs", queryRuntimeFactoryImport],
      ["query-star-reexport.ts", queryRuntimeFactoryImport],
    ]);
    const decodedFixtureProtectedNames = new Map<string, string>([
      [
        "ast-commented-named-import.ts",
        "captureFactoryIssuedMountedRuntime",
      ],
      [
        "ast-commented-named-reexport.ts",
        "captureFactoryIssuedMountedRuntime",
      ],
      ["named-default-import.ts", "default"],
      ["named-default-reexport.ts", "default"],
      ["named-default-type-import.ts", "default"],
      ["named-default-type-reexport.ts", "default"],
      ["query-named-import.ts", "captureFactoryIssuedMountedRuntime"],
      [
        "query-named-reexport.ts",
        "inspectFactoryIssuedMountedRuntimeCapture",
      ],
    ]);
    const decodedFixtureDefaultBindings = new Map<string, string>([
      ["default-import.ts", "runtimeFactory"],
      ["default-type-import.ts", "runtimeFactory"],
    ]);
    const lookalikeFixtureSources = {
      "lookalike-bare-query.ts": {
        moduleSpecifier: "@lookalike/runtime-factory.js?nonce",
        source:
          'import { captureFactoryIssuedMountedRuntime } from "@lookalike/runtime-factory.js?nonce";\n',
      },
      "lookalike-relative-fragment.ts": {
        moduleSpecifier: "../../../unrelated/src/runtime-factory.js#fragment",
        source:
          'void import("../../../unrelated/src/runtime-factory.js#fragment");\n',
      },
      "unrelated-element-require.cjs": {
        moduleSpecifier: deepImport,
        source: `void loader["require"]("${deepImport}");\n`,
      },
      "unrelated-property-require.cjs": {
        moduleSpecifier: deepImport,
        source: `void loader.require("${deepImport}");\n`,
      },
    };

    for (const [fileName, source] of Object.entries(fixtureSources)) {
      writeFixtureSource(
        fixtureRoot,
        `packages/agent-runtime/src/deep/${fileName}`,
        source,
      );

      const decodedTokens = decodedAstTokens(fileName, source);
      expect(syntacticDiagnosticsFor(fileName, source)).toEqual([]);
      expect(decodedTokens.stringLiterals).toContain(
        decodedFixtureModuleSpecifiers.get(fileName) ?? deepImport,
      );
      const protectedName = decodedFixtureProtectedNames.get(fileName);
      if (protectedName !== undefined) {
        expect(decodedTokens.identifiers).toContain(protectedName);
      }
      const defaultBinding = decodedFixtureDefaultBindings.get(fileName);
      if (defaultBinding !== undefined) {
        expect(decodedTokens.identifiers).toContain(defaultBinding);
      }
    }

    for (const [fileName, fixture] of Object.entries(lookalikeFixtureSources)) {
      writeFixtureSource(
        fixtureRoot,
        `packages/agent-runtime/src/deep/${fileName}`,
        fixture.source,
      );

      const decodedTokens = decodedAstTokens(fileName, fixture.source);
      expect(syntacticDiagnosticsFor(fileName, fixture.source)).toEqual([]);
      expect(decodedTokens.stringLiterals).toContain(fixture.moduleSpecifier);
    }

    expect(captureSeamImporters(fixtureRoot)).toEqual([
      "packages/agent-runtime/src/deep/ast-commented-dynamic-import.ts",
      "packages/agent-runtime/src/deep/ast-commented-import-equals.ts",
      "packages/agent-runtime/src/deep/ast-commented-named-import.ts",
      "packages/agent-runtime/src/deep/ast-commented-named-reexport.ts",
      "packages/agent-runtime/src/deep/ast-commented-namespace-import.ts",
      "packages/agent-runtime/src/deep/ast-commented-namespace-reexport.ts",
      "packages/agent-runtime/src/deep/ast-commented-require.ts",
      "packages/agent-runtime/src/deep/ast-commented-star-reexport.ts",
      "packages/agent-runtime/src/deep/capture.cjs",
      "packages/agent-runtime/src/deep/capture.cts",
      "packages/agent-runtime/src/deep/capture.js",
      "packages/agent-runtime/src/deep/capture.mjs",
      "packages/agent-runtime/src/deep/capture.mts",
      "packages/agent-runtime/src/deep/capture.ts",
      "packages/agent-runtime/src/deep/capture.tsx",
      "packages/agent-runtime/src/deep/default-import.ts",
      "packages/agent-runtime/src/deep/default-type-import.ts",
      "packages/agent-runtime/src/deep/fragment-dynamic-import.ts",
      "packages/agent-runtime/src/deep/fragment-import-equals.ts",
      "packages/agent-runtime/src/deep/fragment-namespace-import.ts",
      "packages/agent-runtime/src/deep/fragment-namespace-reexport.ts",
      "packages/agent-runtime/src/deep/module-element-require.cjs",
      "packages/agent-runtime/src/deep/module-require.cjs",
      "packages/agent-runtime/src/deep/named-default-import.ts",
      "packages/agent-runtime/src/deep/named-default-reexport.ts",
      "packages/agent-runtime/src/deep/named-default-type-import.ts",
      "packages/agent-runtime/src/deep/named-default-type-reexport.ts",
      "packages/agent-runtime/src/deep/query-named-import.ts",
      "packages/agent-runtime/src/deep/query-named-reexport.ts",
      "packages/agent-runtime/src/deep/query-require.cjs",
      "packages/agent-runtime/src/deep/query-star-reexport.ts",
      "packages/agent-runtime/src/deep/star-reexport.mjs",
      "packages/agent-runtime/src/deep/type-namespace-import.ts",
      "packages/agent-runtime/src/deep/type-namespace-reexport.ts",
      "packages/agent-runtime/src/deep/type-star-reexport.ts",
    ]);
    expect(() => assertCaptureSeamImportersAreAllowed(fixtureRoot)).toThrow(
      /packages\/agent-runtime\/src\/deep\/capture\.cjs/,
    );
  });
});
