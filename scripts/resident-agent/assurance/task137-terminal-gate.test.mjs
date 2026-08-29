import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, "../../..");
const scriptPath = join(testDir, "task137-terminal-gate.sh");

const expectedGateMarkers = [
  "TASK137_GATE_STAGE_OK tests",
  "TASK137_GATE_STAGE_OK typecheck",
  "TASK137_GATE_STAGE_OK source-policy",
  "TASK137_GATE_STAGE_OK package-boundary",
  "TASK137_GATE_STAGE_OK checkout",
  "TASK137_GATE_COMPLETE stages=5"
];

function writeExecutable(path, body) {
  writeFileSync(path, body, { mode: 0o755 });
}

function createCommandDoubles() {
  const binDir = mkdtempSync(join(tmpdir(), "task137-gate-bin-"));

  writeExecutable(
    join(binDir, "npm"),
    `#!/usr/bin/env bash
set -euo pipefail
if test "$1" = "test"; then
  if test "$#" -eq 3 && test "$2" = "--" && test "$3" = "packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts"; then
    printf '%s\\n' 'TASK137_POLICY_CORPUS_OK allowed=8 rejected=20'
    exit 0
  fi
  cat >/dev/null
  exit 0
fi
if test "$1" = "run" && test "$2" = "typecheck"; then
  exit 0
fi
printf 'unexpected npm invocation: %s\\n' "$*" >&2
exit 64
`
  );

  writeExecutable(
    join(binDir, "node"),
    `#!/usr/bin/env bash
set -euo pipefail
exit 0
`
  );

  writeExecutable(
    join(binDir, "git"),
    `#!/usr/bin/env bash
set -euo pipefail
if test "$1" = "diff" && test "$2" = "--check"; then
  exit 0
fi
if test "$1" = "status" && test "$2" = "--porcelain"; then
  exit 0
fi
printf 'unexpected git invocation: %s\\n' "$*" >&2
exit 64
`
  );

  writeExecutable(
    join(binDir, "rg"),
    `#!/usr/bin/env bash
set -euo pipefail
exit 1
`
  );

  return binDir;
}

function runBashFromStandardInput(input, env) {
  return spawnSync("bash", ["--noprofile", "--norc"], {
    cwd: repoRoot,
    env,
    input,
    encoding: "utf8"
  });
}

test("old standard-input gate exits after the test double and omits completion", () => {
  const binDir = createCommandDoubles();
  try {
    const env = { ...process.env, PATH: `${binDir}:${process.env.PATH ?? ""}` };
    const oldGate = String.raw`
set -euo pipefail
npm test -- packages/local-runtime/test/mounted-artifact-authority-operation.test.ts packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts packages/local-runtime/test/portable-workspace-lifecycle.test.ts packages/local-runtime/test/runtime-handle-mounted-authority.test.ts packages/local-runtime/test/runtime-handle-mounted-authority-imports.test.ts packages/agent/test/wake-supervisor.test.ts
echo 'TASK137_GATE_STAGE_OK tests'
npm run typecheck
echo 'TASK137_GATE_STAGE_OK typecheck'
echo 'TASK137_GATE_COMPLETE stages=6'
`;

    const result = runBashFromStandardInput(oldGate, env);

    const failure = result.error ? result.error.message : result.stderr;
    assert.equal(result.status, 0, failure);
    assert.equal(result.stdout.includes("TASK137_GATE_COMPLETE stages=6"), false);
    assert.equal(result.stdout.includes("TASK137_GATE_STAGE_OK typecheck"), false);
  } finally {
    rmSync(binDir, { recursive: true, force: true });
  }
});

test("committed terminal gate runs by pathname and emits the ordered v2 markers", () => {
  const binDir = createCommandDoubles();
  try {
    const env = { ...process.env, PATH: `${binDir}:${process.env.PATH ?? ""}` };
    const result = spawnSync(scriptPath, [], {
      cwd: repoRoot,
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });

    const failure = result.error ? result.error.message : result.stderr;
    assert.equal(result.status, 0, failure);
    assert.deepEqual(
      result.stdout
        .split(/\r?\n/)
        .filter((line) => line.startsWith("TASK137_GATE_")),
      expectedGateMarkers
    );
  } finally {
    rmSync(binDir, { recursive: true, force: true });
  }
});
