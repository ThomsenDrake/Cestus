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

## Second Review Amendment: Exact Phase Effect Sets

The second Task 3 review rejected the first remediation candidate because
phase reconciliation still admitted allowed-type effects outside the two
human-approved sets, no-checkpoint recovery could adopt foreign allowed-type
inspection events, the final pre-create check repeated the full source scan
instead of placing a destination-only authority check directly beside the
write, and an explicit import approval timestamp was not part of exact retry
material.

The preview therefore adds these composition invariants without changing the
underlying append-only ledger or runtime contracts:

- no-checkpoint recovery requires the entire workspace ledger to contain
  exactly one preview source registration, scan start, scan completion, and
  report plus exactly one occurrence for each preflight candidate; both a
  missing expected event and any extra event, including an otherwise allowed
  event type, fail closed before runtime or checkpoint writes;
- Gate 1 requires the entire post-checkpoint phase to equal one approval, one
  evidence/link/parse group per unique approved content hash, and one
  completion whose canonical totals and occurrence IDs match the exact raw
  candidate set;
- Gate 2 requires the entire post-checkpoint phase to equal one staging
  approval plus exactly one evidence-bound `assertion.proposed` event for each
  approved candidate ID, with no extra proposal outside the approved subset;
- phase identity comparisons use canonical sorted identifiers rather than
  ledger order;
- the first workspace create is immediately preceded by a destination-only
  mount/device/read-write/separation recheck, with no source enumeration or
  hashing between that recheck and creation;
- an explicitly supplied `approvedAt` value is part of import approval retry
  equality; callers that omit it retain the existing idempotent readback
  behavior.

These checks remain preview-specific reconciliation and exact-retry seams.
They do not permit accepted ontology mutation, production activation, external
provider transfer, or writes to the source SSD.

## Third Review Amendment: Canonical Committed Event Material

The third Task 3 review rejected count- and identifier-based reconciliation
because a same-count foreign or malformed effect could still satisfy a phase
boundary. The preview now treats the complete deterministic committed event
envelope as authority:

- Gate 1 compares the exact approval, evidence, link, local-parse, and
  completion events for the approved raw candidate set. The comparison includes
  event type and version, stream and stream sequence, actor, causation,
  correlation, core and pack versions, and complete deterministic payload
  material. It rejects same-count substitutions such as a provider parse lane,
  foreign actor or stream, or changed evidence source.
- Gate 2 applies the same rule to the exact staging approval and evidence-bound
  proposal set. A wrong approval batch, stream, or version and a proposal on a
  foreign assertion stream are conflicts even when counts and candidate IDs
  remain unchanged.
- No-checkpoint recovery reads and validates the canonical staged report
  artifact, then recognizes the entire ordered source-registration, scan,
  occurrence, completion, and report sequence by full canonical material. It
  cannot persist an `inspection-blocked` checkpoint for an unrecognized
  destination.
- A source changed since approval may append only the exact safe
  `INGESTION_SOURCE_CHANGED_SINCE_APPROVAL` diagnostic envelope emitted by the
  approved import contract. That diagnostic becomes durable phase provenance,
  arbitrary diagnostics are rejected, and retry succeeds only after the exact
  approved bytes are restored.

Only nondeterministic event timestamps are excluded from equality. Report
`generatedAt`, hashes, totals, identifiers, source bindings, and all other
deterministic authority remain part of the comparison. These are
preview-specific reconciliation checks over the existing ledger and runtime;
they do not introduce a second ledger, storage layer, or ontology truth.

## Fourth Review Amendment: Independent Source Truth and Clean Execution Identity

The fourth Task 3 review rejected recovery that treated a recovered report as
its own expected material and execution identity that proved only `HEAD`.
Recovery and every supervised command now enforce two additional authorities:

- A recovered report event and derivative are untrusted until the complete
  deterministic report is independently derived from the current exact
  selected source bytes. The derivation reuses the existing legacy inspector,
  conservative detector/parser, and report builder with an ephemeral in-memory
  ledger. It receives no mounted workspace, blob store, derivative store, or
  checkpoint capability, and selected-file reads retain the existing
  read-only, no-follow, device/inode/size/hash checks.
- Recovery compares the full canonical report artifact bytes and the full
  expected report event envelope to that independent derivation. A coordinated
  foreign report event plus matching foreign derivative fails closed before
  recovery may persist any artifact, ledger event, or checkpoint.
- Execution identity is a clean Git checkout at one exact commit, not merely a
  syntactically valid `HEAD`. Production reads use only fixed `git` executable
  arguments and the fixed repository root: verified `HEAD`, porcelain status
  including all untracked files, then verified `HEAD` again. Tracked staged or
  unstaged changes, untracked files, command failure, or a changing `HEAD`
  fail closed without exposing status output.
- The clean current execution SHA must equal the SHA embedded in the current
  inspection and every durable checkpoint. This is checked at command entry,
  during the existing source/destination authority callbacks, after long
  operations, immediately before artifact or ledger effects where the
  underlying runtime offers a callback, before every checkpoint append, and
  after final engineering validation before manifest persistence.

These checks preserve the immediate source/destination revalidation around
writes. They do not add a shell, accept caller-supplied commands, inspect
authentication material, or change the approved live-data gates.

## Fifth Review Amendment: Trusted Git Subprocess Boundary

The fifth Task 3 review identified that fixed Git arguments and a fixed working
directory were insufficient while the production subprocess still inherited
caller-controlled process state. In particular, `GIT_DIR`, `GIT_WORK_TREE`,
configuration, object-store, tracing, and `PATH` variables could redirect or
instrument the execution-identity check.

Production execution identity therefore uses a closed subprocess contract:

- the executable is the trusted absolute path `/usr/bin/git`;
- each invocation has a fixed command-specific argument vector, fixed canonical
  repository working directory, no shell, ignored stdin and stderr, and
  captured stdout;
- the child environment is constructed from scratch and contains only
  deterministic locale settings, `GIT_OPTIONAL_LOCKS=0`,
  `GIT_CONFIG_NOSYSTEM=1`, and `GIT_CONFIG_GLOBAL=/dev/null`;
- no caller `PATH`, Git repository/worktree/common-directory/object/alternate
  variables, configuration, tracing, hooks, or other process environment is
  inherited;
- before reading status or `HEAD`, Git must report that the fixed working
  directory is inside a worktree and its canonical top level must equal the
  intended preview worktree root exactly;
- command failure, non-worktree execution, root mismatch, dirty state, or an
  unstable `HEAD` fails closed with generic errors that contain no command
  output or inherited environment material.

A production-subprocess regression supplies a clean alternate repository
through hostile `GIT_DIR`, `GIT_WORK_TREE`, global configuration, tracing, and
`PATH`. The alternate SHA is never accepted, the trace is never created, and
the workflow produces no destination, event, or checkpoint effect.

## Gate 1 Runtime Amendment: Exact Media-Type Authority

The first approved raw-import execution exposed a classifier conflict before
the workflow could persist its next checkpoint. The Gate 1 inspector classified
Markdown as `text/markdown` and PDF as `application/octet-stream`; the source
materializer classified Markdown as `application/octet-stream` and PDF as
`application/pdf`. The strict canonical ledger comparison correctly rejected
the resulting 86 media-type substitutions. It must not be weakened.

The preview, legacy inspector, and source materializer now use one
ingestion-local path classifier. It preserves the union of their previously
recognized extensions:

- JSON: `application/json`
- Markdown: `text/markdown`
- YAML: `application/yaml`
- CSV: `text/csv`
- plain text: `text/plain`
- HTML: `text/html`
- PDF: `application/pdf`
- every other extension: `application/octet-stream`

The approved candidate media type is therefore identical in the inspection
report, imported evidence event, migration report, and retry reconciliation.
The canonical committed-event comparator remains full-material and
canonical-set based; the actual runtime continues to append approval, all
evidence/link effects, completion, then local parse jobs.

Because this repair changes both the clean execution SHA and the PDF candidate
media types, the previous Gate 1 checkpoint and candidate-set hash cannot
authorize a resumed import. The coordinator must preserve the failed workspace,
run a fresh deterministic inspection under the repaired SHA, and present the
new exact candidate set for human raw-import approval. No prior approval is
silently carried forward.
