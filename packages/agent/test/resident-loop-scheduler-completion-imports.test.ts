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

    expect(task12ResidentDefinitionAnalysis(definitionClassifierControlSources()))
      .toEqual({
        definitionSources: [
          "class-accessor.ts",
          "class-field.ts",
          "class-method.ts",
          "function-declaration.ts",
          "later-assignment.ts",
          "literal-method.ts",
          "object-accessor.ts",
          "object-method.ts",
          "object-property.ts",
          "resolved-computed.ts",
          "value-declaration.ts"
        ],
        unresolvedDefinitionSources: []
      });
    expect(task12ResidentDefinitionAnalysis([
      sourceRecordFromText("unresolved-computed.ts", [
        "declare const operationName: string;",
        "const gateway = { [operationName]() {} };",
        "void gateway;"
      ].join("\n"))
    ])).toEqual({
      definitionSources: [],
      unresolvedDefinitionSources: ["unresolved-computed.ts"]
    });
    expect(defaultFrozenObjectAnalysis(sourceRecordFromText(
      "valid-default.ts",
      [
        "function consumeResidentDomainExecutionPermit() {}",
        "const residentDomainExecutionPermitConsumer = Object.freeze({",
        "  consumeResidentDomainExecutionPermit",
        "});",
        "export default residentDomainExecutionPermitConsumer;"
      ].join("\n")
    ).sourceFile)).toEqual({
      operationNames: ["consumeResidentDomainExecutionPermit"],
      violations: []
    });
    expect(defaultFrozenObjectAnalysis(sourceRecordFromText(
      "widened-default.ts",
      [
        "function consumeResidentDomainExecutionPermit() {}",
        "const residentDomainExecutionPermitConsumer = Object.freeze({",
        "  consumeResidentDomainExecutionPermit,",
        "  issueResidentDomainExecutionPermit() {},",
        "});",
        "export default residentDomainExecutionPermitConsumer;"
      ].join("\n")
    ).sourceFile)).toEqual({
      operationNames: [
        "consumeResidentDomainExecutionPermit",
        "issueResidentDomainExecutionPermit"
      ],
      violations: []
    });
    expect(defaultFrozenObjectAnalysis(sourceRecordFromText(
      "resolved-computed-default.ts",
      [
        "const operationName = 'issueResidentDomainExecutionPermit' as const;",
        "const residentDomainExecutionPermitConsumer = Object.freeze({",
        "  [operationName]() {},",
        "});",
        "export default residentDomainExecutionPermitConsumer;"
      ].join("\n")
    ).sourceFile)).toEqual({
      operationNames: ["issueResidentDomainExecutionPermit"],
      violations: [
        "computed-operation-name:issueResidentDomainExecutionPermit"
      ]
    });
    expect(defaultFrozenObjectAnalysis(sourceRecordFromText(
      "symbol-default.ts",
      [
        "function consumeResidentDomainExecutionPermit() {}",
        "const residentDomainExecutionPermitConsumer = Object.freeze({",
        "  consumeResidentDomainExecutionPermit,",
        "  [Symbol.for('resident-permit-issuer')]() {},",
        "});",
        "export default residentDomainExecutionPermitConsumer;"
      ].join("\n")
    ).sourceFile)).toEqual({
      operationNames: ["consumeResidentDomainExecutionPermit"],
      violations: ["symbol-operation-name"]
    });
    expect(defaultFrozenObjectAnalysis(sourceRecordFromText(
      "unresolved-computed-default.ts",
      [
        "declare const operationName: string;",
        "const residentDomainExecutionPermitConsumer = Object.freeze({",
        "  [operationName]() {},",
        "});",
        "export default residentDomainExecutionPermitConsumer;"
      ].join("\n")
    ).sourceFile)).toEqual({
      operationNames: [],
      violations: ["unresolved-operation-name"]
    });
    const exactConsumer = () => undefined;
    expect(isExactFrozenGatewayDefaultPermitConsumer(Object.freeze({
      consumeResidentDomainExecutionPermit: exactConsumer
    }))).toBe(true);
    expect(isExactFrozenGatewayDefaultPermitConsumer(Object.freeze({
      consumeResidentDomainExecutionPermit: exactConsumer,
      issueResidentDomainExecutionPermit: exactConsumer
    }))).toBe(false);
    expect(isExactFrozenGatewayDefaultPermitConsumer(Object.freeze({
      consumeResidentDomainExecutionPermit: exactConsumer,
      [Symbol.for("resident-permit-issuer")]: exactConsumer
    }))).toBe(false);
    expect(isExactFrozenGatewayDefaultPermitConsumer(Object.freeze({
      get consumeResidentDomainExecutionPermit() {
        return exactConsumer;
      }
    }))).toBe(false);
    expect(isExactFrozenGatewayDefaultPermitConsumer(Object.freeze({
      consumeResidentDomainExecutionPermit: "not-callable"
    }))).toBe(false);
    expect(namedRuntimeExports(gatewayRecord.sourceFile)).toEqual([
      "createResidentLoopToolGateway"
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
    expect(defaultFrozenObjectAnalysis(gatewayRecord.sourceFile)).toEqual({
      operationNames: ["consumeResidentDomainExecutionPermit"],
      violations: []
    });
    expect(protectedResidentTransfers(sources)).toEqual([]);
    expect(protectedLoaderTransfers(sources)).toEqual([]);
    expect(task12ResidentDefinitionAnalysis(sources)).toEqual({
      definitionSources: [
        "packages/agent/src/domain-execution-dispatcher.ts",
        "packages/agent/src/resident-loop-tool-gateway.ts"
      ],
      unresolvedDefinitionSources: []
    });
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
    expectExactGatewayDefaultPermitConsumer(gatewayAfterBarrel);
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
    expectExactGatewayDefaultPermitConsumer(gatewayAfterAdapter);
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

interface Task12ResidentDefinitionAnalysis {
  readonly definitionSources: readonly string[];
  readonly unresolvedDefinitionSources: readonly string[];
}

function task12ResidentDefinitionAnalysis(
  sources: readonly SourceRecord[]
): Task12ResidentDefinitionAnalysis {
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
  const definitionSources: string[] = [];
  const unresolvedDefinitionSources: string[] = [];
  for (const { sourcePath, sourceFile } of sources) {
    let found = false;
    let unresolved = false;
    visit(sourceFile);
    if (found) {
      definitionSources.push(sourcePath);
    }
    if (unresolved) {
      unresolvedDefinitionSources.push(sourcePath);
    }

    function visit(node: ts.Node): void {
      const classification = classifyTask12ValueDefinition(
        node,
        sourceFile,
        protectedDefinitions
      );
      if (classification === "protected") {
        found = true;
      } else if (classification === "unresolved") {
        unresolved = true;
      }
      ts.forEachChild(node, visit);
    }
  }
  return {
    definitionSources: definitionSources.sort(),
    unresolvedDefinitionSources: unresolvedDefinitionSources.sort()
  };
}

type Task12DefinitionClassification =
  | "none"
  | "protected"
  | "unresolved";

function classifyTask12ValueDefinition(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  protectedDefinitions: ReadonlySet<string>
): Task12DefinitionClassification {
  if (isTypeOnlyOrAmbientDefinition(node)) {
    return "none";
  }
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isClassExpression(node) ||
    ts.isEnumDeclaration(node)
  ) {
    return node.name !== undefined &&
      ts.isIdentifier(node.name) &&
      protectedDefinitions.has(node.name.text)
      ? "protected"
      : "none";
  }
  if (ts.isVariableDeclaration(node)) {
    return ts.isIdentifier(node.name) &&
      protectedDefinitions.has(node.name.text) &&
      node.initializer !== undefined &&
      !isConsumerAliasExpression(node.initializer)
      ? "protected"
      : "none";
  }
  if (
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isPropertyDeclaration(node) ||
    ts.isPropertyAssignment(node)
  ) {
    return classifyDefinitionPropertyName(
      node.name,
      sourceFile,
      protectedDefinitions
    );
  }
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.EqualsToken
  ) {
    if (ts.isIdentifier(node.left)) {
      return protectedDefinitions.has(node.left.text) &&
        !isConsumerAliasExpression(node.right)
        ? "protected"
        : "none";
    }
    if (ts.isPropertyAccessExpression(node.left)) {
      return protectedDefinitions.has(node.left.name.text)
        ? "protected"
        : "none";
    }
    if (ts.isElementAccessExpression(node.left)) {
      const key = staticExpressionKey(node.left.argumentExpression, sourceFile);
      if (key.kind === "unresolved") {
        return "unresolved";
      }
      return key.kind === "string" && protectedDefinitions.has(key.value)
        ? "protected"
        : "none";
    }
  }
  return "none";
}

function classifyDefinitionPropertyName(
  name: ts.PropertyName | undefined,
  sourceFile: ts.SourceFile,
  protectedDefinitions: ReadonlySet<string>
): Task12DefinitionClassification {
  if (name === undefined) {
    return "none";
  }
  const key = staticPropertyKey(name, sourceFile);
  if (key.kind === "unresolved") {
    return "unresolved";
  }
  return key.kind === "string" && protectedDefinitions.has(key.value)
    ? "protected"
    : "none";
}

function isConsumerAliasExpression(expression: ts.Expression): boolean {
  const value = unwrapStaticExpression(expression);
  return ts.isIdentifier(value) ||
    ts.isPropertyAccessExpression(value) ||
    ts.isElementAccessExpression(value) ||
    ts.isCallExpression(value) &&
    (
      ts.isPropertyAccessExpression(value.expression) ||
      ts.isElementAccessExpression(value.expression)
    );
}

function isTypeOnlyOrAmbientDefinition(node: ts.Node): boolean {
  if (
    (
      ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node)
    ) &&
    node.body === undefined
  ) {
    return true;
  }
  if (
    ts.canHaveModifiers(node) &&
    ts.getModifiers(node)?.some((modifier) =>
      modifier.kind === ts.SyntaxKind.AbstractKeyword
    )
  ) {
    return true;
  }
  for (
    let current: ts.Node | undefined = node;
    current !== undefined && !ts.isSourceFile(current);
    current = current.parent
  ) {
    if (
      ts.isInterfaceDeclaration(current) ||
      ts.isTypeAliasDeclaration(current) ||
      ts.isTypeLiteralNode(current)
    ) {
      return true;
    }
    if (
      ts.canHaveModifiers(current) &&
      ts.getModifiers(current)?.some((modifier) =>
        modifier.kind === ts.SyntaxKind.DeclareKeyword
      )
    ) {
      return true;
    }
  }
  return false;
}

function definitionClassifierControlSources(): readonly SourceRecord[] {
  return [
    sourceRecordFromText("function-declaration.ts",
      "function createPackageOwnedResidentDomainExecutionCapability() {}"),
    sourceRecordFromText("value-declaration.ts",
      "const bindPackageOwnedResidentDomainExecutionPort = () => {};"),
    sourceRecordFromText("class-method.ts", [
      "class Gateway {",
      "  consumeResidentDomainExecutionPermit() {}",
      "}"
    ].join("\n")),
    sourceRecordFromText("class-field.ts", [
      "class Gateway {",
      "  preparePlannedStepBindings = () => {};",
      "}"
    ].join("\n")),
    sourceRecordFromText("class-accessor.ts", [
      "class Gateway {",
      "  get requestFreshAuthorized() { return () => undefined; }",
      "}"
    ].join("\n")),
    sourceRecordFromText("object-method.ts", [
      "const gateway = { readFreshHumanDecision() {} };",
      "void gateway;"
    ].join("\n")),
    sourceRecordFromText("object-property.ts", [
      "const gateway = { executeFreshAuthorized: async function () {} };",
      "void gateway;"
    ].join("\n")),
    sourceRecordFromText("object-accessor.ts", [
      "const gateway = {",
      "  get rereadAndIssueFromLedger() { return () => undefined; }",
      "};",
      "void gateway;"
    ].join("\n")),
    sourceRecordFromText("later-assignment.ts", [
      "const gateway: Record<string, unknown> = {};",
      "gateway.preparePlannedStepBindings = () => {};"
    ].join("\n")),
    sourceRecordFromText("literal-method.ts", [
      "const gateway = {",
      "  'consumeResidentDomainExecutionPermit'() {},",
      "};",
      "void gateway;"
    ].join("\n")),
    sourceRecordFromText("resolved-computed.ts", [
      "const operationName = 'executeFreshAuthorized' as const;",
      "class Gateway {",
      "  [operationName]() {}",
      "}"
    ].join("\n")),
    sourceRecordFromText("imports.ts", [
      "import { executeFreshAuthorized } from './resident-loop-tool-gateway.js';",
      "import type { readFreshHumanDecision } from './gateway-types.js';",
      "void executeFreshAuthorized;"
    ].join("\n")),
    sourceRecordFromText("re-exports.ts", [
      "export { executeFreshAuthorized } from './resident-loop-tool-gateway.js';",
      "export type { readFreshHumanDecision } from './gateway-types.js';"
    ].join("\n")),
    sourceRecordFromText("types.ts", [
      "interface Gateway { executeFreshAuthorized(): Promise<void>; }",
      "type RequestFreshAuthorized = { requestFreshAuthorized: string };",
      "declare function rereadAndIssueFromLedger(): void;",
      "declare class AmbientGateway {",
      "  preparePlannedStepBindings: () => void;",
      "  executeFreshAuthorized(): void;",
      "}",
      "abstract class AbstractGateway {",
      "  abstract readFreshHumanDecision(): void;",
      "}"
    ].join("\n")),
    sourceRecordFromText("task14-consumer.ts", [
      "dispatcherDefault.bindPackageOwnedResidentDomainExecutionPort(binding);",
      "gateway.readFreshHumanDecision(requested);",
      "const readFreshHumanDecision = gateway.readFreshHumanDecision;",
      "const executeFreshAuthorized = gateway.executeFreshAuthorized(requested);",
      "const consumer = gateway.rereadAndIssueFromLedger;"
    ].join("\n"))
  ];
}

function sourceRecordFromText(
  sourcePath: string,
  text: string
): SourceRecord {
  return {
    sourcePath,
    text,
    sourceFile: ts.createSourceFile(
      sourcePath,
      text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    )
  };
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

interface DefaultFrozenObjectAnalysis {
  readonly operationNames: readonly string[];
  readonly violations: readonly string[];
}

function defaultFrozenObjectAnalysis(
  sourceFile: ts.SourceFile
): DefaultFrozenObjectAnalysis {
  const exported = sourceFile.statements.find(
    (statement): statement is ts.ExportAssignment =>
      ts.isExportAssignment(statement) && !statement.isExportEquals
  );
  if (exported === undefined) {
    return {
      operationNames: [],
      violations: ["missing-default-export"]
    };
  }
  const initializer = ts.isIdentifier(exported.expression)
    ? variableInitializer(sourceFile, exported.expression.text)
    : exported.expression;
  if (
    initializer === undefined ||
    !ts.isCallExpression(initializer) ||
    !ts.isPropertyAccessExpression(initializer.expression) ||
    !ts.isIdentifier(initializer.expression.expression) ||
    initializer.expression.expression.text !== "Object" ||
    initializer.expression.name.text !== "freeze" ||
    initializer.arguments.length !== 1 ||
    !ts.isObjectLiteralExpression(initializer.arguments[0]!)
  ) {
    return {
      operationNames: [],
      violations: ["default-is-not-frozen-object"]
    };
  }
  const operationNames: string[] = [];
  const violations: string[] = [];
  for (const property of initializer.arguments[0]!.properties) {
    if (ts.isSpreadAssignment(property)) {
      violations.push("spread-operation");
      continue;
    }
    const key = staticPropertyKey(property.name, sourceFile);
    if (key.kind === "unresolved") {
      violations.push("unresolved-operation-name");
      continue;
    }
    if (key.kind === "symbol") {
      violations.push("symbol-operation-name");
      continue;
    }
    operationNames.push(key.value);
    if (ts.isComputedPropertyName(property.name)) {
      violations.push(`computed-operation-name:${key.value}`);
    }
    if (
      ts.isGetAccessorDeclaration(property) ||
      ts.isSetAccessorDeclaration(property)
    ) {
      violations.push(`accessor-operation:${key.value}`);
    } else if (
      ts.isPropertyAssignment(property) &&
      !isCallableExpression(property.initializer)
    ) {
      violations.push(`non-callable-operation:${key.value}`);
    }
  }
  return {
    operationNames,
    violations
  };
}

type StaticPropertyKey =
  | { readonly kind: "string"; readonly value: string }
  | { readonly kind: "symbol" }
  | { readonly kind: "unresolved" };

function staticPropertyKey(
  name: ts.PropertyName,
  sourceFile: ts.SourceFile
): StaticPropertyKey {
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) {
    return {
      kind: "string",
      value: name.text
    };
  }
  if (
    ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name) ||
    ts.isBigIntLiteral(name) ||
    ts.isNoSubstitutionTemplateLiteral(name)
  ) {
    return {
      kind: "string",
      value: name.text
    };
  }
  return ts.isComputedPropertyName(name)
    ? staticExpressionKey(name.expression, sourceFile)
    : { kind: "unresolved" };
}

function staticExpressionKey(
  expression: ts.Expression,
  sourceFile: ts.SourceFile,
  resolving: ReadonlySet<string> = new Set()
): StaticPropertyKey {
  const value = unwrapStaticExpression(expression);
  if (
    ts.isStringLiteral(value) ||
    ts.isNumericLiteral(value) ||
    ts.isNoSubstitutionTemplateLiteral(value)
  ) {
    return {
      kind: "string",
      value: value.text
    };
  }
  if (
    ts.isCallExpression(value) &&
    (
      ts.isIdentifier(value.expression) &&
      value.expression.text === "Symbol" ||
      ts.isPropertyAccessExpression(value.expression) &&
      ts.isIdentifier(value.expression.expression) &&
      value.expression.expression.text === "Symbol"
    )
  ) {
    return { kind: "symbol" };
  }
  if (
    ts.isPropertyAccessExpression(value) &&
    ts.isIdentifier(value.expression) &&
    value.expression.text === "Symbol"
  ) {
    return { kind: "symbol" };
  }
  if (ts.isIdentifier(value) && !resolving.has(value.text)) {
    const initializer = constVariableInitializer(
      sourceFile,
      value.text
    );
    if (initializer !== undefined) {
      return staticExpressionKey(
        initializer,
        sourceFile,
        new Set([...resolving, value.text])
      );
    }
  }
  if (
    ts.isBinaryExpression(value) &&
    value.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = staticExpressionKey(value.left, sourceFile, resolving);
    const right = staticExpressionKey(value.right, sourceFile, resolving);
    if (left.kind === "string" && right.kind === "string") {
      return {
        kind: "string",
        value: left.value + right.value
      };
    }
  }
  return { kind: "unresolved" };
}

function unwrapStaticExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function constVariableInitializer(
  sourceFile: ts.SourceFile,
  name: string
): ts.Expression | undefined {
  for (const statement of sourceFile.statements) {
    if (
      !ts.isVariableStatement(statement) ||
      (statement.declarationList.flags & ts.NodeFlags.Const) === 0
    ) {
      continue;
    }
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === name) {
        return declaration.initializer;
      }
    }
  }
  return undefined;
}

function isCallableExpression(expression: ts.Expression): boolean {
  const value = unwrapStaticExpression(expression);
  return ts.isArrowFunction(value) ||
    ts.isFunctionExpression(value) ||
    ts.isIdentifier(value);
}

function variableInitializer(
  sourceFile: ts.SourceFile,
  name: string
): ts.Expression | undefined {
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === name) {
        return declaration.initializer;
      }
    }
  }
  return undefined;
}

function namedRuntimeExports(sourceFile: ts.SourceFile): readonly string[] {
  return sourceFile.statements.flatMap((statement) => {
    if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isVariableStatement(statement)) &&
      statement.modifiers?.some((modifier) =>
        modifier.kind === ts.SyntaxKind.ExportKeyword
      ) &&
      !statement.modifiers.some((modifier) =>
        modifier.kind === ts.SyntaxKind.DeclareKeyword
      )
    ) {
      if (ts.isVariableStatement(statement)) {
        return statement.declarationList.declarations.flatMap((declaration) =>
          ts.isIdentifier(declaration.name) ? [declaration.name.text] : []
        );
      }
      return statement.name === undefined ? [] : [statement.name.text];
    }
    if (
      ts.isExportDeclaration(statement) &&
      statement.exportClause !== undefined &&
      ts.isNamedExports(statement.exportClause) &&
      !statement.isTypeOnly
    ) {
      return statement.exportClause.elements
        .filter((element) => !element.isTypeOnly)
        .map((element) => element.name.text);
    }
    return [];
  }).sort();
}

function expectExactGatewayDefaultPermitConsumer(module: object): void {
  const value = Reflect.get(module, "default");
  expect(isExactFrozenGatewayDefaultPermitConsumer(value)).toBe(true);
}

function isExactFrozenGatewayDefaultPermitConsumer(value: unknown): boolean {
  if (
    typeof value !== "object" ||
    value === null ||
    !Object.isFrozen(value)
  ) {
    return false;
  }
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== 1 ||
    keys[0] !== "consumeResidentDomainExecutionPermit"
  ) {
    return false;
  }
  const descriptor = Reflect.getOwnPropertyDescriptor(
    value,
    "consumeResidentDomainExecutionPermit"
  );
  return descriptor !== undefined &&
    "value" in descriptor &&
    !("get" in descriptor) &&
    !("set" in descriptor) &&
    descriptor.enumerable === true &&
    descriptor.configurable === false &&
    descriptor.writable === false &&
    typeof descriptor.value === "function";
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
