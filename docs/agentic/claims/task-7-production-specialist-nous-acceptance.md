# Task 7 Claim: Production Specialist Nous Acceptance

- Plan: `docs/superpowers/plans/2026-07-10-production-specialist-prompt-template-registry-implementation.md`
- Task: Task 7: Gated Live Nous Acceptance With Payload Sentinel
- Worker: Codex Task 7 implementer
- Branch: `codex/production-specialist-prompt-template-registry-spec`
- Worktree: `/home/drake/.codex/worktrees/cde7/Cestus`
- Claimed at: `2026-07-11T12:48:53Z`
- Status: complete

## Owned Files

- `packages/agent/src/production-specialist-prompts.ts` (coordinator-approved narrow renderer-instruction and renderer-order support)
- `packages/agent/src/openai-compatible-provider.ts` (coordinator-approved deterministic sampling support; structured output remains unsupported)
- `packages/agent/test/openai-compatible-provider.test.ts` (coordinator-approved request-body tests)
- `packages/agent/test/production-specialist-prompts.test.ts` (coordinator-approved renderer instruction/validator parity and renderer-order tests)
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
- Provider sampling RED evidence: `npm test -- packages/agent/test/openai-compatible-provider.test.ts`
  failed with 2 expected request-body failures before provider source changes:
  Nous did not send `temperature: 0`, and invalid configured temperatures were
  accepted.
- Provider sampling GREEN evidence: `npm test -- packages/agent/test/openai-compatible-provider.test.ts`
  reported 1 test file and 9 tests passed. The deterministic tests prove Nous
  defaults to `temperature: 0`, does not send `response_format`, preserves
  unsupported structured-output descriptor posture, and rejects non-finite or
  out-of-range temperatures.
- Sentinel review correction: removed the dirty derivative-store redaction WIP
  and restored the accepted shape that reads the validated
  `safe-evidence-summaries` derivative artifact, parses it, and asserts its
  allowed `safeSummaries` field reflects the sentinel. The secrecy assertion
  remains on serialized ledger events and handoff DTOs; this is validated local
  derivative artifact content, not raw provider-response persistence.
- Deterministic Task 7 suite passed:
  `npm test -- packages/agent/test/openai-compatible-provider.test.ts packages/agent/test/production-specialist-prompts.test.ts packages/agent/test/evidence-triage-nous-live.test.ts packages/agent/test/prr-negotiation-nous-live.test.ts`
  reported 2 test files passed, 2 skipped, 72 tests passed, and 2 skipped with
  `CESTUS_AGENT_LIVE_NOUS` unset.
- Required live Nous gate was run three consecutive times with
  `/home/drake/Projects/Cestus/.env` loaded by path only. Attempt 1 failed
  because the PRR negotiation handoff status was `failed` while evidence triage
  passed. Attempt 2 failed the same PRR negotiation handoff status assertion
  while evidence triage passed. Attempt 3 failed both the PRR negotiation and
  evidence-triage handoff status assertions. No provider response text, prompt
  text, raw request bodies, credentials, or environment values were logged,
  scraped, printed, or recorded. No fake provider was substituted, no validator
  was weakened, and no `response_format` or structured-output claim was added.
- Stop condition reached: temperature-zero sampling did not produce three
  consecutive live GREEN runs. `npm run verify`, `git diff --check`, and a
  completion commit were not run after this blocked live gate.
- Coordinator unblock: approved a narrow Task 7 canonical renderer-order
  correction in `packages/agent/src/production-specialist-prompts.ts` and
  `packages/agent/test/production-specialist-prompts.test.ts`, retaining the
  existing temperature-zero provider WIP. Evidence-backed canaries showed the
  configured Nous model follows the exact PRR JSON schema when the strict
  skeleton is the final instruction. The renderer must add a canonical
  end-of-context marker, keep verified payloads between start/end context
  markers, and move authority, review, handoff, provider schema identity, and
  the full provider-output JSON skeleton after the context end marker, with the
  output instruction as the final prompt section. The change must remain inside
  canonical renderer material so renderer hashes and artifact verification bind
  the ordering.
- The coordinator explicitly forbids raising max tokens, adding response
  healing, relaxing validators, claiming structured-output support, duplicating
  or mutating payload text, adding a second noncanonical prompt, or placing
  instructions outside the prompt artifact. If live validation still fails,
  temporary diagnostics may report only HTTP status, finish reason, output
  character count, JSON-syntax-valid boolean, exact top-level-key boolean, and
  Zod issue paths/codes; no values, messages, prompt text, output text, request
  bodies, credentials, or payload text may be printed or persisted.
- Renderer-order RED evidence: `npm test --
  packages/agent/test/production-specialist-prompts.test.ts` reported 1 test
  file with 4 expected failures and 62 passing tests before the canonical
  renderer material changed. The failures covered the old section order, absent
  end marker, non-final output instruction, and unbound end-marker rendering.
- Renderer-order GREEN evidence: the focused renderer suite reported 1 test
  file and 66 passing tests. The canonical material now binds the verified
  context end marker and the final ordering through the renderer hash; each
  registered output instruction remains validator-valid and is the final
  provider-visible prompt section.
- Deterministic Task 7 suite after the renderer-order correction: `npm test --
  packages/agent/test/openai-compatible-provider.test.ts
  packages/agent/test/production-specialist-prompts.test.ts
  packages/agent/test/evidence-triage-nous-live.test.ts
  packages/agent/test/prr-negotiation-nous-live.test.ts` reported 2 test files
  passed, 2 skipped, 75 tests passed, and 2 skipped with the live gate unset.
- Live renderer-order gate attempt 1 loaded
  `/home/drake/Projects/Cestus/.env` by path only and reported PRR negotiation
  passed while evidence triage returned a failed handoff. No environment values,
  prompt text, provider output text, request bodies, credentials, or payload
  text were recorded.
- A temporary uncommitted test-only evidence-triage provider classifier was
  added after the failed handoff. Its safe result was HTTP status `200`, finish
  reason `stop`, output character count `1153`, JSON syntax valid `true`, exact
  top-level keys `true`, and Zod issue path/code pairs
  `dossierSummary/custom` and
  `assertionCandidates/[index]/[unknown-key]/custom`. It printed and persisted
  no values, messages, prompt text, provider output text, request bodies,
  credentials, or payload text.
- Stop condition: the output is syntactically exact at the top level but fails
  semantic production-output validation. The classifier does not identify a
  concrete renderer-order or schema-identity repair within Task 7, so the live
  acceptance cannot achieve three consecutive GREEN runs. `npm run verify` and
  the Task 7 completion commit were not run; the pre-report `git diff --check`
  passed.
- Controller-approved validator-parity repair: canonical final-output material
  now states that every narrative, identifier, and reference value must remain
  advisory and cannot claim completed external effects or accepted ontology
  truth. Evidence-triage guidance also constrains its narrative, rationale, and
  predicate fields to local review/candidate/proposal language and requires an
  empty assertion-candidate list unless verified context supports a
  validator-safe candidate.
- RED evidence for the parity repair: `npm test --
  packages/agent/test/production-specialist-prompts.test.ts` reported 1 test
  file with 2 expected failures and 64 passing tests. The new instruction
  assertions were absent and mutating the absent canonical sentence did not
  change the renderer hash or rendered bytes.
- GREEN evidence: the focused renderer suite reported 1 test file and 66
  passing tests. The deterministic Task 7 suite reported 2 test files passed,
  2 skipped, 75 tests passed, and 2 skipped with the live gate unset.
- The temporary test-only classifier-assisted live gate passed with 2 test
  files and 2 tests. The classifier was then removed before final acceptance.
- Three consecutive final live Nous gates, sourced from
  `/home/drake/Projects/Cestus/.env` by path only, each reported 2 test files
  and 2 tests passed. No classifier output, prompt text, provider output text,
  request bodies, credentials, environment values, or payload text were
  printed or persisted.
- Final verification: `npm run verify` reported `typecheck passed`, 178 test
  files passed with 3 skipped, 2046 tests passed with 3 skipped, `tests
  passed`, Vite build succeeded, and `factory-readiness passed`.
