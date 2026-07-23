import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];
const target = "wake-supervisor-runtime.js";
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

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function importers(root: string) {
  const source = readFileSync(join(root, "src.ts"), "utf8");
  return [...source.matchAll(/from\s+["']([^"']*wake-supervisor-runtime\.js)["']/g)].map((match) => match[1]);
}

function fixture(source: string) {
  const root = mkdtempSync(join(tmpdir(), "cestus-wake-imports-"));
  roots.push(root);
  writeFileSync(join(root, "src.ts"), source);
  return root;
}

describe("wake supervisor runtime import boundary", () => {
  it("permits zero production importers before R0 factory integration", () => {
    const source = readFileSync(new URL("../src/wake-supervisor-runtime.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/agent-runtime-factory/);
  });

  it("permits exactly one direct factory importer after R0", () => {
    expect(importers(fixture(`import { createWakeSupervisorRuntime } from "./${target}";\nvoid createWakeSupervisorRuntime;`))).toEqual([`./${target}`]);
  });

  it("rejects route status and DTO importer classes", () => {
    const forbidden = ["route", "status", "dto"];
    for (const name of forbidden) {
      const root = fixture(`// ${name}\nimport { createWakeSupervisorRuntime } from "./${target}";`);
      expect(readFileSync(join(root, "src.ts"), "utf8")).toMatch(/createWakeSupervisorRuntime/);
      expect(name).not.toBe("agent-runtime-factory");
    }
  });

  it("forbids dynamic and re-export importer escapes", () => {
    const source = 'export { createWakeSupervisorRuntime } from "./wake-supervisor-runtime.js";\nconst load = () => import("./wake-supervisor-runtime.js");';
    expect(source).toMatch(/export\s*\{/);
    expect(source).toMatch(/import\(/);
  });

  it("allows only the dispatcher default and named gateway constructor import chain", () => {
    const source = readFileSync(new URL("../src/wake-supervisor-runtime.ts", import.meta.url), "utf8");
    const agentBarrel = readFileSync(new URL("../../agent/src/index.ts", import.meta.url), "utf8");
    const forbiddenLoaderForms = [
      /\bimport\s*\(/,
      /\brequire\s*\(/,
      /\beval\s*\(/,
      /\bFunction\s*\(/,
      /loader[-_ ]?exemption/i,
      /import\s+\*\s+as\s+.*resident/i,
      /export\s+(?:\*|\{)[^;]*resident/i
    ];
    const forbiddenTransfers = [
      "residentExecutor",
      "residentAdapter",
      "residentCapabilityIssuer",
      "residentCapabilityBinder",
      "residentPermitConsumer",
      "residentExecutionPort"
    ] as const;

    expect(source).toContain(`from "${permittedResidentImports.wakeRuntime.dispatcherDefault}"`);
    expect(source).toContain(`from "${permittedResidentImports.wakeRuntime.gatewayNamedConstructor}"`);
    expect(source).toMatch(/import\s+\w+\s+from\s+"..\/..\/agent\/src\/domain-execution-dispatcher\.js"/);
    expect(source).toMatch(/import\s*\{[^}]*createResidentLoopToolGateway[^}]*\}\s*from\s+"..\/..\/agent\/src\/resident-loop-tool-gateway\.js"/s);
    for (const pattern of forbiddenLoaderForms) expect(source).not.toMatch(pattern);
    for (const transfer of forbiddenTransfers) expect(source).not.toContain(transfer);
    expect(agentBarrel).not.toMatch(/ResidentDomainExecution|ResidentLoopToolGateway|PackageOwnedResident|BoundedAgentLoop/);
  });
});
