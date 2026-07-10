# Task 2 Claim: MVP Specialist Handoff DTO Schemas

Plan: `docs/superpowers/plans/2026-07-09-mvp-specialist-workflows-implementation.md`
Task: `Task 2: Specialist Handoff DTO Schemas`
Worker: Codex GPT-5
Branch: `codex/mvp-specialist-workflows-plan`
Worktree: `/home/drake/.codex/worktrees/d901/Cestus`
Claimed-at: `2026-07-09T23:46:52Z`
Status: `completed`

Owned files:
- `docs/agentic/claims/task-2-mvp-specialist-handoffs.md`
- `packages/agent/src/specialist-handoffs.ts`
- `packages/agent/test/specialist-handoffs.test.ts`
- `packages/agent/src/index.ts`
- `.superpowers/sdd/task-2-report.md`

Targeted commands:
- `npm test -- packages/agent/test/specialist-handoffs.test.ts`
- `npm test -- packages/agent/test/specialist-handoffs.test.ts packages/agent/test/context-packs.test.ts packages/agent/test/tool-gateway.test.ts`
- `npm run verify`

Invariant notes:
- Preserve one durable resident identity only: handoff DTOs stay under `agent_default` and specialist modes remain typed run modes, not personas.
- Keep DTOs browser-safe, strict, frozen, content-hashable, and secret-safe.
- Do not store raw provider output/error text, production prompt text, credentials, raw evidence, raw correspondence, raw reports, executable commands, or hidden storage paths.
- Reject authority or external-effect completion claims for accepted graph changes, PRR sends/follow-ups, legal escalation completion, export/publication completion, provider transfer completion, destructive repair, or approval consumption.
- Keep this slice inert: no scheduler wake, runner behavior, domain adapter execution, UI work, provider calls, or cockpit integration.

Command evidence:
- Red: `npm test -- packages/agent/test/specialist-handoffs.test.ts` failed before implementation with `Cannot find module '../src/specialist-handoffs.js'`.
- Green targeted: `npm test -- packages/agent/test/specialist-handoffs.test.ts packages/agent/test/context-packs.test.ts packages/agent/test/tool-gateway.test.ts` passed with 3 test files and 68 tests passing.
- Review repair: updated the publication-completion negative case to use valid `kind: "review"` and `effect: "none"` while keeping forbidden completion text in `label: "Publication completed"`, then reran:
  - `npm test -- packages/agent/test/specialist-handoffs.test.ts` -> passed with 1 test file and 3 tests passing.
  - `npm test -- packages/agent/test/specialist-handoffs.test.ts packages/agent/test/context-packs.test.ts packages/agent/test/tool-gateway.test.ts` -> passed with 3 test files and 68 tests passing.
- Full verify: `npm run verify` reached `typecheck passed` and then failed outside this slice in sandbox-blocked suites:
  - `packages/local-runtime/test/server.test.ts` failed with `listen EPERM: operation not permitted` on `127.0.0.1` and `0.0.0.0`.
  - `packages/workspace-ops/test/cli.test.ts` failed with `listen EPERM: operation not permitted /tmp/tsx-1000/*.pipe`, which also caused downstream JSON/exit-code expectation failures.
  - `packages/local-runtime/test/workspace-readiness-smoke.test.ts` failed `keeps the npm operator command stdout parseable as JSON` with `Unexpected end of JSON input` after the upstream runtime/listen failures.
- Coordinator verification: unrestricted `npm run verify` passed with 160 passed / 1 skipped test files and 1605 passed / 1 skipped tests, followed by the Vite production build and factory readiness check.

Self-review notes:
- The DTO parser is strict and rejects unknown keys such as `rawProviderError`.
- Returned handoff DTOs, nested arrays, and nested objects are frozen, and handoff hashes are stable `sha256:` content hashes.
- The module keeps the resident identity fixed to `agent_default`, validates run types against the approved registry, reuses `contextPackRefSchema`, and rejects secret-shaped text plus accepted-authority/external-effect completion claims.
- The publication/external-effect negative test now proves rejection via forbidden completion-language validation rather than enum validation.
- No scheduler behavior, runner execution, provider calls, UI, domain adapters, or cockpit integration was added.
