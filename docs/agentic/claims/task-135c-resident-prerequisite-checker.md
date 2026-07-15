# Task 135C Claim: Strict Immutable Resident Prerequisite Checker

- Plan and terminal overlay: `docs/superpowers/plans/2026-07-14-resident-agent-factory-authority-recovery-implementation.md`, Task135C through CF-1R26.
- Worker: `/root`.
- Branch: `codex/task-135c-prerequisite-checker`.
- Worktree: `/home/drake/.codex/worktrees/c734/Cestus`.
- Claimed at: 2026-07-15T00:00:00Z.
- Status: ready-for-review.

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

## RV-1-E-331 Coordinator Recovery (2026-07-15)

The coordinator completed and recorded the root-cause checkpoint as
`RV-1-E-331`, preserved the failed attempt, and moved this clean worktree to
`codex/task-135c-prerequisite-checker-recovery` at
`7bad93c42e0fe6bac8e638119a18c93e84301241`. The one authorized repair binds
the external C `checkerSha256` field to the SHA-256 of the immutable
`C:scripts/check-resident-task-prerequisites.mjs` blob. It must retain the
existing retained-payload hash-and-execute protection and must not reopen a
mutable checker path. No new implementer is authorized.

## RV-1-E-331 Repair Evidence (2026-07-15)

The exact focused recovery RED exited `1` with 13/14 tests passing. Its sole
failure proved that a one-parent registry-only C whose declared
`checkerSha256` was valid lowercase hex but did not match
`C:scripts/check-resident-task-prerequisites.mjs` was incorrectly accepted.
The authorized repair now reads that immutable C blob through the existing
`GIT_NO_REPLACE_OBJECTS=1` Git boundary, hashes its bytes, and requires exact
equality with C's declared hash; it does not read a mutable checker path.

The exact focused GREEN command exited `0` with 14/14 tests passing. The
required static/diff/factory gate also exited `0`: the installed ripgrep rejects
lookahead without PCRE2 (`plain-rg-status=2`), so the equivalent explicit audit
used `rg -P` for the import-specifier clause; it found no violations, `git diff
--check` passed, and `npm run factory:check` reported `factory-readiness
passed`. Full verification and every closed action remain unperformed.
