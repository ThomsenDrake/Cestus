import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
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
const factoryCaptureSymbol =
  /\b(?:FactoryIssuedMountedRuntimeCapture(?:Inspection)?|FactoryIssuedPortableStorageSnapshot|FactoryIssuedMountedWorkspaceSnapshot|FactoryIssuedMountedRuntimeSourceHighWater|captureFactoryIssuedMountedRuntime|inspectFactoryIssuedMountedRuntimeCapture)\b/;
const namedCaptureImportOrReexport =
  /\b(?:import|export)\s+(?:type\s+)?\{([\s\S]*?)\}\s+from\s*["'][^"']+["']/g;
const namespaceCaptureImportOrReexport =
  /\b(?:import(?:\s+type)?\s*\*\s+as\s+[\w$]+\s+from|export(?:\s+type)?\s*\*(?:\s+as\s+[\w$]+)?\s+from)\s*["']([^"']+)["']/g;
const dynamicCaptureImportOrRequire =
  /\b(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g;
const runtimeFactoryModuleSpecifier =
  /(?:^|\/)runtime-factory(?:\.(?:ts|tsx|mts|cts|js|mjs|cjs))?$/;
const temporaryFixtureRoots: string[] = [];

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

function sourceImportsFactoryCaptureSeam(source: string): boolean {
  for (const match of source.matchAll(namedCaptureImportOrReexport)) {
    if (factoryCaptureSymbol.test(match[1]!)) {
      return true;
    }
  }

  for (const match of source.matchAll(namespaceCaptureImportOrReexport)) {
    if (runtimeFactoryModuleSpecifier.test(match[1]!)) {
      return true;
    }
  }

  return [...source.matchAll(dynamicCaptureImportOrRequire)].some((match) =>
    runtimeFactoryModuleSpecifier.test(match[1]!),
  );
}

function captureSeamImporters(root: string): string[] {
  return productionSourceFiles(root)
    .filter((sourcePath) =>
      sourceImportsFactoryCaptureSeam(readFileSync(sourcePath, "utf8")),
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
    const fixtureSources = {
      "capture.cjs": `void require("${deepImport}");\n`,
      "capture.cts": `import type { FactoryIssuedMountedRuntimeCaptureInspection } from "${deepImport}";\n`,
      "capture.js": `void import("${deepImport}");\n`,
      "capture.mjs": `import * as runtimeFactory from "${deepImport}";\nvoid runtimeFactory;\n`,
      "capture.mts": `export { inspectFactoryIssuedMountedRuntimeCapture } from "${deepImport}";\n`,
      "capture.ts": `import { captureFactoryIssuedMountedRuntime } from "${deepImport}";\n`,
      "capture.tsx": `export type { FactoryIssuedMountedRuntimeCapture } from "${deepImport}";\n`,
      "star-reexport.mjs": `export * from "${deepImport}";\n`,
      "type-namespace-import.ts": `import type * as runtimeFactory from "${deepImport}";\nvoid runtimeFactory;\n`,
      "type-namespace-reexport.ts": `export type * as runtimeFactory from "${deepImport}";\n`,
      "type-star-reexport.ts": `export type * from "${deepImport}";\n`,
    };

    for (const [fileName, source] of Object.entries(fixtureSources)) {
      writeFixtureSource(
        fixtureRoot,
        `packages/agent-runtime/src/deep/${fileName}`,
        source,
      );
    }

    expect(captureSeamImporters(fixtureRoot)).toEqual([
      "packages/agent-runtime/src/deep/capture.cjs",
      "packages/agent-runtime/src/deep/capture.cts",
      "packages/agent-runtime/src/deep/capture.js",
      "packages/agent-runtime/src/deep/capture.mjs",
      "packages/agent-runtime/src/deep/capture.mts",
      "packages/agent-runtime/src/deep/capture.ts",
      "packages/agent-runtime/src/deep/capture.tsx",
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
