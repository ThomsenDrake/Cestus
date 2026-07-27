# Central Florida ICE Legacy Engineering Preview Design

**Date:** 2026-07-27
**Status:** Approved by the initiating prompt; implementation may proceed without another design gate
**Branch:** `codex/central-fl-ice-engineering-preview`
**Base:** exact remote-advertised `origin/neo` at `dc05c43c4b9a592d0396acd034bfc32e177fd09a`

## Purpose

Deliver a supervised, evidence-first engineering preview for the selected Central Florida ICE legacy investigation within an eight-hour target. The preview is an independent bounded lane. It does not alter, advance, or make claims about the Wave 0–5 production program, Task136, record 29, repository closure, production readiness, or release.

The preview reuses the existing portable workspace, append-only ledger, legacy importer, ontology bootstrap, evidence triage, and investigation planner contracts. It adds only a development-only guard/orchestration layer and focused tests.

## Fixed Inputs and Destination

- Legacy source root: `/mnt/cestus_legacy_ssd/Cestus/central-fl-ice-workspace`
- Expected source device: `/dev/sda2`
- Expected mount target: `/mnt/cestus_legacy_ssd`
- Expected filesystem: APFS
- Required mount options: `ro,nosuid,nodev,noexec,uid=1000,gid=1000`
- Expected selected top-level source-file count: 136 regular files before any archive expansion
- Expected approximate selected bytes: 36 MB; the exact inspection count and byte total are authoritative
- Preview workspace: `/home/drake/.local/share/cestus/previews/central-fl-ice-engineering-preview`
- Preview workspace ID: `ws_central_fl_ice_preview`
- Source collection ID: `src_central_fl_ice_legacy`
- Scan batch ID: `scan_central_fl_ice_preview_001`
- Import batch ID: `imp_central_fl_ice_preview_001`
- Staging batch ID: `legacy_stage_central_fl_ice_preview_001`

The destination was resolved before creation. It does not currently exist, is outside `/mnt/cestus_legacy_ssd`, and its nearest existing parent is on internal `/dev/nvme0n1p2[/@home]`, Btrfs, read-write. The source and destination have distinct filesystem device IDs. The runner must repeat these checks immediately before any destination write.

## Mission Level

This is a **Level 2 bounded feature mission** under `software-factory-mission-state.v1`.

Rationale:

- The implementation is a focused development-only supervised preview runner over existing contracts.
- It persists durable evidence, provenance, and replayable local state.
- It contains two human approval gates and later permits an already configured provider to receive audited safe summaries.
- It has no production routing, daemon, automatic trigger, accepted graph mutation, external request send, publication, or destructive behavior.

The mission therefore requires:

- one owner and compact durable claim state;
- test or exact reproduction before behavior changes;
- focused cross-boundary validation;
- atomic commits;
- a fresh review;
- dual independent review for the durable-state, provenance/projection, secret-safety, human-gate, and possible external-provider boundaries.

Level 3 is intentionally not selected because this lane is not a broad production milestone, live cross-service release, or Wave 0–5 integration program.

## Safety Boundary

The runner fails closed before reading file contents unless all of the following are true:

1. the source root resolves exactly to the approved path;
2. `findmnt` identifies `/dev/sda2` mounted at `/mnt/cestus_legacy_ssd` as APFS;
3. every required mount option is present;
4. the source root is a real directory on that mounted filesystem;
5. no path traversal, symlink, special file, or mount crossing is present in the selected tree;
6. the selected tree contains exactly 136 regular source files;
7. no forbidden path or file classification is present;
8. the destination resolves outside the SSD mount, is collision-free on first creation, and its existing parent is on a different, read-write device.

Forbidden material is detected using names and metadata only and is never opened, copied, hashed, logged, or sent:

- `.env` and environment-secret variants;
- credential, secret, token, private-key, and authentication files;
- `.git` and Git objects;
- other workspaces;
- caches;
- virtual environments;
- dependency trees;
- build, coverage, distribution, generated, and output trees;
- archive containers, because the existing scanner expands ZIP members and the approved selection is limited to the 136 source files.

If forbidden or unsafe material is detected, the runner emits only a secret-safe path classification and stops before the existing legacy inspector is called. It never traverses outside the selected source root and never writes to the SSD.

## Evidence-First Classification

The exact inspection result is transformed into a deterministic raw-import candidate manifest:

- every selected regular file has normalized source path, occurrence ID, SHA-256 content hash, media type, size, scan status, and preservation status;
- duplicate content remains represented as a distinct occurrence;
- paths explicitly denoting archived or superseded material receive preservation status `archived` or `superseded` while retaining their occurrence and hash;
- other occurrences receive preservation status `current`;
- unsupported, malformed, ambiguous, stale, unsafe, or conflicting ontology material remains evidence and is quarantined from ontology staging through existing report/quarantine contracts;
- no legacy structure becomes accepted ontology truth.

The raw candidate-set hash is SHA-256 over stable JSON containing the exact ordered candidate records and exclusions. The candidate manifest, migration report, source identity, code SHA, commands, and validation results are written only to the internal preview workspace.

## Supervised State Machine

### Phase A: Deterministic inspection

1. Repeat source and destination preflight.
2. Create the empty portable preview workspace on the internal disk.
3. Invoke the existing legacy inspector/runtime against only the approved source root.
4. Persist the migration report, quarantine view, exact raw candidate manifest, and inspection manifest.
5. Verify that inspection appends no evidence imports, staging approvals, proposed assertions, accepted assertions, accepted graph mutations, PRR sends, legal escalations, publications, or destructive effects.
6. Stop at the raw-import gate.

### Gate 1: Human raw-import approval

Present:

- destination workspace;
- source device/mount identity;
- exact raw candidate list artifact;
- candidate-set hash;
- file, byte, duplicate, archive, superseded, excluded, and quarantine counts;
- report and inventory hashes;
- known limitations and deterministic validation evidence.

No `ingestion.import.approved` event or evidence blob write occurs before explicit human approval in this task.

### Phase B: Evidence import and ontology preview

After raw-import approval:

1. revalidate source identity, mount posture, and candidate-set hash;
2. invoke the existing raw-import approval and import contracts;
3. verify every imported evidence item has source-path, occurrence, content-hash, and provenance bindings;
4. build the ontology-bootstrap dossier from imported evidence and audited safe summaries;
5. produce the exact evidence-bound staging preview and candidate-set hash;
6. stop at the ontology staging gate.

Provider use is optional and bounded to audited safe summaries through the existing provider byte-transfer contract. If repository-approved provider readiness or mounted prompt authority is unavailable, the preview records a secret-safe resumable blocker and continues the deterministic local path. It never inspects, prints, copies, or requests authentication material and never fabricates provider acceptance.

### Gate 2: Human ontology staging approval

Present:

- exact candidate IDs and evidence bindings;
- report ID and report hash;
- staging candidate-set hash;
- quarantines, exclusions, uncertainty, and unresolved references;
- the exact approval command that will bind the approved subset.

No staging approval or assertion proposal occurs before explicit human approval in this task.

### Phase C: Proposed assertions and handoff

After staging approval:

1. invoke the existing staging service for only the approved candidate IDs;
2. verify that every new ontology event is `assertion.proposed` and evidence-bound;
3. run limited supervised evidence triage and investigation planning when current mounted authority and provider readiness are available;
4. otherwise record safe resumable blockers and produce deterministic local gap/plan artifacts without fabricated provider output;
5. persist a durable handoff with prioritized evidence gaps, investigative actions, uncertainty, dependencies, risk notes, and draft task/PRR candidates;
6. do not send any request;
7. close and remount the preview workspace, rebuild projections, and prove ledger, evidence, proposals, and handoff reconstruct;
8. persist a final manifest containing exact code SHA, source identity, hashes, event/artifact IDs, counts, commands, validations, limitations, and unresolved defects.

## Development-Only Interface

The preview runner is invoked directly with `tsx`; it is not exported as a production route and is not registered with a daemon or scheduler.

Commands:

- `inspect`
- `raw-import --approved-by <human-id>`
- `staging-preview`
- `stage --approved-by <human-id> --candidate <id>...`
- `handoff`
- `verify-replay`
- `manifest`

Each command checks the durable preview manifest and permits only the next valid supervised transition. Approval identity is an explicit command input and is bound through existing approval events.

## Verification

Focused deterministic verification covers:

- exact mount/device/options matching and every fail-closed mismatch;
- destination separation and collision handling;
- forbidden-name detection without content reads;
- symlink, special-file, mount-crossing, count, and archive rejection;
- stable raw candidate ordering and hashing;
- archive/superseded occurrence preservation status;
- no writes before preflight completion;
- no import before raw approval;
- no proposed assertion before staging approval;
- no accepted graph, PRR send, legal, publication, or destructive events;
- restart/remount projection reconstruction;
- existing importer, ontology-bootstrap, evidence-triage, and planner focused tests.

Baseline note: exact `origin/neo` currently has seven failing evidence-triage workflow tests because their fixture does not supply the mounted production prompt readback witness required by the current specialist kernel. The kernel’s fail-closed behavior is correct; the preview includes a narrowly scoped test-fixture repair and records the original failure in the final manifest.

## Explicit Non-Goals

- no edits to Task136 runtime-factory, wake-supervisor, or bounded-loop files;
- no production route, daemon, scheduler, or automatic trigger;
- no ontology-pack promotion or accepted graph mutation;
- no PRR send, legal escalation, portal crawl, or publication;
- no raw document export;
- no SSD write;
- no Wave 0–5 registry lifecycle change;
- no merge into `neo`, PR creation, or release claim.

## Candidate Review Amendment: Crash Reconciliation and Durable Authority

The first Task 3 candidate review rejected the workflow at its crash, retry,
approval-readback, and final-manifest boundaries. The corrected design keeps the
existing runtime, ledger, blob/derivative stores, ontology service, and portable
workspace as the only implementations of those concerns and adds the following
preview-specific composition invariants:

- immediately repeat the complete preflight before the first workspace create;
- treat scan, report, import approval/import, staging approval, and proposal
  streams as exact-match idempotent effects, rejecting any conflicting prefix;
- derive the inspection inventory hash, both approval event IDs, approver
  identities, proposal IDs, event IDs, and counts from authoritative ledger
  readback rather than runtime return DTOs;
- require nominal report, quarantine, and staging-preview reads to produce zero
  ledger delta;
- persist the complete Gate 2 preview artifact and compare its canonical bytes
  by checkpoint hash against the freshly rederived preview before approval;
- enforce adjacent checkpoint phases, immutable authority fields, and monotonic
  event, artifact, command, and approval provenance;
- recover an existing no-checkpoint destination only after the portable
  workspace identity and its complete preview-specific inspection ledger match
  the exact current preflight; otherwise create nothing and write nothing;
- record exact workflow CLI argument receipts and hard-coded engineering
  validation receipts in the final manifest, including the scanner inventory
  hash and both human-gate authorities;
- represent unavailable provider transfer as resumable only in a fresh approved
  provider mission, never as a runnable command inside this preview.

`AssertionService.propose` gains only exact-match retry idempotence. It still
emits `assertion.proposed`, preserves evidence-ingestion causation, and does not
change assertion acceptance, accepted graph state, or ontology truth.
