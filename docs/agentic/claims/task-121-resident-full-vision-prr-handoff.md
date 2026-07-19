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
- Verification correction: the exact full-verifier result was 189 test files passed, 3 skipped; 2,229 tests passed, 5 skipped; Vite build passed; factory-readiness passed. The prior line's 192 is the total test-file count, not the passed count.

## RC-121-01 — Post-Final-Output Handoff Recovery Repair

- Authorization and scope: fresh repair author on `codex/task-121-resident-full-vision-prr-handoff-recovery` from rejected head `210cc178`; only this append-only claim, `packages/agent/src/prr-negotiation-workflow.ts`, and `packages/agent/test/prr-negotiation-workflow.test.ts` are writable. No shared handoff contract, provider, PRR send, graph, runtime, coordinator, self-review, self-integration, or `neo` action is authorized.
- Root cause: the previous workflow caught every durable-publication failure after `step_prr_negotiation_draft` and returned only an in-memory blocked handoff. If `appendSpecialistFinalOutputStep` had succeeded but `recordSpecialistHandoff` failed, the next call reached `assertSpecialistStepNotRecorded` before it could read and record the already durable final output, so it could neither safely resume nor rerun.
- Documentation RED: `npm test -- packages/agent/test/prr-negotiation-workflow.test.ts packages/agent/test/specialist-handoff-projection.test.ts` exited 1 with two expected regressions: pre-final unreadable storage returned unstructured `blocked` rather than a secret-safe `external-effect-failed` terminal; post-final manifest-record failure retried into `Specialist run has already recorded this local derivative step.`
- Repair contract: final-output persistence is separated from recording/finalization. A subsequent call first detects the exact durable final-output step and retries verified `recordSpecialistHandoff` plus finalization without rebuilding context, invoking the provider, or writing another draft step. A post-final record failure returns only a safe resumable handoff tied to that durable final-output event. A pre-final unreadable-store failure records a secret-safe `agent.specialist-run.failed` terminal with structured `external-effect-failed` / `prr-negotiation-handoff-storage-failed`; it exposes no artifact as reviewable.
- GREEN: the exact focused command exited 0 with 2 test files and 47 tests passing. New failure-window coverage proves one final-output step, one draft step, one provider invocation, no prepared/recorded/terminal before recovery, then exact resumed prepared -> recorded -> completed readback/projection after storage repair; it also proves no PRR send, graph, tool, or external effect and no raw storage error in either DTO.
- Verification: `git diff --check` exited 0; `npm run factory:check` exited 0 with `factory-readiness passed`; and a fresh `npm run verify` exited 0 on this dedicated recovery worktree: typecheck passed; 189 test files passed with 3 skipped; 2,230 tests passed with 5 skipped; Vite production build passed with the existing chunk-size warning; factory readiness passed. The SQLite experimental warnings were non-failing and contained no task data.
- Review stop: ready for a distinct fresh review after one final post-record full gate and a single forward repair commit. This repair author must not self-review, self-integrate, dispatch a dependent lane, or merge `neo`.

## V4 CF1-HR Authority-Bound Adoption

- Status transition: `in-progress` -> `implementing`.
- Worker: `/root` (sole bounded Task121 implementation owner).
- Branch: `codex/task121-cf1-handoff-adoption`.
- Worktree: `/home/drake/.codex/worktrees/57e7/Cestus`.
- Exact immutable base: `986c2a43b018e72acf1104e84853826b06b1abdd`.
- Released prerequisite: strict V4 record 14, `CF1-HR`; repository strict
  prefix is 15 and the incomplete card boundary remains 29.
- Exact owned paths remain this claim,
  `packages/agent/src/prr-negotiation-workflow.ts`, and
  `packages/agent/test/prr-negotiation-workflow.test.ts` only.
- This finite packet is exactly claim transition, causal RED test, then
  minimal GREEN production adoption. It consumes the released opaque mounted
  authority witness and mounted stores through the CF1-HR V2 lifecycle; it
  does not mint caller authority, use V1 to complete V2, recreate a shadow
  contract, send a PRR, decide approval, complete legal escalation, clear a
  lock, invoke external services, or create a fallback write.
- Initial reproduction after restoring real offline lockfile dependencies:
  `npm test -- packages/agent/test/prr-negotiation-workflow.test.ts` exited 1
  with 10 failures. Each affected normal workflow fixture is missing the
  current mounted production prompt readback witness and therefore stops in
  `prepareSpecialistRun` before model, derivative, PRR, tool, or handoff
  effects. The causal RED will provide the released prompt authority and
  mounted handoff inputs so it can prove the still-legacy V1 completion path
  is rejected by the required V2 lifecycle assertions.

## V4 Approval-Pending Suspension Repair

- Forward-merged program authority `e1542136c628eab4f33fee01432e2ba15be84d18`
  containing RV-1-E-844 onto clean Task121 candidate
  `efee7660fccf2609bf7e8d38f944fef0f37f98e2` as merge
  `92ff9e557a17125120231e13553725bc0dc31120`; both histories are preserved.
- Causal RED requires the approval-requested `waiting-for-approval` branch to
  retain its local draft and exact requested-tool provenance while appending no
  specialist terminal event, orchestration completion, or completed task
  status. The run must remain resumable and no send/external execution event
  may appear.

## V4 Approval-Pending Suspension Repair — Corrected RED

- Restored the uncommitted GREEN candidate with `apply_patch` to exact
  `b6df504aace9ba16a0195fdc0f6d7ac413a180e9` bytes before editing; no
  committed history was changed.
- Forward-merged program authority
  `4ce84e2638409407cc9a4cb39353332d7768d8fe` containing RV-1-E-845.
- The corrected causal RED replaces only the empty-array asymmetric matcher.
  It builds the forbidden returned-ID set from specialist terminal,
  orchestration-completed, and completed task-status events, then requires
  every returned event ID to be absent from that set. Production remains
  byte-identical to the restored RED while the current raw completion still
  makes the approval-pending case fail.
