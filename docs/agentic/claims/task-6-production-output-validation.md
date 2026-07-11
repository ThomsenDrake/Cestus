# Task 6: Workflow Output Validation Integration

- Plan: `.superpowers/sdd/task-6-brief.md`
- Task heading: `Task 6: Workflow Output Validation Integration`
- Worker: Codex (GPT-5)
- Branch: `codex/production-specialist-prompt-template-registry-spec`
- Worktree: `/home/drake/.codex/worktrees/cde7/Cestus`
- Claimed at (UTC): `2026-07-11T12:19:01Z`
- Status: `blocked`

## Owned Files

- `packages/agent/src/prr-negotiation-workflow.ts`
- `packages/agent/src/evidence-triage-workflow.ts`
- `packages/agent/src/investigation-planner-workflow.ts`
- `packages/agent/test/prr-negotiation-workflow.test.ts`
- `packages/agent/test/evidence-triage-workflow.test.ts`
- `packages/agent/test/investigation-planner-workflow.test.ts`
- `packages/agent/test/production-specialist-prompts.test.ts`
- `docs/agentic/claims/task-6-production-output-validation.md`

## Evidence

- Claim created before Task 6 test or production edits.
- RED: `npm test -- packages/agent/test/prr-negotiation-workflow.test.ts packages/agent/test/evidence-triage-workflow.test.ts packages/agent/test/investigation-planner-workflow.test.ts packages/agent/test/production-specialist-prompts.test.ts` failed as expected with exactly three workflow regressions. Existing workflow-local parsers accepted completed-effect or ontology-authority claims and produced non-failed handoffs.
- GREEN: blocked. After integration switched the workflows to `validateProductionSpecialistProviderOutput()`, the strict contract rejected the PRR and evidence-triage authority regressions, but it accepted the investigation-planner completed-effect family required by Task 6. The shared contract needs an owner-approved authority-schema extension; Task 6 must not create a parallel validator.
- Verify: not run because the output-schema ambiguity is an explicit stop condition.
- Blocked at (UTC): `2026-07-11T12:23:35Z`.
