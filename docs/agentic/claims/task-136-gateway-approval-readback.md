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
