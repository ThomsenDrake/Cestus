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
  mountedWake: {
    dispatcherDefault: "../../agent/src/domain-execution-dispatcher.js",
    gatewayNamedConstructor: "../../agent/src/resident-loop-tool-gateway.js"
  },
  factoryPorts: {
    compositionReadback: {
      moduleSpecifier: "./resident-loop-factory-composition.js",
      importedName: "ResidentLoopFactoryAuthorityReadback"
    },
    runtimeHandle: {
      moduleSpecifier: "./runtime-factory.js",
      importedName: "LocalRuntimeHandle"
    },
    capabilityBinder: {
      moduleSpecifier: "./wake-supervisor-runtime.js",
      importedName: "bindResidentLoopCapabilitiesForFactory"
    },
    handoffBuilder: {
      moduleSpecifier: "../../agent/src/specialist-handoff-projection.js",
      localName: "createInternalSpecialistHandoffProjectionPort"
    },
    candidateProvider: {
      moduleSpecifier: "../../agent/src/resident-plan-candidate-provider.js",
      importedName: "createResidentPlanCandidateProvider"
    },
    boundedIssuer: {
      moduleSpecifier: "../../agent/src/bounded-agent-loop.js",
      importedName: "createResidentBoundedAgentLoopFromIssuedCapabilities"
    }
  }
} as const);

const exactFactoryValueImports = new Map<string, {
  readonly defaultName?: string;
  readonly namedNames: readonly string[];
}>([
  ["node:net", { namedNames: ["isIP"] }],
  ["node:util", { namedNames: ["types"] }],
  ["../../agent/src/secret-safety.js", {
    namedNames: ["isAgentSecretSafeText"]
  }],
  ["./wake-supervisor-runtime.js", {
    namedNames: ["bindResidentLoopCapabilitiesForFactory"]
  }],
  ["../../agent/src/specialist-handoff-projection.js", {
    defaultName: "createInternalSpecialistHandoffProjectionPort",
    namedNames: []
  }],
  ["../../agent/src/resident-plan-candidate-provider.js", {
    namedNames: ["createResidentPlanCandidateProvider"]
  }],
  ["../../agent/src/bounded-agent-loop.js", {
    namedNames: ["createResidentBoundedAgentLoopFromIssuedCapabilities"]
  }]
]);

const exactFactoryTypeImportModules = new Set([
  "../../agent/src/bounded-agent-loop.js",
  "../../agent/src/domain-execution-dispatcher.js",
  "../../agent/src/specialist-handoff-projection.js",
  "./runtime-factory.js",
  "./resident-loop-factory-composition.js",
  "./resident-loop-provider-posture.js",
  "./wake-supervisor-runtime.js"
]);

describe("resident loop factory ports import policy", () => {
  it("keeps the data-only bridge static, named, cycle-free, and outside mounted-authority producers", () => {
    if (!existsSync(sourcePath)) return;

    const program = createFactoryProgram(sourcePath);
    const source = program.getSourceFile(sourcePath);
    expect(source, "factory source must be part of the local TypeScript program").toBeDefined();
    if (source === undefined) throw new Error("factory source is unavailable");
    expectDataOnlyBridgeIsolation(source, program.getTypeChecker());
  });

  it("enforces the exact dispatcher G W H R static import graph with no runtime activation", () => {
    expectFactoryOracleControls();
    const paths = {
      dispatcher: resolve(process.cwd(), "packages/agent/src/domain-execution-dispatcher.ts"),
      gateway: resolve(process.cwd(), "packages/agent/src/resident-loop-tool-gateway.ts"),
      mountedWake: resolve(process.cwd(), "packages/local-runtime/src/mounted-wake-lifecycle-store.ts"),
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
    const activationAbsolutePaths = activationPaths.map((path) => resolve(process.cwd(), path));

    expect(existsSync(paths.bounded)).toBe(true);
    const sources = Object.fromEntries(
      Object.entries(paths).map(([name, path]) => [name, readFileSync(path, "utf8")])
    ) as Record<keyof typeof paths, string>;
    const parsedSources = Object.fromEntries(
      Object.entries(paths).map(([name, path]) => [
        name,
        ts.createSourceFile(path, sources[name as keyof typeof paths], ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
      ])
    ) as Record<keyof typeof paths, ts.SourceFile>;

    expectDirectDefaultImport(
      parsedSources.dispatcher,
      permittedResidentImports.dispatcher.gatewayDefault
    );
    for (const adapter of permittedResidentImports.dispatcher.adapters) {
      expectDirectImport(parsedSources.dispatcher, adapter);
    }
    expectDirectDefaultImport(
      parsedSources.mountedWake,
      permittedResidentImports.mountedWake.dispatcherDefault
    );
    expectDirectNamedImport(
      parsedSources.mountedWake,
      permittedResidentImports.mountedWake.gatewayNamedConstructor,
      "createResidentLoopToolGateway"
    );

    const program = createFactoryProgram(
      paths.factory,
      paths.agentBarrel,
      ...activationAbsolutePaths
    );
    const factorySource = program.getSourceFile(paths.factory);
    expect(factorySource, "factory source must be part of the local TypeScript program").toBeDefined();
    if (factorySource === undefined) throw new Error("factory source is unavailable");
    const agentBarrelSource = program.getSourceFile(paths.agentBarrel);
    expect(agentBarrelSource, "agent barrel must be part of the local TypeScript program").toBeDefined();
    if (agentBarrelSource === undefined) throw new Error("agent barrel is unavailable");
    const checker = program.getTypeChecker();
    expectExactFactoryModuleGraph(factorySource, checker);
    expectDirectTypeOnlyNamedImport(
      factorySource,
      permittedResidentImports.factoryPorts.compositionReadback.moduleSpecifier,
      permittedResidentImports.factoryPorts.compositionReadback.importedName
    );
    expectDirectTypeOnlyNamedImport(
      factorySource,
      permittedResidentImports.factoryPorts.runtimeHandle.moduleSpecifier,
      permittedResidentImports.factoryPorts.runtimeHandle.importedName
    );
    const binderCall = expectDirectNamedImportAndCall(
      factorySource,
      checker,
      permittedResidentImports.factoryPorts.capabilityBinder.moduleSpecifier,
      permittedResidentImports.factoryPorts.capabilityBinder.importedName
    );
    const handoffCall = expectDirectDefaultImportAndCall(
      factorySource,
      checker,
      permittedResidentImports.factoryPorts.handoffBuilder.moduleSpecifier,
      permittedResidentImports.factoryPorts.handoffBuilder.localName
    );
    const candidateCall = expectDirectNamedImportAndCall(
      factorySource,
      checker,
      permittedResidentImports.factoryPorts.candidateProvider.moduleSpecifier,
      permittedResidentImports.factoryPorts.candidateProvider.importedName
    );
    const issuerCall = expectDirectNamedImportAndCall(
      factorySource,
      checker,
      permittedResidentImports.factoryPorts.boundedIssuer.moduleSpecifier,
      permittedResidentImports.factoryPorts.boundedIssuer.importedName
    );
    const portsCall = expectLocalNamedCall(
      factorySource,
      checker,
      "createResidentLoopFactoryPorts"
    );
    expectExactFactoryCallProvenance(factorySource, checker, {
      binderCall,
      handoffCall,
      candidateCall,
      issuerCall,
      portsCall
    });
    expectNoHandoffReachThrough(factorySource, checker);
    expectNoGenericWakeConstructor(factorySource);
    expectNoForbiddenFactoryHeuristics(factorySource);
    expectNoForbiddenFactoryHeuristics(parsedSources.bounded);
    expectExactBoundedHRead(parsedSources.bounded);

    expectNoModuleEdge(
      parsedSources.bounded,
      /local-runtime|wake-supervisor-runtime|resident-loop-factory-ports/
    );
    expectNoModuleEdge(
      parsedSources.bounded,
      /(?:^|\/)(?:fs|path|child_process|http|https|net|tls|dgram)(?:\/|\.|$)|provider|route|runtime-factory/
    );
    for (const forbidden of [
      "createWakeSupervisorRuntime",
      "createResidentLoopFactoryComposition",
      "preflightPortableMountedAgentHandoffBinding",
      "registerResidentLoopFactoryAuthorityReadback",
      "createResidentLoopFactoryCompositionForFacade",
      "bindMountedResidentLoopAuthorityForFactory"
    ]) {
      expectNoIdentifier(factorySource, forbidden);
      expectNoIdentifier(parsedSources.bounded, forbidden);
    }
    expectNoAgentBarrelExposure(
      agentBarrelSource,
      checker,
      paths.bounded,
      paths.handoff,
      /BoundedAgentLoop|ResidentDomainExecution|PackageOwnedResident|InternalSpecialistHandoff/
    );

    for (const [name, source] of Object.entries(parsedSources)) {
      expectNoDynamicLoaderSyntax(source, name);
    }
    for (const [index, path] of activationPaths.entries()) {
      const absolute = activationAbsolutePaths[index]!;
      const source = program.getSourceFile(absolute);
      expect(source, `${path}: activation source in TypeScript program`).toBeDefined();
      if (source === undefined) throw new Error(`${path}: activation source is unavailable`);
      expectNoModuleEdge(source, /resident-loop-factory-ports|bounded-agent-loop/);
      expectNoIdentifier(source, "createResidentBoundedAgentLoopFactory");
      expectNoActivationSurfaceReference(source, path);
      expectNoActivationSymbolOrigin(
        source,
        checker,
        [paths.factory, paths.bounded],
        path
      );
      expectNoDynamicLoaderSyntax(source, path);
    }
  });
});

function createFactoryProgram(factoryPath: string, ...additionalRootNames: readonly string[]): ts.Program {
  const configPath = resolve(process.cwd(), "tsconfig.json");
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  expect(config.error).toBeUndefined();
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
  return ts.createProgram({
    rootNames: [factoryPath, ...additionalRootNames],
    options: parsed.options
  });
}

function expectExactFactoryModuleGraph(
  source: ts.SourceFile,
  checker: ts.TypeChecker
): void {
  const observed = new Map<string, {
    readonly defaultNames: string[];
    readonly namedNames: string[];
    valueDeclarationCount: number;
  }>();
  const violations: string[] = [];

  for (const statement of source.statements) {
    if (
      ts.isClassDeclaration(statement) ||
      ts.isEnumDeclaration(statement) ||
      ts.isModuleDeclaration(statement)
    ) {
      violations.push(`top-level-runtime-declaration:${statement.kind}`);
      continue;
    }
    if (ts.isImportEqualsDeclaration(statement)) {
      violations.push(`import-equals:${statement.getText(source)}`);
      continue;
    }
    if (ts.isExportAssignment(statement)) {
      violations.push(`export-assignment:${statement.getText(source)}`);
      continue;
    }
    if (
      ts.isExportDeclaration(statement) &&
      statement.moduleSpecifier !== undefined
    ) {
      violations.push(`module-re-export:${statement.getText(source)}`);
      continue;
    }
    if (!ts.isImportDeclaration(statement)) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) {
      violations.push(`nonliteral-import:${statement.getText(source)}`);
      continue;
    }
    const moduleSpecifier = statement.moduleSpecifier.text;
    const clause = statement.importClause;
    if (clause === undefined) {
      violations.push(`side-effect-import:${moduleSpecifier}`);
      continue;
    }

    const defaultNames: string[] = [];
    const namedNames: string[] = [];
    let hasTypeBinding = clause.isTypeOnly;
    if (!clause.isTypeOnly && clause.name !== undefined) {
      defaultNames.push(clause.name.text);
    }
    if (clause.namedBindings !== undefined) {
      if (ts.isNamespaceImport(clause.namedBindings)) {
        if (clause.isTypeOnly) {
          hasTypeBinding = true;
        } else {
          violations.push(`namespace-value-import:${moduleSpecifier}`);
        }
      } else {
        for (const element of clause.namedBindings.elements) {
          if (clause.isTypeOnly || element.isTypeOnly) {
            hasTypeBinding = true;
            continue;
          }
          const importedName = (element.propertyName ?? element.name).text;
          if (element.name.text !== importedName) {
            violations.push(
              `aliased-value-import:${moduleSpecifier}:${importedName}->${element.name.text}`
            );
          }
          namedNames.push(importedName);
        }
      }
    }

    if (
      hasTypeBinding &&
      !exactFactoryTypeImportModules.has(moduleSpecifier) &&
      !exactFactoryValueImports.has(moduleSpecifier)
    ) {
      violations.push(`unexpected-type-import:${moduleSpecifier}`);
    }
    if (defaultNames.length === 0 && namedNames.length === 0) {
      if (!hasTypeBinding) {
        violations.push(`empty-runtime-import:${moduleSpecifier}`);
      }
      continue;
    }

    const entry = observed.get(moduleSpecifier) ?? {
      defaultNames: [],
      namedNames: [],
      valueDeclarationCount: 0
    };
    entry.defaultNames.push(...defaultNames);
    entry.namedNames.push(...namedNames);
    entry.valueDeclarationCount += 1;
    observed.set(moduleSpecifier, entry);
  }

  expect(
    [...observed.keys()].sort(),
    "factory module exact runtime value-import modules"
  ).toEqual([...exactFactoryValueImports.keys()].sort());
  for (const [moduleSpecifier, expected] of exactFactoryValueImports) {
    const actual = observed.get(moduleSpecifier);
    expect(actual, `${moduleSpecifier}: runtime value import`).toBeDefined();
    if (actual === undefined) continue;
    expect(
      actual.valueDeclarationCount,
      `${moduleSpecifier}: one runtime import declaration`
    ).toBe(1);
    expect(
      actual.defaultNames,
      `${moduleSpecifier}: exact default value binding`
    ).toEqual(expected.defaultName === undefined ? [] : [expected.defaultName]);
    expect(
      [...actual.namedNames].sort(),
      `${moduleSpecifier}: exact named value bindings`
    ).toEqual([...expected.namedNames].sort());
  }

  expect(
    forbiddenTopLevelRuntimeInitializers(source),
    "factory module permits only direct internal const regular-expression runtime initializers"
  ).toEqual([]);
  expect(violations, "factory module exact import/export posture").toEqual([]);
  expectExactFactoryRuntimeValueExports(source, checker);
}

function forbiddenTopLevelRuntimeInitializers(
  source: ts.SourceFile
): readonly string[] {
  const forbidden: string[] = [];
  for (const statement of source.statements) {
    if (
      ts.isImportDeclaration(statement) ||
      ts.isImportEqualsDeclaration(statement) ||
      ts.isFunctionDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement)
    ) {
      continue;
    }
    if (
      ts.isVariableStatement(statement) &&
      statement.modifiers === undefined &&
      (statement.declarationList.flags & ts.NodeFlags.Const) !== 0 &&
      statement.declarationList.declarations.length === 1
    ) {
      const declaration = statement.declarationList.declarations[0]!;
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.exclamationToken === undefined &&
        declaration.type === undefined &&
        declaration.initializer?.kind === ts.SyntaxKind.RegularExpressionLiteral
      ) {
        continue;
      }
    }
    forbidden.push(statement.getText(source));
  }
  return forbidden;
}

function expectExactFactoryRuntimeValueExports(
  source: ts.SourceFile,
  checker: ts.TypeChecker
): void {
  const moduleSymbol = checker.getSymbolAtLocation(source);
  expect(moduleSymbol, "factory module symbol").toBeDefined();
  if (moduleSymbol === undefined) {
    throw new Error("factory module symbol is unavailable");
  }
  const runtimeValueExports = checker.getExportsOfModule(moduleSymbol)
    .filter((exported) =>
      (resolveAliasSymbol(exported, checker).flags & ts.SymbolFlags.Value) !== 0
    )
    .map((exported) => exported.getName())
    .sort();
  expect(
    runtimeValueExports,
    "factory exact public runtime value surface"
  ).toEqual([
    "createResidentBoundedAgentLoopFactory",
    "createResidentLoopFactoryPorts"
  ]);
}

function expectFactoryOracleControls(): void {
  const safeSurface = factorySurfaceControl([
    "export interface CreateResidentBoundedAgentLoopFactoryInput {}",
    "export type ResidentBoundedAgentLoopFactoryResult = object;",
    "export function createResidentLoopFactoryPorts() {",
    "  return {};",
    "}",
    "export async function createResidentBoundedAgentLoopFactory(",
    "  _input: CreateResidentBoundedAgentLoopFactoryInput",
    "): Promise<ResidentBoundedAgentLoopFactoryResult> {",
    "  return {};",
    "}"
  ].join("\n"));
  expect(() =>
    expectExactFactoryRuntimeValueExports(
      safeSurface.source,
      safeSurface.checker
    )
  ).not.toThrow();

  for (const sourceText of [
    [
      "export function createResidentLoopFactoryPorts() {}",
      "export async function createResidentBoundedAgentLoopFactory() {}",
      "export default function alternateFactory() {}"
    ].join("\n"),
    [
      "export function createResidentLoopFactoryPorts() {}",
      "async function createResidentBoundedAgentLoopFactory() {}",
      "export { createResidentBoundedAgentLoopFactory };",
      "export { createResidentBoundedAgentLoopFactory as alternateFactory };"
    ].join("\n"),
    [
      "export function createResidentLoopFactoryPorts() {}",
      "export async function createResidentBoundedAgentLoopFactory() {}",
      "export function additionalFactorySurface() {}"
    ].join("\n")
  ]) {
    const control = factorySurfaceControl(sourceText);
    expect(() =>
      expectExactFactoryRuntimeValueExports(control.source, control.checker)
    ).toThrow();
  }

  const directCall = factoryCallControl([
    "async function factory() {",
    "  const retained = await requiredCall();",
    "}"
  ].join("\n"));
  expect(() =>
    expectStraightLineFactoryCall(
      directCall.call,
      directCall.body,
      "direct-call control"
    )
  ).not.toThrow();

  const coDeclarator = factoryCallControl([
    "async function factory() {",
    "  const retained = await requiredCall(), unrelated = unrelatedEffect();",
    "}"
  ].join("\n"));
  expect(() =>
    expectStraightLineFactoryCall(
      coDeclarator.call,
      coDeclarator.body,
      "co-declarator control"
    )
  ).toThrow(/direct-statement|non-direct ancestry/i);

  const globalFreeze = factoryReturnControl([
    "function factory() {",
    "  return Object.freeze({ retained: true });",
    "}"
  ].join("\n"));
  expect(
    returnedObjectLiteral(globalFreeze.returned, globalFreeze.checker),
    "genuine TypeScript global Object.freeze control"
  ).toBeDefined();

  const shadowedFreeze = factoryReturnControl([
    "declare function abstractLocalEffect(): void;",
    "function factory() {",
    "  const Object = {",
    "    freeze<T>(value: T): T {",
    "      abstractLocalEffect();",
    "      return value;",
    "    }",
    "  };",
    "  return Object.freeze({ retained: true });",
    "}"
  ].join("\n"));
  expect(
    returnedObjectLiteral(shadowedFreeze.returned, shadowedFreeze.checker),
    "locally shadowed Object.freeze counterexample"
  ).toBeUndefined();

  const safeTopLevel = ts.createSourceFile(
    "safe-top-level-control.ts",
    [
      "const retainedPattern = /^retained$/gi;",
      "interface DeferredShape { readonly retained: boolean; }",
      "type DeferredValue = string;",
      "export function later() {",
      "  const escaped = delete abstractLocal.target;",
      "  return { ...abstractLocal, escaped };",
      "}"
    ].join("\n"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  expect(
    forbiddenTopLevelRuntimeInitializers(safeTopLevel),
    "exact regex constant and deferred callable body control"
  ).toEqual([]);

  for (const [label, sourceText] of [
    [
      "top-level assignment initializer",
      "const escaped = (abstractLocal.target = 1);"
    ],
    [
      "top-level update initializer",
      "const escaped = abstractLocal.target++;"
    ],
    [
      "top-level delete initializer",
      "const escaped = delete abstractLocal.target;"
    ],
    [
      "top-level getter-capable property initializer",
      "const escaped = abstractLocal.target;"
    ],
    [
      "top-level spread initializer",
      "const escaped = { ...abstractLocal };"
    ],
    [
      "top-level coercion initializer",
      "const escaped = `${abstractLocal}`;"
    ],
    [
      "top-level object initializer",
      "const escaped = { retained: true };"
    ],
    [
      "top-level array initializer",
      "const escaped = [abstractLocal];"
    ],
    [
      "top-level call initializer",
      "const escaped = abstractLocal();"
    ],
    [
      "top-level construction initializer",
      "const escaped = new AbstractLocal();"
    ],
    [
      "top-level await initializer",
      "const escaped = await abstractLocal;"
    ],
    [
      "top-level tagged initializer",
      "const escaped = abstractLocalTag`retained`;"
    ]
  ] as const) {
    const control = ts.createSourceFile(
      `${label.replaceAll(" ", "-")}-control.ts`,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    );
    expect(forbiddenTopLevelRuntimeInitializers(control), label).toHaveLength(1);
  }
}

function factoryReturnControl(sourceText: string): {
  readonly returned: ts.Expression | undefined;
  readonly checker: ts.TypeChecker;
} {
  const fileName = "/factory-return-control.ts";
  const options: ts.CompilerOptions = {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.Latest
  };
  const source = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const defaultHost = ts.createCompilerHost(options, true);
  const host: ts.CompilerHost = {
    ...defaultHost,
    fileExists: (path) => path === fileName || defaultHost.fileExists(path),
    getSourceFile: (path, languageVersion, onError, shouldCreateNewSourceFile) =>
      path === fileName
        ? source
        : defaultHost.getSourceFile(
          path,
          languageVersion,
          onError,
          shouldCreateNewSourceFile
        ),
    readFile: (path) => path === fileName
      ? sourceText
      : defaultHost.readFile(path)
  };
  const program = ts.createProgram({
    rootNames: [fileName],
    options,
    host
  });
  const programSource = program.getSourceFile(fileName);
  if (programSource === undefined) {
    throw new Error("factory return control source is unavailable");
  }
  const factory = programSource.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === "factory" &&
      statement.body !== undefined
  );
  const returned = factory?.body?.statements.find(ts.isReturnStatement);
  return {
    returned: returned?.expression,
    checker: program.getTypeChecker()
  };
}

function factorySurfaceControl(sourceText: string): {
  readonly source: ts.SourceFile;
  readonly checker: ts.TypeChecker;
} {
  const fileName = "/factory-surface-control.ts";
  const source = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const options: ts.CompilerOptions = {
    module: ts.ModuleKind.ESNext,
    noLib: true,
    target: ts.ScriptTarget.Latest
  };
  const host: ts.CompilerHost = {
    fileExists: (path) => path === fileName,
    getCanonicalFileName: (path) => path,
    getCurrentDirectory: () => "/",
    getDefaultLibFileName: () => "/lib.d.ts",
    getDirectories: () => [],
    getNewLine: () => "\n",
    getSourceFile: (path) => path === fileName ? source : undefined,
    readFile: (path) => path === fileName ? sourceText : undefined,
    useCaseSensitiveFileNames: () => true,
    writeFile: () => undefined
  };
  const program = ts.createProgram({
    rootNames: [fileName],
    options,
    host
  });
  const programSource = program.getSourceFile(fileName);
  if (programSource === undefined) {
    throw new Error("factory surface control source is unavailable");
  }
  return {
    source: programSource,
    checker: program.getTypeChecker()
  };
}

function factoryCallControl(sourceText: string): {
  readonly call: ts.CallExpression;
  readonly body: ts.Block;
} {
  const source = ts.createSourceFile(
    "factory-call-control.ts",
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const factory = source.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === "factory" &&
      statement.body !== undefined
  );
  if (factory?.body === undefined) {
    throw new Error("factory call control body is unavailable");
  }
  let call: ts.CallExpression | undefined;
  const visit = (node: ts.Node): void => {
    if (
      call === undefined &&
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "requiredCall"
    ) {
      call = node;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(factory.body);
  if (call === undefined) {
    throw new Error("factory call control required call is unavailable");
  }
  return { call, body: factory.body };
}

function expectDataOnlyBridgeIsolation(
  source: ts.SourceFile,
  checker: ts.TypeChecker
): void {
  const bridges = source.statements.filter(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === "createResidentLoopFactoryPorts"
  );
  expect(bridges, "data-only factory-ports bridge declaration").toHaveLength(1);
  const bridge = bridges[0]!;
  expect(
    bridge.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword),
    "data-only bridge must remain a named export"
  ).toBe(true);
  expect(bridge.body, "data-only bridge must have a static function body").toBeDefined();
  if (bridge.body === undefined) throw new Error("data-only bridge body is unavailable");

  const safeDataModules = new Set([
    "node:net",
    "node:util",
    "../../agent/src/secret-safety.js"
  ]);
  const reachedImportedModules: string[] = [];
  const dynamicLoads: ts.Node[] = [];
  const unresolvedLocalCalls: string[] = [];
  const pending: ts.Node[] = [bridge.body];
  const inspectedBodies = new Set<ts.Node>();
  while (pending.length > 0) {
    const body = pending.pop()!;
    if (inspectedBodies.has(body)) continue;
    inspectedBodies.add(body);
    visit(body, (node) => {
      if (
        ts.isCallExpression(node) &&
        (
          node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === "require")
        )
      ) {
        dynamicLoads.push(node);
      }
      if (ts.isIdentifier(node)) {
        const symbol = checker.getSymbolAtLocation(node);
        for (const declaration of symbol?.declarations ?? []) {
          const importDeclaration = enclosingImportDeclaration(declaration);
          if (
            importDeclaration !== undefined &&
            ts.isStringLiteral(importDeclaration.moduleSpecifier)
          ) {
            reachedImportedModules.push(importDeclaration.moduleSpecifier.text);
          }
        }
      }
      if (!ts.isCallExpression(node)) return;
      if (
        node.questionDotToken !== undefined ||
        (
          ts.isPropertyAccessExpression(node.expression) &&
          ["call", "apply", "bind"].includes(node.expression.name.text)
        )
      ) {
        unresolvedLocalCalls.push(node.getText(source));
        return;
      }
      const callable = localCallableBodies(node.expression, source, checker);
      pending.push(...callable.bodies);
      if (callable.local && callable.bodies.length === 0) {
        unresolvedLocalCalls.push(node.getText(source));
      }
    });
  }
  expect(
    [...new Set(reachedImportedModules)].filter((module) => !safeDataModules.has(module)),
    "data-only bridge reachable helpers must not reach Core/W/H/R authority imports"
  ).toEqual([]);
  expect(dynamicLoads, "data-only bridge must not load a module dynamically").toHaveLength(0);
  expect(
    unresolvedLocalCalls,
    "data-only bridge must not call an unresolved local callback or alias"
  ).toEqual([]);
}

function localCallableBodies(
  expression: ts.Expression,
  source: ts.SourceFile,
  checker: ts.TypeChecker,
  seen = new Set<ts.Declaration>()
): { readonly local: boolean; readonly bodies: readonly ts.Node[] } {
  const unwrapped = unwrapExpression(expression);
  if (ts.isArrowFunction(unwrapped) || ts.isFunctionExpression(unwrapped)) {
    return { local: true, bodies: [unwrapped.body] };
  }
  const lookup = ts.isPropertyAccessExpression(unwrapped)
    ? unwrapped.name
    : unwrapped;
  const symbol = checker.getSymbolAtLocation(lookup);
  let local = false;
  const bodies: ts.Node[] = [];
  for (const declaration of symbol?.declarations ?? []) {
    if (
      declaration.getSourceFile() !== source ||
      enclosingImportDeclaration(declaration) !== undefined ||
      seen.has(declaration)
    ) {
      continue;
    }
    local = true;
    seen.add(declaration);
    if (
      (
        ts.isFunctionDeclaration(declaration) ||
        ts.isMethodDeclaration(declaration) ||
        ts.isGetAccessorDeclaration(declaration) ||
        ts.isSetAccessorDeclaration(declaration)
      ) &&
      declaration.body !== undefined
    ) {
      bodies.push(declaration.body);
      continue;
    }
    const initializer = (
      ts.isVariableDeclaration(declaration) ||
      ts.isPropertyDeclaration(declaration) ||
      ts.isPropertyAssignment(declaration)
    )
      ? declaration.initializer
      : undefined;
    if (initializer === undefined) continue;
    const nested = localCallableBodies(initializer, source, checker, seen);
    bodies.push(...nested.bodies);
  }
  return { local, bodies };
}

function enclosingImportDeclaration(node: ts.Node): ts.ImportDeclaration | undefined {
  let current: ts.Node | undefined = node;
  while (current !== undefined && !ts.isSourceFile(current)) {
    if (ts.isImportDeclaration(current)) return current;
    current = current.parent;
  }
  return undefined;
}

function directImports(source: ts.SourceFile, moduleSpecifier: string): ts.ImportDeclaration[] {
  return source.statements.filter(
    (statement): statement is ts.ImportDeclaration =>
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === moduleSpecifier
  );
}

function expectDirectImport(source: ts.SourceFile, moduleSpecifier: string): ts.ImportDeclaration {
  const declarations = directImports(source, moduleSpecifier);
  expect(declarations, moduleSpecifier).toHaveLength(1);
  return declarations[0]!;
}

function expectDirectDefaultImport(
  source: ts.SourceFile,
  moduleSpecifier: string
): ts.ImportClause {
  const clause = expectDirectImport(source, moduleSpecifier).importClause;
  expect(clause?.isTypeOnly, moduleSpecifier).toBe(false);
  expect(clause?.name, moduleSpecifier).toBeDefined();
  expect(clause?.namedBindings, moduleSpecifier).toBeUndefined();
  if (clause === undefined || clause.name === undefined) {
    throw new Error(`default import is unavailable for ${moduleSpecifier}`);
  }
  return clause;
}

function expectDirectNamedImport(
  source: ts.SourceFile,
  moduleSpecifier: string,
  importedName: string
): ts.ImportSpecifier {
  const clause = expectDirectImport(source, moduleSpecifier).importClause;
  expect(clause?.name, moduleSpecifier).toBeUndefined();
  expect(clause?.namedBindings !== undefined && ts.isNamedImports(clause.namedBindings), moduleSpecifier).toBe(true);
  if (clause?.namedBindings === undefined || !ts.isNamedImports(clause.namedBindings)) {
    throw new Error(`named imports are unavailable for ${moduleSpecifier}`);
  }
  const matches = clause.namedBindings.elements.filter(
    (element) => (element.propertyName ?? element.name).text === importedName
  );
  expect(matches, `${moduleSpecifier}:${importedName}`).toHaveLength(1);
  const binding = matches[0]!;
  expect(binding.isTypeOnly, importedName).toBe(false);
  expect(binding.propertyName, importedName).toBeUndefined();
  expect(binding.name.text, importedName).toBe(importedName);
  return binding;
}

function expectDirectTypeOnlyNamedImport(
  source: ts.SourceFile,
  moduleSpecifier: string,
  importedName: string
): ts.ImportSpecifier {
  const declarations = directImports(source, moduleSpecifier);
  expect(declarations, `${moduleSpecifier}: one type-only declaration`).toHaveLength(1);
  const clause = declarations[0]?.importClause;
  expect(clause?.isTypeOnly, `${moduleSpecifier}: type-only import clause`).toBe(true);
  expect(clause?.name, `${moduleSpecifier}: no default type import`).toBeUndefined();
  expect(
    clause?.namedBindings !== undefined && ts.isNamedImports(clause.namedBindings),
    `${moduleSpecifier}: named type imports`
  ).toBe(true);
  if (clause?.namedBindings === undefined || !ts.isNamedImports(clause.namedBindings)) {
    throw new Error(`named type imports are unavailable for ${moduleSpecifier}`);
  }
  expect(
    clause.namedBindings.elements.map((element) => ({
      imported: (element.propertyName ?? element.name).text,
      local: element.name.text
    })),
    `${moduleSpecifier}: exact unaliased type surface`
  ).toEqual([{ imported: importedName, local: importedName }]);
  return clause.namedBindings.elements[0]!;
}

function expectDirectNamedImportAndCall(
  source: ts.SourceFile,
  checker: ts.TypeChecker,
  moduleSpecifier: string,
  importedName: string
): ts.CallExpression {
  const binding = expectDirectNamedImport(source, moduleSpecifier, importedName);
  const call = expectSingleSymbolCall(
    source,
    checker,
    binding.name,
    `${moduleSpecifier}:${importedName}`
  );
  expectSymbolUsedOnlyAsDirectCall(
    source,
    checker,
    binding.name,
    `${moduleSpecifier}:${importedName}`
  );
  return call;
}

function expectDirectDefaultImportAndCall(
  source: ts.SourceFile,
  checker: ts.TypeChecker,
  moduleSpecifier: string,
  localName: string
): ts.CallExpression {
  const clause = expectDirectDefaultImport(source, moduleSpecifier);
  expect(clause.name?.text, moduleSpecifier).toBe(localName);
  const call = expectSingleSymbolCall(
    source,
    checker,
    clause.name!,
    `${moduleSpecifier}:default`
  );
  expectSymbolUsedOnlyAsDirectCall(
    source,
    checker,
    clause.name!,
    `${moduleSpecifier}:default`
  );
  return call;
}

function expectLocalNamedCall(
  source: ts.SourceFile,
  checker: ts.TypeChecker,
  localName: string
): ts.CallExpression {
  const declarations = source.statements.filter(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === localName
  );
  expect(declarations, `${localName}:local declaration`).toHaveLength(1);
  const declaration = declarations[0]!;
  if (declaration.name === undefined) throw new Error(`${localName} declaration has no name`);
  const call = expectSingleSymbolCall(source, checker, declaration.name, localName);
  expectSymbolUsedOnlyAsDirectCall(source, checker, declaration.name, localName);
  return call;
}

function expectSingleSymbolCall(
  source: ts.SourceFile,
  checker: ts.TypeChecker,
  binding: ts.Identifier,
  label: string
): ts.CallExpression {
  const bindingSymbol = checker.getSymbolAtLocation(binding);
  expect(bindingSymbol, `${label}:binding`).toBeDefined();
  const calls: ts.CallExpression[] = [];
  visit(source, (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      checker.getSymbolAtLocation(node.expression) === bindingSymbol
    ) {
      calls.push(node);
    }
  });
  expect(calls, `${label}:calls`).toHaveLength(1);
  return calls[0]!;
}

function expectCallAwaited(
  call: ts.CallExpression,
  expected: boolean,
  label: string
): void {
  let current: ts.Node = call;
  let parent = current.parent;
  while (
    parent !== undefined &&
    (
      ts.isParenthesizedExpression(parent) ||
      ts.isAsExpression(parent) ||
      ts.isSatisfiesExpression(parent) ||
      ts.isNonNullExpression(parent)
    )
  ) {
    current = parent;
    parent = current.parent;
  }
  expect(
    parent !== undefined &&
      ts.isAwaitExpression(parent) &&
      parent.expression === current,
    `${label}: exact await posture`
  ).toBe(expected);
}

function expectExactFactoryCallProvenance(
  source: ts.SourceFile,
  checker: ts.TypeChecker,
  calls: {
    readonly binderCall: ts.CallExpression;
    readonly handoffCall: ts.CallExpression;
    readonly candidateCall: ts.CallExpression;
    readonly issuerCall: ts.CallExpression;
    readonly portsCall: ts.CallExpression;
  }
): void {
  const factories = source.statements.filter(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === "createResidentBoundedAgentLoopFactory"
  );
  expect(factories, "sole exported bounded factory declaration").toHaveLength(1);
  const factory = factories[0]!;
  const modifiers = factory.modifiers ?? [];
  expect(
    modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword),
    "bounded factory must be a direct named export"
  ).toBe(true);
  expect(
    modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword),
    "bounded factory must be async"
  ).toBe(true);
  expect(
    modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword),
    "bounded factory must not be a default export"
  ).toBe(false);
  expect(factory.parameters, "bounded factory exact input parameter").toHaveLength(1);
  expect(
    factory.parameters[0] !== undefined && ts.isIdentifier(factory.parameters[0].name),
    "bounded factory input must be one direct identifier"
  ).toBe(true);
  const inputParameter = factory.parameters[0];
  const inputName = inputParameter !== undefined && ts.isIdentifier(inputParameter.name)
    ? inputParameter.name.text
    : "<missing-input>";
  expect(inputName, "bounded factory input name").toBe("input");
  expect(inputParameter?.dotDotDotToken, "bounded factory input must not be rest").toBeUndefined();
  expect(inputParameter?.questionToken, "bounded factory input must not be optional").toBeUndefined();
  expect(inputParameter?.initializer, "bounded factory input must not have an initializer").toBeUndefined();
  expect(inputParameter?.modifiers, "bounded factory input must not have parameter modifiers").toBeUndefined();
  expectExactPreparedFactoryInputInterface(
    source,
    checker,
    inputParameter
  );

  const factoryBody = factory.body;
  expect(factoryBody, "bounded factory body").toBeDefined();
  if (factoryBody === undefined) throw new Error("bounded factory body is unavailable");
  const normalizationCall = expectSingleLocalNamedCallWithin(
    source,
    checker,
    factoryBody,
    "exactFrozenRecord"
  );
  expectExactPreparedNormalization(
    normalizationCall,
    inputName,
    [
      "runtimeHandle",
      "wakeRuntime",
      "authorityReadback",
      "providerPosture",
      "domainExecution",
      "nowMonotonicMs"
    ]
  );
  const preparedBinding = assignedIdentifier(normalizationCall);
  expect(preparedBinding, "prepared input retained binding").toBe("prepared");
  expectInputUsedOnlyForNormalization(
    factory,
    checker,
    normalizationCall,
    inputParameter
  );

  const orderedCalls = [
    ["prepared-input normalization", normalizationCall, false],
    ["W factory binder", calls.binderCall, true],
    ["metadata projection", calls.portsCall, false],
    ["stateless C construction", calls.candidateCall, false],
    ["internal H construction", calls.handoffCall, false],
    ["bounded issuer", calls.issuerCall, false]
  ] as const;
  for (const [index, [label, call, awaited]] of orderedCalls.entries()) {
    const statement = expectStraightLineFactoryCall(call, factoryBody, label);
    expect(
      factoryBody.statements.indexOf(statement),
      `${label}: exact top-level order`
    ).toBe(index);
    expectCallAwaited(call, awaited, label);
  }
  expect(
    factoryBody.statements.length,
    "factory must retain normalization/W/metadata/C/H/R plus stop and return"
  ).toBeGreaterThanOrEqual(8);
  expect(
    factoryBody.statements.at(-1) !== undefined &&
      ts.isReturnStatement(factoryBody.statements.at(-1)!),
    "exact return must terminate the straight-line factory"
  ).toBe(true);

  expect(calls.binderCall.arguments, "W factory binder positional ABI").toHaveLength(4);
  expectExpressionPath(
    calls.binderCall.arguments[0],
    `${preparedBinding}.wakeRuntime`,
    "W wake runtime"
  );
  expectExpressionPath(
    calls.binderCall.arguments[1],
    `${preparedBinding}.authorityReadback`,
    "W authority readback"
  );
  expectExpressionPath(
    calls.binderCall.arguments[2],
    `${preparedBinding}.domainExecution`,
    "W domain execution"
  );
  expectExpressionPath(
    calls.binderCall.arguments[3],
    `${preparedBinding}.runtimeHandle`,
    "W exact runtime handle"
  );
  expect(calls.candidateCall.arguments, "stateless C construction").toHaveLength(0);

  expect(calls.issuerCall.arguments, "bounded issuer positional ABI").toHaveLength(8);

  const candidateBinding = assignedIdentifier(calls.candidateCall);
  const handoffBinding = assignedIdentifier(calls.handoffCall);
  const mountedBinding = assignedIdentifier(calls.binderCall);
  expectExactObjectArgument(calls.handoffCall, {
    ledger: `${preparedBinding}.runtimeHandle.ledger`,
    handoffReader: `${mountedBinding}.handoffReader`
  }, "internal H construction");
  expect(
    calls.handoffCall.getStart(source) > calls.binderCall.getEnd(),
    "internal H construction must consume the retained mounted binder result"
  ).toBe(true);
  expectExpressionPath(calls.issuerCall.arguments[1], candidateBinding, "bounded issuer C");
  expectExpressionPath(calls.issuerCall.arguments[5], handoffBinding, "bounded issuer H");
  for (const [index, path] of [
    [0, `${mountedBinding}.planObservation`],
    [2, `${mountedBinding}.gateway`],
    [3, `${mountedBinding}.mountedAuthority`],
    [4, `${mountedBinding}.currentnessToken`],
    [7, `${preparedBinding}.nowMonotonicMs`]
  ] as const) {
    expectExpressionPath(calls.issuerCall.arguments[index], path, `bounded issuer argument ${index + 1}`);
  }

  expectExactObjectArgument(calls.portsCall, {
    authorityReadback: `${preparedBinding}.authorityReadback`,
    providerPosture: `${preparedBinding}.providerPosture`
  }, "metadata projection");
  const metadataBinding = assignedIdentifier(calls.portsCall);
  expectExpressionPath(
    calls.issuerCall.arguments[6],
    metadataBinding,
    "bounded issuer metadata"
  );

  const issuerBinding = assignedIdentifier(calls.issuerCall);
  const returns = factoryBody.statements.filter(ts.isReturnStatement);
  expect(returns, "one straight-line bounded factory return").toHaveLength(1);
  const returned = returnedObjectLiteral(returns[0]?.expression, checker);
  expect(returned, "bounded factory exact return object").toBeDefined();
  if (returned === undefined) throw new Error("bounded factory return object is unavailable");
  const returnedProperties = new Map<string, ts.Expression>();
  for (const property of returned.properties) {
    if (ts.isShorthandPropertyAssignment(property)) {
      returnedProperties.set(property.name.text, property.name);
      continue;
    }
    expect(ts.isPropertyAssignment(property), "bounded factory return uses data properties only").toBe(true);
    if (!ts.isPropertyAssignment(property)) {
      throw new Error("bounded factory return contains a non-data property");
    }
    const name = propertyName(property.name);
    if (name === undefined) throw new Error("bounded factory return has a computed key");
    returnedProperties.set(name, property.initializer);
  }
  expect([...returnedProperties.keys()].sort(), "bounded factory exact return keys").toEqual([
    "loop",
    "metadata",
    "stop"
  ]);
  expectExpressionPath(returnedProperties.get("metadata"), metadataBinding, "returned metadata");
  expectExpressionPath(returnedProperties.get("loop"), `${issuerBinding}.loop`, "returned issued loop");
  expectExactFactoryStopTail(
    factoryBody,
    returnedProperties.get("stop"),
    checker
  );
  expect(
    isExactMemoizedWakeRuntimeStop(
      returnedProperties.get("stop"),
      factoryBody,
      preparedBinding,
      source,
      checker
    ),
    "returned stop must memoize and return one direct authenticated wake-runtime stop promise"
  ).toBe(true);
  expectNoForbiddenFactoryControlFlow(factoryBody, source);
}

function expectExactFactoryStopTail(
  factoryBody: ts.Block,
  returnedStop: ts.Expression | undefined,
  checker: ts.TypeChecker
): void {
  const tail = factoryBody.statements.slice(6);
  expect(
    [2, 3].includes(tail.length),
    "after R, factory permits only stop memoization state, optional stop callable, and return"
  ).toBe(true);
  const promiseState = tail[0];
  expect(
    promiseState !== undefined && ts.isVariableStatement(promiseState),
    "factory stop tail begins with one variable statement"
  ).toBe(true);
  if (promiseState === undefined || !ts.isVariableStatement(promiseState)) {
    throw new Error("factory stop promise state is unavailable");
  }
  expect(
    (promiseState.declarationList.flags & ts.NodeFlags.Let) !== 0,
    "factory stop promise state is a local let"
  ).toBe(true);
  expect(
    promiseState.declarationList.declarations,
    "factory stop promise state has one declaration"
  ).toHaveLength(1);
  expect(
    promiseState.declarationList.declarations[0]?.initializer,
    "factory stop promise is not invoked during factory creation"
  ).toBeUndefined();

  const returnStatement = tail.at(-1);
  expect(
    returnStatement !== undefined && ts.isReturnStatement(returnStatement),
    "factory stop tail terminates in the exact product return"
  ).toBe(true);

  if (tail.length === 2) {
    const direct = returnedStop === undefined
      ? undefined
      : unwrapExpression(returnedStop);
    expect(
      direct !== undefined &&
        (ts.isArrowFunction(direct) || ts.isFunctionExpression(direct)),
      "inline stop tail returns one direct callable"
    ).toBe(true);
    return;
  }

  const callableState = tail[1];
  expect(
    callableState !== undefined && ts.isVariableStatement(callableState),
    "named stop tail contains one callable declaration"
  ).toBe(true);
  if (callableState === undefined || !ts.isVariableStatement(callableState)) {
    throw new Error("factory stop callable state is unavailable");
  }
  expect(
    (callableState.declarationList.flags & ts.NodeFlags.Const) !== 0,
    "named stop callable is const"
  ).toBe(true);
  expect(callableState.declarationList.declarations).toHaveLength(1);
  const declaration = callableState.declarationList.declarations[0];
  const initializer = declaration?.initializer === undefined
    ? undefined
    : unwrapExpression(declaration.initializer);
  expect(
    initializer !== undefined &&
      (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)),
    "named stop callable has one direct function initializer"
  ).toBe(true);
  expect(
    returnedStop !== undefined &&
      ts.isIdentifier(unwrapExpression(returnedStop)) &&
      declaration !== undefined &&
      ts.isIdentifier(declaration.name) &&
      checker.getSymbolAtLocation(unwrapExpression(returnedStop)) ===
        checker.getSymbolAtLocation(declaration.name),
    "returned stop is the exact named stop callable"
  ).toBe(true);
}

function expectExactPreparedFactoryInputInterface(
  source: ts.SourceFile,
  checker: ts.TypeChecker,
  inputParameter: ts.ParameterDeclaration | undefined
): void {
  const declarations = source.statements.filter(
    (statement): statement is ts.InterfaceDeclaration =>
      ts.isInterfaceDeclaration(statement) &&
      statement.name.text === "CreateResidentBoundedAgentLoopFactoryInput"
  );
  expect(declarations, "exact prepared factory input interface").toHaveLength(1);
  const declaration = declarations[0]!;
  expect(
    declaration.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
    ),
    "prepared factory input interface remains a direct public type"
  ).toBe(true);
  expect(
    declaration.typeParameters,
    "prepared factory input has no generic widening"
  ).toBeUndefined();
  expect(
    declaration.heritageClauses,
    "prepared factory input has no inherited structural authority"
  ).toBeUndefined();
  const parameterTypeName =
    inputParameter?.type !== undefined &&
    ts.isTypeReferenceNode(inputParameter.type) &&
    ts.isIdentifier(inputParameter.type.typeName) &&
    inputParameter.type.typeArguments === undefined
      ? inputParameter.type.typeName
      : undefined;
  expect(
    parameterTypeName,
    "bounded factory parameter uses the direct prepared input type"
  ).toBeDefined();
  expect(
    parameterTypeName !== undefined &&
      checker.getSymbolAtLocation(parameterTypeName) ===
        checker.getSymbolAtLocation(declaration.name),
    "bounded factory parameter resolves to the local prepared input interface"
  ).toBe(true);
  const properties = declaration.members.filter(ts.isPropertySignature);
  expect(
    properties.map((property) => propertyName(property.name)).sort(),
    "exact six-field prepared factory input"
  ).toEqual([
    "authorityReadback",
    "domainExecution",
    "nowMonotonicMs",
    "providerPosture",
    "runtimeHandle",
    "wakeRuntime"
  ]);
  expect(declaration.members, "prepared input contains only properties").toHaveLength(6);
  for (const property of properties) {
    expect(
      property.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ReadonlyKeyword
      ),
      `${propertyName(property.name) ?? "<computed>"}: readonly prepared field`
    ).toBe(true);
    expect(property.questionToken, "prepared fields are required").toBeUndefined();
    expect(
      ts.isComputedPropertyName(property.name),
      "prepared fields have static names"
    ).toBe(false);
  }
  expectPreparedPropertyImportedType(
    source,
    checker,
    properties,
    "runtimeHandle",
    "./runtime-factory.js",
    "LocalRuntimeHandle"
  );
  expectPreparedPropertyImportedType(
    source,
    checker,
    properties,
    "wakeRuntime",
    "./wake-supervisor-runtime.js",
    "WakeSupervisorRuntime"
  );
  expectPreparedPropertyImportedType(
    source,
    checker,
    properties,
    "authorityReadback",
    "./resident-loop-factory-composition.js",
    "ResidentLoopFactoryAuthorityReadback"
  );
  expectPreparedPropertyImportedType(
    source,
    checker,
    properties,
    "providerPosture",
    "./resident-loop-provider-posture.js",
    "ResidentLoopProviderPosture"
  );
  const domainExecution = properties.find(
    (property) => propertyName(property.name) === "domainExecution"
  );
  expect(
    domainExecution?.type?.kind,
    "prepared domain execution remains an opaque object"
  ).toBe(ts.SyntaxKind.ObjectKeyword);
  const nowMonotonicMs = properties.find(
    (property) => propertyName(property.name) === "nowMonotonicMs"
  );
  expect(
    nowMonotonicMs?.type !== undefined &&
      ts.isFunctionTypeNode(nowMonotonicMs.type),
    "prepared monotonic clock is a direct function type"
  ).toBe(true);
  if (
    nowMonotonicMs?.type === undefined ||
    !ts.isFunctionTypeNode(nowMonotonicMs.type)
  ) {
    throw new Error("prepared monotonic clock type is unavailable");
  }
  expect(nowMonotonicMs.type.parameters).toHaveLength(0);
  expect(nowMonotonicMs.type.type.kind).toBe(ts.SyntaxKind.NumberKeyword);
}

function expectPreparedPropertyImportedType(
  source: ts.SourceFile,
  checker: ts.TypeChecker,
  properties: readonly ts.PropertySignature[],
  propertyNameText: string,
  moduleSpecifier: string,
  importedName: string
): void {
  const property = properties.find(
    (candidate) => propertyName(candidate.name) === propertyNameText
  );
  expect(property, `${propertyNameText}: prepared property`).toBeDefined();
  const typeName = property?.type !== undefined &&
    ts.isTypeReferenceNode(property.type) &&
    ts.isIdentifier(property.type.typeName) &&
    property.type.typeArguments === undefined
    ? property.type.typeName
    : undefined;
  expect(typeName, `${propertyNameText}: direct imported type`).toBeDefined();
  const imports = directImports(source, moduleSpecifier).flatMap((declaration) => {
    const clause = declaration.importClause;
    if (clause?.namedBindings === undefined || !ts.isNamedImports(clause.namedBindings)) {
      return [];
    }
    return clause.namedBindings.elements.filter(
      (element) =>
        (element.propertyName ?? element.name).text === importedName &&
        (clause.isTypeOnly || element.isTypeOnly) &&
        element.propertyName === undefined &&
        element.name.text === importedName
    );
  });
  expect(
    imports,
    `${propertyNameText}: exact unaliased type import from ${moduleSpecifier}`
  ).toHaveLength(1);
  expect(
    typeName !== undefined &&
      checker.getSymbolAtLocation(typeName) ===
        checker.getSymbolAtLocation(imports[0]!.name),
    `${propertyNameText}: type resolves to its lawful module import`
  ).toBe(true);
}

function expectSingleLocalNamedCallWithin(
  source: ts.SourceFile,
  checker: ts.TypeChecker,
  body: ts.Block,
  localName: string
): ts.CallExpression {
  const declarations = source.statements.filter(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === localName
  );
  expect(declarations, `${localName}: sole local declaration`).toHaveLength(1);
  const declaration = declarations[0]!;
  if (declaration.name === undefined) throw new Error(`${localName} has no name`);
  const symbol = checker.getSymbolAtLocation(declaration.name);
  expect(symbol, `${localName}: local symbol`).toBeDefined();
  const calls: ts.CallExpression[] = [];
  const nonCallUses: ts.Identifier[] = [];
  visit(body, (node) => {
    if (
      ts.isIdentifier(node) &&
      checker.getSymbolAtLocation(node) === symbol
    ) {
      if (
        ts.isCallExpression(node.parent) &&
        node.parent.expression === node
      ) {
        calls.push(node.parent);
      } else {
        nonCallUses.push(node);
      }
    }
  });
  expect(calls, `${localName}: one direct factory call`).toHaveLength(1);
  expect(nonCallUses, `${localName}: no factory alias/carrier`).toEqual([]);
  return calls[0]!;
}

function expectExactPreparedNormalization(
  call: ts.CallExpression,
  inputName: string,
  expectedKeys: readonly string[]
): void {
  expect(call.arguments, "prepared normalization arguments").toHaveLength(2);
  expectExpressionPath(call.arguments[0], inputName, "prepared normalization input");
  const keys = unwrapExpression(call.arguments[1]!);
  expect(ts.isArrayLiteralExpression(keys), "prepared normalization exact key array").toBe(true);
  if (!ts.isArrayLiteralExpression(keys)) {
    throw new Error("prepared normalization key array is unavailable");
  }
  expect(
    keys.elements.every(ts.isStringLiteral),
    "prepared normalization keys are direct string literals"
  ).toBe(true);
  expect(
    keys.elements.map((element) => ts.isStringLiteral(element) ? element.text : "<nonliteral>"),
    "prepared normalization exact key order"
  ).toEqual(expectedKeys);
}

function expectInputUsedOnlyForNormalization(
  factory: ts.FunctionDeclaration,
  checker: ts.TypeChecker,
  normalizationCall: ts.CallExpression,
  parameter: ts.ParameterDeclaration | undefined
): void {
  const identifier = parameter !== undefined && ts.isIdentifier(parameter.name)
    ? parameter.name
    : undefined;
  const symbol = identifier === undefined
    ? undefined
    : checker.getSymbolAtLocation(identifier);
  expect(symbol, "prepared factory input parameter symbol").toBeDefined();
  const uses: ts.Identifier[] = [];
  if (factory.body !== undefined) {
    visit(factory.body, (node) => {
      if (
        ts.isIdentifier(node) &&
        checker.getSymbolAtLocation(node) === symbol
      ) {
        uses.push(node);
      }
    });
  }
  expect(uses, "raw factory input has one normalization use").toHaveLength(1);
  expect(
    normalizationCall.arguments[0] === uses[0],
    "raw factory input is used only as the direct normalization argument"
  ).toBe(true);
}

function expectNoForbiddenFactoryControlFlow(
  body: ts.Block,
  source: ts.SourceFile
): void {
  const matches: string[] = [];
  visit(body, (node) => {
    if (ts.isCatchClause(node)) matches.push(`catch:${node.getText(source)}`);
    if (ts.isCallExpression(node)) {
      if (node.questionDotToken !== undefined) {
        matches.push(`optional-call:${node.getText(source)}`);
      }
      if (node.arguments.some(ts.isSpreadElement)) {
        matches.push(`spread-call:${node.getText(source)}`);
      }
      if (
        ts.isPropertyAccessExpression(node.expression) &&
        ["call", "apply", "bind"].includes(node.expression.name.text)
      ) {
        matches.push(`indirect-call:${node.getText(source)}`);
      }
    }
  });
  expect(matches, "factory has no catch, optional/spread, or indirect call path").toEqual([]);
}

function expectStraightLineFactoryCall(
  call: ts.CallExpression,
  body: ts.Block,
  label: string
): ts.Statement {
  let current: ts.Node = call;
  while (current.parent !== body) {
    const parent = current.parent;
    expect(parent, `${label}: factory ancestry`).toBeDefined();
    if (parent === undefined) throw new Error(`${label} is outside the bounded factory`);
    const transparent =
      (
        (
          ts.isAwaitExpression(parent) ||
          ts.isParenthesizedExpression(parent) ||
          ts.isAsExpression(parent) ||
          ts.isSatisfiesExpression(parent) ||
          ts.isNonNullExpression(parent) ||
          ts.isTypeAssertionExpression(parent)
        ) &&
        parent.expression === current
      ) ||
      (
        ts.isVariableDeclaration(parent) &&
        parent.initializer === current
      ) ||
      (
        ts.isVariableDeclarationList(parent) &&
        ts.isVariableDeclaration(current) &&
        parent.declarations.length === 1 &&
        parent.declarations[0] === current
      ) ||
      (
        ts.isVariableStatement(parent) &&
        parent.declarationList === current
      ) ||
      (
        ts.isExpressionStatement(parent) &&
        parent.expression === current
      );
    expect(
      transparent,
      `${label} must use only transparent direct-statement ancestry`
    ).toBe(true);
    if (!transparent) {
      throw new Error(`${label} has non-direct ancestry ${ts.SyntaxKind[parent.kind]}`);
    }
    current = parent;
  }
  expect(ts.isStatement(current), `${label} must be retained by a direct factory statement`).toBe(true);
  if (!ts.isStatement(current)) throw new Error(`${label} is not retained by a statement`);
  return current;
}

function returnedObjectLiteral(
  expression: ts.Expression | undefined,
  checker: ts.TypeChecker
): ts.ObjectLiteralExpression | undefined {
  if (expression === undefined) return undefined;
  const unwrapped = unwrapExpression(expression);
  if (
    ts.isCallExpression(unwrapped) &&
    ts.isPropertyAccessExpression(unwrapped.expression) &&
    ts.isIdentifier(unwrapped.expression.expression) &&
    unwrapped.expression.expression.text === "Object" &&
    unwrapped.expression.name.text === "freeze" &&
    isTypeScriptLibrarySymbol(unwrapped.expression.expression, checker) &&
    isTypeScriptLibrarySymbol(unwrapped.expression.name, checker) &&
    unwrapped.arguments.length === 1
  ) {
    const argument = unwrapExpression(unwrapped.arguments[0]!);
    return ts.isObjectLiteralExpression(argument) ? argument : undefined;
  }
  return undefined;
}

function isTypeScriptLibrarySymbol(
  location: ts.Node,
  checker: ts.TypeChecker
): boolean {
  const symbol = checker.getSymbolAtLocation(location);
  if (symbol === undefined) return false;
  const defaultLibraryDirectory = resolve(
    ts.getDefaultLibFilePath({}),
    ".."
  );
  const declarations = resolveAliasSymbol(symbol, checker).declarations ?? [];
  return declarations.length > 0 && declarations.every((declaration) => {
    const source = declaration.getSourceFile();
    return source.isDeclarationFile &&
      source.hasNoDefaultLib &&
      resolve(source.fileName, "..") === defaultLibraryDirectory &&
      /(?:^|[\\/])lib(?:\.[^\\/]+)+\.d\.ts$/.test(source.fileName);
  });
}

function isExactMemoizedWakeRuntimeStop(
  expression: ts.Expression | undefined,
  factoryBody: ts.Block,
  preparedBinding: string,
  source: ts.SourceFile,
  checker: ts.TypeChecker
): boolean {
  if (expression === undefined) return false;
  const callable = returnedLocalCallable(
    expression,
    factoryBody,
    checker
  );
  if (callable === undefined) return false;
  if (
    callable.parameters.length !== 0 ||
    callable.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword
    ) === true
  ) {
    return false;
  }

  let memoization: ts.BinaryExpression | undefined;
  let returnedPromise: ts.Identifier | undefined;
  if (ts.isBlock(callable.body)) {
    if (callable.body.statements.length !== 2) return false;
    const assignmentStatement = callable.body.statements[0];
    const returnStatement = callable.body.statements[1];
    if (
      assignmentStatement === undefined ||
      !ts.isExpressionStatement(assignmentStatement) ||
      returnStatement === undefined ||
      !ts.isReturnStatement(returnStatement) ||
      returnStatement.expression === undefined
    ) {
      return false;
    }
    const assignment = unwrapExpression(assignmentStatement.expression);
    const returned = unwrapExpression(returnStatement.expression);
    if (!ts.isBinaryExpression(assignment) || !ts.isIdentifier(returned)) {
      return false;
    }
    memoization = assignment;
    returnedPromise = returned;
  } else {
    const candidate = unwrapExpression(callable.body);
    if (!ts.isBinaryExpression(candidate)) return false;
    memoization = candidate;
  }
  if (
    memoization.operatorToken.kind !== ts.SyntaxKind.QuestionQuestionEqualsToken ||
    !ts.isIdentifier(memoization.left)
  ) {
    return false;
  }
  const stopPromiseSymbol = checker.getSymbolAtLocation(memoization.left);
  if (
    stopPromiseSymbol === undefined ||
    (
      returnedPromise !== undefined &&
      checker.getSymbolAtLocation(returnedPromise) !== stopPromiseSymbol
    )
  ) {
    return false;
  }

  const stopCall = unwrapExpression(memoization.right);
  if (
    !ts.isCallExpression(stopCall) ||
    stopCall.questionDotToken !== undefined ||
    stopCall.arguments.length !== 0 ||
    !ts.isPropertyAccessExpression(stopCall.expression) ||
    stopCall.expression.questionDotToken !== undefined ||
    stopCall.expression.name.text !== "stop" ||
    expressionPath(unwrapExpression(stopCall.expression.expression)) !==
      `${preparedBinding}.wakeRuntime`
  ) {
    return false;
  }

  const declarations = factoryBody.statements.flatMap((statement) => {
    if (!ts.isVariableStatement(statement)) return [];
    return statement.declarationList.declarations.filter(
      (declaration) =>
        ts.isIdentifier(declaration.name) &&
        checker.getSymbolAtLocation(declaration.name) === stopPromiseSymbol
    ).map((declaration) => ({
      declaration,
      declarationList: statement.declarationList
    }));
  });
  if (
    declarations.length !== 1 ||
    declarations[0]!.declaration.initializer !== undefined ||
    (declarations[0]!.declarationList.flags & ts.NodeFlags.Let) === 0
  ) {
    return false;
  }

  const stopCalls: ts.CallExpression[] = [];
  const promiseUses: ts.Identifier[] = [];
  visit(factoryBody, (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "stop"
    ) {
      stopCalls.push(node);
    }
    if (
      ts.isIdentifier(node) &&
      checker.getSymbolAtLocation(node) === stopPromiseSymbol
    ) {
      promiseUses.push(node);
    }
  });
  const expectedPromiseUses = returnedPromise === undefined ? 2 : 3;
  return stopCalls.length === 1 &&
    stopCalls[0] === stopCall &&
    promiseUses.length === expectedPromiseUses &&
    stopCall.getSourceFile() === source;
}

function returnedLocalCallable(
  expression: ts.Expression,
  factoryBody: ts.Block,
  checker: ts.TypeChecker
): ts.ArrowFunction | ts.FunctionExpression | undefined {
  const unwrapped = unwrapExpression(expression);
  if (ts.isArrowFunction(unwrapped) || ts.isFunctionExpression(unwrapped)) {
    return unwrapped;
  }
  if (!ts.isIdentifier(unwrapped)) return undefined;
  const symbol = checker.getSymbolAtLocation(unwrapped);
  if (symbol === undefined) return undefined;
  const declarations = factoryBody.statements.flatMap((statement) => {
    if (!ts.isVariableStatement(statement)) return [];
    if ((statement.declarationList.flags & ts.NodeFlags.Const) === 0) return [];
    return statement.declarationList.declarations.filter(
      (declaration) =>
        ts.isIdentifier(declaration.name) &&
        checker.getSymbolAtLocation(declaration.name) === symbol
    );
  });
  if (declarations.length !== 1) return undefined;
  const initializer = declarations[0]!.initializer;
  if (initializer === undefined) return undefined;
  const callable = unwrapExpression(initializer);
  return ts.isArrowFunction(callable) || ts.isFunctionExpression(callable)
    ? callable
    : undefined;
}

function expectExactObjectArgument(
  call: ts.CallExpression,
  expected: Readonly<Record<string, string>>,
  label: string
): void {
  expect(call.arguments, `${label}: argument count`).toHaveLength(1);
  const argument = unwrapExpression(call.arguments[0]!);
  expect(ts.isObjectLiteralExpression(argument), `${label}: exact object literal`).toBe(true);
  if (!ts.isObjectLiteralExpression(argument)) throw new Error(`${label} is not an object literal`);
  const properties = new Map<string, ts.Expression>();
  for (const property of argument.properties) {
    expect(ts.isPropertyAssignment(property), `${label}: no spread/shorthand/method`).toBe(true);
    if (!ts.isPropertyAssignment(property)) throw new Error(`${label} has a non-property assignment`);
    const name = propertyName(property.name);
    expect(name, `${label}: static property name`).toBeDefined();
    if (name === undefined) throw new Error(`${label} has a computed property`);
    properties.set(name, property.initializer);
  }
  expect([...properties.keys()].sort(), `${label}: exact keys`).toEqual(Object.keys(expected).sort());
  for (const [name, path] of Object.entries(expected)) {
    expectExpressionPath(properties.get(name), path, `${label}.${name}`);
  }
}

function expectExactBoundedHRead(source: ts.SourceFile): void {
  const issuers: ts.FunctionDeclaration[] = [];
  const readCalls: ts.CallExpression[] = [];
  visit(source, (node) => {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.text === "createResidentBoundedAgentLoopFromIssuedCapabilities"
    ) {
      issuers.push(node);
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "readFull"
    ) {
      readCalls.push(node);
    }
  });
  expect(issuers, "sole bounded issuer declaration").toHaveLength(1);
  expect(issuers[0]?.parameters, "bounded issuer must not accept a structural port bag").toHaveLength(8);
  expect(readCalls, "exact H full-read call").toHaveLength(1);
  expectExactObjectArgument(readCalls[0]!, {
    taskId: "*.taskId",
    runId: "*.runId",
    authorityBinding: "*.authorityBinding"
  }, "H readFull input");
}

function assignedIdentifier(call: ts.CallExpression): string {
  let current: ts.Expression = call;
  let parent = current.parent;
  while (
    parent !== undefined &&
    (
      ts.isAwaitExpression(parent) ||
      ts.isParenthesizedExpression(parent) ||
      ts.isAsExpression(parent) ||
      ts.isSatisfiesExpression(parent)
    )
  ) {
    current = parent;
    parent = current.parent;
  }
  expect(parent !== undefined && ts.isVariableDeclaration(parent), "call result must be retained once").toBe(true);
  if (parent === undefined || !ts.isVariableDeclaration(parent) || !ts.isIdentifier(parent.name)) {
    throw new Error("call result is not retained in one identifier");
  }
  return parent.name.text;
}

function expectExpressionPath(
  expression: ts.Expression | undefined,
  expected: string,
  label: string
): void {
  expect(expression, label).toBeDefined();
  if (expression === undefined) throw new Error(`${label} is unavailable`);
  const actual = expressionPath(unwrapExpression(expression));
  const matches = expected.startsWith("*.")
    ? actual?.endsWith(expected.slice(1)) === true
    : expected.endsWith(".*")
      ? actual?.startsWith(expected.slice(0, -1)) === true
      : actual === expected;
  expect(matches, `${label}: ${actual ?? "<non-path>"}`).toBe(true);
}

function expressionPath(expression: ts.Expression): string | undefined {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) {
    const prefix = expressionPath(unwrapExpression(expression.expression));
    return prefix === undefined ? undefined : `${prefix}.${expression.name.text}`;
  }
  if (
    ts.isElementAccessExpression(expression) &&
    expression.argumentExpression !== undefined &&
    ts.isStringLiteral(expression.argumentExpression)
  ) {
    const prefix = expressionPath(unwrapExpression(expression.expression));
    return prefix === undefined ? undefined : `${prefix}.${expression.argumentExpression.text}`;
  }
  return undefined;
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isAwaitExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function propertyName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return undefined;
}

function expectSymbolUsedOnlyAsDirectCall(
  source: ts.SourceFile,
  checker: ts.TypeChecker,
  binding: ts.Identifier,
  label: string
): void {
  const symbol = checker.getSymbolAtLocation(binding);
  expect(symbol, `${label}:binding`).toBeDefined();
  const uses: ts.Identifier[] = [];
  visit(source, (node) => {
    if (
      ts.isIdentifier(node) &&
      node !== binding &&
      checker.getSymbolAtLocation(node) === symbol
    ) {
      uses.push(node);
    }
  });
  expect(uses, `${label}:uses`).toHaveLength(1);
  const use = uses[0]!;
  expect(
    ts.isCallExpression(use.parent) && use.parent.expression === use,
    `${label} must be used only as the direct callee`
  ).toBe(true);
}

function expectNoHandoffReachThrough(
  source: ts.SourceFile,
  checker: ts.TypeChecker
): void {
  const handoffImports = directImports(
    source,
    permittedResidentImports.factoryPorts.handoffBuilder.moduleSpecifier
  );
  const localBinding = handoffImports[0]?.importClause?.name;
  const localSymbol = localBinding === undefined
    ? undefined
    : checker.getSymbolAtLocation(localBinding);
  for (const statement of source.statements) {
    if (ts.isExportDeclaration(statement)) {
      const specifier = statement.moduleSpecifier;
      expect(
        specifier === undefined ||
          !ts.isStringLiteral(specifier) ||
          specifier.text !== permittedResidentImports.factoryPorts.handoffBuilder.moduleSpecifier,
        "R must not re-export H"
      ).toBe(true);
      if (statement.exportClause !== undefined && ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          const reference = element.propertyName ?? element.name;
          expect(
            localSymbol === undefined || checker.getSymbolAtLocation(reference) !== localSymbol,
            "R must not re-export its default H binding"
          ).toBe(true);
        }
      }
    }
    if (
      ts.isExportAssignment(statement) &&
      ts.isIdentifier(statement.expression)
    ) {
      expect(
        localSymbol === undefined ||
          checker.getSymbolAtLocation(statement.expression) !== localSymbol,
        "R must not default-export its H binding"
      ).toBe(true);
    }
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const moduleSpecifier = statement.moduleSpecifier.text;
    expect(moduleSpecifier, "R must not import the agent barrel").not.toMatch(/(?:^|\/)(?:index)\.js$/);
    if (moduleSpecifier !== permittedResidentImports.factoryPorts.handoffBuilder.moduleSpecifier) continue;
    expect(statement.importClause?.namedBindings, "H must be default-imported only").toBeUndefined();
  }
}

function expectNoModuleEdge(source: ts.SourceFile, forbidden: RegExp): void {
  const matches: string[] = [];
  visit(source, (node) => {
    if (
      (
        ts.isImportDeclaration(node) ||
        ts.isExportDeclaration(node)
      ) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      forbidden.test(node.moduleSpecifier.text)
    ) {
      matches.push(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] !== undefined &&
      ts.isStringLiteral(node.arguments[0]) &&
      forbidden.test(node.arguments[0].text)
    ) {
      matches.push(node.arguments[0].text);
    }
  });
  expect(matches, `forbidden module edge ${forbidden}`).toEqual([]);
}

function expectNoAgentBarrelExposure(
  source: ts.SourceFile,
  checker: ts.TypeChecker,
  boundedSourcePath: string,
  handoffSourcePath: string,
  forbidden: RegExp
): void {
  const moduleSymbol = checker.getSymbolAtLocation(source);
  expect(moduleSymbol, "agent barrel module symbol").toBeDefined();
  if (moduleSymbol === undefined) throw new Error("agent barrel module symbol is unavailable");

  const boundedAbsolute = resolve(boundedSourcePath);
  const handoffAbsolute = resolve(handoffSourcePath);
  const exposed: string[] = [];
  for (const exported of checker.getExportsOfModule(moduleSymbol)) {
    const target = resolveAliasSymbol(exported, checker);
    const targetNames = new Set([
      exported.getName(),
      target.getName(),
      ...(target.declarations ?? []).flatMap(declarationNames)
    ]);
    const declarations = target.declarations ?? [];
    const fromBounded = declarations.some(
      (declaration) => resolve(declaration.getSourceFile().fileName) === boundedAbsolute
    );
    const internalFromHandoff = declarations.some(
      (declaration) => resolve(declaration.getSourceFile().fileName) === handoffAbsolute
    ) && [...targetNames].some((name) => forbidden.test(name));
    if (
      fromBounded ||
      internalFromHandoff ||
      [...targetNames].some((name) => forbidden.test(name))
    ) {
      exposed.push(`${exported.getName()}=>${target.getName()}`);
    }
  }
  expect(
    exposed,
    "agent barrel must not expose R, dispatcher capability, or internal H symbols through direct, aliased, or star exports"
  ).toEqual([]);
}

function declarationNames(declaration: ts.Declaration): readonly string[] {
  const named = declaration as ts.Declaration & { readonly name?: ts.DeclarationName };
  if (named.name === undefined) return [];
  if (ts.isIdentifier(named.name) || ts.isStringLiteral(named.name)) {
    return [named.name.text];
  }
  return [];
}

function resolveAliasSymbol(symbol: ts.Symbol, checker: ts.TypeChecker): ts.Symbol {
  let current = symbol;
  const seen = new Set<ts.Symbol>();
  while ((current.flags & ts.SymbolFlags.Alias) !== 0 && !seen.has(current)) {
    seen.add(current);
    const target = checker.getAliasedSymbol(current);
    if (target === current) break;
    current = target;
  }
  return current;
}

function expectNoActivationSurfaceReference(
  source: ts.SourceFile,
  label: string
): void {
  const forbidden = /resident-loop-factory-ports|bounded-agent-loop|createResidentBoundedAgentLoopFactory/;
  const matches: string[] = [];
  visit(source, (node) => {
    if (
      (
        ts.isIdentifier(node) ||
        ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node)
      ) &&
      forbidden.test(node.text)
    ) {
      matches.push(node.text);
    }
    if (ts.isTemplateExpression(node)) {
      const fragments = [
        node.head.text,
        ...node.templateSpans.map((span) => span.literal.text)
      ];
      matches.push(...fragments.filter((fragment) => forbidden.test(fragment)));
    }
  });
  expect(matches, `${label}: forbidden bounded-factory surface references`).toEqual([]);
}

function expectNoActivationSymbolOrigin(
  source: ts.SourceFile,
  checker: ts.TypeChecker,
  forbiddenSourcePaths: readonly string[],
  label: string
): void {
  const forbidden = new Set(forbiddenSourcePaths.map((path) => resolve(path)));
  const matches = new Set<string>();
  visit(source, (node) => {
    if (!ts.isIdentifier(node)) return;
    const symbol = checker.getSymbolAtLocation(node);
    if (symbol === undefined) return;
    const target = resolveAliasSymbol(symbol, checker);
    if (
      (target.declarations ?? []).some(
        (declaration) => forbidden.has(resolve(declaration.getSourceFile().fileName))
      )
    ) {
      matches.add(`${node.text}=>${target.getName()}`);
    }
  });
  expect(
    [...matches],
    `${label}: activation must not reach factory/R through imported aliases or barrel origins`
  ).toEqual([]);
}

function expectNoDynamicLoaderSyntax(source: ts.SourceFile, label: string): void {
  const matches: string[] = [];
  visit(source, (node) => {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      matches.push("import()");
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      ["require", "eval", "Function"].includes(node.expression.text)
    ) {
      matches.push(`${node.expression.text}()`);
    }
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "Function"
    ) {
      matches.push("new Function()");
    }
  });
  expect(matches, `${label}:dynamic/evaluator syntax`).toEqual([]);
}

function expectNoIdentifier(source: ts.SourceFile, forbidden: string): void {
  const matches: ts.Identifier[] = [];
  visit(source, (node) => {
    if (ts.isIdentifier(node) && node.text === forbidden) matches.push(node);
  });
  expect(matches, `forbidden identifier ${forbidden}`).toHaveLength(0);
}

function expectNoGenericWakeConstructor(source: ts.SourceFile): void {
  const matches: ts.Node[] = [];
  visit(source, (node) => {
    if (
      (ts.isIdentifier(node) && node.text === "createWakeSupervisorRuntime") ||
      (ts.isPropertyAccessExpression(node) && node.name.text === "createWakeSupervisorRuntime") ||
      (
        ts.isImportSpecifier(node) &&
        (node.propertyName ?? node.name).text === "createWakeSupervisorRuntime"
      )
    ) {
      matches.push(node);
    }
  });
  expect(matches, "R must consume the prepared wake runtime, not construct a generic one").toHaveLength(0);
}

function expectNoForbiddenFactoryHeuristics(source: ts.SourceFile): void {
  const matches: string[] = [];
  visit(source, (node) => {
    if (
      ts.isPropertyAccessExpression(node) &&
      ["caller", "callee", "stack"].includes(node.name.text)
    ) {
      matches.push(node.getText(source));
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      (
        (
          node.expression.name.text === "now" &&
          ts.isIdentifier(node.expression.expression) &&
          ["Date", "performance"].includes(node.expression.expression.text)
        ) ||
        (
          node.expression.name.text === "hrtime" &&
          ts.isIdentifier(node.expression.expression) &&
          node.expression.expression.text === "process"
        ) ||
        node.expression.name.text === "toString"
      )
    ) {
      matches.push(node.getText(source));
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(node.left) &&
      ts.isIdentifier(node.left.expression) &&
      node.left.expression.text === "globalThis"
    ) {
      matches.push(node.getText(source));
    }
  });
  expect(matches, "factory/loop must not infer authority from timing, caller, source, stack, or globals").toEqual([]);
}

function visit(node: ts.Node, inspect: (node: ts.Node) => void): void {
  inspect(node);
  node.forEachChild((child) => visit(child, inspect));
}
