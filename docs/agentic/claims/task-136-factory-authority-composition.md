# Task136-FC-Core — Factory Authority Composition Claim

- Status transition: `claimed` -> `implementing`.
- Card: `Task136-FC-Core`, strict V4 release-card position 19.
- Worker: Codex `gpt-5.6-terra` / `xhigh`.
- Branch: `codex/task136-fc-core-factory-composition`.
- Exact base: `ac5c3500681c8c2d485618a13635d3f68bd6ae73`.
- Governing authority: `docs/agentic/contracts/task136-bounded-assurance-v4.json` and
  `docs/superpowers/plans/2026-07-14-resident-agent-factory-authority-recovery-implementation.md`,
  including its later controlling amendments.

## Owned Scope

1. `packages/local-runtime/src/resident-loop-factory-composition.ts`
2. `packages/local-runtime/test/resident-loop-factory-composition.test.ts`
3. `packages/local-runtime/test/resident-loop-factory-composition-imports.test.ts`
4. `docs/agentic/claims/task-136-factory-authority-composition.md`

No registry, provider, credential, route, UI, `neo`, or external-service path
is in scope.

## Released Inputs And Boundary

The exact prerequisites are released `Task137B-W`, `CF1-HR`,
`Task139-PM`, and `Task135D`.  This card owns the minimum cycle-free local
factory composition that retains the one `agent_default` identity and closes
over their released opaque authority surfaces.  It treats no caller-provided
structural record, scalar binding, provider configuration, handle copy, or
capability lookalike as authority.

The composition will admit only the real Task135D factory-issued mounted
handle identity through W's factory-first wake path; PM's mounted locator and
H's authority-bound handoff witness remain opaque identities.  Every
asynchronous PM/H consumption must reread and compare current workspace,
mount, admission, policy, lock, high-water, ledger, run, and task facts both
before and after the boundary.  A copied, structural, proxied, accessor,
extra-key, stale, remounted, closed, cross-workspace, cross-run, cross-policy,
wrong-ledger/high-water, unissued, provider-data-shaped, or caller-substituted
value fails before an effect.  There is no fallback, alternate authority,
process-global registration, raw-handle return, provider/credential/network
effect, authority upgrade, or secret material.

## Ordered Evidence Plan

1. Add and commit a causal test-only RED using the released mounted/wake,
   PM, and H fixtures.  The exact card command is:

   ```bash
   npm test -- packages/local-runtime/test/resident-loop-factory-composition.test.ts packages/local-runtime/test/resident-loop-factory-composition-imports.test.ts
   ```

   The expected RED is the missing core composition API/behavior, not a
   fixture, syntax, dependency, or invented-interface failure.
2. Preserve the RED test blob byte-for-byte while adding one minimal GREEN in
   the owned production file.
3. From the committed GREEN bytes, run the exact card command; the justified
   W/H/PM/Task135D cross-boundary suite; `npm run typecheck`; the Task136
   assurance test and contract/repository modes; full test and verify
   differential against the inherited record-18 cohort; `git diff --check`;
   and `npm run factory:check`.

The task is implementation-only.  Review, integration, release-record edits,
pushes, history rewriting, and self-merge remain outside this claim.
