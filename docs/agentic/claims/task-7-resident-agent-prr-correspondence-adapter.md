# Task Claim: Resident Agent PRR Correspondence Adapter

- Plan: `docs/superpowers/plans/2026-07-09-resident-agent-domain-execution-adapters-implementation.md`
- Task: Task 7, PRR Send And Follow-Up Adapter Family
- Branch: `codex/resident-agent-domain-adapters-plan`
- Worktree: `/home/drake/.codex/worktrees/7018/Cestus`
- Worker: Codex with bounded Superpowers subagents
- Claimed at: 2026-07-09T22:00:00Z
- Base commit: `8572f4f feat: add provider byte transfer execution adapters`
- Status: completed

## Scope

Add descriptor-backed `prr.initial-send.execute` and `prr.follow-up.execute` adapters that rebuild approved correspondence state and route execution only through `PrrCorrespondenceService`.

`PrrCorrespondenceService` currently owns initial sends but has no follow-up method. Add the smallest PRR-owned `sendFollowUp()` path and lifecycle append needed to produce the existing `prr.followup.sent` event through deterministic correspondence adapters. Do not add live provider sends.

## Files

- Create: `packages/agent/src/adapters/prr-correspondence.ts`
- Create: `packages/agent/test/prr-correspondence-adapter.test.ts`
- Modify: `packages/agent/src/index.ts`
- Modify only if follow-up remains absent: `packages/prr/src/correspondence-service.ts`
- Modify only for the existing follow-up event append path: `packages/prr/src/lifecycle.ts`
- Modify: `packages/prr/test/correspondence-service.test.ts`

## Invariants

- PRR correspondence and lifecycle services remain authoritative; the adapter never appends send events directly.
- Consume-time state must exactly bind recipients, provider, subject/body/rendered-body hashes, attachment evidence/hash refs, lifecycle/deadline/legal posture, jurisdiction context, idempotency metadata, human approval, and resident-agent locks.
- Legal-pressure or escalation language remains locked unless the existing PRR projection contains the exact human-confirmed legal escalation event and evidence/citation basis. The adapter never creates or confirms that event.
- Agent lifecycle evidence contains only hashes, safe recipient DTOs, event IDs, and safe provider refs. It never contains message bodies, unsafe recipient data, provider errors, credentials, or raw provider metadata.
- Follow-up execution must use a deterministic provider double in tests and the existing `prr.followup.sent` event contract. Stop on any need to invent a live sender or bypass the established event schema.

## Verification

- Service RED/GREEN: `npm test -- packages/prr/test/correspondence-service.test.ts`
- Adapter RED/GREEN: `npm test -- packages/agent/test/prr-correspondence-adapter.test.ts`
- Domain target: `npm test -- packages/agent/test/prr-correspondence-adapter.test.ts packages/prr/test/correspondence-service.test.ts packages/prr/test/lifecycle.test.ts packages/prr/test/escalation-gate.test.ts packages/prr/test/provider-adapters.test.ts`
- Available gates: `npm run typecheck`, `npm run ui:build`, `npm run factory:check`, `npm run verify`, and `git diff --check`.

## Stop Conditions

- Stop before Task 8 or any destructive-repair change.
- Stop before a real external correspondence send.
- Stop before sending legal-pressure language without exact human-confirmed legal escalation state.
- Stop on missing, stale, swapped, or forged message hashes, recipient/provider metadata, attachments, jurisdiction refs, lifecycle/deadline/legal posture, approval, provenance, or locks.
- Stop if raw message text, private recipient details, provider failures, raw metadata, credentials, or secret-shaped fields could enter agent lifecycle events.
- Leave the complete Task 7 diff uncommitted for coordinator verification because Git metadata is read-only here.

## Red/Green Evidence

- PRR follow-up service RED: 10 expected missing-method failures; GREEN: 20/20.
- Service review repair RED: 10 provider-result validation failures; GREEN: 27/27.
- Secret-shaped provider reference RED/GREEN: final service suite 28/28.
- Adapter module RED: missing module, followed by descriptor GREEN 1/1.
- Preview contract RED/GREEN: 3/3.
- Execution integration RED: 5 missing rebuild/factory failures; GREEN: 8/8.
- Review repairs RED: 2 failures for unattestable follow-up attachments and inaccurate read-model mapping; GREEN: 9/9.
- Legal evidence binding RED: 3 preview/provenance failures; GREEN: 9/9.

## Verification Evidence

- Focused adapter: 1 file, 9/9 tests passed.
- Exact PRR domain set: 5 files, 76/76 tests passed.
- Typecheck passed.
- Vite build passed with the existing chunk-size warning.
- Tracked and untracked whitespace checks produced no errors.
- Full `npm run verify`: typecheck passed, then 149 passed / 3 failed / 1 skipped files and 1531 passed / 19 failed / 1 skipped tests. All 19 failures are sandbox-only `listen EPERM` failures for local-runtime sockets or `tsx` IPC pipes.
- Factory readiness is sandbox-blocked at `spawnSync git EPERM` after `git ls-files` produces output.
- Coordinator review RED/GREEN: a valid direct-service follow-up attachment proved that `sendFollowUp()` could transfer bytes the current `prr.followup.sent` event cannot attest. The service now rejects every follow-up attachment until that event contract supports evidence binding; focused PRR/adapter tests pass 38/38.
- Coordinator verification: unrestricted `npm run verify` passed with 152 passed / 1 skipped test files and 1551 passed / 1 skipped tests, followed by the Vite production build and factory readiness check.

## Review Verdict

- Service repair review: approved after shared provider result validation and secret-shaped reference rejection.
- Fresh adapter review: approved after follow-up attachments were blocked as unattestable and follow-up result mapping was narrowed to the existing PRR timeline projection.
- Narrow legal-evidence delta review: approved; ledger-rebuilt event IDs and hashes cannot become outbound follow-up attachments or bypass preview/source/artifact/provenance checks.
