# Task 3 Report: Browser Adapter For Approval Cockpit

Status: DONE_WITH_CONCERNS

Branch: `codex/resident-agent-approval-cockpit-plan`
Base commit before task: `58f3d4f`

## Commits created

- `f420b60 chore: claim agent approval adapter task`
- `7404f6f chore: start agent approval adapter task`

## Scope completed

- Updated `packages/ui/src/agent/agent-types.ts` so the UI can type against `AgentApprovalCockpitDto`, `AgentApprovalDecisionResultDto`, and `AgentApprovalQueueItemDto` from the public `packages/agent` index using type-only imports.
- Extended `packages/ui/src/agent/agent-adapter.ts` with:
  - `loadApprovalCockpit()`
  - `approveToolRequest(input)`
  - `denyToolRequest(input)`
  - `agentApprovalCockpitFromJson(value)`
  - `agentApprovalDecisionResultFromJson(value)`
- Kept the adapter browser-safe by:
  - using local Zod DTO schemas in the UI adapter instead of importing runtime builders or domain services,
  - reusing `safeAgentValue()` / `safeAgentText()` before parsing or surfacing failure text, and
  - calling only approval cockpit and decision routes:
    - `GET /api/agent/approvals`
    - `POST /api/agent/approvals/:toolRequestId/approve`
    - `POST /api/agent/approvals/:toolRequestId/deny`
- Added `createStaticAgentAdapter(status, approvalCockpit?)` support for frozen approval cockpit fixtures, with an empty frozen cockpit when none is supplied.
- Added `packages/ui/test/agent-approval-adapter.test.ts` covering cockpit loads, decision-route POSTs, DTO secret redaction, and static adapter support.
- Updated the claim to `ready-for-review` with red/green/verify evidence.

## TDD evidence

- Wrote the failing adapter test first in `packages/ui/test/agent-approval-adapter.test.ts`.
- Verified RED with:
  - `npm test -- packages/ui/test/agent-approval-adapter.test.ts`
  - Observed expected failure shape: `loadApprovalCockpit`, `approveToolRequest`, `denyToolRequest`, and `agentApprovalCockpitFromJson` were missing from the adapter module.
- Implemented the smallest scoped production change in:
  - `packages/ui/src/agent/agent-types.ts`
  - `packages/ui/src/agent/agent-adapter.ts`
- Verified targeted GREEN with:
  - `npm test -- packages/ui/test/agent-approval-adapter.test.ts packages/ui/test/agent-adapter.test.ts`

## Verification

- `npm test -- packages/ui/test/agent-approval-adapter.test.ts packages/ui/test/agent-adapter.test.ts`
  - Passed: `Test Files  2 passed (2)`, `Tests  10 passed (10)`
- `npm run verify`
  - Passed: `typecheck passed`
  - Passed: `Test Files  133 passed (133)`, `Tests  1280 passed (1280)`
  - Passed: `tests passed`
  - Passed: Vite production build completed
  - Passed: `factory-readiness passed`

## Concerns

- The task brief's route-safety assertion was internally contradictory: it required exact expected URLs containing `toolreq_provider_transfer` while also asserting that the joined URL strings must not match `/transfer/`. I preserved the intended safety check by normalizing the dynamic tool-request ID before applying the forbidden-route regex, and left the exact route expectations intact.

## Follow-up fixes

- Repointed `packages/ui/src/agent/agent-types.ts` away from `packages/agent/src/index.js` so the UI now sources approval cockpit DTO types from `packages/agent/src/approval-cockpit.js` and runtime status types from `packages/agent/src/runtime-types.js`, avoiding the broad runtime barrel.
- Tightened approval adapter tests to assert the exact approve POST body includes `approvedPreviewHash` plus rationale, while the deny POST body remains decision-only with rationale only.
- Broadened `safeAgentText()` path scrubbing so non-URL absolute paths like `/workspace/case-7/report.pdf`, `/repo/foo`, and `/data/export` are redacted during approval cockpit DTO parsing and route-error diagnostics while safe explanatory text and `https://` URLs remain visible.
- Verified the follow-up targeted suite with `npm test -- packages/ui/test/agent-approval-adapter.test.ts packages/ui/test/agent-adapter.test.ts`.
- Fixed the remaining approval-cockpit extensibility issue by changing the browser parser to treat approval-class and forbidden-direct-effect identifiers as nonempty strings at extension points instead of a closed local enum.
- Added a regression that feeds `agentApprovalCockpitFromJson()` a well-formed future class string across approval metadata, queue items, approval-contract class, risk class, lock class filters, and forbidden direct-effect lists, proving the cockpit still parses without adding any new execution behavior.
- Re-verified the targeted suite after the extensibility fix with `npm test -- packages/ui/test/agent-approval-adapter.test.ts packages/ui/test/agent-adapter.test.ts`.
- Fixed the remaining Task 3 / Task 1 contract drift in the canonical agent package by making approval-class identifiers extensible secret-safe strings in `packages/agent/src/approval-queue.ts` and `packages/agent/src/approval-cockpit.ts`, while preserving current default metadata, legacy alias normalization (`external-message-send`, `export-or-publication`, `destructive-or-repair`), strict DTO shapes, and decision-only approval semantics.
- Added queue and cockpit regressions proving a future class like `evidence-retention-review` survives canonical DTO boundaries on request approval classes, risk approval classes, approval and denial records, approval-contract class fields, lock approval-class filters, and forbidden direct-effect arrays without reopening unsupported low-safety cockpit projection values such as `none` or `human-review`.
- Verified the cross-package targeted suite for the drift fix with `npm test -- packages/agent/test/approval-cockpit.test.ts packages/agent/test/approval-queue.test.ts packages/ui/test/agent-approval-adapter.test.ts packages/ui/test/agent-adapter.test.ts`.
- Tightened the canonical queue boundary so `buildAgentApprovalQueue()` now rejects sentinel/no-approval values `none` and `human-review` on request classes, approval records, denial records, and lock approval-class filters while still accepting future secret-safe identifiers such as `evidence-retention-review`.
- Tightened `agentApprovalCockpitDtoSchema` to reject those same sentinel values wherever canonical approval/direct-effect identifiers appear, including approval-class metadata, queue item `approvalClass` and `requiredApprovalClass`, risk approval class, approval-contract class, lock `appliesToApprovalClasses`, and both decision-contract and top-level `forbiddenDirectEffects`.
- Verified RED/GREEN for the sentinel fix with:
  - RED: `npm test -- packages/agent/test/approval-cockpit.test.ts packages/agent/test/approval-queue.test.ts`
  - GREEN: `npm test -- packages/agent/test/approval-cockpit.test.ts packages/agent/test/approval-queue.test.ts`

## UI sentinel parser fix

- Root cause: `packages/ui/src/agent/agent-adapter.ts` still used `extensibleApprovalClassSchema = z.string().min(1)`, so the browser DTO parser accepted canonical sentinel placeholders `none` and `human-review` even after the agent package rejected them.
- Added a failing UI sentinel regression in `packages/ui/test/agent-approval-adapter.test.ts` that drives each sentinel value through all required extensible approval/direct-effect positions:
  - `approvalClasses[].approvalClass`
  - queue item `approvalClass`
  - queue item `requiredApprovalClass`
  - `approvalContract.requiredApprovalClass`
  - `risk.approvalClass`
  - `activeLocks[].appliesToApprovalClasses`
  - `decisionContract.forbiddenDirectEffects`
  - top-level `forbiddenDirectEffects`
- Observed RED with `npm test -- packages/ui/test/agent-approval-adapter.test.ts`:
  - Failed as expected with two assertion failures:
    - `rejects sentinel approval identifiers at extensible DTO boundaries: none`
    - `rejects sentinel approval identifiers at extensible DTO boundaries: human-review`
  - Failure shape: `expected [Function] to throw an error`
- Implemented the smallest adapter fix by refining the shared UI extensible approval/direct-effect identifier schema to accept nonempty strings except `none` and `human-review`.
- Verified targeted GREEN with `npm test -- packages/ui/test/agent-approval-adapter.test.ts packages/ui/test/agent-adapter.test.ts`:
  - Passed: `Test Files  2 passed (2)`
  - Passed: `Tests  14 passed (14)`
- Verified full gate with `npm run verify`:
  - Passed: `typecheck passed`
  - Passed: `Test Files  133 passed (133)`
  - Passed: `Tests  1290 passed (1290)`
  - Passed: `tests passed`
  - Passed: Vite production build completed
  - Passed: `factory-readiness passed`

## Status parser alignment fix

- Root cause: `agentStatusFromJson()` still parsed status `toolRequests[].requiredApprovalClass` and optional `toolRequests[].approvalClass` through the old closed `agentToolApprovalClassSchema`, so it rejected future real identifiers like `evidence-retention-review` while still admitting sentinel placeholders `none` and `human-review` at the browser status boundary.
- Added failing regressions in `packages/ui/test/agent-adapter.test.ts` proving:
  - `agentStatusFromJson()` accepts `evidence-retention-review` on both `requiredApprovalClass` and optional `approvalClass`.
  - `agentStatusFromJson()` rejects sentinel values `none` and `human-review` in those same status tool-request fields.
  - malformed `failureCategory` values remain rejected.
- Observed RED with `npm test -- packages/ui/test/agent-adapter.test.ts`:
  - Failed: `accepts future approval identifiers in status tool requests`
  - Failed: `rejects sentinel approval identifiers in status tool requests: none`
  - Failed: `rejects sentinel approval identifiers in status tool requests: human-review`
  - Failure shape:
    - Zod rejected `evidence-retention-review` because the status parser still expected the old enum values on `toolRequests[0].requiredApprovalClass` and `toolRequests[0].approvalClass`.
    - Sentinel regressions failed with `expected [Function] to throw an error`, proving `none` and `human-review` were still accepted there.
- Implemented the smallest fix in `packages/ui/src/agent/agent-adapter.ts` by swapping the status tool-request approval-class fields to the existing extensible non-sentinel approval identifier schema already used by the cockpit parser.
- Verified targeted GREEN with `npm test -- packages/ui/test/agent-adapter.test.ts packages/ui/test/agent-approval-adapter.test.ts`:
  - Passed: `Test Files  2 passed (2)`
  - Passed: `Tests  17 passed (17)`
- Verified full gate with `npm run verify`:
  - Passed: `typecheck passed`
  - Passed: `Test Files  133 passed (133)`
  - Passed: `Tests  1293 passed (1293)`
  - Passed: `tests passed`
  - Passed: Vite production build completed
  - Passed: `factory-readiness passed`
