import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, normalize, relative, resolve } from "node:path";

const registryPath = "docs/agentic/resident-agent-full-vision-program-registry.md";
const checkerPath = "scripts/check-resident-task-prerequisites.mjs";
const dispatchStart = "<!-- resident-dispatch-v2:start -->";
const dispatchEnd = "<!-- resident-dispatch-v2:end -->";
const hex40 = /^[0-9a-f]{40}$/;
const hex64 = /^[0-9a-f]{64}$/;
const tasks = new Set(["task140p", "task140r0", "task140h"]);
const phases = new Set(["preflight", "review"]);
const pKeys = [
  "cf1", "task117a", "task120", "task121", "task122", "task123", "task124",
  "task125", "task126", "task127", "task128", "task129", "task130", "task132a",
  "task133", "task134a", "task135a", "task135b", "task135c", "task135d", "task136",
  "task137a", "task137b", "task138", "task139"
];

function fail(message) {
  throw new Error(message);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertGitEnvironment() {
  const names = Object.keys(process.env).filter((key) => key.startsWith("GIT_"));
  if (names.length === 1 && names[0] === "GIT_PAGER" && process.env.GIT_PAGER === "cat") {
    delete process.env.GIT_PAGER;
    return;
  }
  if (names.length !== 0) fail("Git environment authority is not clean");
}

function gitResult(args, raw = false) {
  const result = spawnSync("git", args, {
    cwd: process.cwd(),
    ...(raw ? {} : { encoding: "utf8" }),
    env: { ...process.env, GIT_NO_REPLACE_OBJECTS: "1" }
  });
  if (result.error) fail(`Git invocation failed: ${result.error.message}`);
  return result;
}

function git(args) {
  const result = gitResult(args);
  if (result.status !== 0) fail(`Git rejected ${args[0] ?? "operation"}`);
  return result.stdout.trimEnd();
}

function gitBytes(args) {
  const result = gitResult(args, true);
  if (result.status !== 0) fail(`Git rejected ${args[0] ?? "operation"}`);
  if (!Buffer.isBuffer(result.stdout)) fail("Git did not return raw blob bytes");
  return result.stdout;
}

function splitLines(value) {
  return value === "" ? [] : value.split("\n");
}

function assertPhysicalRepository() {
  const physicalCwd = realpathSync(process.cwd());
  const topLevel = realpathSync(git(["rev-parse", "--show-toplevel"]));
  if (physicalCwd !== topLevel) fail("Checker must run from the physical repository root");
  if (git(["rev-parse", "--is-inside-work-tree"]) !== "true") fail("Not inside a Git worktree");
}

function assertNoHiddenGitAuthority() {
  for (const path of [git(["rev-parse", "--git-path", "info/grafts"]), git(["rev-parse", "--git-path", "shallow"])]) {
    if (existsSync(path) && readFileSync(path).length !== 0) fail("Graft or shallow Git authority is present");
  }
  if (splitLines(git(["ls-files", "-v"])).some((line) => /^[a-zS] /.test(line))) {
    fail("Hidden index authority is present");
  }
  if (git(["ls-files", "--others", "--ignored", "--exclude-standard", "--", "packages", "scripts", "docs/agentic/claims"]) !== "") {
    fail("Ignored authority path is present");
  }
  if (git(["for-each-ref", "--format=%(refname)", "refs/replace/"]) !== "") {
    fail("Git replacement refs are present");
  }
}

function parseArgs(argv) {
  if (argv.length !== 10) fail("Expected exactly five named CLI values");
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!new Set(["--task", "--phase", "--manifest", "--claim", "--coordinator-attestation"]).has(key) || value === undefined || Object.hasOwn(values, key)) {
      fail("CLI arguments are not exact");
    }
    values[key] = value;
  }
  if (!tasks.has(values["--task"]) || !phases.has(values["--phase"]) || !hex40.test(values["--coordinator-attestation"])) {
    fail("CLI value is invalid");
  }
  for (const key of ["--manifest", "--claim"]) assertRepositoryPath(values[key]);
  return {
    task: values["--task"],
    phase: values["--phase"],
    manifestPath: values["--manifest"],
    claimPath: values["--claim"],
    coordinatorAttestation: values["--coordinator-attestation"]
  };
}

function assertRepositoryPath(path) {
  if (typeof path !== "string" || path.length === 0 || path.includes("\0") || isAbsolute(path) || normalize(path) !== path || path === "." || path.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) {
    fail("Path is not a literal repository-relative path");
  }
}

function currentRegularFile(path) {
  const absolute = resolve(process.cwd(), path);
  if (relative(process.cwd(), absolute).startsWith("..")) fail("Path escapes the repository");
  const entry = lstatSync(absolute);
  if (!entry.isFile()) fail("Authority path is not a regular file");
  return readFileSync(absolute);
}

function commitBlob(commit, path) {
  return gitBytes(["show", `${commit}:${path}`]);
}

class StrictJson {
  constructor(source) {
    this.source = source;
    this.index = 0;
  }

  parse() {
    const result = this.value();
    this.space();
    if (this.index !== this.source.length) fail("JSON contains trailing bytes");
    return result;
  }

  space() {
    while (this.index < this.source.length && " \t\n\r".includes(this.source[this.index])) this.index += 1;
  }

  value() {
    this.space();
    const character = this.source[this.index];
    if (character === "{") return this.object();
    if (character === "[") return this.array();
    if (character === "\"") return this.string();
    if (this.source.startsWith("true", this.index)) return this.keyword("true", true);
    if (this.source.startsWith("false", this.index)) return this.keyword("false", false);
    if (this.source.startsWith("null", this.index)) return this.keyword("null", null);
    const match = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
    match.lastIndex = this.index;
    const number = match.exec(this.source);
    if (!number) fail("JSON value is invalid");
    this.index += number[0].length;
    return Number(number[0]);
  }

  keyword(word, value) {
    this.index += word.length;
    return value;
  }

  string() {
    const start = this.index;
    this.index += 1;
    let escaped = false;
    while (this.index < this.source.length) {
      const character = this.source[this.index];
      if (character.charCodeAt(0) < 0x20) fail("JSON string has a control character");
      this.index += 1;
      if (!escaped && character === "\"") return JSON.parse(this.source.slice(start, this.index));
      escaped = !escaped && character === "\\";
      if (character !== "\\") escaped = false;
    }
    fail("JSON string is unterminated");
  }

  object() {
    const object = Object.create(null);
    const keys = new Set();
    this.index += 1;
    this.space();
    if (this.source[this.index] === "}") {
      this.index += 1;
      return object;
    }
    while (true) {
      this.space();
      if (this.source[this.index] !== "\"") fail("JSON object key is invalid");
      const key = this.string();
      if (keys.has(key)) fail("JSON contains a duplicate key");
      keys.add(key);
      this.space();
      if (this.source[this.index] !== ":") fail("JSON object separator is invalid");
      this.index += 1;
      object[key] = this.value();
      this.space();
      if (this.source[this.index] === "}") {
        this.index += 1;
        return object;
      }
      if (this.source[this.index] !== ",") fail("JSON object delimiter is invalid");
      this.index += 1;
    }
  }

  array() {
    const values = [];
    this.index += 1;
    this.space();
    if (this.source[this.index] === "]") {
      this.index += 1;
      return values;
    }
    while (true) {
      values.push(this.value());
      this.space();
      if (this.source[this.index] === "]") {
        this.index += 1;
        return values;
      }
      if (this.source[this.index] !== ",") fail("JSON array delimiter is invalid");
      this.index += 1;
    }
  }
}

function plainRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === null;
}

function exactKeys(value, expected) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function prerequisiteKeys(task) {
  return task === "task140p" ? pKeys : task === "task140r0" ? [...pKeys, "task140p"] : [...pKeys, "task140p", "task140r0"];
}

function parseManifest(bytes, task) {
  let value;
  try {
    value = new StrictJson(bytes.toString("utf8")).parse();
  } catch (error) {
    fail(error instanceof Error ? error.message : "Manifest JSON is invalid");
  }
  if (!plainRecord(value) || !exactKeys(value, ["schemaVersion", "task", "sourceBaseSha", "prerequisiteShas"])) fail("Manifest schema is invalid");
  if (value.schemaVersion !== "resident-task-prerequisites.v2" || value.task !== task || !hex40.test(value.sourceBaseSha) || !plainRecord(value.prerequisiteShas)) {
    fail("Manifest identity is invalid");
  }
  const expectedKeys = prerequisiteKeys(task);
  if (!exactKeys(value.prerequisiteShas, expectedKeys)) fail("Manifest prerequisite inventory is invalid");
  for (const key of expectedKeys) if (!hex40.test(value.prerequisiteShas[key])) fail("Manifest prerequisite SHA is invalid");
  return value;
}

function immutableBlock(claim) {
  const lines = claim.toString("utf8").split("\n");
  const starts = lines.reduce((all, line, index) => line === dispatchStart ? [...all, index] : all, []);
  const ends = lines.reduce((all, line, index) => line === dispatchEnd ? [...all, index] : all, []);
  if (starts.length !== 1 || ends.length !== 1 || starts[0] >= ends[0]) fail("Immutable dispatch block is not unique");
  return lines.slice(starts[0], ends[0] + 1).join("\n");
}

function assertClaim(block, manifest, manifestPath) {
  const expected = [
    dispatchStart,
    `task=${manifest.task}`,
    `sourceBaseSha=${manifest.sourceBaseSha}`,
    `manifestPath=${manifestPath}`,
    `manifestSha256=${sha256(manifest.bytes)}`,
    ...Object.keys(manifest.prerequisiteShas).sort().map((key) => `prerequisiteSha.${key}=${manifest.prerequisiteShas[key]}`),
    dispatchEnd
  ];
  if (block !== expected.join("\n")) fail("Immutable claim block does not bind the manifest exactly");
}

function assertExactCommit(sha) {
  if (!hex40.test(sha) || git(["rev-parse", "--verify", `${sha}^{commit}`]) !== sha) fail("SHA is not an exact commit");
}

function assertAncestor(ancestor, descendant) {
  if (gitResult(["merge-base", "--is-ancestor", ancestor, descendant]).status !== 0) fail("Prerequisite ancestry is invalid");
}

function uniqueOriginalAdd(path) {
  const commits = splitLines(git(["log", "--no-renames", "--diff-filter=A", "--format=%H", "--", path]));
  if (commits.length !== 1 || !hex40.test(commits[0])) fail("Dispatch path does not have one original add");
  return commits[0];
}

function assertDispatchCommit(dispatchCommit, manifestPath, claimPath, sourceBaseSha, head) {
  const parents = git(["rev-list", "--parents", "-n", "1", dispatchCommit]).split(" ");
  if (parents.length !== 2 || parents[1] !== sourceBaseSha) fail("Dispatch M parent is not the source base");
  const changes = splitLines(git(["diff-tree", "--no-commit-id", "--name-status", "-r", "--no-renames", `${dispatchCommit}^`, dispatchCommit])).sort();
  const expected = [`A\t${claimPath}`, `A\t${manifestPath}`].sort();
  if (changes.length !== expected.length || changes.some((line, index) => line !== expected[index])) fail("Dispatch M is not the exact two-file add");
  if (splitLines(git(["rev-list", "--merges", `${sourceBaseSha}..${head}`])).length !== 0) fail("Dispatch ancestry contains a merge");
}

function assertAttestation(attestationSha, task, dispatchCommit, manifestPath, manifestBytes, claimPath, claimBytes, manifest) {
  assertExactCommit(attestationSha);
  if (git(["rev-list", "--parents", "-n", "1", attestationSha]).split(" ").length !== 2) fail("Coordinator attestation is not one-parent");
  const changes = splitLines(git(["diff-tree", "--no-commit-id", "--name-status", "-r", "--no-renames", `${attestationSha}^`, attestationSha]));
  if (changes.length !== 1 || changes[0] !== `M\t${registryPath}`) fail("Coordinator attestation is not registry-only");
  const registry = commitBlob(attestationSha, registryPath).toString("utf8");
  const start = `<!-- resident-dispatch-attestation-v1:start ${task} ${dispatchCommit} -->`;
  const end = `<!-- resident-dispatch-attestation-v1:end ${task} ${dispatchCommit} -->`;
  if (registry.split("\n").filter((line) => line === start).length !== 1 || registry.split("\n").filter((line) => line === end).length !== 1) fail("Coordinator attestation block is not unique");
  const expected = [
    start,
    `task=${task}`,
    `dispatchCommitSha=${dispatchCommit}`,
    `sourceBaseSha=${manifest.sourceBaseSha}`,
    `manifestPath=${manifestPath}`,
    `manifestSha256=${sha256(manifestBytes)}`,
    `checkerPath=${checkerPath}`,
    "checkerSha256=",
    `claimPath=${claimPath}`,
    `claimSha256=${sha256(claimBytes)}`,
    "freezePath=NONE",
    "intendedFreezeSha256=NONE",
    "auditSha256=NONE",
    end
  ];
  const lines = registry.split("\n");
  const startIndex = lines.indexOf(start);
  const actual = lines.slice(startIndex, startIndex + expected.length);
  for (let index = 0; index < expected.length; index += 1) {
    if (expected[index] === "checkerSha256=") {
      if (!/^checkerSha256=[0-9a-f]{64}$/.test(actual[index] ?? "")) fail("Coordinator checker hash is invalid");
    } else if (actual[index] !== expected[index]) {
      fail("Coordinator attestation does not match immutable dispatch bytes");
    }
  }
  const declaredCheckerHash = actual.find((line) => line.startsWith("checkerSha256="))?.slice("checkerSha256=".length);
  if (declaredCheckerHash !== sha256(commitBlob(attestationSha, checkerPath))) {
    fail("Coordinator checker hash does not bind C's immutable checker blob");
  }
}

function main() {
  assertGitEnvironment();
  assertPhysicalRepository();
  assertNoHiddenGitAuthority();
  const input = parseArgs(process.argv.slice(2));
  const head = git(["rev-parse", "HEAD"]);
  const manifestAdd = uniqueOriginalAdd(input.manifestPath);
  const claimAdd = uniqueOriginalAdd(input.claimPath);
  if (manifestAdd !== claimAdd) fail("Manifest and claim were not added by the same M");
  const manifestBytes = commitBlob(manifestAdd, input.manifestPath);
  const claimBytes = commitBlob(manifestAdd, input.claimPath);
  const manifest = parseManifest(manifestBytes, input.task);
  manifest.bytes = manifestBytes;
  assertExactCommit(manifest.sourceBaseSha);
  for (const sha of Object.values(manifest.prerequisiteShas)) {
    assertExactCommit(sha);
    assertAncestor(sha, manifest.sourceBaseSha);
  }
  assertClaim(immutableBlock(claimBytes), manifest, input.manifestPath);
  assertDispatchCommit(manifestAdd, input.manifestPath, input.claimPath, manifest.sourceBaseSha, head);
  if (!currentRegularFile(input.manifestPath).equals(manifestBytes)) fail("Current manifest differs from M");
  if (immutableBlock(currentRegularFile(input.claimPath)) !== immutableBlock(claimBytes)) fail("Current immutable claim block differs from M");
  if (input.phase === "preflight" && head !== manifestAdd) fail("Preflight HEAD is not M");
  if (input.phase === "review") assertAncestor(manifestAdd, head);
  assertAttestation(input.coordinatorAttestation, input.task, manifestAdd, input.manifestPath, manifestBytes, input.claimPath, claimBytes, manifest);
  process.stdout.write(`resident prerequisite ${input.task} ${input.phase} accepted\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "Prerequisite checker rejected input"}\n`);
  process.exitCode = 1;
}
