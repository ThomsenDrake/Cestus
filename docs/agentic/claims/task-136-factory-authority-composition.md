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

## Causal RED

The exact card command ran before any production source existed:

```bash
npm test -- packages/local-runtime/test/resident-loop-factory-composition.test.ts packages/local-runtime/test/resident-loop-factory-composition-imports.test.ts
```

It exited `1` with **2 files / 2 tests: 1 failed, 1 passed**.  The only
failure was the real mounted-fixture API assertion at
`factoryCompositionApi`: the absent module did not expose
`createResidentLoopFactoryComposition` (`expected false to be true`).  The
portable-workspace fixture, released W/PM/H calls, local Vitest 4.1.9, and the
import-policy harness all loaded successfully; this is neither a dependency,
syntax, nor invented-fixture failure.  Vite's missing TypeScript source-map
notice is inherited dependency noise and is not a test failure.

## GREEN Admission Evidence

The committed GREEN is `6adba773c67948135f848d080eeea79f3d82719b`. The
exact card command passed: **2 files / 2 tests**. Its justified cross-boundary
run passed: **8 files / 108 tests**, covering the W wake/runtime, H
handoff/readback, PM mounted-provider authority, Task135D mounted-handle
operation, and specialist-runner consumer boundaries. It emitted exactly one
`TASK137_POLICY_CORPUS_OK allowed=8 rejected=20` marker.

`npm run typecheck` exited `0` (`typecheck passed`). Contract mode exited `0`
and emitted all four V4 markers:

```text
TASK136_RELEASE_GRAPH_OK records=29
TASK136_COMPOSITION_CORPUS_OK green=1 red=20
TASK136_COMMAND_CARDS_OK cards=29
TASK136_ABI_CORPUS_OK green=1 red=15
```

Repository mode emitted the required incomplete-prefix result:

```text
TASK136_REPOSITORY_PREFIX_OK records=18 commands=18
repository release closure incomplete: expected 29 records, found 18
```

Both `npm test` and `npm run verify` retained the inherited record-18 result:
**12 failing files / 69 failing tests / 5 skipped**, with **2,758 passed**
tests, a positive delta of `2` from the `2,756` baseline. `npm run verify`
also reported `typecheck passed`. `npm run factory:check` passed.

The bounded-assurance node-test runner is the one unresolved gate: it has
**17 passing / 2 failing** tests. The two failures are an inherited
contract/verifier conflict, not Task136 production behavior: lines 1112 and
1428 of the unowned runner assert `parsedPrefix.length === 17`, while the
required immutable base `ac5c3500681c8c2d485618a13635d3f68bd6ae73` already
contains the mandated record-18 release prefix. The same assertions and
failure are present at that exact base. Contract mode and repository mode
confirm the intended state above. Repairing the assertion would require an
unowned assurance/registry contract change, so no in-scope RED/GREEN tactic
can truthfully change this result; the four-path boundary and release-prefix
authority are preserved.

## Corrected Record-18 Base Re-admission

The coordinator forward-merged the corrected record-18 program and assurance
base as `b0fb76501c94a435cc0bdc822ea90d1968f7fdc2`. That merge is outside this
card's scope (registry, V4 authority claim, and assurance-test bytes only); it
preserves this card's claim/RED/GREEN ancestry through
`a04fe8a614d1074d8d62a82e1d4739e1bd7ead4b`. The previously recorded
17/19 bounded-assurance result is superseded by the following re-admission
from the exact corrected-base bytes.

- Exact focused command: **2 files / 2 tests passed**.
- Justified W/H/PM/Task135D cross-boundary command: **8 files / 108 tests
  passed**, with exactly `TASK137_POLICY_CORPUS_OK allowed=8 rejected=20`.
- Standalone `npm run typecheck`: exit `0` (`typecheck passed`).
- `node --test scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs`:
  **19 passed / 0 failed**.
- Contract mode emitted `TASK136_RELEASE_GRAPH_OK records=29`,
  `TASK136_COMPOSITION_CORPUS_OK green=1 red=20`,
  `TASK136_COMMAND_CARDS_OK cards=29`, and
  `TASK136_ABI_CORPUS_OK green=1 red=15`.
- Repository mode emitted `TASK136_REPOSITORY_PREFIX_OK records=18 commands=18`,
  then `repository release closure incomplete: expected 29 records, found 18`.
- `npm test` and `npm run verify` both retained the inherited record-18
  differential: **12 failing files / 69 failing tests / 5 skipped / 2,758
  passed**; verify also reported `typecheck passed`.
- `git diff --check` and `npm run factory:check` passed. The RED and GREEN
  blobs remain identical at
  `f9c194670473278eaa94fa5ad65bec06ab12bf91`.

The task-owned cumulative diff from
`ac5c3500681c8c2d485618a13635d3f68bd6ae73` through the preserved Task136
candidate is exactly the four listed owned paths. The forward merge adds only
the coordinator-owned registry, V4 authority-claim, and assurance-test paths.
The worktree is clean, `node_modules` and its top-level dependencies are real
non-symlinked directories, and local Vitest is `4.1.9`. This is a clean
candidate for coordinator review; no self-review, merge, push, registry edit,
or production/test change was performed by this card owner.
