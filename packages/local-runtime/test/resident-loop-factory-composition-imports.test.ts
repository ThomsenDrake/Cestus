import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const sourcePath = resolve(process.cwd(), "packages/local-runtime/src/resident-loop-factory-composition.ts");

describe("resident loop factory composition import policy", () => {
  it("keeps core composition static, named, cycle-free, and downstream of released capability owners", () => {
    if (!existsSync(sourcePath)) return;

    const source = readFileSync(sourcePath, "utf8");
    const parsed = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const imports = parsed.statements.filter(ts.isImportDeclaration);

    expect(imports).toHaveLength(6);
    expect(source).toContain('from "./wake-supervisor-runtime.js"');
    expect(source).toContain('from "./mounted-provider-authority.js"');
    expect(source).toContain('from "./runtime-factory.js"');
    expect(source).toContain('from "../../agent/src/specialist-handoff-authority.js"');
    expect(source).not.toMatch(/mounted-artifact-authority-operation\.js/);
    expect(source).not.toMatch(/captureFactoryIssuedMountedRuntime|inspectFactoryIssuedMountedRuntimeCapture/);
    expect(source).not.toMatch(/\bimport\s*\(|\brequire\s*\(|\bexport\s+(?:\*|\{)/);

    for (const declaration of imports) {
      expect(declaration.importClause?.name).toBeUndefined();
      expect(declaration.importClause?.namedBindings === undefined || ts.isNamedImports(declaration.importClause.namedBindings)).toBe(true);
      if (declaration.importClause?.namedBindings !== undefined && ts.isNamedImports(declaration.importClause.namedBindings)) {
        for (const element of declaration.importClause.namedBindings.elements) {
          expect(element.propertyName).toBeUndefined();
        }
      }
    }
  });
});
