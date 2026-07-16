# Task135B One-Admission Cursor Design

**Status:** Coordinator-approved bounded correction pending two fresh read-only
design/plan approvals.

**Authority:** Program registry event `RV-1-E-647` records the exact rejected
candidate, reviewer evidence, and API conflict. This document supersedes only
the in-place successor-rotation language for Task135B in
`docs/superpowers/plans/2026-07-14-resident-agent-factory-authority-recovery-implementation.md`.
Every other final Task135B ownership, safety, event-binding, store, controller,
and verification requirement remains active.

## Problem

Task135B candidate `bdf7d2a9eb75499d273a5ee2b7900dc3fc3c5d14`
correctly accepts only the opaque mounted authority operation released by
Task137A. Its reviews found four finite gaps:

1. Event progression checks the actor kind but not the one resident actor ID.
2. The accepted suffix does not bind the attempt and the complete
   final-output, prepared, recorded, terminal, and orchestration artifact
   chain.
3. Ledger prefix encoding serializes untrusted values before rejecting
   accessors, symbols, custom prototypes, sparse arrays, or `toJSON` behavior.
4. The final Task135B plan requires one in-place strictly-higher-admission
   successor, but the released Task137A operation permanently burns before its
   private inspector can return a changed admission.

The fourth item is an API conflict. Task135B has an exact three-file ceiling,
may import only the released private inspector, and cannot issue, request, or
select another admission. Adding in-place successor behavior would require an
upstream authority redesign, a new import role, and a release-graph change.

## Considered Approaches

### A. Preserve one-admission operations and restart the cursor

Any admission identity change burns the operation and Task135B controller. A
later full workspace readback may let the runtime factory issue a fresh
operation, create a fresh producer, and bind a fresh controller to the same
exact task/run tuple. The new controller reconstructs its phase from the
canonical ledger prefix and may continue only the missing suffix.

This is the selected approach. It matches the released API, keeps the fixed
Task136 graph intact, fails closed, and makes restart behavior explicit.

### B. Widen Task137A to expose successor admission state

The operation inspector could return one strictly higher successor and transfer
authority to Task135B. This conflicts with the released one-admission model,
widens the protected import grammar, and requires new upstream ownership and
release evidence. It is rejected for this slice.

### C. Remove resume after admission changes

Every admission change could permanently fail the task. This is safe but loses
the resident runtime's intended restartability. It is rejected because a fresh
factory-issued operation can resume without reviving stale authority.

## Corrected Authority Model

One `MountedArtifactAuthorityOperation` authorizes exactly one Task135B
producer and one exact controller binding under one current admission identity.
The following transitions apply:

```text
current operation + same admission + accepted ledger prefix
  -> controller remains live

current operation + accepted canonical H suffix under same admission
  -> private accepted prefix and phase advance

current operation + admission identity changes or authority disappears
  -> operation and controller burn permanently

fresh full readback + fresh factory-issued operation + same exact run binding
  -> fresh producer/controller derives canonical phase from ledger
  -> only the missing suffix may continue
```

The old producer, operation, controller, stores, and binding never revive. A
fresh operation is issued only through the existing factory-owned issuer after
the wake/lifecycle layer establishes a current admission. Task135B never calls
`revalidate`, imports the issuer, accepts lifecycle inputs, or chooses a later
admission.

An admission object change is authoritative even if all visible tuple fields
are identical. It burns the old controller. Same-admission ledger growth does
not mint a new admission; Task135B may accept only the frozen canonical suffix
under that original operation.

## Canonical Event Binding

Every relevant event must be a normalized plain-data snapshot and must use
`context.actor.kind === "agent"` and
`context.actor.id === "agent_default"`. The progression automaton remains
strictly ordered and adds these bindings:

- `agent.specialist-run.started`: exact run, task, run type, resident agent,
  and stream.
- Final-output step: exact run and stream, `stepKind === "final-output"`, exact
  step ID/schema/idempotency key, material hash, and input/output artifact hash
  arrays. These values become the immutable final-output binding.
- Prepared handoff: exact run/task/type/resident, final-output event and step,
  material hash, output artifact hashes, handoff ID/revision/manifest/DTO,
  context/source/tool bindings, and causation from the final-output event.
- Recorded handoff: exact equality with the prepared handoff binding, exact
  `preparedEventId`, and causation from the prepared event.
- Run terminal: exact run and stream plus causation from the recorded handoff.
  Completed output hashes must equal the prepared binding. A failed terminal
  must list the recorded handoff in its related events.
- Orchestration completion: exact task, run, run type, and `attemptId`; exact
  final-output, handoff-prepared, handoff-recorded, and run-terminal event IDs;
  exact handoff readback; and causation from the run terminal.
- Task status: exact task and run, resident `changedBy`, terminal-consistent
  status, and causation from the orchestration event. Its authority to complete
  the attempt is inherited only from the immediately preceding orchestration
  event whose `attemptId` equals the bound attempt.

Foreign resident actors, swapped attempts, partial bindings, mismatched hashes,
unexplained task/run events, arbitrary wake events, provider/tool events,
policy or lock changes, and out-of-order suffixes burn the controller.

## Hostile Ledger Normalization

The ledger result is normalized exactly once immediately after `readAll()` and
before any currentness check, serialization, or later I/O. Normalization:

- accepts only strings, finite numbers, booleans, `null`, plain own-data
  objects, and dense plain arrays;
- rejects accessors, symbols, sparse/custom arrays, unexpected prototypes,
  functions, boxed values, and own or inherited serialization hooks;
- snapshots every accepted value recursively into a newly allocated frozen
  plain-data tree; and
- reuses only that snapshot for phase derivation, suffix validation, and
  canonical byte encoding.

No getter, `toJSON`, proxy-like observable hook, or caller mutation may run
during byte comparison. Prefix equality remains byte-for-byte over the frozen
normalized snapshots.

## Frozen Test Matrix

The focused Task135B suite has exactly 20 passing cases. The existing 13 cases
remain represented, and seven causal cases cover the review gaps. Exact
categories are:

1. Opaque Task137A operation only.
2. Frozen path-hiding stores and opaque controller.
3. One-shot bind and structural controller rejection.
4. Full canonical final-output through task-status progression.
5. Same-admission exact resume.
6. Forged operation rejection.
7. Admission change burns the old controller; a fresh operation resumes from
   the canonical prefix.
8. Identical visible tuple under a new admission cannot revive the old cursor.
9-12. Authority loss during material/manifest `put`/`get`.
13. Unrelated suffix rejection.
14. Rollback, replacement, and reorder rejection.
15. Binding/controller reflection and copy rejection.
16. Foreign resident actor rejection.
17. Attempt-swapped orchestration rejection.
18. Final-output/prepared/recorded/terminal artifact mismatch rejection.
19. Policy, lock, foreign-run, and arbitrary-wake rejection.
20. Hostile arrays/objects/accessors/symbols/custom prototypes/`toJSON`
    rejection before observable serialization or store I/O.

The focused command must report `1 file / 20 tests`. The unchanged aggregate
must report `9 files / 120 tests` and the existing Task137
`allowed=8 rejected=20` marker.

## Ownership And Safety

The implementation ceiling remains exactly:

- `packages/local-runtime/src/portable-mounted-agent-artifact-stores.ts`
- `packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts`
- `docs/agentic/claims/task-135b-portable-mounted-handoff-stores.md`

No Task137 source, runtime factory, package index, route, DTO, projection,
ledger implementation, task orchestrator, provider, credential, or external
service changes are permitted. The implementation does not run full
verification, push, reset, touch `neo`, or start Task139.

## Review And Acceptance

Two fresh read-only reviewers must first approve this design and its measurable
plan. Review work does not authorize subagent-driven development.

After approval, one implementation worker may create a reproducible RED commit
and one forward GREEN commit on the preserved Task135B branch. The
implementation prompt must explicitly approve task-scoped
`superpowers:subagent-driven-development` and TDD. Coordinator admission then
runs the frozen focused and aggregate commands. Two entirely fresh reviewers
must approve the exact final revision before program-branch integration.

Findings outside this corrected one-admission model are proposed hardening and
cannot silently become Task135B release blockers without a coordinator-approved
contract revision.
