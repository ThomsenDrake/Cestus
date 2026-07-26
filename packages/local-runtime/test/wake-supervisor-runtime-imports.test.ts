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
    type LiteralFunction =
      | ts.ArrowFunction
      | ts.FunctionExpression;
    type InvocationArgument = ts.Expression | null | undefined;
    interface ImmediateCallResult {
      readonly returnedFunction: LiteralFunction | undefined;
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
      const expression = unwrapLiteralExpression(call.expression);
      const directlyInvoked = literalFunctionValue(expression);
      if (directlyInvoked !== undefined) {
        visitInvocationArguments(call.arguments);
        visitLiteralInvocation(directlyInvoked, call.arguments);
        return {
          returnedFunction: exactReturnedLiteralFunction(directlyInvoked)
        };
      }
      if (ts.isCallExpression(expression)) {
        const bound = exactLiteralBind(expression);
        if (bound !== undefined) {
          visitInvocationArguments(expression.arguments);
          visitInvocationArguments(call.arguments);
          visitLiteralInvocation(bound.functionValue, [
            ...bound.boundArguments,
            ...call.arguments
          ]);
          return {
            returnedFunction:
              exactReturnedLiteralFunction(bound.functionValue)
          };
        }
        const priorInvocation = executeImmediateLiteralCall(expression);
        if (priorInvocation === undefined) return undefined;
        visitInvocationArguments(call.arguments);
        if (priorInvocation.returnedFunction === undefined) {
          return { returnedFunction: undefined };
        }
        visitLiteralInvocation(
          priorInvocation.returnedFunction,
          call.arguments
        );
        return {
          returnedFunction: exactReturnedLiteralFunction(
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
        (
          expression.name.text === "call" ||
          expression.name.text === "apply"
        )
      ) {
        const invoked =
          immediateLiteralFunctionValue(expression.expression);
        if (invoked === undefined) return undefined;
        const invocationArguments =
          expression.name.text === "call"
            ? [...call.arguments.slice(1)]
            : exactApplyArguments(call.arguments);
        if (invocationArguments === undefined) return undefined;
        visitInvocationArguments(call.arguments);
        visitLiteralInvocation(invoked, invocationArguments);
        return {
          returnedFunction: exactReturnedLiteralFunction(invoked)
        };
      }
      return undefined;
    }
    function executeImmediateLiteralConstruction(
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
      visitLiteralInvocation(invoked, arguments_);
      return {
        returnedFunction: exactReturnedLiteralFunction(invoked)
      };
    }
    function executeImmediateLiteralTag(
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
        returnedFunction: exactReturnedLiteralFunction(invoked)
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
        )
      };
    }
    function exactLiteralBind(call: ts.CallExpression): {
      readonly boundArguments: readonly ts.Expression[];
      readonly functionValue: LiteralFunction;
    } | undefined {
      const expression = unwrapLiteralExpression(call.expression);
      if (
        !ts.isPropertyAccessExpression(expression) ||
        expression.name.text !== "bind"
      ) {
        return undefined;
      }
      const functionValue =
        immediateLiteralFunctionValue(expression.expression);
      return functionValue === undefined
        ? undefined
        : {
            boundArguments: call.arguments.slice(1),
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
        !ts.isArrayLiteralExpression(array) ||
        array.elements.some(ts.isSpreadElement)
      ) {
        return undefined;
      }
      return array.elements.map((element) =>
        ts.isOmittedExpression(element) ? undefined : element
      );
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
      const literal = literalFunctionValue(expression);
      if (literal !== undefined) return literal;
      const unwrapped = unwrapLiteralExpression(expression);
      return ts.isCallExpression(unwrapped)
        ? executeImmediateLiteralCall(unwrapped)?.returnedFunction
        : undefined;
    }
    function visitLiteralInvocation(
      invoked: LiteralFunction,
      arguments_: readonly InvocationArgument[]
    ): void {
      invoked.parameters.forEach((parameter, index) => {
        visitBindingDefaults(
          parameter.name,
          parameter.initializer,
          arguments_[index]
        );
      });
      if (invoked.asteriskToken !== undefined) return;
      visitRegistrarStateReads(invoked.body, true);
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
        ts.isObjectLiteralExpression(literal)
      ) {
        for (const element of name.elements) {
          if (element.dotDotDotToken !== undefined) continue;
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
          const property = exactObjectLiteralProperty(
            literal,
            propertyName
          );
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
      if (!effects.every(ts.isExpressionStatement)) {
        return { known: false, value: undefined };
      }
      for (const effect of effects) {
        visitRegistrarStateReads(effect.expression, true);
      }
      if (returned?.expression !== undefined) {
        visitRegistrarStateReads(returned.expression, true);
      }
      return {
        known: true,
        value: returned?.expression
      };
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
      const expression = unwrapLiteralExpression(name.expression);
      return (
        ts.isStringLiteral(expression) ||
        ts.isNumericLiteral(expression) ||
        ts.isNoSubstitutionTemplateLiteral(expression)
      )
        ? expression.text
        : undefined;
    }
    function exactObjectLiteralProperty(
      object: ts.ObjectLiteralExpression,
      name: string
    ): {
      readonly known: boolean;
      readonly value: InvocationArgument;
    } {
      let value: InvocationArgument = undefined;
      for (const property of object.properties) {
        if (ts.isSpreadAssignment(property)) {
          return { known: false, value: undefined };
        }
        const propertyName = literalPropertyName(property.name);
        if (propertyName === undefined) {
          return { known: false, value: undefined };
        }
        if (propertyName !== name) continue;
        if (ts.isPropertyAssignment(property)) {
          value = property.initializer;
        } else if (ts.isShorthandPropertyAssignment(property)) {
          value = property.name;
        } else if (ts.isMethodDeclaration(property)) {
          value = null;
        } else if (ts.isGetAccessorDeclaration(property)) {
          return exactGetterValue(property);
        } else {
          return { known: false, value: undefined };
        }
      }
      return { known: true, value };
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
    if (
      exactStateReads.length !== 1 ||
      stateDeclarations.length !== 1
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
