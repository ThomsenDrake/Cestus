# Task 9 Claim: Specialist Registry Guardrails

Plan: `docs/superpowers/plans/2026-07-07-cestus-resident-agent-implementation.md`
Task: Task 9: Specialist Registry Guardrails
Worker: Codex GPT-5
Branch: `codex/cestus-resident-agent-foundation`
Worktree: `/home/drake/.codex/worktrees/6fc5/Cestus`
Claimed-at: 2026-07-07T19:41:06Z
Status: in-progress

Owned files:
- `packages/agent/src/specialists.ts`
- `packages/agent/src/runtime.ts`
- `packages/agent/src/index.ts`
- `packages/agent/test/specialists.test.ts`
- `docs/agentic/claims/task-9-resident-agent-specialist-registry.md`

Targeted commands:
- `npm test -- packages/agent/test/specialists.test.ts`
- `npm test -- packages/agent/test/specialists.test.ts packages/agent/test/runtime.test.ts packages/agent/test/projection.test.ts`
- `npm run verify`
- `git diff --check`

Invariant notes:
- Preserve append-only ledger semantics: runtime start must append only valid `agent.specialist-run.started` and task status events for approved run types.
- Preserve projection rebuildability: approved run types are registry constants and runtime validation only; no hidden specialist state or workflow side effects belong in this slice.
- Preserve human gates: no specialist may send PRRs, approve provider byte transfer, clear legal locks, export, repair, or accept graph truth.
- Preserve secret safety: unsupported run types must fail closed with structured, secret-safe diagnostics and safe repair actions.
- Preserve foundation scope: do not implement legacy bootstrap, PRR negotiation, evidence triage, timeline, contradiction, investigation, or report workflow behavior.
