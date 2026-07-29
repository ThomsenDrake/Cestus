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
        residentGatewayOperations: [
          "preparePlannedStepBindings",
          "requestFreshAuthorized",
          "readFreshHumanDecision",
          "executeFreshAuthorized",
          "rereadAndIssueFromLedger",
          "readCanonicalToolStepMaterial"
        ],
        permitConsumerOccurrences: 3,
        violations: []
      });
    for (const control of mentionControls.safe) {
      expect.soft(
        task12ProtectedMentionAnalysis(control.sources).violations,
        control.name
      ).toEqual([]);
    }
    expect(closedDataRecordNormalizationAnalysis(gatewayRecord)).toEqual({
      writes: 1,
      violations: []
    });
    for (const control of mentionControls.unsafe) {
      expect.soft(
        task12ProtectedMentionAnalysis(control.sources).violations,
        control.name
      ).toEqual(control.violations);
    }
    for (const control of dispatcherTransferControls()) {
      expect.soft(
        protectedResidentTransfers(control.sources),
        control.name
      ).toEqual(control.violations);
    }
    for (const control of task14GatewayConstructorControls()) {
      expect.soft(
        task14GatewayConstructorAnalysis(control.sources),
        control.name
      ).toEqual(control.expected);
    }
    expect.soft(protectedResidentTransfers(sources)).toEqual([]);
    expect.soft(task14GatewayConstructorAnalysis(sources)).toEqual({
      importSources: [
        "packages/local-runtime/src/mounted-wake-lifecycle-store.ts"
      ],
      callSources: [
        "packages/local-runtime/src/mounted-wake-lifecycle-store.ts"
      ],
      violations: []
    });
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
    expect(protectedLoaderTransfers(sources)).toEqual([]);
    expect(task12ProtectedMentionAnalysis(sources)).toEqual({
      definitionSources: [
        "packages/agent/src/domain-execution-dispatcher.ts",
        "packages/agent/src/resident-loop-tool-gateway.ts"
      ],
      residentGatewayOperations: [
        "preparePlannedStepBindings",
        "requestFreshAuthorized",
        "readFreshHumanDecision",
        "executeFreshAuthorized",
        "rereadAndIssueFromLedger",
        "readCanonicalToolStepMaterial"
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
  }, 30_000);
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
  readonly residentGatewayOperations: readonly string[];
  readonly permitConsumerOccurrences: number;
  readonly violations: readonly string[];
}

const residentGatewayOperations = Object.freeze([
  "preparePlannedStepBindings",
  "requestFreshAuthorized",
  "readFreshHumanDecision",
  "executeFreshAuthorized",
  "rereadAndIssueFromLedger",
  "readCanonicalToolStepMaterial"
] as const);

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
  ...residentGatewayOperations.map(
    (name) => [
      name,
      "packages/agent/src/resident-loop-tool-gateway.ts"
    ] as const
  )
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
  let canonicalMaterialConsumerOccurrences = 0;
  let boundedAgentLoopSourcePresent = false;

  for (const record of sources) {
    const { sourcePath, sourceFile } = record;
    if (sourcePath === "packages/agent/src/bounded-agent-loop.ts") {
      boundedAgentLoopSourcePresent = true;
    }
    const protectedHosts = protectedHostNames(sourceFile, protectedNames);
    const gatewayDefaultProvenance =
      gatewayDefaultLexicalProvenance(record);
    const canonicalMaterialProvenance =
      canonicalMaterialConsumerProvenance(record);
    if (gatewayDefaultProvenance.hasViolation) {
      violations.add(sourcePath);
    }
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
      if (
        (
          ts.isPropertyAccessExpression(node) ||
          ts.isElementAccessExpression(node)
        ) &&
        gatewayDefaultProvenance.resolves(node.expression) &&
        !isExactDispatcherGatewayAccess(
          node,
          record,
          gatewayDefaultProvenance
        )
      ) {
        violations.add(sourcePath);
      }
      if (
        isGatewayDefaultBindingPatternSource(
          node,
          gatewayDefaultProvenance
        )
      ) {
        violations.add(sourcePath);
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
      if (name === "readCanonicalToolStepMaterial") {
        if (
          isAllowedTypeMention(node) &&
          (
            sourcePath === "packages/agent/src/resident-loop-tool-gateway.ts" ||
            sourcePath === "packages/agent/src/bounded-agent-loop.ts"
          )
        ) {
          return;
        }
        if (isEmittedDefinitionName(node)) {
          if (task12ProtectedOwners.get(name) === sourcePath) {
            admitDefinition(name, sourcePath);
          } else {
            violations.add(sourcePath);
          }
          return;
        }
        if (isDefinitionObjectShorthand(node, sourcePath, name)) {
          return;
        }
        if (canonicalMaterialProvenance.isExactConsumer(node)) {
          canonicalMaterialConsumerOccurrences += 1;
          return;
        }
        violations.add(sourcePath);
        return;
      }
      if (name === "consumeResidentDomainExecutionPermit") {
        permitConsumerOccurrences += 1;
        if (
          isExactPermitDeclaration(node, sourcePath) ||
          isExactPermitDefaultShorthand(node, sourcePath) ||
          isExactDispatcherPermitCall(
            node,
            record,
            gatewayDefaultProvenance
          )
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
  if (task14BinderOccurrences > 1) {
    violations.add("packages/local-runtime/src/mounted-wake-lifecycle-store.ts");
  }
  if (
    boundedAgentLoopSourcePresent &&
    canonicalMaterialConsumerOccurrences !== 1
  ) {
    violations.add("packages/agent/src/bounded-agent-loop.ts");
  }
  return {
    definitionSources: [...definitionSources].sort(),
    residentGatewayOperations: [...residentGatewayOperations],
    permitConsumerOccurrences,
    violations: [...violations].sort()
  };
}

interface CanonicalMaterialConsumerProvenance {
  readonly isExactConsumer: (node: ts.Node) => boolean;
}

function canonicalMaterialConsumerProvenance(
  record: SourceRecord
): CanonicalMaterialConsumerProvenance {
  if (record.sourcePath !== "packages/agent/src/bounded-agent-loop.ts") {
    return { isExactConsumer: () => false };
  }
  const issuerDeclarations = record.sourceFile.statements.filter(
    (
      statement
    ): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text ===
        "createResidentBoundedAgentLoopFromIssuedCapabilities" &&
      statement.body !== undefined &&
      statement.parameters.length === 8 &&
      ts.getModifiers(statement)?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
      ) === true
  );
  if (issuerDeclarations.length !== 1) {
    return { isExactConsumer: () => false };
  }
  const issuer = issuerDeclarations[0]!;
  const gatewayParameter = issuer.parameters[2];
  if (
    gatewayParameter === undefined ||
    !ts.isIdentifier(gatewayParameter.name)
  ) {
    return { isExactConsumer: () => false };
  }
  const checker = localLexicalTypeChecker(record.sourceFile);
  const gatewaySymbol = checker.getSymbolAtLocation(gatewayParameter.name);
  if (gatewaySymbol === undefined) {
    return { isExactConsumer: () => false };
  }
  return {
    isExactConsumer: (node) => {
      if (
        !ts.isIdentifier(node) ||
        node.text !== "readCanonicalToolStepMaterial" ||
        !ts.isPropertyAccessExpression(node.parent) ||
        node.parent.name !== node ||
        node.parent.questionDotToken !== undefined ||
        !ts.isCallExpression(node.parent.parent) ||
        node.parent.parent.expression !== node.parent ||
        node.parent.parent.questionDotToken !== undefined ||
        node.parent.parent.arguments.length !== 1 ||
        ts.isSpreadElement(node.parent.parent.arguments[0]!) ||
        issuer.body === undefined ||
        !nodeIsWithin(node.parent.parent, issuer.body)
      ) {
        return false;
      }
      const receiver = unwrapStaticExpression(node.parent.expression);
      return ts.isIdentifier(receiver) &&
        checker.getSymbolAtLocation(receiver) === gatewaySymbol;
    }
  };
}

function nodeIsWithin(node: ts.Node, ancestor: ts.Node): boolean {
  for (
    let current: ts.Node | undefined = node;
    current !== undefined;
    current = current.parent
  ) {
    if (current === ancestor) {
      return true;
    }
  }
  return false;
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
  record: SourceRecord,
  provenance: GatewayDefaultLexicalProvenance
): boolean {
  if (
    record.sourcePath !==
      "packages/agent/src/domain-execution-dispatcher.ts" ||
    !ts.isIdentifier(node) ||
    !ts.isPropertyAccessExpression(node.parent) ||
    node.parent.name !== node ||
    node.parent.questionDotToken !== undefined ||
    !ts.isCallExpression(node.parent.parent) ||
    node.parent.parent.expression !== node.parent ||
    node.parent.parent.questionDotToken !== undefined ||
    !ts.isIdentifier(node.parent.expression)
  ) {
    return false;
  }
  return provenance.isRootBinding(node.parent.expression) &&
    isExactDispatcherPermitTuple(node.parent.parent, provenance);
}

function isExactDispatcherPermitTuple(
  call: ts.CallExpression,
  provenance: GatewayDefaultLexicalProvenance
): boolean {
  if (
    call.arguments.length !== 3 ||
    call.arguments.some((argument) => ts.isSpreadElement(argument))
  ) {
    return false;
  }
  const [permitArgument, portArgument, inputArgument] = call.arguments;
  if (
    permitArgument === undefined ||
    portArgument === undefined ||
    inputArgument === undefined ||
    !ts.isIdentifier(permitArgument) ||
    !ts.isIdentifier(portArgument) ||
    !ts.isIdentifier(inputArgument)
  ) {
    return false;
  }

  let frame: ts.Node | undefined = call.parent;
  while (frame !== undefined && !ts.isFunctionLike(frame)) {
    frame = frame.parent;
  }
  if (
    frame === undefined ||
    !ts.isMethodDeclaration(frame) ||
    !ts.isIdentifier(frame.name) ||
    frame.name.text !== "invokeAndAttest" ||
    frame.parameters.length !== 2
  ) {
    return false;
  }
  const [permitParameter, inputParameter] = frame.parameters;
  if (
    permitParameter === undefined ||
    inputParameter === undefined ||
    !isRequiredIdentifierParameter(permitParameter) ||
    !isRequiredIdentifierParameter(inputParameter) ||
    !ts.isObjectLiteralExpression(frame.parent) ||
    !ts.isCallExpression(frame.parent.parent)
  ) {
    return false;
  }
  const freezeCall = frame.parent.parent;
  if (
    freezeCall.arguments.length !== 1 ||
    freezeCall.arguments[0] !== frame.parent ||
    freezeCall.questionDotToken !== undefined ||
    !ts.isPropertyAccessExpression(freezeCall.expression) ||
    freezeCall.expression.questionDotToken !== undefined ||
    !ts.isIdentifier(freezeCall.expression.expression) ||
    freezeCall.expression.expression.text !== "Object" ||
    freezeCall.expression.name.text !== "freeze" ||
    !ts.isVariableDeclaration(freezeCall.parent) ||
    freezeCall.parent.initializer !== freezeCall ||
    !ts.isIdentifier(freezeCall.parent.name) ||
    !isDirectConstDeclaration(freezeCall.parent)
  ) {
    return false;
  }
  const portDeclaration = freezeCall.parent;
  if (!ts.isIdentifier(portDeclaration.name)) {
    return false;
  }
  return provenance.isUniqueDeclaration(
    permitParameter.name,
    permitParameter
  ) &&
    provenance.isUniqueDeclaration(
      inputParameter.name,
      inputParameter
    ) &&
    provenance.isUniqueDeclaration(
      portDeclaration.name,
      portDeclaration
    ) &&
    provenance.sameBinding(permitArgument, permitParameter.name) &&
    provenance.sameBinding(portArgument, portDeclaration.name) &&
    provenance.sameBinding(inputArgument, inputParameter.name);
}

function isRequiredIdentifierParameter(
  parameter: ts.ParameterDeclaration
): parameter is ts.ParameterDeclaration & { readonly name: ts.Identifier } {
  return ts.isIdentifier(parameter.name) &&
    parameter.dotDotDotToken === undefined &&
    parameter.questionToken === undefined &&
    parameter.initializer === undefined;
}

function isExactDispatcherGatewayAccess(
  node: ts.PropertyAccessExpression | ts.ElementAccessExpression,
  record: SourceRecord,
  provenance: GatewayDefaultLexicalProvenance
): boolean {
  return ts.isPropertyAccessExpression(node) &&
    isExactDispatcherPermitCall(node.name, record, provenance);
}

function isExactTask14BinderCall(
  node: ts.Node,
  record: SourceRecord
): boolean {
  const property = ts.isIdentifier(node) &&
    ts.isPropertyAccessExpression(node.parent) &&
    node.parent.name === node
      ? node.parent
      : undefined;
  const call = property !== undefined &&
    ts.isCallExpression(property.parent) &&
    property.parent.expression === property
      ? property.parent
      : undefined;
  if (
    record.sourcePath !==
      "packages/local-runtime/src/mounted-wake-lifecycle-store.ts" ||
    property === undefined ||
    property.questionDotToken !== undefined ||
    call === undefined ||
    call.questionDotToken !== undefined ||
    call.arguments.length !== 1 ||
    ts.isSpreadElement(call.arguments[0]!) ||
    !ts.isIdentifier(property.expression) ||
    !isInsideExactTask14Binder(call)
  ) {
    return false;
  }
  return uniqueDefaultImportLocal(
    record.sourceFile,
    "../../agent/src/domain-execution-dispatcher.js"
  ) === property.expression.text;
}

function isInsideExactTask14Binder(node: ts.Node): boolean {
  for (
    let current: ts.Node | undefined = node.parent;
    current !== undefined;
    current = current.parent
  ) {
    if (ts.isFunctionLike(current)) {
      return ts.isFunctionDeclaration(current) &&
        current.name?.text ===
          "bindMountedResidentLoopAuthorityForFactory";
    }
  }
  return false;
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
  readonly safe: readonly {
    readonly name: string;
    readonly sources: readonly SourceRecord[];
  }[];
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
  const boundedLoopPath =
    "packages/agent/src/bounded-agent-loop.ts";
  const task14Path =
    "packages/local-runtime/src/mounted-wake-lifecycle-store.ts";
  const dispatcherPermitFrame = (
    body: readonly string[]
  ): readonly string[] => [
    "function createOpaqueResidentPort() {",
    "  const port = Object.freeze({",
    "    invokeAndAttest(",
    "      permit: unknown,",
    "      residentInvocationInput: unknown",
    "    ) {",
    ...body,
    "    }",
    "  });",
    "  return port;",
    "}"
  ];
  const exactDispatcherFunction = dispatcherPermitFrame([
    "      return gatewayDefault.consumeResidentDomainExecutionPermit(",
    "        permit, port, residentInvocationInput",
    "      );"
  ]);
  const base = (
    gatewayExtra = "",
    dispatcherExtra = "",
    normalizationEscape = "",
    dispatcherFunction: readonly string[] = exactDispatcherFunction
  ): readonly SourceRecord[] => [
    sourceRecordFromText(dispatcherPath, [
      "import gatewayDefault from './resident-loop-tool-gateway.js';",
      "function createPackageOwnedResidentDomainExecutionCapability() {}",
      "function bindPackageOwnedResidentDomainExecutionPort() {}",
      ...dispatcherFunction,
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
      "function readCanonicalToolStepMaterial() {}",
      "const residentDomainExecutionPermitConsumer = Object.freeze({",
      "  consumeResidentDomainExecutionPermit",
      "});",
      "const gateway = Object.freeze({",
      "  preparePlannedStepBindings,",
      "  requestFreshAuthorized,",
      "  readFreshHumanDecision,",
      "  executeFreshAuthorized,",
      "  rereadAndIssueFromLedger,",
      "  readCanonicalToolStepMaterial",
      "});",
      "export default residentDomainExecutionPermitConsumer;",
      "void gateway;",
      "const record = Object.create(null) as Record<string, unknown>;",
      "declare const recordKey: string;",
      "record[recordKey] = undefined;",
      "void record[recordKey];",
      "Reflect.ownKeys(record);",
      "const { [recordKey]: dynamicRead } = gateway;",
      "void dynamicRead;",
      "const unrelatedRecord = Object.create(null);",
      "declare const unrelatedKey: string;",
      "const { [unrelatedKey]: unrelatedValue } = unrelatedRecord;",
      "void unrelatedValue;",
      "function dataRecord(value: unknown, label: string) {",
      "  if (value === null || typeof value !== 'object' || Array.isArray(value) ||",
      "      isProxy(value) ||",
      "      Object.getPrototypeOf(value) !== Object.prototype ||",
      "      Object.getOwnPropertySymbols(value).length > 0) {",
      "    throw new Error(label);",
      "  }",
      "  const record = Object.create(null) as Record<string, unknown>;",
      "  for (const key of Object.getOwnPropertyNames(value).sort()) {",
      "    const descriptor = Object.getOwnPropertyDescriptor(value, key);",
      "    if (unsafeKeys.has(key) || descriptor === undefined ||",
      "        !('value' in descriptor) || !descriptor.enumerable) {",
      "      throw new Error(label);",
      "    }",
      "    record[key] = descriptor.value;",
      "  }",
      "  return record;",
      "}",
      "function copyOne(value: unknown) {",
      "  const recordOne = dataRecord(value, 'one');",
      "  rejectUnknown(recordOne, ['value'], 'one');",
      `  ${normalizationEscape}`,
      "  return Object.freeze({ value: recordOne.value });",
      "}",
      "function copyTwo(value: unknown) {",
      "  const recordTwo = dataRecord(value, 'two');",
      "  rejectUnknown(recordTwo, ['value'], 'two');",
      "  return Object.freeze({ value: recordTwo.value });",
      "}",
      "function copyThree(value: unknown) {",
      "  const recordThree = dataRecord(value, 'three');",
      "  rejectUnknown(recordThree, ['value'], 'three');",
      "  return Object.freeze({ value: recordThree.value });",
      "}",
      "function copyFour(value: unknown) {",
      "  const recordFour = dataRecord(value, 'four');",
      "  rejectUnknown(recordFour, ['value'], 'four');",
      "  return Object.freeze({ value: recordFour.value });",
      "}",
      gatewayExtra
    ].join("\n")),
    sourceRecordFromText(boundedLoopPath, [
      "export function createResidentBoundedAgentLoopFromIssuedCapabilities(",
      "  planObservation: unknown,",
      "  candidateProvider: unknown,",
      "  gateway: any,",
      "  mountedAuthority: unknown,",
      "  issuerToken: unknown,",
      "  handoffProjection: unknown,",
      "  metadata: unknown,",
      "  nowMonotonicMs: unknown",
      ") {",
      "  void candidateProvider;",
      "  void mountedAuthority;",
      "  void issuerToken;",
      "  void handoffProjection;",
      "  void metadata;",
      "  void nowMonotonicMs;",
      "  return gateway.readCanonicalToolStepMaterial(planObservation);",
      "}"
    ].join("\n")),
    sourceRecordFromText(task14Path, [
      "import dispatcherDefault from " +
        "'../../agent/src/domain-execution-dispatcher.js';",
      "function bindMountedResidentLoopAuthorityForFactory() {",
      "  dispatcherDefault.bindPackageOwnedResidentDomainExecutionPort(binding);",
      "}"
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
  const shadowedUnrelatedRecordSources = base().map((record) =>
    record.sourcePath === dispatcherPath
      ? sourceRecordFromText(record.sourcePath, [
          record.text,
          "function readShadowedUnrelatedRecord(",
          "  gatewayDefault: Record<string, unknown>,",
          "  dynamicKey: string",
          ") {",
          "  const { [dynamicKey]: value } = gatewayDefault;",
          "  return value;",
          "}"
        ].join("\n"))
      : record
  );
  const absentBoundedLoopSources = base().filter(
    (record) => record.sourcePath !== boundedLoopPath
  );
  const missingCanonicalMaterialConsumerSources = base().map((record) =>
    record.sourcePath === boundedLoopPath
      ? sourceRecordFromText(
          boundedLoopPath,
          record.text.replace(
            "  return gateway.readCanonicalToolStepMaterial(planObservation);",
            "  return planObservation;"
          )
        )
      : record
  );
  const duplicateCanonicalMaterialConsumerSources = base().map((record) =>
    record.sourcePath === boundedLoopPath
      ? sourceRecordFromText(
          boundedLoopPath,
          record.text.replace(
            "  return gateway.readCanonicalToolStepMaterial(planObservation);",
            [
              "  gateway.readCanonicalToolStepMaterial(planObservation);",
              "  return gateway.readCanonicalToolStepMaterial(planObservation);"
            ].join("\n")
          )
        )
      : record
  );
  const unsafeTask14Binder = (
    name: string,
    body: readonly string[]
  ) => ({
    name,
    sources: base().map((record) =>
      record.sourcePath === task14Path
        ? sourceRecordFromText(task14Path, [
            "import dispatcherDefault from " +
              "'../../agent/src/domain-execution-dispatcher.js';",
            ...body
          ].join("\n"))
        : record
    ),
    violations: [task14Path]
  });
  const unsafeCanonicalConsumer = (
    name: string,
    sourcePath: string,
    text: string
  ) => ({
    name,
    sources: [
      ...base(),
      sourceRecordFromText(sourcePath, text)
    ],
    violations: [sourcePath]
  });
  const unsafe = [
    {
      name: "canonical material missing bounded-loop consumer",
      sources: missingCanonicalMaterialConsumerSources,
      violations: [boundedLoopPath]
    },
    {
      name: "canonical material duplicate bounded-loop consumer",
      sources: duplicateCanonicalMaterialConsumerSources,
      violations: [boundedLoopPath]
    },
    unsafeCanonicalConsumer(
      "canonical material foreign consumer",
      "packages/agent/src/foreign-bounded-loop.ts",
      "gateway.readCanonicalToolStepMaterial(issuedReadback);"
    ),
    unsafeTask14Binder("Task14 dispatcher zero-argument binder call", [
      "function bindMountedResidentLoopAuthorityForFactory() {",
      "  dispatcherDefault.bindPackageOwnedResidentDomainExecutionPort();",
      "}"
    ]),
    unsafeTask14Binder("Task14 dispatcher two-argument binder call", [
      "function bindMountedResidentLoopAuthorityForFactory() {",
      "  dispatcherDefault.bindPackageOwnedResidentDomainExecutionPort(",
      "    firstBinding, secondBinding",
      "  );",
      "}"
    ]),
    unsafeTask14Binder("Task14 dispatcher spread binder call", [
      "function bindMountedResidentLoopAuthorityForFactory() {",
      "  dispatcherDefault.bindPackageOwnedResidentDomainExecutionPort(",
      "    ...bindings",
      "  );",
      "}"
    ]),
    unsafeTask14Binder("Task14 dispatcher optional-property binder call", [
      "function bindMountedResidentLoopAuthorityForFactory() {",
      "  dispatcherDefault?.bindPackageOwnedResidentDomainExecutionPort(",
      "    binding",
      "  );",
      "}"
    ]),
    unsafeTask14Binder("Task14 dispatcher optional-call binder call", [
      "function bindMountedResidentLoopAuthorityForFactory() {",
      "  dispatcherDefault.bindPackageOwnedResidentDomainExecutionPort?.(",
      "    binding",
      "  );",
      "}"
    ]),
    unsafeTask14Binder("Task14 dispatcher out-of-binder call", [
      "function bindMountedResidentLoopAuthorityForFactory() {}",
      "dispatcherDefault.bindPackageOwnedResidentDomainExecutionPort(binding);"
    ]),
    {
      name: "gateway default wrong-order permit tuple",
      sources: base("", "", "", dispatcherPermitFrame([
        "      return gatewayDefault.consumeResidentDomainExecutionPermit(",
        "        port, permit, residentInvocationInput",
        "      );"
      ])),
      violations: [dispatcherPath]
    },
    {
      name: "gateway default missing permit tuple argument",
      sources: base("", "", "", dispatcherPermitFrame([
        "      return gatewayDefault.consumeResidentDomainExecutionPermit(",
        "        permit, port",
        "      );"
      ])),
      violations: [dispatcherPath]
    },
    {
      name: "gateway default extra permit tuple argument",
      sources: base("", "", "", dispatcherPermitFrame([
        "      return gatewayDefault.consumeResidentDomainExecutionPermit(",
        "        permit, port, residentInvocationInput, extraInput",
        "      );"
      ])),
      violations: [dispatcherPath]
    },
    {
      name: "gateway default spread permit tuple",
      sources: base("", "", "", dispatcherPermitFrame([
        "      return gatewayDefault.consumeResidentDomainExecutionPermit(",
        "        ...permitTuple",
        "      );"
      ])),
      violations: [dispatcherPath]
    },
    {
      name: "gateway default optional receiver permit call",
      sources: base("", "", "", dispatcherPermitFrame([
        "      return gatewayDefault?.consumeResidentDomainExecutionPermit(",
        "        permit, port, residentInvocationInput",
        "      );"
      ])),
      violations: [dispatcherPath]
    },
    {
      name: "gateway default optional permit call",
      sources: base("", "", "", dispatcherPermitFrame([
        "      return gatewayDefault.consumeResidentDomainExecutionPermit?.(",
        "        permit, port, residentInvocationInput",
        "      );"
      ])),
      violations: [dispatcherPath]
    },
    {
      name: "gateway default aliased permit tuple binding",
      sources: base("", "", "", dispatcherPermitFrame([
        "      const permitAlias = permit;",
        "      return gatewayDefault.consumeResidentDomainExecutionPermit(",
        "        permitAlias, port, residentInvocationInput",
        "      );"
      ])),
      violations: [dispatcherPath]
    },
    {
      name: "gateway default substituted permit tuple binding",
      sources: base("", "", "", dispatcherPermitFrame([
        "      return gatewayDefault.consumeResidentDomainExecutionPermit(",
        "        substitutedPermit, port, residentInvocationInput",
        "      );"
      ])),
      violations: [dispatcherPath]
    },
    {
      name: "gateway default duplicate permit tuple binding",
      sources: base("", "", "", dispatcherPermitFrame([
        "      return gatewayDefault.consumeResidentDomainExecutionPermit(",
        "        permit, port, port",
        "      );"
      ])),
      violations: [dispatcherPath]
    },
    {
      name: "gateway default comma permit tuple value",
      sources: base("", "", "", dispatcherPermitFrame([
        "      return gatewayDefault.consumeResidentDomainExecutionPermit(",
        "        (substitutedPermit, permit), port, residentInvocationInput",
        "      );"
      ])),
      violations: [dispatcherPath]
    },
    {
      name: "gateway default conditional permit tuple value",
      sources: base("", "", "", dispatcherPermitFrame([
        "      return gatewayDefault.consumeResidentDomainExecutionPermit(",
        "        condition ? permit : substitutedPermit,",
        "        port,",
        "        residentInvocationInput",
        "      );"
      ])),
      violations: [dispatcherPath]
    },
    {
      name: "gateway default shadowed permit tuple binding",
      sources: base("", "", "", dispatcherPermitFrame([
        "      {",
        "        const permit = substitutedPermit;",
        "        return gatewayDefault.consumeResidentDomainExecutionPermit(",
        "          permit, port, residentInvocationInput",
        "        );",
        "      }"
      ])),
      violations: [dispatcherPath]
    },
    {
      name: "gateway default shadowed parameter permit call",
      sources: base("", "", "", [
        "function dispatch(",
        "  gatewayDefault: any,",
        "  permit: unknown,",
        "  port: unknown,",
        "  input: unknown",
        ") {",
        "  return gatewayDefault.consumeResidentDomainExecutionPermit(",
        "    permit, port, input",
        "  );",
        "}"
      ]),
      violations: [dispatcherPath]
    },
    {
      name: "gateway default shadowed local permit call",
      sources: base("", "", "", [
        "function dispatch(permit: unknown, port: unknown, input: unknown) {",
        "  const gatewayDefault: any = unrelatedGateway;",
        "  return gatewayDefault.consumeResidentDomainExecutionPermit(",
        "    permit, port, input",
        "  );",
        "}"
      ]),
      violations: [dispatcherPath]
    },
    {
      name: "gateway default nested shadow permit call",
      sources: base("", "", "", [
        "function dispatch(permit: unknown, port: unknown, input: unknown) {",
        "  function invoke(gatewayDefault: any) {",
        "    return gatewayDefault.consumeResidentDomainExecutionPermit(",
        "      permit, port, input",
        "    );",
        "  }",
        "  return invoke(unrelatedGateway);",
        "}"
      ]),
      violations: [dispatcherPath]
    },
    {
      name: "gateway default namespace shadow permit call",
      sources: base("", "", "", [
        "namespace ShadowedPermitNamespace {",
        "  export const gatewayDefault: any = unrelatedGateway;",
        "  export function dispatch(",
        "    permit: unknown, port: unknown, input: unknown",
        "  ) {",
        "    return gatewayDefault.consumeResidentDomainExecutionPermit(",
        "      permit, port, input",
        "    );",
        "  }",
        "}"
      ]),
      violations: [dispatcherPath]
    },
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
      name: "resolved computed owner duplicate",
      sources: base([
        "const duplicateOperation = 'executeFreshAuthorized' as const;",
        "class DuplicateOwnerDefinition { [duplicateOperation]() {} }"
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
    },
    {
      name: "substituted-template gateway alias call",
      sources: base("", [
        "const dynamicGateway = gatewayDefault;",
        "dynamicGateway[`consumeResident${'DomainExecutionPermit'}`](",
        "  permit, port, input",
        ");"
      ].join("\n")),
      violations: [dispatcherPath]
    },
    {
      name: "gateway default direct binding extraction",
      sources: base("", [
        "const { consumeResidentDomainExecutionPermit } = gatewayDefault;",
        "void consumeResidentDomainExecutionPermit;"
      ].join("\n")),
      violations: [dispatcherPath, gatewayPath]
    },
    {
      name: "gateway default renamed binding extraction",
      sources: base("", [
        "const { consumeResidentDomainExecutionPermit: invoke } =",
        "  gatewayDefault;",
        "void invoke;"
      ].join("\n")),
      violations: [dispatcherPath, gatewayPath]
    },
    {
      name: "gateway default resolved computed binding extraction",
      sources: base("", [
        "const permitKey = 'consumeResidentDomainExecutionPermit' as const;",
        "const { [permitKey]: invoke } = gatewayDefault;",
        "void invoke;"
      ].join("\n")),
      violations: [dispatcherPath, gatewayPath]
    },
    {
      name: "gateway default unresolved computed binding extraction",
      sources: base("", [
        "const suffix = 'DomainExecutionPermit';",
        "const { [`consumeResident${suffix}`]: invoke } = gatewayDefault;",
        "invoke(permit, port, input);"
      ].join("\n")),
      violations: [dispatcherPath]
    },
    {
      name: "gateway default array binding extraction",
      sources: base("", [
        "const [invoke] = gatewayDefault;",
        "void invoke;"
      ].join("\n")),
      violations: [dispatcherPath]
    },
    {
      name: "gateway default nested binding extraction",
      sources: base("", [
        "const nestedPermitKey =",
        "  'consumeResidentDomainExecutionPermit' as const;",
        "const { nested: { [nestedPermitKey]: invoke } } = gatewayDefault;",
        "void invoke;"
      ].join("\n")),
      violations: [dispatcherPath, gatewayPath]
    },
    {
      name: "gateway default rest binding extraction",
      sources: base("", [
        "const { ...permitConsumer } = gatewayDefault;",
        "void permitConsumer;"
      ].join("\n")),
      violations: [dispatcherPath]
    },
    {
      name: "gateway default binding initializer extraction",
      sources: base("", [
        "const [invoke = fallback] = gatewayDefault;",
        "void invoke;"
      ].join("\n")),
      violations: [dispatcherPath]
    },
    {
      name: "gateway default alias binding extraction",
      sources: base("", [
        "const dynamicGateway = gatewayDefault;",
        "const [invoke] = dynamicGateway;",
        "void invoke;"
      ].join("\n")),
      violations: [dispatcherPath]
    },
    {
      name: "gateway default parameter binding extraction",
      sources: base("", [
        "function inspect([invoke] = gatewayDefault) {",
        "  void invoke;",
        "}"
      ].join("\n")),
      violations: [dispatcherPath]
    },
    {
      name: "gateway default mutable alias binding extraction",
      sources: base("", [
        "let mutableGateway = gatewayDefault;",
        "const suffix = 'DomainExecutionPermit';",
        "const { [`consumeResident${suffix}`]: invoke } = mutableGateway;",
        "invoke(permit, port, input);"
      ].join("\n")),
      violations: [dispatcherPath]
    },
    {
      name: "gateway default assignment-sourced binding extraction",
      sources: base("", [
        "let assignedGateway = unrelatedRecord;",
        "assignedGateway = gatewayDefault;",
        "const suffix = 'DomainExecutionPermit';",
        "const { [`consumeResident${suffix}`]: invoke } = assignedGateway;",
        "invoke(permit, port, input);"
      ].join("\n")),
      violations: [dispatcherPath]
    },
    {
      name: "gateway default parameter-default binding extraction",
      sources: base("", [
        "function inspectGateway(host = gatewayDefault) {",
        "  const suffix = 'DomainExecutionPermit';",
        "  const { [`consumeResident${suffix}`]: invoke } = host;",
        "  invoke(permit, port, input);",
        "}",
        "inspectGateway();"
      ].join("\n")),
      violations: [dispatcherPath]
    },
    {
      name: "gateway default parameter-pass binding extraction",
      sources: base("", [
        "function inspectGateway(host: unknown) {",
        "  const suffix = 'DomainExecutionPermit';",
        "  const { [`consumeResident${suffix}`]: invoke } = host;",
        "  invoke(permit, port, input);",
        "}",
        "inspectGateway(gatewayDefault);"
      ].join("\n")),
      violations: [dispatcherPath]
    },
    {
      name: "gateway default conditional binding extraction",
      sources: base("", [
        "const selectedGateway = condition ? gatewayDefault : unrelatedRecord;",
        "const suffix = 'DomainExecutionPermit';",
        "const { [`consumeResident${suffix}`]: invoke } = selectedGateway;",
        "invoke(permit, port, input);"
      ].join("\n")),
      violations: [dispatcherPath]
    },
    {
      name: "gateway default logical binding extraction",
      sources: base("", [
        "const selectedGateway = gatewayDefault || unrelatedRecord;",
        "const suffix = 'DomainExecutionPermit';",
        "const { [`consumeResident${suffix}`]: invoke } = selectedGateway;",
        "invoke(permit, port, input);"
      ].join("\n")),
      violations: [dispatcherPath]
    },
    {
      name: "gateway default sequence binding extraction",
      sources: base("", [
        "const selectedGateway = (unrelatedRecord, gatewayDefault);",
        "const suffix = 'DomainExecutionPermit';",
        "const { [`consumeResident${suffix}`]: invoke } = selectedGateway;",
        "invoke(permit, port, input);"
      ].join("\n")),
      violations: [dispatcherPath]
    },
    {
      name: "gateway default compound-assignment binding extraction",
      sources: base("", [
        "let selectedGateway = unrelatedRecord;",
        "selectedGateway ||= gatewayDefault;",
        "const suffix = 'DomainExecutionPermit';",
        "const { [`consumeResident${suffix}`]: invoke } = selectedGateway;",
        "invoke(permit, port, input);"
      ].join("\n")),
      violations: [dispatcherPath]
    },
    {
      name: "gateway default immutable alias reassignment",
      sources: base("", [
        "const dynamicGateway = gatewayDefault;",
        "dynamicGateway = unrelatedRecord;"
      ].join("\n")),
      violations: [dispatcherPath]
    },
    {
      name: "gateway default nested alias capture",
      sources: base("", [
        "function captureGateway() {",
        "  const dynamicGateway = gatewayDefault;",
        "  return dynamicGateway;",
        "}"
      ].join("\n")),
      violations: [dispatcherPath]
    },
    {
      name: "gateway default nested-scope alias binding extraction",
      sources: base("", [
        "const dynamicGateway = gatewayDefault;",
        "function inspectNestedGateway() {",
        "  const suffix = 'DomainExecutionPermit';",
        "  const { [`consumeResident${suffix}`]: invoke } = dynamicGateway;",
        "  invoke(permit, port, input);",
        "}"
      ].join("\n")),
      violations: [dispatcherPath]
    },
    {
      name: "gateway default return escape",
      sources: base("", [
        "function returnGateway() {",
        "  return gatewayDefault;",
        "}"
      ].join("\n")),
      violations: [dispatcherPath]
    },
    {
      name: "gateway default pass escape",
      sources: base("", "consumeGateway(gatewayDefault);"),
      violations: [dispatcherPath]
    },
    {
      name: "gateway default store escape",
      sources: base("", "holder.gateway = gatewayDefault;"),
      violations: [dispatcherPath]
    },
    {
      name: "gateway default object transfer",
      sources: base("", [
        "const transferredGateway = { gateway: gatewayDefault };",
        "void transferredGateway;"
      ].join("\n")),
      violations: [dispatcherPath]
    },
    ...freshRecordEscapeControls(base, gatewayPath),
    ...closedNormalizationEscapeControls(base, gatewayPath)
  ];
  return {
    safeSources: base(),
    safe: [
      {
        name: "exact dispatcher permit tuple",
        sources: base()
      },
      {
        name: "unique direct immutable gateway alias",
        sources: base("", "const immutableGatewayAlias = gatewayDefault;")
      },
      {
        name: "shadowed unrelated dynamic record",
        sources: shadowedUnrelatedRecordSources
      },
      {
        name: "canonical material bounded-loop source absent before R",
        sources: absentBoundedLoopSources
      }
    ],
    unsafe
  };
}

function freshRecordEscapeControls(
  base: (
    gatewayExtra?: string,
    dispatcherExtra?: string,
    normalizationEscape?: string
  ) =>
    readonly SourceRecord[],
  gatewayPath: string
): readonly {
  readonly name: string;
  readonly sources: readonly SourceRecord[];
  readonly violations: readonly string[];
}[] {
  const control = (name: string, escape: string) => ({
    name: `fresh record ${name}`,
    sources: base([
      "function normalizeFreshRecord() {",
      "  const freshRecord = Object.create(null) as Record<string, unknown>;",
      "  declare const dynamicKey: string;",
      "  freshRecord[dynamicKey] = undefined;",
      `  ${escape}`,
      "}"
    ].join("\n")),
    violations: [gatewayPath]
  });
  return [
    control("return escape", "return freshRecord;"),
    control("yield escape", "function* leak() { yield freshRecord; } void leak;"),
    control("outward assignment escape", "outwardRecord = freshRecord;"),
    control("property store escape", "holder.record = freshRecord;"),
    control("call argument escape", "consumeRecord(freshRecord);"),
    control("closure capture escape", "const capture = () => freshRecord;"),
    control("identity alias escape", "const alias = freshRecord; void alias;"),
    control("authority graph escape", "authorityGraph.add(freshRecord);"),
    control("export graph escape", "exportTable.normalized = freshRecord;"),
    control(
      "prototype escape",
      "Object.setPrototypeOf(normalizedOutput, freshRecord);"
    ),
    control(
      "default graph escape",
      "defaultGraph.set('gateway', freshRecord);"
    ),
    control(
      "permit graph escape",
      "permitGraph.set('permit', freshRecord);"
    )
  ];
}

function closedNormalizationEscapeControls(
  base: (
    gatewayExtra?: string,
    dispatcherExtra?: string,
    normalizationEscape?: string
  ) => readonly SourceRecord[],
  gatewayPath: string
): readonly {
  readonly name: string;
  readonly sources: readonly SourceRecord[];
  readonly violations: readonly string[];
}[] {
  const control = (name: string, escape: string) => ({
    name: `closed normalization ${name}`,
    sources: base("", "", escape),
    violations: [gatewayPath]
  });
  const exported = base().map((record) =>
    record.sourcePath === gatewayPath
      ? sourceRecordFromText(
          record.sourcePath,
          record.text.replace(
            "function copyOne(value: unknown)",
            "export function copyOne(value: unknown)"
          )
        )
      : record
  );
  return [
    control("authority escape", "authorityGraph.add(recordOne);"),
    {
      name: "closed normalization exported operation escape",
      sources: exported,
      violations: [gatewayPath]
    },
    control("capture escape", "captureGraph.push(() => recordOne);"),
    control("store escape", "holder.record = recordOne;"),
    control("pass escape", "consumeRecord(recordOne);"),
    control(
      "prototype escape",
      "Object.setPrototypeOf(normalizedOutput, recordOne);"
    ),
    control("default escape", "defaultGraph.set('gateway', recordOne);"),
    control("permit escape", "permitGraph.set('permit', recordOne);")
  ];
}

interface DispatcherTransferControl {
  readonly name: string;
  readonly sources: readonly SourceRecord[];
  readonly violations: readonly string[];
}

interface Task14GatewayConstructorAnalysis {
  readonly importSources: readonly string[];
  readonly callSources: readonly string[];
  readonly violations: readonly string[];
}

interface Task14GatewayConstructorControl {
  readonly name: string;
  readonly sources: readonly SourceRecord[];
  readonly expected: Task14GatewayConstructorAnalysis;
}

function task14GatewayConstructorControls():
  readonly Task14GatewayConstructorControl[] {
  const mountedStorePath =
    "packages/local-runtime/src/mounted-wake-lifecycle-store.ts";
  const wakeRuntimePath =
    "packages/local-runtime/src/wake-supervisor-runtime.ts";
  const exact = [
    "import { createResidentLoopToolGateway } from " +
      "'../../agent/src/resident-loop-tool-gateway.js';",
    "function bindMountedResidentLoopAuthorityForFactory() {",
    "  createResidentLoopToolGateway(input);",
    "}"
  ].join("\n");
  const unsafe = (
    name: string,
    sourcePath: string,
    lines: readonly string[]
  ): Task14GatewayConstructorControl => ({
    name,
    sources: [sourceRecordFromText(sourcePath, lines.join("\n"))],
    expected: {
      importSources: [sourcePath],
      callSources: [],
      violations: [`${sourcePath}: alternate gateway constructor transfer`]
    }
  });
  return [
    {
      name: "exact mounted-store gateway constructor ownership",
      sources: [sourceRecordFromText(mountedStorePath, exact)],
      expected: {
        importSources: [mountedStorePath],
        callSources: [mountedStorePath],
        violations: []
      }
    },
    unsafe(
      "wake-runtime gateway constructor ownership",
      wakeRuntimePath,
      [
        "import { createResidentLoopToolGateway } from " +
          "'../../agent/src/resident-loop-tool-gateway.js';",
        "createResidentLoopToolGateway(input);"
      ]
    ),
    unsafe(
      "aliased mounted-store gateway constructor",
      mountedStorePath,
      [
        "import { createResidentLoopToolGateway as createGateway } from " +
          "'../../agent/src/resident-loop-tool-gateway.js';",
        "createGateway(input);"
      ]
    ),
    unsafe(
      "captured mounted-store gateway constructor",
      mountedStorePath,
      [
        "import { createResidentLoopToolGateway } from " +
          "'../../agent/src/resident-loop-tool-gateway.js';",
        "const createGateway = createResidentLoopToolGateway;",
        "createGateway(input);"
      ]
    ),
    unsafe(
      "wrapped mounted-store gateway constructor",
      mountedStorePath,
      [
        "import { createResidentLoopToolGateway } from " +
          "'../../agent/src/resident-loop-tool-gateway.js';",
        "const createGateway = (input: unknown) => " +
          "createResidentLoopToolGateway(input);",
        "createGateway(input);"
      ]
    ),
    unsafe(
      "stored mounted-store gateway constructor",
      mountedStorePath,
      [
        "import { createResidentLoopToolGateway } from " +
          "'../../agent/src/resident-loop-tool-gateway.js';",
        "holder.createGateway = createResidentLoopToolGateway;",
        "holder.createGateway(input);"
      ]
    ),
    unsafe(
      "returned mounted-store gateway constructor",
      mountedStorePath,
      [
        "import { createResidentLoopToolGateway } from " +
          "'../../agent/src/resident-loop-tool-gateway.js';",
        "function expose() { return createResidentLoopToolGateway; }",
        "expose()(input);"
      ]
    ),
    unsafe(
      "exported mounted-store gateway constructor",
      mountedStorePath,
      [
        "import { createResidentLoopToolGateway } from " +
          "'../../agent/src/resident-loop-tool-gateway.js';",
        "export { createResidentLoopToolGateway };",
        "createResidentLoopToolGateway(input);"
      ]
    ),
    unsafe(
      "duplicated mounted-store gateway constructor",
      mountedStorePath,
      [
        "import { createResidentLoopToolGateway } from " +
          "'../../agent/src/resident-loop-tool-gateway.js';",
        "createResidentLoopToolGateway(input);",
        "createResidentLoopToolGateway(input);"
      ]
    )
  ];
}

function dispatcherTransferControls(): readonly DispatcherTransferControl[] {
  const task14Path =
    "packages/local-runtime/src/mounted-wake-lifecycle-store.ts";
  const exactTask14 = sourceRecordFromText(task14Path, [
    "import dispatcherDefault from " +
      "'../../agent/src/domain-execution-dispatcher.js';",
    "function bindMountedResidentLoopAuthorityForFactory() {",
    "  dispatcherDefault.bindPackageOwnedResidentDomainExecutionPort(binding);",
    "}"
  ].join("\n"));
  const splitLegacy = [
    "accepted-graph-review",
    "destructive-repair",
    "export-report",
    "legacy-staging",
    "prr-correspondence"
  ].map((name) => sourceRecordFromText(
    `packages/agent/src/adapters/${name}.ts`,
    [
      "import type { AgentDomainExecutionAdapter } " +
        "from '../domain-execution-dispatcher.js';",
      "import { agentDomainExecutionFailure } " +
        "from '../domain-execution-dispatcher.js';",
      "void agentDomainExecutionFailure;",
      "type Adapter = AgentDomainExecutionAdapter<unknown>;",
      "export type { Adapter };"
    ].join("\n")
  ));
  const combinedLegacy = sourceRecordFromText(
    "packages/agent/src/adapters/provider-byte-transfer.ts",
    [
      "import { agentDomainExecutionFailure,",
      "  type AgentDomainExecutionAdapter",
      "} from '../domain-execution-dispatcher.js';",
      "void agentDomainExecutionFailure;",
      "type Adapter = AgentDomainExecutionAdapter<unknown>;",
      "export type { Adapter };"
    ].join("\n")
  );
  const safeStar = sourceRecordFromText(
    "packages/agent/src/index.ts",
    "export * from './domain-execution-dispatcher.js';"
  );
  const unsafe = (
    name: string,
    sourcePath: string,
    text: string
  ): DispatcherTransferControl => ({
    name,
    sources: [
      exactTask14,
      sourceRecordFromText(sourcePath, text)
    ],
    violations: [`${sourcePath}: alternate dispatcher transfer`]
  });
  const unsafeTask14Identity = (
    name: string,
    extra: string
  ): DispatcherTransferControl => ({
    name,
    sources: [
      sourceRecordFromText(task14Path, [
        "import dispatcherDefault from " +
          "'../../agent/src/domain-execution-dispatcher.js';",
        "function bindMountedResidentLoopAuthorityForFactory() {",
        "  dispatcherDefault.bindPackageOwnedResidentDomainExecutionPort(binding);",
        "}",
        extra
      ].join("\n"))
    ],
    violations: [`${task14Path}: alternate dispatcher transfer`]
  });
  const unsafeTask14Call = (
    name: string,
    body: readonly string[]
  ): DispatcherTransferControl => ({
    name,
    sources: [
      sourceRecordFromText(task14Path, [
        "import dispatcherDefault from " +
          "'../../agent/src/domain-execution-dispatcher.js';",
        ...body
      ].join("\n"))
    ],
    violations: [`${task14Path}: alternate dispatcher transfer`]
  });
  return [
    {
      name: "exact Task14 dispatcher default and legacy non-default transfers",
      sources: [exactTask14, ...splitLegacy, combinedLegacy, safeStar],
      violations: []
    },
    unsafe(
      "additional default import",
      "unsafe-dispatcher-default.ts",
      "import alternate from './domain-execution-dispatcher.js'; void alternate;"
    ),
    {
      name: "duplicate Task14 default import",
      sources: [
        sourceRecordFromText(task14Path, [
          "import first from " +
            "'../../agent/src/domain-execution-dispatcher.js';",
          "import second from " +
            "'../../agent/src/domain-execution-dispatcher.js';",
          "function bindMountedResidentLoopAuthorityForFactory() {",
          "  first.bindPackageOwnedResidentDomainExecutionPort(binding);",
          "}",
          "void second;"
        ].join("\n"))
      ],
      violations: [`${task14Path}: alternate dispatcher transfer`]
    },
    unsafeTask14Call("Task14 dispatcher zero-argument call", [
      "function bindMountedResidentLoopAuthorityForFactory() {",
      "  dispatcherDefault.bindPackageOwnedResidentDomainExecutionPort();",
      "}"
    ]),
    unsafeTask14Call("Task14 dispatcher two-argument call", [
      "function bindMountedResidentLoopAuthorityForFactory() {",
      "  dispatcherDefault.bindPackageOwnedResidentDomainExecutionPort(",
      "    firstBinding, secondBinding",
      "  );",
      "}"
    ]),
    unsafeTask14Call("Task14 dispatcher spread-argument call", [
      "function bindMountedResidentLoopAuthorityForFactory() {",
      "  dispatcherDefault.bindPackageOwnedResidentDomainExecutionPort(",
      "    ...bindings",
      "  );",
      "}"
    ]),
    unsafeTask14Call("Task14 dispatcher optional-property call", [
      "function bindMountedResidentLoopAuthorityForFactory() {",
      "  dispatcherDefault?.bindPackageOwnedResidentDomainExecutionPort(",
      "    binding",
      "  );",
      "}"
    ]),
    unsafeTask14Call("Task14 dispatcher optional call", [
      "function bindMountedResidentLoopAuthorityForFactory() {",
      "  dispatcherDefault.bindPackageOwnedResidentDomainExecutionPort?.(",
      "    binding",
      "  );",
      "}"
    ]),
    unsafeTask14Call("Task14 dispatcher out-of-binder call", [
      "function bindMountedResidentLoopAuthorityForFactory() {}",
      "dispatcherDefault.bindPackageOwnedResidentDomainExecutionPort(binding);"
    ]),
    unsafeTask14Identity(
      "Task14 dispatcher default export escape",
      "export default dispatcherDefault;"
    ),
    unsafeTask14Identity(
      "Task14 dispatcher local export escape",
      "export { dispatcherDefault };"
    ),
    unsafeTask14Identity(
      "Task14 dispatcher aliased re-export escape",
      "export { dispatcherDefault as default };"
    ),
    unsafeTask14Identity(
      "Task14 dispatcher alias escape",
      "const alias = dispatcherDefault; void alias;"
    ),
    unsafeTask14Identity(
      "Task14 dispatcher destructuring escape",
      "const { bindPackageOwnedResidentDomainExecutionPort: bind } = " +
        "dispatcherDefault; void bind;"
    ),
    unsafeTask14Identity(
      "Task14 dispatcher other-property escape",
      "void dispatcherDefault.otherOperation;"
    ),
    unsafeTask14Identity(
      "Task14 dispatcher other-call escape",
      "dispatcherDefault.otherOperation();"
    ),
    unsafeTask14Identity(
      "Task14 dispatcher return escape",
      "function exposeDispatcher() { return dispatcherDefault; }"
    ),
    unsafeTask14Identity(
      "Task14 dispatcher yield escape",
      "function* exposeDispatcher() { yield dispatcherDefault; }"
    ),
    unsafeTask14Identity(
      "Task14 dispatcher capture escape",
      "const exposeDispatcher = () => dispatcherDefault;"
    ),
    unsafeTask14Identity(
      "Task14 dispatcher store escape",
      "holder.dispatcher = dispatcherDefault;"
    ),
    unsafeTask14Identity(
      "Task14 dispatcher pass escape",
      "consumeDispatcher(dispatcherDefault);"
    ),
    unsafeTask14Identity(
      "Task14 dispatcher outward-assignment escape",
      "outwardDispatcher = dispatcherDefault;"
    ),
    unsafeTask14Identity(
      "Task14 dispatcher miscellaneous-use escape",
      "void dispatcherDefault;"
    ),
    unsafe(
      "named default import",
      "unsafe-dispatcher-named-default.ts",
      "import { default as alternate } from " +
        "'./domain-execution-dispatcher.js'; void alternate;"
    ),
    unsafe(
      "namespace import",
      "unsafe-dispatcher-namespace.ts",
      "import * as dispatcher from './domain-execution-dispatcher.js'; " +
        "void dispatcher;"
    ),
    unsafe(
      "protected named import",
      "unsafe-dispatcher-named.ts",
      "import { createPackageOwnedResidentDomainExecutionCapability } " +
        "from './domain-execution-dispatcher.js';"
    ),
    unsafe(
      "default plus named import",
      "unsafe-dispatcher-combined.ts",
      "import alternate, { agentDomainExecutionFailure } " +
        "from './domain-execution-dispatcher.js';"
    ),
    unsafe(
      "type-only default import",
      "unsafe-dispatcher-type-default.ts",
      "import type alternate from './domain-execution-dispatcher.js';"
    ),
    unsafe(
      "side-effect import",
      "unsafe-dispatcher-side-effect.ts",
      "import './domain-execution-dispatcher.js';"
    ),
    unsafe(
      "import-equals transfer",
      "unsafe-dispatcher-import-equals.ts",
      "import alternate = require('./domain-execution-dispatcher.js');"
    ),
    unsafe(
      "default re-export",
      "unsafe-dispatcher-default-export.ts",
      "export { default } from './domain-execution-dispatcher.js';"
    ),
    unsafe(
      "aliased default re-export",
      "unsafe-dispatcher-aliased-default-export.ts",
      "export { default as residentDispatcher } " +
        "from './domain-execution-dispatcher.js';"
    ),
    unsafe(
      "protected named re-export",
      "unsafe-dispatcher-named-export.ts",
      "export { bindPackageOwnedResidentDomainExecutionPort } " +
        "from './domain-execution-dispatcher.js';"
    ),
    unsafe(
      "namespace re-export",
      "unsafe-dispatcher-namespace-export.ts",
      "export * as residentDispatcher " +
        "from './domain-execution-dispatcher.js';"
    ),
    unsafe(
      "alternate star re-export",
      "unsafe-dispatcher-star-export.ts",
      "export * from './domain-execution-dispatcher.js';"
    )
  ];
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

interface GatewayDefaultLexicalProvenance {
  readonly hasViolation: boolean;
  readonly resolves: (expression: ts.Expression | undefined) => boolean;
  readonly isRootBinding: (identifier: ts.Identifier) => boolean;
  readonly sameBinding: (
    left: ts.Identifier,
    right: ts.Identifier
  ) => boolean;
  readonly isUniqueDeclaration: (
    identifier: ts.Identifier,
    declaration: ts.Declaration
  ) => boolean;
}

function gatewayDefaultLexicalProvenance(
  record: SourceRecord
): GatewayDefaultLexicalProvenance {
  const { sourceFile } = record;
  const rootNames = sourceFile.statements.flatMap((statement) => {
    if (
      !ts.isImportDeclaration(statement) ||
      statement.importClause?.name === undefined ||
      statement.importClause.isTypeOnly ||
      statement.importClause.namedBindings !== undefined ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      (
        statement.moduleSpecifier.text !==
          "./resident-loop-tool-gateway.js" &&
        !statement.moduleSpecifier.text.endsWith(
          "/resident-loop-tool-gateway.js"
        )
      )
    ) {
      return [];
    }
    return [statement.importClause.name];
  });
  if (rootNames.length === 0) {
    return {
      hasViolation: false,
      resolves: () => false,
      isRootBinding: () => false,
      sameBinding: () => false,
      isUniqueDeclaration: () => false
    };
  }

  const checker = localLexicalTypeChecker(sourceFile);
  const trackedSymbols = new Set<ts.Symbol>();
  const rootSymbols = new Set<ts.Symbol>();
  const rootDeclarations = new Set<ts.Identifier>();
  let hasViolation = false;
  for (const rootName of rootNames) {
    const symbol = checker.getSymbolAtLocation(rootName);
    if (symbol === undefined) {
      hasViolation = true;
      continue;
    }
    trackedSymbols.add(symbol);
    rootSymbols.add(symbol);
    rootDeclarations.add(rootName);
  }

  const provenance: GatewayDefaultLexicalProvenance = {
    get hasViolation() {
      return hasViolation;
    },
    resolves: (expression) => {
      if (expression === undefined) {
        return false;
      }
      const value = unwrapStaticExpression(expression);
      return ts.isIdentifier(value) &&
        symbolIsTracked(value);
    },
    isRootBinding: (identifier) => {
      const symbol = checker.getSymbolAtLocation(identifier);
      return rootNames.length === 1 &&
        rootSymbols.size === 1 &&
        symbol !== undefined &&
        rootSymbols.has(symbol);
    },
    sameBinding: (left, right) => {
      const leftSymbol = checker.getSymbolAtLocation(left);
      const rightSymbol = checker.getSymbolAtLocation(right);
      return leftSymbol !== undefined && leftSymbol === rightSymbol;
    },
    isUniqueDeclaration: (identifier, declaration) => {
      const symbol = checker.getSymbolAtLocation(identifier);
      return symbol?.declarations?.length === 1 &&
        symbol.declarations[0] === declaration;
    }
  };
  const aliasDeclarations = new Set<ts.Identifier>();
  const aliasInitializers = new Set<ts.Identifier>();
  let changed = true;
  while (changed) {
    changed = false;
    visitAliasCandidates(sourceFile);
  }

  visitReferences(sourceFile);
  return provenance;

  function visitAliasCandidates(node: ts.Node): void {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined &&
      ts.isIdentifier(node.initializer) &&
      isDirectConstDeclaration(node)
    ) {
      const initializerSymbol =
        checker.getSymbolAtLocation(node.initializer);
      const aliasSymbol = checker.getSymbolAtLocation(node.name);
      const initializerDeclaration = initializerSymbol?.valueDeclaration ??
        initializerSymbol?.declarations?.[0];
      if (
        initializerSymbol !== undefined &&
        trackedSymbols.has(initializerSymbol) &&
        initializerDeclaration !== undefined &&
        sameFunctionBoundary(node, initializerDeclaration) &&
        aliasSymbol !== undefined &&
        aliasSymbol.declarations?.length === 1 &&
        aliasSymbol.declarations[0] === node &&
        !trackedSymbols.has(aliasSymbol)
      ) {
        trackedSymbols.add(aliasSymbol);
        aliasDeclarations.add(node.name);
        aliasInitializers.add(node.initializer);
        changed = true;
      }
    }
    ts.forEachChild(node, visitAliasCandidates);
  }

  function visitReferences(node: ts.Node): void {
    if (ts.isIdentifier(node) && symbolIsTracked(node)) {
      if (
        !rootDeclarations.has(node) &&
        !aliasDeclarations.has(node) &&
        !aliasInitializers.has(node) &&
        !isExactDispatcherGatewayReference(
          node,
          record,
          provenance
        )
      ) {
        hasViolation = true;
      }
    }
    ts.forEachChild(node, visitReferences);
  }

  function symbolIsTracked(identifier: ts.Identifier): boolean {
    const symbol = checker.getSymbolAtLocation(identifier);
    return symbol !== undefined && trackedSymbols.has(symbol);
  }
}

function localLexicalTypeChecker(
  sourceFile: ts.SourceFile
): ts.TypeChecker {
  const options: ts.CompilerOptions = {
    noLib: true,
    noResolve: true,
    target: ts.ScriptTarget.Latest,
    module: ts.ModuleKind.ESNext
  };
  const host = ts.createCompilerHost(options, true);
  host.fileExists = (fileName) => fileName === sourceFile.fileName;
  host.readFile = (fileName) =>
    fileName === sourceFile.fileName ? sourceFile.text : undefined;
  host.getSourceFile = (fileName) =>
    fileName === sourceFile.fileName ? sourceFile : undefined;
  host.getDefaultLibFileName = () => "";
  host.getCurrentDirectory = () => "";
  host.writeFile = () => undefined;
  const program = ts.createProgram({
    rootNames: [sourceFile.fileName],
    options,
    host
  });
  return program.getTypeChecker();
}

function isDirectConstDeclaration(
  declaration: ts.VariableDeclaration
): boolean {
  return ts.isVariableDeclarationList(declaration.parent) &&
    (declaration.parent.flags & ts.NodeFlags.Const) !== 0;
}

function sameFunctionBoundary(
  left: ts.Node,
  right: ts.Node
): boolean {
  return nearestFunctionBoundary(left) === nearestFunctionBoundary(right);
}

function nearestFunctionBoundary(node: ts.Node): ts.Node {
  let current: ts.Node | undefined = node.parent;
  while (current !== undefined && !ts.isSourceFile(current)) {
    if (ts.isFunctionLike(current)) {
      return current;
    }
    current = current.parent;
  }
  return current ?? node.getSourceFile();
}

function isExactDispatcherGatewayReference(
  node: ts.Identifier,
  record: SourceRecord,
  provenance: GatewayDefaultLexicalProvenance
): boolean {
  const access = node.parent;
  return (
    ts.isPropertyAccessExpression(access) ||
    ts.isElementAccessExpression(access)
  ) &&
    access.expression === node &&
    isExactDispatcherGatewayAccess(access, record, provenance);
}

function isGatewayDefaultBindingPatternSource(
  node: ts.Node,
  provenance: GatewayDefaultLexicalProvenance
): boolean {
  if (
    ts.isVariableDeclaration(node) &&
    isBindingPattern(node.name)
  ) {
    const loop = ts.isVariableDeclarationList(node.parent) &&
      node.parent.declarations.length === 1 &&
      node.parent.declarations[0] === node &&
      (
        ts.isForInStatement(node.parent.parent) ||
        ts.isForOfStatement(node.parent.parent)
      )
      ? node.parent.parent
      : undefined;
    return provenance.resolves(node.initializer ?? loop?.expression);
  }
  if (
    ts.isParameter(node) &&
    isBindingPattern(node.name) &&
    provenance.resolves(node.initializer)
  ) {
    return true;
  }
  return ts.isBindingElement(node) &&
    node.initializer !== undefined &&
    provenance.resolves(node.initializer);
}

function isBindingPattern(
  node: ts.BindingName
): node is ts.ObjectBindingPattern | ts.ArrayBindingPattern {
  return ts.isObjectBindingPattern(node) || ts.isArrayBindingPattern(node);
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
  const declaration = uniqueLocalConstDeclaration(sourceFile, receiver);
  if (declaration?.initializer === undefined) {
    return false;
  }
  const initializer = unwrapStaticExpression(declaration.initializer);
  const exactFresh = ts.isCallExpression(initializer) &&
    ts.isPropertyAccessExpression(initializer.expression) &&
    ts.isIdentifier(initializer.expression.expression) &&
    initializer.expression.expression.text === "Object" &&
    initializer.expression.name.text === "create" &&
    initializer.arguments.length === 1 &&
    initializer.arguments[0]!.kind === ts.SyntaxKind.NullKeyword &&
    (
      hasOnlyLocalNormalizationReferences(declaration, sourceFile) ||
      isClosedModuleNormalizationRecord(declaration, sourceFile)
    );
  return exactFresh;
}

function closedDataRecordNormalizationAnalysis(
  record: SourceRecord
): {
  readonly writes: number;
  readonly violations: readonly string[];
} {
  let writes = 0;
  const violations: string[] = [];
  visit(record.sourceFile);
  return { writes, violations };

  function visit(node: ts.Node): void {
    if (
      ts.isElementAccessExpression(node) &&
      isWriteSemanticCarrier(node) &&
      ts.isIdentifier(unwrapStaticExpression(node.expression))
    ) {
      const receiver = unwrapStaticExpression(node.expression) as ts.Identifier;
      const declaration = uniqueLocalConstDeclaration(
        record.sourceFile,
        receiver
      );
      const helper = declaration === undefined
        ? undefined
        : enclosingFunctionLike(declaration);
      if (
        helper !== undefined &&
        ts.isFunctionDeclaration(helper) &&
        helper.name?.text === "dataRecord"
      ) {
        writes += 1;
        if (!isFreshNullPrototypeRecordWrite(node, record.sourceFile)) {
          violations.push(`${record.sourcePath}: open normalization graph`);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
}

function hasOnlyLocalNormalizationReferences(
  declaration: ts.VariableDeclaration,
  sourceFile: ts.SourceFile
): boolean {
  if (!ts.isIdentifier(declaration.name)) {
    return false;
  }
  const localName = declaration.name.text;
  const scope = lexicalScope(declaration);
  const localDeclarations = identifierReferences(
    sourceFile,
    localName
  ).filter((reference) =>
    semanticTs.isDeclarationName(reference) &&
    lexicalScope(reference) === scope
  );
  if (
    localDeclarations.length !== 1 ||
    localDeclarations[0] !== declaration.name
  ) {
    return false;
  }
  return identifierReferences(sourceFile, localName)
    .every((reference) => {
      const referenceScope = lexicalScope(reference);
      if (
        referenceScope !== scope &&
        (
          !scopeContains(scope, referenceScope) ||
          scopeChainDeclaresName(
            referenceScope,
            scope,
            localName
          )
        )
      ) {
        return true;
      }
      if (
        reference === declaration.name ||
        isNonReferencePropertyName(reference)
      ) {
        return true;
      }
      if (referenceScope !== scope) {
        return false;
      }
      if (
        (
          ts.isElementAccessExpression(reference.parent) ||
          ts.isPropertyAccessExpression(reference.parent)
        ) &&
        reference.parent.expression === reference &&
        !(
          ts.isCallExpression(reference.parent.parent) &&
          reference.parent.parent.expression === reference.parent
        )
      ) {
        return true;
      }
      return isAdmittedNormalizationInspection(reference);
    });
}

function uniqueLocalConstDeclaration(
  sourceFile: ts.SourceFile,
  reference: ts.Identifier
): ts.VariableDeclaration | undefined {
  const scope = lexicalScope(reference);
  const declarations = identifierReferences(sourceFile, reference.text)
    .filter((candidate) =>
      semanticTs.isDeclarationName(candidate) &&
      lexicalScope(candidate) === scope
    );
  if (declarations.length !== 1) {
    return undefined;
  }
  const declaration = declarations[0]!.parent;
  return ts.isVariableDeclaration(declaration) &&
    declaration.name === declarations[0] &&
    ts.isVariableDeclarationList(declaration.parent) &&
    (declaration.parent.flags & ts.NodeFlags.Const) !== 0
    ? declaration
    : undefined;
}

function lexicalScope(node: ts.Node): ts.Node {
  return enclosingFunctionLike(node) ?? node.getSourceFile();
}

function scopeContains(outer: ts.Node, inner: ts.Node): boolean {
  for (
    let current: ts.Node | undefined = inner;
    current !== undefined;
    current = current.parent
  ) {
    if (current === outer) {
      return true;
    }
  }
  return false;
}

function scopeChainDeclaresName(
  inner: ts.Node,
  outer: ts.Node,
  name: string
): boolean {
  let current: ts.Node | undefined = inner;
  while (current !== undefined && current !== outer) {
    if (
      identifierReferences(current.getSourceFile(), name).some((candidate) =>
        semanticTs.isDeclarationName(candidate) &&
        lexicalScope(candidate) === current
      )
    ) {
      return true;
    }
    const parent = current.parent;
    if (parent === undefined) {
      break;
    }
    current = enclosingFunctionLike(parent);
    if (current === undefined && ts.isSourceFile(outer)) {
      current = outer;
    }
  }
  return false;
}

function isAdmittedNormalizationInspection(
  reference: ts.Identifier
): boolean {
  const call = reference.parent;
  if (
    !ts.isCallExpression(call) ||
    call.arguments[0] !== reference ||
    !ts.isPropertyAccessExpression(call.expression) ||
    !ts.isIdentifier(call.expression.expression)
  ) {
    return false;
  }
  return (
    call.expression.expression.text === "Reflect" &&
    call.expression.name.text === "ownKeys"
  ) || (
    call.expression.expression.text === "Object" &&
    [
      "entries",
      "getOwnPropertyDescriptors",
      "getOwnPropertyNames",
      "getOwnPropertySymbols",
      "keys",
      "values"
    ].includes(call.expression.name.text)
  );
}

function isClosedModuleNormalizationRecord(
  declaration: ts.VariableDeclaration,
  sourceFile: ts.SourceFile
): boolean {
  if (
    !ts.isIdentifier(declaration.name) ||
    declaration.name.text !== "record"
  ) {
    return false;
  }
  const helper = enclosingFunctionLike(declaration);
  if (
    helper === undefined ||
    !ts.isFunctionDeclaration(helper) ||
    helper.name?.text !== "dataRecord" ||
    helper.body === undefined ||
    !hasExactDataRecordDiscipline(helper, declaration, sourceFile)
  ) {
    return false;
  }
  const helperReferences = identifierReferences(sourceFile, "dataRecord")
    .filter((reference) => !isNonReferencePropertyName(reference));
  const calls: ts.CallExpression[] = [];
  for (const reference of helperReferences) {
    if (reference === helper.name) {
      continue;
    }
    if (
      !ts.isCallExpression(reference.parent) ||
      reference.parent.expression !== reference
    ) {
      return false;
    }
    calls.push(reference.parent);
  }
  return calls.length === 4 &&
    calls.every((call) => isClosedNormalizationCallSite(call, sourceFile));
}

function hasExactDataRecordDiscipline(
  helper: ts.FunctionDeclaration,
  declaration: ts.VariableDeclaration,
  sourceFile: ts.SourceFile
): boolean {
  if (
    helper.parameters.length !== 2 ||
    !ts.isIdentifier(helper.parameters[0]!.name) ||
    helper.parameters[0]!.name.text !== "value" ||
    !ts.isIdentifier(helper.parameters[1]!.name) ||
    helper.parameters[1]!.name.text !== "label"
  ) {
    return false;
  }
  const references = identifierReferences(
    helper.getSourceFile(),
    (declaration.name as ts.Identifier).text
  ).filter((reference) =>
    enclosingFunctionLike(reference) === helper &&
    !isNonReferencePropertyName(reference)
  );
  const returns = references.filter((reference) =>
    ts.isReturnStatement(reference.parent) &&
    reference.parent.expression === reference
  );
  const writes = references.filter((reference) =>
    ts.isElementAccessExpression(reference.parent) &&
    reference.parent.expression === reference &&
    isWriteSemanticCarrier(reference.parent)
  );
  if (
    references.length !== 3 ||
    references[0] !== declaration.name ||
    returns.length !== 1 ||
    writes.length !== 1
  ) {
    return false;
  }
  const body = helper.body!.getText(sourceFile);
  return /\bvalue\s*===\s*null\b/.test(body) &&
    /typeof\s+value\s*!==\s*["']object["']/.test(body) &&
    /Array\.isArray\s*\(\s*value\s*\)/.test(body) &&
    /Object\.getPrototypeOf\s*\(\s*value\s*\)\s*!==\s*Object\.prototype/.test(body) &&
    /Object\.getOwnPropertySymbols\s*\(\s*value\s*\)\.length\s*>\s*0/.test(body) &&
    /\bisProxy\s*\(\s*value\s*\)/.test(body) &&
    /Object\.getOwnPropertyNames\s*\(\s*value\s*\)\.sort\s*\(\s*\)/.test(body) &&
    /Object\.getOwnPropertyDescriptor\s*\(\s*value\s*,\s*key\s*\)/.test(body) &&
    /\bunsafeKeys\.has\s*\(\s*key\s*\)/.test(body) &&
    /!\s*\(\s*["']value["']\s+in\s+descriptor\s*\)/.test(body) &&
    /!\s*descriptor\.enumerable/.test(body) &&
    /\brecord\s*\[\s*key\s*\]\s*=\s*descriptor\.value/.test(body);
}

function isClosedNormalizationCallSite(
  call: ts.CallExpression,
  sourceFile: ts.SourceFile
): boolean {
  const declaration = call.parent;
  if (
    !ts.isVariableDeclaration(declaration) ||
    declaration.initializer !== call ||
    !ts.isIdentifier(declaration.name) ||
    !ts.isVariableDeclarationList(declaration.parent) ||
    (declaration.parent.flags & ts.NodeFlags.Const) === 0
  ) {
    return false;
  }
  const localName = declaration.name.text;
  const scope = enclosingFunctionLike(declaration);
  const outer = outermostFunctionDeclaration(scope);
  if (
    scope === undefined ||
    outer === undefined ||
    outer.name === undefined ||
    !outer.name.text.startsWith("copy") ||
    outer.modifiers?.some((modifier) =>
      modifier.kind === ts.SyntaxKind.ExportKeyword ||
      modifier.kind === ts.SyntaxKind.DefaultKeyword
    ) ||
    !containsObjectFreezeCall(scope)
  ) {
    return false;
  }
  const references = identifierReferences(sourceFile, localName)
    .filter((reference) =>
      referenceBelongsToScope(
        reference,
        scope,
        localName
      ) &&
      !isNonReferencePropertyName(reference)
    );
  const declarations = references.filter((reference) =>
    semanticTs.isDeclarationName(reference)
  );
  return declarations.length === 1 &&
    declarations[0] === declaration.name &&
    references.every((reference) => {
      if (reference === declaration.name) {
        return true;
      }
      if (
        (
          ts.isPropertyAccessExpression(reference.parent) ||
          ts.isElementAccessExpression(reference.parent)
        ) &&
        reference.parent.expression === reference &&
        !isWriteSemanticCarrier(reference.parent) &&
        isAdmittedClosedNormalizationRead(reference.parent)
      ) {
        return true;
      }
      return ts.isCallExpression(reference.parent) &&
        reference.parent.arguments[0] === reference &&
        ts.isIdentifier(reference.parent.expression) &&
        reference.parent.expression.text === "rejectUnknown";
    });
}

function isAdmittedClosedNormalizationRead(
  access: ts.PropertyAccessExpression | ts.ElementAccessExpression
): boolean {
  for (
    let current: ts.Node | undefined = access;
    current !== undefined && !ts.isStatement(current);
    current = current.parent
  ) {
    if (ts.isCallExpression(current)) {
      if (
        ts.isIdentifier(current.expression) &&
        [
          "copyReadModelChanges",
          "copyStringArray",
          "dataRecord",
          "safeString"
        ].includes(current.expression.text)
      ) {
        return true;
      }
      if (
        ts.isPropertyAccessExpression(current.expression) &&
        ts.isIdentifier(current.expression.expression) &&
        current.expression.expression.text === "Object" &&
        current.expression.name.text === "freeze"
      ) {
        return true;
      }
    }
    if (
      ts.isBinaryExpression(current) &&
      (
        current.operatorToken.kind ===
          ts.SyntaxKind.EqualsEqualsEqualsToken ||
        current.operatorToken.kind ===
          ts.SyntaxKind.ExclamationEqualsEqualsToken
      ) &&
      (
        ts.isIdentifier(current.left) &&
        current.left.text === "undefined" ||
        ts.isIdentifier(current.right) &&
        current.right.text === "undefined"
      )
    ) {
      return true;
    }
  }
  return false;
}

function referenceBelongsToScope(
  reference: ts.Identifier,
  scope: ts.Node,
  name: string
): boolean {
  const referenceScope = lexicalScope(reference);
  return referenceScope === scope || (
    scopeContains(scope, referenceScope) &&
    !scopeChainDeclaresName(referenceScope, scope, name)
  );
}

function enclosingFunctionLike(
  node: ts.Node
): ts.FunctionLikeDeclaration | undefined {
  for (
    let current: ts.Node | undefined = node.parent;
    current !== undefined;
    current = current.parent
  ) {
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isFunctionExpression(current) ||
      ts.isArrowFunction(current) ||
      ts.isMethodDeclaration(current) ||
      ts.isGetAccessorDeclaration(current) ||
      ts.isSetAccessorDeclaration(current) ||
      ts.isConstructorDeclaration(current)
    ) {
      return current;
    }
  }
  return undefined;
}

function outermostFunctionDeclaration(
  node: ts.Node | undefined
): ts.FunctionDeclaration | undefined {
  let result: ts.FunctionDeclaration | undefined;
  for (
    let current = node;
    current !== undefined && !ts.isSourceFile(current);
    current = current.parent
  ) {
    if (ts.isFunctionDeclaration(current)) {
      result = current;
    }
  }
  return result;
}

function containsObjectFreezeCall(node: ts.Node): boolean {
  let found = false;
  visit(node);
  return found;

  function visit(current: ts.Node): void {
    if (
      ts.isCallExpression(current) &&
      ts.isPropertyAccessExpression(current.expression) &&
      ts.isIdentifier(current.expression.expression) &&
      current.expression.expression.text === "Object" &&
      current.expression.name.text === "freeze"
    ) {
      found = true;
      return;
    }
    ts.forEachChild(current, visit);
  }
}

function isNonReferencePropertyName(node: ts.Identifier): boolean {
  const parent = node.parent;
  return (
    ts.isPropertyAccessExpression(parent) &&
    parent.name === node
  ) || (
    (
      ts.isPropertyAssignment(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isMethodSignature(parent)
    ) &&
    parent.name === node &&
    !ts.isComputedPropertyName(parent.name)
  );
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

const releasedDispatcherImportSignatures =
  new Map<string, readonly string[]>([
    [
      "packages/agent/src/adapters/accepted-graph-review.ts",
      [
        "type:type:AgentDomainExecutionAdapter",
        "value:value:agentDomainExecutionFailure"
      ]
    ],
    [
      "packages/agent/src/adapters/destructive-repair.ts",
      [
        "type:type:AgentDomainExecutionAdapter",
        "value:value:agentDomainExecutionFailure"
      ]
    ],
    [
      "packages/agent/src/adapters/export-report.ts",
      [
        "type:type:AgentDomainExecutionAdapter",
        "value:value:agentDomainExecutionFailure"
      ]
    ],
    [
      "packages/agent/src/adapters/legacy-staging.ts",
      [
        "type:type:AgentDomainExecutionAdapter",
        "value:value:agentDomainExecutionFailure"
      ]
    ],
    [
      "packages/agent/src/adapters/provider-byte-transfer.ts",
      [
        "value:type:AgentDomainExecutionAdapter,value:agentDomainExecutionFailure"
      ]
    ],
    [
      "packages/agent/src/adapters/prr-correspondence.ts",
      [
        "type:type:AgentDomainExecutionAdapter",
        "value:value:agentDomainExecutionFailure"
      ]
    ]
  ]);

function task14GatewayConstructorAnalysis(
  sources: readonly SourceRecord[]
): Task14GatewayConstructorAnalysis {
  const mountedStorePath =
    "packages/local-runtime/src/mounted-wake-lifecycle-store.ts";
  const exactModuleSpecifier =
    "../../agent/src/resident-loop-tool-gateway.js";
  const importSources = new Set<string>();
  const callSources = new Set<string>();
  const violations = new Set<string>();

  for (const record of sources) {
    const declarations = record.sourceFile.statements.filter(
      (statement): statement is ts.ImportDeclaration =>
        ts.isImportDeclaration(statement) &&
        ts.isStringLiteral(statement.moduleSpecifier) &&
        (
          statement.moduleSpecifier.text ===
            "./resident-loop-tool-gateway.js" ||
          statement.moduleSpecifier.text.endsWith(
            "/resident-loop-tool-gateway.js"
          )
        ) &&
        statement.importClause?.namedBindings !== undefined &&
        ts.isNamedImports(statement.importClause.namedBindings) &&
        statement.importClause.namedBindings.elements.some((element) =>
          (element.propertyName?.text ?? element.name.text) ===
            "createResidentLoopToolGateway"
        )
    );
    if (declarations.length === 0) {
      continue;
    }
    importSources.add(record.sourcePath);
    const declaration = declarations.length === 1
      ? declarations[0]
      : undefined;
    const bindings = declaration?.importClause?.namedBindings;
    const element = bindings !== undefined &&
      ts.isNamedImports(bindings) &&
      bindings.elements.length === 1
      ? bindings.elements[0]
      : undefined;
    const exactImport =
      record.sourcePath === mountedStorePath &&
      declaration !== undefined &&
      ts.isStringLiteral(declaration.moduleSpecifier) &&
      declaration.moduleSpecifier.text === exactModuleSpecifier &&
      declaration.importClause?.isTypeOnly === false &&
      declaration.importClause.name === undefined &&
      declaration.attributes === undefined &&
      element !== undefined &&
      element.isTypeOnly === false &&
      element.propertyName === undefined &&
      element.name.text === "createResidentLoopToolGateway";
    if (!exactImport || element === undefined) {
      reject(record.sourcePath);
      continue;
    }

    const references = identifierReferences(
      record.sourceFile,
      element.name.text
    ).filter((reference) => !isNonReferencePropertyName(reference));
    const calls = references.filter((reference) =>
      ts.isCallExpression(reference.parent) &&
      reference.parent.expression === reference &&
      reference.parent.questionDotToken === undefined &&
      reference.parent.arguments.length === 1 &&
      !ts.isSpreadElement(reference.parent.arguments[0]!) &&
      isInsideMountedStoreBinder(reference.parent)
    );
    if (
      references.length !== 2 ||
      references.filter((reference) => reference === element.name).length !==
        1 ||
      calls.length !== 1
    ) {
      reject(record.sourcePath);
      continue;
    }
    callSources.add(record.sourcePath);
  }

  return {
    importSources: [...importSources].sort(),
    callSources: [...callSources].sort(),
    violations: [...violations].sort()
  };

  function reject(sourcePath: string): void {
    violations.add(`${sourcePath}: alternate gateway constructor transfer`);
  }

  function isInsideMountedStoreBinder(node: ts.Node): boolean {
    for (
      let current: ts.Node | undefined = node.parent;
      current !== undefined;
      current = current.parent
    ) {
      if (ts.isFunctionDeclaration(current)) {
        return current.name?.text ===
          "bindMountedResidentLoopAuthorityForFactory";
      }
    }
    return false;
  }
}

function dispatcherTransferViolations(
  sources: readonly SourceRecord[]
): readonly string[] {
  const violations = new Set<string>();
  const task14Path =
    "packages/local-runtime/src/mounted-wake-lifecycle-store.ts";
  for (const record of sources) {
    const imports: ts.ImportDeclaration[] = [];
    for (const statement of record.sourceFile.statements) {
      if (
        ts.isImportDeclaration(statement) &&
        ts.isStringLiteral(statement.moduleSpecifier) &&
        isDispatcherModuleSpecifier(statement.moduleSpecifier.text)
      ) {
        imports.push(statement);
      } else if (
        ts.isImportEqualsDeclaration(statement) &&
        ts.isExternalModuleReference(statement.moduleReference) &&
        statement.moduleReference.expression !== undefined &&
        ts.isStringLiteral(statement.moduleReference.expression) &&
        isDispatcherModuleSpecifier(
          statement.moduleReference.expression.text
        )
      ) {
        reject(record.sourcePath);
      } else if (
        ts.isExportDeclaration(statement) &&
        statement.moduleSpecifier !== undefined &&
        ts.isStringLiteral(statement.moduleSpecifier) &&
        isDispatcherModuleSpecifier(statement.moduleSpecifier.text) &&
        !(
          record.sourcePath === "packages/agent/src/index.ts" &&
          statement.moduleSpecifier.text ===
            "./domain-execution-dispatcher.js" &&
          statement.exportClause === undefined &&
          statement.isTypeOnly === false &&
          statement.attributes === undefined
        )
      ) {
        reject(record.sourcePath);
      }
    }

    if (imports.length === 0) {
      continue;
    }
    if (record.sourcePath === task14Path) {
      const declaration = imports.length === 1 ? imports[0] : undefined;
      if (
        declaration === undefined ||
        !isExactTask14DispatcherImport(declaration) ||
        exactTask14BinderCallCount(record) !== 1 ||
        !hasExactTask14DispatcherBindingCensus(record, declaration)
      ) {
        reject(record.sourcePath);
      }
      continue;
    }
    const expected = releasedDispatcherImportSignatures.get(
      record.sourcePath
    );
    const actual = imports.map(dispatcherImportSignature).sort();
    if (
      expected === undefined ||
      actual.length !== expected.length ||
      actual.some((signature, index) => signature !== expected[index])
    ) {
      reject(record.sourcePath);
    }
  }
  return [...violations].sort();

  function reject(sourcePath: string): void {
    violations.add(`${sourcePath}: alternate dispatcher transfer`);
  }
}

function isDispatcherModuleSpecifier(specifier: string): boolean {
  return specifier === "./domain-execution-dispatcher.js" ||
    specifier.endsWith("/domain-execution-dispatcher.js");
}

function isExactTask14DispatcherImport(
  declaration: ts.ImportDeclaration
): boolean {
  return ts.isStringLiteral(declaration.moduleSpecifier) &&
    declaration.moduleSpecifier.text ===
      "../../agent/src/domain-execution-dispatcher.js" &&
    declaration.importClause !== undefined &&
    declaration.importClause.isTypeOnly === false &&
    declaration.importClause.name !== undefined &&
    declaration.importClause.namedBindings === undefined &&
    declaration.attributes === undefined;
}

function exactTask14BinderCallCount(record: SourceRecord): number {
  let count = 0;
  visit(record.sourceFile);
  return count;

  function visit(node: ts.Node): void {
    if (isExactTask14BinderCall(node, record)) {
      count += 1;
    }
    ts.forEachChild(node, visit);
  }
}

function hasExactTask14DispatcherBindingCensus(
  record: SourceRecord,
  declaration: ts.ImportDeclaration
): boolean {
  const local = declaration.importClause?.name;
  if (local === undefined) {
    return false;
  }
  const references = identifierReferences(
    record.sourceFile,
    local.text
  ).filter((reference) => !isNonReferencePropertyName(reference));
  return references.length === 2 &&
    references.filter((reference) => reference === local).length === 1 &&
    references.filter((reference) =>
      ts.isPropertyAccessExpression(reference.parent) &&
      reference.parent.expression === reference &&
      isExactTask14BinderCall(reference.parent.name, record)
    ).length === 1;
}

function dispatcherImportSignature(
  declaration: ts.ImportDeclaration
): string {
  const clause = declaration.importClause;
  if (
    clause === undefined ||
    clause.name !== undefined ||
    clause.namedBindings === undefined ||
    !ts.isNamedImports(clause.namedBindings) ||
    declaration.attributes !== undefined
  ) {
    return "alternate";
  }
  const elements = clause.namedBindings.elements.map((element) => {
    const imported = element.propertyName?.text ?? element.name.text;
    const local = element.name.text === imported
      ? imported
      : `${imported}->${element.name.text}`;
    return `${clause.isTypeOnly || element.isTypeOnly ? "type" : "value"}:${local}`;
  }).sort();
  return `${clause.isTypeOnly ? "type" : "value"}:${elements.join(",")}`;
}

function protectedResidentTransfers(
  sources: readonly SourceRecord[]
): readonly string[] {
  const violations = [...dispatcherTransferViolations(sources)];
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
        if (isDispatcherModuleSpecifier(specifier)) {
          continue;
        }
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
          const plannedMountedStoreNamedConstructor =
            sourcePath ===
              "packages/local-runtime/src/mounted-wake-lifecycle-store.ts" &&
            clause !== undefined &&
            clause?.name === undefined &&
            clause.namedBindings !== undefined &&
            ts.isNamedImports(clause.namedBindings) &&
            clause.namedBindings.elements.length === 1 &&
            clause.namedBindings.elements[0]?.name.text ===
              "createResidentLoopToolGateway";
          if (!exactDispatcherDefault &&
            !plannedMountedStoreNamedConstructor) {
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
        if (
          statement.moduleSpecifier !== undefined &&
          ts.isStringLiteral(statement.moduleSpecifier) &&
          isDispatcherModuleSpecifier(statement.moduleSpecifier.text)
        ) {
          continue;
        }
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
