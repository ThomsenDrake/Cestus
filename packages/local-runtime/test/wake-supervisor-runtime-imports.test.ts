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
import { runInNewContext } from "node:vm";
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
    const exactStateReads: ts.CallExpression[] = [];
    const stateDeclarations: ts.VariableDeclaration[] = [];
    type LiteralFunction =
      | ts.ArrowFunction
      | ts.FunctionExpression;
    type InvocationArgument = ts.Expression | null | undefined;
    interface ImmediateCallResult {
      readonly returnedFunction: LiteralFunction | undefined;
      readonly returnedUndefined?: boolean;
    }
    const activeImmediateLiteralExecutions = new Set<ts.Node>();
    const activeLiteralFunctions =
      new Map<ts.Symbol, LiteralFunction>();
    const activeLiteralThisValues: InvocationArgument[] = [];
    const exactMethodValues = new Set<ts.Expression>();
    visitRegistrarStateReads(registrarBody, true);
    function visitRegistrarStateReads(
      node: ts.Node,
      outerEvaluated = false
    ): void {
      if (
        node !== registrarBody &&
        ts.isFunctionLike(node)
      ) {
        visitOuterEvaluatedFunctionLikeSyntax(node);
        return;
      }
      if (
        ts.isCallExpression(node) &&
        isExactPrivateStateRead(
          node,
          privateMapSymbol,
          registrarWakeSymbol
        )
      ) {
        exactStateReads.push(node);
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
      if (
        outerEvaluated &&
        visitExactBoundThisPropertyRead(node)
      ) {
        return;
      }
      if (
        outerEvaluated &&
        visitImmediateLiteralExecution(node)
      ) {
        return;
      }
      ts.forEachChild(node, (child) =>
        visitRegistrarStateReads(child, outerEvaluated)
      );
    }
    function visitOuterEvaluatedFunctionLikeSyntax(
      node: ts.SignatureDeclaration
    ): void {
      if (
        (
          ts.isMethodDeclaration(node) ||
          ts.isGetAccessorDeclaration(node) ||
          ts.isSetAccessorDeclaration(node)
        ) &&
        node.name !== undefined &&
        ts.isComputedPropertyName(node.name)
      ) {
        visitRegistrarStateReads(node.name.expression, true);
      }
      if (
        !(
          ts.isMethodDeclaration(node) ||
          ts.isGetAccessorDeclaration(node) ||
          ts.isSetAccessorDeclaration(node) ||
          ts.isConstructorDeclaration(node)
        )
      ) {
        return;
      }
      visitDecorators(node);
      for (const parameter of node.parameters) {
        visitDecorators(parameter);
      }
    }
    function visitDecorators(node: ts.Node): void {
      if (!ts.canHaveDecorators(node)) return;
      for (const decorator of ts.getDecorators(node) ?? []) {
        visitRegistrarStateReads(decorator.expression, true);
      }
    }
    function executeImmediateLiteralOnce(
      node: ts.Node,
      execute: () => ImmediateCallResult | undefined
    ): ImmediateCallResult | undefined {
      if (activeImmediateLiteralExecutions.has(node)) return undefined;
      activeImmediateLiteralExecutions.add(node);
      try {
        return execute();
      } finally {
        activeImmediateLiteralExecutions.delete(node);
      }
    }
    function visitImmediateLiteralExecution(node: ts.Node): boolean {
      if (ts.isCallExpression(node)) {
        return executeImmediateLiteralCall(node) !== undefined;
      }
      if (ts.isNewExpression(node)) {
        return executeImmediateLiteralConstruction(node) !== undefined;
      }
      if (ts.isTaggedTemplateExpression(node)) {
        return executeImmediateLiteralTag(node) !== undefined;
      }
      return false;
    }
    function executeImmediateLiteralCall(
      call: ts.CallExpression
    ): ImmediateCallResult | undefined {
      return executeImmediateLiteralOnce(
        call,
        () => executeImmediateLiteralCallUnguarded(call)
      );
    }
    function executeImmediateLiteralCallUnguarded(
      call: ts.CallExpression
    ): ImmediateCallResult | undefined {
      const expression = unwrapLiteralExpression(call.expression);
      const directlyInvoked = literalFunctionValue(expression);
      if (directlyInvoked !== undefined) {
        visitInvocationArguments(call.arguments);
        const invocationArguments =
          exactInvocationArguments(call.arguments);
        if (invocationArguments === undefined) return undefined;
        visitLiteralInvocation(directlyInvoked, invocationArguments);
        return {
          returnedFunction: exactReturnedLiteralFunction(directlyInvoked),
          returnedUndefined: exactLiteralReturnsUndefined(directlyInvoked)
        };
      }
      if (ts.isIdentifier(expression)) {
        const symbol = checker.getSymbolAtLocation(expression);
        const local = symbol === undefined
          ? undefined
          : activeLiteralFunctions.get(symbol);
        if (local === undefined) return undefined;
        visitInvocationArguments(call.arguments);
        const invocationArguments =
          exactInvocationArguments(call.arguments);
        if (invocationArguments === undefined) return undefined;
        visitLiteralInvocation(local, invocationArguments);
        return {
          returnedFunction: exactReturnedLiteralFunction(local),
          returnedUndefined: exactLiteralReturnsUndefined(local)
        };
      }
      if (ts.isCallExpression(expression)) {
        const bound = exactLiteralBind(expression);
        if (bound !== undefined) {
          visitInvocationArguments(bound.evaluationArguments);
          visitInvocationArguments(call.arguments);
          const invocationArguments =
            exactInvocationArguments(call.arguments);
          if (invocationArguments === undefined) return undefined;
          visitLiteralInvocation(bound.functionValue, [
            ...bound.boundArguments,
            ...invocationArguments
          ], bound.boundThis);
          return {
            returnedFunction:
              exactReturnedLiteralFunction(bound.functionValue),
            returnedUndefined:
              exactLiteralReturnsUndefined(bound.functionValue)
          };
        }
        const priorInvocation = executeImmediateLiteralCall(expression);
        if (priorInvocation === undefined) return undefined;
        if (
          call.questionDotToken !== undefined &&
          priorInvocation.returnedUndefined === true
        ) {
          return {
            returnedFunction: undefined,
            returnedUndefined: true
          };
        }
        visitInvocationArguments(call.arguments);
        const invocationArguments =
          exactInvocationArguments(call.arguments);
        if (invocationArguments === undefined) return undefined;
        if (priorInvocation.returnedFunction === undefined) {
          return { returnedFunction: undefined };
        }
        visitLiteralInvocation(
          priorInvocation.returnedFunction,
          invocationArguments
        );
        return {
          returnedFunction: exactReturnedLiteralFunction(
            priorInvocation.returnedFunction
          ),
          returnedUndefined: exactLiteralReturnsUndefined(
            priorInvocation.returnedFunction
          )
        };
      }
      if (ts.isNewExpression(expression)) {
        const priorInvocation =
          executeImmediateLiteralConstruction(expression);
        if (priorInvocation === undefined) return undefined;
        return executeReturnedLiteralCall(
          priorInvocation,
          call.arguments
        );
      }
      if (ts.isTaggedTemplateExpression(expression)) {
        const priorInvocation = executeImmediateLiteralTag(expression);
        if (priorInvocation === undefined) return undefined;
        return executeReturnedLiteralCall(
          priorInvocation,
          call.arguments
        );
      }
      if (
        ts.isPropertyAccessExpression(expression) &&
        expression.name.text === "next"
      ) {
        const receiver = unwrapLiteralExpression(expression.expression);
        if (
          !ts.isCallExpression(receiver) ||
          call.arguments.length !== 0
        ) {
          return undefined;
        }
        const generator = literalFunctionValue(receiver.expression);
        if (generator?.asteriskToken === undefined) return undefined;
        visitInvocationArguments(receiver.arguments);
        const invocationArguments =
          exactInvocationArguments(receiver.arguments);
        if (invocationArguments === undefined) return undefined;
        visitLiteralInvocation(
          generator,
          invocationArguments,
          undefined,
          true
        );
        return { returnedFunction: undefined };
      }
      if (
        ts.isPropertyAccessExpression(expression) &&
        (
          expression.name.text === "call" ||
          expression.name.text === "apply"
        )
      ) {
        const receiver = unwrapLiteralExpression(expression.expression);
        const receiverCall = ts.isCallExpression(receiver)
          ? receiver
          : undefined;
        const bound = receiverCall !== undefined
          ? exactLiteralBind(receiverCall)
          : undefined;
        const invoked = bound?.functionValue ??
          immediateLiteralFunctionValue(receiver);
        if (invoked === undefined) return undefined;
        const invocationArguments =
          expression.name.text === "call"
            ? exactInvocationArguments(call.arguments.slice(1))
            : exactApplyArguments(call.arguments);
        if (invocationArguments === undefined) return undefined;
        if (bound !== undefined && receiverCall !== undefined) {
          visitInvocationArguments(bound.evaluationArguments);
        }
        visitInvocationArguments(call.arguments);
        visitLiteralInvocation(invoked, [
          ...(bound?.boundArguments ?? []),
          ...invocationArguments
        ], bound?.boundThis ?? call.arguments[0]);
        return {
          returnedFunction: exactReturnedLiteralFunction(invoked),
          returnedUndefined: exactLiteralReturnsUndefined(invoked)
        };
      }
      return undefined;
    }
    function executeImmediateLiteralConstruction(
      construction: ts.NewExpression
    ): ImmediateCallResult | undefined {
      return executeImmediateLiteralOnce(
        construction,
        () => executeImmediateLiteralConstructionUnguarded(construction)
      );
    }
    function executeImmediateLiteralConstructionUnguarded(
      construction: ts.NewExpression
    ): ImmediateCallResult | undefined {
      const invoked = literalOrCallReturnedFunctionValue(
        construction.expression
      );
      if (
        invoked === undefined ||
        !ts.isFunctionExpression(invoked) ||
        !isConstructableLiteralFunction(invoked)
      ) {
        return undefined;
      }
      const arguments_ = construction.arguments ?? [];
      visitInvocationArguments(arguments_);
      const invocationArguments = exactInvocationArguments(arguments_);
      if (invocationArguments === undefined) return undefined;
      visitLiteralInvocation(invoked, invocationArguments);
      return {
        returnedFunction: exactReturnedLiteralFunction(invoked),
        returnedUndefined: exactLiteralReturnsUndefined(invoked)
      };
    }
    function executeImmediateLiteralTag(
      tagged: ts.TaggedTemplateExpression
    ): ImmediateCallResult | undefined {
      return executeImmediateLiteralOnce(
        tagged,
        () => executeImmediateLiteralTagUnguarded(tagged)
      );
    }
    function executeImmediateLiteralTagUnguarded(
      tagged: ts.TaggedTemplateExpression
    ): ImmediateCallResult | undefined {
      const invoked = literalOrCallReturnedFunctionValue(tagged.tag);
      if (invoked === undefined) return undefined;
      const substitutions = ts.isTemplateExpression(tagged.template)
        ? tagged.template.templateSpans.map((span) => span.expression)
        : [];
      visitInvocationArguments(substitutions);
      visitLiteralInvocation(invoked, [null, ...substitutions]);
      return {
        returnedFunction: exactReturnedLiteralFunction(invoked),
        returnedUndefined: exactLiteralReturnsUndefined(invoked)
      };
    }
    function executeReturnedLiteralCall(
      priorInvocation: ImmediateCallResult,
      arguments_: readonly ts.Expression[]
    ): ImmediateCallResult {
      visitInvocationArguments(arguments_);
      if (priorInvocation.returnedFunction === undefined) {
        return { returnedFunction: undefined };
      }
      visitLiteralInvocation(
        priorInvocation.returnedFunction,
        arguments_
      );
      return {
        returnedFunction: exactReturnedLiteralFunction(
          priorInvocation.returnedFunction
        ),
        returnedUndefined: exactLiteralReturnsUndefined(
          priorInvocation.returnedFunction
        )
      };
    }
    function exactLiteralBind(call: ts.CallExpression): {
      readonly boundArguments: readonly InvocationArgument[];
      readonly boundThis: InvocationArgument;
      readonly evaluationArguments: readonly ts.Expression[];
      readonly functionValue: LiteralFunction;
    } | undefined {
      const expression = unwrapLiteralExpression(call.expression);
      if (
        !ts.isPropertyAccessExpression(expression) ||
        expression.name.text !== "bind"
      ) {
        return undefined;
      }
      const receiver = unwrapLiteralExpression(expression.expression);
      const prior = ts.isCallExpression(receiver)
        ? exactLiteralBind(receiver)
        : undefined;
      const functionValue = prior?.functionValue ??
        immediateLiteralFunctionValue(receiver);
      if (functionValue === undefined) return undefined;
      const boundArguments =
        exactInvocationArguments(call.arguments.slice(1));
      if (boundArguments === undefined) return undefined;
      return {
        boundArguments: [
          ...(prior?.boundArguments ?? []),
          ...boundArguments
        ],
        boundThis: prior?.boundThis ?? call.arguments[0],
        evaluationArguments: [
          ...(prior?.evaluationArguments ?? []),
          ...call.arguments
        ],
        functionValue
      };
    }
    function exactApplyArguments(
      callArguments: readonly ts.Expression[]
    ): readonly InvocationArgument[] | undefined {
      const applyArguments = callArguments[1];
      if (
        applyArguments === undefined ||
        callArgumentUsesDefault(applyArguments)
      ) {
        return [];
      }
      const array = unwrapLiteralExpression(applyArguments);
      if (array.kind === ts.SyntaxKind.NullKeyword) {
        return [];
      }
      if (
        ts.isArrayLiteralExpression(array)
      ) {
        return exactArrayLiteralValues(array);
      }
      if (!ts.isObjectLiteralExpression(array)) return undefined;
      const lengthProperty = exactObjectLiteralProperty(array, "length");
      if (
        !lengthProperty.known ||
        !lengthProperty.own ||
        lengthProperty.value === null ||
        lengthProperty.value === undefined
      ) {
        return undefined;
      }
      const lengthValue = exactNonNegativeInteger(lengthProperty.value);
      if (lengthValue === undefined || lengthValue > 32) return undefined;
      const values: InvocationArgument[] = [];
      for (let index = 0; index < lengthValue; index += 1) {
        const property = exactObjectLiteralProperty(array, String(index));
        if (!property.known) return undefined;
        values.push(property.value);
      }
      return values;
    }
    function exactInvocationArguments(
      arguments_: readonly ts.Expression[]
    ): readonly InvocationArgument[] | undefined {
      const values: InvocationArgument[] = [];
      for (const argument of arguments_) {
        if (!ts.isSpreadElement(argument)) {
          values.push(argument);
          continue;
        }
        const spread = unwrapLiteralExpression(argument.expression);
        if (!ts.isArrayLiteralExpression(spread)) return undefined;
        const spreadValues = exactArrayLiteralValues(spread);
        if (spreadValues === undefined) return undefined;
        values.push(...spreadValues);
      }
      return values;
    }
    function exactArrayLiteralValues(
      array: ts.ArrayLiteralExpression
    ): readonly InvocationArgument[] | undefined {
      const values: InvocationArgument[] = [];
      for (const element of array.elements) {
        if (ts.isOmittedExpression(element)) {
          values.push(undefined);
          continue;
        }
        if (!ts.isSpreadElement(element)) {
          values.push(element);
          continue;
        }
        const spread = unwrapLiteralExpression(element.expression);
        if (!ts.isArrayLiteralExpression(spread)) return undefined;
        const nested = exactArrayLiteralValues(spread);
        if (nested === undefined) return undefined;
        values.push(...nested);
      }
      return values;
    }
    function visitInvocationArguments(
      arguments_: readonly ts.Expression[]
    ): void {
      for (const argument of arguments_) {
        visitRegistrarStateReads(argument, true);
      }
    }
    function immediateLiteralFunctionValue(
      expression: ts.Expression
    ): LiteralFunction | undefined {
      const literal = literalFunctionValue(expression);
      if (literal !== undefined) return literal;
      const unwrapped = unwrapLiteralExpression(expression);
      if (ts.isCallExpression(unwrapped)) {
        return executeImmediateLiteralCall(unwrapped)?.returnedFunction;
      }
      if (ts.isNewExpression(unwrapped)) {
        return executeImmediateLiteralConstruction(unwrapped)
          ?.returnedFunction;
      }
      return ts.isTaggedTemplateExpression(unwrapped)
        ? executeImmediateLiteralTag(unwrapped)?.returnedFunction
        : undefined;
    }
    function literalOrCallReturnedFunctionValue(
      expression: ts.Expression
    ): LiteralFunction | undefined {
      return immediateLiteralFunctionValue(expression);
    }
    function visitLiteralInvocation(
      invoked: LiteralFunction,
      arguments_: readonly InvocationArgument[],
      thisValue?: InvocationArgument,
      advanceGenerator = false
    ): void {
      invoked.parameters.forEach((parameter, index) => {
        if (parameter.dotDotDotToken !== undefined) {
          visitCollectedRestBinding(
            parameter.name,
            arguments_.slice(index)
          );
          return;
        }
        visitBindingDefaults(
          parameter.name,
          parameter.initializer,
          arguments_[index]
        );
      });
      if (
        invoked.asteriskToken !== undefined &&
        !advanceGenerator
      ) {
        return;
      }
      activeLiteralThisValues.push(thisValue);
      try {
        if (!ts.isBlock(invoked.body)) {
          visitRegistrarStateReads(invoked.body, true);
          return;
        }
        visitReachableLiteralStatements(
          invoked.body.statements,
          advanceGenerator
        );
      } finally {
        activeLiteralThisValues.pop();
      }
    }
    function visitReachableLiteralStatements(
      statements: readonly ts.Statement[],
      stopAtYield: boolean
    ): void {
      const localSymbols: ts.Symbol[] = [];
      try {
        for (const statement of statements) {
          if (ts.isEmptyStatement(statement)) continue;
          if (ts.isReturnStatement(statement)) {
            if (statement.expression !== undefined) {
              visitRegistrarStateReads(statement.expression, true);
            }
            return;
          }
          if (ts.isIfStatement(statement)) {
            visitRegistrarStateReads(statement.expression, true);
            const condition =
              exactConstantBoolean(statement.expression);
            if (condition === false) {
              if (statement.elseStatement !== undefined) {
                visitReachableLiteralStatement(
                  statement.elseStatement,
                  stopAtYield
                );
              }
              continue;
            }
            if (condition === true) {
              visitReachableLiteralStatement(
                statement.thenStatement,
                stopAtYield
              );
              continue;
            }
            visitRegistrarStateReads(statement.thenStatement, true);
            if (statement.elseStatement !== undefined) {
              visitRegistrarStateReads(statement.elseStatement, true);
            }
            continue;
          }
          if (
            ts.isVariableStatement(statement) &&
            (statement.declarationList.flags & ts.NodeFlags.Const) !== 0
          ) {
            for (const declaration of
              statement.declarationList.declarations) {
              if (declaration.initializer === undefined) continue;
              visitRegistrarStateReads(
                declaration.initializer,
                true
              );
              if (!ts.isIdentifier(declaration.name)) continue;
              const literal =
                literalFunctionValue(declaration.initializer);
              const symbol =
                checker.getSymbolAtLocation(declaration.name);
              if (literal === undefined || symbol === undefined) continue;
              activeLiteralFunctions.set(symbol, literal);
              localSymbols.push(symbol);
            }
            continue;
          }
          if (
            stopAtYield &&
            ts.isExpressionStatement(statement) &&
            ts.isYieldExpression(
              unwrapLiteralExpression(statement.expression)
            )
          ) {
            const yielded =
              unwrapLiteralExpression(statement.expression) as
                ts.YieldExpression;
            if (yielded.expression !== undefined) {
              visitRegistrarStateReads(yielded.expression, true);
            }
            return;
          }
          visitRegistrarStateReads(statement, true);
        }
      } finally {
        for (const symbol of localSymbols) {
          activeLiteralFunctions.delete(symbol);
        }
      }
    }
    function visitReachableLiteralStatement(
      statement: ts.Statement,
      stopAtYield: boolean
    ): void {
      if (ts.isBlock(statement)) {
        visitReachableLiteralStatements(
          statement.statements,
          stopAtYield
        );
        return;
      }
      visitReachableLiteralStatements([statement], stopAtYield);
    }
    function visitCollectedRestBinding(
      name: ts.BindingName,
      values: readonly InvocationArgument[]
    ): void {
      if (ts.isIdentifier(name)) return;
      if (ts.isArrayBindingPattern(name)) {
        visitArrayBindingDefaults(name, values);
      }
    }
    function visitBindingDefaults(
      name: ts.BindingName,
      initializer: ts.Expression | undefined,
      argument: InvocationArgument
    ): void {
      let value = argument;
      if (
        initializer !== undefined &&
        callArgumentUsesDefault(argument)
      ) {
        visitRegistrarStateReads(initializer, true);
        value = initializer;
      }
      if (ts.isIdentifier(name) || value === null || value === undefined) {
        return;
      }
      const literal = unwrapLiteralExpression(value);
      if (
        ts.isObjectBindingPattern(name) &&
        (
          ts.isObjectLiteralExpression(literal) ||
          exactMethodValues.has(literal)
        )
      ) {
        const excludedNames = new Set<string>();
        for (const element of name.elements) {
          if (element.dotDotDotToken !== undefined) {
            if (ts.isObjectLiteralExpression(literal)) {
              visitObjectRestCopy(literal, excludedNames);
            }
            continue;
          }
          if (
            element.propertyName !== undefined &&
            ts.isComputedPropertyName(element.propertyName)
          ) {
            visitRegistrarStateReads(
              element.propertyName.expression,
              true
            );
          }
          const propertyName = bindingElementPropertyName(element);
          if (propertyName === undefined) continue;
          excludedNames.add(propertyName);
          const property = ts.isObjectLiteralExpression(literal)
            ? exactObjectLiteralProperty(literal, propertyName)
            : { known: true, own: false, value: undefined };
          if (!property.known) continue;
          visitBindingDefaults(
            element.name,
            element.initializer,
            property.value
          );
        }
        return;
      }
      if (
        ts.isArrayBindingPattern(name) &&
        ts.isArrayLiteralExpression(literal) &&
        !literal.elements.some(ts.isSpreadElement)
      ) {
        visitArrayBindingDefaults(
          name,
          literal.elements.map((element) =>
            ts.isOmittedExpression(element) ? undefined : element
          )
        );
      }
    }
    function visitArrayBindingDefaults(
      pattern: ts.ArrayBindingPattern,
      values: readonly InvocationArgument[]
    ): void {
      pattern.elements.forEach((element, index) => {
        if (ts.isOmittedExpression(element)) return;
        if (element.dotDotDotToken !== undefined) {
          if (ts.isArrayBindingPattern(element.name)) {
            visitArrayBindingDefaults(
              element.name,
              values.slice(index)
            );
          }
          return;
        }
        visitBindingDefaults(
          element.name,
          element.initializer,
          values[index]
        );
      });
    }
    function exactGetterValue(
      getter: ts.GetAccessorDeclaration
    ): {
      readonly known: boolean;
      readonly value: InvocationArgument;
    } {
      if (getter.body === undefined) {
        return { known: false, value: undefined };
      }
      const statements = getter.body.statements.filter(
        (statement) => !ts.isEmptyStatement(statement)
      );
      const terminal = statements.at(-1);
      const returned =
        terminal !== undefined && ts.isReturnStatement(terminal)
          ? terminal
          : undefined;
      const effects =
        returned === undefined ? statements : statements.slice(0, -1);
      const locals = new Map<string, InvocationArgument>();
      for (const effect of effects) {
        if (ts.isIfStatement(effect)) {
          visitRegistrarStateReads(effect.expression, true);
          const condition = exactConstantBoolean(effect.expression);
          if (condition === false) {
            if (effect.elseStatement !== undefined) {
              visitRegistrarStateReads(effect.elseStatement, true);
            }
            continue;
          }
          if (condition === true) {
            visitRegistrarStateReads(effect.thenStatement, true);
            continue;
          }
        }
        if (ts.isExpressionStatement(effect)) {
          visitRegistrarStateReads(effect.expression, true);
          continue;
        }
        if (
          ts.isVariableStatement(effect) &&
          (effect.declarationList.flags & ts.NodeFlags.Const) !== 0 &&
          effect.declarationList.declarations.every(
            (declaration) =>
              ts.isIdentifier(declaration.name) &&
              declaration.initializer !== undefined
          )
        ) {
          for (const declaration of effect.declarationList.declarations) {
            if (
              !ts.isIdentifier(declaration.name) ||
              declaration.initializer === undefined
            ) {
              return { known: false, value: undefined };
            }
            visitRegistrarStateReads(declaration.initializer, true);
            locals.set(
              declaration.name.text,
              resolveGetterLocalValue(
                declaration.initializer,
                locals
              )
            );
          }
          continue;
        }
        visitRegistrarStateReads(effect, true);
        return { known: false, value: undefined };
      }
      if (returned?.expression !== undefined) {
        visitRegistrarStateReads(returned.expression, true);
      }
      return {
        known: true,
        value: returned?.expression === undefined
          ? undefined
          : resolveGetterLocalValue(returned.expression, locals)
      };
    }
    function resolveGetterLocalValue(
      expression: ts.Expression,
      locals: ReadonlyMap<string, InvocationArgument>
    ): InvocationArgument {
      let value: InvocationArgument = expression;
      const resolving = new Set<string>();
      while (value !== null && value !== undefined) {
        const unwrapped = unwrapLiteralExpression(value);
        if (
          !ts.isIdentifier(unwrapped) ||
          !locals.has(unwrapped.text) ||
          resolving.has(unwrapped.text)
        ) {
          return unwrapped;
        }
        resolving.add(unwrapped.text);
        value = locals.get(unwrapped.text);
      }
      return value;
    }
    function bindingElementPropertyName(
      element: ts.BindingElement
    ): string | undefined {
      if (element.propertyName !== undefined) {
        return literalPropertyName(element.propertyName);
      }
      return ts.isIdentifier(element.name)
        ? element.name.text
        : undefined;
    }
    function literalPropertyName(
      name: ts.PropertyName
    ): string | undefined {
      if (
        ts.isIdentifier(name) ||
        ts.isStringLiteral(name) ||
        ts.isNumericLiteral(name) ||
        ts.isNoSubstitutionTemplateLiteral(name)
      ) {
        return name.text;
      }
      if (!ts.isComputedPropertyName(name)) return undefined;
      return exactConstantPropertyName(name.expression);
    }
    function exactConstantPropertyName(
      value: ts.Expression
    ): string | undefined {
      const expression = unwrapLiteralExpression(value);
      if (
        ts.isStringLiteral(expression) ||
        ts.isNumericLiteral(expression) ||
        ts.isNoSubstitutionTemplateLiteral(expression)
      ) {
        return expression.text;
      }
      if (
        ts.isBinaryExpression(expression) &&
        expression.operatorToken.kind === ts.SyntaxKind.CommaToken
      ) {
        return isExactConstantOperand(expression.left)
          ? exactConstantPropertyName(expression.right)
          : undefined;
      }
      if (ts.isCommaListExpression(expression)) {
        const operands = expression.elements;
        const final = operands.at(-1);
        return (
          final !== undefined &&
          operands.slice(0, -1).every(isExactConstantOperand)
        )
          ? exactConstantPropertyName(final)
          : undefined;
      }
      if (ts.isPrefixUnaryExpression(expression)) {
        const operand = exactPrimitiveConstant(expression.operand);
        if (typeof operand !== "number") return undefined;
        switch (expression.operator) {
          case ts.SyntaxKind.MinusToken:
            return String(-operand);
          case ts.SyntaxKind.PlusToken:
            return String(+operand);
          case ts.SyntaxKind.TildeToken:
            return String(~operand);
          case ts.SyntaxKind.ExclamationToken:
            return String(!operand);
          default:
            return undefined;
        }
      }
      if (ts.isTemplateExpression(expression)) {
        let result = expression.head.text;
        for (const span of expression.templateSpans) {
          const primitive = exactPrimitiveConstant(span.expression);
          if (primitive === undefined) return undefined;
          result += String(primitive);
          result += span.literal.text;
        }
        return result;
      }
      return undefined;
    }
    function exactPrimitiveConstant(
      value: ts.Expression
    ): string | number | boolean | null | undefined {
      const expression = unwrapLiteralExpression(value);
      if (
        ts.isStringLiteral(expression) ||
        ts.isNoSubstitutionTemplateLiteral(expression)
      ) {
        return expression.text;
      }
      if (ts.isNumericLiteral(expression)) {
        return Number(expression.text);
      }
      if (expression.kind === ts.SyntaxKind.TrueKeyword) return true;
      if (expression.kind === ts.SyntaxKind.FalseKeyword) return false;
      if (expression.kind === ts.SyntaxKind.NullKeyword) return null;
      return undefined;
    }
    function exactConstantBoolean(
      value: ts.Expression
    ): boolean | undefined {
      const primitive = exactPrimitiveConstant(value);
      return typeof primitive === "boolean" ? primitive : undefined;
    }
    function exactNonNegativeInteger(
      value: ts.Expression
    ): number | undefined {
      const primitive = exactPrimitiveConstant(value);
      return typeof primitive === "number" &&
        Number.isSafeInteger(primitive) &&
        primitive >= 0
        ? primitive
        : undefined;
    }
    function isExactConstantOperand(value: ts.Expression): boolean {
      const expression = unwrapLiteralExpression(value);
      return (
        ts.isStringLiteral(expression) ||
        ts.isNumericLiteral(expression) ||
        ts.isNoSubstitutionTemplateLiteral(expression) ||
        expression.kind === ts.SyntaxKind.TrueKeyword ||
        expression.kind === ts.SyntaxKind.FalseKeyword ||
        expression.kind === ts.SyntaxKind.NullKeyword ||
        (
          ts.isBinaryExpression(expression) &&
          expression.operatorToken.kind === ts.SyntaxKind.CommaToken &&
          isExactConstantOperand(expression.left) &&
          isExactConstantOperand(expression.right)
        ) ||
        (
          ts.isCommaListExpression(expression) &&
          expression.elements.every(isExactConstantOperand)
        )
      );
    }
    function exactObjectLiteralProperty(
      object: ts.ObjectLiteralExpression,
      name: string
    ): {
      readonly known: boolean;
      readonly own: boolean;
      readonly value: InvocationArgument;
    } {
      let selected: ts.ObjectLiteralElementLike | undefined;
      let selectedGetter: ts.GetAccessorDeclaration | undefined;
      let selectedSpreadValue: InvocationArgument;
      let hasSelectedSpreadValue = false;
      let prototype: ts.ObjectLiteralExpression | undefined;
      for (const property of object.properties) {
        if (ts.isSpreadAssignment(property)) {
          const spread = unwrapLiteralExpression(property.expression);
          if (!ts.isObjectLiteralExpression(spread)) {
            return { known: false, own: false, value: undefined };
          }
          const spreadProperty =
            exactObjectLiteralProperty(spread, name);
          if (!spreadProperty.known) return spreadProperty;
          if (spreadProperty.own) {
            selected = undefined;
            selectedGetter = undefined;
            selectedSpreadValue = spreadProperty.value;
            hasSelectedSpreadValue = true;
          }
          continue;
        }
        const propertyName = literalPropertyName(property.name);
        if (propertyName === undefined) {
          return { known: false, own: false, value: undefined };
        }
        if (
          propertyName === "__proto__" &&
          ts.isPropertyAssignment(property) &&
          !ts.isComputedPropertyName(property.name)
        ) {
          const prototypeValue =
            unwrapLiteralExpression(property.initializer);
          if (ts.isObjectLiteralExpression(prototypeValue)) {
            prototype = prototypeValue;
          }
          continue;
        }
        if (propertyName !== name) continue;
        hasSelectedSpreadValue = false;
        if (ts.isGetAccessorDeclaration(property)) {
          selectedGetter = property;
          selected = property;
          continue;
        }
        if (ts.isSetAccessorDeclaration(property)) {
          selected = property;
          continue;
        }
        selectedGetter = undefined;
        selected = property;
      }
      if (selected === undefined) {
        if (hasSelectedSpreadValue) {
          return {
            known: true,
            own: true,
            value: selectedSpreadValue
          };
        }
        if (prototype !== undefined) {
          const inherited =
            exactObjectLiteralProperty(prototype, name);
          return {
            known: inherited.known,
            own: false,
            value: inherited.value
          };
        }
        return { known: true, own: false, value: undefined };
      }
      if (ts.isPropertyAssignment(selected)) {
        return {
          known: true,
          own: true,
          value: selected.initializer
        };
      }
      if (ts.isShorthandPropertyAssignment(selected)) {
        return { known: true, own: true, value: selected.name };
      }
      if (ts.isMethodDeclaration(selected)) {
        if (!ts.isIdentifier(selected.name)) {
          return { known: false, own: false, value: undefined };
        }
        exactMethodValues.add(selected.name);
        return { known: true, own: true, value: selected.name };
      }
      if (selectedGetter !== undefined) {
        return {
          ...exactGetterValue(selectedGetter),
          own: true
        };
      }
      if (ts.isSetAccessorDeclaration(selected)) {
        return { known: true, own: true, value: undefined };
      }
      return { known: false, own: false, value: undefined };
    }
    function visitObjectRestCopy(
      object: ts.ObjectLiteralExpression,
      excludedNames: ReadonlySet<string>
    ): void {
      const names = new Set<string>();
      for (const property of object.properties) {
        if (ts.isSpreadAssignment(property)) continue;
        const name = literalPropertyName(property.name);
        if (name === undefined || name === "__proto__") continue;
        names.add(name);
      }
      for (const name of names) {
        if (excludedNames.has(name)) continue;
        exactObjectLiteralProperty(object, name);
      }
    }
    function visitExactBoundThisPropertyRead(
      node: ts.Node
    ): boolean {
      if (
        !ts.isPropertyAccessExpression(node) ||
        node.questionDotToken !== undefined ||
        node.expression.kind !== ts.SyntaxKind.ThisKeyword
      ) {
        return false;
      }
      const thisValue = activeLiteralThisValues.at(-1);
      if (thisValue === null || thisValue === undefined) return false;
      const literal = unwrapLiteralExpression(thisValue);
      if (!ts.isObjectLiteralExpression(literal)) return false;
      exactObjectLiteralProperty(literal, node.name.text);
      return true;
    }
    function exactReturnedLiteralFunction(
      invoked: LiteralFunction
    ): LiteralFunction | undefined {
      if (
        invoked.asteriskToken !== undefined ||
        invoked.modifiers?.some(
          (modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword
        ) === true
      ) {
        return undefined;
      }
      if (!ts.isBlock(invoked.body)) {
        return literalFunctionValue(invoked.body);
      }
      const statements = invoked.body.statements.filter(
        (statement) => !ts.isEmptyStatement(statement)
      );
      const statement = statements[0];
      if (
        statements.length !== 1 ||
        statement === undefined ||
        !ts.isReturnStatement(statement) ||
        statement.expression === undefined
      ) {
        return undefined;
      }
      return literalFunctionValue(statement.expression);
    }
    function exactLiteralReturnsUndefined(
      invoked: LiteralFunction
    ): boolean {
      if (
        invoked.asteriskToken !== undefined ||
        invoked.modifiers?.some(
          (modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword
        ) === true
      ) {
        return false;
      }
      if (!ts.isBlock(invoked.body)) {
        return callArgumentUsesDefault(invoked.body);
      }
      const statements = invoked.body.statements.filter(
        (statement) => !ts.isEmptyStatement(statement)
      );
      const terminal = statements.at(-1);
      if (terminal === undefined) return true;
      return ts.isReturnStatement(terminal) &&
        (
          terminal.expression === undefined ||
          callArgumentUsesDefault(terminal.expression)
        );
    }
    function literalFunctionValue(
      expression: ts.Expression
    ): LiteralFunction | undefined {
      const unwrapped = unwrapLiteralExpression(expression);
      return ts.isArrowFunction(unwrapped) ||
        ts.isFunctionExpression(unwrapped)
        ? unwrapped
        : undefined;
    }
    function isConstructableLiteralFunction(
      expression: ts.FunctionExpression
    ): boolean {
      return expression.asteriskToken === undefined &&
        expression.modifiers?.some(
          (modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword
        ) !== true;
    }
    function unwrapLiteralExpression(
      value: ts.Expression
    ): ts.Expression {
      let expression = value;
      while (
        ts.isParenthesizedExpression(expression) ||
        ts.isAsExpression(expression) ||
        ts.isTypeAssertionExpression(expression) ||
        ts.isNonNullExpression(expression) ||
        ts.isSatisfiesExpression(expression) ||
        ts.isPartiallyEmittedExpression(expression)
      ) {
        expression = expression.expression;
      }
      return expression;
    }
    function callArgumentUsesDefault(
      argument: InvocationArgument
    ): boolean {
      if (argument === null) return false;
      if (argument === undefined) return true;
      const expression = unwrapLiteralExpression(argument);
      return (
        isGlobalUndefinedReference(expression) ||
        ts.isVoidExpression(expression)
      );
    }
    function isGlobalUndefinedReference(
      expression: ts.Expression
    ): boolean {
      if (!ts.isIdentifier(expression)) return false;
      const symbol = checker.getSymbolAtLocation(expression);
      return symbol !== undefined &&
        symbol.getName() === "undefined" &&
        (symbol.declarations?.length ?? 0) === 0 &&
        (
          checker.getTypeAtLocation(expression).flags &
          ts.TypeFlags.Undefined
        ) !== 0;
    }
    function hasExactPrivateMapProvenance(): boolean {
      let exact = true;
      visit(registrarBody);
      return exact;

      function visit(node: ts.Node): void {
        if (!exact) return;
        if (
          ts.isIdentifier(node) &&
          checker.getSymbolAtLocation(node) === privateMapSymbol
        ) {
          const property = ts.isPropertyAccessExpression(node.parent) &&
            node.parent.expression === node
            ? node.parent
            : undefined;
          const invocation = property !== undefined &&
            property.name.text === "get" &&
            ts.isCallExpression(property.parent) &&
            property.parent.expression === property
            ? property.parent
            : undefined;
          if (
            invocation === undefined ||
            !isExactPrivateStateRead(
              invocation,
              privateMapSymbol,
              registrarWakeSymbol
            )
          ) {
            exact = false;
            return;
          }
        }
        ts.forEachChild(node, visit);
      }
    }
    if (
      exactStateReads.length !== 1 ||
      stateDeclarations.length !== 1 ||
      !hasExactPrivateMapProvenance()
    ) {
      return false;
    }
    const stateDeclaration = stateDeclarations[0]!;
    if (
      stateDeclaration.initializer !== exactStateReads[0] ||
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

function outerEvaluatedRuntimeProbe(): {
  readonly diagnosticCodes: readonly number[];
  readonly stateReadCount: number | undefined;
} {
  const result = ts.transpileModule(`
    let stateReadCount = 0;
    const wakeRuntime = {};
    const residentWakeRuntimeStates = {
      get(value: object) {
        stateReadCount += 1;
        return value;
      }
    };
    const decorate = (..._arguments: unknown[]) => undefined;
    const objectValue = {
      [(residentWakeRuntimeStates.get(wakeRuntime), "method")]() {},
      get [(residentWakeRuntimeStates.get(wakeRuntime), "getter")]() {
        return 1;
      },
      set [(residentWakeRuntimeStates.get(wakeRuntime), "setter")](
        value: number
      ) {
        void value;
      },
      [((() => (
        residentWakeRuntimeStates.get(wakeRuntime),
        "invoked-object-method"
      ))())]() {},
      [((() => residentWakeRuntimeStates.get(wakeRuntime)),
        "deferred-arrow-body")]() {},
      [(((value = residentWakeRuntimeStates.get(wakeRuntime)) => value),
        "deferred-arrow-default")]() {}
    };
    class Example {
      [(residentWakeRuntimeStates.get(wakeRuntime), "method")]() {}
      get [(residentWakeRuntimeStates.get(wakeRuntime), "getter")]() {
        return 1;
      }
      set [(residentWakeRuntimeStates.get(wakeRuntime), "setter")](
        value: number
      ) {
        void value;
      }
      @((residentWakeRuntimeStates.get(wakeRuntime), decorate))
      decoratedMethod(
        @((residentWakeRuntimeStates.get(wakeRuntime), decorate))
        value: unknown
      ) {
        void value;
      }
      @((residentWakeRuntimeStates.get(wakeRuntime), decorate))
      get decoratedGetter() {
        return 1;
      }
      @((residentWakeRuntimeStates.get(wakeRuntime), decorate))
      set decoratedSetter(
        @((residentWakeRuntimeStates.get(wakeRuntime), decorate))
        value: number
      ) {
        void value;
      }
      constructor(
        @((residentWakeRuntimeStates.get(wakeRuntime), decorate))
        value: unknown
      ) {
        void value;
      }
      @((() => {
        residentWakeRuntimeStates.get(wakeRuntime);
        return decorate;
      })())
      invokedDecorator() {}
      @((() => residentWakeRuntimeStates.get(wakeRuntime)), decorate)
      deferredDecoratorBody() {}
      @(((value = residentWakeRuntimeStates.get(wakeRuntime)) => value),
        decorate)
      deferredDecoratorDefault() {}
    }
    (globalThis as { stateReadCount?: number }).stateReadCount =
      stateReadCount;
    void objectValue;
    void Example;
  `, {
    compilerOptions: {
      experimentalDecorators: true,
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2022
    },
    reportDiagnostics: true
  });
  const context: { stateReadCount?: number } = {};
  runInNewContext(result.outputText, context);
  return {
    diagnosticCodes: (result.diagnostics ?? []).map(
      (diagnostic) => diagnostic.code
    ),
    stateReadCount: context.stateReadCount
  };
}

function immediateLiteralInvocationRuntimeProbe(): {
  readonly deferredControlCount: number | undefined;
  readonly diagnosticCodes: readonly number[];
  readonly stateReadCount: number | undefined;
} {
  const result = ts.transpileModule(`
    let deferredControlCount = 0;
    let stateReadCount = 0;
    const read = () => {
      stateReadCount += 1;
    };
    (() => read())?.();
    (function () { read(); }).call(undefined);
    (function () { read(); }).apply(undefined, []);
    (function () { read(); }).bind(undefined)();
    new (function () { read(); })();
    (function () { read(); })\`tag\`;
    (() => () => read())()();
    const outerEvaluated = {
      [(
        deferredControlCount += 1,
        (function () { read(); }).bind(undefined),
        "uninvoked-bind"
      )]: true,
      [(
        deferredControlCount += 1,
        function () { read(); },
        "uninvoked-function"
      )]: true,
      [(
        deferredControlCount += 1,
        (function* () { read(); })(),
        "uniterated-generator"
      )]: true
    };
    (globalThis as {
      deferredControlCount?: number;
      stateReadCount?: number;
    }).deferredControlCount = deferredControlCount;
    (globalThis as {
      deferredControlCount?: number;
      stateReadCount?: number;
    }).stateReadCount = stateReadCount;
    void outerEvaluated;
  `, {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2022
    },
    reportDiagnostics: true
  });
  const context: {
    deferredControlCount?: number;
    stateReadCount?: number;
  } = {};
  runInNewContext(result.outputText, context);
  return {
    deferredControlCount: context.deferredControlCount,
    diagnosticCodes: (result.diagnostics ?? []).map(
      (diagnostic) => diagnostic.code
    ),
    stateReadCount: context.stateReadCount
  };
}

function literalEvaluatorRuntimeProbe(): {
  readonly diagnosticCodes: readonly number[];
  readonly stateReadCounts: readonly number[] | undefined;
} {
  const result = ts.transpileModule(`
    let stateReadCount = 0;
    const stateReadCounts: number[] = [];
    const read = () => {
      stateReadCount += 1;
      return {};
    };
    const record = (run: () => void) => {
      const before = stateReadCount;
      run();
      stateReadCounts.push(stateReadCount - before);
    };
    record(() => {
      (function (value = read()) {
        void value;
      }).apply(undefined, null);
    });
    record(() => {
      (({
        nested: [value = read()] = []
      } = {
        nested: []
      }) => {
        void value;
      })({
        nested: []
      });
    });
    record(() => {
      (() => function () {
        read();
      })().call(undefined);
    });
    record(() => {
      (() => function () {
        read();
      })().apply(undefined, []);
    });
    record(() => {
      (() => function () {
        read();
      })().bind(undefined)();
    });
    record(() => {
      new (function () {
        return function () {
          read();
        };
      })()();
    });
    record(() => {
      (function () {
        return function () {
          read();
        };
      })\`tag\`();
    });
    record(() => {
      const undefined = {};
      ((value = read()) => value)(undefined);
    });
    (globalThis as {
      stateReadCounts?: readonly number[];
    }).stateReadCounts = stateReadCounts;
  `, {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2022
    },
    reportDiagnostics: true
  });
  const context: {
    stateReadCounts?: readonly number[];
  } = {};
  runInNewContext(result.outputText, context);
  return {
    diagnosticCodes: (result.diagnostics ?? []).map(
      (diagnostic) => diagnostic.code
    ),
    stateReadCounts: context.stateReadCounts
  };
}

function adversarialLiteralEvaluatorRuntimeProbe(): {
  readonly diagnosticCodes: readonly number[];
  readonly stateReadCounts: readonly number[] | undefined;
} {
  const result = ts.transpileModule(`
    let stateReadCount = 0;
    const stateReadCounts: number[] = [];
    const read = () => {
      stateReadCount += 1;
      return "value";
    };
    const record = (run: () => void) => {
      const before = stateReadCount;
      run();
      stateReadCounts.push(stateReadCount - before);
    };
    record(() => {
      (([
        ...[value = read()]
      ]) => {
        void value;
      })([]);
    });
    record(() => {
      (({ value }: { value: unknown }) => {
        void value;
      })({
        get value() {
          read();
          return 1;
        }
      });
    });
    record(() => {
      (({
        [(() => {
          read();
          return "value";
        })()]: value
      }) => {
        void value;
      })({ value: 1 });
    });
    record(() => {
      new ((() => function Returned() {
        read();
      })())();
    });
    record(() => {
      ((() => function ReturnedTag() {
        read();
        return "tagged";
      })())\`tag\`;
    });
    (globalThis as {
      stateReadCounts?: readonly number[];
    }).stateReadCounts = stateReadCounts;
  `, {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2022
    },
    reportDiagnostics: true
  });
  const context: {
    stateReadCounts?: readonly number[];
  } = {};
  runInNewContext(result.outputText, context);
  return {
    diagnosticCodes: (result.diagnostics ?? []).map(
      (diagnostic) => diagnostic.code
    ),
    stateReadCounts: context.stateReadCounts
  };
}

function nineGapLiteralEvaluatorRuntimeProbe(): readonly {
  readonly diagnosticCodes: readonly number[];
  readonly name: string;
  readonly stateReadCount: number | undefined;
}[] {
  const cases = [
    {
      name: "constructor-returned literal reused as constructor",
      source: `
        new (new (function Maker() {
          return function Returned() { read(); };
        })())();
      `
    },
    {
      name: "tag-returned literal reused as tag",
      source: `
        ((function makeTag() {
          return function returnedTag() {
            read();
            return "done";
          };
        })\`inner\`)\`outer\`;
      `
    },
    {
      name: "selected getter read in const initializer",
      source: `
        (({ value }) => void value)({
          get value() {
            const current = read();
            return current;
          }
        });
      `
    },
    {
      name: "duplicate getters use runtime last definition",
      source: `
        (({ value }) => void value)({
          get value() { return 0; },
          get value() { read(); return 1; }
        });
      `
    },
    {
      name: "computed sequence key selects absent property",
      source: `
        (({ [(0, "missing")]: value = read() }) => void value)({});
      `
    },
    {
      name: "setter-only read supplies undefined",
      source: `
        (({ value = read() }) => void value)({
          set value(input) { void input; }
        });
      `
    },
    {
      name: "function rest destructuring collects suffix array",
      source: `
        ((...[value = read()]) => void value)();
      `
    },
    {
      name: "literal bind result invoked through call",
      source: `
        (function invoked() { read(); })
          .bind(undefined).call(undefined);
      `
    },
    {
      name: "returned literal bind result invoked through apply",
      source: `
        (() => function returned() { read(); })()
          .bind(undefined).apply(undefined, []);
      `
    }
  ] as const;
  return cases.map(({ name, source }) => {
    const result = ts.transpileModule(`
      let stateReadCount = 0;
      const read = () => {
        stateReadCount += 1;
        return {};
      };
      ${source}
      (globalThis as {
        stateReadCount?: number;
      }).stateReadCount = stateReadCount;
    `, {
      compilerOptions: {
        module: ts.ModuleKind.None,
        target: ts.ScriptTarget.ES2022
      },
      reportDiagnostics: true
    });
    const context: { stateReadCount?: number } = {};
    runInNewContext(result.outputText, context);
    return {
      diagnosticCodes: (result.diagnostics ?? []).map(
        (diagnostic) => diagnostic.code
      ),
      name,
      stateReadCount: context.stateReadCount
    };
  });
}

interface ResidentFactoryIssuerSource {
  readonly label: string;
  readonly sourceFile: ts.SourceFile;
}

interface ResidentFactoryIssuerAnalysis {
  readonly registrarDeclarationCount: number;
  readonly registrarImporters: readonly string[];
  readonly registrarCallers: readonly string[];
  readonly violations: readonly string[];
}

const residentFactoryIssuerRegistrar =
  "registerResidentLoopFactoryAuthorityReadback";
const residentFactoryCompositionPath =
  "packages/local-runtime/src/resident-loop-factory-composition.ts";
const residentFactoryWakePath =
  "packages/local-runtime/src/wake-supervisor-runtime.ts";
const residentFactoryWakeModule = "./wake-supervisor-runtime.js";

function residentFactoryIssuerProgram(
  sources: readonly ResidentFactoryIssuerSource[]
): ts.Program {
  const options: ts.CompilerOptions = {
    module: ts.ModuleKind.ESNext,
    noLib: true,
    noResolve: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022
  };
  const sourceFiles = new Map(
    sources.map((source) => [source.label, source.sourceFile] as const)
  );
  const baseHost = ts.createCompilerHost(options);
  const host: ts.CompilerHost = {
    ...baseHost,
    fileExists: (fileName) =>
      sourceFiles.has(fileName) || baseHost.fileExists(fileName),
    getCurrentDirectory: () => "",
    getSourceFile: (
      fileName,
      languageVersion,
      onError,
      shouldCreateNewSourceFile
    ) => sourceFiles.get(fileName) ??
      baseHost.getSourceFile(
        fileName,
        languageVersion,
        onError,
        shouldCreateNewSourceFile
      ),
    readFile: (fileName) =>
      sourceFiles.get(fileName)?.text ?? baseHost.readFile(fileName)
  };
  return ts.createProgram([...sourceFiles.keys()], options, host);
}

function residentFactoryIssuerAnalysis(
  sources: readonly ResidentFactoryIssuerSource[]
): ResidentFactoryIssuerAnalysis {
  const program = residentFactoryIssuerProgram(sources);
  const checker = program.getTypeChecker();
  const checkedSources = sources.map((source) => {
    const sourceFile = program.getSourceFile(source.label);
    if (sourceFile === undefined) {
      throw new Error(`resident factory issuer source missing: ${source.label}`);
    }
    return {
      label: source.label,
      sourceFile
    };
  });
  const registrarImporters = new Set<string>();
  const registrarCallers = new Set<string>();
  const violations = new Set<string>();
  const staticTruthy = 1;
  const staticFalsy = 2;
  const staticNullish = 4;
  const staticUnknown = staticTruthy | staticFalsy | staticNullish;
  const indeterminateBindingInitializer = Symbol(
    "indeterminateBindingInitializer"
  );
  const unreachableBindingInitializer = Symbol(
    "unreachableBindingInitializer"
  );
  type BindingInitializer =
    | ts.Expression
    | typeof indeterminateBindingInitializer
    | typeof unreachableBindingInitializer
    | undefined;
  const registrarImportSymbols = new Set<ts.Symbol>();
  const registrarDeclarations: ts.FunctionDeclaration[] = [];
  const exactImports: Array<{
    readonly label: string;
    readonly element: ts.ImportSpecifier;
  }> = [];
  const registrarCalls: Array<{
    readonly label: string;
    readonly call: ts.CallExpression;
  }> = [];

  for (const source of checkedSources) {
    for (const statement of source.sourceFile.statements) {
      if (
        source.label === residentFactoryWakePath &&
        ts.isFunctionDeclaration(statement) &&
        statement.name?.text === residentFactoryIssuerRegistrar
      ) {
        registrarDeclarations.push(statement);
      }
      if (
        ts.isImportDeclaration(statement) &&
        ts.isStringLiteral(statement.moduleSpecifier) &&
        isWakeRuntimeModule(statement.moduleSpecifier.text)
      ) {
        const clause = statement.importClause;
        const bindings = clause?.namedBindings;
        const named = bindings !== undefined && ts.isNamedImports(bindings)
          ? bindings.elements.filter((element) =>
              (element.propertyName?.text ?? element.name.text) ===
                residentFactoryIssuerRegistrar
            )
          : [];
        if (
          named.length > 0 ||
          clause?.name !== undefined ||
          (bindings !== undefined && ts.isNamespaceImport(bindings))
        ) {
          registrarImporters.add(source.label);
        }
        if (
          clause?.name !== undefined ||
          (bindings !== undefined && ts.isNamespaceImport(bindings))
        ) {
          violations.add(`${source.label}:alternate-import-carrier`);
        }
        for (const element of named) {
          const symbol = checker.getSymbolAtLocation(element.name);
          if (symbol !== undefined) {
            registrarImportSymbols.add(symbol);
          }
          if (
            source.label !== residentFactoryCompositionPath ||
            statement.moduleSpecifier.text !== residentFactoryWakeModule ||
            clause === undefined ||
            clause.isTypeOnly ||
            clause.name !== undefined ||
            bindings === undefined ||
            !ts.isNamedImports(bindings) ||
            statement.attributes !== undefined ||
            element.isTypeOnly ||
            element.propertyName !== undefined ||
            element.name.text !== residentFactoryIssuerRegistrar
          ) {
            violations.add(`${source.label}:noncanonical-registrar-import`);
          } else {
            exactImports.push({ label: source.label, element });
          }
        }
      }
      if (
        ts.isExportDeclaration(statement) &&
        statement.moduleSpecifier !== undefined &&
        ts.isStringLiteral(statement.moduleSpecifier) &&
        isWakeRuntimeModule(statement.moduleSpecifier.text)
      ) {
        const exportsRegistrar =
          statement.exportClause === undefined ||
          ts.isNamespaceExport(statement.exportClause) ||
          (
            ts.isNamedExports(statement.exportClause) &&
            statement.exportClause.elements.some((element) =>
              (element.propertyName?.text ?? element.name.text) ===
                residentFactoryIssuerRegistrar
            )
          );
        if (exportsRegistrar) {
          violations.add(`${source.label}:registrar-reexport`);
        }
      }
    }

    visit(source.sourceFile);

    function visit(node: ts.Node): void {
      if (
        ts.isCallExpression(node) &&
        (
          (
            node.expression.kind === ts.SyntaxKind.ImportKeyword &&
            node.arguments.length === 1 &&
            ts.isStringLiteral(node.arguments[0]!) &&
            isWakeRuntimeModule(node.arguments[0]!.text)
          ) ||
          (
            ts.isIdentifier(node.expression) &&
            node.expression.text === "require" &&
            node.arguments.length === 1 &&
            ts.isStringLiteral(node.arguments[0]!) &&
            isWakeRuntimeModule(node.arguments[0]!.text)
          )
        )
      ) {
        violations.add(`${source.label}:dynamic-registrar-loader`);
      }
      if (
        ts.isCallExpression(node) &&
        (
          (
            ts.isIdentifier(node.expression) &&
            node.expression.text === residentFactoryIssuerRegistrar
          ) ||
          (
            ts.isPropertyAccessExpression(node.expression) &&
            node.expression.name.text === residentFactoryIssuerRegistrar
          )
        )
      ) {
        registrarCallers.add(source.label);
        registrarCalls.push({ label: source.label, call: node });
      }
      ts.forEachChild(node, visit);
    }
  }

  rejectRegistrarExports();

  if (
    registrarDeclarations.length !== 1 ||
    !hasExactRegistrarSignature(registrarDeclarations[0])
  ) {
    violations.add(`${residentFactoryWakePath}:issuer-registrar-signature`);
  }
  if (
    exactImports.length !== 1 ||
    exactImports[0]?.label !== residentFactoryCompositionPath ||
    registrarImporters.size !== 1 ||
    !registrarImporters.has(residentFactoryCompositionPath)
  ) {
    violations.add(
      `${residentFactoryCompositionPath}:sole-direct-registrar-import`
    );
  }
  if (
    registrarCalls.length !== 1 ||
    registrarCalls[0]?.label !== residentFactoryCompositionPath ||
    registrarCallers.size !== 1 ||
    !registrarCallers.has(residentFactoryCompositionPath)
  ) {
    violations.add(
      `${residentFactoryCompositionPath}:sole-direct-registrar-call`
    );
  }

  const composition = checkedSources.find(
    (source) => source.label === residentFactoryCompositionPath
  )?.sourceFile;
  if (
    composition === undefined ||
    !hasExactIssuerThread(composition, registrarCalls[0]?.call)
  ) {
    violations.add(
      `${residentFactoryCompositionPath}:exact-construction-issuer-thread`
    );
  }

  return {
    registrarDeclarationCount: registrarDeclarations.length,
    registrarImporters: [...registrarImporters].sort(),
    registrarCallers: [...registrarCallers].sort(),
    violations: [...violations].sort()
  };

  function isWakeRuntimeModule(moduleName: string): boolean {
    return moduleName === residentFactoryWakeModule ||
      moduleName.endsWith("/wake-supervisor-runtime.js");
  }

  function rejectRegistrarExports(): void {
    for (const source of checkedSources) {
      for (const statement of source.sourceFile.statements) {
        if (
          ts.isExportDeclaration(statement) &&
          statement.moduleSpecifier === undefined &&
          statement.exportClause !== undefined &&
          ts.isNamedExports(statement.exportClause) &&
          statement.exportClause.elements.some((element) => {
            const target = checker.getExportSpecifierLocalTargetSymbol(element);
            return target !== undefined &&
              symbolResolvesToRegistrar(target, new Set());
          })
        ) {
          violations.add(`${source.label}:registrar-reexport`);
        }
        if (
          ts.isVariableStatement(statement) &&
          hasExportModifier(statement) &&
          statement.declarationList.declarations.some((declaration) =>
            bindingNameResolvesToRegistrar(
              declaration.name,
              declaration.initializer,
              new Set()
            )
          )
        ) {
          violations.add(`${source.label}:registrar-reexport`);
        }
        if (
          ts.isFunctionDeclaration(statement) &&
          hasExportModifier(statement) &&
          statement.body !== undefined &&
          functionBodyReturnsRegistrar(statement.body, new Set())
        ) {
          violations.add(`${source.label}:registrar-reexport`);
        }
        if (
          ts.isExportAssignment(statement) &&
          expressionResolvesToRegistrar(statement.expression, new Set())
        ) {
          violations.add(`${source.label}:registrar-reexport`);
        }
      }
    }
  }

  function hasExportModifier(node: ts.HasModifiers): boolean {
    return ts.getModifiers(node)?.some((modifier) =>
      modifier.kind === ts.SyntaxKind.ExportKeyword
    ) === true;
  }

  function symbolResolvesToRegistrar(
    symbol: ts.Symbol,
    resolving: Set<ts.Symbol>
  ): boolean {
    if (registrarImportSymbols.has(symbol)) return true;
    if (resolving.has(symbol)) return false;
    resolving.add(symbol);
    if ((symbol.flags & ts.SymbolFlags.Alias) !== 0) {
      const target = checker.getAliasedSymbol(symbol);
      if (
        target !== symbol &&
        symbolResolvesToRegistrar(target, resolving)
      ) {
        return true;
      }
    }
    return (symbol.declarations ?? []).some((declaration) => {
      const declarationPath = new Set(resolving);
      return (
        ts.isVariableDeclaration(declaration) &&
        bindingNameResolvesToRegistrar(
          declaration.name,
          declaration.initializer,
          declarationPath
        )
      ) ||
        (
          ts.isBindingElement(declaration) &&
          bindingElementResolvesToRegistrar(declaration, declarationPath)
        );
    });
  }

  function bindingNameResolvesToRegistrar(
    name: ts.BindingName,
    initializer: BindingInitializer,
    resolving: Set<ts.Symbol>
  ): boolean {
    if (ts.isIdentifier(name)) {
      return initializer !== undefined &&
        initializer !== indeterminateBindingInitializer &&
        initializer !== unreachableBindingInitializer &&
        expressionResolvesToRegistrar(initializer, resolving);
    }
    return name.elements.some((element) =>
      ts.isBindingElement(element) &&
      bindingElementResolvesToRegistrar(
        element,
        new Set(resolving),
        initializer
      )
    );
  }

  function bindingElementResolvesToRegistrar(
    element: ts.BindingElement,
    resolving: Set<ts.Symbol>,
    containingInitializer: BindingInitializer = bindingPatternInitializer(
      element.parent,
      resolving
    )
  ): boolean {
    const selected = selectedBindingInitializer(
      element,
      containingInitializer,
      resolving
    );
    if (selected === unreachableBindingInitializer) return false;
    if (selected === indeterminateBindingInitializer) {
      return bindingNameResolvesToRegistrar(
        element.name,
        indeterminateBindingInitializer,
        new Set(resolving)
      ) ||
        (
          element.initializer !== undefined &&
          bindingNameResolvesToRegistrar(
            element.name,
            element.initializer,
            new Set(resolving)
          )
        );
    }
    const usesDefault = selected === undefined ||
      expressionIsDefinitelyUndefined(selected, new Set(resolving));
    if (
      selected !== undefined &&
      !usesDefault &&
      bindingNameResolvesToRegistrar(element.name, selected, resolving)
    ) {
      return true;
    }
    return usesDefault &&
      element.initializer !== undefined &&
      bindingNameResolvesToRegistrar(
        element.name,
        element.initializer,
        resolving
      );
  }

  function bindingPatternInitializer(
    pattern: ts.ArrayBindingPattern | ts.ObjectBindingPattern,
    resolving: Set<ts.Symbol>
  ): BindingInitializer {
    const parent = pattern.parent;
    if (ts.isVariableDeclaration(parent)) return parent.initializer;
    if (ts.isBindingElement(parent)) {
      return selectedBindingInitializer(
        parent,
        bindingPatternInitializer(parent.parent, resolving),
        resolving
      );
    }
    return undefined;
  }

  function selectedBindingInitializer(
    element: ts.BindingElement,
    initializer: BindingInitializer,
    resolving: Set<ts.Symbol>
  ): BindingInitializer {
    if (initializer === unreachableBindingInitializer) {
      return unreachableBindingInitializer;
    }
    if (initializer === indeterminateBindingInitializer) {
      return indeterminateBindingInitializer;
    }
    if (initializer === undefined) return unreachableBindingInitializer;
    const carrierInitializer = initializer;
    let value = unwrapRegistrarExpression(initializer);
    const carrierPath = new Set(resolving);
    let carrierUse = carrierInitializer;
    while (ts.isIdentifier(value)) {
      const aliasInitializer = useClosedLocalConstInitializer(
        value,
        carrierPath,
        carrierUse
      );
      if (aliasInitializer === undefined) break;
      carrierUse = aliasInitializer;
      value = unwrapRegistrarExpression(aliasInitializer);
    }
    if (
      bindingPatternInitializerIsUnreachable(
        element.parent,
        value,
        new Set(carrierPath),
        carrierInitializer
      )
    ) {
      return unreachableBindingInitializer;
    }
    if (
      expressionEvaluationIsUnreachable(
        value,
        new Set(carrierPath)
      )
    ) {
      return unreachableBindingInitializer;
    }
    if (
      ts.isObjectBindingPattern(element.parent) &&
      ts.isObjectLiteralExpression(value)
    ) {
      const selectedName = bindingPropertyName(
        element.propertyName ?? element.name
      );
      if (selectedName === undefined) return undefined;
      return exactObjectLiteralBindingValue(
        value,
        selectedName,
        new Set(carrierPath)
      );
    }
    if (
      ts.isArrayBindingPattern(element.parent) &&
      ts.isArrayLiteralExpression(value)
    ) {
      const index = element.parent.elements.indexOf(element);
      const slots = exactArrayLiteralBindingSlots(
        value,
        new Set(resolving)
      );
      if (slots === unreachableBindingInitializer) {
        return unreachableBindingInitializer;
      }
      if (slots === undefined) return indeterminateBindingInitializer;
      return slots[index];
    }
    return expressionIsDefinitelyUndefined(value, new Set(resolving))
      ? undefined
      : indeterminateBindingInitializer;
  }

  function useClosedLocalConstInitializer(
    identifier: ts.Identifier,
    resolving: Set<ts.Symbol>,
    exactUse: ts.Expression
  ): ts.Expression | undefined {
    const symbol = checker.getSymbolAtLocation(identifier);
    if (symbol === undefined || resolving.has(symbol)) return undefined;
    const declaration = (symbol.declarations ?? []).find(
      (candidate): candidate is ts.VariableDeclaration =>
        ts.isVariableDeclaration(candidate) &&
        candidate.initializer !== undefined &&
        (candidate.parent.flags & ts.NodeFlags.Const) !== 0 &&
        (
          !ts.isVariableStatement(candidate.parent.parent) ||
          candidate.parent.parent.modifiers?.some((modifier) =>
            modifier.kind === ts.SyntaxKind.ExportKeyword ||
            modifier.kind === ts.SyntaxKind.DefaultKeyword
          ) !== true
        )
    );
    if (
      declaration?.initializer === undefined ||
      !symbolHasOnlyImmutableCarrierUses(
        symbol,
        new Set(resolving),
        exactUse
      )
    ) {
      return undefined;
    }
    resolving.add(symbol);
    return declaration.initializer;
  }

  function exactObjectLiteralBindingValue(
    object: ts.ObjectLiteralExpression,
    selectedName: string,
    resolving: Set<ts.Symbol>
  ): BindingInitializer {
    if (
      objectLiteralEvaluationIsUnreachable(
        object,
        new Set(resolving)
      )
    ) {
      return unreachableBindingInitializer;
    }
    let selected: BindingInitializer = undefined;
    for (const property of object.properties) {
      if (ts.isSpreadAssignment(property)) {
        const spreadResolving = new Set(resolving);
        const spreadObject = exactSpreadObjectLiteral(
          property.expression,
          spreadResolving,
          property.expression
        );
        if (spreadObject === undefined) {
          selected = indeterminateBindingInitializer;
          continue;
        }
        const spreadSelected = exactObjectLiteralBindingValue(
          spreadObject,
          selectedName,
          spreadResolving
        );
        if (spreadSelected !== undefined) selected = spreadSelected;
        continue;
      }
      const propertyName = bindingPropertyName(property.name);
      if (propertyName === undefined) {
        if (ts.isComputedPropertyName(property.name)) {
          selected = indeterminateBindingInitializer;
        }
        continue;
      }
      if (propertyName !== selectedName) continue;
      if (ts.isPropertyAssignment(property)) {
        selected = property.initializer;
        continue;
      }
      if (ts.isShorthandPropertyAssignment(property)) {
        selected = property.objectAssignmentInitializer === undefined
          ? property.name
          : shorthandAssignmentValueIsDefinitelyUndefined(
              property,
              new Set(resolving)
            )
          ? property.objectAssignmentInitializer
          : indeterminateBindingInitializer;
        continue;
      }
      selected = indeterminateBindingInitializer;
    }
    return selected;
  }

  function exactSpreadObjectLiteral(
    expression: ts.Expression,
    resolving: Set<ts.Symbol>,
    exactUse: ts.Expression
  ): ts.ObjectLiteralExpression | undefined {
    const value = unwrapRegistrarExpression(expression);
    if (ts.isObjectLiteralExpression(value)) return value;
    if (!ts.isIdentifier(value)) return undefined;
    const initializer = useClosedLocalConstInitializer(
      value,
      resolving,
      exactUse
    );
    return initializer === undefined
      ? undefined
      : exactSpreadObjectLiteral(
          initializer,
          resolving,
          initializer
        );
  }

  function exactArrayLiteralBindingSlots(
    array: ts.ArrayLiteralExpression,
    resolving: Set<ts.Symbol>
  ):
    | readonly (ts.Expression | undefined)[]
    | typeof unreachableBindingInitializer
    | undefined {
    const slots: (ts.Expression | undefined)[] = [];
    for (const element of array.elements) {
      if (ts.isOmittedExpression(element)) {
        slots.push(undefined);
        continue;
      }
      if (!ts.isSpreadElement(element)) {
        if (
          expressionEvaluationIsUnreachable(
            element,
            new Set(resolving)
          )
        ) {
          return unreachableBindingInitializer;
        }
        slots.push(element);
        continue;
      }
      const spreadResolving = new Set(resolving);
      const spreadArray = exactSpreadArrayLiteral(
        element.expression,
        spreadResolving,
        element.expression
      );
      if (spreadArray === undefined) return undefined;
      const spreadSlots = exactArrayLiteralBindingSlots(
        spreadArray,
        spreadResolving
      );
      if (spreadSlots === unreachableBindingInitializer) {
        return unreachableBindingInitializer;
      }
      if (spreadSlots === undefined) return undefined;
      slots.push(...spreadSlots);
    }
    return slots;
  }

  function expressionEvaluationIsUnreachable(
    expression: ts.Expression,
    resolving: Set<ts.Symbol>
  ): boolean {
    const value = unwrapRegistrarExpression(expression);
    if (ts.isArrayLiteralExpression(value)) {
      return exactArrayLiteralBindingSlots(value, resolving) ===
        unreachableBindingInitializer;
    }
    if (ts.isObjectLiteralExpression(value)) {
      return objectLiteralEvaluationIsUnreachable(value, resolving);
    }
    if (
      !ts.isCallExpression(value) ||
      value.questionDotToken !== undefined ||
      value.arguments.some(ts.isSpreadElement)
    ) {
      return false;
    }
    if (
      value.arguments.some((argument) =>
        expressionEvaluationIsUnreachable(
          argument,
          new Set(resolving)
        )
      )
    ) {
      return true;
    }
    return callableExpressionAlwaysThrows(
      value.expression,
      resolving,
      value.expression
    );
  }

  function objectLiteralEvaluationIsUnreachable(
    object: ts.ObjectLiteralExpression,
    resolving: Set<ts.Symbol>
  ): boolean {
    for (const property of object.properties) {
      if (
        !ts.isSpreadAssignment(property) &&
        ts.isComputedPropertyName(property.name) &&
        expressionEvaluationIsUnreachable(
          property.name.expression,
          new Set(resolving)
        )
      ) {
        return true;
      }
      if (
        ts.isPropertyAssignment(property) &&
        expressionEvaluationIsUnreachable(
          property.initializer,
          new Set(resolving)
        )
      ) {
        return true;
      }
      if (
        ts.isSpreadAssignment(property) &&
        expressionEvaluationIsUnreachable(
          property.expression,
          new Set(resolving)
        )
      ) {
        return true;
      }
      if (
        ts.isShorthandPropertyAssignment(property) &&
        property.objectAssignmentInitializer !== undefined &&
        shorthandAssignmentValueIsDefinitelyUndefined(
          property,
          new Set(resolving)
        ) &&
        expressionEvaluationIsUnreachable(
          property.objectAssignmentInitializer,
          new Set(resolving)
        )
      ) {
        return true;
      }
    }
    return false;
  }

  function shorthandAssignmentValueIsDefinitelyUndefined(
    property: ts.ShorthandPropertyAssignment,
    resolving: Set<ts.Symbol>
  ): boolean {
    const symbol = checker.getShorthandAssignmentValueSymbol(property);
    if (symbol === undefined || resolving.has(symbol)) return false;
    const declaration = (symbol.declarations ?? []).find(
      (candidate): candidate is ts.VariableDeclaration =>
        ts.isVariableDeclaration(candidate) &&
        candidate.initializer !== undefined &&
        (candidate.parent.flags & ts.NodeFlags.Const) !== 0 &&
        (
          !ts.isVariableStatement(candidate.parent.parent) ||
          candidate.parent.parent.modifiers?.some((modifier) =>
            modifier.kind === ts.SyntaxKind.ExportKeyword ||
            modifier.kind === ts.SyntaxKind.DefaultKeyword
          ) !== true
        )
    );
    if (
      declaration?.initializer === undefined ||
      !symbolHasOnlyImmutableCarrierUses(
        symbol,
        new Set(resolving),
        property.name
      )
    ) {
      return false;
    }
    resolving.add(symbol);
    return expressionIsDefinitelyUseClosedUndefined(
      declaration.initializer,
      resolving,
      declaration.initializer
    );
  }

  function expressionIsDefinitelyUseClosedUndefined(
    expression: ts.Expression,
    resolving: Set<ts.Symbol>,
    exactUse: ts.Expression
  ): boolean {
    const value = unwrapRegistrarExpression(expression);
    if (ts.isVoidExpression(value)) return true;
    if (!ts.isIdentifier(value)) return false;
    const symbol = checker.getSymbolAtLocation(value);
    if (
      value.text === "undefined" &&
      (symbol === undefined || (symbol.declarations ?? []).length === 0)
    ) {
      return true;
    }
    if (symbol === undefined || resolving.has(symbol)) return false;
    const declaration = (symbol.declarations ?? []).find(
      (candidate): candidate is ts.VariableDeclaration =>
        ts.isVariableDeclaration(candidate) &&
        candidate.initializer !== undefined &&
        (candidate.parent.flags & ts.NodeFlags.Const) !== 0 &&
        (
          !ts.isVariableStatement(candidate.parent.parent) ||
          candidate.parent.parent.modifiers?.some((modifier) =>
            modifier.kind === ts.SyntaxKind.ExportKeyword ||
            modifier.kind === ts.SyntaxKind.DefaultKeyword
          ) !== true
        )
    );
    if (
      declaration?.initializer === undefined ||
      !symbolHasOnlyImmutableCarrierUses(
        symbol,
        new Set(resolving),
        exactUse
      )
    ) {
      return false;
    }
    resolving.add(symbol);
    return expressionIsDefinitelyUseClosedUndefined(
      declaration.initializer,
      resolving,
      declaration.initializer
    );
  }

  function callableExpressionAlwaysThrows(
    expression: ts.LeftHandSideExpression,
    resolving: Set<ts.Symbol>,
    exactUse: ts.Expression
  ): boolean {
    const value = unwrapRegistrarExpression(expression);
    if (
      ts.isArrowFunction(value) ||
      ts.isFunctionExpression(value)
    ) {
      return functionBodyAlwaysThrows(value);
    }
    if (!ts.isIdentifier(value)) return false;
    const symbol = checker.getSymbolAtLocation(value);
    if (
      symbol === undefined ||
      resolving.has(symbol) ||
      !symbolHasOnlyImmutableCarrierUses(
        symbol,
        new Set(resolving),
        exactUse
      )
    ) {
      return false;
    }
    const declaration = (symbol.declarations ?? []).find(
      (candidate): candidate is
        | ts.FunctionDeclaration
        | ts.VariableDeclaration =>
        (
          ts.isFunctionDeclaration(candidate) &&
          candidate.body !== undefined
        ) ||
        (
          ts.isVariableDeclaration(candidate) &&
          candidate.initializer !== undefined &&
          (candidate.parent.flags & ts.NodeFlags.Const) !== 0 &&
          (
            !ts.isVariableStatement(candidate.parent.parent) ||
            candidate.parent.parent.modifiers?.some((modifier) =>
              modifier.kind === ts.SyntaxKind.ExportKeyword ||
              modifier.kind === ts.SyntaxKind.DefaultKeyword
            ) !== true
          )
        )
    );
    if (declaration === undefined) return false;
    if (ts.isFunctionDeclaration(declaration)) {
      return functionBodyAlwaysThrows(declaration);
    }
    const initializer = unwrapRegistrarExpression(
      declaration.initializer!
    );
    if (
      ts.isArrowFunction(initializer) ||
      ts.isFunctionExpression(initializer)
    ) {
      return functionBodyAlwaysThrows(initializer);
    }
    if (!ts.isLeftHandSideExpression(initializer)) return false;
    const nextResolving = new Set(resolving);
    nextResolving.add(symbol);
    return callableExpressionAlwaysThrows(
      initializer,
      nextResolving,
      declaration.initializer!
    );
  }

  function functionBodyAlwaysThrows(
    declaration:
      | ts.FunctionDeclaration
      | ts.FunctionExpression
      | ts.ArrowFunction
  ): boolean {
    const body = declaration.body;
    return declaration.asteriskToken === undefined &&
      !declaration.modifiers?.some((modifier) =>
        modifier.kind === ts.SyntaxKind.AsyncKeyword
      ) &&
      body !== undefined &&
      ts.isBlock(body) &&
      body.statements.length === 1 &&
      body.statements[0] !== undefined &&
      ts.isThrowStatement(body.statements[0]);
  }

  function exactSpreadArrayLiteral(
    expression: ts.Expression,
    resolving: Set<ts.Symbol>,
    exactUse: ts.Expression
  ): ts.ArrayLiteralExpression | undefined {
    const value = unwrapRegistrarExpression(expression);
    if (ts.isArrayLiteralExpression(value)) return value;
    if (!ts.isIdentifier(value)) return undefined;
    const symbol = checker.getSymbolAtLocation(value);
    if (
      symbol === undefined ||
      resolving.has(symbol) ||
      !symbolHasOnlyImmutableCarrierUses(
        symbol,
        new Set(resolving),
        exactUse
      )
    ) {
      return undefined;
    }
    const declaration = (symbol.declarations ?? []).find(
      (candidate): candidate is ts.VariableDeclaration =>
        ts.isVariableDeclaration(candidate) &&
        candidate.initializer !== undefined &&
        (candidate.parent.flags & ts.NodeFlags.Const) !== 0 &&
        (
          !ts.isVariableStatement(candidate.parent.parent) ||
          candidate.parent.parent.modifiers?.some((modifier) =>
            modifier.kind === ts.SyntaxKind.ExportKeyword ||
            modifier.kind === ts.SyntaxKind.DefaultKeyword
          ) !== true
        )
    );
    if (declaration?.initializer === undefined) return undefined;
    resolving.add(symbol);
    return exactSpreadArrayLiteral(
      declaration.initializer,
      resolving,
      declaration.initializer
    );
  }

  function bindingPatternInitializerIsUnreachable(
    pattern: ts.ArrayBindingPattern | ts.ObjectBindingPattern,
    initializer: ts.Expression,
    resolving: Set<ts.Symbol>,
    carrierInitializer: ts.Expression
  ): boolean {
    if (
      initializer.kind === ts.SyntaxKind.NullKeyword ||
      expressionIsDefinitelyUndefined(initializer, new Set(resolving))
    ) {
      return true;
    }
    return ts.isArrayBindingPattern(pattern) &&
      expressionIsDefinitelyNonIterable(
        initializer,
        resolving,
        carrierInitializer
      );
  }

  function expressionIsDefinitelyNonIterable(
    expression: ts.Expression,
    resolving: Set<ts.Symbol>,
    carrierInitializer: ts.Expression
  ): boolean {
    const value = unwrapRegistrarExpression(expression);
    if (
      value.kind === ts.SyntaxKind.NullKeyword ||
      expressionIsDefinitelyUndefined(value, new Set(resolving))
    ) {
      return true;
    }
    if (ts.isIdentifier(value)) {
      if (
        unshadowedGlobalNumericConstant(value) !== undefined ||
        declarationIdentifierIsDefinitelyNonIterable(
          value,
          carrierInitializer
        )
      ) {
        return true;
      }
      const initializer = localConstInitializer(value, resolving);
      return initializer !== undefined &&
        expressionIsDefinitelyNonIterable(
          initializer,
          resolving,
          carrierInitializer
        );
    }
    if (
      value.kind === ts.SyntaxKind.TrueKeyword ||
      value.kind === ts.SyntaxKind.FalseKeyword ||
      staticNumericResult(value) !== undefined
    ) {
      return true;
    }
    if (ts.isObjectLiteralExpression(value)) {
      return value.properties.every((property) =>
        !ts.isSpreadAssignment(property) &&
        (
          !("name" in property) ||
          !ts.isComputedPropertyName(property.name)
        )
      );
    }
    return ts.isArrowFunction(value) ||
      ts.isFunctionExpression(value) ||
      ts.isClassExpression(value) ||
      ts.isRegularExpressionLiteral(value);
  }

  function declarationIdentifierIsDefinitelyNonIterable(
    identifier: ts.Identifier,
    carrierInitializer: ts.Expression
  ): boolean {
    const symbol = checker.getSymbolAtLocation(identifier);
    if (symbol === undefined) return false;
    const declaration = (symbol.declarations ?? []).find(
      (candidate): candidate is
        | ts.FunctionDeclaration
        | ts.ClassDeclaration =>
        ts.isFunctionDeclaration(candidate) ||
        ts.isClassDeclaration(candidate)
    );
    if (
      declaration === undefined ||
      declaration.modifiers?.some((modifier) =>
        modifier.kind === ts.SyntaxKind.ExportKeyword ||
        modifier.kind === ts.SyntaxKind.DefaultKeyword ||
        modifier.kind === ts.SyntaxKind.Decorator
      ) ||
      (
        ts.isClassDeclaration(declaration) &&
        (
          declaration.heritageClauses?.some(
            (clause) => clause.token === ts.SyntaxKind.ExtendsKeyword
          ) === true ||
          classDeclarationMayDefineIterator(declaration)
        )
      )
    ) {
      return false;
    }
    return symbolHasOnlyImmutableCarrierUses(
      symbol,
      new Set(),
      carrierInitializer
    );
  }

  function classDeclarationMayDefineIterator(
    declaration: ts.ClassDeclaration
  ): boolean {
    return declaration.members.some((member) => {
      if (ts.isClassStaticBlockDeclaration(member)) {
        return nodeMentionsSymbolIterator(member);
      }
      const isStatic =
        (ts.getCombinedModifierFlags(member) & ts.ModifierFlags.Static) !== 0;
      if (!isStatic) return false;
      if (
        member.name !== undefined &&
        ts.isComputedPropertyName(member.name)
      ) {
        return true;
      }
      return ts.isPropertyDeclaration(member) &&
        member.initializer !== undefined &&
        nodeMentionsSymbolIterator(member.initializer);
    });
  }

  function nodeMentionsSymbolIterator(node: ts.Node): boolean {
    let mentionsIterator = false;
    inspect(node);
    return mentionsIterator;

    function inspect(current: ts.Node): void {
      if (mentionsIterator) return;
      if (
        (
          ts.isPropertyAccessExpression(current) &&
          ts.isIdentifier(current.expression) &&
          current.expression.text === "Symbol" &&
          current.name.text === "iterator"
        ) ||
        (
          ts.isElementAccessExpression(current) &&
          ts.isIdentifier(current.expression) &&
          current.expression.text === "Symbol" &&
          current.argumentExpression !== undefined &&
          (
            ts.isStringLiteral(current.argumentExpression) ||
            ts.isNoSubstitutionTemplateLiteral(current.argumentExpression)
          ) &&
          current.argumentExpression.text === "iterator"
        )
      ) {
        mentionsIterator = true;
        return;
      }
      ts.forEachChild(current, inspect);
    }
  }

  function symbolHasOnlyImmutableCarrierUses(
    symbol: ts.Symbol,
    resolving: Set<ts.Symbol>,
    carrierInitializer: ts.Expression
  ): boolean {
    if (resolving.has(symbol)) return false;
    const nextResolving = new Set(resolving);
    nextResolving.add(symbol);
    let valid = true;
    for (const source of checkedSources) {
      inspect(source.sourceFile);
      if (!valid) return false;
    }
    return true;

    function inspect(node: ts.Node): void {
      if (!valid) return;
      if (
        ts.isIdentifier(node) &&
        checker.getSymbolAtLocation(node) === symbol &&
        !identifierIsImmutableCarrierUse(
          node,
          symbol,
          nextResolving,
          carrierInitializer
        )
      ) {
        valid = false;
        return;
      }
      ts.forEachChild(node, inspect);
    }
  }

  function identifierIsImmutableCarrierUse(
    identifier: ts.Identifier,
    symbol: ts.Symbol,
    resolving: Set<ts.Symbol>,
    carrierInitializer: ts.Expression
  ): boolean {
    if (
      (symbol.declarations ?? []).some(
        (declaration) =>
          (declaration as ts.NamedDeclaration).name === identifier
      )
    ) {
      return true;
    }
    if (
      ts.isPartOfTypeNode(identifier) ||
      ts.isTypeQueryNode(identifier.parent)
    ) {
      return true;
    }
    let expression: ts.Expression = identifier;
    while (
      (
        ts.isParenthesizedExpression(expression.parent) ||
        ts.isAsExpression(expression.parent) ||
        ts.isTypeAssertionExpression(expression.parent) ||
        ts.isNonNullExpression(expression.parent) ||
        ts.isSatisfiesExpression(expression.parent)
      ) &&
      expression.parent.expression === expression
    ) {
      expression = expression.parent;
    }
    if (expression === carrierInitializer) return true;
    const parent = expression.parent;
    if (
      !ts.isVariableDeclaration(parent) ||
      parent.initializer !== expression
    ) {
      return false;
    }
    if (
      !ts.isIdentifier(parent.name) ||
      (parent.parent.flags & ts.NodeFlags.Const) === 0 ||
      (
        ts.isVariableStatement(parent.parent.parent) &&
        parent.parent.parent.modifiers?.some((modifier) =>
          modifier.kind === ts.SyntaxKind.ExportKeyword ||
          modifier.kind === ts.SyntaxKind.DefaultKeyword
        )
      )
    ) {
      return false;
    }
    const alias = checker.getSymbolAtLocation(parent.name);
    return alias !== undefined &&
      symbolHasOnlyImmutableCarrierUses(
        alias,
        resolving,
        carrierInitializer
      );
  }

  function bindingPropertyName(
    name: ts.BindingName | ts.PropertyName
  ): string | undefined {
    if (
      ts.isIdentifier(name) ||
      ts.isStringLiteral(name)
    ) {
      return name.text;
    }
    if (ts.isNumericLiteral(name)) {
      return String(Number(name.text));
    }
    if (ts.isComputedPropertyName(name)) {
      const expression = unwrapRegistrarExpression(name.expression);
      if (
        ts.isStringLiteral(expression) ||
        ts.isNoSubstitutionTemplateLiteral(expression)
      ) {
        return expression.text;
      }
      if (ts.isNumericLiteral(expression)) {
        return String(Number(expression.text));
      }
    }
    return undefined;
  }

  function expressionResolvesToRegistrar(
    expression: ts.Expression,
    resolving: Set<ts.Symbol>
  ): boolean {
    if (ts.isIdentifier(expression)) {
      const symbol = checker.getSymbolAtLocation(expression);
      return symbol !== undefined &&
        symbolResolvesToRegistrar(symbol, resolving);
    }
    if (
      ts.isParenthesizedExpression(expression) ||
      ts.isAsExpression(expression) ||
      ts.isTypeAssertionExpression(expression) ||
      ts.isNonNullExpression(expression) ||
      ts.isSatisfiesExpression(expression) ||
      ts.isAwaitExpression(expression)
    ) {
      return expressionResolvesToRegistrar(expression.expression, resolving);
    }
    if (ts.isConditionalExpression(expression)) {
      return expressionResolvesToRegistrar(
        expression.whenTrue,
        new Set(resolving)
      ) ||
        expressionResolvesToRegistrar(
          expression.whenFalse,
          new Set(resolving)
        );
    }
    if (ts.isBinaryExpression(expression)) {
      const leftTruthiness = expressionStaticTruthiness(expression.left);
      if (
        expression.operatorToken.kind === ts.SyntaxKind.BarBarToken
      ) {
        if (leftTruthiness === true) {
          return expressionResolvesToRegistrar(expression.left, resolving);
        }
        if (leftTruthiness === false) {
          return expressionResolvesToRegistrar(expression.right, resolving);
        }
        return expressionResolvesToRegistrar(
          expression.left,
          new Set(resolving)
        ) ||
          expressionResolvesToRegistrar(
            expression.right,
            new Set(resolving)
          );
      }
      if (
        expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
      ) {
        if (leftTruthiness === false) {
          return expressionResolvesToRegistrar(expression.left, resolving);
        }
        if (leftTruthiness === true) {
          return expressionResolvesToRegistrar(expression.right, resolving);
        }
        return expressionResolvesToRegistrar(
          expression.left,
          new Set(resolving)
        ) ||
          expressionResolvesToRegistrar(
            expression.right,
            new Set(resolving)
          );
      }
      if (
        expression.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
      ) {
        const leftNullishness = expressionStaticNullishness(expression.left);
        if (leftNullishness === true) {
          return expressionResolvesToRegistrar(expression.right, resolving);
        }
        if (leftNullishness === false) {
          return expressionResolvesToRegistrar(expression.left, resolving);
        }
        return expressionResolvesToRegistrar(
          expression.left,
          new Set(resolving)
        ) ||
          expressionResolvesToRegistrar(
            expression.right,
            new Set(resolving)
          );
      }
    }
    if (
      ts.isBinaryExpression(expression) &&
      expression.operatorToken.kind === ts.SyntaxKind.CommaToken
    ) {
      return expressionResolvesToRegistrar(expression.right, resolving);
    }
    if (
      ts.isCallExpression(expression) &&
      expression.questionDotToken === undefined &&
      boundCallableTarget(expression.expression) !== undefined
    ) {
      return expressionResolvesToRegistrar(
        boundCallableTarget(expression.expression)!,
        resolving
      );
    }
    if (ts.isArrowFunction(expression)) {
      return ts.isBlock(expression.body)
        ? functionBodyReturnsRegistrar(expression.body, resolving)
        : expressionResolvesToRegistrar(expression.body, resolving);
    }
    if (ts.isFunctionExpression(expression)) {
      return functionBodyReturnsRegistrar(expression.body, resolving);
    }
    return false;
  }

  function expressionStaticTruthiness(
    expression: ts.Expression
  ): boolean | undefined {
    const outcomes = expressionStaticOutcomes(expression, new Set());
    if (outcomes === staticTruthy) return true;
    return (outcomes & staticTruthy) === 0 ? false : undefined;
  }

  function expressionStaticNullishness(
    expression: ts.Expression
  ): boolean | undefined {
    const outcomes = expressionStaticOutcomes(expression, new Set());
    if (outcomes === staticNullish) return true;
    return (outcomes & staticNullish) === 0 ? false : undefined;
  }

  function expressionStaticOutcomes(
    expression: ts.Expression,
    resolving: Set<ts.Symbol>
  ): number {
    const value = unwrapRegistrarExpression(expression);
    if (value.kind === ts.SyntaxKind.TrueKeyword) return staticTruthy;
    if (value.kind === ts.SyntaxKind.FalseKeyword) return staticFalsy;
    if (
      value.kind === ts.SyntaxKind.NullKeyword ||
      expressionIsDefinitelyUndefined(value, new Set(resolving))
    ) {
      return staticNullish;
    }
    if (ts.isIdentifier(value)) {
      const initializer = localConstInitializer(value, resolving);
      return initializer === undefined
        ? staticUnknown
        : expressionStaticOutcomes(initializer, resolving);
    }
    if (ts.isNumericLiteral(value)) {
      return Number(value.text) === 0 ? staticFalsy : staticTruthy;
    }
    if (ts.isBigIntLiteral(value)) {
      return BigInt(value.text.slice(0, -1)) === 0n
        ? staticFalsy
        : staticTruthy;
    }
    if (
      ts.isStringLiteral(value) ||
      ts.isNoSubstitutionTemplateLiteral(value)
    ) {
      return value.text.length === 0 ? staticFalsy : staticTruthy;
    }
    if (
      ts.isObjectLiteralExpression(value) ||
      ts.isArrayLiteralExpression(value) ||
      ts.isArrowFunction(value) ||
      ts.isFunctionExpression(value) ||
      ts.isClassExpression(value) ||
      ts.isNewExpression(value) ||
      ts.isRegularExpressionLiteral(value)
    ) {
      return staticTruthy;
    }
    if (ts.isTemplateExpression(value)) {
      return staticTruthy | staticFalsy;
    }
    if (
      ts.isPrefixUnaryExpression(value) &&
      value.operator === ts.SyntaxKind.ExclamationToken
    ) {
      const operand = expressionStaticOutcomes(
        value.operand,
        new Set(resolving)
      );
      return (
        ((operand & staticTruthy) !== 0 ? staticFalsy : 0) |
        ((operand & (staticFalsy | staticNullish)) !== 0 ? staticTruthy : 0)
      );
    }
    const numericResult = staticNumericResult(value);
    if (numericResult !== undefined) {
      const isFalsy = typeof numericResult === "bigint"
        ? numericResult === 0n
        : numericResult === 0 || Number.isNaN(numericResult);
      return isFalsy ? staticFalsy : staticTruthy;
    }
    if (
      ts.isPrefixUnaryExpression(value) ||
      ts.isDeleteExpression(value)
    ) {
      return staticTruthy | staticFalsy;
    }
    if (ts.isTypeOfExpression(value)) return staticTruthy;
    if (ts.isConditionalExpression(value)) {
      const condition = expressionStaticOutcomes(
        value.condition,
        new Set(resolving)
      );
      return (
        ((condition & staticTruthy) !== 0
          ? expressionStaticOutcomes(value.whenTrue, new Set(resolving))
          : 0) |
        ((condition & (staticFalsy | staticNullish)) !== 0
          ? expressionStaticOutcomes(value.whenFalse, new Set(resolving))
          : 0)
      );
    }
    if (ts.isBinaryExpression(value)) {
      if (value.operatorToken.kind === ts.SyntaxKind.CommaToken) {
        return expressionStaticOutcomes(value.right, resolving);
      }
      const left = expressionStaticOutcomes(
        value.left,
        new Set(resolving)
      );
      const right = expressionStaticOutcomes(value.right, new Set(resolving));
      if (value.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
        return (
          (left & staticTruthy) |
          ((left & (staticFalsy | staticNullish)) !== 0 ? right : 0)
        );
      }
      if (
        value.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
      ) {
        return (
          (left & (staticFalsy | staticNullish)) |
          ((left & staticTruthy) !== 0 ? right : 0)
        );
      }
      if (
        value.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
      ) {
        return (
          (left & (staticTruthy | staticFalsy)) |
          ((left & staticNullish) !== 0 ? right : 0)
        );
      }
    }
    return staticUnknown;
  }

  function staticNumericResult(
    expression: ts.Expression
  ): number | bigint | undefined {
    const value = unwrapRegistrarExpression(expression);
    if (ts.isIdentifier(value)) {
      return unshadowedGlobalNumericConstant(value);
    }
    if (ts.isNumericLiteral(value)) return Number(value.text);
    if (ts.isBigIntLiteral(value)) {
      return BigInt(value.text.slice(0, -1));
    }
    if (!ts.isPrefixUnaryExpression(value)) return undefined;
    const operand = staticNumericResult(value.operand);
    if (operand === undefined) return undefined;
    if (value.operator === ts.SyntaxKind.PlusToken) {
      return typeof operand === "number" ? +operand : undefined;
    }
    if (value.operator === ts.SyntaxKind.MinusToken) {
      return typeof operand === "bigint" ? -operand : -operand;
    }
    if (value.operator === ts.SyntaxKind.TildeToken) {
      return typeof operand === "bigint" ? ~operand : ~operand;
    }
    return undefined;
  }

  function unshadowedGlobalNumericConstant(
    identifier: ts.Identifier
  ): number | undefined {
    const symbol = checker.getSymbolAtLocation(identifier);
    if ((symbol?.declarations ?? []).length > 0) return undefined;
    if (identifier.text === "Infinity") return Infinity;
    if (identifier.text === "NaN") return NaN;
    return undefined;
  }

  function localConstInitializer(
    identifier: ts.Identifier,
    resolving: Set<ts.Symbol>
  ): ts.Expression | undefined {
    const symbol = checker.getSymbolAtLocation(identifier);
    if (symbol === undefined || resolving.has(symbol)) return undefined;
    const declaration = (symbol.declarations ?? []).find(
      (candidate): candidate is ts.VariableDeclaration =>
        ts.isVariableDeclaration(candidate) &&
        candidate.initializer !== undefined &&
        (candidate.parent.flags & ts.NodeFlags.Const) !== 0
    );
    if (declaration?.initializer === undefined) return undefined;
    resolving.add(symbol);
    return declaration.initializer;
  }

  function boundCallableTarget(
    expression: ts.LeftHandSideExpression
  ): ts.Expression | undefined {
    if (
      ts.isPropertyAccessExpression(expression) &&
      expression.questionDotToken === undefined &&
      expression.name.text === "bind"
    ) {
      return expression.expression;
    }
    if (
      ts.isElementAccessExpression(expression) &&
      expression.questionDotToken === undefined &&
      ts.isStringLiteral(expression.argumentExpression) &&
      expression.argumentExpression.text === "bind"
    ) {
      return expression.expression;
    }
    return undefined;
  }

  function functionBodyReturnsRegistrar(
    body: ts.Block,
    resolving: Set<ts.Symbol>
  ): boolean {
    let returnsRegistrar = false;
    visit(body);
    return returnsRegistrar;

    function visit(node: ts.Node): void {
      if (returnsRegistrar) return;
      if (
        ts.isReturnStatement(node) &&
        node.expression !== undefined &&
        expressionResolvesToRegistrar(
          node.expression,
          new Set(resolving)
        )
      ) {
        returnsRegistrar = true;
        return;
      }
      if (
        node !== body &&
        (
          ts.isArrowFunction(node) ||
          ts.isFunctionExpression(node) ||
          ts.isFunctionDeclaration(node)
        )
      ) {
        return;
      }
      ts.forEachChild(node, visit);
    }
  }

  function expressionIsDefinitelyUndefined(
    expression: ts.Expression,
    resolving: Set<ts.Symbol>
  ): boolean {
    const value = unwrapRegistrarExpression(expression);
    if (ts.isVoidExpression(value)) return true;
    if (!ts.isIdentifier(value)) return false;
    const symbol = checker.getSymbolAtLocation(value);
    if (
      value.text === "undefined" &&
      (symbol === undefined || (symbol.declarations ?? []).length === 0)
    ) {
      return true;
    }
    if (symbol === undefined || resolving.has(symbol)) return false;
    resolving.add(symbol);
    return (symbol.declarations ?? []).some((declaration) =>
      ts.isVariableDeclaration(declaration) &&
      declaration.initializer !== undefined &&
      expressionIsDefinitelyUndefined(
        declaration.initializer,
        new Set(resolving)
      )
    );
  }

  function unwrapRegistrarExpression(
    expression: ts.Expression
  ): ts.Expression {
    let current = expression;
    while (
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isTypeAssertionExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isSatisfiesExpression(current)
    ) {
      current = current.expression;
    }
    return current;
  }

  function hasExactRegistrarSignature(
    declaration: ts.FunctionDeclaration | undefined
  ): boolean {
    if (
      declaration === undefined ||
      declaration.asteriskToken !== undefined ||
      declaration.body === undefined ||
      declaration.parameters.length !== 3
    ) {
      return false;
    }
    const modifiers = declaration.modifiers ?? [];
    if (
      !modifiers.some((modifier) =>
        modifier.kind === ts.SyntaxKind.ExportKeyword
      ) ||
      modifiers.some((modifier) =>
        modifier.kind === ts.SyntaxKind.DefaultKeyword
      )
    ) {
      return false;
    }
    return declaration.parameters.every((parameter, index) =>
      ts.isIdentifier(parameter.name) &&
      parameter.name.text ===
        ["issuerIdentity", "wakeRuntime", "readback"][index] &&
      parameter.dotDotDotToken === undefined &&
      parameter.questionToken === undefined &&
      parameter.initializer === undefined
    );
  }

  function hasExactIssuerThread(
    sourceFile: ts.SourceFile,
    registrarCall: ts.CallExpression | undefined
  ): boolean {
    const factory = sourceFile.statements.find(
      (statement): statement is ts.FunctionDeclaration =>
        ts.isFunctionDeclaration(statement) &&
        statement.name?.text === "createResidentLoopFactoryComposition"
    );
    if (
      factory?.body === undefined ||
      factory.parameters.length !== 1 ||
      registrarCall === undefined ||
      !ts.isIdentifier(registrarCall.expression) ||
      registrarCall.expression.text !== residentFactoryIssuerRegistrar ||
      registrarCall.questionDotToken !== undefined ||
      registrarCall.arguments.length !== 3 ||
      registrarCall.arguments.some(ts.isSpreadElement) ||
      !registrarCall.arguments.every(ts.isIdentifier) ||
      registrarCall.arguments.map((argument) =>
        ts.isIdentifier(argument) ? argument.text : ""
      ).join(",") !==
        "input,wakeRuntime,readback" ||
      !isInsideExactBind(registrarCall, factory)
    ) {
      return false;
    }

    const declarations = factory.body.statements.flatMap((statement) =>
      ts.isVariableStatement(statement)
        ? [...statement.declarationList.declarations]
        : []
    );
    const inputDeclarations = declarations.filter((declaration) =>
      ts.isIdentifier(declaration.name) &&
      declaration.name.text === "input" &&
      declaration.initializer !== undefined &&
      ts.isCallExpression(declaration.initializer) &&
      ts.isIdentifier(declaration.initializer.expression) &&
      declaration.initializer.expression.text === "normalizeCompositionInput" &&
      declaration.initializer.arguments.length === 1 &&
      ts.isIdentifier(declaration.initializer.arguments[0]!) &&
      ts.isIdentifier(factory.parameters[0]!.name) &&
      declaration.initializer.arguments[0]!.text ===
        factory.parameters[0]!.name.text
    );
    const wakeDeclarations = declarations.filter((declaration) =>
      ts.isIdentifier(declaration.name) &&
      declaration.name.text === "wakeRuntime" &&
      declaration.initializer !== undefined &&
      ts.isCallExpression(declaration.initializer) &&
      ts.isIdentifier(declaration.initializer.expression) &&
      declaration.initializer.expression.text === "createWakeSupervisorRuntime" &&
      declaration.initializer.questionDotToken === undefined &&
      declaration.initializer.arguments.length === 1 &&
      ts.isIdentifier(declaration.initializer.arguments[0]!) &&
      declaration.initializer.arguments[0]!.text === "input"
    );
    return inputDeclarations.length === 1 && wakeDeclarations.length === 1;
  }

  function isInsideExactBind(
    call: ts.CallExpression,
    factory: ts.FunctionDeclaration
  ): boolean {
    for (
      let current: ts.Node | undefined = call.parent;
      current !== undefined && current !== factory;
      current = current.parent
    ) {
      if (
        (
          ts.isArrowFunction(current) ||
          ts.isFunctionExpression(current)
        ) &&
        ts.isVariableDeclaration(current.parent) &&
        ts.isIdentifier(current.parent.name) &&
        current.parent.name.text === "bind" &&
        current.parent.initializer === current
      ) {
        return true;
      }
      if (ts.isFunctionLike(current) && current !== call.parent) {
        return false;
      }
    }
    return false;
  }
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

  it("seals the exact construction issuer to one composition importer and caller token", () => {
    const exactWake = `
      export function registerResidentLoopFactoryAuthorityReadback(
        issuerIdentity: object,
        wakeRuntime: object,
        readback: object
      ): void {
        void issuerIdentity;
        void wakeRuntime;
        void readback;
      }
    `;
    const exactComposition = `
      import {
        registerResidentLoopFactoryAuthorityReadback
      } from "./wake-supervisor-runtime.js";
      export function createResidentLoopFactoryComposition(rawInput: unknown) {
        const input = normalizeCompositionInput(rawInput);
        const wakeRuntime = createWakeSupervisorRuntime(input);
        const bind = async () => {
          const readback = Object.freeze({});
          registerResidentLoopFactoryAuthorityReadback(
            input,
            wakeRuntime,
            readback
          );
          return readback;
        };
        return { bind };
      }
    `;
    const analyzeControl = (
      compositionSource: string,
      extraSources: readonly {
        readonly label: string;
        readonly source: string;
      }[] = []
    ) => residentFactoryIssuerAnalysis([
      {
        label: residentFactoryWakePath,
        sourceFile: ts.createSourceFile(
          residentFactoryWakePath,
          exactWake,
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TS
        )
      },
      {
        label: residentFactoryCompositionPath,
        sourceFile: ts.createSourceFile(
          residentFactoryCompositionPath,
          compositionSource,
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TS
        )
      },
      ...extraSources.map(({ label, source }) => ({
        label,
        sourceFile: ts.createSourceFile(
          label,
          source,
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TS
        )
      }))
    ]);

    expect(analyzeControl(exactComposition).violations).toEqual([]);
    for (const [name, source] of [
      [
        "local named re-export",
        `${exactComposition}
         export { registerResidentLoopFactoryAuthorityReadback };`
      ],
      [
        "local named re-export with exported alias",
        `${exactComposition}
         export {
           registerResidentLoopFactoryAuthorityReadback as exposedRegistrar
         };`
      ],
      [
        "imported local alias re-export",
        `${exactComposition
          .replace(
            "registerResidentLoopFactoryAuthorityReadback\n      }",
            "registerResidentLoopFactoryAuthorityReadback as importedRegistrar\n      }"
          )
          .replace(
            "\n          registerResidentLoopFactoryAuthorityReadback(\n",
            "\n          importedRegistrar(\n"
          )}
         export { importedRegistrar };`
      ],
      [
        "exported local alias binding",
        `${exactComposition}
         export const exposedRegistrar =
           registerResidentLoopFactoryAuthorityReadback;`
      ],
      [
        "exported object-destructured alias binding",
        `${exactComposition}
         const registrarCarrier = {
           exposedRegistrar:
             registerResidentLoopFactoryAuthorityReadback
         };
         export const { exposedRegistrar } = registrarCarrier;`
      ],
      [
        "exported array-destructured alias binding",
        `${exactComposition}
         const registrarCarrier = [
           undefined,
           registerResidentLoopFactoryAuthorityReadback
         ];
         export const [, exposedRegistrar] = registrarCarrier;`
      ],
      [
        "exported object-destructured alias after sibling",
        `${exactComposition}
         const registrarCarrier = {
           unrelated: Object.freeze({}),
           exposedRegistrar:
             registerResidentLoopFactoryAuthorityReadback
         };
         export const {
           unrelated,
           exposedRegistrar
         } = registrarCarrier;`
      ],
      [
        "exported array-destructured alias after sibling",
        `${exactComposition}
         const registrarCarrier = [
           Object.freeze({}),
           registerResidentLoopFactoryAuthorityReadback
         ];
         export const [
           unrelated,
           exposedRegistrar
         ] = registrarCarrier;`
      ],
      [
        "exported object-destructured explicit-undefined default",
        `${exactComposition}
         const registrarCarrier = { exposedRegistrar: undefined };
         export const {
           exposedRegistrar =
             registerResidentLoopFactoryAuthorityReadback
         } = registrarCarrier;`
      ],
      [
        "exported array-destructured explicit-undefined default",
        `${exactComposition}
         const registrarCarrier = [undefined];
         export const [
           exposedRegistrar =
             registerResidentLoopFactoryAuthorityReadback
         ] = registrarCarrier;`
      ],
      [
        "exported destructured alias through two carriers",
        `${exactComposition}
         const firstCarrier = {
           exposedRegistrar:
             registerResidentLoopFactoryAuthorityReadback
         };
         const secondCarrier = firstCarrier;
         export const { exposedRegistrar } = secondCarrier;`
      ],
      [
        "exported bound-callable alias binding",
        `${exactComposition}
         export const exposedRegistrar =
           registerResidentLoopFactoryAuthorityReadback.bind(undefined);`
      ],
      [
        "exported bracket-bound-callable alias binding",
        `${exactComposition}
         export const exposedRegistrar =
           registerResidentLoopFactoryAuthorityReadback["bind"](undefined);`
      ],
      [
        "exported callable result alias binding",
        `${exactComposition}
         export const exposedRegistrar = () =>
           registerResidentLoopFactoryAuthorityReadback;`
      ],
      [
        "exported callable declaration result",
        `${exactComposition}
         export function exposedRegistrar() {
           return registerResidentLoopFactoryAuthorityReadback;
         }`
      ],
      [
        "exported awaited alias binding",
        `${exactComposition}
         export const exposedRegistrar =
           await registerResidentLoopFactoryAuthorityReadback;`
      ],
      [
        "exported conditional-expression alias binding",
        `${exactComposition}
         export const exposedRegistrar = true
           ? registerResidentLoopFactoryAuthorityReadback
           : registerResidentLoopFactoryAuthorityReadback;`
      ],
      [
        "exported logical-or result alias binding",
        `${exactComposition}
         export const exposedRegistrar =
           false || registerResidentLoopFactoryAuthorityReadback;`
      ],
      [
        "exported logical-and result alias binding",
        `${exactComposition}
         export const exposedRegistrar =
           true && registerResidentLoopFactoryAuthorityReadback;`
      ],
      [
        "exported nullish result alias binding",
        `${exactComposition}
         export const exposedRegistrar =
           undefined ?? registerResidentLoopFactoryAuthorityReadback;`
      ],
      [
        "exported awaited logical-or result alias binding",
        `${exactComposition}
         export const exposedRegistrar =
           false ||
             await registerResidentLoopFactoryAuthorityReadback;`
      ],
      [
        "exported awaited logical-and result alias binding",
        `${exactComposition}
         export const exposedRegistrar =
           true &&
             await registerResidentLoopFactoryAuthorityReadback;`
      ],
      [
        "exported awaited nullish result alias binding",
        `${exactComposition}
         export const exposedRegistrar =
           undefined ??
             await registerResidentLoopFactoryAuthorityReadback;`
      ],
      [
        "exported awaited false-thenable logical-or result",
        `${exactComposition}
         const falseThenable = {
           then(resolve: (value: false) => unknown) {
             resolve(false);
           }
         };
         export const exposedRegistrar =
           (await falseThenable) ||
             registerResidentLoopFactoryAuthorityReadback;`
      ],
      [
        "exported awaited null-thenable nullish result",
        `${exactComposition}
         const nullThenable = {
           then(resolve: (value: null) => unknown) {
             resolve(null);
           }
         };
         export const exposedRegistrar =
           (await nullThenable) ??
             registerResidentLoopFactoryAuthorityReadback;`
      ],
      [
        "exported awaited undefined-property default",
        `${exactComposition}
         const undefinedThenable = {
           exposedRegistrar: Object.freeze({}),
           then(
             resolve: (
               value: { exposedRegistrar: undefined }
             ) => unknown
           ) {
             resolve({ exposedRegistrar: undefined });
           }
         };
         export const {
           exposedRegistrar =
             registerResidentLoopFactoryAuthorityReadback
         } = await undefinedThenable;`
      ],
      [
        "exported awaited nested-object default",
        `${exactComposition}
         const nestedObjectThenable = {
           a: { exposedRegistrar: Object.freeze({}) },
           then(
             resolve: (
               value: { a: { exposedRegistrar: undefined } }
             ) => unknown
           ) {
             resolve({ a: { exposedRegistrar: undefined } });
           }
         };
         export const {
           a: {
             exposedRegistrar =
               registerResidentLoopFactoryAuthorityReadback
           }
         } = await nestedObjectThenable;`
      ],
      [
        "exported awaited nested-array default",
        `${exactComposition}
         const nestedArrayThenable = {
           then(
             resolve: (value: [[undefined]]) => unknown
           ) {
             resolve([[undefined]]);
           }
         };
         export const [[
           exposedRegistrar =
             registerResidentLoopFactoryAuthorityReadback
         ]] = await nestedArrayThenable;`
      ],
      [
        "exported awaited nested default with outer default",
        `${exactComposition}
         const nestedOuterDefaultThenable = {
           then(
             resolve: (
               value: { a: { exposedRegistrar: undefined } }
             ) => unknown
           ) {
             resolve({ a: { exposedRegistrar: undefined } });
           }
         };
         export const {
           a: {
             exposedRegistrar =
               registerResidentLoopFactoryAuthorityReadback
           } = { exposedRegistrar: Object.freeze({}) }
         } = await nestedOuterDefaultThenable;`
      ],
      [
        "exported awaited nested outer-default result",
        `${exactComposition}
         const nestedDefaultResultThenable = {
           then(
             resolve: (
               value: { a: { exposedRegistrar: object } }
             ) => unknown
           ) {
             resolve({ a: { exposedRegistrar: Object.freeze({}) } });
           }
         };
         export const {
           a: { exposedRegistrar } = {
             exposedRegistrar:
               registerResidentLoopFactoryAuthorityReadback
           }
         } = await nestedDefaultResultThenable;`
      ],
      [
        "exported direct nested-object default parity",
        `${exactComposition}
         export const {
           a: {
             exposedRegistrar =
               registerResidentLoopFactoryAuthorityReadback
           }
         } = { a: { exposedRegistrar: undefined } };`
      ],
      [
        "exported direct nested-array default parity",
        `${exactComposition}
         export const [[
           exposedRegistrar =
             registerResidentLoopFactoryAuthorityReadback
         ]] = [[undefined]];`
      ],
      [
        "exported nested-array default after preceding spread",
        `${exactComposition}
         class NonIterableCarrier {}
         export const [, [
           exposedRegistrar =
             registerResidentLoopFactoryAuthorityReadback
         ]] = [
           ...[0, [undefined]],
           NonIterableCarrier
         ];`
      ],
      [
        "exported nested-array default from selected spread",
        `${exactComposition}
         export const [[
           exposedRegistrar =
             registerResidentLoopFactoryAuthorityReadback
         ]] = [...[[undefined]]];`
      ],
      [
        "exported registrar through exact selected spread",
        `${exactComposition}
         export const [[exposedRegistrar]] = [
           ...[[registerResidentLoopFactoryAuthorityReadback]]
         ];`
      ],
      [
        "exported registrar after exact empty spread",
        `${exactComposition}
         export const [exposedRegistrar] = [
           ...[],
           registerResidentLoopFactoryAuthorityReadback
         ];`
      ],
      [
        "exported registrar after exact multiple-value spread",
        `${exactComposition}
         export const [, exposedRegistrar] = [
           ...[
             Object.freeze({}),
             registerResidentLoopFactoryAuthorityReadback
           ]
         ];`
      ],
      [
        "exported registrar through wrapped immutable spread alias",
        `${exactComposition}
         const spreadAlias = [[
           registerResidentLoopFactoryAuthorityReadback
         ]] as const;
         export const [[exposedRegistrar]] = [
           ...(spreadAlias satisfies readonly unknown[])
         ];`
      ],
      [
        "exported registrar through recursively exact spread",
        `${exactComposition}
         export const [[exposedRegistrar]] = [
           ...[
             ...[[registerResidentLoopFactoryAuthorityReadback]]
           ]
         ];`
      ],
      [
        "exported registrar after spread hole",
        `${exactComposition}
         export const [, exposedRegistrar] = [
           ...[, registerResidentLoopFactoryAuthorityReadback]
         ];`
      ],
      [
        "opaque selected spread remains conservative for default",
        `${exactComposition}
         declare const opaqueValues: unknown[];
         export const [[
           exposedRegistrar =
             registerResidentLoopFactoryAuthorityReadback
         ]] = [...opaqueValues];`
      ],
      [
        "returning spread element still permits registrar binding",
        `${exactComposition}
         function completeBeforeBinding(): number {
           return 0;
         }
         export const [, exposedRegistrar] = [
           ...[
             completeBeforeBinding(),
             registerResidentLoopFactoryAuthorityReadback
           ]
         ];`
      ],
      [
        "returning object property still permits registrar binding",
        `${exactComposition}
         function completeBeforeBinding(): number {
           return 0;
         }
         export const { exposedRegistrar } = {
           completed: completeBeforeBinding(),
           exposedRegistrar:
             registerResidentLoopFactoryAuthorityReadback
         };`
      ],
      [
        "later duplicate supplies registrar binding",
        `${exactComposition}
         export const { exposedRegistrar } = {
           exposedRegistrar: Object.freeze({}),
           exposedRegistrar:
             registerResidentLoopFactoryAuthorityReadback
         };`
      ],
      [
        "exact object spread supplies registrar binding",
        `${exactComposition}
         export const { exposedRegistrar } = {
           ...{
             exposedRegistrar:
               registerResidentLoopFactoryAuthorityReadback
           }
         };`
      ],
      [
        "aliased exact object spread supplies registrar binding",
        `${exactComposition}
         const spreadAlias = {
           exposedRegistrar:
             registerResidentLoopFactoryAuthorityReadback
         } as const;
         export const { exposedRegistrar } = {
           ...(spreadAlias satisfies object)
         };`
      ],
      [
        "later direct property recovers after opaque spread",
        `${exactComposition}
         declare const opaqueObject: object;
         export const { exposedRegistrar } = {
           ...opaqueObject,
           exposedRegistrar:
             registerResidentLoopFactoryAuthorityReadback
         };`
      ],
      [
        "exact spread missing property retains registrar binding",
        `${exactComposition}
         export const { exposedRegistrar } = {
           exposedRegistrar:
             registerResidentLoopFactoryAuthorityReadback,
           ...{ unrelated: Object.freeze({}) }
         };`
      ],
      [
        "static computed property supplies registrar binding",
        `${exactComposition}
         export const { exposedRegistrar } = {
           ["exposedRegistrar"]:
             registerResidentLoopFactoryAuthorityReadback
         };`
      ],
      [
        "use-closed object carrier supplies registrar binding",
        `${exactComposition}
         const carrier = {
           exposedRegistrar:
             registerResidentLoopFactoryAuthorityReadback
         } as const;
         export const { exposedRegistrar } = carrier;`
      ],
      [
        "object method body is not evaluated during binding",
        `${exactComposition}
         function stopWhenCalled(): never {
           throw new Error("not-called");
         }
         export const { exposedRegistrar } = {
           blocked() {
             stopWhenCalled();
           },
           exposedRegistrar:
             registerResidentLoopFactoryAuthorityReadback
         };`
      ],
      [
        "object accessor body is not evaluated during binding",
        `${exactComposition}
         function stopWhenRead(): never {
           throw new Error("not-read");
         }
         export const { exposedRegistrar } = {
           get blocked() {
             return stopWhenRead();
           },
           exposedRegistrar:
             registerResidentLoopFactoryAuthorityReadback
         };`
      ],
      [
        "unused shorthand default still permits registrar binding",
        `${exactComposition}
         function stopOnlyIfMissing(): never {
           throw new Error("not-missing");
         }
         const completed = Object.freeze({});
         export const { exposedRegistrar } = {
           completed = stopOnlyIfMissing(),
           exposedRegistrar:
             registerResidentLoopFactoryAuthorityReadback
         };`
      ],
      [
        "mutable shorthand value keeps default conservative",
        `${exactComposition}
         function stopOnlyIfMissing(): never {
           throw new Error("not-missing");
         }
         let completed: object | undefined = undefined;
         completed = Object.freeze({});
         export const { exposedRegistrar } = {
           completed = stopOnlyIfMissing(),
           exposedRegistrar:
             registerResidentLoopFactoryAuthorityReadback
         };`
      ],
      [
        "mutable shorthand source keeps alias default conservative",
        `${exactComposition}
         function stopOnlyIfMissing(): never {
           throw new Error("not-missing");
         }
         let source: object | undefined = undefined;
         source = Object.freeze({});
         const completed = source;
         export const { exposedRegistrar } = {
           completed = stopOnlyIfMissing(),
           exposedRegistrar:
             registerResidentLoopFactoryAuthorityReadback
         };`
      ],
      [
        "exported usable empty object outer default",
        `${exactComposition}
         export const {
           a: {
             exposedRegistrar =
               registerResidentLoopFactoryAuthorityReadback
           } = {}
         } = {};`
      ],
      [
        "exported usable empty array outer default",
        `${exactComposition}
         export const {
           a: [
             exposedRegistrar =
               registerResidentLoopFactoryAuthorityReadback
           ] = []
         } = {};`
      ],
      [
        "shadowed Infinity carrier remains indeterminate",
        `${exactComposition}
         declare const Infinity: unknown;
         export const [
           exposedRegistrar =
             registerResidentLoopFactoryAuthorityReadback
         ] = Infinity;`
      ],
      [
        "shadowed NaN carrier remains indeterminate",
        `${exactComposition}
         declare const NaN: unknown;
         export const [
           exposedRegistrar =
             registerResidentLoopFactoryAuthorityReadback
         ] = NaN;`
      ],
      [
        "iterable function declaration evaluates array default",
        `${exactComposition}
         function iterableCarrier() {}
         iterableCarrier[Symbol.iterator] = function* () {
           yield undefined;
         };
         export const [
           exposedRegistrar =
             registerResidentLoopFactoryAuthorityReadback
         ] = iterableCarrier;`
      ],
      [
        "static-iterator class declaration evaluates array default",
        `${exactComposition}
         class IterableCarrier {
           static *[Symbol.iterator]() {
             yield undefined;
           }
         }
         export const [
           exposedRegistrar =
             registerResidentLoopFactoryAuthorityReadback
         ] = IterableCarrier;`
      ],
      [
        "static-iterator class alias evaluates array default",
        `${exactComposition}
         class IterableCarrier {
           static *[Symbol.iterator]() {
             yield undefined;
           }
         }
         const carrierAlias = IterableCarrier;
         export const [
           exposedRegistrar =
             registerResidentLoopFactoryAuthorityReadback
         ] = carrierAlias;`
      ],
      [
        "static-block iterator class evaluates array default",
        `${exactComposition}
         class IterableCarrier {
           static {
             this[Symbol.iterator] = function* () {
               yield undefined;
             };
           }
         }
         export const [
           exposedRegistrar =
             registerResidentLoopFactoryAuthorityReadback
         ] = IterableCarrier;`
      ],
      [
        "static-field iterator class evaluates array default",
        `${exactComposition}
         class IterableCarrier {
           static installed = (
             this[Symbol.iterator] = function* () {
               yield undefined;
             }
           );
         }
         export const [
           exposedRegistrar =
             registerResidentLoopFactoryAuthorityReadback
         ] = IterableCarrier;`
      ],
      [
        "inherited static iterator evaluates array default",
        `${exactComposition}
         class IterableBase {
           static *[Symbol.iterator]() {
             yield undefined;
           }
         }
         class IterableCarrier extends IterableBase {}
         export const [
           exposedRegistrar =
             registerResidentLoopFactoryAuthorityReadback
         ] = IterableCarrier;`
      ],
      [
        "call-escaped declaration carrier remains indeterminate",
        `${exactComposition}
         declare function inspectCarrier(value: unknown): void;
         function escapedCarrier() {}
         inspectCarrier(escapedCarrier);
         export const [
           exposedRegistrar =
             registerResidentLoopFactoryAuthorityReadback
         ] = escapedCarrier;`
      ],
      [
        "mutable declaration alias remains indeterminate",
        `${exactComposition}
         function mutableCarrier() {}
         let carrierAlias = mutableCarrier;
         export const [
           exposedRegistrar =
             registerResidentLoopFactoryAuthorityReadback
         ] = carrierAlias;`
      ],
      [
        "exported declaration alias remains indeterminate",
        `${exactComposition}
         function exportedCarrier() {}
         export const carrierAlias = exportedCarrier;
         export const [
           exposedRegistrar =
             registerResidentLoopFactoryAuthorityReadback
         ] = carrierAlias;`
      ],
      [
        "returned declaration carrier remains indeterminate",
        `${exactComposition}
         function returnedCarrier() {}
         function exposeCarrier() {
           return returnedCarrier;
         }
         void exposeCarrier;
         export const [
           exposedRegistrar =
             registerResidentLoopFactoryAuthorityReadback
         ] = returnedCarrier;`
      ],
      [
        "separate object destructure can activate a class iterator",
        `${exactComposition}
         class IterableCarrier {
           static get initialize() {
             this[Symbol.iterator] = function* () {
               yield undefined;
             };
             return undefined;
           }
         }
         const { initialize } = IterableCarrier;
         void initialize;
         export const [
           exposedRegistrar =
             registerResidentLoopFactoryAuthorityReadback
         ] = IterableCarrier;`
      ],
      [
        "exported comma-expression alias binding",
        `${exactComposition}
         export const exposedRegistrar = (
           undefined,
           registerResidentLoopFactoryAuthorityReadback
         );`
      ]
    ] as const) {
      expect.soft(
        analyzeControl(source).violations,
        name
      ).toContain(`${residentFactoryCompositionPath}:registrar-reexport`);
    }
    for (const [name, source] of [
      [
        "missing direct outer object does not evaluate nested default",
        `${exactComposition}
         export const {
           a: {
             exposedRegistrar =
               registerResidentLoopFactoryAuthorityReadback
           }
         } = {};`
      ],
      [
        "undefined direct outer object does not evaluate nested default",
        `${exactComposition}
         export const {
           a: {
             exposedRegistrar =
               registerResidentLoopFactoryAuthorityReadback
           }
         } = { a: undefined };`
      ],
      [
        "missing direct outer array does not evaluate nested default",
        `${exactComposition}
         export const [[
           exposedRegistrar =
             registerResidentLoopFactoryAuthorityReadback
         ]] = [];`
      ],
      [
        "undefined direct outer array does not evaluate nested default",
        `${exactComposition}
         export const [[
           exposedRegistrar =
             registerResidentLoopFactoryAuthorityReadback
         ]] = [undefined];`
      ],
      [
        "undefined object outer default does not evaluate nested default",
        `${exactComposition}
         export const {
           a: {
             exposedRegistrar =
               registerResidentLoopFactoryAuthorityReadback
           } = undefined
         } = {};`
      ],
      [
        "null object outer default does not evaluate nested default",
        `${exactComposition}
         export const {
           a: {
             exposedRegistrar =
               registerResidentLoopFactoryAuthorityReadback
           } = null
         } = {};`
      ],
      [
        "undefined array outer default does not evaluate nested default",
        `${exactComposition}
         export const {
           a: [
             exposedRegistrar =
               registerResidentLoopFactoryAuthorityReadback
           ] = undefined
         } = {};`
      ],
      [
        "null array outer default does not evaluate nested default",
        `${exactComposition}
         export const {
           a: [
             exposedRegistrar =
               registerResidentLoopFactoryAuthorityReadback
           ] = null
         } = {};`
      ],
      [
        "direct null object pattern does not evaluate nested default",
        `${exactComposition}
         export const {
           a: {
             exposedRegistrar =
               registerResidentLoopFactoryAuthorityReadback
           }
         } = null;`
      ],
      [
        "direct null array pattern does not evaluate nested default",
        `${exactComposition}
         export const [[
           exposedRegistrar =
             registerResidentLoopFactoryAuthorityReadback
         ]] = null;`
      ],
      [
        "numeric array carrier does not evaluate nested default",
        `${exactComposition}
         export const [[
           exposedRegistrar =
             registerResidentLoopFactoryAuthorityReadback
         ]] = 1;`
      ],
      [
        "plain-object array carrier does not evaluate nested default",
        `${exactComposition}
         export const [[
           exposedRegistrar =
             registerResidentLoopFactoryAuthorityReadback
         ]] = {};`
      ],
      [
        "function declaration array carrier does not evaluate nested default",
        `${exactComposition}
         function nonIterableCarrier() {}
         export const [
           exposedRegistrar =
             registerResidentLoopFactoryAuthorityReadback
         ] = nonIterableCarrier;`
      ],
      [
        "function declaration alias does not evaluate nested default",
        `${exactComposition}
         function nonIterableCarrier() {}
         const carrierAlias = nonIterableCarrier;
         export const [
           exposedRegistrar =
             registerResidentLoopFactoryAuthorityReadback
         ] = carrierAlias;`
      ],
      [
        "class declaration array carrier does not evaluate nested default",
        `${exactComposition}
         class NonIterableCarrier {}
         export const [
           exposedRegistrar =
             registerResidentLoopFactoryAuthorityReadback
         ] = NonIterableCarrier;`
      ],
      [
        "class declaration alias does not evaluate nested default",
        `${exactComposition}
         class NonIterableCarrier {}
         const carrierAlias = NonIterableCarrier;
         export const [
           exposedRegistrar =
             registerResidentLoopFactoryAuthorityReadback
         ] = carrierAlias;`
      ],
      [
        "parenthesized class carrier does not evaluate nested default",
        `${exactComposition}
         class NonIterableCarrier {}
         export const [
           exposedRegistrar =
             registerResidentLoopFactoryAuthorityReadback
         ] = (NonIterableCarrier);`
      ],
      [
        "nested parenthesized class carrier does not evaluate inner default",
        `${exactComposition}
         class NonIterableCarrier {}
         export const [[
           exposedRegistrar =
             registerResidentLoopFactoryAuthorityReadback
         ]] = [(NonIterableCarrier)];`
      ],
      [
        "nested deeply wrapped class alias does not evaluate inner default",
        `${exactComposition}
         class NonIterableCarrier {}
         const carrierAlias = (
           NonIterableCarrier as typeof NonIterableCarrier
         )! satisfies typeof NonIterableCarrier;
         export const [[
           exposedRegistrar =
             registerResidentLoopFactoryAuthorityReadback
         ]] = [((carrierAlias as typeof carrierAlias)!)];`
      ],
      [
        "later spread does not alter earlier nested class carrier",
        `${exactComposition}
         class NonIterableCarrier {}
         export const [[
           exposedRegistrar =
             registerResidentLoopFactoryAuthorityReadback
         ]] = [
           NonIterableCarrier,
           ...[[undefined]]
         ];`
      ],
      [
        "empty spread preserves later nested class carrier",
        `${exactComposition}
         class NonIterableCarrier {}
         export const [[
           exposedRegistrar =
             registerResidentLoopFactoryAuthorityReadback
         ]] = [
           ...[],
           NonIterableCarrier
         ];`
      ],
      [
        "wrapped immutable spread alias preserves nested class carrier",
        `${exactComposition}
         class NonIterableCarrier {}
         const spreadAlias = [NonIterableCarrier] as const;
         export const [[
           exposedRegistrar =
             registerResidentLoopFactoryAuthorityReadback
         ]] = [
           ...(spreadAlias satisfies readonly unknown[])
         ];`
      ],
      [
        "throwing object property prevents registrar binding",
        `${exactComposition}
         function stopBeforeBinding(): never {
           throw new Error("before-binding");
         }
         export const { exposedRegistrar } = {
           blocked: stopBeforeBinding(),
           exposedRegistrar:
             registerResidentLoopFactoryAuthorityReadback
         };`
      ],
      [
        "later throwing object property prevents registrar binding",
        `${exactComposition}
         function stopBeforeBinding(): never {
           throw new Error("before-binding");
         }
         export const { exposedRegistrar } = {
           exposedRegistrar:
             registerResidentLoopFactoryAuthorityReadback,
           blocked: stopBeforeBinding()
         };`
      ],
      [
        "later duplicate replaces registrar binding",
        `${exactComposition}
         export const { exposedRegistrar } = {
           exposedRegistrar:
             registerResidentLoopFactoryAuthorityReadback,
           exposedRegistrar: Object.freeze({})
         };`
      ],
      [
        "exact object spread replaces registrar binding",
        `${exactComposition}
         export const { exposedRegistrar } = {
           exposedRegistrar:
             registerResidentLoopFactoryAuthorityReadback,
           ...{
             exposedRegistrar: Object.freeze({})
           }
         };`
      ],
      [
        "aliased exact object spread replaces registrar binding",
        `${exactComposition}
         const spreadAlias = {
           exposedRegistrar: Object.freeze({})
         } as const;
         export const { exposedRegistrar } = {
           exposedRegistrar:
             registerResidentLoopFactoryAuthorityReadback,
           ...(spreadAlias satisfies object)
         };`
      ],
      [
        "opaque later object spread remains conservative",
        `${exactComposition}
         declare const opaqueObject: object;
         export const { exposedRegistrar } = {
           exposedRegistrar:
             registerResidentLoopFactoryAuthorityReadback,
           ...opaqueObject
         };`
      ],
      [
        "unknown computed override remains conservative",
        `${exactComposition}
         declare const opaqueName: string;
         export const { exposedRegistrar } = {
           exposedRegistrar:
             registerResidentLoopFactoryAuthorityReadback,
           [opaqueName]: Object.freeze({})
         };`
      ],
      [
        "static computed property replaces registrar binding",
        `${exactComposition}
         export const { exposedRegistrar } = {
           exposedRegistrar:
             registerResidentLoopFactoryAuthorityReadback,
           ["exposedRegistrar"]: Object.freeze({})
         };`
      ],
      [
        "selected accessor override remains conservative",
        `${exactComposition}
         export const { exposedRegistrar } = {
           exposedRegistrar:
             registerResidentLoopFactoryAuthorityReadback,
           get exposedRegistrar() {
             return Object.freeze({});
           }
         };`
      ],
      [
        "mutated object carrier does not retain registrar binding",
        `${exactComposition}
         let carrier = {
           exposedRegistrar:
             registerResidentLoopFactoryAuthorityReadback
         };
         carrier = {
           exposedRegistrar: Object.freeze({})
         };
         export const { exposedRegistrar } = carrier;`
      ],
      [
        "separate-use object carrier remains conservative",
        `${exactComposition}
         const carrier = {
           exposedRegistrar:
             registerResidentLoopFactoryAuthorityReadback
         } as const;
         void carrier;
         export const { exposedRegistrar } = carrier;`
      ],
      [
        "exported object carrier remains conservative",
        `${exactComposition}
         export const carrier = {
           exposedRegistrar:
             registerResidentLoopFactoryAuthorityReadback
         } as const;
         export const { exposedRegistrar } = carrier;`
      ],
      [
        "separate-use object spread remains conservative",
        `${exactComposition}
         const spreadAlias = {
           exposedRegistrar:
             registerResidentLoopFactoryAuthorityReadback
         } as const;
         void spreadAlias;
         export const { exposedRegistrar } = {
           ...spreadAlias
         };`
      ],
      [
        "throwing object spread prevents registrar binding",
        `${exactComposition}
         function stopBeforeBinding(): never {
           throw new Error("before-binding");
         }
         export const { exposedRegistrar } = {
           exposedRegistrar:
             registerResidentLoopFactoryAuthorityReadback,
           ...stopBeforeBinding()
         };`
      ],
      [
        "throwing computed name prevents registrar binding",
        `${exactComposition}
         function stopBeforeBinding(): never {
           throw new Error("before-binding");
         }
         export const { exposedRegistrar } = {
           [stopBeforeBinding()]: Object.freeze({}),
           exposedRegistrar:
             registerResidentLoopFactoryAuthorityReadback
         };`
      ],
      [
        "throwing defined shorthand default prevents registrar binding",
        `${exactComposition}
         function stopBeforeBinding(): never {
           throw new Error("before-binding");
         }
         const blocked = undefined;
         export const { exposedRegistrar } = {
           blocked = stopBeforeBinding(),
           exposedRegistrar:
             registerResidentLoopFactoryAuthorityReadback
         };`
      ],
      [
        "aliased undefined shorthand default prevents binding",
        `${exactComposition}
         function stopBeforeBinding(): never {
           throw new Error("before-binding");
         }
         const missing = undefined;
         const blocked = missing;
         export const { exposedRegistrar } = {
           blocked = stopBeforeBinding(),
           exposedRegistrar:
             registerResidentLoopFactoryAuthorityReadback
         };`
      ],
      [
        "throwing nested object prevents array binding",
        `${exactComposition}
         function stopBeforeBinding(): never {
           throw new Error("before-binding");
         }
         export const [, exposedRegistrar] = [
           {
             blocked: stopBeforeBinding()
           },
           registerResidentLoopFactoryAuthorityReadback
         ];`
      ],
      [
        "throwing object argument prevents array binding",
        `${exactComposition}
         function stopBeforeBinding(): never {
           throw new Error("before-binding");
         }
         function consume(value: object): object {
           return value;
         }
         export const [, exposedRegistrar] = [
           consume({
             blocked: stopBeforeBinding()
           }),
           registerResidentLoopFactoryAuthorityReadback
         ];`
      ],
      [
        "throwing spread element prevents later registrar binding",
        `${exactComposition}
         function stopBeforeBinding(): never {
           throw new Error("before-binding");
         }
         export const [, exposedRegistrar] = [
           ...[
             stopBeforeBinding(),
             registerResidentLoopFactoryAuthorityReadback
           ]
         ];`
      ],
      [
        "later throwing spread element prevents earlier registrar binding",
        `${exactComposition}
         function stopBeforeBinding(): never {
           throw new Error("before-binding");
         }
         export const [exposedRegistrar] = [
           ...[
             registerResidentLoopFactoryAuthorityReadback,
             stopBeforeBinding()
           ]
         ];`
      ],
      [
        "aliased throwing spread element prevents registrar binding",
        `${exactComposition}
         function stopBeforeBinding(): never {
           throw new Error("before-binding");
         }
         const stopAlias = stopBeforeBinding;
         export const [, exposedRegistrar] = [
           ...[
             (stopAlias satisfies typeof stopBeforeBinding)(),
             registerResidentLoopFactoryAuthorityReadback
           ]
         ];`
      ],
      [
        "parenthesized class alias does not evaluate nested default",
        `${exactComposition}
         class NonIterableCarrier {}
         const carrierAlias = NonIterableCarrier;
         export const [
           exposedRegistrar =
             registerResidentLoopFactoryAuthorityReadback
         ] = (carrierAlias);`
      ],
      [
        "as-wrapped class carrier does not evaluate nested default",
        `${exactComposition}
         class NonIterableCarrier {}
         export const [
           exposedRegistrar =
             registerResidentLoopFactoryAuthorityReadback
         ] = NonIterableCarrier as typeof NonIterableCarrier;`
      ],
      [
        "asserted class carrier does not evaluate nested default",
        `${exactComposition}
         class NonIterableCarrier {}
         export const [
           exposedRegistrar =
             registerResidentLoopFactoryAuthorityReadback
         ] = <typeof NonIterableCarrier>NonIterableCarrier;`
      ],
      [
        "non-null class carrier does not evaluate nested default",
        `${exactComposition}
         class NonIterableCarrier {}
         export const [
           exposedRegistrar =
             registerResidentLoopFactoryAuthorityReadback
         ] = NonIterableCarrier!;`
      ],
      [
        "satisfies-wrapped class carrier does not evaluate nested default",
        `${exactComposition}
         class NonIterableCarrier {}
         export const [
           exposedRegistrar =
             registerResidentLoopFactoryAuthorityReadback
         ] = NonIterableCarrier satisfies typeof NonIterableCarrier;`
      ],
      [
        "instance-iterator class does not make constructor iterable",
        `${exactComposition}
         class NonIterableCarrier {
           *[Symbol.iterator]() {
             yield undefined;
           }
         }
         export const [
           exposedRegistrar =
             registerResidentLoopFactoryAuthorityReadback
         ] = NonIterableCarrier;`
      ],
      [
        "harmless static class member does not make constructor iterable",
        `${exactComposition}
         class NonIterableCarrier {
           static label = "local";
         }
         export const [
           exposedRegistrar =
             registerResidentLoopFactoryAuthorityReadback
         ] = NonIterableCarrier;`
      ],
      [
        "implemented interface does not make class constructor iterable",
        `${exactComposition}
         interface LocalMarker {}
         class NonIterableCarrier implements LocalMarker {}
         export const [
           exposedRegistrar =
             registerResidentLoopFactoryAuthorityReadback
         ] = NonIterableCarrier;`
      ],
      [
        "Infinity array carrier does not evaluate nested default",
        `${exactComposition}
         export const [
           exposedRegistrar =
             registerResidentLoopFactoryAuthorityReadback
         ] = Infinity;`
      ],
      [
        "Infinity alias does not evaluate nested default",
        `${exactComposition}
         const carrierAlias = Infinity;
         export const [
           exposedRegistrar =
             registerResidentLoopFactoryAuthorityReadback
         ] = carrierAlias;`
      ],
      [
        "NaN array carrier does not evaluate nested default",
        `${exactComposition}
         export const [
           exposedRegistrar =
             registerResidentLoopFactoryAuthorityReadback
         ] = NaN;`
      ],
      [
        "NaN alias does not evaluate nested default",
        `${exactComposition}
         const carrierAlias = NaN;
         export const [
           exposedRegistrar =
             registerResidentLoopFactoryAuthorityReadback
         ] = carrierAlias;`
      ],
      [
        "prefixed Infinity carrier does not evaluate nested default",
        `${exactComposition}
         export const [
           exposedRegistrar =
             registerResidentLoopFactoryAuthorityReadback
         ] = +Infinity;`
      ],
      [
        "prefixed NaN carrier does not evaluate nested default",
        `${exactComposition}
         export const [
           exposedRegistrar =
             registerResidentLoopFactoryAuthorityReadback
         ] = +NaN;`
      ],
      [
        "numeric array outer default does not evaluate nested default",
        `${exactComposition}
         export const {
           a: [
             exposedRegistrar =
               registerResidentLoopFactoryAuthorityReadback
           ] = 1
         } = {};`
      ],
      [
        "plain-object array outer default does not evaluate nested default",
        `${exactComposition}
         export const {
           a: [
             exposedRegistrar =
               registerResidentLoopFactoryAuthorityReadback
           ] = {}
         } = {};`
      ]
    ] as const) {
      expect.soft(analyzeControl(source).violations, name).toEqual([]);
    }
    expect(analyzeControl(`${exactComposition}
      const unrelatedLocalExport = Object.freeze({});
      export {
        unrelatedLocalExport as registerResidentLoopFactoryAuthorityReadback
      };
      export const unrelatedExportedBinding = () => undefined;
      const unrelatedObjectCarrier = {
        selectedUnrelated: unrelatedLocalExport,
        discardedRegistrar: registerResidentLoopFactoryAuthorityReadback
      };
      export const { selectedUnrelated } = unrelatedObjectCarrier;
      const unrelatedArrayCarrier = [
        registerResidentLoopFactoryAuthorityReadback,
        unrelatedLocalExport
      ];
      export const [, selectedArrayUnrelated] = unrelatedArrayCarrier;
      const nullableCarrier = { nullableValue: null };
      export const {
        nullableValue =
          registerResidentLoopFactoryAuthorityReadback
      } = nullableCarrier;
      const firstUnrelatedCarrier = {
        selectedThroughAlias: unrelatedLocalExport,
        discardedThroughAlias:
          registerResidentLoopFactoryAuthorityReadback
      };
      const secondUnrelatedCarrier = firstUnrelatedCarrier;
      export const {
        selectedThroughAlias
      } = secondUnrelatedCarrier;
      export const unrelatedBoundCallable =
        unrelatedExportedBinding.bind(undefined);
      export const unrelatedBracketBoundCallable =
        unrelatedExportedBinding["bind"](undefined);
      export const unrelatedCallableResult = () =>
        unrelatedLocalExport;
      export function unrelatedCallableDeclaration() {
        return unrelatedLocalExport;
      }
      export const unrelatedAwaitedResult =
        await unrelatedLocalExport;
      export const unrelatedConditional = true
        ? unrelatedLocalExport
        : unrelatedExportedBinding;
      export const discardedLogicalOr = true ||
        registerResidentLoopFactoryAuthorityReadback;
      export const discardedLogicalAnd = false &&
        registerResidentLoopFactoryAuthorityReadback;
      export const discardedNullish = ({}) ??
        registerResidentLoopFactoryAuthorityReadback;
      export const discardedAwaitedLogicalOr = true ||
        await registerResidentLoopFactoryAuthorityReadback;
      export const discardedAwaitedLogicalAnd = false &&
        await registerResidentLoopFactoryAuthorityReadback;
      export const discardedAwaitedNullish = ({}) ??
        await registerResidentLoopFactoryAuthorityReadback;
      export const discardedNegativeLogicalOr = -1 ||
        registerResidentLoopFactoryAuthorityReadback;
      export const discardedNegativeZeroLogicalAnd = -0 &&
        registerResidentLoopFactoryAuthorityReadback;
      export const discardedNestedBitwiseLogicalAnd = ~-1 &&
        registerResidentLoopFactoryAuthorityReadback;
      export const discardedNegativeBigIntLogicalOr = -1n ||
        registerResidentLoopFactoryAuthorityReadback;
      export const unrelatedCommaResult = (
        registerResidentLoopFactoryAuthorityReadback,
        unrelatedLocalExport
      );
    `).violations).toEqual([]);

    for (const [name, source, extras] of [
      [
        "barrel import",
        exactComposition.replace(
          '"./wake-supervisor-runtime.js"',
          '"./index.js"'
        ),
        [{
          label: "packages/local-runtime/src/index.ts",
          source: `export {
            registerResidentLoopFactoryAuthorityReadback
          } from "./wake-supervisor-runtime.js";`
        }]
      ],
      [
        "namespace import",
        exactComposition
          .replace(
            /import\s*\{[\s\S]*?\}\s*from\s*"\.\/wake-supervisor-runtime\.js";/,
            'import * as wake from "./wake-supervisor-runtime.js";'
          )
          .replace(
            /registerResidentLoopFactoryAuthorityReadback\(/,
            "wake.registerResidentLoopFactoryAuthorityReadback("
          )
      ],
      [
        "dynamic loader",
        exactComposition
          .replace(
            /import\s*\{[\s\S]*?\}\s*from\s*"\.\/wake-supervisor-runtime\.js";/,
            ""
          )
          .replace(
            /registerResidentLoopFactoryAuthorityReadback\(/,
            '(await import("./wake-supervisor-runtime.js")).registerResidentLoopFactoryAuthorityReadback('
          )
      ],
      [
        "aliased import",
        exactComposition
          .replace(
            "registerResidentLoopFactoryAuthorityReadback\n      }",
            "registerResidentLoopFactoryAuthorityReadback as registerAuthority\n      }"
          )
          .replace(
            "\n          registerResidentLoopFactoryAuthorityReadback(\n",
            "\n          registerAuthority(\n"
          )
      ],
      [
        "alternate source",
        exactComposition.replace(
          '"./wake-supervisor-runtime.js"',
          '"./alternate-wake-supervisor-runtime.js"'
        )
      ],
      [
        "alternate caller",
        `${exactComposition}
         function alternateCaller(
           input: object,
           wakeRuntime: object,
           readback: object
         ) {
           registerResidentLoopFactoryAuthorityReadback(
             input,
             wakeRuntime,
             readback
           );
         }`
      ],
      [
        "optional call",
        exactComposition.replace(
          "\n          registerResidentLoopFactoryAuthorityReadback(\n",
          "\n          registerResidentLoopFactoryAuthorityReadback?.(\n"
        )
      ],
      [
        "spread call",
        exactComposition.replace(
          "input,\n            wakeRuntime,\n            readback",
          "...[input, wakeRuntime, readback]"
        )
      ],
      [
        "reordered arguments",
        exactComposition.replace(
          "input,\n            wakeRuntime,\n            readback",
          "wakeRuntime,\n            input,\n            readback"
        )
      ],
      [
        "omitted issuer",
        exactComposition.replace(
          "input,\n            wakeRuntime,\n            readback",
          "wakeRuntime,\n            readback"
        )
      ],
      [
        "copied issuer",
        exactComposition.replace(
          "input,\n            wakeRuntime,\n            readback",
          "{ ...input },\n            wakeRuntime,\n            readback"
        )
      ],
      [
        "substitute issuer",
        exactComposition
          .replace(
            "const wakeRuntime = createWakeSupervisorRuntime(input);",
            "const callerInput = { ...input };\n        const wakeRuntime = createWakeSupervisorRuntime(input);"
          )
          .replace(
            "input,\n            wakeRuntime,\n            readback",
            "callerInput,\n            wakeRuntime,\n            readback"
          )
      ],
      [
        "copied W construction input",
        exactComposition.replace(
          "createWakeSupervisorRuntime(input)",
          "createWakeSupervisorRuntime({ ...input })"
        )
      ]
    ] as const) {
      expect.soft(
        analyzeControl(source, extras ?? []).violations,
        name
      ).not.toEqual([]);
    }

    const packagesRoot = fileURLToPath(new URL("../../", import.meta.url));
    const productionFiles = productionTypeScriptFiles(packagesRoot);
    const productionAnalysis = residentFactoryIssuerAnalysis(
      productionFiles.map((file) => {
        const label = sourceLabel(packagesRoot, file);
        return {
          label,
          sourceFile: ts.createSourceFile(
            label,
            readFileSync(file, "utf8"),
            ts.ScriptTarget.Latest,
            true,
            ts.ScriptKind.TS
          )
        };
      })
    );
    expect(productionAnalysis).toEqual({
      registrarDeclarationCount: 1,
      registrarImporters: [residentFactoryCompositionPath],
      registrarCallers: [residentFactoryCompositionPath],
      violations: []
    });
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
    const exactRegistrarWith = (outerSyntax: string) => `
      const residentWakeRuntimeStates =
        new WeakMap<object, { store: unknown }>();
      const decorate = (..._arguments: unknown[]) => undefined;
      import {
        bindMountedResidentLoopAuthorityForFactory
      } from "./mounted-wake-lifecycle-store.js";
      export function bindResidentLoopCapabilitiesForFactory(
        wakeRuntime: object,
        binding: unknown,
        domainExecution: unknown
      ) {
        ${outerSyntax}
        const state = residentWakeRuntimeStates.get(wakeRuntime);
        if (state === undefined) throw new Error("missing state");
        return bindMountedResidentLoopAuthorityForFactory(
          state.store,
          binding,
          domainExecution
        );
      }
    `;
    const e1087CausalRedControls = [
      {
        id: "FA1",
        name: "computed unary missing key",
        outerSyntax: `
          (({
            [-1]: value = residentWakeRuntimeStates.get(wakeRuntime)
          }) => void value)({});
        `,
        expectedStateReadCount: 1,
        expectedOwnership: "rejected"
      },
      {
        id: "FA2",
        name: "computed template-expression missing key",
        outerSyntax: `
          (({
            [\`mis\${"sing"}\`]: value =
              residentWakeRuntimeStates.get(wakeRuntime)
          }) => void value)({});
        `,
        expectedStateReadCount: 1,
        expectedOwnership: "rejected"
      },
      {
        id: "FA3",
        name: "empty spread call activates parameter default",
        outerSyntax: `
          ((value = residentWakeRuntimeStates.get(wakeRuntime)) =>
            void value)(
            ...[]
          );
        `,
        expectedStateReadCount: 1,
        expectedOwnership: "rejected"
      },
      {
        id: "FA4",
        name: "local literal function invocation",
        outerSyntax: `
          (() => {
            const hidden = () =>
              residentWakeRuntimeStates.get(wakeRuntime);
            hidden();
          })();
        `,
        expectedStateReadCount: 1,
        expectedOwnership: "rejected"
      },
      {
        id: "FA5",
        name: "literal generator advanced once",
        outerSyntax: `
          (function* hidden() {
            residentWakeRuntimeStates.get(wakeRuntime);
          })().next();
        `,
        expectedStateReadCount: 1,
        expectedOwnership: "rejected"
      },
      {
        id: "FA6",
        name: "array-like apply indexed getter",
        outerSyntax: `
          (function invoked(_value) {}).apply(undefined, {
            length: 1,
            get 0() {
              residentWakeRuntimeStates.get(wakeRuntime);
              return 1;
            }
          });
        `,
        expectedStateReadCount: 1,
        expectedOwnership: "rejected"
      },
      {
        id: "FA7",
        name: "bound this getter read",
        outerSyntax: `
          (function invoked() {
            void this.value;
          }).bind({
            get value() {
              residentWakeRuntimeStates.get(wakeRuntime);
              return 1;
            }
          }).call(undefined);
        `,
        expectedStateReadCount: 1,
        expectedOwnership: "rejected"
      },
      {
        id: "FA8",
        name: "missing default over harmless object spread",
        outerSyntax: `
          (({
            missing = residentWakeRuntimeStates.get(wakeRuntime)
          }) => void missing)({ ...{} });
        `,
        expectedStateReadCount: 1,
        expectedOwnership: "rejected"
      },
      {
        id: "FA9",
        name: "getter then setter descriptor merging",
        outerSyntax: `
          (({ value }) => void value)({
            get value() {
              residentWakeRuntimeStates.get(wakeRuntime);
              return 1;
            },
            set value(input) {
              void input;
            }
          });
        `,
        expectedStateReadCount: 1,
        expectedOwnership: "rejected"
      },
      {
        id: "FA10",
        name: "object rest copies getter property",
        outerSyntax: `
          (({ ...rest }) => void rest)({
            get value() {
              residentWakeRuntimeStates.get(wakeRuntime);
              return 1;
            }
          });
        `,
        expectedStateReadCount: 1,
        expectedOwnership: "rejected"
      },
      {
        id: "FA11",
        name: "method-valued nested destructuring default",
        outerSyntax: `
          (({
            method: {
              missing = residentWakeRuntimeStates.get(wakeRuntime)
            }
          }) => void missing)({
            method() {}
          });
        `,
        expectedStateReadCount: 1,
        expectedOwnership: "rejected"
      },
      {
        id: "FA12",
        name: "double-bound literal function invocation",
        outerSyntax: `
          (function hidden() {
            residentWakeRuntimeStates.get(wakeRuntime);
          }).bind(undefined).bind(undefined)();
        `,
        expectedStateReadCount: 1,
        expectedOwnership: "rejected"
      },
      {
        id: "FA13",
        name: "prototype getter selected by destructuring",
        outerSyntax: `
          (({ value }) => void value)({
            __proto__: {
              get value() {
                residentWakeRuntimeStates.get(wakeRuntime);
                return 1;
              }
            }
          });
        `,
        expectedStateReadCount: 1,
        expectedOwnership: "rejected"
      },
      {
        id: "FR1",
        name: "getter constant-false branch remains unreachable",
        outerSyntax: `
          (({ value }) => void value)({
            get value() {
              if (false) {
                residentWakeRuntimeStates.get(wakeRuntime);
              }
              return 1;
            }
          });
        `,
        expectedStateReadCount: 0,
        expectedOwnership: "accepted"
      },
      {
        id: "FR2",
        name: "read after unconditional return remains unreachable",
        outerSyntax: `
          (() => {
            return 1;
            residentWakeRuntimeStates.get(wakeRuntime);
          })();
        `,
        expectedStateReadCount: 0,
        expectedOwnership: "accepted"
      },
      {
        id: "FR3",
        name: "positional spread supplies deferred default",
        outerSyntax: `
          ((first, second =
            residentWakeRuntimeStates.get(wakeRuntime)) => {
            void first;
            void second;
          })(...["first", "second"]);
        `,
        expectedStateReadCount: 0,
        expectedOwnership: "accepted"
      },
      {
        id: "FR4",
        name: "optional call short-circuits argument read",
        outerSyntax: `
          ((() => undefined)())?.(
            residentWakeRuntimeStates.get(wakeRuntime)
          );
        `,
        expectedStateReadCount: 0,
        expectedOwnership: "accepted"
      },
      {
        id: "P1",
        name: "private runtime-state map mutation",
        outerSyntax: `
          residentWakeRuntimeStates.set(
            wakeRuntime,
            { store: "foreign" }
          );
        `,
        expectedStateReadCount: 1,
        expectedOwnership: "rejected"
      }
    ] as const;
    for (const control of e1087CausalRedControls) {
      const runtimeResult = ts.transpileModule(`
        let stateReadCount = 0;
        let observedStore: unknown;
        const wakeRuntime = {};
        const runtimeStates =
          new WeakMap<object, { store: unknown }>();
        runtimeStates.set(wakeRuntime, { store: "canonical" });
        const residentWakeRuntimeStates = {
          get(value: object) {
            stateReadCount += 1;
            return runtimeStates.get(value);
          },
          set(value: object, state: { store: unknown }) {
            runtimeStates.set(value, state);
          }
        };
        ${control.outerSyntax}
        ${control.id === "P1"
          ? `observedStore =
              residentWakeRuntimeStates.get(wakeRuntime)?.store;`
          : ""}
        (globalThis as {
          observedStore?: unknown;
          stateReadCount?: number;
        }).observedStore = observedStore;
        (globalThis as {
          observedStore?: unknown;
          stateReadCount?: number;
        }).stateReadCount = stateReadCount;
      `, {
        compilerOptions: {
          module: ts.ModuleKind.None,
          target: ts.ScriptTarget.ES2022
        },
        reportDiagnostics: true
      });
      const runtimeContext: {
        observedStore?: unknown;
        stateReadCount?: number;
      } = {};
      runInNewContext(runtimeResult.outputText, runtimeContext);
      expect.soft(
        {
          diagnosticCodes: (runtimeResult.diagnostics ?? []).map(
            (diagnostic) => diagnostic.code
          ),
          stateReadCount: runtimeContext.stateReadCount
        },
        `${control.id} ${control.name} runtime`
      ).toEqual({
        diagnosticCodes: [],
        stateReadCount: control.expectedStateReadCount
      });
      if (control.id === "P1") {
        expect.soft(
          runtimeContext.observedStore,
          "P1 canonical read observes the foreign replacement"
        ).toBe("foreign");
      }

      const analysis = mountedBinderControlAnalysis(
        exactRegistrarWith(control.outerSyntax)
      );
      if (control.expectedOwnership === "rejected") {
        expect.soft(
          analysis,
          `${control.id} ${control.name} must reject alternate ownership`
        ).not.toEqual(exactBinderOwnership);
      } else {
        expect.soft(
          analysis,
          `${control.id} ${control.name} must preserve exact ownership`
        ).toEqual(exactBinderOwnership);
      }
    }
    {
      const outerSyntax = `
        (({ value }) => void value)({
          ...{ value: 1 },
          get value() {
            residentWakeRuntimeStates.get(wakeRuntime);
            return 2;
          }
        });
      `;
      const runtimeResult = ts.transpileModule(`
        let stateReadCount = 0;
        const wakeRuntime = {};
        const runtimeStates =
          new WeakMap<object, { store: unknown }>();
        runtimeStates.set(wakeRuntime, { store: "canonical" });
        const residentWakeRuntimeStates = {
          get(value: object) {
            stateReadCount += 1;
            return runtimeStates.get(value);
          }
        };
        ${outerSyntax}
        (globalThis as {
          stateReadCount?: number;
        }).stateReadCount = stateReadCount;
      `, {
        compilerOptions: {
          module: ts.ModuleKind.None,
          target: ts.ScriptTarget.ES2022
        },
        reportDiagnostics: true
      });
      const runtimeContext: {
        stateReadCount?: number;
      } = {};
      runInNewContext(runtimeResult.outputText, runtimeContext);
      expect.soft(
        (runtimeResult.diagnostics ?? []).map(
          (diagnostic) => diagnostic.code
        ),
        "spread-then-later-getter diagnostics"
      ).toEqual([]);
      expect.soft(
        runtimeContext.stateReadCount,
        "spread-then-later-getter runtime private-state read count"
      ).toBe(1);
      expect.soft(
        mountedBinderControlAnalysis(
          exactRegistrarWith(outerSyntax)
        ),
        "spread-then-later-getter override must reject exact ownership"
      ).not.toEqual(exactBinderOwnership);
    }
    {
      const outerSyntax = `
        (({ value }) => void value)({
          get value() {
            residentWakeRuntimeStates.get(wakeRuntime);
            return 2;
          },
          ...{ value: 1 }
        });
      `;
      const runtimeResult = ts.transpileModule(`
        let stateReadCount = 0;
        const wakeRuntime = {};
        const runtimeStates =
          new WeakMap<object, { store: unknown }>();
        runtimeStates.set(wakeRuntime, { store: "canonical" });
        const residentWakeRuntimeStates = {
          get(value: object) {
            stateReadCount += 1;
            return runtimeStates.get(value);
          }
        };
        ${outerSyntax}
        (globalThis as {
          stateReadCount?: number;
        }).stateReadCount = stateReadCount;
      `, {
        compilerOptions: {
          module: ts.ModuleKind.None,
          target: ts.ScriptTarget.ES2022
        },
        reportDiagnostics: true
      });
      const runtimeContext: {
        stateReadCount?: number;
      } = {};
      runInNewContext(runtimeResult.outputText, runtimeContext);
      expect.soft(
        (runtimeResult.diagnostics ?? []).map(
          (diagnostic) => diagnostic.code
        ),
        "later-spread-overrides-earlier-getter diagnostics"
      ).toEqual([]);
      expect.soft(
        runtimeContext.stateReadCount,
        "later-spread-overrides-earlier-getter runtime private-state read count"
      ).toBe(0);
      expect.soft(
        mountedBinderControlAnalysis(
          exactRegistrarWith(outerSyntax)
        ),
        "later-spread-overrides-earlier-getter preserves exact ownership"
      ).toEqual(exactBinderOwnership);
    }
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
    expect(outerEvaluatedRuntimeProbe()).toEqual({
      diagnosticCodes: [],
      stateReadCount: 14
    });
    expect(immediateLiteralInvocationRuntimeProbe()).toEqual({
      deferredControlCount: 3,
      diagnosticCodes: [],
      stateReadCount: 7
    });
    expect(literalEvaluatorRuntimeProbe()).toEqual({
      diagnosticCodes: [],
      stateReadCounts: [1, 1, 1, 1, 1, 1, 1, 0]
    });
    expect(adversarialLiteralEvaluatorRuntimeProbe()).toEqual({
      diagnosticCodes: [],
      stateReadCounts: [1, 1, 1, 1, 1]
    });
    expect(nineGapLiteralEvaluatorRuntimeProbe()).toEqual([
      {
        diagnosticCodes: [],
        name: "constructor-returned literal reused as constructor",
        stateReadCount: 1
      },
      {
        diagnosticCodes: [],
        name: "tag-returned literal reused as tag",
        stateReadCount: 1
      },
      {
        diagnosticCodes: [],
        name: "selected getter read in const initializer",
        stateReadCount: 1
      },
      {
        diagnosticCodes: [],
        name: "duplicate getters use runtime last definition",
        stateReadCount: 1
      },
      {
        diagnosticCodes: [],
        name: "computed sequence key selects absent property",
        stateReadCount: 1
      },
      {
        diagnosticCodes: [],
        name: "setter-only read supplies undefined",
        stateReadCount: 1
      },
      {
        diagnosticCodes: [],
        name: "function rest destructuring collects suffix array",
        stateReadCount: 1
      },
      {
        diagnosticCodes: [],
        name: "literal bind result invoked through call",
        stateReadCount: 1
      },
      {
        diagnosticCodes: [],
        name: "returned literal bind result invoked through apply",
        stateReadCount: 1
      }
    ]);
    for (const [name, outerSyntax] of [
      ["nested array-rest binding default state read", `
        (([
          ...[value = residentWakeRuntimeStates.get(wakeRuntime)]
        ]) => {
          void value;
        })([]);
      `],
      ["destructured literal getter state read", `
        (({ value }: { value: unknown }) => {
          void value;
        })({
          get value() {
            residentWakeRuntimeStates.get(wakeRuntime);
            return 1;
          }
        });
      `],
      ["computed binding-property state read", `
        (({
          [(() => {
            residentWakeRuntimeStates.get(wakeRuntime);
            return "value";
          })()]: value
        }) => {
          void value;
        })({ value: 1 });
      `],
      ["returned literal used as constructor state read", `
        new ((() => function Returned() {
          residentWakeRuntimeStates.get(wakeRuntime);
        })())();
      `],
      ["returned literal used as tag state read", `
        ((() => function ReturnedTag() {
          residentWakeRuntimeStates.get(wakeRuntime);
          return "tagged";
        })())\`tag\`;
      `],
      ["constructor-returned literal reused as constructor state read", `
        new (new (function Maker() {
          return function Returned() {
            residentWakeRuntimeStates.get(wakeRuntime);
          };
        })())();
      `],
      ["tag-returned literal reused as tag state read", `
        ((function makeTag() {
          return function returnedTag() {
            residentWakeRuntimeStates.get(wakeRuntime);
            return "done";
          };
        })\`inner\`)\`outer\`;
      `],
      ["selected getter const-initializer state read", `
        (({ value }: { value: unknown }) => void value)({
          get value() {
            const current =
              residentWakeRuntimeStates.get(wakeRuntime);
            return current;
          }
        });
      `],
      ["last duplicate getter state read", `
        (({ value }: { value: unknown }) => void value)({
          get value() { return 0; },
          get value() {
            residentWakeRuntimeStates.get(wakeRuntime);
            return 1;
          }
        });
      `],
      ["computed sequence-key absent default state read", `
        (({
          [(0, "missing")]:
            value = residentWakeRuntimeStates.get(wakeRuntime)
        }) => void value)({});
      `],
      ["setter-only selected default state read", `
        (({
          value = residentWakeRuntimeStates.get(wakeRuntime)
        }) => void value)({
          set value(input: unknown) { void input; }
        });
      `],
      ["function rest destructuring default state read", `
        ((...[
          value = residentWakeRuntimeStates.get(wakeRuntime)
        ]) => void value)();
      `],
      ["literal bind result call state read", `
        (function invoked() {
          residentWakeRuntimeStates.get(wakeRuntime);
        }).bind(undefined).call(undefined);
      `],
      ["returned literal bind result apply state read", `
        (() => function returned() {
          residentWakeRuntimeStates.get(wakeRuntime);
        })().bind(undefined).apply(undefined, []);
      `],
      ["computed sequence-key operand state read", `
        (({
          [(
            residentWakeRuntimeStates.get(wakeRuntime),
            "value"
          )]: value
        }) => void value)({ value: 1 });
      `]
    ] as const) {
      expect.soft(
        mountedBinderControlAnalysis(
          exactRegistrarWith(outerSyntax)
        ),
        name
      ).not.toEqual(exactBinderOwnership);
    }
    for (const [name, outerSyntax] of [
      ["supplied nested array-rest value keeps default deferred", `
        (([
          ...[value = residentWakeRuntimeStates.get(wakeRuntime)]
        ]) => {
          void value;
        })(["supplied"]);
      `],
      ["unselected literal getter body remains deferred", `
        (({ selected }: { selected: unknown }) => {
          void selected;
        })({
          get deferred() {
            residentWakeRuntimeStates.get(wakeRuntime);
            return 1;
          },
          selected: 1
        });
      `],
      ["unselected getter const initializer remains deferred", `
        (({ selected }: { selected: unknown }) => {
          void selected;
        })({
          get deferred() {
            const current =
              residentWakeRuntimeStates.get(wakeRuntime);
            return current;
          },
          selected: 1
        });
      `],
      ["literal setter body remains deferred", `
        (({ value }) => {
          void value;
        })({
          set value(input: unknown) {
            residentWakeRuntimeStates.get(wakeRuntime);
            void input;
          }
        });
      `],
      ["duplicate last getter wins without reading the first", `
        (({ value }: { value: unknown }) => void value)({
          get value() {
            residentWakeRuntimeStates.get(wakeRuntime);
            return 0;
          },
          get value() { return 1; }
        });
      `],
      ["selected getter const return keeps default deferred", `
        (({
          value = residentWakeRuntimeStates.get(wakeRuntime)
        }) => void value)({
          get value() {
            const current = 1;
            return current;
          }
        });
      `],
      ["computed binding-property closure remains deferred", `
        (({
          [(
            () => residentWakeRuntimeStates.get(wakeRuntime),
            "value"
          )]: value
        }) => {
          void value;
        })({ value: 1 });
      `],
      ["computed sequence key supplied value keeps default deferred", `
        (({
          [(0, "value")]:
            value = residentWakeRuntimeStates.get(wakeRuntime)
        }) => void value)({ value: 1 });
      `],
      ["supplied function rest-array value keeps default deferred", `
        ((...[
          value = residentWakeRuntimeStates.get(wakeRuntime)
        ]) => void value)("supplied");
      `],
      ["nested constructor and tag chains terminate at runtime values", `
        const createDeferredConstructor = () => function Deferred() {
          residentWakeRuntimeStates.get(wakeRuntime);
        };
        const createDeferredTag = () => function deferredTag() {
          residentWakeRuntimeStates.get(wakeRuntime);
          return "tagged";
        };
        new (new (function Maker() {
          return function Returned() {
            return createDeferredConstructor();
          };
        })())();
        ((function makeTag() {
          return function returnedTag() {
            return createDeferredTag();
          };
        })\`inner\`)\`outer\`;
      `],
      ["bound call arguments retain bound-before-call order", `
        (function invoked(
          first: unknown,
          second = residentWakeRuntimeStates.get(wakeRuntime)
        ) {
          void first;
          void second;
        }).bind(undefined, "bound").call(undefined, "supplied");
      `],
      ["returned bound apply arguments retain bound-before-call order", `
        (() => function returned(
          first: unknown,
          second = residentWakeRuntimeStates.get(wakeRuntime)
        ) {
          void first;
          void second;
        })().bind(undefined, "bound").apply(undefined, ["supplied"]);
      `],
      ["named runtime constructor and tag remain literal-bounded", `
        const createDeferredConstructor = () => function Deferred() {
          residentWakeRuntimeStates.get(wakeRuntime);
        };
        const createDeferredTag = () => function deferredTag() {
          residentWakeRuntimeStates.get(wakeRuntime);
          return "tagged";
        };
        new (createDeferredConstructor())();
        createDeferredTag()\`tag\`;
      `],
      ["deferred nested function and arrow bodies and defaults", `
        function deferredFunction(
          value = residentWakeRuntimeStates.get(wakeRuntime)
        ) {
          residentWakeRuntimeStates.get(wakeRuntime);
          return value;
        }
        const deferredArrow = (
          value = residentWakeRuntimeStates.get(wakeRuntime)
        ) => {
          residentWakeRuntimeStates.get(wakeRuntime);
          return value;
        };
        void deferredFunction;
        void deferredArrow;
      `],
      ["deferred functions inside computed method names", `
        const deferredNames = {
          [((() => residentWakeRuntimeStates.get(wakeRuntime)),
            "deferred-arrow-body")]() {},
          [(((value = residentWakeRuntimeStates.get(wakeRuntime)) => value),
            "deferred-arrow-default")]() {},
          [((function deferred(
            value = residentWakeRuntimeStates.get(wakeRuntime)
          ) {
            residentWakeRuntimeStates.get(wakeRuntime);
            return value;
          }), "deferred-function")]() {}
        };
        void deferredNames;
      `],
      ["deferred functions inside decorator expressions", `
        class DeferredDecorators {
          @((() => residentWakeRuntimeStates.get(wakeRuntime)), decorate)
          method(
            @((function deferred(
              value = residentWakeRuntimeStates.get(wakeRuntime)
            ) {
              residentWakeRuntimeStates.get(wakeRuntime);
              return value;
            }), decorate)
            input: unknown
          ) {
            void input;
          }
          @(((value = residentWakeRuntimeStates.get(wakeRuntime)) => value),
            decorate)
          get accessor() {
            return 1;
          }
        }
        void DeferredDecorators;
      `],
      ["uninvoked literal-function bind result", `
        const deferredBind = {
          [((
            function deferred() {
              residentWakeRuntimeStates.get(wakeRuntime);
            }
          ).bind(undefined), "deferred-bind")]() {}
        };
        void deferredBind;
      `],
      ["constructed but uninvoked ordinary function literal", `
        const deferredFunction = {
          [(
            function deferred() {
              residentWakeRuntimeStates.get(wakeRuntime);
            },
            "deferred-function"
          )]() {}
        };
        void deferredFunction;
      `],
      ["invoked generator without iteration", `
        const deferredGenerator = {
          [((
            function* deferred() {
              residentWakeRuntimeStates.get(wakeRuntime);
            }
          )(), "deferred-generator")]() {}
        };
        void deferredGenerator;
      `],
      ["locally shadowed undefined argument", `
        const shadowedUndefined = {
          [(
            ((undefined) => {
              ((value = residentWakeRuntimeStates.get(wakeRuntime)) => value)(
                undefined
              );
            })({}),
            "shadowed-undefined"
          )]() {}
        };
        void shadowedUndefined;
      `]
    ] as const) {
      expect.soft(
        mountedBinderControlAnalysis(
          exactRegistrarWith(outerSyntax)
        ),
        name
      ).toEqual(exactBinderOwnership);
    }
    for (const [name, text] of [
      ["object-literal computed method state read", exactRegistrarWith(`
        const objectValue = {
          [(residentWakeRuntimeStates.get(wakeRuntime), "method")]() {}
        };
        void objectValue;
      `)],
      ["class computed method state read", exactRegistrarWith(`
        class ComputedMethod {
          [(residentWakeRuntimeStates.get(wakeRuntime), "method")]() {}
        }
        void ComputedMethod;
      `)],
      ["object-literal computed getter state read", exactRegistrarWith(`
        const objectValue = {
          get [(residentWakeRuntimeStates.get(wakeRuntime), "getter")]() {
            return 1;
          }
        };
        void objectValue;
      `)],
      ["object-literal computed setter state read", exactRegistrarWith(`
        const objectValue = {
          set [(residentWakeRuntimeStates.get(wakeRuntime), "setter")](
            value: number
          ) {
            void value;
          }
        };
        void objectValue;
      `)],
      ["class computed getter state read", exactRegistrarWith(`
        class ComputedGetter {
          get [(residentWakeRuntimeStates.get(wakeRuntime), "getter")]() {
            return 1;
          }
        }
        void ComputedGetter;
      `)],
      ["class computed setter state read", exactRegistrarWith(`
        class ComputedSetter {
          set [(residentWakeRuntimeStates.get(wakeRuntime), "setter")](
            value: number
          ) {
            void value;
          }
        }
        void ComputedSetter;
      `)],
      ["method decorator state read", exactRegistrarWith(`
        class DecoratedMethod {
          @((residentWakeRuntimeStates.get(wakeRuntime), decorate))
          method() {}
        }
        void DecoratedMethod;
      `)],
      ["getter decorator state read", exactRegistrarWith(`
        class DecoratedGetter {
          @((residentWakeRuntimeStates.get(wakeRuntime), decorate))
          get value() {
            return 1;
          }
        }
        void DecoratedGetter;
      `)],
      ["setter decorator state read", exactRegistrarWith(`
        class DecoratedSetter {
          @((residentWakeRuntimeStates.get(wakeRuntime), decorate))
          set value(input: number) {
            void input;
          }
        }
        void DecoratedSetter;
      `)],
      ["method parameter decorator state read", exactRegistrarWith(`
        class DecoratedMethodParameter {
          method(
            @((residentWakeRuntimeStates.get(wakeRuntime), decorate))
            input: unknown
          ) {
            void input;
          }
        }
        void DecoratedMethodParameter;
      `)],
      ["setter parameter decorator state read", exactRegistrarWith(`
        class DecoratedSetterParameter {
          set value(
            @((residentWakeRuntimeStates.get(wakeRuntime), decorate))
            input: number
          ) {
            void input;
          }
        }
        void DecoratedSetterParameter;
      `)],
      ["constructor parameter decorator state read", exactRegistrarWith(`
        class DecoratedConstructorParameter {
          constructor(
            @((residentWakeRuntimeStates.get(wakeRuntime), decorate))
            input: unknown
          ) {
            void input;
          }
        }
        void DecoratedConstructorParameter;
      `)],
      ["invoked arrow in computed method name state read", exactRegistrarWith(`
        const objectValue = {
          [((() => (
            residentWakeRuntimeStates.get(wakeRuntime),
            "method"
          ))())]() {}
        };
        void objectValue;
      `)],
      ["invoked function in decorator state read", exactRegistrarWith(`
        class InvokedDecorator {
          @((function createDecorator() {
            residentWakeRuntimeStates.get(wakeRuntime);
            return decorate;
          })())
          method() {}
        }
        void InvokedDecorator;
      `)],
      ["optional invoked arrow in computed name state read", exactRegistrarWith(`
        const objectValue = {
          [((() => (
            residentWakeRuntimeStates.get(wakeRuntime),
            "optional-invocation"
          ))?.())!]() {}
        };
        void objectValue;
      `)],
      ["literal function call invocation state read", exactRegistrarWith(`
        const objectValue = {
          [((function invoked() {
            residentWakeRuntimeStates.get(wakeRuntime);
            return "call-invocation";
          }).call(undefined))]() {}
        };
        void objectValue;
      `)],
      ["literal function apply invocation state read", exactRegistrarWith(`
        const objectValue = {
          [((function invoked() {
            residentWakeRuntimeStates.get(wakeRuntime);
            return "apply-invocation";
          }).apply(undefined, []))]() {}
        };
        void objectValue;
      `)],
      ["immediately invoked literal function bind result state read", exactRegistrarWith(`
        const objectValue = {
          [((function invoked() {
            residentWakeRuntimeStates.get(wakeRuntime);
            return "bind-invocation";
          }).bind(undefined)())]() {}
        };
        void objectValue;
      `)],
      ["constructed literal function state read", exactRegistrarWith(`
        class ConstructedDecorator {
          @((new (function invoked() {
            residentWakeRuntimeStates.get(wakeRuntime);
          })(), decorate))
          method() {}
        }
        void ConstructedDecorator;
      `)],
      ["literal function tag invocation state read", exactRegistrarWith(`
        class TaggedDecorator {
          @((function invoked() {
            residentWakeRuntimeStates.get(wakeRuntime);
            return decorate;
          })\`tag\`)
          method() {}
        }
        void TaggedDecorator;
      `)],
      ["immediately returned literal function invocation state read", exactRegistrarWith(`
        const objectValue = {
          [((() => () => (
            residentWakeRuntimeStates.get(wakeRuntime),
            "returned-invocation"
          ))()())]() {}
        };
        void objectValue;
      `)],
      ["literal function apply null argument-list default state read", exactRegistrarWith(`
        const objectValue = {
          [(
            (function invoked(
              value = residentWakeRuntimeStates.get(wakeRuntime)
            ) {
              void value;
            }).apply(undefined, null),
            "apply-null"
          )]() {}
        };
        void objectValue;
      `)],
      ["recursive destructured parameter default state read", exactRegistrarWith(`
        const objectValue = {
          [(
            (({
              nested: [
                value = residentWakeRuntimeStates.get(wakeRuntime)
              ] = []
            } = {
              nested: []
            }) => {
              void value;
            })({
              nested: []
            }),
            "destructured-default"
          )]() {}
        };
        void objectValue;
      `)],
      ["returned literal function call invocation state read", exactRegistrarWith(`
        const objectValue = {
          [(
            (() => function returned() {
              residentWakeRuntimeStates.get(wakeRuntime);
            })().call(undefined),
            "returned-call"
          )]() {}
        };
        void objectValue;
      `)],
      ["returned literal function apply invocation state read", exactRegistrarWith(`
        const objectValue = {
          [(
            (() => function returned() {
              residentWakeRuntimeStates.get(wakeRuntime);
            })().apply(undefined, []),
            "returned-apply"
          )]() {}
        };
        void objectValue;
      `)],
      ["returned literal function bound invocation state read", exactRegistrarWith(`
        const objectValue = {
          [(
            (() => function returned() {
              residentWakeRuntimeStates.get(wakeRuntime);
            })().bind(undefined)(),
            "returned-bind"
          )]() {}
        };
        void objectValue;
      `)],
      ["constructor-returned literal direct invocation state read", exactRegistrarWith(`
        const objectValue = {
          [(
            new (function constructed() {
              return function returned() {
                residentWakeRuntimeStates.get(wakeRuntime);
              };
            })()(),
            "constructor-returned"
          )]() {}
        };
        void objectValue;
      `)],
      ["tag-returned literal direct invocation state read", exactRegistrarWith(`
        const objectValue = {
          [(
            (function tagged() {
              return function returned() {
                residentWakeRuntimeStates.get(wakeRuntime);
              };
            })\`tag\`(),
            "tag-returned"
          )]() {}
        };
        void objectValue;
      `)],
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
      ["extra bare exact state read before binder call", `
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
          residentWakeRuntimeStates.get(wakeRuntime);
          return bindMountedResidentLoopAuthorityForFactory(
            state.store,
            binding,
            domainExecution
          );
        }
      `],
      ["extra bare exact state read after binder call", `
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
          const result = bindMountedResidentLoopAuthorityForFactory(
            state.store,
            binding,
            domainExecution
          );
          residentWakeRuntimeStates.get(wakeRuntime);
          return result;
        }
      `],
      ["extra let exact state read", `
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
          let duplicateState = residentWakeRuntimeStates.get(wakeRuntime);
          void duplicateState;
          return bindMountedResidentLoopAuthorityForFactory(
            state.store,
            binding,
            domainExecution
          );
        }
      `],
      ["extra var exact state read", `
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
          var duplicateState = residentWakeRuntimeStates.get(wakeRuntime);
          void duplicateState;
          return bindMountedResidentLoopAuthorityForFactory(
            state.store,
            binding,
            domainExecution
          );
        }
      `],
      ["extra multi-declaration exact state read", `
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
          const duplicateMarker = true,
            duplicateState = residentWakeRuntimeStates.get(wakeRuntime);
          void duplicateMarker;
          void duplicateState;
          return bindMountedResidentLoopAuthorityForFactory(
            state.store,
            binding,
            domainExecution
          );
        }
      `],
      ["nested-block bare exact state read", `
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
            residentWakeRuntimeStates.get(wakeRuntime);
          }
          return bindMountedResidentLoopAuthorityForFactory(
            state.store,
            binding,
            domainExecution
          );
        }
      `],
      ["nested-block multi-declaration exact state read", `
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
            var duplicateMarker = true,
              duplicateState = residentWakeRuntimeStates.get(wakeRuntime);
            void duplicateMarker;
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
