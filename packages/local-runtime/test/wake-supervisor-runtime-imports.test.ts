import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];
const target = "wake-supervisor-runtime.js";

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
});
