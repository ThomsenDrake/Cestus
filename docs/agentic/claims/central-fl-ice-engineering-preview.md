# Central Florida ICE Legacy Engineering Preview Claim

- Design: `docs/superpowers/specs/2026-07-27-central-fl-ice-engineering-preview-design.md`
- Plan: `docs/superpowers/plans/2026-07-27-central-fl-ice-engineering-preview-implementation.md`
- Mission level: Level 2 bounded feature; dual fresh review required at durable/provenance/human-gate boundaries
- Owner: `/root`
- Branch: `codex/central-fl-ice-engineering-preview`
- Worktree: `/home/drake/Projects/Cestus/.worktrees/central-fl-ice-engineering-preview`
- Exact base: `dc05c43c4b9a592d0396acd034bfc32e177fd09a`
- Status: implementing

## Scope

Deliver the independent Central Florida ICE legacy engineering preview specified in the initiating prompt. Reuse existing portable workspace, importer, ontology bootstrap, evidence triage, and investigation planner contracts. Add only preview-specific development code/tests plus a verifier-only evidence-triage fixture repair.

The Wave 0–5 production program, Task136 runtime-factory/wake-supervisor/bounded-loop files, record 29, production routes, daemons, automatic triggers, accepted graph, pack promotion, PRR send, legal escalation, portal crawl, publication, destructive actions, and other worktrees are outside this claim.

## Safety Identity

- Source: `/mnt/cestus_legacy_ssd/Cestus/central-fl-ice-workspace`
- Source mount: `/dev/sda2` at `/mnt/cestus_legacy_ssd`, APFS
- Required options observed before implementation: `ro,nosuid,nodev,noexec,uid=1000,gid=1000`
- Destination: `/home/drake/.local/share/cestus/previews/central-fl-ice-engineering-preview`
- Destination parent observed before implementation: internal `/dev/nvme0n1p2[/@home]`, Btrfs, read-write
- Initial destination collision: absent
- Source/destination filesystem device IDs: distinct

No destination workspace has been created at claim time.

## Baseline Verification

Command:

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

Result on exact base: 8 files executed, 7 passed and 1 failed; 97 tests executed, 90 passed and 7 failed. All failures are in `evidence-triage-workflow.test.ts` at the same fail-closed `prepareSpecialistRun` check because the fixture does not supply the current mounted production prompt readback witness. Git history shows the witness requirement entered in the mounted preapproval prompt work while this fixture was not updated. No runtime fix has been attempted.

## Durable Transitions

- `claimed`: worktree and exact remote base verified; design, plan, mission level, owned files, gates, and safety identity recorded.
- `implementing`: Task 2 established a test-first, development-only preflight and raw-candidate boundary. The module has no filesystem write port, inspects metadata for the complete selected tree before reading any content, and keeps live SSD and destination access outside unit tests.

## Task 2 Verification

RED:

```text
TMPDIR=/dev/shm npm test -- packages/ingestion/test/central-fl-ice-preview.test.ts
1 failed suite: central-fl-ice-preview module not found; 0 tests collected
```

GREEN:

```text
TMPDIR=/dev/shm npm test -- packages/ingestion/test/central-fl-ice-preview.test.ts
1 file passed; 69 tests passed

TMPDIR=/dev/shm npm test -- packages/ingestion/test
29 files passed; 262 tests passed

TMPDIR=/dev/shm npm run typecheck
passed

TMPDIR=/dev/shm npm run factory:check
factory-readiness passed

git diff --check
passed
```

The preflight binds the fixed source, mount, device, options, file count, destination, mission identities, base SHA, and exact execution SHA. It rejects unsafe mount/destination identity, forbidden metadata classes, ZIP containers, path ambiguity, symlinks, special files, nested mount crossings, count mismatch, and source mutation before any caller can persist the result. Stable candidate material preserves distinct duplicate occurrences plus explicit current, archived, and superseded status. Safe `.gitignore`, `.gitmodules`, and topical token/auth analysis filenames remain eligible; actual credential-like material is rejected without being opened or hashed.

Fresh review round 1 required four corrections. The immutable production entry point no longer accepts a policy override; full required read-only mount posture is rechecked per traversed path and before/after every content read; common credential dotfiles, credential directories, key containers, provider-token names, and backup forms are rejected using metadata only while topical prose remains eligible; and mount-option provenance arrays are deeply frozen. Each correction received a focused failing test before implementation. The same fresh reviewer independently reran the focused suite (49/49) and approved the scoped round-2 re-review with all four findings resolved.

A second independent review of commit `429277af` found three additional adversarial boundary defects: common cache/dependency/build trees were under-classified, `codeSha` could be read twice through an accessor, and a reused mutable mount record could alias the initial authority. Test-first remediation added 13 focused failures, then added two more focused failures for nested `.cargo` and mutable `lstat` aliases after proactive boundary review. The implementation now rejects the approved cache/dependency/build tree classes using metadata only; snapshots `codeSha` once from an exact plain own-data input; snapshots every mount record, option array, and path-metadata record as deep frozen plain data; and compares separately normalized later mount records to both fixed policy and the immutable initial snapshot.

## Owned Files

- `docs/superpowers/specs/2026-07-27-central-fl-ice-engineering-preview-design.md`
- `docs/superpowers/plans/2026-07-27-central-fl-ice-engineering-preview-implementation.md`
- `docs/agentic/claims/central-fl-ice-engineering-preview.md`
- `packages/ingestion/src/central-fl-ice-preview.ts`
- `packages/ingestion/src/central-fl-ice-preview-cli.ts`
- `packages/ingestion/src/local-filesystem.ts` (exact selected-file safety seam)
- `packages/ingestion/src/legacy-inspector.ts` (exact selected-file safety seam)
- `packages/ingestion/src/legacy-runtime.ts` (exact selected-file safety seam)
- `packages/ingestion/src/runtime.ts` (exact selected-file safety seam)
- `packages/ingestion/src/source-materializer.ts` (exact selected-file safety seam)
- `packages/ingestion/src/import-service.ts` (exact retry seam)
- `packages/ingestion/src/legacy-report.ts` (exact retry seam)
- `packages/ingestion/src/legacy-staging.ts` (exact retry seam and stable proposal identity)
- `packages/ontology/src/assertion-service.ts` (proposal-only exact retry seam)
- `packages/ingestion/test/central-fl-ice-preview.test.ts`
- `packages/ingestion/test/legacy-runtime.test.ts` (portable crash/retry verification)
- `packages/ingestion/test/local-filesystem.test.ts` (partial scan retry verification)
- `packages/agent/test/evidence-triage-workflow.test.ts` (verifier-only fixture edit)

## Task 3 Candidate Verification

RED:

```text
TMPDIR=/dev/shm npm test -- packages/ingestion/test/central-fl-ice-preview.test.ts
69 existing preview tests passed; the new workflow import failed because
createCentralFloridaIcePreviewWorkflow did not exist.
```

GREEN:

```text
TMPDIR=/dev/shm npm test -- packages/ingestion/test/central-fl-ice-preview.test.ts
1 file passed; 87 tests passed

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
9 files passed; 184 tests passed

TMPDIR=/dev/shm npm test -- packages/ingestion/test
29 files passed; 280 tests passed

TMPDIR=/dev/shm npm run typecheck
passed

TMPDIR=/dev/shm npm run factory:check
factory-readiness passed

git diff --check
passed
```

The candidate composes the existing portable workspace, legacy runtime, ontology-bootstrap dossier builder, derivative/blob stores, and rebuildable projections behind an isolated development-only CLI. Hash-chained checkpoints enforce exact phase/command transitions and reject chain, filename, hash, or schema drift. The raw-import and staging gates require explicit secret-safe human actor identities; the staging command accepts only an explicit unique subset of the exact previewed candidate IDs.

The 136-file preflight selection is threaded through the scanner, detector, parser, and raw materializer as normalized immutable own-data records. Selected bytes are opened with `O_NOFOLLOW` and validated against device, inode, size, and content hash. Selection-mode components never enumerate the source root or fall back to an unbound path read, and public runtime selection getters are snapshotted once. The workflow revalidates source bytes, mount posture, destination authority, code SHA, and candidate hash before and after durable effects.

The event boundary is an explicit allowlist. It permits only the existing evidence-first legacy/import/proposal event families needed by this preview and rejects accepted graph mutation, PRR/request sends, legal escalation, publication, provider approval, tool completion, and destructive effects. Repository-approved provider byte-transfer and mounted prompt authority are not exposed on the current `neo` runtime boundary, so handoff records the required safe resumable blocker and persists only deterministic local gaps, next actions, uncertainty, dependencies, risk notes, and unsent task/PRR drafts. No provider acceptance is fabricated.

Task 3 is a verified implementer candidate pending the mission-required dual fresh review. The preview mission remains `implementing`; no live source inspection or destination workspace creation has occurred.

## Task 3 Review Rejection and Remediation Candidate

The first dual-review round rejected commit
`c1c28954253ddb416beed7dcb4b4d3c594834156`. The remediation is deliberately
limited to preview composition and exact retry behavior in existing services;
it does not add a second ledger, storage, ontology, provider, or runtime
implementation.

RED evidence:

```text
Focused remediation additions: 8 failed, 87 passed.
Later receipt/no-checkpoint fixture boundary: 19 failed, 85 passed; all 19
shared one test-fixture initialization defect, corrected before rerun.
Typecheck boundary: 3 errors (scanner hash argument, checkpoint fixture schema,
portable close typing), all corrected before rerun.
```

Current GREEN evidence:

```text
TMPDIR=/dev/shm npm test -- packages/ingestion/test/central-fl-ice-preview.test.ts
1 file passed; 104 tests passed

TMPDIR=/dev/shm npm test -- \
  packages/ingestion/test/central-fl-ice-preview.test.ts \
  packages/ingestion/test/legacy-runtime.test.ts \
  packages/ingestion/test/local-filesystem.test.ts \
  packages/ingestion/test/legacy-report.test.ts \
  packages/ingestion/test/import-service.test.ts \
  packages/ingestion/test/legacy-staging.test.ts \
  packages/ontology/test/assertion-service.test.ts
7 files passed; 177 tests passed

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
9 files passed; 204 tests passed

TMPDIR=/dev/shm npm test -- packages/ingestion/test
29 files passed; 301 tests passed

TMPDIR=/dev/shm npm test -- \
  packages/ontology/test \
  packages/ontology-bootstrap/test \
  packages/agent/test/evidence-triage-workflow.test.ts \
  packages/agent/test/investigation-planner-workflow.test.ts
28 files passed; 456 tests passed

TMPDIR=/dev/shm npm run typecheck
passed

TMPDIR=/dev/shm npm run ui:build
passed; 165 modules transformed (existing chunk-size advisory only)

TMPDIR=/dev/shm npm run factory:check
factory-readiness passed

git diff --check
passed
```

The remediation rechecks authority immediately before creation; reconciles
exact scan/report/approval/import/staging/proposal effects after real portable
runtime crashes; uses ledger readback for approval, proposal, event, inventory,
and count authority; rejects read-side ledger deltas; binds Gate 2 to the full
stored artifact; hardens checkpoint phase/provenance validation; and only
recovers a no-checkpoint destination whose workspace identity and complete
inspection ledger match exactly.

The final manifest records exact scanner inventory, human approval IDs and
actors, selected staging IDs, CLI argument receipts, and hard-coded validation
receipts. Provider unavailability is resumable only through a fresh approved
provider mission and exposes no fake next command. The ontology service edit is
strictly exact-match proposal retry idempotence; evidence-event causation and
proposal-only semantics are unchanged.

This remains an implementer remediation candidate pending both required fresh
reviews. No live source inspection or destination workspace creation has
occurred.

## Task 3 Second Review Rejection and Remediation

The second dual-review round rejected remediation commit
`dcf6a1a3cffdd2feb71dde3849119cebc5aeebf4` on five bounded reconciliation
defects: Gate 1 did not prove the exact raw phase effect set, Gate 2 could ignore
an extra proposal outside the approved subset, no-checkpoint recovery could
adopt foreign allowed-type inspection events, the pre-create check was not an
immediate destination-only check, and explicit `approvedAt` retry material was
not compared.

RED evidence was established before implementation:

```text
TMPDIR=/dev/shm npm test -- \
  packages/ingestion/test/central-fl-ice-preview.test.ts \
  packages/ingestion/test/import-service.test.ts
2 files failed; 10 tests failed and 111 passed
```

The ten failures covered destination drift between the final source scan and
workspace creation; six Gate 1 effect-set mutations; an extra Gate 2 proposal;
a foreign allowed-type event in an actual portable no-checkpoint workspace; and
an explicit import approval timestamp mismatch. A complementary portable
corruption test now proves a missing expected inspection event also fails
closed.

Current GREEN evidence:

```text
TMPDIR=/dev/shm npm test -- \
  packages/ingestion/test/central-fl-ice-preview.test.ts \
  packages/ingestion/test/legacy-runtime.test.ts \
  packages/ingestion/test/local-filesystem.test.ts \
  packages/ingestion/test/legacy-report.test.ts \
  packages/ingestion/test/import-service.test.ts \
  packages/ingestion/test/legacy-staging.test.ts \
  packages/ontology/test/assertion-service.test.ts
7 files passed; 188 tests passed

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
9 files passed; 214 tests passed

TMPDIR=/dev/shm npm test -- packages/ingestion/test
29 files passed; 312 tests passed

TMPDIR=/dev/shm npm test -- \
  packages/ontology/test \
  packages/ontology-bootstrap/test \
  packages/agent/test/evidence-triage-workflow.test.ts \
  packages/agent/test/investigation-planner-workflow.test.ts
28 files passed; 456 tests passed

TMPDIR=/dev/shm npm run typecheck
passed

TMPDIR=/dev/shm npm run ui:build
passed; 165 modules transformed (existing chunk-size advisory only)

TMPDIR=/dev/shm npm run factory:check
factory-readiness passed

git diff --check
passed
```

The full inspection ledger count now includes every workspace event and rejects
both missing and extra expected-type events before runtime or checkpoint
writes. Gate 1 and Gate 2 compare canonical exact phase sets rather than
allowlisted subsets or ledger order. A destination-only authority port runs
immediately before first creation with no intervening source inventory work,
and `IngestionImportService` compares caller-supplied approval timestamps
directly.

This remains `implementing` pending the required fresh reviews. No live source
inspection or destination workspace creation has occurred.

## Task 3 Third Review Rejection and Remediation

The third dual-review round rejected remediation commit
`7a5f820f68907ee88d0c09384b9bf334c683e819` because phase counts and selected
identifiers did not prove the full committed event material. Gate 1 could admit
same-count foreign approval, evidence, link, parse, or completion effects;
Gate 2 could admit wrong approval batch/stream/version or proposal stream
material; no-checkpoint recovery did not compare all deterministic inspection
fields; and stale-source retry did not reconcile the exact safe diagnostic.

RED evidence was established before implementation:

```text
TMPDIR=/dev/shm npm test -- \
  packages/ingestion/test/central-fl-ice-preview.test.ts
1 file failed; 12 tests failed and 116 passed
```

The twelve failures covered five Gate 1 same-count substitutions, two Gate 2
same-count substitutions that were not already rejected, four portable
no-checkpoint inspection replacements, and an exact-byte stale-source retry.
Additional assertions cover already-rejected wrong Gate 2 batch/stream
material and arbitrary diagnostic substitution.

Current GREEN evidence:

```text
TMPDIR=/dev/shm npm test -- \
  packages/ingestion/test/central-fl-ice-preview.test.ts
1 file passed; 129 tests passed

TMPDIR=/dev/shm npm test -- \
  packages/ingestion/test/central-fl-ice-preview.test.ts \
  packages/ingestion/test/legacy-runtime.test.ts \
  packages/ingestion/test/local-filesystem.test.ts \
  packages/ingestion/test/legacy-report.test.ts \
  packages/ingestion/test/import-service.test.ts \
  packages/ingestion/test/legacy-staging.test.ts \
  packages/ontology/test/assertion-service.test.ts
7 files passed; 203 tests passed

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
9 files passed; 229 tests passed

TMPDIR=/dev/shm npm test -- packages/ingestion/test
29 files passed; 327 tests passed

TMPDIR=/dev/shm npm test -- \
  packages/ontology/test \
  packages/ontology-bootstrap/test \
  packages/agent/test/evidence-triage-workflow.test.ts \
  packages/agent/test/investigation-planner-workflow.test.ts
28 files passed; 456 tests passed

TMPDIR=/dev/shm npm run typecheck
passed

TMPDIR=/dev/shm npm run ui:build
passed; 165 modules transformed (existing chunk-size advisory only)

TMPDIR=/dev/shm npm run factory:check
factory-readiness passed

git diff --check
passed
```

The shared canonical comparator now binds type/version, stream/sequence,
actor/causation/correlation, core and pack versions, and full deterministic
payload material. The no-checkpoint path also validates the canonical report
artifact before it may persist any checkpoint. Only exact source-change
diagnostics emitted by the import contract are accepted, their event IDs remain
in phase provenance, and restored approved bytes can resume import without
weakening approval authority.

This remains `implementing` pending the required fresh reviews. No live source
inspection or destination workspace creation has occurred.

## Task 3 Fourth Review Rejection and Remediation

The fourth dual-review round rejected remediation commit
`6911a67736c16b34ed43e7e896defdba54d85893` on two authority defects.
No-checkpoint recovery used recovered report material as its own expectation,
so a coordinated foreign report event and derivative could pass initial
recognition and reach writes. Execution identity proved only `HEAD`, so dirty
tracked or untracked state was not rejected independently of source
inspection, and test seams could bypass SHA checks between phases.

RED evidence was established before implementation:

```text
TMPDIR=/dev/shm npm test -- \
  packages/ingestion/test/central-fl-ice-preview.test.ts
1 file failed; 5 tests failed and 129 passed
```

The five failures covered dirty identity before inspection, dirty identity
between phases, a clean changed `HEAD`, dirty identity after manifest
validations, and a coordinated foreign report event plus matching canonical
derivative that reached an `inspection-blocked` write.

Current GREEN evidence:

```text
TMPDIR=/dev/shm npm test -- \
  packages/ingestion/test/central-fl-ice-preview.test.ts
1 file passed; 134 tests passed

TMPDIR=/dev/shm npm test -- \
  packages/ingestion/test/central-fl-ice-preview.test.ts \
  packages/ingestion/test/legacy-runtime.test.ts \
  packages/ingestion/test/local-filesystem.test.ts \
  packages/ingestion/test/legacy-report.test.ts \
  packages/ingestion/test/import-service.test.ts \
  packages/ingestion/test/legacy-staging.test.ts \
  packages/ontology/test/assertion-service.test.ts
7 files passed; 208 tests passed

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
9 files passed; 234 tests passed

TMPDIR=/dev/shm npm test -- packages/ingestion/test
29 files passed; 332 tests passed

TMPDIR=/dev/shm npm test -- \
  packages/ontology/test \
  packages/ontology-bootstrap/test \
  packages/agent/test/evidence-triage-workflow.test.ts \
  packages/agent/test/investigation-planner-workflow.test.ts
28 files passed; 456 tests passed

TMPDIR=/dev/shm npm run typecheck
passed

TMPDIR=/dev/shm npm run ui:build
passed; 165 modules transformed (existing chunk-size advisory only)

TMPDIR=/dev/shm npm run factory:check
factory-readiness passed

git diff --check
passed
```

The new read-only derivation accepts no mounted or persistent workspace
capability. It uses exact selected-file reads and an ephemeral ledger, then the
existing deterministic report builder. Recovery compares its full canonical
artifact bytes and event envelope before enabling checkpoint persistence.
Clean Git identity now includes staged, unstaged, and all untracked state plus
a stable verified `HEAD`, using only fixed repository-local `git` invocations
whose output is never included in errors. Every command and existing pre-write
authority check binds that clean current SHA to durable checkpoint state.

This remains `implementing` pending the required fresh reviews. No live source
inspection or destination workspace creation has occurred.

## Task 3 Fifth Review Rejection and Remediation

The fifth review rejected remediation commit
`ae50d3c8328f604f5dd6d682683670c36b6b0382` because the production Git
subprocess inherited caller-controlled process state. A clean alternate
repository supplied through Git repository/worktree variables could replace
the intended execution identity, while inherited configuration, tracing, and
`PATH` remained outside the fixed-command authority boundary.

RED evidence was established before implementation:

```text
TMPDIR=/dev/shm npm test -- \
  packages/ingestion/test/central-fl-ice-preview.test.ts
1 file failed; 1 test failed and 134 passed
```

The production-subprocess regression supplied hostile `GIT_DIR`,
`GIT_WORK_TREE`, global configuration, tracing, and a `PATH` wrapper for a
separate clean repository. The pre-remediation workflow accepted that
repository's SHA and completed, so the expected fail-closed error was absent.

Current GREEN evidence:

```text
TMPDIR=/dev/shm npm test -- \
  packages/ingestion/test/central-fl-ice-preview.test.ts
1 file passed; 135 tests passed

TMPDIR=/dev/shm npm test -- \
  packages/ingestion/test/central-fl-ice-preview.test.ts \
  packages/ingestion/test/legacy-runtime.test.ts \
  packages/ingestion/test/local-filesystem.test.ts \
  packages/ingestion/test/legacy-report.test.ts \
  packages/ingestion/test/import-service.test.ts \
  packages/ingestion/test/legacy-staging.test.ts \
  packages/ontology/test/assertion-service.test.ts
7 files passed; 209 tests passed

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
9 files passed; 235 tests passed

TMPDIR=/dev/shm npm test -- packages/ingestion/test
29 files passed; 333 tests passed

TMPDIR=/dev/shm npm test -- \
  packages/ontology/test \
  packages/ontology-bootstrap/test \
  packages/agent/test/evidence-triage-workflow.test.ts \
  packages/agent/test/investigation-planner-workflow.test.ts
28 files passed; 456 tests passed

TMPDIR=/dev/shm npm run typecheck
passed

TMPDIR=/dev/shm npm run ui:build
passed; 165 modules transformed (existing chunk-size advisory only)

TMPDIR=/dev/shm npm run factory:check
factory-readiness passed

git diff --check
passed
```

Production now invokes only `/usr/bin/git` with fixed arguments, fixed
canonical repository working directory, no shell, and an exact minimal
environment built without caller process state. System and global
configuration are disabled, locale and optional-lock behavior are fixed, and
repository/worktree/object/alternate/configuration/tracing/`PATH` variables
are not inherited. Before status and stable-`HEAD` checks, Git must confirm an
inside-worktree context whose canonical top-level path equals the intended
preview worktree root exactly. Failures remain generic and contain no command
output.

The hostile alternate repository is no longer accepted, its trace destination
is untouched, and the workflow creates no workspace, event, or checkpoint.
This remains `implementing` pending the required fresh reviews. No live source
inspection, destination workspace creation, provider transfer, or approval
transition has occurred.

## Gate 1 Raw-Import Media-Type Reconciliation

The approved Gate 1 runtime reached the existing portable import service, but
strict authoritative readback rejected the effects before a
`staging-preview-required` checkpoint could be persisted. Coordinator-side
read-only comparison found 86 exact media-type substitutions and no
content-hash or size substitutions:

- 79 approved Markdown candidates were materialized as
  `application/octet-stream`;
- 7 approved octet-stream PDF candidates were materialized as
  `application/pdf`.

The implementation agent did not access the live source, canonical preview
workspace, or preserved failed workspace. The repair was reproduced entirely
with temporary portable workspaces.

RED evidence was established before production edits:

```text
TMPDIR=/dev/shm npm test -- \
  packages/ingestion/test/central-fl-ice-preview.test.ts \
  -t 'multi-candidate'
1 file failed; 2 tests failed and 134 skipped.
Both actual portable-runtime flows stopped at
`legacy migration report does not bind the exact preflight candidate bytes`.

TMPDIR=/dev/shm npm test -- packages/ingestion/test/media-type.test.ts
1 suite failed before collection because the shared classifier module did not
exist.
```

Current GREEN evidence:

```text
TMPDIR=/dev/shm npm test -- \
  packages/ingestion/test/central-fl-ice-preview.test.ts \
  packages/ingestion/test/media-type.test.ts
2 files passed; 147 tests passed

TMPDIR=/dev/shm npm test -- \
  packages/ingestion/test/central-fl-ice-preview.test.ts \
  packages/ingestion/test/media-type.test.ts \
  packages/ingestion/test/legacy-runtime.test.ts \
  packages/ingestion/test/local-filesystem.test.ts \
  packages/ingestion/test/legacy-report.test.ts \
  packages/ingestion/test/import-service.test.ts \
  packages/ingestion/test/legacy-staging.test.ts \
  packages/ontology/test/assertion-service.test.ts
8 files passed; 221 tests passed

TMPDIR=/dev/shm npm test -- \
  packages/ingestion/test/central-fl-ice-preview.test.ts \
  packages/ingestion/test/media-type.test.ts \
  packages/ingestion/test/legacy-inspector.test.ts \
  packages/ingestion/test/legacy-report.test.ts \
  packages/ingestion/test/legacy-runtime.test.ts \
  packages/ingestion/test/legacy-staging.test.ts \
  packages/ontology-bootstrap/test/dossier-builder.test.ts \
  packages/ontology-bootstrap/test/fake-runtime.test.ts \
  packages/agent/test/evidence-triage-workflow.test.ts \
  packages/agent/test/investigation-planner-workflow.test.ts
10 files passed; 247 tests passed

TMPDIR=/dev/shm npm test -- packages/ingestion/test
30 files passed; 345 tests passed

TMPDIR=/dev/shm npm test -- \
  packages/ontology/test \
  packages/ontology-bootstrap/test \
  packages/agent/test/evidence-triage-workflow.test.ts \
  packages/agent/test/investigation-planner-workflow.test.ts
28 files passed; 456 tests passed

TMPDIR=/dev/shm npm run typecheck
passed

TMPDIR=/dev/shm npm run ui:build
passed; 165 modules transformed (existing externalization and chunk-size
advisories only)

TMPDIR=/dev/shm npm run factory:check
factory-readiness passed

git diff --check
passed
```

One ingestion-local classifier now supplies the preview preflight, legacy
inspector/detector inputs, and source materializer. It preserves the union of
existing JSON, Markdown, YAML, CSV, text, HTML, PDF, and octet-stream mappings.
The portable regression imports JSON, Markdown, and PDF candidates with exact
candidate/evidence media equality, observes the existing approval →
evidence/link groups → completion → parse-job runtime order, and proves retry
after checkpoint failure appends no duplicate events or blobs.

Canonical event comparison remains strict and canonical-set based. This repair
changes the clean code SHA and changes PDF candidate media material, so the
previous Gate 1 candidate-set hash and approval are superseded. Live execution
must preserve the failed workspace, repeat inspection, and stop at a fresh
human raw-import gate. The mission remains `implementing` pending fresh dual
review of this repair.

## Gate 2 Empty Eligible Staging Correction

The refreshed evidence import exposed a valid zero-candidate ontology staging
decision. The implementation agent did not access the live source, canonical
preview workspace, or preserved workspaces.

RED evidence preceded every production edit:

```text
TMPDIR=/dev/shm npm test -- \
  packages/ontology-bootstrap/test/tool-previews.test.ts \
  packages/ingestion/test/legacy-runtime.test.ts \
  packages/ingestion/test/central-fl-ice-preview.test.ts
3 files failed; 3 tests failed and 163 passed.
```

The failures proved that the direct preview CLI required at least one candidate,
the legacy runtime rejected an empty eligible selection, and ontology-bootstrap
previews rejected a report with zero candidates.

Self-review then extended the portable test through durable checkpoint readback
and handoff. Before the receipt validator changed, that exact test failed while
136 unrelated preview tests were skipped because the six-argument empty-stage
receipt did not satisfy the older eight-argument minimum. After the validator
accepted approval plus zero or more candidate pairs, the same focused test
passed and handoff reached `replay-verification-required`.

Focused GREEN evidence:

```text
TMPDIR=/dev/shm npm test -- \
  packages/ontology-bootstrap/test/tool-previews.test.ts \
  packages/ingestion/test/legacy-staging.test.ts \
  packages/ingestion/test/legacy-runtime.test.ts \
  packages/ingestion/test/central-fl-ice-preview.test.ts
4 files passed; 176 tests passed.
```

Broader GREEN evidence:

```text
TMPDIR=/dev/shm npm test -- packages/ingestion/test packages/ontology-bootstrap/test
35 files passed; 373 tests passed.

TMPDIR=/dev/shm npm test -- \
  packages/ingestion/test/central-fl-ice-preview.test.ts \
  packages/ingestion/test/legacy-inspector.test.ts \
  packages/ingestion/test/legacy-report.test.ts \
  packages/ingestion/test/legacy-runtime.test.ts \
  packages/ingestion/test/legacy-staging.test.ts \
  packages/ontology-bootstrap/test/dossier-builder.test.ts \
  packages/ontology-bootstrap/test/fake-runtime.test.ts \
  packages/ontology-bootstrap/test/tool-previews.test.ts \
  packages/agent/test/evidence-triage-workflow.test.ts \
  packages/agent/test/investigation-planner-workflow.test.ts
10 files passed; 248 tests passed.

TMPDIR=/dev/shm npm run typecheck
typecheck passed.

TMPDIR=/dev/shm npm run ui:build
165 modules transformed; build passed with existing externalization and
chunk-size advisories only.

TMPDIR=/dev/shm npm run factory:check
factory-readiness passed.

git diff --check
passed.
```

The first typecheck found two test-only readonly-union narrowing errors. The
fixtures were corrected without changing production behavior; the focused
176-test set and typecheck then passed.

The real temporary portable-workspace regression completes inspect, raw import,
and staging preview with no eligible candidates; executes
`stage --approved-by actor_human_preview` with no candidate options; records one
human `legacy.ontology.staging.approved` event with an empty approved set;
records zero proposals; reaches `handoff-required`; and reconciles a retry after
an injected checkpoint failure without duplicate events. Nonempty reports still
reject an empty selection. Accepted graph state, provider behavior, production
activation, request sends, legal gates, and fallback-write policy are unchanged.

Fresh quality review rejected the first empty-staging candidate because a
hash-valid later checkpoint could pair a nonempty eligible set with an empty
approval, and handoff/replay did not independently re-prove the stored Gate 2
authority before writes.

Remediation RED:

```text
TMPDIR=/dev/shm npm test -- packages/ingestion/test/central-fl-ice-preview.test.ts \
  -t "hash-valid empty approval|blocks handoff before writes|blocks replay before writes"
1 file failed; 5 tests failed, 1 test passed, 137 tests skipped.
```

The five failures showed that the file checkpoint store accepted the
cross-field-inconsistent empty approval and that handoff/replay continued after
approval-actor corruption, an injected proposal, corrupted staging-preview
bytes, or corrupted persisted authority. The already-fail-closed coherent
report-replacement case was the one passing adversarial test.

Remediation GREEN:

```text
TMPDIR=/dev/shm npm test -- packages/ingestion/test/central-fl-ice-preview.test.ts \
  -t "hash-valid empty approval|blocks handoff before writes|blocks replay before writes"
1 file passed; 6 tests passed, 137 tests skipped.

TMPDIR=/dev/shm npm test -- \
  packages/ontology-bootstrap/test/tool-previews.test.ts \
  packages/ingestion/test/legacy-staging.test.ts \
  packages/ingestion/test/legacy-runtime.test.ts \
  packages/ingestion/test/central-fl-ice-preview.test.ts
4 files passed; 182 tests passed.

TMPDIR=/dev/shm npm test -- packages/ingestion/test packages/ontology-bootstrap/test
35 files passed; 379 tests passed.

TMPDIR=/dev/shm npm test -- \
  packages/ingestion/test/central-fl-ice-preview.test.ts \
  packages/ingestion/test/legacy-inspector.test.ts \
  packages/ingestion/test/legacy-report.test.ts \
  packages/ingestion/test/legacy-runtime.test.ts \
  packages/ingestion/test/legacy-staging.test.ts \
  packages/ontology-bootstrap/test/dossier-builder.test.ts \
  packages/ontology-bootstrap/test/fake-runtime.test.ts \
  packages/ontology-bootstrap/test/tool-previews.test.ts \
  packages/agent/test/evidence-triage-workflow.test.ts \
  packages/agent/test/investigation-planner-workflow.test.ts
10 files passed; 254 tests passed.

TMPDIR=/dev/shm npm run typecheck
typecheck passed.

TMPDIR=/dev/shm npm run ui:build
165 modules transformed; build passed with existing externalization and
chunk-size advisories only.

TMPDIR=/dev/shm npm run factory:check
factory-readiness passed.

git diff --check
passed.
```

The repaired checkpoint validator rejects inconsistent eligible, approved, and
proposed sets and their counts during both append and reconstruction. Handoff
and replay now re-read the current report and stored staging preview and
reconcile the exact approval and proposal effects from the ledger before any
artifact or checkpoint write. Portable adversarial tests prove zero-write
failure for corrupted approval identity, forged proposals, staging-preview
bytes, and report authority. No live source or preview workspace was accessed.
