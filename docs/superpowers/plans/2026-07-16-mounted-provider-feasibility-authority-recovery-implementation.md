# Mounted Provider Feasibility Authority Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` only when the implementation prompt
> explicitly approves it. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an authenticated mounted-runtime path for durable Codex/xAI
official-flow unavailability, migrate Task136 to a finite 29-card graph, and
release the corrected provider prefix without unlocking Task139.

**Architecture:** Codex and xAI remain pure provider-specific classifiers. A
new local-runtime recorder consumes their strict absence classification only
with the exact factory-issued mounted authority operation, appends a dedicated
ontology event, rereads it from the current portable ledger, and revalidates
currentness before returning unavailable.

**Tech Stack:** TypeScript strict mode, Zod, Vitest, Node.js ESM and
`node:test`, Git SHA-1 evidence, append-only `EventLedger`, existing portable
workspace lifecycle and Task136/Task137 assurance scripts.

## Global Constraints

- Governing design:
  `docs/superpowers/specs/2026-07-16-mounted-provider-feasibility-authority-recovery-design.md`.
- Preserve append-only ledger semantics, provenance, projection rebuildability,
  mounted-workspace currentness, human approval gates, and secret safety.
- `agent_default` is the only resident identity. Providers and harnesses are
  backends, not agents or authority sources.
- The three existing Task126/127/128 v4 registry records remain byte-for-byte
  unchanged.
- `task136-dispatch-release.v4`, its heading prefix, and release-event ID format
  do not change.
- `task136-bounded-assurance-v1.json` remains immutable history.
- Task137 remains a finite owner/import policy; no general JavaScript analyzer
  work is permitted.
- Normalize untrusted data once before append, read, provider, blob, or `await`.
- No provider, network, credential, OAuth, external service, live Nous, full
  `npm run verify`, push, reset, Task139 work, or `neo` action is authorized.
- Every implementation prompt must explicitly approve task-scoped
  `superpowers:subagent-driven-development` when relevant. Review, audit, and
  design work does not authorize it.
- The coordinator alone integrates candidates and appends release records.

## Ownership

| Task | Sole writer | Files |
| --- | --- | --- |
| 1 | Task136 v2 implementer | `docs/agentic/contracts/task136-bounded-assurance-v2.json`; `scripts/resident-agent/assurance/task136-bounded-assurance.mjs`; `scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs`; `docs/agentic/claims/task-136-v2-mounted-feasibility-release-graph.md` |
| 2 | Read-only reviewers; coordinator registry writer | No reviewer files; append-only `docs/agentic/resident-agent-full-vision-program-registry.md` by coordinator only |
| 3 | Read-only re-attestation reviewers; coordinator registry writer | No reviewer files; append-only registry by coordinator only |
| 4 | Task129-MFA implementer | The exact eleven Task129-MFA owned paths listed in Task 4 |
| 5A | Task129 implementer | `packages/agent/src/codex-subscription-harness.ts`; `packages/agent/test/codex-subscription-harness.test.ts`; `docs/agentic/claims/task-129-resident-full-vision-codex-harness.md` |
| 5B | Task130 implementer | `packages/agent/src/xai-subscription-harness.ts`; `packages/agent/test/xai-subscription-harness.test.ts`; `docs/agentic/claims/task-130-resident-full-vision-xai-harness.md` |
| 6 | Coordinator | Append-only program registry only |

Task 5A and Task 5B may run in parallel after Task129-MFA integrates. Every
other task is ordered. No two active writers share a file.

### Task 1: Migrate Task136 To Immutable V2

**Branch:** `codex/task136-v2-mounted-feasibility-release-graph`

**Files:**
- Create: `docs/agentic/contracts/task136-bounded-assurance-v2.json`
- Modify: `scripts/resident-agent/assurance/task136-bounded-assurance.mjs`
- Modify: `scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs`
- Create: `docs/agentic/claims/task-136-v2-mounted-feasibility-release-graph.md`

**Interfaces:**
- Consumes: immutable v1 contract, the three strict v4 prefix records, and
  `RV-1-E-597`.
- Produces: `task136-bounded-assurance.v2`,
  `task136-release-graph.v2`, a frozen 29-card graph fingerprint, and
  repository closure expecting 29 records.

- [ ] **Step 1: Claim the four paths**

Record exact program base, design/plan SHA, the v1 contract blob SHA, the three
existing v4 record hashes, explicit task-scoped SDD/TDD approval, and the
prohibition on changing v1 or the mutable v4 schema.

- [ ] **Step 2: Add causal RED coverage**

Change the Node test to require v2 and exactly 29 cards. Add assertions that:

```js
assert.equal(contract.schemaVersion, "task136-bounded-assurance.v2");
assert.equal(contract.releaseGraph.version, "task136-release-graph.v2");
assert.equal(result.records, 29);
assert.equal(result.commands.get("Task129-MFA"),
  "npm test -- packages/agent/test/official-flow-feasibility.test.ts packages/ontology/test/agent-contracts.test.ts packages/local-runtime/test/mounted-artifact-authority-operation.test.ts packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts packages/local-runtime/test/mounted-official-flow-feasibility.test.ts");
```

Add one graph mutation for missing `Task129-MFA`, one for Task129 without the
MFA prerequisite, one for Task137A missing its four-path transfer, one for
Task137B-W reclaiming `packages/ontology/src/contracts.ts`, and one regression
that hashes the v1 file before and after the test unchanged. Keep the existing
eleven Node tests and add one consolidated v2 preservation/graph test, for an
exact GREEN total of twelve.

- [ ] **Step 3: Run RED**

```bash
node --test scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs
```

Expected: FAIL because v2 does not exist and the checker still requires the
28-card v1 graph.

- [ ] **Step 4: Create v2 and update the checker**

Copy the v1 composition grammar and both corpora without changing their JSON
values. Set authority to the same registry path and `RV-1-E-597`. Encode the
exact 29-card order, dependencies, Task137A transfer, Task129-MFA ownership and
command, and Task137B-W ownership correction from the design.

Update the checker constants to load v2, require 29 unique cards, validate the
new frozen graph SHA-256, preserve v4 release parsing, and emit:

```text
TASK136_RELEASE_GRAPH_OK records=29
TASK136_COMPOSITION_CORPUS_OK green=1 red=20
TASK136_COMMAND_CARDS_OK cards=29
TASK136_ABI_CORPUS_OK green=1 red=15
```

- [ ] **Step 5: Run identical GREEN**

```bash
node --test scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs
```

Expected: `12` tests pass.

- [ ] **Step 6: Run bounded candidate admission**

```bash
node scripts/resident-agent/assurance/task136-bounded-assurance.mjs --mode contract
if repository_output="$(node scripts/resident-agent/assurance/task136-bounded-assurance.mjs --mode repository 2>&1)"; then
  echo "repository mode unexpectedly passed before release population" >&2
  exit 1
fi
printf '%s\n' "$repository_output" | grep -F \
  'repository release closure incomplete: expected 29 records, found 3'
git diff --check
npm run factory:check
test -z "$(git status --porcelain --untracked-files=no)"
test ! -L node_modules
```

Expected contract markers are exactly `29/1/20/29/1/15`. Repository mode must
exit nonzero with the exact 29/3 message before any command card runs. Do not
run full verification.

- [ ] **Step 7: Commit and stop**

```bash
git add docs/agentic/contracts/task136-bounded-assurance-v2.json \
  scripts/resident-agent/assurance/task136-bounded-assurance.mjs \
  scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs \
  docs/agentic/claims/task-136-v2-mounted-feasibility-release-graph.md
git commit -m "test: version task136 mounted feasibility graph"
```

Report exact SHA, four paths, RED/GREEN output, graph fingerprint, v1 blob SHA
before/after, contract markers, expected repository failure, and confirmation
that full verification was not run.

### Task 2: Review And Integrate V2

**Owner:** Coordinator; two fresh reviewers are read-only.

- [ ] **Step 1: Coordinator admission**

Rerun Task 1 Step 6 at the exact candidate SHA. Verify the v1 blob is unchanged,
the three registry record JSON blocks are byte-identical, the branch is one
clean scoped lineage, and no record parser/schema change occurred.

- [ ] **Step 2: Two exact-revision reviews**

Architecture review covers topology, transfer/final ownership, append-only
record preservation, mounted-authority dependency, and Task139 closure.
Executability review covers the 29-card fingerprint, finite graph mutations,
exact commands, v1 immutability, marker counts, 29/3 failure order, and no
command execution on incomplete closure. Review work does not authorize SDD.

- [ ] **Step 3: Integrate into the program branch**

After two unqualified `APPROVED` verdicts, cherry-pick the exact candidate,
rerun admission, append one registry event with candidate/reviewer/integration
evidence, and commit. Do not push or touch `neo`.

### Task 3: Re-Attest And Release Task135D And Task137A

**Owner:** Read-only reviewers and coordinator only; no implementation writer.

- [ ] **Step 1: Freeze one exact post-v2 checkpoint**

Require clean checkout, v2 contract mode, expected 29/3 repository failure,
and literal blobs for every Task135D and Task137A path at the checkpoint.

- [ ] **Step 2: Dispatch two fresh re-attestation reviewers**

Both reviewers inspect both cards against v2 and run:

```bash
npm test -- packages/local-runtime/test/runtime-handle-mounted-authority.test.ts packages/local-runtime/test/runtime-handle-mounted-authority-imports.test.ts
npm test -- packages/local-runtime/test/portable-workspace-lifecycle.test.ts packages/local-runtime/test/mounted-artifact-authority-operation.test.ts packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts
npm run typecheck
git diff --check
npm run factory:check
```

They must separately return `APPROVED Task135D` and `APPROVED Task137A` for the
same exact checkpoint and verify Task137A's four transferred paths. Review work
does not authorize SDD, edits, or release records. The exact expected Vitest
counts before Task129-MFA changes any transferred path are `12` tests for
Task135D and `26` tests for Task137A; the Task137A command emits exactly one
`TASK137_POLICY_CORPUS_OK allowed=8 rejected=20` marker.

- [ ] **Step 3: Append strict v4 records**

The coordinator independently reruns both commands, calculates every literal
blob ID, and appends Task135D then Task137A records. Task137A's prerequisite
entry binds the new Task135D release exactly. Commit each registry append
separately.

- [ ] **Step 4: Verify the new prefix**

Repository mode must fail before executing unreleased suffix commands with:

```text
repository release closure incomplete: expected 29 records, found 5
```

### Task 4: Implement Task129-MFA

**Branch:** `codex/task129-mounted-provider-feasibility-authority`

**Files:**
- Create: `packages/agent/src/official-flow-feasibility.ts`
- Create: `packages/agent/test/official-flow-feasibility.test.ts`
- Modify: `packages/ontology/src/contracts.ts`
- Modify: `packages/ontology/test/agent-contracts.test.ts`
- Modify: `packages/local-runtime/src/mounted-artifact-authority-operation.ts`
- Modify: `packages/local-runtime/test/mounted-artifact-authority-operation.test.ts`
- Modify: `packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts`
- Modify: `packages/local-runtime/test/support/task137-authority-boundary-policy.ts`
- Create: `packages/local-runtime/src/mounted-official-flow-feasibility.ts`
- Create: `packages/local-runtime/test/mounted-official-flow-feasibility.test.ts`
- Create: `docs/agentic/claims/task-129-mfa-mounted-provider-feasibility.md`

**Interfaces:**
- Consumes: v2-released Task137A operation and current mounted ledger.
- Produces: strict `agent-official-flow-absence.v1`, ontology event
  `agent.provider.feasibility.observed.v1`, mounted append/readback recorder,
  and Task137 grammar/corpus v2 with unchanged 8/20 marker.

- [ ] **Step 1: Claim all eleven paths**

Record exact Task137A release, v2 contract hash, explicit task-scoped SDD/TDD
approval, no external activity, and the exact RED/GREEN command below.

- [ ] **Step 2: Write causal RED tests**

Add strict classification tests for both provider families, canonical `ws_`
workspace IDs, family/provider/flow mismatches, accessors, custom prototypes,
sparse arrays, unknown keys, secret-like values, source/causation mismatch,
classification-hash mismatch, and attempt IDs outside exact
`/^attempt_[a-f0-9]{64}$/` form.

Add ontology tests that accept one exact agent-authored event and reject wrong
stream, human/system actor, wrong resident/workspace/mount/task/attempt/run,
unsafe fields, unknown fields, wrong outcome/category, empty provenance, and
secret-shaped material.

Add mounted recorder tests for:

- Codex and xAI append plus exact stream readback;
- exact source-event existence and causation membership;
- idempotent duplicate reuse without a second append;
- duplicate-key disagreement;
- one bounded concurrency reread;
- append-success/readback-failure recovery on identical retry;
- no-op/event-shaped fake evidence rejection;
- copied, forged, stale, closed, burned, non-mounted, cross-workspace,
  cross-mount, cross-policy, post-await-mutated, accessor, proxy, and hostile
  ledger results;
- operation currentness after every `await`;
- no fallback writes and no raw errors or secret material in results; and
- Task137 grammar/corpus v2 with exactly eight accepted and twenty rejected
  fixtures, including the sole new bridge owner.

The exact test allocation is twelve tests in the new shared-classification
file, eight new cases added to the existing sixty-two ontology agent-contract
tests, six new cases added to the existing eleven authority-operation tests,
the existing four import-policy tests with updated v2 fixtures, and eighteen
tests in the new mounted-recorder file. GREEN therefore means exactly five
files and `121` tests.

- [ ] **Step 3: Run RED**

```bash
npm test -- packages/agent/test/official-flow-feasibility.test.ts packages/ontology/test/agent-contracts.test.ts packages/local-runtime/test/mounted-artifact-authority-operation.test.ts packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts packages/local-runtime/test/mounted-official-flow-feasibility.test.ts
```

Expected: FAIL because the shared classification, event, bridge, and v2 owner
map do not exist.

- [ ] **Step 4: Implement the minimum authority bridge**

Implement the exact design. Do not add provider posture to
`PortableWorkspaceMountedFacts`. Do not export the new private inspection seam
from a package index. Do not accept a `LocalRuntimeHandle`, ledger callback,
mounted owner, append function, or readback function from the caller. Use the
operation's captured ledger only.

Normalize all external values before the first `await`; reread source events,
append with global-count concurrency, reread the exact stream event, compare
the full event, and reinspect current operation state after each async boundary.
Permit one concurrency reread only.

- [ ] **Step 5: Run identical GREEN**

```bash
npm test -- packages/agent/test/official-flow-feasibility.test.ts packages/ontology/test/agent-contracts.test.ts packages/local-runtime/test/mounted-artifact-authority-operation.test.ts packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts packages/local-runtime/test/mounted-official-flow-feasibility.test.ts
```

Expected: `5` files and `121` tests pass and output exactly one
`TASK137_POLICY_CORPUS_OK allowed=8 rejected=20` marker.

- [ ] **Step 6: Run bounded candidate admission**

```bash
npm run typecheck
git diff --check
npm run factory:check
node scripts/resident-agent/assurance/task136-bounded-assurance.mjs --mode contract
test -z "$(git status --porcelain --untracked-files=no)"
test ! -L node_modules
```

Expected Task136 markers remain `29/1/20/29/1/15`. Do not run full
verification.

- [ ] **Step 7: Commit and stop**

```bash
git add packages/agent/src/official-flow-feasibility.ts \
  packages/agent/test/official-flow-feasibility.test.ts \
  packages/ontology/src/contracts.ts \
  packages/ontology/test/agent-contracts.test.ts \
  packages/local-runtime/src/mounted-artifact-authority-operation.ts \
  packages/local-runtime/test/mounted-artifact-authority-operation.test.ts \
  packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts \
  packages/local-runtime/test/support/task137-authority-boundary-policy.ts \
  packages/local-runtime/src/mounted-official-flow-feasibility.ts \
  packages/local-runtime/test/mounted-official-flow-feasibility.test.ts \
  docs/agentic/claims/task-129-mfa-mounted-provider-feasibility.md
git commit -m "feat: add mounted provider feasibility authority"
```

Report exact SHA, eleven paths, RED/GREEN evidence, test count, 8/20 marker,
typecheck/factory/diff evidence, Task136 markers, and no-full-verify evidence.

### Task 4 Review, Integration, And Release

- [ ] **Step 1: Coordinator admission**

Rerun Task 4 Steps 5 and 6, inspect exact ancestry from released Task137A,
verify all eleven paths and no public index/package export, and confirm no
provider/network/credential code path exists.

- [ ] **Step 2: Two fresh exact-revision reviews**

Architecture review covers trust root, package direction, advisory event
semantics, append-only evidence, currentness, no fallback, and no forged
issuer. Executability review covers hostile objects, exact readback,
idempotency, bounded concurrency, post-await mutation, Task137 v2 owner map,
termination, markers, and exact commands. Review work does not authorize SDD.

- [ ] **Step 3: Integrate and release**

After dual approval, integrate to the program branch, rerun admission, append
the strict Task129-MFA v4 record with Task137A prerequisite evidence, and
commit. Repository mode must then fail with `expected 29 records, found 6`.

### Task 5A: Reconstruct Task129 As A Pure Codex Classifier

**Branch:** `codex/task129-pure-codex-official-flow-classifier`

**Files:**
- Modify: `packages/agent/src/codex-subscription-harness.ts`
- Modify: `packages/agent/test/codex-subscription-harness.test.ts`
- Modify: `docs/agentic/claims/task-129-resident-full-vision-codex-harness.md`

**Interfaces:**
- Consumes: released `agent-official-flow-absence.v1` contract.
- Produces: provider-specific absence or interface-only classification; never
  durable unavailable evidence.

- [ ] **Step 1: Write RED and run it**

Add tests requiring absent official flow to return the exact shared Codex
classification with canonical `ws_` workspace, source/causation, approval, and
classification hash. Assert the create/assess inputs reject append callbacks,
authority objects, mounted owners, ledgers, runtime handles, and extra keys.
Retain every prohibited-source fixture and interface-only test. Assert no
result has `kind: "unavailable"`.

```bash
npm test -- packages/agent/test/codex-subscription-harness.test.ts
```

Expected: FAIL because the current harness owns a forgeable persistence port
and uses the provisional workspace prefix.

- [ ] **Step 2: Implement and run identical GREEN**

Remove every persistence/authority interface and callback. Normalize one
snapshot, use the shared classification builder, retain the explicit
interface-only branch, and fail closed for prohibited, malformed, or posture-
mismatched input.

```bash
npm test -- packages/agent/test/codex-subscription-harness.test.ts
npm run typecheck
git diff --check
npm run factory:check
```

Expected: the focused suite retains exactly `16` passing tests. Do not run
full verification.

- [ ] **Step 3: Commit and stop**

```bash
git add packages/agent/src/codex-subscription-harness.ts \
  packages/agent/test/codex-subscription-harness.test.ts \
  docs/agentic/claims/task-129-resident-full-vision-codex-harness.md
git commit -m "fix: make Codex feasibility classification pure"
```

### Task 5B: Reconstruct Task130 As A Pure xAI Classifier

**Branch:** `codex/task130-pure-xai-official-flow-classifier`

**Files:**
- Modify: `packages/agent/src/xai-subscription-harness.ts`
- Modify: `packages/agent/test/xai-subscription-harness.test.ts`
- Modify: `docs/agentic/claims/task-130-resident-full-vision-xai-harness.md`

**Interfaces:**
- Consumes: released `agent-official-flow-absence.v1` contract.
- Produces: provider-specific xAI absence classification; never durable
  unavailable evidence.

- [ ] **Step 1: Write RED and run it**

Require exact xAI shared classification on absent official flow, canonical
`ws_` workspace, provider-family bindings, source/causation, approval, and
classification hash. Retain every xAI-specific prohibited-source fixture.
Reject persistence/authority/ledger/runtime inputs and assert no result has
`kind: "unavailable"` or a generic API-key fallback.

```bash
npm test -- packages/agent/test/xai-subscription-harness.test.ts
```

Expected: FAIL because the current harness returns a persistence-unavailable
block instead of a pure absence classification and accepts the provisional
workspace prefix.

- [ ] **Step 2: Implement and run identical GREEN**

Normalize one snapshot and use the shared xAI classification builder. Keep xAI
credential/flow semantics separate from Codex. Do not add a provider, network,
secret, append, or alternate-backend path.

```bash
npm test -- packages/agent/test/xai-subscription-harness.test.ts
npm run typecheck
git diff --check
npm run factory:check
```

Expected: the focused suite retains exactly `18` passing tests. Do not run
full verification.

- [ ] **Step 3: Commit and stop**

```bash
git add packages/agent/src/xai-subscription-harness.ts \
  packages/agent/test/xai-subscription-harness.test.ts \
  docs/agentic/claims/task-130-resident-full-vision-xai-harness.md
git commit -m "fix: make xAI feasibility classification pure"
```

### Task 5 Review And Integration

- [ ] **Step 1: Admit both candidates independently**

Rerun each exact focused command, typecheck, diff, factory readiness, ancestry
from the Task129-MFA integration, three-path scope, clean state, and absent
dependency link. Confirm neither candidate imports local-runtime or changes the
shared classification module.

- [ ] **Step 2: Dispatch two fresh reviewers per candidate**

Each candidate receives separate architecture/invariant and executability/
adversarial reviews bound to its exact SHA. Reviews verify pure classification,
provider-specific prohibited sources, canonical mounted identifiers, absence
of persistence/authority ports, no unavailable result before mounted readback,
and no provider fallback. Review work does not authorize SDD.

- [ ] **Step 3: Integrate in graph order**

Integrate Task129 first, then integrate Task130 after checking that its
three-path candidate applies cleanly and still has Task129-MFA ancestry. Rerun
both focused suites and bounded admission from the resulting program head.

### Task 6: Append Task129 And Task130 Releases

**Owner:** Coordinator only.

- [ ] **Step 1: Append Task129 v4 record**

Bind exact candidate, two review task IDs, integration, Task129-MFA release,
three literal blobs, and the focused command. Commit the registry only.

- [ ] **Step 2: Append Task130 v4 record**

Repeat with Task130 evidence and the same Task129-MFA prerequisite. Commit the
registry only.

- [ ] **Step 3: Verify the finite stopping point**

```bash
node scripts/resident-agent/assurance/task136-bounded-assurance.mjs --mode contract
if repository_output="$(node scripts/resident-agent/assurance/task136-bounded-assurance.mjs --mode repository 2>&1)"; then
  echo "repository mode unexpectedly passed before the remaining graph" >&2
  exit 1
fi
printf '%s\n' "$repository_output" | grep -F \
  'repository release closure incomplete: expected 29 records, found 8'
git diff --check
npm run factory:check
test -z "$(git status --porcelain --untracked-files=no)"
test ! -L node_modules
```

The next ordinary graph frontier is `Task135B`, which must rebase to the
released Task129-MFA authority paths. Task139 remains blocked until all 29
records exist and repository mode passes.

## Review And Stop Conditions

- A data-loss risk, schema conflict, v1 mutation, changed existing v4 prefix
  record, forged mounted issuer, public authority export, secret material,
  provider/network dependency, unavailable local dependency, or repeated
  focused verifier failure stops the child task and returns evidence to the
  coordinator.
- The coordinator changes tactics after two focused repair attempts; no child
  opens an unbounded Recovery-N loop.
- A reviewer may block only on the frozen design, exact owned files, commands,
  and mutation categories. New hardening ideas are recorded separately and do
  not silently expand acceptance.
- No implementer or reviewer may append its own release record, integrate its
  own candidate, resume Task139, push, reset, or touch `neo`.
