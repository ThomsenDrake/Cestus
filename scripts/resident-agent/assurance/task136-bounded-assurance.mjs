#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const contractPath = "docs/agentic/contracts/task136-bounded-assurance-v1.json";

const expectedCardIds = Object.freeze([
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
]);

const expectedReleaseGraphHash = "07e5f070a3657694a63d80bcdf3d69be087418a235d77e6875e604d9636ce83f";
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

function assertThreadId(value, label) {
  if (typeof value !== "string" || !codexThreadIdPattern.test(value)) {
    throw new Error(`${label} must be a Codex task id`);
  }
}

function assertContractShape(contract) {
  assertExactKeys(contract, ["authority", "compositionCorpus", "compositionGrammar", "releaseGraph", "schemaVersion"], "contract");
  if (contract.schemaVersion !== "task136-bounded-assurance.v1") {
    throw new Error("schema version");
  }
  assertExactKeys(contract.authority, ["registryPath", "resetEvent"], "authority");
  if (contract.authority.registryPath !== "docs/agentic/resident-agent-full-vision-program-registry.md") {
    throw new Error("authority registry path");
  }
  if (contract.authority.resetEvent !== "RV-1-E-545") {
    throw new Error("authority reset event");
  }
  assertExactKeys(contract.releaseGraph, ["cards", "version"], "releaseGraph");
  if (contract.releaseGraph.version !== "task136-release-graph.v1") {
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

function releaseGraphHash(cards) {
  const projection = cards.map((card) => ({
    id: card.id,
    prerequisiteIds: card.prerequisiteIds,
    ownedPaths: card.ownedPaths,
    transferToIds: card.transferToIds,
    command: card.command
  }));
  return createHash("sha256").update(JSON.stringify(projection)).digest("hex");
}

export function loadContract(path = contractPath) {
  const contract = JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8"));
  assertContractShape(contract);
  return contract;
}

export function verifyStaticGraph(contract = loadContract()) {
  assertContractShape(contract);
  const cards = contract.releaseGraph.cards;
  const ids = cards.map((card) => card.id);
  if (JSON.stringify(ids) !== JSON.stringify(expectedCardIds)) {
    throw new Error("card order");
  }
  cards.forEach(validateCardShape);

  const graph = new Map(cards.map((card) => [card.id, card]));
  if (graph.size !== cards.length || cards.length !== expectedCardIds.length) {
    throw new Error("exactly 28 unique cards required");
  }

  const finalOwners = new Map();
  for (let index = 0; index < cards.length; index += 1) {
    const card = cards[index];
    for (const prerequisiteId of card.prerequisiteIds) {
      const prerequisiteIndex = ids.indexOf(prerequisiteId);
      if (prerequisiteIndex < 0 || prerequisiteIndex >= index) {
        throw new Error(`non-topological prerequisite: ${card.id}:${prerequisiteId}`);
      }
    }
    const transferredPaths = card.ownedPaths.filter((ownedPath) => ownedPath.disposition === "transferred");
    if (transferredPaths.length > 0 && card.transferToIds.length !== 1) {
      throw new Error(`undeclared transfer: ${card.id}`);
    }
    if (transferredPaths.length === 0 && card.transferToIds.length !== 0) {
      throw new Error(`empty transfer: ${card.id}`);
    }
    for (const transferToId of card.transferToIds) {
      const transferTarget = graph.get(transferToId);
      if (!transferTarget || !transferTarget.prerequisiteIds.includes(card.id)) {
        throw new Error(`invalid reviewed transfer: ${card.id}:${transferToId}`);
      }
      for (const transferredPath of transferredPaths) {
        const targetOwnsPath = transferTarget.ownedPaths.some(
          (ownedPath) => ownedPath.disposition === "owned" && ownedPath.path === transferredPath.path
        );
        if (!targetOwnsPath) {
          throw new Error(`invalid reviewed transfer path: ${card.id}:${transferredPath.path}`);
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
  if (releaseGraphHash(cards) !== expectedReleaseGraphHash) {
    throw new Error("release graph fingerprint");
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

function validateReleaseOwnedPaths(record, card) {
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
    if (entry.disposition !== staticPath.disposition) {
      throw new Error(`path disposition mismatch: ${record.cardId}:${entry.path}`);
    }
  }
}

function validateReleaseRecord(record, card, recordsById) {
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
  validateReleaseOwnedPaths(record, card);
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

export function parseTask136ReleaseRecords(registryText, contract = loadContract()) {
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
    validateReleaseRecord(record, cardsById.get(headingCardId), recordsById);
    records.push(record);
    recordsById.set(record.cardId, record);
    index = nextIndex - 1;
  }
  if (records.length !== expectedCardIds.length) {
    throw new Error(`repository release closure incomplete: expected 28 records, found ${records.length}`);
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

  for (const card of contract.releaseGraph.cards) {
    const record = recordsById.get(card.id);
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
      if (staticPath.disposition === "owned") {
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

export function verifyTask136ReleaseClosure(contract, { registryText, adapter = createRepositoryAdapter() } = {}) {
  const graph = verifyStaticGraph(contract);
  checkRepositoryTopology(adapter);
  const records = parseTask136ReleaseRecords(registryText, contract);
  verifyGitReleaseEvidence(contract, records, adapter);

  let commandCount = 0;
  for (const card of contract.releaseGraph.cards) {
    const args = commandArgs(card.command);
    try {
      adapter.runNpmTest(args, card);
      commandCount += 1;
    } catch {
      throw new Error(`release command failed: ${card.id}`);
    }
  }
  checkRepositoryTopology(adapter);
  return { records: records.length, commands: commandCount, ids: graph.ids };
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
      return gitOutput(["status", "--porcelain", "--untracked-files=no"]) === "";
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
  const closure = verifyTask136ReleaseClosure(contract, { registryText });
  console.log(`TASK136_REPOSITORY_RELEASE_CLOSURE_OK records=${closure.records} commands=${closure.commands}`);
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
