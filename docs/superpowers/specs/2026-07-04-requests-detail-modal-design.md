# Requests Detail Modal Design

Date: 2026-07-04

## Purpose

The Requests workspace currently shows selected public-records-request detail in the global right rail. That made sense while the workspace was fixture-driven, but the ledger-backed Requests board now has enough density that request inspection should become a focused investigation surface.

This design moves selected request detail out of the Requests right rail and into a full-screen floating modal. The Requests right rail becomes a workspace-level intelligence panel that summarizes what needs attention across the board.

## Approved Direction

The approved layout is the full-screen investigation modal option.

When an investigator clicks a request card, Cestus should immediately open a full-screen modal for that request. The board, shell, and right rail remain in the background but are visually subdued and inaccessible to assistive technology while the modal is open. The modal presents the existing request detail content in a larger reading surface.

For Requests only, the right rail should no longer display selected request details. It should become a Workspace Intelligence rail with saved-view health, due-state and risk summaries, fee/scope signals, escalation locks, and suggested next work.

## Goals

- Replace the Requests selected-detail right rail with a full-screen investigation modal.
- Preserve the current interaction rhythm: clicking a request card still inspects that request, but now by opening the modal.
- Keep Command workspace behavior intact.
- Keep detail rendering backed by the existing ledger-derived `PrrDetailModel`.
- Derive the new Requests Workspace Intelligence rail from the loaded PRR workspace DTO and existing UI view models, not from fixtures.
- Preserve send gates, legal escalation locks, diagnostics, correspondence, evidence, and timeline semantics exactly as display state.
- Keep opening and closing details as UI-only actions that append no PRR or ontology events.
- Maintain keyboard and screen-reader accessibility for the modal.

## Non-Goals

- No PRR projection, runtime, read-api, ledger, or event-schema changes.
- No autonomous send, legal escalation, correspondence sync, or mailbox behavior.
- No route-level deep linking to a selected request.
- No persisted user preference for modal state.
- No redesign of the Command workspace right rail.
- No new backend DTO requirements for the first slice.

## Current Context

`App.tsx` owns the active module, selected PRR request ID, selected PRR detail model, loaded Requests workspace DTO, and builder modal state. It currently passes `RequestDetailRail` as the `decisionRail` prop to `OpsShell` when the active module is Requests.

`RequestWorkspace.tsx` builds the Requests view model, renders the command bar, board or signal map, and reports the selected request detail back to `App` through `onSelectedRequestChange`.

`RequestDetailRail.tsx` renders all selected request detail sections and uses existing helpers from `request-model.ts`, including `sendGateArmed` and `unresolvedEscalationPrerequisites`.

`OpsShell.tsx` always renders a right rail column on desktop and below the main content on smaller screens.

## User Experience

### Request Card Click

Clicking a request card in the Requests board should:

1. Select the request ID.
2. Build or look up the corresponding `PrrDetailModel`.
3. Open the full-screen investigation modal immediately.

Closing the modal should not clear the selected request ID. The board can keep the card selected so the investigator returns to stable context.

### Modal Layout

The modal should be a full-screen overlay:

- Desktop: centered max-width investigation surface with enough room for dense reading, likely two internal columns for action/gate summary and supporting detail.
- Mobile: single-column full-screen sheet.
- Background: board, shell, and Workspace Intelligence rail stay visible only as subdued context.
- Header: request ID, agency, title, status or next-action tone, and a clear close button.
- Body: existing detail content reorganized for the larger surface:
  - Next action packet.
  - Send review gate.
  - Legal escalation lock.
  - Deadline posture.
  - Correspondence.
  - Evidence intake.
  - Diagnostics.
  - Timeline.

The modal is the only place selected request detail appears in Requests.

### Workspace Intelligence Rail

The Requests right rail should summarize the workspace rather than the selected request. It should remain useful even when no modal is open.

First-slice content should be derived from available DTO/view-model fields:

- Active saved view label and visible request count.
- Lane or severity health summary.
- Overdue or upcoming deadline count.
- Fee/scope review count.
- Appeal/escalation count or lock summary.
- Diagnostics count.
- Suggested next work, such as review drafts, inspect fee/scope requests, or triage escalation candidates.

The rail should avoid acting on individual selected request details. It can mention selected context only if that context is clearly secondary and does not duplicate the modal.

## State And Data Flow

`App` may continue to own `selectedPrrRequestId` because that state also controls card selection and detail rail replacement behavior. A new modal-open state should represent whether the selected request detail modal is visible.

`RequestWorkspace` should own the immediate click behavior by calling the selection callback and then opening the detail modal through a new callback. This keeps the board interaction local to the Requests workspace while preserving App-level state.

The detail modal should consume the same `PrrDetailModel` shape currently consumed by `RequestDetailRail`. This keeps the slice focused on presentation and shell behavior.

The Workspace Intelligence rail should consume `PrrWorkspaceData` or a Requests workspace view model derived from it. It should not import `request-fixtures.ts`, PRR runtime code, SQLite code, or Node-only modules.

Opening, closing, and keyboard navigation in the modal are local UI state only. These actions must not append ledger events or modify replayable PRR state.

## Component Design

### `RequestDetailModal`

New Requests UI component for the full-screen investigation modal.

Responsibilities:

- Render the selected `PrrDetailModel`.
- Trap focus while open.
- Close on close button and Escape.
- Restore focus to the card or button that opened it when practical.
- Apply `aria-modal`, a descriptive dialog label, and background isolation.
- Use stable responsive dimensions so content does not shift as sections load.

### Shared Detail Sections

The existing `RequestDetailRail` content can be refactored into shared presentational sections if that reduces duplication. The shared section code should remain display-only and should not own selection, adapter, or ledger behavior.

If the old `RequestDetailRail` is removed for Requests, any retained detail-section component should be named for its purpose rather than its old rail placement.

### `RequestWorkspaceIntelligenceRail`

New Requests rail component for workspace-level intelligence.

Responsibilities:

- Render workspace health and next-work signals from backend-derived DTO/view-model data.
- Avoid selected-request detail duplication.
- Handle empty or sparse workspaces gracefully.
- Remain readable in the existing `OpsShell` rail column and stacked mobile placement.

### `App` And `OpsShell`

`OpsShell` can keep its `decisionRail` prop and right-rail layout. `App` should pass:

- `DecisionRail` for Command.
- `RequestWorkspaceIntelligenceRail` for Requests.

`App` should also render `RequestDetailModal` when Requests is active, a request is selected, and the modal is open.

## Accessibility

The modal must meet the same baseline as the existing request builder modal:

- Focus moves into the modal on open.
- Escape closes the modal.
- Tab and Shift+Tab stay within the modal.
- Focus returns to the originating request card or a stable fallback on close.
- Background app content is hidden from assistive technology while the modal is open.
- The close control has an accessible label.
- The dialog label identifies the selected request or its agency/title.

The Workspace Intelligence rail should use landmarks and headings that distinguish it from request detail content.

## Error Handling And Sparse State

If a request is selected but no matching detail model is available, the modal should show a safe empty state and offer only close behavior. It should not throw.

If the workspace DTO is loading or failed, the existing Requests loading and error states remain responsible for that condition; the detail modal should not open without loaded workspace data.

If rail summaries cannot compute a category because data is sparse, the rail should show zero counts or omit that row rather than inventing signals.

## Testing

Focused tests should cover:

- Clicking a request card opens the full-screen request detail modal immediately.
- The modal renders ledger-backed detail content for the selected request.
- Close button closes the modal and returns focus to the originating request card or stable fallback.
- Escape closes the modal.
- Tab focus stays trapped inside the modal.
- Closing the modal keeps the board selection stable.
- Requests no longer render selected request detail in the `OpsShell` right rail.
- The Requests right rail renders Workspace Intelligence from backend-derived DTO data.
- Command still renders its existing `DecisionRail`.
- Builder modal behavior still works after adding the detail modal.
- Data-boundary tests continue to prevent fixture and Node-only runtime imports in product UI.
- Visual-contract tests cover full-screen modal dimensions and prevent page-scale nested-card regressions.

## Factory Scope

This should be implemented as a UI-only slice after an implementation plan is approved. It should touch Requests UI components, App/shell wiring, and UI tests. Backend PRR packages should remain untouched unless an existing DTO field is proven insufficient by a failing test and the design is amended.

Implementation should follow the repository factory contract: claim file, failing tests first, targeted red command, smallest production change, targeted green command, `npm run verify`, review, and commit.

## Open Risks

- The existing detail rail component name encodes placement. Refactoring should avoid carrying rail terminology into modal-only components.
- The Workspace Intelligence rail could become too broad. The first slice should prefer a small, legible set of summaries over a crowded analytics panel.
- The modal and builder are both full-screen overlays. Tests must verify they do not conflict when the Requests workspace is active.

## Approval Record

The approved choices were:

- Fully replace the Requests right rail detail view with a modal.
- Repurpose the Requests right rail as Workspace Intelligence.
- Open the detail modal immediately when a request card is clicked.
- Use the full-screen investigation modal layout.
