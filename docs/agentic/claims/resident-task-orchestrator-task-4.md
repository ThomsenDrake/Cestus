# Resident Task Orchestrator Task 4 Claim

## Status

complete-coordinator-commit-pending

## Task

- Plan: `docs/superpowers/plans/2026-07-10-resident-task-orchestrator-implementation.md`
- Task: Task 4, Context Applicability, Resolved Payload Verification, And Leakage Guards
- Worker: Codex resident task orchestrator lane
- Branch: `codex/resident-task-orchestrator-design`
- Worktree: `/home/drake/.codex/worktrees/eb36/Cestus`
- Coordinator boundary: `HEAD 1894fe6a`

## Scope

- `docs/agentic/claims/resident-task-orchestrator-task-4.md`
- `packages/agent/src/task-orchestrator-context.ts`
- `packages/agent/src/task-orchestrator-types.ts`
- `packages/agent/src/task-orchestrator.ts`
- `packages/agent/test/task-orchestrator-context.test.ts`
- `packages/agent/test/prompt-artifacts.test.ts`
- `packages/agent/test/cockpit.test.ts`

Tasks 1-3 remain uncommitted scoped diffs in this managed sandbox and are preserved unchanged. Git staging and commits are intentionally not attempted because linked-worktree Git metadata is read-only.

## RED Evidence

Command:

```bash
npm test -- packages/agent/test/task-orchestrator-context.test.ts packages/agent/test/prompt-artifacts.test.ts packages/agent/test/cockpit.test.ts
```

Result: expected RED.

Observed: all three suites failed during import with `Cannot find module '../src/task-orchestrator-context.js'`. No tests ran. This proves the Task 4 context assembly and safe metadata boundary did not exist before implementation.

## GREEN Evidence

Command:

```bash
npm test -- packages/agent/test/task-orchestrator-context.test.ts packages/agent/test/prompt-artifacts.test.ts packages/agent/test/cockpit.test.ts
```

Result:

```text
Test Files  3 passed (3)
Tests  44 passed (44)
```

The new assembly uses registered workflow applicability before resolving packs, records `prr-read-model.v1` as `no-associated-prr` for non-PRR evidence triage, accepts only registry-branded `VerifiedResolvedContextPack` values through the positional execution assertion, and hands those local values to the prompt renderer. Checkpoint/cockpit/approval-preview/log artifacts use only refs, hashes, byte counts, schema IDs, and provenance event IDs.

Coordinator follow-up added one focused regression before repair:

```bash
npm test -- packages/agent/test/task-orchestrator-context.test.ts
```

Result: expected RED for `does not build context refs separately from resolved payload verification`; the helper called `ContextPackRegistry.build("evidence-summary.v1")` before `buildResolved()`. The repair now derives applicable refs only from the authoritative verified resolved pack returned by `buildResolved()`, avoiding duplicate builder work and keeping execution readiness on the opaque verified result.

Fresh coordinator targeted command:

```bash
npm test -- packages/agent/test/task-orchestrator-context.test.ts packages/agent/test/prompt-artifacts.test.ts packages/agent/test/cockpit.test.ts
```

Result:

```text
Test Files  3 passed (3)
Tests  45 passed (45)
```

## Additional Verification

```bash
npm run typecheck
```

Result: `typecheck passed`.

```bash
git diff --check
```

Result: no output.

Fresh coordinator result: `typecheck passed`.

```bash
git diff --check
```

Result: no output.

```bash
npm run verify
```

Result: failed after `typecheck passed` only in the known managed-sandbox areas: `packages/local-runtime/test/server.test.ts` cannot `listen` on `127.0.0.1` or `0.0.0.0`, `packages/workspace-ops/test/cli.test.ts` cannot create `tsx` IPC pipes under `/tmp/tsx-1000/*.pipe`, and the workspace readiness smoke stdout is empty because its child executable is blocked. Fresh count: 3 failed files, 180 passed, 3 skipped; 19 failed tests, 2140 passed, 3 skipped.

`npm run factory:check` remains blocked in this managed sandbox by the known linked-worktree restriction: `spawnSync git EPERM` while `scripts/check-agent-readiness.mjs` invokes `git ls-files`. Re-run full gates in the unrestricted coordinator environment.

## Commit Boundary

No staging or commit was attempted, as required. The coordinator boundary remains `HEAD 1894fe6a`; Task 1-3 scoped diffs and unrelated pre-existing changes are preserved.

## Reviewer Fix Evidence (2026-07-12)

The Task 4 context helper previously accepted a caller-supplied workflow
descriptor as its source of requirements. Focused RED coverage demonstrated
that a descriptor trimmed to `evidence-summary.v1`, and a PRR-associated scope
whose request ID was absent from `scope.refs`, both returned `dispatchReady`.

The fix requires the canonical workflow descriptor identity, resolves only
applicable packs from `productionSpecialistPromptRegistrationFor(runType)`,
and calls `evaluateProductionContextRequirements()` before readiness. This
preserves the non-PRR `prr-read-model.v1` skip, rejects trimmed and unknown
workflow requirements, requires every applicable canonical resolved pack, and
enforces production parser-authority and PRR-scope checks.

Fresh focused verification:

```text
npm test -- packages/agent/test/task-orchestrator-context.test.ts packages/agent/test/prompt-artifacts.test.ts packages/agent/test/cockpit.test.ts
Test Files  3 passed (3)
Tests  48 passed (48)

npm run typecheck
typecheck passed

git diff --check
(no output)
```

No staging, commit, provider call, scheduler call, approval-gateway call,
runner call, or handoff call was attempted. Full `npm run verify` remains for
the unrestricted coordinator environment because of the managed-sandbox
limitations recorded above.

Coordinator follow-up tightened the hash-mismatch test so it uses the real
`createContextPackRegistry({ payloadResolver })` resolution path and fails from
`blocked.payload-hash-mismatch`, not from an unbranded fake resolved object.

Fresh coordinator verification after the review fix:

```text
npm test -- packages/agent/test/task-orchestrator-context.test.ts packages/agent/test/prompt-artifacts.test.ts packages/agent/test/cockpit.test.ts
Test Files  3 passed (3)
Tests  48 passed (48)

npm run typecheck
typecheck passed

git diff --check
(no output)

npm run verify
typecheck passed
Test Files  3 failed | 180 passed | 3 skipped (186)
Tests  19 failed | 2143 passed | 3 skipped (2165)
```

The failing `npm run verify` areas are unchanged managed-sandbox failures:
local-runtime server `listen EPERM`, workspace-ops `tsx` IPC
`listen EPERM`, and readiness-smoke empty stdout from a blocked child
executable.
