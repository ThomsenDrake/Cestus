import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type * as TypeScript from "typescript";
import { afterEach, describe, expect, it } from "vitest";

const runtimeSourceRoot = join(dirname(fileURLToPath(import.meta.url)), "../src");
const workspaceRoot = resolve(runtimeSourceRoot, "../../..");
const operationSource = "packages/local-runtime/src/mounted-artifact-authority-operation.ts";
const lifecycleSource = "packages/local-runtime/src/portable-workspace-lifecycle.ts";
const registrarSource = "packages/local-runtime/src/wake-supervisor-runtime.ts";
const issuerSource = "packages/local-runtime/src/agent-runtime-factory.ts";
const portableStoreSource = "packages/local-runtime/src/portable-mounted-agent-artifact-stores.ts";
const sourceExtensions = new Set([".ts", ".tsx", ".mts", ".cts"]);
const temporaryFixtureRoots: string[] = [];
const require = createRequire(import.meta.url);
const ts = require("typescript") as typeof import("typescript");

const operationSurfaceRoles = new Map<string, "registrar" | "issuer" | "portable-store">([
  ["registerMountedArtifactAuthorityIssuerForWakeRuntime", "registrar"],
  ["issueMountedArtifactAuthorityOperationForFactory", "issuer"],
  ["MountedArtifactAuthorityOperation", "portable-store"],
  ["PortableMountedArtifactAuthorityOperationInspection", "portable-store"],
  ["inspectMountedArtifactAuthorityOperationForPortableMountedAgentArtifactStores", "portable-store"]
]);
const operationOwnedCallableExports = new Set([
  "registerMountedArtifactAuthorityIssuerForWakeRuntime",
  "issueMountedArtifactAuthorityOperationForFactory",
  "inspectMountedArtifactAuthorityOperation",
  "inspectMountedArtifactAuthorityOperationForPortableMountedAgentArtifactStores"
]);

afterEach(() => {
  for (const fixtureRoot of temporaryFixtureRoots.splice(0)) {
    rmSync(fixtureRoot, { force: true, recursive: true });
  }
});

describe("mounted artifact authority operation imports", () => {
  it("permits only the exact role-specific source importers across all production TypeScript", () => {
    expect(importPolicyViolations(workspaceRoot)).toEqual([]);
  });

  it("permits the future registrar issuer and portable store surfaces without widening a role", () => {
    const fixtureRoot = createFixtureWorkspace();
    writeFixtureSource(
      fixtureRoot,
      operationSource,
      'import { inspectCurrentPortableWorkspaceAdmissionForMountedArtifactAuthority, type PortableWorkspaceLifecyclePorts } from "./portable-workspace-lifecycle.js";\nvoid inspectCurrentPortableWorkspaceAdmissionForMountedArtifactAuthority;\ntype Ports = PortableWorkspaceLifecyclePorts;\nvoid (0 as unknown as Ports);\n'
    );
    writeFixtureSource(fixtureRoot, lifecycleSource, "export {};\n");
    writeFixtureSource(
      fixtureRoot,
      registrarSource,
      'import { registerMountedArtifactAuthorityIssuerForWakeRuntime } from "./mounted-artifact-authority-operation.js";\nvoid registerMountedArtifactAuthorityIssuerForWakeRuntime;\n'
    );
    writeFixtureSource(
      fixtureRoot,
      issuerSource,
      'import { issueMountedArtifactAuthorityOperationForFactory } from "./mounted-artifact-authority-operation.js";\nvoid issueMountedArtifactAuthorityOperationForFactory;\n'
    );
    writeFixtureSource(
      fixtureRoot,
      portableStoreSource,
      'import { inspectMountedArtifactAuthorityOperationForPortableMountedAgentArtifactStores as inspect, type MountedArtifactAuthorityOperation, type PortableMountedArtifactAuthorityOperationInspection } from "./mounted-artifact-authority-operation.js";\nvoid inspect;\ntype Input = [MountedArtifactAuthorityOperation, PortableMountedArtifactAuthorityOperationInspection];\nvoid (0 as unknown as Input);\n'
    );
    expect(importPolicyViolations(fixtureRoot)).toEqual([]);
  });

  it("rejects role swaps public authority lifecycle inspection aliases re-exports type imports and loaders", () => {
    const fixtureRoot = createFixtureWorkspace();
    writeFixtureSource(fixtureRoot, operationSource, "export {};\n");
    writeFixtureSource(fixtureRoot, lifecycleSource, "export {};\n");
    writeFixtureSource(
      fixtureRoot,
      registrarSource,
      'import { issueMountedArtifactAuthorityOperationForFactory } from "./mounted-artifact-authority-operation.js";\nvoid issueMountedArtifactAuthorityOperationForFactory;\n'
    );
    writeFixtureSource(
      fixtureRoot,
      issuerSource,
      'import { registerMountedArtifactAuthorityIssuerForWakeRuntime } from "./mounted-artifact-authority-operation.js";\nvoid registerMountedArtifactAuthorityIssuerForWakeRuntime;\n'
    );
    writeFixtureSource(
      fixtureRoot,
      portableStoreSource,
      'import { inspectMountedArtifactAuthorityOperation, type MountedArtifactAuthoritySnapshot } from "./mounted-artifact-authority-operation.js";\nimport { inspectCurrentPortableWorkspaceAdmissionForMountedArtifactAuthority } from "./portable-workspace-lifecycle.js";\nvoid [inspectMountedArtifactAuthorityOperation, inspectCurrentPortableWorkspaceAdmissionForMountedArtifactAuthority];\ntype Snapshot = MountedArtifactAuthoritySnapshot;\nvoid (0 as unknown as Snapshot);\n'
    );
    writeFixtureSource(
      fixtureRoot,
      "packages/agent/src/authority-leak.ts",
      'export { inspectMountedArtifactAuthorityOperationForPortableMountedAgentArtifactStores as leaked } from "../../local-runtime/src/mounted-artifact-authority-operation.js";\nimport type { MountedArtifactAuthorityOperation } from "../../local-runtime/src/mounted-artifact-authority-operation.js";\nvoid (0 as MountedArtifactAuthorityOperation | 0);\n'
    );
    writeFixtureSource(
      fixtureRoot,
      "packages/agent/src/authority-alias.ts",
      'import { inspectMountedArtifactAuthorityOperationForPortableMountedAgentArtifactStores } from "@cestus/local-runtime/mounted-artifact-authority-operation.js";\nvoid inspectMountedArtifactAuthorityOperationForPortableMountedAgentArtifactStores;\n'
    );
    writeFixtureSource(
      fixtureRoot,
      "packages/agent/src/authority-alternate-relative.ts",
      'import * as authority from "../../local-runtime/src/../src/mounted-artifact-authority-operation.js";\nvoid authority;\n'
    );
    writeFixtureSource(
      fixtureRoot,
      "packages/agent/src/authority-loaders.ts",
      'void import("../../local-runtime/src/mounted-artifact-authority-operation.js");\nrequire("../../local-runtime/src/mounted-artifact-authority-operation.js");\nimport authority = require("../../local-runtime/src/mounted-artifact-authority-operation.js");\nvoid authority;\n'
    );

    const violations = importPolicyViolations(fixtureRoot).join("\n");
    expect(violations).toContain(`${registrarSource}: issuer surface`);
    expect(violations).toContain(`${issuerSource}: registrar surface`);
    expect(violations).toContain(`${portableStoreSource}: forbidden mounted artifact authority surface`);
    expect(violations).toContain(`${portableStoreSource}: portable workspace lifecycle inspector`);
    expect(violations).toContain("packages/agent/src/authority-leak.ts: portable-store surface");
    expect(violations).toContain("packages/agent/src/authority-alias.ts: portable-store surface");
    expect(violations).toContain("packages/agent/src/authority-alternate-relative.ts: dynamic or require authority loader");
    expect(violations).toContain("packages/agent/src/authority-loaders.ts: dynamic or require authority loader");
  });

  it("rejects a type-level authority import without treating its syntax node as a runtime expression", () => {
    const fixtureRoot = createFixtureWorkspace();
    writeFixtureSource(fixtureRoot, operationSource, "export {};\n");
    writeFixtureSource(fixtureRoot, lifecycleSource, "export {};\n");
    writeFixtureSource(
      fixtureRoot,
      "packages/agent/src/authority-import-type.ts",
      'type Operation = import("../../local-runtime/src/mounted-artifact-authority-operation.js").MountedArtifactAuthorityOperation;\nvoid (0 as unknown as Operation);\n'
    );

    expect(importPolicyViolations(fixtureRoot).join("\n")).toContain(
      "packages/agent/src/authority-import-type.ts: dynamic or require authority loader is forbidden"
    );
  });

  it("rejects parenthesized protected loaders and non-literal computed loaders", () => {
    const fixtureRoot = createFixtureWorkspace();
    writeFixtureSource(fixtureRoot, operationSource, "export {};\n");
    writeFixtureSource(fixtureRoot, lifecycleSource, "export {};\n");
    writeFixtureSource(
      fixtureRoot,
      "packages/agent/src/authority-parenthesized-loader.ts",
      'void import(("../../local-runtime/src/mounted-artifact-authority-operation.js"));\n'
    );
    writeFixtureSource(
      fixtureRoot,
      "packages/agent/src/authority-computed-loader.ts",
      'const moduleSpecifier = "../../local-runtime/src/mounted-artifact-authority-operation.js";\nvoid import(moduleSpecifier);\n'
    );

    const violations = importPolicyViolations(fixtureRoot).join("\n");
    expect(violations).toContain(
      "packages/agent/src/authority-parenthesized-loader.ts: dynamic or require authority loader is forbidden"
    );
    expect(violations).toContain(
      "packages/agent/src/authority-computed-loader.ts: dynamic or require authority loader is forbidden"
    );
  });

  it("rejects protected re-exports from authorized roles before an indirect consumer can import them", () => {
    const fixtureRoot = createFixtureWorkspace();
    writeFixtureSource(fixtureRoot, operationSource, "export {};\n");
    writeFixtureSource(fixtureRoot, lifecycleSource, "export {};\n");
    writeFixtureSource(
      fixtureRoot,
      registrarSource,
      'import { registerMountedArtifactAuthorityIssuerForWakeRuntime as capturedRegistrar } from "./mounted-artifact-authority-operation.js";\nexport { capturedRegistrar as exposedRegistrar };\n'
    );
    writeFixtureSource(
      fixtureRoot,
      issuerSource,
      'export { issueMountedArtifactAuthorityOperationForFactory as exposedIssuer } from "./mounted-artifact-authority-operation.js";\n'
    );
    writeFixtureSource(
      fixtureRoot,
      portableStoreSource,
      'export * from "./mounted-artifact-authority-operation.js";\n'
    );
    writeFixtureSource(
      fixtureRoot,
      "packages/agent/src/authority-indirect-consumer.ts",
      'import { exposedIssuer } from "../../local-runtime/src/agent-runtime-factory.js";\nvoid exposedIssuer;\n'
    );

    const violations = importPolicyViolations(fixtureRoot).join("\n");
    expect(violations).toContain(`${registrarSource}: protected authority re-export is forbidden`);
    expect(violations).toContain(`${issuerSource}: protected authority re-export is forbidden`);
    expect(violations).toContain(`${portableStoreSource}: protected authority re-export is forbidden`);
  });

  it("rejects createRequire loaders and their aliases across protected authority paths", () => {
    const fixtureRoot = createFixtureWorkspace();
    writeFixtureSource(fixtureRoot, operationSource, "export {};\n");
    writeFixtureSource(fixtureRoot, lifecycleSource, "export {};\n");
    writeFixtureSource(
      fixtureRoot,
      "packages/agent/src/authority-create-require-direct.ts",
      'import { createRequire } from "node:module";\nconst load = createRequire(import.meta.url);\nload("../../local-runtime/src/mounted-artifact-authority-operation.js");\n'
    );
    writeFixtureSource(
      fixtureRoot,
      "packages/agent/src/authority-create-require-alias.ts",
      'import { createRequire as makeLoader } from "node:module";\nconst load = makeLoader(import.meta.url);\nconst alias = load;\nalias("../../local-runtime/src/portable-workspace-lifecycle.js");\n'
    );
    writeFixtureSource(
      fixtureRoot,
      "packages/agent/src/authority-create-require-parenthesized.ts",
      'import { createRequire } from "node:module";\nconst load = createRequire(import.meta.url);\n(load)("../../local-runtime/src/mounted-artifact-authority-operation.js");\n'
    );
    writeFixtureSource(
      fixtureRoot,
      "packages/agent/src/authority-create-require-propagated.ts",
      'import { createRequire } from "node:module";\nconst load = createRequire(import.meta.url);\nconst first = load;\nconst second = first;\nsecond("../../local-runtime/src/portable-workspace-lifecycle.js");\n'
    );

    const violations = importPolicyViolations(fixtureRoot).join("\n");
    expect(violations).toContain(
      "packages/agent/src/authority-create-require-direct.ts: executable authority loader is forbidden"
    );
    expect(violations).toContain(
      "packages/agent/src/authority-create-require-alias.ts: executable authority loader is forbidden"
    );
    expect(violations).toContain(
      "packages/agent/src/authority-create-require-parenthesized.ts: executable authority loader is forbidden"
    );
    expect(violations).toContain(
      "packages/agent/src/authority-create-require-propagated.ts: executable authority loader is forbidden"
    );
  });

  it("rejects protected values and wrappers exported by otherwise authorized roles", () => {
    const exportCases = [
      ["exported value", "export const leaked = captured;"],
      ["exported callback wrapper", "export const leaked = (...args: never[]) => captured(...args);"],
      ["named helper alias", "const helper = captured; export { helper as leaked };"],
      ["object wrapper", "const helper = captured; export const leaked = { helper };"],
      ["exported function", "export function leaked() { return captured; }"],
      ["exported class static field", "export class Leaked { static authority = captured; }"],
      ["default export", "export default captured;"],
      ["export assignment", "export = captured;"]
    ] as const;

    for (const [label, exportedSource] of exportCases) {
      const fixtureRoot = createFixtureWorkspace();
      writeFixtureSource(fixtureRoot, operationSource, "export {};\n");
      writeFixtureSource(fixtureRoot, lifecycleSource, "export {};\n");
      writeFixtureSource(
        fixtureRoot,
        registrarSource,
        'import { registerMountedArtifactAuthorityIssuerForWakeRuntime as captured } from "./mounted-artifact-authority-operation.js";\n'
          + exportedSource
          + "\n"
      );

      expect(importPolicyViolations(fixtureRoot), label).toContain(
        `${registrarSource}: protected authority re-export is forbidden`
      );
    }
  });

  it("skips omitted array bindings while tracking a later destructured protected alias exported by an authorized role", () => {
    const fixtureRoot = createFixtureWorkspace();
    writeFixtureSource(fixtureRoot, operationSource, "export {};\n");
    writeFixtureSource(fixtureRoot, lifecycleSource, "export {};\n");
    writeFixtureSource(
      fixtureRoot,
      registrarSource,
      'import { registerMountedArtifactAuthorityIssuerForWakeRuntime as captured } from "./mounted-artifact-authority-operation.js";\nconst [, helper] = [undefined, captured];\nexport { helper as leaked };\n'
    );

    expect(importPolicyViolations(fixtureRoot)).toContain(
      `${registrarSource}: protected authority re-export is forbidden`
    );
  });

  it("rejects every executable protected loader route while leaving non-loader metadata alone", () => {
    const fixtureRoot = createFixtureWorkspace();
    writeFixtureSource(fixtureRoot, operationSource, "export {};\n");
    writeFixtureSource(fixtureRoot, lifecycleSource, "export {};\n");
    writeFixtureSource(
      fixtureRoot,
      "packages/agent/src/authority-bound-loader.ts",
      'const spec = "../../local-runtime/src/mounted-artifact-authority-operation.js";\nconst load = module.require.bind(module);\nconst alias = load;\nalias(spec);\n'
    );
    writeFixtureSource(
      fixtureRoot,
      "packages/agent/src/authority-property-loader.ts",
      'const spec = "../../local-runtime/src/portable-workspace-lifecycle.js";\nconst r = module["require"];\nr(spec);\n'
    );
    writeFixtureSource(
      fixtureRoot,
      "packages/agent/src/authority-immediate-bound-loader.ts",
      'const spec = "../../local-runtime/src/mounted-artifact-authority-operation.js";\n(module.require.bind(module))(spec);\n'
    );
    writeFixtureSource(
      fixtureRoot,
      "packages/agent/src/authority-namespace-create-require.ts",
      'import * as nodeModule from "node:module";\nconst spec = "../../local-runtime/src/mounted-artifact-authority-operation.js";\nconst makeLoader = nodeModule["create" + "Require"];\nconst load = makeLoader(import.meta.url);\nload(spec);\n'
    );
    writeFixtureSource(
      fixtureRoot,
      "packages/agent/src/authority-default-create-require.ts",
      'import nodeModule from "node:module";\nconst makeLoader = nodeModule.createRequire;\nconst load = makeLoader(import.meta.url);\nload("../../local-runtime/src/portable-workspace-lifecycle.js");\n'
    );
    writeFixtureSource(
      fixtureRoot,
      "packages/agent/src/authority-bound-create-require.ts",
      'import { createRequire } from "node:module";\nconst factory = createRequire.bind(null);\nconst load = factory(import.meta.url);\nload("../../local-runtime/src/mounted-artifact-authority-operation.js");\n'
    );
    writeFixtureSource(
      fixtureRoot,
      "packages/agent/src/ordinary-metadata.ts",
      'const metadata = { createRequire: "label", require: "label" };\nconst record = (value: string) => value;\nconst module = { require: record };\nconst require = record;\nconst protectedLooking = "../../local-runtime/src/mounted-artifact-authority-operation.js";\nrecord(protectedLooking);\nmodule.require(protectedLooking);\nrequire(protectedLooking);\nvoid metadata;\n'
    );

    const violations = importPolicyViolations(fixtureRoot).join("\n");
    expect(violations).toContain("packages/agent/src/authority-bound-loader.ts: executable authority loader is forbidden");
    expect(violations).toContain("packages/agent/src/authority-property-loader.ts: executable authority loader is forbidden");
    expect(violations).toContain("packages/agent/src/authority-immediate-bound-loader.ts: executable authority loader is forbidden");
    expect(violations).toContain("packages/agent/src/authority-namespace-create-require.ts: executable authority loader is forbidden");
    expect(violations).toContain("packages/agent/src/authority-default-create-require.ts: executable authority loader is forbidden");
    expect(violations).toContain("packages/agent/src/authority-bound-create-require.ts: executable authority loader is forbidden");
    expect(violations).not.toContain("packages/agent/src/ordinary-metadata.ts:");
  });

  it("rejects destructured unshadowed module.require identities without name-only false positives", () => {
    const fixtureRoot = createFixtureWorkspace();
    writeFixtureSource(fixtureRoot, operationSource, "export {};\n");
    writeFixtureSource(fixtureRoot, lifecycleSource, "export {};\n");
    writeFixtureSource(
      fixtureRoot,
      "packages/agent/src/authority-destructured-require-direct.ts",
      'const { require: load } = module;\nload("../../local-runtime/src/mounted-artifact-authority-operation.js");\n'
    );
    writeFixtureSource(
      fixtureRoot,
      "packages/agent/src/authority-destructured-require-alias.ts",
      'const moduleAlias = module;\nconst { require: load } = moduleAlias;\nload("../../local-runtime/src/portable-workspace-lifecycle.js");\n'
    );
    writeFixtureSource(
      fixtureRoot,
      "packages/agent/src/authority-destructured-require-default.ts",
      'const fallback = (value: string) => value;\nconst { require: load = fallback } = module;\nload("../../local-runtime/src/mounted-artifact-authority-operation.js");\n'
    );
    writeFixtureSource(
      fixtureRoot,
      "packages/agent/src/authority-destructured-require-rest.ts",
      'const { ...moduleCopy } = module;\nconst { require: load } = moduleCopy;\nload("../../local-runtime/src/portable-workspace-lifecycle.js");\n'
    );
    writeFixtureSource(
      fixtureRoot,
      "packages/agent/src/authority-destructured-require-computed.ts",
      'const { ["requ" + "ire"]: load } = module;\nload("../../local-runtime/src/mounted-artifact-authority-operation.js");\n'
    );
    writeFixtureSource(
      fixtureRoot,
      "packages/agent/src/authority-destructured-require-nested.ts",
      'const { nested: { require: load } } = { nested: module };\nload("../../local-runtime/src/portable-workspace-lifecycle.js");\n'
    );
    writeFixtureSource(
      fixtureRoot,
      "packages/agent/src/ordinary-destructured-require.ts",
      'const record = (value: string) => value;\nconst module = { require: record };\nconst { require: load } = module;\nload("../../local-runtime/src/mounted-artifact-authority-operation.js");\n'
    );

    const violations = importPolicyViolations(fixtureRoot).join("\n");
    for (const sourcePath of [
      "packages/agent/src/authority-destructured-require-direct.ts",
      "packages/agent/src/authority-destructured-require-alias.ts",
      "packages/agent/src/authority-destructured-require-default.ts",
      "packages/agent/src/authority-destructured-require-rest.ts",
      "packages/agent/src/authority-destructured-require-computed.ts",
      "packages/agent/src/authority-destructured-require-nested.ts"
    ]) {
      expect(violations).toContain(`${sourcePath}: executable authority loader is forbidden`);
    }
    expect(violations).not.toContain("packages/agent/src/ordinary-destructured-require.ts:");
  });

  it("rejects CommonJS loader identities through defaults patterns and nested receivers without shadowed lookalikes", () => {
    const fixtureRoot = createFixtureWorkspace();
    writeFixtureSource(fixtureRoot, operationSource, "export {};\n");
    writeFixtureSource(fixtureRoot, lifecycleSource, "export {};\n");
    writeFixtureSource(
      fixtureRoot,
      "packages/agent/src/authority-default-object-require.ts",
      'const { require: load = require } = {};\nload("../../local-runtime/src/mounted-artifact-authority-operation.js");\n'
    );
    writeFixtureSource(
      fixtureRoot,
      "packages/agent/src/authority-default-parameter-require.ts",
      'function loadProtected(load = require) {\n  load("../../local-runtime/src/portable-workspace-lifecycle.js");\n}\nvoid loadProtected;\n'
    );
    writeFixtureSource(
      fixtureRoot,
      "packages/agent/src/authority-object-assignment-require.ts",
      'let load: unknown;\n({ require: load } = module);\nload("../../local-runtime/src/mounted-artifact-authority-operation.js");\n'
    );
    writeFixtureSource(
      fixtureRoot,
      "packages/agent/src/authority-array-assignment-require.ts",
      'let load: unknown;\n[load] = [module.require];\nload("../../local-runtime/src/portable-workspace-lifecycle.js");\n'
    );
    writeFixtureSource(
      fixtureRoot,
      "packages/agent/src/authority-array-position-rest-require.ts",
      'const [ignored, ...rest] = [undefined, module.require];\nconst [load] = rest;\nload("../../local-runtime/src/mounted-artifact-authority-operation.js");\nvoid ignored;\n'
    );
    writeFixtureSource(
      fixtureRoot,
      "packages/agent/src/authority-nested-receiver-require.ts",
      'const holder = { nested: module };\nconst holderAlias = holder;\nholderAlias["nest" + "ed"].require("../../local-runtime/src/portable-workspace-lifecycle.js");\n'
    );
    writeFixtureSource(
      fixtureRoot,
      "packages/agent/src/ordinary-shadowed-commonjs-lookalikes.ts",
      'const protectedSpecifier = "../../local-runtime/src/mounted-artifact-authority-operation.js";\nconst record = (value: string) => value;\nconst module = { nested: { require: record } };\nconst { nested: { require: localLoad } } = module;\nlocalLoad(protectedSpecifier);\nfunction localModule(module: { require: (value: string) => string }) {\n  const { require: load } = module;\n  load(protectedSpecifier);\n}\ntry { throw { require: record }; } catch (module) {\n  const { require: load } = module;\n  load(protectedSpecifier);\n}\nfunction localRequire(require: (value: string) => string, load = require) {\n  load(protectedSpecifier);\n}\nvoid [localModule, localRequire];\n'
    );

    const violations = importPolicyViolations(fixtureRoot).join("\n");
    for (const sourcePath of [
      "packages/agent/src/authority-default-object-require.ts",
      "packages/agent/src/authority-default-parameter-require.ts",
      "packages/agent/src/authority-object-assignment-require.ts",
      "packages/agent/src/authority-array-assignment-require.ts",
      "packages/agent/src/authority-array-position-rest-require.ts",
      "packages/agent/src/authority-nested-receiver-require.ts"
    ]) {
      expect(violations).toContain(`${sourcePath}: executable authority loader is forbidden`);
    }
    expect(violations).not.toContain("packages/agent/src/ordinary-shadowed-commonjs-lookalikes.ts:");
  });

  it("terminates for array-rest roots keyed by the source array version", () => {
    const fixtureRoot = createFixtureWorkspace();
    writeFixtureSource(fixtureRoot, operationSource, "export {};\n");
    writeFixtureSource(fixtureRoot, lifecycleSource, "export {};\n");
    const sourcePath = "packages/agent/src/authority-array-rest-termination.ts";
    writeFixtureSource(
      fixtureRoot,
      sourcePath,
      'const [ignored, ...rest] = [undefined, module.require];\nconst [load] = rest;\nload("../../local-runtime/src/mounted-artifact-authority-operation.js");\nvoid ignored;\n'
    );

    expect(importPolicyViolations(fixtureRoot)).toContain(
      `${sourcePath}: executable authority loader is forbidden`
    );
  });

  it("rejects destructured property and default-parameter protected value leaks before indirect consumers", () => {
    const fixtureRoot = createFixtureWorkspace();
    writeFixtureSource(fixtureRoot, operationSource, "export {};\n");
    writeFixtureSource(fixtureRoot, lifecycleSource, "export {};\n");
    writeFixtureSource(
      fixtureRoot,
      registrarSource,
      'import { registerMountedArtifactAuthorityIssuerForWakeRuntime as captured } from "./mounted-artifact-authority-operation.js";\nlet leaked: unknown;\nlet leakedAssignmentDefault: unknown;\n({ captured: leaked } = { captured });\n({ leakedAssignmentDefault = captured } = {});\nconst { leakedDefault = captured } = {};\nexport { leaked, leakedAssignmentDefault, leakedDefault };\n'
    );
    writeFixtureSource(
      fixtureRoot,
      issuerSource,
      'import { issueMountedArtifactAuthorityOperationForFactory as captured } from "./mounted-artifact-authority-operation.js";\nconst holder: { value?: unknown } = {};\nholder.value = captured;\nexport const leaked = () => holder.value;\n'
    );
    writeFixtureSource(
      fixtureRoot,
      portableStoreSource,
      'import { inspectMountedArtifactAuthorityOperationForPortableMountedAgentArtifactStores as captured } from "./mounted-artifact-authority-operation.js";\nfunction leaked(value = captured) { return value; }\nexport { leaked };\n'
    );
    writeFixtureSource(
      fixtureRoot,
      "packages/agent/src/authority-indirect-consumer.ts",
      'import { leaked } from "../../local-runtime/src/agent-runtime-factory.js";\nvoid leaked;\n'
    );

    const violations = importPolicyViolations(fixtureRoot).join("\n");
    expect(violations).toContain(`${registrarSource}: protected authority re-export is forbidden`);
    expect(violations).toContain(`${issuerSource}: protected authority re-export is forbidden`);
    expect(violations).toContain(`${portableStoreSource}: protected authority re-export is forbidden`);
  });

  it("rejects pattern property closure field and re-export sinks through an indirect consumer", () => {
    const fixtures = [
      [
        registrarSource,
        'import { registerMountedArtifactAuthorityIssuerForWakeRuntime as captured } from "./mounted-artifact-authority-operation.js";\nlet leaked: unknown;\n[leaked] = [captured];\nexport { leaked };\n'
      ],
      [
        issuerSource,
        'import { issueMountedArtifactAuthorityOperationForFactory as captured } from "./mounted-artifact-authority-operation.js";\nconst holder: { value?: unknown } = {};\nconst alias = holder;\nalias.value = captured;\nexport const leaked = () => holder.value;\n'
      ],
      [
        portableStoreSource,
        'import { inspectMountedArtifactAuthorityOperationForPortableMountedAgentArtifactStores as captured } from "./mounted-artifact-authority-operation.js";\nconst { nested: [first, ...rest] = [captured] } = { nested: [captured] };\nexport class Leaked { authority = rest; static closure = () => first; }\n'
      ]
    ] as const;

    for (const [rolePath, source] of fixtures) {
      const fixtureRoot = createFixtureWorkspace();
      writeFixtureSource(fixtureRoot, operationSource, "export {};\n");
      writeFixtureSource(fixtureRoot, lifecycleSource, "export {};\n");
      writeFixtureSource(fixtureRoot, rolePath, source);
      writeFixtureSource(
        fixtureRoot,
        "packages/agent/src/authority-indirect-consumer.ts",
        `export * from "../../local-runtime/src/${rolePath.endsWith("agent-runtime-factory.ts") ? "agent-runtime-factory" : rolePath.endsWith("wake-supervisor-runtime.ts") ? "wake-supervisor-runtime" : "portable-mounted-agent-artifact-stores"}.js";\n`
      );

      expect(importPolicyViolations(fixtureRoot), rolePath).toContain(
        `${rolePath}: protected authority re-export is forbidden`
      );
    }
  });

  it("tracks replacement roots through direct and chained reads without tainting an earlier alias", () => {
    const fixtureRoot = createFixtureWorkspace();
    writeFixtureSource(fixtureRoot, operationSource, "export {};\n");
    writeFixtureSource(fixtureRoot, lifecycleSource, "export {};\n");
    writeFixtureSource(
      fixtureRoot,
      registrarSource,
      'import { registerMountedArtifactAuthorityIssuerForWakeRuntime as captured } from "./mounted-artifact-authority-operation.js";\nlet holder: { secret?: unknown } = {};\nholder = { secret: captured };\nexport const leaked = holder.secret;\n'
    );
    writeFixtureSource(
      fixtureRoot,
      issuerSource,
      'import { issueMountedArtifactAuthorityOperationForFactory as captured } from "./mounted-artifact-authority-operation.js";\nlet holder: { secret?: unknown } = {};\nholder = { secret: captured };\nconst chained = holder;\nexport const leaked = chained.secret;\n'
    );
    writeFixtureSource(
      fixtureRoot,
      portableStoreSource,
      'import { inspectMountedArtifactAuthorityOperationForPortableMountedAgentArtifactStores as captured } from "./mounted-artifact-authority-operation.js";\nlet holder: { secret?: unknown } = {};\nconst earlier = holder;\nholder = { secret: captured };\nexport const clean = earlier.secret;\n'
    );

    const violations = importPolicyViolations(fixtureRoot).join("\n");
    expect(violations).toContain(`${registrarSource}: protected authority re-export is forbidden`);
    expect(violations).toContain(`${issuerSource}: protected authority re-export is forbidden`);
    expect(violations).not.toContain(`${portableStoreSource}: protected authority re-export is forbidden`);
  });

  it("terminates across sequential root replacements while preserving current and prior aliases", () => {
    const fixtureRoot = createFixtureWorkspace();
    writeFixtureSource(fixtureRoot, operationSource, "export {};\n");
    writeFixtureSource(fixtureRoot, lifecycleSource, "export {};\n");
    writeFixtureSource(
      fixtureRoot,
      registrarSource,
      'import { registerMountedArtifactAuthorityIssuerForWakeRuntime as captured } from "./mounted-artifact-authority-operation.js";\nlet holder: { secret?: unknown } = {};\nholder = { secret: captured };\nholder = {};\nexport const clean = holder.secret;\n'
    );
    writeFixtureSource(
      fixtureRoot,
      issuerSource,
      'import { issueMountedArtifactAuthorityOperationForFactory as captured } from "./mounted-artifact-authority-operation.js";\nlet holder: { secret?: unknown } = {};\nholder = { secret: captured };\nconst middle = holder;\nholder = {};\nexport const leaked = middle.secret;\n'
    );
    writeFixtureSource(
      fixtureRoot,
      portableStoreSource,
      'import { inspectMountedArtifactAuthorityOperationForPortableMountedAgentArtifactStores as captured } from "./mounted-artifact-authority-operation.js";\nlet holder: { secret?: unknown } = {};\nconst earlier = holder;\nholder = { secret: captured };\nholder = {};\nexport const clean = earlier.secret;\n'
    );

    expect(importPolicyViolations(fixtureRoot)).toEqual([
      `${issuerSource}: protected authority re-export is forbidden`
    ]);
  });

  it("rejects direct rest and stale object aliases that retain reachable protected authority", () => {
    const fixtureRoot = createFixtureWorkspace();
    writeFixtureSource(fixtureRoot, operationSource, "export {};\n");
    writeFixtureSource(fixtureRoot, lifecycleSource, "export {};\n");
    writeFixtureSource(
      fixtureRoot,
      registrarSource,
      'import { registerMountedArtifactAuthorityIssuerForWakeRuntime as captured } from "./mounted-artifact-authority-operation.js";\nlet holder: { authority?: unknown } = {};\nholder.authority = captured;\nconst directAlias = holder;\nconst { ...restAlias } = holder;\nconst staleAlias = holder;\nholder = {};\nexport { directAlias, restAlias, staleAlias };\n'
    );
    writeFixtureSource(
      fixtureRoot,
      issuerSource,
      'const protectedLooking = "../../local-runtime/src/mounted-artifact-authority-operation.js";\nlet holder = { authority: protectedLooking };\nconst directAlias = holder;\nconst { ...restAlias } = holder;\nconst staleAlias = holder;\nholder = {};\nexport { directAlias, restAlias, staleAlias };\n'
    );

    const violations = importPolicyViolations(fixtureRoot).join("\n");
    expect(violations).toContain(`${registrarSource}: protected authority re-export is forbidden`);
    expect(violations).not.toContain(`${issuerSource}: protected authority re-export is forbidden`);
  });

  it("rejects static evaluator-created protected imports without banning harmless or shadowed evaluators", () => {
    const fixtureRoot = createFixtureWorkspace();
    writeFixtureSource(fixtureRoot, operationSource, "export {};\n");
    writeFixtureSource(fixtureRoot, lifecycleSource, "export {};\n");
    writeFixtureSource(
      fixtureRoot,
      "packages/agent/src/eval-authority-loader.ts",
      'eval(\'import("../../local-runtime/src/mounted-artifact-authority-operation.js")\');\n'
    );
    writeFixtureSource(
      fixtureRoot,
      "packages/agent/src/function-authority-loader.ts",
      'Function(\'return import("../../local-runtime/src/mounted-artifact-authority-operation.js")\');\nnew Function(\'return import("../../local-runtime/src/portable-workspace-lifecycle.js")\');\n'
    );
    writeFixtureSource(
      fixtureRoot,
      "packages/agent/src/ordinary-evaluator-strings.ts",
      'eval(\'"../../local-runtime/src/mounted-artifact-authority-operation.js"\');\nFunction(\'return "../../local-runtime/src/portable-workspace-lifecycle.js"\');\nfunction localEvaluators(eval: (source: string) => unknown, Function: (source: string) => unknown) {\n  eval(\'import("../../local-runtime/src/mounted-artifact-authority-operation.js")\');\n  Function(\'return import("../../local-runtime/src/portable-workspace-lifecycle.js")\');\n}\nvoid localEvaluators;\n'
    );

    const violations = importPolicyViolations(fixtureRoot).join("\n");
    expect(violations).toContain(
      "packages/agent/src/eval-authority-loader.ts: evaluator-created authority loader is forbidden"
    );
    expect(violations).toContain(
      "packages/agent/src/function-authority-loader.ts: evaluator-created authority loader is forbidden"
    );
    expect(violations).not.toContain("packages/agent/src/ordinary-evaluator-strings.ts:");
  });

  it("rejects indirect evaluator aliases and comma-normalized CommonJS loaders without rejecting local controls", () => {
    const fixtureRoot = createFixtureWorkspace();
    writeFixtureSource(fixtureRoot, operationSource, "export {};\n");
    writeFixtureSource(fixtureRoot, lifecycleSource, "export {};\n");
    writeFixtureSource(
      fixtureRoot,
      "packages/agent/src/indirect-evaluator-authority-loader.ts",
      'const indirectEval = eval;\nindirectEval(\'import("../../local-runtime/src/mounted-artifact-authority-operation.js")\');\n'
    );
    writeFixtureSource(
      fixtureRoot,
      "packages/agent/src/comma-commonjs-authority-loader.ts",
      'const protectedSpecifier = "../../local-runtime/src/portable-workspace-lifecycle.js";\n(0, module.require)(protectedSpecifier);\n'
    );
    writeFixtureSource(
      fixtureRoot,
      "packages/agent/src/ordinary-indirect-evaluator-and-commonjs-controls.ts",
      'const ordinaryEval = eval;\nordinaryEval(\'"../../local-runtime/src/mounted-artifact-authority-operation.js"\');\nconst module = { require: (specifier: string) => specifier };\nconst protectedSpecifier = "../../local-runtime/src/portable-workspace-lifecycle.js";\n(0, module.require)(protectedSpecifier);\n'
    );

    const violations = importPolicyViolations(fixtureRoot).join("\n");
    expect(violations).toContain(
      "packages/agent/src/indirect-evaluator-authority-loader.ts: evaluator-created authority loader is forbidden"
    );
    expect(violations).toContain(
      "packages/agent/src/comma-commonjs-authority-loader.ts: executable authority loader is forbidden"
    );
    expect(violations).not.toContain("packages/agent/src/ordinary-indirect-evaluator-and-commonjs-controls.ts:");
  });

  it("rejects bound global evaluator aliases without rejecting bound local evaluator controls", () => {
    const fixtureRoot = createFixtureWorkspace();
    writeFixtureSource(fixtureRoot, operationSource, "export {};\n");
    writeFixtureSource(fixtureRoot, lifecycleSource, "export {};\n");
    writeFixtureSource(
      fixtureRoot,
      "packages/agent/src/bound-evaluator-authority-loader.ts",
      'const boundEval = eval.bind(globalThis);\nboundEval(\'import("../../local-runtime/src/mounted-artifact-authority-operation.js")\');\n'
    );
    writeFixtureSource(
      fixtureRoot,
      "packages/agent/src/ordinary-bound-evaluator-control.ts",
      'const localEval = (source: string) => source;\nconst boundLocalEval = localEval.bind(globalThis);\nboundLocalEval(\'import("../../local-runtime/src/mounted-artifact-authority-operation.js")\');\n'
    );

    const violations = importPolicyViolations(fixtureRoot).join("\n");
    expect(violations).toContain(
      "packages/agent/src/bound-evaluator-authority-loader.ts: evaluator-created authority loader is forbidden"
    );
    expect(violations).not.toContain("packages/agent/src/ordinary-bound-evaluator-control.ts:");
  });

  it("rejects source-bound global evaluators invoked without outer arguments while preserving harmless controls", () => {
    const fixtureRoot = createFixtureWorkspace();
    writeFixtureSource(fixtureRoot, operationSource, "export {};\n");
    writeFixtureSource(fixtureRoot, lifecycleSource, "export {};\n");
    writeFixtureSource(
      fixtureRoot,
      "packages/agent/src/source-bound-eval-authority-loader.ts",
      'const boundEval = eval.bind(globalThis, \'import("../../local-runtime/src/mounted-artifact-authority-operation.js")\');\nboundEval();\n'
    );
    writeFixtureSource(
      fixtureRoot,
      "packages/agent/src/source-bound-function-authority-loader.ts",
      'const boundFunction = Function.bind(globalThis, \'return import("../../local-runtime/src/portable-workspace-lifecycle.js")\');\nboundFunction();\n'
    );
    writeFixtureSource(
      fixtureRoot,
      "packages/agent/src/ordinary-source-bound-evaluator-controls.ts",
      'const boundEval = eval.bind(globalThis, \'"../../local-runtime/src/mounted-artifact-authority-operation.js"\');\nboundEval();\nconst localEval = (source: string) => source;\nconst boundLocalEval = localEval.bind(globalThis, \'import("../../local-runtime/src/portable-workspace-lifecycle.js")\');\nboundLocalEval();\n'
    );

    const violations = importPolicyViolations(fixtureRoot).join("\n");
    expect(violations).toContain(
      "packages/agent/src/source-bound-eval-authority-loader.ts: evaluator-created authority loader is forbidden"
    );
    expect(violations).toContain(
      "packages/agent/src/source-bound-function-authority-loader.ts: evaluator-created authority loader is forbidden"
    );
    expect(violations).not.toContain("packages/agent/src/ordinary-source-bound-evaluator-controls.ts:");
  });

  it("preserves evaluator source across repeated binding and replacement writes without classifying harmless controls", () => {
    const fixtureRoot = createFixtureWorkspace();
    writeFixtureSource(fixtureRoot, operationSource, "export {};\n");
    writeFixtureSource(fixtureRoot, lifecycleSource, "export {};\n");
    writeFixtureSource(
      fixtureRoot,
      "packages/agent/src/rebound-eval-authority-loader.ts",
      'const twiceBoundEval = eval.bind(globalThis, \'import("../../local-runtime/src/mounted-artifact-authority-operation.js")\').bind(globalThis);\ntwiceBoundEval();\n'
    );
    writeFixtureSource(
      fixtureRoot,
      "packages/agent/src/rebound-function-authority-loader.ts",
      'const twiceBoundFunction = Function.bind(globalThis, \'return import("../../local-runtime/src/portable-workspace-lifecycle.js")\').bind(globalThis);\ntwiceBoundFunction();\n'
    );
    writeFixtureSource(
      fixtureRoot,
      "packages/agent/src/reassigned-evaluator-authority-loader.ts",
      'let reassignedEval = eval.bind(globalThis);\nreassignedEval = eval.bind(globalThis, \'import("../../local-runtime/src/mounted-artifact-authority-operation.js")\');\nreassignedEval();\nlet reassignedFunction = Function.bind(globalThis);\nreassignedFunction = Function.bind(globalThis, \'return import("../../local-runtime/src/portable-workspace-lifecycle.js")\');\nreassignedFunction();\n'
    );
    writeFixtureSource(
      fixtureRoot,
      "packages/agent/src/ordinary-rebound-and-reassigned-evaluator-controls.ts",
      'const harmlessTwiceBoundEval = eval.bind(globalThis, \'"../../local-runtime/src/mounted-artifact-authority-operation.js"\').bind(globalThis);\nharmlessTwiceBoundEval();\nlet harmlessReassignedEval = eval.bind(globalThis);\nharmlessReassignedEval = eval.bind(globalThis, \'"../../local-runtime/src/portable-workspace-lifecycle.js"\');\nharmlessReassignedEval();\nconst harmlessTwiceBoundFunction = Function.bind(globalThis, \'return import("../../local-runtime/src/mounted-artifact-authority-operation.js")\').bind(globalThis, "return 0");\nharmlessTwiceBoundFunction();\nconst localEval = (source: string) => source;\nconst localTwiceBoundEval = localEval.bind(globalThis, \'import("../../local-runtime/src/mounted-artifact-authority-operation.js")\').bind(globalThis);\nlocalTwiceBoundEval();\n'
    );

    const violations = importPolicyViolations(fixtureRoot).join("\n");
    expect(violations).toContain(
      "packages/agent/src/rebound-eval-authority-loader.ts: evaluator-created authority loader is forbidden"
    );
    expect(violations).toContain(
      "packages/agent/src/rebound-function-authority-loader.ts: evaluator-created authority loader is forbidden"
    );
    expect(violations).toContain(
      "packages/agent/src/reassigned-evaluator-authority-loader.ts: evaluator-created authority loader is forbidden"
    );
    expect(violations).not.toContain("packages/agent/src/ordinary-rebound-and-reassigned-evaluator-controls.ts:");
  });

  it("rejects global evaluator aliases through transparent comma expressions without rejecting local controls", () => {
    const fixtureRoot = createFixtureWorkspace();
    writeFixtureSource(fixtureRoot, operationSource, "export {};\n");
    writeFixtureSource(fixtureRoot, lifecycleSource, "export {};\n");
    writeFixtureSource(
      fixtureRoot,
      "packages/agent/src/comma-evaluator-authority-loader.ts",
      'const commaEval = (0, eval);\ncommaEval(\'import("../../local-runtime/src/portable-workspace-lifecycle.js")\');\n'
    );
    writeFixtureSource(
      fixtureRoot,
      "packages/agent/src/ordinary-comma-evaluator-control.ts",
      'const localEval = (source: string) => source;\nconst commaLocalEval = (0, localEval);\ncommaLocalEval(\'import("../../local-runtime/src/portable-workspace-lifecycle.js")\');\n'
    );

    const violations = importPolicyViolations(fixtureRoot).join("\n");
    expect(violations).toContain(
      "packages/agent/src/comma-evaluator-authority-loader.ts: evaluator-created authority loader is forbidden"
    );
    expect(violations).not.toContain("packages/agent/src/ordinary-comma-evaluator-control.ts:");
  });
});

function importPolicyViolations(root: string): string[] {
  return productionSourceFiles(root).flatMap((sourcePath) => {
    const relativePath = relative(root, sourcePath).split(sep).join("/");
    return collectAuthorityImports(root, sourcePath, readFileSync(sourcePath, "utf8"))
      .flatMap((entry) => violationForImport(relativePath, entry));
  }).sort();
}

function violationForImport(sourcePath: string, entry: AuthorityImport): string[] {
  if (entry.kind === "evaluator-loader") {
    return [`${sourcePath}: evaluator-created authority loader is forbidden`];
  }
  if (entry.kind === "create-require") {
    return [`${sourcePath}: executable authority loader is forbidden`];
  }
  if (entry.kind === "computed-loader") {
    return [`${sourcePath}: non-literal authority loader is forbidden`];
  }
  if (entry.kind === "re-export") {
    return [`${sourcePath}: protected authority re-export is forbidden`];
  }
  if (entry.kind === "loader" && entry.module === undefined) {
    return [`${sourcePath}: executable authority loader is forbidden`];
  }
  if (entry.module === undefined) return [];
  if (entry.module === "lifecycle") {
    return sourcePath === operationSource && entry.kind === "named"
      ? []
      : [`${sourcePath}: portable workspace lifecycle inspector is private to ${operationSource}`];
  }
  if (entry.kind !== "named") {
    return [`${sourcePath}: dynamic or require authority loader is forbidden`];
  }
  const roles = new Set(entry.names.map((name) => operationSurfaceRoles.get(name) ?? "forbidden"));
  if (roles.has("forbidden")) {
    return [`${sourcePath}: forbidden mounted artifact authority surface`];
  }
  if (roles.size !== 1) {
    return [`${sourcePath}: mixed mounted artifact authority roles are forbidden`];
  }
  const [role] = [...roles];
  const permittedSource = role === "registrar"
    ? registrarSource
    : role === "issuer"
      ? issuerSource
      : portableStoreSource;
  return sourcePath === permittedSource ? [] : [`${sourcePath}: ${role} surface is forbidden`];
}

interface AuthorityImport {
  readonly module?: ProtectedAuthorityModule;
  readonly kind: "named" | "loader" | "computed-loader" | "create-require" | "evaluator-loader" | "re-export";
  readonly names: readonly string[];
}

type ProtectedAuthorityModule = "operation" | "lifecycle";

function collectAuthorityImports(root: string, sourcePath: string, source: string): AuthorityImport[] {
  const sourceFile = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, scriptKindFor(sourcePath));
  const relativeSourcePath = relative(root, sourcePath).split(sep).join("/");
  const imports: AuthorityImport[] = [];
  const analysis = needsAuthorityAnalysis(sourceFile)
    ? createAuthorityAnalysis(root, sourcePath, sourceFile)
    : undefined;
  const visit = (node: TypeScript.Node): void => {
    if (ts.isImportDeclaration(node)) {
      const module = protectedModuleFor(root, sourcePath, node.moduleSpecifier);
      if (module !== undefined) imports.push({ module, ...namedDeclarationImport(node) });
    } else if (ts.isExportDeclaration(node)) {
      const module = protectedModuleFor(root, sourcePath, node.moduleSpecifier);
      if (module !== undefined) {
        imports.push({ module, kind: "re-export", names: [] });
      }
    } else if (ts.isImportEqualsDeclaration(node)) {
      if (ts.isExternalModuleReference(node.moduleReference)) {
        const entry = authorityLoaderImport(root, sourcePath, node.moduleReference.expression, analysis);
        if (entry !== undefined) imports.push(entry);
      }
    } else if (ts.isImportTypeNode(node)) {
      const entry = authorityLoaderImport(root, sourcePath, node.argument, analysis);
      if (entry !== undefined) imports.push(entry);
    } else if (ts.isCallExpression(node)) {
      if (unwrapTransparentExpression(node.expression).kind === ts.SyntaxKind.ImportKeyword) {
        const entry = authorityLoaderImport(root, sourcePath, node.arguments[0], analysis);
        if (entry !== undefined) imports.push(entry);
      }
      const evaluator = evaluatorAuthorityLoaderImport(root, sourcePath, node, analysis);
      if (evaluator !== undefined) imports.push(evaluator);
      const loader = analysis === undefined ? undefined : loaderKindFor(node.expression, analysis, node);
      if (loader !== undefined) {
        imports.push({ kind: loader === "create-require" ? "create-require" : "loader", names: [] });
      }
    } else if (ts.isNewExpression(node)) {
      const evaluator = evaluatorAuthorityLoaderImport(root, sourcePath, node, analysis);
      if (evaluator !== undefined) imports.push(evaluator);
    } else if (ts.isExportAssignment(node)) {
      if (analysis !== undefined && expressionReferencesTainted(node.expression, analysis)) imports.push({ kind: "re-export", names: [] });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (analysis !== undefined) addExportedAuthorityValueLeaks(relativeSourcePath, sourceFile, analysis, imports);
  return imports;
}

function evaluatorAuthorityLoaderImport(
  root: string,
  sourcePath: string,
  node: TypeScript.CallExpression | TypeScript.NewExpression,
  analysis: AuthorityAnalysis | undefined
): AuthorityImport | undefined {
  if (analysis === undefined) return undefined;
  const evaluator = evaluatorValueFor(node.expression, analysis);
  if (evaluator === undefined) return undefined;
  const argumentsForEvaluation = node.arguments ?? [];
  const argument = evaluator.evaluator === "eval" ? argumentsForEvaluation[0] : argumentsForEvaluation.at(-1);
  const source = argumentsForEvaluation.length === 0 && evaluator.source !== undefined
    ? evaluator.source
    : foldedString(argument, analysis, node);
  if (source === undefined || !evaluatorSourceConsumesProtectedModule(root, sourcePath, source)) return undefined;
  return { kind: "evaluator-loader", names: [] };
}

function evaluatorKindFor(expression: TypeScript.Expression, analysis: AuthorityAnalysis): "eval" | "Function" | undefined {
  return evaluatorValueFor(expression, analysis)?.evaluator;
}

function evaluatorValueFor(
  expression: TypeScript.Expression,
  analysis: AuthorityAnalysis
): { readonly evaluator: EvaluatorIdentity; readonly source?: string } | undefined {
  const callee = callableExpression(expression);
  const value = valueForExpression(callee, analysis, callee);
  return value.evaluator === undefined
    ? undefined
    : {
      evaluator: value.evaluator,
      ...(value.evaluatorSource === undefined ? {} : { source: value.evaluatorSource })
    };
}

function evaluatorSourceConsumesProtectedModule(root: string, sourcePath: string, source: string): boolean {
  const sourceFile = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, scriptKindFor(sourcePath));
  const analysis = createAuthorityAnalysis(root, sourcePath, sourceFile);
  let consumesProtectedModule = false;
  const visit = (node: TypeScript.Node): void => {
    if (consumesProtectedModule) return;
    if (ts.isCallExpression(node)) {
      const module = unwrapTransparentExpression(node.expression).kind === ts.SyntaxKind.ImportKeyword
        ? protectedModuleFor(root, sourcePath, node.arguments[0], analysis)
        : loaderKindFor(node.expression, analysis, node) === undefined
          ? undefined
          : protectedModuleFor(root, sourcePath, node.arguments[0], analysis);
      if (module !== undefined) {
        consumesProtectedModule = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return consumesProtectedModule;
}

function needsAuthorityAnalysis(sourceFile: TypeScript.SourceFile): boolean {
  return sourceFile.text.includes("mounted-artifact-authority-operation")
    || sourceFile.text.includes("portable-workspace-lifecycle")
    || sourceFile.text.includes("node:module")
    || sourceFile.text.includes('from "module"')
    || sourceFile.text.includes("from 'module'")
    || /\brequire\b/.test(sourceFile.text);
}

function addExportedAuthorityValueLeaks(
  sourcePath: string,
  sourceFile: TypeScript.SourceFile,
  analysis: AuthorityAnalysis,
  imports: AuthorityImport[]
): void {
  const reportLeak = (): void => {
    imports.push({ kind: "re-export", names: [] });
  };
  for (const statement of sourceFile.statements) {
    if (ts.isExportDeclaration(statement)) {
      if (statement.moduleSpecifier === undefined && statement.exportClause !== undefined && ts.isNamedExports(statement.exportClause)) {
        for (const specifier of statement.exportClause.elements) {
          if (exportSpecifierBindingIsTainted(specifier, analysis)) reportLeak();
        }
      }
    } else if (ts.isVariableStatement(statement) && hasExportModifier(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (bindingNames(declaration.name, analysis).some((binding) => bindingReferencesTainted(binding, declaration.pos))) reportLeak();
      }
    } else if (
      (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement))
      && hasExportModifier(statement)
      && !isOperationOwnedCallableExport(sourcePath, statement)
      && (
        (statement.name !== undefined
          && declarationReferencesTainted(statement, analysis))
        || expressionReferencesTainted(statement, analysis)
      )
    ) {
      reportLeak();
    } else if (ts.isExportAssignment(statement) && expressionReferencesTainted(statement.expression, analysis)) {
      reportLeak();
    }
  }
}

function isOperationOwnedCallableExport(sourcePath: string, statement: TypeScript.FunctionDeclaration | TypeScript.ClassDeclaration): boolean {
  return sourcePath === operationSource
    && ts.isFunctionDeclaration(statement)
    && statement.name !== undefined
    && operationOwnedCallableExports.has(statement.name.text);
}

function expressionReferencesTainted(node: TypeScript.Node | undefined, analysis: AuthorityAnalysis): boolean {
  if (node === undefined) return false;
  const candidate = node as TypeScript.Expression;
  const value = valueForExpression(candidate, analysis, node);
  return valueReferencesTainted(value) || childReferencesTainted(node, analysis);
}

function hasExportModifier(node: TypeScript.Node): boolean {
  const modifiers = (node as unknown as { readonly modifiers?: readonly { readonly kind: TypeScript.SyntaxKind }[] }).modifiers;
  return modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

function namedDeclarationImport(
  declaration: TypeScript.ImportDeclaration
): Omit<AuthorityImport, "module"> {
  const clause = declaration.importClause;
  if (
    clause === undefined
    || clause.name !== undefined
    || clause.namedBindings === undefined
    || !ts.isNamedImports(clause.namedBindings)
  ) {
    return { kind: "loader", names: [] };
  }
  return { kind: "named", names: clause.namedBindings.elements.map(importedName) };
}

function importedName(specifier: TypeScript.ImportSpecifier | TypeScript.ExportSpecifier): string {
  return (specifier.propertyName ?? specifier.name).text;
}

function authorityLoaderImport(
  root: string,
  sourcePath: string,
  expression: TypeScript.Expression | TypeScript.TypeNode | undefined,
  analysis: AuthorityAnalysis | undefined
): AuthorityImport | undefined {
  const module = protectedModuleFor(root, sourcePath, expression, analysis);
  if (module !== undefined) return { module, kind: "loader", names: [] };
  return staticModuleSpecifier(expression, analysis) === undefined
    ? { kind: "computed-loader", names: [] }
    : undefined;
}

function protectedModuleFor(
  root: string,
  sourcePath: string,
  expression: TypeScript.Expression | TypeScript.TypeNode | undefined,
  analysis?: AuthorityAnalysis
): ProtectedAuthorityModule | undefined {
  const moduleSpecifier = staticModuleSpecifier(expression, analysis);
  if (moduleSpecifier === undefined) return undefined;
  const specifier = stripModuleSuffix(moduleSpecifier.text);
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const target = stripSourceExtension(resolve(dirname(sourcePath), specifier));
    if (target === join(root, operationSource.slice(0, -".ts".length))) return "operation";
    if (target === join(root, lifecycleSource.slice(0, -".ts".length))) return "lifecycle";
    return undefined;
  }
  const basename = stripSourceExtension(specifier).split("/").at(-1);
  if (basename === "mounted-artifact-authority-operation") return "operation";
  if (basename === "portable-workspace-lifecycle") return "lifecycle";
  return undefined;
}

function staticModuleSpecifier(
  expression: TypeScript.Expression | TypeScript.TypeNode | undefined,
  analysis?: AuthorityAnalysis
): TypeScript.StringLiteralLike | undefined {
  let candidate: TypeScript.Node | undefined = expression;
  while (candidate !== undefined) {
    if (ts.isLiteralTypeNode(candidate)) {
      candidate = candidate.literal;
      continue;
    }
    if (ts.isParenthesizedTypeNode(candidate)) {
      candidate = candidate.type;
      continue;
    }
    if (
      ts.isParenthesizedExpression(candidate)
      || ts.isAsExpression(candidate)
      || ts.isTypeAssertionExpression(candidate)
      || ts.isSatisfiesExpression(candidate)
      || ts.isNonNullExpression(candidate)
    ) {
      candidate = candidate.expression;
      continue;
    }
    break;
  }
  if (candidate !== undefined && ts.isStringLiteralLike(candidate)) return candidate;
  if (candidate !== undefined && analysis !== undefined && ts.isExpression(candidate)) {
    const folded = foldedString(candidate, analysis, candidate);
    return folded === undefined ? undefined : ts.factory.createStringLiteral(folded);
  }
  return undefined;
}

function unwrapTransparentExpression(expression: TypeScript.Expression): TypeScript.Expression {
  let unwrapped = expression;
  while (
    ts.isParenthesizedExpression(unwrapped)
    || ts.isAsExpression(unwrapped)
    || ts.isTypeAssertionExpression(unwrapped)
    || ts.isSatisfiesExpression(unwrapped)
    || ts.isNonNullExpression(unwrapped)
  ) {
    unwrapped = unwrapped.expression;
  }
  return unwrapped;
}

function callableExpression(expression: TypeScript.Expression): TypeScript.Expression {
  let callee = unwrapTransparentExpression(expression);
  while (ts.isBinaryExpression(callee) && callee.operatorToken.kind === ts.SyntaxKind.CommaToken) {
    callee = unwrapTransparentExpression(callee.right);
  }
  return callee;
}

type LoaderKind = "commonjs" | "create-require";
type LoaderIdentity = LoaderKind | "create-require-constructor";
type EvaluatorIdentity = "eval" | "Function";

interface EvaluatorState {
  readonly evaluator?: EvaluatorIdentity;
  readonly source?: string;
}

interface Binding {
  readonly name: string;
  tainted: boolean;
  initializer?: TypeScript.Expression;
  constant?: string;
  loader?: LoaderIdentity;
  readonly evaluatorWrites: Map<number, EvaluatorState>;
  readonly objectRootWrites: Map<number, Binding>;
  readonly properties: Map<string, ValueState>;
}

interface ValueState {
  readonly tainted?: boolean;
  readonly constant?: string;
  readonly loader?: LoaderIdentity;
  readonly evaluator?: EvaluatorIdentity;
  readonly evaluatorSource?: string;
  readonly objectRoot?: Binding;
  readonly missing?: true;
}

interface Scope {
  readonly parent?: Scope;
  readonly bindings: Map<string, Binding>;
}

interface AuthorityAnalysis {
  readonly scopes: WeakMap<TypeScript.Node, Scope>;
  readonly sourceScope: Scope;
  readonly commonjsModuleRoot: Binding;
  readonly literalRoots: WeakMap<TypeScript.ObjectLiteralExpression | TypeScript.ArrayLiteralExpression, Binding>;
  readonly arrayRestRoots: WeakMap<TypeScript.BindingElement | TypeScript.SpreadElement, Map<Binding, Map<number, Binding>>>;
}

function createAuthorityAnalysis(root: string, sourcePath: string, sourceFile: TypeScript.SourceFile): AuthorityAnalysis {
  const scopes = new WeakMap<TypeScript.Node, Scope>();
  const sourceScope: Scope = { bindings: new Map() };
  const commonjsModuleRoot = createSyntheticObjectRoot("module");
  commonjsModuleRoot.properties.set("require", valueState({ loader: "commonjs" }));
  const analysis: AuthorityAnalysis = {
    scopes,
    sourceScope,
    commonjsModuleRoot,
    literalRoots: new WeakMap(),
    arrayRestRoots: new WeakMap()
  };
  populateScopes(sourceFile, sourceScope, scopes);
  initializeImportBindings(root, sourcePath, sourceFile, analysis);
  let changed = true;
  while (changed) {
    changed = false;
    const change = (): void => { changed = true; };
    const visit = (node: TypeScript.Node): void => {
      if (ts.isVariableDeclaration(node)) {
        const state = node.initializer === undefined ? {} : valueForExpression(node.initializer, analysis, node);
        applyBindingPattern(node.name, state, analysis, node, change);
      } else if (ts.isParameter(node) && node.initializer !== undefined) {
        applyBindingPattern(node.name, valueForExpression(node.initializer, analysis, node), analysis, node, change);
      } else if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        const state = valueForExpression(node.right, analysis, node);
        applyAssignmentTarget(node.left, state, analysis, node, change);
      } else if (ts.isFunctionDeclaration(node) && node.name !== undefined) {
        setBindingTaint(
          declarationBinding(node, analysis),
          (node.body !== undefined && childReferencesTainted(node.body, analysis))
            || node.parameters.some((parameter) => parameter.initializer !== undefined && expressionReferencesTainted(parameter.initializer, analysis)),
          change
        );
      } else if (ts.isClassDeclaration(node) && node.name !== undefined) {
        setBindingTaint(declarationBinding(node, analysis), childReferencesTainted(node, analysis), change);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return analysis;
}

function populateScopes(sourceFile: TypeScript.SourceFile, sourceScope: Scope, scopes: WeakMap<TypeScript.Node, Scope>): void {
  const visit = (node: TypeScript.Node, scope: Scope): void => {
    scopes.set(node, scope);
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      if (clause?.name !== undefined) declareBinding(scope, clause.name.text);
      if (clause?.namedBindings !== undefined) {
        if (ts.isNamespaceImport(clause.namedBindings)) declareBinding(scope, clause.namedBindings.name.text);
        else for (const specifier of clause.namedBindings.elements) declareBinding(scope, specifier.name.text);
      }
    } else if (ts.isImportEqualsDeclaration(node)) {
      declareBinding(scope, node.name.text);
    } else if (ts.isVariableDeclaration(node)) {
      for (const name of rawBindingNames(node.name)) declareBinding(scope, name);
      if (ts.isIdentifier(node.name) && node.initializer !== undefined) {
        const binding = declareBinding(scope, node.name.text);
        if (binding.initializer === undefined) binding.initializer = node.initializer;
      }
    } else if (ts.isFunctionDeclaration(node) && node.name !== undefined) {
      declareBinding(scope, node.name.text);
    } else if (ts.isClassDeclaration(node) && node.name !== undefined) {
      declareBinding(scope, node.name.text);
    } else if (ts.isEnumDeclaration(node)) {
      declareBinding(scope, node.name.text);
    } else if (ts.isModuleDeclaration(node)) {
      declareBinding(scope, node.name.text);
    }

    const childScope = createsScope(node, sourceFile) ? { parent: scope, bindings: new Map() } : scope;
    if (ts.isFunctionLike(node)) {
      if (node.name !== undefined && ts.isIdentifier(node.name)) declareBinding(childScope, node.name.text);
      for (const parameter of node.parameters) {
        for (const name of rawBindingNames(parameter.name)) declareBinding(childScope, name);
      }
    } else if (ts.isClassExpression(node) && node.name !== undefined) {
      declareBinding(childScope, node.name.text);
    }
    ts.forEachChild(node, (child) => visit(child, childScope));
  };
  visit(sourceFile, sourceScope);
}

function createsScope(node: TypeScript.Node, sourceFile: TypeScript.SourceFile): boolean {
  return node !== sourceFile && (ts.isBlock(node) || ts.isCatchClause(node) || ts.isClassDeclaration(node)
    || ts.isClassExpression(node) || ts.isFunctionLike(node) || ts.isModuleBlock(node));
}

function declareBinding(scope: Scope, name: string): Binding {
  const existing = scope.bindings.get(name);
  if (existing !== undefined) return existing;
  const binding: Binding = {
    name,
    tainted: false,
    evaluatorWrites: new Map(),
    objectRootWrites: new Map(),
    properties: new Map()
  };
  scope.bindings.set(name, binding);
  return binding;
}

function initializeImportBindings(root: string, sourcePath: string, sourceFile: TypeScript.SourceFile, analysis: AuthorityAnalysis): void {
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const clause = statement.importClause;
    if (clause === undefined) continue;
    const moduleText = staticModuleSpecifier(statement.moduleSpecifier)?.text;
    const protectedModule = protectedModuleFor(root, sourcePath, statement.moduleSpecifier);
    if (protectedModule !== undefined && !clause.isTypeOnly) {
      if (clause.name !== undefined) markTainted(bindingForIdentifier(clause.name, analysis));
      if (clause.namedBindings !== undefined) {
        if (ts.isNamespaceImport(clause.namedBindings)) markTainted(bindingForIdentifier(clause.namedBindings.name, analysis));
        else for (const specifier of clause.namedBindings.elements) {
          if (!specifier.isTypeOnly) markTainted(bindingForIdentifier(specifier.name, analysis));
        }
      }
    }
    if ((moduleText !== "node:module" && moduleText !== "module") || clause.isTypeOnly) continue;
    if (clause.name !== undefined) setLoader(bindingForIdentifier(clause.name, analysis), "create-require-constructor");
    if (clause.namedBindings !== undefined) {
      if (ts.isNamespaceImport(clause.namedBindings)) setLoader(bindingForIdentifier(clause.namedBindings.name, analysis), "create-require-constructor");
      else for (const specifier of clause.namedBindings.elements) {
        if (!specifier.isTypeOnly && importedName(specifier) === "createRequire") {
          setLoader(bindingForIdentifier(specifier.name, analysis), "create-require-constructor");
        }
      }
    }
  }
}

function bindingForIdentifier(identifier: TypeScript.Identifier, analysis: AuthorityAnalysis): Binding | undefined {
  return bindingForName(identifier.text, analysis.scopes.get(identifier) ?? analysis.sourceScope);
}

function declarationBinding(
  declaration: TypeScript.FunctionDeclaration | TypeScript.ClassDeclaration,
  analysis: AuthorityAnalysis
): Binding | undefined {
  return declaration.name === undefined ? undefined : bindingForName(
    declaration.name.text,
    analysis.scopes.get(declaration) ?? analysis.sourceScope
  );
}

function declarationReferencesTainted(
  declaration: TypeScript.FunctionDeclaration | TypeScript.ClassDeclaration,
  analysis: AuthorityAnalysis
): boolean {
  const binding = declarationBinding(declaration, analysis);
  return binding !== undefined && bindingReferencesTainted(binding, declaration.pos);
}

function bindingForName(name: string, initialScope: Scope): Binding | undefined {
  let scope: Scope | undefined = initialScope;
  while (scope !== undefined) {
    const binding = scope.bindings.get(name);
    if (binding !== undefined) return binding;
    scope = scope.parent;
  }
  return undefined;
}

function rawBindingNames(name: TypeScript.BindingName): string[] {
  if (ts.isIdentifier(name)) return [name.text];
  return name.elements.flatMap((element) => ts.isBindingElement(element) ? rawBindingNames(element.name) : []);
}

function bindingNames(name: TypeScript.BindingName, analysis: AuthorityAnalysis): Binding[] {
  if (ts.isIdentifier(name)) {
    const binding = bindingForIdentifier(name, analysis);
    return binding === undefined ? [] : [binding];
  }
  return name.elements.flatMap((element) => ts.isBindingElement(element) ? bindingNames(element.name, analysis) : []);
}

function bindingIsTainted(identifier: TypeScript.Identifier, analysis: AuthorityAnalysis): boolean {
  const binding = bindingForIdentifier(identifier, analysis);
  return binding !== undefined && bindingReferencesTainted(binding, identifier.pos);
}

function exportSpecifierBindingIsTainted(specifier: TypeScript.ExportSpecifier, analysis: AuthorityAnalysis): boolean {
  const bindingName = specifier.propertyName ?? specifier.name;
  const binding = bindingForName(bindingName.text, analysis.scopes.get(bindingName) ?? analysis.sourceScope);
  return binding !== undefined && bindingReferencesTainted(binding, bindingName.pos);
}

function bindingReferencesTainted(binding: Binding, position: number): boolean {
  return valueReferencesTainted(valueState({
    tainted: binding.tainted,
    objectRoot: objectRootFor(binding, position)
  }));
}

function valueReferencesTainted(value: ValueState, visited = new Set<Binding>()): boolean {
  if (value.tainted === true) return true;
  const objectRoot = value.objectRoot;
  if (objectRoot === undefined || visited.has(objectRoot)) return false;
  visited.add(objectRoot);
  if (objectRoot.tainted) return true;
  for (const property of objectRoot.properties.values()) {
    if (valueReferencesTainted(property, visited)) return true;
  }
  return false;
}

function markTainted(binding: Binding | undefined): boolean {
  if (binding === undefined || binding.tainted) return false;
  binding.tainted = true;
  return true;
}

function setBindingTaint(binding: Binding | undefined, tainted: boolean, change: () => void): void {
  if (tainted && markTainted(binding)) change();
}

function setLoader(binding: Binding | undefined, loader: LoaderIdentity): boolean {
  if (binding === undefined || binding.loader !== undefined) return false;
  binding.loader = loader;
  return true;
}

function setEvaluatorState(
  binding: Binding | undefined,
  evaluator: EvaluatorIdentity | undefined,
  source: string | undefined,
  writePosition: number
): boolean {
  if (binding === undefined) return false;
  const next = evaluatorState(evaluator, source);
  const prior = binding.evaluatorWrites.get(writePosition);
  if (sameEvaluatorState(prior, next)) return false;
  binding.evaluatorWrites.set(writePosition, next);
  return true;
}

function applyBindingPattern(
  name: TypeScript.BindingName,
  value: ValueState,
  analysis: AuthorityAnalysis,
  context: TypeScript.Node,
  change: () => void
): void {
  if (ts.isIdentifier(name)) {
    applyBindingValue(bindingForIdentifier(name, analysis), value, name.pos, change);
  } else if (ts.isObjectBindingPattern(name)) {
    for (const element of name.elements) {
      if (!ts.isBindingElement(element)) continue;
      const property = valueForObjectBindingElement(element, value, analysis, context);
      applyBindingPattern(element.name, property, analysis, context, change);
      applyBindingDefault(element, property, analysis, context, change);
    }
  } else {
    for (const [index, element] of name.elements.entries()) {
      if (!ts.isBindingElement(element)) continue;
      const entry = valueForArrayBindingElement(element, index, value, analysis);
      applyBindingPattern(element.name, entry, analysis, context, change);
      applyBindingDefault(element, entry, analysis, context, change);
    }
  }
}

function applyBindingDefault(
  element: TypeScript.BindingElement,
  value: ValueState,
  analysis: AuthorityAnalysis,
  context: TypeScript.Node,
  change: () => void
): void {
  if (element.initializer !== undefined && value.missing === true) {
    applyBindingPattern(
      element.name,
      valueForExpression(element.initializer, analysis, context),
      analysis,
      context,
      change
    );
  }
}

function applyBindingValue(
  binding: Binding | undefined,
  value: ValueState,
  writePosition: number,
  change: () => void
): void {
  if (value.tainted && markTainted(binding)) change();
  if (value.constant !== undefined && binding !== undefined && binding.constant === undefined) {
    binding.constant = value.constant;
    change();
  }
  if (value.loader !== undefined && setLoader(binding, value.loader)) change();
  if (setEvaluatorState(binding, value.evaluator, value.evaluatorSource, writePosition)) change();
  if (value.objectRoot !== undefined && binding !== undefined) {
    if (binding.objectRootWrites.get(writePosition) !== value.objectRoot) {
      binding.objectRootWrites.set(writePosition, value.objectRoot);
      change();
    }
  }
}

function valueForObjectBindingElement(
  element: TypeScript.BindingElement,
  value: ValueState,
  analysis: AuthorityAnalysis,
  context: TypeScript.Node
): ValueState {
  if (element.dotDotDotToken !== undefined) return value;
  const key = bindingElementPropertyName(element, analysis, context);
  if (key === undefined) return valueState({ tainted: value.tainted === true });
  const property = value.objectRoot?.properties.get(key);
  if (property !== undefined) return property;
  return value.objectRoot === undefined ? value : valueState({ tainted: value.tainted === true, missing: true });
}

function valueForArrayBindingElement(
  element: TypeScript.BindingElement,
  index: number,
  value: ValueState,
  analysis: AuthorityAnalysis
): ValueState {
  if (element.dotDotDotToken !== undefined) return arrayRestValue(value, index, element, analysis);
  const entry = value.objectRoot?.properties.get(String(index));
  if (entry !== undefined) return entry;
  return value.objectRoot === undefined ? value : valueState({ tainted: value.tainted === true, missing: true });
}

function arrayRestValue(
  value: ValueState,
  index: number,
  site: TypeScript.BindingElement | TypeScript.SpreadElement,
  analysis: AuthorityAnalysis
): ValueState {
  const sourceRoot = value.objectRoot;
  if (sourceRoot === undefined) return value;
  let rootsByInput = analysis.arrayRestRoots.get(site);
  if (rootsByInput === undefined) {
    rootsByInput = new Map();
    analysis.arrayRestRoots.set(site, rootsByInput);
  }
  let rootsByIndex = rootsByInput.get(sourceRoot);
  if (rootsByIndex === undefined) {
    rootsByIndex = new Map();
    rootsByInput.set(sourceRoot, rootsByIndex);
  }
  let rest = rootsByIndex.get(index);
  if (rest === undefined) {
    rest = createSyntheticObjectRoot("array-rest");
    rootsByIndex.set(index, rest);
  }
  for (const [key, entry] of sourceRoot.properties) {
    const position = Number(key);
    if (Number.isInteger(position) && position >= index) rest.properties.set(String(position - index), entry);
  }
  return valueState({ tainted: value.tainted === true, objectRoot: rest });
}

function bindingElementPropertyName(
  element: TypeScript.BindingElement,
  analysis: AuthorityAnalysis,
  context: TypeScript.Node
): string | undefined {
  if (element.propertyName !== undefined) return staticPropertyName(element.propertyName, analysis, context);
  return ts.isIdentifier(element.name) ? element.name.text : undefined;
}

function applyAssignmentTarget(
  target: TypeScript.Expression,
  value: ValueState,
  analysis: AuthorityAnalysis,
  context: TypeScript.Node,
  change: () => void
): void {
  const unwrapped = unwrapTransparentExpression(target);
  if (ts.isBinaryExpression(unwrapped) && unwrapped.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
    const next = value.missing === true ? valueForExpression(unwrapped.right, analysis, context) : value;
    applyAssignmentTarget(unwrapped.left, next, analysis, context, change);
    return;
  }
  if (ts.isIdentifier(unwrapped)) {
    applyBindingPattern(unwrapped, value, analysis, context, change);
    return;
  }
  const property = propertyReference(unwrapped, analysis, context);
  if (property !== undefined) {
    const prior = property.receiver.properties.get(property.key);
    const constant = value.constant ?? prior?.constant;
    const loader = value.loader ?? prior?.loader;
    const evaluator = value.evaluator ?? prior?.evaluator;
    const evaluatorSource = value.evaluatorSource ?? prior?.evaluatorSource;
    const objectRoot = value.objectRoot ?? prior?.objectRoot;
    const next = valueState({
      tainted: prior?.tainted === true || value.tainted === true,
      ...(constant === undefined ? {} : { constant }),
      ...(loader === undefined ? {} : { loader }),
      ...(evaluator === undefined ? {} : { evaluator }),
      ...(evaluatorSource === undefined ? {} : { evaluatorSource }),
      ...(objectRoot === undefined ? {} : { objectRoot })
    });
    if (!sameValueState(prior, next)) {
      property.receiver.properties.set(property.key, next);
      change();
    }
    return;
  }
  if (ts.isObjectLiteralExpression(unwrapped)) {
    for (const propertyAssignment of unwrapped.properties) {
      if (ts.isPropertyAssignment(propertyAssignment)) {
        const key = staticPropertyName(propertyAssignment.name, analysis, context);
        if (key !== undefined) {
          applyAssignmentTarget(
            propertyAssignment.initializer,
            valueForObjectProperty(key, value),
            analysis,
            context,
            change
          );
        }
      } else if (ts.isShorthandPropertyAssignment(propertyAssignment)) {
        const property = valueForObjectProperty(propertyAssignment.name.text, value);
        applyAssignmentTarget(propertyAssignment.name, property, analysis, context, change);
        if (propertyAssignment.objectAssignmentInitializer !== undefined && property.missing === true) {
          applyAssignmentTarget(
            propertyAssignment.name,
            valueForExpression(propertyAssignment.objectAssignmentInitializer, analysis, context),
            analysis,
            context,
            change
          );
        }
      } else if (ts.isSpreadAssignment(propertyAssignment)) {
        applyAssignmentTarget(propertyAssignment.expression, value, analysis, context, change);
      }
    }
    return;
  }
  if (ts.isArrayLiteralExpression(unwrapped)) {
    for (const [index, element] of unwrapped.elements.entries()) {
      if (ts.isOmittedExpression(element)) continue;
      if (ts.isSpreadElement(element)) {
        applyAssignmentTarget(element.expression, arrayRestValue(value, index, element, analysis), analysis, context, change);
      } else {
        applyAssignmentTarget(element, valueForArrayEntry(index, value), analysis, context, change);
      }
    }
  }
}

function valueForObjectProperty(key: string, value: ValueState): ValueState {
  const property = value.objectRoot?.properties.get(key);
  if (property !== undefined) return property;
  return value.objectRoot === undefined ? value : valueState({ tainted: value.tainted === true, missing: true });
}

function valueForArrayEntry(index: number, value: ValueState): ValueState {
  const entry = value.objectRoot?.properties.get(String(index));
  if (entry !== undefined) return entry;
  return value.objectRoot === undefined ? value : valueState({ tainted: value.tainted === true, missing: true });
}

function valueForExpression(expression: TypeScript.Expression, analysis: AuthorityAnalysis, context: TypeScript.Node): ValueState {
  const node = unwrapTransparentExpression(expression);
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.CommaToken) {
    return valueForExpression(node.right, analysis, context);
  }
  if (ts.isIdentifier(node)) {
    const binding = bindingForIdentifier(node, analysis);
    if (binding === undefined) {
      if (node.text === "module") return valueState({ objectRoot: analysis.commonjsModuleRoot });
      const evaluator = globalEvaluatorKind(node.text);
      return node.text === "require" ? valueState({ loader: "commonjs" })
        : evaluator === undefined ? {} : valueState({ evaluator });
    }
    const objectRoot = objectRootFor(binding, node.pos);
    const evaluator = evaluatorStateBefore(binding, node.pos);
    return valueState({
      tainted: binding.tainted,
      ...(binding.constant === undefined ? {} : { constant: binding.constant }),
      ...(binding.loader === undefined ? {} : { loader: binding.loader }),
      ...(evaluator?.evaluator === undefined ? {} : { evaluator: evaluator.evaluator }),
      ...(evaluator?.source === undefined ? {} : { evaluatorSource: evaluator.source }),
      ...(objectRoot === undefined ? {} : { objectRoot })
    });
  }
  if (ts.isObjectLiteralExpression(node)) return valueForObjectLiteral(node, analysis, context);
  if (ts.isArrayLiteralExpression(node)) return valueForArrayLiteral(node, analysis, context);
  const literal = foldedString(node, analysis, context);
  if (literal !== undefined) return { constant: literal };
  const property = propertyReference(node, analysis, context);
  if (property !== undefined) {
    const stored = property.receiver.properties.get(property.key);
    if (stored !== undefined) return stored;
    const loader = loaderKindFor(node, analysis, context);
    return loader === undefined ? {} : { loader };
  }
  if (ts.isCallExpression(node)) {
    const evaluator = boundEvaluatorValueFor(node, analysis);
    if (evaluator !== undefined) return evaluator;
    const loader = loaderKindFor(node, analysis, context);
    if (loader !== undefined) return { loader };
  }
  return { tainted: childReferencesTainted(node, analysis) };
}

function boundEvaluatorValueFor(
  node: TypeScript.CallExpression,
  analysis: AuthorityAnalysis
): ValueState | undefined {
  const callee = callableExpression(node.expression);
  if (!ts.isPropertyAccessExpression(callee) || callee.name.text !== "bind") return undefined;
  const evaluator = evaluatorValueFor(callee.expression, analysis);
  if (evaluator === undefined) return undefined;
  const source = evaluator.evaluator === "eval"
    ? evaluator.source ?? foldedString(node.arguments[1], analysis, node)
    : node.arguments.length > 1
      ? foldedString(node.arguments.at(-1), analysis, node)
      : evaluator.source;
  return valueState({
    evaluator: evaluator.evaluator,
    ...(source === undefined ? {} : { evaluatorSource: source })
  });
}

function valueForObjectLiteral(
  node: TypeScript.ObjectLiteralExpression,
  analysis: AuthorityAnalysis,
  context: TypeScript.Node
): ValueState {
  const objectRoot = literalRootFor(node, analysis, "object-literal");
  let tainted = false;
  for (const property of node.properties) {
    if (ts.isPropertyAssignment(property)) {
      const key = staticPropertyName(property.name, analysis, context);
      if (key === undefined) continue;
      const value = valueForExpression(property.initializer, analysis, context);
      objectRoot.properties.set(key, value);
      tainted ||= value.tainted === true;
    } else if (ts.isShorthandPropertyAssignment(property)) {
      const value = valueForExpression(property.name, analysis, context);
      objectRoot.properties.set(property.name.text, value);
      tainted ||= value.tainted === true;
    } else if (ts.isSpreadAssignment(property)) {
      const value = valueForExpression(property.expression, analysis, context);
      tainted ||= value.tainted === true;
      if (value.objectRoot !== undefined) {
        for (const [key, entry] of value.objectRoot.properties) objectRoot.properties.set(key, entry);
      }
    }
  }
  return valueState({ tainted, objectRoot });
}

function valueForArrayLiteral(
  node: TypeScript.ArrayLiteralExpression,
  analysis: AuthorityAnalysis,
  context: TypeScript.Node
): ValueState {
  const objectRoot = literalRootFor(node, analysis, "array-literal");
  let tainted = false;
  let index = 0;
  for (const element of node.elements) {
    if (ts.isOmittedExpression(element)) {
      index += 1;
      continue;
    }
    if (ts.isSpreadElement(element)) {
      const value = valueForExpression(element.expression, analysis, context);
      tainted ||= value.tainted === true;
      if (value.objectRoot !== undefined) {
        for (const [key, entry] of value.objectRoot.properties) {
          const position = Number(key);
          if (Number.isInteger(position) && position >= 0) objectRoot.properties.set(String(index + position), entry);
        }
      }
      continue;
    }
    const value = valueForExpression(element, analysis, context);
    objectRoot.properties.set(String(index), value);
    tainted ||= value.tainted === true;
    index += 1;
  }
  return valueState({ tainted, objectRoot });
}

function childReferencesTainted(node: TypeScript.Node, analysis: AuthorityAnalysis): boolean {
  if (ts.isIdentifier(node)) return bindingIsTainted(node, analysis);
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    const property = propertyReference(node, analysis, node);
    return property?.receiver.properties.get(property.key)?.tainted === true
      || childReferencesTainted(node.expression, analysis)
      || (ts.isElementAccessExpression(node) && node.argumentExpression !== undefined && childReferencesTainted(node.argumentExpression, analysis));
  }
  if (ts.isPropertyAssignment(node)) return childReferencesTainted(node.initializer, analysis);
  if (ts.isShorthandPropertyAssignment(node)) return bindingIsTainted(node.name, analysis)
    || (node.objectAssignmentInitializer !== undefined && childReferencesTainted(node.objectAssignmentInitializer, analysis));
  if (ts.isVariableDeclaration(node)) return node.initializer !== undefined && childReferencesTainted(node.initializer, analysis);
  if (ts.isBindingElement(node)) return (node.initializer !== undefined && childReferencesTainted(node.initializer, analysis))
    || childReferencesTainted(node.name, analysis);
  if (ts.isParameter(node)) return node.initializer !== undefined && childReferencesTainted(node.initializer, analysis);
  if (ts.isPropertyDeclaration(node)) return node.initializer !== undefined && childReferencesTainted(node.initializer, analysis);
  if (ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
    return (node.body !== undefined && childReferencesTainted(node.body, analysis))
      || node.parameters.some((parameter) => childReferencesTainted(parameter, analysis));
  }
  let found = false;
  ts.forEachChild(node, (child) => { if (!found && childReferencesTainted(child, analysis)) found = true; });
  return found;
}

function objectRootFor(binding: Binding, position: number): Binding {
  let current = binding;
  const visited = new Set<Binding>();
  while (!visited.has(current)) {
    visited.add(current);
    const root = objectRootWriteBefore(current, position);
    if (root === undefined || root === current) return current;
    current = root;
  }
  return current;
}

function createSyntheticObjectRoot(name: string): Binding {
  return {
    name,
    tainted: false,
    evaluatorWrites: new Map(),
    objectRootWrites: new Map(),
    properties: new Map()
  };
}

function objectRootWriteBefore(binding: Binding, position: number): Binding | undefined {
  let selectedPosition = -1;
  let selected: Binding | undefined;
  for (const [writePosition, root] of binding.objectRootWrites) {
    if (writePosition <= position && writePosition > selectedPosition) {
      selectedPosition = writePosition;
      selected = root;
    }
  }
  return selected;
}

function evaluatorStateBefore(binding: Binding, position: number): EvaluatorState | undefined {
  let selectedPosition = -1;
  let selected: EvaluatorState | undefined;
  for (const [writePosition, state] of binding.evaluatorWrites) {
    if (writePosition <= position && writePosition > selectedPosition) {
      selectedPosition = writePosition;
      selected = state;
    }
  }
  return selected;
}

function evaluatorState(evaluator: EvaluatorIdentity | undefined, source: string | undefined): EvaluatorState {
  return {
    ...(evaluator === undefined ? {} : { evaluator }),
    ...(source === undefined ? {} : { source })
  };
}

function sameEvaluatorState(left: EvaluatorState | undefined, right: EvaluatorState): boolean {
  return left?.evaluator === right.evaluator && left?.source === right.source;
}

function literalRootFor(
  node: TypeScript.ObjectLiteralExpression | TypeScript.ArrayLiteralExpression,
  analysis: AuthorityAnalysis,
  name: string
): Binding {
  const existing = analysis.literalRoots.get(node);
  if (existing !== undefined) return existing;
  const root = createSyntheticObjectRoot(name);
  analysis.literalRoots.set(node, root);
  return root;
}

function propertyReference(expression: TypeScript.Expression, analysis: AuthorityAnalysis, context: TypeScript.Node): { readonly receiver: Binding; readonly key: string } | undefined {
  const node = unwrapTransparentExpression(expression);
  if (!ts.isPropertyAccessExpression(node) && !ts.isElementAccessExpression(node)) return undefined;
  const key = ts.isPropertyAccessExpression(node)
    ? node.name.text
    : foldedString(node.argumentExpression, analysis, context);
  if (key === undefined) return undefined;
  const receiver = valueForExpression(node.expression, analysis, context).objectRoot;
  return receiver === undefined ? undefined : { receiver, key };
}

function sameValueState(left: ValueState | undefined, right: ValueState): boolean {
  return left?.tainted === right.tainted && left?.constant === right.constant
    && left?.loader === right.loader && left?.evaluator === right.evaluator
    && left?.evaluatorSource === right.evaluatorSource
    && left?.objectRoot === right.objectRoot && left?.missing === right.missing;
}

function valueState(value: {
  readonly tainted?: boolean;
  readonly constant?: string;
  readonly loader?: LoaderIdentity;
  readonly evaluator?: EvaluatorIdentity;
  readonly evaluatorSource?: string;
  readonly objectRoot?: Binding;
  readonly missing?: true;
}): ValueState {
  const state: {
    tainted?: boolean;
    constant?: string;
    loader?: LoaderIdentity;
    evaluator?: EvaluatorIdentity;
    evaluatorSource?: string;
    objectRoot?: Binding;
    missing?: true;
  } = {};
  if (value.tainted !== undefined) state.tainted = value.tainted;
  if (value.constant !== undefined) state.constant = value.constant;
  if (value.loader !== undefined) state.loader = value.loader;
  if (value.evaluator !== undefined) state.evaluator = value.evaluator;
  if (value.evaluatorSource !== undefined) state.evaluatorSource = value.evaluatorSource;
  if (value.objectRoot !== undefined) state.objectRoot = value.objectRoot;
  if (value.missing !== undefined) state.missing = value.missing;
  return state;
}

function foldedString(expression: TypeScript.Expression | undefined, analysis: AuthorityAnalysis, context: TypeScript.Node): string | undefined {
  if (expression === undefined) return undefined;
  const node = unwrapTransparentExpression(expression);
  if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = foldedString(node.left, analysis, context);
    const right = foldedString(node.right, analysis, context);
    return left === undefined || right === undefined ? undefined : `${left}${right}`;
  }
  if (ts.isIdentifier(node)) return bindingForIdentifier(node, analysis)?.constant;
  void context;
  return undefined;
}

function loaderKindFor(expression: TypeScript.Expression, analysis: AuthorityAnalysis, context: TypeScript.Node): LoaderKind | "create-require-constructor" | undefined {
  const node = callableExpression(expression);
  if (ts.isIdentifier(node)) {
    const binding = bindingForIdentifier(node, analysis);
    if (binding !== undefined) return binding.loader
      ?? (binding.initializer === undefined ? undefined : loaderKindFor(binding.initializer, analysis, binding.initializer));
    return node.text === "require" ? "commonjs" : undefined;
  }
  if (ts.isCallExpression(node)) {
    const callee = unwrapTransparentExpression(node.expression);
    if ((ts.isPropertyAccessExpression(callee) || ts.isElementAccessExpression(callee))
      && propertyNameFor(callee, analysis, context) === "bind") {
      const bound = loaderKindFor(callee.expression, analysis, context);
      if (bound !== undefined) return bound;
    }
    const calleeKind = loaderKindFor(node.expression, analysis, context);
    if (calleeKind === "create-require-constructor") return "create-require";
    return calleeKind;
  }
  if (!ts.isPropertyAccessExpression(node) && !ts.isElementAccessExpression(node)) return undefined;
  const key = propertyNameFor(node, analysis, context);
  const receiver = unwrapTransparentExpression(node.expression);
  if (ts.isIdentifier(receiver) && bindingForIdentifier(receiver, analysis) === undefined && receiver.text === "module" && key === "require") {
    return "commonjs";
  }
  const receiverBinding = ts.isIdentifier(receiver) ? bindingForIdentifier(receiver, analysis) : undefined;
  if (receiverBinding?.loader === "create-require-constructor" && key === "createRequire") return "create-require-constructor";
  const property = propertyReference(node, analysis, context);
  return property?.receiver.properties.get(property.key)?.loader;
}

function globalEvaluatorKind(name: string): EvaluatorIdentity | undefined {
  return name === "eval" || name === "Function" ? name : undefined;
}

function propertyNameFor(node: TypeScript.PropertyAccessExpression | TypeScript.ElementAccessExpression, analysis: AuthorityAnalysis, context: TypeScript.Node): string | undefined {
  return ts.isPropertyAccessExpression(node) ? node.name.text : foldedString(node.argumentExpression, analysis, context);
}

function staticPropertyName(name: TypeScript.PropertyName, analysis: AuthorityAnalysis, context: TypeScript.Node): string | undefined {
  return ts.isComputedPropertyName(name) ? foldedString(name.expression, analysis, context) : name.text;
}

function stripModuleSuffix(specifier: string): string {
  const suffix = [specifier.indexOf("?"), specifier.indexOf("#")]
    .filter((index) => index >= 0)
    .reduce((first, index) => Math.min(first, index), specifier.length);
  return specifier.slice(0, suffix);
}

function stripSourceExtension(path: string): string {
  const extension = extname(path);
  return sourceExtensions.has(extension) || extension === ".js" || extension === ".mjs" || extension === ".cjs"
    ? path.slice(0, -extension.length)
    : path;
}

function productionSourceFiles(root: string): string[] {
  const packagesRoot = join(root, "packages");
  if (!existsSync(packagesRoot)) return [];
  return readdirSync(packagesRoot, { withFileTypes: true }).flatMap((entry) => {
    const sourceRoot = join(packagesRoot, entry.name, "src");
    return entry.isDirectory() && existsSync(sourceRoot) ? collectTypeScriptFiles(sourceRoot) : [];
  });
}

function collectTypeScriptFiles(sourceRoot: string): string[] {
  return readdirSync(sourceRoot, { withFileTypes: true }).flatMap((entry) => {
    const path = join(sourceRoot, entry.name);
    if (entry.isDirectory()) return collectTypeScriptFiles(path);
    return entry.isFile() && sourceExtensions.has(extname(entry.name)) ? [path] : [];
  });
}

function scriptKindFor(path: string): TypeScript.ScriptKind {
  return extname(path) === ".tsx" ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

function createFixtureWorkspace(): string {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "task137a-operation-imports-"));
  temporaryFixtureRoots.push(fixtureRoot);
  return fixtureRoot;
}

function writeFixtureSource(fixtureRoot: string, relativePath: string, source: string): void {
  const sourcePath = join(fixtureRoot, ...relativePath.split("/"));
  mkdirSync(dirname(sourcePath), { recursive: true });
  writeFileSync(sourcePath, source);
}
