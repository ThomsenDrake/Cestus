# Task 134A Recovery Claim: Factory-Closed Normalized Handoff Preparation

- Task and gate: Task134A / CF-1R5 normalized nonterminal handoff preparation.
- Worker: `/root/task134a_handoff_preparation`.
- Branch and worktree: `codex/task-134a-normalized-handoff-preparation` /
  `/home/drake/.codex/worktrees/task-134a-normalized-handoff-preparation`.
- Claimed at: `2026-07-15T04:37:58Z`.
- Status: `in-progress`.

## Frozen Recovery Bases And Prerequisites

- Program base: `049de5bff428df204912d485baff57ca7f6d8cf3`.
- Isolated staged recovery base: `6aaa5438a880bc4c211fe4790ffa196e030ab3c9`.
- Preserved rejected runner source/test snapshot:
  `b5d07b93fd58944bca7f0b21f954881de90f8883`; it is preserved only through
  the staged base and is not integration evidence.
- Task132A coordinator integration prerequisite:
  `7ec1eb6885716ac7324839c578677366fe1bb244`.
- CF-1 integration: `48c9cbcdcf723bcc74868f782bc2375bae565ae6`.
- Task121: `1a92a2c2e41a6f15282307c6a29deb196a2e3fb5`.
- Task122: `9839fbf8c9010425f8585a4eb5edd8879c738eba`.
- Task123: `87f5d940a4476fdcb0040c4554d5a7a2172d0c4b`.
- Task124: `73003f60441b531d95bcb80755a6fc90148e09fe`.

The staged base descends from every listed prerequisite. The author will not
reset, rebase, restage, merge, self-integrate, or treat either preserved
snapshot as program integration evidence. Fresh review must cover the complete
`049de5bff428df204912d485baff57ca7f6d8cf3..HEAD` lineage, including staged
commit `6aaa5438a880bc4c211fe4790ffa196e030ab3c9`.

## Exclusive Scope

- `packages/local-runtime/src/agent-runtime-specialist-runners.ts`;
- `packages/local-runtime/test/agent-runtime-specialist-runners.test.ts`;
- `packages/local-runtime/test/agent-runtime-runner-preparation.test.ts`;
- `packages/agent/src/specialist-handoff-preparation.ts`;
- type-only `packages/agent/src/task-orchestrator.ts` transport ABI;
- `packages/agent/src/index.ts`;
- `packages/agent/test/specialist-handoff-preparation.test.ts`; and
- this claim.

The boundary creates only canonical, frozen, untrusted preparation data. It
does not construct a default-factory capability, own a store or authority,
perform H sequencing/readback, call provider/network/credential/Nous code, or
claim a durable or terminal result. Full verification and self-review are
closed; the final non-full gate is the Task134A fail-fast chain in the active
plan.

## Execution Record

- Model metadata checkpoint: session
  `/home/drake/.codex/sessions/2026/07/15/rollout-2026-07-15T00-36-51-019f6410-34ec-7dc2-b23c-b729cca2c6fa.jsonl:8`
  records `model=gpt-5.6-terra`, `reasoning_effort=xhigh`, and `effort=xhigh`.
- RED/GREEN and the exact non-full gate will be appended after their observed
  command results. A fresh independent complete-range review remains required
  before coordinator-only integration.

### Staged-Test Coverage Mapping

The preserved staged runner test had seven factory/H-oriented cases. The
Task134A replacement keeps the hostile boundary coverage while retiring only
semantics reassigned by CF-1R5:

1. Frozen factory-closure counterfactuals (caller stores and task/run
   compatibility) are retired as factory authority/readiness work; structural
   authority, store, registration, provenance, readiness, H, and provider
   tuples are now rejected before delegate, H, or provider activity by
   `agent-runtime-specialist-runners.test.ts`.
2. The test-only factory-closed tuple reaching the public orchestrator is
   retired: Task134A has no production-capability constructor, factory binding,
   authority, store, or H surface.
3. Stale readiness, descriptor/context/prompt, admission, and store-proof
   checks are deferred to their actual owners: Task132A registrar attestation,
   Task135A mounted-store binding, and Task140R0 private factory registration.
4. The lifecycle-shaped delegate result requiring a durable H readback is
   retired H sequencing. `agent-runtime-runner-preparation.test.ts` instead
   rejects a durable/terminal lookalike without invoking its embedded H or
   provider callbacks.
5. Snapshotting a public dispatch across a store-verification await is replaced
   by `agent-runtime-specialist-runners.test.ts`, which proves the exact public
   four-field dispatch is frozen before the delegate await.
6. Injected H readback versus a delegate readback is retired. The new runner
   preparation test proves an accepted delegate result is returned only as the
   exact nonterminal `preparation` field, with no `durableHandoff` or terminal
   field.
7. The direct counterfeit tuple is replaced by the same hostile constructor
   and hostile public-dispatch cases, both proving zero delegate/H/provider
   activity.

No provider call existed in the staged fixture. The replacement adds an
explicit zero-call fake-provider assertion, so provider safety is not silently
dropped while the implementation itself has no provider import or path.

### RED And GREEN Evidence

- The first exact RED command exited `127` because this isolated worktree had
  no `vitest` binary. The lockfile SHA-256 matched the canonical program
  worktree, so a temporary symlink to that existing `node_modules` tree was
  used; no network or dependency mutation occurred.
- The rerun exact RED command exited `1`: the three new codec/runner suites
  failed because `specialist-handoff-preparation.js` did not exist, while the
  unchanged kernel suite passed 38 tests. After adding the explicit fake
  provider and durable/terminal-lookalike RED cases, the exact RED command
  again exited `1` for the same missing codec module in all three new suites.
- The focused GREEN command
  `npm test -- packages/agent/test/specialist-handoff-preparation.test.ts packages/local-runtime/test/agent-runtime-specialist-runners.test.ts packages/local-runtime/test/agent-runtime-runner-preparation.test.ts packages/agent/test/specialist-runner-kernel.test.ts`
  exited `0`: 4 files and 46 tests passed. The final required fail-fast chain
  first exited `0` after the focused GREEN: 4 files and 46 tests passed,
  followed by successful typecheck, whitespace, and factory-readiness steps.
  It is rerun after this evidence update so the final pre-commit gate covers
  the complete scoped diff.
