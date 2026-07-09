# Task 3 Claim: Safe Local Runtime Memory Routes

Plan: `docs/superpowers/plans/2026-07-09-resident-agent-memory-context-surface-implementation.md`

Task heading: `Task 3: Safe Local Runtime Memory Routes`

Worker identity: Codex subagent-driven worker

Branch: `codex/resident-agent-memory-context-plan`

Worktree: `/home/drake/.codex/worktrees/5ced/Cestus`

Claimed at: `2026-07-09T02:12:20Z`

Status: `ready-for-review`

Owned files:

- `packages/local-runtime/src/agent-http-routes.ts`
- `packages/local-runtime/test/agent-memory-routes.test.ts`
- `packages/local-runtime/test/agent-http-routes.test.ts`
- `docs/agentic/claims/task-3-agent-memory-routes.md`

Targeted commands:

- `npm test -- packages/local-runtime/test/agent-memory-routes.test.ts packages/local-runtime/test/agent-http-routes.test.ts`
- `npm run verify`

Stop conditions:

- Route support would bypass existing local-runtime auth.
- Memory correction routes would allow a non-human actor.
- Route support would append accepted graph, entity resolution, relationship acceptance, PRR send, export, lock-clearing, repair, provider byte transfer, or legacy-source mutation events.
- Invalid or unsafe request bodies would echo source text or secret-shaped values.
- Scheduler-specific route contracts are required to compile.

Command evidence:

- RED `2026-07-09`: `npm test -- packages/local-runtime/test/agent-memory-routes.test.ts packages/local-runtime/test/agent-http-routes.test.ts`
  - Failed as expected before implementation with `expected 200 to be 404` for authenticated `GET /api/agent/memory` and `POST /api/agent/memory`, plus `expected 400 to be 404` and `expected 403 to be 404` for invalid-body and non-human correction cases.
- GREEN `2026-07-09`: `npm test -- packages/local-runtime/test/agent-memory-routes.test.ts packages/local-runtime/test/agent-http-routes.test.ts`
  - Passed: `Test Files  2 passed (2)`, `Tests  14 passed (14)`.
- VERIFY `2026-07-09`: `npm run verify`
  - Passed: `typecheck passed`, `Test Files  146 passed | 1 skipped (147)`, `Tests  1395 passed | 1 skipped (1396)`, `tests passed`, `vite ... built`, `factory-readiness passed`.
- FIX RED `2026-07-09`: `npm test -- packages/local-runtime/test/agent-memory-routes.test.ts packages/local-runtime/test/agent-http-routes.test.ts`
  - Failed as expected before the fix with `agent.identity.initialized` appended after an invalid `POST /api/agent/memory`, and with safe `recordMemory(...)` diagnostics collapsed to `Agent memory body is invalid.`.
- FIX GREEN `2026-07-09`: `npm test -- packages/local-runtime/test/agent-memory-routes.test.ts packages/local-runtime/test/agent-http-routes.test.ts`
  - Passed: `Test Files  2 passed (2)`, `Tests  15 passed (15)`.
- FIX VERIFY `2026-07-09`: `npm run verify`
  - Partial pass then unrelated failure outside Task 3 scope: `typecheck passed`, then `packages/ui/test/agent-app-integration.test.tsx > agent app integration > denies provider byte-transfer previews through the Agent adapter only` failed because `denials` remained `[]` instead of receiving the expected provider-transfer denial callback payload.
- FIX REPRO `2026-07-09`: `npm test -- packages/ui/test/agent-app-integration.test.tsx`
  - Passed focused repro for the unrelated UI failure: `Test Files  1 passed (1)`, `Tests  6 passed (6)`.
- FINAL VERIFY `2026-07-09`: `npm run verify`
  - Passed: `typecheck passed`, `Test Files  146 passed | 1 skipped (147)`, `Tests  1396 passed | 1 skipped (1397)`, `tests passed`, production build succeeded, and `factory-readiness passed`.

Invariant notes:

- Memory routes expose resident-agent working memory only.
- List/detail are read-only.
- Record/supersede/retract append memory events through the runtime and preserve the same non-authoritative boundary.
- Route handling stays inside the existing local-runtime HTTP/auth boundary; the protected-route test now covers `/api/agent/memory`.
- Mutation bodies are parsed with allowlisted keys, provenance is required for record/supersede payloads, and invalid or unsafe requests return generic diagnostics without echoing request text.
- The route tests assert that memory mutations do not surface accepted graph, entity resolution, relationship acceptance, PRR send, or lock-clearing effects.
- Fix pass note: invalid record/supersede/retract bodies are now rejected before `ensureDefaultIdentity(...)`, keeping malformed requests side-effect free, and route-level HTTP 400 responses now preserve safe runtime-provided memory diagnostics instead of replacing them with the generic invalid-body message.
