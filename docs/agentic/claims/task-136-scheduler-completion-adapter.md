# G136-SC Scheduler Completion Adapter Claim

Status: implementing

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
