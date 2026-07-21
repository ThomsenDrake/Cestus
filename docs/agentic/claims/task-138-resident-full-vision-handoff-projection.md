# Task138-H Claim: Mounted Resident Handoff Projection

- **Status:** paused at bounded candidate checkpoint
- **Task:** strict release record 28 `Task138-H`
- **Claimed at (UTC):** 2026-07-21
- **Worker:** Codex Task138-H bounded implementation owner
- **Branch:** `codex/task138-h-record28`
- **Worktree:** `/home/drake/.codex/worktrees/task138-h-record28/Cestus`
- **Exact dispatch base:** `1253e3e7be1bfe299d3345f0f9652fb9b29fc029`
- **Frozen authority:** V4 unfinished card `Task138-H` in
  `docs/agentic/contracts/task136-bounded-assurance-v4.json`

## Exact Scope

1. `packages/local-runtime/src/agent-handoff-projection.ts`
2. `packages/local-runtime/test/agent-handoff-projection.test.ts`
3. `docs/agentic/claims/task-138-resident-full-vision-handoff-projection.md`

The older plan's `task-138-resident-full-vision-handoff-runtime-projection.md`
claim name is superseded and must not be created. No registry, contract, shared
agent source, package index, assurance, `neo`, integration, or release-record
edit is authorized.

## Released-Interface And API Decision

The design-only `MountedHandoffStore` proposal is absent from released
TypeScript. This card therefore owns only a local-runtime, capability-injected,
read-only adapter over the released mounted material and manifest store `get`
readers plus the released `HandoffAuthorityBinding`. The adapter accepts an
exact target `runId`, ledger events, distinct role-bound material/manifest
readers, and the current authority binding. It dispatches only ledger-declared
material hashes to the material reader and ledger-declared manifest hashes to
the manifest reader, then delegates canonical bytes, exact hashes, manifest and
material agreement, ledger replay, run/task causation, and lifecycle selection
to `buildSpecialistHandoffProjection`.

The adapter never accepts `put`, append, provider, registry, path, fallback,
or executable-effect capabilities, and never receives, preflights, or consumes
the one-shot mounted recording witness. It compares verified V2 replay authority
with the injected current binding before emitting provenance. Because the
released projector exposes `SpecialistHandoffReadback` only for the complete
terminal/task chain, non-complete lifecycle DTOs omit provenance rather than
synthesizing it; the frozen acceptance permits this fail-closed omission.

## Invariant Mapping

- **Append-only and rebuildable:** the result is derived only from the supplied
  immutable ledger snapshot and exact mounted reads; the adapter performs no
  append, repair, copy, scan, or fallback write.
- **Exact authority and provenance:** material/manifest role and hash routing is
  exact, V2 provenance requires shared replay verification plus exact current
  `HandoffAuthorityBinding` agreement, and legacy/unavailable/inconsistent
  results omit provenance.
- **Browser and secret safety:** output contains only the frozen
  `ResidentHandoffDto.v1` safe fields. It excludes bytes, prompts, model/provider
  data, credentials, paths, store/registry objects, stacks, and raw errors.
- **No executable authority:** every exposed next action has `effect: "none"`;
  mount, corruption, stale, cross-run, and hostile-input failures fail closed.
- **No input mutation:** public values are normalized to frozen plain own-data
  snapshots before any mounted read or `await`.

## Execution Authority And Gates

`RV-1-E-889` and the coordinator explicitly authorize task-scoped
subagent-driven development and test-driven development for this card. Required
lineage is claim-only, permanent causal RED, then minimal GREEN. The exact
focused command is:

```text
npm test -- packages/local-runtime/test/agent-handoff-projection.test.ts
```

The cross-boundary command is:

```text
npm test -- packages/local-runtime/test/agent-handoff-projection.test.ts packages/agent/test/specialist-handoff-projection.test.ts
```

Final gates are the focused command, cross-boundary command, `git diff
--check`, `npm run typecheck`, `npm run factory:check`, `npm run verify`, and
the discoverable proportionate V4 standalone/contract/repository frontier,
scope, ancestry, clean-dependency, and no-drift checks. Provider, credential,
network, external-system, push, merge, rebase, integration, destructive action,
and fallback writes are prohibited.

## RED/GREEN Evidence

- RED: the exact focused command
  `npm test -- packages/local-runtime/test/agent-handoff-projection.test.ts`
  exited `1` with **1 failed file / 0 tests collected**. The sole diagnostic
  was `Cannot find module '../src/agent-handoff-projection.js'` at the new test
  file's production import (line 18), proving the Task138 adapter is absent;
  no test syntax, fixture, dependency, provider, credential, or unrelated
  failure was reported.
- GREEN: not yet admitted or claimed. The bounded candidate passed the exact
  focused suite **17/17** and exact cross-boundary suite **53/53** after one
  source repair. It remains subject to a fresh uninterrupted typecheck,
  factory, verify, assurance/frontier, review, integration, and release gate.

## Usage-Pause Checkpoint

- Paused at the user's explicit Codex-plan usage boundary on 2026-07-21.
- Permanent history before this checkpoint is claim-only commit `5e1de3e2`,
  causal missing-module RED `d1694f0a`, and expanded lifecycle RED
  `d855533e`.
- The candidate implements only the authorized source and corrects two test
  fixture literals to released enum values. No assertion was removed or
  relaxed. It passed **17/17** focused and **53/53** cross-boundary tests.
- A typecheck retry was terminated solely to honor the pause request. Its
  outcome is unknown and must not be inferred. Resume by rerunning the exact
  focused and cross-boundary suites, then `npm run typecheck`; classify and
  repair any diagnostic before claiming GREEN.
- This checkpoint is not reviewed, approved, integrated, released, or a
  strict record-28 release record. The program frontier remains **27 of 29**.
