# Resident Agent Bounded Loop Design

Date: 2026-07-12

## Purpose

Lane L defines the contract-freeze input for Cestus's bounded
plan/observe/tool/replan kernel. The kernel lets the single resident identity,
`agent_default`, carry out a small, declared sequence of local advisory work
for one claimed task. It makes every plan, observation, proposed tool step,
budget decision, suspension, and terminal-or-resumable outcome durable and
replayable without giving the loop authority to change its own limits.

This is a Wave 0A design only. It specifies policy and record shapes for CF-1;
it does not add an event, schema, runtime, UI, provider, tool, test, or storage
implementation. All names, wire formats, and numeric defaults below are
**pre-CF-1 proposals**, not production APIs or permission grants.

## Scope And Non-Goals

Lane L owns the design of versioned plan policy, append-only plan/observation/
tool-step records, exact tool allowlists, plan/observe/tool/replan ordering,
budget accounting, approval suspension, recovery, and terminal/resumable
semantics.

It does not own the production tool gateway, task claim/lease lifecycle,
workspace mount detection, provider registry or credentials, approval service,
handoff persistence/readback, runtime factory, browser DTO parser, trigger
generation, acceptance harness, shared event names, or any default runtime
composition. It does not create Task 112, an implementation plan, production
work, team/newsroom mode, multi-user authority, shared hosting, a fallback
store, or a general-purpose agent.

A workflow descriptor identifies a typed run mode; it never creates a
specialist agent identity, team member, or delegated authority.

## Governing Invariants

- `agent_default` is the sole resident identity. Providers, credentials,
  subscriptions, harnesses, workflows, tools, and models are backends or
  capabilities, never additional residents.
- The ledger is append-only. Plans and observations are advisory derivative
  material whose projections rebuild from durable events. A correction, replan,
  or recovery appends a causally linked record and never mutates an old one.
- Plans, model output, observations, memory, and tool results cannot establish
  accepted ontology truth. Graph-facing work remains a provenance-bound
  proposal until the human-governed domain service accepts it.
- Every record binds its task, attempt, run, resident, workflow descriptor,
  policy version/hash, source and context artifact references, budget snapshot,
  actor/causation/correlation, and mounted authority snapshot. Cross-run,
  stale-source, stale-policy, or mount-mismatched records are invalid.
- The mounted workspace identity, ledger, artifact store, policy, and active
  locks are authoritative. A missing, stale, swapped, or identity-mismatched
  mount permits no claim, provider call, tool execution, plan/observation
  append, or internal substitute. There is **no fallback** ledger, projection,
  derivative, artifact, or diagnostic store.
- Public inputs are normalized as plain own-data snapshots before any append,
  blob write, provider call, tool request, or `await`. Unsafe prototypes,
  accessors, symbols, inherited properties, sparse/custom arrays, unexpected
  keys, and secret-shaped values are rejected before a durable effect.
- Provider-byte transfer and every irreversible or external effect retain the
  existing independent-human gate. The loop may request a preview and suspend;
  it cannot self-approve or reuse an approval after relevant state changes.
- A completed-looking loop is not completion evidence. Completion requires
  ledger readback and, where output/handoff material exists, exact mounted
  artifact and handoff readback under Lane H's contract.
- Diagnostics, records, projections, logs, handoffs, and browser-bound values
  contain safe identifiers, hashes, counters, categories, and approved
  summaries only. They never contain raw prompts, provider bodies, source
  bytes, credentials, paths, command text, or secrets.

## Contract Position And Freeze Boundary

The following are proposed CF-1 interfaces. CF-1 must select canonical event
names, Zod schemas, versions, idempotency keys, migration/parser rules,
ownership, and fixtures. Until then, no code may treat these names as exported
production contracts.

```ts
type ResidentRunMode =
  | "evidence-triage"
  | "ontology-bootstrap"
  | "investigation-planner"
  | "prr-negotiation"
  | "timeline-builder"
  | "contradiction-finder"
  | "report-builder"
  | "memory-curation";

type ResidentToolSideEffectClass =
  | "read-only"
  | "local-derivative"
  | "ledger-proposal"
  | "ledger-review"
  | "external-byte-transfer"
  | "external-message-send"
  | "export-or-publication"
  | "destructive-or-repair"
  | "legal-escalation";

type ResidentApprovalClass =
  | "none"
  | "human-review"
  | "provider-byte-transfer"
  | "external-message-send"
  | "export-or-publication"
  | "destructive-or-repair"
  | "legal-escalation"
  | "ledger-review";

interface ResidentLoopAuthorityBinding {
  readonly workspaceIdentityHash: `sha256:${string}`;
  readonly mountGeneration: string;
  readonly ledgerStoreIdentity: string;
  readonly artifactStoreIdentity: string;
  readonly ledgerHighWaterEventId: string;
  readonly policyHash: `sha256:${string}`;
  readonly activeLocksHash: `sha256:${string}`;
}

interface ResidentLoopBudget {
  readonly maxPlanRevisions: number;
  readonly maxObservationRecords: number;
  readonly maxToolSteps: number;
  readonly maxProviderInvocations: number;
  readonly maxProviderRequestBytes: number;
  readonly maxProviderResponseBytes: number;
  readonly maxContextBytes: number;
  readonly maxDerivativeArtifactBytes: number;
  readonly maxActiveExecutionMs: number;
  readonly approvalTtlMs: number;
}

interface ResidentToolAllowlistEntry {
  readonly toolId: string;
  readonly toolVersion: string;
  readonly sideEffectClass: ResidentToolSideEffectClass;
  readonly requiredApprovalClass: ResidentApprovalClass;
  readonly maximumCalls: number;
  readonly automaticLocalAction: boolean;
  readonly requiredContextPackIds: readonly string[];
}

interface ResidentPlanPolicy {
  readonly schemaVersion: "resident-plan-policy.v1";
  readonly policyVersion: string;
  readonly policyHash: `sha256:${string}`;
  readonly residentAgentId: "agent_default";
  readonly runMode: ResidentRunMode;
  readonly multiStepEnabled: boolean;
  readonly budget: ResidentLoopBudget;
  readonly toolAllowlist: readonly ResidentToolAllowlistEntry[];
  readonly requiredContextPackIds: readonly string[];
  readonly requiredApprovalClasses: readonly ResidentApprovalClass[];
  readonly permittedAutomaticActionClasses: readonly (
    "read-only" | "local-derivative" | "ledger-proposal"
  )[];
  readonly onBudgetExhaustion: "terminal" | "resumable";
}
```

W owns mount verification/reverification; L only consumes the opaque verified
authority binding. Its fields are safe opaque identifiers/hashes, never paths,
device data, source bytes, credentials, or local storage locations. A policy is
immutable for an attempt. The loop compares its `policyHash` before every
durable action and after every `await`; a changed policy, allowlist, provider
posture, budget, lock, source, context, or mount ends or suspends the attempt.

## Hard Maximums

The following are non-negotiable ceilings for one resident attempt. CF-1 may
make a ceiling lower for a workflow; it may not raise one without a new approved
design and plan. Denied, failed, and suspended requests consume a relevant
count, so a rejected loop cannot evade a limit.

| Budget dimension | Maximum | Accounting rule |
| --- | ---: | --- |
| Plan revisions after initial plan | 3 | At most four append-only plan records total. |
| Observation records | 16 | Every fact changing the next action consumes one. |
| Tool steps | 12 | A requested tool consumes a step; retry needs a listed new step. |
| Provider invocations | 3 | Reserve before transfer. |
| Provider request bytes | 1,048,576 | Count exact selected envelope bytes. |
| Provider response bytes | 1,048,576 | Count received bytes before parsing. |
| Context bytes | 1,048,576 | Sum resolved context bound by the plan. |
| Derivative artifact bytes | 16,777,216 | Sum exact mounted output bytes. |
| Active execution time | 900,000 ms | Monotonic active time; no new action after exhaustion. |
| Approval suspension lifetime | 86,400,000 ms | Revalidate within 24 hours; waiting does not reset budgets. |

Each record carries durable `consumed` and `remaining` values for every table
dimension. The loop reserves a provider call, tool request, or output write
before the effect and reads the reservation back. An unproved reservation or
readback blocks the effect; it never uses an in-memory counter after restart.

### Initial Workflow Profiles

These profiles are the policy ceilings to freeze for the first production
verticals. `multiStepEnabled: false` does not grant a future workflow a loop;
it permits only its bounded single-plan draft path. A trigger has no profile:
Lane T may append a task request but never a plan, provider call, tool step, or
domain effect.

| Run mode | Multi-step | Replans / observations / tool steps / provider calls | Context / request / response / derivatives | Active time | Automatic classes and prohibitions |
| --- | --- | --- | --- | --- | --- |
| Evidence triage | Yes | 2 / 12 / 8 / 3 | 1 MiB / 1 MiB / 1 MiB / 8 MiB | 10 min | Read-only, local derivative, proposal only; accepted graph state remains forbidden. |
| Ontology bootstrap | Yes | 2 / 16 / 10 / 3 | 1 MiB / 1 MiB / 1 MiB / 16 MiB | 15 min | Evidence-first proposal material only; legacy data never becomes fact. |
| Investigation planner | Yes | 3 / 16 / 8 / 3 | 1 MiB / 1 MiB / 1 MiB / 8 MiB | 15 min | Advisory plan/evidence-gap material only. |
| PRR negotiation | No | 1 / 8 / 4 / 2 | 512 KiB / 512 KiB / 512 KiB / 4 MiB | 10 min | Draft-only; send, follow-up, and escalation remain forbidden. |
| Timeline builder | No | 1 / 12 / 6 / 2 | 1 MiB / 512 KiB / 512 KiB / 8 MiB | 10 min | Sourced local draft only. |
| Contradiction finder | No | 2 / 16 / 8 / 3 | 1 MiB / 1 MiB / 1 MiB / 8 MiB | 15 min | Advisory candidate discovery only. |
| Report builder | No | 1 / 8 / 4 / 2 | 512 KiB / 512 KiB / 512 KiB / 8 MiB | 10 min | Local draft only; export/publication forbidden. |
| Memory curation | No | 1 / 12 / 6 / 1 | 1 MiB / 512 KiB / 512 KiB / 4 MiB | 10 min | Source-bound advisory memory only. |

An entry in this table is not permission to call an unavailable provider. P
owns provider feasibility, credential posture, model capability, and byte
transfer policy. R composes only a verified P capability. A call allowed by a
budget but lacking P readiness, exact transfer approval, or mounted authority
is not executable.

## Durable Plan, Observation, And Tool-Step Records

The proposed records are compact, canonical, and ledger-bound. They store safe
summaries and exact references, never raw prompt/model/source/provider content.
Raw derivative bytes, if permitted, remain in the mounted artifact store and
are referred to only by an exact hash after readback.

```ts
interface ResidentPlanRecord {
  readonly schemaVersion: "resident-plan-record.v1";
  readonly planId: string;
  readonly planRevision: number;
  readonly taskId: string;
  readonly attemptId: string;
  readonly runId: string;
  readonly residentAgentId: "agent_default";
  readonly runMode: ResidentRunMode;
  readonly policyVersion: string;
  readonly policyHash: `sha256:${string}`;
  readonly authority: ResidentLoopAuthorityBinding;
  readonly sourceEventIds: readonly string[];
  readonly contextPackRefs: readonly { readonly contextPackId: string; readonly contentHash: `sha256:${string}` }[];
  readonly budget: { readonly consumed: ResidentLoopBudgetUsage; readonly remaining: ResidentLoopBudgetUsage };
  readonly steps: readonly ResidentPlannedStep[];
  readonly supersedesPlanRecordEventId?: string;
  readonly causationId: string;
  readonly correlationId: string;
}

interface ResidentObservationRecord {
  readonly schemaVersion: "resident-observation-record.v1";
  readonly observationId: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly runId: string;
  readonly planId: string;
  readonly planRecordEventId: string;
  readonly stepOrdinal: number;
  readonly kind: "context-verified" | "tool-result" | "provider-result" | "budget" | "approval" | "recovery" | "failure";
  readonly safeSummary: string;
  readonly sourceEventIds: readonly string[];
  readonly artifactHashes: readonly `sha256:${string}`[];
  readonly toolRequestId?: string;
  readonly modelInvocationEventId?: string;
  readonly policyHash: `sha256:${string}`;
  readonly authority: ResidentLoopAuthorityBinding;
  readonly budget: { readonly consumed: ResidentLoopBudgetUsage; readonly remaining: ResidentLoopBudgetUsage };
  readonly causationId: string;
}

interface ResidentToolStepRecord {
  readonly schemaVersion: "resident-tool-step-record.v1";
  readonly taskId: string;
  readonly attemptId: string;
  readonly runId: string;
  readonly planId: string;
  readonly planRecordEventId: string;
  readonly stepOrdinal: number;
  readonly toolRequestId: string;
  readonly toolId: string;
  readonly toolVersion: string;
  readonly allowlistEntryHash: `sha256:${string}`;
  readonly sideEffectClass: ResidentToolSideEffectClass;
  readonly requiredApprovalClass: ResidentApprovalClass;
  readonly state: "requested" | "suspended" | "executed" | "denied" | "failed";
  readonly previewHash?: `sha256:${string}`;
  readonly toolEventIds: readonly string[];
  readonly inputArtifactHashes: readonly `sha256:${string}`[];
  readonly resultArtifactHashes: readonly `sha256:${string}`[];
  readonly policyHash: `sha256:${string}`;
  readonly authority: ResidentLoopAuthorityBinding;
  readonly causationId: string;
}
```

`ResidentLoopBudgetUsage` and `ResidentPlannedStep` are CF-1 schema work. The
former carries every Hard Maximums dimension. The latter contains an ordinal,
purpose, exact allowlist reference, expected safe output class, and
prerequisites; it cannot contain executable shell text, a provider body, raw
source content, or an open-ended natural-language command.

The policy/record event sequence is proposed as separate versioned lifecycle
events for initial plan, revised plan, observation, tool-step checkpoint,
suspension, resume decision, and terminal-or-resumable outcome. CF-1 may name
them differently, but it must not use an unversioned generic note or overwrite
the canonical tool gateway. The gateway remains source of truth for tool
requested/approved/denied/claimed/completed/failed events;
`ResidentToolStepRecord` is a causally linked bounded-loop projection aid and
cannot forge, replace, or complete a gateway event.

Every append validates its expected stream sequence and reads the exact event
back. Exact idempotent replay returns the same event identifier. A duplicate
with changed policy, plan revision, scope, source/context hash, tool/version,
budget, preview, authority, or causation is a visible conflict, not a retry.
Recovery follows ledger references only and never scans blobs, uses caller
memory, or infers success from a returned object.

## Plan / Observe / Tool / Replan Policy

Each loop follows this finite state machine:

```text
verified mounted authority + claimed attempt
  -> append/read back initial plan
  -> verify declared context, locks, policy, and remaining budget
  -> append/read back observation
  -> request one exact allowlisted tool or provider action
  -> execute only if its current approval class permits it
  -> append/read back tool outcome observation
  -> append a narrower/equivalent replan within budget, finish, fail, or
     persist an explicit resumable suspension
```

Planning selects only finite typed steps in the policy's exact allowlist. It
cannot add a tool, version, side-effect class, provider/model posture, approval
class, context source, byte allowance, budget, autonomous action class, or
external effect. Model-generated text is an untrusted candidate: it is
normalized and rejected before append unless already within the frozen schema
and policy.

Before a step and after every `await`, the loop rechecks all of the following:

1. Its durable task claim/lease still belongs to the same resident and attempt.
2. Workspace binding, ledger/artifact identities, high-water, policy hash, and
   active-lock hash still exactly match or W has freshly reverified them.
3. Bound context packs, sources, artifact hashes, and provider posture are
   current for this exact run.
4. Tool ID, exact version, side-effect class, approval class, and call count
   match one allowlist entry, and required context packs are present.
5. Reservation plus actual consumption fits every remaining budget.
6. Established domain and external-effect gates are satisfied.

If a check fails, the loop appends a secret-safe observation/failure when the
mount permits it, releases through W/orchestration as needed, and returns the
matching fail-closed outcome. It never retries by silently selecting another
tool or reducing a preview until it matches an approval.

A replan is allowed only after a durable observation identifies a permitted
choice among already-declared steps, for example a local classification result
or expected provider-unavailable result. It appends a new record with the old
plan event ID as `supersedesPlanRecordEventId`, retains remaining budget after
actual consumption, and cannot restore an exhausted counter. Replanning is not
a new attempt, a loop shortcut, or an authority escalation.

## Tool Allowlist

### Exact allowlist matching

The tool allowlist is closed. Matching is exact `toolId` **and** exact
`toolVersion`; prefixes, families, aliases, compatible majors, provider names,
and capability labels do not match. `maximumCalls` applies per attempt and per
entry. The current registry must prove that the capability has the same
side-effect and approval classes as its policy entry; an allowlist descriptor
cannot relabel a registered tool as safer.

Only an entry whose `automaticLocalAction` is true, whose approval class is
`none`, and whose class is read-only, local-derivative, or ledger-proposal may
run automatically. A ledger proposal stays advisory and provenance-bound. It
is not accepted graph mutation, ledger review, or a way to bypass a domain
service.

`ledger-review`, provider-byte transfer, external message send, export or
publication, destructive/repair, and legal escalation are never automatic.
They use the already-owned gateway and independent approval contract. The
current Wave 0A scope grants no send, follow-up, escalation, publication,
export, destructive repair, sensitive disclosure, accepted graph mutation, or
irreversible effect even if a later policy describes its approval class. PRR
and report work remain draft-only.

### Provider and tool boundary

The loop asks P/R whether a provider invocation is feasible; it does not
resolve credentials, choose a fallback model, construct raw transfer bytes, or
call a provider directly. A provider invocation consumes policy budget and,
where the transfer boundary requires it, uses an exact approved preview. Tool
gateways append and validate request/decision/result facts; the loop schedules
the next bounded step only after their readback. The gateway is not a general
scheduler, and the loop is not a hidden command launcher.

## Approval Suspension

When a selected step requires approval, the loop appends/reads back the plan
and exact tool/provider request, then appends/reads back a suspension
checkpoint. No executor, provider-byte transfer, or external effect starts
before those facts exist. The suspension binds:

- task, attempt, run, resident, plan record, and step ordinal;
- exact tool/version/side-effect/approval class and allowlist entry hash;
- exact preview hash and request event ID;
- policy/authority/lock hashes and budget reservation;
- source, context, and input-artifact hashes; and
- safe next action plus a resumption deadline no later than 24 hours.

Suspension is durable `resumable`, not a completed task, completed tool,
in-memory Promise, or permission to continue after restart. It releases or
checkpoints the orchestration claim under W/orchestration ownership and never
writes a local substitute when the mount is absent.

On resume, gateway and loop independently re-read request, approval, policy,
authority, context/source, and budget. Consumption is valid only when all are
exact:

1. The approving actor is an independent human, never `agent_default`, the
   requester, an impersonated resident, or a forged actor record.
2. Approval class, request/run/task identity, exact preview hash, and causation
   chain equal the suspended request.
3. Approval is unexpired and no denial, revocation, supersession, active lock,
   changed mount, changed policy/allowlist/provider posture, stale
   source/context/artifact, or claim conflict has appeared.
4. Exact tool/version and current preview still match policy, and reserved
   remaining budget covers the effect.
5. P's provider/credential feasibility and existing provider-byte-transfer
   approval recheck pass when bytes transfer.

Any failure consumes no external effect. The loop records a secret-safe
stale/denied/unavailable observation and yields a new approval request or safe
terminal/resumable outcome as policy permits. It never reuses an approval for a
revised plan, different task/run, changed bytes, or substitute provider.

## Terminal And Resumable Semantics

```ts
interface ResidentLoopTerminalOrResumableResult {
  readonly schemaVersion: "resident-loop-result.v1";
  readonly outcome: "completed" | "failed" | "resumable";
  readonly category:
    | "handoff-recorded"
    | "validation-failed"
    | "budget-exhausted"
    | "approval-required"
    | "approval-denied"
    | "approval-stale"
    | "workspace-unavailable"
    | "provider-unavailable"
    | "source-stale"
    | "policy-changed"
    | "claim-conflict"
    | "persistence-unconfirmed"
    | "tool-failed";
  readonly taskId: string;
  readonly attemptId: string;
  readonly runId: string;
  readonly residentAgentId: "agent_default";
  readonly policyHash: `sha256:${string}`;
  readonly authority: ResidentLoopAuthorityBinding;
  readonly finalPlanRecordEventId?: string;
  readonly finalObservationEventId: string;
  readonly handoffReadback?: {
    readonly recordedEventId: string;
    readonly manifestHash: `sha256:${string}`;
    readonly finalOutputEventId: string;
  };
  readonly resumeAnchor?: {
    readonly checkpointEventId: string;
    readonly nextSafeAction: string;
  };
  readonly causationId: string;
}
```

| Durable condition | Outcome | Required proof and next action |
| --- | --- | --- |
| Reviewable advisory output persists and H's manifest/outputs and ledger all read back exactly; compatible terminal run/task transition follows. | `completed` / `handoff-recorded` | Handoff readback is mandatory. The loop does not claim accepted graph truth or an external effect. |
| Input/model/schema/provenance validation fails before output, or an unrecoverable policy/domain gate rejects work. | `failed` / `validation-failed` | Exact final failure observation/event readback; no invented handoff or task completion. |
| Policy says depleted budget is terminal, or no listed step can proceed. | `failed` / `budget-exhausted` | Final budget observation/readback. Later retry is separately governed, never this attempt reset. |
| Same category is configured `onBudgetExhaustion: "resumable"`. | `resumable` / `budget-exhausted` | Durable checkpoint with remaining counters; normal new claim may not add budget. |
| Approval is needed, denied, stale, expired, or invalid. | `resumable` / approval category, or terminal denial with no safe action | Exact request/decision/checkpoint readback; re-request only through independent approval. |
| Mount disconnect, identity mismatch, policy/source/context change, claim conflict, provider outage, or unconfirmed persistence occurs. | `resumable` / matching category | W/orchestration recovery and authority reverify; no fallback write or synthetic continuation. |
| Tool fails after durable request. | `failed` or `resumable` / `tool-failed` | Gateway failure and observation readback; retry only as a distinct listed step within remaining caps. |

`completed` is stronger than a completed provider/tool call or returned DTO. It
requires H's durable handoff readback and causally linked run/task lifecycle
proof. A failed handoff with material is terminal only under H's recorded
failed-handoff/readback rule. A pre-output failure is terminal only after exact
failure record replay; it is never reported as handoff or task completion.

After restart, recovery replays task/claim streams, plan/observation/tool-step
records, gateway events, provider evidence, and H handoff readback from the
verified mounted stores. An orphaned artifact, caller-supplied result, cached
counter, blob scan, or adjacent task event is insufficient. The resumer starts
only at the durable `resumeAnchor`, rechecking authority, source, policy, lock,
approval, and budget state.

## Failure Categories And Safe Diagnostics

CF-1 maps result categories to the existing failure taxonomy only where
compatible, without merging distinct causes. At minimum, unavailable mount,
stale authority/source, policy/allowlist mismatch, budget exhaustion,
approval-required/denied/stale, provider unavailable, tool failure, missing
provenance, secret detection, and persistence uncertainty remain separately
inspectable.

Diagnostics contain a safe category, opaque run/task/attempt IDs, policy and
authority hashes, event/artifact hashes, bounded counts, and fixed safe next
action. They do not echo untrusted tool IDs/versions, model output, exception
bodies, approval rationale, provider data, raw argv, paths, source bytes,
credential reference values, or secrets. A diagnostic failure never hides the
primary durable outcome or turns nonterminal state into a terminal-looking DTO.

## Deterministic Failure-Injection Obligations

Task 120, Task 136, and Lane A's A-10 acceptance must prove:

1. Every numeric ceiling rejects the next plan/observation/tool/provider/byte/
   artifact/time action before effect and preserves replayable counters.
2. Unknown, prefix-matching, version-mismatched, relabelled-side-effect, and
   over-call-count tools cannot request or execute work.
3. Replanning cannot add a tool, provider/model posture, source/context,
   approval class, automatic action, or budget; old plans stay immutable.
4. A forged, self, stale, denied, expired, cross-run, changed-preview, changed
   source/context, changed-policy, changed-lock, or changed-mount approval
   cannot execute an effect.
5. Mount loss/replacement, claim loss, provider outage, crash between request
   and checkpoint, and persistence/readback failure yield durable non-success
   and no internal fallback write.
6. Restart reads only ledger-bound records and mounted artifacts; orphan bytes
   and in-memory counters cannot resume a loop.
7. Public records/diagnostics reject unsafe object shapes and leak neither
   secret-shaped keys nor values.
8. Completion requires H-owned durable handoff readback, not tool/model success
   or task status copied from another run.

Deterministic tests remain credential-free. Later real-provider acceptance may
test a P-approved Nous path, but records only safe provider/model IDs, hashes,
event IDs, counts, categories, and fixed markers.

## Ownership, Consumers, And Sequencing

| Concern | Owner | L relationship |
| --- | --- | --- |
| Plan/observation/bounded-step policy and records | L, with T review | This design's proposed `ResidentPlanPolicy`, `ResidentPlanRecord`, `ResidentObservationRecord`, `ResidentToolStepRecord`, and terminal/resumable result freeze in CF-1. |
| Trigger descriptors, deduplication, cooldown, high-water | T, with L review | A trigger only creates provenance-bound task demand; it cannot bypass this policy or execute a loop. |
| Mount authority, disconnect, reverify, claim release/recovery | W, with R review | L consumes verified authority and stops on mismatch; it does not detect or repair mounts. |
| Provider capability, credentials, feasibility, transfer posture | P | L consumes exact verified posture and budget facts; it never resolves secrets, selects fallback, or performs transfer policy. |
| Tool gateway and approval decision/consumption | Existing gateway/approval owner, CF-1 reconciliation | L references gateway evidence but neither replaces its lifecycle nor self-authorizes. |
| Durable output, handoff manifest, readback, terminal task proof | H, with L review | L requires H's readback before `completed`; it does not write manifests or redefine H lifecycles. |
| Default runtime factory and production composition | R | R composes frozen L capability only; L never edits the factory. |
| Browser DTO parsing and presentation | U | U projects safe L state after runtime contracts merge; L grants no UI command. |
| Cross-lane failure-injection acceptance | A | A consumes merged production behavior and returns defects to owners. |
| Canonical schemas/events/versions/owners | Coordinator Task 117 | This document is pre-CF-1 input; no lane claims canonical ownership early. |

The dependency order is CF-1 contract freeze, Task 120 plan/observation
contracts plus the required W/P foundations, Task 136 bounded-loop
implementation, then R composition and vertical consumers. Handoff-consuming
verticals use H's frozen lifecycle. No consumer may treat this design as a
license to merge a shared contract or edit the default runtime factory. Every
dependent worktree rebases to the coordinator-recorded contract merge before
review.

## Review Gate And Stop Point

Before Task 104 is ready for fresh review, this document and claim must pass
the focused documentation audit, `git diff --check`, `npm run factory:check`,
and `npm run verify`. Review checks that budgets are finite/explicit,
allowlists exact, approval consumption independently revalidated, terminality
requires durable handoff readback where material exists, mount loss has no
fallback storage, records remain append-only/provenance-bound/secret-safe, and
W, H, R, T, P, U, A, and CF-1 ownership remains explicit.

This author stops after one committed Lane L specification and claim. Fresh
coordinator review and written L-spec approval are required before Task 112,
production implementation, dispatch, merge, or other lane work.
