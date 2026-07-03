# Public Records Request Workspace UI Design

Date: 2026-07-03

## Purpose

This design covers the first collaborative UI slice for the Cestus Public Records Request workspace. The backend/domain PRR workflow already defines event contracts, projections, jurisdiction packs, correspondence boundaries, evidence linkage, and read-API DTOs. This UI design translates that workflow into a usable investigator surface while preserving the approved Cestus tactical console language.

The first deployment target remains a single investigator laptop, but the workspace must scale cleanly to a small newsroom or nonprofit team. The UI should help users triage high volumes of requests, understand agency patterns, review drafts, prevent casual legal escalation, and keep evidence/provenance visible where request decisions happen.

## Approved Direction

The approved direction is **Signal Operations Board**.

The Requests module opens to an active request triage board. The board is action-state first, visually intense, and pattern-aware. It borrows the approved Cestus tactical command language: hard geometry, near-black surfaces, signal color, dense operational metadata, agency heat, and machine-readable references. It must still remain concrete product software: every card represents an actual request, agency, deadline, evidence packet, diagnostic, or next action.

The default visual balance is **Concrete Board With Signal Overlays**. A more dramatic **Signal Map** is available as an alternate analysis view, but the daily landing surface remains the concrete board.

## Goals

- Make PRR triage the first-class work surface for request volume, deadlines, fees, productions, diagnostics, correspondence, and escalation readiness.
- Keep the board action-oriented so the user can answer "what should I do next?" quickly.
- Make agency behavior patterns visible through grouping, saved views, heat, and the alternate signal map.
- Keep human approval explicit for sending and legal escalation.
- Show agent recommendations with cited, inspectable reasoning.
- Make the guided request builder helpful through editable AI-recommended fills that explain their provenance.
- Preserve a direct path from local solo use to a small team without building full team administration in this slice.
- Keep the design legible to future coding agents through typed view-model boundaries and explicit UI invariants.

## Non-Goals

- Live Gmail, IMAP/SMTP, Himalaya, or one-click send integration in the first UI slice.
- Autonomous sending.
- Autonomous legal escalation or legal advice.
- Full newsroom administration, permissions, or shared inbox management.
- Full evidence review or document intelligence inside the PRR workspace.
- Replacing the Evidence, Ontology, Agents, or Ingestion modules.

## Information Architecture

### Entry Point

The left module rail includes `Requests`. Opening it lands on the PRR workspace, not an individual request page.

The PRR command band contains:

- workspace label: `Requests`
- saved view selector
- `Board / Signal map` segmented control
- filters for jurisdiction, agency, investigation, status, severity, provider, and assignee
- sync/provider status
- primary action: `New request`

The global Cestus shell remains unchanged. The PRR workspace occupies the main area and reuses the tactical token system from the Command workspace.

### Default Board

The board ships with seven action lanes:

- `Drafting`
- `Ready to send`
- `Awaiting agency`
- `Needs follow-up`
- `Review fee/scope`
- `Production arrived`
- `Appeal/escalation`

Cards are grouped by **agency** by default. Group headers show agency name, jurisdiction, open request count, deadline pressure, fee pressure, recent correspondence signal, and active diagnostics. Saved views may switch grouping to investigation, jurisdiction, or no grouping.

Diagnostics are first-class work items. Adapter failures, uncertain email matches, projection lag, missing evidence, and send-gate blockers can appear in the board and in request detail.

### Signal Map

The PRR command band includes a `Board / Signal map` view toggle.

The signal map is an alternate analysis view, not the default triage surface. It shows agency nodes, request clusters, signal edges, deadline heat, fee pressure, correspondence stalling, production arrivals, and selected-agency detail. The first implementation should include a credible visual shell using local fixtures rather than a placeholder.

On mobile, the signal map can simplify to an agency-pattern list plus selected-node detail. The full node/edge canvas is desktop/tablet-first.

## Board Card Model

Each request card should expose enough signal to act without opening the rail:

- request title or short scope
- request ID
- agency
- jurisdiction pack
- investigation link when present
- current action state
- deadline date and source (`estimated` or `confirmed`)
- stalling state
- fee/scope pressure
- correspondence/provider state
- production/evidence count
- diagnostics count
- assignee or local owner affordance when available
- next action label

Cards stay compact. They use tactical signal overlays and severity accents rather than becoming full case files. Expanding deep detail belongs in the detail rail.

## Selected Request Detail Rail

Selecting a request keeps the board visible and opens a persistent right-side detail rail on desktop.

The rail starts with a **next action packet**:

- recommended action
- review/send gate state
- required human decision
- short risk posture
- primary or review action
- explainable recommendation strip

The explainable strip answers `Why this?` with cited events, deadline basis, correspondence references, evidence IDs, and confidence/risk state. Agent reasoning must stay attached to the recommendation it supports.

Below the next action packet, the rail contains compact sections:

- deadline/legal posture
- correspondence thread summary
- evidence intake packets
- diagnostics and repair hints
- request timeline
- provenance references

### One-Click Send

One-click send is an **armed action with an explicit review gate**.

The rail does not expose a true `Send now` action until the user has reviewed:

- draft body
- recipients
- subject
- citations and jurisdiction basis
- attachments
- evidence references
- risk flags
- adapter/provider state

Before all checks pass, the action reads like `Review to send`. When checks pass, the UI may present an armed send button. The send action is still human-approved.

### Legal Escalation

Legal escalation uses a visible but locked gate. Escalation actions may appear before eligibility, but they must be unavailable until the rail can show:

- confirmed deadline basis or user-confirmed stalling basis
- cited jurisdiction rule or cited pack guidance
- evidence of relevant correspondence history
- explicit user confirmation

The locked gate explains missing prerequisites. The UI must not imply that Cestus has made a legal judgment on its own.

## Correspondence

Correspondence lives inside the selected request rail as a compact thread.

The compact thread shows:

- latest inbound message
- latest outbound draft or sent item
- provider (`gmail`, `imap-smtp`, or `himalaya`)
- sync/checkpoint state
- uncertain match state when applicable
- attachment indicators
- thread open action for deeper review

The board remains the main scan surface. Deep email-style review can open from the rail when needed.

## Productions And Evidence

Productions and attachments appear as **evidence intake packets** in the detail rail.

Each packet should show:

- evidence ID
- source artifact or message
- file/message count
- hash or hash status
- linked request
- extraction queue state
- classification status
- `Classify evidence` action when available

The PRR workspace can flag and route evidence, but deep evidence review remains owned by the Evidence module.

## Guided Request Builder

`New request` opens a **command checklist builder**.

Builder steps:

1. Jurisdiction pack
2. Agency/contact
3. Request scope
4. Delivery channel
5. Deadline estimate
6. Review/send gate

The first implementation includes the full visual builder shell and local/mock data. It does not require live send integration.

### AI-Recommended Fills

The builder includes AI-recommended fills that users can accept or edit.

Examples:

- agency/contact suggestions
- subject line suggestions
- scope language
- date ranges
- fee-waiver or fee-limitation language
- preferred delivery channel
- jurisdiction-specific template clauses
- evidence/investigation linkage

Recommendations learn passively from the user's edits over time. Learning is personal-first. Cestus may later let users explicitly promote patterns into shared team playbooks, but it must not silently spread one user's drafting habits to a team.

Every learned fill shows visible suggestion provenance, such as:

- `Based on your last 4 Florida vendor requests`
- `You usually include date ranges for this agency`
- `Suggested from the Federal FOIA starter pack`
- `Adapted from your prior airport procurement request`

Suggestions remain editable. Passive learning must not create hidden send decisions or hidden legal escalation behavior.

## Saved Views And Scale

The workspace ships with curated presets plus user-saved views.

Initial presets:

- `All active`
- `Overdue`
- `Florida fees`
- `Productions arrived`

Saved views can preserve:

- filters
- grouping
- sort
- board or signal-map mode
- selected jurisdiction scope
- selected investigation scope
- severity threshold

The board handles scale through compact cards, agency grouping, saved views, and command filters. It should not require users to configure lanes from day one.

## Team Readiness

The UI is solo-first with team affordances.

The first UI slice may show:

- local owner
- optional assignee metadata
- review status
- saved-view structures that can become shared later
- team-playbook affordance language only where explicitly future-facing

It must not build or imply full team administration, permissions, shared inbox routing, or multi-user conflict handling.

## Responsive Behavior

Desktop:

- PRR command band
- seven-lane board with horizontal or responsive lane management
- persistent selected-request detail rail
- `Board / Signal map` toggle

Tablet:

- fewer visible lanes or one selected lane plus lane switcher
- rail can become a side sheet
- signal map simplified if necessary

Mobile:

- one lane at a time
- lane selector and saved views at top
- selected request opens as a drill-in sheet
- action packet remains first in the sheet
- signal map becomes agency-pattern list plus selected-node detail

The board must not rely on horizontal scrolling alone on small screens.

## UI View Model Boundary

The current PRR backend exposes request rows, projection read models, diagnostics, and timeline entries. The PRR UI should define richer UI-facing models layered over those contracts rather than forcing backend read models to carry presentation detail immediately.

The first UI implementation should include typed local fixtures for:

- board lanes
- agency groups
- request cards
- saved views
- signal map nodes and edges
- selected request detail packets
- recommendation explanations
- send-gate checks
- escalation-gate prerequisites
- correspondence summaries
- evidence intake packets
- builder steps
- AI-recommended fills with provenance

Those UI view models should be named predictably and kept close to the PRR workspace components so future agents can map them back to `packages/prr/src/read-api.ts` as backend contracts grow.

## Testing Requirements

The first implementation plan should include focused tests for:

- lanes render in the approved order
- agency grouping is the default grouping
- saved view selection changes filters, grouping, and view mode
- signal map view renders from typed fixtures
- selected request rail starts with the next action packet
- send gate cannot become armed without required review checks
- escalation gate explains missing prerequisites
- correspondence summary shows provider/sync state
- evidence intake packets expose evidence IDs and extraction status
- builder renders all six steps
- AI-recommended fills show provenance and remain editable
- mobile mode exposes one lane at a time and opens detail as a sheet
- visual contract rejects old `ui.sh` picker artifacts and old `--cestus-*` TSX token usage

## Accessibility And Interaction Rules

- Keep body text at least 16px on mobile.
- Do not use color alone for severity, active state, stalling, deadline source, or gate locks.
- Use Heroicons Micro for application icons where icons improve scanning.
- Keep one filled primary action per page or modal context.
- Use compact secondary actions for review, classify, open thread, repair, and filter controls.
- Use native form controls for builder fields where possible.
- Every field must be labeled or have an explicit accessible label.
- The signal map must have a non-canvas fallback or equivalent list representation for keyboard and small-screen users.
- Avoid constant flashing; signal motion must be subtle and functional.

## Open Follow-Up For Implementation Planning

Implementation planning should decide whether the first PRR UI slice lives under `packages/ui/src/requests/` or a broader module structure such as `packages/ui/src/modules/requests/`. The chosen structure must keep Command workspace components stable and avoid mixing PRR-specific view models into the existing Command model files.
