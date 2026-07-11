# Task 7 Claim: Production Specialist Nous Acceptance

- Plan: `docs/superpowers/plans/2026-07-10-production-specialist-prompt-template-registry-implementation.md`
- Task: Task 7: Gated Live Nous Acceptance With Payload Sentinel
- Worker: Codex Task 7 implementer
- Branch: `codex/production-specialist-prompt-template-registry-spec`
- Worktree: `/home/drake/.codex/worktrees/cde7/Cestus`
- Claimed at: `2026-07-11T12:48:53Z`
- Status: ready-for-review

## Owned Files

- `packages/agent/src/production-specialist-prompts.ts` (coordinator-approved narrow renderer-instruction support)
- `packages/agent/test/production-specialist-prompts.test.ts` (coordinator-approved renderer instruction/validator parity tests)
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

## Evidence

- Claim commit: `f8f46e08 chore: claim production specialist nous acceptance`.
- Deterministic compile/skip path passed: 2 test files and 2 tests skipped with
  `CESTUS_AGENT_LIVE_NOUS` unset.
- The shared live-provider environment was loaded from
  `/home/drake/Projects/Cestus/.env` by path only; no environment values were
  recorded.
- Live authentication and provider invocation proceeded, but both workflows
  returned failed handoffs because their provider responses did not validate the
  required production structured-output contracts. No response text was logged
  or serialized.
- Completing this acceptance requires a production renderer or provider-output
  contract change outside Task 7. No fake provider was substituted, no live
  acceptance pass was recorded, and `npm run verify` was not run after this
  scoped stop.
- Coordinator unblock: approved a narrow Task 7 renderer-instruction expansion
  in `packages/agent/src/production-specialist-prompts.ts` and deterministic
  tests in `packages/agent/test/production-specialist-prompts.test.ts`.
  Validators must not be relaxed; prompt artifacts, approvals, provider calls,
  and live output secrecy remain unchanged. The shared live-provider environment
  may be loaded from `/home/drake/Projects/Cestus/.env` by path only; values
  must not be copied, printed, or recorded.
- Resumed at: `2026-07-11T13:02:00Z`.
- RED evidence: `npm test -- packages/agent/test/production-specialist-prompts.test.ts`
  failed with 3 expected renderer-instruction contract failures before the
  canonical output-only skeleton material was added.
- Deterministic renderer suite passed after the renderer-instruction support:
  `npm test -- packages/agent/test/production-specialist-prompts.test.ts`
  reported 1 test file and 63 tests passed.
- Deterministic live-suite compile path passed after the live-test wiring fix:
  `npm test -- packages/agent/test/evidence-triage-nous-live.test.ts packages/agent/test/prr-negotiation-nous-live.test.ts`
  reported 2 test files and 2 tests skipped with `CESTUS_AGENT_LIVE_NOUS`
  unset.
- The required gated live Nous command was run with the shared environment
  loaded from `/home/drake/Projects/Cestus/.env` by path only. It reported 2
  test files and 2 tests passed. The live assertions exercised the production
  renderer, non-PRR imported-evidence omission, resolved-payload-only sentinel
  check, structured safe output reflection, and secret-safe ledger/handoff
  serialization without logging provider output text or prompt text.
- Full verification passed: `npm run verify` reported `typecheck passed`, 178
  test files passed with 3 skipped, 2041 tests passed with 3 skipped, `tests
  passed`, Vite build succeeded, and `factory-readiness passed`.
- `git diff --check` passed.
