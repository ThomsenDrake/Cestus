# Resident Agent Cockpit Design

Date: 2026-07-12

## Purpose

This design defines the Lane U browser cockpit for the one resident Cestus
agent. The cockpit is an inspectable client of mounted-workspace runtime
projections, not an agent host, a second scheduler, a provider proxy, or a
second source of truth. It lets an operator see what the resident is doing,
why it is blocked, what the next supported action would do, and whether the
portable workspace remains authoritative while the browser is closed.

The resident remains `agent_default`. Provider names, credentials,
subscriptions, harnesses, specialist run modes, browser sessions, and tailnet
devices are not resident identities. The authoritative state remains the
append-only mounted ledger and its rebuildable projections.

## Scope, Ownership, And Pre-CF-1 Boundary

This is a Wave 0A design only. It defines Lane U's required behavior and
consumer boundary; it creates no production interface, route, component,
parser, event, or shared vocabulary. All names, schemas, command codes, and
field shapes below are **pre-CF-1 proposals**. Task 117 is the only authority
that may freeze their versions, canonical owner, event binding, compatibility
rule, and idempotency semantics. An implementation must reject an assumed
interface if its CF-1 replacement differs.

Lane U owns the browser-safe cockpit consumer boundary and, after CF-1, the
U-owned parser/adapter, supervision panel, and route integration assigned by
the governing plan. It does not own the resident factory, scheduler, mounted
stores, handoff lifecycle, loop policy, triggers, provider configuration, OS
secret resolution, or acceptance fixtures.

The cockpit must not add newsroom or team features: no multi-user roster,
roles, shared hosted workspace, assignment board, organization-wide
authorization, or remote-provider administration. A tailnet connection is one
operator's remote view of the same local Cestus installation, not a shared
service.

## Product Principles And Safety Invariants

- React renders a received, parsed snapshot and derives no canonical runtime,
  claim, approval, provider, handoff, or workspace state from UI memory.
- A refresh, reconnect, restart, or second browser reconstructs the same
  visible truth from authoritative projections. Local UI state is limited to
  presentation choices such as selected section or expanded row.
- The mounted workspace identity, mounted ledger, mounted artifact store,
  policy version, high-water mark, and active locks remain authoritative. The
  cockpit must show `unavailable`, `identity-mismatch`, or
  `reverify-required` instead of offering a local substitute.
- A displayed terminal result is trustworthy only when its mounted-ledger and
  artifact/manifest readbacks prove the expected bindings. A runner return
  object, browser receipt, cache entry, or optimistic toast is not proof.
- Every status, plan, observation, trigger, command, provider fact, and
  handoff trace refers to durable provenance or is explicitly marked as
  ephemeral display state. Plans and observations remain advisory derivative
  material and do not establish accepted graph truth.
- Secret material stays outside the browser and portable workspace. The
  cockpit never receives credentials, tokens, cookies, session artifacts,
  raw prompts, prompt artifacts, raw provider payloads, raw source bytes,
  raw argv, signed URLs, local file paths, stack traces, or unredacted
  diagnostic objects.
- No visible control performs an effect not named by its command label, and
  no background UI mechanism starts, resumes, dispatches, approves, invokes a
  provider, runs a tool, or writes an artifact merely because a page rendered
  or a polling request completed.
- Provider byte transfer, PRR send, legal escalation, publication, export,
  destructive repair, sensitive disclosure, and accepted-graph mutation stay
  outside Lane U's command set and retain their independent-human approval
  gates.

## Browser-Safe Runtime Truth

The cockpit consumes one immutable `ResidentRuntimeStatusDto` snapshot per
response. The future canonical name and schema are CF-1 decisions; this
section specifies the required information, provenance, and omissions rather
than granting a wire contract early.

Every snapshot has a server-issued `snapshotId`, a projection `asOf` instant,
the mounted-ledger high-water mark, the resident ID, a parser/schema version,
and a safe freshness classification. The UI must show when a view is stale,
unavailable, or awaiting revalidation. It must not interpolate a newer state
from a prior snapshot or fabricate a next wake time.

### Required Snapshot Families

| Family | Required browser-safe truth | Required durable binding |
| --- | --- | --- |
| Workspace authority | availability, identity-verification state, safe reason category, last verified instant, ledger high-water mark, policy version/hash, and lock-verification state | mounted identity record and lifecycle/readiness projection; no mount path or device secret |
| Resident and wake | `agent_default`, supervisor phase, pause state, safe last/next wake facts, recovery/reverification requirement, and bounded health category | wake/lifecycle projection event IDs or safe projection revision |
| Orchestration | task, attempt, and run IDs; claim state; lease/claim fact; queued/retry/cancel state; safe block reason; selected specialist mode | exact task/attempt/run projection binding; a selected run never borrows detail from another run |
| Bounded loop | plan/observation summaries, step counters and remaining budgets, allowed-tool summary, suspension/terminal/resumable classification, policy version/hash | L-owned plan/observation records and source-event/provenance references after CF-1 |
| Trigger provenance | trigger family, policy version, source high-water mark, dedupe/cooldown/budget decision category, and request/decision event IDs | T-owned trigger projection; the UI does not generate prompts or trigger effects |
| Provider readiness | provider capability ID/model label when safe, feasibility/readiness category, credential-reference presence state, safe requirements, approval/budget/lock posture, and non-executable reason | P-owned readiness/configuration projection, never a secret or raw health object |
| Durable handoff | workflow/run linkage, lifecycle state, summary classification, exact material/manifest hashes when safe, event IDs, provenance/source references, readback state, resumable reason, and safe diagnostic category | H-owned ledger and mounted artifact/manifest readback; completion cannot be inferred from a service result |
| Approvals and effects | exact approval class, preview/content hash where safe, state, independent-human requirement, staleness/lock/source binding category, and effect blocked/allowed classification | approval projection and the later consuming gate; display is never approval consumption |

An absent family is not an empty object. It is a discriminated unavailable or
not-applicable state with a safe reason. Examples include a provider that has
no official harness, a wake supervisor waiting for workspace revalidation, or
a handoff whose material is unavailable. This makes an omission visible rather
than allowing a component to silently treat it as ready.

### Projection And Readback Rules

1. The local runtime constructs a snapshot only after reading the mounted
   workspace authority and the relevant rebuildable projections. It must not
   read from a browser cache, an in-memory fallback ledger, or an unmounted
   derivative store.
2. A command acknowledgement may identify a request, but the next status is
   rendered only from a fresh projection/readback. A pending command remains
   `requested` until its documented durable event and projection state are
   observed.
3. Handoff completion requires the exact recorded lifecycle event, the exact
   material receipt/hash, the manifest receipt/hash binding that material, and
   the mounted readback required by Lane H. A content hash alone, a manifest
   scan, or a client-held summary is insufficient.
4. The selected task detail is keyed by the exact `(taskId, attemptId, runId)`
   triple. A missing, stale, forged, or cross-run value invalidates the detail
   panel and produces a safe unavailable state.
5. Projection lag is presented as lag, with its high-water mark and safe
   category. The UI may offer a supported refresh/recheck request only if the
   runtime exposes one; it may not claim the ledger has caught up.

### Illustrative Pre-Freeze Shape

The following is an illustrative consumer shape, not a frozen TypeScript
declaration:

```text
ResidentRuntimeStatusDto
  snapshotId, parserVersion, asOf, mountedLedgerHighWaterMark
  resident: { agentId: "agent_default" }
  workspace: WorkspaceAuthorityView
  wake: WakeView
  selectedRun: RunView | unavailable
  triggers: TriggerView[]
  providers: ProviderReadinessView[]
  handoffs: HandoffView[]
  approvals: ApprovalEffectView[]
  supportedCommands: SupportedCommandView[]
```

`SupportedCommandView` is derived by the runtime from current mounted
authority, policy, locks, exact run binding, and approval posture. It is not a
client-side permission guess. `executable: true` means only that the named
safe command may be submitted now; it never means a provider call, tool call,
or irreversible effect has been approved or will occur.

## Supported Commands And Truthful Controls

The command surface is deliberately small. It contains durable state requests
and local setup navigation only. It contains no generic shell, arbitrary tool,
free-form prompt, raw provider invocation, ad-hoc wake, force claim, force
resume, approval, send, export, or graph-mutation command.

Each command submission must contain the command code, a server-validated
idempotency key, `expectedSnapshotId`, and where applicable the exact task,
attempt, run, workspace identity, policy hash, and selected projection
revision. The runtime snapshots and validates the plain own-data command once
before any append or await; it then rechecks current mounted identity, locks,
source/artifact state, budget, and approval posture at consumption. A stale or
swapped command fails closed with a secret-safe category.

| Proposed command | Visible label | Durable effect represented by a successful readback | Explicitly not an effect |
| --- | --- | --- | --- |
| `workspace.recheck` | Recheck mounted workspace | asks the W-owned lifecycle service to revalidate the mounted workspace identity and authority; the UI later renders its new projection | mounting a drive, choosing a different workspace, writing a fallback, or resuming work |
| `wake.pause` | Pause new wake claims | records/consumes the W-owned pause request so no new wake claim proceeds after readback | stopping an already approved external effect, deleting work, or cancelling a task |
| `wake.resume` | Resume eligible wake processing | requests W-owned recovery only after current workspace authority revalidation; a future wake remains policy/scheduler controlled | bypassing a workspace mismatch, claim lease, budget, approval, or provider requirement |
| `task.retry.request` | Queue retry | records a retry request for the exact eligible task/attempt; the scheduler may later claim it through normal policy | running the specialist now, creating a new resident, or changing its policy |
| `task.cancel.request` | Request cancellation | records a cancellation request for the exact task/attempt; UI remains requested until orchestrator readback confirms state | a claim that running work was instantly stopped or that external effects were reversed |
| `provider.setup.open` | Open local provider setup | opens the P-owned, platform-local setup flow after a local-origin and operator-presence check; the next UI state is a secret-safe readiness projection | accepting a credential in the browser, transmitting a secret over tailnet, registering a provider, or invoking a model |

Navigation—opening a handoff, filtering a trigger, expanding an observation,
or copying a safe event ID—is not a runtime command and must not be styled as
one. Likewise, an approval queue item may link to the separately governed
approval experience but is rendered as “requires independent human approval,”
not as an approval button inside the resident cockpit.

### Command Presentation Rules

- Render a command only when the parsed `supportedCommands` entry names it.
  Do not synthesize an enabled control from a nearby state such as `ready`.
- The button text must match the table above. In particular, “Queue retry” is
  not “Run retry,” “Request cancellation” is not “Cancelled,” and “Resume
  eligible wake processing” is not “Start the agent.”
- Show safe prerequisites and denial categories beside disabled commands:
  workspace unavailable, identity revalidation required, stale snapshot,
  active lock, budget exhausted, approval required, no eligible run, or
  provider unavailable. Do not show raw server errors.
- A successful transport response changes the control to pending. Only the
  subsequent durable projection/readback changes a state label to paused,
  resumed, queued, cancellation-confirmed, or setup-ready.
- Command retry is idempotency-key based and safe to reissue after a lost
  response. The runtime, not the UI, decides whether a duplicate request is
  the same request.
- UI focus, refresh, reconnect, opening a route, and receiving a tailnet
  snapshot are read-only operations. They must never submit one of these
  commands automatically.

## Provider Setup And Secret-Safe Readiness

Provider setup is a cockpit view over the P-owned capability and secret-store
contracts. It can explain which backend is feasible and which safe action is
needed, but Lane U does not configure shared provider state or resolve a
secret.

The provider screen shows only:

- a stable provider capability ID and safe model label;
- feasibility status, including an official-flow limitation when a Codex or
  xAI harness is unavailable;
- credential-reference presence as `not-configured`, `configured`,
  `unavailable`, or `requires-local-setup`, never the reference locator or
  secret value;
- structural readiness separate from provider-invocation readiness;
- safe requirements such as an independent approval, current workspace
  verification, remaining budget, or current lock state;
- a safe readiness reason and evidence/projection revision; and
- the fact that real provider acceptance, when required, uses approved Nous
  under coordinator control and emits only safe evidence.

The cockpit must distinguish structural readiness from executable provider
invocation. A structurally sound runtime, configured credential reference, or
green-looking provider card is not a permission to transfer bytes or make a
model call. `ready-to-invoke` may be displayed only when the P/R/L/W/H-owned
preconditions that CF-1 freezes are presently satisfied; it is still a runtime
capability fact, not a command offered by this cockpit.

`provider.setup.open` is enabled only in the local desktop context after the
runtime verifies a local operator and suitable P-owned setup capability. It
opens an OS/keychain or other officially supported local flow owned by P. The
browser has no password/API-key text field, no secret paste target, no query
parameter, no URL fragment, no client persistence, and no setup response that
contains secret material. It is disabled for tailnet and mobile sessions.

No user-agent logger, error boundary, telemetry payload, accessibility label,
clipboard affordance, local storage record, or URL may receive unsafe provider
material. Provider diagnostics are projected as a small closed category plus a
safe explanation and next local action.

## Durable Handoff View And Readback

The handoff area presents completed, blocked, failed, and resumable work as
H-owned durable facts. It is not a chat transcript, a source-document viewer,
or a report/publication surface.

For each exact run, the cockpit can render a safe workflow label, lifecycle
state, produced/blocked/resumable classification, summary classification,
source-event count, safe evidence IDs/hashes, material and manifest hashes
when classified safe, relevant event IDs, readback status, causation and
correlation references, and a secret-safe diagnostic category. A human may
navigate to a separately governed domain surface where applicable; that
navigation does not confer send, escalation, export, publication, or accepted
graph authority.

The UI must visibly distinguish:

- `recorded-and-read-back`: exact mounted ledger, material, and manifest
  bindings have been verified;
- `recorded-readback-pending`: an append/request is known but terminal proof
  is absent;
- `resumable-workspace-unavailable`: work safely released after an authority
  loss and must recover through normal claims;
- `blocked-awaiting-independent-approval`: approval is a separate human
  decision and will be revalidated when consumed;
- `failed-safe`: a terminal failure category exists without exposing raw
  diagnostics; and
- `unavailable`: a requested handoff cannot be rendered because its exact
  cross-run, workspace, provenance, or readback binding did not validate.

The view never derives a durable handoff from an assistant message, output
text, blob existence, or a status returned before ledger/artifact readback.
It also never offers “retry handoff,” “send handoff,” or “approve handoff”
controls. Eligible task retry remains the explicitly labeled orchestration
request described above.

## Strict Browser DTO And Parser Boundary

The browser adapter parses the production-shaped runtime DTO, not a reduced
fixture. Its future implementation is strict by default:

1. Accept only JSON parsed into plain own-data objects and ordinary dense
   arrays. Reject non-objects, non-plain prototypes, inherited values,
   accessors/getters/setters, symbols, sparse arrays, custom array properties,
   cycles, and unexpected boxed values before reading a field.
2. Validate a versioned discriminated union with unknown keys rejected at every
   public DTO and command boundary. Each enum, ID, hash, timestamp, count,
   cross-run reference, and nullable/unavailable branch is explicit.
3. Snapshot the normalized data once, freeze the snapshot, and never reread
   caller-provided objects after an `await`. A parser must not execute a
   getter merely to create a safe error.
4. Validate parent-child equality: each selected plan, observation, command,
   approval, and handoff must bind the selected task, attempt, run, resident,
   policy/hash, and mounted workspace facts required by its family. A matching
   family name, compatible version, or run mode alone is invalid.
5. Permit only safe strings and bounded arrays/maps at the browser boundary.
   Reject fields that resemble secret-bearing values, unredacted diagnostic
   blobs, prompt text, source bytes, command argv, credential locators, or
   opaque provider payloads. The parser's safe error response is a category,
   not echoed untrusted input.
6. Treat parse failure as `unavailable` with a safe `invalid-runtime-dto`
   category. Do not fall back to a partial fixture, cached old state, or an
   implied ready view.

Route command parsers apply the same normalizer before the handler appends a
request or awaits a service. They accept only supported command discriminants,
an exact supported-command binding from the current snapshot, and the narrow
identifiers required by that command. They reject extra keys, arbitrary action
names, client-provided approval results, provider settings, paths, prompt
text, tool arguments, and authority overrides.

## Desktop, Mobile, And Tailnet Requirements

### Desktop

The desktop cockpit prioritizes a scanable runtime summary followed by
workspace/wake authority, selected task and bounded-loop detail, safe command
bar, provider readiness, durable handoffs, trigger provenance, and approval
requirements. It must keep the selected exact run visible while detail panes
change and must label stale/unavailable data at the point of use. Dense detail
can use a side-by-side layout, but no command may be concealed in hover-only
or overflow-only behavior.

Keyboard use must expose every rendered supported command, its safe reason,
and pending/readback state. Destructive-looking requests such as cancellation
require a clear confirmation describing only their recorded request; a
confirmation never promises a completed effect.

### Mobile

Mobile presents the same parsed snapshot and command capability, not a
reduced authority model. It uses a single-column, progressively disclosed
layout: workspace/wake safety and selected-run state first, then commands,
provider readiness, handoffs, triggers, and bounded-loop detail. The current
snapshot freshness and selected task/attempt/run identity remain visible when
an action drawer opens.

No control depends on hover, a desktop-only shortcut, an offscreen drag, or a
hidden tooltip. Safe reasons, approval waits, workspace mismatch, and pending
state must remain legible at narrow widths. Provider local setup is unavailable
on mobile rather than attempting a secret-bearing browser workflow.

### Tailnet

The tailnet cockpit is a remote browser view of the same local runtime and
mounted workspace. It receives only the strict browser-safe DTO and submits
only the narrow command DTOs above through the authenticated local runtime.
Tailnet reachability does not create a new resident, new workspace, or team
principal, and it does not make the browser a supervisor.

The served tailnet endpoint must use explicit device/network authentication
and encrypted transport chosen by the local deployment; it must not be exposed
as a public unauthenticated service. Perimeter identity is not a replacement
for Cestus's exact mounted-workspace, command, lock, or approval checks.

Remote tailnet sessions may view safe status and submit only runtime-supported
commands after a fresh snapshot binding. `provider.setup.open` is disabled;
secret provisioning remains local. On reconnect, the client discards its old
snapshot, reparses a fresh one, and renders unavailable until the selected run
and workspace authority are validated again. A remote disconnect never causes
the resident to pause, write alternate storage, or lose its durable claim
recovery path.

## Failure States, Safety Boundaries, And Recovery

| Condition | Cockpit behavior | Prohibited response |
| --- | --- | --- |
| Mounted workspace absent, swapped, or identity-mismatched | show the authoritative failure category; disable commands except a supported recheck; retain only safe last-known display marked stale | mounting a different workspace, copying state locally, using a cache as truth, or resuming automatically |
| Projection/readback lag or parser failure | render unavailable/stale with a safe category and exact snapshot context where safe | partial success display, inferred completion, or fallback fixture |
| Browser closes, crashes, or loses network | no runtime side effect; on return request a new snapshot | stopping the supervisor or releasing/replacing claims from browser memory |
| Provider unavailable or infeasible | show P-owned safe readiness/limitation and local setup guidance only when supported | exposing a credential, trying an unofficial token, or silently substituting another provider |
| Approval absent, stale, self-issued, swapped, or otherwise invalid | show awaiting/invalid approval category; command remains non-executable | approving from this cockpit or consuming an old approval |
| Budget, tool, policy, source, artifact, or lock mismatch | show the exact safe class and current policy/projection revision when safe | overriding policy, widening a budget, selecting a different tool, or retrying through an arbitrary command |
| Handoff persistence/readback failure | render nonterminal pending, resumable, or failed-safe state according to H/W truth | reporting completed work from an in-memory result or blob scan |

The cockpit is intentionally compatible with the resident continuing while no
browser exists. Wake, pause/resume, claim recovery, disconnect handling, and
provider/tool suspension remain W/R/L-owned runtime behavior. The UI observes
and requests narrow commands; it never hosts a durable timer, scheduler, or
execution loop.

## Acceptance And Review Gates

Task 107 is documentation-only; it does not run a provider or create a UI
test. After CF-1, Lane U's implementation and Lane A's integration work must
cover at least the following facts before production acceptance:

| Acceptance ID | Required proof | Primary owner |
| --- | --- | --- |
| U-01 | A production-shaped status route parses into the strict DTO; absent, stale, forged, accessor-backed, prototype-swapped, extra-key, sparse-array, secret-bearing, and cross-run values fail closed. | U, with A adversarial coverage |
| U-02 | Every rendered command maps to a supported route command and a durable projection/readback effect; labels distinguish requested, queued, paused, resumed, and terminal facts. | U with W/R/L routes |
| U-03 | Workspace disconnect/reconnect proves no UI or route fallback write, stale snapshot reuse, or automatic resume; mounted authority revalidation is visible. | W with U/A |
| U-04 | Provider setup renders only P-owned safe readiness; local setup never exposes secrets and tailnet/mobile disable it. | P with U/A |
| U-05 | Handoff panels show exact run/provenance/readback state and reject a swapped or terminal-looking non-readback result. | H with U/A |
| U-06 | Desktop and mobile render the same command authority and truthful unavailable/approval states with keyboard and narrow-width coverage. | U with A |
| U-07 | A served checkout tailnet inspection proves safe DTO parity, authenticated transport, reconnect reparse, local-only provider setup, and a browser-independent resident. | A with U/W/P |

The deterministic U parser/component tests remain credential-free. A real
provider is relevant only to later P/R/A acceptance and must use the approved
Nous path with safe output. Vite warnings or a production-shaped parser that
falls back to an unavailable fixture are architecture failures to investigate,
not harmless UI behavior.

## Lane Ownership, Dependencies, And Deferred Decisions

| Concern | Owner after CF-1 | Lane U role |
| --- | --- | --- |
| One resident identity, default runtime composition, mounted context/store assembly | R | consume safe runtime projection; do not edit the factory |
| Wake supervisor, workspace lifecycle, pause/resume recovery, authority revalidation | W | render W facts and submit only frozen supported commands |
| Plans, observations, budgets, tool allowlists, terminal/resumable policy | L | render advisory bounded-loop facts; never calculate or override policy |
| Trigger descriptors, dedupe, cooldown, high-water, request admission | T | render provenance/decision facts; never create prompt/effect triggers |
| Provider capabilities, readiness, configuration, credential references, secret store, official feasibility | P | render safe setup/readiness and open the frozen local setup flow only |
| Handoff manifests/material, durable readback, runtime handoff projection | H | render exact safe handoff diagnostics and no completion inference |
| Shared DTO names/versions, events, capability signatures, route ownership and compatibility | Task 117 CF-1 | propose requirements only; do not declare them canonical |
| Browser parser, adapter, cockpit state, supervision controls | U | own implementation only after frozen producers/routes are merged |
| Cross-lane failure injection, served-checkout/tailnet acceptance | A | supply consumer scenarios and accept returned defects |

Lane U begins implementation only after written U-spec approval, Task 115's
separate plan and approval, CF-1 ownership freeze, and the named predecessor
merges/rebases in that plan. The governing plan currently places U DTO/parser
preparation at Task 131 and cockpit route/panel work at Task 141; those tasks
must consume the final frozen contracts rather than this document's proposed
names.

Deferred decisions include the exact DTO/event schema version, safe summary
taxonomy, route paths, command idempotency key format, transport/session
mechanism, responsive breakpoints, tailnet deployment implementation, local
operator-presence mechanism, and provider setup invocation protocol. CF-1 and
the relevant owning lane must resolve each without weakening the requirements
above.

## Review Stop

This document and its Task 107 claim are the only Wave 0A deliverables for
Lane U. They require a fresh task review and written coordinator U-spec
approval. They do not authorize Task 115, Task 131, Task 141, any production
or test edit, provider setup/invocation, worker dispatch, shared-contract
change, or merge into `neo`.
