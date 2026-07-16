# Task137B Wake Schema Ownership Correction Design

**Status:** Bounded technical correction for the Resident Agent Full-Vision
Program. This changes no user-facing product behavior and preserves the
approved wake, portable-workspace, authority, and release invariants.

## Context And Root Cause

Task137B-W must append and read back these CF1-frozen lifecycle events:

- `agent.wake.supervisor.lease.claimed.v1`
- `agent.wake.supervisor.pause.requested.v1`
- `agent.wake.supervisor.paused.v1`
- `agent.wake.supervisor.resume.requested.v1`
- `agent.wake.supervisor.recovery.verified.v1`
- `agent.wake.supervisor.degraded.v1`
- `agent.wake.supervisor.unrecoverable.v1`

At program checkpoint `f830fd08be93cfa437b5c5b370f8e4bd796ec863`,
all seven names have zero matches under `packages/`. The ontology ledger derives
its event type and parser union from `packages/ontology/src/contracts.ts`, so a
Task137B-local type or fixture could not be appended through the canonical
ledger and would be a forbidden shadow schema.

The original Task137B plan assigned the central ontology contract to
Task137B-W. The v2 graph removed it based on the incorrect assumption that
Task129-MFA had already added the wake schemas. Task129-MFA added only mounted
provider-feasibility schemas. Its strict release record is valid for the bytes
it integrated and must not be rewritten.

## Considered Approaches

### A. Versioned transfer with historical release compatibility

Create an immutable v3 assurance contract. Task129-MFA transfers only
`packages/ontology/src/contracts.ts` to Task137B-W, and Task137B-W regains that
path. A finite compatibility declaration says the already committed
Task129-MFA v4 record correctly recorded the path as `owned` at its release,
while v3 treats it as `transferred` for final-head blob checking.

This is the selected approach. It restores the approved implementation
boundary, keeps all existing release records append-only, and lets final
repository verification require the Task137B-W blob at current HEAD.

### B. Insert a separate wake-schema card

A new 30th card could own the ontology change before Task137B-W. This separates
schema and runtime work but expands the frozen graph, adds another release and
review cycle, and still requires a historical ownership handoff. It adds no
useful product boundary and is rejected.

### C. Keep v2 and make wake persistence optional

Task137B-W could use only injected DTOs or process-local state. This would make
pause, recovery, degraded state, and lease evidence non-rebuildable after
restart. It violates CF1-W-LIFECYCLE, append-only provenance, and portable
workspace authority, so it is rejected.

## Assurance Contract V3

Create `docs/agentic/contracts/task136-bounded-assurance-v3.json`. The v1 and
v2 files remain byte-for-byte unchanged. V3 retains:

- exactly 29 cards in the same order;
- all card commands;
- the v1 composition grammar and accepted/rejected corpus;
- the v1 ABI corpus in the checker;
- `task136-dispatch-release.v4` as the mutable record schema;
- authority in the program registry at reset event `RV-1-E-597`.

V3 makes exactly these graph changes:

1. Task129-MFA changes the disposition of
   `packages/ontology/src/contracts.ts` from `owned` to `transferred` and sets
   `transferToIds` to exactly `["Task137B-W"]`.
2. Task137B-W adds `Task129-MFA` after its existing prerequisite IDs, producing
   exactly `["Task135B", "T120-R", "Task129-MFA"]`. The direct edge keeps the
   transfer mechanically reviewable without weakening the verifier's direct
   prerequisite rule.
3. Task137B-W inserts `packages/ontology/src/contracts.ts` as `owned`
   immediately before `packages/ontology/test/resident-wake-contracts.test.ts`.

The contract adds one top-level object:

```json
{
  "releaseCompatibility": {
    "version": "task136-release-compatibility.v1",
    "historicalPathDispositions": [
      {
        "cardId": "Task129-MFA",
        "path": "packages/ontology/src/contracts.ts",
        "recordDisposition": "owned"
      }
    ]
  }
}
```

No other compatibility entry is valid. The verifier requires the referenced
card/path to exist, the static disposition to be `transferred`, the record
disposition to be `owned`, the card to name exactly one transfer target, and
that target to directly depend on the source card and own the same path.

When validating a release record, the verifier compares a path to the exact
historical disposition only for this declared tuple. Candidate and integration
blob checks remain exact. Current-HEAD blob equality is skipped for the
transferred Task129-MFA path and required for the final Task137B-W-owned path.
All undeclared disposition mismatches continue to fail.

## Task137B-W Corrected Write Ceiling

After v3 integration, Task137B-W owns exactly eight paths:

1. `packages/local-runtime/src/wake-supervisor-runtime.ts`
2. `packages/local-runtime/src/mounted-wake-lifecycle-store.ts`
3. `packages/local-runtime/test/wake-supervisor-runtime.test.ts`
4. `packages/local-runtime/test/mounted-wake-lifecycle-store.test.ts`
5. `packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts`
6. `packages/ontology/src/contracts.ts`
7. `packages/ontology/test/resident-wake-contracts.test.ts`
8. `docs/agentic/claims/task-137-resident-full-vision-w2-wake-supervisor-runtime.md`

The corrected task implements the already approved Task137B behavior. It may
add only the seven frozen wake lifecycle schemas to the ontology contract. It
must not alter provider-feasibility schemas, other event contracts, the
Task137A policy test, the runtime factory, the release verifier, or the program
registry.

## Failure And Review Model

The v3 checker uses a finite mutation set. It must reject:

- absent or extra compatibility entries;
- an unknown card or path;
- a compatibility entry for a non-transferred path;
- a compatibility disposition other than historical `owned`;
- a missing transfer target or direct prerequisite;
- a target that does not own the transferred path;
- any v1 or v2 byte change;
- any graph order, card count, command, grammar, corpus, or ABI drift.

Reviewers evaluate only this finite contract and the existing Task137B wake
requirements. New graph features or syntax categories are proposed hardening,
not blockers. Each executable candidate requires two fresh exact-revision
reviews: architecture/invariants and executability/adversarial behavior.

## Completion

The correction is complete when:

1. v3 and its checker migration are dual-approved and integrated on the
   program branch;
2. repository mode recognizes the existing ten records and stops only at
   `repository release closure incomplete: expected 29 records, found 10`;
3. Task137B-W is implemented from the corrected graph, dual-approved,
   integrated, and released as record 11;
4. repository mode then stops only at `found 11`;
5. full verification, providers, network, credentials, external services,
   Task139, push, reset, and every `neo` action remain closed until their later
   graph gates authorize them.
