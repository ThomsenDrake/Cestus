# Resident Agent Durable Handoffs Design

Date: 2026-07-12

## Purpose

This Lane H design specifies durable specialist handoffs for PRR negotiation,
investigation planning, and ontology bootstrap in the resident-agent full-vision
program. A handoff is durable only after the append-only ledger and the
authoritative mounted artifact store both read back the same canonical manifest,
artifacts, and provenance binding after restart.

The existing `agent.specialist-handoff.prepared`,
`agent.specialist-handoff.recorded`, and
`agent-specialist-handoff-manifest.v1` contracts are compatibility baselines.
This document is a CF-1 contract-freeze input, not a production API change. It
does not modify events, schemas, runtime, UI, provider, test, or store code.

## Scope and Boundaries

Lane H designs durable workflow adoption, mounted manifests and stores,
ledger-backed readback, replay/projection, browser-safe DTOs and diagnostics,
failure categories, deterministic failure injection, ownership, and sequencing.

It excludes team/newsroom mode, multi-user authority, shared hosting, new
provider integrations, wake supervision, mount detection, generic planning,
production implementation, Task 109, a lane implementation plan, and merging
to `neo`. It never authorizes PRR send/follow-up, legal escalation,
provider-byte transfer, publication/export, accepted graph mutation, or
self-approval.

## Invariants

- `agent_default` is the sole resident identity; workflow names are typed run
  modes, not agent personas.
- Ledger events are append-only and projections are rebuildable. A correction is
  a causally linked supersession, never an event, manifest, task, or projection
  rewrite.
- A returned DTO, in-memory cache, completed-run hash, or unindexed blob scan is
  not completion evidence. Only ledger and mounted-store readback is evidence.
- Every handoff binds its run/task/resident/workflow identity; source and related
  event IDs; final-output/material/manifest/output hashes; context and prompt
  artifact refs; tool/approval refs; causation; and mounted authority.
- The mounted workspace identity, ledger, artifact store, policy, and active
  locks are authoritative. A missing, stale, swapped, or identity-mismatched
  mount permits no fallback ledger, artifact, derivative, manifest, or
  diagnostic write.
- Public inputs are normalized plain own-data snapshots before a blob write,
  append, provider call, or `await`. Events, DTOs, diagnostics, logs, and live
  evidence are secret-safe.

## Mounted Authority and Store Contract

`HandoffAuthorityBinding` is a proposed CF-1 type shared with W and R. It
contains opaque safe identifiers/hashes, never local paths, device details,
credentials, or source bytes.

```ts
interface HandoffAuthorityBinding {
  readonly workspaceIdentityHash: `sha256:${string}`;
  readonly mountGeneration: string;
  readonly ledgerStoreIdentity: string;
  readonly artifactStoreIdentity: string;
  readonly ledgerHighWaterEventId: string;
  readonly policyHash: `sha256:${string}`;
  readonly activeLocksHash: `sha256:${string}`;
}

interface MountedHandoffStore {
  readonly storeKind: "mounted-handoff-store.v1";
  assertAuthority(binding: HandoffAuthorityBinding): Promise<void>;
  writeCanonical(input: {
    readonly binding: HandoffAuthorityBinding;
    readonly bytes: Uint8Array;
    readonly expectedHash: `sha256:${string}`;
    readonly mediaType: "application/vnd.cestus.specialist-handoff+json";
  }): Promise<{ readonly artifactHash: `sha256:${string}` }>;
  readExact(input: {
    readonly binding: HandoffAuthorityBinding;
    readonly artifactHash: `sha256:${string}`;
  }): Promise<Uint8Array>;
}
```

W owns production mount identity/revalidation; R owns production store
composition and the default runtime factory. H consumes the opaque verified
binding and neither detects nor repairs a mount. The binding is carried in the
manifest and compact prepared/recorded events so a copied manifest cannot bind
to another workspace. Equality is exact: prefix, family, or best-effort matches
are invalid.

`MountedHandoffStore` rechecks authority before and after an await. It writes
only through the mounted store and has no alternate location. `readExact`
checks identity, canonical bytes, and hash. Existing
`SpecialistHandoffManifestStore` remains a compatibility boundary until CF-1
defines a versioned migration; it must not be silently aliased to an unverified
filesystem store.

### Versioned manifest family and legacy replay

`agent-specialist-handoff-manifest.v1` is immutable historical contract data.
It cannot gain a required field. CF-1 therefore retains the strict v1 parser
unchanged and introduces the separately versioned
`agent-specialist-handoff-manifest.v2` for authority-bound manifests. The
proposed stable family is a discriminated union; it does not silently interpret
a v1 byte sequence as a v2 manifest.

```ts
interface LegacySpecialistHandoffManifestV1 {
  readonly schemaVersion: "agent-specialist-handoff-manifest.v1";
  readonly handoffId: string;
  readonly handoffRevision: number;
  readonly handoffDtoHash: `sha256:${string}`;
  readonly runId: string;
  readonly taskId?: string;
  readonly runType: string;
  readonly residentAgentId: "agent_default";
  readonly status: "ready-for-review" | "waiting-for-approval" | "blocked" | "failed";
  readonly safeSummary: string;
  readonly stateKind: "completed" | "failed" | "resumable";
  readonly finalOutputStepId: string;
  readonly finalOutputEventId: string;
  readonly handoffMaterialArtifactHash: `sha256:${string}`;
  readonly contextPackRefs: readonly ContextPackRef[];
  readonly promptArtifactHash?: `sha256:${string}`;
  readonly outputArtifacts: readonly SpecialistWorkflowOutputArtifactDto[];
  readonly toolRequestIds: readonly string[];
  readonly approvalRequirements: readonly SpecialistWorkflowApprovalRequirementDto[];
  readonly nextSafeActions: readonly SpecialistWorkflowNextSafeActionDto[];
  readonly failure?: SpecialistWorkflowFailureDto;
  readonly sourceEventIds: readonly string[];
  readonly relatedEventIds: readonly string[];
  readonly supersedesHandoffId?: string;
  readonly supersedesEventId?: string;
  readonly handoff: SpecialistWorkflowHandoffDto;
}

interface AuthorityBoundSpecialistHandoffManifestV2 {
  readonly schemaVersion: "agent-specialist-handoff-manifest.v2";
  readonly handoffId: string;
  readonly handoffRevision: number;
  readonly handoffDtoHash: `sha256:${string}`;
  readonly runId: string;
  readonly taskId?: string;
  readonly runType: string;
  readonly residentAgentId: "agent_default";
  readonly status: "ready-for-review" | "waiting-for-approval" | "blocked" | "failed";
  readonly safeSummary: string;
  readonly stateKind: "completed" | "failed" | "resumable";
  readonly finalOutputStepId: string;
  readonly finalOutputEventId: string;
  readonly handoffMaterialArtifactHash: `sha256:${string}`;
  readonly contextPackRefs: readonly ContextPackRef[];
  readonly promptArtifactHash?: `sha256:${string}`;
  readonly outputArtifacts: readonly SpecialistWorkflowOutputArtifactDto[];
  readonly toolRequestIds: readonly string[];
  readonly approvalRequirements: readonly SpecialistWorkflowApprovalRequirementDto[];
  readonly nextSafeActions: readonly SpecialistWorkflowNextSafeActionDto[];
  readonly failure?: SpecialistWorkflowFailureDto;
  readonly sourceEventIds: readonly string[];
  readonly relatedEventIds: readonly string[];
  readonly supersedesHandoffId?: string;
  readonly supersedesEventId?: string;
  readonly handoff: SpecialistWorkflowHandoffDto;
  readonly authorityBinding: HandoffAuthorityBinding;
}

type SpecialistHandoffManifest =
  | LegacySpecialistHandoffManifestV1
  | AuthorityBoundSpecialistHandoffManifestV2;
```

V2 is an additive superset: it retains every v1 field and all v1 constraints,
then adds `authorityBinding`. CF-1 must keep the existing strict plain-own-data
canonical serialization, sorted keys, declared array order, UTF-8 SHA-256
hashing, deterministic handoff ID, `handoffDtoHash` verification, state/failure
coupling, supersession-anchor pairing, and exact agreement between the manifest
and canonical `handoff` DTO. It retains the v1 ban on raw prompts, evidence or
provider bodies, credentials, paths, commands, and accepted-state claims.

V2 prepared and recorded event payload schemas are version 2 and carry both
`manifestSchemaVersion: "agent-specialist-handoff-manifest.v2"` and the exact
`authorityBinding`; their event names remain the existing handoff lifecycle
names. A v2 parser rejects a v1 manifest or a missing/mismatched binding.

The legacy-v1 parser remains strict and replayable for historical inspection.
It projects a successfully verified v1 record only as `legacy-unbound`: it is
non-executable, fail closed, has no resume/send/approval action, cannot yield
`verified`, `terminal-consistent`, or `task-completed`, and cannot be mounted as
current production authority. A future migration must reverify the currently
mounted identity, ledger high-water, policy, locks, sources, and artifacts, then
append a new v2 prepared/recorded pair causally linked to the legacy recorded
event. It never rewrites v1 bytes, v1 events, or prior projections.

## Append, Readback, and Recovery Protocol

For a result with durable handoff material, the runner must:

1. Persist each derivative/output artifact to the verified mount and read its
   exact content hash back.
2. Persist/read back canonical handoff material, then append the exact
   final-output step with complete hashes, source/provenance binding, schema,
   and deterministic idempotency key.
3. Build the manifest only from that ledger-bound step, the started-run identity,
   and read-back artifacts; persist/read it back by exact hash.
4. Append `agent.specialist-handoff.prepared` with compact refs and the authority
   binding; replay/read back `handoff-pending`.
5. Append `agent.specialist-handoff.recorded` only after manifest, DTO,
   artifacts, sources, events, tool/approval refs, and authority match; replay
   back `handoff-recorded`.
6. Only then append a compatible terminal run event and causally linked task
   transition. The terminal event cites the recorded event as causation.

On expected-sequence conflict, reread the authoritative stream. An exact prior
append reuses its event ID and `verifiedAt`; different hash, source, status, or
authority binding is a visible conflict. Recovery follows ledger references
only: final-output to prepared, prepared to recorded, or recorded to terminal.
It never searches blobs for orphaned material or resumes from caller memory.

## Proposed Stable Readback and Projection Interfaces

The following names/signatures are CF-1 proposals. They are deliberately
separate from current implementation types until the coordinator resolves
ownership and compatibility.

```ts
interface HandoffReadback {
  readonly outcome: "verified" | "resumable" | "legacy-unbound" | "unavailable" | "inconsistent";
  readonly runId: string;
  readonly taskId?: string;
  readonly handoffId?: string;
  readonly manifestSchemaVersion?: "agent-specialist-handoff-manifest.v1" | "agent-specialist-handoff-manifest.v2";
  readonly manifestHash?: `sha256:${string}`;
  readonly finalOutputStepId?: string;
  readonly finalOutputEventId?: string;
  readonly preparedEventId?: string;
  readonly recordedEventId?: string;
  readonly terminalRunEventId?: string;
  readonly taskStatusEventId?: string;
  readonly authorityBinding?: HandoffAuthorityBinding;
  readonly diagnostics: readonly HandoffDiagnosticDto[];
}

type HandoffLifecycle =
  | "no-output"
  | "output-persisted"
  | "handoff-pending"
  | "handoff-recorded"
  | "terminal-consistent"
  | "task-completed"
  | "legacy-unbound"
  | "unavailable"
  | "inconsistent";

interface SpecialistHandoffProjection {
  readonly lifecycle: HandoffLifecycle;
  readonly selectedReadback: HandoffReadback;
  readonly history: readonly HandoffReadback[];
}
```

The projection reads the run stream, linked task stream, and exact mounted
manifest bytes. It keeps prior valid history and never replaces it with a late
conflict.

| Lifecycle | Meaning | Classification |
| --- | --- | --- |
| `no-output` | No eligible final-output event exists. | Resumable work or ordinary pre-output failure. |
| `output-persisted` | Final output/material is exact but no prepared event exists. | Resumable. |
| `handoff-pending` | Prepared binding exists but no verified recorded event exists. | Resumable. |
| `handoff-recorded` | All manifest, artifact, provenance, and authority readback agrees. | Durable; not automatically task-complete. |
| `terminal-consistent` | Compatible terminal run event follows recorded readback. | Terminal only if its task mapping permits it. |
| `task-completed` | Verified recorded handoff, compatible terminal run, and linked completed task transition all replay with exact causation. | Completed task, not merely a completed run. |
| `legacy-unbound` | Strict legacy-v1 manifest parses but has no v2 authority binding. | Historical, non-executable, fail closed until append-only migration. |
| `unavailable` | Mounted authority/store cannot be read exactly. | Resumable and fail closed. |
| `inconsistent` | Hash, provenance, ordering, supersession, source, or identity conflict. | Non-executable; repair/review required. |

### Verified task-completion rule

`task-completed` is stronger than `terminal-consistent` and requires all of the
following on one exact run/task path: (1) a v2 `handoff-recorded` readback whose
manifest, artifacts, authority, and provenance match; (2) a compatible terminal
run event after that recorded event whose `causationId` is the recorded event
ID; (3) a linked `agent.task.status.changed` event with `status: "completed"`
after that terminal event, on the same task stream, whose `causationId` is the
terminal run event ID; and (4) status `ready-for-review` with
`stateKind: "completed"`. A task event merely adjacent in time, a completed-run
hash, or a status copied from another run cannot satisfy this rule.

## Terminal, Resumable, and Task Status Mapping

| Handoff status/state kind | Required readback and run state | Linked task projection | Result |
| --- | --- | --- | --- |
| `ready-for-review` / `completed` | Verified v2 recorded handoff; a compatible completed run can be `terminal-consistent`. | Becomes `task-completed` only through the verified task-completion rule. | Reviewable completion; no external effect. |
| `waiting-for-approval` / `resumable` | Verified v2 recorded handoff; a locally complete run can be `terminal-consistent` only when the approved run contract allows it. | Remains `waiting-for-approval`; never task-completed. | Resumable after independent approval revalidation. |
| `blocked` / `resumable` | Verified v2 recorded handoff; local run terminality does not make its task terminal. | Remains `blocked`; never task-completed. | Resumable after its safe repair/remount/review action. |
| `failed` / `failed` | Verified v2 recorded failed handoff before a matching failed run may be `terminal-consistent`. | May become failed only through a causally linked task failure transition; never task-completed. | Terminal failed result with safe next actions. |
| Pre-output infrastructure failure | No final output and no handoff. | Ordinary run failure only. | Never a handoff or task-completed result. |
| `output-persisted`, `handoff-pending`, `unavailable`, or `legacy-unbound` | No verified v2 terminal path. | No completion transition. | Explicitly resumable/unavailable/historical and fail closed. |

Manifest persistence failure after final output is resumable, never terminal
success. A failed handoff becomes terminal only after recorded readback.

## Three Workflow Migrations

All migrations consume the frozen lifecycle/runner helper. They do not redefine
handoff events, persistence, or terminal policy independently.

| Workflow | Durable result | Required binding | Prohibited effect | Later task |
| --- | --- | --- | --- | --- |
| PRR negotiation | Reviewable local draft/negotiation handoff. | Request/correspondence, jurisdiction/context, draft artifact, approval-preview, source events. | Send, follow-up, escalation, or assumed approval. | 121 |
| Investigation planner | Reviewable advisory plan/evidence-gap/task-suggestion handoff. | Investigation, evidence/context packs, plan/task/draft artifacts, source/related events. | Accepted graph mutation, PRR send, hidden execution. | 122 |
| Ontology bootstrap | Proposal-only review-bundle handoff. | Legacy staging report, candidate set, evidence IDs, content hashes, source events, review artifact, pack/context refs. | Direct ontology acceptance or legacy-data-as-fact import. | 123 |

PRR's next action remains review, approval request, or explicit non-send state.
Investigation output remains advisory. Ontology bootstrap is evidence first:
only a later human-governed, evidence-tied proposed assertion may affect
ontology state. No handoff is accepted ontology truth.

## Browser-Safe DTO and Diagnostics

The browser receives only the projection. It does not receive manifest bytes,
raw artifacts, store capabilities, or server registries. `ResidentHandoffDto`
and `HandoffDiagnosticDto` are proposed CF-1 names; U owns browser parsing and
presentation after H's runtime projection/route is merged.

```ts
interface ResidentHandoffDto {
  readonly schemaVersion: "resident-handoff.v1";
  readonly runId: string;
  readonly taskId?: string;
  readonly runType: "prr-negotiation" | "investigation-planner" | "ontology-bootstrap";
  readonly handoffId?: string;
  readonly revision?: number;
  readonly lifecycle: HandoffLifecycle;
  readonly status?: "ready-for-review" | "waiting-for-approval" | "blocked" | "failed";
  readonly stateKind?: "completed" | "failed" | "resumable";
  readonly safeSummary?: string;
  readonly provenance?: ResidentHandoffProvenanceDto;
  readonly artifactRefs: readonly SafeHandoffArtifactRef[];
  readonly sourceEventIds: readonly string[];
  readonly relatedEventIds: readonly string[];
  readonly approvalRequirements: readonly SafeApprovalRequirement[];
  readonly nextSafeActions: readonly SafeNextAction[];
  readonly diagnostics: readonly HandoffDiagnosticDto[];
}

interface HandoffDiagnosticDto {
  readonly category: HandoffDiagnosticCategory;
  readonly retry: "none" | "after-remount" | "after-repair" | "after-review";
  readonly safeMessage: string;
  readonly eventIds: readonly string[];
  readonly artifactHashes: readonly `sha256:${string}`[];
}

interface ResidentHandoffProvenanceDto {
  readonly manifestSchemaVersion: "agent-specialist-handoff-manifest.v2";
  readonly handoffManifestHash: `sha256:${string}`;
  readonly finalOutputStepId: string;
  readonly finalOutputEventId: string;
  readonly preparedEventId: string;
  readonly recordedEventId: string;
  readonly terminalRunEventId?: string;
  readonly taskStatusEventId?: string;
}

type HandoffDiagnosticCategory =
  | "workspace-unavailable"
  | "mount-identity-mismatch"
  | "mount-store-identity-mismatch"
  | "mount-authority-stale"
  | "legacy-manifest-unbound"
  | "manifest-missing"
  | "manifest-hash-mismatch"
  | "manifest-content-mismatch"
  | "artifact-missing"
  | "artifact-hash-mismatch"
  | "source-missing"
  | "source-stale"
  | "source-swapped"
  | "provenance-missing"
  | "provenance-cross-run"
  | "run-identity-missing"
  | "run-identity-duplicate"
  | "task-binding-conflict"
  | "final-output-conflict"
  | "expected-sequence-conflict"
  | "terminal-before-readback"
  | "terminal-status-conflict"
  | "supersession-conflict"
  | "dto-invalid"
  | "dto-cross-run"
  | "unsafe-boundary-value"
  | "secret-safety-rejection";

interface SafeHandoffArtifactRef {
  readonly artifactId: string;
  readonly artifactKind: string;
  readonly schemaId: string;
  readonly artifactHash: `sha256:${string}`;
  readonly safeSummary: string;
}

interface SafeApprovalRequirement {
  readonly approvalClass: string;
  readonly state: "not-requested" | "waiting" | "approved" | "rejected" | "stale";
  readonly previewHash?: `sha256:${string}`;
}

interface SafeNextAction {
  readonly kind: "review" | "request-approval" | "resume-after-remount" | "repair";
  readonly effect: "none";
  readonly label: string;
}
```

The parser is strict, freezes plain own-data values, and tests a production
route shape. `provenance` is emitted only from verified v2 readback; a
`legacy-unbound`, unavailable, or inconsistent value omits it rather than
inventing a binding. DTOs/diagnostics may expose safe IDs, hashes, categories,
counts, statuses, safe summaries, and the compact provenance object only. They
must exclude raw prompt/model/provider text, credentials and references,
headers, source/evidence bodies, correspondence, command lines, paths, stack
traces, and mount details. React does not reconstruct, start, send, or approve
a handoff.

## Failure Categories and Handling

`HandoffDiagnosticCategory` is a proposed closed versioned enum:

- Mount: `workspace-unavailable`, `mount-identity-mismatch`,
  `mount-store-identity-mismatch`, `mount-authority-stale`,
  `legacy-manifest-unbound`.
- Artifact: `manifest-missing`, `manifest-hash-mismatch`,
  `manifest-content-mismatch`, `artifact-missing`, `artifact-hash-mismatch`.
- Provenance: `source-missing`, `source-stale`, `source-swapped`,
  `provenance-missing`, `provenance-cross-run`.
- Lifecycle: `run-identity-missing`, `run-identity-duplicate`,
  `task-binding-conflict`, `final-output-conflict`,
  `expected-sequence-conflict`, `terminal-before-readback`,
  `terminal-status-conflict`, `supersession-conflict`.
- Boundary: `dto-invalid`, `dto-cross-run`, `unsafe-boundary-value`,
  `secret-safety-rejection`.

Exact retry is idempotent; every other category fails closed. If the mounted
ledger is presently verified and writable, append a secret-safe diagnostic with
causation to the triggering event. If not, return bounded ephemeral diagnostics
and wait for remount—never write an internal backup diagnostic. Diagnostics do
not disclose raw values to make repair easier.

## Deterministic Failure-Injection Requirements

Task 110 turns this failure-injection contract into credential-free tests; A
reruns it against the integrated runtime and returns defects to owners.

| Injection | Required proof | Never permitted |
| --- | --- | --- |
| Restart after `handoff-recorded` | Exact replayed manifest hash, event IDs, safe DTO, and provenance. | Cache/DTO synthesis or blob scan. |
| Crash after final output/prepared | `output-persisted`/`handoff-pending`, then idempotent recovery. | Terminal success. |
| Missing, swapped, or corrupt manifest/artifact | `inconsistent` with safe hash-bound diagnostic. | Alternate bytes/store or success. |
| Stale/swapped source/context/output ref | Provenance category before terminal append. | New manifest/artifact write. |
| Disconnect/remount/identity-store swap | `unavailable` or mount diagnostic with no append, provider call, artifact write, or copy. | Fallback persistence. |
| Historical v1 manifest | Strict legacy parse, `legacy-unbound`, no provenance DTO or executable action until append-only v2 migration. | Treating v1 as authority-bound or task-completed. |
| Duplicate run identity or cross-run DTO | Exact rejection with lifecycle/boundary category. | Arbitrary run selection or partial parse. |
| Exact versus conflicting sequence race | Exact reuse; conflict remains non-executable. | Duplicate `verifiedAt` or terminal success. |
| Terminal before recorded | `terminal-before-readback`, no success DTO. | Retroactive success projection. |
| Waiting/blocked/failed mappings | Correct resumable/terminal state only after readback. | `task-completed` for waiting/blocked. |
| Hostile object, secret-shaped/raw provider text | Boundary rejection with no value retention. | Event/DTO/log/fixture leakage. |

## Later Provider Obligations

Task 102 invokes no provider. Later PRR, investigation, and bootstrap work that
selects one keeps deterministic tests credential-free and runs real approved
provider acceptance only in the coordinator environment. Evidence is limited to
safe provider/model IDs, hashes, event IDs, counts, categories, and handoff
readback markers. No prompts, raw requests/responses, endpoints, tokens, or
credentials are captured. Provider unavailability after durable output is
resumable; before durable output it is a secret-safe ordinary run failure.
Neither permits fabricated readiness or a fallback backend.

## Ownership, Consumers, and Merge and rebase Order

| Concern | Owner | Consumer/boundary |
| --- | --- | --- |
| Manifest, readback, projection, diagnostics | H with L review at CF-1 | 121–123, 135, 138, U, A. |
| Mount identity/revalidation | W | H only consumes `HandoffAuthorityBinding`. |
| Mounted store composition/default factory | R | Task 135; only R edits the default factory. |
| Terminal/resumable policy | L | H maps verified handoffs; it does not create a generic loop. |
| Provider/secret posture | P | H consumes safe outcomes and owns no provider configuration. |
| Runtime projection | H / 138 | U consumes the merged route DTO. |
| Browser parser/presentation | U | Begins only after H's production route shape lands. |
| Integrated failure acceptance | A | Consumes merged producers and returns defects. |

CF-1 merges before H workflows. Tasks 121, 122, and 123 use exclusive workflow
files and merge before R's 134/135 and H's 138. Task 135's mounted store merges
before 138; the resulting route merges before U cockpit consumption. After
every contract-changing merge, the coordinator records the SHA, rebases each
dependent worktree, and reruns its named cross-lane command before review. A
stale branch does not merge.

## Stop and Approval Gate

Stop and escalate on event/DTO/error/ownership conflict; a replay requirement
to scan blobs; pressure to rewrite terminal state; unbound/stale/swapped
provenance or authority; unavailable mounted workspace; unsafe diagnostics;
unofficial token extraction; or two focused verifier failures.

This Task 102 artifact stops for fresh coordinator specification review and
written H-spec approval. It grants no Task 110 plan, production/test/runtime/UI
provider/shared-contract change, worker dispatch, or merge authority.
