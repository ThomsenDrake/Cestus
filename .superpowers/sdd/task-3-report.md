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
