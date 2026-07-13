# Task 117 Claim: Resident Full-Vision CF-1 Contract Freeze

- Task and gate: Task 117 / CF-1 / Wave 0 completion gate.
- Worker: fresh isolated Task117 contract-freeze author.
- Branch and worktree: `codex/task-117-resident-full-vision-contract-freeze` / `/home/drake/.codex/worktrees/task-117-resident-full-vision-contract-freeze`.
- Base commit: `c996b197bde35aecff3be5120b654e7cc761f145`.
- Claimed at: `2026-07-13T16:22:07Z`.
- Status: `in-progress`.
- Model configuration: GPT-5.6 Terra / Extra High, satisfied by the user-confirmed host-reported GPT-5 posture.

## Scope And Authority

RV-0-C-009 authorizes only these tracked files: this append-only claim,
`docs/agentic/resident-agent-full-vision-contract-freeze.md`, and the
append-only Task117 author evidence in
`docs/agentic/resident-agent-full-vision-program-registry.md`. It authorizes
documentation RED/GREEN as TDD, `superpowers:subagent-driven-development`
where relevant, fresh independent review, and verification-before-completion.
It prohibits production, tests, runtime, UI, provider, browser, credential,
Nous, tailnet, live work, dispatching a Wave 1 child, self-review,
self-integration, and every merge into `neo`.

The freeze may reconcile the eight approved Wave 0B design/plan pairs, but it
cannot create an implementation authorization. R remains the sole default
factory writer, P remains the sole shared provider-configuration writer, and
Task117 remains the sole shared-event/shared-DTO/shared-capability writer.

## Documentation RED Evidence

Before the freeze existed, this focused command exited `1`:

```bash
node --input-type=module -e 'import { existsSync } from "node:fs"; const path = "docs/agentic/resident-agent-full-vision-contract-freeze.md"; if (!existsSync(path)) { console.error("RED: CF-1 contract-freeze artifact is absent; no shared contract/owner/rebase matrix can dispatch Wave 1."); process.exit(1); } console.error("RED expected absence but freeze exists"); process.exit(2);'
```

Observed output: `RED: CF-1 contract-freeze artifact is absent; no shared
contract/owner/rebase matrix can dispatch Wave 1.` The failure was expected
documentation RED evidence; it did not run a production verifier.

## Required Green And Stop Point

Before one documentation-only commit, the author must run the embedded CF-1
matrix audit, `git diff --check`, `npm run factory:check`, and `npm run
verify`, append only actual results, confirm the exact three-file scope, and
stop. A different fresh reviewer must lead with defects, missing bindings,
spec drift, unsafe ownership, and verification gaps. Only Relay A may
integrate an approved result, never into `neo`.

## Documentation GREEN And Ready-For-Review Record

- Recorded at: `2026-07-13T16:38:05Z`.
- Status: `ready-for-review`; this forward-only record supersedes the initial
  in-progress status for Task117 author work only. It is not a Wave 1
  authorization, review verdict, integration decision, or `neo` merge
  permission.
- Matrix audit: the exact embedded audit exited `0` and printed `GREEN: CF-1
  matrix audit passed (479 direct counterfactual mutations rejected, including
  missing/conflicting ownership).` It hashed the full 53-row shared-contract
  and exclusive-file matrix, directly mutated each governed event/DTO or
  capability/file-owner/consumer/source/approval/idempotency/test/rebase cell,
  and separately rejected missing and conflicting ownership as
  non-dispatchable.
- Whitespace: `git diff --check` exited `0` with no output.
- Factory: `npm run factory:check` exited `0` and printed
  `factory-readiness passed`.
- Dependency recovery: the first `npm run verify` stopped before typecheck
  with `tsc: command not found`. The root-cause check found the isolated
  worktree lacked the ignored `node_modules/.bin/tsc`; `npm ci
  --ignore-scripts` restored lockfile-pinned ignored dependencies without a
  tracked-file change. This was one environment recovery, not a product repair.
- Full verification: the fresh PTY `npm run verify` exited `0`: `typecheck
  passed`; 189 test files passed with 3 skipped; 2,228 tests passed with 5
  skipped; Vite completed with its existing chunk-size warning; and
  `factory-readiness passed`. SQLite experimental warnings were emitted by
  worker processes only. No provider, credential, browser, tailnet, Nous, or
  live command was invoked.
- Scope: the only tracked changes are this append-only claim, the new CF-1
  freeze, and the append-only Task117 author records in the program registry.
  This author did not self-review, integrate, dispatch Wave 1, or merge into
  `neo`.
- Stop point: hand this exact one-commit documentation result to a different
  fresh reviewer. Relay A alone may act on an approve verdict and must repeat
  cross-boundary/full verification before any coordinator integration.
