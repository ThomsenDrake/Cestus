# Requests Detail Floating Modal Design

Date: 2026-07-04

## Purpose

The Requests detail modal successfully replaced the old right-rail detail view, but the first modal treatment reads too much like a separate screen. Investigators should feel that request detail is floating above the live Requests board, with the board still visible as spatial context behind it.

This design amends `docs/superpowers/specs/2026-07-04-requests-detail-modal-design.md`. It changes the modal treatment from a near full-screen page surface to an inset floating investigation panel. It does not change the modal's data source, accessibility contract, or PRR ledger semantics.

## Approved Direction

Use the "Inset Floating Panel" treatment selected during visual brainstorming.

The modal should remain large enough for serious investigation work, but it should visibly sit above the Requests workspace:

- The overlay dims the app less aggressively so the board remains recognizable behind the panel.
- The panel has clear margins on all viewport edges on desktop and tablet.
- The panel uses bounded height with internal body scrolling instead of stretching to full viewport height.
- The panel keeps the Cestus console style: square edges, hard borders, tactical color tokens, and dense information layout.
- Depth is allowed for this modal through a restrained custom elevation or layered border glow that makes the surface feel suspended.

## Goals

- Make the request detail modal feel like it floats over the main Requests view.
- Preserve the existing Requests card-click behavior: clicking a card opens detail immediately.
- Preserve modal semantics: `role="dialog"`, `aria-modal`, Escape close, focus trap, and focus restore.
- Preserve the existing ledger-derived `PrrDetailModel` content and all send gate, legal escalation, correspondence, evidence, diagnostics, and timeline display semantics.
- Keep the Requests right rail as Workspace Intelligence.
- Update tests and visual contracts so they protect the floating overlay rather than the old page-like full-screen treatment.

## Non-Goals

- No PRR backend, read API, projection, event contract, ledger, or ontology changes.
- No new route, deep link, or persisted modal preference.
- No redesign of Workspace Intelligence.
- No new modal content sections.
- No autonomous send, escalation, correspondence sync, or legal workflow behavior.
- No fixture-only product path changes.

## User Experience

When an investigator opens a request detail modal, the underlying Requests workspace should still be visible around the panel edges. The visible board is context only; it remains inactive while the modal is open.

The panel should feel like a focused work surface placed over the board:

- Desktop: centered panel with generous but not excessive margins, likely around the existing wide modal max width.
- Tablet: inset panel with smaller margins and internal scroll.
- Mobile: near full-screen sheet is acceptable because the viewport is constrained, but the treatment should still use the modal's floating structure where space allows.
- Header: remains fixed at the top of the panel if practical, with request ID, agency, title, and close control.
- Body: scrolls inside the panel so the overlay itself does not become a separate page.

The background should be dimmed enough to keep focus on detail, but not so dark that it disappears.

## Component Contract

### `RequestDetailModal`

The component remains responsible for:

- Rendering the selected `PrrDetailModel`.
- Showing a safe empty state when detail is unavailable.
- Moving focus into the dialog on open.
- Trapping Tab and Shift+Tab inside the dialog.
- Closing on Escape and close button.
- Restoring focus to the opener or stable fallback.
- Rendering no PRR events and mutating no ledger-backed state.

The visual contract changes:

- The outer dialog wrapper stays `fixed inset-0` so the modal owns focus and input.
- The backdrop opacity should be lower than the current near-opaque treatment.
- The panel should not use `min-h-[calc(100dvh-2rem)]`.
- The panel should use a bounded `max-h` plus `overflow-hidden`.
- The detail body should use internal scrolling.
- A specific custom elevation or glow is allowed for this modal. Generic Tailwind shadow scale classes remain disallowed across Requests surfaces.
- Rounded corners remain out of scope unless the broader Cestus visual system changes.

## Accessibility

Accessibility behavior must not regress:

- The dialog remains discoverable by role and descriptive label.
- `aria-modal="true"` remains present.
- Escape closes the modal.
- Tab focus stays inside the modal.
- Focus restoration remains covered by tests.
- Background content remains inaccessible for practical keyboard interaction while the modal is open.
- The close control remains clearly named.

The visual backdrop change must not reduce the modal's text contrast or make inactive background content appear actionable.

## Testing

Focused tests should change from "full-screen investigation dialog" expectations to "floating investigation dialog" expectations:

- The modal still has `fixed inset-0`, `role="dialog"`, and `aria-modal="true"`.
- The panel uses floating dimensions such as viewport margins, bounded `max-h`, and internal overflow.
- The panel no longer asserts `min-h-[calc(100dvh-2rem)]`.
- The modal still renders selected request detail from ledger-backed DTO data.
- Empty state, close button, Escape close, focus trap, and focus restore still pass.
- Visual-contract tests allow only the modal's explicit custom elevation or glow while continuing to block generic card-like wrappers, gradients, rounded surfaces, and generic Tailwind shadow scales.

## Factory Scope

This is a UI-only amendment to the Requests detail modal slice. The implementation plan should be one small task with explicit file bounds:

- `packages/ui/src/requests/RequestDetailModal.tsx`
- `packages/ui/test/request-detail-modal.test.tsx`
- `packages/ui/test/visual-contract.test.ts`
- A narrow claim file under `docs/agentic/claims/`
- Readiness documentation only if final verification evidence needs to be recorded

Implementation must follow the Cestus software-factory loop: claim, failing test first, targeted red command, production change, targeted green command, `npm run verify`, review, and commit.

## Risks

- Too little backdrop dimming could make the background look interactive.
- Too compact a panel could make evidence and timeline sections feel cramped.
- Custom elevation could drift into a generic card style if not constrained by the visual contract.
- Mobile cannot preserve much visible board context, so responsive tests should focus on stable dimensions and scroll behavior rather than desktop-level margins.

## Approval Record

The approved direction is option A from the visual companion: an inset floating panel that preserves serious investigation density while revealing the Requests board around the modal.
