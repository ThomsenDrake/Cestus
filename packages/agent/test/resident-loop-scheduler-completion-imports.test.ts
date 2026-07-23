import { existsSync, readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { describe, expect, it, vi } from "vitest";
import ts from "typescript";

const schedulerPath = fileURLToPath(new URL("../src/scheduler.ts", import.meta.url));
const completionAdapterPath = fileURLToPath(new URL("../src/resident-loop-scheduler-completion.ts", import.meta.url));
const residentLoopGatewayPath = fileURLToPath(new URL("../src/resident-loop-tool-gateway.ts", import.meta.url));
const gatewayPath = fileURLToPath(new URL("../src/tool-gateway.ts", import.meta.url));
const executionLoopPath = fileURLToPath(new URL("../src/execution-loop.ts", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

describe("resident-loop scheduler completion import boundary", () => {
  it("routes scheduler completion through the private adapter instead of generic caller-result completion", () => {
    expect(existsSync(completionAdapterPath)).toBe(true);
    const scheduler = readFileSync(schedulerPath, "utf8");

    expect(scheduler).toContain("resident-loop-scheduler-completion.js");
    expect(scheduler).not.toMatch(/gateway\.completeTool\s*\(/);
    expect(readFileSync(gatewayPath, "utf8")).toContain("const { completeTool: _structuralCompletion, ...publicGateway }");
    expect(readFileSync(executionLoopPath, "utf8")).not.toMatch(/gateway\.completeTool\s*\(/);

    expect(existsSync(residentLoopGatewayPath)).toBe(true);
    const residentLoopGateway = readFileSync(residentLoopGatewayPath, "utf8");
    expect(residentLoopGateway).toContain("createAgentToolGateway");
    expect(residentLoopGateway).toContain("completeToolFromSchedulerEvidence");
    expect(residentLoopGateway).not.toMatch(/\.completeTool\s*\(/);
    expect(residentLoopGateway).not.toContain("completeTool:");
    expect(residentLoopGateway).not.toContain("readonly gateway:");
    expect(residentLoopGateway).not.toContain("input.gateway");
  });

  it("keeps the resident permit consumer default private to the dispatcher", async () => {
    const sources = residentBoundarySources();
    const dispatcherRecord = requiredSource(
      sources,
      "packages/agent/src/domain-execution-dispatcher.ts"
    );
    const gatewayRecord = requiredSource(
      sources,
      "packages/agent/src/resident-loop-tool-gateway.ts"
    );
    const indexRecord = requiredSource(sources, "packages/agent/src/index.ts");
    const expectedAdapterImports = new Map<string, readonly string[]>([
      ["./adapters/provider-byte-transfer.js", [
        "createProviderByteTransferAdapter",
        "createProviderParseExecutionAdapter",
        "providerByteTransferDescriptor",
        "providerParseExecuteDescriptor"
      ]],
      ["./adapters/prr-correspondence.js", [
        "createPrrInitialSendExecutionAdapter",
        "createPrrFollowUpExecutionAdapter",
        "prrInitialSendExecuteDescriptor",
        "prrFollowUpExecuteDescriptor"
      ]],
      ["./adapters/accepted-graph-review.js", [
        "createAcceptedGraphAssertionReviewAdapter",
        "acceptedGraphAssertionReviewDescriptor"
      ]],
      ["./adapters/export-report.js", [
        "createExportGenerationAdapter",
        "createReportGenerationAdapter",
        "exportGenerateDescriptor",
        "reportGenerateDescriptor"
      ]],
      ["./adapters/destructive-repair.js", [
        "createWorkspaceProjectionRebuildAdapter",
        "createBlockedCanonicalRepairAdapter",
        "workspaceProjectionRebuildDescriptor",
        "workspaceCanonicalRepairDescriptor"
      ]],
      ["./adapters/legacy-staging.js", [
        "createLegacyStagingApprovalAdapter",
        "createLegacyStagingExecutionAdapter",
        "legacyStagingApproveDescriptor",
        "legacyStagingExecuteDescriptor"
      ]]
    ]);

    expect(exactNamedValueImports(dispatcherRecord.sourceFile, expectedAdapterImports))
      .toEqual(Object.fromEntries(expectedAdapterImports));
    expect(staticResidentAdapterModuleOrder(
      dispatcherRecord.sourceFile,
      expectedAdapterImports
    )).toEqual([...expectedAdapterImports.keys()]);
    expect(exactGatewayDefaultImports(sources)).toEqual([{
      sourcePath: "packages/agent/src/domain-execution-dispatcher.ts",
      localName: expect.stringMatching(/^[A-Za-z_$][A-Za-z0-9_$]*$/)
    }]);
    expect(defaultExports(gatewayRecord.sourceFile)).toHaveLength(1);
    expect(protectedResidentTransfers(sources)).toEqual([]);
    expect(protectedLoaderTransfers(sources)).toEqual([]);
    expect(task12ResidentDefinitionSources(sources)).toEqual([
      "packages/agent/src/domain-execution-dispatcher.ts",
      "packages/agent/src/resident-loop-tool-gateway.ts"
    ]);
    expect(topLevelAdapterReads(dispatcherRecord.sourceFile, expectedAdapterImports))
      .toEqual([]);
    expect(indexRecord.text).not.toMatch(
      /\b(?:createPackageOwnedResidentDomainExecutionCapability|bindPackageOwnedResidentDomainExecutionPort|consumeResidentDomainExecutionPermit|ResidentDomainExecutionPermit|residentDomainExecutionPermitConsumer)\b/
    );

    vi.resetModules();
    const barrelFirst = await import("../src/index.js");
    const adapterAfterBarrel = await import("../src/adapters/accepted-graph-review.js");
    const dispatcherAfterBarrel = await import("../src/domain-execution-dispatcher.js");
    const gatewayAfterBarrel = await import("../src/resident-loop-tool-gateway.js");
    const barrelFirstFixture = acceptedGraphFactoryFixture("barrel_first");
    const barrelFirstApi = residentDomainExecutionApi(dispatcherAfterBarrel);
    const barrelFirstCapability = await barrelFirstApi.create(
      barrelFirstFixture.binding
    );
    const barrelFirstPort = barrelFirstApi.bind({
      capability: barrelFirstCapability,
      mountedLedger: barrelFirstFixture.ledger,
      workspaceId: barrelFirstFixture.workspaceId,
      residentAgentId: barrelFirstFixture.residentAgentId,
      taskId: barrelFirstFixture.taskId
    });
    const barrelFirstCapabilityHash = await preparedCapabilityHash(
      gatewayAfterBarrel,
      barrelFirstPort,
      barrelFirstFixture,
      "barrel_first"
    );

    vi.resetModules();
    const adapterFirst = await import("../src/adapters/accepted-graph-review.js");
    const barrelAfterAdapter = await import("../src/index.js");
    const dispatcherAfterAdapter = await import("../src/domain-execution-dispatcher.js");
    const gatewayAfterAdapter = await import("../src/resident-loop-tool-gateway.js");
    const adapterFirstFixture = acceptedGraphFactoryFixture("adapter_first");
    const adapterFirstApi = residentDomainExecutionApi(dispatcherAfterAdapter);
    const adapterFirstCapability = await adapterFirstApi.create(
      adapterFirstFixture.binding
    );
    const adapterFirstPort = adapterFirstApi.bind({
      capability: adapterFirstCapability,
      mountedLedger: adapterFirstFixture.ledger,
      workspaceId: adapterFirstFixture.workspaceId,
      residentAgentId: adapterFirstFixture.residentAgentId,
      taskId: adapterFirstFixture.taskId
    });
    const adapterFirstCapabilityHash = await preparedCapabilityHash(
      gatewayAfterAdapter,
      adapterFirstPort,
      adapterFirstFixture,
      "adapter_first"
    );

    expect(adapterAfterBarrel.acceptedGraphAssertionReviewDescriptor)
      .toEqual(adapterFirst.acceptedGraphAssertionReviewDescriptor);
    expect(barrelFirst.acceptedGraphAssertionReviewDescriptor)
      .toEqual(barrelAfterAdapter.acceptedGraphAssertionReviewDescriptor);
    expect([
      barrelFirstCapability,
      barrelFirstPort,
      adapterFirstCapability,
      adapterFirstPort
    ].every(isFrozenOpaqueObject)).toBe(true);
    expect(barrelFirstCapabilityHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(adapterFirstCapabilityHash).toBe(barrelFirstCapabilityHash);
    expect(() => adapterFirstApi.bind({
      capability: barrelFirstCapability,
      mountedLedger: barrelFirstFixture.ledger,
      workspaceId: barrelFirstFixture.workspaceId,
      residentAgentId: barrelFirstFixture.residentAgentId,
      taskId: barrelFirstFixture.taskId
    })).toThrow(/capability|resident|package|authority/i);
  });
});

interface SourceRecord {
  readonly sourcePath: string;
  readonly text: string;
  readonly sourceFile: ts.SourceFile;
}

interface UnknownResidentDomainExecutionApi {
  readonly create: (input: unknown) => Promise<unknown>;
  readonly bind: (input: unknown) => unknown;
}

function residentBoundarySources(): readonly SourceRecord[] {
  return [
    ...sourceFilesUnder(resolve(repositoryRoot, "packages/agent/src")),
    ...sourceFilesUnder(resolve(repositoryRoot, "packages/local-runtime/src"))
  ].map((absolutePath) => {
    const sourcePath = relative(repositoryRoot, absolutePath).replaceAll("\\", "/");
    const text = readFileSync(absolutePath, "utf8");
    return {
      sourcePath,
      text,
      sourceFile: ts.createSourceFile(
        sourcePath,
        text,
        ts.ScriptTarget.Latest,
        true,
        scriptKindFor(absolutePath)
      )
    };
  });
}

function sourceFilesUnder(root: string): readonly string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = resolve(root, entry.name);
    if (entry.isDirectory()) {
      return sourceFilesUnder(absolutePath);
    }
    return entry.isFile() && /\.(?:[cm]?ts|tsx)$/.test(entry.name) &&
      !entry.name.endsWith(".d.ts")
      ? [absolutePath]
      : [];
  }).sort();
}

function scriptKindFor(path: string): ts.ScriptKind {
  return path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

function requiredSource(
  sources: readonly SourceRecord[],
  sourcePath: string
): SourceRecord {
  const source = sources.find((candidate) => candidate.sourcePath === sourcePath);
  if (source === undefined) {
    throw new Error(`Required resident-boundary source is absent: ${sourcePath}`);
  }
  return source;
}

function exactNamedValueImports(
  sourceFile: ts.SourceFile,
  expected: ReadonlyMap<string, readonly string[]>
): Readonly<Record<string, readonly string[]>> {
  const found = new Map<string, readonly string[]>();
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !expected.has(statement.moduleSpecifier.text)
    ) {
      continue;
    }
    const clause = statement.importClause;
    expect(clause?.isTypeOnly).toBe(false);
    expect(clause?.name).toBeUndefined();
    expect(clause?.namedBindings !== undefined &&
      ts.isNamedImports(clause.namedBindings)).toBe(true);
    if (clause?.namedBindings === undefined ||
      !ts.isNamedImports(clause.namedBindings)) {
      continue;
    }
    expect(found.has(statement.moduleSpecifier.text)).toBe(false);
    found.set(
      statement.moduleSpecifier.text,
      clause.namedBindings.elements.map((element) =>
        element.propertyName?.text ?? element.name.text
      )
    );
  }
  return Object.fromEntries(found);
}

function staticResidentAdapterModuleOrder(
  sourceFile: ts.SourceFile,
  expected: ReadonlyMap<string, readonly string[]>
): readonly string[] {
  return sourceFile.statements.flatMap((statement) =>
    ts.isImportDeclaration(statement) &&
    ts.isStringLiteral(statement.moduleSpecifier) &&
    expected.has(statement.moduleSpecifier.text)
      ? [statement.moduleSpecifier.text]
      : []
  );
}

function task12ResidentDefinitionSources(
  sources: readonly SourceRecord[]
): readonly string[] {
  const protectedDefinitions = new Set([
    "createPackageOwnedResidentDomainExecutionCapability",
    "bindPackageOwnedResidentDomainExecutionPort",
    "consumeResidentDomainExecutionPermit",
    "preparePlannedStepBindings",
    "requestFreshAuthorized",
    "readFreshHumanDecision",
    "executeFreshAuthorized",
    "rereadAndIssueFromLedger"
  ]);
  return sources.flatMap(({ sourcePath, sourceFile }) => {
    let found = false;
    visit(sourceFile);
    return found ? [sourcePath] : [];

    function visit(node: ts.Node): void {
      if (
        ts.isIdentifier(node) &&
        protectedDefinitions.has(node.text) &&
        !isImportBinding(node) &&
        !hasTypeNodeAncestor(node, sourceFile)
      ) {
        found = true;
      }
      ts.forEachChild(node, visit);
    }
  }).sort();
}

function exactGatewayDefaultImports(
  sources: readonly SourceRecord[]
): readonly Readonly<Record<string, unknown>>[] {
  return sources.flatMap(({ sourcePath, sourceFile }) =>
    sourceFile.statements.flatMap((statement) => {
      if (
        !ts.isImportDeclaration(statement) ||
        !ts.isStringLiteral(statement.moduleSpecifier) ||
        !statement.moduleSpecifier.text.endsWith("/resident-loop-tool-gateway.js") &&
        statement.moduleSpecifier.text !== "./resident-loop-tool-gateway.js"
      ) {
        return [];
      }
      const clause = statement.importClause;
      if (clause?.name === undefined) {
        return [];
      }
      return [{
        sourcePath,
        localName: clause.name.text
      }];
    })
  );
}

function defaultExports(sourceFile: ts.SourceFile): readonly string[] {
  return sourceFile.statements.flatMap((statement) => {
    if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
      return [statement.getText(sourceFile)];
    }
    if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement)) &&
      statement.modifiers?.some((modifier) =>
        modifier.kind === ts.SyntaxKind.DefaultKeyword
      )
    ) {
      return [statement.getText(sourceFile)];
    }
    return [];
  });
}

function protectedResidentTransfers(
  sources: readonly SourceRecord[]
): readonly string[] {
  const violations: string[] = [];
  const protectedNames = new Set([
    "createPackageOwnedResidentDomainExecutionCapability",
    "bindPackageOwnedResidentDomainExecutionPort",
    "consumeResidentDomainExecutionPermit",
    "ResidentDomainExecutionPermit",
    "residentDomainExecutionPermitConsumer",
    "ResidentDomainExecutionPort",
    "OpaqueResidentDomainExecutionCapability",
    "OpaqueResidentDomainExecutionPort"
  ]);
  for (const { sourcePath, sourceFile } of sources) {
    for (const statement of sourceFile.statements) {
      if (ts.isImportDeclaration(statement) &&
        ts.isStringLiteral(statement.moduleSpecifier)) {
        const specifier = statement.moduleSpecifier.text;
        const clause = statement.importClause;
        const gatewayImport =
          specifier === "./resident-loop-tool-gateway.js" ||
          specifier.endsWith("/resident-loop-tool-gateway.js");
        if (gatewayImport) {
          const exactDispatcherDefault =
            sourcePath === "packages/agent/src/domain-execution-dispatcher.ts" &&
            clause !== undefined &&
            clause?.name !== undefined &&
            clause.namedBindings === undefined &&
            clause.isTypeOnly === false;
          const plannedWakeNamedConstructor =
            sourcePath === "packages/local-runtime/src/wake-supervisor-runtime.ts" &&
            clause !== undefined &&
            clause?.name === undefined &&
            clause.namedBindings !== undefined &&
            ts.isNamedImports(clause.namedBindings) &&
            clause.namedBindings.elements.length === 1 &&
            clause.namedBindings.elements[0]?.name.text ===
              "createResidentLoopToolGateway";
          if (!exactDispatcherDefault && !plannedWakeNamedConstructor) {
            violations.push(`${sourcePath}: alternate gateway import`);
          }
        }
        if (clause?.namedBindings !== undefined &&
          ts.isNamedImports(clause.namedBindings)) {
          for (const element of clause.namedBindings.elements) {
            const importedName = element.propertyName?.text ?? element.name.text;
            if (protectedNames.has(importedName)) {
              violations.push(`${sourcePath}: imported ${importedName}`);
            }
          }
        }
      }
      if (ts.isExportDeclaration(statement)) {
        if (statement.moduleSpecifier !== undefined &&
          ts.isStringLiteral(statement.moduleSpecifier) &&
          (statement.moduleSpecifier.text === "./resident-loop-tool-gateway.js" ||
            statement.moduleSpecifier.text.endsWith(
              "/resident-loop-tool-gateway.js"
            ))) {
          violations.push(`${sourcePath}: gateway re-export`);
        }
        if (statement.exportClause !== undefined &&
          ts.isNamedExports(statement.exportClause)) {
          for (const element of statement.exportClause.elements) {
            const exportedName = element.propertyName?.text ?? element.name.text;
            if (protectedNames.has(exportedName)) {
              violations.push(`${sourcePath}: exported ${exportedName}`);
            }
          }
        }
      }
    }
  }
  return violations;
}

function protectedLoaderTransfers(
  sources: readonly SourceRecord[]
): readonly string[] {
  const violations: string[] = [];
  for (const { sourcePath, sourceFile, text } of sources) {
    if (/loader[-_ ]?(?:exception|exemption)|allowDynamicImport/i.test(text)) {
      violations.push(`${sourcePath}: loader exemption`);
    }
    visit(sourceFile);

    function visit(node: ts.Node): void {
      if (ts.isCallExpression(node)) {
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
          violations.push(`${sourcePath}: dynamic import`);
        } else if (
          ts.isIdentifier(node.expression) &&
          ["require", "eval", "Function"].includes(node.expression.text)
        ) {
          violations.push(`${sourcePath}: ${node.expression.text}`);
        }
      }
      if (
        ts.isNewExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "Function"
      ) {
        violations.push(`${sourcePath}: new Function`);
      }
      ts.forEachChild(node, visit);
    }
  }
  return violations;
}

function topLevelAdapterReads(
  sourceFile: ts.SourceFile,
  expected: ReadonlyMap<string, readonly string[]>
): readonly string[] {
  const importedNames = new Set([...expected.values()].flat());
  const violations: string[] = [];
  visit(sourceFile);
  return violations;

  function visit(node: ts.Node): void {
    if (
      node !== sourceFile &&
      (ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isConstructorDeclaration(node) ||
        ts.isGetAccessorDeclaration(node) ||
        ts.isSetAccessorDeclaration(node))
    ) {
      return;
    }
    if (
      ts.isIdentifier(node) &&
      importedNames.has(node.text) &&
      !isImportBinding(node) &&
      !hasTypeNodeAncestor(node, sourceFile)
    ) {
      violations.push(node.text);
    }
    ts.forEachChild(node, visit);
  }
}

function isImportBinding(node: ts.Identifier): boolean {
  return ts.isImportSpecifier(node.parent) ||
    ts.isImportClause(node.parent) ||
    ts.isNamespaceImport(node.parent);
}

function hasTypeNodeAncestor(node: ts.Node, sourceFile: ts.SourceFile): boolean {
  for (let parent = node.parent; parent !== sourceFile; parent = parent.parent) {
    if (ts.isTypeNode(parent)) {
      return true;
    }
  }
  return false;
}

function residentDomainExecutionApi(
  module: object
): UnknownResidentDomainExecutionApi {
  const candidate = Reflect.get(module, "default");
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    !Object.isFrozen(candidate)
  ) {
    throw new Error("Resident dispatcher default API is absent.");
  }
  const create = Reflect.get(
    candidate,
    "createPackageOwnedResidentDomainExecutionCapability"
  );
  const bind = Reflect.get(
    candidate,
    "bindPackageOwnedResidentDomainExecutionPort"
  );
  if (typeof create !== "function" || typeof bind !== "function") {
    throw new Error("Resident dispatcher issuer or binder is absent.");
  }
  return {
    create(input: unknown) {
      return Promise.resolve(Reflect.apply(create, candidate, [input]));
    },
    bind(input: unknown) {
      return Reflect.apply(bind, candidate, [input]);
    }
  };
}

async function preparedCapabilityHash(
  module: object,
  residentDomainExecutionPort: unknown,
  fixture: ReturnType<typeof acceptedGraphFactoryFixture>,
  suffix: string
): Promise<string> {
  const create = Reflect.get(module, "createResidentLoopToolGateway");
  if (typeof create !== "function") {
    throw new Error("Resident gateway named constructor is absent.");
  }
  let safeIdCalls = 0;
  const gateway = Reflect.apply(create, undefined, [{
    ledger: fixture.ledger,
    now: () => "2026-07-23T12:00:00.000Z",
    residentDomainExecutionPort,
    async reverifyBeforeEffect() {
      return Object.freeze({ kind: "current" });
    },
    async reverifyAfterEffect() {
      return Object.freeze({ kind: "current" });
    },
    createTrustedToolRequestId() {
      safeIdCalls += 1;
      return `toolreq_import_${suffix}_${safeIdCalls}`;
    }
  }]);
  if (typeof gateway !== "object" || gateway === null || !Object.isFrozen(gateway)) {
    throw new Error("Resident gateway package factory did not return a frozen object.");
  }
  const prepare = Reflect.get(gateway, "preparePlannedStepBindings");
  if (typeof prepare !== "function") {
    throw new Error("Resident gateway planned-step binder is absent.");
  }
  const bindings = await Reflect.apply(prepare, gateway, [{
    workspaceId: fixture.workspaceId,
    residentAgentId: fixture.residentAgentId,
    taskId: fixture.taskId,
    attemptId:
      "attempt_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    runId: `run_import_${suffix}`,
    planId: `plan_import_${suffix}`,
    planRevision: 0,
    steps: [{
      ordinal: 1,
      toolId: "ontology.assertion.accept",
      toolVersion: "0.1.0"
    }]
  }]);
  if (!Array.isArray(bindings) || bindings.length !== 1) {
    throw new Error("Resident gateway package factory returned no exact binding.");
  }
  const hash = Reflect.get(bindings[0], "executionCapabilityHash");
  if (typeof hash !== "string") {
    throw new Error("Resident gateway binding omitted its capability hash.");
  }
  expect(safeIdCalls).toBe(1);
  return hash;
}

function acceptedGraphFactoryFixture(suffix: string) {
  const workspaceId = `ws_import_${suffix}`;
  const residentAgentId = `agent_import_${suffix}`;
  const taskId = `task_import_${suffix}`;
  const ledger = new InMemoryEventLedger();
  return {
    workspaceId,
    residentAgentId,
    taskId,
    ledger,
    binding: {
      kind: "accepted-graph-review",
      workspaceId,
      residentAgentId,
      taskId,
      context: {
        ledger,
        assertionService: {
          async accept() {
            throw new Error("Import-order fixture must not execute an effect.");
          }
        },
        reviewer: {
          id: "actor_import_fixture",
          kind: "human",
          label: "Import fixture"
        },
        residentAgentId,
        taskId,
        assertionId: `as_import_${suffix}`,
        proposalEventId: `evt_import_proposal_${suffix}`,
        evidenceId: `ev_import_${suffix}`,
        evidenceEventId: `evt_import_evidence_${suffix}`,
        evidenceContentHash:
          "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        reviewerRationaleDraft: "Import fixture binds one reviewed assertion.",
        ontologyPackVersions: { core: "0.1.0" }
      }
    }
  };
}

function isFrozenOpaqueObject(value: unknown): boolean {
  return typeof value === "object" &&
    value !== null &&
    Object.isFrozen(value);
}
