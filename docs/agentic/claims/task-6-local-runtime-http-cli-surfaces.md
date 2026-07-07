# Task 6 Claim: Local Runtime HTTP And CLI Surfaces

Plan: `docs/superpowers/plans/2026-07-07-cestus-resident-agent-implementation.md`
Task: Task 6: Local Runtime HTTP And CLI Surfaces
Worker: Codex GPT-5
Branch: `codex/cestus-resident-agent-foundation`
Worktree: `/home/drake/.codex/worktrees/6fc5/Cestus`
Claimed-at: 2026-07-07T20:00:00Z
Status: ready-for-review

Owned files:
- `packages/local-runtime/src/agent-runtime-factory.ts`
- `packages/local-runtime/src/agent-http-routes.ts`
- `packages/local-runtime/src/http-handler.ts`
- `packages/local-runtime/src/cli.ts`
- `packages/local-runtime/test/agent-http-routes.test.ts`
- `packages/local-runtime/test/cli.test.ts`
- `docs/agentic/claims/task-6-local-runtime-http-cli-surfaces.md`

Targeted commands:
- `npm test -- packages/local-runtime/test/agent-http-routes.test.ts packages/local-runtime/test/cli.test.ts`
- `npm test -- packages/local-runtime/test/agent-http-routes.test.ts packages/local-runtime/test/http-handler.test.ts packages/local-runtime/test/cli.test.ts`
- `npm run verify`

Invariant notes:
- Preserve append-only ledger semantics: HTTP and CLI task creation must use the resident-agent runtime and append agent task events only.
- Preserve projection rebuildability: status and tool-request views must come from runtime projections, not hidden local state.
- Preserve existing local-runtime auth: agent routes must pass through the shared HTTP auth boundary without route-local bypasses.
- Preserve provider and credential boundaries: the default local factory may use only the deterministic fake local provider and must not require live credentials or outbound services.
- Preserve human gates: routes and CLI commands must not approve provider byte transfer, PRR sends, legal escalation, export, destructive repair, or accepted graph truth.
- Preserve secret safety: task-body validation, route diagnostics, CLI JSON, provider descriptors, and dependency failures must not emit raw secrets, environment variable names, bearer material, or raw provider errors.

Command evidence:
- Red: `npm test -- packages/local-runtime/test/agent-http-routes.test.ts packages/local-runtime/test/cli.test.ts` failed with 2 failed test files and 8 failed tests. HTTP agent routes returned 404, and CLI `agent-status` / `agent-create-task` were unknown commands.
- Green: `npm test -- packages/local-runtime/test/agent-http-routes.test.ts packages/local-runtime/test/cli.test.ts` passed with 2 test files and 33 tests passing after adding the local agent runtime factory, HTTP routes, handler wiring, and CLI commands.
- Targeted: `npm test -- packages/local-runtime/test/agent-http-routes.test.ts packages/local-runtime/test/http-handler.test.ts packages/local-runtime/test/cli.test.ts` passed with 3 test files and 44 tests passing.
- Verify: `npm run verify` passed with typecheck passed, 110 test files and 1029 tests passing, UI build succeeded, and factory-readiness passed.
- Diff hygiene: `git diff --check` passed.

Self-review notes:
- `GET /api/agent/status`, `GET /api/agent/tool-requests`, and `POST /api/agent/tasks` are wired after the shared `/api/` auth check; no agent route performs route-local auth bypass.
- The default local agent runtime factory uses `createAgentRuntime` with `FakeModelProvider` only, configured as `provider_fake_local` / `fake-local`.
- HTTP task creation validates a strict JSON object shape before calling the runtime and returns generic HTTP 400 diagnostics without echoing unsafe task body values.
- CLI `agent-status` and `agent-create-task` use stable JSON output and the in-process local HTTP handler; configured auth tokens stay inside the process and are not printed.
- This slice adds no provider byte-transfer approval, PRR send, legal escalation, export, repair, accepted graph truth, or live credential path.

Review remediation evidence:
- Red: `npm test -- packages/local-runtime/test/agent-http-routes.test.ts packages/local-runtime/test/http-handler.test.ts packages/local-runtime/test/cli.test.ts` failed with 9 review-regression failures. The failures proved GET agent probes appended `agent.identity.initialized`, duplicate task IDs returned HTTP 500, injected agent CLI success output printed secret-shaped values, and unknown command/flag diagnostics echoed secret-shaped argv.
- Green: `npm test -- packages/local-runtime/test/agent-http-routes.test.ts packages/local-runtime/test/http-handler.test.ts packages/local-runtime/test/cli.test.ts` passed with 3 test files and 50 tests passing after the review fixes.
- Verify: `npm run verify` passed with typecheck passed, 110 test files and 1035 tests passing, UI build succeeded, and factory-readiness passed.
- Remediation notes: GET status and tool-request routes are read-only on empty ledgers, CLI `agent-status` is read-only through the same route, injected agent CLI success output is recursively sanitized before JSON serialization, secret-shaped unknown command and agent task flag diagnostics are generic, and duplicate task creation returns HTTP 409 with a stable diagnostic.

Concurrent duplicate remediation evidence:
- Red: `npm test -- packages/local-runtime/test/agent-http-routes.test.ts packages/local-runtime/test/http-handler.test.ts packages/local-runtime/test/cli.test.ts` failed with the concurrent duplicate task regression returning statuses `[200, 500]` instead of `[200, 409]`.
- Green: `npm test -- packages/local-runtime/test/agent-http-routes.test.ts packages/local-runtime/test/http-handler.test.ts packages/local-runtime/test/cli.test.ts` passed with 3 test files and 51 tests passing after mapping task-stream ledger concurrency conflicts to the existing HTTP 409 duplicate-task diagnostic.
