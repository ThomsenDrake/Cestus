# Task 6: Workflow Output Validation Integration

- Plan: `.superpowers/sdd/task-6-brief.md`
- Task heading: `Task 6: Workflow Output Validation Integration`
- Worker: Codex (GPT-5)
- Branch: `codex/production-specialist-prompt-template-registry-spec`
- Worktree: `/home/drake/.codex/worktrees/cde7/Cestus`
- Claimed at (UTC): `2026-07-11T12:19:01Z`
- Status: `in-progress`

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
- GREEN: pending after shared validator extension and workflow integration.
- Verify: pending.
