# Task 3 Claim: Browser Adapter For Approval Cockpit

Plan: `docs/superpowers/plans/2026-07-08-resident-agent-approval-cockpit-routes-ui-implementation.md`

Task heading: `Task 3: Browser Adapter For Approval Cockpit`

Worker identity: Codex resident agent

Branch: `codex/resident-agent-approval-cockpit-plan`

Worktree: `/home/drake/.codex/worktrees/b782/Cestus`

Claimed at: `2026-07-08T16:04:57Z`

Status: `ready-for-review`

Owned files:

- `packages/ui/src/agent/agent-types.ts`
- `packages/ui/src/agent/agent-adapter.ts`
- `packages/ui/test/agent-approval-adapter.test.ts`
- `docs/agentic/claims/task-3-agent-approval-adapter.md`
- `.superpowers/sdd/task-3-report.md`

Verification:

- Targeted failing command: `npm test -- packages/ui/test/agent-approval-adapter.test.ts`
- Targeted passing command: `npm test -- packages/ui/test/agent-approval-adapter.test.ts packages/ui/test/agent-adapter.test.ts`
- Full gate: `npm run verify`

Stop conditions:

- UI parsing or adapter wiring would require importing Node runtime, SQLite, filesystem, blob store, workspace validation, provider adapter, or domain service modules into the browser bundle.
- Adapter methods would need to call execution, provider, PRR, export, repair, legal, acceptance, or scheduler-resume routes instead of approval cockpit and decision routes.
- Targeted verifier fails after two focused repair attempts.

Implementation recorded at: `2026-07-08T16:11:29Z`

Implementation evidence:

- Initial claim commit: `f420b60 chore: claim agent approval adapter task`
- In-progress commit: `7404f6f chore: start agent approval adapter task`
- Red test: `npm test -- packages/ui/test/agent-approval-adapter.test.ts`
- Observed red failure before implementation: `loadApprovalCockpit`, `approveToolRequest`, `denyToolRequest`, and `agentApprovalCockpitFromJson` did not exist on the UI adapter yet.
- Targeted pass: `npm test -- packages/ui/test/agent-approval-adapter.test.ts packages/ui/test/agent-adapter.test.ts`
- Full gate: `npm run verify`
- Full gate result: `typecheck passed`, `Test Files  133 passed (133)`, `Tests  1280 passed (1280)`, `tests passed`, Vite production build completed, and `factory-readiness passed`.
- Scope note: the brief's route-safety assertion was internally contradictory because it expected exact URLs containing `toolreq_provider_transfer` while also rejecting any string matching `transfer`; the test now normalizes the dynamic tool request ID before applying the forbidden-route regex so the assertion still checks route families instead of request IDs.

Re-review follow-up at: `2026-07-08T16:24:00Z`

Re-review evidence:

- Added a regression proving `agentApprovalCockpitFromJson()` accepts a well-formed cockpit DTO that carries a future approval-class identifier through all documented extension points, including class metadata, queue items, approval-contract class, risk class, lock class filters, and forbidden direct-effect lists.
- Relaxed the browser-only approval cockpit parser in `packages/ui/src/agent/agent-adapter.ts` so approval-class and forbidden-direct-effect extension points parse as nonempty strings while decision-only booleans and DTO shape remain strict.
- Re-ran the targeted suite: `npm test -- packages/ui/test/agent-approval-adapter.test.ts packages/ui/test/agent-adapter.test.ts`

Canonical DTO sentinel fix follow-up at: `2026-07-08T16:40:00Z`

Follow-up evidence:

- Added negative regressions in `packages/agent/test/approval-queue.test.ts` proving `buildAgentApprovalQueue()` rejects sentinel values `none` and `human-review` when supplied as request `requiredApprovalClass`, approval `approvalClass`, denial `approvalClass`, or lock `appliesToApprovalClasses`.
- Added negative regressions in `packages/agent/test/approval-cockpit.test.ts` proving `agentApprovalCockpitDtoSchema.parse()` rejects those same sentinel values in approval-class metadata, queue item `approvalClass` / `requiredApprovalClass`, risk approval class, approval-contract class, lock approval-class filters, and top-level plus decision-contract `forbiddenDirectEffects`.
- Refined the canonical queue and cockpit parsers so future secret-safe identifiers such as `evidence-retention-review` remain accepted while sentinel/no-approval values are rejected at canonical queue and cockpit boundaries.
- Re-ran the targeted agent suite RED then GREEN:
  - RED: `npm test -- packages/agent/test/approval-cockpit.test.ts packages/agent/test/approval-queue.test.ts`
  - GREEN: `npm test -- packages/agent/test/approval-cockpit.test.ts packages/agent/test/approval-queue.test.ts`
