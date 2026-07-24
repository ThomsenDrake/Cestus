import { existsSync, readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { describe, expect, it, vi } from "vitest";
import ts from "typescript";

interface TypeScriptSemanticApi {
  readonly AssignmentKind: {
    readonly None: number;
  };
  readonly getAssignmentTargetKind: (node: ts.Node) => number;
  readonly isAssignmentTarget: (node: ts.Node) => boolean;
  readonly isDeclaration: (node: ts.Node) => node is ts.Declaration;
  readonly isDeclarationName: (node: ts.Node) => boolean;
}

const semanticTs = ts as typeof ts & TypeScriptSemanticApi;

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

    const runtimeBaseline = captureGatewayRuntimeBaseline();
    const mentionControls = protectedMentionControls();
    expect(task12ProtectedMentionAnalysis(mentionControls.safeSources))
      .toEqual({
        definitionSources: [
          "packages/agent/src/domain-execution-dispatcher.ts",
          "packages/agent/src/resident-loop-tool-gateway.ts"
        ],
        permitConsumerOccurrences: 3,
        violations: []
      });
    for (const control of mentionControls.unsafe) {
      expect(
        task12ProtectedMentionAnalysis(control.sources).violations,
        control.name
      ).toEqual(control.violations);
    }
    for (const control of gatewayDefaultStaticControls()) {
      expect(
        exactGatewayDefaultStaticAnalysis(control.source.sourceFile).violations,
        control.source.sourcePath
      ).toEqual(control.violations);
    }
    function consumeResidentDomainExecutionPermit(): void {}
    const exactConsumer = consumeResidentDomainExecutionPermit;
    expect(isExactFrozenGatewayDefaultPermitConsumer(
      Object.freeze({ consumeResidentDomainExecutionPermit: exactConsumer }),
      runtimeBaseline,
      0
    )).toBe(true);
    function issueResidentDomainExecutionPermit(): void {}
    expect(isExactFrozenGatewayDefaultPermitConsumer(Object.freeze({
      consumeResidentDomainExecutionPermit:
        issueResidentDomainExecutionPermit
    }), runtimeBaseline, 0)).toBe(false);
    for (const value of gatewayRuntimeNegativeControls(exactConsumer)) {
      expect(isExactFrozenGatewayDefaultPermitConsumer(
        value,
        runtimeBaseline,
        0
      )).toBe(false);
    }
    expectPrototypeMutationRejected(
      Object.prototype,
      "issueResidentDomainExecutionPermit",
      runtimeBaseline,
      exactConsumer
    );
    expectPrototypeMutationRejected(
      Function.prototype,
      "issueResidentDomainExecutionPermit",
      runtimeBaseline,
      exactConsumer
    );
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
    const gatewayStatic = exactGatewayDefaultStaticAnalysis(
      gatewayRecord.sourceFile
    );
    expect(gatewayStatic.violations).toEqual([]);
    expect(protectedResidentTransfers(sources)).toEqual([]);
    expect(protectedLoaderTransfers(sources)).toEqual([]);
    expect(task12ProtectedMentionAnalysis(sources)).toEqual({
      definitionSources: [
        "packages/agent/src/domain-execution-dispatcher.ts",
        "packages/agent/src/resident-loop-tool-gateway.ts"
      ],
      permitConsumerOccurrences: 3,
      violations: []
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
    expectExactGatewayDefaultPermitConsumer(
      gatewayAfterBarrel,
      runtimeBaseline,
      gatewayStatic.callableLength
    );
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
    expectExactGatewayDefaultPermitConsumer(
      gatewayAfterAdapter,
      runtimeBaseline,
      gatewayStatic.callableLength
    );
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

interface Task12ProtectedMentionAnalysis {
  readonly definitionSources: readonly string[];
  readonly permitConsumerOccurrences: number;
  readonly violations: readonly string[];
}

const task12ProtectedOwners = new Map<string, string>([
  [
    "createPackageOwnedResidentDomainExecutionCapability",
    "packages/agent/src/domain-execution-dispatcher.ts"
  ],
  [
    "bindPackageOwnedResidentDomainExecutionPort",
    "packages/agent/src/domain-execution-dispatcher.ts"
  ],
  [
    "consumeResidentDomainExecutionPermit",
    "packages/agent/src/resident-loop-tool-gateway.ts"
  ],
  [
    "preparePlannedStepBindings",
    "packages/agent/src/resident-loop-tool-gateway.ts"
  ],
  [
    "requestFreshAuthorized",
    "packages/agent/src/resident-loop-tool-gateway.ts"
  ],
  [
    "readFreshHumanDecision",
    "packages/agent/src/resident-loop-tool-gateway.ts"
  ],
  [
    "executeFreshAuthorized",
    "packages/agent/src/resident-loop-tool-gateway.ts"
  ],
  [
    "rereadAndIssueFromLedger",
    "packages/agent/src/resident-loop-tool-gateway.ts"
  ]
]);

function task12ProtectedMentionAnalysis(
  sources: readonly SourceRecord[]
): Task12ProtectedMentionAnalysis {
  const protectedNames = new Set(task12ProtectedOwners.keys());
  const violations = new Set<string>();
  const definitionSources = new Set<string>();
  const definitionCounts = new Map(
    [...protectedNames].map((name) => [name, 0])
  );
  let permitConsumerOccurrences = 0;
  let task14BinderOccurrences = 0;

  for (const record of sources) {
    const { sourcePath, sourceFile } = record;
    const protectedHosts = protectedHostNames(sourceFile, protectedNames);
    const ownerHasDefinition = sourceContainsOwnedDefinition(
      record,
      protectedNames
    );
    visit(sourceFile);

    function visit(node: ts.Node): void {
      if (isDirectProtectedMention(node, protectedNames)) {
        classify(node, protectedMentionText(node));
      }
      if (
        ts.isComputedPropertyName(node) ||
        ts.isElementAccessExpression(node)
      ) {
        const expression = ts.isComputedPropertyName(node)
          ? node.expression
          : node.argumentExpression;
        const key = staticExpressionKey(expression, sourceFile);
        if (
          key.kind === "string" &&
          protectedNames.has(key.value) &&
          !containsDirectProtectedMention(expression, key.value)
        ) {
          classify(expression, key.value);
        }
        if (
          key.kind === "unresolved" &&
          isUnresolvedWriteCarrier(node) &&
          (ownerHasDefinition ||
            expressionResolvesProtectedHost(
              ts.isElementAccessExpression(node)
                ? node.expression
                : undefined,
              protectedHosts
            )) &&
          !isFreshNullPrototypeRecordWrite(node, sourceFile)
        ) {
          violations.add(sourcePath);
        }
      }
      if (ts.isCallExpression(node)) {
        inspectMutationCall(
          node,
          record,
          protectedNames,
          protectedHosts,
          ownerHasDefinition,
          violations
        );
      }
      ts.forEachChild(node, visit);
    }

    function classify(node: ts.Node, name: string): void {
      if (name === "consumeResidentDomainExecutionPermit") {
        permitConsumerOccurrences += 1;
        if (
          isExactPermitDeclaration(node, sourcePath) ||
          isExactPermitDefaultShorthand(node, sourcePath) ||
          isExactDispatcherPermitCall(node, record)
        ) {
          if (isExactPermitDeclaration(node, sourcePath)) {
            admitDefinition(name, sourcePath);
          }
          return;
        }
        violations.add(sourcePath);
        return;
      }
      if (isAllowedModuleSyntaxMention(node)) {
        return;
      }
      if (isAllowedTypeMention(node)) {
        return;
      }
      if (isResolvedKeyWriteCarrier(node)) {
        violations.add(sourcePath);
        return;
      }
      if (
        name === "bindPackageOwnedResidentDomainExecutionPort" &&
        isPropertyOrElementMention(node)
      ) {
        if (isExactTask14BinderCall(node, record)) {
          task14BinderOccurrences += 1;
          return;
        }
        if (!isDefinitionObjectShorthand(node, sourcePath, name)) {
          violations.add(sourcePath);
          return;
        }
      }
      if (isEmittedDefinitionName(node)) {
        if (task12ProtectedOwners.get(name) === sourcePath) {
          admitDefinition(name, sourcePath);
        } else {
          violations.add(sourcePath);
        }
        return;
      }
      if (
        isDefinitionObjectShorthand(node, sourcePath, name) ||
        isSafeConsumerDestructuringMention(node) ||
        isAllowedStaticKeyAliasLiteral(node, record, protectedNames) ||
        isAllowedReadMention(node)
      ) {
        return;
      }
      violations.add(sourcePath);
    }

    function admitDefinition(name: string, sourcePath: string): void {
      definitionSources.add(sourcePath);
      definitionCounts.set(name, (definitionCounts.get(name) ?? 0) + 1);
    }
  }

  for (const [name, owner] of task12ProtectedOwners) {
    if (definitionCounts.get(name) !== 1) {
      violations.add(owner);
    }
  }
  if (permitConsumerOccurrences !== 3) {
    violations.add("packages/agent/src/resident-loop-tool-gateway.ts");
  }
  if (task14BinderOccurrences !== 1) {
    violations.add("packages/local-runtime/src/wake-supervisor-runtime.ts");
  }
  return {
    definitionSources: [...definitionSources].sort(),
    permitConsumerOccurrences,
    violations: [...violations].sort()
  };
}

function isDirectProtectedMention(
  node: ts.Node,
  protectedNames: ReadonlySet<string>
): node is ts.Identifier | ts.StringLiteral | ts.NoSubstitutionTemplateLiteral {
  if (
    ts.isIdentifier(node) ||
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node)
  ) {
    return protectedNames.has(node.text);
  }
  return false;
}

function protectedMentionText(
  node: ts.Identifier | ts.StringLiteral | ts.NoSubstitutionTemplateLiteral
): string {
  return node.text;
}

function containsDirectProtectedMention(
  node: ts.Node,
  name: string
): boolean {
  let found = false;
  visit(node);
  return found;

  function visit(current: ts.Node): void {
    if (
      (ts.isIdentifier(current) ||
        ts.isStringLiteral(current) ||
        ts.isNoSubstitutionTemplateLiteral(current)) &&
      current.text === name
    ) {
      found = true;
      return;
    }
    ts.forEachChild(current, visit);
  }
}

function isAllowedModuleSyntaxMention(node: ts.Node): boolean {
  for (
    let current: ts.Node | undefined = node;
    current !== undefined;
    current = current.parent
  ) {
    if (ts.isImportSpecifier(current) || ts.isExportSpecifier(current)) {
      return true;
    }
    if (ts.isImportClause(current)) {
      return current.name === node;
    }
    if (
      ts.isNamespaceImport(current) ||
      ts.isImportEqualsDeclaration(current) ||
      ts.isModuleDeclaration(current)
    ) {
      return false;
    }
    if (ts.isStatement(current) || ts.isSourceFile(current)) {
      return false;
    }
  }
  return false;
}

function isAllowedTypeMention(node: ts.Node): boolean {
  for (
    let current: ts.Node | undefined = node;
    current !== undefined;
    current = current.parent
  ) {
    if (
      ts.isInterfaceDeclaration(current) ||
      ts.isTypeAliasDeclaration(current) ||
      ts.isTypeLiteralNode(current) ||
      ts.isTypeNode(current)
    ) {
      return true;
    }
    if (
      ts.isExpressionWithTypeArguments(current) &&
      ts.isHeritageClause(current.parent) &&
      (
        current.parent.token === ts.SyntaxKind.ImplementsKeyword ||
        ts.isInterfaceDeclaration(current.parent.parent)
      )
    ) {
      return true;
    }
    if (
      current !== node &&
      (ts.isExpression(current) || ts.isStatement(current))
    ) {
      return false;
    }
  }
  return false;
}

function isEmittedDefinitionName(node: ts.Node): boolean {
  if (
    !ts.isIdentifier(node) &&
    !ts.isStringLiteral(node) &&
    !ts.isNoSubstitutionTemplateLiteral(node)
  ) {
    return false;
  }
  if (!semanticTs.isDeclarationName(node) || isAllowedModuleSyntaxMention(node)) {
    return false;
  }
  const declaration = node.parent;
  if (
    ts.isShorthandPropertyAssignment(declaration) ||
    ts.isBindingElement(declaration) ||
    ts.isParameter(declaration) ||
    ts.isModuleDeclaration(declaration) ||
    ts.isImportEqualsDeclaration(declaration)
  ) {
    return false;
  }
  if (
    (
      ts.isFunctionDeclaration(declaration) ||
      ts.isMethodDeclaration(declaration) ||
      ts.isGetAccessorDeclaration(declaration) ||
      ts.isSetAccessorDeclaration(declaration)
    ) &&
    declaration.body === undefined
  ) {
    return false;
  }
  for (
    let current: ts.Node | undefined = declaration;
    current !== undefined && !ts.isSourceFile(current);
    current = current.parent
  ) {
    if (
      ts.canHaveModifiers(current) &&
      ts.getModifiers(current)?.some((modifier) =>
        modifier.kind === ts.SyntaxKind.DeclareKeyword ||
        modifier.kind === ts.SyntaxKind.AbstractKeyword
      )
    ) {
      return false;
    }
  }
  return true;
}

function isDefinitionObjectShorthand(
  node: ts.Node,
  sourcePath: string,
  name: string
): boolean {
  return ts.isIdentifier(node) &&
    ts.isShorthandPropertyAssignment(node.parent) &&
    node.parent.objectAssignmentInitializer === undefined &&
    !isWriteSemanticCarrier(node.parent.parent) &&
    task12ProtectedOwners.get(name) === sourcePath;
}

function isSafeConsumerDestructuringMention(node: ts.Node): boolean {
  let bindingElement: ts.BindingElement | undefined;
  for (
    let current: ts.Node | undefined = node;
    current !== undefined && !ts.isStatement(current);
    current = current.parent
  ) {
    if (ts.isBindingElement(current)) {
      bindingElement = current;
      break;
    }
  }
  if (bindingElement === undefined) {
    return false;
  }
  let root: ts.Node = bindingElement;
  while (
    root.parent !== undefined &&
    (
      ts.isBindingElement(root.parent) ||
      ts.isObjectBindingPattern(root.parent) ||
      ts.isArrayBindingPattern(root.parent)
    )
  ) {
    root = root.parent;
  }
  if (!ts.isVariableDeclaration(root.parent) || root.parent.initializer === undefined) {
    return false;
  }
  let hasDefault = false;
  visit(root);
  return !hasDefault;

  function visit(current: ts.Node): void {
    if (ts.isBindingElement(current) && current.initializer !== undefined) {
      hasDefault = true;
    }
    ts.forEachChild(current, visit);
  }
}

function isAllowedReadMention(node: ts.Node): boolean {
  if (isWriteSemanticCarrier(node)) {
    return false;
  }
  if (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node)
  ) {
    return isPropertyOrElementMention(node);
  }
  return !semanticTs.isDeclarationName(node);
}

function isPropertyOrElementMention(node: ts.Node): boolean {
  for (
    let current: ts.Node | undefined = node;
    current !== undefined && !ts.isStatement(current);
    current = current.parent
  ) {
    if (
      ts.isPropertyAccessExpression(current) ||
      ts.isElementAccessExpression(current)
    ) {
      return true;
    }
    if (
      semanticTs.isDeclaration(current) &&
      !ts.isComputedPropertyName(current)
    ) {
      return false;
    }
  }
  return false;
}

function isWriteSemanticCarrier(node: ts.Node): boolean {
  for (
    let current: ts.Node | undefined = node;
    current !== undefined && !ts.isStatement(current);
    current = current.parent
  ) {
    if (
      semanticTs.isAssignmentTarget(current) &&
      semanticTs.getAssignmentTargetKind(current) !==
        semanticTs.AssignmentKind.None
    ) {
      return true;
    }
  }
  return false;
}

function isUnresolvedWriteCarrier(
  node: ts.ComputedPropertyName | ts.ElementAccessExpression
): boolean {
  if (isWriteSemanticCarrier(node)) {
    return true;
  }
  if (!ts.isComputedPropertyName(node)) {
    return false;
  }
  const declaration = node.parent;
  if (ts.isBindingElement(declaration)) {
    return declaration.initializer !== undefined;
  }
  return (
    (
      ts.isMethodDeclaration(declaration) ||
      ts.isGetAccessorDeclaration(declaration) ||
      ts.isSetAccessorDeclaration(declaration)
    ) &&
    declaration.body !== undefined
  ) ||
    ts.isPropertyDeclaration(declaration) ||
    ts.isPropertyAssignment(declaration);
}

function isResolvedKeyWriteCarrier(node: ts.Node): boolean {
  const parent = node.parent;
  return (
    ts.isComputedPropertyName(parent) ||
    ts.isElementAccessExpression(parent)
  ) &&
    (
      ts.isComputedPropertyName(parent)
        ? parent.expression === node
        : parent.argumentExpression === node
    ) &&
    isUnresolvedWriteCarrier(parent);
}

function isExactPermitDeclaration(node: ts.Node, sourcePath: string): boolean {
  return sourcePath === "packages/agent/src/resident-loop-tool-gateway.ts" &&
    ts.isIdentifier(node) &&
    ts.isFunctionDeclaration(node.parent) &&
    node.parent.name === node &&
    node.parent.body !== undefined &&
    !node.parent.modifiers?.some((modifier) =>
      modifier.kind === ts.SyntaxKind.DeclareKeyword ||
      modifier.kind === ts.SyntaxKind.ExportKeyword ||
      modifier.kind === ts.SyntaxKind.DefaultKeyword
    );
}

function isExactPermitDefaultShorthand(
  node: ts.Node,
  sourcePath: string
): boolean {
  return sourcePath === "packages/agent/src/resident-loop-tool-gateway.ts" &&
    ts.isIdentifier(node) &&
    ts.isShorthandPropertyAssignment(node.parent) &&
    node.parent.name === node &&
    node.parent.objectAssignmentInitializer === undefined;
}

function isExactDispatcherPermitCall(
  node: ts.Node,
  record: SourceRecord
): boolean {
  if (
    record.sourcePath !==
      "packages/agent/src/domain-execution-dispatcher.ts" ||
    !ts.isIdentifier(node) ||
    !ts.isPropertyAccessExpression(node.parent) ||
    node.parent.name !== node ||
    !ts.isCallExpression(node.parent.parent) ||
    node.parent.parent.expression !== node.parent ||
    !ts.isIdentifier(node.parent.expression)
  ) {
    return false;
  }
  return uniqueDefaultImportLocal(
    record.sourceFile,
    "./resident-loop-tool-gateway.js"
  ) === node.parent.expression.text;
}

function isExactTask14BinderCall(
  node: ts.Node,
  record: SourceRecord
): boolean {
  if (
    record.sourcePath !==
      "packages/local-runtime/src/wake-supervisor-runtime.ts" ||
    !ts.isIdentifier(node) ||
    !ts.isPropertyAccessExpression(node.parent) ||
    node.parent.name !== node ||
    !ts.isCallExpression(node.parent.parent) ||
    node.parent.parent.expression !== node.parent ||
    !ts.isIdentifier(node.parent.expression)
  ) {
    return false;
  }
  return uniqueDefaultImportLocal(
    record.sourceFile,
    "../../agent/src/domain-execution-dispatcher.js"
  ) === node.parent.expression.text;
}

function uniqueDefaultImportLocal(
  sourceFile: ts.SourceFile,
  moduleSpecifier: string
): string | undefined {
  const names = sourceFile.statements.flatMap((statement) =>
    ts.isImportDeclaration(statement) &&
    ts.isStringLiteral(statement.moduleSpecifier) &&
    statement.moduleSpecifier.text === moduleSpecifier &&
    statement.importClause?.name !== undefined
      ? [statement.importClause.name.text]
      : []
  );
  return names.length === 1 ? names[0] : undefined;
}

interface ProtectedMentionControls {
  readonly safeSources: readonly SourceRecord[];
  readonly unsafe: readonly {
    readonly name: string;
    readonly sources: readonly SourceRecord[];
    readonly violations: readonly string[];
  }[];
}

function protectedMentionControls(): ProtectedMentionControls {
  const dispatcherPath =
    "packages/agent/src/domain-execution-dispatcher.ts";
  const gatewayPath =
    "packages/agent/src/resident-loop-tool-gateway.ts";
  const task14Path =
    "packages/local-runtime/src/wake-supervisor-runtime.ts";
  const base = (gatewayExtra = "", dispatcherExtra = ""): readonly SourceRecord[] => [
    sourceRecordFromText(dispatcherPath, [
      "import gatewayDefault from './resident-loop-tool-gateway.js';",
      "function createPackageOwnedResidentDomainExecutionCapability() {}",
      "function bindPackageOwnedResidentDomainExecutionPort() {}",
      "function dispatch(permit: unknown, port: unknown, input: unknown) {",
      "  return gatewayDefault.consumeResidentDomainExecutionPermit(",
      "    permit, port, input",
      "  );",
      "}",
      "const residentDomainExecutionApi = Object.freeze({",
      "  createPackageOwnedResidentDomainExecutionCapability,",
      "  bindPackageOwnedResidentDomainExecutionPort",
      "});",
      dispatcherExtra
    ].join("\n")),
    sourceRecordFromText(gatewayPath, [
      "function consumeResidentDomainExecutionPermit(",
      "  _permit: unknown, _port: unknown, _input: unknown",
      ") {}",
      "function preparePlannedStepBindings() {}",
      "function requestFreshAuthorized() {}",
      "function readFreshHumanDecision() {}",
      "function executeFreshAuthorized() {}",
      "function rereadAndIssueFromLedger() {}",
      "const residentDomainExecutionPermitConsumer = Object.freeze({",
      "  consumeResidentDomainExecutionPermit",
      "});",
      "const gateway = Object.freeze({",
      "  preparePlannedStepBindings,",
      "  requestFreshAuthorized,",
      "  readFreshHumanDecision,",
      "  executeFreshAuthorized,",
      "  rereadAndIssueFromLedger",
      "});",
      "export default residentDomainExecutionPermitConsumer;",
      "void gateway;",
      "const record = Object.create(null) as Record<string, unknown>;",
      "declare const recordKey: string;",
      "record[recordKey] = undefined;",
      "const { [recordKey]: dynamicRead } = gateway;",
      "void dynamicRead;",
      gatewayExtra
    ].join("\n")),
    sourceRecordFromText(task14Path, [
      "import dispatcherDefault from " +
        "'../../agent/src/domain-execution-dispatcher.js';",
      "dispatcherDefault.bindPackageOwnedResidentDomainExecutionPort(binding);"
    ].join("\n")),
    ...protectedMentionSafeReadSources()
  ];
  const unsafeSources = (
    name: string,
    sourcePath: string,
    text: string,
    gatewayExtra = "",
    dispatcherExtra = ""
  ) => ({
    name,
    sources: [
      ...base(gatewayExtra, dispatcherExtra),
      sourceRecordFromText(sourcePath, text)
    ],
    violations: [sourcePath]
  });
  const unsafe = [
    unsafeSources("resolved computed definition", "unsafe-resolved.ts",
      "const op = 'executeFreshAuthorized' as const; class X { [op]() {} }"),
    unsafeSources("class field", "unsafe-field.ts",
      "class X { requestFreshAuthorized = () => 0; }"),
    unsafeSources("later assignment", "unsafe-assignment.ts",
      "gateway.executeFreshAuthorized = () => 0;"),
    unsafeSources("literal method", "unsafe-literal.ts",
      "const value = { 'readFreshHumanDecision'() {} };"),
    unsafeSources("accessor", "unsafe-accessor.ts",
      "const value = { get rereadAndIssueFromLedger() { return () => 0; } };"),
    unsafeSources("object binding default", "unsafe-object-binding.ts",
      "const { requestFreshAuthorized = () => 0 } = gateway;"),
    unsafeSources("array binding default", "unsafe-array-binding.ts",
      "const [readFreshHumanDecision = () => 0] = gateway;"),
    unsafeSources("aliased binding default", "unsafe-aliased-binding.ts",
      "const { fresh: executeFreshAuthorized = () => 0 } = gateway;"),
    unsafeSources("nested binding default", "unsafe-nested-binding.ts",
      "const { x: { rereadAndIssueFromLedger = () => 0 } = {} } = gateway;"),
    unsafeSources("parenthesized assignment", "unsafe-parenthesized.ts",
      "(requestFreshAuthorized) = () => 0;"),
    unsafeSources("as assignment", "unsafe-as.ts",
      "(gateway.readFreshHumanDecision as unknown) = () => 0;"),
    unsafeSources("non-null assignment", "unsafe-nonnull.ts",
      "gateway.executeFreshAuthorized! = () => 0;"),
    unsafeSources("nullish assignment", "unsafe-nullish.ts",
      "gateway.rereadAndIssueFromLedger ??= () => 0;"),
    unsafeSources("or assignment", "unsafe-or.ts",
      "gateway.preparePlannedStepBindings ||= () => 0;"),
    unsafeSources("and assignment", "unsafe-and.ts",
      "gateway.requestFreshAuthorized &&= () => 0;"),
    unsafeSources("direct defineProperty", "unsafe-define.ts",
      "Object.defineProperty(gateway, 'executeFreshAuthorized', { value() {} });"),
    unsafeSources("direct Reflect.defineProperty", "unsafe-reflect-define.ts",
      "Reflect.defineProperty(gateway, 'rereadAndIssueFromLedger', { value() {} });"),
    unsafeSources("declaration reassignment", "unsafe-reassign.ts",
      "executeFreshAuthorized = replacement;"),
    unsafeSources("assignment destructuring", "unsafe-destructuring.ts",
      "({ requestFreshAuthorized } = source);"),
    unsafeSources("namespace declaration", "unsafe-namespace.ts",
      "namespace executeFreshAuthorized { export const issuer = true; }"),
    unsafeSources("prefix update", "unsafe-prefix.ts",
      "++gateway.readFreshHumanDecision;"),
    unsafeSources("postfix update", "unsafe-postfix.ts",
      "gateway.readFreshHumanDecision++;"),
    unsafeSources("for-in target", "unsafe-for-in.ts",
      "for (gateway.executeFreshAuthorized in source) {}"),
    unsafeSources("for-of target", "unsafe-for-of.ts",
      "for (gateway.executeFreshAuthorized of source) {}"),
    unsafeSources("remaining compound assignment", "unsafe-compound.ts",
      "gateway.executeFreshAuthorized += replacement;"),
    unsafeSources("Reflect.set", "unsafe-reflect-set.ts",
      "Reflect.set(gateway, 'executeFreshAuthorized', replacement);"),
    unsafeSources("aliased defineProperty", "unsafe-aliased-define.ts", [
      "const define = Object.defineProperty;",
      "define(gateway, 'executeFreshAuthorized', { value: replacement });"
    ].join("\n")),
    unsafeSources("aliased Reflect.set", "unsafe-aliased-set.ts", [
      "const { set: mutate } = Reflect;",
      "mutate(gateway, 'executeFreshAuthorized', replacement);"
    ].join("\n")),
    {
      name: "unresolved protected-host write",
      sources: base([
        "declare const dynamicName: string;",
        "gateway[dynamicName] = replacement;"
      ].join("\n")),
      violations: [gatewayPath]
    },
    {
      name: "unresolved owner-source write",
      sources: base([
        "declare const dynamicOwnerKey: string;",
        "other[dynamicOwnerKey] = replacement;"
      ].join("\n")),
      violations: [gatewayPath]
    },
    {
      name: "unresolved owner-source definition",
      sources: base([
        "declare const dynamicDefinition: string;",
        "class DynamicDefinition { [dynamicDefinition]() {} }"
      ].join("\n")),
      violations: [gatewayPath]
    },
    {
      name: "unresolved owner-source binding default",
      sources: base([
        "declare const dynamicBinding: string;",
        "const { [dynamicBinding]: local = () => 0 } = gateway;"
      ].join("\n")),
      violations: [gatewayPath]
    },
    {
      name: "unresolved aliased protected-host mutation",
      sources: base([
        "declare const dynamicName: string;",
        "const set = Reflect.set;",
        "set(gateway, dynamicName, replacement);"
      ].join("\n")),
      violations: [gatewayPath]
    },
    {
      name: "unrecognized protected-host mutation",
      sources: base("mutate(gateway);"),
      violations: [gatewayPath]
    }
  ];
  return {
    safeSources: base(),
    unsafe
  };
}

function protectedMentionSafeReadSources(): readonly SourceRecord[] {
  return [
    sourceRecordFromText("safe-module-syntax.ts", [
      "import { executeFreshAuthorized } from './gateway.js';",
      "import * as gatewayNamespace from './gateway.js';",
      "export { requestFreshAuthorized } from './gateway.js';",
      "export type { readFreshHumanDecision } from './types.js';",
      "void executeFreshAuthorized; void gatewayNamespace;"
    ].join("\n")),
    sourceRecordFromText("safe-types.ts", [
      "interface Gateway { executeFreshAuthorized(): void; }",
      "type Request = { requestFreshAuthorized: string };"
    ].join("\n")),
    sourceRecordFromText("safe-reads.ts", [
      "gateway.requestFreshAuthorized(locator);",
      "const read = gateway.readFreshHumanDecision;",
      "const execute = gateway['executeFreshAuthorized'];",
      "const key = 'rereadAndIssueFromLedger' as const;",
      "void gateway[key];",
      "const { preparePlannedStepBindings } = gateway;",
      "void read; void execute; void preparePlannedStepBindings;"
    ].join("\n"))
  ];
}

function sourceContainsOwnedDefinition(
  record: SourceRecord,
  protectedNames: ReadonlySet<string>
): boolean {
  let found = false;
  visit(record.sourceFile);
  return found;

  function visit(node: ts.Node): void {
    if (
      isDirectProtectedMention(node, protectedNames) &&
      isEmittedDefinitionName(node) &&
      task12ProtectedOwners.get(protectedMentionText(node)) === record.sourcePath
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  }
}

function protectedHostNames(
  sourceFile: ts.SourceFile,
  protectedNames: ReadonlySet<string>
): ReadonlySet<string> {
  const hosts = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      statement.importClause?.name !== undefined &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      (
        statement.moduleSpecifier.text.endsWith(
          "/domain-execution-dispatcher.js"
        ) ||
        statement.moduleSpecifier.text.endsWith(
          "/resident-loop-tool-gateway.js"
        ) ||
        statement.moduleSpecifier.text ===
          "./resident-loop-tool-gateway.js"
      )
    ) {
      hosts.add(statement.importClause.name.text);
    }
  }
  visit(sourceFile);
  let changed = true;
  while (changed) {
    changed = false;
    visitAliases(sourceFile);
  }
  return hosts;

  function visit(node: ts.Node): void {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined &&
      expressionContainsProtectedObjectMember(
        node.initializer,
        sourceFile,
        protectedNames
      )
    ) {
      hosts.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  }

  function visitAliases(node: ts.Node): void {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined &&
      expressionResolvesProtectedHost(node.initializer, hosts) &&
      !hosts.has(node.name.text)
    ) {
      hosts.add(node.name.text);
      changed = true;
    }
    ts.forEachChild(node, visitAliases);
  }
}

function expressionContainsProtectedObjectMember(
  expression: ts.Expression,
  sourceFile: ts.SourceFile,
  protectedNames: ReadonlySet<string>
): boolean {
  const value = unwrapStaticExpression(expression);
  const object = ts.isObjectLiteralExpression(value)
    ? value
    : ts.isCallExpression(value) &&
      value.arguments.length === 1 &&
      ts.isObjectLiteralExpression(value.arguments[0]!)
      ? value.arguments[0]!
      : undefined;
  return object?.properties.some((property) => {
    if (ts.isSpreadAssignment(property)) {
      return false;
    }
    const key = staticPropertyKey(property.name, sourceFile);
    return key.kind === "string" && protectedNames.has(key.value);
  }) ?? false;
}

function expressionResolvesProtectedHost(
  expression: ts.Expression | undefined,
  protectedHosts: ReadonlySet<string>
): boolean {
  if (expression === undefined) {
    return false;
  }
  const value = unwrapStaticExpression(expression);
  return ts.isIdentifier(value) && protectedHosts.has(value.text);
}

function inspectMutationCall(
  call: ts.CallExpression,
  record: SourceRecord,
  protectedNames: ReadonlySet<string>,
  protectedHosts: ReadonlySet<string>,
  ownerHasDefinition: boolean,
  violations: Set<string>
): void {
  const mutation = resolveMutationApi(call.expression, record.sourceFile);
  if (mutation !== undefined) {
    const target = call.arguments[0];
    const keyExpression = call.arguments[1];
    if (keyExpression !== undefined) {
      const key = staticExpressionKey(keyExpression, record.sourceFile);
      if (key.kind === "string" && protectedNames.has(key.value)) {
        violations.add(record.sourcePath);
      } else if (
        key.kind === "unresolved" &&
        (
          ownerHasDefinition ||
          expressionResolvesProtectedHost(target, protectedHosts)
        )
      ) {
        violations.add(record.sourcePath);
      }
    }
    return;
  }
  if (
    call.arguments.some((argument) =>
      expressionResolvesProtectedHost(argument, protectedHosts)
    )
  ) {
    violations.add(record.sourcePath);
  }
}

type MutationApi =
  | "Object.defineProperty"
  | "Reflect.defineProperty"
  | "Reflect.set";

function resolveMutationApi(
  expression: ts.Expression,
  sourceFile: ts.SourceFile,
  resolving: ReadonlySet<string> = new Set()
): MutationApi | undefined {
  const value = unwrapStaticExpression(expression);
  const direct = directMutationApi(value, sourceFile);
  if (direct !== undefined) {
    return direct;
  }
  if (!ts.isIdentifier(value) || resolving.has(value.text)) {
    return undefined;
  }
  const declaration = uniqueConstDeclaration(sourceFile, value.text);
  if (declaration?.initializer !== undefined) {
    return resolveMutationApi(
      declaration.initializer,
      sourceFile,
      new Set([...resolving, value.text])
    );
  }
  const destructured = uniqueMutationDestructuring(
    sourceFile,
    value.text
  );
  return destructured;
}

function directMutationApi(
  expression: ts.Expression,
  sourceFile: ts.SourceFile
): MutationApi | undefined {
  const access = ts.isPropertyAccessExpression(expression)
    ? {
        receiver: expression.expression,
        name: expression.name.text
      }
    : ts.isElementAccessExpression(expression)
      ? {
          receiver: expression.expression,
          name: staticExpressionKey(
            expression.argumentExpression,
            sourceFile
          ).kind === "string"
            ? (
                staticExpressionKey(
                  expression.argumentExpression,
                  sourceFile
                ) as { readonly kind: "string"; readonly value: string }
              ).value
            : undefined
        }
      : undefined;
  if (access === undefined || !ts.isIdentifier(access.receiver)) {
    return undefined;
  }
  if (
    access.receiver.text === "Object" &&
    access.name === "defineProperty"
  ) {
    return "Object.defineProperty";
  }
  if (
    access.receiver.text === "Reflect" &&
    access.name === "defineProperty"
  ) {
    return "Reflect.defineProperty";
  }
  if (access.receiver.text === "Reflect" && access.name === "set") {
    return "Reflect.set";
  }
  return undefined;
}

function uniqueMutationDestructuring(
  sourceFile: ts.SourceFile,
  localName: string
): MutationApi | undefined {
  const found: MutationApi[] = [];
  visit(sourceFile);
  return found.length === 1 ? found[0] : undefined;

  function visit(node: ts.Node): void {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer !== undefined &&
      ts.isVariableDeclarationList(node.parent) &&
      (node.parent.flags & ts.NodeFlags.Const) !== 0 &&
      ts.isIdentifier(unwrapStaticExpression(node.initializer))
    ) {
      const receiver = unwrapStaticExpression(node.initializer) as ts.Identifier;
      for (const element of node.name.elements) {
        if (!ts.isIdentifier(element.name) || element.name.text !== localName) {
          continue;
        }
        const imported = element.propertyName?.getText(sourceFile) ??
          element.name.text;
        if (receiver.text === "Object" && imported === "defineProperty") {
          found.push("Object.defineProperty");
        } else if (
          receiver.text === "Reflect" &&
          imported === "defineProperty"
        ) {
          found.push("Reflect.defineProperty");
        } else if (receiver.text === "Reflect" && imported === "set") {
          found.push("Reflect.set");
        }
      }
    }
    ts.forEachChild(node, visit);
  }
}

function isFreshNullPrototypeRecordWrite(
  node: ts.ComputedPropertyName | ts.ElementAccessExpression,
  sourceFile: ts.SourceFile
): boolean {
  if (
    !ts.isElementAccessExpression(node) ||
    !ts.isIdentifier(unwrapStaticExpression(node.expression))
  ) {
    return false;
  }
  const receiver = unwrapStaticExpression(node.expression) as ts.Identifier;
  const declaration = uniqueConstDeclaration(sourceFile, receiver.text);
  if (declaration?.initializer === undefined) {
    return false;
  }
  const initializer = unwrapStaticExpression(declaration.initializer);
  return ts.isCallExpression(initializer) &&
    ts.isPropertyAccessExpression(initializer.expression) &&
    ts.isIdentifier(initializer.expression.expression) &&
    initializer.expression.expression.text === "Object" &&
    initializer.expression.name.text === "create" &&
    initializer.arguments.length === 1 &&
    initializer.arguments[0]!.kind === ts.SyntaxKind.NullKeyword;
}

function isAllowedStaticKeyAliasLiteral(
  node: ts.Node,
  record: SourceRecord,
  protectedNames: ReadonlySet<string>
): boolean {
  if (!ts.isStringLiteral(node) && !ts.isNoSubstitutionTemplateLiteral(node)) {
    return false;
  }
  let declaration: ts.VariableDeclaration | undefined;
  for (
    let current: ts.Node | undefined = node.parent;
    current !== undefined && !ts.isStatement(current);
    current = current.parent
  ) {
    if (
      ts.isVariableDeclaration(current) &&
      current.initializer !== undefined &&
      unwrapStaticExpression(current.initializer) === node &&
      ts.isIdentifier(current.name)
    ) {
      declaration = current;
      break;
    }
  }
  if (
    declaration === undefined ||
    !ts.isIdentifier(declaration.name) ||
    uniqueConstDeclaration(record.sourceFile, declaration.name.text) !==
      declaration
  ) {
    return false;
  }
  const references = identifierReferences(
    record.sourceFile,
    declaration.name.text
  ).filter((identifier) => identifier !== declaration?.name);
  return references.length > 0 && references.every((reference) => {
    if (
      ts.isElementAccessExpression(reference.parent) &&
      reference.parent.argumentExpression === reference
    ) {
      return !isWriteSemanticCarrier(reference.parent);
    }
    if (
      ts.isComputedPropertyName(reference.parent) &&
      reference.parent.expression === reference
    ) {
      const declarationName =
        (reference.parent.parent as ts.NamedDeclaration).name;
      return declarationName !== undefined &&
        isEmittedDefinitionName(declarationName) &&
        task12ProtectedOwners.get(node.text) === record.sourcePath;
    }
    return false;
  }) && protectedNames.has(node.text);
}

function identifierReferences(
  sourceFile: ts.SourceFile,
  name: string
): readonly ts.Identifier[] {
  const found: ts.Identifier[] = [];
  visit(sourceFile);
  return found;

  function visit(node: ts.Node): void {
    if (ts.isIdentifier(node) && node.text === name) {
      found.push(node);
    }
    ts.forEachChild(node, visit);
  }
}

function uniqueConstDeclaration(
  sourceFile: ts.SourceFile,
  name: string
): ts.VariableDeclaration | undefined {
  const declarations: ts.Declaration[] = [];
  let candidate: ts.VariableDeclaration | undefined;
  visit(sourceFile);
  return declarations.length === 1 ? candidate : undefined;

  function visit(node: ts.Node): void {
    if (
      ts.isIdentifier(node) &&
      node.text === name &&
      semanticTs.isDeclarationName(node)
    ) {
      declarations.push(node.parent as ts.Declaration);
      if (
        ts.isVariableDeclaration(node.parent) &&
        node.parent.name === node &&
        ts.isVariableDeclarationList(node.parent.parent) &&
        (node.parent.parent.flags & ts.NodeFlags.Const) !== 0
      ) {
        candidate = node.parent;
      }
    }
    ts.forEachChild(node, visit);
  }
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

interface GatewayDefaultStaticControl {
  readonly source: SourceRecord;
  readonly violations: readonly string[];
}

function gatewayDefaultStaticControls(): readonly GatewayDefaultStaticControl[] {
  const exactDeclaration =
    "function consumeResidentDomainExecutionPermit() {}";
  const source = (
    sourcePath: string,
    declarations: readonly string[],
    members: readonly string[]
  ): SourceRecord => sourceRecordFromText(sourcePath, [
    ...declarations,
    "const residentDomainExecutionPermitConsumer = Object.freeze({",
    ...members.map((member) => `  ${member}`),
    "});",
    "export default residentDomainExecutionPermitConsumer;"
  ].join("\n"));
  return [
    {
      source: source(
        "valid-default.ts",
        [exactDeclaration],
        ["consumeResidentDomainExecutionPermit"]
      ),
      violations: []
    },
    {
      source: source(
        "alias-default.ts",
        [
          exactDeclaration,
          "const alias = consumeResidentDomainExecutionPermit;"
        ],
        ["consumeResidentDomainExecutionPermit: alias"]
      ),
      violations: ["default-member-is-not-exact-shorthand"]
    },
    {
      source: source(
        "shorthand-alias-default.ts",
        [
          "function wrongPermitConsumer() {}",
          "const consumeResidentDomainExecutionPermit = wrongPermitConsumer;"
        ],
        ["consumeResidentDomainExecutionPermit"]
      ),
      violations: ["permit-consumer-declaration-count:0"]
    },
    {
      source: source(
        "shorthand-arrow-default.ts",
        ["const consumeResidentDomainExecutionPermit = () => undefined;"],
        ["consumeResidentDomainExecutionPermit"]
      ),
      violations: ["permit-consumer-declaration-count:0"]
    },
    {
      source: source(
        "inline-method-default.ts",
        [exactDeclaration],
        ["consumeResidentDomainExecutionPermit() {}"]
      ),
      violations: ["default-member-is-not-exact-shorthand"]
    },
    {
      source: source(
        "inline-arrow-default.ts",
        [exactDeclaration],
        ["consumeResidentDomainExecutionPermit: () => undefined"]
      ),
      violations: ["default-member-is-not-exact-shorthand"]
    },
    {
      source: source(
        "missing-declaration-default.ts",
        [],
        ["consumeResidentDomainExecutionPermit"]
      ),
      violations: ["permit-consumer-module-binding-count:0"]
    },
    {
      source: source(
        "duplicate-declaration-default.ts",
        [exactDeclaration, exactDeclaration],
        ["consumeResidentDomainExecutionPermit"]
      ),
      violations: ["permit-consumer-module-binding-count:2"]
    },
    {
      source: source(
        "ambient-declaration-default.ts",
        ["declare function consumeResidentDomainExecutionPermit(): void;"],
        ["consumeResidentDomainExecutionPermit"]
      ),
      violations: ["permit-consumer-is-not-module-local-body"]
    },
    {
      source: source(
        "exported-declaration-default.ts",
        [`export ${exactDeclaration}`],
        ["consumeResidentDomainExecutionPermit"]
      ),
      violations: ["permit-consumer-is-not-module-local-body"]
    },
    {
      source: source(
        "widened-default.ts",
        [exactDeclaration],
        [
          "consumeResidentDomainExecutionPermit,",
          "issueResidentDomainExecutionPermit() {}"
        ]
      ),
      violations: ["default-member-count:2"]
    },
    {
      source: source(
        "computed-default.ts",
        [exactDeclaration],
        ["['consumeResidentDomainExecutionPermit']() {}"]
      ),
      violations: ["default-member-is-not-exact-shorthand"]
    },
    {
      source: source(
        "symbol-default.ts",
        [exactDeclaration],
        ["[Symbol.for('resident-permit-issuer')]() {}"]
      ),
      violations: ["default-member-is-not-exact-shorthand"]
    },
    {
      source: source(
        "accessor-default.ts",
        [exactDeclaration],
        ["get consumeResidentDomainExecutionPermit() { return () => 0; }"]
      ),
      violations: ["default-member-is-not-exact-shorthand"]
    },
    {
      source: source(
        "data-default.ts",
        [exactDeclaration],
        ["consumeResidentDomainExecutionPermit: 'not-callable'"]
      ),
      violations: ["default-member-is-not-exact-shorthand"]
    },
    {
      source: source(
        "namespace-merged-default.ts",
        [
          exactDeclaration,
          "namespace consumeResidentDomainExecutionPermit {" +
            " export const issue = true; }"
        ],
        ["consumeResidentDomainExecutionPermit"]
      ),
      violations: ["permit-consumer-module-binding-count:2"]
    },
    {
      source: source(
        "reassigned-declaration-default.ts",
        [
          exactDeclaration,
          "consumeResidentDomainExecutionPermit = replacement;"
        ],
        ["consumeResidentDomainExecutionPermit"]
      ),
      violations: ["permit-consumer-extra-use"]
    },
    {
      source: source(
        "same-named-replacement-default.ts",
        [
          exactDeclaration,
          "const replacement = " +
            "function consumeResidentDomainExecutionPermit() {};"
        ],
        ["consumeResidentDomainExecutionPermit"]
      ),
      violations: ["permit-consumer-extra-use"]
    },
    {
      source: source(
        "function-object-widening-default.ts",
        [
          exactDeclaration,
          "(consumeResidentDomainExecutionPermit as unknown as " +
            "{ issue?: boolean }).issue = true;"
        ],
        ["consumeResidentDomainExecutionPermit"]
      ),
      violations: ["permit-consumer-extra-use"]
    },
    {
      source: source(
        "function-object-augmentation-api-default.ts",
        [
          exactDeclaration,
          "Object.defineProperty(" +
            "consumeResidentDomainExecutionPermit, 'issue', { value: true });"
        ],
        ["consumeResidentDomainExecutionPermit"]
      ),
      violations: ["permit-consumer-extra-use"]
    },
    {
      source: sourceRecordFromText("custom-prototype-default.ts", [
        exactDeclaration,
        "const residentDomainExecutionPermitConsumer = Object.freeze(",
        "  Object.assign(Object.create(null), {",
        "    consumeResidentDomainExecutionPermit",
        "  })",
        ");",
        "export default residentDomainExecutionPermitConsumer;"
      ].join("\n")),
      violations: ["default-is-not-exact-frozen-literal"]
    }
  ];
}

interface GatewayDefaultStaticAnalysis {
  readonly callableLength: number;
  readonly violations: readonly string[];
}

function exactGatewayDefaultStaticAnalysis(
  sourceFile: ts.SourceFile
): GatewayDefaultStaticAnalysis {
  const reject = (violation: string): GatewayDefaultStaticAnalysis => ({
    callableLength: -1,
    violations: [violation]
  });
  const exported = sourceFile.statements.find(
    (statement): statement is ts.ExportAssignment =>
      ts.isExportAssignment(statement) && !statement.isExportEquals
  );
  if (exported === undefined) {
    return reject("missing-default-export");
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
    return reject("default-is-not-exact-frozen-literal");
  }
  const properties = initializer.arguments[0]!.properties;
  if (properties.length !== 1) {
    return reject(`default-member-count:${properties.length}`);
  }
  const property = properties[0]!;
  if (
    !ts.isShorthandPropertyAssignment(property) ||
    property.name.text !== "consumeResidentDomainExecutionPermit" ||
    property.objectAssignmentInitializer !== undefined
  ) {
    return reject("default-member-is-not-exact-shorthand");
  }
  const moduleBindingCount = topLevelValueBindingCount(
    sourceFile,
    "consumeResidentDomainExecutionPermit"
  );
  if (moduleBindingCount !== 1) {
    return reject(`permit-consumer-module-binding-count:${moduleBindingCount}`);
  }
  const declarations = sourceFile.statements.filter(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === "consumeResidentDomainExecutionPermit"
  );
  if (declarations.length !== 1) {
    return reject(`permit-consumer-declaration-count:${declarations.length}`);
  }
  const declaration = declarations[0]!;
  if (
    declaration.body === undefined ||
    declaration.modifiers?.some((modifier) =>
      modifier.kind === ts.SyntaxKind.DeclareKeyword ||
      modifier.kind === ts.SyntaxKind.ExportKeyword ||
      modifier.kind === ts.SyntaxKind.DefaultKeyword
    )
  ) {
    return reject("permit-consumer-is-not-module-local-body");
  }
  if (
    directNameMentions(
      sourceFile,
      "consumeResidentDomainExecutionPermit"
    ).some((mention) =>
      mention !== declaration.name &&
      mention !== property.name
    )
  ) {
    return reject("permit-consumer-extra-use");
  }
  return {
    callableLength: emittedFunctionLength(declaration),
    violations: []
  };
}

function directNameMentions(
  sourceFile: ts.SourceFile,
  name: string
): readonly (
  ts.Identifier | ts.StringLiteral | ts.NoSubstitutionTemplateLiteral
)[] {
  const mentions: (
    ts.Identifier | ts.StringLiteral | ts.NoSubstitutionTemplateLiteral
  )[] = [];
  visit(sourceFile);
  return mentions;

  function visit(node: ts.Node): void {
    if (
      (
        ts.isIdentifier(node) ||
        ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node)
      ) &&
      node.text === name
    ) {
      mentions.push(node);
    }
    ts.forEachChild(node, visit);
  }
}

function emittedFunctionLength(declaration: ts.FunctionDeclaration): number {
  const firstNonCounting = declaration.parameters.findIndex((parameter) =>
    parameter.dotDotDotToken !== undefined ||
    parameter.initializer !== undefined
  );
  return firstNonCounting < 0
    ? declaration.parameters.length
    : firstNonCounting;
}

function topLevelValueBindingCount(
  sourceFile: ts.SourceFile,
  name: string
): number {
  let count = 0;
  for (const statement of sourceFile.statements) {
    if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isEnumDeclaration(statement)) &&
      statement.name?.text === name
    ) {
      count += 1;
      continue;
    }
    if (
      ts.isModuleDeclaration(statement) &&
      statement.name.text === name
    ) {
      count += 1;
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        count += bindingNameCount(declaration.name, name);
      }
      continue;
    }
    if (ts.isImportEqualsDeclaration(statement)) {
      count += statement.isTypeOnly || statement.name.text !== name ? 0 : 1;
      continue;
    }
    if (
      !ts.isImportDeclaration(statement) ||
      statement.importClause === undefined ||
      statement.importClause.isTypeOnly
    ) {
      continue;
    }
    const clause = statement.importClause;
    count += clause.name?.text === name ? 1 : 0;
    if (clause.namedBindings !== undefined) {
      if (ts.isNamespaceImport(clause.namedBindings)) {
        count += clause.namedBindings.name.text === name ? 1 : 0;
      } else {
        count += clause.namedBindings.elements.filter((element) =>
          !element.isTypeOnly && element.name.text === name
        ).length;
      }
    }
  }
  return count;
}

function bindingNameCount(name: ts.BindingName, expected: string): number {
  if (ts.isIdentifier(name)) {
    return name.text === expected ? 1 : 0;
  }
  return name.elements.reduce((count, element) =>
    count + (
      ts.isOmittedExpression(element)
        ? 0
        : bindingNameCount(element.name, expected)
    ), 0);
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
    const declaration = uniqueConstDeclaration(sourceFile, value.text);
    if (declaration?.initializer !== undefined) {
      return staticExpressionKey(
        declaration.initializer,
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

interface OwnDescriptorSnapshot {
  readonly descriptor: PropertyDescriptor;
  readonly key: PropertyKey;
}

interface GatewayRuntimeBaseline {
  readonly callableExtensible: boolean;
  readonly callableFrozen: boolean;
  readonly callableOwn: readonly OwnDescriptorSnapshot[];
  readonly callablePrototypeOwn: readonly OwnDescriptorSnapshot[];
  readonly callableSealed: boolean;
  readonly functionPrototypeOwn: readonly OwnDescriptorSnapshot[];
  readonly objectPrototypeOwn: readonly OwnDescriptorSnapshot[];
}

function captureGatewayRuntimeBaseline(): GatewayRuntimeBaseline {
  function ordinaryDeclaredFunction(
    _permit: unknown,
    _port: unknown,
    _input: unknown
  ): void {}
  return {
    callableExtensible: Object.isExtensible(ordinaryDeclaredFunction),
    callableFrozen: Object.isFrozen(ordinaryDeclaredFunction),
    callableOwn: ownDescriptorSnapshot(ordinaryDeclaredFunction),
    callablePrototypeOwn:
      ownDescriptorSnapshot(ordinaryDeclaredFunction.prototype),
    callableSealed: Object.isSealed(ordinaryDeclaredFunction),
    functionPrototypeOwn: ownDescriptorSnapshot(Function.prototype),
    objectPrototypeOwn: ownDescriptorSnapshot(Object.prototype)
  };
}

function ownDescriptorSnapshot(value: object): readonly OwnDescriptorSnapshot[] {
  return Reflect.ownKeys(value).map((key) => ({
    descriptor: Reflect.getOwnPropertyDescriptor(value, key)!,
    key
  }));
}

function expectExactGatewayDefaultPermitConsumer(
  module: object,
  baseline: GatewayRuntimeBaseline,
  callableLength: number
): void {
  const value = Reflect.get(module, "default");
  expect(
    isExactFrozenGatewayDefaultPermitConsumer(
      value,
      baseline,
      callableLength
    )
  ).toBe(true);
}

function isExactFrozenGatewayDefaultPermitConsumer(
  value: unknown,
  baseline: GatewayRuntimeBaseline,
  callableLength: number
): boolean {
  if (
    !sameOwnDescriptorSnapshot(
      Object.prototype,
      baseline.objectPrototypeOwn
    ) ||
    !sameOwnDescriptorSnapshot(
      Function.prototype,
      baseline.functionPrototypeOwn
    ) ||
    typeof value !== "object" ||
    value === null ||
    !Object.isFrozen(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
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
    typeof descriptor.value === "function" &&
    descriptor.value.name === "consumeResidentDomainExecutionPermit" &&
    descriptor.value.length === callableLength &&
    Object.getPrototypeOf(descriptor.value) === Function.prototype &&
    Object.isExtensible(descriptor.value) === baseline.callableExtensible &&
    Object.isFrozen(descriptor.value) === baseline.callableFrozen &&
    Object.isSealed(descriptor.value) === baseline.callableSealed &&
    hasExactCallableOwnShape(
      descriptor.value,
      baseline.callableOwn,
      callableLength
    ) &&
    hasExactOrdinaryFunctionPrototype(
      descriptor.value,
      baseline.callablePrototypeOwn
    );
}

function sameOwnDescriptorSnapshot(
  value: object,
  expected: readonly OwnDescriptorSnapshot[]
): boolean {
  const actualKeys = Reflect.ownKeys(value);
  return actualKeys.length === expected.length &&
    actualKeys.every((key, index) => key === expected[index]?.key) &&
    expected.every(({ descriptor, key }) =>
      sameDescriptor(
        Reflect.getOwnPropertyDescriptor(value, key),
        descriptor
      )
    );
}

function sameDescriptor(
  actual: PropertyDescriptor | undefined,
  expected: PropertyDescriptor
): boolean {
  if (
    actual === undefined ||
    actual.configurable !== expected.configurable ||
    actual.enumerable !== expected.enumerable
  ) {
    return false;
  }
  if ("value" in expected || "writable" in expected) {
    return "value" in actual &&
      actual.value === expected.value &&
      actual.writable === expected.writable;
  }
  return !("value" in actual) &&
    actual.get === expected.get &&
    actual.set === expected.set;
}

function hasExactCallableOwnShape(
  callable: Function,
  baseline: readonly OwnDescriptorSnapshot[],
  callableLength: number
): boolean {
  const actualKeys = Reflect.ownKeys(callable);
  if (
    actualKeys.length !== baseline.length ||
    !actualKeys.every((key, index) => key === baseline[index]?.key)
  ) {
    return false;
  }
  return baseline.every(({ descriptor: expected, key }) => {
    const actual = Reflect.getOwnPropertyDescriptor(callable, key);
    if (
      actual === undefined ||
      actual.configurable !== expected.configurable ||
      actual.enumerable !== expected.enumerable
    ) {
      return false;
    }
    if (key === "name") {
      return "value" in actual &&
        actual.value === "consumeResidentDomainExecutionPermit" &&
        actual.writable === expected.writable;
    }
    if (key === "length") {
      return "value" in actual &&
        actual.value === callableLength &&
        actual.writable === expected.writable;
    }
    if (key === "prototype") {
      return "value" in actual &&
        typeof actual.value === "object" &&
        actual.value !== null &&
        actual.writable === expected.writable;
    }
    return sameDescriptor(actual, expected);
  });
}

function hasExactOrdinaryFunctionPrototype(
  callable: Function,
  baseline: readonly OwnDescriptorSnapshot[]
): boolean {
  const prototypeDescriptor = Reflect.getOwnPropertyDescriptor(
    callable,
    "prototype"
  );
  if (
    prototypeDescriptor === undefined ||
    !("value" in prototypeDescriptor) ||
    typeof prototypeDescriptor.value !== "object" ||
    prototypeDescriptor.value === null ||
    Object.getPrototypeOf(prototypeDescriptor.value) !== Object.prototype
  ) {
    return false;
  }
  const prototype = prototypeDescriptor.value as object;
  const actualKeys = Reflect.ownKeys(prototype);
  if (
    actualKeys.length !== baseline.length ||
    !actualKeys.every((key, index) => key === baseline[index]?.key)
  ) {
    return false;
  }
  return baseline.every(({ descriptor: expected, key }) => {
    const actual = Reflect.getOwnPropertyDescriptor(prototype, key);
    if (key === "constructor") {
      return actual !== undefined &&
        "value" in actual &&
        actual.value === callable &&
        actual.configurable === expected.configurable &&
        actual.enumerable === expected.enumerable &&
        actual.writable === expected.writable;
    }
    return sameDescriptor(actual, expected);
  });
}

function gatewayRuntimeNegativeControls(
  exactConsumer: () => void
): readonly object[] {
  function consumeResidentDomainExecutionPermit(): void {}
  function augmentedConsumer(): void {}
  Object.defineProperty(augmentedConsumer, "name", {
    configurable: true,
    value: "consumeResidentDomainExecutionPermit"
  });
  Reflect.defineProperty(augmentedConsumer, "issue", {
    configurable: true,
    value: true
  });
  function widenedPrototypeConsumer(): void {}
  Object.defineProperty(widenedPrototypeConsumer, "name", {
    configurable: true,
    value: "consumeResidentDomainExecutionPermit"
  });
  Reflect.defineProperty(widenedPrototypeConsumer.prototype, "issue", {
    configurable: true,
    value: true
  });
  const arrowConsumer = Object.defineProperty(
    (): void => undefined,
    "name",
    {
      configurable: true,
      value: "consumeResidentDomainExecutionPermit"
    }
  );
  const exact = (
    consumer: Function,
    extra?: Readonly<Record<PropertyKey, unknown>>
  ): object => Object.freeze({
    consumeResidentDomainExecutionPermit: consumer,
    ...extra
  });
  const customPrototype = Object.freeze(Object.assign(
    Object.create(null) as Record<string, unknown>,
    { consumeResidentDomainExecutionPermit }
  ));
  const accessor = {};
  Reflect.defineProperty(accessor, "consumeResidentDomainExecutionPermit", {
    configurable: false,
    enumerable: true,
    get: () => exactConsumer
  });
  const symbolWidened = Object.freeze({
    consumeResidentDomainExecutionPermit,
    [Symbol.for("resident-permit-issuer")]: true
  });
  return [
    exact(exactConsumer, { issueResidentDomainExecutionPermit: true }),
    symbolWidened,
    Object.freeze(accessor),
    Object.freeze({ consumeResidentDomainExecutionPermit: "not-callable" }),
    customPrototype,
    exact(augmentedConsumer),
    exact(widenedPrototypeConsumer),
    exact(arrowConsumer)
  ];
}

function expectPrototypeMutationRejected(
  prototype: object,
  key: PropertyKey,
  baseline: GatewayRuntimeBaseline,
  consumer: () => void
): void {
  const previous = Reflect.getOwnPropertyDescriptor(prototype, key);
  try {
    expect(Reflect.defineProperty(prototype, key, {
      configurable: true,
      value: true
    })).toBe(true);
    expect(isExactFrozenGatewayDefaultPermitConsumer(
      Object.freeze({
        consumeResidentDomainExecutionPermit: consumer
      }),
      baseline,
      consumer.length
    )).toBe(false);
  } finally {
    if (previous === undefined) {
      expect(Reflect.deleteProperty(prototype, key)).toBe(true);
    } else {
      expect(Reflect.defineProperty(prototype, key, previous)).toBe(true);
    }
  }
  expect(isExactFrozenGatewayDefaultPermitConsumer(
    Object.freeze({
      consumeResidentDomainExecutionPermit: consumer
    }),
    baseline,
    consumer.length
  )).toBe(true);
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
