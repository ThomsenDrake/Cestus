#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const contractPath = "docs/agentic/contracts/task136-bounded-assurance-v4.json";

const expectedCardIds = Object.freeze([
  "Task126",
  "Task127",
  "Task128",
  "Task135D",
  "Task137A",
  "Task129-MFA",
  "Task129",
  "Task130",
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
]);

const expectedAssuranceFingerprint = "3af58aba85ea68137462d2054072e4e3ce3a2a8146ad3be8ee400b103375feb7";
const immutableContractPins = Object.freeze([
  Object.freeze({ label: "v1", path: "docs/agentic/contracts/task136-bounded-assurance-v1.json", sha256: "d33864d9964a355067b7be86c78951d3df184a80b80765da3f51aab66e903fed" }),
  Object.freeze({ label: "v2", path: "docs/agentic/contracts/task136-bounded-assurance-v2.json", sha256: "c23a390cc3e4a3395c018a8532e0fa84b23a880782805f7cbcc463d9e8162ba4" }),
  Object.freeze({ label: "v3", path: "docs/agentic/contracts/task136-bounded-assurance-v3.json", sha256: "8934dbaf8246d295eba5ce825169ac08bb98f0e1b6b75a977657000cb46a1bbb" })
]);
const rawPrefixPins = Object.freeze([
  Object.freeze({ cardId: "Task126", sha256: "1b1fc2171278866b38f6aa96889b822f22ab2abd34f460b304fe7fc2c3a0b58d" }),
  Object.freeze({ cardId: "Task127", sha256: "18199ad9bfdcf3582ad13f6637bfbcc72949f1407271fa6c325612abcd226951" }),
  Object.freeze({ cardId: "Task128", sha256: "fe29c10c5dbe3d8c1596f20db7b95b62df8dd98d379ade09d2ed85822ce51d92" }),
  Object.freeze({ cardId: "Task135D", sha256: "749f6a7ec9f66fd8228426e07e3d5b9dbc1a6f0e57d7a804ad69515f48ffc9f9" }),
  Object.freeze({ cardId: "Task137A", sha256: "5a3b2f9a897b5d458742df7a3d403f0e3fe6e3459aba75e93d825d385ec4be32" }),
  Object.freeze({ cardId: "Task129-MFA", sha256: "64048b14448b66f224d254753a7ecbd210e1654602759248e5de89663295f017" }),
  Object.freeze({ cardId: "Task129", sha256: "987b4b18667508b7e4bd500be50b121d41b019bb011da8ae64ef4996ce62e01e" }),
  Object.freeze({ cardId: "Task130", sha256: "16328e8381eb9a55f7a8c3f3f155a4c40d44f4c0da1abe745c850193522171d8" }),
  Object.freeze({ cardId: "Task135B", sha256: "5fffad565a1523aecb0a0afd280b8b9936fc2a48dbe1c0b268f946634732e9e0" }),
  Object.freeze({ cardId: "T120-R", sha256: "f220cb62ab803c938e4e97c538f55e24628bbf46d6e06060cb0169c1adbf2cdb" }),
  Object.freeze({ cardId: "Task137B-W", sha256: "26f33ac286836459e723edd5ad2d4e34202bccd3f1a92e5533be30e7d881c9b7" }),
  Object.freeze({ cardId: "W1-123-H-SHARED-SCHEMA", sha256: "9bb5838f7782eaeb327280040a514119f8c0ba1fd76dee6268ead6013ac8f292" }),
  Object.freeze({ cardId: "W1-133.5-PREAPPROVAL-PROMPT-STORE", sha256: "119f9aea548038d600edadbca60e2bb8f92f08aacdaf081c0f6dadc928438070" }),
  Object.freeze({ cardId: "CF1-HR", sha256: "8491645c21cdd6ca54e5701318a0f9febb794c5fc1f032beaca05c8acd960351" }),
  Object.freeze({ cardId: "Task126-R", sha256: "f27c06337227fcc4584d199a804226276cb1d63eca0dfbca410490324a11ef3f" }),
  Object.freeze({ cardId: "Task133", sha256: "3abba468fd3fe80a3b1f1e08367ddbd8fb3b30884f08876c911deed774fe1bd4" }),
  Object.freeze({ cardId: "Task139-P1", sha256: "9b268556a169bf270e0995d2b50ab137c65fe9341e91ddbcd9454c087279218d" })
]);
const expectedHistoricalCompatibility = Object.freeze([
  Object.freeze({
    cardId: "Task137A",
    canonicalJsonSha256: "ac3ac479d5b1e41db4ae15cea88b746f86bbc31f6af3ea74a6120834dc2c2198",
    pathDispositions: Object.freeze([
      Object.freeze({ path: "packages/local-runtime/src/portable-workspace-lifecycle.ts", recordDisposition: "owned" }),
      Object.freeze({ path: "packages/local-runtime/test/portable-workspace-lifecycle.test.ts", recordDisposition: "owned" })
    ])
  }),
  Object.freeze({
    cardId: "Task129-MFA",
    canonicalJsonSha256: "23cb98725d67ada15c0e2913816f82407c171912564423e669cf73995aaead76",
    pathDispositions: Object.freeze([
      Object.freeze({ path: "packages/ontology/src/contracts.ts", recordDisposition: "owned" }),
      Object.freeze({ path: "packages/local-runtime/src/mounted-artifact-authority-operation.ts", recordDisposition: "owned" }),
      Object.freeze({ path: "packages/local-runtime/test/mounted-artifact-authority-operation.test.ts", recordDisposition: "owned" }),
      Object.freeze({ path: "packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts", recordDisposition: "owned" }),
      Object.freeze({ path: "packages/local-runtime/test/support/task137-authority-boundary-policy.ts", recordDisposition: "owned" }),
      Object.freeze({ path: "packages/ontology/test/agent-contracts.test.ts", recordDisposition: "owned" })
    ])
  }),
  Object.freeze({
    cardId: "Task135B",
    canonicalJsonSha256: "73d8e28bdc56dbecf924a45a14c4caf8bb0864c89a4db98e1114f62f83d53409",
    pathDispositions: Object.freeze([
      Object.freeze({ path: "packages/local-runtime/src/portable-mounted-agent-artifact-stores.ts", recordDisposition: "owned" }),
      Object.freeze({ path: "packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts", recordDisposition: "owned" })
    ])
  }),
  Object.freeze({
    cardId: "Task137B-W",
    canonicalJsonSha256: "833ca5cc5aa191fdf9f98c692255133afaaf73b541b36275cab7ed04ef601e29",
    pathDispositions: Object.freeze([
      Object.freeze({ path: "packages/ontology/src/contracts.ts", recordDisposition: "owned" }),
      Object.freeze({ path: "packages/local-runtime/src/mounted-artifact-authority-operation.ts", recordDisposition: "owned" }),
      Object.freeze({ path: "packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts", recordDisposition: "owned" }),
      Object.freeze({ path: "packages/local-runtime/test/support/task137-authority-boundary-policy.ts", recordDisposition: "owned" })
    ])
  }),
  Object.freeze({
    cardId: "CF1-HR",
    canonicalJsonSha256: "d55028e1bd036051f5ec2c9d496267623ff2748e54713d3881a198667ac62f12",
    pathDispositions: Object.freeze([
      Object.freeze({ path: "packages/local-runtime/src/portable-mounted-agent-artifact-stores.ts", recordDisposition: "owned" }),
      Object.freeze({ path: "packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts", recordDisposition: "owned" }),
      Object.freeze({ path: "packages/agent/src/specialist-handoff-authority.ts", recordDisposition: "owned" }),
      Object.freeze({ path: "packages/agent/test/specialist-handoff-authority.test.ts", recordDisposition: "owned" })
    ])
  }),
  Object.freeze({
    cardId: "Task122",
    canonicalJsonSha256: "729d23c6c84c6ea33567a4b669c9ad960e830cf601a0d9ec5638308d3a360c0c",
    pathDispositions: Object.freeze([
      Object.freeze({ path: "packages/local-runtime/src/portable-mounted-agent-artifact-stores.ts", recordDisposition: "owned" }),
      Object.freeze({ path: "packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts", recordDisposition: "owned" })
    ])
  })
]);
const task137aToTask129MfaPaths = Object.freeze([
  "packages/local-runtime/src/mounted-artifact-authority-operation.ts",
  "packages/local-runtime/test/mounted-artifact-authority-operation.test.ts",
  "packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts",
  "packages/local-runtime/test/support/task137-authority-boundary-policy.ts"
]);
const task137aToTask137bPaths = Object.freeze([
  "packages/local-runtime/src/portable-workspace-lifecycle.ts",
  "packages/local-runtime/test/portable-workspace-lifecycle.test.ts"
]);
const task129MfaToTask137bPaths = Object.freeze([
  "packages/ontology/src/contracts.ts",
  "packages/local-runtime/src/mounted-artifact-authority-operation.ts",
  "packages/local-runtime/test/mounted-artifact-authority-operation.test.ts",
  "packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts",
  "packages/local-runtime/test/support/task137-authority-boundary-policy.ts"
]);
const task129MfaToCf1Paths = Object.freeze([
  "packages/ontology/test/agent-contracts.test.ts"
]);
const task135bToCf1Paths = Object.freeze([
  "packages/local-runtime/src/portable-mounted-agent-artifact-stores.ts",
  "packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts"
]);
const task137bToCf1Paths = Object.freeze([
  "packages/ontology/src/contracts.ts"
]);
const task137bToTask139PmPaths = Object.freeze([
  "packages/local-runtime/src/mounted-artifact-authority-operation.ts",
  "packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts",
  "packages/local-runtime/test/support/task137-authority-boundary-policy.ts"
]);
const task137bOwnedPaths = Object.freeze([
  "packages/local-runtime/src/portable-workspace-lifecycle.ts",
  "packages/local-runtime/test/portable-workspace-lifecycle.test.ts",
  "packages/local-runtime/src/mounted-artifact-authority-operation.ts",
  "packages/local-runtime/test/mounted-artifact-authority-operation.test.ts",
  "packages/local-runtime/src/wake-supervisor-runtime.ts",
  "packages/local-runtime/src/mounted-wake-lifecycle-store.ts",
  "packages/local-runtime/test/wake-supervisor-runtime.test.ts",
  "packages/local-runtime/test/mounted-wake-lifecycle-store.test.ts",
  "packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts",
  "packages/local-runtime/test/support/task137-authority-boundary-policy.ts",
  "packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts",
  "packages/ontology/src/contracts.ts",
  "packages/ontology/test/resident-wake-contracts.test.ts",
  "docs/agentic/claims/task-137-resident-full-vision-w2-wake-supervisor-runtime.md"
]);
const task137bCommand = "npm test -- packages/local-runtime/test/portable-workspace-lifecycle.test.ts packages/local-runtime/test/mounted-artifact-authority-operation.test.ts packages/local-runtime/test/wake-supervisor-runtime.test.ts packages/local-runtime/test/mounted-wake-lifecycle-store.test.ts packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts packages/ontology/test/resident-wake-contracts.test.ts";
const task139PmOwnedPaths = Object.freeze([
  "packages/local-runtime/src/mounted-provider-authority.ts",
  "packages/local-runtime/test/mounted-provider-authority.test.ts",
  "docs/agentic/claims/task-139-mounted-provider-authority.md",
  ...task137bToTask139PmPaths
]);
const task139PmCommand = "npm test -- packages/local-runtime/test/mounted-provider-authority.test.ts packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts";
const cf1HrOwnedPaths = Object.freeze([
  "packages/agent/src/specialist-runner-kernel.ts",
  "packages/agent/test/specialist-runner-kernel.test.ts",
  "packages/agent/src/specialist-handoff-projection.ts",
  "packages/agent/test/specialist-handoff-projection.test.ts",
  "packages/agent/src/specialist-handoff-manifest.ts",
  "packages/agent/test/specialist-handoff-manifest.test.ts",
  "packages/agent/src/specialist-handoff-authority.ts",
  "packages/agent/test/specialist-handoff-authority.test.ts",
  "packages/local-runtime/src/portable-mounted-agent-artifact-stores.ts",
  "packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts",
  "packages/ontology/src/contracts.ts",
  "packages/ontology/test/agent-contracts.test.ts",
  "packages/ontology/test/agent-resident-loop-contracts.test.ts",
  "docs/agentic/claims/cf1-h-task136-complete-handoff-readback-projection.md"
]);
const cf1HrCommand = "npm test -- packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/specialist-handoff-manifest.test.ts packages/agent/test/specialist-handoff-authority.test.ts packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts packages/ontology/test/agent-contracts.test.ts packages/ontology/test/agent-resident-loop-contracts.test.ts";
const cf1HrToTask122Paths = Object.freeze([
  "packages/local-runtime/src/portable-mounted-agent-artifact-stores.ts",
  "packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts"
]);
const cf1HrToW1BootstrapPaths = Object.freeze([
  "packages/agent/src/specialist-handoff-authority.ts",
  "packages/agent/test/specialist-handoff-authority.test.ts"
]);
const task122ToW1BootstrapPaths = cf1HrToTask122Paths;
const task122OwnedPaths = Object.freeze([
  "packages/agent/src/investigation-planner-workflow.ts",
  "packages/agent/test/investigation-planner-workflow.test.ts",
  "docs/agentic/claims/task-122-resident-full-vision-investigation-handoff.md",
  ...cf1HrToTask122Paths
]);
const task122Command = "npm test -- packages/agent/test/investigation-planner-workflow.test.ts packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts";
const w1BootstrapOwnedPaths = Object.freeze([
  "packages/agent/src/ontology-bootstrap-workflow.ts",
  "packages/agent/test/ontology-bootstrap-workflow.test.ts",
  ...cf1HrToW1BootstrapPaths,
  "packages/local-runtime/src/agent-ontology-bootstrap-routes.ts",
  "packages/local-runtime/test/agent-ontology-bootstrap-routes.test.ts",
  "docs/agentic/claims/task-123-resident-full-vision-bootstrap-handoff.md",
  ...task122ToW1BootstrapPaths
]);
const w1BootstrapCommand = "npm test -- packages/agent/test/ontology-bootstrap-workflow.test.ts packages/agent/test/specialist-handoff-authority.test.ts packages/local-runtime/test/agent-ontology-bootstrap-routes.test.ts packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts";
const g136ScOwnedPaths = Object.freeze([
  "packages/agent/src/tool-gateway.ts",
  "packages/agent/src/scheduler.ts",
  "packages/agent/src/resident-loop-scheduler-completion.ts",
  "packages/agent/src/execution-loop.ts",
  "packages/agent/test/tool-gateway.test.ts",
  "packages/agent/test/scheduler.test.ts",
  "packages/agent/test/resident-loop-scheduler-completion.test.ts",
  "packages/agent/test/execution-loop.test.ts",
  "packages/agent/test/domain-execution-dispatcher.test.ts",
  "docs/agentic/claims/task-136-scheduler-completion-adapter.md",
  "packages/agent/test/resident-loop-scheduler-completion-imports.test.ts"
]);
const g136ScCommand = "npm test -- packages/agent/test/tool-gateway.test.ts packages/agent/test/scheduler.test.ts packages/agent/test/resident-loop-scheduler-completion.test.ts packages/agent/test/execution-loop.test.ts packages/agent/test/domain-execution-dispatcher.test.ts packages/agent/test/resident-loop-scheduler-completion-imports.test.ts";
const releaseRecordSchemaVersion = "task136-dispatch-release.v4";
const releaseRecordKeys = Object.freeze([
  "schemaVersion",
  "cardId",
  "candidateSha",
  "reviews",
  "integrationSha",
  "releaseEventId",
  "prerequisites",
  "ownedPathBlobs"
]);
const releaseReviewKeys = Object.freeze(["threadId", "candidateSha", "verdict"]);
const releasePrerequisiteKeys = Object.freeze(["cardId", "integrationSha", "releaseEventId"]);
const releaseOwnedPathKeys = Object.freeze(["path", "disposition", "blobSha"]);
const releaseHeadingPrefix = "## Task136 dispatch release v4: ";
const fullShaPattern = /^[0-9a-f]{40}$/;
const codexThreadIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const rejectedCompositionIds = Object.freeze([
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

const rejectedAbiIds = Object.freeze([
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

const templateNames = Object.freeze(["types", "factory", "adapter", "registry", "composition"]);
const templateExports = Object.freeze({
  types: ["ResidentLoopPorts", "ResidentLoopCoreRegistration", "ResidentLoopP2Registration"],
  factory: ["createResidentLoopPorts", "createResidentLoopCore"],
  adapter: ["bindCurrentCoreProviderForP2", "registerResidentLoopP2"],
  registry: ["registerResidentLoopCore"],
  composition: ["createBoundedAgentLoopComposition"]
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ownKeys(value) {
  return Object.keys(value).sort();
}

function orderedOwnKeys(value) {
  return Object.keys(value);
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`${label} must be a plain object`);
  }
}

function assertExactKeys(value, keys, label) {
  assertPlainObject(value, label);
  const actual = ownKeys(value);
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} keys`);
  }
}

function assertExactOrderedKeys(value, keys, label) {
  assertPlainObject(value, label);
  const actual = orderedOwnKeys(value);
  if (JSON.stringify(actual) !== JSON.stringify(keys)) {
    throw new Error(`${label} keys`);
  }
}

function assertString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
}

function assertArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
}

function assertCanonicalPath(path, label) {
  assertString(path, label);
  if (path.startsWith("/") || path.startsWith(".") || path.includes("..") || path.includes("\\") || path.includes("//")) {
    throw new Error(`${label} is not canonical`);
  }
}

function assertFullSha(value, label) {
  if (typeof value !== "string" || !fullShaPattern.test(value)) {
    const separator = label.indexOf(": ");
    if (separator >= 0) {
      throw new Error(`${label.slice(0, separator)} must be a full lowercase SHA: ${label.slice(separator + 2)}`);
    }
    throw new Error(`${label} must be a full lowercase SHA`);
  }
}

function assertSha256(value, label) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256`);
  }
}

function assertThreadId(value, label) {
  if (typeof value !== "string" || !codexThreadIdPattern.test(value)) {
    throw new Error(`${label} must be a Codex task id`);
  }
}

function assertContractShape(contract) {
  assertExactKeys(contract, ["authority", "compositionCorpus", "compositionGrammar", "releaseCompatibility", "releaseGraph", "schemaVersion"], "contract");
  if (contract.schemaVersion !== "task136-bounded-assurance.v4") {
    throw new Error("schema version");
  }
  assertExactKeys(contract.authority, ["registryPath", "resetEvent"], "authority");
  if (contract.authority.registryPath !== "docs/agentic/resident-agent-full-vision-program-registry.md") {
    throw new Error("authority registry path");
  }
  if (contract.authority.resetEvent !== "RV-1-E-597") {
    throw new Error("authority reset event");
  }
  assertExactKeys(contract.releaseCompatibility, ["historicalRecords", "version"], "releaseCompatibility");
  if (contract.releaseCompatibility.version !== "task136-release-compatibility.v2") {
    throw new Error("release compatibility version");
  }
  assertArray(contract.releaseCompatibility.historicalRecords, "releaseCompatibility.historicalRecords");
  if (contract.releaseCompatibility.historicalRecords.length !== expectedHistoricalCompatibility.length) {
    throw new Error("release compatibility records");
  }
  for (let index = 0; index < expectedHistoricalCompatibility.length; index += 1) {
    const actual = contract.releaseCompatibility.historicalRecords[index];
    const expected = expectedHistoricalCompatibility[index];
    assertExactOrderedKeys(actual, ["cardId", "canonicalJsonSha256", "pathDispositions"], `release compatibility record ${index}`);
    if (actual.cardId !== expected.cardId) {
      throw new Error("release compatibility card");
    }
    assertSha256(actual.canonicalJsonSha256, `release compatibility hash: ${actual.cardId}`);
    if (actual.canonicalJsonSha256 !== expected.canonicalJsonSha256) {
      throw new Error("release compatibility hash");
    }
    assertArray(actual.pathDispositions, `release compatibility paths: ${actual.cardId}`);
    if (actual.pathDispositions.length !== expected.pathDispositions.length) {
      throw new Error("release compatibility paths");
    }
    for (let pathIndex = 0; pathIndex < expected.pathDispositions.length; pathIndex += 1) {
      const actualPath = actual.pathDispositions[pathIndex];
      const expectedPath = expected.pathDispositions[pathIndex];
      assertExactOrderedKeys(actualPath, ["path", "recordDisposition"], `release compatibility path ${actual.cardId}.${pathIndex}`);
      assertCanonicalPath(actualPath.path, `release compatibility path: ${actual.cardId}`);
      if (
        actualPath.path !== expectedPath.path ||
        actualPath.recordDisposition !== expectedPath.recordDisposition
      ) {
        throw new Error("release compatibility path");
      }
    }
  }
  assertExactKeys(contract.releaseGraph, ["cards", "version"], "releaseGraph");
  if (contract.releaseGraph.version !== "task136-release-graph.v4") {
    throw new Error("graph version");
  }
  assertArray(contract.releaseGraph.cards, "releaseGraph.cards");
  assertExactKeys(contract.compositionGrammar, ["templates", "version"], "compositionGrammar");
  if (contract.compositionGrammar.version !== "task136-composition-grammar.v1") {
    throw new Error("grammar version");
  }
  if (JSON.stringify(contract.compositionGrammar.templates) !== JSON.stringify(templateNames)) {
    throw new Error("grammar templates");
  }
  assertExactKeys(contract.compositionCorpus, ["accepted", "rejected", "version"], "compositionCorpus");
  if (contract.compositionCorpus.version !== "task136-composition-corpus.v1") {
    throw new Error("corpus version");
  }
  assertArray(contract.compositionCorpus.accepted, "compositionCorpus.accepted");
  assertArray(contract.compositionCorpus.rejected, "compositionCorpus.rejected");
}

function validateCardShape(card, index) {
  assertExactKeys(card, ["command", "id", "ownedPaths", "prerequisiteIds", "transferToIds"], `card ${index}`);
  assertString(card.id, `card ${index}.id`);
  assertArray(card.prerequisiteIds, `${card.id}.prerequisiteIds`);
  assertArray(card.ownedPaths, `${card.id}.ownedPaths`);
  assertArray(card.transferToIds, `${card.id}.transferToIds`);
  assertString(card.command, `${card.id}.command`);
  for (const prerequisiteId of card.prerequisiteIds) {
    assertString(prerequisiteId, `${card.id}.prerequisiteId`);
  }
  for (const transferToId of card.transferToIds) {
    assertString(transferToId, `${card.id}.transferToId`);
  }
  for (const ownedPath of card.ownedPaths) {
    assertExactKeys(ownedPath, ["disposition", "path"], `${card.id}.ownedPath`);
    if (ownedPath.disposition !== "owned" && ownedPath.disposition !== "transferred") {
      throw new Error(`wrong path disposition: ${card.id}`);
    }
    assertCanonicalPath(ownedPath.path, `${card.id}.ownedPath.path`);
  }
}

function commandTestPaths(card) {
  return card.ownedPaths
    .map((ownedPath) => ownedPath.path)
    .filter((path) => /^packages\/(?:agent|local-runtime|ontology)\/test\/.+\.test\.ts$/.test(path));
}

function commandArgs(command) {
  const prefix = "npm test -- ";
  if (!command.startsWith(prefix)) {
    throw new Error("invalid exact targeted Vitest command");
  }
  const args = command.slice(prefix.length).split(" ");
  if (args.length === 0 || args.some((arg) => arg.length === 0 || arg.startsWith("-"))) {
    throw new Error("invalid exact targeted Vitest command");
  }
  return args;
}

function assuranceFingerprint(contract) {
  const cards = contract.releaseGraph.cards.map((card) => ({
    id: card.id,
    prerequisiteIds: card.prerequisiteIds,
    ownedPaths: card.ownedPaths,
    transferToIds: card.transferToIds,
    command: card.command
  }));
  return createHash("sha256").update(JSON.stringify({
    releaseGraph: {
      version: contract.releaseGraph.version,
      cards
    },
    releaseCompatibility: contract.releaseCompatibility
  })).digest("hex");
}

function assertExactStrings(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(label);
  }
}

function transferredPaths(card) {
  return card.ownedPaths
    .filter((ownedPath) => ownedPath.disposition === "transferred")
    .map((ownedPath) => ownedPath.path);
}

function validateTransferredPathGroup(source, target, paths, label) {
  if (!target || !target.prerequisiteIds.includes(source.id)) {
    throw new Error(`invalid reviewed transfer: ${label}`);
  }
  for (const path of paths) {
    const sourcePath = source.ownedPaths.find((ownedPath) => ownedPath.path === path);
    const targetPath = target.ownedPaths.find((ownedPath) => ownedPath.path === path);
    if (!sourcePath || sourcePath.disposition !== "transferred" || !targetPath) {
      throw new Error(`invalid reviewed transfer path: ${label}:${path}`);
    }
  }
}

function validateTask137ATransfer(graph) {
  const source = graph.get("Task137A");
  const task129Mfa = graph.get("Task129-MFA");
  const task137b = graph.get("Task137B-W");
  if (!source) throw new Error("Task137A transfer source");
  assertExactStrings(source.transferToIds, ["Task129-MFA", "Task137B-W"], "Task137A transfer targets");
  assertExactStrings(transferredPaths(source), [
    task137aToTask137bPaths[0],
    task137aToTask129MfaPaths[0],
    task137aToTask137bPaths[1],
    ...task137aToTask129MfaPaths.slice(1)
  ], "Task137A transferred paths");
  validateTransferredPathGroup(source, task129Mfa, task137aToTask129MfaPaths, "Task137A:Task129-MFA");
  validateTransferredPathGroup(source, task137b, task137aToTask137bPaths, "Task137A:Task137B-W");
}

function validateTask129MfaTransfer(graph) {
  const source = graph.get("Task129-MFA");
  const task137b = graph.get("Task137B-W");
  const cf1Hr = graph.get("CF1-HR");
  if (!source) throw new Error("Task129-MFA transfer source");
  assertExactStrings(source.transferToIds, ["Task137B-W", "CF1-HR"], "Task129-MFA transfer targets");
  assertExactStrings(source.transferToIds.slice(0, 1), ["Task137B-W"], "Task129-MFA Task137B-W target");
  assertExactStrings(transferredPaths(source), [
    task129MfaToTask137bPaths[0],
    ...task129MfaToCf1Paths,
    ...task129MfaToTask137bPaths.slice(1)
  ], "Task129-MFA transferred paths");
  validateTransferredPathGroup(source, task137b, task129MfaToTask137bPaths, "Task129-MFA:Task137B-W");
  validateTransferredPathGroup(source, cf1Hr, task129MfaToCf1Paths, "Task129-MFA:CF1-HR");
}

function validateTask135BTransfer(graph) {
  const source = graph.get("Task135B");
  const cf1Hr = graph.get("CF1-HR");
  if (!source) throw new Error("Task135B transfer source");
  assertExactStrings(source.transferToIds, ["CF1-HR"], "Task135B transfer targets");
  assertExactStrings(transferredPaths(source), task135bToCf1Paths, "Task135B transferred paths");
  validateTransferredPathGroup(source, cf1Hr, task135bToCf1Paths, "Task135B:CF1-HR");
}

function validateTask137bCeiling(graph) {
  const card = graph.get("Task137B-W");
  const cf1Hr = graph.get("CF1-HR");
  const task139Pm = graph.get("Task139-PM");
  if (!card || !cf1Hr || !task139Pm) throw new Error("Task137B-W card");
  assertExactStrings(card.prerequisiteIds, ["Task135B", "T120-R", "Task137A", "Task129-MFA"], "Task137B-W prerequisites");
  if (
    card.ownedPaths.some((ownedPath) =>
      ![...task137bToCf1Paths, ...task137bToTask139PmPaths].includes(ownedPath.path) && ownedPath.disposition !== "owned"
    ) ||
    card.ownedPaths.some((ownedPath) =>
      [...task137bToCf1Paths, ...task137bToTask139PmPaths].includes(ownedPath.path) && ownedPath.disposition !== "transferred"
    ) ||
    JSON.stringify(card.ownedPaths.map((ownedPath) => ownedPath.path)) !== JSON.stringify(task137bOwnedPaths)
  ) {
    throw new Error("Task137B-W owned paths");
  }
  assertExactStrings(card.transferToIds, ["CF1-HR", "Task139-PM"], "Task137B-W transfer targets");
  validateTransferredPathGroup(card, cf1Hr, task137bToCf1Paths, "Task137B-W:CF1-HR");
  validateTransferredPathGroup(card, task139Pm, task137bToTask139PmPaths, "Task137B-W:Task139-PM");
  if (card.command !== task137bCommand) {
    throw new Error("Task137B-W command");
  }
}

function validateTask139PmScope(graph) {
  const card = graph.get("Task139-PM");
  if (!card) throw new Error("Task139-PM card");
  assertExactStrings(card.prerequisiteIds, [
    "Task126-R",
    "Task139-P1",
    "Task135D",
    "Task137A",
    "T120-R",
    "Task137B-W"
  ], "Task139-PM prerequisites");
  if (
    card.ownedPaths.some((ownedPath) => ownedPath.disposition !== "owned") ||
    JSON.stringify(card.ownedPaths.map((ownedPath) => ownedPath.path)) !== JSON.stringify(task139PmOwnedPaths) ||
    card.command !== task139PmCommand
  ) {
    throw new Error("Task139-PM scope");
  }
}

function validateCorrectedCardScopes(graph) {
  const cf1Hr = graph.get("CF1-HR");
  const task122 = graph.get("Task122");
  const w1Bootstrap = graph.get("W1-123-BOOTSTRAP-HANDOFF");
  const g136Sc = graph.get("G136-SC");
  if (!cf1Hr || !task122 || !w1Bootstrap || !g136Sc) throw new Error("corrected card missing");
  assertExactStrings(cf1Hr.prerequisiteIds, [
    "W1-123-H-SHARED-SCHEMA",
    "W1-133.5-PREAPPROVAL-PROMPT-STORE",
    "Task137B-W",
    "Task135B",
    "Task129-MFA"
  ], "CF1-HR prerequisites");
  if (
    cf1Hr.ownedPaths.some((ownedPath) =>
      ownedPath.disposition !== ([...cf1HrToTask122Paths, ...cf1HrToW1BootstrapPaths].includes(ownedPath.path) ? "transferred" : "owned")
    ) ||
    JSON.stringify(cf1Hr.ownedPaths.map((ownedPath) => ownedPath.path)) !== JSON.stringify(cf1HrOwnedPaths) ||
    cf1Hr.command !== cf1HrCommand
  ) {
    throw new Error("CF1-HR scope");
  }
  assertExactStrings(cf1Hr.transferToIds, ["Task122", "W1-123-BOOTSTRAP-HANDOFF"], "CF1-HR transfer targets");
  validateTransferredPathGroup(cf1Hr, task122, cf1HrToTask122Paths, "CF1-HR:Task122");
  validateTransferredPathGroup(cf1Hr, w1Bootstrap, cf1HrToW1BootstrapPaths, "CF1-HR:W1-123-BOOTSTRAP-HANDOFF");
  if (
    task122.ownedPaths.some((ownedPath) =>
      ownedPath.disposition !== (task122ToW1BootstrapPaths.includes(ownedPath.path) ? "transferred" : "owned")
    ) ||
    JSON.stringify(task122.ownedPaths.map((ownedPath) => ownedPath.path)) !== JSON.stringify(task122OwnedPaths) ||
    task122.command !== task122Command
  ) {
    throw new Error("Task122 scope");
  }
  assertExactStrings(task122.transferToIds, ["W1-123-BOOTSTRAP-HANDOFF"], "Task122 transfer targets");
  validateTransferredPathGroup(task122, w1Bootstrap, task122ToW1BootstrapPaths, "Task122:W1-123-BOOTSTRAP-HANDOFF");
  if (
    JSON.stringify(w1Bootstrap.prerequisiteIds) !== JSON.stringify(["CF1-HR", "Task121", "Task122"]) ||
    w1Bootstrap.ownedPaths.some((ownedPath) => ownedPath.disposition !== "owned") ||
    JSON.stringify(w1Bootstrap.ownedPaths.map((ownedPath) => ownedPath.path)) !== JSON.stringify(w1BootstrapOwnedPaths) ||
    w1Bootstrap.transferToIds.length !== 0 ||
    w1Bootstrap.command !== w1BootstrapCommand
  ) {
    throw new Error("W1-123-BOOTSTRAP-HANDOFF scope");
  }
  if (
    g136Sc.ownedPaths.some((ownedPath, index) => ownedPath.disposition !== (index === g136ScOwnedPaths.length - 1 ? "transferred" : "owned")) ||
    JSON.stringify(g136Sc.ownedPaths.map((ownedPath) => ownedPath.path)) !== JSON.stringify(g136ScOwnedPaths) ||
    g136Sc.command !== g136ScCommand
  ) {
    throw new Error("G136-SC scope");
  }
}

function historicalTargetGroups(cardId) {
  if (cardId === "Task137A") return [{ targetId: "Task137B-W", paths: task137aToTask137bPaths }];
  if (cardId === "Task129-MFA") return [
    { targetId: "Task137B-W", paths: task129MfaToTask137bPaths },
    { targetId: "CF1-HR", paths: task129MfaToCf1Paths }
  ];
  if (cardId === "Task135B") return [{ targetId: "CF1-HR", paths: task135bToCf1Paths }];
  if (cardId === "Task137B-W") return [
    { targetId: "CF1-HR", paths: task137bToCf1Paths },
    { targetId: "Task139-PM", paths: task137bToTask139PmPaths }
  ];
  if (cardId === "CF1-HR") return [
    { targetId: "Task122", paths: cf1HrToTask122Paths },
    { targetId: "W1-123-BOOTSTRAP-HANDOFF", paths: cf1HrToW1BootstrapPaths }
  ];
  if (cardId === "Task122") return [{ targetId: "W1-123-BOOTSTRAP-HANDOFF", paths: task122ToW1BootstrapPaths }];
  throw new Error(`invalid historical transfer source: ${cardId}`);
}

function validateHistoricalCompatibilityBindings(contract, graph) {
  for (const historicalRecord of contract.releaseCompatibility.historicalRecords) {
    const source = graph.get(historicalRecord.cardId);
    if (!source) {
      throw new Error(`invalid historical transfer source: ${historicalRecord.cardId}`);
    }
    const targetGroups = historicalTargetGroups(historicalRecord.cardId);
    const expectedPaths = targetGroups.flatMap((group) => group.paths);
    assertExactStrings(
      historicalRecord.pathDispositions.map((path) => path.path),
      expectedPaths,
      `historical transfer paths: ${historicalRecord.cardId}`
    );
    for (const historicalPath of historicalRecord.pathDispositions) {
      const sourcePath = source.ownedPaths.find((ownedPath) => ownedPath.path === historicalPath.path);
      const targetGroup = targetGroups.find((group) => group.paths.includes(historicalPath.path));
      const targetPath = graph.get(targetGroup?.targetId)?.ownedPaths.find((ownedPath) => ownedPath.path === historicalPath.path);
      if (!sourcePath || sourcePath.disposition !== "transferred") {
        throw new Error(`historical source is not transferred: ${historicalRecord.cardId}:${historicalPath.path}`);
      }
      if (historicalPath.recordDisposition !== "owned") {
        throw new Error(`historical disposition mismatch: ${historicalRecord.cardId}:${historicalPath.path}`);
      }
      if (!targetPath) {
        throw new Error(`historical target does not own path: ${historicalRecord.cardId}:${historicalPath.path}`);
      }
    }
  }
}

function rawReleaseRecordJson(registryText, cardId) {
  const lines = registryText.split(/\r?\n/);
  const heading = `${releaseHeadingPrefix}${cardId}`;
  let rawJson;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index] !== heading) continue;
    if (rawJson !== undefined) {
      throw new Error(`raw release record duplicated: ${cardId}`);
    }
    let jsonIndex = index + 1;
    while (jsonIndex < lines.length && lines[jsonIndex].trim() === "") jsonIndex += 1;
    if (lines[jsonIndex] !== "```json") {
      throw new Error(`raw release record JSON missing: ${cardId}`);
    }
    const jsonLines = [];
    jsonIndex += 1;
    while (jsonIndex < lines.length && lines[jsonIndex] !== "```") {
      jsonLines.push(lines[jsonIndex]);
      jsonIndex += 1;
    }
    if (lines[jsonIndex] !== "```") {
      throw new Error(`raw release record JSON missing: ${cardId}`);
    }
    rawJson = jsonLines.join("\n");
  }
  if (rawJson === undefined) {
    throw new Error(`raw release record missing: ${cardId}`);
  }
  return rawJson;
}

function verifyImmutableInputs(contract) {
  for (const pin of immutableContractPins) {
    const actual = createHash("sha256").update(readFileSync(resolve(process.cwd(), pin.path))).digest("hex");
    if (actual !== pin.sha256) {
      throw new Error(`immutable contract hash drift: ${pin.label}`);
    }
  }
  const registryText = readFileSync(resolve(process.cwd(), contract.authority.registryPath), "utf8");
  for (const pin of rawPrefixPins) {
    const actual = createHash("sha256").update(rawReleaseRecordJson(registryText, pin.cardId)).digest("hex");
    if (actual !== pin.sha256) {
      throw new Error(`raw release record hash drift: ${pin.cardId}`);
    }
  }
}

export function loadContract(path = contractPath) {
  const contract = JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8"));
  assertContractShape(contract);
  return contract;
}

export function verifyStaticGraph(contract = loadContract()) {
  assertContractShape(contract);
  verifyImmutableInputs(contract);
  const cards = contract.releaseGraph.cards;
  const ids = cards.map((card) => card.id);
  if (JSON.stringify(ids) !== JSON.stringify(expectedCardIds)) {
    throw new Error("card order");
  }
  cards.forEach(validateCardShape);

  const graph = new Map(cards.map((card) => [card.id, card]));
  if (graph.size !== cards.length || cards.length !== expectedCardIds.length) {
    throw new Error("exactly 29 unique cards required");
  }
  validateTask137ATransfer(graph);
  validateTask129MfaTransfer(graph);
  validateTask135BTransfer(graph);
  validateTask137bCeiling(graph);
  validateTask139PmScope(graph);
  validateCorrectedCardScopes(graph);

  const finalOwners = new Map();
  for (let index = 0; index < cards.length; index += 1) {
    const card = cards[index];
    for (const prerequisiteId of card.prerequisiteIds) {
      const prerequisiteIndex = ids.indexOf(prerequisiteId);
      if (prerequisiteIndex < 0 || prerequisiteIndex >= index) {
        throw new Error(`non-topological prerequisite: ${card.id}:${prerequisiteId}`);
      }
    }
    if (card.id !== "Task137A" && card.id !== "Task129-MFA" && card.id !== "Task137B-W" && card.id !== "CF1-HR") {
      const transferred = card.ownedPaths.filter((ownedPath) => ownedPath.disposition === "transferred");
      if (transferred.length > 0 && card.transferToIds.length !== 1) {
        throw new Error(`undeclared transfer: ${card.id}`);
      }
      if (transferred.length === 0 && card.transferToIds.length !== 0) {
        throw new Error(`empty transfer: ${card.id}`);
      }
      for (const transferToId of card.transferToIds) {
        const transferTarget = graph.get(transferToId);
        if (!transferTarget || !transferTarget.prerequisiteIds.includes(card.id)) {
          throw new Error(`invalid reviewed transfer: ${card.id}:${transferToId}`);
        }
        for (const transferredPath of transferred) {
          const targetCarriesPath = transferTarget.ownedPaths.some((ownedPath) => ownedPath.path === transferredPath.path);
          if (!targetCarriesPath) {
            throw new Error(`invalid reviewed transfer path: ${card.id}:${transferredPath.path}`);
          }
        }
      }
    }
    for (const ownedPath of card.ownedPaths) {
      if (ownedPath.disposition !== "owned") continue;
      const priorOwner = finalOwners.get(ownedPath.path);
      if (priorOwner) {
        throw new Error(`final ownership overlap: ${priorOwner}:${card.id}:${ownedPath.path}`);
      }
      finalOwners.set(ownedPath.path, card.id);
    }
    const args = commandArgs(card.command);
    const intended = commandTestPaths(card);
    if (JSON.stringify(args) !== JSON.stringify(intended)) {
      throw new Error(`invalid exact targeted Vitest command: ${card.id}`);
    }
  }

  const indegrees = new Map(ids.map((id) => [id, 0]));
  const outgoing = new Map(ids.map((id) => [id, []]));
  for (const card of cards) {
    for (const prerequisiteId of card.prerequisiteIds) {
      indegrees.set(card.id, indegrees.get(card.id) + 1);
      outgoing.get(prerequisiteId).push(card.id);
    }
  }
  const queue = ids.filter((id) => indegrees.get(id) === 0);
  const visited = [];
  while (queue.length > 0) {
    const id = queue.shift();
    visited.push(id);
    for (const next of outgoing.get(id)) {
      indegrees.set(next, indegrees.get(next) - 1);
      if (indegrees.get(next) === 0) {
        queue.push(next);
      }
    }
  }
  if (visited.length !== cards.length) {
    throw new Error("cycle in release graph");
  }
  validateHistoricalCompatibilityBindings(contract, graph);
  if (assuranceFingerprint(contract) !== expectedAssuranceFingerprint) {
    throw new Error("assurance fingerprint");
  }

  return {
    records: cards.length,
    ids,
    commands: new Map(cards.map((card) => [card.id, card.command]))
  };
}

function fixtureModules() {
  return [
    {
      id: "resident-loop-types",
      path: "packages/local-runtime/src/resident-loop-types.ts",
      template: "types",
      imports: [],
      exports: ["ResidentLoopPorts", "ResidentLoopCoreRegistration", "ResidentLoopP2Registration"]
    },
    {
      id: "resident-loop-factory",
      path: "packages/local-runtime/src/resident-loop-factory-ports.ts",
      template: "factory",
      imports: [
        {
          from: "./resident-loop-types.js",
          names: ["ResidentLoopPorts", "ResidentLoopCoreRegistration", "ResidentLoopP2Registration"],
          typeOnly: true
        }
      ],
      exports: ["createResidentLoopPorts", "createResidentLoopCore"]
    },
    {
      id: "resident-loop-provider",
      path: "packages/local-runtime/src/resident-loop-provider-posture.ts",
      template: "adapter",
      imports: [
        {
          from: "./resident-loop-types.js",
          names: ["ResidentLoopP2Registration"],
          typeOnly: true
        },
        {
          from: "./resident-loop-factory-ports.js",
          names: ["createResidentLoopCore"],
          typeOnly: false
        }
      ],
      exports: ["bindCurrentCoreProviderForP2", "registerResidentLoopP2"]
    },
    {
      id: "resident-loop-registry",
      path: "packages/local-runtime/src/resident-loop-registry.ts",
      template: "registry",
      imports: [
        {
          from: "./resident-loop-types.js",
          names: ["ResidentLoopCoreRegistration"],
          typeOnly: true
        }
      ],
      exports: ["registerResidentLoopCore"]
    },
    {
      id: "resident-loop-composition",
      path: "packages/local-runtime/src/resident-loop-composition.ts",
      template: "composition",
      imports: [
        {
          from: "./resident-loop-factory-ports.js",
          names: ["createResidentLoopPorts"],
          typeOnly: false
        },
        {
          from: "./resident-loop-provider-posture.js",
          names: ["bindCurrentCoreProviderForP2"],
          typeOnly: false
        },
        {
          from: "./resident-loop-types.js",
          names: ["ResidentLoopPorts"],
          typeOnly: true
        }
      ],
      exports: ["createBoundedAgentLoopComposition"]
    }
  ];
}

function importNameKind(name) {
  return /^[A-Z]/.test(name) ? "type" : "value";
}

function moduleSpecifier(module) {
  return `./${module.path.split("/").at(-1).replace(/\.ts$/, ".js")}`;
}

function validateFixtureModules(modules, contract) {
  assertArray(modules, "fixture modules");
  const templates = new Set(contract.compositionGrammar.templates);
  const bySpecifier = new Map();
  for (const module of modules) {
    assertExactKeys(module, ["exports", "id", "imports", "path", "template"], `fixture ${module.id ?? "unknown"}`);
    assertString(module.id, "fixture id");
    assertCanonicalPath(module.path, `${module.id}.path`);
    if (!module.path.endsWith(".ts")) {
      throw new Error("noncanonical module path");
    }
    if (!templates.has(module.template)) {
      throw new Error("unsupported template");
    }
    assertArray(module.imports, `${module.id}.imports`);
    assertArray(module.exports, `${module.id}.exports`);
    const allowedExports = new Set(templateExports[module.template]);
    for (const exportedName of module.exports) {
      if (!allowedExports.has(exportedName)) {
        throw new Error("extra export");
      }
    }
    for (const requiredExport of allowedExports) {
      if (!module.exports.includes(requiredExport)) {
        throw new Error("missing export");
      }
    }
    bySpecifier.set(moduleSpecifier(module), module);
  }

  for (const module of modules) {
    for (const importEntry of module.imports) {
      assertExactKeys(importEntry, ["from", "names", "typeOnly"], `${module.id}.import`);
      if (!importEntry.from.startsWith("./") || !importEntry.from.endsWith(".js")) {
        throw new Error("unknown import");
      }
      const importedModule = bySpecifier.get(importEntry.from);
      if (!importedModule) {
        throw new Error("unknown import");
      }
      assertArray(importEntry.names, `${module.id}.import.names`);
      for (const importedName of importEntry.names) {
        if (!importedModule.exports.includes(importedName)) {
          throw new Error("unknown import");
        }
        const expectedTypeOnly = importNameKind(importedName) === "type";
        if (importEntry.typeOnly !== expectedTypeOnly) {
          throw new Error("wrong import kind");
        }
      }
    }
  }
}

function expectReject(category, mutation, validator) {
  const input = mutation();
  try {
    validator(input);
  } catch {
    return category;
  }
  throw new Error(`mutation unexpectedly accepted: ${category}`);
}

export function runCompositionCorpus(contract = loadContract()) {
  verifyStaticGraph(contract);
  validateFixtureModules(fixtureModules(), contract);
  const rejected = [];

  for (const category of rejectedCompositionIds) {
    if (category === "unknown-node") {
      rejected.push(expectReject(category, () => {
        const mutant = clone(contract);
        mutant.releaseGraph.cards.push({
          ...clone(mutant.releaseGraph.cards[0]),
          id: "Task999"
        });
        return mutant;
      }, verifyStaticGraph));
    } else if (category === "duplicate-node") {
      rejected.push(expectReject(category, () => {
        const mutant = clone(contract);
        mutant.releaseGraph.cards[1] = clone(mutant.releaseGraph.cards[0]);
        return mutant;
      }, verifyStaticGraph));
    } else if (category === "reordered-node") {
      rejected.push(expectReject(category, () => {
        const mutant = clone(contract);
        [mutant.releaseGraph.cards[0], mutant.releaseGraph.cards[1]] = [mutant.releaseGraph.cards[1], mutant.releaseGraph.cards[0]];
        return mutant;
      }, verifyStaticGraph));
    } else if (category === "missing-prerequisite") {
      rejected.push(expectReject(category, () => {
        const mutant = clone(contract);
        mutant.releaseGraph.cards.find((card) => card.id === "Task137A").prerequisiteIds = [];
        return mutant;
      }, verifyStaticGraph));
    } else if (category === "dependency-inversion") {
      rejected.push(expectReject(category, () => {
        const mutant = clone(contract);
        mutant.releaseGraph.cards.find((card) => card.id === "Task126").prerequisiteIds = ["Task136"];
        return mutant;
      }, verifyStaticGraph));
    } else if (category === "undeclared-transfer") {
      rejected.push(expectReject(category, () => {
        const mutant = clone(contract);
        mutant.releaseGraph.cards.find((card) => card.id === "Task135D").transferToIds = [];
        return mutant;
      }, verifyStaticGraph));
    } else if (category === "overlapping-final-owner") {
      rejected.push(expectReject(category, () => {
        const mutant = clone(contract);
        mutant.releaseGraph.cards
          .find((card) => card.id === "Task126")
          .ownedPaths.find((ownedPath) => ownedPath.path === "packages/agent/src/byok-provider.ts").disposition = "owned";
        return mutant;
      }, verifyStaticGraph));
    } else if (category === "missing-owned-path") {
      rejected.push(expectReject(category, () => {
        const mutant = clone(contract);
        mutant.releaseGraph.cards.find((card) => card.id === "Task136").ownedPaths.pop();
        return mutant;
      }, verifyStaticGraph));
    } else if (category === "extra-owned-path") {
      rejected.push(expectReject(category, () => {
        const mutant = clone(contract);
        mutant.releaseGraph.cards.find((card) => card.id === "Task136").ownedPaths.push({
          disposition: "owned",
          path: "packages/agent/test/unowned-task136-extra.test.ts"
        });
        return mutant;
      }, verifyStaticGraph));
    } else if (category === "wrong-path-disposition") {
      rejected.push(expectReject(category, () => {
        const mutant = clone(contract);
        mutant.releaseGraph.cards
          .find((card) => card.id === "Task135D")
          .ownedPaths.find((ownedPath) => ownedPath.path.endsWith("runtime-handle-mounted-authority-imports.test.ts")).disposition = "owned";
        return mutant;
      }, verifyStaticGraph));
    } else if (category === "noncanonical-module-path") {
      rejected.push(expectReject(category, () => {
        const mutant = fixtureModules();
        mutant[0].path = "../resident-loop-types.ts";
        return mutant;
      }, (mutant) => validateFixtureModules(mutant, contract)));
    } else if (category === "unsupported-template") {
      rejected.push(expectReject(category, () => {
        const mutant = fixtureModules();
        mutant[0].template = "unsupported";
        return mutant;
      }, (mutant) => validateFixtureModules(mutant, contract)));
    } else if (category === "unknown-import") {
      rejected.push(expectReject(category, () => {
        const mutant = fixtureModules();
        mutant[1].imports[0].from = "./missing.js";
        return mutant;
      }, (mutant) => validateFixtureModules(mutant, contract)));
    } else if (category === "wrong-import-kind") {
      rejected.push(expectReject(category, () => {
        const mutant = fixtureModules();
        mutant[1].imports[0].typeOnly = false;
        return mutant;
      }, (mutant) => validateFixtureModules(mutant, contract)));
    } else if (category === "missing-export") {
      rejected.push(expectReject(category, () => {
        const mutant = fixtureModules();
        mutant[0].exports.pop();
        return mutant;
      }, (mutant) => validateFixtureModules(mutant, contract)));
    } else if (category === "extra-export") {
      rejected.push(expectReject(category, () => {
        const mutant = fixtureModules();
        mutant[0].exports.push("ExtraExport");
        return mutant;
      }, (mutant) => validateFixtureModules(mutant, contract)));
    } else if (category === "default-import") {
      rejected.push(expectReject(category, () => {
        const mutant = fixtureModules();
        mutant[1].imports[0].defaultImport = "DefaultImport";
        return mutant;
      }, (mutant) => validateFixtureModules(mutant, contract)));
    } else if (category === "namespace-import") {
      rejected.push(expectReject(category, () => {
        const mutant = fixtureModules();
        mutant[1].imports[0].namespaceImport = "Types";
        return mutant;
      }, (mutant) => validateFixtureModules(mutant, contract)));
    } else if (category === "dynamic-commonjs-loader") {
      rejected.push(expectReject(category, () => {
        const mutant = fixtureModules();
        mutant[1].imports[0].loader = "dynamic-import";
        return mutant;
      }, (mutant) => validateFixtureModules(mutant, contract)));
    } else if (category === "fixture-source-outside-generator") {
      rejected.push(expectReject(category, () => {
        const mutant = fixtureModules();
        mutant[1].source = "export const callerSupplied = true;";
        return mutant;
      }, (mutant) => validateFixtureModules(mutant, contract)));
    }
  }

  if (JSON.stringify(rejected) !== JSON.stringify(rejectedCompositionIds)) {
    throw new Error("composition corpus category drift");
  }
  return { green: 1, red: rejected.length, rejectedCategoryIds: rejected };
}

export function verifyCommandCards(contract = loadContract()) {
  const graph = verifyStaticGraph(contract);
  return {
    cards: graph.records,
    commands: graph.commands
  };
}

function abiFixture() {
  return {
    loopPortMethods: ["readPlan", "readObservation", "readToolStep", "readCheckpoint", "readResult"],
    checkpointFields: ["taskId", "attemptId", "runId", "activeLocksHash", "sourceEventIds", "contextPackId"],
    mountedAuthorityMethods: ["suspendAndRelease", "reclaimAndReverify"],
    handoffFields: ["manifestSchemaVersion", "finalOutputStepId", "diagnostics", "recordedEventId"],
    sourceContextGuard: true,
    publicRuntimeMint: false,
    callerRuntimeGrant: false,
    externalGovernedInputMint: false,
    forwardingForms: [],
    loaderForms: []
  };
}

function validateAbiFixture(fixture) {
  const requiredLoopMethods = ["readPlan", "readObservation", "readToolStep", "readCheckpoint", "readResult"];
  const requiredCheckpointFields = ["taskId", "attemptId", "runId", "activeLocksHash", "sourceEventIds", "contextPackId"];
  const requiredMountedMethods = ["suspendAndRelease", "reclaimAndReverify"];
  const requiredHandoffFields = ["manifestSchemaVersion", "finalOutputStepId", "diagnostics", "recordedEventId"];
  for (const method of requiredLoopMethods) {
    if (!fixture.loopPortMethods.includes(method)) throw new Error("missing loop port");
  }
  for (const field of requiredCheckpointFields) {
    if (!fixture.checkpointFields.includes(field)) throw new Error("narrowed checkpoint readback");
  }
  for (const method of requiredMountedMethods) {
    if (!fixture.mountedAuthorityMethods.includes(method)) throw new Error("missing mounted authority port");
  }
  for (const field of requiredHandoffFields) {
    if (!fixture.handoffFields.includes(field)) throw new Error("missing handoff readback");
  }
  if (fixture.publicRuntimeMint) throw new Error("public runtime mint");
  if (fixture.callerRuntimeGrant) throw new Error("caller supplied runtime grant");
  if (fixture.externalGovernedInputMint) throw new Error("external governed input mint");
  if (fixture.forwardingForms.length > 0) throw new Error(`protected forwarding: ${fixture.forwardingForms.join(",")}`);
  if (fixture.loaderForms.length > 0) throw new Error(`protected loader: ${fixture.loaderForms.join(",")}`);
  if (fixture.sourceContextGuard !== true) throw new Error("cached source context");
}

export function runAbiCorpus() {
  validateAbiFixture(abiFixture());
  const rejected = [];
  for (const category of rejectedAbiIds) {
    rejected.push(expectReject(category, () => {
      const mutant = abiFixture();
      if (category === "missing-loop-port") mutant.loopPortMethods = mutant.loopPortMethods.filter((method) => method !== "readResult");
      else if (category === "narrowed-checkpoint-readback") mutant.checkpointFields = mutant.checkpointFields.filter((field) => field !== "activeLocksHash");
      else if (category === "missing-mounted-authority-port") mutant.mountedAuthorityMethods = mutant.mountedAuthorityMethods.filter((method) => method !== "reclaimAndReverify");
      else if (category === "public-runtime-mint") mutant.publicRuntimeMint = true;
      else if (category === "caller-supplied-runtime-grant") mutant.callerRuntimeGrant = true;
      else if (category === "external-governed-input-mint") mutant.externalGovernedInputMint = true;
      else if (category === "direct-named-re-export") mutant.forwardingForms.push("direct named re-export");
      else if (category === "import-then-export-alias") mutant.forwardingForms.push("import-then-export alias");
      else if (category === "export-star-forwarding") mutant.forwardingForms.push("export-star forwarding");
      else if (category === "namespace-forwarding") mutant.forwardingForms.push("namespace forwarding");
      else if (category === "commonjs-require-loader") mutant.loaderForms.push("commonjs require");
      else if (category === "dynamic-import-loader") mutant.loaderForms.push("dynamic import");
      else if (category === "module-require-loader") mutant.loaderForms.push("module.require");
      else if (category === "missing-handoff-readback") mutant.handoffFields = mutant.handoffFields.filter((field) => field !== "diagnostics");
      else if (category === "cached-source-context") mutant.sourceContextGuard = false;
      return mutant;
    }, validateAbiFixture));
  }
  return { green: 1, red: rejected.length, rejectedCategoryIds: rejected };
}

function releaseEventIdFor(cardId) {
  return `task136-release-v4-${cardId}`;
}

function validateReleaseReview(review, record, index) {
  assertExactOrderedKeys(review, releaseReviewKeys, `release review ${record.cardId}.${index}`);
  assertThreadId(review.threadId, `review threadId: ${record.cardId}`);
  assertFullSha(review.candidateSha, `review candidateSha: ${record.cardId}`);
  if (review.candidateSha !== record.candidateSha) {
    throw new Error(`review candidate mismatch: ${record.cardId}`);
  }
  if (review.verdict !== "APPROVED") {
    throw new Error(`review verdict must be APPROVED: ${record.cardId}`);
  }
}

function validateReleasePrerequisites(record, card, recordsById) {
  assertArray(record.prerequisites, `${record.cardId}.prerequisites`);
  if (record.prerequisites.length !== card.prerequisiteIds.length) {
    throw new Error(`prerequisite ID mismatch: ${record.cardId}`);
  }
  for (let index = 0; index < card.prerequisiteIds.length; index += 1) {
    const expectedId = card.prerequisiteIds[index];
    const prerequisite = record.prerequisites[index];
    assertExactOrderedKeys(prerequisite, releasePrerequisiteKeys, `release prerequisite ${record.cardId}.${index}`);
    if (prerequisite.cardId !== expectedId) {
      throw new Error(`prerequisite ID mismatch: ${record.cardId}`);
    }
    const previousRecord = recordsById.get(expectedId);
    if (!previousRecord) {
      throw new Error(`prerequisite record missing before consumer: ${record.cardId}:${expectedId}`);
    }
    if (
      prerequisite.integrationSha !== previousRecord.integrationSha ||
      prerequisite.releaseEventId !== previousRecord.releaseEventId
    ) {
      throw new Error(`prerequisite release mismatch: ${record.cardId}:${expectedId}`);
    }
  }
}

function historicalCompatibilityFor(contract, cardId) {
  return contract.releaseCompatibility.historicalRecords.find((record) => record.cardId === cardId);
}

function validateHistoricalRecordHash(contract, record) {
  const historicalRecord = historicalCompatibilityFor(contract, record.cardId);
  if (!historicalRecord) return;
  const actualHash = createHash("sha256").update(JSON.stringify(record), "utf8").digest("hex");
  if (actualHash !== historicalRecord.canonicalJsonSha256) {
    throw new Error(`historical record canonical hash mismatch: ${record.cardId}`);
  }
}

function expectedReleaseDisposition(contract, card, staticPath) {
  const historicalRecord = historicalCompatibilityFor(contract, card.id);
  const historicalPath = historicalRecord?.pathDispositions.find((path) => path.path === staticPath.path);
  return historicalPath ? historicalPath.recordDisposition : staticPath.disposition;
}

function validateReleaseOwnedPaths(contract, record, card) {
  assertArray(record.ownedPathBlobs, `${record.cardId}.ownedPathBlobs`);
  const entriesByPath = new Map();
  for (const entry of record.ownedPathBlobs) {
    assertExactOrderedKeys(entry, releaseOwnedPathKeys, `release ownedPath ${record.cardId}`);
    assertCanonicalPath(entry.path, `owned path: ${record.cardId}`);
    if (entriesByPath.has(entry.path)) {
      throw new Error(`duplicate path: ${record.cardId}:${entry.path}`);
    }
    entriesByPath.set(entry.path, entry);
    if (entry.disposition !== "owned" && entry.disposition !== "transferred") {
      throw new Error(`path disposition mismatch: ${record.cardId}:${entry.path}`);
    }
    assertFullSha(entry.blobSha, `blobSha: ${record.cardId}:${entry.path}`);
  }
  for (const staticPath of card.ownedPaths) {
    const entry = entriesByPath.get(staticPath.path);
    if (!entry) {
      throw new Error(`missing path: ${record.cardId}:${staticPath.path}`);
    }
  }
  for (const entry of record.ownedPathBlobs) {
    if (!card.ownedPaths.some((staticPath) => staticPath.path === entry.path)) {
      throw new Error(`extra path: ${record.cardId}:${entry.path}`);
    }
  }
  for (let index = 0; index < card.ownedPaths.length; index += 1) {
    const staticPath = card.ownedPaths[index];
    const entry = record.ownedPathBlobs[index];
    if (entry.path !== staticPath.path) {
      throw new Error(`path order drift: ${record.cardId}:${staticPath.path}`);
    }
    if (entry.disposition !== expectedReleaseDisposition(contract, card, staticPath)) {
      throw new Error(`path disposition mismatch: ${record.cardId}:${entry.path}`);
    }
  }
}

function validateReleaseRecord(contract, record, card, recordsById) {
  assertExactOrderedKeys(record, releaseRecordKeys, `release record keys: ${card.id}`);
  if (record.schemaVersion !== releaseRecordSchemaVersion) {
    throw new Error(`release record schema mismatch: ${card.id}`);
  }
  if (record.cardId !== card.id) {
    throw new Error(`release record card mismatch: expected ${card.id}, found ${record.cardId}`);
  }
  assertFullSha(record.candidateSha, `candidateSha: ${card.id}`);
  assertFullSha(record.integrationSha, `integrationSha: ${card.id}`);
  if (record.releaseEventId !== releaseEventIdFor(card.id)) {
    throw new Error(`release event mismatch: ${card.id}`);
  }
  assertArray(record.reviews, `${card.id}.reviews`);
  if (record.reviews.length !== 2) {
    throw new Error(`release reviews count: ${card.id}`);
  }
  const reviewThreadIds = new Set();
  for (let index = 0; index < record.reviews.length; index += 1) {
    const review = record.reviews[index];
    validateReleaseReview(review, record, index);
    if (reviewThreadIds.has(review.threadId)) {
      throw new Error(`duplicate review thread: ${card.id}`);
    }
    reviewThreadIds.add(review.threadId);
  }
  validateReleasePrerequisites(record, card, recordsById);
  validateHistoricalRecordHash(contract, record);
  validateReleaseOwnedPaths(contract, record, card);
}

function extractJsonBlock(lines, startIndex, cardId) {
  let index = startIndex + 1;
  while (index < lines.length && lines[index].trim() === "") {
    index += 1;
  }
  if (lines[index] !== "```json") {
    throw new Error(`release record JSON missing for ${cardId}`);
  }
  const jsonLines = [];
  index += 1;
  while (index < lines.length && lines[index] !== "```") {
    jsonLines.push(lines[index]);
    index += 1;
  }
  if (lines[index] !== "```") {
    throw new Error(`release record JSON missing for ${cardId}`);
  }
  try {
    return {
      record: JSON.parse(jsonLines.join("\n")),
      nextIndex: index + 1
    };
  } catch {
    throw new Error(`release record JSON malformed for ${cardId}`);
  }
}

export function parseTask136ReleasePrefix(registryText, contract = loadContract()) {
  assertString(registryText, "registryText");
  const graph = verifyStaticGraph(contract);
  const cardsById = new Map(contract.releaseGraph.cards.map((card) => [card.id, card]));
  const lines = registryText.split(/\r?\n/);
  const records = [];
  const recordsById = new Map();
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.startsWith(releaseHeadingPrefix)) continue;
    const headingCardId = line.slice(releaseHeadingPrefix.length).trim();
    if (!cardsById.has(headingCardId)) {
      throw new Error(`unknown release record: ${headingCardId}`);
    }
    if (recordsById.has(headingCardId)) {
      throw new Error(`duplicate release record: ${headingCardId}`);
    }
    const expectedCardId = graph.ids[records.length];
    if (headingCardId !== expectedCardId) {
      throw new Error(`release record order drift: expected ${expectedCardId}, found ${headingCardId}`);
    }
    const { record, nextIndex } = extractJsonBlock(lines, index, headingCardId);
    validateReleaseRecord(contract, record, cardsById.get(headingCardId), recordsById);
    records.push(record);
    recordsById.set(record.cardId, record);
    index = nextIndex - 1;
  }
  return records;
}

export function parseTask136ReleaseRecords(registryText, contract = loadContract()) {
  const records = parseTask136ReleasePrefix(registryText, contract);
  if (records.length !== expectedCardIds.length) {
    throw new Error(`repository release closure incomplete: expected 29 records, found ${records.length}`);
  }
  return records;
}

function assertBlob(adapter, commitish, path, expectedBlobSha, cardId) {
  const objectType = adapter.objectType(commitish, path);
  if (objectType !== "blob") {
    throw new Error(`path is not a Git blob: ${cardId}:${path}`);
  }
  const actualBlobSha = adapter.blobSha(commitish, path);
  if (actualBlobSha !== expectedBlobSha) {
    throw new Error(`blob mismatch: ${cardId}:${path}`);
  }
}

function currentHeadMigrationTarget(cardId, path) {
  if (cardId === "Task137A" && task137aToTask137bPaths.includes(path)) return "Task137B-W";
  if (cardId === "Task129-MFA" && task129MfaToTask137bPaths.includes(path)) return "Task137B-W";
  if (cardId === "Task129-MFA" && task129MfaToCf1Paths.includes(path)) return "CF1-HR";
  if (cardId === "Task135B" && task135bToCf1Paths.includes(path)) return "CF1-HR";
  if (cardId === "Task137B-W" && task137bToCf1Paths.includes(path)) return "CF1-HR";
  if (cardId === "Task137B-W" && task137bToTask139PmPaths.includes(path)) return "Task139-PM";
  if (cardId === "CF1-HR" && cf1HrToTask122Paths.includes(path)) return "Task122";
  if (cardId === "CF1-HR" && cf1HrToW1BootstrapPaths.includes(path)) return "W1-123-BOOTSTRAP-HANDOFF";
  if (cardId === "Task122" && task122ToW1BootstrapPaths.includes(path)) return "W1-123-BOOTSTRAP-HANDOFF";
  return undefined;
}

function verifyGitReleaseEvidence(contract, records, adapter) {
  const recordsById = new Map(records.map((record) => [record.cardId, record]));
  for (const record of records) {
    if (!adapter.commitExists(record.candidateSha)) {
      throw new Error(`candidate commit missing: ${record.cardId}`);
    }
    if (!adapter.commitExists(record.integrationSha)) {
      throw new Error(`integration commit missing: ${record.cardId}`);
    }
    if (!adapter.isAncestor(record.integrationSha, adapter.currentHead())) {
      throw new Error(`integration is not an ancestor of HEAD: ${record.cardId}`);
    }
  }

  const cardsById = new Map(contract.releaseGraph.cards.map((card) => [card.id, card]));
  for (const record of records) {
    const card = cardsById.get(record.cardId);
    for (const prerequisiteId of card.prerequisiteIds) {
      const prerequisite = recordsById.get(prerequisiteId);
      if (!adapter.isAncestor(prerequisite.integrationSha, record.candidateSha)) {
        throw new Error(`prerequisite integration is not an ancestor of candidate: ${card.id}:${prerequisiteId}`);
      }
    }

    const recordPathsByPath = new Map(record.ownedPathBlobs.map((entry) => [entry.path, entry]));
    for (const staticPath of card.ownedPaths) {
      const pathRecord = recordPathsByPath.get(staticPath.path);
      assertBlob(adapter, record.candidateSha, staticPath.path, pathRecord.blobSha, card.id);
      assertBlob(adapter, record.integrationSha, staticPath.path, pathRecord.blobSha, card.id);
      const migrationTarget = currentHeadMigrationTarget(record.cardId, staticPath.path);
      if (staticPath.disposition === "owned" || (migrationTarget && !recordsById.has(migrationTarget))) {
        assertBlob(adapter, adapter.currentHead(), staticPath.path, pathRecord.blobSha, card.id);
      }
    }
  }
}

function checkRepositoryTopology(adapter) {
  if (!adapter.isCheckoutClean()) {
    throw new Error("repository checkout is dirty");
  }
  if (adapter.isDependencySymlink()) {
    throw new Error("dependency directory is a symlink");
  }
}

export function verifyTask136ReleasePrefix(contract, { registryText, adapter = createRepositoryAdapter() } = {}) {
  const graph = verifyStaticGraph(contract);
  checkRepositoryTopology(adapter);
  const records = parseTask136ReleasePrefix(registryText, contract);
  verifyGitReleaseEvidence(contract, records, adapter);

  let commandCount = 0;
  for (const record of records) {
    const card = contract.releaseGraph.cards.find((candidate) => candidate.id === record.cardId);
    const args = commandArgs(card.command);
    try {
      adapter.runNpmTest(args, card);
      commandCount += 1;
    } catch {
      throw new Error(`release command failed: ${card.id}`);
    }
  }
  checkRepositoryTopology(adapter);
  return { records: records.length, commands: commandCount, ids: records.map((record) => record.cardId), expectedRecords: graph.records };
}

export function verifyTask136ReleaseClosure(contract, options = {}) {
  const closure = verifyTask136ReleasePrefix(contract, options);
  if (closure.records !== closure.expectedRecords) {
    throw new Error(`repository release closure incomplete: expected ${closure.expectedRecords} records, found ${closure.records}`);
  }
  return closure;
}

export function runTask136RepositoryAdmission(contract, {
  registryText,
  adapter = createRepositoryAdapter(),
  emit = (message) => console.log(message)
} = {}) {
  const closure = verifyTask136ReleasePrefix(contract, { registryText, adapter });
  emit(`TASK136_REPOSITORY_PREFIX_OK records=${closure.records} commands=${closure.commands}`);
  if (closure.records !== closure.expectedRecords) {
    throw new Error(`repository release closure incomplete: expected ${closure.expectedRecords} records, found ${closure.records}`);
  }
  emit(`TASK136_REPOSITORY_RELEASE_CLOSURE_OK records=${closure.records} commands=${closure.commands}`);
  return closure;
}

function gitOutput(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function gitSucceeds(args) {
  try {
    execFileSync("git", args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function createRepositoryAdapter() {
  return {
    isCheckoutClean() {
      return gitOutput(["status", "--porcelain", "--untracked-files=all"]) === "";
    },
    isDependencySymlink() {
      const dependencyPath = resolve(process.cwd(), "node_modules");
      return existsSync(dependencyPath) && lstatSync(dependencyPath).isSymbolicLink();
    },
    currentHead() {
      return gitOutput(["rev-parse", "HEAD"]);
    },
    commitExists(commitSha) {
      return gitSucceeds(["cat-file", "-e", `${commitSha}^{commit}`]);
    },
    isAncestor(ancestorSha, descendantSha) {
      return gitSucceeds(["merge-base", "--is-ancestor", ancestorSha, descendantSha]);
    },
    blobSha(commitish, path) {
      return gitOutput(["rev-parse", `${commitish}:${path}`]);
    },
    objectType(commitish, path) {
      return gitOutput(["cat-file", "-t", `${commitish}:${path}`]);
    },
    runNpmTest(args) {
      execFileSync("npm", ["test", "--", ...args], { stdio: ["ignore", "inherit", "inherit"] });
    }
  };
}

function verifyRepositoryReleaseClosure(contract) {
  const registryText = readFileSync(resolve(process.cwd(), contract.authority.registryPath), "utf8");
  runTask136RepositoryAdmission(contract, { registryText });
}

function runContractMode(contract) {
  const graph = verifyStaticGraph(contract);
  const composition = runCompositionCorpus(contract);
  const commandCards = verifyCommandCards(contract);
  const abi = runAbiCorpus();
  console.log(`TASK136_RELEASE_GRAPH_OK records=${graph.records}`);
  console.log(`TASK136_COMPOSITION_CORPUS_OK green=${composition.green} red=${composition.red}`);
  console.log(`TASK136_COMMAND_CARDS_OK cards=${commandCards.cards}`);
  console.log(`TASK136_ABI_CORPUS_OK green=${abi.green} red=${abi.red}`);
}

function cli(argv) {
  const modeIndex = argv.indexOf("--mode");
  const mode = modeIndex >= 0 ? argv[modeIndex + 1] : undefined;
  if (mode !== "contract" && mode !== "repository") {
    throw new Error("usage: task136-bounded-assurance.mjs --mode contract|repository");
  }
  const contract = loadContract();
  runContractMode(contract);
  if (mode === "repository") {
    verifyRepositoryReleaseClosure(contract);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    cli(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
