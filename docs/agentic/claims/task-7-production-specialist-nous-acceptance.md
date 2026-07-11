# Task 7 Claim: Production Specialist Nous Acceptance

- Plan: `docs/superpowers/plans/2026-07-10-production-specialist-prompt-template-registry-implementation.md`
- Task: Task 7: Gated Live Nous Acceptance With Payload Sentinel
- Worker: Codex Task 7 implementer
- Branch: `codex/production-specialist-prompt-template-registry-spec`
- Worktree: `/home/drake/.codex/worktrees/cde7/Cestus`
- Claimed at: `2026-07-11T12:48:53Z`
- Status: in-progress

## Owned Files

- `packages/agent/src/production-specialist-prompts.ts` (coordinator-approved narrow renderer-instruction support)
- `packages/agent/src/openai-compatible-provider.ts` (coordinator-approved deterministic sampling support; structured output remains unsupported)
- `packages/agent/test/openai-compatible-provider.test.ts` (coordinator-approved request-body tests)
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
- Review fix required: the sentinel reflection assertion must not read the
  persisted `safe-evidence-summaries` derivative artifact, because that proves
  the sentinel-bearing provider output reached local derivative storage.
- Review-fix WIP changed the evidence-triage live test to observe sentinel
  reflection at the derivative-store `put(Buffer)` boundary, redact the sentinel
  before delegating to file-backed derivative storage, and assert every
  persisted derivative artifact referenced by the handoff lacks the sentinel.
- Review-fix deterministic compile/skip path passed:
  `npm test -- packages/agent/test/evidence-triage-nous-live.test.ts packages/agent/test/prr-negotiation-nous-live.test.ts`
  reported 2 test files and 2 tests skipped with `CESTUS_AGENT_LIVE_NOUS`
  unset.
- Review-fix live RED/GREEN is blocked: the required live Nous command was run
  three times with `/home/drake/Projects/Cestus/.env` loaded by path only, and
  each attempt returned failed handoffs for both live workflows before the new
  derivative-storage sentinel assertion could execute. No provider response
  text, prompt text, raw request bodies, credentials, or environment values were
  logged, scraped, or recorded. No fake provider was substituted.
- Next escalation: provider-native structured-output support or live-provider
  capability correction is needed before this review fix can record live GREEN.
  `npm run verify` and a final commit were not run after the blocked live gate.
- Coordinator unblock: approved provider-native correction by deterministic
  sampling, not fake structured-output support. `response_format` remains
  forbidden for this Nous model; live canaries showed `temperature: 0` with the
  exact-JSON prompt returned valid JSON in repeated attempts. The provider
  descriptor must continue to report structured output as unsupported.
- Coordinator clarified the sentinel derivative boundary: a validated local
  `safe-evidence-summaries` derivative artifact may contain the distinctive
  safe sentinel fact derived from verified payload content. The dirty
  derivative-store redaction WIP must be removed because it silently rewrites
  production output before persistence and does not prove a production redaction
  contract. The live test must read the persisted safe derivative, parse it,
  assert `safeSummaries` reflects the sentinel, and still prove serialized
  ledger events and handoff DTOs do not contain sentinel, prompt text,
  credentials, raw request bodies, or raw provider response as a whole.
- Resumed at: `2026-07-11T13:33:00Z`.
