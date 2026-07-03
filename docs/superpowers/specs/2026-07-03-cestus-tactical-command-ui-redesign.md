# Cestus Tactical Command UI Redesign

Date: 2026-07-03

## Purpose

This design replaces the first Command workspace visual direction. The previous UI draft was structurally useful, but visually landed as a generic dark dashboard with light cyber styling. The revised direction is an always-on tactical product console: strongly inspired by the in-universe computer interface language of Neon Genesis: Evangelion, translated into a civic accountability tool that remains usable for long investigative sessions.

The design covers the broader Cestus home and Command workspace shell. The PRR workspace UI remains a later slice, but this shell must be strong enough to host PRR, evidence, ontology, ingestion, and agent workflows without another visual reset.

## Approved Direction

The approved direction is **Tactical Product Console**.

Key decisions:

- The NGE-like intensity is always present across the workspace, not only during alarm states.
- Cestus should feel like an accountability command room that happens to be usable software.
- The implementation should keep real product structure under the tactical atmosphere: stable navigation, readable rows, clear actions, responsive layouts, and accessible controls.
- Cestus should not copy protected names, logos, symbols, or exact screen compositions. It should borrow the interface qualities: hard geometry, vector-like linework, radar/scan fields, dense status language, red-orange alarm framing, amber operational text, and green/cyan machine-state signals.

## Research Basis

This redesign is informed by two reference families.

NGE and retro-future interface references:

- Zemnmez, "Why We Don't Have UIs Like the ones in Neon Genesis": NGE interfaces feel rooted in CRT/vector display logic, radar-like graduations, line primitives, phosphor glow, geometric forms, and nonstandard screen structure.
- ASTROMONO, "The Amazing UI Design of Evangelion": NGE interface sequences use simple geometric shapes, fast status animation, diagrams, Venn-like and curvature-like graphics, and dense technical display conventions.

Beloved product UI and usability references:

- Nielsen Norman Group visual hierarchy guidance: hierarchy must guide the eye to the most important information through contrast, grouping, color, and scale.
- Nielsen Norman Group dashboard cognition guidance: dashboards should use visual encodings that match human perception and avoid unnecessary cognitive load.
- GOV.UK design principles: start with user needs, do the hard work to make things simple, iterate, and make things accessible.
- Figma UI principles: hierarchy, progressive disclosure, consistency, contrast, accessibility, proximity, and alignment improve usability and decision-making.
- Raycast, Linear, Notion, and Stripe serve as product references for speed, calm interaction models, command-oriented workflows, and scalable design systems.

The conclusion: Cestus should use NGE-style graphic intensity as the default atmosphere, but use proven product interaction patterns for work execution.

## Goals

- Create a memorable visual identity for Cestus that feels tactical, investigative, and civic rather than generic SaaS.
- Preserve high-density operational awareness without overwhelming the user's ability to act.
- Make the Command screen useful as the daily entry point for PRR deadlines, stalled agencies, evidence arrivals, diagnostics, and agent recommendations.
- Keep components modular and legible to coding agents so future slices can extend the UI without reinterpreting the design language.
- Preserve the backend principles already established: provenance-first assertions, append-only event semantics, projection rebuildability, and explicit human review.

## Non-Goals

- Building the full PRR request workspace in this slice.
- Adding live Gmail, IMAP, SMTP, Himalaya, or public-records integrations.
- Creating a marketing page.
- Recreating exact NGE screens, logos, organization names, or protected iconography.
- Sacrificing accessibility or legibility for pure spectacle.

## Visual Language

### Core Atmosphere

The default workspace is a live tactical console.

Visual qualities:

- near-black command canvas
- red-orange structural frame
- amber operational typography
- green sync and accepted-state signals
- cyan evidence, ontology, and system diagnostics signals
- hard rectangular and angled panel geometry
- persistent vector/radar scan layer
- dense but aligned metadata
- tabular numbers, timestamps, IDs, hashes, request codes, and evidence references

The UI should feel intense even when no item is urgent. Routine states still sit inside the command-frame language. High-risk states become stronger through contrast, filled warning bands, and more assertive geometry.

### Color System

Use a constrained dark palette:

- `command-black`: page background
- `console-void`: deeper recessed areas
- `signal-red`: legal risk, deadline danger, denials, stalling escalation
- `signal-orange`: command framing, warnings, primary action
- `signal-amber`: operational labels, pending review, attention
- `signal-green`: synced, accepted, complete, healthy
- `signal-cyan`: evidence, ontology, diagnostics, machine-readable references
- `paper-light`: main text
- `muted-amber`: secondary text

Rules:

- Accent colors must be precise signals, not broad gradients.
- Avoid blue/slate dashboard palettes.
- Use opacity-based dividers and rings.
- Do not use shadows in the dark UI. Use lines, inset borders, and contrast instead.
- Large colored panels are allowed only for command bands, alarms, or primary action states. Normal content uses dark surfaces with signal outlines.

### Typography

Typography should combine product readability with tactical display language.

Rules:

- Use Inter Variable for normal readable UI copy.
- Use a monospace face for command labels, IDs, timestamps, counters, request codes, hashes, event IDs, and state labels.
- Body text is at least 16px on mobile.
- Avoid `text-xs` for body and general UI text.
- Headings use `font-medium` or `font-semibold`, not bold.
- Use tabular numbers for changing counts and dates.
- Uppercase is allowed for monospace command labels only.
- Avoid playful copy. Use precise language: "Draft response", "Review fee estimate", "Classify evidence", "Open request", "Repair projection".

### Geometry And Motion

The interface should use geometry as structure, not decoration alone.

Allowed geometry:

- scan grids
- concentric radar rings
- vector crosshairs
- bracketed panel corners
- hard dividers
- segmented command bands
- small slanted warning edges
- compact signal bars

Rules:

- Geometry must not sit behind dense text unless contrast remains clear.
- Motion should be subtle and functional: pulse on live sync, scanning line on background, or state change emphasis.
- No constant flashing.
- No decorative orbs, bokeh blobs, soft gradients, or generic cyber glows.
- Border radius should be minimal. Most panels and buttons are square or nearly square.

## Information Architecture

The workspace keeps the product skeleton from the first pass but changes its visual treatment.

### Top Command Band

The top band is the strongest structural element.

Content:

- Cestus identity and workspace name
- current mode: Command
- ledger state
- sync state
- local or team mode
- clock or last sync
- global command/search input
- primary action: New request

Rules:

- The band uses red-orange framing and amber/cyan/green state indicators.
- It should feel like the system is live.
- Only one filled primary action appears on the page.
- Search can be visually styled as a command input, but the placeholder copy must stay plain.
- Header navigation links should remain text-only when horizontal.

### Left Module Rail

The left rail is a compact tactical mode selector.

Modules:

- Command
- Requests
- Evidence
- Ontology
- Agents
- Ingestion
- Settings

Rules:

- Active state uses signal outline, small indicator bar, or muted background. It must not use a high-contrast filled primary-color block.
- Nav state must not rely on color alone.
- Nav items may use micro icons from Heroicons only if they improve scanning.
- The rail must be data-driven so adding modules does not reshape the shell.
- Mobile uses a menu or disclosure pattern.

### Central Tactical Field

The center is the real work surface.

Layers:

1. Signal strip
   - open requests
   - due soon
   - stalled signals
   - new evidence
   - diagnostics

2. Priority queue
   - deadline items
   - stalling signals
   - fee pressure
   - evidence intake
   - diagnostics
   - draft-ready responses
   - inbox matches

3. Tactical panels
   - active investigations
   - recent evidence
   - sync watch
   - ontology gaps

4. Degraded states
   - no urgent work
   - adapter unavailable
   - projection lag
   - evidence intake pending

Rules:

- The priority queue remains readable as rows, not abstract blocks.
- Table-like content uses horizontal row dividers rather than vertical grid lines.
- Queue headings must not wrap.
- Metric labels must not wrap.
- Metrics do not use icons.
- Status colors are always paired with text labels.
- Content sections should use hard panel lines and signal bands instead of soft cards.

### Right Decision Rail

The right rail shows Cestus's reasoning posture without presenting unreviewed inference as truth.

Default state:

- agent brief
- what Cestus is watching
- what changed since last review
- what remains uncertain
- recommended next actions
- provenance hints

Selected row state:

- selected item title and severity
- linked request, agency, investigation, or evidence
- deadline basis, fee basis, denial basis, or diagnostic source
- evidence and event references
- suggested next action
- repair hints if diagnostic

Decision vote model:

- Legal risk
- Factual confidence
- Cost pressure

Rules:

- The decision vote is advisory state, not automatic truth.
- Labels must make uncertainty visible: "review", "watch", "blocked", "needs evidence", "human decision required".
- If the item requires legal threat or escalation, the UI should require human confirmation and should not imply autonomous legal action.
- The rail can feel like a machine panel, but the text must stay readable.

## Component Model

### `OpsShell`

Owns:

- page grid
- top command band slot
- left module rail
- central content
- right decision rail
- mobile menu behavior
- background scan layer

### `CommandBand`

Replaces or heavily revises `TopStatusBar`.

Owns:

- workspace identity
- mode label
- command/search input
- ledger and sync signals
- primary action
- current clock or last sync

### `ModuleRail`

Replaces or heavily revises `LeftRail`.

Owns:

- data-driven module list
- active module state
- unavailable or preview module states
- mobile menu entries

### `SignalStrip`

Replaces or heavily revises `StatusStrip`.

Owns:

- divider-separated metric cells
- signal-colored values
- compact state labels
- container-query responsive layout

### `PriorityQueue`

Keeps the core interaction from the first pass but changes visual language.

Owns:

- selectable queue rows
- severity/state labels
- type and context
- deadline or timestamp
- source or confidence
- action button
- reviewed state

### `TacticalPanel`

Reusable panel for secondary operational clusters.

Owns:

- panel title
- signal tone
- compact list rows
- empty state
- optional action

### `DecisionRail`

Replaces or heavily revises `RightContextRail`.

Owns:

- agent brief
- selected item detail
- decision vote model
- provenance and evidence references
- diagnostics and repair hints

### `CommandBoardViewModel`

Keeps business logic outside components.

Owns:

- metrics
- queue rows
- tactical panel items
- decision rail state
- selected row details
- local demo state

Rules:

- Components render the view model. They do not calculate PRR business rules.
- Demo data should resemble PRR projection/read API output.
- The view model must stay pure and unit-tested.

## Interaction Model

Initial interactions:

- open and close mobile module menu
- filter priority queue
- select queue row
- right rail updates to selected item detail
- clear selection
- mark local demo item reviewed
- activate New request entry point

Interaction rules:

- Buttons must use explicit `type`.
- Only the page's main action uses the filled primary style.
- Secondary actions use outline or ghost styles.
- Touch targets meet mobile sizing requirements.
- Focus states are visible against the dark background.
- Hover states apply only to interactive elements.
- Keyboard navigation must work for navigation, filters, queue selection, and buttons.

## Responsiveness

Desktop:

- three-column command layout
- left rail fixed
- top command band visible
- right decision rail visible
- central tactical field owns most width

Tablet:

- left rail can compact
- right rail can move below or collapse into a detail region
- tactical panels stack

Mobile:

- top command band stays first
- module rail becomes menu
- central queue becomes the primary surface
- right decision rail becomes a stacked detail view
- filters scroll horizontally if needed
- row summaries stack cleanly
- body text remains at least 16px

Use container queries for metric strips, dashboard widgets, queue variants, and tactical panels when component width, rather than viewport width, drives layout.

## Accessibility

Rules:

- Preserve semantic landmarks for navigation, main content, and complementary rail.
- All form controls have labels or `aria-label`.
- Status colors pair with visible text.
- Warning and diagnostic states do not rely on color alone.
- Table headings use sentence case and do not wrap.
- Icons are decorative only when text already names the action or state.
- No emoji in application UI.
- The persistent scan layer must be `aria-hidden`.
- The UI must remain usable with reduced motion.

## Data And Integration

This UI slice can remain local/demo-driven, but its shape should match backend concepts:

- PRR queue rows
- agencies
- contacts
- deadlines
- fee estimates
- narrowing negotiations
- productions
- denials and exemptions
- evidence IDs
- ontology assertion or graph references
- projection diagnostics
- adapter sync states

The UI must not weaken ontology or PRR semantics:

- No accepted fact appears without evidence/provenance language.
- AI recommendations remain reviewable proposals.
- Decision vote panels do not append events or mutate domain state in this slice.
- Projection lag and diagnostics are visible states, not silent failures.

## Testing And Verification

Required implementation tests:

- view-model unit tests for metrics, queue filtering, selection, and decision rail detail
- component tests for shell navigation, mobile menu, filtering, selection, reviewed state, and rail switching
- visual contract tests for tactical design tokens, no generic slate/blue palette, no shadows, no forbidden borrowed IP names in UI copy, and no `text-xs` body content
- responsive checks for desktop and mobile
- accessibility checks for labels, landmarks, buttons, focus, and color-paired status text
- `npm run verify`

Recommended browser checks:

- desktop command screen
- mobile command screen
- selected row detail
- no urgent work state
- projection diagnostic state

## Implementation Guardrails

- Use the existing React, Vite, Tailwind, TypeScript, and Vitest stack.
- Use Heroicons Micro for application icons if icons are needed.
- Do not add a routing package until a second real screen exists.
- Do not add Storybook for this pass.
- Keep ui.sh picker usage only if comparing a small number of visual choices. Remove picker scaffolding after choices are finalized.
- Keep visual logic in components and business/data logic in the view model.
- Use CSS custom properties for tactical design tokens.
- Avoid raw SVG icons, except for structural background geometry that is not an icon and is marked decorative.
- Keep the implementation legible to generic coding agents through predictable names, narrow files, and explicit invariants in tests.

## Acceptance Criteria

The redesign is successful when:

- The first viewport clearly reads as a high-intensity tactical Cestus command console.
- The interface no longer reads as a generic dark dashboard.
- Priority work is readable and actionable within five seconds.
- The right rail communicates agent reasoning and uncertainty without overclaiming.
- The layout works on desktop and mobile without overlapping text.
- Verification passes with tests, typecheck, UI build, and factory readiness.
