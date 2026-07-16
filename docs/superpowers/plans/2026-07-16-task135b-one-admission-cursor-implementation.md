# Task135B One-Admission Cursor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` and
> `superpowers:test-driven-development` to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the preserved Task135B candidate under the released
one-admission authority model, with exact resident/run/artifact bindings and
hostile-safe ledger normalization.

**Architecture:** The existing opaque Task137A operation remains the sole
mounted authority input. Task135B advances only under the same admission; an
admission identity change permanently burns the old controller, while a fresh
factory-issued operation may create a fresh controller that derives the same
run's canonical phase from ledger readback. Event snapshots are normalized
before serialization and validated as one exact causal handoff chain.

**Tech Stack:** TypeScript, Vitest, append-only knowledge events, private
`WeakMap` capabilities, mounted portable workspace stores.

## Global Constraints

- Governing correction:
  `docs/superpowers/specs/2026-07-16-task135b-one-admission-cursor-design.md`.
- Review checkpoint: program registry event `RV-1-E-647`.
- Preserved starting candidate:
  `bdf7d2a9eb75499d273a5ee2b7900dc3fc3c5d14`.
- Branch/worktree: `codex/task135b-portable-mounted-handoff-stores` at
  `/home/drake/.codex/worktrees/task135b-portable-mounted-handoff-stores`.
- The implementation ceiling is exactly three paths:
  `packages/local-runtime/src/portable-mounted-agent-artifact-stores.ts`,
  `packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts`,
  and `docs/agentic/claims/task-135b-portable-mounted-handoff-stores.md`.
- Do not edit Task137A, the runtime factory, an index, a route, a DTO, a
  projection, a ledger implementation, a provider, or a credential module.
- Do not add an issuer, revalidator, lifecycle input, admission input, path,
  root, store, ledger, callback, or config parameter to a public or private
  Task135B constructor.
- Preserve append-only ledger semantics, provenance, projection
  rebuildability, human approval gates, and legal escalation locks.
- Do not run `npm run verify`. Do not use a provider, network, credential,
  external service, push, reset, Task139, or any `neo` action.
- The RED and GREEN focused command is identical. The RED commit must remain
  in history so a reviewer can reproduce the failure independently.
- No two writers overlap. One implementation worker owns Tasks 1-2. The
  coordinator alone owns Tasks 3-4 and registry appends. Reviewers are
  read-only.

---

### Task 1: Freeze The Corrected Twenty-Case Contract As A Reproducible RED

**Files:**
- Modify:
  `packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts`
- Modify: `docs/agentic/claims/task-135b-portable-mounted-handoff-stores.md`

**Interfaces:**
- Consumes: exact rejected candidate
  `bdf7d2a9eb75499d273a5ee2b7900dc3fc3c5d14` and design
  `task135b-one-admission-cursor-design`.
- Produces: one test-only RED commit containing exactly 20 focused Vitest
  cases and no production-source change.

- [ ] **Step 1: Verify the immutable starting point**

```bash
test "$(git rev-parse HEAD)" = "bdf7d2a9eb75499d273a5ee2b7900dc3fc3c5d14"
test -z "$(git status --porcelain)"
test ! -L node_modules
```

Expected: all commands exit `0`.

- [ ] **Step 2: Append the correction claim**

Append a `Task135B one-admission correction` section to the existing claim.
Record the design and plan paths, `RV-1-E-647`, the exact starting candidate,
the three-path ceiling, status `in-progress`, and the explicit coordinator
authorization for task-scoped `superpowers:subagent-driven-development` and
TDD. Do not copy a mutable recovery number or claim an approval.

- [ ] **Step 3: Freeze exactly 20 focused cases**

Keep all existing behavior, but organize the suite so Vitest collects exactly
20 cases. Four `it.each` rows count as four cases. The exact required titles
for the review-gap cases are:

- `canonical material final output manifest projection and terminal advances one authority cursor`
- `exact resumed handoff derives its phase and remains one shot`
- `admission change burns old controller and fresh operation resumes canonical prefix`
- `identical visible tuple under new admission cannot rotate or revive authority cursor`
- `foreign resident actor cannot advance canonical handoff authority`
- `attempt swapped orchestration cannot advance task status authority`
- `mismatched final prepared recorded and terminal artifacts burn authority`
- `policy lock foreign run and arbitrary wake suffixes return no receipt or terminal authority`
- `hostile ledger values fail before serialization observation or store io`

The fresh-operation test must prove all of these facts:

```ts
await expect(beforeMountedHandoffAuthorityEffect(old.controller, "handoff-prepared"))
  .rejects.toThrow(/authority/i);
const freshOperation = issueMountedArtifactAuthorityOperationForFactory(wakeRuntime);
const fresh = await createPortableMountedAgentArtifactStoreProducer(freshOperation).bind(dispatch);
await expect(beforeMountedHandoffAuthorityEffect(fresh.controller, "handoff-prepared"))
  .resolves.toBeUndefined();
await expect(beforeMountedHandoffAuthorityEffect(old.controller, "handoff-prepared"))
  .rejects.toThrow(/authority/i);
```

The hostile-value fixture must increment an observation counter from an
accessor or `toJSON` method and assert that the counter remains `0`. Construct
each hostile form without reading it in the test setup. The production code,
not a test pre-parser, must reject it.

- [ ] **Step 4: Run the causal RED command**

```bash
npm test -- packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts
```

Expected: exit nonzero. Vitest must collect exactly 20 cases. Failures must
include foreign resident actor, swapped attempt, artifact-chain mismatch, and
hostile normalization. The fresh-operation resume control may pass because the
released one-admission operation already supplies that lifecycle behavior.

- [ ] **Step 5: Commit the reproducible RED**

```bash
git diff --check
git add packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts \
  docs/agentic/claims/task-135b-portable-mounted-handoff-stores.md
git commit -m "test: freeze task135b one-admission authority gaps"
```

The commit changes only the test and claim. Its parent remains the rejected
candidate, so reviewers can checkout this commit and rerun the exact RED.

### Task 2: Implement Normalized Canonical Progression

**Files:**
- Modify:
  `packages/local-runtime/src/portable-mounted-agent-artifact-stores.ts`
- Modify: `docs/agentic/claims/task-135b-portable-mounted-handoff-stores.md`

**Interfaces:**
- Consumes: the Task 1 twenty-case RED and the unchanged
  `MountedArtifactAuthorityOperation` inspection seam.
- Produces: same public/source-private Task135B signatures, one frozen
  normalized event snapshot per read, and a run-bound canonical progression
  state.

- [ ] **Step 1: Normalize the ledger result before any observation**

Add module-private JSON data types and a normalizer equivalent to:

```ts
type NormalizedJson =
  | null
  | boolean
  | number
  | string
  | readonly NormalizedJson[]
  | Readonly<Record<string, NormalizedJson>>;

function normalizeLedgerEvents(value: unknown): readonly NormalizedJson[] {
  // Require a dense Array with Array.prototype, data-only length/index
  // descriptors, no symbols, and no extra keys. Recursively copy only plain
  // own-data objects and dense plain arrays. Reject accessors, functions,
  // undefined, bigint, symbols, boxed values, non-finite numbers, custom/null
  // prototypes, sparse arrays, and every own "toJSON" key. Freeze every copy.
}
```

Do not call `JSON.stringify`, inspect event fields, run currentness checks, or
perform store I/O until `normalizeLedgerEvents` returns. In `inspectCursor`,
use only the frozen normalized result for `deriveInitialState`, suffix
iteration, and byte encoding. `encodeEvents` serializes only normalized copies
and never rereads the ledger result.

- [ ] **Step 2: Bind the one resident identity**

For every relevant event, require both:

```ts
actor.kind === "agent" && actor.id === "agent_default"
```

Also require `startedBy`, `residentAgentId`, `changedBy`, and every compact
handoff `residentAgentId` field to equal `agent_default` where the event schema
contains them.

- [ ] **Step 3: Carry exact final-output and handoff bindings**

Add a private immutable progression binding to `CursorState` and to the result
of `advancePhase`:

```ts
interface CanonicalHandoffBinding {
  readonly finalOutputEventId: string;
  readonly finalOutputStepId: string;
  readonly stepSchemaId: string;
  readonly handoffMaterialArtifactHash: string;
  readonly outputArtifactHashes: readonly string[];
  readonly handoffId?: string;
  readonly handoffRevision?: number;
  readonly handoffManifestHash?: string;
  readonly handoffDtoHash?: string;
  readonly preparedEventId?: string;
  readonly recordedEventId?: string;
  readonly terminalEventId?: string;
  readonly terminalStatus?: "completed" | "failed";
}
```

Normalize every hash/ID array as a dense plain string array and compare it by
length and position. Prepared must bind exact final-output values. Recorded
must repeat the full prepared compact binding and reference the prepared event.
Completed terminal output hashes must equal the prepared output hashes. Failed
terminal `relatedEventIds` must contain the recorded handoff event. Both use
the recorded event as causation.

- [ ] **Step 4: Bind orchestration to the exact attempt**

For `agent.task.orchestration.completed`, require:

```ts
payload.taskId === binding.taskId
payload.runId === binding.approvedRunId
payload.runType === binding.runType
payload.attemptId === binding.attemptId
payload.finalOutputStepEventId === canonical.finalOutputEventId
payload.handoffPreparedEventId === canonical.preparedEventId
payload.handoffRecordedEventId === canonical.recordedEventId
payload.specialistRunCompletedEventId === canonical.terminalEventId
payload.handoffReadback.handoffRecordedEventId === canonical.recordedEventId
payload.handoffReadback.handoffManifestHash === canonical.handoffManifestHash
context.causationId === canonical.terminalEventId
```

For `agent.task.status.changed`, require exact task/run, exact resident
`changedBy`, causation from the orchestration event, and a status matching the
recorded terminal status. The immediately preceding orchestration event is the
only attempt authority; no status event can supply or swap an attempt itself.

- [ ] **Step 5: Preserve one-admission fail-closed behavior**

Do not add successor state or change Task137A. Keep
`assertOriginCurrent(cursor)` as the only operation inspection path. If the
released inspector rejects a changed admission, burn the current controller.
The fresh-operation test issues through the existing test-only factory path and
proves a new Task135B producer derives its phase from the accepted canonical
ledger prefix. The old controller must remain unusable before and after the
fresh bind.

- [ ] **Step 6: Run the identical focused GREEN command**

```bash
npm test -- packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts
```

Expected: exit `0`, exactly `1 file / 20 tests`.

- [ ] **Step 7: Run the complete bounded GREEN command**

```bash
npm test -- \
  packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts \
  packages/local-runtime/test/mounted-artifact-authority-operation.test.ts \
  packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts \
  packages/local-runtime/test/runtime-handle-mounted-authority.test.ts \
  packages/local-runtime/test/runtime-handle-mounted-authority-imports.test.ts \
  packages/local-runtime/test/mounted-agent-artifact-stores.test.ts \
  packages/local-runtime/test/portable-workspace-lifecycle.test.ts \
  packages/agent/test/specialist-handoff-preparation.test.ts \
  packages/agent/test/specialist-handoff-projection.test.ts
```

Expected: exit `0`, exactly `9 files / 120 tests`, with one
`TASK137_POLICY_CORPUS_OK allowed=8 rejected=20` marker.

- [ ] **Step 8: Run bounded static gates and commit**

```bash
npm run typecheck
! rg -n 'PortableMountedAgentArtifactStoreProducerInput|ResolvedLocalRuntimeConfig|MountedPortableWorkspace|configSource|mountedWorkspaceSource|revalidate|WorkspaceAvailabilityAuthority|PortableWorkspaceMountedFactsPort|process\.cwd|\.cestus/local|internal-storage|in-memory-fallback|fallbackRoot' \
  packages/local-runtime/src/portable-mounted-agent-artifact-stores.ts
! rg -n 'portable-mounted-agent-artifact-stores' packages/local-runtime/src/index.ts packages/agent/src/index.ts
git diff --check
npm run factory:check
```

Append exact RED/GREEN receipts, the two commit SHAs, counts, and status
`ready-for-review` to the claim. Then commit:

```bash
git add packages/local-runtime/src/portable-mounted-agent-artifact-stores.ts \
  docs/agentic/claims/task-135b-portable-mounted-handoff-stores.md
git commit -m "fix: bind task135b one-admission handoff authority"
```

Expected cumulative diff from the original Task135B dispatch base: exactly the
same three owned paths. The worktree is clean and `node_modules` is not a
symlink.

### Task 3: Coordinator Admission And Two Exact-Revision Reviews

**Owner:** Coordinator and two fresh read-only reviewers.

**Files:**
- Review only: the three Task135B owned paths and governing docs.
- Coordinator append only:
  `docs/agentic/resident-agent-full-vision-program-registry.md`.

- [ ] **Step 1: Verify lineage and reproduce RED**

```bash
candidate="$(git rev-parse HEAD)"
red_commit="$(git rev-parse HEAD^)"
test "$(git rev-parse "${red_commit}^")" = "bdf7d2a9eb75499d273a5ee2b7900dc3fc3c5d14"
test "$(git diff-tree --no-commit-id --name-only -r "$red_commit" | LC_ALL=C sort)" = "$(printf '%s\n' \
  docs/agentic/claims/task-135b-portable-mounted-handoff-stores.md \
  packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts | LC_ALL=C sort)"
```

Checkout `red_commit` in a disposable read-only worktree, run the focused
command, and require nonzero exit with the named review-gap failures. Return to
`candidate`; do not rewrite either commit.

- [ ] **Step 2: Run final coordinator admission**

Run the focused command from Task 2 Step 6 and require `1 file / 20 tests`.
Run the complete command from Task 2 Step 7 and require
`9 files / 120 tests` plus exactly one Task137 `8/20` marker. Then run:

```bash
npm run typecheck
! rg -n 'PortableMountedAgentArtifactStoreProducerInput|ResolvedLocalRuntimeConfig|MountedPortableWorkspace|configSource|mountedWorkspaceSource|revalidate|WorkspaceAvailabilityAuthority|PortableWorkspaceMountedFactsPort|process\.cwd|\.cestus/local|internal-storage|in-memory-fallback|fallbackRoot' \
  packages/local-runtime/src/portable-mounted-agent-artifact-stores.ts
! rg -n 'portable-mounted-agent-artifact-stores' packages/local-runtime/src/index.ts packages/agent/src/index.ts
test "$(git diff --name-only 44db1ca0c34076c7235da229109614d59ddb4457..HEAD | LC_ALL=C sort)" = "$(printf '%s\n' \
  docs/agentic/claims/task-135b-portable-mounted-handoff-stores.md \
  packages/local-runtime/src/portable-mounted-agent-artifact-stores.ts \
  packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts | LC_ALL=C sort)"
git diff --check
npm run factory:check
test -z "$(git status --porcelain)"
test ! -L node_modules
```

- [ ] **Step 3: Dispatch two fresh exact-revision reviews**

The architecture/invariant reviewer checks one-admission burn/restart,
resident identity, exact run/attempt/artifact causation, append-only semantics,
private operation/controller boundaries, mounted-workspace currentness, and no
path/capability leakage.

The executability/adversarial reviewer reproduces the RED commit, runs the
20-test and 120-test GREEN commands, exercises hostile values, confirms exact
three-path scope and clean physical checkout, and verifies no Task137/API or
acceptance-scope expansion.

Review work does not authorize subagent-driven development, edits, full
verification, integration, release records, Task139, providers, network,
credentials, external services, push, reset, or `neo`. Both reviewers must
return unqualified `APPROVED` for the exact same candidate.

### Task 4: Integrate And Release Task135B On The Program Branch

**Owner:** Coordinator only.

**Files:**
- Cherry-pick: exact Task 1 RED and Task 2 GREEN commits.
- Append:
  `docs/agentic/resident-agent-full-vision-program-registry.md`.

- [ ] **Step 1: Integrate only after dual approval**

On `codex/resident-agent-full-vision-program-watchdog-recovery`, cherry-pick the
two exact Task135B commits in order. Do not merge or push. Rerun Task 3 Step 2
against the integrated revision, substituting the integrated program base for
the candidate-range check and verifying candidate/integration blob equality
for all three owned paths.

- [ ] **Step 2: Append the v4 release record**

Append the exact candidate SHA, both reviewer task IDs and `APPROVED` verdicts,
integration SHA, released Task137A prerequisite, and candidate blob SHAs for
the three owned paths using schema `task136-dispatch-release.v4` and card ID
`Task135B`. Commit only the registry append.

- [ ] **Step 3: Run the finite repository checkpoint**

```bash
node scripts/resident-agent/assurance/task136-bounded-assurance.mjs --mode repository
```

Expected static markers exactly once:

```text
TASK136_RELEASE_GRAPH_OK records=29
TASK136_COMPOSITION_CORPUS_OK green=1 red=20
TASK136_COMMAND_CARDS_OK cards=29
TASK136_ABI_CORPUS_OK green=1 red=15
```

Expected final exit: nonzero with
`repository release closure incomplete: expected 29 records, found 9` until
the remaining ordinary cards are released. This expected finite failure keeps
Task139 blocked; it is not a reason to alter Task136 or start another Task135B
repair.

## Completion Evidence

Task135B is complete for this slice only when:

- the RED commit is independently reproducible;
- focused GREEN is exactly 20 tests;
- aggregate GREEN is exactly 120 tests with one Task137 8/20 marker;
- typecheck, static boundaries, diff checking, and factory readiness pass;
- the candidate changes exactly three owned paths and is clean;
- two fresh reviewers approve the same exact revision;
- candidate blobs equal integrated blobs;
- the registry contains a valid Task135B v4 release record; and
- repository mode reports nine valid records while Task139 remains blocked.
