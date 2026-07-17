import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  inspectTask137AuthorityBoundary,
  task137CorpusVersion,
  task137GrammarVersion,
  type Task137PolicyViolation
} from "./support/task137-authority-boundary-policy.js";

interface FixtureCase {
  readonly label: string;
  readonly files: Record<string, string>;
}

interface RejectedFixtureCase extends FixtureCase {
  readonly category: string;
  readonly path: string;
}

const operationSource = "packages/local-runtime/src/mounted-artifact-authority-operation.ts";
const lifecycleSource = "packages/local-runtime/src/portable-workspace-lifecycle.ts";
const runtimeFactorySource = "packages/local-runtime/src/runtime-factory.ts";
const registrarSource = "packages/local-runtime/src/wake-supervisor-runtime.ts";
const issuerSource = "packages/local-runtime/src/agent-runtime-factory.ts";
const portableStoreSource = "packages/local-runtime/src/portable-mounted-agent-artifact-stores.ts";
const mountedFeasibilitySource = "packages/local-runtime/src/mounted-official-flow-feasibility.ts";
const temporaryFixtureRoots: string[] = [];

const allowedFixtures: readonly FixtureCase[] = [
  {
    label: "operation imports lifecycle authority",
    files: {
      [operationSource]: [
        'import { assertPortableWorkspaceLifecyclePortsForMountedArtifactAuthority, inspectCurrentPortableWorkspaceAdmissionForMountedArtifactAuthority, type PortableWorkspaceLifecyclePorts, type PortableWorkspaceMountedFacts } from "./portable-workspace-lifecycle.js";',
        "void assertPortableWorkspaceLifecyclePortsForMountedArtifactAuthority;",
        "void inspectCurrentPortableWorkspaceAdmissionForMountedArtifactAuthority;",
        "type Allowed = [PortableWorkspaceLifecyclePorts, PortableWorkspaceMountedFacts];",
        "void (0 as unknown as Allowed);"
      ].join("\n")
    }
  },
  {
    label: "operation imports runtime factory authority",
    files: {
      [operationSource]: [
        'import { captureFactoryIssuedMountedRuntime, inspectFactoryIssuedMountedRuntimeCapture, type FactoryIssuedMountedRuntimeCapture, type FactoryIssuedMountedRuntimeSourceHighWater, type FactoryIssuedMountedWorkspaceSnapshot, type LocalRuntimeHandle } from "./runtime-factory.js";',
        "void captureFactoryIssuedMountedRuntime;",
        "void inspectFactoryIssuedMountedRuntimeCapture;",
        "type Allowed = [FactoryIssuedMountedRuntimeCapture, FactoryIssuedMountedRuntimeSourceHighWater, FactoryIssuedMountedWorkspaceSnapshot, LocalRuntimeHandle];",
        "void (0 as unknown as Allowed);"
      ].join("\n")
    }
  },
  {
    label: "wake runtime imports registrar and lifecycle construction authority",
    files: {
      [registrarSource]: [
        'import { registerMountedArtifactAuthorityIssuerForWakeRuntime } from "./mounted-artifact-authority-operation.js";',
        'import { createPortableWorkspaceLifecyclePorts } from "./portable-workspace-lifecycle.js";',
        "void registerMountedArtifactAuthorityIssuerForWakeRuntime;",
        "void createPortableWorkspaceLifecyclePorts;"
      ].join("\n")
    }
  },
  {
    label: "agent runtime factory imports issuer authority",
    files: {
      [issuerSource]:
        'import { issueMountedArtifactAuthorityOperationForFactory } from "./mounted-artifact-authority-operation.js";\nvoid issueMountedArtifactAuthorityOperationForFactory;\n'
    }
  },
  {
    label: "authorized consumers import their private inspection authority",
    files: {
      [portableStoreSource]: [
        'import { inspectMountedArtifactAuthorityOperationForPortableMountedAgentArtifactStores, type MountedArtifactAuthorityOperation, type PortableMountedArtifactAuthorityOperationInspection } from "./mounted-artifact-authority-operation.js";',
        "void inspectMountedArtifactAuthorityOperationForPortableMountedAgentArtifactStores;",
        "type Allowed = [MountedArtifactAuthorityOperation, PortableMountedArtifactAuthorityOperationInspection];",
        "void (0 as unknown as Allowed);"
      ].join("\n"),
      [mountedFeasibilitySource]: [
        'import { inspectMountedArtifactAuthorityOperationForMountedOfficialFlowFeasibility, type MountedArtifactAuthorityOperation } from "./mounted-artifact-authority-operation.js";',
        "void inspectMountedArtifactAuthorityOperationForMountedOfficialFlowFeasibility;",
        "type Allowed = MountedArtifactAuthorityOperation;",
        "void (0 as unknown as Allowed);"
      ].join("\n")
    }
  },
  {
    label: "unrelated static import",
    files: {
      "packages/agent/src/unrelated-static-import.ts":
        'import { ordinary } from "./ordinary.js";\nvoid ordinary;\n'
    }
  },
  {
    label: "protected names in comments and strings",
    files: {
      "packages/agent/src/comment-only.ts":
        'const note = "mounted-artifact-authority-operation.js is only text";\n// portable-workspace-lifecycle.js is only a comment\nvoid note;\n'
    }
  },
  {
    label: "exact dynamic import exemptions",
    files: {
      "packages/ingestion/src/cli-runner.ts":
        'export async function loadIngestionIndex() { return import("./index.js"); }\n',
      "packages/workspace-ops/src/node-runner.ts":
        'export async function loadNodeSqlite() { return import("node:sqlite"); }\n'
    }
  }
];

const rejectedFixtures: readonly RejectedFixtureCase[] = [
  {
    label: "unauthorized owner imports the feasibility inspection symbol",
    category: "unauthorized-owner",
    path: "packages/agent/src/authority-consumer.ts",
    files: {
      "packages/agent/src/authority-consumer.ts":
        'import { inspectMountedArtifactAuthorityOperationForMountedOfficialFlowFeasibility } from "../../local-runtime/src/mounted-artifact-authority-operation.js";\nvoid inspectMountedArtifactAuthorityOperationForMountedOfficialFlowFeasibility;\n'
    }
  },
  {
    label: "wrong role symbol",
    category: "wrong-role-symbol",
    path: registrarSource,
    files: {
      [registrarSource]:
        'import { issueMountedArtifactAuthorityOperationForFactory } from "./mounted-artifact-authority-operation.js";\nvoid issueMountedArtifactAuthorityOperationForFactory;\n'
    }
  },
  {
    label: "wrong protected module",
    category: "wrong-protected-module",
    path: registrarSource,
    files: {
      [registrarSource]:
        'import { captureFactoryIssuedMountedRuntime } from "./runtime-factory.js";\nvoid captureFactoryIssuedMountedRuntime;\n'
    }
  },
  {
    label: "alias",
    category: "alias",
    path: registrarSource,
    files: {
      [registrarSource]:
        'import { registerMountedArtifactAuthorityIssuerForWakeRuntime as register } from "./mounted-artifact-authority-operation.js";\nvoid register;\n'
    }
  },
  {
    label: "default import",
    category: "default-import",
    path: registrarSource,
    files: {
      [registrarSource]:
        'import authority from "./mounted-artifact-authority-operation.js";\nvoid authority;\n'
    }
  },
  {
    label: "namespace import",
    category: "namespace-import",
    path: registrarSource,
    files: {
      [registrarSource]:
        'import * as authority from "./mounted-artifact-authority-operation.js";\nvoid authority;\n'
    }
  },
  {
    label: "named re-export",
    category: "named-re-export",
    path: issuerSource,
    files: {
      [issuerSource]:
        'export { issueMountedArtifactAuthorityOperationForFactory } from "./mounted-artifact-authority-operation.js";\n'
    }
  },
  {
    label: "star re-export",
    category: "star-re-export",
    path: portableStoreSource,
    files: {
      [portableStoreSource]: 'export * from "./mounted-artifact-authority-operation.js";\n'
    }
  },
  {
    label: "import query",
    category: "import-query",
    path: "packages/agent/src/authority-import-query.ts",
    files: {
      "packages/agent/src/authority-import-query.ts":
        'type Operation = import("../../local-runtime/src/mounted-artifact-authority-operation.js").MountedArtifactAuthorityOperation;\nvoid (0 as unknown as Operation);\n'
    }
  },
  {
    label: "unauthorized type import",
    category: "unauthorized-type-import",
    path: registrarSource,
    files: {
      [registrarSource]:
        'import type { registerMountedArtifactAuthorityIssuerForWakeRuntime } from "./mounted-artifact-authority-operation.js";\ntype Registrar = typeof registerMountedArtifactAuthorityIssuerForWakeRuntime;\nvoid (0 as unknown as Registrar);\n'
    }
  },
  {
    label: "protected literal dynamic import",
    category: "protected-literal-dynamic-import",
    path: "packages/agent/src/authority-dynamic.ts",
    files: {
      "packages/agent/src/authority-dynamic.ts":
        'export async function load() { return import("../../local-runtime/src/mounted-artifact-authority-operation.js"); }\n'
    }
  },
  {
    label: "computed dynamic import",
    category: "computed-dynamic-import",
    path: "packages/agent/src/authority-computed-dynamic.ts",
    files: {
      "packages/agent/src/authority-computed-dynamic.ts":
        'const target = "../../local-runtime/src/mounted-artifact-authority-operation.js";\nexport async function load() { return import(target); }\n'
    }
  },
  {
    label: "extra dynamic import occurrence",
    category: "extra-dynamic-import-occurrence",
    path: "packages/ingestion/src/cli-runner.ts",
    files: {
      "packages/ingestion/src/cli-runner.ts":
        'export async function loadTwice() { await import("./index.js"); return import("./index.js"); }\n'
    }
  },
  {
    label: "direct require",
    category: "direct-require",
    path: "packages/agent/src/direct-require.ts",
    files: {
      "packages/agent/src/direct-require.ts": 'const fs = require("node:fs");\nvoid fs;\n'
    }
  },
  {
    label: "module.require",
    category: "module-require",
    path: "packages/agent/src/module-require.ts",
    files: {
      "packages/agent/src/module-require.ts": 'const fs = module.require("node:fs");\nvoid fs;\n'
    }
  },
  {
    label: "import equals require",
    category: "import-equals-require",
    path: "packages/agent/src/import-equals.ts",
    files: {
      "packages/agent/src/import-equals.ts": 'import fs = require("node:fs");\nvoid fs;\n'
    }
  },
  {
    label: "direct createRequire",
    category: "direct-create-require",
    path: "packages/agent/src/direct-create-require.ts",
    files: {
      "packages/agent/src/direct-create-require.ts":
        'import { createRequire } from "node:module";\nvoid createRequire;\n'
    }
  },
  {
    label: "aliased createRequire",
    category: "aliased-create-require",
    path: "packages/agent/src/aliased-create-require.ts",
    files: {
      "packages/agent/src/aliased-create-require.ts":
        'import { createRequire as makeRequire } from "node:module";\nvoid makeRequire;\n'
    }
  },
  {
    label: "direct evaluator call",
    category: "direct-evaluator-call",
    path: "packages/agent/src/direct-eval.ts",
    files: {
      "packages/agent/src/direct-eval.ts": 'eval("1 + 1");\n'
    }
  },
  {
    label: "direct Function constructor invocation",
    category: "direct-function-constructor",
    path: "packages/agent/src/direct-function.ts",
    files: {
      "packages/agent/src/direct-function.ts": 'new Function("return 1");\n'
    }
  }
];

afterEach(() => {
  for (const root of temporaryFixtureRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("Task137 mounted artifact authority import policy", () => {
  it("exports the frozen contract versions", () => {
    expect(task137GrammarVersion).toBe("task137-authority-import-grammar.v2");
    expect(task137CorpusVersion).toBe("task137-authority-import-corpus.v2");
  });

  it("passes the current repository policy within the bounded runtime", () => {
    const started = performance.now();
    expect(inspectTask137AuthorityBoundary(process.cwd())).toEqual([]);
    expect(performance.now() - started).toBeLessThan(10_000);
  });

  it("accepts exactly eight allowed fixtures and rejects exactly twenty frozen mutations", () => {
    for (const fixture of allowedFixtures) {
      const started = performance.now();
      expect(violationsFor(fixture), fixture.label).toEqual([]);
      expect(performance.now() - started, fixture.label).toBeLessThan(2_000);
    }

    for (const fixture of rejectedFixtures) {
      const started = performance.now();
      expect(violationsFor(fixture), fixture.label).toEqual([
        expect.objectContaining({
          category: fixture.category,
          path: fixture.path
        })
      ]);
      expect(performance.now() - started, fixture.label).toBeLessThan(2_000);
    }

    expect(allowedFixtures).toHaveLength(8);
    expect(rejectedFixtures).toHaveLength(20);
    process.stdout.write("TASK137_POLICY_CORPUS_OK allowed=8 rejected=20\n");
  });

  it("returns deterministic path and category ordering", () => {
    const root = createFixtureWorkspace({
      "packages/agent/src/z-require.ts": 'require("node:fs");\n',
      "packages/agent/src/a-eval.ts": 'eval("1");\n',
      [registrarSource]:
        'import { issueMountedArtifactAuthorityOperationForFactory } from "./mounted-artifact-authority-operation.js";\nvoid issueMountedArtifactAuthorityOperationForFactory;\n'
    });

    expect(inspectTask137AuthorityBoundary(root).map((violation) => `${violation.path}:${violation.category}`)).toEqual([
      "packages/agent/src/a-eval.ts:direct-evaluator-call",
      "packages/agent/src/z-require.ts:direct-require",
      "packages/local-runtime/src/wake-supervisor-runtime.ts:wrong-role-symbol"
    ]);
  });
});

function violationsFor(fixture: FixtureCase): readonly Task137PolicyViolation[] {
  return inspectTask137AuthorityBoundary(createFixtureWorkspace(fixture.files));
}

function createFixtureWorkspace(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "cestus-task137-policy-"));
  temporaryFixtureRoots.push(root);
  for (const [path, text] of Object.entries(files)) {
    const absolutePath = join(root, path);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, `${text.endsWith("\n") ? text : `${text}\n`}`, { flag: "w" });
  }
  for (const path of [
    operationSource,
    lifecycleSource,
    runtimeFactorySource,
    registrarSource,
    issuerSource,
    portableStoreSource
  ]) {
    const absolutePath = join(root, path);
    mkdirSync(dirname(absolutePath), { recursive: true });
    try {
      writeFileSync(absolutePath, "export {};\n", { flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
  return root;
}
