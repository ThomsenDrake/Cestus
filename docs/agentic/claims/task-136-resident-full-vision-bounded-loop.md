# Task136 Record-29 Bounded Resident Loop Claim

Status: implementing

Strict release frontier: 28 of 29

Record 29 status: unreleased

Product candidate: none

## Exact Authority

- Approved written design:
  `d475edd5cafd57a6f7db6c26aeeecb48bd9459cd`
- Reviewed implementation plan:
  `c5df0231c82264a9bfde33dcfc7e68b61b37c93f`
- Implementation authorization:
  `0955f28f9115885fc8859b7b223f3d91cf77bf03`
- Approved V4 authority candidate:
  `91ad47489ce5506f91821dcf57b8fc0a2a1352a0`
- V4 approval:
  `3227e93d038773ab16f9efcfa742ba7cda5aa046`
- V4 integration:
  `bf392124e556b60781b374579f09c7dfe19918a9`
- Integrated product authority:
  `765cf6a689a6d8fc866f7a7870461ee5366e54be`
- Task136 authority merge:
  `85b47c8ab2a1770da12a8bdaed589715ad4bcfb1`
- Task136 authority-merge first parent:
  `72e1ee6624c582218995e3e075e2303998811834`
- Task136 authority-merge second parent:
  `765cf6a689a6d8fc866f7a7870461ee5366e54be`

The authority merge is a history-preserving two-parent `--no-ff` merge. Both
the preserved Task136 base and integrated product authority are ancestors.
No reset, rebase, amend, squash, cherry-pick reconstruction, discarded
commit, or force-push is permitted.

## Frozen Product Ceiling

The exact product ceiling is 30 paths: 13 sources, 16 tests, and this one
claim.

### Thirteen sources

- `packages/agent/src/bounded-agent-loop.ts`
- `packages/agent/src/plan-observation-contracts.ts`
- `packages/agent/src/plan-observation-projection.ts`
- `packages/agent/src/resident-plan-candidate-provider.ts`
- `packages/agent/src/resident-loop-tool-gateway.ts`
- `packages/local-runtime/src/wake-supervisor-runtime.ts`
- `packages/local-runtime/src/mounted-wake-lifecycle-store.ts`
- `packages/agent/src/specialist-handoff-projection.ts`
- `packages/ontology/src/contracts.ts`
- `packages/local-runtime/src/resident-loop-factory-ports.ts`
- `packages/agent/src/domain-execution-dispatcher.ts`
- `packages/agent/src/task-orchestrator.ts`
- `packages/agent/src/task-orchestrator-projection.ts`

### Sixteen tests

- `packages/agent/test/bounded-agent-loop.test.ts`
- `packages/agent/test/plan-observation-contracts.test.ts`
- `packages/agent/test/plan-observation-projection.test.ts`
- `packages/agent/test/resident-plan-candidate-provider.test.ts`
- `packages/agent/test/resident-loop-tool-gateway.test.ts`
- `packages/agent/test/resident-loop-scheduler-completion-imports.test.ts`
- `packages/local-runtime/test/wake-supervisor-runtime.test.ts`
- `packages/local-runtime/test/mounted-wake-lifecycle-store.test.ts`
- `packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts`
- `packages/agent/test/specialist-handoff-projection.test.ts`
- `packages/ontology/test/agent-resident-loop-contracts.test.ts`
- `packages/local-runtime/test/resident-loop-factory-ports.test.ts`
- `packages/local-runtime/test/resident-loop-factory-ports-imports.test.ts`
- `packages/agent/test/domain-execution-dispatcher.test.ts`
- `packages/agent/test/task-orchestrator-claims.test.ts`
- `packages/agent/test/task-orchestrator-projection.test.ts`

### One claim

- `docs/agentic/claims/task-136-resident-full-vision-bounded-loop.md`

The exact sixteen-test command is:

```bash
npm test -- packages/agent/test/bounded-agent-loop.test.ts packages/agent/test/plan-observation-contracts.test.ts packages/agent/test/plan-observation-projection.test.ts packages/agent/test/resident-plan-candidate-provider.test.ts packages/agent/test/resident-loop-tool-gateway.test.ts packages/agent/test/resident-loop-scheduler-completion-imports.test.ts packages/local-runtime/test/wake-supervisor-runtime.test.ts packages/local-runtime/test/mounted-wake-lifecycle-store.test.ts packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts packages/agent/test/specialist-handoff-projection.test.ts packages/ontology/test/agent-resident-loop-contracts.test.ts packages/local-runtime/test/resident-loop-factory-ports.test.ts packages/local-runtime/test/resident-loop-factory-ports-imports.test.ts packages/agent/test/domain-execution-dispatcher.test.ts packages/agent/test/task-orchestrator-claims.test.ts packages/agent/test/task-orchestrator-projection.test.ts
```

## Composition And Effect Limits

Acceptance requires the exported
`createResidentBoundedAgentLoopFactory` composition entrypoint to run
end-to-end against the real mounted fixture. Record 29 intentionally installs
no default runtime, route, HTTP, operator-status, scheduler-activation, or
other runtime call site. Real-mounted library executability is not runtime
activation.

No provider, credential, network, unrelated external-system, fallback store,
fallback write, local-write substitute, or pull-request activity is
authorized. Existing human approval and legal gates remain fail-closed. No
provider call, network call, external effect, fallback write, or product
source/test mutation occurred at this checkpoint.

## Fresh Authority-Byte Baseline

The fresh baseline is bound to authority merge
`85b47c8ab2a1770da12a8bdaed589715ad4bcfb1`. Both commands ran serially from
that exact tree with local Vitest `4.1.9`.

- `npm test -- --reporter=json
  --outputFile=/tmp/task136-product-full-85b47c8ab2a1770da12a8bdaed589715ad4bcfb1.vitest.json`
  exited `1`. Its JSON reported `success=false`, 504 files = 484 passed + 20
  failed + 0 skipped, and 3,231 tests = 3,180 passed + 46 failed + 5 skipped
  + 0 deferred.
- `npm run verify` exited `1`. Standalone typecheck passed before its inherited
  test cohort reported 241 test files = 228 passed + 10 failed + 3 skipped,
  and 3,231 tests = 3,178 passed + 48 failed + 5 skipped.
- The full corpus collected and produced the JSON report. A non-fatal missing
  TypeScript source-map warning did not prevent collection or later exact
  differential comparison. These inherited nonzero results are baseline
  evidence, not passing claims.
- Vitest JSON SHA-256:
  `6f097162388cbd9ddfb8f157b4b7e3d6ab3f38f883073dad7031de8f554293e7`
- npm-test log SHA-256:
  `ecb2f6ee60ab9f487ec72963622c3d0cab1ea4db1536b24f969a3ae1a02fdaad`
- verify log SHA-256:
  `5b49e3448519d0aac2ffb5e7f29f1900cc0e4ca08fa84d53e87616ec353873d9`

Task136 remains `implementing`. This authority and claim checkpoint is not a
product candidate, approval, integration, strict record 29, assurance-only
transition, publication, or product release.

## Permanent Task9 Causal RED

The permanent product RED starts from exact clean claim checkpoint
`5173887d6acd8a89cadb731f4a22a89782aac0b5`, whose sole parent is authority
merge `85b47c8ab2a1770da12a8bdaed589715ad4bcfb1`. The preserved Task136 base
and integrated product authority remain ancestral through that merge.

The exact card command was:

```bash
npm test -- packages/agent/test/bounded-agent-loop.test.ts packages/agent/test/plan-observation-contracts.test.ts packages/agent/test/plan-observation-projection.test.ts packages/agent/test/resident-plan-candidate-provider.test.ts packages/agent/test/resident-loop-tool-gateway.test.ts packages/agent/test/resident-loop-scheduler-completion-imports.test.ts packages/local-runtime/test/wake-supervisor-runtime.test.ts packages/local-runtime/test/mounted-wake-lifecycle-store.test.ts packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts packages/agent/test/specialist-handoff-projection.test.ts packages/ontology/test/agent-resident-loop-contracts.test.ts packages/local-runtime/test/resident-loop-factory-ports.test.ts packages/local-runtime/test/resident-loop-factory-ports-imports.test.ts packages/agent/test/domain-execution-dispatcher.test.ts packages/agent/test/task-orchestrator-claims.test.ts packages/agent/test/task-orchestrator-projection.test.ts
```

It exited `1` with 16 failed test files and exactly 255 tests = 228 passed +
27 failed. Every pre-existing assertion in the sixteen files remained green.
The 27 causal failing titles are:

1. `stores strict automatic and human V2 gateway branches without fabricated approval`
2. `replays segmented suspension/result prefixes and burns stable tool requests`
3. `rebuilds repeated resumable segments and one terminal from ledger events only`
4. `replans from copied durable replay with no latest-process cache`
5. `issues isolated resident lifecycle stages and never reexecutes a reread claim`
6. `requires a live one-shot dispatcher permit and durable outcome receipt`
7. `seals claim-without-receipt as effect-outcome-unknown`
8. `keeps the resident permit consumer default private to the dispatcher`
9. `mints only closed-catalog package capabilities through the default API`
10. `uses six literal static adapter modules and eleven constructors without initialization-order drift`
11. `attests only the catalog-specific admissible domain outcome`
12. `allows the ordinal-10 automatic compatibility bridge and no other ordinal`
13. `validates strict automatic and human gateway readbacks`
14. `validates effect-outcome-unknown suspension and segmented replay`
15. `leaves same-claim resident suspension checkpoint ownership to W`
16. `projects W-owned resident suspension as blocked and nonrecoverable`
17. `binds one opaque mounted resident authority after exact Core authority`
18. `recovers every missing suspension-prefix suffix without an effect`
19. `consumes currentness and issues only bounded suspension-only authority`
20. `allows only the dispatcher default and named gateway constructor import chain`
21. `issues an internal exact-hash full-readback port without widening Task138 DTO`
22. `runs createResidentBoundedAgentLoopFactory against the real mounted fixture`
23. `rejects fabricated swapped stale and substituted dispatcher capabilities`
24. `enforces the exact dispatcher G W H R static import graph with no runtime activation`
25. `completes only from exact H full readback under all ten replayed budgets`
26. `suspends approval and unknown outcomes through W and resumes from durable replay`
27. `fails closed with zero fallback write or effect on every hostile boundary`

Each failure is caused by an absent approved record-29 API or behavior:
canonical V2 replay; stateless C; isolated G lifecycle, permit, receipt, and
unknown-outcome handling; the closed dispatcher ABI/catalog; the W-owned
orchestration interlock; mounted W authority and prefix recovery; the internal
H full-readback port; or the R/bounded-loop composition. There were no syntax,
fixture, invented-path, collection, dependency, or unrelated inherited test
failures. The inherited non-fatal missing TypeScript source-map warning did
not prevent collection. The complete local RED log SHA-256 is
`151bc86619994e6911f51dcccdd1954da3a0c2baffc5ecc4bd59b7ef0ae43cf4`.

The exact released-control command was:

```bash
npm test -- packages/agent/test/execution-loop.test.ts packages/agent/test/tool-gateway.test.ts packages/agent/test/scheduler.test.ts packages/agent/test/resident-loop-scheduler-completion.test.ts packages/local-runtime/test/portable-workspace-lifecycle.test.ts packages/local-runtime/test/runtime-handle-mounted-authority.test.ts packages/local-runtime/test/runtime-handle-mounted-authority-imports.test.ts packages/local-runtime/test/mounted-artifact-authority-operation.test.ts packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts packages/local-runtime/test/agent-handoff-projection.test.ts
```

It exited `0`: 10 test files passed and all 443 tests passed. Its complete
local log SHA-256 is
`1ae6d17b3173c7a912cc04756ba2636bc3babe0b68b4ca2a0a14dd25bc6a06ed`.
An additional standalone `npm run typecheck` syntax/type audit exited `0`
with `typecheck passed`.

The RED scope is exactly the frozen sixteen test paths plus this claim. It
contains zero source, contract, mission-state, registry, provider, runtime
activation, route, network, fallback, unrelated, or pull-request change. All
later GREEN commits must preserve the sixteen committed RED test blobs
byte-for-byte.
