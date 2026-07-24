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

## RV-1-E-945 Strict-V2 Fixture Repair RED

The append-only repair authority is exact history-preserving merge
`3d185402c0a267280ffa36a3b3eeee8d854e6af8`. Its first parent is the
permanent Task9 RED
`1b99822ec532fc51866008c2fc52986775341573`; its second parent is registry
authorization `d22c6182e87159fbdc9310644edd2e9011ee3134`. The permanent RED,
claim checkpoint, product authority merge, reviewed design and plan, V4
authority, and every earlier Task136 commit remain ancestral. The repair uses
no reset, rebase, amend, reconstruction, or discarded commit.

The inherited ontology fixture is mechanically aligned with the reviewed
strict V2 ABI:

- every planned step carries one stable `toolRequestId` and the exact
  `executionCapabilityHash`;
- the completed tool-step fixture uses the exact automatic-policy completed
  branch with request, permanent claim, durable outcome receipt, and result;
- the approval suspension uses `awaiting-human-approval`, the already durable
  orchestration checkpoint and request, and no future resident self-ID,
  decision, approver, or approval hash;
- terminal replay ends directly in its completed result, while a separate
  approval-resumable replay contains the exact suspension/result pair;
- multi-plan fixtures allocate distinct stable request IDs to every step; and
- dependent positive and causal controls use the corresponding terminal or
  resumable helper. All prior negative mutation labels/assertions and all V1
  controls remain present.

The fresh exact card command was:

```bash
npm test -- packages/agent/test/bounded-agent-loop.test.ts packages/agent/test/plan-observation-contracts.test.ts packages/agent/test/plan-observation-projection.test.ts packages/agent/test/resident-plan-candidate-provider.test.ts packages/agent/test/resident-loop-tool-gateway.test.ts packages/agent/test/resident-loop-scheduler-completion-imports.test.ts packages/local-runtime/test/wake-supervisor-runtime.test.ts packages/local-runtime/test/mounted-wake-lifecycle-store.test.ts packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts packages/agent/test/specialist-handoff-projection.test.ts packages/ontology/test/agent-resident-loop-contracts.test.ts packages/local-runtime/test/resident-loop-factory-ports.test.ts packages/local-runtime/test/resident-loop-factory-ports-imports.test.ts packages/agent/test/domain-execution-dispatcher.test.ts packages/agent/test/task-orchestrator-claims.test.ts packages/agent/test/task-orchestrator-projection.test.ts
```

It exited `1`: 16 test files failed and exactly 255 tests = 218 passed + 37
failed. The complete log SHA-256 is
`a9765f839cda5b330aa3229a8937319475915b50433f69568958bd153dd0c26a`.
The inherited non-fatal missing TypeScript source-map warning did not prevent
collection.

The exact 25 non-ontology failures are unchanged from the original permanent
RED list above: items 1-12 and 15-27. Each retains its original causal
classification against the absent approved C, G, dispatcher, W, H,
orchestrator-interlock, R, or bounded-loop source API/behavior. The repaired
ontology fixture exposes these 12 additional/current Task10 failures:

1. `preserves accepted v1 replay while requiring strict v2 terminal and
   resumable families` — strict planned-step bindings and strict event shapes
   are absent.
2. `replays durable budget progression through a fourth plan record and
   rejects an over-limit revision` — strict planned-step parsing and terminal
   replay grammar are absent.
3. `rejects a later replan that reuses an earlier non-predecessor plan ID` —
   its positive strict-plan parser control is absent before the negative
   mutation.
4. `rejects a third plan that carries forward an observation from before the
   intervening plan` — its positive strict-plan parser control is absent
   before the causal mutation.
5. `rejects a v2 replay with missing observation budget consumption` — its
   positive terminal replay control is absent before the budget mutation.
6. `rejects a v2 replay with missing tool step budget consumption` — its
   positive terminal replay control is absent before the budget mutation.
7. `rejects a v2 replay with missing result budget consumption` — its
   positive terminal replay control is absent before the budget mutation.
8. `rejects a resumable result anchored to an unrelated suspension
   checkpoint` — its positive strict approval-resumable replay control is
   absent before the anchor mutation.
9. `rejects a resumable result anchored to an unrelated suspension deadline`
   — its positive strict approval-resumable replay control is absent before
   the anchor mutation.
10. `rejects a resumable result anchored to an unrelated suspension next
    action` — its positive strict approval-resumable replay control is absent
    before the anchor mutation.
11. `validates strict automatic and human gateway readbacks` — the disjoint
    automatic/human gateway union is absent.
12. `validates effect-outcome-unknown suspension and segmented replay` — the
    unknown-outcome category, category-dependent checkpoint, and segmented
    replay grammar are absent.

No failure is caused by syntax, collection, dependency, invented path,
unrelated inherited behavior, or a fixture shape outside the approved Task10
ABI. The unchanged source therefore remains a causal RED: the 12 ontology
failures become GREEN only when the three authorized Task10 sources implement
the reviewed strict API and behavior. The original Task9 evidence and log hash
`151bc86619994e6911f51dcccdd1954da3a0c2baffc5ecc4bd59b7ef0ae43cf4`
remain historical truth and are not replaced by this observation.

The fresh released-control command was:

```bash
npm test -- packages/agent/test/execution-loop.test.ts packages/agent/test/tool-gateway.test.ts packages/agent/test/scheduler.test.ts packages/agent/test/resident-loop-scheduler-completion.test.ts packages/local-runtime/test/portable-workspace-lifecycle.test.ts packages/local-runtime/test/runtime-handle-mounted-authority.test.ts packages/local-runtime/test/runtime-handle-mounted-authority-imports.test.ts packages/local-runtime/test/mounted-artifact-authority-operation.test.ts packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts packages/local-runtime/test/agent-handoff-projection.test.ts
```

It exited `0`: 10 test files and all 443 tests passed. The complete log
SHA-256 is
`4803b4fac40793772bc52ff4a2e85bb7ae5b8f4f77abdceb3c655690100fe4cc`.
Fresh standalone `npm run typecheck` exited `0` with `typecheck passed`; its
complete log SHA-256 is
`88603ae6d0804b467cf0223e64644258397c61d0119a5876e07565cc5b2dd279`.

The source-byte manifest proves all 13 authorized product-source states are
unchanged from `3d185402`: the not-yet-created bounded-loop source remains
absent and the other 12 source blobs are identical. Its SHA-256 is
`b0b4322354df7aafbfc4c5425247a0bda0797f2c5098371d37976a6176c6ffa3`.
The other 15 permanent RED test blobs are byte-identical to
`1b99822ec532fc51866008c2fc52986775341573`; that manifest SHA-256 is
`9e79f16f229e528bd10bd124245bca05c07f6c5549e53879b43355dd4dbd6090`.
The repair scope is exactly
`packages/ontology/test/agent-resident-loop-contracts.test.ts` and this claim.
It changes no source, contract, plan, mission state, registry, provider,
runtime activation, route, network, fallback, unrelated path, or pull
request.

Task136 remains `implementing`. This fixture repair is not a product
candidate, approval, integration, strict record 29, assurance-only
transition, publication, or release. The strict product frontier remains
**28 of 29**.

## RV-1-E-945 Independent Review Rejection And Forward Fixture Repair RED

Fresh independent review rejected fixture candidate
`4b67f4e1df560bedaa22b41921da1e32478b914e`. That exact rejected commit and
all earlier RED, GREEN, review, design, plan, authority, and merge history
remain ancestral evidence. The forward repair starts from exact clean parent
`4b67f4e1df560bedaa22b41921da1e32478b914e`; it uses no reset, rebase, amend,
reconstruction, force operation, discarded commit, or source GREEN.

The review found exactly three P1 fixture defects:

1. The positive helpers did not implement exact grammar
   `P0 X* (O S R-resumable O-recovery X*)* O R-terminal?` because they lacked
   a post-tool final observation immediately before suspension or terminal
   result.
2. The gateway negative controls substituted mismatching tool-step states,
   the ordinary checkpoint mutation used an unknown-outcome category, and the
   missing-prerequisite replay changed ordinal without binding the exact
   ordinal-2 stable tool request.
3. The fixtures lacked direct positive and targeted negative coverage for the
   exact ordinary `not-applicable` checkpoint and exact
   `effect-outcome-unknown-human` checkpoint with its required durable
   decision, approver, and approved-preview tuple.

The repaired terminal helper is exactly `P O X O R-terminal`, and the
approval helper is exactly `P O X O S R-resumable`. The inserted post-tool
observation has its own budget consumption, exact plan/tool binding and
tool-step causation; suspension/result budgets and final-observation
readbacks advance from it. Every plan revision in the bounded replan helper
likewise ends in a distinct post-tool observation; the next replan and final
result bind that exact event. Index-dependent controls now locate causal
observations by durable identity or use the corrected tuple position, and the
ordinal-2 prerequisite control binds `toolreq_002` in both its tool step and
post-tool observation.

Gateway negative cases now preserve the exact lifecycle mapping:
`requested -> requested`, `claimed -> suspended`, `completed -> executed`,
`failed -> failed`, and `denied -> denied`. The ordinary gateway-ID mutation
uses an `authority-stale` suspension with the otherwise exact
`not-applicable` checkpoint. The automatic unknown-outcome fixture remains
present. A distinct exact human unknown-outcome fixture binds the durable
request, decision, approver, approved preview, permanent claim, logical
locator, and capability hash; targeted omissions independently reject each
required approval-tuple member. The existing awaiting-human approval branch
remains present. No branch uses optional-field condensation, a compatibility
lane, or a fabricated automatic decision.

The fresh focused command was:

```bash
npm test -- packages/ontology/test/agent-resident-loop-contracts.test.ts
```

It exited `1`: 80 tests = 66 passed + 14 failed. The complete log SHA-256 is
`4a09760edee2603647504b329b9917d2d95810381044fbca39496a413ac10070`.
All negative controls pass. The 14 positive/positive-control failures are
causal against the unchanged source's absent reviewed strict V2 API and
sequence behavior:

1. strict terminal/resumable family parsing;
2. four-plan replay and the over-limit control;
3. non-predecessor plan-ID reuse control;
4. stale intervening observation control;
5. final-observation budget control;
6. tool-step budget control;
7. result budget control;
8. resumable checkpoint-anchor control;
9. resumable deadline-anchor control;
10. resumable next-action control;
11. exact automatic/human gateway union;
12. exact ordinary `not-applicable` checkpoint;
13. exact automatic unknown-outcome checkpoint and segmented replay; and
14. exact human unknown-outcome checkpoint and segmented replay.

The exact sixteen-file card command recorded above was rerun without changing
its paths. It exited `1`: 16 files failed and exactly 257 tests = 218 passed +
39 failed. The complete log SHA-256 is
`66b1ffe40d10d645c0a1443f36623e5458d023c45bf4da796f59477da18f99b4`.
The 25 non-ontology failures remain byte-for-byte-source-equivalent to the
original permanent RED classifications; the 14 ontology failures are the
causal list immediately above. The inherited non-fatal missing TypeScript
source-map warning did not prevent collection. No failure is caused by
syntax, collection, dependency, an invented path, unrelated released
behavior, or a fixture outside the reviewed strict V2 ABI.

The exact released ten-file control command recorded above exited `0`: 10
files and all 443 tests passed. Its complete log SHA-256 is
`05f03442a31e250f9922502910332b220149711924807e110791038d45cfd41b`.
Fresh standalone `npm run typecheck` exited `0` with `typecheck passed`; its
complete log SHA-256 is
`88603ae6d0804b467cf0223e64644258397c61d0119a5876e07565cc5b2dd279`.

The freshly regenerated canonical source manifest proves all 13 authorized
product-source states are identical to rejected parent `4b67f4e1`: the
not-yet-created bounded-loop source remains absent and the other 12 source
blobs are identical. Its SHA-256 remains
`b0b4322354df7aafbfc4c5425247a0bda0797f2c5098371d37976a6176c6ffa3`.
The other 15 permanent RED tests remain byte-identical to
`1b99822ec532fc51866008c2fc52986775341573`; their freshly regenerated
manifest SHA-256 remains
`9e79f16f229e528bd10bd124245bca05c07f6c5549e53879b43355dd4dbd6090`.

The repair scope is exactly
`packages/ontology/test/agent-resident-loop-contracts.test.ts` and this claim.
It changes no product source, contract authority, plan, mission state,
program registry, provider, runtime activation, route, network, fallback,
unrelated test, or pull request. Task136 remains `implementing`. This repaired
RED fixture checkpoint is not a product candidate, approval, integration,
strict record 29, assurance-only transition, publication, or release. The
strict product frontier remains **28 of 29**.

## RV-1-E-948 Stateless-C Test-Oracle Repair RED

The exact append-only repair authority is registry commit
`8629dccd0b7bebf6c3f4d4bf8e7e46cf775baba5`. It was forward-merged into
the Task136 lineage by exact clean two-parent authority merge
`3949514139387f3008f001ea0070d7995181d40d`, whose first parent is Task10
source GREEN `9d1eb9abcb0f9445d074cb81b47a35b8f2d05c79` and whose second parent is
that registry authority. Permanent RED `1b99822ec532fc51866008c2fc52986775341573`,
both strict-V2 fixture repairs and reviews, their integration, Task10 GREEN,
and all earlier design, plan, authority, review, merge, and claim history
remain ancestral.

The repair resolves the exact prior test-oracle contradiction without a
Task11 source edit. A fresh stateless C cannot compare a current provider
model or a historical policy-constraint object against a prior plan,
replay, and observation that contain neither fact. It also cannot reject a
second nondurable initial candidate without forbidden process memory. The
superseded fixture additionally used an unbound proposed plan as a canonical
prior event, inserted plan-only keys into an observation, invented replay
keys while omitting Task10's exact aggregate fields, retained stale
causation and zero-action budgets, supplied both `plan` and `proposedPlan`,
expected legacy output keys, and never required the sole parser boundary.

The repaired oracle now:

- requires and directly exercises
  `parseResidentUntrustedPlanCandidate`;
- requires exact `kind` / `proposedPlan` initial and replan values;
- keeps each proposed step unbound while adding `toolRequestId` and
  `executionCapabilityHash` only to the canonical durable prior plan event;
- validates the bound prior plan and strict observation independently with
  `validateKnowledgeEvent`, then validates their `P -> O` prefix with
  `validateResidentLoopEventSequence` before invoking C;
- carries only the seven Task10 replay fields `identity`, `events`, `plans`,
  `observations`, `toolSteps`, `suspensions`, and `results`;
- uses exact admission-to-plan, plan-to-observation, and
  observation-to-replan causation with monotone nonzero budget actions;
- sends every replan case through the complete prior-event, replay, and
  observation tuple;
- replaces provider/model and historical-constraint comparisons with
  policy, authority, source, context, tool, output, budget, and replay
  mutations provable from durable facts; and
- proves repeated initial creation and restart replanning require no cache,
  compatibility alias, heuristic, or hidden process binding.

The fresh focused command was:

```bash
npm test -- packages/agent/test/resident-plan-candidate-provider.test.ts
```

It exited `1`: one test file failed and exactly 25 tests failed. The complete
log SHA-256 is
`b2613bfe15c8be7c361ce1dad45ef12b3321dfb8a832bf100bb47e6cb62e194e`.
The exact failing titles are:

1. `returns deeply frozen exact initial and replan candidates through the
   sole parser boundary`
2. `makes parseResidentUntrustedPlanCandidate the only exact structural
   candidate boundary`
3. `rejects mutable, hostile, secret-bearing, stale, or mismatched initial
   data before producing output`
4. `rejects invalid steps and every wider or substituted replan using only
   durable facts`
5. `rejects a numeric runMode`
6. `rejects a runMode outside the released enum`
7. `rejects a numeric correlationId`
8. `rejects a scalar plan slot substituted with nested URL, DNS, IP, or
   localhost material`
9. `rejects a scalar provider-posture slot substituted with nested
   authorization material`
10. `requires the exact Task139-P2 provider-byte-transfer approval class`
11. `rejects a replan whose policy and authority diverge from the durable
    prior event`
12. `rejects a replan whose consumed and remaining budget jump beyond
    actionConsumption`
13. `rejects provider-byte-transfer as an initial automatic action class`
14. `rejects a non-canonical feasibility assessment timestamp`
15. `rejects IDNA-dot IP material in a correlationId after WHATWG-equivalent
    normalization`
16. `rejects full-width IDNA-dot IP material in a correlationId after
    WHATWG-equivalent normalization`
17. `rejects an external-byte-transfer allowlist entry paired with none
    approval`
18. `rejects a stale authority and posture high-water behind ordered sources`
19. `rejects ordered sources newer than bound authority high-water`
20. `requires every allowlist approval class globally`
21. `rejects an initial plan record with zero action consumption`
22. `rejects an initial budget whose consumed totals do not match its action`
23. `creates repeated initial candidates without process-local state or
    hidden binding`
24. `rejects an unreleased global approval class`
25. `replans from copied durable replay with no latest-process cache`

Every failure is causal against unchanged Task11 source blob
`ed5c8d9f98b9c433099045f2ad2112b2ecdab74e`. The first test reaches the
unchanged source only after all three independent canonical fixture controls
pass. The second fails because the sole parser export is absent. Every
remaining test first requires the valid exact initial or fresh-replan ABI
before evaluating its negative mutation, so the unchanged legacy
`schemaVersion` / `plan` envelope and process-local `latest` implementation
fail at the positive API precondition rather than creating a false-positive
negative. There is no syntax, collection, dependency, invented-path,
malformed-event, malformed-replay, zero-action-budget, stale-causation,
compatibility-alias, or unrelated inherited failure.

The exact sixteen-file card command recorded above was rerun without changing
its paths. It exited `1`: 13 files failed and 3 passed; exactly 258 tests =
212 passed + 46 failed. The complete log SHA-256 is
`fe784110ef305c2330f60446091938686ad00ea1659f3f0176b5c1195beafedc`.
The 25 C failures are exactly the focused list above. The other 21 unchanged
causal RED titles are:

1. `projects W-owned resident suspension as blocked and nonrecoverable`
2. `issues isolated resident lifecycle stages and never reexecutes a reread
   claim`
3. `requires a live one-shot dispatcher permit and durable outcome receipt`
4. `seals claim-without-receipt as effect-outcome-unknown`
5. `allows only the dispatcher default and named gateway constructor import
   chain`
6. `completes only from exact H full readback under all ten replayed budgets`
7. `suspends approval and unknown outcomes through W and resumes from durable
   replay`
8. `fails closed with zero fallback write or effect on every hostile
   boundary`
9. `binds one opaque mounted resident authority after exact Core authority`
10. `recovers every missing suspension-prefix suffix without an effect`
11. `consumes currentness and issues only bounded suspension-only authority`
12. `leaves same-claim resident suspension checkpoint ownership to W`
13. `runs createResidentBoundedAgentLoopFactory against the real mounted
    fixture`
14. `rejects fabricated swapped stale and substituted dispatcher
    capabilities`
15. `mints only closed-catalog package capabilities through the default API`
16. `uses six literal static adapter modules and eleven constructors without
    initialization-order drift`
17. `attests only the catalog-specific admissible domain outcome`
18. `allows the ordinal-10 automatic compatibility bridge and no other
    ordinal`
19. `enforces the exact dispatcher G W H R static import graph with no
    runtime activation`
20. `keeps the resident permit consumer default private to the dispatcher`
21. `issues an internal exact-hash full-readback port without widening
    Task138 DTO`

Those 21 failures retain their prior classifications against absent approved
G, dispatcher, W, H, orchestrator-interlock, R, or bounded-loop
source behavior. Task10's strict V2 sources and controls remain GREEN. The
inherited non-fatal missing TypeScript source-map warning did not prevent
collection.

The exact released ten-file control command recorded above exited `0`: 10
files and all **443/443** tests passed. Its complete log SHA-256 is
`714e9219f5600e59f88610901ee9268f48913fbfc3560e9badd06ca73f003b48`.
Fresh standalone `npm run typecheck` exited `0`; its empty successful log
SHA-256 is
`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

The repaired C test SHA-256 is
`42ab2358d837ec0fede0547f4f4bbc0ef70a47d1ee9f84017e05a636f1b78ac9`.
The 13-product-source manifest proves exact equality to authority merge
`39495141`: the not-yet-created bounded-loop source remains absent and the
other 12 source blobs are unchanged. Its SHA-256 is
`c20f023f0fb209aa9dd4ef5869d3ef2ffe30dcc661c14bb3b2e446ba39597e4d`.
The other 15 repaired RED test blobs are byte-identical to that same
authority merge; their manifest SHA-256 is
`d72d01e9dcf81a1c77552112d38596ae7ae60e43f5835d456bfdebb0558ae930`.

The repair changes exactly
`packages/agent/test/resident-plan-candidate-provider.test.ts` and this
claim. It changes no product source, contract, plan, mission state, program
registry, provider, credential, runtime activation, route, network,
fallback, unrelated path, or pull request. Task136 remains `implementing`.
This repaired oracle is not Task11 source GREEN, a product candidate,
approval, integration, strict record 29, assurance transition, publication,
or release. The strict product frontier remains **28 of 29**.

## RV-1-E-948 Post-Commit Type-Gap Rejection And Forward Correction

The initial oracle repair commit
`f8daa86516b695b84f1375f14fa08521b6f43b80` is preserved as rejected
history. Its exact parent is authority merge
`3949514139387f3008f001ea0070d7995181d40d`; it is not approved,
review-ready, integrated, Task11 source GREEN, a product candidate, strict
record 29, an assurance transition, publication, or a release.

The first tool-wrapped standalone typecheck observation was incorrectly
classified as an empty successful log. A fresh direct post-commit typecheck
correctly exited `2` with `TS2345` at the call to
`validateResidentLoopEventSequence`: the runtime-valid fixture array's
inferred `type` discriminants had widened to `string`, so TypeScript could
not prove it was `readonly KnowledgeEvent[]`. The runtime validators had
already accepted both individual fixtures and their sequence. This was a
test-only type-level validator-input gap, not a malformed event, weakened
runtime check, source defect, or unrelated dependency failure.

The forward correction keeps both independent
`validateKnowledgeEvent` calls, asserts both results are successful, narrows
those exact results, and passes their typed `data` values to
`validateResidentLoopEventSequence`. It uses no cast, compatibility alias,
weaker assertion, fixture substitution, source change, or other path.

Fresh evidence from the corrected bytes is:

- Focused C exited `1`: exactly 25/25 causal RED tests, with the same exact
  failing-title list and classifications recorded above. The bound plan,
  strict observation, and `P -> O` sequence controls all pass before the
  unchanged legacy C call. Log SHA-256:
  `ee3e9b09b5bf277ea559ddf242734714bf2fed1d5e5881cb79fd3d34b997f17c`.
- The exact sixteen-file card exited `1`: 13 files failed + 3 passed; exactly
  258 tests = 212 passed + 46 failed. The failures are the same 25 C titles
  plus the same 21 unchanged authorized seams recorded above. Log SHA-256:
  `9b7eb93da7e04ddaddd727325996abafb9f9ca82de3433fbbfb744d4164276d3`.
- The exact released control command exited `0`: 10 files and all
  **443/443** tests passed. Log SHA-256:
  `7ad88d6a37e065372d9c84aeba5cdeed31d6231d1e48c8a8dc18c94297fc0878`.
- Fresh standalone `npm run typecheck` exited `0` with `typecheck passed`.
  Log SHA-256:
  `88603ae6d0804b467cf0223e64644258397c61d0119a5876e07565cc5b2dd279`.
- The corrected C test SHA-256 is
  `1d0d8ec525176dc0f47f91f2c6bf60f67a18d65f549345dc8eb23986efbc1701`.
- The regenerated 13-source manifest remains
  `c20f023f0fb209aa9dd4ef5869d3ef2ffe30dcc661c14bb3b2e446ba39597e4d`;
  the absent bounded-loop source and all 12 existing source blobs equal
  rejected parent `f8daa865`.
- The regenerated other-15 RED test manifest remains
  `d72d01e9dcf81a1c77552112d38596ae7ae60e43f5835d456bfdebb0558ae930`;
  every other repaired RED test blob equals rejected parent `f8daa865`.

The forward correction changes exactly
`packages/agent/test/resident-plan-candidate-provider.test.ts` and this
claim. It changes no product source, contract, plan, mission state, registry,
provider, credential, runtime activation, route, network, fallback,
unrelated path, or pull request. Task136 remains `implementing`; the strict
product frontier remains **28 of 29**. A completely fresh focused reviewer
must inspect the corrected bytes before Task11 source GREEN may resume.

## RV-1-E-951 Task12 Dispatcher-Oracle Repair Rejected Checkpoint

Registry authority
`6d2bb576f66c6244ccbc0df5210f6fbc2bd92c0f` was forward-merged into the
preserved Task136 lineage by exact two-parent merge
`6bb9a2336fcad7250ab7bfafe3b738757df429a0`. Its first parent is accepted
Task11 GREEN correction
`f89c0e4cb3edf7587c387897296806906685b363`; its second parent is the
registry authority. The accepted Task11 checkpoint and all earlier
claim/RED/GREEN/review/repair history remain ancestral.

The mandated pre-repair command was:

```bash
npm test -- packages/agent/test/domain-execution-dispatcher.test.ts packages/agent/test/resident-loop-tool-gateway.test.ts packages/agent/test/resident-loop-scheduler-completion-imports.test.ts
```

It exited `1`: all three files failed and exactly 25 tests = 17 passed + 8
failed. Its complete log SHA-256 is
`d84eb8d5110c200918baee940bdf38b252ef8e0dc984fcca971604b610cf54c4`.
The rejected baseline three-test manifest SHA-256 is
`0ddc874a6f8319f5c6fe9e2654820b17232f1453240171812fb396c765195df7`;
its exact blobs were:

- dispatcher test `191a9bc38f3804166d2354cf0f0e8dee65fadd35`;
- gateway test `6c110862dcbcb618f45b66d50b86097e7cfc1e93`; and
- loader test `b0e35fc723509b300f13d078fb0e2af6e86cfbf4`.

That baseline is preserved as rejected history because all eight assertions
were source-string/default-export checks or inert mutation tables rather than
causal executable or AST oracles.

The attempted repair replaces those assertions with real six-family
construction fixtures, all eleven package adapter constructors, reflective
dispatcher and G calls, canonical resident-domain fixture validation and
causation checks, same-ledger package capability/port binding, actual
ordinal-10 effect counting, one-shot/concurrent/cross-binding/recovery
attempts, repository-wide TypeScript AST import/loader checks, and
barrel-first/adapter-first package-factory executions with a planned
fresh-module stable capability-hash comparison.

It is nevertheless rejected under Approach 1/P1 for three exact reasons:

1. The committed design requires `executeFreshAuthorized` to accept a newly
   issued human-approved stage and forbids a stage reconstructed by recovery
   reread from executing, but it commits no same-process operation or input
   that advances the exact branded live human request through one independent
   decision into that executable stage. Without that ABI, the test cannot
   obtain a legitimate G-issued permit for human-only catalog rows.
2. The attempted dispatcher's outcome test still presents a forged permit to
   all eleven rows. That proves rejection only. Successful exact
   admissibility remains unproved for ordinals 2 through 7 and 9 because the
   current six-family fixtures are construction fixtures whose PRR,
   accepted-graph, export/report, and legacy services deliberately throw.
   Ordinal 7's projection mock is likewise not the complete approved
   nonledger fixture. A source that implements only ordinal 10 could therefore
   satisfy the attempted post-API assertions.
3. The attempted `requestFreshAuthorized` operation and the direct-test
   internal G composition input are inferred test-local call shapes, not
   committed authority. They cannot be promoted into the implementation ABI
   by a test-oracle repair checkpoint.

A later append-only authority may close the missing seam by specifying a
same-instance, exact-brand human-decision advance that accepts no locator,
raw decision, callback, IDs, or structural DTO; rereads one matching
independent decision; revalidates W; consumes the transition; and leaves a
fresh instance with recovery-only nonexecutable brands. That correction is
not authorized or implemented by this checkpoint.

The exact three-file command rerun against these rejected checkpoint bytes
exited `1`: all three files failed and exactly 25 tests = 17 passed + 8
failed. The four dispatcher failures and three G failures currently stop at
the absent approved dispatcher default API; the loader failure stops at the
absent exact six-module static import map. The complete current log SHA-256
is
`8f00dd5ccf4a41340f0927a780574bca1c2323c3e9e5ea9e935b6479f1e914fa`.
Those failures do not cure the missing post-API human/admissibility oracle.

Fresh standalone `npm run typecheck` exited `0` with `typecheck passed`; its
complete log SHA-256 is
`88603ae6d0804b467cf0223e64644258397c61d0119a5876e07565cc5b2dd279`.
Fresh `npm run factory:check` exited `0` with `factory-readiness passed`; its
complete log SHA-256 is
`09272a7baed03e65abdf0e54f4deb8f276b98b035b7941a686a2d61c7b1e71bb`.

The rejected checkpoint test SHA-256 values are:

- dispatcher
  `cb11025f152fee54d0023446da13f833c95b7bebdf9fae11a94c4ba498b94d72`;
- gateway
  `63cf4cb65cadc0ebc9dc55e0cc5fc623be84bbe8bacb7306ffd7e12af35b4873`;
  and
- loader
  `439cb77be5f4d154f0d0a808f4fc44aecac9f44786a8de340e140b5b577c027a`.

Their exact Git blobs are respectively
`4ed7a6db7dadb557ab1d8887ed333720857838d1`,
`7d0c6de47d02e20ef3584d3c32e72049502b3d7d`, and
`50443d4d10833567edd82effa5df69ab4c02cc30`; the three-entry manifest
SHA-256 is
`285813d3d9425c9ae46e0dcfeeb7c4141b0c6c866cafb7b883baec3daed8df61`.

The regenerated 13-product-source manifest is byte-identical to exact
authority merge `6bb9a233`; its SHA-256 remains
`d1951cac8dd166cab1ed70667c79cf32e67f1cc4773f25979bfd4cac8240763e`.
The not-yet-created bounded-loop source remains absent and both authorized
Task12 sources remain unchanged at blobs
`96b0ade273696b9ffcf497119f1943f128821a58` for the dispatcher and
`1d4ceaed0cc5efe4640a7e135eedf8f2c07dc8fe` for G. The regenerated other-13
RED-test manifest is also byte-identical to `6bb9a233`; its SHA-256 remains
`8515b625907f3ddebf67368bca5ada5cf1369e43fb447423ba4d5005cdba6ef0`.

`git diff --check` passes. The exact checkpoint scope is only:

```text
packages/agent/test/domain-execution-dispatcher.test.ts
packages/agent/test/resident-loop-tool-gateway.test.ts
packages/agent/test/resident-loop-scheduler-completion-imports.test.ts
docs/agentic/claims/task-136-resident-full-vision-bounded-loop.md
```

No product source, contract, plan, mission state, program registry, provider,
credential, runtime activation, route, network, fallback, unrelated path, or
pull request changes. Exact authority merge `6bb9a233`, Task11 GREEN
`f89c0e4c`, and all their ancestors remain ancestral. The atomic checkpoint
commit is required to be clean immediately after creation.

This is an append-only **rejected checkpoint**. It is not an approved or
causal Task12 RED, Task12 source GREEN, a product candidate, approval,
integration, strict record 29, assurance transition, publication, or product
release. Task136 remains `implementing`; the strict product frontier remains
**28 of 29**.

## RV-1-E-957 Task12 Causal-RED Oracle Repair

Registry authority
`51a338f36b99dcaed92959144991ab6dcff47454` was forward-merged into the
preserved Task136 lineage by exact two-parent merge
`2eca46733f784cc39c1c6787f5c862fe18a74d29`. Rejected Task12 checkpoint
`b54281b06ef420189ec0b1ffd82caa5d8bf4c2eb`, rejected fresh-decision design
`eb36b46edb19ff68fe3738093702b0a49f0eede2`, approved original design
`d475edd5cafd57a6f7db6c26aeeecb48bd9459cd`, approved dual-context
descendant `933498c2ee73a7b11dd481d1df13893aee45423e`, permanent RED,
Task10/Task11 GREENs, and all prior authority, repair, and review history
remain ancestral and unchanged.

The repaired dispatcher oracle has one canonical eleven-row catalog and one
six-family real fixture matrix. It does not retain a second inert catalog or
construction-only positive table. Before calling either absent Task12
surface, it directly constructs and exercises every released adapter:

- ordinals 0 and 1 fail closed without a ledger change;
- PRR ordinals 2 and 3 use independently constructed initial and follow-up
  contexts with distinct tool, message, request-state, and idempotency facts,
  the same exact ledger, and the same exact
  workspace/`agent_default`/task tuple;
- ordinal 4 uses the released assertion and governance services;
- export/report ordinals 5 and 6 use independently constructed export and
  report contexts with distinct artifact kinds, IDs, inputs, and output
  hashes, the same exact seeded ledger, and the same exact tuple;
- ordinal 7 produces nonempty portable projection artifact hashes and its
  exact read-model change with zero ledger delta;
- ordinal 8 rejects at the released data-loss-risk boundary with zero ledger
  delta; and
- ordinals 9 and 10 append their exact released event types.

Each admissible event-producing released adapter is invoked once for new
events and again for the exact idempotent existing event IDs. The projection
adapter proves its nonledger result separately. Safe negative controls reject
swapped PRR and export/report contexts, cross-used tool-specific contexts,
mismatched ledgers, and mismatched resident/task tuples. Every context is
passed unchanged to its exact released constructor; no sibling context is
spread, rewritten, or substituted.

The end-to-end oracle then routes ordinals 2 through 7 and 9 through 10
through the absent default dispatcher API and the internal G composition.
It requires exact durable request, independent human decision for all
human-only rows, permanent claim, invocation attestation, outcome receipt,
and completion. Event-producing rows require both
`new-ledger-events` and `idempotent-existing-ledger-events`; ordinal 7 alone
requires `nonledger-projection-artifacts`; ordinals 0, 1, and 8 may produce
no successful receipt or terminal. Forged-permit and automatic-ordinal
controls remain rejection-only negatives and cannot substitute for these
positive cases.

The G oracle now exercises the exact same-process human sequence:
`requestFreshAuthorized`, independent append of one exact bound durable human
approval, `readFreshHumanDecision` with the same live unconsumed requested
brand, then `executeFreshAuthorized`. It proves the effect and completion
occur exactly once and that the consumed requested brand cannot be advanced
again. A separately reconstructed durable requested-plus-approved prefix is
returned only through `rereadAndIssueFromLedger`; both
`readFreshHumanDecision` and `executeFreshAuthorized` reject that recovery
stage with zero effect. Existing automatic, concurrent, foreign-instance,
unknown-effect, and receipt-finalization controls remain.

The loader oracle uses the TypeScript AST and repository source graph to
require the exact six literal adapter module imports in frozen order, their
exact constructors and descriptors, the dispatcher as the sole production
default importer of G, no named/namespace/barrel/star/dynamic/evaluator/
`require`/loader escape, no top-level imported-adapter reads, and no
default-private resident ABI widening through the barrel. It freezes the
Task12 definition scope to exactly
`packages/agent/src/domain-execution-dispatcher.ts` and
`packages/agent/src/resident-loop-tool-gateway.ts`, and retains
barrel-first/adapter-first initialization checks.

The fresh focused command was:

```bash
npm test -- packages/agent/test/domain-execution-dispatcher.test.ts packages/agent/test/resident-loop-tool-gateway.test.ts packages/agent/test/resident-loop-scheduler-completion-imports.test.ts
```

It exited `1`: all three files failed and exactly 25 tests = 17 passed + 8
failed. Four dispatcher tests and three G tests stop only at the absent
Task12 default dispatcher API after the real released-fixture preflight
passes. The loader test stops only at the absent exact six-module static
import map. There is no construction, execution-DTO, event, context,
projection, collection, dependency, type, or unrelated inherited failure.
The non-fatal missing TypeScript source-map warning does not prevent
collection. The complete focused log SHA-256 is
`3b8bf5e60c4f802e1b53bab4d25cfa0eae49403194d85d0e2e3a4418c9de3d20`.

The exact six released adapter control files exit `0`: 6 files and all
**79/79** tests pass. Their complete log SHA-256 is
`a046ea2b11caf0a402d654cfac1679ae9224b4e29627bbdc43cd659f729f2319`.
Fresh standalone `npm run typecheck` exits `0` with `typecheck passed`; its
log SHA-256 is
`88603ae6d0804b467cf0223e64644258397c61d0119a5876e07565cc5b2dd279`.
Fresh `npm run factory:check` exits `0` with `factory-readiness passed`; its
log SHA-256 is
`09272a7baed03e65abdf0e54f4deb8f276b98b035b7941a686a2d61c7b1e71bb`.
The calibrated mission validator passes **20/20** and reports unchanged
fingerprint
`sha256:097cf3e8490fe33caab5c663bc1a2e0e1049283b499eb98d4828e9a405210ff0`.
V4 assurance passes **20/20** and contract mode emits exactly:

```text
TASK136_RELEASE_GRAPH_OK records=29
TASK136_COMPOSITION_CORPUS_OK green=1 red=20
TASK136_COMMAND_CARDS_OK cards=29
TASK136_ABI_CORPUS_OK green=1 red=15
```

The repaired test SHA-256 values are:

- dispatcher
  `e33dbc39a2a80febc6e80b0cad0fc3e283f00559fcb50435c093b74d2b801524`;
- G
  `053a9af87e8d3bdb2dce57c3a78d352cac083d1761e0e9f89da173df44cd1150`;
  and
- loader
  `ff1ece3488adb3fc3774a2977c1133bd819164ffb00bf691cfe034c79a54ba6c`.

Their exact Git blobs are respectively
`6d911dd5b147c010c0fba2b36f1707bd67ca8ddf`,
`6a1cd6cf6297356709fa0c59ed23e8d33e3a8133`, and
`bf1338ce9fb85bb53e2cd2241c86b18de73adf6b`. Both authorized Task12 product
sources remain unchanged at blobs
`96b0ade273696b9ffcf497119f1943f128821a58` for the dispatcher and
`1d4ceaed0cc5efe4640a7e135eedf8f2c07dc8fe` for G.

`git diff --check` passes. The exact checkpoint scope is only:

```text
packages/agent/test/domain-execution-dispatcher.test.ts
packages/agent/test/resident-loop-tool-gateway.test.ts
packages/agent/test/resident-loop-scheduler-completion-imports.test.ts
docs/agentic/claims/task-136-resident-full-vision-bounded-loop.md
```

No product source, contract, plan, mission state, program registry, provider,
credential, runtime activation, route, network, fallback, unrelated path, or
pull request changes. This exact four-path checkpoint requires a completely
fresh focused review before either Task12 product source may change. Any
changed test or claim byte invalidates that review.

This is a review-ready causal-RED oracle checkpoint, not Task12 source GREEN,
a product candidate, approval, integration, strict record 29, assurance
transition, publication, or product release. Task136 remains `implementing`;
the strict product frontier remains **28 of 29**.

## RV-1-E-959 Task12 Five-Point Forward Causal-RED Correction

The exact RV-1-E-959 authority commit
`e7212c0821303967388ba2aa0762e577e038eb5e` was forward-merged into the
preserved Task136 product lineage by exact two-parent merge
`88eafc00916ca3a201efcaf3ec4bce63b50f4ec5`. Rejected causal-RED candidate
`fcb612e77ddeee905cc3dc2ff6163d362af10471`, rejected checkpoint
`b54281b06ef420189ec0b1ffd82caa5d8bf4c2eb`, approved written-design
descendant `933498c2ee73a7b11dd481d1df13893aee45423e`, and all prior
RED/GREEN/repair/review history remain unchanged and ancestral.

The five reviewed P1 oracle defects are corrected without a product-source
edit:

1. The repository AST classifier now counts only actual value declarations,
   object methods, function-valued properties, and exports of the protected
   Task12 operations. It does not count imports, property-access calls,
   property consumers, or aliases assigned from a consumer. A direct control
   fixture executes before the causal loader failure and proves Task14's
   planned
   `dispatcherDefault.bindPackageOwnedResidentDomainExecutionPort(...)`
   property call, a G method call, a same-named consumer alias, and a general
   consumer reference do not create a third definition source. The production
   definition set remains exactly the dispatcher and G sources.
2. Recovery now rereads and obtains the recovery-only human `requested` stage
   before any decision exists. The independent actor/path then appends the
   exact bound durable approval. On the same G instance,
   `readFreshHumanDecision(recoveryRequested)` and
   `executeFreshAuthorized(recoveryRequested)` both reject with zero effect.
   A later recovery reread may return the durable human-approved state, but
   that recovery human-approved brand also remains nonadvanceable and
   nonexecutable.
3. Every fail-closed ordinal 0, 1, and 8 requires an actual rejected execution
   and an undefined successful evidence/attestation result. Its exact
   tool-bound resident stream must contain neither an outcome receipt nor a
   completed terminal. A direct counterfactual proves that the same predicate
   detects an independently fabricated completed terminal even when no
   receipt exists, so a source cannot hide completion behind the released
   adapter rejection.
4. The exact new `readFreshHumanDecision` ABI now receives real durable cases
   for zero decisions, multiple approvals, self-issued approval, a stale
   approval timestamp, an approval observed after its request budget expires,
   a denial, an approval followed by a later bound denial representing
   revocation, and an approved-preview mismatch. Every case retains the exact
   live same-instance requested brand and independently appended event facts;
   every rejection also proves zero execution claim, outcome receipt,
   completed terminal, or domain effect.
5. The G default-export oracle now resolves the default expression to an exact
   `Object.freeze` object and requires its sole property and operation to be
   `consumeResidentDomainExecutionPermit`. Direct valid and widened AST
   controls prove a second issuer operation is detected. Both runtime import
   orders require the same exact frozen one-key object, while named runtime
   exports remain exactly the import-gated
   `createResidentLoopToolGateway`; no public or named permit issuer is
   accepted.

The real six-family fixture matrix, independent PRR and export/report
contexts, positive per-ordinal evidence, safe context negatives, catalog
order, default-only access, no dynamic loading, source freeze, and prior
same-process human positive remain unchanged.

The fresh focused command was:

```bash
npm test -- packages/agent/test/domain-execution-dispatcher.test.ts packages/agent/test/resident-loop-tool-gateway.test.ts packages/agent/test/resident-loop-scheduler-completion-imports.test.ts
```

It exits `1`: all three files fail and exactly 25 tests = 17 passed + 8
causal RED failures. Four dispatcher tests and three G tests stop only at the
absent Task12 default dispatcher API after the released-fixture preflight.
The loader's classifier/default-object counterfactuals execute successfully
before its sole failure at the absent exact six-module static import map.
There is no construction, event, context, execution-DTO, collection,
dependency, type, or unrelated inherited failure. The non-fatal missing
TypeScript source-map warning does not prevent collection. The complete
focused log SHA-256 is
`038e6555551353e0091fbe791274699dfbd6f98262635ec1751bcbd71c731084`.

The exact six released adapter controls exit `0`: 6 files and all **79/79**
tests pass. Their complete log SHA-256 is
`f85babe29865d7bd99a5af7456e2b2d0d641d343e5f09d41e073b33589eb0d31`.
Fresh standalone `npm run typecheck` exits `0` with `typecheck passed`; its
log SHA-256 is
`88603ae6d0804b467cf0223e64644258397c61d0119a5876e07565cc5b2dd279`.
Fresh `npm run factory:check` exits `0` with `factory-readiness passed`; its
log SHA-256 is
`09272a7baed03e65abdf0e54f4deb8f276b98b035b7941a686a2d61c7b1e71bb`.
The calibrated mission validator passes **20/20** with unchanged fingerprint
`sha256:097cf3e8490fe33caab5c663bc1a2e0e1049283b499eb98d4828e9a405210ff0`.
V4 assurance passes **20/20** and contract mode emits exactly:

```text
TASK136_RELEASE_GRAPH_OK records=29
TASK136_COMPOSITION_CORPUS_OK green=1 red=20
TASK136_COMMAND_CARDS_OK cards=29
TASK136_ABI_CORPUS_OK green=1 red=15
```

The corrected test SHA-256 values are:

- dispatcher
  `9c2e3d971c3813946ef5a166b7eb1d6e46d70e4fc1ffe6d86a11f3ba191d0662`;
- G
  `08f2a0758d7583d3e84fbd75d52e27b3f4be65baf8f6c11f20f31c5b1484339a`;
  and
- loader
  `620a04454cc900736306a9e154518ce223774990826a5dd760177ca1b2f2f12a`.

Their exact Git blobs are respectively
`846f0bb1e62719fb10b0af179b6d35c59633f733`,
`a53f7425ec2b86bc28343446064fb3df7e5f3137`, and
`4f9a1e003afa35f78612b05352903d1bdf07f7f1`. Both frozen Task12 product
sources remain unchanged at dispatcher blob
`96b0ade273696b9ffcf497119f1943f128821a58` and G blob
`1d4ceaed0cc5efe4640a7e135eedf8f2c07dc8fe`.

The exact correction scope is only:

```text
packages/agent/test/domain-execution-dispatcher.test.ts
packages/agent/test/resident-loop-tool-gateway.test.ts
packages/agent/test/resident-loop-scheduler-completion-imports.test.ts
docs/agentic/claims/task-136-resident-full-vision-bounded-loop.md
```

No product source, contract, plan, mission state, program registry, provider,
credential, runtime activation, route, network, fallback, unrelated path, or
pull request changes. This exact descendant requires a completely fresh
focused reviewer; the `fcb612e7` reviewer is ineligible for changed bytes.
Any changed test or claim byte invalidates that review.

This is a review-ready forward causal-RED correction, not Task12 source
authorization or GREEN, a product candidate, approval, integration, strict
record 29, assurance transition, publication, or product release. Task136
remains `implementing`; the strict product frontier remains **28 of 29**.

## RV-1-E-961 Task12 Two-Point Loader-Oracle Correction

Exact RV-1-E-961 authority
`83d148d6fc56b46d1b7632096b0a3f678e8d8448` was forward-merged into the
preserved Task136 lineage by exact two-parent merge
`8a8b1b7809c38616cba68eebc562a3523323c5da`. Its first parent is
`2c7bae6705aa8515c5a247fccdc60fa74b0a1e4c`; its second parent is that exact
registry authority. Rejected candidates
`9f33e0b9309be0bf62054833816833c932233819`,
`fcb612e77ddeee905cc3dc2ff6163d362af10471`, and
`b54281b06ef420189ec0b1ffd82caa5d8bf4c2eb`, plus every approved design,
permanent RED, GREEN, repair, and review ancestor, remain preserved and
unchanged.

The default-G ceiling now uses one conservative AST analysis for the default
`Object.freeze` literal. It reports every statically spelled own operation
name, rejects any computed or unresolved name, rejects symbol keys and
spreads, and rejects accessor or statically noncallable data properties.
Direct controls prove the exact sole consumer is accepted while an added
string issuer, a statically resolved computed issuer, a symbol-keyed issuer,
and an unresolved computed operation are detected. Both real import orders
then inspect the runtime default with `Reflect.ownKeys` and its exact own
descriptor. The object must be frozen and contain exactly one enumerable,
nonconfigurable, nonwritable data property named
`consumeResidentDomainExecutionPermit` whose value is callable. Independent
runtime controls reject string and symbol widening, an accessor, and
noncallable data without invoking an accessor.

The protected-definition freeze now classifies emitted value definitions
across function and value declarations, class methods and fields, object
methods and properties, class and object accessors, and later identifier,
property, or element assignments. Literal names and statically resolvable
computed string names are matched; unresolved dynamic definition names are
reported separately and fail the production exact-source assertion. Eleven
independent positive fixture files prove each required declaration/member/
assignment family rather than allowing one recognized shape to mask another.
Additional controls prove imports, re-exports, type-only and ambient
declarations, consumer aliases, consumer/property calls, and Task14's
authorized dispatcher-binder call do not create a definition source.
Known symbol expressions such as existing `[Symbol.iterator]` members are
statically non-string and cannot alias a protected string operation. The
production definition set remains exactly the dispatcher and G sources with
no unresolved definition source.

The fresh focused command is:

```bash
npm test -- packages/agent/test/domain-execution-dispatcher.test.ts packages/agent/test/resident-loop-tool-gateway.test.ts packages/agent/test/resident-loop-scheduler-completion-imports.test.ts
```

It exits `1`: all three files fail and exactly 25 tests = 17 passed + 8
causal RED failures. All new loader counterfactuals execute successfully.
Four dispatcher tests and three G tests stop only at the absent Task12
default dispatcher API; the loader stops only at the absent exact six-module
static import map. There is no construction, event, context, execution-DTO,
collection, dependency, type, oracle-control, or unrelated inherited
failure. The non-fatal missing TypeScript source-map warning does not prevent
collection. The complete focused log SHA-256 is
`4caa82b09f379d5d3a805c3d7775785d2fcec30b64be8c0470fa4975729101d3`.

The exact six released adapter controls exit `0`: 6 files and all **79/79**
tests pass. Their complete log SHA-256 is
`4bd4f680ff98e9aac8cb2db529a2c3b860e5f35d7164c6045a4c2c78696d958f`.
Fresh standalone `npm run typecheck`
exits `0` with `typecheck passed`; its complete log SHA-256 is
`88603ae6d0804b467cf0223e64644258397c61d0119a5876e07565cc5b2dd279`.
Fresh `npm run factory:check` exits `0`
with `factory-readiness passed`; its complete log SHA-256 is
`09272a7baed03e65abdf0e54f4deb8f276b98b035b7941a686a2d61c7b1e71bb`.

The calibrated mission validator passes **20/20** with unchanged fingerprint
`sha256:097cf3e8490fe33caab5c663bc1a2e0e1049283b499eb98d4828e9a405210ff0`.
V4 assurance passes **20/20** and contract mode emits exactly:

```text
TASK136_RELEASE_GRAPH_OK records=29
TASK136_COMPOSITION_CORPUS_OK green=1 red=20
TASK136_COMMAND_CARDS_OK cards=29
TASK136_ABI_CORPUS_OK green=1 red=15
```

The corrected loader test SHA-256 is
`7ed97baa3003244e8aa5623d5851f6a4ff0c9dccd12bc8198c2b8f9aa0c40253`;
its exact Git blob is `355814990eb1a6bdff392bfa76c4110de196084b`.
Frozen dispatcher and G tests remain exact at
blobs `846f0bb1e62719fb10b0af179b6d35c59633f733` and
`a53f7425ec2b86bc28343446064fb3df7e5f3137`. Both Task12 sources remain
exact at dispatcher blob `96b0ade273696b9ffcf497119f1943f128821a58`
and G blob `1d4ceaed0cc5efe4640a7e135eedf8f2c07dc8fe`.

`git diff --check` passes. The exact correction scope is only:

```text
packages/agent/test/resident-loop-scheduler-completion-imports.test.ts
docs/agentic/claims/task-136-resident-full-vision-bounded-loop.md
```

No product source, dispatcher/G test, contract, plan, mission state, program
registry, provider, credential, runtime activation, route, network, fallback,
unrelated path, or pull request changes. Repository mode must retain the
actual pre-record-29 W1 mismatch and may not claim prefix or release closure.
The exact two-path descendant requires a completely fresh focused reviewer;
both prior RED reviewers and every candidate author are ineligible. Any
changed test or claim byte invalidates that review.

This is a review-ready two-point forward loader-oracle correction, not Task12
source authorization or GREEN, a product candidate, approval, integration,
strict record 29, assurance transition, publication, or product release.
Task136 remains `implementing`; the strict product frontier remains **28 of
29**.
