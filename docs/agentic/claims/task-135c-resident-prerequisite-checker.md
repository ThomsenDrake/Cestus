# Task 135C Claim: Strict Immutable Resident Prerequisite Checker

- Plan and terminal overlay: `docs/superpowers/plans/2026-07-14-resident-agent-factory-authority-recovery-implementation.md`, Task135C through CF-1R26.
- Worker: `/root`.
- Branch: `codex/task-135c-prerequisite-checker`.
- Worktree: `/home/drake/.codex/worktrees/c734/Cestus`.
- Claimed at: 2026-07-15T00:00:00Z.
- Status: blocked.

## Coordinator Authorization And Frozen Prerequisites

The coordinator explicitly authorizes
`superpowers:subagent-driven-development` for this exact Task135C assignment,
including the approved TDD, systematic-debugging, and
verification-before-completion workflows.

- Exact source base: `197c3ca528e9b666c02b9b87695bf900efa195b1`.
- CF1 integration: `a321955d84eb700722e08eaa835ddb076fda62b2`.
- Reviewed/coordinator-integrated Task117A: `2ad417356afc00b26ff00fa763977e2469463d72`.
- Task117A external sibling attestation C: `1cde7adb1a3b9fb1621b75410c203eec631a45ba`.
- Corrected Task125 integration: `2e5c35ab7bca33df9f1a0c482c496fbb93350086`.
- Task135A integration: `ac3f91901da0c9b23722a046be73d95746f691da`.

This task does not create a replacement branch, rebase, merge, push, or
self-integrate. The Task135C checker itself verifies future P/R0/H two-file
dispatch commits and their coordinator-issued external sibling attestations.

## Exclusive Scope

- `scripts/check-resident-task-prerequisites.mjs`
- `packages/local-runtime/test/check-resident-task-prerequisites.test.ts`
- this append-only claim

The checker is a standalone stdin-compatible ES module with static `node:`
imports only. It validates immutable `resident-task-prerequisites.v2` dispatch
bundles for `task140p`, `task140r0`, and `task140h` in `preflight` and `review`;
it rejects mutable/replaced Git authority, incorrect prerequisite inventories,
and invalid external coordinator attestations. Full verification, provider,
network, credential, Nous, reset-credit, `neo`, central-registry edits, and
integration actions are closed. The authorized final gates are the focused
Task135C test, static ABI rejection, `git diff --check`, and
`npm run factory:check` only.

## Blocked Evidence (2026-07-15)

The mandatory causal RED command
`npm test -- packages/local-runtime/test/check-resident-task-prerequisites.test.ts`
was attempted before any checker production file existed. It exited `127` with
`sh: line 1: vitest: command not found`; the checkout also has no executable
`node_modules/.bin/vitest`. This is an unavailable dependency rather than the
only accepted checker-absence RED. Per the Task135C stop condition, no package
installation, production checker implementation, or substitute verifier was
attempted. The new uncommitted causal test file remains available for a
coordinator-provided dependency recovery and subsequent valid RED/GREEN cycle.

## Coordinator Dependency Recovery (2026-07-15)

The coordinator restored this worktree's ignored `.env` symlink and its
`node_modules` symlink to the program installation. The executable
`node_modules/.bin/vitest` is available again. This direct worker resumes the
preserved test-only lane without a new implementer and must rerun the exact
focused command, accepting only checker absence as the causal RED before
creating the checker production file.

## Focused Recovery Checkpoint (2026-07-15)

The restored exact RED command reached the required causal failure: 3 valid
controls failed only because
`scripts/check-resident-task-prerequisites.mjs` was absent, while 10 rejection
controls passed. The first checker GREEN attempt exposed a raw-Git-blob newline
loss in manifest hashing; preserving `git show` bytes repaired that issue.
After the focused suite reached 13/13, expanded temporary-repository coverage
exposed a second substantive authority gap: the checker accepted a C block with
a syntactically valid but mismatched `checkerSha256` because it did not bind the
hash to immutable checker bytes in C's tree. Per the two-focused-repair-failure
checkpoint, no third repair is attempted here. The scoped checker and expanded
test fixture are preserved for coordinator recovery; no static ABI, factory,
full verify, provider, network, credential, Nous, `neo`, registry, merge, or
self-integration action has been performed.
