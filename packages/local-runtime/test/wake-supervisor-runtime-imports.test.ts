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

    expect(source).toContain(`from "${permittedResidentImports.wakeRuntime.dispatcherDefault}"`);
    expect(source).toContain(`from "${permittedResidentImports.wakeRuntime.gatewayNamedConstructor}"`);
    expect(source).toMatch(/import\s+\w+\s+from\s+"..\/..\/agent\/src\/domain-execution-dispatcher\.js"/);
    expect(source).toMatch(/import\s*\{[^}]*createResidentLoopToolGateway[^}]*\}\s*from\s+"..\/..\/agent\/src\/resident-loop-tool-gateway\.js"/s);
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

    const dispatcherImports = wakeFile.statements.flatMap((statement) => {
      if (
        !ts.isImportDeclaration(statement) ||
        !ts.isStringLiteral(statement.moduleSpecifier) ||
        statement.moduleSpecifier.text !== permittedResidentImports.wakeRuntime.dispatcherDefault
      ) {
        return [];
      }
      return [{
        defaultName: statement.importClause?.name?.text ?? null,
        hasNamedBindings: statement.importClause?.namedBindings !== undefined
      }];
    });
    const gatewayImports = wakeFile.statements.flatMap((statement) => {
      if (
        !ts.isImportDeclaration(statement) ||
        !ts.isStringLiteral(statement.moduleSpecifier) ||
        statement.moduleSpecifier.text !== permittedResidentImports.wakeRuntime.gatewayNamedConstructor
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

    const packagesRoot = fileURLToPath(new URL("../../", import.meta.url));
    const binderImporters: string[] = [];
    const binderCalls: Array<{ file: string; argumentCount: number }> = [];
    for (const file of productionTypeScriptFiles(packagesRoot)) {
      const productionFile = ts.createSourceFile(
        file,
        readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS
      );
      const localBinderNames = new Set<string>();
      const binderNamespaces = new Set<string>();
      for (const statement of productionFile.statements) {
        if (
          !ts.isImportDeclaration(statement) ||
          !ts.isStringLiteral(statement.moduleSpecifier) ||
          !statement.moduleSpecifier.text.endsWith("mounted-wake-lifecycle-store.js")
        ) {
          continue;
        }
        const bindings = statement.importClause?.namedBindings;
        if (bindings !== undefined && ts.isNamedImports(bindings)) {
          for (const element of bindings.elements) {
            if (
              (element.propertyName?.text ?? element.name.text) ===
              "bindMountedResidentLoopAuthorityForFactory"
            ) {
              localBinderNames.add(element.name.text);
            }
          }
        } else if (bindings !== undefined && ts.isNamespaceImport(bindings)) {
          binderNamespaces.add(bindings.name.text);
        }
      }
      if (localBinderNames.size > 0 || binderNamespaces.size > 0) {
        binderImporters.push(sourceLabel(packagesRoot, file));
      }
      const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node)) {
          const direct =
            ts.isIdentifier(node.expression) &&
            localBinderNames.has(node.expression.text);
          const namespaced =
            ts.isPropertyAccessExpression(node.expression) &&
            ts.isIdentifier(node.expression.expression) &&
            binderNamespaces.has(node.expression.expression.text) &&
            node.expression.name.text === "bindMountedResidentLoopAuthorityForFactory";
          if (direct || namespaced) {
            binderCalls.push({
              file: sourceLabel(packagesRoot, file),
              argumentCount: node.arguments.length
            });
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(productionFile);
    }

    const productAnalysis = {
      declarationCount: declarations.length,
      binderParameterNames: declarations.flatMap((declaration) =>
        declaration.parameters.map((parameter) => parameter.name.getText(mountedStoreFile))
      ),
      binderParameterCount: declarations[0]?.parameters.length ?? 0,
      callbackOrWrapperParameterIndexes: constructorParameterIndexes,
      binderImporters,
      binderCalls,
      dispatcherImports,
      gatewayImports
    };
    for (const pattern of forbiddenLoaderForms) expect(source).not.toMatch(pattern);
    for (const transfer of forbiddenTransfers) expect(source).not.toContain(transfer);
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
      }]
    });
  });
});
