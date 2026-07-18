# CF1-HR Complete Handoff Readback / Projection Claim

- Status transition: `claimed` -> `implementing`
- Card: `CF1-HR`, strict V4 release card 14
- Worker: Codex `gpt-5.6-terra` / `xhigh`
- Branch: `codex/cf1-handoff-readback`
- Worktree: `/home/drake/.codex/worktrees/00c5/Cestus`
- Exact base: `9c5f6229e86de8578a3d0b34f47769753be80ba2`
- Governing V4 authority: `docs/agentic/contracts/task136-bounded-assurance-v4.json`
- Governing final integrated loop authority: `docs/superpowers/plans/2026-07-12-resident-agent-bounded-loop-implementation.md`

## Scope And Disposition

1. `packages/agent/src/specialist-runner-kernel.ts` — owned
2. `packages/agent/test/specialist-runner-kernel.test.ts` — owned
3. `packages/agent/src/specialist-handoff-projection.ts` — owned
4. `packages/agent/test/specialist-handoff-projection.test.ts` — owned
5. `docs/agentic/claims/cf1-h-task136-complete-handoff-readback-projection.md` — owned

This card produces the single H-owned complete authoritative handoff
readback/parser/producer contract that Task136 must consume verbatim. It reads
only authoritative durable ledger evidence, content-addressed manifest
readback, and current approved mounted authority. It preserves the strict V2
handoff ABI, append-only ledger semantics, provenance, projection
rebuildability, and one resident identity. It does not mint or expose W's
private capability; create a shadow authority, compatibility parser, shared
schema, mount/factory owner, or generic executor; accept caller structural
authority; append a fallback write; or expose provider/tool bytes or secret
material.

## Released Prerequisites

- Strict record 11: `Task137B-W`, release event
  `task136-release-v4-Task137B-W`, integration
  `9e680b44c4284456eebaad79c00fabda5c2bd4ea` (`RV-1-E-681`).
- Strict record 12: `W1-123-H-SHARED-SCHEMA`, release event
  `task136-release-v4-W1-123-H-SHARED-SCHEMA`, integration
  `0b5185f0d0dd276164ec70d5db150f5f6ccb3a79` (`RV-1-E-684`).
- Strict record 13: `W1-133.5-PREAPPROVAL-PROMPT-STORE`, release event
  `task136-release-v4-W1-133.5-PREAPPROVAL-PROMPT-STORE`, integration
  `75de81f110b4f405f9ec064104bc2c2b4f79e223` (`RV-1-E-685`).

## Required Evidence

1. Causal RED, committed before production changes:

   ```bash
   npm test -- packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/specialist-handoff-projection.test.ts
   ```

2. Minimum GREEN, then the same card command.

3. Cross-boundary command:

   ```bash
   npm test -- packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/specialist-handoff-manifest.test.ts packages/agent/test/specialist-handoffs.test.ts packages/agent/test/plan-observation-contracts.test.ts packages/agent/test/plan-observation-projection.test.ts
   ```

4. Final gates from committed bytes:

   ```bash
   npm run typecheck
   npm run verify
   git diff --check
   npm run factory:check
   ```

## Stop Rules

Stop and return structured evidence for a schema or file-owner conflict,
data-loss or safety risk, unavailable offline dependency, external behavior or
credential decision, or repeated verifier failure. Do not use the network,
providers, credentials, live services, push, integration, registry/spec/plan
edits, `neo`, rebase, reset, amend, discard, rewrite, or self-merge. Review
and integration remain outside this bounded implementation claim.

## Task 3 Corrected-Scope Continuation

- Status: `implementing` (one repair remains after this finite GREEN packet).
- Worker: Codex `gpt-5.6-terra` / `xhigh`.
- Corrected exact base: `0255ac2f8927851fb28220ac05a9b5acddfdcab3` on
  `codex/cf1-handoff-readback`; preserved claim commit:
  `56bbb10b745b742a86b7f63b878aadc105efee0c`.
- Exact prerequisites, in order:
  `W1-123-H-SHARED-SCHEMA`, `W1-133.5-PREAPPROVAL-PROMPT-STORE`,
  `Task137B-W`, `Task135B`, `Task129-MFA`.
- Task-scoped subagent-driven development and test-driven development are explicitly approved for this task.

### Corrected Owned Paths And Dispositions

1. `packages/agent/src/specialist-runner-kernel.ts` — owned
2. `packages/agent/test/specialist-runner-kernel.test.ts` — owned
3. `packages/agent/src/specialist-handoff-projection.ts` — owned
4. `packages/agent/test/specialist-handoff-projection.test.ts` — owned
5. `packages/agent/src/specialist-handoff-manifest.ts` — owned
6. `packages/agent/test/specialist-handoff-manifest.test.ts` — owned
7. `packages/agent/src/specialist-handoff-authority.ts` — owned
8. `packages/agent/test/specialist-handoff-authority.test.ts` — owned
9. `packages/local-runtime/src/portable-mounted-agent-artifact-stores.ts` —
   direct source transfer from `Task135B`
10. `packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts`
    — direct source transfer from `Task135B`
11. `packages/ontology/src/contracts.ts` — direct source transfer from
    `Task137B-W`
12. `packages/ontology/test/agent-contracts.test.ts` — direct source transfer
    from `Task129-MFA`
13. `packages/ontology/test/agent-resident-loop-contracts.test.ts` — owned
14. `docs/agentic/claims/cf1-h-task136-complete-handoff-readback-projection.md`
    — owned

These are finite direct source mappings only. Current-HEAD source remains
authoritative until strict record 14. No generic, multi-target, transitive, or
compatibility transfer is authorized.

### Corrected Commands

Focused RED/GREEN command:

```bash
npm test -- packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/specialist-handoff-manifest.test.ts packages/agent/test/specialist-handoff-authority.test.ts packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts packages/ontology/test/agent-contracts.test.ts packages/ontology/test/agent-resident-loop-contracts.test.ts
```

Cross-boundary command:

```bash
npm test -- packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/specialist-handoff-manifest.test.ts packages/agent/test/specialist-handoff-authority.test.ts packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts packages/local-runtime/test/mounted-agent-artifact-stores.test.ts packages/ontology/test/agent-contracts.test.ts packages/ontology/test/agent-resident-loop-contracts.test.ts packages/agent/test/specialist-handoffs.test.ts packages/agent/test/plan-observation-contracts.test.ts packages/agent/test/plan-observation-projection.test.ts
```

The final finite packet also requires `npm run typecheck`, `npm run verify`,
`git diff --check`, `npm run factory:check`, the exact changed-path audit, a
clean tracked/untracked state, and real top-level dependency checks. The
record-13 inherited baseline is 12 files / 69 tests; final verification will
differentiate inherited evidence from this packet.

## Causal RED And GREEN Evidence

### RED — `005dead0`

The corrected focused command exited nonzero against inherited bytes exactly
because the V2 contract did not exist: the authority test could not import the
new witness module; the manifest and runner tests found missing V2 producers;
the portable producer exposed no witness; the projection still treated V1 as
an executable handoff state; and ontology rejected the V2 event family.

- Focused RED: 7 files; 6 failed / 1 passed; 5 failed / 268 passed tests.
- The structural-witness runner assertion observed no appended event after the
  rejected substitute, so the adversarial failure was effect-free.

### GREEN — current candidate

- Focused CF1 command: passed, 7 files / 276 tests.
- Cross-boundary command: passed, 11 files / 309 tests.
- `npm run typecheck`: passed (exit `0`).
- `npm run verify`: reran the inherited record-13 differential without a
  CF1-owned failure: 12 failed / 211 passed / 3 skipped files and 69 failed /
  2695 passed / 5 skipped tests. This is the documented non-green baseline,
  not a candidate regression.
- `git diff --check`: passed.
- `npm run factory:check`: passed (`factory-readiness passed`).
- Dependency provenance: top-level `node_modules` is a real directory, not a
  symlink; `node_modules/.bin/vitest` is executable (`vitest/4.1.9`).
- Scope audit: only the corrected fourteen owned or direct-transferred paths
  are staged for the finite GREEN commit; no registry, contract-plan, provider,
  credential, network, or external-service path is included.

## Forward Typecheck Correction

- Status remains `implementing`; this is completion of the original finite
  implementation packet before review and does not consume the single
  post-review repair packet.
- Reproduced from committed candidate
  `3e2c586c5b90fb6b2d5945cd7ed4acfd7d7164b5` with `npm run typecheck`:
  exit `2`, with the six reported CF1-owned errors in the unowned barrel
  collision, V2 manifest builder, V1 manifest agreement parser, V2 runner
  snapshot, optional V2 test task identity, and V2 terminal test helper.
- The forward correction keeps the public barrel untouched, removes the
  colliding owned export, preserves strict own-data parsing, accepts only the
  private helper's already parsed comparison shape, and omits absent optional
  V1 fields in the V2 fixture.
- Before the forward commit, the focused seven-file CF1 command passed:
  7 files / 276 tests; `npm run typecheck` passed. The committed-byte gate
  evidence for this correction is retained with the implementation handoff.

## Consolidated Post-Review Repair

- Status transition: `reviewing` -> `implementing-repair`.
- Exact reviewed candidate: `06b8d6a1b50b208721cd6af4039f36a5e2ce5e7a`.
- Preserved program base: `0255ac2f8927851fb28220ac05a9b5acddfdcab3`.
- Independent review findings: architecture/invariants
  `019f7286-243e-7480-a0ea-bd010118cc17`; executability/adversarial
  `019f7286-2435-70b3-97de-0a4084dd9342`.
- Worker: Codex `gpt-5.6-terra` / `xhigh`.
- This is CF1-HR's sole consolidated post-review repair packet; it is consumed
  by this RED and exhausted after its single GREEN commit. No automatic CF1
  code or test change is authorized after that GREEN.
- Task-scoped subagent-driven development and test-driven development are explicitly approved for this task.

Both reviewers reproduced the same P1: the strict V2 authority-bound producer
stopped after prepared/recorded, while the only finalizer and its readback
resolver were V1-only. The V2 result was not assignable to that V1 finalizer,
and manually assembled projection events did not exercise the required
production lifecycle. The causal repair tests require the actual
authority-bound production call to revalidate across terminal/task-status
completion, return the complete replayed Task119 readback, and leave no
task-status effect after a stale authority is observed.

## One-Time Post-Ceiling Safety Packet

- Status transition: `blocked` -> `implementing-post-ceiling-safety-packet`.
- Human exception: one post-ceiling CF1-HR safety packet only; no repair remains
  after its fresh final review.
- Exact base and blocked candidate:
  `5fc556773c81b46953064dc8fc2b105ebc3cfd12`.
- Governing registry evidence: `RV-1-E-708` and `RV-1-E-709`.
- Prior final reviews: architecture/invariants
  `019f72a7-a377-78a3-9e76-e51071fcb861`; executability/adversarial
  `019f72a7-a394-7b20-9116-249d473d096f`.
- Worker: Codex `gpt-5.6-terra` / `xhigh`.
- This human exception authorizes exactly one causal RED followed by one
  minimal GREEN within the existing fourteen-path CF1-HR boundary. Preserve
  every prior commit; do not reset, rebase, amend, squash, drop, reorder, or
  rewrite history.
- Task-scoped subagent-driven development and test-driven development are explicitly approved for this task.

The RED adds production-path evidence for the three adjudicated P1s: exact
created/queued/running task history must issue only for the bound task/run;
the strict V2 recorder must append `run terminal ->
agent.task.orchestration.completed -> task status`; and a stale V2 rejection
must leave exported raw completion and raw terminal/status projection unable
to produce a verified completed readback. Immutable V1 finalization replay
remains separately exercised.

RED command:

```bash
npm test -- packages/agent/test/specialist-runner-kernel.test.ts packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts
```

Observed expected RED: exit `1`; 2 failed files, 3 failed / 73 passed tests.
The portable exact-history issuance promise rejected; the production lifecycle
had no orchestration-completed event; and `appendSpecialistCompletion` resolved
after stale V2 rejection. No production path changed before this evidence.
