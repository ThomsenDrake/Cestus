import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import * as assurance from "./task136-bounded-assurance.mjs";

const {
  loadContract,
  runAbiCorpus,
  runCompositionCorpus,
  verifyCommandCards,
  verifyStaticGraph
} = assurance;

const scriptPath = fileURLToPath(new URL("./task136-bounded-assurance.mjs", import.meta.url));
const releaseSchemaVersion = "task136-dispatch-release.v4";

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

function sha(label) {
  return createHash("sha1").update(label).digest("hex");
}

function codexThreadId(index, reviewIndex) {
  return `019f0000-0000-7000-8000-${String(index * 2 + reviewIndex + 1).padStart(12, "0")}`;
}

function releaseRecordsFor(contract) {
  const records = [];
  for (const [index, card] of contract.releaseGraph.cards.entries()) {
    const candidateSha = sha(`${card.id}:candidate`);
    const integrationSha = sha(`${card.id}:integration`);
    const releaseEventId = `task136-release-v4-${card.id}`;
    records.push({
      schemaVersion: releaseSchemaVersion,
      cardId: card.id,
      candidateSha,
      reviews: [
        {
          threadId: codexThreadId(index, 0),
          candidateSha,
          verdict: "APPROVED"
        },
        {
          threadId: codexThreadId(index, 1),
          candidateSha,
          verdict: "APPROVED"
        }
      ],
      integrationSha,
      releaseEventId,
      prerequisites: card.prerequisiteIds.map((cardId) => {
        const prerequisite = records.find((record) => record.cardId === cardId);
        assert.ok(prerequisite, `fixture prerequisite exists: ${cardId}`);
        return {
          cardId,
          integrationSha: prerequisite.integrationSha,
          releaseEventId: prerequisite.releaseEventId
        };
      }),
      ownedPathBlobs: card.ownedPaths.map((ownedPath) => ({
        path: ownedPath.path,
        disposition: ownedPath.disposition,
        blobSha: sha(`blob:${card.id}:${ownedPath.path}`)
      }))
    });
  }
  return records;
}

function releaseRecordMarkdown(records) {
  return records
    .map((record) => `## Task136 dispatch release v4: ${record.cardId}\n\n\`\`\`json\n${JSON.stringify(record, null, 2)}\n\`\`\``)
    .join("\n\n");
}

function headingOnlyMarkdown(contract) {
  return contract.releaseGraph.cards
    .map((card) => `## Task136 dispatch release v4: ${card.id}`)
    .join("\n\n");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeTempRepository(registryText) {
  const dir = mkdtempSync(join(tmpdir(), "cestus-task136-release-"));
  mkdirSync(join(dir, "docs/agentic/contracts"), { recursive: true });
  mkdirSync(join(dir, "docs/agentic"), { recursive: true });
  writeFileSync(
    join(dir, "docs/agentic/contracts/task136-bounded-assurance-v1.json"),
    JSON.stringify(loadContract(), null, 2)
  );
  writeFileSync(join(dir, "docs/agentic/resident-agent-full-vision-program-registry.md"), registryText);
  execFileSync("git", ["init"], { cwd: dir, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "task136@example.test"], { cwd: dir, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "Task136 Test"], { cwd: dir, stdio: "ignore" });
  execFileSync("git", ["add", "docs"], { cwd: dir, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "fixture"], { cwd: dir, stdio: "ignore" });
  return dir;
}

function runRepositoryModeInTemp(registryText) {
  const dir = makeTempRepository(registryText);
  try {
    return spawnSync(process.execPath, [scriptPath, "--mode", "repository"], {
      cwd: dir,
      encoding: "utf8"
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function parseReleaseRecords(registryText, contract = loadContract()) {
  assert.equal(typeof assurance.parseTask136ReleaseRecords, "function", "parseTask136ReleaseRecords export");
  return assurance.parseTask136ReleaseRecords(registryText, contract);
}

function verifyReleaseClosure(contract, registryText, adapter) {
  assert.equal(typeof assurance.verifyTask136ReleaseClosure, "function", "verifyTask136ReleaseClosure export");
  return assurance.verifyTask136ReleaseClosure(contract, { registryText, adapter });
}

function fakeRepositoryAdapter(records, options = {}) {
  const commandCalls = [];
  const pathBlobByCommit = new Map();
  for (const record of records) {
    for (const ownedPath of record.ownedPathBlobs) {
      pathBlobByCommit.set(`${record.candidateSha}:${ownedPath.path}`, ownedPath.blobSha);
      pathBlobByCommit.set(`${record.integrationSha}:${ownedPath.path}`, ownedPath.blobSha);
      if (ownedPath.disposition === "owned") {
        pathBlobByCommit.set(`HEAD:${ownedPath.path}`, ownedPath.blobSha);
      }
    }
  }

  return {
    commandCalls,
    isCheckoutClean() {
      return !options.dirtyCheckout;
    },
    isDependencySymlink() {
      return Boolean(options.dependencySymlink);
    },
    currentHead() {
      return "HEAD";
    },
    commitExists(commitSha) {
      return commitSha !== options.missingCommitSha;
    },
    isAncestor(ancestorSha, descendantSha) {
      if (
        options.integrationNotAncestral &&
        ancestorSha === options.integrationNotAncestral.integrationSha &&
        descendantSha === "HEAD"
      ) {
        return false;
      }
      if (
        options.prerequisiteNotAncestral &&
        ancestorSha === options.prerequisiteNotAncestral.integrationSha &&
        descendantSha === options.prerequisiteNotAncestral.candidateSha
      ) {
        return false;
      }
      return true;
    },
    blobSha(commitish, path) {
      if (options.blobMismatch && commitish === options.blobMismatch.commitish && path === options.blobMismatch.path) {
        return sha(`mismatch:${commitish}:${path}`);
      }
      const blobSha = pathBlobByCommit.get(`${commitish}:${path}`);
      if (!blobSha) {
        throw new Error(`fixture blob missing: ${commitish}:${path}`);
      }
      return blobSha;
    },
    runNpmTest(args, card) {
      if (options.commandFailureCardId === card.id) {
        throw new Error("fixture command failed");
      }
      commandCalls.push({ args, cardId: card.id });
    }
  };
}

test("rejects exactly 28 heading-only release records before Git checks", () => {
  const contract = loadContract();
  const registryText = headingOnlyMarkdown(contract);

  if (typeof assurance.parseTask136ReleaseRecords !== "function") {
    const result = runRepositoryModeInTemp(registryText);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /release record JSON missing for Task126/);
    return;
  }

  assert.throws(
    () => parseReleaseRecords(registryText, contract),
    /release record JSON missing for Task126/
  );
});

test("parses strict task136 dispatch release v4 records in graph order", () => {
  const contract = loadContract();
  const records = releaseRecordsFor(contract);
  const parsed = parseReleaseRecords(releaseRecordMarkdown(records), contract);

  assert.equal(parsed.length, 28);
  assert.deepEqual(parsed.map((record) => record.cardId), expectedIds);
  assert.equal(parsed[0].schemaVersion, releaseSchemaVersion);
});

test("rejects frozen strict release-record mutations", () => {
  const contract = loadContract();
  const validRecords = releaseRecordsFor(contract);
  const cases = [
    {
      id: "unknown key",
      message: /release record keys: Task126/,
      records() {
        const records = clone(validRecords);
        records[0].extra = true;
        return records;
      }
    },
    {
      id: "missing key",
      message: /release record keys: Task126/,
      records() {
        const records = clone(validRecords);
        delete records[0].candidateSha;
        return records;
      }
    },
    {
      id: "duplicate card",
      message: /duplicate release record: Task126/,
      records() {
        const records = clone(validRecords);
        records[1] = clone(records[0]);
        return records;
      }
    },
    {
      id: "card order",
      message: /release record order drift: expected Task126, found Task127/,
      records() {
        const records = clone(validRecords);
        [records[0], records[1]] = [records[1], records[0]];
        return records;
      }
    },
    {
      id: "bad SHA",
      message: /candidateSha must be a full lowercase SHA: Task126/,
      records() {
        const records = clone(validRecords);
        records[0].candidateSha = "ABC";
        return records;
      }
    },
    {
      id: "duplicate review",
      message: /duplicate review thread: Task126/,
      records() {
        const records = clone(validRecords);
        records[0].reviews[1].threadId = records[0].reviews[0].threadId;
        return records;
      }
    },
    {
      id: "review candidate mismatch",
      message: /review candidate mismatch: Task126/,
      records() {
        const records = clone(validRecords);
        records[0].reviews[0].candidateSha = sha("different candidate");
        return records;
      }
    },
    {
      id: "non-APPROVED verdict",
      message: /review verdict must be APPROVED: Task126/,
      records() {
        const records = clone(validRecords);
        records[0].reviews[0].verdict = "NEEDS-CHANGES";
        return records;
      }
    },
    {
      id: "prerequisite ID mismatch",
      message: /prerequisite ID mismatch: Task137A/,
      records() {
        const records = clone(validRecords);
        const record = records.find((entry) => entry.cardId === "Task137A");
        record.prerequisites[0].cardId = "Task126";
        return records;
      }
    },
    {
      id: "prerequisite release mismatch",
      message: /prerequisite release mismatch: Task137A:Task135D/,
      records() {
        const records = clone(validRecords);
        const record = records.find((entry) => entry.cardId === "Task137A");
        record.prerequisites[0].releaseEventId = "task136-release-v4-wrong";
        return records;
      }
    },
    {
      id: "missing path",
      message: /missing path: Task126:packages\/agent\/test\/byok-provider\.test\.ts/,
      records() {
        const records = clone(validRecords);
        records[0].ownedPathBlobs.pop();
        return records;
      }
    },
    {
      id: "disposition mismatch",
      message: /path disposition mismatch: Task126:packages\/agent\/src\/byok-provider\.ts/,
      records() {
        const records = clone(validRecords);
        records[0].ownedPathBlobs[1].disposition = "owned";
        return records;
      }
    }
  ];

  for (const testCase of cases) {
    assert.throws(
      () => parseReleaseRecords(releaseRecordMarkdown(testCase.records()), contract),
      testCase.message,
      testCase.id
    );
  }
});

test("verifies release records against Git evidence and argument-array commands", () => {
  const contract = loadContract();
  const records = releaseRecordsFor(contract);
  const adapter = fakeRepositoryAdapter(records);
  const result = verifyReleaseClosure(contract, releaseRecordMarkdown(records), adapter);

  assert.equal(result.records, 28);
  assert.equal(result.commands, 28);
  assert.equal(adapter.commandCalls.length, 28);
  assert.deepEqual(adapter.commandCalls[0], {
    cardId: "Task126",
    args: ["packages/agent/test/byok-provider.test.ts"]
  });
});

test("rejects frozen repository-evidence and execution mutations", () => {
  const contract = loadContract();
  const validRecords = releaseRecordsFor(contract);
  const task137A = validRecords.find((record) => record.cardId === "Task137A");
  const task135D = validRecords.find((record) => record.cardId === "Task135D");
  const task126 = validRecords.find((record) => record.cardId === "Task126");
  const byokPath = "packages/agent/test/byok-provider.test.ts";

  const cases = [
    {
      id: "blob mismatch",
      message: /blob mismatch: Task126:packages\/agent\/test\/byok-provider\.test\.ts/,
      adapter: () => fakeRepositoryAdapter(validRecords, {
        blobMismatch: { commitish: task126.candidateSha, path: byokPath }
      })
    },
    {
      id: "integration not ancestral",
      message: /integration is not an ancestor of HEAD: Task126/,
      adapter: () => fakeRepositoryAdapter(validRecords, {
        integrationNotAncestral: { integrationSha: task126.integrationSha }
      })
    },
    {
      id: "prerequisite not ancestral",
      message: /prerequisite integration is not an ancestor of candidate: Task137A:Task135D/,
      adapter: () => fakeRepositoryAdapter(validRecords, {
        prerequisiteNotAncestral: {
          integrationSha: task135D.integrationSha,
          candidateSha: task137A.candidateSha
        }
      })
    },
    {
      id: "dirty checkout",
      message: /repository checkout is dirty/,
      adapter: () => fakeRepositoryAdapter(validRecords, { dirtyCheckout: true })
    },
    {
      id: "dependency symlink",
      message: /dependency directory is a symlink/,
      adapter: () => fakeRepositoryAdapter(validRecords, { dependencySymlink: true })
    },
    {
      id: "command failure",
      message: /release command failed: Task126/,
      adapter: () => fakeRepositoryAdapter(validRecords, { commandFailureCardId: "Task126" })
    }
  ];

  for (const testCase of cases) {
    assert.throws(
      () => verifyReleaseClosure(contract, releaseRecordMarkdown(validRecords), testCase.adapter()),
      testCase.message,
      testCase.id
    );
  }
});

test("rejects unsafe frozen command grammar before executing commands", () => {
  const contract = clone(loadContract());
  contract.releaseGraph.cards[0].command = "npm test -- packages/agent/test/byok-provider.test.ts; echo unsafe";
  const records = releaseRecordsFor(contract);
  const adapter = fakeRepositoryAdapter(records);

  assert.throws(
    () => verifyReleaseClosure(contract, releaseRecordMarkdown(records), adapter),
    /invalid exact targeted Vitest command/
  );
  assert.equal(adapter.commandCalls.length, 0);
});
