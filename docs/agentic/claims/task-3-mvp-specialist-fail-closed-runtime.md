# Task 3 Claim: MVP Specialist Fail-Closed Runtime

Plan: `docs/superpowers/plans/2026-07-09-mvp-specialist-workflows-implementation.md`
Task: Task 3: Runtime Fail-Closed Wiring
Worker: Codex GPT-5
Branch: `codex/mvp-specialist-workflows-plan`
Worktree: `/home/drake/.codex/worktrees/d901/Cestus`
Claimed-at: 2026-07-10T00:03:55Z
Status: completed

Owned files:
- `docs/agentic/claims/task-3-mvp-specialist-fail-closed-runtime.md`
- `packages/agent/src/specialists.ts`
- `packages/agent/test/specialists.test.ts`
- `packages/agent/test/specialist-workflows.test.ts`
- `.superpowers/sdd/task-3-report.md`

Targeted commands:
- RED: `npm test -- packages/agent/test/specialists.test.ts packages/agent/test/specialist-workflows.test.ts`
- GREEN: `npm test -- packages/agent/test/specialists.test.ts packages/agent/test/specialist-workflows.test.ts packages/agent/test/runtime.test.ts`
- FULL: `npm run verify`

Invariant notes:
- Preserve one resident identity only: specialist modes stay run types under `agent_default`.
- Six MVP specialist modes may be descriptor-registered, but execution remains disabled and not ready in this slice.
- Do not imply providers, workflow runners, domain adapters, scheduler execution, model calls, or domain effects are available.
- Use descriptor metadata for prerequisite contract IDs and required context-pack IDs; keep prompt template identity distinct from context-pack identity.
- Keep `specialists.ts` pure metadata only: no runtime, ledger, provider, scheduler, execution loop, dispatcher, or domain service imports.

Command evidence:
- RED: `npm test -- packages/agent/test/specialists.test.ts packages/agent/test/specialist-workflows.test.ts` failed before implementation with 2 failed files and 4 failed tests because `specialistExecutionStatusFor` only returned the old fail-closed fields and lacked registered workflow metadata, resident identity, execution readiness, descriptor prerequisite IDs, context-pack IDs, and updated repair actions.
- GREEN targeted: `npm test -- packages/agent/test/specialists.test.ts packages/agent/test/specialist-workflows.test.ts packages/agent/test/runtime.test.ts` passed with 3 test files and 27 tests passing.
- Full verify: `npm run verify` reached `typecheck passed`, then failed in sandbox-sensitive suites outside this slice:
  - `packages/local-runtime/test/server.test.ts` failed with `listen EPERM: operation not permitted 127.0.0.1` and `listen EPERM: operation not permitted 0.0.0.0`.
  - `packages/workspace-ops/test/cli.test.ts` failed with `listen EPERM: operation not permitted /tmp/tsx-1000/*.pipe`, plus downstream expected JSON/exit-code assertions receiving process exit 1 and stderr from `tsx`.
  - `packages/local-runtime/test/workspace-readiness-smoke.test.ts` failed with `Unexpected end of JSON input` after the upstream operator command produced no parseable stdout.
- Factory check attempt: `npm run factory:check` failed in this sandbox because `scripts/check-agent-readiness.mjs` invokes `git ls-files` and Node reported `spawnSync git EPERM`.

Self-review notes:
- `specialistExecutionStatusFor` now distinguishes the six descriptor-registered MVP specialist modes from unregistered fail-closed modes while preserving `enabled: false` and `executionReady: false`.
- MVP status metadata is derived from `specialistWorkflowDescriptorFor`: prerequisite contract IDs and required context-pack IDs match the registry descriptors.
- Repair actions now describe wiring specialist workflow readiness and constructing required context packs; they do not say scheduler/domain-adapter contracts still need to land.
- Ontology bootstrap and unsupported run types remain fail-closed and do not report registered MVP workflow readiness.
- No provider calls, workflow runner, scheduler/resumer execution, ledger/runtime imports, domain adapter imports, personas, or domain effects were added.

Review evidence:
- Task reviewer found no Task 3 implementation defects in the scoped files.
- Spec compliance: approved.
- Code quality: pending unrestricted `npm run verify` / `npm run factory:check` because this sandbox blocks listen/IPC/git operations needed by unrelated suites and readiness checks.

Coordinator verification:
- `npm test -- packages/agent/test/specialists.test.ts packages/agent/test/specialist-workflows.test.ts packages/agent/test/runtime.test.ts` passed with 3 files and 27 tests.
- `npm run typecheck` passed.
- `npm run factory:check` failed in this sandbox with `spawnSync git EPERM`.
- `npm run verify` reached `typecheck passed`; the test phase reported 157 passed / 1 skipped files and 1587 passed / 1 skipped tests, with 3 files and 19 tests failing from sandbox `listen EPERM` / `tsx` IPC restrictions in `packages/local-runtime/test/server.test.ts`, `packages/local-runtime/test/workspace-readiness-smoke.test.ts`, and `packages/workspace-ops/test/cli.test.ts`.
- Unrestricted coordinator `npm run verify` passed with 160 passed / 1 skipped test files and 1606 passed / 1 skipped tests, followed by the Vite production build and factory readiness check.
