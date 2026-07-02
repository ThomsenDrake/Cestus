# Cestus Command Workspace UI Design

Date: 2026-07-02

## Purpose

This design covers the first Cestus UI slice: a broad workspace shell and Command screen that can host the PRR workflow and future Cestus modules. The UI should be clean, modern, extensible, easy to navigate, and built collaboratively before deeper PRR workspace screens are implemented.

The Command screen is the daily entry point for a single investigator laptop while preserving a path to a small newsroom or nonprofit team. It should show urgent work, system state, recent evidence, and agent/context guidance without turning the backend business logic into UI code.

## Design Direction

Cestus should use a dark-first operator-console design language inspired by the computer interfaces in Neon Genesis: Evangelion, translated into a professional civic accountability product. The goal is not to copy specific screens, symbols, names, or anime references. The goal is to borrow the qualities that fit Cestus:

- dense but legible command hierarchy
- high-contrast status language
- amber, red, green, and cyan signal accents
- precise metadata, timestamps, IDs, hashes, and confidence labels
- thin separators, inset rings, and technical framing
- restrained motion and small state details

The UI should feel like an accountability operations console for journalists and investigators, not a theatrical novelty interface.

## Scope

In scope:

- React + Vite + Tailwind app foundation.
- Dark-first Command workspace shell.
- Left module rail, top status/search bar, central command board, right hybrid context rail.
- Interactive local/demo data model for queue selection, filters, row detail, and rail switching.
- PRR-aware demo content based on the existing backend contracts.
- ui.sh picker comparison points during implementation for selected visual decisions.

Out of scope for this UI slice:

- Full PRR request workflow screens.
- Live Gmail, IMAP/SMTP, or Himalaya integration.
- Full ontology graph exploration.
- Multi-user newsroom administration.
- Light theme or manual theme toggle.
- Marketing or landing page UI.

## Product Model

The first screen optimizes for a daily command center. It should answer:

- What requires attention now?
- Which requests or investigations are approaching risk?
- What new evidence arrived?
- What diagnostics or sync issues need repair?
- What is Cestus watching or uncertain about?
- Where should the investigator go next?

The main work object is a split command board:

- top priority actions dominate the center of the screen
- investigation context appears in rows and tactical panels
- system health remains visible but secondary
- the right rail explains the selected work item or the current agent brief

## Information Architecture

### Left Rail

The left rail starts minimal and extensible:

- Command
- Requests
- Evidence
- Ontology
- Settings
- Agents preview slot
- Ingestion preview slot

Rules:

- Command is selected by default.
- Active nav state uses muted background or brighter text, never a saturated primary fill.
- Preview modules should be visibly unavailable or marked as preview without blocking the layout.
- Mobile collapses the rail into a menu.

### Top Status Bar

The top bar contains:

- workspace identity
- global search or command input
- sync/ledger status
- current time or last sync timestamp
- primary action: New request

Rules:

- Only New request uses the primary filled button style.
- Search should feel like a command input, but visible copy remains clear and professional.
- Status indicators use concise labels such as Sync, Ledger, Local, or Watch.

### Center Command Board

The center board contains four layers:

1. Status strip
   - Open requests
   - Due soon
   - Stalled signals
   - New evidence
   - Diagnostics

2. Priority queue
   - Deadline items
   - Stalling signals
   - Evidence intake
   - Diagnostics
   - Draft ready
   - Inbox match

3. Tactical panels
   - Active investigations
   - Recent evidence
   - Sync watch

4. Empty and degraded states
   - No urgent work
   - Projection diagnostics present
   - Adapter sync unavailable
   - Evidence intake pending

### Right Context Rail

The right rail is hybrid:

- default state: Agent brief
- selected row state: selected item details
- alert state: diagnostics and repair hints

The default Agent brief should show:

- what Cestus is watching
- what changed since last review
- what remains uncertain
- recommended next actions
- provenance hints

Selected item details should show:

- title and severity
- linked request or investigation
- deadline basis or event source
- evidence/provenance references
- suggested next action
- repair or review notes where relevant

Mobile converts the right rail into a detail view or bottom sheet.

## Visual System

### Theme

Dark-first only for v1.

Canvas:

- near-black neutral base
- slightly raised dark surfaces
- opacity-based dividers
- no large colored panels
- no dark-mode shadows

Accent colors:

- amber for attention or review
- red for urgent risk or legal escalation
- green for healthy/synced
- cyan for evidence, ontology, and system signals
- off-white for primary text

Colors should not become one-note. The base should not read as generic dark blue/slate, and accents should be small, precise signals.

### Typography

Use Inter Variable as the primary UI font.

Rules:

- no `text-xs` for body text
- mobile body text defaults to at least 16px
- headings use `font-medium` or `font-semibold`, not bold
- use tabular numbers for counts, dates, and changing values
- use monospace selectively for IDs, hashes, event IDs, and technical metadata
- use operator vocabulary lightly: Command, Signals, Watch, Sync, Diagnostics, Escalation

### Surfaces

Use the lightest separation that works:

- whitespace for related content
- thin dividers for sibling content
- inset rings for panels
- cards only for independently interactive or distinct content

The status strip should use divider-separated metrics, not heavy cards.

### Icons

Use an icon library during implementation, preferably Heroicons or a project-standard React icon package. Application UI icons should be small micro icons. Do not generate raw SVG icons.

Do not use icons inside stat cards. Navigation and row metadata may use subtle icons when they improve scanning.

## Core Components

### `OpsShell`

Owns the page skeleton:

- left rail
- top status bar
- main content slot
- right context rail
- mobile menu/detail behavior

### `LeftRail`

Owns module navigation and preview modules. It should be data-driven so new modules can be added without reshaping the layout.

### `TopStatusBar`

Owns workspace identity, command search, sync status, and New request.

### `CommandDashboard`

Owns the Command screen composition.

### `StatusStrip`

Displays metrics with divider-based layout and tabular numbers.

### `PriorityQueue`

Displays command items in a dense table/list hybrid. Columns:

- severity
- type
- title
- context
- deadline or timestamp
- source or confidence
- state

Rows should be selectable. Selection updates the right rail.

### `QueueFilters`

Compact segmented controls or filter buttons:

- All
- Deadlines
- Signals
- Evidence
- Diagnostics

Filters are local state in this slice.

### `TacticalPanel`

Reusable section component for active investigations, recent evidence, and sync watch.

### `RightContextRail`

Switches between:

- Agent brief
- Selected queue item details
- Diagnostics alert detail

### `CommandBoardViewModel`

Transforms local demo/backend data into UI-safe values:

- status metrics
- queue rows
- tactical panel data
- rail default content
- selected item detail content

This keeps visual components free of business logic and creates a clean path to PRR projection/read API integration.

## Interaction Model

Initial interactions:

- open and close mobile navigation
- filter queue by type
- select queue row
- right rail switches to selected item detail
- clear selection to return to Agent brief
- open New request entry point
- mark local demo item reviewed

The UI should feel interactive but should not pretend to complete backend workflows that are not wired yet.

## ui.sh Picker Plan

During implementation, use the ui.sh `ideas` picker for a small number of visible decisions:

1. Queue density
   - Compact table
   - Split row
   - Grouped by severity

2. Right rail treatment
   - Agent brief dominant
   - Detail dominant
   - Split brief/detail stack

3. Status strip treatment
   - Divider metrics
   - Thin framed metrics
   - Inline signal bar

Rules:

- Use `data-uidotsh-pick` and `data-uidotsh-option` wrappers.
- Keep exactly one option visible initially.
- Add the picker toolbar only after variants are implemented.
- Ask the user to choose variants.
- Remove unselected variants and picker scaffolding after selection.

## Data And Integration

This UI slice can use local/demo data, but the data shape should resemble real backend outputs.

Use existing PRR concepts:

- `RequestQueueRow`
- `PrrProjection`
- PRR diagnostics
- evidence IDs
- deadline source and date
- stalling flags
- production counts

Mock-only modules should be visibly future-facing:

- Agents
- Ingestion
- richer ontology graph views

Do not hard-code business rules into visual components. Put all transformation and mock composition behind `CommandBoardViewModel`.

## Responsiveness

Desktop:

- left rail fixed
- top status bar visible
- center command board primary
- right rail visible

Tablet:

- left rail can narrow
- tactical panels stack below priority queue
- right rail may collapse if space is tight

Mobile:

- left rail becomes a menu
- command queue is primary
- right rail becomes a detail sheet/view
- filters become horizontally scrollable
- table-like queue rows become stacked row summaries

## Accessibility

- All buttons use explicit button types.
- Inputs have labels or `aria-label`.
- Navigation has clear active state beyond color alone where practical.
- Queue rows are keyboard selectable.
- Focus rings are visible.
- Status colors are paired with text labels.
- No emoji in UI copy.

## Testing And Verification

Implementation should include:

- unit tests for view-model transformations
- component tests for filtering and selection
- responsive checks for desktop and mobile
- ui.sh picker cleanup verification after final choices
- `npm run verify`

If Playwright or another browser test harness is added, include screenshot checks for:

- desktop Command screen
- mobile Command screen
- selected queue item detail
- empty/no urgent work state

## Implementation Planning Defaults

Use these defaults unless the implementation plan records a concrete reason to change them:

- Start with route-ready structure but do not add a routing package until the second screen exists.
- Use Heroicons React if no project-standard icon package already exists.
- Keep mock data in typed source fixtures near the Command workspace view model.
- Add Playwright only if the implementation plan includes browser screenshot verification.
- Do not add Storybook for the first UI slice; use the app itself plus ui.sh picker variants for collaborative visual review.
