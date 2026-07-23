import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const sourcePath = resolve(process.cwd(), "packages/local-runtime/src/resident-loop-factory-ports.ts");
const permittedResidentImports = Object.freeze({
  dispatcher: {
    gatewayDefault: "./resident-loop-tool-gateway.js",
    adapters: [
      "./adapters/provider-byte-transfer.js",
      "./adapters/prr-correspondence.js",
      "./adapters/accepted-graph-review.js",
      "./adapters/export-report.js",
      "./adapters/destructive-repair.js",
      "./adapters/legacy-staging.js"
    ]
  },
  wakeRuntime: {
    dispatcherDefault: "../../agent/src/domain-execution-dispatcher.js",
    gatewayNamedConstructor: "../../agent/src/resident-loop-tool-gateway.js"
  },
  factoryPorts: {
    boundedIssuer: "../../agent/src/bounded-agent-loop.js"
  }
} as const);

describe("resident loop factory ports import policy", () => {
  it("keeps the data-only bridge static, named, cycle-free, and outside mounted-authority producers", () => {
    if (!existsSync(sourcePath)) return;

    const source = readFileSync(sourcePath, "utf8");
    const parsed = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const imports = parsed.statements.filter(ts.isImportDeclaration);

    expect([3, 5]).toContain(imports.length);
    expect(source).toContain('from "node:util"');
    expect(source).toContain('from "./resident-loop-factory-composition.js"');
    expect(source).toContain('from "./resident-loop-provider-posture.js"');
    if (imports.length === 5) {
      expect(source).toContain('from "node:net"');
      expect(source).toContain('from "../../agent/src/secret-safety.js"');
    }
    expect(source).not.toMatch(/runtime-factory\.js|mounted-(?:provider|artifact)-authority(?:-operation)?\.js|wake-supervisor-runtime\.js/);
    expect(source).not.toMatch(/\bimport\s*\(|\brequire\s*\(|\bexport\s+(?:\*|\{)/);

    for (const declaration of imports) {
      expect(declaration.importClause?.name).toBeUndefined();
      expect(declaration.importClause?.namedBindings === undefined || ts.isNamedImports(declaration.importClause.namedBindings)).toBe(true);
      if (declaration.importClause?.namedBindings !== undefined && ts.isNamedImports(declaration.importClause.namedBindings)) {
        for (const element of declaration.importClause.namedBindings.elements) expect(element.propertyName).toBeUndefined();
      }
    }
  });

  it("enforces the exact dispatcher G W H R static import graph with no runtime activation", () => {
    const paths = {
      dispatcher: resolve(process.cwd(), "packages/agent/src/domain-execution-dispatcher.ts"),
      gateway: resolve(process.cwd(), "packages/agent/src/resident-loop-tool-gateway.ts"),
      wake: resolve(process.cwd(), "packages/local-runtime/src/wake-supervisor-runtime.ts"),
      handoff: resolve(process.cwd(), "packages/agent/src/specialist-handoff-projection.ts"),
      factory: sourcePath,
      bounded: resolve(process.cwd(), "packages/agent/src/bounded-agent-loop.ts"),
      agentBarrel: resolve(process.cwd(), "packages/agent/src/index.ts")
    };
    const activationPaths = [
      "packages/local-runtime/src/agent-runtime-factory.ts",
      "packages/local-runtime/src/agent-http-routes.ts",
      "packages/local-runtime/src/http-handler.ts",
      "packages/local-runtime/src/operator-status-providers.ts",
      "packages/local-runtime/src/server.ts"
    ];
    const forbiddenForms = [
      /\bimport\s*\(/,
      /\brequire\s*\(/,
      /\beval\s*\(/,
      /\bFunction\s*\(/,
      /loader[-_ ]?exemption/i,
      /import\s+\*\s+as\s+.*resident/i,
      /export\s+(?:\*|\{)[^;]*resident/i
    ];

    expect(existsSync(paths.bounded)).toBe(true);
    const sources = Object.fromEntries(
      Object.entries(paths).map(([name, path]) => [name, readFileSync(path, "utf8")])
    ) as Record<keyof typeof paths, string>;

    expect(sources.dispatcher).toContain(`from "${permittedResidentImports.dispatcher.gatewayDefault}"`);
    for (const adapter of permittedResidentImports.dispatcher.adapters) {
      expect(sources.dispatcher).toContain(`from "${adapter}"`);
    }
    expect(sources.wake).toContain(`from "${permittedResidentImports.wakeRuntime.dispatcherDefault}"`);
    expect(sources.wake).toContain(`from "${permittedResidentImports.wakeRuntime.gatewayNamedConstructor}"`);
    expect(sources.factory).toContain(`from "${permittedResidentImports.factoryPorts.boundedIssuer}"`);
    expect(sources.bounded).not.toMatch(/local-runtime|wake-supervisor-runtime|resident-loop-factory-ports/);
    expect(sources.agentBarrel).not.toMatch(/BoundedAgentLoop|ResidentDomainExecution|PackageOwnedResident|InternalSpecialistHandoff/);

    for (const [name, source] of Object.entries(sources)) {
      for (const pattern of forbiddenForms) expect(source, `${name}:${pattern}`).not.toMatch(pattern);
    }
    for (const path of activationPaths) {
      const source = readFileSync(resolve(process.cwd(), path), "utf8");
      expect(source, path).not.toMatch(/resident-loop-factory-ports|createResidentBoundedAgentLoopFactory|bounded-agent-loop/);
    }
  });
});
