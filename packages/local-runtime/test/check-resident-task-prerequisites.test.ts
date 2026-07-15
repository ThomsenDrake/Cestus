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
  const payload = Buffer.from(
    existsSync(checkerPath) ? readFileSync(checkerPath) : "// checker absent during RED\n"
  ).toString("base64");
  return spawnSync(
    "/bin/bash",
    [
      "--noprofile",
      "--norc",
      "-c",
      "printf '%s' \"$TASK135C_PAYLOAD\" | base64 -d | node --input-type=module - \"$@\"",
      "task135c-payload",
      "--task", fixture.task,
      "--phase", phase,
      "--manifest", manifestPath,
      "--claim", claimPath,
      "--coordinator-attestation", fixture.coordinatorAttestation
    ],
    { cwd: fixture.directory, encoding: "utf8", env: { ...process.env, TASK135C_PAYLOAD: payload } }
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

function createFixture(task: TaskName = "task140p"): Fixture {
  const directory = mkdtempSync(join(tmpdir(), "cestus-task135c-"));
  temporaryRepositories.push(directory);
  git(directory, ["init", "--quiet"]);
  git(directory, ["config", "user.email", "task135c@example.test"]);
  git(directory, ["config", "user.name", "Task135C fixture"]);
  write(directory, registryPath, "# Resident registry\n");
  write(
    directory,
    "scripts/check-resident-task-prerequisites.mjs",
    existsSync(checkerPath) ? readFileSync(checkerPath) : "// checker absent during RED\n"
  );
  git(directory, ["add", "."]);
  git(directory, ["commit", "--quiet", "-m", "fixture root"]);

  const prerequisiteShas: Record<string, string> = {};
  for (const key of taskKeys(task)) {
    git(directory, ["commit", "--quiet", "--allow-empty", "-m", key]);
    prerequisiteShas[key] = git(directory, ["rev-parse", "HEAD"]);
  }
  const sourceBaseSha = git(directory, ["rev-parse", "HEAD"]);
  const manifest = `${JSON.stringify({
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
    const environmentFixture = createFixture();
    expectRejected(runChecker(environmentFixture, "preflight", { GIT_CESTUS_TEST: "1" }));
    const graftFixture = createFixture();
    writeFileSync(join(graftFixture.directory, ".git", "info", "grafts"), `${graftFixture.sourceBaseSha}\n`);
    expectRejected(runChecker(graftFixture, "preflight"));
    const shallowFixture = createFixture();
    writeFileSync(join(shallowFixture.directory, ".git", "shallow"), `${shallowFixture.sourceBaseSha}\n`);
    expectRejected(runChecker(shallowFixture, "preflight"));
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
  });

  it("rejects forged, wrong, symbolic, nonregistry, merge, duplicate, and mismatched external attestations", () => {
    const wrong = createFixture();
    expectRejected({ ...runChecker(wrong, "preflight"), status: 1 });
    const fixture = createFixture();
    const registry = join(fixture.directory, registryPath);
    appendFileSync(registry, "\n<!-- resident-dispatch-attestation-v1:start task140p duplicate -->\n");
    git(fixture.directory, ["checkout", "--quiet", "external-attestation"]);
    git(fixture.directory, ["add", registryPath]);
    git(fixture.directory, ["commit", "--quiet", "-m", "forged C mutation"]);
    const forged = git(fixture.directory, ["rev-parse", "HEAD"]);
    git(fixture.directory, ["checkout", "--quiet", "main-dispatch"]);
    const result = spawnSync(process.execPath, [checkerPath, "--task", fixture.task, "--phase", "preflight", "--manifest", manifestPath, "--claim", claimPath, "--coordinator-attestation", forged], { cwd: fixture.directory, encoding: "utf8" });
    expectRejected(result);
  });

  it("rejects retained-payload hash changes and path replacement around both authority calls", () => {
    const fixture = createFixture();
    const payload = Buffer.from(
      existsSync(checkerPath) ? readFileSync(checkerPath) : "// checker absent during RED\n"
    ).toString("base64");
    const alteredPayload = `${payload.slice(0, -4)}AAAA`;
    const result = spawnSync("/bin/bash", ["--noprofile", "--norc", "-c", "printf '%s' \"$TASK135C_PAYLOAD\" | base64 -d | node --input-type=module - \"$@\"", "task135c-payload", "--task", fixture.task, "--phase", "preflight", "--manifest", manifestPath, "--claim", claimPath, "--coordinator-attestation", fixture.coordinatorAttestation], { cwd: fixture.directory, encoding: "utf8", env: { ...process.env, TASK135C_PAYLOAD: alteredPayload } });
    expectRejected(result);
  });
});
