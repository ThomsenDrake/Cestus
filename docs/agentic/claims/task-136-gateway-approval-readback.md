# G136-R Gateway Approval Readback Claim

## Claim

- Card: `G136-R`, V4 release-graph position 23.
- Branch and worktree: `codex/g136-r-gateway-approval-readback` at
  `/home/drake/.codex/worktrees/9c75/Cestus`.
- Exact base: `9c9d532e1a33aca48d89f28e3e4c48d288d616f5`.
- Released prerequisites: `T120-R` and `G136-SC` only.
- Model: GPT-5.6 Terra with xhigh reasoning.
- Governing authority: Task136 V4 contract, frozen bounded-loop plan, and
  registry records `RV-1-E-660`, `RV-1-E-704`, and `RV-1-E-801` through
  `RV-1-E-815`.

The status transitions from **claimed** to **implementing** in this isolated
worktree. This claim commit creates no production capability and changes no
test bytes.

## Exact V4 Ownership

| Path | Disposition |
| --- | --- |
| `packages/agent/src/resident-loop-tool-gateway.ts` | owned |
| `packages/agent/test/resident-loop-tool-gateway.test.ts` | owned |
| `packages/agent/test/resident-loop-scheduler-completion-imports.test.ts` | owned (transferred from `G136-SC`) |
| `docs/agentic/claims/task-136-gateway-approval-readback.md` | owned |

No other path is authorized. In particular, this card does not edit the V4
registry or contract; `tool-gateway.ts`, `scheduler.ts`, and
`resident-loop-scheduler-completion.ts` remain released G136-SC authority.

## Bounded Implementation Contract

The sole new bridge must derive request, independent-human decision, execution
claim, scheduler-issued durable completion evidence, and completed-result
readbacks from the authoritative ledger/gateway. It binds exact request, task,
run, tool, version, preview, approval, provenance, and currentness facts.

It fails closed before execution or completion for missing, copied,
structural, accessor/proxy/extra-key, duplicate, unreadable, stale, denied,
terminal, changed-preview, cross-request/run, wrong tool/version/task,
self-issued approval/result, or post-readback substituted evidence. It uses
only the released G136-SC private scheduler-evidence route for completion.

The bridge preserves one resident identity, independent human approval,
append-only ledger semantics, exact provenance, secret safety, projection
rebuildability, and a current reread after each await. It adds no generic
result event, second completion route, public `completeTool`, compatibility or
fallback authority, provider, credential, network, external effect, or
non-ledger storage write.

## Required History And Commands

1. This claim-only commit records **claimed -> implementing**.
2. A causal RED commit adds only the two owned test files and fails because
   `resident-loop-tool-gateway` is absent, including valid durable readback and
   hostile/cross-boundary cases. The transferred import test history remains.
3. One minimal GREEN commit adds the source bridge and updates this claim;
   RED assertions are not weakened.

```bash
npm test -- packages/agent/test/resident-loop-tool-gateway.test.ts packages/agent/test/resident-loop-scheduler-completion-imports.test.ts
npm test -- packages/agent/test/resident-loop-tool-gateway.test.ts packages/agent/test/resident-loop-scheduler-completion-imports.test.ts packages/agent/test/tool-gateway.test.ts packages/agent/test/scheduler.test.ts packages/agent/test/resident-loop-scheduler-completion.test.ts packages/agent/test/plan-observation-contracts.test.ts packages/agent/test/plan-observation-projection.test.ts
npm run typecheck
node --test scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs
npm test
npm run verify
git diff --check
npm run factory:check
```

## Stop Rules

Stop and return exact evidence for data-loss risk, schema or ownership conflict,
unavailable dependency, credential or external-service need, a required product
or external-behavior decision, safety-invariant conflict, or repeated verifier
failure. Recover contract-determined failures under `RV-1-E-732`; do not reset,
rebase, amend, squash, drop, reorder, cherry-pick-over, stash, discard,
rewrite, self-integrate, merge, push, use credentials, contact external
systems, or touch `neo`.

## GREEN Implementation Record

The minimal bridge is `createResidentLoopToolGateway` in the owned source path.
It snapshots only plain own-data requests, reads the exact current Task120 plan
before and after gateway work, embeds that plan event plus its frozen source
and artifact bindings in the requested preview, and returns only issued
readback capabilities. Decision, claim, execution, and result transitions
reread the same durable request/plan state and reject any mismatch or terminal
substitution. Completion consumes only the opaque evidence returned by the
released private G136-SC adapter.

The GREEN adjusts only invalid test fixture literals to their existing canonical
Task120 schema forms; it retains every RED behavior assertion and adds no
compatibility or alternate completion authority.

## RV-1-E-732 Compiler Recovery Checkpoint

The initial committed GREEN `2ce618e5` is preserved. Root typecheck reproduced
two scoped diagnostics in the owned bridge source before any runtime behavior
changed:

1. `TS2459`: `AgentToolSideEffectClass` was imported from `tool-gateway.js`,
   where it is declared locally but not exported.
2. `TS2379`: casting `approvalClass` through the optional
   `RequestAgentToolInput["requiredApprovalClass"]` widened the value to
   include `undefined` under `exactOptionalPropertyTypes`.

This is a compiler-only, contract-determined recovery. The existing four-test
card remains the causal runtime proof, so no new runtime test is needed. This
claim/evidence-only commit is the causal compiler RED: it preserves the exact
two diagnostics and changes no production behavior. One minimal forward GREEN
will import the side-effect type from its owning module and cast the already
validated non-`none` approval class to its required non-optional type. No
other path, completion route, or authority changes.

## RV-1-E-732 Compiler GREEN

The forward GREEN makes exactly the two diagnosed type corrections in the
owned bridge source: it imports `AgentToolSideEffectClass` from
`projection-types.js`, and uses the required `AgentApprovalClass` after the
bridge has rejected `none`. It changes no runtime flow, ledger write, preview,
approval predicate, completion route, or test assertion.

## RV-1-E-817 Final-Review Causal RED

The registry-only normal merge `34e37c511e5f17dad2dc4faa37e91519a5a1dae5`
preserves the initial claim/runtime RED/initial GREEN/compiler RED/compiler
GREEN chain through candidate `598ab0a7d6bf3f9ebe569a234e81e22f67bdcaf2`.
Fresh architecture and executability verdicts recorded in `RV-1-E-817` expose
one contract-determined P1 packet, so status advances **implementing-repair ->
 recovery-red** before any new production edit.

This causal RED adds adversarial assertions only in the two owned test paths.
They require the bridge to reject an old plan when a newer plan for the same
`agent_default` resident/task/attempt/run changes every policy and provenance
field; reject complete selected-plan byte substitution across awaits; reject a
claim whose `claimedBy` or context actor is not exact `agent_default` before
execution or completion; bind the durable requested side-effect class to the
parsed command; and ignore unbranded structural request/completion gateway
objects. The existing source fails these assertions because it compares an
incomplete plan identity, does not preserve complete plan bytes across the
request await, omits exact claim-actor/claimant checks and durable side-effect
binding, and delegates request/completion to a caller-supplied structural
gateway. Hostile cases assert no completion.

The next and only recovery GREEN will remain within the four owned paths. It
will compose the released `createAgentToolGateway` directly over the ledger
with fixed exact `agent_default` actor identity, retain only the released
opaque G136-SC scheduler-evidence completion path, bind complete plan bytes
through opaque issued readbacks, and update this claim to **green**. No
registry, released dependency, contract/spec/plan, generic completion route,
provider/credential/network/external effect, or non-ledger storage write is
authorized.

## RV-1-E-817 Final-Review GREEN

The minimal forward correction advances **recovery-red -> green**. The bridge
now composes the released `createAgentToolGateway` directly with the fixed
`agent_default` agent actor; its constructor accepts no request or completion
gateway object. It retains only `completeToolFromSchedulerEvidence` on that
genuine gateway after the released private G136-SC adapter has reread opaque
evidence.

Every issued readback now privately retains exact serialized bytes of its
selected Task120 plan. Each later current reread and every await boundary must
match those complete bytes, while supersession compares the required resident,
task, attempt, and run identity independent of mutable policy/provenance
fields. Request readback explicitly carries the durable side-effect class and
requires it to equal the parsed command. Claims must have both `claimedBy` and
agent context actor equal to exact `agent_default` before the execution
callback or completion path is reached.

The RED assertions are retained. The owned test helper passes a deliberately
unbranded extra gateway property only through an erased structural cast, proving
that it has no authority at runtime; no compatibility input or fallback is
added to the production API. The focused card is GREEN at **2 files / 9
tests**. This correction creates no provider, credential, network, external
effect, generic result event, public completion method, or storage write
outside the ledger.

## RV-1-E-732 Post-GREEN Compiler RED

The final `npm run verify` typecheck reproduces two scoped diagnostics in the
owned adversarial test file after `751831b7`, with no runtime assertion or
production path implicated. First, the structural-completion callback passes
an optional `executionClaimEventId` to an exact-optional `causationId` field.
Second, its hostile ledger wrapper broadens a discriminated `KnowledgeEvent`
union while replacing only the selected plan descriptor bytes. The runtime
card remains GREEN at 2 files / 9 tests, so this claim-only checkpoint is the
causal compiler RED under `RV-1-E-732`; status advances **green ->
compiler-recovery-red** before any correction.

The sole follow-on GREEN will retain every runtime assertion and make no
production change: it will require the callback's already-validated claim ID
before building its evidence DTO, and preserve the ledger union discriminator
while constructing the hostile selected-plan mutation. It remains strictly
within the four owned paths and creates no new authority or external behavior.

## RV-1-E-732 Post-GREEN Compiler GREEN

The forward compiler GREEN is test-only. It retains all nine focused
assertions, explicitly narrows the callback claim ID before it becomes durable
evidence causation, and constructs the hostile plan readback as an exact
`agent.resident-plan.recorded.v1` event rather than widening the ledger union.
The exact focused card is again **2 files / 9 tests** and `npm run typecheck`
passes. Status advances **compiler-recovery-red -> green** with no production
flow, source authority, ledger write shape, completion route, or external
behavior change.

## RV-1-E-819 Completion-Boundary Race RED

Normal registry merge `884a688bd4c21e00d21830f49f17168ef2c4401f` preserves
every prior G136-R commit through the clean candidate `3e6fdf29`. The exact
adversarial verdict `019f7aa2-20ba-78c3-8cb6-b750ce91e8aa` reproduces one P1:
a newer policy/authority/provenance-changed plan can append after the bridge's
last plan-currentness reread but before the official completion append. The
current bridge then appends `agent.tool.completed` and only rejects on the
post-completion reread.

This causal RED adds one deterministic hostile assertion in the owned gateway
test. Its ledger wrapper injects that newer same resident/task/attempt/run plan
on the effect-boundary tool-stream read after the eleventh plan read (the final
current-plan reread). It requires `executeAndReadback` to reject with
`wasInjected=true` and no durable completion. Existing production rejects but
leaves completion behind, so the RED fails solely on the forbidden completed
event. The existing nine tests and every hostile assertion remain unchanged.

The sole follow-on GREEN will remain within the four owned paths. Immediately
before the final exact plan reread it will capture the ledger's global event
count, then call released `createAgentToolGateway().completeToolFromSchedulerEvidence`
with the unchanged adapter-issued evidence over a request-local guarded ledger
view. That view will preserve the released `expectedNextSequence` and add only
the captured `expectedGlobalEventCount` to its append options, forcing any
competing plan or global append to conflict before completion. It will add no
direct completion append, alternate route, widened released API, provider,
credential, network, external behavior, or non-ledger storage.

## RV-1-E-819 Completion-Boundary Race GREEN

The minimal forward correction advances **completion-race-red -> green**. In
`executeAndReadback`, the bridge captures `readAll().length` immediately before
its final exact current-plan reread. It then creates a request-local released
`createAgentToolGateway` over a card-local guarded ledger only for the official
`completeToolFromSchedulerEvidence` call. The adapter-issued evidence remains
unchanged.

The guarded view delegates every read and preserves the official gateway's
`expectedNextSequence`; it rejects a second global precondition and adds the
captured `expectedGlobalEventCount` to the one completion append. Thus a plan
or any other global append after the snapshot causes the released ledger's
atomic concurrency conflict before `agent.tool.completed`, while a changed
plan during the final reread is rejected by existing exact currentness checks.
The guard is closure-local to one execution and carries no shared mutable
state. The focused card is GREEN at **2 files / 10 tests**; all earlier hostile
assertions are retained. No released source/API changes, direct completion,
alternate authority, provider/credential/network/external behavior, or
non-ledger storage is introduced.

## RV-1-E-732 Completion-Guard Compiler RED

The first post-GREEN `npm run typecheck` reproduces exactly three scoped
`noImplicitAny` diagnostics in the owned completion-guard implementation:
the delegated `append` event/options and `readStream` stream ID parameters
lacked their inherited `EventLedger` method annotations. The focused runtime
card remains GREEN at 2 files / 10 tests, and no authority or behavior issue is
reproduced. This claim-only checkpoint advances **green -> compiler-recovery-red**
before the production correction.

The sole forward compiler GREEN will make no runtime change: it will explicitly
type the guarded ledger object as `EventLedger`, allowing its delegated methods
to retain the released ledger parameter and return types while preserving the
captured global-count append precondition and every hostile assertion.
