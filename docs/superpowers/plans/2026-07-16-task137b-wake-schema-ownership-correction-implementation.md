# Task137B Wake Schema Ownership Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` and
> `superpowers:test-driven-development` only when an implementation prompt
> explicitly approves them. Review and design prompts do not authorize SDD.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the finite release graph so Task137B-W can add the seven
canonical wake lifecycle schemas, then implement, review, integrate, and
release the durable mounted wake runtime as record 11.

**Architecture:** An immutable v3 assurance contract transfers the central
ontology contract and finite Task137 policy source/test from Task129-MFA to
Task137B-W while one canonical-record compatibility declaration preserves
Task129-MFA's existing v4 release record.
After that migration is dual-approved and integrated, Task137B-W implements
the already approved mounted lifecycle store and wake runtime in one bounded
ten-path TDD task.

**Tech Stack:** TypeScript, Node.js ESM, Zod, Vitest, Git object evidence,
append-only Cestus ledger contracts.

## Global Constraints

- Program worktree:
  `/home/drake/.codex/worktrees/program-coordinator-recovery/Cestus`.
- Program branch:
  `codex/resident-agent-full-vision-program-watchdog-recovery`.
- Never merge, push, reset, rebase, or touch `neo` without explicit user
  authorization.
- Do not run full `npm run verify` in this bounded correction.
- Do not use providers, network, credentials, live APIs, or external services.
- Task139 remains blocked.
- V1 and v2 assurance contract SHA-256 values remain exactly:
  `d33864d9964a355067b7be86c78951d3df184a80b80765da3f51aab66e903fed`
  and
  `c23a390cc3e4a3395c018a8532e0fa84b23a880782805f7cbcc463d9e8162ba4`.
- The graph remains 29 cards in the same order. All commands except
  Task137B-W's, the composition grammar, composition corpus, ABI corpus, and v4
  release-record schema remain unchanged. Task137B-W adds only the transferred
  policy test to its command.
- Every implementation candidate needs one fresh architecture/invariant and
  one fresh executability/adversarial exact-revision review. Both must return
  unqualified **APPROVED**.
- Integration is coordinator-only, onto the program branch, after independent
  admission from committed bytes.

---

### Task 1: Migrate The Finite Assurance Contract To V3

**Branch:** `codex/task136-v3-task137b-wake-schema-transfer`

**Files:**
- Create: `docs/agentic/contracts/task136-bounded-assurance-v3.json`
- Modify: `scripts/resident-agent/assurance/task136-bounded-assurance.mjs`
- Modify: `scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs`
- Create: `docs/agentic/claims/task-136-task137b-wake-schema-ownership-correction.md`

**Interfaces:**
- Consumes: immutable v1/v2 contracts, the strict ten-record registry prefix,
  and the v2 verifier.
- Produces: `task136-bounded-assurance.v3`,
  `task136-release-graph.v3`, and
  `task136-release-compatibility.v1` with exactly one canonical historical
  record and three historical path dispositions.

- [ ] **Step 1: Claim the exact four paths**

Set `DISPATCH_BASE="$(git rev-parse HEAD)"` before changing any file. Record
that exact dispatch base, design/plan revisions, immutable v1/v2 hashes,
explicit task-scoped SDD/TDD approval, and every prohibition from Global
Constraints. Commit the claim before tests.

- [ ] **Step 2: Add two causal RED tests**

Extend the existing 12-test Node suite to exactly 14 tests. The first new test
requires:

```js
assert.equal(contract.schemaVersion, "task136-bounded-assurance.v3");
assert.equal(contract.releaseGraph.version, "task136-release-graph.v3");
assert.equal(contract.releaseCompatibility.version, "task136-release-compatibility.v1");
assert.deepEqual(contract.releaseCompatibility.historicalRecords, [{
  cardId: "Task129-MFA",
  canonicalJsonSha256: "23cb98725d67ada15c0e2913816f82407c171912564423e669cf73995aaead76",
  pathDispositions: [
    { path: "packages/ontology/src/contracts.ts", recordDisposition: "owned" },
    { path: "packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts", recordDisposition: "owned" },
    { path: "packages/local-runtime/test/support/task137-authority-boundary-policy.ts", recordDisposition: "owned" }
  ]
}]);
assert.deepEqual(task137b.prerequisiteIds, ["Task135B", "T120-R", "Task129-MFA"]);
```

It also asserts Task129-MFA transfers all three corrected paths to Task137B-W,
Task137B-W owns them in the exact design order, only the Task137B-W command
changes, the 29-card order and v1 corpora are unchanged, and the v1/v2 file
hashes remain exact.

The second test accepts the existing Task129-MFA `owned` release entry only
when its compact canonical JSON SHA-256 is exactly
`23cb98725d67ada15c0e2913816f82407c171912564423e669cf73995aaead76`.
It causally rejects missing/extra compatibility records or paths, unknown
card/path, non-transferred source path, wrong historical disposition, missing
direct prerequisite, target missing final ownership, and independent
mutations to Task129-MFA candidate, review, prerequisite, integration,
release-event, and blob fields. The same consolidated test exercises a real
ten-record prefix through fake Git/command adapters and rejects missing,
non-blob, stale final-owner, and command-failing prefix evidence before any
incomplete-closure result.

- [ ] **Step 3: Run the causal RED**

```bash
node --test scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs
```

Expected: exit nonzero because v3 is absent and the checker still requires v2.
Commit the test/claim-only reproducible RED.

- [ ] **Step 4: Implement the v3 contract and verifier**

Copy v2 to v3 without changing v2. Add only the design's top-level
`releaseCompatibility`, three Task129-MFA transfers, Task137B-W direct
prerequisite, ten final-owned paths, and corrected Task137B-W command. Update
the checker to:

- load only v3 by default;
- validate the exact compatibility shape, record hash, and three tuples;
- include graph plus compatibility in the frozen v3 fingerprint;
- hash compact canonical `JSON.stringify(record)` and require the pinned
  Task129-MFA SHA before applying historical dispositions;
- compare a release entry to its declared historical disposition only for the
  three exact tuples;
- preserve exact candidate/integration blob checks;
- skip current-HEAD equality for the three transferred source paths and
  require it for each Task137B-W final owner;
- leave every undeclared disposition mismatch rejected.
- parse a strict contiguous prefix separately from 29-card closure, verify the
  prefix's Git evidence and exact commands, recheck checkout state, and emit
  `TASK136_REPOSITORY_PREFIX_OK records=N commands=N` before incomplete
  closure is reported.

- [ ] **Step 5: Run identical GREEN and contract markers**

```bash
node --test scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs
node scripts/resident-agent/assurance/task136-bounded-assurance.mjs --mode contract
```

Expected: exactly 14 Node tests pass and the contract command emits exactly
once each:

```text
TASK136_RELEASE_GRAPH_OK records=29
TASK136_COMPOSITION_CORPUS_OK green=1 red=20
TASK136_COMMAND_CARDS_OK cards=29
TASK136_ABI_CORPUS_OK green=1 red=15
```

- [ ] **Step 6: Commit and run clean repository admission**

After committing the GREEN candidate, run:

```bash
set +e
output="$(node scripts/resident-agent/assurance/task136-bounded-assurance.mjs --mode repository 2>&1)"
status=$?
set -e
printf '%s\n' "$output"
test "$status" -ne 0
test "$(printf '%s\n' "$output" | grep -c '^TASK136_REPOSITORY_PREFIX_OK records=10 commands=10$')" -eq 1
test "$(printf '%s\n' "$output" | grep -c '^repository release closure incomplete: expected 29 records, found 10$')" -eq 1
sha256sum docs/agentic/contracts/task136-bounded-assurance-v1.json \
  docs/agentic/contracts/task136-bounded-assurance-v2.json
git diff --check "$DISPATCH_BASE" HEAD
actual_paths="$(git diff --name-only "$DISPATCH_BASE" HEAD | sort)"
expected_paths="$(printf '%s\n' \
  'docs/agentic/claims/task-136-task137b-wake-schema-ownership-correction.md' \
  'docs/agentic/contracts/task136-bounded-assurance-v3.json' \
  'scripts/resident-agent/assurance/task136-bounded-assurance.mjs' \
  'scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs' | sort)"
test "$actual_paths" = "$expected_paths"
npm run factory:check
test -z "$(git status --porcelain=v1)"
test ! -L node_modules
```

Expected immutable hashes are the two Global Constraints values. No full
verifier runs.

- [ ] **Step 7: Dual review and coordinator integration**

Dispatch two fresh read-only Terra/xhigh reviewers at the exact candidate.
Review work does not authorize SDD. One reviews architecture/invariants; one
reproduces 14 tests, markers, ten-record/ten-command prefix evidence, finite
mutations, exact scope, hashes, and clean-state checks. After dual
**APPROVED**, the coordinator
cherry-picks the complete claim/RED/GREEN chain onto the program branch and
repeats Step 6.

---

### Task 2: Implement Task137B-W Against V3

**Branch:** `codex/task137b-wake-runtime-v3`

**Files:**
- Create: `packages/local-runtime/src/wake-supervisor-runtime.ts`
- Create: `packages/local-runtime/src/mounted-wake-lifecycle-store.ts`
- Create: `packages/local-runtime/test/wake-supervisor-runtime.test.ts`
- Create: `packages/local-runtime/test/mounted-wake-lifecycle-store.test.ts`
- Create: `packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts`
- Modify: `packages/local-runtime/test/support/task137-authority-boundary-policy.ts`
- Modify: `packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts`
- Modify: `packages/ontology/src/contracts.ts`
- Create: `packages/ontology/test/resident-wake-contracts.test.ts`
- Create: `docs/agentic/claims/task-137-resident-full-vision-w2-wake-supervisor-runtime.md`

**Interfaces:**
- Consumes: released Task135B, released T120-R, released Task129-MFA,
  integrated v3 contract, `createWakeSupervisor`,
  `createPortableWorkspaceLifecyclePorts`,
  `registerMountedArtifactAuthorityIssuerForWakeRuntime`, and the exact
  factory-issued `LocalRuntimeHandle`.
- Produces: seven canonical ontology lifecycle contracts, an unchanged-size
  Task137 8/20 policy corpus with one newly permitted direct lifecycle import,
  a mounted lifecycle store rebuilt from the exact handle/ledger, and a
  non-public wake runtime registered for factory-only authority operation
  issuance.

- [ ] **Step 1: Claim the exact ten paths**

Set `TASK2_BASE="$(git rev-parse HEAD)"` before changing any file. Record that
exact integrated Task 1 SHA, all three released prerequisite records,
exact current blobs for the consumed authority/runtime contracts, explicit
task-scoped SDD/TDD approval, and Global Constraints. Commit before tests.

- [ ] **Step 2: Add the causal RED corpus**

Create exactly 35 new tests across the four Task137B-W suites:

- `resident-wake-contracts.test.ts`: 10 tests;
- `mounted-wake-lifecycle-store.test.ts`: 12 tests;
- `wake-supervisor-runtime.test.ts`: 9 tests;
- `wake-supervisor-runtime-imports.test.ts`: 4 tests.

The corpus must cover every accepted wake event, strict stream/actor/
causation/readback binding, secret-safe hostile payloads, restart rebuild,
foreign lease distinction, idempotent reconciliation, swapped/regressed
facts, invalidation during awaited operations, no fallback path, no public
issuer, stop-before-return invalidation, one-admission operation issuance,
fresh-process recovery, and the zero-before-R0/one-after-R0 importer rule.
Modify the existing four-test policy suite without changing its test count;
replace, do not add, corpus fixtures so it still emits exactly
`TASK137_POLICY_CORPUS_OK allowed=8 rejected=20`.
Include the three exact plan titles:

```text
wake runtime registers one non public authority issuer after complete admission
stopped runtime cannot issue or inspect an authority operation
fresh process runtime requires new admission and emits a distinct operation
```

- [ ] **Step 3: Run and commit RED**

```bash
npm test -- packages/local-runtime/test/wake-supervisor-runtime.test.ts packages/local-runtime/test/mounted-wake-lifecycle-store.test.ts packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts packages/ontology/test/resident-wake-contracts.test.ts
```

Expected: exit nonzero because the two runtime modules and seven canonical
event registrations are absent. Commit only tests plus claim.

- [ ] **Step 4: Implement the canonical wake schemas and mounted runtime**

Add only the seven frozen event payload schemas/contracts to
`packages/ontology/src/contracts.ts`. Update the transferred Task137 policy to
permit exactly one additional direct static value import:
`wake-supervisor-runtime.ts` importing
`createPortableWorkspaceLifecyclePorts` from
`portable-workspace-lifecycle.ts`. Replace the existing allowed registrar
fixture so it proves both permitted imports, and replace the former
wrong-protected-module lifecycle fixture with a still-invalid protected-module
case; preserve exactly 8 accepted and 20 rejected fixtures.

Implement the original Task137B behavior
from `2026-07-14-resident-agent-factory-authority-recovery-implementation.md`
lines 4893-4974 against the actual merged APIs. The constructor accepts no raw
ledger, paths, mounted-facts callback, authority callback, lifecycle bundle,
stores, or fallback. The mounted store derives and validates exact facts from
the handle and ledger, rereads after awaited work, and returns only exact
durable readback. The runtime exposes no authority issuer, operation, ports,
facts, paths, stores, or writer. `stop()` invalidates authority before return.

- [ ] **Step 5: Run exact GREEN commands**

```bash
npm test -- packages/local-runtime/test/wake-supervisor-runtime.test.ts packages/local-runtime/test/mounted-wake-lifecycle-store.test.ts packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts packages/ontology/test/resident-wake-contracts.test.ts
```

Expected: exactly **5 files / 39 tests** pass with exactly one
`TASK137_POLICY_CORPUS_OK allowed=8 rejected=20` marker.

```bash
npm test -- packages/ontology/test/resident-wake-contracts.test.ts packages/local-runtime/test/mounted-wake-lifecycle-store.test.ts packages/local-runtime/test/wake-supervisor-runtime.test.ts packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts packages/local-runtime/test/mounted-artifact-authority-operation.test.ts packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts packages/local-runtime/test/portable-workspace-lifecycle.test.ts packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts packages/agent/test/wake-supervisor.test.ts
```

Expected: exactly **9 files / 123 tests** pass with exactly one
`TASK137_POLICY_CORPUS_OK allowed=8 rejected=20` marker.

- [ ] **Step 6: Commit GREEN, then run bounded static admission**

Stage exactly the ten owned paths and commit the GREEN candidate before the
materialized gate. The gate's checkout stage intentionally rejects uncommitted
or staged changes.

```bash
npm run typecheck
git add packages/local-runtime/src/wake-supervisor-runtime.ts \
  packages/local-runtime/src/mounted-wake-lifecycle-store.ts \
  packages/local-runtime/test/wake-supervisor-runtime.test.ts \
  packages/local-runtime/test/mounted-wake-lifecycle-store.test.ts \
  packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts \
  packages/local-runtime/test/support/task137-authority-boundary-policy.ts \
  packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts \
  packages/ontology/src/contracts.ts \
  packages/ontology/test/resident-wake-contracts.test.ts \
  docs/agentic/claims/task-137-resident-full-vision-w2-wake-supervisor-runtime.md
git commit -m "feat: add mounted wake supervisor runtime"
candidate="$(git rev-parse HEAD)"
if ! output="$(timeout 600 bash scripts/resident-agent/assurance/task137-terminal-gate.sh </dev/null)"; then
  printf '%s\n' "$output" >&2
  exit 1
fi
printf '%s\n' "$output"
markers="$(printf '%s\n' "$output" | grep '^TASK137_GATE_')"
expected="$(printf '%s\n' \
  'TASK137_GATE_STAGE_OK tests' \
  'TASK137_GATE_STAGE_OK typecheck' \
  'TASK137_GATE_STAGE_OK source-policy' \
  'TASK137_GATE_STAGE_OK package-boundary' \
  'TASK137_GATE_STAGE_OK factory-readiness' \
  'TASK137_GATE_STAGE_OK checkout' \
  'TASK137_GATE_COMPLETE stages=6')"
test "$markers" = "$expected"
git diff --check "$TASK2_BASE" HEAD
npm run factory:check
actual_paths="$(git diff --name-only "$TASK2_BASE" HEAD | sort)"
expected_paths="$(printf '%s\n' \
  'docs/agentic/claims/task-137-resident-full-vision-w2-wake-supervisor-runtime.md' \
  'packages/local-runtime/src/mounted-wake-lifecycle-store.ts' \
  'packages/local-runtime/src/wake-supervisor-runtime.ts' \
  'packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts' \
  'packages/local-runtime/test/mounted-wake-lifecycle-store.test.ts' \
  'packages/local-runtime/test/support/task137-authority-boundary-policy.ts' \
  'packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts' \
  'packages/local-runtime/test/wake-supervisor-runtime.test.ts' \
  'packages/ontology/src/contracts.ts' \
  'packages/ontology/test/resident-wake-contracts.test.ts' | sort)"
test "$actual_paths" = "$expected_paths"
test -z "$(git status --porcelain=v1)"
test ! -L node_modules
```

The materialized gate must emit the exact ordered marker sequence above, with
one `TASK137_GATE_COMPLETE stages=6`. No full verifier runs.

- [ ] **Step 7: Dual review and coordinator integration**

Dispatch two fresh read-only Terra/xhigh reviewers at the exact candidate.
Review work does not authorize SDD. The architecture reviewer verifies mounted
authority, append-only readback, restart reconstruction, no public capability,
and no fallback. The executability reviewer reproduces committed RED, 39/123
GREEN counts, one policy marker, typecheck, terminal marker, exact ten-path scope,
factory readiness, and clean state. After dual **APPROVED**, the coordinator
cherry-picks the complete claim/RED/GREEN chain onto the program branch and
repeats Steps 5-6 from integrated bytes.

---

### Task 3: Release Task137B-W As Record 11

**Files:**
- Modify: `docs/agentic/resident-agent-full-vision-program-registry.md`

**Interfaces:**
- Consumes: exact Task137B-W candidate, two approvals, integration revision,
  released Task135B/T120-R/Task129-MFA records, and ten integrated blob IDs.
- Produces: `task136-dispatch-release.v4` record 11.

- [ ] **Step 1: Append integration evidence and the strict record**

Record the exact candidate, reviewer task IDs/verdicts, integration SHA,
prerequisite integration/release IDs in v3 order, all ten path dispositions
and blob IDs, exact command counts, static markers, and no-full-verify fact.

- [ ] **Step 2: Commit and assert the finite checkpoint**

```bash
RELEASE_BASE="$(git rev-parse HEAD)"
git diff --check
npm run factory:check
git add docs/agentic/resident-agent-full-vision-program-registry.md
git commit -m "docs: release task137b wake runtime"
actual_paths="$(git diff --name-only "$RELEASE_BASE" HEAD | sort)"
expected_paths="docs/agentic/resident-agent-full-vision-program-registry.md"
test "$actual_paths" = "$expected_paths"
set +e
output="$(node scripts/resident-agent/assurance/task136-bounded-assurance.mjs --mode repository 2>&1)"
status=$?
set -e
printf '%s\n' "$output"
test "$status" -ne 0
test "$(printf '%s\n' "$output" | grep -c '^TASK136_REPOSITORY_PREFIX_OK records=11 commands=11$')" -eq 1
test "$(printf '%s\n' "$output" | grep -c '^repository release closure incomplete: expected 29 records, found 11$')" -eq 1
test -z "$(git status --porcelain=v1)"
test ! -L node_modules
```

The next graph card is then
`W1-123-H-SHARED-SCHEMA`. Task139 and every later card remain governed by
strict parser order and released prerequisites.
