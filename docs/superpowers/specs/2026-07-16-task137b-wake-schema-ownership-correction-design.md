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

Create an immutable v3 assurance contract. Task129-MFA transfers the ontology
contract plus the finite Task137 policy source and test to Task137B-W. A
finite compatibility declaration pins the complete already committed
Task129-MFA v4 record and says those three paths were correctly recorded as
`owned` at its release, while v3 treats them as `transferred` for final-head
blob checking.

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
- all card commands except the Task137B-W command, which adds the transferred
  policy test in owned-path order;
- the v1 composition grammar and accepted/rejected corpus;
- the v1 ABI corpus in the checker;
- `task136-dispatch-release.v4` as the mutable record schema;
- authority in the program registry at reset event `RV-1-E-597`.

V3 makes exactly these graph changes:

1. Task129-MFA changes exactly these path dispositions from `owned` to
   `transferred` and sets `transferToIds` to exactly `["Task137B-W"]`:
   - `packages/ontology/src/contracts.ts`
   - `packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts`
   - `packages/local-runtime/test/support/task137-authority-boundary-policy.ts`
2. Task137B-W adds `Task129-MFA` after its existing prerequisite IDs, producing
   exactly `["Task135B", "T120-R", "Task129-MFA"]`. The direct edge keeps the
   transfer mechanically reviewable without weakening the verifier's direct
   prerequisite rule.
3. Task137B-W inserts the policy source and policy test as `owned` immediately
   after `packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts`,
   then inserts `packages/ontology/src/contracts.ts` immediately before
   `packages/ontology/test/resident-wake-contracts.test.ts`.
4. Task137B-W's exact command becomes:

```text
npm test -- packages/local-runtime/test/wake-supervisor-runtime.test.ts packages/local-runtime/test/mounted-wake-lifecycle-store.test.ts packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts packages/ontology/test/resident-wake-contracts.test.ts
```

The contract adds one top-level object:

```json
{
  "releaseCompatibility": {
    "version": "task136-release-compatibility.v1",
    "historicalRecords": [
      {
        "cardId": "Task129-MFA",
        "canonicalJsonSha256": "23cb98725d67ada15c0e2913816f82407c171912564423e669cf73995aaead76",
        "pathDispositions": [
          {
            "path": "packages/ontology/src/contracts.ts",
            "recordDisposition": "owned"
          },
          {
            "path": "packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts",
            "recordDisposition": "owned"
          },
          {
            "path": "packages/local-runtime/test/support/task137-authority-boundary-policy.ts",
            "recordDisposition": "owned"
          }
        ]
      }
    ]
  }
}
```

No other record or path compatibility entry is valid. The verifier hashes the
parsed record as UTF-8 `JSON.stringify(record)` and requires the exact canonical
JSON SHA-256 before accepting any historical disposition. It requires each
referenced card/path to exist, each static disposition to be `transferred`,
each historical record disposition to be `owned`, the card to name exactly one
transfer target, and that target to directly depend on the source card and own
the same path.

When validating a release record, the verifier compares a path to the exact
historical disposition only for this declared tuple. Candidate and integration
blob checks remain exact. Current-HEAD blob equality is skipped for the
transferred Task129-MFA path and required for the final Task137B-W-owned path.
All undeclared disposition mismatches continue to fail. Mutating any field of
the Task129-MFA candidate, review, prerequisite, integration, release event, or
owned-path entry changes the canonical hash and fails closed.

## Prefix Evidence

V3 separates strict prefix parsing from complete closure. Repository mode:

1. parses only the contiguous canonical prefix in graph order;
2. validates exact record shape, reviews, prerequisites, compatibility hashes,
   and historical dispositions;
3. verifies candidate and integration commits/blobs for every prefix record;
4. verifies current-HEAD blobs for every prefix path whose final static
   disposition is `owned`;
5. runs the exact command for every released prefix card;
6. rechecks clean checkout and non-symlinked dependencies;
7. emits `TASK136_REPOSITORY_PREFIX_OK records=N commands=N`;
8. only then reports incomplete closure when `N < 29`.

A malformed, stale, missing, non-blob, command-failing, or compatibility-
mismatched prefix fails before the prefix marker and before the incomplete-
closure result. Complete 29-card closure retains its existing completion
marker after the same evidence checks.

## Task137B-W Corrected Write Ceiling

After v3 integration, Task137B-W owns exactly ten paths:

1. `packages/local-runtime/src/wake-supervisor-runtime.ts`
2. `packages/local-runtime/src/mounted-wake-lifecycle-store.ts`
3. `packages/local-runtime/test/wake-supervisor-runtime.test.ts`
4. `packages/local-runtime/test/mounted-wake-lifecycle-store.test.ts`
5. `packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts`
6. `packages/local-runtime/test/support/task137-authority-boundary-policy.ts`
7. `packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts`
8. `packages/ontology/src/contracts.ts`
9. `packages/ontology/test/resident-wake-contracts.test.ts`
10. `docs/agentic/claims/task-137-resident-full-vision-w2-wake-supervisor-runtime.md`

The corrected task implements the already approved Task137B behavior. It may
add only the seven frozen wake lifecycle schemas to the ontology contract. In
the transferred Task137 policy, it may add exactly one direct static value
import: `wake-supervisor-runtime.ts` importing
`createPortableWorkspaceLifecyclePorts` from
`portable-workspace-lifecycle.ts`. It must modify the existing allowed and
rejected fixtures rather than expand the frozen **8 allowed / 20 rejected**
corpus. It must not alter provider-feasibility schemas, other event contracts,
the runtime factory, the release verifier, or the program registry.

## Failure And Review Model

The v3 checker uses a finite mutation set. It must reject:

- absent or extra compatibility records or path entries;
- any canonical Task129-MFA record hash mismatch, including candidate, review,
  prerequisite, integration, release-event, or blob mutations;
- an unknown card or path;
- a compatibility entry for a non-transferred path;
- a compatibility disposition other than historical `owned`;
- a missing transfer target or direct prerequisite;
- a target that does not own the transferred path;
- any v1 or v2 byte change;
- missing candidate/integration blobs or current final-owner blobs in a partial
  release prefix;
- any prefix command failure or a prefix marker emitted before all evidence;
- any graph order, card count, non-Task137B-W command, grammar, corpus-count,
  or ABI drift.

Reviewers evaluate only this finite contract and the existing Task137B wake
requirements. New graph features or syntax categories are proposed hardening,
not blockers. Each executable candidate requires two fresh exact-revision
reviews: architecture/invariants and executability/adversarial behavior.

## Completion

The correction is complete when:

1. v3 and its checker migration are dual-approved and integrated on the
   program branch;
2. repository mode verifies ten records and ten commands, emits
   `TASK136_REPOSITORY_PREFIX_OK records=10 commands=10`, and only then stops
   at `repository release closure incomplete: expected 29 records, found 10`;
3. Task137B-W is implemented from the corrected graph, dual-approved,
   integrated, and released as record 11;
4. repository mode verifies eleven records and eleven commands, emits
   `TASK136_REPOSITORY_PREFIX_OK records=11 commands=11`, and only then stops
   at `found 11`;
5. full verification, providers, network, credentials, external services,
   Task139, push, reset, and every `neo` action remain closed until their later
   graph gates authorize them.
