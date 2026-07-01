# Task 4 Claim: PRR Jurisdiction Packs

- Plan path: `docs/superpowers/plans/2026-07-01-public-records-request-workflow-implementation.md`
- Task heading: `Task 4: Add Jurisdiction Packs And Deadline Calculators`
- Worker identity: Codex worker agent
- Branch: `codex/prr-workflow-design`
- Worktree path: `/home/drake/.codex/worktrees/836b/Cestus`
- Claimed-at UTC: `2026-07-01T16:12:54Z`
- Status: `ready-for-review`

## Owned Files

- `packages/prr/src/jurisdiction-packs.ts`
- `packages/prr/src/deadlines.ts`
- `packages/prr/test/jurisdiction-packs.test.ts`
- `packages/prr/test/deadlines.test.ts`
- `packages/prr/src/index.ts`
- `docs/agentic/claims/task-4-prr-jurisdiction-packs.md`

## Handoff / Verification

- Claim commit: `b3fba46`
- Implementation commit: `9743eab`
- Targeted red command: `npm test -- packages/prr/test/jurisdiction-packs.test.ts packages/prr/test/deadlines.test.ts`
- Targeted red result: failed as expected with missing module imports for `../src/deadlines.js` and `../src/jurisdiction-packs.js`; Vitest reported `Test Files 2 failed (2)`.
- Targeted green command: `npm test -- packages/prr/test/jurisdiction-packs.test.ts packages/prr/test/deadlines.test.ts`
- Targeted green result: `Test Files 2 passed (2)`, `Tests 10 passed (10)`.
- Full verification command: `npm run verify`
- Full verification result: `typecheck passed`; `Test Files 15 passed (15)`; `Tests 98 passed (98)`; `tests passed`; `factory-readiness passed`.
- Concerns: none. The implementation uses only the approved Task 4 citations and deadline language from the PRR plan, including the specified federal 20-working-day estimate and Florida workflow-estimate warning.
