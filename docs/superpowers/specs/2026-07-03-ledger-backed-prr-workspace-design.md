# Ledger-Backed PRR Workspace Design

Date: 2026-07-03

## Purpose

This design covers the next Cestus development slice: a ledger-backed Public Records Request workspace that connects the existing Requests UI to replayable PRR and ontology events, durable local runtime data, and builder-created draft request events.

Cestus already has a strict append-only ontology ledger, a PRR backend/domain package, and a polished Requests workspace UI. The current gap is that `packages/prr/src/read-api.ts` exposes a thin queue-row DTO, while `packages/ui/src/requests/` uses rich local fixtures for lanes, cards, detail rails, signal maps, and the guided request builder. This slice closes that gap by making the product path replayable from PRR ledger events.

The first deployment target remains a single investigator laptop. The design preserves a clean path to a small newsroom or nonprofit team by keeping the runtime contract above storage implementation details and by using the existing `EventLedger` abstraction.

## Approved Direction

The approved approach is **PRR-Owned Runtime And Workspace DTOs**.

`packages/prr` should own a Node-only local runtime service around the existing ontology `EventLedger`, expand PRR projection/read models into rich workspace DTOs, and expose a testable API that can load the Requests workspace and append new draft request events. The browser UI should consume those backend-derived DTOs through a small mockable adapter boundary. It should not import SQLite, `node:sqlite`, or other Node-only runtime APIs.

The existing UI fixtures should stop being the product path. Golden PRR ledger fixtures become the source for local visual/test seed data. Any UI field without a replayable event source should render a deterministic default or explicit empty state rather than a decorative fixture value.

The guided request builder should append:

- `prr.request.created`
- `prr.deadline.estimated`

It should not append send, follow-up draft, legal escalation, learned suggestion, or team-sharing events in this slice.

## Goals

- Replace fixture-driven Requests workspace data with DTOs built from replayed PRR ledger events.
- Expand PRR projection/read models enough to drive the existing board, detail rail, signal map, and builder shell.
- Add a PRR local runtime service that works with `InMemoryEventLedger` in tests and `SQLiteEventLedger` for durable solo laptop data.
- Prove SQLite reopen/replay behavior for the PRR workspace.
- Let the builder create a replayable draft request and initial estimated deadline.
- Keep all request state append-only, causally linked, and rebuildable.
- Keep legal escalation locked behind existing event-backed gates and human confirmation.
- Make unsupported UI concepts visibly sparse instead of inventing fake events.
- Preserve a future HTTP, desktop IPC, or team-server path behind the same UI adapter boundary.

## Non-Goals

- Live Gmail, IMAP/SMTP, Himalaya, OAuth, or mailbox sync.
- A local HTTP server or desktop IPC bridge.
- Autonomous sending or autonomous legal escalation.
- New event contracts for UI-only concepts such as decorative signal-map links, learned suggestions, or saved-view collaboration.
- Full team administration, permissions, conflict resolution, or shared inbox routing.
- Deep evidence review or accepted graph assertions from PRR productions.
- Replacing the existing ontology `EventLedger` abstraction.

## Architecture

The canonical source of truth remains the append-only knowledge ledger. PRR state is projected from ledger events into deterministic read models, then mapped into Requests workspace DTOs.

The slice introduces a PRR local runtime service in `packages/prr`. The runtime depends on the existing `EventLedger` interface, not a concrete database. It can be constructed with `InMemoryEventLedger` for fast tests and `SQLiteEventLedger` for durable local laptop storage.

The UI consumes a small adapter interface rather than importing backend services directly. In this slice, the adapter can be implemented in-process for tests and local development. A future local HTTP or desktop bridge can satisfy the same interface without reshaping the Requests UI.

The intended layers are:

1. Ledger: append-only `KnowledgeEvent` storage through `EventLedger`.
2. Projection: replay events into rich PRR read models.
3. Read API: convert projections into `PrrWorkspaceDto`.
4. Runtime: load DTOs, seed empty ledgers, and append builder-created events.
5. UI adapter: provide workspace data and submit builder input to React components.
6. Requests UI: render DTOs, maintain view selection, and show sparse states honestly.

The UI may keep local constants for view controls, labels, and component state, but request facts must come from backend-derived DTOs.

## Projection And Read Models

`packages/prr/src/projection.ts` should retain more event-backed request state than it does today. The projected request model should include:

- `prrRequestId`
- lifecycle status
- request text and title seed
- jurisdiction pack reference
- agency contact
- requester contact
- latest outbound correspondence
- latest inbound correspondence
- provider/thread metadata when present
- active deadline with source, confidence, explanation, and cited rules
- fee estimate and fee challenge state
- scope narrowing proposal/acceptance state
- production batches and evidence IDs
- denial and appeal state
- possible stalling signals
- confirmed stalling state
- legal escalation confirmation state
- diagnostics tied to request IDs and event IDs
- replay-ordered timeline entries

Projection updates must be deterministic and rebuildable. Unknown or out-of-order PRR events should not invent request state. They should produce structured diagnostics where the current diagnostics helper supports it.

`packages/prr/src/read-api.ts` should grow from queue rows into rich workspace DTO builders. It may still expose smaller DTO helpers if useful, but the primary product boundary should be a `PrrWorkspaceDto` that can drive the Requests workspace without local fixture cards.

## Workspace DTOs

The workspace DTO should cover the same user-facing surfaces that the current fixture model drives:

- saved view definitions
- lane order and lane labels
- agency-grouped board lanes
- request cards
- selected request details
- next action packets
- send gate checks
- legal escalation gate checks
- correspondence summaries
- evidence intake packets
- diagnostics and repair hints
- replay timeline
- signal map model
- guided builder model

DTOs should be plain serializable data with stable field names. They should not expose mutable maps or runtime-only objects to the UI.

The default saved views remain:

- `All active`
- `Overdue`
- `Florida fees`
- `Productions arrived`

Saved views are deterministic presets in this slice. User-created saved views and shared saved views require explicit event semantics in a future slice.

## Deterministic UI Semantics

The read API can derive UI concepts only from event-backed facts and jurisdiction pack logic.

Lane derivation:

- `drafting`: created but not sent.
- `ready-to-send`: only if existing event-backed draft/review state can prove readiness; otherwise drafts stay in `drafting`.
- `awaiting-agency`: sent or acknowledged without a stronger action state.
- `needs-follow-up`: deadline pressure or possible stalling without fee/scope, production, denial, appeal, or legal escalation priority.
- `review-fee-scope`: fee estimate, fee challenge, or scope narrowing pressure.
- `production-arrived`: production batches exist and the request is not closed.
- `appeal-escalation`: denial, appeal, confirmed stalling, or legal escalation confirmation.

Severity derivation:

- `critical`: confirmed stalling, appeal/escalation posture, or severe unresolved diagnostics.
- `high`: possible stalling, overdue deadline, denial, high fee pressure, or deadline-critical state.
- `medium`: production arrived, active fee/scope review, or normal pending action.
- `low`: draft or quiet active request without pressure.

Action packet derivation:

- Drafts should ask for request review or completion.
- Sent/acknowledged requests should show waiting or follow-up posture based on deadlines and correspondence.
- Fee/scope states should ask for fee/scope review.
- Productions should ask for evidence classification or intake review.
- Denials/appeals/escalation states should keep legal posture explicit and gated.

Gate derivation:

- Send gates must remain locked unless event-backed checks prove draft body, recipients, subject, citations, attachments, risk review, and provider readiness as applicable.
- Legal escalation gates must require confirmed deadline basis or user-confirmed stalling, cited jurisdiction guidance, correspondence evidence, and explicit user confirmation.

Signal map derivation:

- Agency nodes can be derived from agencies present in visible request cards.
- Node tone can be derived from the highest severity request for that agency.
- Node summaries can be derived from counts and dominant pressure.
- Signal-map edges should be empty unless there is event-backed relationship or pattern evidence. The UI should show the accessible list and a sparse map rather than fake links.

Builder derivation:

- Builder steps are deterministic: jurisdiction pack, agency/contact, request scope, delivery channel, deadline estimate, review/send gate.
- Jurisdiction pack options come from shipped PRR jurisdiction packs.
- Learned suggestions should be empty until learning/playbook events exist.
- Pack-provided template guidance can appear only when it comes from existing jurisdiction pack metadata.

## Local Runtime Service

The PRR local runtime should expose a small API:

- `loadWorkspace()`: reads all ledger events, builds the PRR projection, and returns the current `PrrWorkspaceDto`.
- `createDraftRequest(input)`: appends `prr.request.created`, calculates the estimated deadline from the selected jurisdiction pack, appends `prr.deadline.estimated`, and returns the rebuilt workspace DTO plus committed event IDs.
- `seedIfEmpty(events)`: explicitly installs golden PRR ledger events into an empty ledger for local demo/test data.
- `readEvents()`: available for tests and diagnostics, not the normal UI product path.

The runtime should use the existing `EventLedger` interface. It should not depend on `SQLiteEventLedger` directly except in construction helpers or tests that prove durable reopen/replay behavior.

`seedIfEmpty(events)` must be idempotent. It should append seed events only when the ledger has no events. It should never overwrite, delete, or rewrite existing events.

## Builder Write Flow

Builder submit should collect enough user-reviewed input to create a draft:

- selected jurisdiction pack
- agency name and optional contact fields
- requester name and optional contact fields
- request text/scope
- received/sent basis timestamp for the initial deadline estimate
- actor metadata for the local user or system actor, depending on the command source

The runtime then appends:

1. `prr.request.created` on stream `prr_<id>` with expected next sequence `1`.
2. `prr.deadline.estimated` on the same stream with expected next sequence `2` and `causationId` pointing to the created event.

The deadline estimate uses `calculateEstimatedDeadline` and the selected jurisdiction pack. Federal FOIA estimates remain statutory estimates. Florida estimates remain workflow estimates unless a future human confirmation event changes the deadline source.

The builder should close only after the runtime confirms append and reload. The new draft should appear in the board from replayed events, not optimistic local fixture mutation.

## Partial Failure Behavior

Append-only semantics matter more than transactional convenience.

If `prr.request.created` succeeds but deadline calculation or `prr.deadline.estimated` append fails, the runtime must not delete or mutate the created request event. It should return an inspectable partial result that includes:

- the created event ID
- the failed step
- a diagnostic message safe for display
- allowed repair actions
- the rebuilt workspace DTO

Replay should show the draft request even without a deadline. The UI should render a sparse deadline posture such as no estimated deadline rather than hiding the request.

If `prr.request.created` fails validation, no event is appended and the user sees a validation diagnostic.

If concurrency fails because the request stream already exists, the runtime should return a conflict diagnostic and avoid retrying with a different sequence unless the user explicitly creates a new request ID.

## UI Adapter Boundary

The UI adapter should be small and mockable:

- `loadRequestsWorkspace(): Promise<PrrWorkspaceDto>`
- `createDraftRequest(input): Promise<CreateDraftRequestResult>`

React components should accept DTO-shaped data and callbacks. They should not know whether data came from in-memory events, SQLite, HTTP, desktop IPC, or tests.

`packages/ui/src/App.tsx` and `packages/ui/src/requests/` should stop importing `request-fixtures.ts` as the product data path. Any remaining fixture files should be clearly test-only or replaced by generated DTOs built from golden ledger events.

The UI may keep local state for selected saved view, selected request ID, signal-map mode, modal open state, and form editing. It should reload or update from runtime DTOs after successful writes.

## Golden Fixtures

The golden PRR ledger fixture should expand to cover the states that are currently represented only by UI fixtures:

- draft with estimated deadline
- sent/awaiting agency
- acknowledged with deadline posture
- possible stalling
- confirmed stalling
- fee estimate and optional fee challenge
- scope narrowing proposal
- production received with evidence IDs
- denial recorded
- appeal created
- projection diagnostic

Fixture events must validate through the ontology contracts. They should be usable by projection tests, read API tests, runtime seed tests, and UI adapter tests.

Fixture richness should come from events, not hand-authored UI cards.

## Error Handling And Diagnostics

Errors should become inspectable state or explicit runtime results.

Important diagnostic categories for this slice:

- invalid builder input
- unsupported jurisdiction pack
- failed deadline calculation
- failed append due to validation
- stream concurrency conflict
- projection event before request creation
- projection state that cannot satisfy a gate
- SQLite reopen/read failure in runtime construction tests

Diagnostics must not include secrets, credentials, OAuth tokens, refresh tokens, passwords, or raw message bodies.

Read DTOs should include request-scoped diagnostics and global workspace diagnostics where needed.

## Storage And Deployment

Solo laptop mode uses SQLite through `SQLiteEventLedger`. The runtime should accept an injected `EventLedger` so tests and future team storage can satisfy the same logical contract.

The design does not introduce an HTTP server. A later deployment slice can put local HTTP, desktop IPC, or a team service behind the UI adapter without changing PRR projection semantics.

No migration or destructive storage operation belongs in this slice.

## Testing Requirements

Implementation should be test-driven.

Projection tests should verify:

- expanded golden PRR ledger events validate.
- projection rebuilds rich request state from replay.
- confirmed deadlines override estimates.
- estimates do not override confirmed deadlines.
- fee, scope, production, denial, appeal, stalling, escalation, diagnostics, and timeline state rebuild deterministically.
- caller mutation cannot change projected state.

Read API tests should verify:

- `PrrWorkspaceDto` includes lanes, saved views, cards, detail records, builder model, signal map nodes, diagnostics, and timeline data.
- unsupported learned suggestions are empty.
- unsupported signal-map edges are empty.
- cards and detail records are derived from replayed events.
- lane, severity, action packet, and gate semantics follow the approved deterministic rules.

Runtime tests should verify:

- `loadWorkspace()` builds DTOs from an in-memory ledger.
- `loadWorkspace()` builds the same DTOs after SQLite close and reopen.
- `seedIfEmpty()` is explicit and idempotent.
- `createDraftRequest()` appends exactly `prr.request.created` and `prr.deadline.estimated`.
- appended events use expected stream sequences and causation links.
- failure after request creation leaves the created event intact and returns an inspectable partial result.

UI adapter and UI tests should verify:

- Requests no longer use local PRR fixture cards as the product path.
- App/Requests workspace render from backend-derived DTOs.
- Builder submit calls the adapter and renders the new draft after reload.
- sparse unsupported fields are visible and professional.
- existing send and escalation gate tests still pass with ledger-backed DTOs.

Every implementation task should run a focused targeted test command and then `npm run verify` before committing.

## Factory Execution Expectations

The implementation plan should split this design into small work orders with:

- one measurable outcome per task
- explicit allowed files
- required reading
- failing test first
- exact targeted failing command
- production change
- exact targeted passing command
- `npm run verify`
- commit
- review handoff
- rollback and escalation criteria

Autonomous execution must stop on:

- schema conflict with ontology or PRR event contracts
- storage changes that risk data loss
- live credential requirements
- live mailbox requirements
- legal language that appears to unlock escalation without human confirmation
- verifier failure after two focused repair attempts
- visual overlap that cannot be fixed inside the task scope

## Invariants

- The ledger is append-only.
- Corrections and state changes are new events, never mutations.
- PRR projections are rebuildable from ledger events.
- UI state that affects request meaning is derived from replayed DTOs.
- Builder-created requests are durable before they appear as product state.
- Legal escalation is never autonomous.
- Send actions are never autonomous.
- Diagnostics are inspectable and secret-safe.
- Unsupported product concepts render sparse states rather than fake data.

## Implementation Defaults

The implementation plan should use these defaults unless a verifier exposes a concrete blocker:

- Shared workspace DTO types live in `packages/prr/src/read-api.ts` and use names rooted at `PrrWorkspaceDto`.
- PRR runtime types and services live in a new `packages/prr/src/runtime.ts` module unless the plan splits runtime construction helpers into a neighboring file.
- The UI adapter lives under `packages/ui/src/requests/` and imports only serializable PRR DTO types plus adapter functions, not SQLite or Node-only runtime code.
- SQLite database paths are injected into runtime construction. Tests use temporary paths. Any local development helper must take an explicit path rather than hiding a global data location.
- `packages/ui/src/requests/request-fixtures.ts` stops being imported by product code. It should either be removed or moved to test-only support after golden-ledger DTO helpers replace it.

These defaults are implementation-shape choices, not product-direction escape hatches. They must preserve the approved direction above.
