# Task 8 Claim: Agent UI And Command Board Surface

Plan: `docs/superpowers/plans/2026-07-07-cestus-resident-agent-implementation.md`
Task: Task 8: Agent UI And Command Board Surface
Worker: Codex GPT-5
Branch: `codex/cestus-resident-agent-foundation`
Worktree: `/home/drake/.codex/worktrees/6fc5/Cestus`
Claimed-at: 2026-07-07T18:54:07Z
Status: ready-for-review

Owned files:
- `packages/ui/src/agent/agent-types.ts`
- `packages/ui/src/agent/agent-adapter.ts`
- `packages/ui/src/agent/AgentWorkspace.tsx`
- `packages/ui/src/App.tsx`
- `packages/ui/src/workspace/workspace-nav.ts`
- `packages/ui/src/workspace/command-types.ts`
- `packages/ui/src/workspace/command-model.ts`
- `packages/ui/test/command-model.test.ts`
- `packages/ui/test/agent-adapter.test.ts`
- `packages/ui/test/agent-workspace.test.tsx`
- `packages/ui/test/agent-app-integration.test.tsx`
- `packages/ui/test/app-smoke.test.tsx`
- `packages/ui/test/operator-app-integration.test.tsx`
- `docs/agentic/claims/task-8-agent-ui-command-board.md`

Verifier-required supporting files:
- `packages/ui/test/shell.test.tsx`
- `packages/ui/test/ui-picker.test.tsx`

Targeted commands:
- `npm test -- packages/ui/test/agent-adapter.test.ts packages/ui/test/agent-workspace.test.tsx packages/ui/test/agent-app-integration.test.tsx packages/ui/test/command-model.test.ts`
- `npm test -- packages/ui/test/agent-adapter.test.ts packages/ui/test/agent-workspace.test.tsx packages/ui/test/agent-app-integration.test.tsx packages/ui/test/command-model.test.ts packages/ui/test/app-smoke.test.tsx packages/ui/test/operator-app-integration.test.tsx`
- `npm run verify`
- `git diff --check`

Invariant notes:
- Preserve append-only ledger semantics and projection rebuildability: UI reads browser-safe DTOs only and must not write ledger state directly.
- Preserve human gates: no browser control may approve, deny, execute, send, export, repair, clear locks, invoke providers, or accept graph truth.
- Preserve provider and credential boundaries: browser DTOs may show safe provider metadata only and must not expose live credentials, raw provider errors, or secret-shaped strings.
- Preserve command-board compatibility: `AgentBrief` may use `AgentStatusDto` when supplied but must keep existing fixture behavior when absent.

Command evidence:
- Red: `npm test -- packages/ui/test/agent-adapter.test.ts packages/ui/test/agent-workspace.test.tsx packages/ui/test/agent-app-integration.test.tsx packages/ui/test/command-model.test.ts` failed with 4 failed test files. The new Agent UI imports were missing, and the new Command model assertion proved `AgentBrief` ignored supplied `agentStatus`.
- Green: `npm test -- packages/ui/test/agent-adapter.test.ts packages/ui/test/agent-workspace.test.tsx packages/ui/test/agent-app-integration.test.tsx packages/ui/test/command-model.test.ts` passed with 4 test files and 14 tests passing.
- Targeted: `npm test -- packages/ui/test/agent-adapter.test.ts packages/ui/test/agent-workspace.test.tsx packages/ui/test/agent-app-integration.test.tsx packages/ui/test/command-model.test.ts packages/ui/test/app-smoke.test.tsx packages/ui/test/operator-app-integration.test.tsx` passed with 6 test files and 32 tests passing.
- Support verifier: `npm test -- packages/ui/test/shell.test.tsx packages/ui/test/ui-picker.test.tsx` passed with 2 test files and 4 tests passing after updating stale Agent preview expectations.
- Verify: `npm run verify` passed with typecheck passed, 113 test files and 1057 tests passing, Vite build succeeded, and factory-readiness passed.
- Diff hygiene: `git diff --check` passed with no output.

Self-review notes:
- The Agent adapter parses `agent-status.v1` through a local Zod DTO mirror, redacts unsafe strings before parsing, and returns frozen DTOs for HTTP and static adapters.
- The Agent workspace renders status, providers, locks, tasks, run types, provenance refs, tool request preview hashes, memory counts, and diagnostics with refresh as the only browser control.
- The Agent module is first-class navigation under id `agents`; operator safe actions can navigate there but do not execute agent tools.
- Command `AgentBrief` uses resident-agent status when present and preserves the existing advisory fixture behavior when absent.
