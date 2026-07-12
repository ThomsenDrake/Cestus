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

`SpecialistHandoffManifest` remains the canonical artifact contract. CF-1 must
retain its existing versioned schema name and add the authority binding without
making the browser DTO the persisted source of truth:

```ts
interface SpecialistHandoffManifest {
  readonly schemaVersion: "agent-specialist-handoff-manifest.v1";
  readonly handoffId: string;
  readonly handoffRevision: number;
  readonly handoffDtoHash: `sha256:${string}`;
  readonly runId: string;
  readonly taskId?: string;
  readonly runType: string;
  readonly residentAgentId: "agent_default";
  readonly status: "ready-for-review" | "waiting-for-approval" | "blocked" | "failed";
  readonly stateKind: "completed" | "failed" | "resumable";
  readonly finalOutputEventId: string;
  readonly handoffMaterialArtifactHash: `sha256:${string}`;
  readonly authorityBinding: HandoffAuthorityBinding;
  readonly sourceEventIds: readonly string[];
  readonly relatedEventIds: readonly string[];
}
```

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
  readonly outcome: "verified" | "resumable" | "unavailable" | "inconsistent";
  readonly runId: string;
  readonly taskId?: string;
  readonly handoffId?: string;
  readonly manifestHash?: `sha256:${string}`;
  readonly recordedEventId?: string;
  readonly authorityBinding?: HandoffAuthorityBinding;
  readonly diagnostics: readonly HandoffDiagnosticDto[];
}

type HandoffLifecycle =
  | "no-output"
  | "output-persisted"
  | "handoff-pending"
  | "handoff-recorded"
  | "terminal-consistent"
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
conflict. `task-completed` is stronger than `terminal-consistent`: it requires a
causally valid actual task completion after a verified handoff. Waiting for
approval and blocked states never project as task-completed.

| Lifecycle | Meaning | Classification |
| --- | --- | --- |
| `no-output` | No eligible final-output event exists. | Resumable work or ordinary pre-output failure. |
| `output-persisted` | Final output/material is exact but no prepared event exists. | Resumable. |
| `handoff-pending` | Prepared binding exists but no verified recorded event exists. | Resumable. |
| `handoff-recorded` | All manifest, artifact, provenance, and authority readback agrees. | Durable; not automatically task-complete. |
| `terminal-consistent` | Compatible terminal run event follows recorded readback. | Terminal only if its task mapping permits it. |
| `unavailable` | Mounted authority/store cannot be read exactly. | Resumable and fail closed. |
| `inconsistent` | Hash, provenance, ordering, supersession, source, or identity conflict. | Non-executable; repair/review required. |

A `failed` handoff becomes terminal only after recorded readback. An
infrastructure failure before final output may append an ordinary run failure
without inventing a handoff. Manifest persistence failure after final output is
resumable, never terminal success.

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

type HandoffDiagnosticCategory =
  | "workspace-unavailable"
  | "mount-identity-mismatch"
  | "mount-store-identity-mismatch"
  | "mount-authority-stale"
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
route shape. It rejects unknown or raw fields. DTOs/diagnostics may expose safe
IDs, hashes, categories, counts, statuses, and safe summaries only. They must
exclude raw prompt/model/provider text, credentials and references, headers,
source/evidence bodies, correspondence, command lines, paths, stack traces, and
mount details. React does not reconstruct, start, send, or approve a handoff.

## Failure Categories and Handling

`HandoffDiagnosticCategory` is a proposed closed versioned enum:

- Mount: `workspace-unavailable`, `mount-identity-mismatch`,
  `mount-store-identity-mismatch`, `mount-authority-stale`.
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
