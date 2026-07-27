# Central Florida ICE Legacy Engineering Preview Implementation Plan

> **Execution contract:** Use the project-local Cestus software-factory workflow, Level 2 mission mechanics, test-driven development, task-scoped subagent-driven development, atomic commits, and dual fresh review at the durable/provenance/human-gate boundaries.

**Goal:** Deliver a supervised, deterministic, restart-reconstructable legacy preview at `/home/drake/.local/share/cestus/previews/central-fl-ice-engineering-preview` without changing Wave 0–5 production state or writing to the source SSD.

**Architecture:** Add a development-only preview module and direct `tsx` CLI that perform strict source/destination preflight, then compose the existing portable workspace and legacy import runtime. Persist deterministic preview manifests beside the portable workspace’s canonical ledger/blob/derivative layout. Reuse the ontology-bootstrap, evidence-triage, and investigation-planner contracts after their human gates; do not duplicate ledger, ontology truth, approval, provider, or storage implementations.

**Mission:** Level 2 bounded feature with dual review because the work crosses durable state, provenance/projection, secret safety, human approval gates, and a possible provider-byte-transfer boundary.

**Base SHA:** `dc05c43c4b9a592d0396acd034bfc32e177fd09a`

---

## Task 1: Commit the mission design and repair the exact-base verifier fixture

**Owned files:**

- `docs/superpowers/specs/2026-07-27-central-fl-ice-engineering-preview-design.md`
- `docs/superpowers/plans/2026-07-27-central-fl-ice-engineering-preview-implementation.md`
- `docs/agentic/claims/central-fl-ice-engineering-preview.md`
- `packages/agent/test/evidence-triage-workflow.test.ts` (verifier-only fixture edit)

**RED evidence:**

```bash
TMPDIR=/dev/shm npm test -- \
  packages/ingestion/test/legacy-inspector.test.ts \
  packages/ingestion/test/legacy-report.test.ts \
  packages/ingestion/test/legacy-runtime.test.ts \
  packages/ingestion/test/legacy-staging.test.ts \
  packages/ontology-bootstrap/test/dossier-builder.test.ts \
  packages/ontology-bootstrap/test/fake-runtime.test.ts \
  packages/agent/test/evidence-triage-workflow.test.ts \
  packages/agent/test/investigation-planner-workflow.test.ts
```

Exact-base result: 7 evidence-triage failures at `prepareSpecialistRun`; the fixture omits the now-required mounted production prompt readback witness. The other 90 tests pass.

**Implementation:**

1. Add the same current mounted prompt-readback fixture pattern already exercised by the specialist-kernel and investigation-planner suites.
2. Change no specialist runtime behavior.
3. Re-run the exact command and verify all component suites pass.
4. Run `TMPDIR=/dev/shm npm run typecheck`, `git diff --check`, and focused claim/spec lint through `npm run factory:check`.
5. Fresh-review the fixture edit and documents.
6. Commit atomically.

## Task 2: Implement fail-closed preview preflight and deterministic candidate material

**Owned files:**

- `packages/ingestion/src/central-fl-ice-preview.ts`
- `packages/ingestion/test/central-fl-ice-preview.test.ts`
- `packages/ingestion/src/central-fl-ice-preview-cli.ts`
- `docs/agentic/claims/central-fl-ice-engineering-preview.md`

**RED tests first:**

- reject wrong source realpath, device, target, filesystem, or required mount option;
- reject a writable SSD mount;
- reject destination on the SSD, on the same source device, on a read-only target, or pre-existing non-preview content;
- reject symlinks, special files, nested mount crossings, ZIP containers, forbidden names, and count mismatch before content reads;
- prove forbidden files are never opened or hashed;
- produce stable ordered candidates and SHA-256 candidate-set hash;
- preserve duplicate, archived, and superseded occurrences explicitly;
- prove there are no filesystem writes before all preflight checks pass.

**Minimal implementation:**

1. Define frozen constants for the approved source, mount, file count, destination, workspace/source/batch identities, and code base.
2. Inject filesystem and mount-inspection ports so unit tests require no real SSD.
3. Normalize paths by code-unit ordering and reject ambiguous Unicode/path traversal.
4. Inventory metadata first; open/hash only allowed regular files after the full tree passes.
5. Stable-serialize the exact raw candidate set and exclusions, compute SHA-256, and bind source identity plus Git code SHA.
6. Keep the module development-only and do not export it from package production indices.
7. Run the focused preview test, existing ingestion tests, typecheck, diff check, and factory check.
8. Use a fresh reviewer, remediate findings test-first, and commit atomically.

## Task 3: Compose the supervised portable preview workflow

**Owned files:**

- `packages/ingestion/src/central-fl-ice-preview.ts`
- `packages/ingestion/test/central-fl-ice-preview.test.ts`
- `packages/ingestion/src/central-fl-ice-preview-cli.ts`
- `docs/agentic/claims/central-fl-ice-engineering-preview.md`

**RED tests first:**

- create the destination only after preflight and only when collision-free;
- use existing portable workspace and legacy runtime services;
- persist the inspection manifest and exact candidate artifact on internal storage;
- stop before `ingestion.import.approved` and evidence blob writes;
- resume only after explicit raw approval and candidate/source revalidation;
- import evidence with occurrence/path/hash/provenance bindings;
- build an evidence-bound ontology dossier and staging preview;
- stop before staging approval;
- stage only the exact approved IDs and append only `assertion.proposed`;
- forbid accepted graph, PRR send/follow-up, legal, publication, tool completion, and destructive events;
- record safe provider-readiness blockers without credential access or fabricated acceptance;
- persist local triage/planner handoff material;
- close, remount, rebuild, and compare replayed ledger/evidence/proposals/handoff;
- produce the final manifest.

**Minimal implementation:**

1. Mount the portable workspace through `createPortableIngestionMountResolver`.
2. Invoke `createLegacyImportRuntime` for inspect/report/quarantine, approval/import, staging preview/approval, and staging.
3. Bind ontology-bootstrap dossier inputs only to the staged report event, report artifact, imported evidence links, and safe summaries.
4. Use the existing provider byte-transfer, mounted prompt, triage, and planner contracts when ready. Record a resumable safe blocker when readiness is unavailable.
5. Keep all task/PRR candidates as local drafts; never call send or execution adapters.
6. Add a durable phase manifest with exact prior-state hash and allowed next transition.
7. Re-run focused and cross-boundary tests, typecheck, diff check, and factory check.
8. Perform both required fresh reviews and remediate findings test-first.
9. Commit atomically.

## Task 4: Run the deterministic source inspection and stop at Gate 1

**No repository code edits are expected. Preview artifacts are written only after the exact internal destination is revalidated.**

```bash
TMPDIR=/dev/shm npx tsx packages/ingestion/src/central-fl-ice-preview-cli.ts inspect
```

Verify:

- source identity and mount posture;
- 136 selected source files and exact bytes;
- hashes stable across the preview preflight and existing legacy inspector;
- no forbidden path was opened;
- destination internal-disk proof;
- exact candidates, exclusions, quarantine, report, inventory, and candidate-set hashes;
- no import approval, evidence blob, staging approval, or ontology proposal events.

Present Gate 1 data and stop for human raw-import approval.

## Task 5: After Gate 1, import evidence and stop at Gate 2

```bash
TMPDIR=/dev/shm npx tsx packages/ingestion/src/central-fl-ice-preview-cli.ts \
  raw-import --approved-by actor_human_central_fl_ice_preview
TMPDIR=/dev/shm npx tsx packages/ingestion/src/central-fl-ice-preview-cli.ts staging-preview
```

Verify exact evidence/occurrence/path/hash/provenance bindings, produce the ontology-bootstrap dossier, present the exact staging candidate artifact and hash, then stop for human staging approval.

## Task 6: After Gate 2, complete the local supervised preview

```bash
TMPDIR=/dev/shm npx tsx packages/ingestion/src/central-fl-ice-preview-cli.ts \
  stage --approved-by actor_human_central_fl_ice_preview --candidate <exact-approved-id>...
TMPDIR=/dev/shm npx tsx packages/ingestion/src/central-fl-ice-preview-cli.ts handoff
TMPDIR=/dev/shm npx tsx packages/ingestion/src/central-fl-ice-preview-cli.ts verify-replay
TMPDIR=/dev/shm npx tsx packages/ingestion/src/central-fl-ice-preview-cli.ts manifest
```

Verify that only evidence-bound `assertion.proposed` events were added; triage/planner outputs remain supervised and local; no request is sent; restart reconstruction passes; and the final manifest contains exact code/source/hashes/events/artifacts/counts/commands/validation/limitations/defects.

## Final Verification and Branch Finish

```bash
TMPDIR=/dev/shm npm run typecheck
TMPDIR=/dev/shm npm test -- \
  packages/ingestion/test/central-fl-ice-preview.test.ts \
  packages/ingestion/test/legacy-inspector.test.ts \
  packages/ingestion/test/legacy-report.test.ts \
  packages/ingestion/test/legacy-runtime.test.ts \
  packages/ingestion/test/legacy-staging.test.ts \
  packages/ontology-bootstrap/test/dossier-builder.test.ts \
  packages/ontology-bootstrap/test/fake-runtime.test.ts \
  packages/agent/test/evidence-triage-workflow.test.ts \
  packages/agent/test/investigation-planner-workflow.test.ts
TMPDIR=/dev/shm npm run ui:build
TMPDIR=/dev/shm npm run factory:check
git diff --check
```

After all gates and final verification:

1. perform a final fresh review against the approved spec and diff;
2. update the claim with exact evidence;
3. commit the final manifest reference atomically;
4. push only `codex/central-fl-ice-engineering-preview`;
5. do not open a PR or merge.

## Task 3 Review Remediation

The initial Task 3 candidate is not reviewable as approved until all of these
test-first slices are green:

1. immediate pre-create authority recheck with zero writes on drift;
2. real portable-runtime crash/retry coverage after inspect, report, raw
   approval/import, staging approval/proposals, and checkpoint append failure;
3. ledger-authoritative approval/proposal IDs, actors, causation, counts, and
   phase event IDs;
4. zero-delta enforcement for nominal report/quarantine/preview reads;
5. full stored Gate 2 artifact readback by hash and exact canonical comparison;
6. adjacent checkpoint phases, immutable authority, and monotonic provenance;
7. scanner inventory hash plus exact workflow and validation receipts in the
   final manifest;
8. provider blocker scoped to a fresh approved provider mission with no
   fabricated next command;
9. no-checkpoint crash recovery that rejects and does not write an unrecognized
   existing destination.

The validation runner is fixed in code: it executes only the source-mandated
typecheck, nine-file cross-boundary suite, factory readiness check, and
`git diff --check`, from the repository root with `TMPDIR=/dev/shm`, `shell:
false`, and ignored subprocess output. Callers cannot supply commands.

## Task 3 Second Review Remediation

The second review of remediation commit
`dcf6a1a3cffdd2feb71dde3849119cebc5aeebf4` requires one additional bounded,
test-first pass:

1. add adversarial tests proving Gate 1 rejects an extra approval, evidence,
   evidence-link, parse job, occurrence binding, or inconsistent completion
   totals outside the exact approved raw candidate set;
2. add an adversarial test proving Gate 2 rejects an otherwise valid proposal
   outside the exact approved subset;
3. use a real portable workspace to prove no-checkpoint recovery rejects both
   an extra allowed-type foreign inspection event and a missing expected
   inspection event without adopting IDs or writing a checkpoint;
4. place a destination-only authority recheck immediately before the first
   workspace create and prove destination drift after the final source scan
   produces no workspace or checkpoint;
5. make a caller-supplied import `approvedAt` part of exact retry equality while
   preserving idempotent retry when the caller omits it;
6. rerun the focused workflow/import tests, the seven-file retry boundary, the
   nine-file preview boundary, all ingestion tests, the ontology/bootstrap plus
   specialist boundary, typecheck, UI build, factory readiness, and
   `git diff --check`;
7. update the claim with exact RED/GREEN evidence, audit owned-file scope, and
   commit the remediation atomically for a fresh dual review.

No live SSD inspection, preview workspace creation, provider transfer, or
human-gate transition is part of this remediation task.

## Task 3 Third Review Remediation

The third review of remediation commit
`7a5f820f68907ee88d0c09384b9bf334c683e819` requires one final bounded,
test-first reconciliation pass:

1. add same-count adversarial Gate 1 tests for foreign approval/evidence/link/
   parse/completion material, including provider-lane and context substitution;
2. add same-count adversarial Gate 2 tests for wrong approval
   batch/stream/version and foreign proposal streams;
3. use a real portable workspace to corrupt one deterministic field in each
   no-checkpoint inspection phase and prove recovery rejects the destination
   without adding a checkpoint or any ledger event;
4. reconcile source-change diagnostics only when their complete safe retry
   envelope matches the import contract, carry their IDs into durable phase
   provenance, reject arbitrary diagnostics, and prove exact-byte restoration
   permits a resumable retry;
5. implement one shared canonical committed-event comparator and
   phase-specific expected-event builders over existing runtime, ledger,
   report, and identifier contracts;
6. rerun the focused preview suite, the seven-file retry boundary, the
   nine-file preview boundary, all ingestion tests, the ontology/bootstrap plus
   specialist boundary, typecheck, UI build, factory readiness, and
   `git diff --check`;
7. update the claim with exact RED/GREEN evidence, audit owned-file scope and
   readability, and commit atomically for fresh dual review.

No live SSD inspection, preview workspace creation, provider transfer, or
human-gate transition is part of this remediation task.

## Task 3 Fourth Review Remediation

The fourth review of remediation commit
`6911a67736c16b34ed43e7e896defdba54d85893` requires a bounded,
test-first authority pass:

1. construct a real portable no-checkpoint workspace whose report event and
   canonical derivative are coherently replaced, and prove recovery rejects it
   without any artifact, ledger-event, or checkpoint write;
2. add a persistence-free report derivation contract over the existing legacy
   inspector, detector/parser, exact selected-file reader, and deterministic
   report builder, using only an ephemeral in-memory ledger;
3. compare recovered canonical report bytes and full event material to the
   independently derived current-source report before recovery can become
   checkpoint-persistent;
4. replace `rev-parse HEAD`-only execution identity with a fixed-cwd,
   fixed-argument, no-shell clean Git check covering staged, unstaged, and all
   untracked material plus a stable verified `HEAD`;
5. prove dirty identity before start, dirty identity between phases, a clean
   changed `HEAD`, and dirty identity after manifest validations all suppress
   the next artifact, ledger, or checkpoint write;
6. retain exact source/destination revalidation adjacency and exact stored-SHA
   equality at every command and pre-write authority boundary;
7. rerun the focused preview suite, seven-file retry boundary, nine-file
   preview boundary, all ingestion tests, ontology/bootstrap plus specialist
   boundary, typecheck, UI build, factory readiness, and `git diff --check`;
8. update durable claim evidence and SDD scratch state, audit owned-file scope,
   and commit atomically for another fresh dual review.

No live SSD inspection, preview workspace creation, provider transfer, or
human-gate transition is part of this remediation task.
