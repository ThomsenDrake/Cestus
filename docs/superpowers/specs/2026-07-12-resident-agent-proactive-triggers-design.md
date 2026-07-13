# Resident Agent Proactive Triggers Design

Date: 2026-07-12

## Purpose and Scope

This Lane T design defines how Cestus notices eligible, authoritative workspace
changes and records a safe request for the single resident agent to consider.
It does not define a scheduler, a model loop, a domain workflow, a provider,
or a browser control. Its only durable success is one read-back,
provenance-bound resident task request in the mounted authoritative ledger.

The design covers the initial PRR, ingestion, evidence-gap/contradiction,
investigation-cadence, and workspace-health/recovery trigger families. Each
family is an eligibility detector over already-authoritative source facts; it
does not create or reinterpret those facts.

## Governing Constraints

- Cestus has exactly one resident identity: `agent_default`. A trigger cannot
  select, create, impersonate, or target another agent identity.
- The mounted workspace identity, ledger, artifact store, policy, and active
  locks are authoritative. A trigger runs only after the workspace authority
  reports the expected mounted identity as verified.
- The ledger is append-only. Trigger requests, adoption decisions, and later
  task outcomes are new records; no trigger mutates a prior request, policy,
  source event, or projection.
- All trigger state is reconstructible from authoritative ledger records and
  referenced mounted artifacts. A process cache may accelerate a read, but is
  never a source of truth and is discarded after restart.
- A trigger contains no model prompts and has no domain effect. It does not
  parse content, call a provider or tool, claim or execute a task, create an
  approval, consume an approval, write an artifact, mutate a projection,
  mutate accepted graph state, send a PRR, escalate, export, publish, repair,
  or disclose data.
- No internal fallback ledger, projection, derivative, artifact, or trigger
  state is permitted if the mount is absent, swapped, stale, unreadable, or
  identity-mismatched.

## Durable, Deduplicated Trigger Requests

Lane T proposes one append-only request family for later CF-1 resolution. The
following names, schemas, streams, and versions are intentionally
non-canonical before CF-1: `agent.trigger.requested.v1`,
`ResidentTriggerRequestV1`, and `TriggerRequestProjectionV1`. Task 117 is the
only authority that may freeze or rename them.

A proposed request is a plain own-data snapshot that contains at least:

```ts
interface ProposedResidentTriggerRequestV1 {
  requestId: string;
  dedupeKey: string;
  requestFingerprint: string;
  admissionScope: ProposedTriggerAdmissionScopeV1;
  triggerGateKey: string;
  residentAgentId: "agent_default";
  workspaceId: string;
  triggerId: string;
  triggerFamily: TriggerFamily;
  policyVersion: string;
  policyArtifactHash: string;
  subjectRef: TriggerSubjectRef;
  sourceRefs: readonly TriggerSourceRef[];
  sourceHighWaterMark: TriggerHighWaterMark;
  requestedRunType: string;
  provenance: TriggerRequestProvenance;
}

interface ProposedTriggerRequestFingerprintInputV1 {
  fingerprintVersion: "resident-trigger-request-fingerprint.v1";
  residentAgentId: "agent_default";
  workspaceId: string;
  triggerId: string;
  triggerFamily: TriggerFamily;
  descriptorRevision: string;
  policyVersion: string;
  policyArtifactHash: string;
  subjectRef: TriggerSubjectRef;
  requestedRunType: string;
  sourceRefs: readonly TriggerSourceRef[];
  sourceHighWaterMark: TriggerHighWaterMark;
  workspaceIdentityEventId: string;
  causationId: string;
}

type ProposedTriggerAdmissionScopeSelectorV1 =
  | "workspace-trigger"
  | "workspace-trigger-subject";

interface ProposedTriggerAdmissionScopeV1 {
  admissionScopeVersion: "resident-trigger-admission-scope.v1";
  workspaceId: string;
  residentAgentId: "agent_default";
  triggerId: string;
  policyVersion: string;
  policyArtifactHash: string;
  cooldownScopeSelector: ProposedTriggerAdmissionScopeSelectorV1;
  budgetScopeSelector: ProposedTriggerAdmissionScopeSelectorV1;
  policySubjectScope: "none" | "subject-ref";
  scopedSubjectRef?: TriggerSubjectRef;
  policySourcePartition: string;
}
```

`requestFingerprint` is exactly the SHA-256 hash of canonical JSON for
`ProposedTriggerRequestFingerprintInputV1`. `sourceRefs` are sorted by source
stream ID, sequence, and event ID before hashing. The input deliberately
excludes `requestId`, event ID, event sequence, append time, `requestedAt`,
`notBefore`, and correlation ID. Those are append or decision-envelope fields,
not stable request semantics. `requestId` is deterministically derived from
the fingerprint (`trq_${base32(requestFingerprint)}`); it is never
append-assigned. The eventual correlation ID is likewise derived after hashing
from the fingerprint, so it cannot create a circular or per-evaluation value.

`dedupeKey` is the SHA-256 hash of canonical JSON containing the dedupe
version and `requestFingerprint`. `admissionScope` is a persisted immutable
snapshot derived by `deriveAdmissionScope(authoritativePolicy, verifiedRequest)`
before append; it is not caller-controlled input. `triggerGateKey` is the
SHA-256 hash of canonical `ProposedTriggerAdmissionScopeV1`; it identifies the
shared cooldown/budget scope and intentionally excludes source high-water and
the dedupe key. Different source candidates in the same policy scope therefore
share one admission key. The fingerprint, dedupe key, admission scope, and gate
key exclude raw source bytes, prompt text, credentials, provider responses, and
local file paths outside the mounted workspace identity.

`deriveAdmissionScope` uses only the verified request's `workspaceId`,
`residentAgentId`, `triggerId`, normalized `subjectRef`, `policyVersion`, and
`policyArtifactHash`, plus the mounted authoritative policy's immutable
`subjectScope`, `sourcePartition`, `cooldownScopeSelector`, and
`budgetScopeSelector`. No candidate may supply a `budgetScope`,
`cooldownScope`, scope key, or selector. Normalization rejects any such
candidate-selected or unknown field before an append or await.

The permitted selectors are finite. `workspace-trigger` requires policy
`subjectScope: "none"` and stores no `scopedSubjectRef`.
`workspace-trigger-subject` requires `subjectScope: "subject-ref"` and stores
the exact normalized request subject reference already verified against the
descriptor and source facts. `cooldownScopeSelector` and
`budgetScopeSelector` must be equal; otherwise the policy is invalid and no
append occurs. This Wave 0 design deliberately rejects distinct overlapping
cooldown and budget selectors rather than pretending one gate can serialize
two partially overlapping domains. `sourcePartition` remains an immutable
policy input for source high-water reconstruction, not a candidate-selected
admission-scope dimension.

The derived scope is persisted in the request and also deterministically
reconstructed at append and readback. The derived/persisted scope must be
exactly equal, and `triggerGateKey` must equal the canonical hash of that
scope; mismatch is a secret-safe invalid-scope result with no append.

The append event's ID, stream sequence, and `context.occurredAt` bind the
durable record at commit time and are verified during readback, but they are
not fingerprint input. A repeated identical evaluation with a different append
attempt time must calculate the same `requestFingerprint`, `requestId`, and
`dedupeKey`, then return exact duplicate readback rather than a
`dedupe-conflict`.

The append protocol is fail-closed and idempotent:

1. Re-read workspace availability, policy, source records, current cooldown,
   budget window, and high-water projection from the mounted authority.
2. Normalize all inputs into plain own-data values before any await or append.
   Reject inherited properties, accessors, sparse arrays, symbols, and unknown
   fields rather than rereading caller objects later.
3. Calculate the deterministic fingerprint, request ID, dedupe key, derived
   admission scope, and `triggerGateKey`. A matching existing request is a
   successful no-append result only after exact ledger readback reconstructs
   the admission scope and proves it exactly equal to the persisted scope, key,
   fingerprint, deterministic request ID, and gate key.
4. For a new eligible candidate, perform an atomic conditional append in one
   mounted-ledger transaction serialized by `triggerGateKey`. Inside that
   transaction, re-read the current scope's request records, cooldown, budget,
   policy/hash, locks, and high-water projection; append the one proposed
   trigger request only if every admission condition still holds. Per-dedupe-
   key uniqueness is necessary but insufficient for this shared-scope check.
   The transaction writes no separate gate, cache, fallback, or projection
   record: the request is its sole permitted durable mutation.
5. If scope serialization or its conditional check conflicts, discard the
   candidate snapshot, re-read and re-evaluate from authoritative state, and
   then return the newly applicable duplicate, cooldown, budget, stale,
   unavailable, or request result. A bounded evaluator never retries an old
   snapshot or spins indefinitely after repeated contention.
6. Read back the exact committed event by ID and reconstruct the admission
   scope from the authoritative policy and verified request fields. Verify its
   resident identity, policy/hash, source identities, high-water mark,
   causation, fingerprint, deterministic request ID, persisted scope exactly
   equal to reconstruction, and gate key before returning a requested decision.

If a concurrent append finds the same `dedupeKey` with a different fingerprint,
the evaluator returns a secret-safe `dedupe-conflict` diagnostic and appends
nothing. It never chooses a winner from process memory. A ledger conflict,
readback failure, malformed record, or unavailable source remains
non-requested and resumable; it never receives a fabricated success result.

## Cooldown and Budget Policy

Each descriptor declares an immutable policy reference and one bounded trigger
budget. The proposed policy fields are `policyVersion`, `policyArtifactHash`,
`cooldownMs`, `maxRequests`, `budgetWindowMs`, `subjectScope`, and
`sourcePartition`, `cooldownScopeSelector`, and `budgetScopeSelector`. The
policy artifact is mounted-authoritative, versioned, and provenance-bound; an
in-process environment variable or browser setting cannot silently replace it.

Cooldown is evaluated per the verified, derived `admissionScope`, whose
policy-defined cooldown and budget scope inputs must pass the equal-selector
rule above. It begins at the recorded request event time, not at an ephemeral
evaluator clock. Its projection is rebuilt from matching read-back request
records whose reconstructed admission scope is exactly equal. During cooldown,
the evaluator returns a `cooldown-active` decision with a safe `notBefore`
time and makes no append.

The trigger budget counts only read-back request records in its policy-defined
window and derived admission scope. It contains no model-token, provider-byte,
tool, or approval budget because trigger evaluation performs none of those
actions. A budget-exhausted decision makes no append and remains eligible for a
later evaluation after the authoritative window changes. The bounded-loop lane
owns the distinct execution budgets that apply after adoption.

Neither cooldown nor budget denial advances source state. This is deliberate:
advancing it would silently discard an unrequested authoritative change. A
later evaluation may request the still-unconsumed source after cooldown or
budget eligibility returns.

## Source Provenance and High-Water Marks

A trigger consumes metadata about already-recorded facts, never opaque source
text. Every `TriggerSourceRef` carries the exact source identity required for
replay:

```ts
interface TriggerSourceRef {
  sourceEventId: string;
  sourceStreamId: string;
  sourceSequence: number;
  sourceKind: string;
  contentHash?: string;
  observedAt: string;
}

interface TriggerHighWaterMark {
  workspaceId: string;
  triggerId: string;
  policyVersion: string;
  sourcePartition: string;
  sourceStreamId: string;
  sourceSequence: number;
  sourceEventId: string;
}

interface TriggerRequestProvenance {
  descriptorRevision: string;
  policyVersion: string;
  policyArtifactHash: string;
  workspaceIdentityEventId: string;
  evaluationSourceEventIds: readonly string[];
  causationId: string;
  correlationId: string;
}
```

`contentHash` is required when the source family is bound to an artifact or
derivative; absence is allowed only for an event-only source whose contract has
no content artifact. A source is stale if its event, sequence, workspace
identity, required content hash, or policy binding cannot be read and exactly
revalidated. Stale input cannot produce a request.

High-water state is a rebuildable projection of verified request records. Its
ordering is the source stream sequence plus source-event identity, never wall
clock arrival order. The high-water mark advances only when a new request has
completed exact ledger readback, or when an exact duplicate has been read back
with the same request fingerprint. It does not advance for ineligible,
cooldown-active, budget-exhausted, stale, duplicate-conflict, unavailable, or
failed-readback outcomes. There is no separately writable high-water store.

The request binds the candidate high-water mark and every source ref it covers.
Therefore a restart can rebuild which source change caused a task request, and
a later source cannot overwrite or hide the earlier request's causation.

## No-Prompt, No-Effect Boundary

The evaluator is a policy-and-provenance reducer. It accepts normalized
descriptor, policy, workspace-authority, and projection snapshots and returns
one of: `requested`, `duplicate`, `ineligible`, `cooldown-active`,
`budget-exhausted`, `workspace-unavailable`, `stale-source`,
`dedupe-conflict`, or `readback-failed`.

It must not receive or construct `inputText`, a prompt artifact, prompt hash
resolver, model message, provider request, subscription session, API key,
credential reference value, raw source byte, or model invocation. It invokes
no model invocation, provider, harness, tool, parser, specialist, scheduler,
or domain service. The sole permitted durable mutation is the validated,
read-back trigger-request append described above; that append is a queueing
request, not a domain effect.

The evaluator never starts a specialist run, creates a task claim, changes an
approval, produces a handoff, or creates an ontology assertion. It is equally
forbidden from using a trigger as evidence that a claim is true, a PRR action
is authorized, a workspace is healthy, or an external effect may proceed.

## Safe Adoption by the One Resident

Trigger request and task adoption are separate durable operations. A later
resident scheduler may consider a pending request only after it reads back the
exact request from the mounted ledger and revalidates workspace identity,
active locks, policy version/hash, source availability, source high-water,
and the `residentAgentId === "agent_default"` binding.

Adoption creates or links ordinary resident orchestration work through the
existing durable task/claim lifecycle; it cannot treat the trigger result as a
claim, lease, run, approval, or completion. Adoption must preserve the request
dedupe key and source provenance as causation for the resulting task record.
It re-applies the bounded-loop descriptor, tool allowlist, and execution
budget checks before any work begins.

Triggers neither request nor consume approvals. If adopted work later requires
provider byte transfer, a PRR send, legal escalation, export, destructive
repair, sensitive disclosure, accepted graph mutation, or another gated
effect, that effect waits for its independently governed approval to be
revalidated and consumed at the effect boundary. A trigger request can never
stand in for that approval.

Any adopted specialist must use its own durable handoff contract. A terminal
result is valid only after the workflow's required ledger and artifact durable
handoff readback; the trigger request itself is not a handoff or proof of
completion.

## Workspace Authority, Durability, and Recovery

Trigger evaluation is suspended unless the wake/workspace lane supplies a
current verified mounted workspace identity. On disconnect, identity mismatch,
mount swap, unreadable ledger, projection rebuild failure, or policy-artifact
readback failure, the evaluator returns a bounded, secret-safe unavailable
decision and retains at most ephemeral process diagnostics. It writes no
fallback state, has no fallback path, and does not enqueue work for a later
synthetic continuation.

After the same workspace reconnects, evaluation begins with a fresh authority
read, ledger replay, source readback, policy/lock revalidation, and high-water
reconstruction. It may then emit an ordinary deduplicated request. Recovery
does not infer success from an in-memory pending list, browser state, or an
unverified request-shaped return value.

## Initial Trigger Families

The initial families use only upstream durable facts and produce only a
requested advisory run type. Exact source contracts and run-type identifiers
remain non-canonical until CF-1.

| Family | Eligible authoritative facts | Candidate advisory work | Boundary |
| --- | --- | --- | --- |
| PRR deadline, fee, correspondence, or stalling | PRR lifecycle/deadline/correspondence events already recorded by the PRR domain | Draft-only PRR monitoring or negotiation | No send, escalation, or transport call. |
| New ingestion production and evidence readiness | Read-back ingestion completion, evidence, and readiness records | Evidence triage or local review preparation | No parsing, provider call, or accepted graph effect. |
| Evidence-gap and contradiction eligibility | Rebuildable projection reports or source-bound advisory scan eligibility | Investigation planning, gap scan, or contradiction review | No assertion acceptance, entity resolution, or graph mutation. |
| Investigation planning cadence | Policy-authorized cadence record and prior request high-water | Advisory investigation planning | Cooldown and budget gates prevent schedule churn. |
| Portable-workspace health and recovery | Wake/workspace availability events and verified reattachment facts | Local recovery assessment request | Does not repair, remount, or write fallback state. |

Lane T does not own the PRR, ingestion, projection, cadence-policy,
workspace-health, specialist, or task-orchestrator facts named in this table.
Those producers retain their authority; a trigger rejects absent, malformed,
or stale facts rather than recreating them.

## Pre-CF-1 Interface and Ownership Boundary

This document proposes, but does not freeze, `ResidentTriggerDescriptor`,
`TriggerEvaluationInput`, `TriggerDecision`, `TriggerSourceRef`,
`TriggerHighWaterMark`, and the request schema above. They are explicitly
non-canonical pre-CF-1 interfaces. Task 117 resolves every event name, Zod
schema/version, stream, DTO/parser version, capability signature, error
category, idempotency index, and production file owner.

Proposed ownership after CF-1 is intentionally narrow:

- T owns trigger descriptors, evaluation, request dedupe, high-water
  projection, and focused trigger tests.
- L reviews the shared policy, post-adoption budgets, task orchestration, and
  bounded-loop contract; it does not let triggers broaden execution authority.
- W owns wake signals, mount lifecycle, workspace verification, and recovery
  facts; T only consumes verified snapshots.
- R alone composes the default runtime factory and mounted capabilities.
- H owns durable handoff manifests, storage, projection, and readback.
- P owns providers, credentials, and provider configuration; T cannot call or
  configure them.
- U owns browser DTOs and controls; it may display safe trigger provenance but
  cannot evaluate or adopt a request.
- A owns cross-lane acceptance and failure injection without changing T
  production behavior.

No Lane T work in this wave edits a shared event contract, default runtime
factory, provider configuration, wake implementation, handoff contract, route,
or cockpit surface. Shared-contract vocabulary conflicts return to Task 117;
they are not resolved by implementation convenience.

## Secret-Safe Diagnostics

Every decision exposes only stable category, trigger ID/family, safe request
or event IDs, source counts, policy version/hash, high-water metadata, and a
bounded next-safe action. Diagnostics must omit prompt text, raw source bytes,
file paths beyond safe mounted identifiers, provider responses, credentials,
tokens, cookie/session material, approval content, and stack traces. Error
objects are normalized before projection so accessors or prototype fields
cannot leak or throw during diagnostic construction.

Permitted repair guidance is limited to actions such as `reconnect-workspace`,
`rebuild-authoritative-projection`, `wait-for-cooldown`,
`wait-for-budget-window`, `refresh-source`, or `request-human-review`. It
never suggests bypassing a lock, approval, identity check, provenance binding,
or effect gate.

## Failure Injection and Later Verification

Task 113 implementation and Lane A acceptance must prove, with deterministic
credential-free tests, that:

- repeated identical evaluation attempts, including attempts at different
  append times, produce the same stable `requestFingerprint`, deterministic
  `requestId`, and `dedupeKey`, then one request and exact duplicate readback;
- a same-key/different-fingerprint collision fails closed;
- equal-policy-scope/different-high-water candidates deterministically derive
  the same persisted `admissionScope` and `triggerGateKey` from the immutable
  policy and verified request facts, then are admitted through one atomic
  conditional append: with a one-request budget or active cooldown, exactly
  one can append and the losing candidate must re-read and re-evaluate to a
  no-append decision;
- equal-policy-scope/different-high-water candidates must derive the same
  `triggerGateKey` before the atomic append; a difference is an invalid-scope
  result, never a second serialization domain;
- a candidate-selected `budgetScope`, `cooldownScope`, selector, or gate key
  is rejected as an unknown field before append; an altered scope in a request,
  duplicate, or readback counterfactual fails exact reconstruction and returns
  an invalid-scope result with no append or high-water advance;
- cooldown and budget denial make no append and do not advance high-water;
- a request advances high-water only after exact append readback, and replay
  rebuilds the same provenance and ordering;
- stale source event, swapped content hash, mount mismatch, unreadable policy,
  stale high-water projection, and active lock all prevent a request;
- a trigger cannot receive prompt/model/provider/tool/parser inputs or create
  a model invocation, domain effect, approval, task claim, handoff, artifact,
  projection, or accepted graph mutation;
- adoption rejects a request whose identity, policy/hash, source, lock, or
  `agent_default` binding no longer verifies; and
- any later adopted workflow proves its own durable handoff readback and
  independently governed approval consumption.

The PRR trigger-to-draft acceptance path must additionally show no send;
ingestion-trigger acceptance must show no parse/provider/graph effect; and
investigation-cadence acceptance must show high-water, cooldown, and budget
enforcement. Provider or live-model acceptance is not applicable to this
trigger-only lane because no model invocation is permitted.

## Explicit Non-Goals

Newsroom or team mode, multi-user authorization, shared workspace hosting,
organization policy administration, subscription credentials,
browser-managed trigger state, autonomous external actions, and a
general-purpose scheduler are out of scope. This design also does not
authorize Task 113, an
implementation plan, a contract freeze, or production code before the required
written Lane T specification approval.
