import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const sourcePath = resolve(process.cwd(), "packages/local-runtime/src/resident-loop-factory-ports.ts");

describe("resident loop factory ports import policy", () => {
  it("keeps the data-only bridge static, named, cycle-free, and outside mounted-authority producers", () => {
    if (!existsSync(sourcePath)) return;

    const source = readFileSync(sourcePath, "utf8");
    const parsed = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const imports = parsed.statements.filter(ts.isImportDeclaration);

    expect(imports).toHaveLength(3);
    expect(source).toContain('from "node:util"');
    expect(source).toContain('from "./resident-loop-factory-composition.js"');
    expect(source).toContain('from "./resident-loop-provider-posture.js"');
    expect(source).not.toMatch(/runtime-factory\.js|mounted-(?:provider|artifact)-authority(?:-operation)?\.js|wake-supervisor-runtime\.js/);
    expect(source).not.toMatch(/\bimport\s*\(|\brequire\s*\(|\bexport\s+(?:\*|\{)/);

    for (const declaration of imports) {
      expect(declaration.importClause?.name).toBeUndefined();
      expect(declaration.importClause?.namedBindings === undefined || ts.isNamedImports(declaration.importClause.namedBindings)).toBe(true);
      if (declaration.importClause?.namedBindings !== undefined && ts.isNamedImports(declaration.importClause.namedBindings)) {
        for (const element of declaration.importClause.namedBindings.elements) expect(element.propertyName).toBeUndefined();
      }
    }
  });
});
