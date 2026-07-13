# Task 121 Claim: PRR Negotiation Draft Handoff Migration

- Task and lane: Task 121 / H / Wave 1.
- Status: in-progress.
- Worker: `/root/wave1_task121`.
- Branch: `codex/task-121-resident-full-vision-prr-handoff`.
- Worktree: `/home/drake/.codex/worktrees/383d/Cestus`.
- Base commit: `48c9cbcdcf723bcc74868f782bc2375bae565ae6` (CF-1 integration gate).
- Claimed at: `2026-07-13T18:21:28Z`.

## Authorization And Scope

Coordinator authorization covers Task 121 only: `packages/agent/src/prr-negotiation-workflow.ts`, `packages/agent/test/prr-negotiation-workflow.test.ts`, and this claim. It authorizes SDD, TDD, fresh independent review, and verification-before-completion. This worker must not alter shared handoff contracts, dispatch a provider, send a PRR, consume approval, self-review, self-integrate, or merge into `neo`.

The task consumes CF-1's frozen handoff contract and produces only a provenance-bound, durable, read-back PRR draft handoff. Missing, mismatched, stale, or swapped authority, request, correspondence, or context must yield a safe nonterminal result with no fallback write.

## Required Evidence

- RED/GREEN command: `npm test -- packages/agent/test/prr-negotiation-workflow.test.ts packages/agent/test/specialist-handoff-projection.test.ts`.
- Full verification before the implementation commit: `npm run verify`.
- Scope check: `git diff --check`.
- Fresh independent specification/invariant and code-quality/verification review are required after the verified implementation commit.

## Execution Record

- Initial claim committed before task-file edits. RED evidence, in-progress status, GREEN evidence, verification, and review handoff will be appended without rewriting this record.
- Status changed to `in-progress` before Task121 source or test edits.
- RED (durable readback): `npm test -- packages/agent/test/prr-negotiation-workflow.test.ts packages/agent/test/specialist-handoff-projection.test.ts` exited 1 on 2026-07-13 because the local draft path had no `agent.specialist-handoff.recorded` event. The regression was added before workflow production changes.
- RED (readback failure): the same command exited 1 after the failure-injection regression exposed the raw unreadable-store error. The required result is a secret-safe blocked handoff with no prepared, recorded, or terminal fallback event.
- GREEN: the exact targeted command exited 0 with 2 test files and 46 tests passing after the PRR workflow recorded the local draft through final-output, prepared/recorded readback, and terminal causation, while the unreadable-store path remained nonterminal and no PRR send event was appended.
- Full verification: `git diff --check && npm run verify` exited 0 on 2026-07-13: typecheck passed; 192 test files passed with 3 skipped; 2,229 tests passed with 5 skipped; Vite built with its existing chunk-size warning; factory-readiness passed.
