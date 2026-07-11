# Task 7 Claim: Production Specialist Nous Acceptance

- Plan: `docs/superpowers/plans/2026-07-10-production-specialist-prompt-template-registry-implementation.md`
- Task: Task 7: Gated Live Nous Acceptance With Payload Sentinel
- Worker: Codex Task 7 implementer
- Branch: `codex/production-specialist-prompt-template-registry-spec`
- Worktree: `/home/drake/.codex/worktrees/cde7/Cestus`
- Claimed at: `2026-07-11T12:48:53Z`
- Status: claimed

## Owned Files

- `packages/agent/test/evidence-triage-nous-live.test.ts`
- `packages/agent/test/prr-negotiation-nous-live.test.ts`
- `docs/agentic/claims/task-7-production-specialist-nous-acceptance.md`

## Scope

Add gated live Nous acceptance coverage proving production specialist renderers
use bounded, hash-verified context payloads, including non-PRR imported evidence
triage. Keep all visible and serialized evidence secret-safe.

## Required Commands

- `npm test -- packages/agent/test/evidence-triage-nous-live.test.ts packages/agent/test/prr-negotiation-nous-live.test.ts`
- `CESTUS_AGENT_LIVE_NOUS=1 npm test -- packages/agent/test/prr-negotiation-nous-live.test.ts packages/agent/test/evidence-triage-nous-live.test.ts`
- `npm run verify`

## Stop Conditions

Stop and escalate on missing Nous credentials, provider unavailability, or any
live-provider setup failure. Do not replace the live run with deterministic fakes
or record a live acceptance pass without the gated provider result.
