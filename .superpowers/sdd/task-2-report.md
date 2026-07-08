# Task 2 Report: Local Runtime Approval Routes

Status: DONE_WITH_CONCERNS

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

## Concerns

- The existing `createAgentToolGateway()` approval independence guard compares the decision actor against the gateway constructor actor ID. To keep this task scoped to the approved files and still append only through the gateway, the route records decision events with a human actor ref derived from the authenticated local-runtime actor ID (`*_approval_route`) rather than reusing the exact authenticated actor ID. Route authorization still reuses the local runtime human actor boundary and rejects non-human actors, but exact human actor identity persistence at this boundary deserves follow-up in the shared gateway contract.
