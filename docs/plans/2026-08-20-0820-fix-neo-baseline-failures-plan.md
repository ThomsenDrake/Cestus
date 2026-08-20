---
title: Neo Baseline Failures Repair - Plan
type: fix
date: 2026-08-20
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Neo Baseline Failures Repair - Plan

## Goal Capsule

**Objective:** Restore the 12 failing tests on the current `neo` baseline while preserving the production contracts those tests exercise.

**Means:** Repair production-equivalent test fixtures, align stale expectations with intentional fail-closed behavior, and partition synchronous compiler-API corpora without changing their coverage (KTD1-KTD4).

**Authority:** Cestus specifications 07 and 08, `AGENTS.md`, and current production behavior govern this repair.

**Stop conditions:** Stop for a required product or contract change that lacks an approved specification, any safety-invariant conflict, or an irrecoverable shipping action.

**Execution profile:** Work only in `codex/repair-neo-baseline-12`, based on `origin/neo`. LFG owns simplification, structured review, the single integration verification, and the unmerged pull-request tail.

## Product Contract

### Summary

Repair the baseline tests so their setup and expectations match the approved mounted-prompt, durable-evidence, runtime-authority, and import-governance contracts. Production behavior remains unchanged.

### Problem Frame

The failures came from test infrastructure drifting behind enforced production boundaries and from two oversized synchronous compiler-API tests exceeding Vitest's existing bound. Changing production code would weaken established safety contracts or grant authority to context-free runtimes.

### Requirements

#### Production-equivalent agent fixtures

- R1. Every evidence-triage workflow invocation must obtain a fresh one-use witness from an actual mounted production prompt write/read cycle.
- R2. The approved-tool scheduler fixture must append a real non-agent domain event after the exact execution claim and return that event's durable ID.
- R3. The scheduler repair must preserve the existing claim, execution, and completion-count assertions.

#### Fail-closed local runtime behavior

- R4. A task-orchestrator tick through the production HTTP handler's context-free default must return the existing secret-safe 500 response and append no orchestration claim.
- R5. The explicit-capabilities task-orchestrator path must remain the positive 200-and-claim proof.
- R6. Operator status must remain a successful DTO whose aggregate stays action-required while its agent section is unavailable, contains the provider-unavailable diagnostic, exposes no fallback metrics, and offers only refresh as its safe action.

#### Bounded import-governance tests

- R7. The two compiler-API governance corpora must be partitioned into bounded semantic groups that execute every existing case, soft assertion, and production-source scan exactly once.
- R8. Compiler programs that do not require library declarations must set `noLib: true`.
- R9. The import-governance repairs must pass under the existing timeout without timeout increases, assertion changes, skipped cases, or mocked production boundaries.

#### Change and delivery boundaries

- R10. Product source, safety invariants, prompt contracts, ledger semantics, authority registration, and fallback behavior must not change.
- R11. The repair must remain independent of PR #40 and `codex/spec-16a-r2-2c-exact-parser`.
- R12. Run focused verification during repair and `npm run verify` exactly once after implementation and review corrections have settled.

### Acceptance Examples

- AE1. Covers R1: a workflow call writes and reads the registered production prompt, consumes that call's witness, and reaches its existing artifact or handoff result.
- AE2. Covers R2-R3: an approved request produces a causally linked durable domain event and increments `completedCount` to one.
- AE3. Covers R4-R5: explicit orchestration capabilities produce 200 and a claim, while the context-free handler produces 500, safe repair guidance, and no claim.
- AE4. Covers R6: `/api/operator/status` returns 200 with the existing action-required aggregate plus an unavailable agent section, empty metrics, the provider-unavailable error diagnostic, and only the refresh action.
- AE5. Covers R7-R9: every compiler corpus partition passes within the existing bound, and the final production scans still enforce the same ownership rules.

### Scope Boundaries

**In scope**

- The five named test files and a single implementation-ready repair plan.
- Test fixture lifecycle, durable test evidence, expected fail-closed DTOs, compiler options, and semantic test partitioning.

**Outside scope**

- Changes to product source, specifications, timeouts, assertion strength, production mocks, or runtime authority.
- Any commit or file from PR #40 or its branch.
- Merging the repair pull request.

### Sources

- `docs/agentic/specifications/07-resident-agent-mounted-task.md`
- `docs/agentic/specifications/08-resident-supervision-cockpit.md`
- `packages/agent/test/investigation-planner-workflow.test.ts`
- `packages/agent/test/scheduler.test.ts`
- `packages/local-runtime/test/agent-runtime-context-attestation.test.ts`
- `packages/local-runtime/test/operator-status.test.ts`
- Historical commit `b5e28370` as implementation evidence only; do not cherry-pick it.

## Planning Contract

### Key Technical Decisions

- KTD1. Wrap evidence-triage test calls with a per-invocation mounted prompt lifecycle that renders the registered production prompt, writes it, reads it back, and passes the returned witness. This follows the investigation-planner fixture and satisfies R1 without bypassing provenance.
- KTD2. Make the scheduler descriptor accept the ledger and append `evidence.ingested` after the exact `agent.tool.execution.claimed` event, with `causationId` set to that claim. Return only the appended event ID to satisfy R2-R3.
- KTD3. Treat context-free route failure and section-level operator degradation as distinct intended terminal states. Update only their stale test expectations while preserving the explicit-authority positive path per R4-R6.
- KTD4. Split each import-governance monolith at existing semantic block boundaries and use `noLib: true` for synthetic and production scans that need no standard library. Preserve one-to-one corpus accounting per R7-R9.

### Implementation Constraints

- Modify only test and plan files.
- Reuse production-adjacent fixtures and real local persistence boundaries.
- Keep temporary runtimes and workspaces isolated and clean them after each test.
- Do not share mounted prompt witnesses across invocations because witness consumption is one-use.
- Do not duplicate or omit compiler corpus entries when extracting shared immutable fixtures.
- Apply at most two focused repair attempts to a failed check or review finding.

### Sequencing

U1 and U2 are independent agent-package fixture repairs. U3 preserves two distinct local-runtime fail-closed outcomes. U4 follows after the contract repairs because it is the only structural test refactor. LFG runs simplification and structured review after all four units, then performs the single integration verification.

### System-Wide Impact and Risks

- A shortcut in U1 could bypass mounted production prompt provenance.
- A fabricated result in U2 could falsely attest scheduler completion without durable evidence.
- A product change in U3 could grant context-free runtimes production authority or invent fallback readiness.
- A mechanical mistake in U4 could silently drop governance cases despite green output.

## Implementation Units

### U1. Mount a fresh production prompt witness for evidence triage

**Goal:** Make the seven positive workflow paths cross the required mounted prompt readback boundary.

**Requirements:** R1, R10-R11.

**Files:** `packages/agent/test/evidence-triage-workflow.test.ts`.

**Approach:** Alias the source workflow as the kernel. Add a test wrapper that renders the registered production prompt, creates a portable workspace and SQLite PRR runtime, writes and reads the mounted prompt artifact, and passes the fresh witness to the kernel. Track handles and temporary roots for `afterEach` cleanup.

**Execution note:** The seven witness failures were reproduced before this unit. Preserve the five cases that already terminate before specialist preparation.

**Test scenarios:**

- Each positive workflow call receives its own mounted readback witness and reaches the existing expected result.
- Sequential cases do not reuse consumed witness state.
- All 12 file tests pass without production prompt mocks or assertion changes.

**Verification:** `npm test -- packages/agent/test/evidence-triage-workflow.test.ts`.

### U2. Record durable scheduler completion evidence

**Goal:** Make the scheduler fixture return a real causally bound domain result.

**Requirements:** R2-R3, R10-R11.

**Files:** `packages/agent/test/runtime.test.ts`.

**Approach:** Pass the ledger into `schedulerDescriptor`. During approved execution, locate the exact execution claim for the tool request, append a non-agent `evidence.ingested` event with that claim as causation, and return the actual appended event ID. Use the same helper contract at both call sites.

**Execution note:** The failure was reproduced as `model-output-invalid` with one examined and failed request but no completed request.

**Test scenarios:**

- The approved request creates the expected claim, durable domain result, and one completion.
- The descriptor cannot satisfy completion with a fabricated or missing ledger event.
- Scheduler and task-orchestration responsibilities remain separated.

**Verification:** `npm test -- packages/agent/test/runtime.test.ts`.

### U3. Assert both intended fail-closed runtime outcomes

**Goal:** Align stale local-runtime expectations with the existing authority boundary without weakening positive coverage.

**Requirements:** R4-R6, R10-R11.

**Files:** `packages/local-runtime/test/agent-task-orchestrator-routes.test.ts`, `packages/local-runtime/test/server.test.ts`.

**Approach:** Rename the default-handler route case and assert its exact 500 diagnostic, repair actions, and no-claim ledger outcome. Keep the explicit-capabilities 200 case unchanged. Update the server expectation so the response remains 200 while the agent section is unavailable. Assert that the aggregate remains `action-required` with zero blocked, one action-required, and zero degraded sections, and that its next safe action remains `action_show_legacy_import_help`. Assert empty agent metrics plus the exact safe provider diagnostic and refresh action.

**Execution note:** Both failures were reproduced. The route lacks orchestration capabilities by design; the server's default agent factory fails context attestation by design.

**Test scenarios:**

- Explicit orchestration capabilities still yield 200 and append an orchestration claim.
- The context-free production handler yields the safe 500 response and appends no orchestration claim.
- Operator status yields 200 with the existing action-required aggregate, four unchanged section states, and one safely unavailable agent section.
- The unavailable agent section contains no fallback metrics or recovery action beyond refresh.

**Verification:** `npm test -- packages/local-runtime/test/agent-task-orchestrator-routes.test.ts packages/local-runtime/test/server.test.ts`.

### U4. Bound the compiler-API governance corpora

**Goal:** Keep every import-governance control while bringing each synchronous test below Vitest's existing timeout.

**Requirements:** R7-R9, R10-R11.

**Files:** `packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts`.

**Approach:** Add `noLib: true` to the mounted-binder helper and final production scan. Partition resident-factory issuance into baseline/topology, rejected private escapes, accepted controls, topology violations, and production scan tests. Partition mounted-binder controls into fixed construction, four-parameter, E1087, runtime probes, rejected outer evaluation, accepted/deferred, binder ownership, and production scan tests. Hoist only immutable fixtures or fresh fixture builders.

Before moving a block, preserve this baseline structural census. Reconcile each post-split partition against the same row. `expect` and `expect.soft` counts are static call-site counts; loop cases state how many controls execute that call site.

| Semantic group | Loop cases | `expect` sites | `expect.soft` sites |
|---|---:|---:|---:|
| Factory baseline and topology | 0 | 1 | 0 |
| Factory rejected private escapes | 106 | 0 | 1 |
| Factory accepted controls | 91 | 1 | 1 |
| Factory topology violations | 13 | 0 | 2 |
| Factory production scan | 0 | 1 | 0 |
| Binder fixed construction | 10 | 3 | 7 |
| Binder four-parameter controls | 19 | 0 | 1 |
| Binder E1087 controls | 0 | 0 | 4 |
| Binder runtime probes | 0 | 6 | 6 |
| Binder rejected outer evaluation | 15 | 0 | 1 |
| Binder accepted and deferred forms | 20 | 0 | 1 |
| Binder ownership corpus | 88 | 0 | 1 |
| Binder production scan and forbidden-file controls | 2 | 4 | 0 |

**Execution note:** The monoliths were reproduced at about 7.6 seconds and 35.6 seconds. A benchmark proved `noLib` is correct but insufficient alone, so partitioning is required without changing the timeout.

**Test scenarios:**

- Every named semantic partition passes under the existing per-test bound.
- Every census row retains its loop-case and assertion-site counts after partitioning.
- Every pre-repair case and `expect.soft` executes exactly once across the partitions.
- Each production-source scan executes once and reports the same ownership rules.
- No partition shares mutable compiler or witness state.

**Verification:** `npm test -- packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts`.

## Verification Contract

Run each unit's focused command after that unit settles. After simplification and structured review corrections, run `npm run verify` exactly once as the integration boundary. Do not rerun it unless the command itself fails for a confirmed transient infrastructure reason rather than a code or test failure.

Review must confirm that the diff contains no product-source changes, no timeout changes, no assertion weakening, no omitted compiler cases, and no overlap with PR #40. Browser verification is not applicable because the candidate changes no browser surface.

## Definition of Done

- U1-U4 satisfy their requirements and focused verification commands.
- The original 12 failures are green for contract-accurate reasons.
- Simplification leaves no dead-end helpers, duplicate fixtures, or abandoned experiments.
- Structured review has no unresolved P0/P1 findings and no safety-invariant regression.
- `npm run verify` passes on its single integration-boundary invocation.
- The commit and pull request target `neo`, remain independent of PR #40, and do not merge.
- CI reaches a decided state through the Compound Engineering babysitting lane.
