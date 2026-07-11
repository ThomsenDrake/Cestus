# Task 6: Workflow Output Validation Integration

- Plan: `.superpowers/sdd/task-6-brief.md`
- Task heading: `Task 6: Workflow Output Validation Integration`
- Worker: Codex (GPT-5)
- Branch: `codex/production-specialist-prompt-template-registry-spec`
- Worktree: `/home/drake/.codex/worktrees/cde7/Cestus`
- Claimed at (UTC): `2026-07-11T12:19:01Z`
- Status: `ready-for-review`

## Owned Files

- `packages/agent/src/prr-negotiation-workflow.ts`
- `packages/agent/src/evidence-triage-workflow.ts`
- `packages/agent/src/investigation-planner-workflow.ts`
- `packages/agent/src/production-specialist-output-contracts.ts` (coordinator-approved narrow shared validator support)
- `packages/agent/test/prr-negotiation-workflow.test.ts`
- `packages/agent/test/evidence-triage-workflow.test.ts`
- `packages/agent/test/investigation-planner-workflow.test.ts`
- `packages/agent/test/production-specialist-prompts.test.ts`
- `docs/agentic/claims/task-6-production-output-validation.md`

## Evidence

- Claim created before Task 6 test or production edits.
- RED: `npm test -- packages/agent/test/prr-negotiation-workflow.test.ts packages/agent/test/evidence-triage-workflow.test.ts packages/agent/test/investigation-planner-workflow.test.ts packages/agent/test/production-specialist-prompts.test.ts` failed as expected with exactly three workflow regressions. Existing workflow-local parsers accepted completed-effect or ontology-authority claims and produced non-failed handoffs.
- Blocked at (UTC): `2026-07-11T12:23:35Z`.
- Coordinator unblock at `2026-07-11T12:31:56Z`: approved a narrow shared output-contract expansion in `packages/agent/src/production-specialist-output-contracts.ts`; the shared validator remains the owner and workflow-local post-validators remain forbidden.
- Shared-validator RED: `npm test -- packages/agent/test/production-specialist-prompts.test.ts` failed with one expected regression because the shared authority matcher accepted the newly covered completed-effect families.
- Shared-validator GREEN: `npm test -- packages/agent/test/production-specialist-prompts.test.ts` passed with 1 file and 60 tests after the clause-aware shared matcher covered completed task creation/launch, portal/site crawl or scrape, and plural provider-byte transfer claims while allowing bounded proposal, instruction, and policy language.
- GREEN: `npm test -- packages/agent/test/prr-negotiation-workflow.test.ts packages/agent/test/evidence-triage-workflow.test.ts packages/agent/test/investigation-planner-workflow.test.ts packages/agent/test/production-specialist-prompts.test.ts` passed with 4 files and 89 tests. Each workflow validates immediately after JSON parse and before its first local derivative, review/approval request, or handoff construction.
- Verify: `npm run verify` passed: typecheck, full tests, Vite build, and factory readiness. Node emitted only the existing experimental SQLite warning.
- Diff check: `git diff --check` passed.
- Review: inline Task 6 spec review confirmed validation remains advisory-only, shared across output fields, secret-safe, and cannot grant ontology truth or external effects.
- Completed at (UTC): `2026-07-11T12:39:28Z`.
- Critical review-fix RED: `npm test -- packages/agent/test/production-specialist-prompts.test.ts` failed with the new plural passive and quantified first-person completed-effect regressions accepted by the shared matcher.
- Critical review-fix GREEN: the same focused command passed with 1 file and 60 tests after the shared grammar covered quantified first-person task creation/launch, plural portal/site crawl or scrape, and plural provider-byte transfer completion variants without changing modal, instruction, proposal, or policy handling.
- Critical review-fix verification: the Task 6 focused suite passed with 4 files and 89 tests; `npm run verify` and `git diff --check` passed. Node emitted only the existing experimental SQLite warning.
- Review-fix completed at (UTC): `2026-07-11T12:45:44Z`.
