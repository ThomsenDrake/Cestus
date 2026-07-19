# G136-SC Scheduler Completion Adapter Claim

Status: implementing-repair

Card: `G136-SC` (Task136 bounded-assurance V4 release graph, card 22)

Branch: `codex/g136-scheduler-completion-adapter`

Base: `863c93a09a0817365c6b41996cc751efa16efd78`

Prerequisite: `T120-R` (released)

Model: `gpt-5.6-terra` with `xhigh` reasoning

## Scope and ownership

This claim transitions from **claimed** to **implementing** for exactly the V4
card ownership below. `resident-loop-scheduler-completion-imports.test.ts` is
transferred onward to `G136-R`; this card may retain its existing boundary while
making no changes outside its transferred disposition.

| Path | Disposition |
| --- | --- |
| `packages/agent/src/tool-gateway.ts` | owned |
| `packages/agent/src/scheduler.ts` | owned |
| `packages/agent/src/resident-loop-scheduler-completion.ts` | owned |
| `packages/agent/test/tool-gateway.test.ts` | owned |
| `packages/agent/test/scheduler.test.ts` | owned |
| `packages/agent/test/resident-loop-scheduler-completion.test.ts` | owned |
| `docs/agentic/claims/task-136-scheduler-completion-adapter.md` | owned |
| `packages/agent/test/resident-loop-scheduler-completion-imports.test.ts` | transferred to `G136-R` |

## Contract

The scheduler/executor completion path gains one private completion adapter.
Before any `agent.tool.completed` append it durably rereads authoritative
gateway/domain result evidence and binds the exact request, run, approved
preview, execution claim, provenance/event/artifact/read-model result evidence,
current stream state, and durable reread. Missing, forged, copied, stale,
cross-request/run, mismatched, unreadable, duplicate, or terminal evidence
fails closed without a completion append. The existing request → independent
approval → execution claim → execute flow stays intact. No raw provider/tool
body, secret, fallback store, general executor, or shared-schema invention is
permitted. Ledger appends remain append-only and projections rebuildable.

## Required commands

```bash
npm test -- packages/agent/test/tool-gateway.test.ts packages/agent/test/scheduler.test.ts packages/agent/test/resident-loop-scheduler-completion.test.ts packages/agent/test/resident-loop-scheduler-completion-imports.test.ts
npm test -- packages/agent/test/tool-gateway.test.ts packages/agent/test/scheduler.test.ts packages/agent/test/resident-loop-scheduler-completion.test.ts packages/agent/test/resident-loop-scheduler-completion-imports.test.ts packages/agent/test/scheduler-types.test.ts packages/agent/test/projection.test.ts packages/agent/test/execution-loop.test.ts
npm run typecheck
git diff --check
npm run factory:check
npm run verify
```

## Stop rules

Stop and return exact evidence to the coordinator for data-loss risk, schema or
file-owner conflict, unavailable dependency, safety-invariant conflict,
credential or external-behavior decision, or repeated verifier failure. Do not
reset, rebase, amend, discard, rewrite, integrate, merge, push, contact an
external service, use credentials, touch `neo`, or create a coordinator, relay,
watchdog, or handoff.

## Consolidated repair authorization

This is the sole consolidated G136-SC repair packet. The reviewed candidate
left a caller-structural `completeTool` append route and treated a descriptor-
minted resident tool-step bookkeeping record as domain-result authority. The
corrected ownership is exactly: `tool-gateway.ts`, `scheduler.ts`,
`resident-loop-scheduler-completion.ts`, `execution-loop.ts`, their six named
tests, this claim, and the transferred import-boundary test. The repair
transitions `blocked` to `implementing-repair`, preserves commits `57a1f863`,
`c119be76`, `80c20c81`, and the forward merge, and is exhausted after its one
causal RED and one minimal GREEN.

The required focused command is:

```bash
npm test -- packages/agent/test/tool-gateway.test.ts packages/agent/test/scheduler.test.ts packages/agent/test/resident-loop-scheduler-completion.test.ts packages/agent/test/execution-loop.test.ts packages/agent/test/domain-execution-dispatcher.test.ts packages/agent/test/resident-loop-scheduler-completion-imports.test.ts
```

The repair runs on `gpt-5.6-terra` with `xhigh` reasoning under the standing
authorization to implement only this bounded packet. It must reject direct
structural completion, self-minted bookkeeping, missing/pre-claim/duplicate/
swapped/cross-request/cross-run/stale/unreadable locators, result mismatches,
and concurrent terminalization. Only an independently appended causally bound
domain result may authorize completion. No later automatic G136-SC repair is
permitted.

## RV-1-E-801 released-domain-lineage recovery

Status advances from `candidate` to `implementing-repair` under the standing
contract-determined recovery authorization. The forward-merged record-21
authority identified that three released domain verticals retain their own
append-only domain causation chains after the exact execution claim. This
recovery adds one causal RED and one minimal GREEN only within the existing
eleven-path V4 boundary. The adapter must bind every post-claim non-agent
result either directly to the exact claim or through durable ancestry to the
exact request's frozen source-event lineage; ordering alone is insufficient.
It retains exact request/run/tool/version/preview/claim and current-stream
checks, rejects unrelated, swapped, cross-request/run, self-minted gateway or
resident bookkeeping, pre-claim, duplicate, unreadable, stale, terminal, and
concurrent evidence, and never restores public `completeTool` compatibility.

GREEN rereads each result locator after the claim and accepts durable
non-agent ancestry only when it reaches one of the exact request's stored
source-event IDs before that request. Direct causal binding to the exact claim
remains valid. Read-model changes remain normalized, frozen, secret-safe, and
duplicate-free; their domain-specific related IDs remain owned by the domain
service rather than a generic scheduler schema.

## RV-1-E-805 independent-result binding recovery

Status transitions `reviewing -> implementing-repair` under the standing
contract-determined recovery. Exact immutable review evidence is RV-1-E-805
at program authority `bfcf096ccdec4dd69ddf0d9e93eb1eac97be5c4e`, forward-merged
from preserved combined candidate `ba48161e288e6569561477092ac948f2d0dac78b`.
The causal counterfactual is that a non-`agent.*` event is not independent
merely by type: it must not be authored by the resident identity or the exact
execution claimant. Separately, source ancestry alone cannot choose between
two active approved requests that share frozen sources; a result correlated to
another request/run, or occurring while an overlapping competing claim remains
unterminated, cannot terminalize this request.

This sole recovery packet is authorized to change only
`resident-loop-scheduler-completion.ts`, its completion test,
`tool-gateway.test.ts`, and this claim. RED converts gateway positive fixtures
to a distinct domain-service actor and proves resident/claimant self-minting,
both A/B claim orderings, and terminal competing-request correlation reject
without completion. GREEN preserves direct exact-claim completion only for
independently authored result evidence and preserves released domain actors and
native correlations. It must retain opaque WeakSet evidence, durable reread,
exact request/run/tool/version/preview/claim/currentness binding, append-only
rebuildability, no public `completeTool`, no generic result/attestation,
fallback, actor/event-family allowlist, structural DTO authority, or Task9
fixture change. Stop for the stated factory safety, ownership, dependency, or
repeated-verifier conditions.

RV-1-E-806 narrows this packet's GREEN counterfactual without changing the
preserved RED: actor-ID equality alone is not proof of a self-minted result
because a separately invoked system domain service can share a scheduler actor
identity. The durable independence predicate therefore rejects only result
events whose canonical `context.actor.kind` is `agent`, while retaining the
existing `agent.*` event-family rejection. Human, extractor, and system domain
results remain admissible only after every exact causal, request/run,
currentness, reread, cross-request-correlation, and overlapping-claim check.
