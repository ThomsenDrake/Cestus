import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const runtimeSourceRoot = join(dirname(fileURLToPath(import.meta.url)), "../src");
const mountedAuthoritySeam = "mounted-artifact-authority-operation.ts";
const factoryCaptureImport = /(?:FactoryIssuedMountedRuntimeCapture|captureFactoryIssuedMountedRuntime|inspectFactoryIssuedMountedRuntimeCapture)/;

describe("factory-issued mounted runtime capture production imports", () => {
  it("only mounted authority operation may import factory issued runtime capture", () => {
    const importers = readdirSync(runtimeSourceRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".ts") && entry.name !== "runtime-factory.ts")
      .filter((entry) => factoryCaptureImport.test(readFileSync(join(runtimeSourceRoot, entry.name), "utf8")))
      .map((entry) => entry.name)
      .sort();

    const expected = readdirSync(runtimeSourceRoot).includes(mountedAuthoritySeam)
      ? [mountedAuthoritySeam]
      : [];

    expect(importers).toEqual(expected);
  });

  it("every forbidden production importer of factory issued runtime capture fails the allowlist", () => {
    const importers = readdirSync(runtimeSourceRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".ts") && entry.name !== "runtime-factory.ts")
      .filter((entry) => factoryCaptureImport.test(readFileSync(join(runtimeSourceRoot, entry.name), "utf8")))
      .map((entry) => entry.name)
      .filter((name) => name !== mountedAuthoritySeam);

    expect(importers).toEqual([]);
  });
});
