import assert from "node:assert/strict";
import { test } from "node:test";
import {
  loadContract,
  runAbiCorpus,
  runCompositionCorpus,
  verifyCommandCards,
  verifyStaticGraph
} from "./task136-bounded-assurance.mjs";

const expectedIds = [
  "Task126",
  "Task127",
  "Task128",
  "Task129",
  "Task130",
  "Task135D",
  "Task137A",
  "Task135B",
  "T120-R",
  "Task137B-W",
  "W1-123-H-SHARED-SCHEMA",
  "W1-133.5-PREAPPROVAL-PROMPT-STORE",
  "CF1-HR",
  "Task126-R",
  "Task133",
  "Task139-P1",
  "Task139-PM",
  "Task136-FC-Core",
  "Task139-P2",
  "Task136-FC-Ports",
  "G136-SC",
  "G136-R",
  "C136-P",
  "Task121",
  "Task122",
  "W1-123-BOOTSTRAP-HANDOFF",
  "Task138-H",
  "Task136"
];

test("verifies the 28-card topological graph and exact commands", () => {
  const contract = loadContract();
  const result = verifyStaticGraph(contract);

  assert.equal(result.records, 28);
  assert.deepEqual(result.ids, expectedIds);
  assert.equal(
    result.commands.get("Task136-FC-Ports"),
    "npm test -- packages/local-runtime/test/resident-loop-factory-ports.test.ts packages/local-runtime/test/resident-loop-factory-ports-imports.test.ts packages/local-runtime/test/runtime-handle-mounted-authority-imports.test.ts"
  );
});

test("accepts one generated composition and rejects the frozen 20 mutations", () => {
  const result = runCompositionCorpus(loadContract());

  assert.equal(result.green, 1);
  assert.equal(result.red, 20);
  assert.deepEqual(result.rejectedCategoryIds, [
    "unknown-node",
    "duplicate-node",
    "reordered-node",
    "missing-prerequisite",
    "dependency-inversion",
    "undeclared-transfer",
    "overlapping-final-owner",
    "missing-owned-path",
    "extra-owned-path",
    "wrong-path-disposition",
    "noncanonical-module-path",
    "unsupported-template",
    "unknown-import",
    "wrong-import-kind",
    "missing-export",
    "extra-export",
    "default-import",
    "namespace-import",
    "dynamic-commonjs-loader",
    "fixture-source-outside-generator"
  ]);
});

test("reports exactly 28 command cards", () => {
  const result = verifyCommandCards(loadContract());

  assert.equal(result.cards, 28);
  assert.equal(
    result.commands.get("Task137A"),
    "npm test -- packages/local-runtime/test/portable-workspace-lifecycle.test.ts packages/local-runtime/test/mounted-artifact-authority-operation.test.ts packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts"
  );
});

test("accepts one ABI fixture and rejects the frozen 15 ABI mutations", () => {
  const result = runAbiCorpus();

  assert.equal(result.green, 1);
  assert.equal(result.red, 15);
  assert.deepEqual(result.rejectedCategoryIds, [
    "missing-loop-port",
    "narrowed-checkpoint-readback",
    "missing-mounted-authority-port",
    "public-runtime-mint",
    "caller-supplied-runtime-grant",
    "external-governed-input-mint",
    "direct-named-re-export",
    "import-then-export-alias",
    "export-star-forwarding",
    "namespace-forwarding",
    "commonjs-require-loader",
    "dynamic-import-loader",
    "module-require-loader",
    "missing-handoff-readback",
    "cached-source-context"
  ]);
});
