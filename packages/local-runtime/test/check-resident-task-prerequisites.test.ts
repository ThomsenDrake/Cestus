import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const checkerPath = resolve(process.cwd(), "scripts/check-resident-task-prerequisites.mjs");
const registryPath = "docs/agentic/resident-agent-full-vision-program-registry.md";
const manifestPath = "docs/agentic/claims/task-140-p-prerequisites.json";
const claimPath = "docs/agentic/claims/task-140-p-private-prompt-admission.md";
const dispatchStart = "<!-- resident-dispatch-v2:start -->";
const dispatchEnd = "<!-- resident-dispatch-v2:end -->";
const temporaryRepositories: string[] = [];

const pKeys = [
  "cf1", "task117a", "task120", "task121", "task122", "task123", "task124",
  "task125", "task126", "task127", "task128", "task129", "task130", "task132a",
  "task133", "task134a", "task135a", "task135b", "task135c", "task135d", "task136",
  "task137a", "task137b", "task138", "task139"
] as const;

type TaskName = "task140p" | "task140r0" | "task140h";
type Fixture = {
  readonly directory: string;
  readonly task: TaskName;
  readonly sourceBaseSha: string;
  readonly dispatchCommit: string;
  readonly coordinatorAttestation: string;
  readonly prerequisiteShas: Record<string, string>;
};
type FixtureOptions = {
  readonly manifestPrefix?: string;
  readonly checkerSuffix?: Uint8Array;
};

afterEach(() => {
  for (const directory of temporaryRepositories.splice(0)) rmSync(directory, { force: true, recursive: true });
});

function hash(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function git(directory: string, args: readonly string[]): string {
  return execFileSync("git", args, { cwd: directory, encoding: "utf8" }).trim();
}

function runChecker(fixture: Fixture, phase: "preflight" | "review", extraEnvironment: NodeJS.ProcessEnv = {}) {
  return spawnSync(
    process.execPath,
    [
      checkerPath,
      "--task", fixture.task,
      "--phase", phase,
      "--manifest", manifestPath,
      "--claim", claimPath,
      "--coordinator-attestation", fixture.coordinatorAttestation
    ],
    { cwd: fixture.directory, encoding: "utf8", env: { ...process.env, ...extraEnvironment } }
  );
}

function runRetainedPayload(fixture: Fixture, phase: "preflight" | "review") {
  if (!existsSync(checkerPath)) return runChecker(fixture, phase);
  const payload = Buffer.from(
    readFileSync(checkerPath)
  ).toString("base64");
  return runAuthenticatedPayload(fixture, phase, payload, hash(readFileSync(checkerPath)));
}

function runAuthenticatedPayload(
  fixture: Fixture,
  phase: "preflight" | "review",
  payload: string,
  expectedHash: string
) {
  return spawnSync(
    "/bin/bash",
    [
      "--noprofile",
      "--norc",
      "-c",
      "set -o pipefail; actual=\"$(printf '%s' \"$TASK135C_PAYLOAD\" | base64 -d | sha256sum | awk '{print $1}')\" || exit 72; test \"$actual\" = \"$TASK135C_EXPECTED_HASH\" || exit 72; printf '%s' \"$TASK135C_PAYLOAD\" | base64 -d | node --input-type=module - \"$@\"",
      "task135c-payload",
      "--task", fixture.task,
      "--phase", phase,
      "--manifest", manifestPath,
      "--claim", claimPath,
      "--coordinator-attestation", fixture.coordinatorAttestation
    ],
    {
      cwd: fixture.directory,
      encoding: "utf8",
      env: { ...process.env, TASK135C_PAYLOAD: payload, TASK135C_EXPECTED_HASH: expectedHash }
    }
  );
}

function taskKeys(task: TaskName): readonly string[] {
  if (task === "task140p") return pKeys;
  return task === "task140r0" ? [...pKeys, "task140p"] : [...pKeys, "task140p", "task140r0"];
}

function write(directory: string, path: string, bytes: string | Uint8Array): void {
  mkdirSync(join(directory, path, ".."), { recursive: true });
  writeFileSync(join(directory, path), bytes);
}

function dispatchClaim(task: TaskName, sourceBaseSha: string, manifestSha256: string, prerequisites: Record<string, string>): string {
  return [
    "# Future resident task dispatch",
    "",
    dispatchStart,
    `task=${task}`,
    `sourceBaseSha=${sourceBaseSha}`,
    `manifestPath=${manifestPath}`,
    `manifestSha256=${manifestSha256}`,
    ...Object.keys(prerequisites).sort().map((key) => `prerequisiteSha.${key}=${prerequisites[key]}`),
    dispatchEnd,
    ""
  ].join("\n");
}

function attestation(task: TaskName, dispatchCommit: string, sourceBaseSha: string, manifest: string, claim: string, checker: Uint8Array): string {
  return [
    `<!-- resident-dispatch-attestation-v1:start ${task} ${dispatchCommit} -->`,
    `task=${task}`,
    `dispatchCommitSha=${dispatchCommit}`,
    `sourceBaseSha=${sourceBaseSha}`,
    `manifestPath=${manifestPath}`,
    `manifestSha256=${hash(manifest)}`,
    "checkerPath=scripts/check-resident-task-prerequisites.mjs",
    `checkerSha256=${hash(checker)}`,
    `claimPath=${claimPath}`,
    `claimSha256=${hash(claim)}`,
    "freezePath=NONE",
    "intendedFreezeSha256=NONE",
    "auditSha256=NONE",
    `<!-- resident-dispatch-attestation-v1:end ${task} ${dispatchCommit} -->`,
    ""
  ].join("\n");
}

function createFixture(task: TaskName = "task140p", options: FixtureOptions = {}): Fixture {
  const directory = mkdtempSync(join(tmpdir(), "cestus-task135c-"));
  temporaryRepositories.push(directory);
  git(directory, ["init", "--quiet"]);
  git(directory, ["config", "user.email", "task135c@example.test"]);
  git(directory, ["config", "user.name", "Task135C fixture"]);
  write(directory, registryPath, "# Resident registry\n");
  const fixtureChecker = Buffer.concat([
    existsSync(checkerPath) ? readFileSync(checkerPath) : Buffer.from("// checker absent during RED\n"),
    options.checkerSuffix ?? Buffer.alloc(0)
  ]);
  write(directory, "scripts/check-resident-task-prerequisites.mjs", fixtureChecker);
  git(directory, ["add", "."]);
  git(directory, ["commit", "--quiet", "-m", "fixture root"]);

  const prerequisiteShas: Record<string, string> = {};
  for (const key of taskKeys(task)) {
    git(directory, ["commit", "--quiet", "--allow-empty", "-m", key]);
    prerequisiteShas[key] = git(directory, ["rev-parse", "HEAD"]);
  }
  const sourceBaseSha = git(directory, ["rev-parse", "HEAD"]);
  const manifest = `${options.manifestPrefix ?? ""}${JSON.stringify({
    schemaVersion: "resident-task-prerequisites.v2",
    task,
    sourceBaseSha,
    prerequisiteShas
  }, null, 2)}\n`;
  const claim = dispatchClaim(task, sourceBaseSha, hash(manifest), prerequisiteShas);
  write(directory, manifestPath, manifest);
  write(directory, claimPath, claim);
  git(directory, ["add", manifestPath, claimPath]);
  git(directory, ["commit", "--quiet", "-m", "dispatch M"]);
  const dispatchCommit = git(directory, ["rev-parse", "HEAD"]);

  git(directory, ["branch", "main-dispatch", dispatchCommit]);
  git(directory, ["checkout", "--quiet", "-b", "external-attestation", sourceBaseSha]);
  const checker = readFileSync(join(directory, "scripts/check-resident-task-prerequisites.mjs"));
  write(directory, registryPath, attestation(task, dispatchCommit, sourceBaseSha, manifest, claim, checker));
  git(directory, ["add", registryPath]);
  git(directory, ["commit", "--quiet", "-m", "external coordinator C"]);
  const coordinatorAttestation = git(directory, ["rev-parse", "HEAD"]);
  git(directory, ["checkout", "--quiet", "main-dispatch"]);
  return { directory, task, sourceBaseSha, dispatchCommit, coordinatorAttestation, prerequisiteShas };
}

function expectRejected(result: ReturnType<typeof runChecker>): void {
  expect(result.status, `${result.stdout}\n${result.stderr}`).not.toBe(0);
}

describe("check-resident-task-prerequisites", () => {
  it("accepts a valid immutable task140p bundle through the ordinary CLI", () => {
    const fixture = createFixture();
    const result = runChecker(fixture, "preflight");
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  });

  it("accepts the same immutable bundle through retained base64 module stdin bytes", () => {
    const fixture = createFixture();
    const result = runRetainedPayload(fixture, "preflight");
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  });

  it("permits only appended worker evidence during review", () => {
    const fixture = createFixture();
    appendFileSync(join(fixture.directory, claimPath), "\n## Worker evidence\n- focused tests passed\n");
    git(fixture.directory, ["add", claimPath]);
    git(fixture.directory, ["commit", "--quiet", "-m", "worker evidence"]);
    expect(runChecker(fixture, "preflight").status).not.toBe(0);
    expect(runChecker(fixture, "review").status).toBe(0);
  });

  it("accepts only the exact task-specific task140r0 and task140h inventories", () => {
    for (const task of ["task140r0", "task140h"] as const) {
      const fixture = createFixture(task);
      expect(runChecker(fixture, "preflight").status).toBe(0);
      expect(runRetainedPayload(fixture, "preflight").status).toBe(0);
    }
  });

  it("accepts only JSON's four ASCII whitespace bytes and rejects NBSP or BOM", () => {
    const asciiWhitespace = createFixture("task140p", { manifestPrefix: " \t\n\r" });
    expect(runChecker(asciiWhitespace, "preflight").status).toBe(0);
    for (const prefix of ["\u00a0", "\ufeff"]) {
      const fixture = createFixture("task140p", { manifestPrefix: prefix });
      expectRejected(runChecker(fixture, "preflight"));
    }
  });

  it("hashes immutable git show blobs as raw bytes, including a non-UTF8 executable comment", () => {
    const fixture = createFixture("task140p", {
      checkerSuffix: Buffer.from([0x0a, 0x2f, 0x2f, 0xff, 0x0a])
    });
    expect(runChecker(fixture, "preflight").status).toBe(0);
  });

  it("rejects task140p without task117a", () => {
    const fixture = createFixture();
    const manifest = JSON.parse(readFileSync(join(fixture.directory, manifestPath), "utf8"));
    delete manifest.prerequisiteShas.task117a;
    writeFileSync(join(fixture.directory, manifestPath), `${JSON.stringify(manifest)}\n`);
    expectRejected(runChecker(fixture, "preflight"));
  });

  it("rejects task140p without task135d", () => {
    const fixture = createFixture();
    const manifest = JSON.parse(readFileSync(join(fixture.directory, manifestPath), "utf8"));
    delete manifest.prerequisiteShas.task135d;
    writeFileSync(join(fixture.directory, manifestPath), `${JSON.stringify(manifest)}\n`);
    expectRejected(runChecker(fixture, "preflight"));
  });

  it("rejects task140r0 without task117a or task135d", () => {
    const fixture = createFixture("task140r0");
    const manifest = JSON.parse(readFileSync(join(fixture.directory, manifestPath), "utf8"));
    delete manifest.prerequisiteShas.task117a;
    delete manifest.prerequisiteShas.task135d;
    writeFileSync(join(fixture.directory, manifestPath), `${JSON.stringify(manifest)}\n`);
    expectRejected(runChecker(fixture, "preflight"));
  });

  it("rejects task140h without task117a or task135d", () => {
    const fixture = createFixture("task140h");
    const manifest = JSON.parse(readFileSync(join(fixture.directory, manifestPath), "utf8"));
    delete manifest.prerequisiteShas.task117a;
    delete manifest.prerequisiteShas.task135d;
    writeFileSync(join(fixture.directory, manifestPath), `${JSON.stringify(manifest)}\n`);
    expectRejected(runChecker(fixture, "preflight"));
  });

  it("rejects mutable immutable-block, manifest, task, SHA, and ancestry substitutions", () => {
    for (const mutate of [
      (fixture: Fixture) => appendFileSync(join(fixture.directory, manifestPath), " "),
      (fixture: Fixture) => writeFileSync(join(fixture.directory, claimPath), "# no immutable block\n"),
      (fixture: Fixture) => writeFileSync(join(fixture.directory, manifestPath), "{\"schemaVersion\":\"resident-task-prerequisites.v2\",\"task\":\"task140h\"}\n"),
      (fixture: Fixture) => {
        const manifest = JSON.parse(readFileSync(join(fixture.directory, manifestPath), "utf8"));
        manifest.prerequisiteShas.cf1 = "A".repeat(40);
        writeFileSync(join(fixture.directory, manifestPath), `${JSON.stringify(manifest)}\n`);
      },
      (fixture: Fixture) => {
        const manifest = JSON.parse(readFileSync(join(fixture.directory, manifestPath), "utf8"));
        manifest.prerequisiteShas.cf1 = fixture.dispatchCommit;
        writeFileSync(join(fixture.directory, manifestPath), `${JSON.stringify(manifest)}\n`);
      }
    ]) {
      const fixture = createFixture();
      mutate(fixture);
      expectRejected(runChecker(fixture, "preflight"));
    }
  });

  it("rejects duplicate, extra, symbolic, abbreviated, and malformed manifest JSON", () => {
    for (const manifest of [
      `{"schemaVersion":"resident-task-prerequisites.v2","task":"task140p","task":"task140p","sourceBaseSha":"${"0".repeat(40)}","prerequisiteShas":{}}`,
      `{"schemaVersion":"resident-task-prerequisites.v2","task":"task140p","sourceBaseSha":"${"0".repeat(40)}","prerequisiteShas":{"extra":"${"0".repeat(40)}"}}`,
      "{",
      "[]"
    ]) {
      const fixture = createFixture();
      writeFileSync(join(fixture.directory, manifestPath), `${manifest}\n`);
      expectRejected(runChecker(fixture, "preflight"));
    }
  });

  it("rejects Git environment, physical-checkout, graft, shallow, hidden-index, and ignored authority state before reads", () => {
    for (const variable of ["GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_DIR", "GIT_CONFIG_COUNT", "GIT_CESTUS_TEST"]) {
      const environmentFixture = createFixture();
      expectRejected(runChecker(environmentFixture, "preflight", { [variable]: "forged" }));
    }
    const pagerFixture = createFixture();
    expect(runChecker(pagerFixture, "preflight", { GIT_PAGER: "cat" }).status).toBe(0);
    const graftFixture = createFixture();
    writeFileSync(join(graftFixture.directory, ".git", "info", "grafts"), `${graftFixture.sourceBaseSha}\n`);
    expectRejected(runChecker(graftFixture, "preflight"));
    const shallowFixture = createFixture();
    writeFileSync(join(shallowFixture.directory, ".git", "shallow"), `${shallowFixture.sourceBaseSha}\n`);
    expectRejected(runChecker(shallowFixture, "preflight"));
    const assumedFixture = createFixture();
    git(assumedFixture.directory, ["update-index", "--assume-unchanged", manifestPath]);
    expectRejected(runChecker(assumedFixture, "preflight"));
    const skippedFixture = createFixture();
    git(skippedFixture.directory, ["update-index", "--skip-worktree", manifestPath]);
    expectRejected(runChecker(skippedFixture, "preflight"));
    const ignoredFixture = createFixture();
    appendFileSync(join(ignoredFixture.directory, ".git", "info", "exclude"), "\nscripts/hidden-authority\n");
    write(ignoredFixture.directory, "scripts/hidden-authority", "hidden\n");
    expectRejected(runChecker(ignoredFixture, "preflight"));
    const replacementFixture = createFixture();
    git(replacementFixture.directory, ["replace", replacementFixture.sourceBaseSha, replacementFixture.prerequisiteShas.cf1]);
    expectRejected(runChecker(replacementFixture, "preflight"));
  });

  it("rejects later-touch, replacement, rename, delete-readd, merge, wrong-parent, and extra-M-file dispatch bypasses", () => {
    const laterTouch = createFixture();
    appendFileSync(join(laterTouch.directory, manifestPath), " ");
    git(laterTouch.directory, ["add", manifestPath]);
    git(laterTouch.directory, ["commit", "--quiet", "-m", "later touch"]);
    expectRejected(runChecker(laterTouch, "review"));
    const extraMFile = createFixture();
    git(extraMFile.directory, ["reset", "--soft", "HEAD^"]);
    write(extraMFile.directory, "unexpected.txt", "smuggled\n");
    git(extraMFile.directory, ["add", "."]);
    git(extraMFile.directory, ["commit", "--quiet", "-m", "replacement M with source"]);
    expectRejected(runChecker(extraMFile, "preflight"));
    const wrongParent = createFixture();
    git(wrongParent.directory, ["reset", "--mixed", "HEAD^"]);
    git(wrongParent.directory, ["commit", "--quiet", "--allow-empty", "-m", "source work before replacement M"]);
    git(wrongParent.directory, ["add", manifestPath, claimPath]);
    git(wrongParent.directory, ["commit", "--quiet", "-m", "replacement M with wrong parent"]);
    expectRejected(runChecker(wrongParent, "preflight"));
    const mergedFixture = createFixture();
    git(mergedFixture.directory, ["checkout", "--quiet", "-b", "review-side", mergedFixture.sourceBaseSha]);
    git(mergedFixture.directory, ["commit", "--quiet", "--allow-empty", "-m", "side work"]);
    git(mergedFixture.directory, ["checkout", "--quiet", "main-dispatch"]);
    git(mergedFixture.directory, ["merge", "--quiet", "--no-ff", "review-side", "-m", "forbidden merge"]);
    expectRejected(runChecker(mergedFixture, "review"));
  });

  it("rejects forged, wrong, symbolic, nonregistry, merge, duplicate, and mismatched external attestations", () => {
    const wrong = createFixture();
    const wrongResult = spawnSync(process.execPath, [checkerPath, "--task", wrong.task, "--phase", "preflight", "--manifest", manifestPath, "--claim", claimPath, "--coordinator-attestation", wrong.dispatchCommit], { cwd: wrong.directory, encoding: "utf8" });
    expectRejected(wrongResult);
    const fixture = createFixture();
    const registry = join(fixture.directory, registryPath);
    git(fixture.directory, ["checkout", "--quiet", "external-attestation"]);
    appendFileSync(
      registry,
      `\n<!-- resident-dispatch-attestation-v1:start task140p ${fixture.dispatchCommit} -->\n`
    );
    git(fixture.directory, ["add", registryPath]);
    git(fixture.directory, ["commit", "--quiet", "-m", "forged C mutation"]);
    const forged = git(fixture.directory, ["rev-parse", "HEAD"]);
    git(fixture.directory, ["checkout", "--quiet", "main-dispatch"]);
    const result = spawnSync(process.execPath, [checkerPath, "--task", fixture.task, "--phase", "preflight", "--manifest", manifestPath, "--claim", claimPath, "--coordinator-attestation", forged], { cwd: fixture.directory, encoding: "utf8" });
    expectRejected(result);
    const mismatch = createFixture();
    git(mismatch.directory, ["checkout", "--quiet", "external-attestation"]);
    const mismatchRegistry = join(mismatch.directory, registryPath);
    const attestationBytes = readFileSync(mismatchRegistry, "utf8").replace(/checkerSha256=[0-9a-f]{64}/, `checkerSha256=${"0".repeat(64)}`);
    writeFileSync(mismatchRegistry, attestationBytes);
    git(mismatch.directory, ["add", registryPath]);
    git(mismatch.directory, ["commit", "--quiet", "-m", "mismatched external C"]);
    const mismatchC = git(mismatch.directory, ["rev-parse", "HEAD"]);
    git(mismatch.directory, ["checkout", "--quiet", "main-dispatch"]);
    const mismatchResult = spawnSync(process.execPath, [checkerPath, "--task", mismatch.task, "--phase", "preflight", "--manifest", manifestPath, "--claim", claimPath, "--coordinator-attestation", mismatchC], { cwd: mismatch.directory, encoding: "utf8" });
    expectRejected(mismatchResult);
  });

  it("rejects retained-payload hash changes and path replacement around both authority calls", () => {
    const fixture = createFixture();
    const payload = Buffer.from(
      existsSync(checkerPath) ? readFileSync(checkerPath) : "// checker absent during RED\n"
    ).toString("base64");
    const alteredPayload = `${payload.slice(0, -4)}AAAA`;
    const result = runAuthenticatedPayload(fixture, "preflight", alteredPayload, hash(Buffer.from(payload, "base64")));
    expectRejected(result);
    const malformed = runAuthenticatedPayload(fixture, "preflight", "not-base64$", hash(Buffer.from(payload, "base64")));
    expectRejected(malformed);
    const pathReplacement = createFixture();
    const capturedPayload = Buffer.from(readFileSync(checkerPath)).toString("base64");
    write(pathReplacement.directory, "scripts/check-resident-task-prerequisites.mjs", "process.exit(99);\n");
    const preservedBytes = runAuthenticatedPayload(pathReplacement, "preflight", capturedPayload, hash(readFileSync(checkerPath)));
    expect(preservedBytes.status, `${preservedBytes.stdout}\n${preservedBytes.stderr}`).toBe(0);
    const terminalRunner = createFixture();
    const terminalPayload = Buffer.from(readFileSync(checkerPath)).toString("base64");
    const terminalHash = hash(readFileSync(checkerPath));
    expect(runAuthenticatedPayload(terminalRunner, "preflight", terminalPayload, terminalHash).status).toBe(0);
    write(terminalRunner.directory, "scripts/check-resident-task-prerequisites.mjs", "process.exit(99);\n");
    expect(runAuthenticatedPayload(terminalRunner, "review", terminalPayload, terminalHash).status).toBe(0);
    write(terminalRunner.directory, "scripts/check-resident-task-prerequisites.mjs", readFileSync(checkerPath));
    expect(runAuthenticatedPayload(terminalRunner, "review", terminalPayload, terminalHash).status).toBe(0);
  });
});
