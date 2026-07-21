# Resident Agent Acceptance Architecture Design

Date: 2026-07-12

## Purpose

This Lane A specification defines the cross-lane acceptance architecture for
the resident-agent full-vision program. It proves the resident through real
mounted storage, fresh-process recovery, controlled failure injection, a real
approved Nous invocation, browser-safe runtime truth, and a served-checkout
tailnet inspection. It tests the production composition after its owning lanes
merge; it does not replace those lanes' focused tests or repair their code.

The acceptance subject is one resident, `agent_default`, operating one verified
portable workspace. A provider, model, credential reference, subscription, or
harness remains a backend and cannot become a resident identity, storage
authority, or approval authority.

## Scope, Non-Goals, And Pre-CF-1 Boundary

Lane A owns only integrated acceptance architecture, fixtures, invocation
posture, failure-injection expectations, safe evidence, and later acceptance
test files assigned after the coordinator's contract freeze. This specification
does not freeze shared contracts, event names, DTO versions, capability
signatures, parser versions, test paths, fixture APIs, or production ownership.
Those are CF-1 decisions made from all approved lane specifications.

This document requires the later acceptance plan to cover the matrix cases
`A-01` through `A-10`. It neither edits the append-only matrix nor treats the
matrix's provisional commands as a production API. CF-1 may resolve a name or
fixture boundary only when it preserves every assertion in this specification
and records the owner, consumer, version, compatibility rule, and cross-lane
command.

Lane A does not introduce newsroom/team scope, multi-user authorization,
shared-workspace hosting, accepted ontology mutation, autonomous send,
escalation, export, publication, destructive repair, sensitive disclosure, or
an unrestricted loop. It does not provision credentials or invoke a provider
during Task 108.

## Governing Acceptance Invariants

- The mounted workspace identity, canonical ledger, artifact store, policy,
  and active locks are authoritative. There is no internal fallback ledger,
  projection, artifact, derivative, handoff, cache, temporary-file, or
  alternate-workspace write.
- Ledger facts remain append-only and every projection remains rebuildable from
  ledger events and exact mounted artifacts. Test instrumentation may observe
  writes, but it cannot become an acceptance source of truth.
- A provider return, a runner DTO, a cached artifact, or an adjacent completed
  task is not completion evidence. Completion requires the exact durable
  handoff/ledger readback owned by Lane H and a causally compatible task path.
- Every task, plan, context, approval, provider invocation, observation,
  artifact, and handoff used as evidence binds the same resident, task,
  attempt, run, mounted authority, policy, source/context artifacts, and
  causation/correlation chain. Cross-run, stale, swapped, or missing facts fail
  closed.
- Public inputs and all injected boundary values are plain own-data snapshots
  before an append, mounted write, provider call, or `await`. Hostile object
  shapes, accessors, symbols, sparse arrays, and secret-shaped values are
  rejected without retaining unsafe material.
- Deterministic acceptance remains credential-free. Only the coordinator may
  run the real approved Nous gate with an approved OS-secret-backed credential
  and independently consumable provider-byte-transfer approval.
- Diagnostics, fixture reports, browser DTOs, terminal output, screenshots, and retained evidence contain no raw prompt text, source bytes, provider bodies, credentials, or secrets.

## Acceptance Evidence Model

Every later case records an immutable, secret-safe evidence envelope. The
envelope is a test/reporting shape proposed for CF-1; it is not an event schema
and it does not add a second ledger.

```ts
interface ResidentAcceptanceEvidenceProposal {
  readonly acceptanceId: string;
  readonly verdict: "pass" | "blocked" | "failed";
  readonly executionClass: "deterministic" | "coordinator-live" | "served-checkout";
  readonly residentAgentId: "agent_default";
  readonly workspaceIdentityHash: `sha256:${string}`;
  readonly mountGeneration: string;
  readonly taskId?: string;
  readonly attemptId?: string;
  readonly runId?: string;
  readonly commandIdentity: string;
  readonly safeMarkers: readonly string[];
  readonly eventIds: readonly string[];
  readonly artifactHashes: readonly `sha256:${string}`[];
  readonly counts: Readonly<Record<string, number>>;
  readonly categories: readonly string[];
  readonly servedCommit?: string;
}
```

The later plan must serialize only data already safe for operator inspection:
opaque IDs, schema/version IDs, hashes, bounded counts, fixed markers, safe
categories, and a served commit. It must not serialize device paths, mount
details, prompt/model/output text, source/evidence bytes, approval rationale,
credential-reference detail, secret-store detail, endpoint data, headers,
commands, stack traces, or raw errors.

Acceptance has three execution classes:

| Class | Purpose | Credential posture | Durable proof |
| --- | --- | --- | --- |
| Deterministic | Covers ordinary success and every injected fail-closed boundary. | Credential-free; production selection rejects fakes. | Mounted-ledger/artifact readback, safe assertion output, and rebuildable projections. |
| Coordinator-live | Confirms provider behavior that fakes cannot prove. | Coordinator-controlled approved Nous credential only; no credential enters portable state or test output. | Safe provider/model IDs, hashes, event IDs, counts, categories, and durable-handoff readback marker. |
| Served-checkout | Verifies the exact rebuilt checkout that is served over the tailnet. | No portable secret in the browser or inspection record. | Served commit, route/DTO observations, supported-control effects, desktop/mobile observations, and safe availability state. |

A deterministic failure is a passing acceptance result when it proves the
specified safe blocked, failed, or resumable outcome and no forbidden effect.
An unavailable mandatory live dependency is `blocked` with its safe evidence;
it is never rewritten as a deterministic pass.

## Mounted Workspace And Fresh-Process Restart Acceptance

`A-01` proves mounted-workspace restart, and `A-02` proves disconnect and
reconnect. Their fixture must use a real on-disk mounted ledger and mounted
artifact/derivative/handoff stores rather than a test-only in-memory store.
The fixture root is disposable test storage, but every production operation
must receive the mounted authority path selected by the runtime; it may not
substitute a memory object after the first process exits.

### A-01: mounted state and restart

The success path creates work through the production task entry boundary,
claims it as `agent_default`, records the bounded/advisory state required by
the selected workflow, and reaches a handoff path only through mounted writes
and exact readback. Before restart, acceptance captures only safe durable
anchors: workspace identity hash, mount generation, ledger high-water,
policy/lock hashes, task/attempt/run IDs, event IDs, and material/manifest
hashes.

The original runtime then terminates and discards all in-process objects. A
fresh child process starts from disk and reconstructs state only from the
mounted authority. It must show the same task/claim, plan/observation where
applicable, verified context binding, handoff lifecycle, and terminal or
resumable posture from ledger replay plus exact mounted artifact readback. It
must reject an in-memory-only continuation, orphaned bytes, a caller-supplied
result, a copied status from another run, or an unbound legacy handoff as
evidence of completion.

The test harness includes an instrumented internal fallback sentinel around
all non-mounted ledger, projection, artifact, derivative, handoff, cache, and
temporary-file writers. `A-01` passes only when that sentinel reports zero
writes and the fresh child process proves durable readback. The sentinel is an
observer: it cannot manufacture state or mask a mounted write failure.

### A-02: disconnect, identity mismatch, and reconnect

Injection occurs before each durable boundary that could otherwise create work:
claim, provider transfer, tool execution, derivative write, material write,
manifest write, recorded handoff append, and resumption. On disconnect or
identity mismatch, the resident stops new work, releases/checkpoints an active
claim through the existing append-only lifecycle where the mount remains
writable, and yields a safe resumable `workspace-unavailable` result. It does
not write a fallback copy when the mount is unavailable.

Reconnect does not restore authority from a cached object. Before normal claim
recovery it must reverify the same workspace identity, ledger high-water mark, mounted artifact store, policy, and active locks. A changed identity, stale high-water mark, swapped store, changed policy, or changed lock remains blocked/resumable and cannot resume a prior attempt synthetically. The acceptance report proves zero fallback-sentinel writes for every injected path.

## Failure-Injection Architecture

Lane A exercises production behavior through frozen public/runtime contracts;
it does not stub away the producer being tested. Each injector has one precise
boundary, an expected durable outcome, a negative assertion that no prohibited
effect occurred, and safe readback evidence after a fresh process where state
survives a crash.

| Injection family | Required cases | Required result | Forbidden result |
| --- | --- | --- | --- |
| Mount and authority | Unmount, identity/store swap, stale high-water, changed policy/locks before and after `await`. | No claim/effect/write or a mounted-ledger resumable checkpoint; zero fallback writes. | Cached-authority continuation, internal persistence, or provider/tool call. |
| Restart and persistence | Crash after final output, after material, after manifest, after prepared, after recorded, and before a claim checkpoint. | Replay yields `output-persisted`, `handoff-pending`, verified recorded state, or another exact non-success state as the boundary dictates. | Blob scan, DTO synthesis, terminal success before durable readback, or in-memory counter reuse. |
| Approval races | Forged/self actor, stale/expired/revoked decision, cross-run/provider approval, changed preview/context/source/policy/lock/mount. | Independent human approval is re-read and rejected before transfer/effect; safe blocked or resumable evidence. | Self-approval, reuse of an old preview, or an external effect. |
| Provider and budget | Nous outage, missing binding, byte-transfer denial, changed capability/ref, request/byte/time/output ceiling exhaustion. | Exact unavailable/blocked/failed/resumable category and replayable counters. | Substitute provider/model/credential, fabricated success, or budget reset. |
| Provenance and handoff | Swapped/stale source/context/output, corrupt/missing manifest or artifact, cross-run DTO, sequence conflict, terminal-before-recorded. | Safe inconsistency/provenance/lifecycle diagnostic and non-executable result. | New substitute bytes, arbitrary run selection, or `task-completed`. |
| Boundary safety | Accessor/prototype/symbol/sparse-array input and secret-shaped keys/values or raw provider text. | Rejection before durable effect, with safe fixed category only. | Getter execution after validation, retained unsafe value, or secret leakage. |
| Browser boundary | Forged, stale, absent, cross-run, or secret-bearing production-shaped route DTO. | Strict parser rejects/marks unavailable without rendering an executable control. | Partial parse, another run's data, or browser-side state reconstruction. |

`A-10` is the integrated adversarial suite. It reuses the focused producer
tests from L, H, P, R, W, and U after their merged contracts are available, then
adds only cross-boundary assertions that no focused owner can prove alone. A
failure is reported with the acceptance ID, safe category, durable anchors,
and owning lane; Lane A does not patch the producer without a separately
authorized repair range.

## Coordinator-Only Real Nous Provider Gate

`A-03` is the mandatory real-provider reference gate. Its deterministic
counterpart is credential-free; the live invocation runs only in a
coordinator-controlled environment via the approved live command (currently
planned as `npm run agent:nous:smoke`) against a real approved Nous provider.
Task 108 neither invokes that command nor accesses credentials.

The live gate requires all of the following before network I/O:

1. A verified mounted workspace bound to `agent_default`, one exact task,
   attempt, run, workflow descriptor, policy, active locks, sources, and
   context packs.
2. A current policy selection for the exact Nous provider/model/capability and
   a healthy typed reference resolved only through approved OS secret storage.
3. A production prompt artifact or typed input boundary tied to the exact run;
   raw prompt resolvers, placeholders, caller text, and broader evidence
   readers are rejected.
4. An exact independently approved provider-byte-transfer preview. Consumption
   rechecks the independent human approval, preview hash, causation,
   workspace/mount, provider/model/ref, prompt/context/source hashes, budget,
   policy, locks, and run state.
5. A bounded advisory workflow that keeps output proposal/draft-only and
   reaches completion only after mounted material, manifest, ledger, and task
   lifecycle readback.

The command emits only a fixed status marker, Nous provider/model IDs,
capability/prompt/input/output/manifest hashes, safe event IDs, context-pack
IDs, bounded counts, categories, and a durable-readback marker. It emits no
prompt text, source or evidence bytes, output body, credential/ref value,
secret-store data, endpoint, header, raw response, raw error, or command line.
An outage, missing OS binding, denied or stale approval, mount loss, budget
exhaustion, or failed readback is an honest safe blocked/unavailable/resumable
outcome; it never selects another backend or records a false pass.

## Durable Handoff And Provenance Readback

For `A-01`, `A-03`, `A-04`, `A-05`, and `A-06`, acceptance distinguishes
output existence from a durable handoff. It requires the H-owned sequence:
exact mounted derivative/output readback, exact material readback, final-output
ledger binding, exact manifest readback bound to that material, prepared and
recorded handoff replay/readback, then a causally compatible run/task
transition. The harness must prove that a terminal-looking runner return,
provider success, status copied from another run, or final-output artifact
alone cannot report completion.

The authoritative projection must remain rebuildable after a fresh process.
The report records only safe hashes and event IDs needed to demonstrate one
path. It rejects missing, corrupt, swapped, stale, or cross-run artifacts;
sequence conflicts are visible rather than retried as a different handoff.
Historical unbound handoff material is inspectable only as non-executable and
cannot produce a provenance DTO, a resume action, or task completion until a
separate append-only authority-bound migration succeeds.

Each workflow retains its existing safety boundary:

- PRR work produces a reviewed local draft, never a send, follow-up, or
  escalation.
- Investigation planning produces advisory planning/gap material, never hidden
  execution or accepted graph truth.
- Ontology bootstrap remains evidence-first and proposal-only; a handoff never
  turns legacy data or model output into accepted ontology state.
- Evidence triage, timeline, contradiction, and report outputs remain sourced
  advisory material subject to their later domain review/effect gates.

## Browser DTO, Browser-Closed, And Tailnet Acceptance

`A-09` validates a browser against production-shaped runtime route payloads,
not reduced fixtures. U owns parsing and presentation after the runtime routes
and DTO producers merge. The test must show that safe lifecycle, mount,
provider readiness, bounded-plan/observation, trigger, claim, and handoff facts
derive from the runtime projection, preserve run/task association, and reject
stale, forged, absent, secret-bearing, and cross-run values.

React receives no manifest bytes, raw artifact/provider/prompt/source content,
capability registry, credential state, or canonical execution state. Every
visible control invokes only a route command actually supported by the merged
runtime; labels must name the exact effect (for example pause, resume, retry,
or cancel) and may not present an approval request or lifecycle append as an
executing operation. Browser acceptance includes the browser-closed condition:
closing the browser must not end the W-owned supervised resident; subsequent
safe runtime projection/readback proves whether it remains running, paused, or
resumable.

Tailnet inspection runs from the served checkout, not a source checkout or a
development server. The coordinator rebuilds the exact commit that is served,
records that served commit in safe evidence, and inspects desktop and mobile
views plus tailnet route behavior. It verifies route/DTO parity, supported
control semantics, workspace-unavailable visibility, no secret/mount leakage,
and that the browser is an observer/controller rather than the resident's
process host. A stale build, a different served SHA, an unavailable route, or
a DTO parser fallback is a blocked/failing deployment gate, not a visual pass.

## Secret-Safe Evidence And Diagnostics

All deterministic fixtures use synthetic opaque IDs and fixed non-secret data;
they must not encode a real provider response, local filesystem location,
credential-like string, prompt, source bytes, or production artifact body.
Test logs and snapshots assert both values and keys: a safe DTO may use provider
or approval labels as schema terms, but it cannot retain secret material,
getter-backed values, raw errors, command text, headers, endpoints, paths, or
credential-reference values.

Safe failure evidence contains an acceptance ID, category, retry posture,
opaque task/attempt/run IDs, event/artifact hashes, bounded counts, policy and
authority hashes, and fixed next-action marker. If the mounted ledger is not
writable, bounded ephemeral diagnostics are allowed solely for the active
process and must not be copied to internal storage. They cannot convert a
nonterminal state into a completion DTO.

Live and served-checkout artifacts are minimized and retained only through the
existing approved operator process. Screenshots, if used, must be reviewed for
secret-safe visible content before attachment. A test that detects leakage
fails before recording the unsafe subject; it reports only the fixed
`secret-safety-rejection` category and non-sensitive context.

## Acceptance Ownership, Defect Routing, And CF-1 Inputs

Lane A consumes merged production behavior and defects return to the owning
lane. The following allocation is binding for acceptance planning but does not
supersede CF-1's canonical file ownership:

| Concern | Producer/owner | Lane A acceptance responsibility | Lane A must not do |
| --- | --- | --- | --- |
| Default runtime assembly, mounted context/prompt/runner/store composition | R | Prove assembled behavior uses one verified mounted authority and no alternate factory or store. | Edit the default factory or redefine prompts/context/runner contracts. |
| Durable handoff manifests, readback, projection, diagnostics | H | Prove fresh-process readback, failure states, provenance, and browser-safe projection inputs. | Redefine manifest lifecycle, write a compatibility store, or declare a handoff terminal. |
| Wake supervision, disconnect/reverify, claim release/recovery | W | Prove browser-independent lifecycle, disconnect/reconnect, and no-fallback posture. | Detect mounts, own process supervision, or alter claim lifecycle. |
| Plans, observations, budgets, allowlists, approval suspension | L | Prove ceilings, approval races, restart recovery, and bounded non-success outcomes. | Change policy, tool gateway, budget, or approval contracts. |
| Trigger demand, deduplication, cooldown, high-water | T | Prove `A-05` request idempotency and no-prompt/no-effect boundary. | Run a model, execute domain work, or redefine trigger selectors. |
| Capability, credential reference, secret store, feasibility, provider configuration | P | Prove credential-free parity and the coordinator-only Nous gate's safe posture. | Resolve/provision secrets, select a fallback, or alter provider configuration. |
| Runtime routes, browser parser/presentation, responsive cockpit | U | Prove production DTO parity, safe controls, browser-closed observation, and served UI behavior. | Create canonical state, bypass routes, or implement provider/runtime behavior. |
| Shared event/DTO/version/file-owner reconciliation | Coordinator CF-1 | Supply cross-lane acceptance requirements and vocabulary clashes. | Publish canonical schemas or resolve another lane's conflict. |

The coordinator assigns every failure to one owning lane with the acceptance
case, reproduction command, safe evidence anchors, and relevant merged SHA.
Lane A may add or correct an acceptance test only under a separately approved
Task 116-era range; a producer fix requires a scoped repair owned by that
producer and a fresh acceptance re-run. This is the rule that defects return to the owning lane rather than accumulating hidden integration repairs in Lane A.

The CF-1 acceptance input must reconcile: mounted-authority identity and
generation facts; task/attempt/run bindings; safe outcome/failure categories;
approval-preview identity; handoff readback anchors; provider-safe evidence
fields; browser DTO version/parsing boundary; fixture isolation; and the
served-checkout recording format. Any conflicting field, ownership overlap, or
loss of an invariant is non-dispatchable until the coordinator records the
resolution.

## Integrated Matrix Coverage

| ID | Integrated scenario | Primary proof | Primary owning lanes |
| --- | --- | --- | --- |
| A-01 | Mounted workspace restart | Fresh disk-backed runtime reconstructs task, claim, plan/context, handoff, and lifecycle from exact readback. | R, H, W, L |
| A-02 | Disconnect and reconnect | No fallback write; identity, high-water, store, policy, and locks reverify before recovery. | W, R, H |
| A-03 | Real Nous portable evidence triage | Coordinator-live safe provider evidence and durable advisory handoff readback. | P, R, L, H |
| A-04 | Legacy import to proposal | Evidence-first source/content-hash binding and proposal-only handoff. | H, L, R |
| A-05 | PRR trigger to draft | Deduplicated/cooldown/budgeted task request and local draft handoff with no send. | T, L, H |
| A-06 | Planning and contradiction discovery | Bounded, provenance-bound advisory results with handoff readback. | L, H, P |
| A-07 | BYOK and local model | Exact capability/readiness parity and no implicit model fallback. | P |
| A-08 | Subscription feasibility | Official-flow pass or durable safe unavailable evidence, with no token extraction. | P |
| A-09 | Cockpit and tailnet | Production route DTO parity, supported controls, browser-closed supervision, desktop/mobile served-checkout inspection. | U, W, R, H |
| A-10 | Adversarial failures | Forged approval, stale source, duplicate claim, budget, crash, secret, and cross-run paths fail closed. | L, W, H, P, R, U |

## Sequencing, Review Gate, And Stop Point

Acceptance implementation begins only after CF-1 is merged, relevant producer
tasks are merged, and the acceptance worktree is rebased to the recorded
contract and producer SHAs. The later plan names exact owned test files,
fixtures, RED/GREEN commands, deterministic cases, coordinator-live invocation,
served-checkout procedure, cleanup, and rerun rules. It must run targeted
credential-free checks, `git diff --check`, `npm run factory:check`, and
`npm run verify`; live and tailnet evidence occurs only in the coordinator
environment after the served checkout is rebuilt.

Stop and return a defect or escalation on hidden fallback storage, data-loss
risk, mount identity conflict, schema/DTO/event/file-owner conflict, synthetic
handoff or readiness, stale/swapped provenance, self/stale approval
consumption, secret leak, unofficial token extraction, unavailable mandatory
Nous gate, incorrect served checkout, or two focused verifier failures. An
acceptance test never weakens an invariant merely to accommodate a current
producer.

This Task 108 artifact stops after one committed Lane A specification and
claim. Fresh independent review and written coordinator A-spec approval are
required before any acceptance implementation plan, test implementation,
provider invocation, Task 116 work, merge, or other lane work.
