# Task 2 Report: Local Runtime Approval Routes

Status: DONE

Branch: `codex/resident-agent-approval-cockpit-plan`
Base commit before task: `94e376c`

## Commits created

- `5543282 chore: claim agent approval routes task`
- `5319286 chore: start agent approval routes task`

## Scope completed

- Added `packages/local-runtime/test/agent-approval-routes.test.ts` covering approval list/detail reads, human approval append, human denial append, stale-preview rejection, secret-safe body rejection, and non-human actor rejection.
- Updated `packages/local-runtime/src/agent-http-routes.ts` to expose:
  - `GET /api/agent/approvals`
  - `GET /api/agent/approvals/:toolRequestId`
  - `POST /api/agent/approvals/:toolRequestId/approve`
  - `POST /api/agent/approvals/:toolRequestId/deny`
- Reused `buildAgentApprovalCockpit()` and `agentApprovalDecisionResultDtoSchema` from `packages/agent`.
- Kept approval and denial routes append-only through `createAgentToolGateway()` and returned refreshed cockpit DTOs after decisions.
- Added safe 400/403/404/409 route diagnostics without echoing raw request bodies, tool request IDs in unsafe error paths, or secret-shaped strings.
- Updated the claim to `ready-for-review` with red/green/verify evidence.

## TDD evidence

- Wrote the failing route test first in `packages/local-runtime/test/agent-approval-routes.test.ts`.
- Verified red with:
  - `npm test -- packages/local-runtime/test/agent-approval-routes.test.ts`
  - Observed expected failure shape: all six route assertions returned `404` because the local runtime route was not found yet.
- Implemented the smallest scoped production change in `packages/local-runtime/src/agent-http-routes.ts`.
- Verified targeted green with:
  - `npm test -- packages/local-runtime/test/agent-approval-routes.test.ts packages/local-runtime/test/agent-http-routes.test.ts packages/agent/test/approval-cockpit.test.ts`

## Verification

- `npm test -- packages/local-runtime/test/agent-approval-routes.test.ts packages/local-runtime/test/agent-http-routes.test.ts packages/agent/test/approval-cockpit.test.ts`
  - Passed: `Test Files  3 passed (3)`, `Tests  22 passed (22)`
- `npm run verify`
  - Passed: `typecheck passed`
  - Passed: `Test Files  132 passed (132)`, `Tests  1269 passed (1269)`
  - Passed: `tests passed`
  - Passed: Vite production build completed
  - Passed: `factory-readiness passed`

## Concern fix: exact human approval provenance

- Added failing assertions in `packages/local-runtime/test/agent-approval-routes.test.ts` proving the appended approval event must persist `approvedBy: "actor_case_owner"` and `context.actor.id: "actor_case_owner"`, and denial must persist `deniedBy: "actor_case_owner"` and `context.actor.id: "actor_case_owner"`.
- Verified RED with:
  - `npm test -- packages/local-runtime/test/agent-approval-routes.test.ts`
  - Observed expected failure: the route appended `actor_case_owner_approval_route` instead of the authenticated human actor ID for both approval and denial events.
- Updated `packages/local-runtime/src/agent-http-routes.ts` to:
  - keep the existing route-level human actor check,
  - construct `createAgentToolGateway()` for approve/deny with a fixed local-runtime system actor (`actor_local_runtime_approval_gateway`), and
  - pass `actor: input.actor` unchanged to `approveTool()` and `denyTool()`.
- Removed the derived `routeDecisionActor()` behavior.
- Verified GREEN with:
  - `npm test -- packages/local-runtime/test/agent-approval-routes.test.ts packages/local-runtime/test/agent-http-routes.test.ts packages/agent/test/approval-cockpit.test.ts`
  - Passed: `Test Files  3 passed (3)`, `Tests  22 passed (22)`
- Re-ran full gate:
  - `npm run verify`
  - Passed: `typecheck passed`
  - Passed: `Test Files  132 passed (132)`, `Tests  1269 passed (1269)`
  - Passed: `tests passed`
  - Passed: Vite production build completed
  - Passed: `factory-readiness passed`
