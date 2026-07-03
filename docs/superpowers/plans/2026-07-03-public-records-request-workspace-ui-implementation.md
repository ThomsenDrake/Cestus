# Public Records Request Workspace UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first PRR workspace UI slice: a Signal Operations Board with agency grouping, saved views, selected-request detail rail, alternate signal map, and guided request builder shell using local fixtures.

**Architecture:** Keep PRR-specific UI models and components under `packages/ui/src/requests/` so the existing Command workspace stays stable. Use typed local fixtures as a UI-facing layer over the existing `packages/prr/src/read-api.ts` contracts; later backend read models can replace the fixtures without reshaping the UI. Reuse `OpsShell`, `CommandBand`, tactical tokens, and the global module rail while adding module selection in `App`.

**Tech Stack:** React 19, Vite 8, Tailwind CSS 4, Heroicons Micro, Vitest, Testing Library, TypeScript, existing Cestus PRR and ontology packages.

---

## Inputs

- Approved UI spec: `docs/superpowers/specs/2026-07-03-public-records-request-workspace-ui-design.md`
- Approved tactical shell spec: `docs/superpowers/specs/2026-07-03-cestus-tactical-command-ui-redesign.md`
- PRR workflow spec: `docs/superpowers/specs/2026-07-01-public-records-request-workflow-design.md`
- Existing PRR read/API contracts: `packages/prr/src/read-api.ts`, `packages/prr/src/projection.ts`, `packages/prr/src/types.ts`
- Existing UI shell: `packages/ui/src/App.tsx`, `packages/ui/src/workspace/OpsShell.tsx`, `packages/ui/src/workspace/CommandBand.tsx`, `packages/ui/src/workspace/ModuleRail.tsx`
- Repo contract: `AGENTS.md`
- Software factory model: `docs/agentic/software-factory.md`

## Required Skills For Workers

Use `superpowers:test-driven-development` before every implementation task. Each task writes or updates the failing test first, runs the targeted failing command, implements the smallest passing change, then runs targeted and full verification.

Use `$design` from `/home/drake/.agents/skills/design/SKILL.md` before Tasks 2 through 7 because those tasks change visual structure, responsive behavior, interaction states, or Tailwind classes. Required guideline files include:

- `design-guidelines.md`
- `guidelines/dashboards.md`
- `guidelines/surfaces.md`
- `guidelines/navigation.md`
- `guidelines/tables.md`
- `guidelines/badges.md`
- `guidelines/buttons.md`
- `guidelines/responsive-design.md`
- `guidelines/flexbox-layout.md`
- `guidelines/form-controls.md`
- `guidelines/dark-mode.md`
- `guidelines/colors.md`
- `guidelines/typography.md`
- `guidelines/copywriting.md`
- `guidelines/icons.md`
- `guidelines/interactivity.md`
- `guidelines/border-radius.md`
- `guidelines/general.md`
- `guidelines/headers.md`

Do not use `$ideas` in this implementation plan. Browser comparison already happened during brainstorming, and the selected direction is final. Do not reintroduce `ui.sh` picker scaffolding into app source.

## Scope Boundary

This plan builds UI only. It does not add live Gmail, IMAP/SMTP, Himalaya, autonomous send, autonomous legal escalation, backend persistence, or team administration.

## File Structure

- `packages/ui/src/App.tsx`: owns active module state and switches between Command and Requests modules.
- `packages/ui/src/workspace/OpsShell.tsx`: generic tactical shell; adds module selection and a configurable main landmark ID/label.
- `packages/ui/src/workspace/ModuleRail.tsx`: emits module selection while preserving link semantics.
- `packages/ui/src/workspace/CommandBand.tsx`: adds configurable search label and fallback text while preserving Command defaults.
- `packages/ui/src/requests/request-types.ts`: PRR UI view-model contracts.
- `packages/ui/src/requests/request-fixtures.ts`: local PRR workspace fixtures for board, rail, signal map, and builder.
- `packages/ui/src/requests/request-model.ts`: pure selectors and transformations for saved views, grouping, gates, and selected request lookup.
- `packages/ui/src/requests/RequestWorkspace.tsx`: PRR workspace state composition.
- `packages/ui/src/requests/RequestCommandBar.tsx`: saved views, filters, grouping selector, and `Board / Signal map` toggle.
- `packages/ui/src/requests/RequestBoard.tsx`: seven-lane board composition.
- `packages/ui/src/requests/RequestLane.tsx`: agency-grouped lane.
- `packages/ui/src/requests/RequestCard.tsx`: compact request signal card.
- `packages/ui/src/requests/RequestDetailRail.tsx`: selected request next-action packet, gates, correspondence, evidence, diagnostics, timeline.
- `packages/ui/src/requests/RequestSignalMap.tsx`: alternate signal map visual shell with accessible list fallback.
- `packages/ui/src/requests/RequestBuilder.tsx`: command checklist builder shell with editable AI-recommended fills.
- `packages/ui/test/request-model.test.ts`: pure model tests.
- `packages/ui/test/request-shell.test.tsx`: module routing and shell tests.
- `packages/ui/test/request-board.test.tsx`: board, lanes, grouping, saved views.
- `packages/ui/test/request-detail-rail.test.tsx`: next-action packet and gate tests.
- `packages/ui/test/request-signal-map.test.tsx`: signal map toggle and selected node detail tests.
- `packages/ui/test/request-builder.test.tsx`: builder step and AI fill tests.
- `packages/ui/test/app-smoke.test.tsx`: updated app smoke coverage.
- `packages/ui/test/visual-contract.test.ts`: request component visual contract coverage.
- `packages/ui/test/ui-picker.test.tsx`: request component picker cleanup coverage.

## Factory Rules

Each task is one work order. A worker must:

1. Read `AGENTS.md`, this plan, and the approved PRR UI spec before editing.
2. Use a task-scoped branch or worktree.
3. Change only the files listed by the task.
4. Write the failing test first.
5. Run the targeted failing command and confirm the expected failure.
6. Implement the smallest passing change.
7. Run the targeted passing command.
8. Run `npm run verify`.
9. Commit only the task files.
10. Stop on visual overlap that cannot be resolved in two focused attempts, dependency failure, schema conflict, unavailable browser tooling, or any change that weakens append-only ledger semantics, provenance requirements, projection rebuildability, human approval for send, or legal escalation locks.

## Task 1: Add PRR Workspace View Models And Fixtures

**Files:**
- Create: `packages/ui/src/requests/request-types.ts`
- Create: `packages/ui/src/requests/request-fixtures.ts`
- Create: `packages/ui/src/requests/request-model.ts`
- Create: `packages/ui/test/request-model.test.ts`

- [ ] **Step 1: Write the failing model tests**

Create `packages/ui/test/request-model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { prrWorkspaceFixture } from "../src/requests/request-fixtures.js";
import {
  buildPrrWorkspaceViewModel,
  getSelectedPrrRequest,
  prrLaneOrder,
  sendGateArmed,
  unresolvedEscalationPrerequisites
} from "../src/requests/request-model.js";

describe("PRR workspace model", () => {
  it("builds the approved seven-lane board grouped by agency by default", () => {
    const model = buildPrrWorkspaceViewModel(prrWorkspaceFixture, {
      savedViewId: "all-active",
      selectedRequestId: "prr_req_airport_022",
      viewMode: "board"
    });

    expect(model.lanes.map((lane) => lane.id)).toEqual(prrLaneOrder);
    expect(model.activeView.grouping).toBe("agency");
    expect(model.lanes.find((lane) => lane.id === "ready-to-send")?.agencyGroups[0]).toMatchObject({
      agencyName: "Federal Aviation Administration",
      jurisdictionLabel: "US Federal FOIA"
    });
  });

  it("applies saved views to mode, grouping, and filtered cards", () => {
    const model = buildPrrWorkspaceViewModel(prrWorkspaceFixture, {
      savedViewId: "florida-fees",
      selectedRequestId: undefined,
      viewMode: undefined
    });

    expect(model.activeView.id).toBe("florida-fees");
    expect(model.viewMode).toBe("board");
    expect(model.activeView.grouping).toBe("agency");
    expect(model.lanes.flatMap((lane) => lane.agencyGroups.flatMap((group) => group.cards))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          prrRequestId: "prr_req_sheriff_045",
          laneId: "review-fee-scope",
          feeSignal: "$4,500 estimate"
        })
      ])
    );
    expect(
      model.lanes
        .flatMap((lane) => lane.agencyGroups.flatMap((group) => group.cards))
        .every((card) => card.jurisdictionLabel === "Florida Public Records")
    ).toBe(true);
  });

  it("derives selected request, send gate, and escalation prerequisites", () => {
    const selected = getSelectedPrrRequest(prrWorkspaceFixture, "prr_req_transit_031");

    expect(selected?.nextAction.label).toBe("Confirm escalation basis");
    expect(sendGateArmed(selected?.sendGate)).toBe(false);
    expect(unresolvedEscalationPrerequisites(selected?.escalationGate)).toEqual([
      "User confirmation"
    ]);
  });
});
```

- [ ] **Step 2: Run the model test to verify it fails**

Run:

```bash
npm test -- packages/ui/test/request-model.test.ts
```

Expected:

```text
FAIL packages/ui/test/request-model.test.ts
Failed to resolve import "../src/requests/request-fixtures.js"
```

- [ ] **Step 3: Add PRR UI type contracts**

Create `packages/ui/src/requests/request-types.ts`:

```ts
export const prrLaneOrder = [
  "drafting",
  "ready-to-send",
  "awaiting-agency",
  "needs-follow-up",
  "review-fee-scope",
  "production-arrived",
  "appeal-escalation"
] as const;

export type PrrLaneId = (typeof prrLaneOrder)[number];
export type PrrViewMode = "board" | "signal-map";
export type PrrGrouping = "agency" | "jurisdiction" | "investigation" | "none";
export type PrrSeverity = "critical" | "high" | "medium" | "low";
export type PrrSignalTone = "red" | "amber" | "green" | "cyan" | "neutral";
export type PrrProvider = "gmail" | "imap-smtp" | "himalaya";

export interface PrrSavedView {
  readonly id: string;
  readonly label: string;
  readonly mode: PrrViewMode;
  readonly grouping: PrrGrouping;
  readonly filters: {
    readonly jurisdiction?: string;
    readonly laneIds?: readonly PrrLaneId[];
    readonly agencyIds?: readonly string[];
    readonly minSeverity?: PrrSeverity;
  };
}

export interface PrrRequestCard {
  readonly id: string;
  readonly prrRequestId: string;
  readonly title: string;
  readonly agencyId: string;
  readonly agencyName: string;
  readonly jurisdictionLabel: string;
  readonly investigationLabel: string;
  readonly laneId: PrrLaneId;
  readonly severity: PrrSeverity;
  readonly deadlineLabel: string;
  readonly deadlineSource: "estimated" | "confirmed" | "none";
  readonly providerLabel: string;
  readonly stallingState: string;
  readonly feeSignal: string;
  readonly productionCount: number;
  readonly diagnosticCount: number;
  readonly ownerLabel: string;
  readonly nextActionLabel: string;
}

export interface PrrAgencyGroup {
  readonly agencyId: string;
  readonly agencyName: string;
  readonly jurisdictionLabel: string;
  readonly heat: PrrSignalTone;
  readonly summary: string;
  readonly cards: readonly PrrRequestCard[];
}

export interface PrrLaneModel {
  readonly id: PrrLaneId;
  readonly label: string;
  readonly agencyGroups: readonly PrrAgencyGroup[];
}

export interface PrrGateCheck {
  readonly id: string;
  readonly label: string;
  readonly complete: boolean;
  readonly detail: string;
}

export interface PrrActionPacket {
  readonly label: string;
  readonly summary: string;
  readonly risk: PrrSignalTone;
  readonly explanation: readonly string[];
}

export interface PrrCorrespondenceSummary {
  readonly provider: PrrProvider;
  readonly syncState: string;
  readonly latestInbound: string;
  readonly latestOutbound: string;
}

export interface PrrEvidencePacket {
  readonly evidenceId: string;
  readonly title: string;
  readonly hashState: string;
  readonly extractionState: string;
}

export interface PrrDetailModel {
  readonly prrRequestId: string;
  readonly title: string;
  readonly agencyName: string;
  readonly nextAction: PrrActionPacket;
  readonly sendGate: readonly PrrGateCheck[];
  readonly escalationGate: readonly PrrGateCheck[];
  readonly deadlinePosture: string;
  readonly correspondence: PrrCorrespondenceSummary;
  readonly evidencePackets: readonly PrrEvidencePacket[];
  readonly diagnostics: readonly string[];
  readonly timeline: readonly string[];
}

export interface PrrSignalMapNode {
  readonly id: string;
  readonly agencyName: string;
  readonly tone: PrrSignalTone;
  readonly x: number;
  readonly y: number;
  readonly summary: string;
}

export interface PrrSignalMapEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly label: string;
  readonly tone: PrrSignalTone;
}

export interface PrrSignalMapModel {
  readonly nodes: readonly PrrSignalMapNode[];
  readonly edges: readonly PrrSignalMapEdge[];
}

export interface PrrSuggestedFill {
  readonly id: string;
  readonly fieldLabel: string;
  readonly value: string;
  readonly provenance: string;
}

export interface PrrBuilderStep {
  readonly id: string;
  readonly label: string;
  readonly state: "ready" | "needs-review" | "complete";
  readonly suggestedFills: readonly PrrSuggestedFill[];
}

export interface PrrBuilderModel {
  readonly steps: readonly PrrBuilderStep[];
}

export interface PrrWorkspaceFixture {
  readonly savedViews: readonly PrrSavedView[];
  readonly cards: readonly PrrRequestCard[];
  readonly requestDetails: readonly PrrDetailModel[];
  readonly signalMap: PrrSignalMapModel;
  readonly builder: PrrBuilderModel;
}

export interface PrrWorkspaceViewModel {
  readonly savedViews: readonly PrrSavedView[];
  readonly activeView: PrrSavedView;
  readonly viewMode: PrrViewMode;
  readonly lanes: readonly PrrLaneModel[];
  readonly selectedRequest?: PrrDetailModel;
  readonly signalMap: PrrSignalMapModel;
  readonly builder: PrrBuilderModel;
}
```

- [ ] **Step 4: Add local PRR fixtures**

Create `packages/ui/src/requests/request-fixtures.ts` with enough fixture data to exercise all approved states:

```ts
import type { PrrWorkspaceFixture } from "./request-types.js";

export const prrWorkspaceFixture: PrrWorkspaceFixture = Object.freeze({
  savedViews: Object.freeze([
    Object.freeze({
      id: "all-active",
      label: "All active",
      mode: "board",
      grouping: "agency",
      filters: Object.freeze({})
    }),
    Object.freeze({
      id: "overdue",
      label: "Overdue",
      mode: "board",
      grouping: "agency",
      filters: Object.freeze({ laneIds: Object.freeze(["needs-follow-up", "appeal-escalation"]) })
    }),
    Object.freeze({
      id: "florida-fees",
      label: "Florida fees",
      mode: "board",
      grouping: "agency",
      filters: Object.freeze({
        jurisdiction: "Florida Public Records",
        laneIds: Object.freeze(["review-fee-scope"])
      })
    }),
    Object.freeze({
      id: "productions-arrived",
      label: "Productions arrived",
      mode: "signal-map",
      grouping: "agency",
      filters: Object.freeze({ laneIds: Object.freeze(["production-arrived"]) })
    })
  ]),
  cards: Object.freeze([
    Object.freeze({
      id: "card_prr_req_001",
      prrRequestId: "prr_req_001",
      title: "FAA vendor contracts",
      agencyId: "agency_faa",
      agencyName: "Federal Aviation Administration",
      jurisdictionLabel: "US Federal FOIA",
      investigationLabel: "Airport procurement",
      laneId: "ready-to-send",
      severity: "high",
      deadlineLabel: "Est. Jul 30",
      deadlineSource: "estimated",
      providerLabel: "Gmail ready",
      stallingState: "No stalling",
      feeSignal: "No fee issue",
      productionCount: 0,
      diagnosticCount: 0,
      ownerLabel: "Local",
      nextActionLabel: "Review to send"
    }),
    Object.freeze({
      id: "card_prr_req_airport_022",
      prrRequestId: "prr_req_airport_022",
      title: "Airport authority delay messages",
      agencyId: "agency_mia",
      agencyName: "Miami-Dade Aviation Department",
      jurisdictionLabel: "Florida Public Records",
      investigationLabel: "Airport procurement",
      laneId: "needs-follow-up",
      severity: "critical",
      deadlineLabel: "Confirmed Jul 19",
      deadlineSource: "confirmed",
      providerLabel: "Himalaya synced",
      stallingState: "Possible stalling",
      feeSignal: "Scope pressure",
      productionCount: 0,
      diagnosticCount: 1,
      ownerLabel: "Local",
      nextActionLabel: "Draft follow-up"
    }),
    Object.freeze({
      id: "card_prr_req_sheriff_045",
      prrRequestId: "prr_req_sheriff_045",
      title: "Sheriff body-camera vendor logs",
      agencyId: "agency_sheriff",
      agencyName: "Broward Sheriff's Office",
      jurisdictionLabel: "Florida Public Records",
      investigationLabel: "Vendor oversight",
      laneId: "review-fee-scope",
      severity: "high",
      deadlineLabel: "No fixed deadline",
      deadlineSource: "none",
      providerLabel: "IMAP match",
      stallingState: "Fee pressure",
      feeSignal: "$4,500 estimate",
      productionCount: 0,
      diagnosticCount: 0,
      ownerLabel: "Local",
      nextActionLabel: "Challenge fee"
    }),
    Object.freeze({
      id: "card_prr_req_production_018",
      prrRequestId: "prr_req_production_018",
      title: "City procurement email production",
      agencyId: "agency_city",
      agencyName: "City Procurement Office",
      jurisdictionLabel: "Florida Public Records",
      investigationLabel: "Vendor oversight",
      laneId: "production-arrived",
      severity: "medium",
      deadlineLabel: "Produced Jul 02",
      deadlineSource: "confirmed",
      providerLabel: "Gmail synced",
      stallingState: "Production received",
      feeSignal: "No fee issue",
      productionCount: 3,
      diagnosticCount: 0,
      ownerLabel: "Local",
      nextActionLabel: "Classify evidence"
    }),
    Object.freeze({
      id: "card_prr_req_transit_031",
      prrRequestId: "prr_req_transit_031",
      title: "Transit authority denial appeal",
      agencyId: "agency_transit",
      agencyName: "Regional Transit Authority",
      jurisdictionLabel: "US Federal FOIA",
      investigationLabel: "Transit contracts",
      laneId: "appeal-escalation",
      severity: "critical",
      deadlineLabel: "Confirmed Jun 24",
      deadlineSource: "confirmed",
      providerLabel: "Gmail synced",
      stallingState: "Confirmed stalling",
      feeSignal: "Appeal clock",
      productionCount: 0,
      diagnosticCount: 0,
      ownerLabel: "Local",
      nextActionLabel: "Confirm escalation basis"
    })
  ]),
  requestDetails: Object.freeze([
    Object.freeze({
      prrRequestId: "prr_req_001",
      title: "FAA vendor contracts",
      agencyName: "Federal Aviation Administration",
      nextAction: Object.freeze({
        label: "Review to send",
        summary: "Draft, recipients, and citation are ready for human review.",
        risk: "amber",
        explanation: Object.freeze([
          "Suggested from the Federal FOIA starter pack.",
          "Recipient matches the last FAA request you sent.",
          "No legal escalation language is present."
        ])
      }),
      sendGate: Object.freeze([
        Object.freeze({ id: "draft", label: "Draft body", complete: true, detail: "Template rendered." }),
        Object.freeze({ id: "recipients", label: "Recipients", complete: true, detail: "FOIA inbox verified." }),
        Object.freeze({ id: "citations", label: "Citations", complete: true, detail: "5 U.S.C. 552 clause attached." }),
        Object.freeze({ id: "attachments", label: "Attachments", complete: true, detail: "No attachments required." }),
        Object.freeze({ id: "risk", label: "Risk flags", complete: false, detail: "Human review required." })
      ]),
      escalationGate: Object.freeze([
        Object.freeze({ id: "basis", label: "Deadline or stalling basis", complete: false, detail: "No escalation basis." }),
        Object.freeze({ id: "citation", label: "Cited rule", complete: false, detail: "No legal citation selected." }),
        Object.freeze({ id: "evidence", label: "Correspondence evidence", complete: false, detail: "No agency delay evidence." }),
        Object.freeze({ id: "confirmation", label: "User confirmation", complete: false, detail: "Not confirmed." })
      ]),
      deadlinePosture: "Estimated Jul 30 from Federal FOIA 20-working-day rule.",
      correspondence: Object.freeze({
        provider: "gmail",
        syncState: "Ready to send",
        latestInbound: "No inbound message yet.",
        latestOutbound: "Draft prepared from Federal FOIA template."
      }),
      evidencePackets: Object.freeze([]),
      diagnostics: Object.freeze([]),
      timeline: Object.freeze(["prr.request.created", "prr.deadline.estimated", "prr.followup.drafted"])
    }),
    Object.freeze({
      prrRequestId: "prr_req_transit_031",
      title: "Transit authority denial appeal",
      agencyName: "Regional Transit Authority",
      nextAction: Object.freeze({
        label: "Confirm escalation basis",
        summary: "Escalation is locked until the user confirms the legal posture.",
        risk: "red",
        explanation: Object.freeze([
          "Confirmed deadline has passed.",
          "Correspondence evidence is linked.",
          "User confirmation is still missing."
        ])
      }),
      sendGate: Object.freeze([
        Object.freeze({ id: "draft", label: "Draft body", complete: true, detail: "Appeal draft available." }),
        Object.freeze({ id: "recipients", label: "Recipients", complete: true, detail: "Appeals inbox verified." }),
        Object.freeze({ id: "citations", label: "Citations", complete: true, detail: "Pack citation attached." }),
        Object.freeze({ id: "attachments", label: "Attachments", complete: true, detail: "Denial evidence linked." }),
        Object.freeze({ id: "risk", label: "Risk flags", complete: false, detail: "Escalation confirmation required." })
      ]),
      escalationGate: Object.freeze([
        Object.freeze({ id: "basis", label: "Deadline or stalling basis", complete: true, detail: "Confirmed stalling." }),
        Object.freeze({ id: "citation", label: "Cited rule", complete: true, detail: "Appeal guidance attached." }),
        Object.freeze({ id: "evidence", label: "Correspondence evidence", complete: true, detail: "Denial thread linked." }),
        Object.freeze({ id: "confirmation", label: "User confirmation", complete: false, detail: "Not confirmed." })
      ]),
      deadlinePosture: "Confirmed deadline passed on Jun 24; stalling confirmed by user.",
      correspondence: Object.freeze({
        provider: "gmail",
        syncState: "Thread synced",
        latestInbound: "Agency denied the request in full.",
        latestOutbound: "Appeal draft waiting for confirmation."
      }),
      evidencePackets: Object.freeze([
        Object.freeze({
          evidenceId: "ev_prr_denial_031",
          title: "Denial letter",
          hashState: "sha256 verified",
          extractionState: "Queued for correspondence metadata"
        })
      ]),
      diagnostics: Object.freeze([]),
      timeline: Object.freeze(["prr.request.created", "prr.denial.recorded", "prr.appeal.created"])
    })
  ]),
  signalMap: Object.freeze({
    nodes: Object.freeze([
      Object.freeze({ id: "agency_sheriff", agencyName: "Broward Sheriff's Office", tone: "red", x: 20, y: 42, summary: "Fee anomaly cluster" }),
      Object.freeze({ id: "agency_mia", agencyName: "Miami-Dade Aviation Department", tone: "amber", x: 48, y: 24, summary: "Repeated delay language" }),
      Object.freeze({ id: "agency_faa", agencyName: "Federal Aviation Administration", tone: "green", x: 72, y: 36, summary: "Two drafts ready" }),
      Object.freeze({ id: "agency_transit", agencyName: "Regional Transit Authority", tone: "red", x: 58, y: 70, summary: "Escalation gate locked" })
    ]),
    edges: Object.freeze([
      Object.freeze({ id: "edge_fee_delay", from: "agency_sheriff", to: "agency_mia", label: "Cost and delay pressure", tone: "amber" }),
      Object.freeze({ id: "edge_escalation", from: "agency_mia", to: "agency_transit", label: "Stalling pattern", tone: "red" })
    ])
  }),
  builder: Object.freeze({
    steps: Object.freeze([
      Object.freeze({
        id: "jurisdiction",
        label: "Jurisdiction pack",
        state: "complete",
        suggestedFills: Object.freeze([
          Object.freeze({
            id: "fill_florida_pack",
            fieldLabel: "Pack",
            value: "Florida Public Records",
            provenance: "Based on your current saved view."
          })
        ])
      }),
      Object.freeze({
        id: "agency",
        label: "Agency/contact",
        state: "needs-review",
        suggestedFills: Object.freeze([
          Object.freeze({
            id: "fill_agency_contact",
            fieldLabel: "Contact",
            value: "records@miami-airport.example",
            provenance: "You used this contact on your last 3 airport requests."
          })
        ])
      }),
      Object.freeze({ id: "scope", label: "Request scope", state: "needs-review", suggestedFills: Object.freeze([]) }),
      Object.freeze({ id: "delivery", label: "Delivery channel", state: "ready", suggestedFills: Object.freeze([]) }),
      Object.freeze({ id: "deadline", label: "Deadline estimate", state: "ready", suggestedFills: Object.freeze([]) }),
      Object.freeze({ id: "review", label: "Review/send gate", state: "ready", suggestedFills: Object.freeze([]) })
    ])
  })
});
```

- [ ] **Step 5: Add pure model selectors**

Create `packages/ui/src/requests/request-model.ts`:

```ts
import {
  prrLaneOrder,
  type PrrDetailModel,
  type PrrGateCheck,
  type PrrLaneId,
  type PrrLaneModel,
  type PrrSavedView,
  type PrrViewMode,
  type PrrWorkspaceFixture,
  type PrrWorkspaceViewModel
} from "./request-types.js";
export { prrLaneOrder } from "./request-types.js";

export const prrLaneLabels: Record<PrrLaneId, string> = {
  drafting: "Drafting",
  "ready-to-send": "Ready to send",
  "awaiting-agency": "Awaiting agency",
  "needs-follow-up": "Needs follow-up",
  "review-fee-scope": "Review fee/scope",
  "production-arrived": "Production arrived",
  "appeal-escalation": "Appeal/escalation"
};

export interface BuildPrrWorkspaceOptions {
  readonly savedViewId: string;
  readonly selectedRequestId: string | undefined;
  readonly viewMode: PrrViewMode | undefined;
}

export function buildPrrWorkspaceViewModel(
  fixture: PrrWorkspaceFixture,
  options: BuildPrrWorkspaceOptions
): PrrWorkspaceViewModel {
  const activeView = fixture.savedViews.find((view) => view.id === options.savedViewId) ?? fixture.savedViews[0];
  const cards = fixture.cards.filter((card) => cardMatchesView(card, activeView));
  return Object.freeze({
    savedViews: fixture.savedViews,
    activeView,
    viewMode: options.viewMode ?? activeView.mode,
    lanes: Object.freeze(prrLaneOrder.map((laneId) => buildLane(laneId, cards))),
    selectedRequest: getSelectedPrrRequest(fixture, options.selectedRequestId),
    signalMap: fixture.signalMap,
    builder: fixture.builder
  });
}

export function getSelectedPrrRequest(
  fixture: PrrWorkspaceFixture,
  selectedRequestId: string | undefined
): PrrDetailModel | undefined {
  if (selectedRequestId === undefined) {
    return fixture.requestDetails[0];
  }
  return fixture.requestDetails.find((detail) => detail.prrRequestId === selectedRequestId);
}

export function sendGateArmed(gate: readonly PrrGateCheck[] | undefined): boolean {
  return gate !== undefined && gate.every((check) => check.complete);
}

export function unresolvedEscalationPrerequisites(gate: readonly PrrGateCheck[] | undefined): readonly string[] {
  return Object.freeze((gate ?? []).filter((check) => !check.complete).map((check) => check.label));
}

function buildLane(laneId: PrrLaneId, cards: PrrWorkspaceFixture["cards"]): PrrLaneModel {
  const cardsInLane = cards.filter((card) => card.laneId === laneId);
  const cardsByAgency = new Map<string, typeof cardsInLane>();
  for (const card of cardsInLane) {
    cardsByAgency.set(card.agencyId, [...(cardsByAgency.get(card.agencyId) ?? []), card]);
  }

  return Object.freeze({
    id: laneId,
    label: prrLaneLabels[laneId],
    agencyGroups: Object.freeze(
      [...cardsByAgency.entries()].map(([agencyId, agencyCards]) => {
        const first = agencyCards[0];
        return Object.freeze({
          agencyId,
          agencyName: first.agencyName,
          jurisdictionLabel: first.jurisdictionLabel,
          heat: agencyCards.some((card) => card.severity === "critical") ? "red" : agencyCards.some((card) => card.severity === "high") ? "amber" : "cyan",
          summary: `${agencyCards.length} active signal${agencyCards.length === 1 ? "" : "s"}`,
          cards: Object.freeze(agencyCards)
        });
      })
    )
  });
}

function cardMatchesView(card: PrrWorkspaceFixture["cards"][number], view: PrrSavedView): boolean {
  if (view.filters.jurisdiction !== undefined && card.jurisdictionLabel !== view.filters.jurisdiction) {
    return false;
  }
  if (view.filters.laneIds !== undefined && !view.filters.laneIds.includes(card.laneId)) {
    return false;
  }
  if (view.filters.agencyIds !== undefined && !view.filters.agencyIds.includes(card.agencyId)) {
    return false;
  }
  return true;
}
```

- [ ] **Step 6: Run the model test to verify it passes**

Run:

```bash
npm test -- packages/ui/test/request-model.test.ts
```

Expected:

```text
Test Files  1 passed
```

- [ ] **Step 7: Run full verification**

Run:

```bash
npm run verify
```

Expected:

```text
typecheck passed
tests passed
factory-readiness passed
```

- [ ] **Step 8: Commit**

Run:

```bash
git add packages/ui/src/requests/request-types.ts packages/ui/src/requests/request-fixtures.ts packages/ui/src/requests/request-model.ts packages/ui/test/request-model.test.ts
git commit -m "feat: add prr workspace view model"
```

## Task 2: Add Module Routing For The Requests Workspace

**Files:**
- Modify: `packages/ui/src/App.tsx`
- Modify: `packages/ui/src/workspace/OpsShell.tsx`
- Modify: `packages/ui/src/workspace/ModuleRail.tsx`
- Modify: `packages/ui/src/workspace/CommandBand.tsx`
- Create: `packages/ui/test/request-shell.test.tsx`
- Modify: `packages/ui/test/shell.test.tsx`
- Modify: `packages/ui/test/app-smoke.test.tsx`

- [ ] **Step 1: Write failing routing and shell tests**

Create `packages/ui/test/request-shell.test.tsx`:

```tsx
/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.js";

describe("Requests module shell routing", () => {
  it("opens the Requests workspace from the module rail without losing the tactical shell", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("link", { name: "Requests" }));

    expect(screen.getByRole("heading", { name: "Requests" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Requests" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("searchbox", { name: "Requests search" })).toHaveAttribute(
      "placeholder",
      "Search requests, agencies, evidence, and correspondence"
    );
    expect(screen.getByRole("button", { name: "New request" })).toBeInTheDocument();
  });
});
```

Update the first test in `packages/ui/test/shell.test.tsx` so `OpsShell` receives the new generic props:

```tsx
<OpsShell
  modules={workspaceModules}
  activeModuleId="command"
  workspaceName="Cestus Local"
  modeLabel="Command"
  ledgerLabel="Ledger synced"
  syncLabel="Local sync live"
  deploymentLabel="Solo laptop"
  searchLabel="Command search"
  searchPlaceholder="Search requests, evidence, agencies, and assertions"
  mainId="command"
  mainLabel="Command workspace"
  onNewRequest={vi.fn()}
  onModuleSelect={vi.fn()}
  main={<h1>Command</h1>}
  decisionRail={<aside aria-label="Decision rail">Agent brief</aside>}
/>
```

Update `packages/ui/test/app-smoke.test.tsx` to keep the Command assertion and add:

```tsx
fireEvent.click(screen.getByRole("link", { name: "Requests" }));
expect(screen.getByRole("heading", { name: "Requests" })).toBeInTheDocument();
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- packages/ui/test/request-shell.test.tsx packages/ui/test/shell.test.tsx packages/ui/test/app-smoke.test.tsx
```

Expected:

```text
FAIL packages/ui/test/request-shell.test.tsx
Unable to find role="heading" and name "Requests"
```

- [ ] **Step 3: Make the command band configurable**

Modify `packages/ui/src/workspace/CommandBand.tsx`:

```ts
interface CommandBandProps {
  readonly workspaceName: string;
  readonly modeLabel: string;
  readonly ledgerLabel: string;
  readonly syncLabel: string;
  readonly deploymentLabel: string;
  readonly searchLabel?: string;
  readonly searchPlaceholder?: string;
  readonly onOpenMenu: () => void;
  readonly onNewRequest: () => void;
}
```

Default the search props inside the component:

```ts
export function CommandBand({
  workspaceName,
  modeLabel,
  ledgerLabel,
  syncLabel,
  deploymentLabel,
  searchLabel,
  searchPlaceholder,
  onOpenMenu,
  onNewRequest
}: CommandBandProps) {
const resolvedSearchLabel = searchLabel ?? "Command search";
const resolvedSearchPlaceholder = searchPlaceholder ?? "Search requests, evidence, agencies, and assertions";
```

Use those values in the search input:

```tsx
<span className="sr-only">{resolvedSearchLabel}</span>
<input
  name="command-search"
  type="search"
  aria-label={resolvedSearchLabel}
  placeholder={resolvedSearchPlaceholder}
  className="min-h-11 w-full border border-[var(--console-line)] bg-[var(--command-black)] px-3 py-2 font-mono text-base text-[var(--paper-light)] outline-none placeholder:text-[var(--muted-amber)] focus-visible:-outline-offset-1 focus-visible:outline-2 focus-visible:outline-[var(--signal-cyan)] sm:min-h-9 sm:text-sm"
/>
```

- [ ] **Step 4: Add module selection to rail and shell**

Modify `packages/ui/src/workspace/ModuleRail.tsx` props:

```ts
interface ModuleRailProps {
  readonly modules: readonly WorkspaceModule[];
  readonly activeModuleId: string;
  readonly onModuleSelect?: (moduleId: string) => void;
}
```

Pass `onModuleSelect` to `ModuleLink`, and add the handler to the anchor:

```tsx
<ModuleLink module={module} active={module.id === activeModuleId} onModuleSelect={onModuleSelect} />
```

```tsx
export function ModuleLink({
  module,
  active,
  onModuleSelect
}: {
  readonly module: WorkspaceModule;
  readonly active: boolean;
  readonly onModuleSelect?: (moduleId: string) => void;
}) {
  const label = module.preview ? module.label.replace(/\sPreview$/, "") : module.label;

  return (
    <a
      href={module.href}
      aria-label={module.label}
      aria-current={active ? "page" : undefined}
      aria-disabled={module.preview ? "true" : undefined}
      onClick={(event) => {
        if (module.preview) {
          event.preventDefault();
          return;
        }
        onModuleSelect?.(module.id);
      }}
      className={[
        "group flex min-h-10 items-center justify-between gap-3 border px-3 py-2 font-mono text-base sm:min-h-9 sm:text-sm",
        active
          ? "border-[var(--signal-orange)] bg-[var(--signal-orange)]/12 text-[var(--paper-light)]"
          : "border-transparent text-[var(--muted-amber)] hover:border-[var(--console-line)] hover:bg-[var(--console-panel)] hover:text-[var(--paper-light)]"
      ].join(" ")}
    >
      <span className="truncate">{label.toUpperCase()}</span>
      {module.preview ? (
        <span aria-hidden="true" className="shrink-0 text-[var(--signal-amber)]">
          Preview
        </span>
      ) : null}
    </a>
  );
}
```

Modify `packages/ui/src/workspace/OpsShell.tsx` props:

```ts
readonly searchLabel?: string;
readonly searchPlaceholder?: string;
readonly mainId: string;
readonly mainLabel: string;
readonly onModuleSelect?: (moduleId: string) => void;
```

Pass `onModuleSelect` into desktop and mobile module links, pass search props into `CommandBand`, and replace:

```tsx
<main id="command" className="min-w-0 px-4 py-4 lg:px-5">
```

with:

```tsx
<main id={mainId} aria-label={mainLabel} className="min-w-0 px-4 py-4 lg:px-5">
```

- [ ] **Step 5: Route App between Command and Requests**

Modify `packages/ui/src/App.tsx` to add active module state:

```ts
const [activeModuleId, setActiveModuleId] = useState("command");
const requestsActive = activeModuleId === "requests";
```

For this task only, use an interim Requests shell so routing works before the full board exists:

```tsx
const requestsMain = (
  <section aria-label="PRR signal operations board" className="space-y-5">
    <div className="border-b border-[var(--console-line)] pb-4">
      <p className="font-mono text-base text-[var(--signal-green)] sm:text-sm">Signal operations board</p>
      <h1 className="mt-1 text-2xl font-semibold text-balance text-[var(--paper-light)]">Requests</h1>
    </div>
    <div className="border border-[var(--console-line)] bg-[var(--console-void)]/72 p-5 text-base text-pretty text-[var(--muted-amber)]">
      PRR board shell ready for lanes, saved views, signal map, and request detail.
    </div>
  </section>
);
```

Pass dynamic props to `OpsShell`:

```tsx
<OpsShell
  modules={workspaceModules}
  activeModuleId={activeModuleId}
  workspaceName="Cestus Local"
  modeLabel={requestsActive ? "Requests" : "Command"}
  ledgerLabel="Ledger synced"
  syncLabel={requestsActive ? "PRR sync local" : "Local sync live"}
  deploymentLabel="Solo laptop"
  searchLabel={requestsActive ? "Requests search" : "Command search"}
  searchPlaceholder={
    requestsActive
      ? "Search requests, agencies, evidence, and correspondence"
      : "Search requests, evidence, agencies, and assertions"
  }
  mainId={requestsActive ? "requests" : "command"}
  mainLabel={requestsActive ? "Requests workspace" : "Command workspace"}
  onNewRequest={() => undefined}
  onModuleSelect={setActiveModuleId}
  main={requestsActive ? requestsMain : commandMain}
  decisionRail={requestsActive ? <aside aria-label="Request detail rail" className="h-full p-4 lg:p-5">Select a request to inspect next action.</aside> : commandDecisionRail}
/>
```

- [ ] **Step 6: Run targeted tests**

Run:

```bash
npm test -- packages/ui/test/request-shell.test.tsx packages/ui/test/shell.test.tsx packages/ui/test/app-smoke.test.tsx
```

Expected:

```text
Test Files  3 passed
```

- [ ] **Step 7: Run full verification**

Run:

```bash
npm run verify
```

Expected:

```text
typecheck passed
tests passed
factory-readiness passed
```

- [ ] **Step 8: Commit**

Run:

```bash
git add packages/ui/src/App.tsx packages/ui/src/workspace/OpsShell.tsx packages/ui/src/workspace/ModuleRail.tsx packages/ui/src/workspace/CommandBand.tsx packages/ui/test/request-shell.test.tsx packages/ui/test/shell.test.tsx packages/ui/test/app-smoke.test.tsx
git commit -m "feat: route requests workspace shell"
```

## Task 3: Build The Signal Operations Board

**Files:**
- Create: `packages/ui/src/requests/RequestWorkspace.tsx`
- Create: `packages/ui/src/requests/RequestCommandBar.tsx`
- Create: `packages/ui/src/requests/RequestBoard.tsx`
- Create: `packages/ui/src/requests/RequestLane.tsx`
- Create: `packages/ui/src/requests/RequestCard.tsx`
- Modify: `packages/ui/src/App.tsx`
- Create: `packages/ui/test/request-board.test.tsx`

- [ ] **Step 1: Write failing board tests**

Create `packages/ui/test/request-board.test.tsx`:

```tsx
/** @vitest-environment jsdom */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RequestWorkspace } from "../src/requests/RequestWorkspace.js";
import { prrWorkspaceFixture } from "../src/requests/request-fixtures.js";

describe("RequestWorkspace board", () => {
  it("renders seven action lanes grouped by agency", () => {
    render(<RequestWorkspace fixture={prrWorkspaceFixture} onOpenBuilder={() => undefined} />);

    expect(screen.getByRole("heading", { name: "Requests" })).toBeInTheDocument();
    for (const lane of [
      "Drafting",
      "Ready to send",
      "Awaiting agency",
      "Needs follow-up",
      "Review fee/scope",
      "Production arrived",
      "Appeal/escalation"
    ]) {
      expect(screen.getByRole("region", { name: lane })).toBeInTheDocument();
    }
    expect(screen.getByText("Federal Aviation Administration")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select FAA vendor contracts" })).toBeInTheDocument();
  });

  it("applies saved views and keeps board mode selected", () => {
    render(<RequestWorkspace fixture={prrWorkspaceFixture} onOpenBuilder={() => undefined} />);

    fireEvent.change(screen.getByLabelText("Saved PRR view"), { target: { value: "florida-fees" } });

    expect(screen.getByRole("button", { name: "Board view" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Broward Sheriff's Office")).toBeInTheDocument();
    expect(screen.queryByText("Federal Aviation Administration")).not.toBeInTheDocument();
  });

  it("selects request cards from the board", () => {
    render(<RequestWorkspace fixture={prrWorkspaceFixture} onOpenBuilder={() => undefined} />);

    fireEvent.click(screen.getByRole("button", { name: "Select Transit authority denial appeal" }));

    expect(within(screen.getByRole("complementary", { name: "Request detail rail" })).getByText("Transit authority denial appeal")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run board test to verify failure**

Run:

```bash
npm test -- packages/ui/test/request-board.test.tsx
```

Expected:

```text
FAIL packages/ui/test/request-board.test.tsx
Failed to resolve import "../src/requests/RequestWorkspace.js"
```

- [ ] **Step 3: Add request command bar**

Create `packages/ui/src/requests/RequestCommandBar.tsx`:

```tsx
import type { PrrSavedView, PrrViewMode } from "./request-types.js";

interface RequestCommandBarProps {
  readonly savedViews: readonly PrrSavedView[];
  readonly activeViewId: string;
  readonly viewMode: PrrViewMode;
  readonly onSavedViewChange: (viewId: string) => void;
  readonly onViewModeChange: (mode: PrrViewMode) => void;
}

export function RequestCommandBar({
  savedViews,
  activeViewId,
  viewMode,
  onSavedViewChange,
  onViewModeChange
}: RequestCommandBarProps) {
  return (
    <section aria-label="Requests command controls" className="border border-[var(--console-line)] bg-[var(--console-void)]/72 p-3">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <label className="min-w-0">
          <span className="mb-1 block font-mono text-base text-[var(--muted-amber)] sm:text-sm">Saved view</span>
          <select
            name="saved-prr-view"
            aria-label="Saved PRR view"
            value={activeViewId}
            onChange={(event) => onSavedViewChange(event.currentTarget.value)}
            className="min-h-11 w-full border border-[var(--console-line)] bg-[var(--command-black)] px-3 py-2 text-base text-[var(--paper-light)] focus-visible:-outline-offset-1 focus-visible:outline-2 focus-visible:outline-[var(--signal-cyan)] sm:min-h-9 sm:text-sm"
          >
            {savedViews.map((view) => (
              <option key={view.id} value={view.id}>
                {view.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2" aria-label="Request view mode">
          <button
            type="button"
            aria-pressed={viewMode === "board"}
            onClick={() => onViewModeChange("board")}
            className={viewButtonClass(viewMode === "board")}
          >
            Board view
          </button>
          <button
            type="button"
            aria-pressed={viewMode === "signal-map"}
            onClick={() => onViewModeChange("signal-map")}
            className={viewButtonClass(viewMode === "signal-map")}
          >
            Signal map
          </button>
        </div>
      </div>
    </section>
  );
}

function viewButtonClass(active: boolean): string {
  return [
    "relative min-h-10 border px-3 py-2 font-mono text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--signal-cyan)] sm:min-h-9 sm:text-sm",
    active
      ? "border-[var(--signal-green)] bg-[var(--signal-green)]/12 text-[var(--paper-light)]"
      : "border-[var(--console-line)] text-[var(--muted-amber)] hover:border-[var(--signal-cyan)] hover:bg-[var(--console-panel)] hover:text-[var(--paper-light)]"
  ].join(" ");
}
```

- [ ] **Step 4: Add board, lane, and card components**

Create `packages/ui/src/requests/RequestBoard.tsx`:

```tsx
import type { PrrLaneModel } from "./request-types.js";
import { RequestLane } from "./RequestLane.js";

interface RequestBoardProps {
  readonly lanes: readonly PrrLaneModel[];
  readonly selectedRequestId: string | undefined;
  readonly onSelectRequest: (requestId: string) => void;
}

export function RequestBoard({ lanes, selectedRequestId, onSelectRequest }: RequestBoardProps) {
  return (
    <section aria-label="Signal operations board" className="@container">
      <div className="grid gap-3 @5xl:grid-cols-2 @7xl:grid-cols-3">
        {lanes.map((lane) => (
          <RequestLane
            key={lane.id}
            lane={lane}
            selectedRequestId={selectedRequestId}
            onSelectRequest={onSelectRequest}
          />
        ))}
      </div>
    </section>
  );
}
```

Create `packages/ui/src/requests/RequestLane.tsx`:

```tsx
import type { PrrLaneModel, PrrSignalTone } from "./request-types.js";
import { RequestCard } from "./RequestCard.js";

interface RequestLaneProps {
  readonly lane: PrrLaneModel;
  readonly selectedRequestId: string | undefined;
  readonly onSelectRequest: (requestId: string) => void;
}

const heatClasses: Record<PrrSignalTone, string> = {
  red: "border-[var(--signal-red)] text-[var(--signal-red)]",
  amber: "border-[var(--signal-amber)] text-[var(--signal-amber)]",
  green: "border-[var(--signal-green)] text-[var(--signal-green)]",
  cyan: "border-[var(--signal-cyan)] text-[var(--signal-cyan)]",
  neutral: "border-[var(--console-line)] text-[var(--muted-amber)]"
};

export function RequestLane({ lane, selectedRequestId, onSelectRequest }: RequestLaneProps) {
  const count = lane.agencyGroups.reduce((total, group) => total + group.cards.length, 0);

  return (
    <section aria-label={lane.label} className="min-w-0 border border-[var(--console-line)] bg-[var(--console-void)]/72">
      <header className="border-b border-[var(--console-line)] p-3">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <h2 className="truncate text-base font-semibold text-[var(--paper-light)]">{lane.label}</h2>
          <div className="shrink-0 font-mono text-base tabular-nums text-[var(--signal-green)] sm:text-sm">{count}</div>
        </div>
      </header>
      <div className="space-y-3 p-3">
        {lane.agencyGroups.length === 0 ? (
          <div className="border border-[var(--console-line)] p-3 text-base text-pretty text-[var(--muted-amber)] sm:text-sm">
            No requests are currently routed to this action state.
          </div>
        ) : (
          lane.agencyGroups.map((group) => (
            <section key={group.agencyId} aria-label={`${group.agencyName} group`} className="space-y-2">
              <div className={`border px-2 py-1 font-mono text-base sm:text-sm ${heatClasses[group.heat]}`}>
                <div className="truncate">{group.agencyName}</div>
                <div className="truncate text-[var(--muted-amber)]">{group.jurisdictionLabel} / {group.summary}</div>
              </div>
              {group.cards.map((card) => (
                <RequestCard
                  key={card.id}
                  card={card}
                  selected={card.prrRequestId === selectedRequestId}
                  onSelectRequest={onSelectRequest}
                />
              ))}
            </section>
          ))
        )}
      </div>
    </section>
  );
}
```

Create `packages/ui/src/requests/RequestCard.tsx`:

```tsx
import type { PrrRequestCard, PrrSeverity } from "./request-types.js";

interface RequestCardProps {
  readonly card: PrrRequestCard;
  readonly selected: boolean;
  readonly onSelectRequest: (requestId: string) => void;
}

const severityClasses: Record<PrrSeverity, string> = {
  critical: "border-[var(--signal-red)] text-[var(--signal-red)]",
  high: "border-[var(--signal-amber)] text-[var(--signal-amber)]",
  medium: "border-[var(--signal-cyan)] text-[var(--signal-cyan)]",
  low: "border-[var(--console-line)] text-[var(--muted-amber)]"
};

export function RequestCard({ card, selected, onSelectRequest }: RequestCardProps) {
  return (
    <button
      type="button"
      aria-label={`Select ${card.title}`}
      onClick={() => onSelectRequest(card.prrRequestId)}
      className={[
        "relative w-full min-w-0 border bg-[var(--command-black)]/70 p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--signal-cyan)]",
        selected ? "border-[var(--signal-cyan)]" : "border-[var(--console-line)] hover:border-[var(--signal-cyan)]"
      ].join(" ")}
    >
      <span
        aria-hidden="true"
        className="pointer-fine:hidden absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2"
      />
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-base font-medium text-[var(--paper-light)] sm:text-sm">{card.title}</div>
          <div className="mt-1 truncate font-mono text-base text-[var(--muted-amber)] sm:text-sm">{card.prrRequestId}</div>
        </div>
        <div className={`shrink-0 border px-2 py-1 font-mono text-base sm:text-sm ${severityClasses[card.severity]}`}>
          {card.severity}
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 font-mono text-base sm:text-sm">
        <div>
          <dt className="text-[var(--muted-amber)]">Deadline</dt>
          <dd className="truncate text-[var(--paper-light)]">{card.deadlineLabel}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted-amber)]">Provider</dt>
          <dd className="truncate text-[var(--signal-cyan)]">{card.providerLabel}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted-amber)]">Fee</dt>
          <dd className="truncate text-[var(--signal-amber)]">{card.feeSignal}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted-amber)]">Evidence</dt>
          <dd className="truncate text-[var(--signal-green)]">{card.productionCount} packets</dd>
        </div>
      </dl>
      <div className="mt-3 border-t border-[var(--console-line)] pt-2 font-mono text-base text-[var(--signal-green)] sm:text-sm">
        {card.nextActionLabel}
      </div>
    </button>
  );
}
```

- [ ] **Step 5: Add RequestWorkspace and wire App**

Create `packages/ui/src/requests/RequestWorkspace.tsx`:

```tsx
import { useMemo, useState } from "react";
import { buildPrrWorkspaceViewModel } from "./request-model.js";
import type { PrrViewMode, PrrWorkspaceFixture } from "./request-types.js";
import { RequestBoard } from "./RequestBoard.js";
import { RequestCommandBar } from "./RequestCommandBar.js";

interface RequestWorkspaceProps {
  readonly fixture: PrrWorkspaceFixture;
  readonly onOpenBuilder: () => void;
}

export function RequestWorkspace({ fixture, onOpenBuilder }: RequestWorkspaceProps) {
  const [savedViewId, setSavedViewId] = useState("all-active");
  const [viewMode, setViewMode] = useState<PrrViewMode | undefined>();
  const [selectedRequestId, setSelectedRequestId] = useState<string | undefined>("prr_req_001");
  const model = useMemo(
    () => buildPrrWorkspaceViewModel(fixture, { savedViewId, selectedRequestId, viewMode }),
    [fixture, savedViewId, selectedRequestId, viewMode]
  );

  return (
    <div className="space-y-5">
      <div className="border-b border-[var(--console-line)] pb-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="font-mono text-base text-[var(--signal-green)] sm:text-sm">Signal operations board</p>
            <h1 className="mt-1 text-2xl font-semibold text-balance text-[var(--paper-light)]">Requests</h1>
          </div>
          <button
            type="button"
            onClick={onOpenBuilder}
            className="relative min-h-10 border border-[var(--console-line)] px-3 py-2 text-base text-[var(--signal-amber)] hover:border-[var(--signal-amber)] hover:bg-[var(--console-panel)] hover:text-[var(--paper-light)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--signal-cyan)] sm:min-h-9 sm:text-sm"
          >
            <span aria-hidden="true" className="pointer-fine:hidden absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2" />
            Open guided builder
          </button>
        </div>
      </div>
      <RequestCommandBar
        savedViews={model.savedViews}
        activeViewId={model.activeView.id}
        viewMode={model.viewMode}
        onSavedViewChange={(nextViewId) => {
          setSavedViewId(nextViewId);
          setViewMode(undefined);
        }}
        onViewModeChange={setViewMode}
      />
      <RequestBoard lanes={model.lanes} selectedRequestId={selectedRequestId} onSelectRequest={setSelectedRequestId} />
      <aside aria-label="Request detail rail" className="sr-only">
        {model.selectedRequest?.title ?? "No request selected"}
      </aside>
    </div>
  );
}
```

Modify `packages/ui/src/App.tsx` to import and render the real workspace:

```ts
import { RequestWorkspace } from "./requests/RequestWorkspace.js";
import { prrWorkspaceFixture } from "./requests/request-fixtures.js";
```

Replace the Task 2 interim `requestsMain` shell with:

```tsx
const requestsMain = <RequestWorkspace fixture={prrWorkspaceFixture} onOpenBuilder={() => undefined} />;
```

- [ ] **Step 6: Run targeted board tests**

Run:

```bash
npm test -- packages/ui/test/request-board.test.tsx packages/ui/test/request-shell.test.tsx packages/ui/test/app-smoke.test.tsx
```

Expected:

```text
Test Files  3 passed
```

- [ ] **Step 7: Run full verification**

Run:

```bash
npm run verify
```

Expected:

```text
typecheck passed
tests passed
factory-readiness passed
```

- [ ] **Step 8: Commit**

Run:

```bash
git add packages/ui/src/App.tsx packages/ui/src/requests/RequestWorkspace.tsx packages/ui/src/requests/RequestCommandBar.tsx packages/ui/src/requests/RequestBoard.tsx packages/ui/src/requests/RequestLane.tsx packages/ui/src/requests/RequestCard.tsx packages/ui/test/request-board.test.tsx
git commit -m "feat: add prr signal operations board"
```

## Task 4: Add The Selected Request Detail Rail

**Files:**
- Create: `packages/ui/src/requests/RequestDetailRail.tsx`
- Modify: `packages/ui/src/requests/RequestWorkspace.tsx`
- Modify: `packages/ui/src/App.tsx`
- Create: `packages/ui/test/request-detail-rail.test.tsx`
- Modify: `packages/ui/test/request-board.test.tsx`

- [ ] **Step 1: Write failing detail rail tests**

Create `packages/ui/test/request-detail-rail.test.tsx`:

```tsx
/** @vitest-environment jsdom */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RequestDetailRail } from "../src/requests/RequestDetailRail.js";
import { prrWorkspaceFixture } from "../src/requests/request-fixtures.js";
import { getSelectedPrrRequest } from "../src/requests/request-model.js";

describe("RequestDetailRail", () => {
  it("starts with the next action packet and explainable recommendation strip", () => {
    const selectedRequest = getSelectedPrrRequest(prrWorkspaceFixture, "prr_req_001");
    render(<RequestDetailRail selectedRequest={selectedRequest} />);

    const rail = screen.getByRole("complementary", { name: "Request detail rail" });
    expect(within(rail).getByRole("heading", { name: "FAA vendor contracts" })).toBeInTheDocument();
    expect(within(rail).getByText("Review to send")).toBeInTheDocument();
    expect(within(rail).getByText("Suggested from the Federal FOIA starter pack.")).toBeInTheDocument();
  });

  it("keeps send locked until every review check is complete", () => {
    const selectedRequest = getSelectedPrrRequest(prrWorkspaceFixture, "prr_req_001");
    render(<RequestDetailRail selectedRequest={selectedRequest} />);

    expect(screen.getByRole("button", { name: "Review to send" })).toBeDisabled();
    expect(screen.getByText("Risk flags")).toBeInTheDocument();
    expect(screen.getByText("Human review required.")).toBeInTheDocument();
  });

  it("explains locked legal escalation prerequisites", () => {
    const selectedRequest = getSelectedPrrRequest(prrWorkspaceFixture, "prr_req_transit_031");
    render(<RequestDetailRail selectedRequest={selectedRequest} />);

    expect(screen.getByText("Legal escalation locked")).toBeInTheDocument();
    expect(screen.getByText("User confirmation")).toBeInTheDocument();
    expect(screen.getByText("Not confirmed.")).toBeInTheDocument();
  });
});
```

Update `packages/ui/test/request-board.test.tsx` so the selected-card test checks the visible rail through `App`, not the temporary sr-only rail inside `RequestWorkspace`. Add this import:

```tsx
import { App } from "../src/App.js";
```

Replace the selected-card test body with:

```tsx
render(<App />);
fireEvent.click(screen.getByRole("link", { name: "Requests" }));
fireEvent.click(screen.getByRole("button", { name: "Select Transit authority denial appeal" }));
expect(within(screen.getByRole("complementary", { name: "Request detail rail" })).getByText("Confirm escalation basis")).toBeInTheDocument();
```

- [ ] **Step 2: Run rail tests to verify failure**

Run:

```bash
npm test -- packages/ui/test/request-detail-rail.test.tsx packages/ui/test/request-board.test.tsx
```

Expected:

```text
FAIL packages/ui/test/request-detail-rail.test.tsx
Failed to resolve import "../src/requests/RequestDetailRail.js"
```

- [ ] **Step 3: Add RequestDetailRail**

Create `packages/ui/src/requests/RequestDetailRail.tsx`:

```tsx
import { sendGateArmed, unresolvedEscalationPrerequisites } from "./request-model.js";
import type { PrrDetailModel, PrrGateCheck, PrrSignalTone } from "./request-types.js";

interface RequestDetailRailProps {
  readonly selectedRequest: PrrDetailModel | undefined;
}

const toneClasses: Record<PrrSignalTone, string> = {
  red: "border-[var(--signal-red)] text-[var(--signal-red)]",
  amber: "border-[var(--signal-amber)] text-[var(--signal-amber)]",
  green: "border-[var(--signal-green)] text-[var(--signal-green)]",
  cyan: "border-[var(--signal-cyan)] text-[var(--signal-cyan)]",
  neutral: "border-[var(--console-line)] text-[var(--muted-amber)]"
};

export function RequestDetailRail({ selectedRequest }: RequestDetailRailProps) {
  return (
    <aside aria-label="Request detail rail" className="h-full p-4 lg:p-5">
      {selectedRequest === undefined ? (
        <div className="text-base text-pretty text-[var(--muted-amber)]">Select a request to inspect its next action.</div>
      ) : (
        <div>
          <p className="font-mono text-base text-[var(--signal-green)] sm:text-sm">Selected request</p>
          <h2 className="mt-2 text-lg font-semibold text-balance text-[var(--paper-light)]">{selectedRequest.title}</h2>
          <section aria-label="Next action packet" className="mt-5 border border-[var(--console-line)] bg-[var(--console-void)]/72 p-3">
            <div className={`w-fit border px-2 py-1 font-mono text-base sm:text-sm ${toneClasses[selectedRequest.nextAction.risk]}`}>
              {selectedRequest.nextAction.risk}
            </div>
            <h3 className="mt-3 text-base font-semibold text-balance text-[var(--paper-light)]">{selectedRequest.nextAction.label}</h3>
            <p className="mt-2 text-base text-pretty text-[var(--muted-amber)] sm:text-sm">{selectedRequest.nextAction.summary}</p>
            <section aria-label="Why this recommendation" className="mt-3 border-t border-[var(--console-line)] pt-3">
              <h4 className="font-mono text-base text-[var(--signal-cyan)] sm:text-sm">Why this?</h4>
              <ul role="list" className="mt-2 space-y-2">
                {selectedRequest.nextAction.explanation.map((reason) => (
                  <li key={reason} className="border-l border-[var(--console-line)] pl-3 text-base text-pretty text-[var(--muted-amber)] sm:text-sm">
                    {reason}
                  </li>
                ))}
              </ul>
            </section>
            <button
              type="button"
              disabled={!sendGateArmed(selectedRequest.sendGate)}
              className="mt-4 min-h-10 border border-[var(--signal-orange)] px-3 py-2 text-base font-semibold text-[var(--signal-orange)] disabled:border-[var(--console-line)] disabled:text-[var(--muted-amber)] sm:min-h-9 sm:text-sm"
            >
              {sendGateArmed(selectedRequest.sendGate) ? "Send now" : "Review to send"}
            </button>
          </section>
          <GateSection title="Send review gate" checks={selectedRequest.sendGate} />
          <section aria-label="Legal escalation gate" className="mt-5 border border-[var(--signal-red)]/70 bg-[var(--console-void)]/72 p-3">
            <h3 className="text-base font-semibold text-balance text-[var(--paper-light)]">Legal escalation locked</h3>
            <p className="mt-2 text-base text-pretty text-[var(--muted-amber)] sm:text-sm">
              Missing prerequisites: {unresolvedEscalationPrerequisites(selectedRequest.escalationGate).join(", ") || "none"}.
            </p>
            <GateChecks checks={selectedRequest.escalationGate} />
          </section>
          <RailSection title="Deadline posture" items={[selectedRequest.deadlinePosture]} />
          <RailSection title="Correspondence" items={[selectedRequest.correspondence.syncState, selectedRequest.correspondence.latestInbound, selectedRequest.correspondence.latestOutbound]} />
          <RailSection title="Evidence intake" items={selectedRequest.evidencePackets.map((packet) => `${packet.evidenceId} / ${packet.hashState} / ${packet.extractionState}`)} />
          <RailSection title="Diagnostics" items={selectedRequest.diagnostics.length === 0 ? ["No active diagnostics."] : selectedRequest.diagnostics} />
          <RailSection title="Timeline" items={selectedRequest.timeline} />
        </div>
      )}
    </aside>
  );
}

function GateSection({ title, checks }: { readonly title: string; readonly checks: readonly PrrGateCheck[] }) {
  return (
    <section aria-label={title} className="mt-5 border border-[var(--console-line)] bg-[var(--console-void)]/72 p-3">
      <h3 className="text-base font-semibold text-balance text-[var(--paper-light)]">{title}</h3>
      <GateChecks checks={checks} />
    </section>
  );
}

function GateChecks({ checks }: { readonly checks: readonly PrrGateCheck[] }) {
  return (
    <ul role="list" className="mt-3 space-y-2">
      {checks.map((check) => (
        <li key={check.id} className="border-t border-[var(--console-line)] pt-2 first:border-t-0 first:pt-0">
          <div className="font-mono text-base text-[var(--paper-light)] sm:text-sm">{check.label}</div>
          <div className={check.complete ? "text-base text-[var(--signal-green)] sm:text-sm" : "text-base text-[var(--signal-amber)] sm:text-sm"}>
            {check.detail}
          </div>
        </li>
      ))}
    </ul>
  );
}

function RailSection({ title, items }: { readonly title: string; readonly items: readonly string[] }) {
  return (
    <section className="mt-5">
      <h3 className="text-base font-semibold text-balance text-[var(--paper-light)] sm:text-sm">{title}</h3>
      <ul role="list" className="mt-2 space-y-2">
        {items.map((item) => (
          <li key={`${title}:${item}`} className="border-l border-[var(--console-line)] pl-3 text-base text-pretty text-[var(--muted-amber)] sm:text-sm">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: Wire rail into workspace and app**

Modify `packages/ui/src/requests/RequestWorkspace.tsx` to export selected request state to the app.

Change the imports:

```ts
import { useEffect, useMemo, useState } from "react";
import type { PrrDetailModel, PrrViewMode, PrrWorkspaceFixture } from "./request-types.js";
```

Replace the props with:

```ts
interface RequestWorkspaceProps {
  readonly fixture: PrrWorkspaceFixture;
  readonly onOpenBuilder: () => void;
  readonly selectedRequestId: string | undefined;
  readonly onSelectRequest: (requestId: string) => void;
  readonly onSelectedRequestChange: (request: PrrDetailModel | undefined) => void;
}
```

Remove the local `selectedRequestId` state declaration from `RequestWorkspace`; `App` now owns selected request state. Keep the local saved-view and view-mode state. After building the model, add:

```ts
useEffect(() => {
  onSelectedRequestChange(model.selectedRequest);
}, [model.selectedRequest, onSelectedRequestChange]);
```

Remove the temporary sr-only rail from `RequestWorkspace`.

Modify `packages/ui/src/App.tsx`:

```ts
import type { PrrDetailModel } from "./requests/request-types.js";
import { RequestDetailRail } from "./requests/RequestDetailRail.js";
```

Add state:

```ts
const [selectedPrrRequestId, setSelectedPrrRequestId] = useState<string | undefined>("prr_req_001");
const [selectedPrrRequest, setSelectedPrrRequest] = useState<PrrDetailModel | undefined>();
```

Render:

```tsx
const requestsMain = (
  <RequestWorkspace
    fixture={prrWorkspaceFixture}
    onOpenBuilder={() => undefined}
    selectedRequestId={selectedPrrRequestId}
    onSelectRequest={setSelectedPrrRequestId}
    onSelectedRequestChange={setSelectedPrrRequest}
  />
);
```

Use:

```tsx
decisionRail={requestsActive ? <RequestDetailRail selectedRequest={selectedPrrRequest} /> : commandDecisionRail}
```

- [ ] **Step 5: Run targeted rail tests**

Run:

```bash
npm test -- packages/ui/test/request-detail-rail.test.tsx packages/ui/test/request-board.test.tsx packages/ui/test/request-shell.test.tsx
```

Expected:

```text
Test Files  3 passed
```

- [ ] **Step 6: Run full verification**

Run:

```bash
npm run verify
```

Expected:

```text
typecheck passed
tests passed
factory-readiness passed
```

- [ ] **Step 7: Commit**

Run:

```bash
git add packages/ui/src/App.tsx packages/ui/src/requests/RequestWorkspace.tsx packages/ui/src/requests/RequestDetailRail.tsx packages/ui/test/request-detail-rail.test.tsx packages/ui/test/request-board.test.tsx
git commit -m "feat: add prr request detail rail"
```

## Task 5: Add The Alternate Signal Map View

**Files:**
- Create: `packages/ui/src/requests/RequestSignalMap.tsx`
- Modify: `packages/ui/src/requests/RequestWorkspace.tsx`
- Create: `packages/ui/test/request-signal-map.test.tsx`
- Modify: `packages/ui/test/request-board.test.tsx`

- [ ] **Step 1: Write failing signal map tests**

Create `packages/ui/test/request-signal-map.test.tsx`:

```tsx
/** @vitest-environment jsdom */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RequestWorkspace } from "../src/requests/RequestWorkspace.js";
import { prrWorkspaceFixture } from "../src/requests/request-fixtures.js";

describe("Request signal map", () => {
  it("renders the signal map shell from local fixture nodes and edges", () => {
    render(
      <RequestWorkspace
        fixture={prrWorkspaceFixture}
        onOpenBuilder={() => undefined}
        selectedRequestId="prr_req_001"
        onSelectRequest={() => undefined}
        onSelectedRequestChange={() => undefined}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Signal map" }));

    expect(screen.getByRole("region", { name: "PRR signal map" })).toBeInTheDocument();
    expect(screen.getByText("Broward Sheriff's Office")).toBeInTheDocument();
    expect(screen.getByText("Cost and delay pressure")).toBeInTheDocument();
  });

  it("selects an agency node and exposes accessible detail", () => {
    render(
      <RequestWorkspace
        fixture={prrWorkspaceFixture}
        onOpenBuilder={() => undefined}
        selectedRequestId="prr_req_001"
        onSelectRequest={() => undefined}
        onSelectedRequestChange={() => undefined}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Signal map" }));
    fireEvent.click(screen.getByRole("button", { name: "Select signal node Regional Transit Authority" }));

    const detail = screen.getByRole("region", { name: "Selected agency signal" });
    expect(within(detail).getByText("Regional Transit Authority")).toBeInTheDocument();
    expect(within(detail).getByText("Escalation gate locked")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run signal map tests to verify failure**

Run:

```bash
npm test -- packages/ui/test/request-signal-map.test.tsx
```

Expected:

```text
FAIL packages/ui/test/request-signal-map.test.tsx
Unable to find role="region" and name "PRR signal map"
```

- [ ] **Step 3: Add RequestSignalMap**

Create `packages/ui/src/requests/RequestSignalMap.tsx`:

```tsx
import { useState } from "react";
import type { PrrSignalMapModel, PrrSignalMapNode, PrrSignalTone } from "./request-types.js";

interface RequestSignalMapProps {
  readonly map: PrrSignalMapModel;
}

const toneClasses: Record<PrrSignalTone, string> = {
  red: "border-[var(--signal-red)] text-[var(--signal-red)]",
  amber: "border-[var(--signal-amber)] text-[var(--signal-amber)]",
  green: "border-[var(--signal-green)] text-[var(--signal-green)]",
  cyan: "border-[var(--signal-cyan)] text-[var(--signal-cyan)]",
  neutral: "border-[var(--console-line)] text-[var(--muted-amber)]"
};

export function RequestSignalMap({ map }: RequestSignalMapProps) {
  const [selectedNodeId, setSelectedNodeId] = useState(map.nodes[0]?.id);
  const selectedNode = map.nodes.find((node) => node.id === selectedNodeId) ?? map.nodes[0];

  return (
    <section aria-label="PRR signal map" className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="relative min-h-[28rem] overflow-hidden border border-[var(--console-line)] bg-[var(--command-black)]/82 p-4">
        <div aria-hidden="true" className="cestus-scan-layer absolute inset-0 opacity-45" />
        <div className="relative min-h-[25rem]">
          {map.edges.map((edge) => (
            <div key={edge.id} className={`mb-2 w-fit border px-2 py-1 font-mono text-base sm:text-sm ${toneClasses[edge.tone]}`}>
              {edge.label}
            </div>
          ))}
          {map.nodes.map((node) => (
            <button
              key={node.id}
              type="button"
              aria-label={`Select signal node ${node.agencyName}`}
              onClick={() => setSelectedNodeId(node.id)}
              className={`absolute min-h-10 w-36 border bg-[var(--console-void)]/90 p-2 text-left font-mono text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--signal-cyan)] sm:text-sm ${toneClasses[node.tone]}`}
              style={{ left: `${node.x}%`, top: `${node.y}%`, transform: "translate(-50%, -50%)" }}
            >
              <span className="block truncate text-[var(--paper-light)]">{node.agencyName}</span>
              <span className="block truncate">{node.summary}</span>
            </button>
          ))}
        </div>
      </div>
      <SelectedAgencySignal node={selectedNode} />
      <div className="xl:col-span-2">
        <h2 className="text-base font-semibold text-balance text-[var(--paper-light)]">Accessible signal list</h2>
        <ul role="list" className="mt-2 grid gap-2 md:grid-cols-2">
          {map.nodes.map((node) => (
            <li key={node.id} className="border border-[var(--console-line)] bg-[var(--console-void)]/72 p-3">
              <div className="font-mono text-base text-[var(--paper-light)] sm:text-sm">{node.agencyName}</div>
              <div className="mt-1 text-base text-[var(--muted-amber)] sm:text-sm">{node.summary}</div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function SelectedAgencySignal({ node }: { readonly node: PrrSignalMapNode | undefined }) {
  return (
    <section aria-label="Selected agency signal" className="border border-[var(--console-line)] bg-[var(--console-void)]/72 p-3">
      {node === undefined ? (
        <p className="text-base text-[var(--muted-amber)]">No agency signal selected.</p>
      ) : (
        <>
          <p className="font-mono text-base text-[var(--signal-green)] sm:text-sm">Selected agency</p>
          <h2 className="mt-2 text-base font-semibold text-balance text-[var(--paper-light)]">{node.agencyName}</h2>
          <p className="mt-2 text-base text-pretty text-[var(--muted-amber)] sm:text-sm">{node.summary}</p>
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Render signal map from RequestWorkspace**

Modify `packages/ui/src/requests/RequestWorkspace.tsx`:

```ts
import { RequestSignalMap } from "./RequestSignalMap.js";
```

Replace the unconditional board render with:

```tsx
{model.viewMode === "signal-map" ? (
  <RequestSignalMap map={model.signalMap} />
) : (
  <RequestBoard lanes={model.lanes} selectedRequestId={selectedRequestId} onSelectRequest={onSelectRequest} />
)}
```

- [ ] **Step 5: Run targeted signal map tests**

Run:

```bash
npm test -- packages/ui/test/request-signal-map.test.tsx packages/ui/test/request-board.test.tsx
```

Expected:

```text
Test Files  2 passed
```

- [ ] **Step 6: Run full verification**

Run:

```bash
npm run verify
```

Expected:

```text
typecheck passed
tests passed
factory-readiness passed
```

- [ ] **Step 7: Commit**

Run:

```bash
git add packages/ui/src/requests/RequestSignalMap.tsx packages/ui/src/requests/RequestWorkspace.tsx packages/ui/test/request-signal-map.test.tsx packages/ui/test/request-board.test.tsx
git commit -m "feat: add prr signal map view"
```

## Task 6: Add The Guided Request Builder Shell

**Files:**
- Create: `packages/ui/src/requests/RequestBuilder.tsx`
- Modify: `packages/ui/src/requests/RequestWorkspace.tsx`
- Modify: `packages/ui/src/App.tsx`
- Create: `packages/ui/test/request-builder.test.tsx`
- Modify: `packages/ui/test/request-board.test.tsx`

- [ ] **Step 1: Write failing builder tests**

Create `packages/ui/test/request-builder.test.tsx`:

```tsx
/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.js";
import { RequestBuilder } from "../src/requests/RequestBuilder.js";
import { prrWorkspaceFixture } from "../src/requests/request-fixtures.js";

describe("RequestBuilder", () => {
  it("renders all six command checklist steps", () => {
    render(<RequestBuilder builder={prrWorkspaceFixture.builder} onClose={() => undefined} />);

    for (const step of [
      "Jurisdiction pack",
      "Agency/contact",
      "Request scope",
      "Delivery channel",
      "Deadline estimate",
      "Review/send gate"
    ]) {
      expect(screen.getByRole("button", { name: `Open ${step}` })).toBeInTheDocument();
    }
  });

  it("shows editable AI-recommended fills with visible provenance", () => {
    render(<RequestBuilder builder={prrWorkspaceFixture.builder} onClose={() => undefined} />);

    expect(screen.getByDisplayValue("Florida Public Records")).toBeInTheDocument();
    expect(screen.getByText("Based on your current saved view.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Pack suggestion"), { target: { value: "US Federal FOIA" } });

    expect(screen.getByDisplayValue("US Federal FOIA")).toBeInTheDocument();
  });

  it("opens from the Requests workspace New request action", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("link", { name: "Requests" }));
    fireEvent.click(screen.getByRole("button", { name: "New request" }));

    expect(screen.getByRole("dialog", { name: "Guided request builder" })).toBeInTheDocument();
    expect(screen.getByText("Review/send gate")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run builder tests to verify failure**

Run:

```bash
npm test -- packages/ui/test/request-builder.test.tsx
```

Expected:

```text
FAIL packages/ui/test/request-builder.test.tsx
Failed to resolve import "../src/requests/RequestBuilder.js"
```

- [ ] **Step 3: Add RequestBuilder**

Create `packages/ui/src/requests/RequestBuilder.tsx`:

```tsx
import { useState } from "react";
import type { PrrBuilderModel, PrrBuilderStep, PrrSuggestedFill } from "./request-types.js";

interface RequestBuilderProps {
  readonly builder: PrrBuilderModel;
  readonly onClose: () => void;
}

export function RequestBuilder({ builder, onClose }: RequestBuilderProps) {
  const [activeStepId, setActiveStepId] = useState(builder.steps[0]?.id);
  const activeStep = builder.steps.find((step) => step.id === activeStepId) ?? builder.steps[0];

  return (
    <div role="dialog" aria-modal="true" aria-label="Guided request builder" className="fixed inset-0 z-50 overflow-y-auto bg-[var(--command-black)]/95 p-4">
      <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <section className="border border-[var(--console-line)] bg-[var(--console-void)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-base text-[var(--signal-green)] sm:text-sm">Command checklist</p>
              <h2 className="mt-2 text-lg font-semibold text-balance text-[var(--paper-light)]">New request</h2>
            </div>
            <button type="button" onClick={onClose} className="min-h-10 border border-[var(--console-line)] px-3 py-2 text-base text-[var(--signal-cyan)] sm:min-h-9 sm:text-sm">
              Close
            </button>
          </div>
          <ol className="mt-5 space-y-2">
            {builder.steps.map((step, index) => (
              <li key={step.id}>
                <button
                  type="button"
                  aria-label={`Open ${step.label}`}
                  onClick={() => setActiveStepId(step.id)}
                  className={[
                    "w-full border px-3 py-2 text-left font-mono text-base sm:text-sm",
                    step.id === activeStep?.id
                      ? "border-[var(--signal-green)] bg-[var(--signal-green)]/12 text-[var(--paper-light)]"
                      : "border-[var(--console-line)] text-[var(--muted-amber)]"
                  ].join(" ")}
                >
                  {index + 1}. {step.label}
                </button>
              </li>
            ))}
          </ol>
        </section>
        <section className="border border-[var(--console-line)] bg-[var(--console-void)] p-4">
          {activeStep === undefined ? null : <BuilderStepDetail step={activeStep} />}
        </section>
      </div>
    </div>
  );
}

function BuilderStepDetail({ step }: { readonly step: PrrBuilderStep }) {
  return (
    <div>
      <p className="font-mono text-base text-[var(--signal-amber)] sm:text-sm">{step.state.replace("-", " ")}</p>
      <h3 className="mt-2 text-lg font-semibold text-balance text-[var(--paper-light)]">{step.label}</h3>
      {step.suggestedFills.length === 0 ? (
        <p className="mt-4 text-base text-pretty text-[var(--muted-amber)] sm:text-sm">
          No learned fill is suggested for this step yet. The user can complete it manually.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {step.suggestedFills.map((fill) => (
            <SuggestedFillEditor key={fill.id} fill={fill} />
          ))}
        </div>
      )}
    </div>
  );
}

function SuggestedFillEditor({ fill }: { readonly fill: PrrSuggestedFill }) {
  const [value, setValue] = useState(fill.value);
  return (
    <label className="block border border-[var(--console-line)] bg-[var(--command-black)]/70 p-3">
      <span className="block font-mono text-base text-[var(--paper-light)] sm:text-sm">{fill.fieldLabel}</span>
      <input
        name={fill.id}
        aria-label={`${fill.fieldLabel} suggestion`}
        value={value}
        onChange={(event) => setValue(event.currentTarget.value)}
        className="mt-2 min-h-11 w-full border border-[var(--console-line)] bg-[var(--console-void)] px-3 py-2 text-base text-[var(--paper-light)] focus-visible:-outline-offset-1 focus-visible:outline-2 focus-visible:outline-[var(--signal-cyan)] sm:min-h-9 sm:text-sm"
      />
      <span className="mt-2 block text-base text-pretty text-[var(--muted-amber)] sm:text-sm">{fill.provenance}</span>
    </label>
  );
}
```

- [ ] **Step 4: Wire builder open action**

Modify `packages/ui/src/App.tsx`:

```ts
import { RequestBuilder } from "./requests/RequestBuilder.js";
```

Add:

```ts
const [requestBuilderOpen, setRequestBuilderOpen] = useState(false);
```

Set both the shell primary action and RequestWorkspace builder action to open the builder when Requests is active:

```tsx
onNewRequest={() => {
  if (requestsActive) {
    setRequestBuilderOpen(true);
  }
}}
```

Wrap the existing `OpsShell` return value in a fragment and render the builder after it:

```tsx
return (
  <>
    <OpsShell
      modules={workspaceModules}
      activeModuleId={activeModuleId}
      workspaceName="Cestus Local"
      modeLabel={requestsActive ? "Requests" : "Command"}
      ledgerLabel="Ledger synced"
      syncLabel={requestsActive ? "PRR sync local" : "Local sync live"}
      deploymentLabel="Solo laptop"
      searchLabel={requestsActive ? "Requests search" : "Command search"}
      searchPlaceholder={
        requestsActive
          ? "Search requests, agencies, evidence, and correspondence"
          : "Search requests, evidence, agencies, and assertions"
      }
      mainId={requestsActive ? "requests" : "command"}
      mainLabel={requestsActive ? "Requests workspace" : "Command workspace"}
      onNewRequest={() => {
        if (requestsActive) {
          setRequestBuilderOpen(true);
        }
      }}
      onModuleSelect={setActiveModuleId}
      main={requestsActive ? requestsMain : commandMain}
      decisionRail={requestsActive ? <RequestDetailRail selectedRequest={selectedPrrRequest} /> : commandDecisionRail}
    />
    {requestsActive && requestBuilderOpen ? (
      <RequestBuilder builder={prrWorkspaceFixture.builder} onClose={() => setRequestBuilderOpen(false)} />
    ) : null}
  </>
);
```

Pass:

```tsx
onOpenBuilder={() => setRequestBuilderOpen(true)}
```

to `RequestWorkspace`.

- [ ] **Step 5: Run targeted builder tests**

Run:

```bash
npm test -- packages/ui/test/request-builder.test.tsx packages/ui/test/request-shell.test.tsx packages/ui/test/app-smoke.test.tsx
```

Expected:

```text
Test Files  3 passed
```

- [ ] **Step 6: Run full verification**

Run:

```bash
npm run verify
```

Expected:

```text
typecheck passed
tests passed
factory-readiness passed
```

- [ ] **Step 7: Commit**

Run:

```bash
git add packages/ui/src/App.tsx packages/ui/src/requests/RequestWorkspace.tsx packages/ui/src/requests/RequestBuilder.tsx packages/ui/test/request-builder.test.tsx packages/ui/test/request-board.test.tsx
git commit -m "feat: add prr guided request builder"
```

## Task 7: Harden PRR UI Contracts And Expose Tailnet Preview

**Files:**
- Modify: `packages/ui/test/visual-contract.test.ts`
- Modify: `packages/ui/test/ui-picker.test.tsx`
- Modify: `packages/ui/test/app-smoke.test.tsx`
- No source file changes unless a verifier exposes a small missing accessible label or contract mismatch.

- [ ] **Step 1: Write failing final UI contract tests**

Update `packages/ui/test/visual-contract.test.ts` so `uiTsxFiles` includes all final request components:

```ts
const uiTsxFiles = [
  "packages/ui/src/App.tsx",
  "packages/ui/src/workspace/OpsShell.tsx",
  "packages/ui/src/workspace/CommandBand.tsx",
  "packages/ui/src/workspace/ModuleRail.tsx",
  "packages/ui/src/workspace/CommandDashboard.tsx",
  "packages/ui/src/workspace/SignalStrip.tsx",
  "packages/ui/src/workspace/QueueFilters.tsx",
  "packages/ui/src/workspace/PriorityQueue.tsx",
  "packages/ui/src/workspace/TacticalPanel.tsx",
  "packages/ui/src/workspace/DecisionRail.tsx",
  "packages/ui/src/requests/RequestWorkspace.tsx",
  "packages/ui/src/requests/RequestCommandBar.tsx",
  "packages/ui/src/requests/RequestBoard.tsx",
  "packages/ui/src/requests/RequestLane.tsx",
  "packages/ui/src/requests/RequestCard.tsx",
  "packages/ui/src/requests/RequestDetailRail.tsx",
  "packages/ui/src/requests/RequestSignalMap.tsx",
  "packages/ui/src/requests/RequestBuilder.tsx"
];
```

Add assertions to the second visual contract test:

```ts
expect(joined).toContain("Signal operations board");
expect(joined).toContain("Legal escalation locked");
expect(joined).toContain("Guided request builder");
expect(joined).toContain("var(--signal-green)");
```

Update `packages/ui/test/ui-picker.test.tsx` source files:

```ts
const sourceFiles = [
  "index.html",
  "packages/ui/src/workspace/CommandDashboard.tsx",
  "packages/ui/src/workspace/SignalStrip.tsx",
  "packages/ui/src/workspace/PriorityQueue.tsx",
  "packages/ui/src/workspace/DecisionRail.tsx",
  "packages/ui/src/requests/RequestWorkspace.tsx",
  "packages/ui/src/requests/RequestBoard.tsx",
  "packages/ui/src/requests/RequestDetailRail.tsx",
  "packages/ui/src/requests/RequestSignalMap.tsx",
  "packages/ui/src/requests/RequestBuilder.tsx"
];
```

Update `packages/ui/test/app-smoke.test.tsx` to assert the final PRR path:

```tsx
fireEvent.click(screen.getByRole("link", { name: "Requests" }));
expect(screen.getByRole("region", { name: "Signal operations board" })).toBeInTheDocument();
fireEvent.click(screen.getByRole("button", { name: "Signal map" }));
expect(screen.getByRole("region", { name: "PRR signal map" })).toBeInTheDocument();
fireEvent.click(screen.getByRole("button", { name: "New request" }));
expect(screen.getByRole("dialog", { name: "Guided request builder" })).toBeInTheDocument();
```

- [ ] **Step 2: Run final UI contract tests to verify failure**

Run:

```bash
npm test -- packages/ui/test/visual-contract.test.ts packages/ui/test/ui-picker.test.tsx packages/ui/test/app-smoke.test.tsx
```

Expected before source fixes:

```text
FAIL packages/ui/test/visual-contract.test.ts
```

If the tests already pass because prior tasks satisfied the contract, record that in the worker report and continue.

- [ ] **Step 3: Make only verifier-required source fixes**

If the tests fail because a required label or text is missing, make the smallest source edit in the relevant request component. Do not change layout direction. Do not add picker scaffolding.

- [ ] **Step 4: Run focused PRR UI tests**

Run:

```bash
npm test -- packages/ui/test/request-model.test.ts packages/ui/test/request-shell.test.tsx packages/ui/test/request-board.test.tsx packages/ui/test/request-detail-rail.test.tsx packages/ui/test/request-signal-map.test.tsx packages/ui/test/request-builder.test.tsx packages/ui/test/visual-contract.test.ts packages/ui/test/ui-picker.test.tsx packages/ui/test/app-smoke.test.tsx
```

Expected:

```text
Test Files  9 passed
```

- [ ] **Step 5: Run full verification**

Run:

```bash
npm run verify
```

Expected:

```text
typecheck passed
tests passed
factory-readiness passed
```

- [ ] **Step 6: Commit final UI contract updates**

Run:

```bash
git add packages/ui/test/visual-contract.test.ts packages/ui/test/ui-picker.test.tsx packages/ui/test/app-smoke.test.tsx packages/ui/src/requests/RequestWorkspace.tsx packages/ui/src/requests/RequestBoard.tsx packages/ui/src/requests/RequestDetailRail.tsx packages/ui/src/requests/RequestSignalMap.tsx packages/ui/src/requests/RequestBuilder.tsx
git commit -m "test: harden prr workspace ui contracts"
```

- [ ] **Step 7: Start the Vite dev server on the tailnet**

Run:

```bash
__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=omarchy-mbp.tail7e7910.ts.net npm run dev -- --host 0.0.0.0 --port 5174
```

Expected output includes:

```text
Local:   http://localhost:5174/
Network: http://100.126.143.105:5174/
```

If port `5174` is in use, use the next available port and record it in the handoff.

- [ ] **Step 8: Verify tailnet reachability**

Run:

```bash
curl -sS -I --max-time 10 http://100.126.143.105:5174/ | sed -n '1,8p'
curl -sS -I --max-time 10 http://omarchy-mbp.tail7e7910.ts.net:5174/ | sed -n '1,8p'
```

Expected for both:

```text
HTTP/1.1 200 OK
Content-Type: text/html
```

- [ ] **Step 9: Ask for user visual review**

Report both URLs:

```text
http://omarchy-mbp.tail7e7910.ts.net:5174/
http://100.126.143.105:5174/
```

Stop here for human visual review. Do not merge or mark the PRR UI slice complete until the user reviews the tailnet preview.

## User Review Gate

Stop after Task 7. If the user requests visual changes, create a focused follow-up task with exact files, failing tests or visual contract assertions, targeted verification, full verification, and a separate commit.

## Final Readiness Checklist

Before asking for user review, confirm:

- `npm run verify` passes.
- The app has no `ui.sh` picker artifacts.
- Requests module opens from the module rail.
- Default PRR view is the agency-grouped board.
- Seven action lanes render in the approved order.
- Signal map view renders and has an accessible list/detail fallback.
- Selected request detail rail starts with the next action packet.
- Send gate remains locked until all review checks pass.
- Legal escalation gate explains missing prerequisites.
- Guided request builder renders all six steps and editable AI fills with provenance.
- Tailnet preview responds on direct IP and MagicDNS.
