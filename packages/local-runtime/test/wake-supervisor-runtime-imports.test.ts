import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import ts from "typescript";

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
  mountedStore: {
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

type LocalTypeDeclaration = ts.TypeAliasDeclaration | ts.InterfaceDeclaration;

function localTypeDeclarations(
  sourceFile: ts.SourceFile
): ReadonlyMap<string, LocalTypeDeclaration> {
  const declarations = new Map<string, LocalTypeDeclaration>();
  for (const statement of sourceFile.statements) {
    if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) {
      declarations.set(statement.name.text, statement);
    }
  }
  return declarations;
}

function typeContainsCallable(
  type: ts.TypeNode,
  declarations: ReadonlyMap<string, LocalTypeDeclaration>,
  resolving: ReadonlySet<string> = new Set()
): boolean {
  const containsInParameter = (parameter: ts.ParameterDeclaration): boolean =>
    parameter.type !== undefined &&
    typeContainsCallable(parameter.type, declarations, resolving);
  const containsInMember = (member: ts.TypeElement): boolean => {
    if (
      ts.isCallSignatureDeclaration(member) ||
      ts.isConstructSignatureDeclaration(member) ||
      ts.isMethodSignature(member)
    ) {
      return true;
    }
    if (ts.isPropertySignature(member) || ts.isIndexSignatureDeclaration(member)) {
      return member.type !== undefined &&
        typeContainsCallable(member.type, declarations, resolving);
    }
    return false;
  };
  const containsInChildren = (node: ts.Node): boolean => {
    let found = false;
    ts.forEachChild(node, (child) => {
      if (!found && ts.isTypeNode(child)) {
        found = typeContainsCallable(child, declarations, resolving);
      }
    });
    return found;
  };

  if (ts.isFunctionTypeNode(type) || ts.isConstructorTypeNode(type)) {
    return true;
  }
  if (ts.isParenthesizedTypeNode(type)) {
    return typeContainsCallable(type.type, declarations, resolving);
  }
  if (ts.isArrayTypeNode(type)) {
    return typeContainsCallable(type.elementType, declarations, resolving);
  }
  if (ts.isTupleTypeNode(type)) {
    return type.elements.some((element) =>
      typeContainsCallable(
        ts.isNamedTupleMember(element) ? element.type : element,
        declarations,
        resolving
      )
    );
  }
  if (ts.isUnionTypeNode(type) || ts.isIntersectionTypeNode(type)) {
    return type.types.some((member) =>
      typeContainsCallable(member, declarations, resolving)
    );
  }
  if (ts.isTypeLiteralNode(type)) {
    return type.members.some(containsInMember);
  }
  if (ts.isTypeReferenceNode(type)) {
    if (
      type.typeArguments?.some((argument) =>
        typeContainsCallable(argument, declarations, resolving)
      ) === true
    ) {
      return true;
    }
    if (!ts.isIdentifier(type.typeName)) return false;
    const name = type.typeName.text;
    const declaration = declarations.get(name);
    if (declaration === undefined || resolving.has(name)) return false;
    const nextResolving = new Set(resolving);
    nextResolving.add(name);
    if (ts.isTypeAliasDeclaration(declaration)) {
      return typeContainsCallable(declaration.type, declarations, nextResolving);
    }
    return declaration.members.some((member) => {
      if (
        ts.isCallSignatureDeclaration(member) ||
        ts.isConstructSignatureDeclaration(member) ||
        ts.isMethodSignature(member)
      ) {
        return true;
      }
      if (ts.isPropertySignature(member) || ts.isIndexSignatureDeclaration(member)) {
        return member.type !== undefined &&
          typeContainsCallable(member.type, declarations, nextResolving);
      }
      return false;
    }) || declaration.heritageClauses?.some((clause) =>
      clause.types.some((heritage) =>
        heritage.typeArguments?.some((argument) =>
          typeContainsCallable(argument, declarations, nextResolving)
        ) === true ||
        (
          ts.isIdentifier(heritage.expression) &&
          declarations.has(heritage.expression.text) &&
          typeContainsCallable(
            ts.factory.createTypeReferenceNode(heritage.expression.text),
            declarations,
            nextResolving
          )
        )
      )
    ) === true;
  }
  if (ts.isTypeOperatorNode(type)) {
    return typeContainsCallable(type.type, declarations, resolving);
  }
  if (ts.isConditionalTypeNode(type)) {
    return [
      type.checkType,
      type.extendsType,
      type.trueType,
      type.falseType
    ].some((member) => typeContainsCallable(member, declarations, resolving));
  }
  if (ts.isIndexedAccessTypeNode(type)) {
    return typeContainsCallable(type.objectType, declarations, resolving) ||
      typeContainsCallable(type.indexType, declarations, resolving);
  }
  if (ts.isMappedTypeNode(type)) {
    return [
      type.typeParameter.constraint,
      type.typeParameter.default,
      type.nameType,
      type.type
    ].some((member) =>
      member !== undefined &&
      typeContainsCallable(member, declarations, resolving)
    );
  }
  if (ts.isOptionalTypeNode(type) || ts.isRestTypeNode(type)) {
    return typeContainsCallable(type.type, declarations, resolving);
  }
  if (ts.isTypePredicateNode(type)) {
    return type.type !== undefined &&
      typeContainsCallable(type.type, declarations, resolving);
  }
  if (ts.isInferTypeNode(type)) {
    return type.typeParameter.constraint !== undefined &&
      typeContainsCallable(type.typeParameter.constraint, declarations, resolving);
  }
  if (ts.isImportTypeNode(type)) {
    return type.typeArguments?.some((argument) =>
      typeContainsCallable(argument, declarations, resolving)
    ) === true;
  }
  if (
    "parameters" in type &&
    Array.isArray(type.parameters) &&
    type.parameters.some((parameter) =>
      ts.isParameter(parameter) && containsInParameter(parameter)
    )
  ) {
    return true;
  }
  return containsInChildren(type);
}

function productionTypeScriptFiles(root: string): readonly string[] {
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "test" && entry.name !== "dist" && entry.name !== "node_modules") {
          visit(path);
        }
      } else if (
        entry.isFile() &&
        path.endsWith(".ts") &&
        !path.endsWith(".test.ts") &&
        path.includes(`${join("src", "")}`)
      ) {
        files.push(path);
      }
    }
  };
  visit(root);
  return files.sort();
}

function sourceLabel(packagesRoot: string, path: string): string {
  return `packages/${relative(packagesRoot, path).replaceAll("\\", "/")}`;
}

interface FixedConstructorUseAnalysis {
  readonly dispatcherRuntimeReferenceCount: number;
  readonly dispatcherBinderCallCount: number;
  readonly gatewayRuntimeReferenceCount: number;
  readonly gatewayConstructorCallCount: number;
}

function fixedConstructorUseAnalysis(
  sourceFile: ts.SourceFile,
  dispatcherLocal: string | null,
  gatewayLocal: string | null
): FixedConstructorUseAnalysis {
  let dispatcherRuntimeReferenceCount = 0;
  let dispatcherBinderCallCount = 0;
  let gatewayRuntimeReferenceCount = 0;
  let gatewayConstructorCallCount = 0;
  visit(sourceFile);
  return {
    dispatcherRuntimeReferenceCount,
    dispatcherBinderCallCount,
    gatewayRuntimeReferenceCount,
    gatewayConstructorCallCount
  };

  function visit(node: ts.Node): void {
    if (
      ts.isIdentifier(node) &&
      !(
        ts.isImportClause(node.parent) ||
        ts.isImportSpecifier(node.parent)
      )
    ) {
      if (dispatcherLocal !== null && node.text === dispatcherLocal) {
        dispatcherRuntimeReferenceCount += 1;
        if (
          ts.isPropertyAccessExpression(node.parent) &&
          node.parent.expression === node &&
          node.parent.questionDotToken === undefined &&
          node.parent.name.text ===
            "bindPackageOwnedResidentDomainExecutionPort" &&
          ts.isCallExpression(node.parent.parent) &&
          node.parent.parent.expression === node.parent &&
          node.parent.parent.questionDotToken === undefined &&
          node.parent.parent.arguments.length === 1 &&
          !node.parent.parent.arguments.some(ts.isSpreadElement) &&
          isInsideMountedStoreBinder(node.parent.parent)
        ) {
          dispatcherBinderCallCount += 1;
        }
      }
      if (gatewayLocal !== null && node.text === gatewayLocal) {
        gatewayRuntimeReferenceCount += 1;
        if (
          ts.isCallExpression(node.parent) &&
          node.parent.expression === node &&
          node.parent.questionDotToken === undefined &&
          node.parent.arguments.length === 1 &&
          !ts.isSpreadElement(node.parent.arguments[0]!) &&
          isInsideMountedStoreBinder(node.parent)
        ) {
          gatewayConstructorCallCount += 1;
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  function isInsideMountedStoreBinder(node: ts.Node): boolean {
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
}

interface MountedBinderSource {
  readonly sourceFile: ts.SourceFile;
  readonly label: string;
}

interface MountedBinderCall {
  readonly file: string;
  readonly argumentCount: number;
}

interface MountedBinderOwnershipAnalysis {
  readonly binderImporters: readonly string[];
  readonly binderCalls: readonly MountedBinderCall[];
  readonly violations: readonly string[];
}

const mountedBinderName =
  "bindMountedResidentLoopAuthorityForFactory";
const mountedBinderModule =
  "./mounted-wake-lifecycle-store.js";
const mountedBinderWakePath =
  "packages/local-runtime/src/wake-supervisor-runtime.ts";
const mountedBinderRegistrarName =
  "bindResidentLoopCapabilitiesForFactory";
const mountedBinderRegistrarParameters = [
  "wakeRuntime",
  "binding",
  "domainExecution"
] as const;

function mountedBinderOwnershipAnalysis(
  program: ts.Program,
  sources: readonly MountedBinderSource[]
): MountedBinderOwnershipAnalysis {
  const checker = program.getTypeChecker();
  const binderImporters = new Set<string>();
  const binderCalls: MountedBinderCall[] = [];
  const violations = new Set<string>();
  const exactImports: Array<{
    readonly source: MountedBinderSource;
    readonly element: ts.ImportSpecifier;
    readonly symbol: ts.Symbol | undefined;
  }> = [];

  for (const source of sources) {
    for (const statement of source.sourceFile.statements) {
      if (
        ts.isImportDeclaration(statement) &&
        ts.isStringLiteral(statement.moduleSpecifier) &&
        isMountedBinderModule(statement.moduleSpecifier.text)
      ) {
        const clause = statement.importClause;
        const bindings = clause?.namedBindings;
        const binderElements = bindings !== undefined &&
          ts.isNamedImports(bindings)
          ? bindings.elements.filter((element) =>
              (element.propertyName?.text ?? element.name.text) ===
                mountedBinderName
            )
          : [];
        const alternateCarrier =
          clause?.name !== undefined ||
          (bindings !== undefined && ts.isNamespaceImport(bindings));
        if (binderElements.length > 0 || alternateCarrier) {
          binderImporters.add(source.label);
        }
        if (alternateCarrier) {
          reject(source.label);
        }
        for (const element of binderElements) {
          const exact =
            source.label === mountedBinderWakePath &&
            statement.moduleSpecifier.text === mountedBinderModule &&
            clause !== undefined &&
            clause.isTypeOnly === false &&
            clause.name === undefined &&
            bindings !== undefined &&
            ts.isNamedImports(bindings) &&
            statement.attributes === undefined &&
            element.isTypeOnly === false &&
            element.propertyName === undefined &&
            element.name.text === mountedBinderName;
          if (!exact) {
            reject(source.label);
            continue;
          }
          exactImports.push({
            source,
            element,
            symbol: checker.getSymbolAtLocation(element.name)
          });
        }
      } else if (
        ts.isImportEqualsDeclaration(statement) &&
        ts.isExternalModuleReference(statement.moduleReference) &&
        statement.moduleReference.expression !== undefined &&
        ts.isStringLiteral(statement.moduleReference.expression) &&
        isMountedBinderModule(statement.moduleReference.expression.text)
      ) {
        binderImporters.add(source.label);
        reject(source.label);
      } else if (
        ts.isExportDeclaration(statement) &&
        statement.moduleSpecifier !== undefined &&
        ts.isStringLiteral(statement.moduleSpecifier) &&
        isMountedBinderModule(statement.moduleSpecifier.text)
      ) {
        binderImporters.add(source.label);
        reject(source.label);
      }
    }

    visitDynamicImports(source.sourceFile, source.label);
  }

  if (exactImports.length !== 1) {
    reject(mountedBinderWakePath);
  } else {
    const exactImport = exactImports[0]!;
    const { symbol } = exactImport;
    if (
      symbol === undefined ||
      symbol.declarations?.length !== 1 ||
      symbol.declarations[0] !== exactImport.element
    ) {
      reject(exactImport.source.label);
    } else {
      const references: Array<{
        readonly source: MountedBinderSource;
        readonly identifier: ts.Identifier;
      }> = [];
      for (const source of sources) {
        visitReferences(source);
      }
      const calls = references.filter(({ source, identifier }) =>
        source.label === mountedBinderWakePath &&
        ts.isCallExpression(identifier.parent) &&
        identifier.parent.expression === identifier &&
        identifier.parent.questionDotToken === undefined &&
        identifier.parent.arguments.length === 3 &&
        !identifier.parent.arguments.some(ts.isSpreadElement) &&
        hasExactMountedBinderArguments(identifier.parent, source.sourceFile)
      );
      if (references.length !== 1 || calls.length !== 1) {
        reject(exactImport.source.label);
      } else {
        const call = calls[0]!.identifier.parent as ts.CallExpression;
        binderCalls.push({
          file: calls[0]!.source.label,
          argumentCount: call.arguments.length
        });
      }

      function visitReferences(source: MountedBinderSource): void {
        visit(source.sourceFile);

        function visit(node: ts.Node): void {
          if (
            ts.isIdentifier(node) &&
            node !== exactImport.element.name &&
            checker.getSymbolAtLocation(node) === symbol
          ) {
            references.push({ source, identifier: node });
          }
          if (
            ts.isCallExpression(node) &&
            isMountedBinderLikeCall(node) &&
            !(
              ts.isIdentifier(node.expression) &&
              checker.getSymbolAtLocation(node.expression) === symbol
            )
          ) {
            reject(source.label);
          }
          ts.forEachChild(node, visit);
        }
      }
    }
  }

  function exactWakeRegistrarForCall(
    call: ts.CallExpression,
    sourceFile: ts.SourceFile
  ): ts.FunctionDeclaration | undefined {
    for (
      let current: ts.Node | undefined = call.parent;
      current !== undefined;
      current = current.parent
    ) {
      if (!ts.isFunctionLike(current)) continue;
      if (
        !ts.isFunctionDeclaration(current) ||
        current.parent !== sourceFile ||
        current.name?.text !== mountedBinderRegistrarName ||
        current.body === undefined ||
        current.asteriskToken !== undefined
      ) {
        return undefined;
      }
      const modifiers = current.modifiers ?? [];
      if (
        !modifiers.some((modifier) =>
          modifier.kind === ts.SyntaxKind.ExportKeyword
        ) ||
        modifiers.some((modifier) =>
          modifier.kind === ts.SyntaxKind.DefaultKeyword
        )
      ) {
        return undefined;
      }
      return current.parameters.length ===
        mountedBinderRegistrarParameters.length &&
        current.parameters.every((parameter, index) =>
          ts.isIdentifier(parameter.name) &&
          parameter.name.text === mountedBinderRegistrarParameters[index] &&
          parameter.dotDotDotToken === undefined &&
          parameter.questionToken === undefined &&
          parameter.initializer === undefined
        )
        ? current
        : undefined;
    }
    return undefined;
  }

  function hasExactMountedBinderArguments(
    call: ts.CallExpression,
    sourceFile: ts.SourceFile
  ): boolean {
    const registrar = exactWakeRegistrarForCall(call, sourceFile);
    if (registrar === undefined || registrar.body === undefined) return false;
    const [wakeParameter, bindingParameter, domainExecutionParameter] =
      registrar.parameters;
    if (
      wakeParameter === undefined ||
      bindingParameter === undefined ||
      domainExecutionParameter === undefined ||
      !ts.isIdentifier(wakeParameter.name) ||
      !ts.isIdentifier(bindingParameter.name) ||
      !ts.isIdentifier(domainExecutionParameter.name)
    ) {
      return false;
    }
    const wakeSymbol = checker.getSymbolAtLocation(wakeParameter.name);
    const bindingSymbol = checker.getSymbolAtLocation(bindingParameter.name);
    const domainExecutionSymbol =
      checker.getSymbolAtLocation(domainExecutionParameter.name);
    if (
      wakeSymbol === undefined ||
      bindingSymbol === undefined ||
      domainExecutionSymbol === undefined
    ) {
      return false;
    }

    const mapDeclarations = sourceFile.statements.flatMap((statement) => {
      if (
        !ts.isVariableStatement(statement) ||
        statement.modifiers?.some((modifier) =>
          modifier.kind === ts.SyntaxKind.ExportKeyword ||
          modifier.kind === ts.SyntaxKind.DefaultKeyword
        ) === true ||
        (statement.declarationList.flags & ts.NodeFlags.Const) === 0 ||
        statement.declarationList.declarations.length !== 1
      ) {
        return [];
      }
      const declaration = statement.declarationList.declarations[0]!;
      return ts.isIdentifier(declaration.name) &&
        declaration.name.text === "residentWakeRuntimeStates" &&
        declaration.initializer !== undefined &&
        ts.isNewExpression(declaration.initializer) &&
        ts.isIdentifier(declaration.initializer.expression) &&
        declaration.initializer.expression.text === "WeakMap" &&
        (declaration.initializer.arguments?.length ?? 0) === 0
        ? [declaration]
        : [];
    });
    if (mapDeclarations.length !== 1) return false;
    const mapDeclaration = mapDeclarations[0]!;
    if (!ts.isIdentifier(mapDeclaration.name)) return false;
    const mapSymbol = checker.getSymbolAtLocation(mapDeclaration.name);
    if (
      mapSymbol === undefined ||
      mapSymbol.declarations?.length !== 1 ||
      mapSymbol.declarations[0] !== mapDeclaration
    ) {
      return false;
    }

    const registrarBody = registrar.body;
    const privateMapSymbol = mapSymbol;
    const registrarWakeSymbol = wakeSymbol;
    const stateDeclarations: ts.VariableDeclaration[] = [];
    visitRegistrarStateDeclarations(registrarBody);
    function visitRegistrarStateDeclarations(node: ts.Node): void {
      if (
        node !== registrarBody &&
        ts.isFunctionLike(node)
      ) {
        return;
      }
      if (
        ts.isVariableDeclaration(node) &&
        ts.isVariableDeclarationList(node.parent) &&
        (node.parent.flags & ts.NodeFlags.Const) !== 0 &&
        node.parent.declarations.length === 1 &&
        ts.isIdentifier(node.name) &&
        node.initializer !== undefined &&
        isExactPrivateStateRead(
          node.initializer,
          privateMapSymbol,
          registrarWakeSymbol
        )
      ) {
        stateDeclarations.push(node);
      }
      ts.forEachChild(node, visitRegistrarStateDeclarations);
    }
    if (stateDeclarations.length !== 1) return false;
    const stateDeclaration = stateDeclarations[0]!;
    if (
      stateDeclaration.getStart(sourceFile) >= call.getStart(sourceFile) ||
      !ts.isIdentifier(stateDeclaration.name)
    ) {
      return false;
    }
    const stateSymbol = checker.getSymbolAtLocation(stateDeclaration.name);
    if (
      stateSymbol === undefined ||
      stateSymbol.declarations?.length !== 1 ||
      stateSymbol.declarations[0] !== stateDeclaration
    ) {
      return false;
    }

    const [storeArgument, bindingArgument, domainExecutionArgument] =
      call.arguments;
    return storeArgument !== undefined &&
      ts.isPropertyAccessExpression(storeArgument) &&
      storeArgument.questionDotToken === undefined &&
      storeArgument.name.text === "store" &&
      ts.isIdentifier(storeArgument.expression) &&
      checker.getSymbolAtLocation(storeArgument.expression) === stateSymbol &&
      bindingArgument !== undefined &&
      ts.isIdentifier(bindingArgument) &&
      checker.getSymbolAtLocation(bindingArgument) === bindingSymbol &&
      domainExecutionArgument !== undefined &&
      ts.isIdentifier(domainExecutionArgument) &&
      checker.getSymbolAtLocation(domainExecutionArgument) ===
        domainExecutionSymbol;
  }

  function isExactPrivateStateRead(
    initializer: ts.Expression,
    mapSymbol: ts.Symbol,
    wakeSymbol: ts.Symbol
  ): boolean {
    if (
      !ts.isCallExpression(initializer) ||
      initializer.questionDotToken !== undefined ||
      initializer.arguments.length !== 1 ||
      ts.isSpreadElement(initializer.arguments[0]!) ||
      !ts.isPropertyAccessExpression(initializer.expression) ||
      initializer.expression.questionDotToken !== undefined ||
      initializer.expression.name.text !== "get" ||
      !ts.isIdentifier(initializer.expression.expression) ||
      checker.getSymbolAtLocation(initializer.expression.expression) !==
        mapSymbol
    ) {
      return false;
    }
    const runtimeArgument = initializer.arguments[0]!;
    return ts.isIdentifier(runtimeArgument) &&
      checker.getSymbolAtLocation(runtimeArgument) === wakeSymbol;
  }

  return {
    binderImporters: [...binderImporters].sort(),
    binderCalls: binderCalls.sort((left, right) =>
      left.file.localeCompare(right.file)
    ),
    violations: [...violations].sort()
  };

  function reject(label: string): void {
    violations.add(`${label}: alternate mounted binder ownership`);
  }

  function visitDynamicImports(
    sourceFile: ts.SourceFile,
    label: string
  ): void {
    visit(sourceFile);

    function visit(node: ts.Node): void {
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments.length > 0 &&
        ts.isStringLiteral(node.arguments[0]!) &&
        isMountedBinderModule(node.arguments[0]!.text)
      ) {
        binderImporters.add(label);
        reject(label);
      }
      ts.forEachChild(node, visit);
    }
  }
}

function isMountedBinderModule(specifier: string): boolean {
  return specifier === mountedBinderModule ||
    specifier.endsWith("/mounted-wake-lifecycle-store.js");
}

function isMountedBinderLikeCall(node: ts.CallExpression): boolean {
  if (ts.isIdentifier(node.expression)) {
    return node.expression.text === mountedBinderName;
  }
  if (ts.isPropertyAccessExpression(node.expression)) {
    return node.expression.name.text === mountedBinderName;
  }
  return ts.isElementAccessExpression(node.expression) &&
    node.expression.argumentExpression !== undefined &&
    ts.isStringLiteral(node.expression.argumentExpression) &&
    node.expression.argumentExpression.text === mountedBinderName;
}

function mountedBinderControlAnalysis(
  text: string
): MountedBinderOwnershipAnalysis {
  const fileName = `/${mountedBinderWakePath}`;
  const options: ts.CompilerOptions = {
    module: ts.ModuleKind.ESNext,
    noResolve: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022
  };
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  const readFile = host.readFile.bind(host);
  host.fileExists = (path) => path === fileName || fileExists(path);
  host.readFile = (path) => path === fileName ? text : readFile(path);
  host.getSourceFile = (
    path,
    languageVersion,
    onError,
    shouldCreateNewSourceFile
  ) => path === fileName
    ? ts.createSourceFile(
        path,
        text,
        languageVersion,
        true,
        ts.ScriptKind.TS
      )
    : getSourceFile(
        path,
        languageVersion,
        onError,
        shouldCreateNewSourceFile
      );
  const program = ts.createProgram([fileName], options, host);
  const sourceFile = program.getSourceFile(fileName);
  if (sourceFile === undefined) {
    throw new Error("mounted binder control source missing");
  }
  return mountedBinderOwnershipAnalysis(program, [{
    sourceFile,
    label: mountedBinderWakePath
  }]);
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
    const mountedStoreSource = readFileSync(
      new URL("../src/mounted-wake-lifecycle-store.ts", import.meta.url),
      "utf8"
    );
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

    expect.soft(source).not.toContain(
      `from "${permittedResidentImports.mountedStore.dispatcherDefault}"`
    );
    expect.soft(source).not.toContain(
      `from "${permittedResidentImports.mountedStore.gatewayNamedConstructor}"`
    );
    expect.soft(mountedStoreSource).toContain(
      `from "${permittedResidentImports.mountedStore.dispatcherDefault}"`
    );
    expect.soft(mountedStoreSource).toContain(
      `from "${permittedResidentImports.mountedStore.gatewayNamedConstructor}"`
    );
    expect.soft(mountedStoreSource).toMatch(
      /import\s+\w+\s+from\s+"..\/..\/agent\/src\/domain-execution-dispatcher\.js"/
    );
    expect.soft(mountedStoreSource).toMatch(
      /import\s*\{[^}]*createResidentLoopToolGateway[^}]*\}\s*from\s+"..\/..\/agent\/src\/resident-loop-tool-gateway\.js"/s
    );
    const wakeFile = ts.createSourceFile(
      "wake-supervisor-runtime.ts",
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    );
    const mountedStoreFile = ts.createSourceFile(
      "mounted-wake-lifecycle-store.ts",
      mountedStoreSource,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    );
    const declarations = mountedStoreFile.statements.filter(
      (statement): statement is ts.FunctionDeclaration =>
        ts.isFunctionDeclaration(statement) &&
        statement.name?.text === "bindMountedResidentLoopAuthorityForFactory"
    );
    const declarationsByName = localTypeDeclarations(mountedStoreFile);
    const constructorParameterIndexes = declarations.flatMap((declaration) =>
      declaration.parameters.flatMap((parameter, index) =>
        index >= 3 &&
        parameter.type !== undefined &&
        typeContainsCallable(parameter.type, declarationsByName)
          ? [index]
          : []
      )
    );
    const analyzerProbe = ts.createSourceFile(
      "recursive-type-analyzer-probe.ts",
      `
        type Direct = (value: string) => void;
        type UnionWrapped = string | Direct;
        type IntersectionWrapped = { stable: string } & { callback: Direct };
        type TupleWrapped = readonly [string, Direct];
        type ArrayWrapped = readonly Direct[];
        type ObjectWrapped = { nested: { callback: Direct } };
        type CallWrapped = { (value: string): void };
        type MethodWrapped = { invoke(input: { callback: Direct }): void };
        type GenericWrapped = ReadonlyArray<ObjectWrapped>;
        type Safe = { readonly value: string };
      `,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    );
    const probeDeclarations = localTypeDeclarations(analyzerProbe);
    expect([
      "Direct",
      "UnionWrapped",
      "IntersectionWrapped",
      "TupleWrapped",
      "ArrayWrapped",
      "ObjectWrapped",
      "CallWrapped",
      "MethodWrapped",
      "GenericWrapped",
      "Safe"
    ].map((name) => {
      const declaration = probeDeclarations.get(name);
      if (declaration === undefined) return false;
      if (ts.isTypeAliasDeclaration(declaration)) {
        return typeContainsCallable(declaration.type, probeDeclarations);
      }
      return declaration.members.some((member) =>
        (
          ts.isCallSignatureDeclaration(member) ||
          ts.isConstructSignatureDeclaration(member) ||
          ts.isMethodSignature(member)
        ) ||
        (
          (ts.isPropertySignature(member) || ts.isIndexSignatureDeclaration(member)) &&
          member.type !== undefined &&
          typeContainsCallable(member.type, probeDeclarations)
        )
      );
    })).toEqual([true, true, true, true, true, true, true, true, true, false]);

    const dispatcherImports = mountedStoreFile.statements.flatMap((statement) => {
      if (
        !ts.isImportDeclaration(statement) ||
        !ts.isStringLiteral(statement.moduleSpecifier) ||
        statement.moduleSpecifier.text !==
          permittedResidentImports.mountedStore.dispatcherDefault
      ) {
        return [];
      }
      return [{
        defaultName: statement.importClause?.name?.text ?? null,
        hasNamedBindings: statement.importClause?.namedBindings !== undefined
      }];
    });
    const gatewayImports = mountedStoreFile.statements.flatMap((statement) => {
      if (
        !ts.isImportDeclaration(statement) ||
        !ts.isStringLiteral(statement.moduleSpecifier) ||
        statement.moduleSpecifier.text !==
          permittedResidentImports.mountedStore.gatewayNamedConstructor
      ) {
        return [];
      }
      const bindings = statement.importClause?.namedBindings;
      return [{
        defaultName: statement.importClause?.name?.text ?? null,
        named: bindings !== undefined && ts.isNamedImports(bindings)
          ? bindings.elements.map((element) => ({
              imported: element.propertyName?.text ?? element.name.text,
              local: element.name.text
            }))
          : [],
        hasNamespaceBinding: bindings !== undefined && ts.isNamespaceImport(bindings)
      }];
    });
    const fixedConstructorUse = fixedConstructorUseAnalysis(
      mountedStoreFile,
      dispatcherImports[0]?.defaultName ?? null,
      gatewayImports[0]?.named[0]?.local ?? null
    );
    const exactFixedConstruction = {
      dispatcherRuntimeReferenceCount: 1,
      dispatcherBinderCallCount: 1,
      gatewayRuntimeReferenceCount: 1,
      gatewayConstructorCallCount: 1
    };
    const fixedConstructionControl = (text: string) => {
      const control = ts.createSourceFile(
        "mounted-wake-lifecycle-store-control.ts",
        text,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS
      );
      return fixedConstructorUseAnalysis(
        control,
        "dispatcherDefault",
        "createResidentLoopToolGateway"
      );
    };
    expect(fixedConstructionControl(`
      import dispatcherDefault from "../../agent/src/domain-execution-dispatcher.js";
      import { createResidentLoopToolGateway } from "../../agent/src/resident-loop-tool-gateway.js";
      function bindMountedResidentLoopAuthorityForFactory() {
        dispatcherDefault.bindPackageOwnedResidentDomainExecutionPort(input);
        createResidentLoopToolGateway(input);
      }
    `)).toEqual(exactFixedConstruction);
    for (const [name, text] of [
      ["dispatcher alias", `
        import dispatcherDefault from "../../agent/src/domain-execution-dispatcher.js";
        import { createResidentLoopToolGateway } from "../../agent/src/resident-loop-tool-gateway.js";
        const bind = dispatcherDefault.bindPackageOwnedResidentDomainExecutionPort;
        function bindMountedResidentLoopAuthorityForFactory() {
          bind(input);
          createResidentLoopToolGateway(input);
        }
      `],
      ["gateway wrapper", `
        import dispatcherDefault from "../../agent/src/domain-execution-dispatcher.js";
        import { createResidentLoopToolGateway } from "../../agent/src/resident-loop-tool-gateway.js";
        const create = (input: unknown) => createResidentLoopToolGateway(input);
        function bindMountedResidentLoopAuthorityForFactory() {
          dispatcherDefault.bindPackageOwnedResidentDomainExecutionPort(input);
          create(input);
        }
      `],
      ["dispatcher zero-argument call", `
        import dispatcherDefault from "../../agent/src/domain-execution-dispatcher.js";
        import { createResidentLoopToolGateway } from "../../agent/src/resident-loop-tool-gateway.js";
        function bindMountedResidentLoopAuthorityForFactory() {
          dispatcherDefault.bindPackageOwnedResidentDomainExecutionPort();
          createResidentLoopToolGateway(input);
        }
      `],
      ["dispatcher two-argument call", `
        import dispatcherDefault from "../../agent/src/domain-execution-dispatcher.js";
        import { createResidentLoopToolGateway } from "../../agent/src/resident-loop-tool-gateway.js";
        function bindMountedResidentLoopAuthorityForFactory() {
          dispatcherDefault.bindPackageOwnedResidentDomainExecutionPort(
            firstBinding,
            secondBinding
          );
          createResidentLoopToolGateway(input);
        }
      `],
      ["dispatcher spread-argument call", `
        import dispatcherDefault from "../../agent/src/domain-execution-dispatcher.js";
        import { createResidentLoopToolGateway } from "../../agent/src/resident-loop-tool-gateway.js";
        function bindMountedResidentLoopAuthorityForFactory() {
          dispatcherDefault.bindPackageOwnedResidentDomainExecutionPort(
            ...bindings
          );
          createResidentLoopToolGateway(input);
        }
      `],
      ["dispatcher optional-property call", `
        import dispatcherDefault from "../../agent/src/domain-execution-dispatcher.js";
        import { createResidentLoopToolGateway } from "../../agent/src/resident-loop-tool-gateway.js";
        function bindMountedResidentLoopAuthorityForFactory() {
          dispatcherDefault?.bindPackageOwnedResidentDomainExecutionPort(input);
          createResidentLoopToolGateway(input);
        }
      `],
      ["dispatcher optional call", `
        import dispatcherDefault from "../../agent/src/domain-execution-dispatcher.js";
        import { createResidentLoopToolGateway } from "../../agent/src/resident-loop-tool-gateway.js";
        function bindMountedResidentLoopAuthorityForFactory() {
          dispatcherDefault.bindPackageOwnedResidentDomainExecutionPort?.(input);
          createResidentLoopToolGateway(input);
        }
      `],
      ["constructor carrier", `
        import dispatcherDefault from "../../agent/src/domain-execution-dispatcher.js";
        import { createResidentLoopToolGateway } from "../../agent/src/resident-loop-tool-gateway.js";
        const constructors = { dispatcherDefault, createResidentLoopToolGateway };
        function bindMountedResidentLoopAuthorityForFactory() {
          constructors.dispatcherDefault.bindPackageOwnedResidentDomainExecutionPort(input);
          constructors.createResidentLoopToolGateway(input);
        }
      `],
      ["duplicate constructors", `
        import dispatcherDefault from "../../agent/src/domain-execution-dispatcher.js";
        import { createResidentLoopToolGateway } from "../../agent/src/resident-loop-tool-gateway.js";
        function bindMountedResidentLoopAuthorityForFactory() {
          dispatcherDefault.bindPackageOwnedResidentDomainExecutionPort(input);
          dispatcherDefault.bindPackageOwnedResidentDomainExecutionPort(input);
          createResidentLoopToolGateway(input);
          createResidentLoopToolGateway(input);
        }
      `],
      ["out-of-binder calls", `
        import dispatcherDefault from "../../agent/src/domain-execution-dispatcher.js";
        import { createResidentLoopToolGateway } from "../../agent/src/resident-loop-tool-gateway.js";
        function alternateConstruction() {
          dispatcherDefault.bindPackageOwnedResidentDomainExecutionPort(input);
          createResidentLoopToolGateway(input);
        }
      `]
    ] as const) {
      expect.soft(
        fixedConstructionControl(text),
        name
      ).not.toEqual(exactFixedConstruction);
    }

    const exactBinderOwnership = {
      binderImporters: [mountedBinderWakePath],
      binderCalls: [{
        file: mountedBinderWakePath,
        argumentCount: 3
      }],
      violations: []
    };
    expect(mountedBinderControlAnalysis(`
      const residentWakeRuntimeStates =
        new WeakMap<object, { store: unknown }>();
      import {
        bindMountedResidentLoopAuthorityForFactory
      } from "./mounted-wake-lifecycle-store.js";
      export async function bindResidentLoopCapabilitiesForFactory(
        wakeRuntime: object,
        binding: unknown,
        domainExecution: unknown
      ) {
        const state = residentWakeRuntimeStates.get(wakeRuntime);
        if (state === undefined) throw new Error("missing state");
        return bindMountedResidentLoopAuthorityForFactory(
          state.store,
          binding,
          domainExecution
        );
      }
    `)).toEqual(exactBinderOwnership);
    for (const [name, text] of [
      ["prior wrong wake-runtime argument", `
        const residentWakeRuntimeStates =
          new WeakMap<object, { store: unknown }>();
        import {
          bindMountedResidentLoopAuthorityForFactory
        } from "./mounted-wake-lifecycle-store.js";
        export function bindResidentLoopCapabilitiesForFactory(
          wakeRuntime: object,
          binding: unknown,
          domainExecution: unknown
        ) {
          const state = residentWakeRuntimeStates.get(wakeRuntime);
          return bindMountedResidentLoopAuthorityForFactory(
            wakeRuntime,
            binding,
            domainExecution
          );
        }
      `],
      ["alternate private-state map", `
        const residentWakeRuntimeStates =
          new WeakMap<object, { store: unknown }>();
        const alternateStates =
          new WeakMap<object, { store: unknown }>();
        import {
          bindMountedResidentLoopAuthorityForFactory
        } from "./mounted-wake-lifecycle-store.js";
        export function bindResidentLoopCapabilitiesForFactory(
          wakeRuntime: object,
          binding: unknown,
          domainExecution: unknown
        ) {
          const state = alternateStates.get(wakeRuntime);
          return bindMountedResidentLoopAuthorityForFactory(
            state.store,
            binding,
            domainExecution
          );
        }
      `],
      ["state getter call", `
        const residentWakeRuntimeStates =
          new WeakMap<object, { store: unknown }>();
        const readState = (wakeRuntime: object) =>
          residentWakeRuntimeStates.get(wakeRuntime);
        import {
          bindMountedResidentLoopAuthorityForFactory
        } from "./mounted-wake-lifecycle-store.js";
        export function bindResidentLoopCapabilitiesForFactory(
          wakeRuntime: object,
          binding: unknown,
          domainExecution: unknown
        ) {
          const state = readState(wakeRuntime);
          return bindMountedResidentLoopAuthorityForFactory(
            state.store,
            binding,
            domainExecution
          );
        }
      `],
      ["alternate runtime state read", `
        const residentWakeRuntimeStates =
          new WeakMap<object, { store: unknown }>();
        import {
          bindMountedResidentLoopAuthorityForFactory
        } from "./mounted-wake-lifecycle-store.js";
        export function bindResidentLoopCapabilitiesForFactory(
          wakeRuntime: object,
          binding: unknown,
          domainExecution: unknown
        ) {
          const alternateRuntime = {};
          const state = residentWakeRuntimeStates.get(alternateRuntime);
          return bindMountedResidentLoopAuthorityForFactory(
            state.store,
            binding,
            domainExecution
          );
        }
      `],
      ["state identity alias", `
        const residentWakeRuntimeStates =
          new WeakMap<object, { store: unknown }>();
        import {
          bindMountedResidentLoopAuthorityForFactory
        } from "./mounted-wake-lifecycle-store.js";
        export function bindResidentLoopCapabilitiesForFactory(
          wakeRuntime: object,
          binding: unknown,
          domainExecution: unknown
        ) {
          const state = residentWakeRuntimeStates.get(wakeRuntime);
          const alias = state;
          return bindMountedResidentLoopAuthorityForFactory(
            alias.store,
            binding,
            domainExecution
          );
        }
      `],
      ["destructured state store", `
        const residentWakeRuntimeStates =
          new WeakMap<object, { store: unknown }>();
        import {
          bindMountedResidentLoopAuthorityForFactory
        } from "./mounted-wake-lifecycle-store.js";
        export function bindResidentLoopCapabilitiesForFactory(
          wakeRuntime: object,
          binding: unknown,
          domainExecution: unknown
        ) {
          const { store } = residentWakeRuntimeStates.get(wakeRuntime)!;
          return bindMountedResidentLoopAuthorityForFactory(
            store,
            binding,
            domainExecution
          );
        }
      `],
      ["shadowed state symbol", `
        const residentWakeRuntimeStates =
          new WeakMap<object, { store: unknown }>();
        import {
          bindMountedResidentLoopAuthorityForFactory
        } from "./mounted-wake-lifecycle-store.js";
        export function bindResidentLoopCapabilitiesForFactory(
          wakeRuntime: object,
          binding: unknown,
          domainExecution: unknown
        ) {
          const state = residentWakeRuntimeStates.get(wakeRuntime);
          {
            const state = { store: "foreign" };
            return bindMountedResidentLoopAuthorityForFactory(
              state.store,
              binding,
              domainExecution
            );
          }
        }
      `],
      ["optional private-map property read", `
        const residentWakeRuntimeStates =
          new WeakMap<object, { store: unknown }>();
        import {
          bindMountedResidentLoopAuthorityForFactory
        } from "./mounted-wake-lifecycle-store.js";
        export function bindResidentLoopCapabilitiesForFactory(
          wakeRuntime: object,
          binding: unknown,
          domainExecution: unknown
        ) {
          const state = residentWakeRuntimeStates?.get(wakeRuntime);
          return bindMountedResidentLoopAuthorityForFactory(
            state.store,
            binding,
            domainExecution
          );
        }
      `],
      ["optional private-map getter call", `
        const residentWakeRuntimeStates =
          new WeakMap<object, { store: unknown }>();
        import {
          bindMountedResidentLoopAuthorityForFactory
        } from "./mounted-wake-lifecycle-store.js";
        export function bindResidentLoopCapabilitiesForFactory(
          wakeRuntime: object,
          binding: unknown,
          domainExecution: unknown
        ) {
          const state = residentWakeRuntimeStates.get?.(wakeRuntime);
          return bindMountedResidentLoopAuthorityForFactory(
            state.store,
            binding,
            domainExecution
          );
        }
      `],
      ["property-chain private map", `
        const residentWakeRuntimeStates =
          new WeakMap<object, { store: unknown }>();
        const maps = { residentWakeRuntimeStates };
        import {
          bindMountedResidentLoopAuthorityForFactory
        } from "./mounted-wake-lifecycle-store.js";
        export function bindResidentLoopCapabilitiesForFactory(
          wakeRuntime: object,
          binding: unknown,
          domainExecution: unknown
        ) {
          const state = maps.residentWakeRuntimeStates.get(wakeRuntime);
          return bindMountedResidentLoopAuthorityForFactory(
            state.store,
            binding,
            domainExecution
          );
        }
      `],
      ["element-chain private map", `
        const residentWakeRuntimeStates =
          new WeakMap<object, { store: unknown }>();
        const maps = { residentWakeRuntimeStates };
        import {
          bindMountedResidentLoopAuthorityForFactory
        } from "./mounted-wake-lifecycle-store.js";
        export function bindResidentLoopCapabilitiesForFactory(
          wakeRuntime: object,
          binding: unknown,
          domainExecution: unknown
        ) {
          const state = maps["residentWakeRuntimeStates"].get(wakeRuntime);
          return bindMountedResidentLoopAuthorityForFactory(
            state.store,
            binding,
            domainExecution
          );
        }
      `],
      ["call-chain private map", `
        const residentWakeRuntimeStates =
          new WeakMap<object, { store: unknown }>();
        const getStates = () => residentWakeRuntimeStates;
        import {
          bindMountedResidentLoopAuthorityForFactory
        } from "./mounted-wake-lifecycle-store.js";
        export function bindResidentLoopCapabilitiesForFactory(
          wakeRuntime: object,
          binding: unknown,
          domainExecution: unknown
        ) {
          const state = getStates().get(wakeRuntime);
          return bindMountedResidentLoopAuthorityForFactory(
            state.store,
            binding,
            domainExecution
          );
        }
      `],
      ["duplicate exact state reads", `
        const residentWakeRuntimeStates =
          new WeakMap<object, { store: unknown }>();
        import {
          bindMountedResidentLoopAuthorityForFactory
        } from "./mounted-wake-lifecycle-store.js";
        export function bindResidentLoopCapabilitiesForFactory(
          wakeRuntime: object,
          binding: unknown,
          domainExecution: unknown
        ) {
          const firstState = residentWakeRuntimeStates.get(wakeRuntime);
          const secondState = residentWakeRuntimeStates.get(wakeRuntime);
          return bindMountedResidentLoopAuthorityForFactory(
            firstState.store,
            binding,
            domainExecution
          );
        }
      `],
      ["nested-block duplicate exact state read", `
        const residentWakeRuntimeStates =
          new WeakMap<object, { store: unknown }>();
        import {
          bindMountedResidentLoopAuthorityForFactory
        } from "./mounted-wake-lifecycle-store.js";
        export function bindResidentLoopCapabilitiesForFactory(
          wakeRuntime: object,
          binding: unknown,
          domainExecution: unknown
        ) {
          const state = residentWakeRuntimeStates.get(wakeRuntime);
          {
            const duplicateState =
              residentWakeRuntimeStates.get(wakeRuntime);
            void duplicateState;
          }
          return bindMountedResidentLoopAuthorityForFactory(
            state.store,
            binding,
            domainExecution
          );
        }
      `],
      ["state read after binder call", `
        const residentWakeRuntimeStates =
          new WeakMap<object, { store: unknown }>();
        import {
          bindMountedResidentLoopAuthorityForFactory
        } from "./mounted-wake-lifecycle-store.js";
        export function bindResidentLoopCapabilitiesForFactory(
          wakeRuntime: object,
          binding: unknown,
          domainExecution: unknown
        ) {
          const result = bindMountedResidentLoopAuthorityForFactory(
            state.store,
            binding,
            domainExecution
          );
          const state = residentWakeRuntimeStates.get(wakeRuntime);
          return result;
        }
      `],
      ["foreign store argument", `
        const residentWakeRuntimeStates =
          new WeakMap<object, { store: unknown }>();
        import {
          bindMountedResidentLoopAuthorityForFactory
        } from "./mounted-wake-lifecycle-store.js";
        export function bindResidentLoopCapabilitiesForFactory(
          wakeRuntime: object,
          binding: unknown,
          domainExecution: unknown
        ) {
          const state = residentWakeRuntimeStates.get(wakeRuntime);
          const foreignState = { store: state.store };
          return bindMountedResidentLoopAuthorityForFactory(
            foreignState.store,
            binding,
            domainExecution
          );
        }
      `],
      ["optional state store argument", `
        const residentWakeRuntimeStates =
          new WeakMap<object, { store: unknown }>();
        import {
          bindMountedResidentLoopAuthorityForFactory
        } from "./mounted-wake-lifecycle-store.js";
        export function bindResidentLoopCapabilitiesForFactory(
          wakeRuntime: object,
          binding: unknown,
          domainExecution: unknown
        ) {
          const state = residentWakeRuntimeStates.get(wakeRuntime);
          return bindMountedResidentLoopAuthorityForFactory(
            state?.store,
            binding,
            domainExecution
          );
        }
      `],
      ["element state store argument", `
        const residentWakeRuntimeStates =
          new WeakMap<object, { store: unknown }>();
        import {
          bindMountedResidentLoopAuthorityForFactory
        } from "./mounted-wake-lifecycle-store.js";
        export function bindResidentLoopCapabilitiesForFactory(
          wakeRuntime: object,
          binding: unknown,
          domainExecution: unknown
        ) {
          const state = residentWakeRuntimeStates.get(wakeRuntime);
          return bindMountedResidentLoopAuthorityForFactory(
            state["store"],
            binding,
            domainExecution
          );
        }
      `],
      ["property-chain state store argument", `
        const residentWakeRuntimeStates =
          new WeakMap<object, { store: { value: unknown } }>();
        import {
          bindMountedResidentLoopAuthorityForFactory
        } from "./mounted-wake-lifecycle-store.js";
        export function bindResidentLoopCapabilitiesForFactory(
          wakeRuntime: object,
          binding: unknown,
          domainExecution: unknown
        ) {
          const state = residentWakeRuntimeStates.get(wakeRuntime);
          return bindMountedResidentLoopAuthorityForFactory(
            state.store.value,
            binding,
            domainExecution
          );
        }
      `],
      ["object store argument", `
        const residentWakeRuntimeStates =
          new WeakMap<object, { store: unknown }>();
        import {
          bindMountedResidentLoopAuthorityForFactory
        } from "./mounted-wake-lifecycle-store.js";
        export function bindResidentLoopCapabilitiesForFactory(
          wakeRuntime: object,
          binding: unknown,
          domainExecution: unknown
        ) {
          const state = residentWakeRuntimeStates.get(wakeRuntime);
          return bindMountedResidentLoopAuthorityForFactory(
            { store: state.store },
            binding,
            domainExecution
          );
        }
      `],
      ["literal store argument", `
        const residentWakeRuntimeStates =
          new WeakMap<object, { store: unknown }>();
        import {
          bindMountedResidentLoopAuthorityForFactory
        } from "./mounted-wake-lifecycle-store.js";
        export function bindResidentLoopCapabilitiesForFactory(
          wakeRuntime: object,
          binding: unknown,
          domainExecution: unknown
        ) {
          const state = residentWakeRuntimeStates.get(wakeRuntime);
          return bindMountedResidentLoopAuthorityForFactory(
            "store",
            binding,
            domainExecution
          );
        }
      `],
      ["call-result store argument", `
        const residentWakeRuntimeStates =
          new WeakMap<object, { store: unknown }>();
        const readStore = () => "store";
        import {
          bindMountedResidentLoopAuthorityForFactory
        } from "./mounted-wake-lifecycle-store.js";
        export function bindResidentLoopCapabilitiesForFactory(
          wakeRuntime: object,
          binding: unknown,
          domainExecution: unknown
        ) {
          const state = residentWakeRuntimeStates.get(wakeRuntime);
          return bindMountedResidentLoopAuthorityForFactory(
            readStore(),
            binding,
            domainExecution
          );
        }
      `],
      ["reordered registrar arguments", `
        const residentWakeRuntimeStates =
          new WeakMap<object, { store: unknown }>();
        import {
          bindMountedResidentLoopAuthorityForFactory
        } from "./mounted-wake-lifecycle-store.js";
        export function bindResidentLoopCapabilitiesForFactory(
          wakeRuntime: object,
          binding: unknown,
          domainExecution: unknown
        ) {
          const state = residentWakeRuntimeStates.get(wakeRuntime);
          return bindMountedResidentLoopAuthorityForFactory(
            state.store,
            domainExecution,
            binding
          );
        }
      `],
      ["binding identity alias", `
        const residentWakeRuntimeStates =
          new WeakMap<object, { store: unknown }>();
        import {
          bindMountedResidentLoopAuthorityForFactory
        } from "./mounted-wake-lifecycle-store.js";
        export function bindResidentLoopCapabilitiesForFactory(
          wakeRuntime: object,
          binding: unknown,
          domainExecution: unknown
        ) {
          const state = residentWakeRuntimeStates.get(wakeRuntime);
          const bindingAlias = binding;
          return bindMountedResidentLoopAuthorityForFactory(
            state.store,
            bindingAlias,
            domainExecution
          );
        }
      `],
      ["domain-execution identity alias", `
        const residentWakeRuntimeStates =
          new WeakMap<object, { store: unknown }>();
        import {
          bindMountedResidentLoopAuthorityForFactory
        } from "./mounted-wake-lifecycle-store.js";
        export function bindResidentLoopCapabilitiesForFactory(
          wakeRuntime: object,
          binding: unknown,
          domainExecution: unknown
        ) {
          const state = residentWakeRuntimeStates.get(wakeRuntime);
          const domainAlias = domainExecution;
          return bindMountedResidentLoopAuthorityForFactory(
            state.store,
            binding,
            domainAlias
          );
        }
      `],
      ["shadowed binding parameter", `
        const residentWakeRuntimeStates =
          new WeakMap<object, { store: unknown }>();
        import {
          bindMountedResidentLoopAuthorityForFactory
        } from "./mounted-wake-lifecycle-store.js";
        export function bindResidentLoopCapabilitiesForFactory(
          wakeRuntime: object,
          binding: unknown,
          domainExecution: unknown
        ) {
          const state = residentWakeRuntimeStates.get(wakeRuntime);
          {
            const binding = "foreign";
            return bindMountedResidentLoopAuthorityForFactory(
              state.store,
              binding,
              domainExecution
            );
          }
        }
      `],
      ["shadowed domain-execution parameter", `
        const residentWakeRuntimeStates =
          new WeakMap<object, { store: unknown }>();
        import {
          bindMountedResidentLoopAuthorityForFactory
        } from "./mounted-wake-lifecycle-store.js";
        export function bindResidentLoopCapabilitiesForFactory(
          wakeRuntime: object,
          binding: unknown,
          domainExecution: unknown
        ) {
          const state = residentWakeRuntimeStates.get(wakeRuntime);
          {
            const domainExecution = "foreign";
            return bindMountedResidentLoopAuthorityForFactory(
              state.store,
              binding,
              domainExecution
            );
          }
        }
      `],
      ["property-derived binding", `
        const residentWakeRuntimeStates =
          new WeakMap<object, { store: unknown; binding: unknown }>();
        import {
          bindMountedResidentLoopAuthorityForFactory
        } from "./mounted-wake-lifecycle-store.js";
        export function bindResidentLoopCapabilitiesForFactory(
          wakeRuntime: object,
          binding: unknown,
          domainExecution: unknown
        ) {
          const state = residentWakeRuntimeStates.get(wakeRuntime);
          return bindMountedResidentLoopAuthorityForFactory(
            state.store,
            state.binding,
            domainExecution
          );
        }
      `],
      ["property-derived domain execution", `
        const residentWakeRuntimeStates = new WeakMap<
          object,
          { store: unknown; domainExecution: unknown }
        >();
        import {
          bindMountedResidentLoopAuthorityForFactory
        } from "./mounted-wake-lifecycle-store.js";
        export function bindResidentLoopCapabilitiesForFactory(
          wakeRuntime: object,
          binding: unknown,
          domainExecution: unknown
        ) {
          const state = residentWakeRuntimeStates.get(wakeRuntime);
          return bindMountedResidentLoopAuthorityForFactory(
            state.store,
            binding,
            state.domainExecution
          );
        }
      `],
      ["shape-equivalent distinct values", `
        const residentWakeRuntimeStates =
          new WeakMap<object, { store: unknown }>();
        import {
          bindMountedResidentLoopAuthorityForFactory
        } from "./mounted-wake-lifecycle-store.js";
        export function bindResidentLoopCapabilitiesForFactory(
          wakeRuntime: object,
          binding: unknown,
          domainExecution: unknown
        ) {
          const state = residentWakeRuntimeStates.get(wakeRuntime);
          const alternateBinding: typeof binding = binding;
          const alternateDomainExecution: typeof domainExecution =
            domainExecution;
          return bindMountedResidentLoopAuthorityForFactory(
            state.store,
            alternateBinding,
            alternateDomainExecution
          );
        }
      `],
      ["top-level call", `
        import {
          bindMountedResidentLoopAuthorityForFactory
        } from "./mounted-wake-lifecycle-store.js";
        bindMountedResidentLoopAuthorityForFactory(
          wakeRuntime,
          binding,
          domainExecution
        );
      `],
      ["wrong top-level helper", `
        import {
          bindMountedResidentLoopAuthorityForFactory
        } from "./mounted-wake-lifecycle-store.js";
        export function alternateConstruction(
          wakeRuntime: unknown,
          binding: unknown,
          domainExecution: unknown
        ) {
          return bindMountedResidentLoopAuthorityForFactory(
            wakeRuntime,
            binding,
            domainExecution
          );
        }
      `],
      ["nested function inside registrar", `
        import {
          bindMountedResidentLoopAuthorityForFactory
        } from "./mounted-wake-lifecycle-store.js";
        export function bindResidentLoopCapabilitiesForFactory(
          wakeRuntime: unknown,
          binding: unknown,
          domainExecution: unknown
        ) {
          function construct() {
            return bindMountedResidentLoopAuthorityForFactory(
              wakeRuntime,
              binding,
              domainExecution
            );
          }
          return construct();
        }
      `],
      ["nested arrow inside registrar", `
        import {
          bindMountedResidentLoopAuthorityForFactory
        } from "./mounted-wake-lifecycle-store.js";
        export function bindResidentLoopCapabilitiesForFactory(
          wakeRuntime: unknown,
          binding: unknown,
          domainExecution: unknown
        ) {
          const construct = () =>
            bindMountedResidentLoopAuthorityForFactory(
              wakeRuntime,
              binding,
              domainExecution
            );
          return construct();
        }
      `],
      ["identically named non-top-level declaration", `
        import {
          bindMountedResidentLoopAuthorityForFactory
        } from "./mounted-wake-lifecycle-store.js";
        export function outer() {
          function bindResidentLoopCapabilitiesForFactory(
            wakeRuntime: unknown,
            binding: unknown,
            domainExecution: unknown
          ) {
            return bindMountedResidentLoopAuthorityForFactory(
              wakeRuntime,
              binding,
              domainExecution
            );
          }
          return bindResidentLoopCapabilitiesForFactory;
        }
      `],
      ["same-name wrapper route", `
        import {
          bindMountedResidentLoopAuthorityForFactory
        } from "./mounted-wake-lifecycle-store.js";
        function invokeMountedBinder(
          wakeRuntime: unknown,
          binding: unknown,
          domainExecution: unknown
        ) {
          return bindMountedResidentLoopAuthorityForFactory(
            wakeRuntime,
            binding,
            domainExecution
          );
        }
        export function bindResidentLoopCapabilitiesForFactory(
          wakeRuntime: unknown,
          binding: unknown,
          domainExecution: unknown
        ) {
          return invokeMountedBinder(
            wakeRuntime,
            binding,
            domainExecution
          );
        }
      `],
      ["unused import with shadowed parameter call", `
        import {
          bindMountedResidentLoopAuthorityForFactory
        } from "./mounted-wake-lifecycle-store.js";
        function invoke(
          bindMountedResidentLoopAuthorityForFactory: (...args: unknown[]) => unknown
        ) {
          bindMountedResidentLoopAuthorityForFactory(store, binding, execution);
        }
      `],
      ["unused import with shadowed local call", `
        import {
          bindMountedResidentLoopAuthorityForFactory
        } from "./mounted-wake-lifecycle-store.js";
        function invoke() {
          const bindMountedResidentLoopAuthorityForFactory = alternateBinder;
          bindMountedResidentLoopAuthorityForFactory(store, binding, execution);
        }
      `],
      ["unused import with shadowed function call", `
        import {
          bindMountedResidentLoopAuthorityForFactory
        } from "./mounted-wake-lifecycle-store.js";
        function invoke() {
          function bindMountedResidentLoopAuthorityForFactory() {}
          bindMountedResidentLoopAuthorityForFactory(store, binding, execution);
        }
      `],
      ["aliased named import", `
        import {
          bindMountedResidentLoopAuthorityForFactory as bindMounted
        } from "./mounted-wake-lifecycle-store.js";
        bindMounted(store, binding, execution);
      `],
      ["namespace import", `
        import * as mounted from "./mounted-wake-lifecycle-store.js";
        mounted.bindMountedResidentLoopAuthorityForFactory(
          store,
          binding,
          execution
        );
      `],
      ["default import", `
        import bindMountedResidentLoopAuthorityForFactory
          from "./mounted-wake-lifecycle-store.js";
        bindMountedResidentLoopAuthorityForFactory(store, binding, execution);
      `],
      ["import-equals carrier", `
        import mounted = require("./mounted-wake-lifecycle-store.js");
        mounted.bindMountedResidentLoopAuthorityForFactory(
          store,
          binding,
          execution
        );
      `],
      ["dynamic import carrier", `
        void import("./mounted-wake-lifecycle-store.js").then((mounted) =>
          mounted.bindMountedResidentLoopAuthorityForFactory(
            store,
            binding,
            execution
          )
        );
      `],
      ["duplicate imports", `
        import {
          bindMountedResidentLoopAuthorityForFactory
        } from "./mounted-wake-lifecycle-store.js";
        import {
          bindMountedResidentLoopAuthorityForFactory
        } from "./mounted-wake-lifecycle-store.js";
        bindMountedResidentLoopAuthorityForFactory(store, binding, execution);
      `],
      ["duplicate declarations", `
        import {
          bindMountedResidentLoopAuthorityForFactory
        } from "./mounted-wake-lifecycle-store.js";
        declare function bindMountedResidentLoopAuthorityForFactory(
          store: unknown,
          binding: unknown,
          execution: unknown
        ): unknown;
        bindMountedResidentLoopAuthorityForFactory(store, binding, execution);
      `],
      ["zero-argument call", `
        import {
          bindMountedResidentLoopAuthorityForFactory
        } from "./mounted-wake-lifecycle-store.js";
        bindMountedResidentLoopAuthorityForFactory();
      `],
      ["two-argument call", `
        import {
          bindMountedResidentLoopAuthorityForFactory
        } from "./mounted-wake-lifecycle-store.js";
        bindMountedResidentLoopAuthorityForFactory(store, binding);
      `],
      ["four-argument call", `
        import {
          bindMountedResidentLoopAuthorityForFactory
        } from "./mounted-wake-lifecycle-store.js";
        bindMountedResidentLoopAuthorityForFactory(
          store,
          binding,
          execution,
          alternate
        );
      `],
      ["spread call", `
        import {
          bindMountedResidentLoopAuthorityForFactory
        } from "./mounted-wake-lifecycle-store.js";
        bindMountedResidentLoopAuthorityForFactory(...argumentsTuple);
      `],
      ["optional call", `
        import {
          bindMountedResidentLoopAuthorityForFactory
        } from "./mounted-wake-lifecycle-store.js";
        bindMountedResidentLoopAuthorityForFactory?.(
          store,
          binding,
          execution
        );
      `],
      ["property carrier", `
        import {
          bindMountedResidentLoopAuthorityForFactory
        } from "./mounted-wake-lifecycle-store.js";
        const mounted = { bindMountedResidentLoopAuthorityForFactory };
        mounted.bindMountedResidentLoopAuthorityForFactory(
          store,
          binding,
          execution
        );
      `],
      ["different lexical symbol call", `
        import {
          bindMountedResidentLoopAuthorityForFactory
        } from "./mounted-wake-lifecycle-store.js";
        bindMountedResidentLoopAuthorityForFactory(store, binding, execution);
        function invoke(
          bindMountedResidentLoopAuthorityForFactory: (...args: unknown[]) => unknown
        ) {
          bindMountedResidentLoopAuthorityForFactory(store, binding, execution);
        }
      `]
    ] as const) {
      expect.soft(
        mountedBinderControlAnalysis(text).violations,
        name
      ).not.toEqual([]);
    }

    const packagesRoot = fileURLToPath(new URL("../../", import.meta.url));
    const productionFiles = productionTypeScriptFiles(packagesRoot);
    const productionProgram = ts.createProgram(productionFiles, {
      module: ts.ModuleKind.ESNext,
      noResolve: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ES2022
    });
    const binderOwnership = mountedBinderOwnershipAnalysis(
      productionProgram,
      productionFiles.flatMap((file) => {
        const sourceFile = productionProgram.getSourceFile(file);
        return sourceFile === undefined
          ? []
          : [{
              sourceFile,
              label: sourceLabel(packagesRoot, file)
            }];
      })
    );

    const productAnalysis = {
      declarationCount: declarations.length,
      binderParameterNames: declarations.flatMap((declaration) =>
        declaration.parameters.map((parameter) => parameter.name.getText(mountedStoreFile))
      ),
      binderParameterCount: declarations[0]?.parameters.length ?? 0,
      callbackOrWrapperParameterIndexes: constructorParameterIndexes,
      binderImporters: binderOwnership.binderImporters,
      binderCalls: binderOwnership.binderCalls,
      binderOwnershipViolations: binderOwnership.violations,
      wakeFixedConstructorImports: wakeFile.statements.flatMap((statement) =>
        ts.isImportDeclaration(statement) &&
        ts.isStringLiteral(statement.moduleSpecifier) &&
        ([
          permittedResidentImports.mountedStore.dispatcherDefault,
          permittedResidentImports.mountedStore.gatewayNamedConstructor
        ] as readonly string[]).includes(statement.moduleSpecifier.text)
          ? [statement.moduleSpecifier.text]
          : []
      ),
      dispatcherImports,
      gatewayImports,
      fixedConstructorUse
    };
    for (const productSource of [source, mountedStoreSource]) {
      for (const pattern of forbiddenLoaderForms) {
        expect(productSource).not.toMatch(pattern);
      }
      for (const transfer of forbiddenTransfers) {
        expect(productSource).not.toContain(transfer);
      }
    }
    expect(agentBarrel).not.toMatch(/ResidentDomainExecution|ResidentLoopToolGateway|PackageOwnedResident|BoundedAgentLoop/);
    expect(productAnalysis).toEqual({
      declarationCount: 1,
      binderParameterNames: ["store", "rawBinding", "domainExecution"],
      binderParameterCount: 3,
      callbackOrWrapperParameterIndexes: [],
      binderImporters: ["packages/local-runtime/src/wake-supervisor-runtime.ts"],
      binderCalls: [{
        file: "packages/local-runtime/src/wake-supervisor-runtime.ts",
        argumentCount: 3
      }],
      binderOwnershipViolations: [],
      wakeFixedConstructorImports: [],
      dispatcherImports: [{
        defaultName: "dispatcherDefault",
        hasNamedBindings: false
      }],
      gatewayImports: [{
        defaultName: null,
        named: [{
          imported: "createResidentLoopToolGateway",
          local: "createResidentLoopToolGateway"
        }],
        hasNamespaceBinding: false
      }],
      fixedConstructorUse: exactFixedConstruction
    });
  });
});
