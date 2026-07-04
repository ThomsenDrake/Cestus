# Requests Detail Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Requests selected-request detail from the shell right rail into a full-screen investigation modal, and repurpose the Requests right rail as workspace intelligence.

**Architecture:** Keep PRR ledger, projection, runtime, and DTO contracts unchanged. Reuse the existing ledger-derived `PrrDetailModel` detail content in a new modal, add a DTO-derived workspace-intelligence rail, and wire Requests card selection so clicking a card selects it and opens the modal immediately. Command keeps its existing right rail.

**Tech Stack:** TypeScript, React, Vite, Vitest, Testing Library, existing Requests DTO/view-model components, existing `OpsShell` layout.

---

## Required Reading

Every worker must read these files before editing:

- `AGENTS.md`
- `docs/agentic/software-factory.md`
- `docs/superpowers/specs/2026-07-04-requests-detail-modal-design.md`
- `docs/superpowers/specs/2026-07-03-ledger-backed-prr-workspace-design.md`
- `docs/superpowers/plans/2026-07-03-ledger-backed-prr-workspace-implementation.md`
- This implementation plan

Workers must also read every source and test file listed in their task before editing.

## Factory Rules

- Start each task by creating a durable claim file in `docs/agentic/claims/`, commit the claim, then set status to `in-progress` and commit that state separately.
- Write or update failing tests before production code.
- Run the exact targeted red command in the task and record the expected failure in the claim.
- Change only files listed in the task unless a verifier exposes a narrow supporting edit. Record supporting edits in the claim before committing.
- Run the targeted green command, then `npm run verify`, before setting the claim to `ready-for-review`.
- Commit after each completed task.
- Do not edit PRR backend packages in this plan.
- Do not import `request-fixtures.ts`, PRR runtime code, SQLite code, Node built-ins, or Node-only modules into product UI.
- Stop and escalate on data-loss risk, schema conflict, browser import of Node-only code, autonomous send or escalation behavior, or repeated verifier failure after two focused repair attempts.

## File Map

- `packages/ui/src/requests/RequestDetailSections.tsx`: new shared display-only request detail sections extracted from the current rail.
- `packages/ui/src/requests/RequestDetailModal.tsx`: new full-screen investigation modal with focus management and close behavior.
- `packages/ui/src/requests/RequestDetailRail.tsx`: temporary compatibility wrapper around shared detail sections until App stops using it for Requests.
- `packages/ui/src/requests/RequestWorkspaceIntelligenceRail.tsx`: new Requests right-rail surface for workspace health and next-work signals.
- `packages/ui/src/requests/request-types.ts`: UI-only intelligence rail model types if needed.
- `packages/ui/src/requests/request-model.ts`: workspace intelligence summary builder and existing view-model helpers.
- `packages/ui/src/requests/RequestWorkspace.tsx`: card-click behavior opens the detail modal through a callback.
- `packages/ui/src/requests/RequestBoard.tsx`: pass request-open callback through board lanes.
- `packages/ui/src/requests/RequestLane.tsx`: pass request-open callback to cards.
- `packages/ui/src/requests/RequestCard.tsx`: keep button behavior and selected state; no fixture data.
- `packages/ui/src/App.tsx`: owns modal-open state and passes Workspace Intelligence rail for Requests.
- `packages/ui/test/request-detail-modal.test.tsx`: new modal rendering, close, Escape, focus trap, and focus restore tests.
- `packages/ui/test/request-detail-rail.test.tsx`: keep compatibility coverage while shared sections are extracted.
- `packages/ui/test/request-intelligence-rail.test.tsx`: new intelligence rail model/component coverage.
- `packages/ui/test/request-model.test.ts`: workspace intelligence model tests.
- `packages/ui/test/request-board.test.tsx`: Requests card-click-to-modal and no detail-rail assertions.
- `packages/ui/test/app-smoke.test.tsx`: end-to-end Requests route, saved view, signal map, modal, builder, and Command rail smoke coverage.
- `packages/ui/test/request-builder.test.tsx`: guard builder modal behavior after detail-modal wiring.
- `packages/ui/test/request-data-boundary.test.ts`: broaden or preserve UI boundary checks for new files.
- `packages/ui/test/visual-contract.test.ts`: full-screen modal dimensions and no nested page-scale cards.
- `packages/ui/test/ui-picker.test.tsx`: keep Requests first-class in shell after right-rail repurpose.
- `scripts/check-agent-readiness.mjs`: require the new detail-modal spec and plan in final readiness.
- `docs/agentic/software-factory.md`: record final plan readiness evidence.

## Task 1: Extract Request Detail Sections And Add Full-Screen Modal

**Outcome:** Request detail content renders through shared display-only sections and a new full-screen modal component, without changing App routing or board behavior yet.

**Files:**

- Create: `docs/agentic/claims/task-1-request-detail-modal.md`
- Create: `packages/ui/src/requests/RequestDetailSections.tsx`
- Create: `packages/ui/src/requests/RequestDetailModal.tsx`
- Create: `packages/ui/test/request-detail-modal.test.tsx`
- Modify: `packages/ui/src/requests/RequestDetailRail.tsx`
- Modify: `packages/ui/test/request-detail-rail.test.tsx`

- [ ] **Step 1: Claim the task**

Create `docs/agentic/claims/task-1-request-detail-modal.md` with:

```markdown
# Task 1: Request Detail Modal

Plan path: `docs/superpowers/plans/2026-07-04-requests-detail-modal-implementation.md`
Task heading: `Task 1: Extract Request Detail Sections And Add Full-Screen Modal`
Worker identity: Codex
Branch: `codex/prr-ledger-backed-workspace-design`
Worktree path: `/home/drake/.codex/worktrees/3ea1/Cestus`
Claimed at: run `date -u +"%Y-%m-%dT%H:%M:%SZ"` and paste the emitted timestamp
Status: `claimed`

## Owned Files

- `packages/ui/src/requests/RequestDetailSections.tsx`
- `packages/ui/src/requests/RequestDetailModal.tsx`
- `packages/ui/src/requests/RequestDetailRail.tsx`
- `packages/ui/test/request-detail-modal.test.tsx`
- `packages/ui/test/request-detail-rail.test.tsx`

## Evidence

- Red command: pending
- Green command: pending
- Full verification: pending

## Review

- Review status: pending
- Concerns: none recorded
```

Run:

```bash
git add docs/agentic/claims/task-1-request-detail-modal.md
git commit -m "chore: claim task 1 request detail modal"
```

Expected: commit succeeds.

- [ ] **Step 2: Mark the claim in progress**

Change the claim status to `in-progress`, then run:

```bash
git add docs/agentic/claims/task-1-request-detail-modal.md
git commit -m "chore: start task 1 request detail modal"
```

Expected: commit succeeds.

- [ ] **Step 3: Write failing modal tests**

Create `packages/ui/test/request-detail-modal.test.tsx`:

```tsx
/** @vitest-environment jsdom */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { buildPrrProjection } from "../../prr/src/projection.js";
import { buildPrrWorkspaceDto } from "../../prr/src/read-api.js";
import { prrWorkspaceSeedEvents } from "../../prr/src/workspace-seed.js";
import { RequestDetailModal } from "../src/requests/RequestDetailModal.js";
import { getSelectedPrrRequest } from "../src/requests/request-model.js";

describe("RequestDetailModal", () => {
  function selectedRequest(prrRequestId = "prr_fee_building_permits") {
    const workspace = buildPrrWorkspaceDto(buildPrrProjection(prrWorkspaceSeedEvents), {
      now: "2026-07-20T12:00:00.000Z"
    });
    const detail = getSelectedPrrRequest(workspace, prrRequestId);
    expect(detail).toBeDefined();
    return detail!;
  }

  it("renders selected request details in a full-screen investigation dialog", () => {
    render(<RequestDetailModal selectedRequest={selectedRequest()} onClose={() => undefined} />);

    const dialog = screen.getByRole("dialog", { name: /Request investigation detail/i });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByText("Building Services Department")).toBeInTheDocument();
    expect(within(dialog).getByText("Review fee or scope")).toBeInTheDocument();
    expect(within(dialog).getByText("Legal escalation locked")).toBeInTheDocument();
  });

  it("closes from the close button and Escape key", () => {
    const onClose = vi.fn();
    render(<RequestDetailModal selectedRequest={selectedRequest()} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Close request detail" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(screen.getByRole("dialog", { name: /Request investigation detail/i }), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("traps Tab focus inside the modal", () => {
    render(<RequestDetailModal selectedRequest={selectedRequest()} onClose={() => undefined} />);

    const dialog = screen.getByRole("dialog", { name: /Request investigation detail/i });
    const closeButton = screen.getByRole("button", { name: "Close request detail" });
    const reviewButton = screen.getByRole("button", { name: "Review to send" });

    reviewButton.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(closeButton).toHaveFocus();

    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(reviewButton).toHaveFocus();
  });

  it("restores focus to the opener when closed", async () => {
    function Harness() {
      const [open, setOpen] = useState(false);

      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Open detail</button>
          {open ? <RequestDetailModal selectedRequest={selectedRequest()} onClose={() => setOpen(false)} /> : null}
        </>
      );
    }

    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open detail" });
    opener.focus();
    fireEvent.click(opener);

    fireEvent.click(await screen.findByRole("button", { name: "Close request detail" }));

    expect(opener).toHaveFocus();
  });
});
```

- [ ] **Step 4: Run the targeted red command**

Run:

```bash
npm test -- packages/ui/test/request-detail-modal.test.tsx packages/ui/test/request-detail-rail.test.tsx
```

Expected: fails because `../src/requests/RequestDetailModal.js` does not exist.

- [ ] **Step 5: Extract shared detail sections**

Create `packages/ui/src/requests/RequestDetailSections.tsx` by moving display-only content from `RequestDetailRail.tsx` into exported components:

```tsx
import type { ReactNode } from "react";
import { sendGateArmed, unresolvedEscalationPrerequisites } from "./request-model.js";
import type { PrrDetailModel, PrrGateCheck, PrrSignalTone } from "./request-types.js";

export interface RequestDetailSectionsProps {
  readonly selectedRequest: PrrDetailModel;
}

const toneClasses: Record<PrrSignalTone, string> = {
  amber: "border-[var(--signal-amber)] text-[var(--signal-amber)]",
  red: "border-[var(--signal-red)] text-[var(--signal-red)]",
  green: "border-[var(--signal-green)] text-[var(--signal-green)]",
  cyan: "border-[var(--signal-cyan)] text-[var(--signal-cyan)]",
  neutral: "border-[var(--console-line)] text-[var(--muted-amber)]"
};

const providerLabels: Record<PrrDetailModel["correspondence"]["provider"], string> = {
  none: "No provider event",
  gmail: "Gmail",
  "imap-smtp": "IMAP/SMTP",
  himalaya: "Himalaya"
};

export function RequestDetailSections({ selectedRequest }: RequestDetailSectionsProps) {
  const sendArmed = sendGateArmed(selectedRequest.sendGate);
  const primaryButtonLabel = sendArmed ? "Send now" : "Review to send";
  const showActionLabel = selectedRequest.nextAction.label !== primaryButtonLabel;
  const missingEscalationPrerequisites = unresolvedEscalationPrerequisites(selectedRequest.escalationGate);

  return (
    <>
      <section className="border border-[var(--console-line)] bg-[var(--console-panel)]/56 p-3">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-balance text-[var(--paper-light)] sm:text-sm">
              Next action packet
            </h3>
            {showActionLabel ? (
              <p className="mt-1 text-base font-medium text-pretty text-[var(--signal-amber)] sm:text-sm">
                {selectedRequest.nextAction.label}
              </p>
            ) : null}
          </div>
          <div className={`shrink-0 border px-2 py-1 font-mono text-base sm:text-sm ${toneClasses[selectedRequest.nextAction.risk]}`}>
            {selectedRequest.nextAction.risk}
          </div>
        </div>
        <p className="mt-3 text-base text-pretty text-[var(--paper-light)] sm:text-sm">
          {selectedRequest.nextAction.summary}
        </p>
        <p className="mt-3 border-l border-[var(--console-line)] pl-3 text-base text-pretty text-[var(--muted-amber)] sm:text-sm">
          {selectedRequest.nextAction.requiredHumanDecision}
        </p>
        <ul role="list" className="mt-3 space-y-2">
          {selectedRequest.nextAction.explanation.map((explanation) => (
            <li key={explanation} className="border-l border-[var(--console-line)] pl-3 text-base text-pretty text-[var(--muted-amber)] sm:text-sm">
              {explanation}
            </li>
          ))}
        </ul>
        <button
          type="button"
          disabled={!sendArmed}
          className={[
            "relative mt-4 min-h-10 w-full border px-3 py-2 text-base font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--signal-cyan)] sm:min-h-9 sm:text-sm",
            sendArmed
              ? "border-[var(--signal-green)] bg-[var(--signal-green)] text-[var(--console-ink)]"
              : "border-[var(--console-line)] text-[var(--muted-amber)] opacity-70"
          ].join(" ")}
        >
          <span aria-hidden="true" className="pointer-fine:hidden absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2" />
          {primaryButtonLabel}
        </button>
      </section>

      <GateSection title="Send review gate" checks={selectedRequest.sendGate} />

      <section className="mt-5 border-t border-[var(--console-line)] pt-5">
        <h3 className="text-base font-semibold text-balance text-[var(--paper-light)] sm:text-sm">
          Legal escalation locked
        </h3>
        {missingEscalationPrerequisites.length > 0 ? (
          <ul role="list" className="mt-2 space-y-2">
            {missingEscalationPrerequisites.map((prerequisite) => (
              <li key={prerequisite} className="font-mono text-base text-[var(--signal-red)] sm:text-sm">
                Missing: {prerequisite}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-base text-pretty text-[var(--signal-green)] sm:text-sm">
            All escalation prerequisites are satisfied.
          </p>
        )}
        <GateChecklist checks={selectedRequest.escalationGate} />
      </section>

      <RailSection title="Deadline posture">
        <p className="text-base text-pretty text-[var(--muted-amber)] sm:text-sm">{selectedRequest.deadlinePosture}</p>
      </RailSection>

      <RailSection title="Correspondence">
        <dl className="space-y-3">
          <RailFact label="Provider" value={providerLabels[selectedRequest.correspondence.provider]} />
          <RailFact label="Sync state" value={selectedRequest.correspondence.syncState} />
          <RailFact label="Latest inbound" value={selectedRequest.correspondence.latestInbound} />
          <RailFact label="Latest outbound" value={selectedRequest.correspondence.latestOutbound} />
        </dl>
      </RailSection>

      <RailSection title="Evidence intake">
        {selectedRequest.evidencePackets.length === 0 ? (
          <p className="text-base text-pretty text-[var(--muted-amber)] sm:text-sm">No evidence packets linked.</p>
        ) : (
          <ul role="list" className="space-y-3">
            {selectedRequest.evidencePackets.map((packet) => (
              <li key={packet.evidenceId} className="border border-[var(--console-line)] bg-[var(--console-void)]/62 p-3">
                <h4 className="text-base font-semibold text-balance text-[var(--paper-light)] sm:text-sm">{packet.title}</h4>
                <dl className="mt-3 space-y-2">
                  <RailFact label="Source" value={packet.sourceArtifact} />
                  <RailFact label="Files" value={String(packet.fileCount)} />
                  <RailFact label="Hash" value={packet.hashState} />
                  <RailFact label="Extraction" value={packet.extractionState} />
                  <RailFact label="Classification" value={packet.classificationState} />
                </dl>
              </li>
            ))}
          </ul>
        )}
      </RailSection>

      <RailList title="Diagnostics" emptyLabel="No diagnostics open." items={selectedRequest.diagnostics} />
      <RailList title="Timeline" emptyLabel="No timeline events recorded." items={selectedRequest.timeline} mono />
    </>
  );
}

function GateSection({ title, checks }: { readonly title: string; readonly checks: readonly PrrGateCheck[] }) {
  return (
    <section className="mt-5 border-t border-[var(--console-line)] pt-5">
      <h3 className="text-base font-semibold text-balance text-[var(--paper-light)] sm:text-sm">{title}</h3>
      <GateChecklist checks={checks} />
    </section>
  );
}

function GateChecklist({ checks }: { readonly checks: readonly PrrGateCheck[] }) {
  return (
    <ul role="list" className="mt-3 space-y-3">
      {checks.map((check) => (
        <li key={check.id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
          <div
            aria-hidden="true"
            className={[
              "mt-1 size-2 shrink-0 border",
              check.complete ? "border-[var(--signal-green)] bg-[var(--signal-green)]" : "border-[var(--signal-red)]"
            ].join(" ")}
          />
          <div className="min-w-0">
            <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-base font-medium text-[var(--paper-light)] sm:text-sm">{check.label}</div>
              <div
                className={[
                  "w-fit shrink-0 border px-2 py-1 font-mono text-base sm:text-sm",
                  check.complete
                    ? "border-[var(--signal-green)] text-[var(--signal-green)]"
                    : "border-[var(--signal-red)] text-[var(--signal-red)]"
                ].join(" ")}
              >
                {check.complete ? "Complete" : "Needs review"}
              </div>
            </div>
            <div className="mt-1 text-base text-pretty text-[var(--muted-amber)] sm:text-sm">{check.detail}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function RailSection({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="mt-5 border-t border-[var(--console-line)] pt-5">
      <h3 className="mb-3 text-base font-semibold text-balance text-[var(--paper-light)] sm:text-sm">{title}</h3>
      {children}
    </section>
  );
}

function RailFact({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <dt className="text-base font-medium text-[var(--paper-light)] sm:text-sm">{label}</dt>
      <dd className="mt-1 text-base text-pretty text-[var(--muted-amber)] sm:text-sm">{value}</dd>
    </div>
  );
}

function RailList({
  title,
  emptyLabel,
  items,
  mono = false
}: {
  readonly title: string;
  readonly emptyLabel: string;
  readonly items: readonly string[];
  readonly mono?: boolean;
}) {
  return (
    <RailSection title={title}>
      {items.length === 0 ? (
        <p className="text-base text-pretty text-[var(--muted-amber)] sm:text-sm">{emptyLabel}</p>
      ) : (
        <ul role="list" className="space-y-2">
          {items.map((item) => (
            <li
              key={item}
              className={[
                "border-l border-[var(--console-line)] pl-3 text-base text-pretty text-[var(--muted-amber)] sm:text-sm",
                mono ? "font-mono" : ""
              ].join(" ")}
            >
              {item}
            </li>
          ))}
        </ul>
      )}
    </RailSection>
  );
}
```

- [ ] **Step 6: Update `RequestDetailRail` to use shared sections**

Replace the long internal detail rendering in `packages/ui/src/requests/RequestDetailRail.tsx` with:

```tsx
import type { PrrDetailModel } from "./request-types.js";
import { RequestDetailSections } from "./RequestDetailSections.js";

interface RequestDetailRailProps {
  readonly selectedRequest: PrrDetailModel | undefined;
}

export function RequestDetailRail({ selectedRequest }: RequestDetailRailProps) {
  return (
    <aside aria-label="Request detail rail" className="h-full p-4 lg:p-5">
      {selectedRequest === undefined ? (
        <p className="text-base text-pretty text-[var(--muted-amber)] sm:text-sm">
          Select a request to inspect its next action.
        </p>
      ) : (
        <div>
          <p className="font-mono text-base text-[var(--signal-amber)] sm:text-sm">
            {selectedRequest.prrRequestId} / {selectedRequest.agencyName}
          </p>
          <h2 className="mt-2 text-lg font-semibold text-balance text-[var(--paper-light)]">{selectedRequest.title}</h2>
          <div className="mt-5">
            <RequestDetailSections selectedRequest={selectedRequest} />
          </div>
        </div>
      )}
    </aside>
  );
}
```

- [ ] **Step 7: Implement `RequestDetailModal`**

Create `packages/ui/src/requests/RequestDetailModal.tsx`:

```tsx
import { useEffect, useRef, type KeyboardEvent } from "react";
import type { PrrDetailModel } from "./request-types.js";
import { RequestDetailSections } from "./RequestDetailSections.js";

interface RequestDetailModalProps {
  readonly selectedRequest: PrrDetailModel | undefined;
  readonly onClose: () => void;
}

export function RequestDetailModal({ selectedRequest, onClose }: RequestDetailModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const title = selectedRequest?.title ?? "Request detail unavailable";

  useEffect(() => {
    previousActiveElementRef.current =
      document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    const focusTarget = closeButtonRef.current ?? getFocusableDialogControls(dialogRef.current)[0];
    focusTarget?.focus();

    return () => {
      const previousActiveElement = previousActiveElementRef.current;
      if (previousActiveElement?.isConnected) {
        previousActiveElement.focus();
      }
    };
  }, []);

  function handleClose() {
    onClose();
    const previousActiveElement = previousActiveElementRef.current;
    if (previousActiveElement?.isConnected) {
      previousActiveElement.focus();
    }
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      handleClose();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusableControls = getFocusableDialogControls(dialogRef.current);
    const firstControl = focusableControls[0];
    const lastControl = focusableControls.at(-1);

    if (firstControl === undefined || lastControl === undefined) {
      event.preventDefault();
      return;
    }

    if (event.shiftKey && (document.activeElement === firstControl || !dialogRef.current?.contains(document.activeElement))) {
      event.preventDefault();
      lastControl.focus();
      return;
    }

    if (!event.shiftKey && document.activeElement === lastControl) {
      event.preventDefault();
      firstControl.focus();
    }
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Request investigation detail: ${title}`}
      onKeyDown={handleDialogKeyDown}
      className="fixed inset-0 z-50 overflow-y-auto bg-[var(--command-black)]/92 p-4"
    >
      <div className="mx-auto min-h-[calc(100dvh-2rem)] max-w-7xl border border-[var(--console-line)] bg-[var(--console-void)]/96 p-4 lg:p-5">
        <header className="flex min-w-0 flex-col gap-3 border-b border-[var(--console-line)] pb-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <p className="font-mono text-base text-[var(--signal-amber)] sm:text-sm">
              {selectedRequest === undefined ? "No request selected" : `${selectedRequest.prrRequestId} / ${selectedRequest.agencyName}`}
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-balance text-[var(--paper-light)]">{title}</h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={handleClose}
            className="relative min-h-10 w-fit shrink-0 border border-[var(--console-line)] px-3 py-2 text-base text-[var(--paper-light)] hover:border-[var(--signal-amber)] hover:text-[var(--signal-amber)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--signal-cyan)] sm:text-sm"
          >
            <span aria-hidden="true" className="pointer-fine:hidden absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2" />
            Close request detail
          </button>
        </header>
        <div className="mt-5">
          {selectedRequest === undefined ? (
            <p className="text-base text-pretty text-[var(--muted-amber)] sm:text-sm">
              The selected request detail is unavailable. Close this modal and select another request.
            </p>
          ) : (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <RequestDetailSections selectedRequest={selectedRequest} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function getFocusableDialogControls(dialog: HTMLElement | null): HTMLElement[] {
  if (dialog === null) {
    return [];
  }

  return Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  );
}
```

- [ ] **Step 8: Run the targeted green command**

Run:

```bash
npm test -- packages/ui/test/request-detail-modal.test.tsx packages/ui/test/request-detail-rail.test.tsx
```

Expected: 2 test files pass.

- [ ] **Step 9: Run full verification and commit**

Run:

```bash
npm run verify
```

Expected: typecheck, all tests, UI build, and factory readiness pass.

Update the claim with command evidence and status `ready-for-review`, then run:

```bash
git add docs/agentic/claims/task-1-request-detail-modal.md packages/ui/src/requests/RequestDetailSections.tsx packages/ui/src/requests/RequestDetailModal.tsx packages/ui/src/requests/RequestDetailRail.tsx packages/ui/test/request-detail-modal.test.tsx packages/ui/test/request-detail-rail.test.tsx
git commit -m "feat: add requests detail modal"
```

Expected: commit succeeds.

## Task 2: Add Requests Workspace Intelligence Rail

**Outcome:** Requests has a right-rail component that summarizes workspace-level signals from backend-derived DTO/view-model data instead of selected request details.

**Files:**

- Create: `docs/agentic/claims/task-2-request-intelligence-rail.md`
- Create: `packages/ui/src/requests/RequestWorkspaceIntelligenceRail.tsx`
- Create: `packages/ui/test/request-intelligence-rail.test.tsx`
- Modify: `packages/ui/src/requests/request-types.ts`
- Modify: `packages/ui/src/requests/request-model.ts`
- Modify: `packages/ui/test/request-model.test.ts`

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-2-request-intelligence-rail.md` with status `claimed`, then change it to `in-progress` and commit that state.

Use commit messages:

```bash
git commit -m "chore: claim task 2 request intelligence rail"
git commit -m "chore: start task 2 request intelligence rail"
```

Expected: both commits succeed.

- [ ] **Step 2: Add failing intelligence model tests**

Add `buildPrrWorkspaceIntelligenceModel` to the existing request-model import in `packages/ui/test/request-model.test.ts`, then append:

```ts
it("summarizes workspace intelligence from backend-derived PRR DTOs", () => {
  const workspace = buildTestRequestsWorkspace();
  const intelligence = buildPrrWorkspaceIntelligenceModel(workspace);

  expect(intelligence.activeRequestCount).toBeGreaterThanOrEqual(9);
  expect(intelligence.healthSignals.map((signal) => signal.label)).toEqual(
    expect.arrayContaining(["Review fee/scope", "Appeal/escalation", "Diagnostics"])
  );
  expect(intelligence.nextWork.map((item) => item.label)).toEqual(
    expect.arrayContaining(["Review fee and scope signals", "Inspect escalation candidates"])
  );
});
```

- [ ] **Step 3: Add failing component tests**

Create `packages/ui/test/request-intelligence-rail.test.tsx`:

```tsx
/** @vitest-environment jsdom */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildPrrProjection } from "../../prr/src/projection.js";
import { buildPrrWorkspaceDto } from "../../prr/src/read-api.js";
import { prrWorkspaceSeedEvents } from "../../prr/src/workspace-seed.js";
import { RequestWorkspaceIntelligenceRail } from "../src/requests/RequestWorkspaceIntelligenceRail.js";

describe("RequestWorkspaceIntelligenceRail", () => {
  function buildTestRequestsWorkspace() {
    return buildPrrWorkspaceDto(buildPrrProjection(prrWorkspaceSeedEvents), {
      now: "2026-07-20T12:00:00.000Z"
    });
  }

  it("renders workspace-level signals instead of selected request details", () => {
    render(<RequestWorkspaceIntelligenceRail workspace={buildTestRequestsWorkspace()} />);

    const rail = screen.getByRole("complementary", { name: "Requests workspace intelligence" });

    expect(within(rail).getByRole("heading", { name: "Workspace intelligence" })).toBeInTheDocument();
    expect(within(rail).getByText("Review fee/scope")).toBeInTheDocument();
    expect(within(rail).getByText("Appeal/escalation")).toBeInTheDocument();
    expect(within(rail).getByText("Suggested next work")).toBeInTheDocument();
    expect(within(rail).queryByText("Next action packet")).not.toBeInTheDocument();
  });

  it("renders a sparse loading state without request fixtures", () => {
    render(<RequestWorkspaceIntelligenceRail workspace={undefined} />);

    const rail = screen.getByRole("complementary", { name: "Requests workspace intelligence" });

    expect(within(rail).getByText("Requests workspace loading")).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run the targeted red command**

Run:

```bash
npm test -- packages/ui/test/request-model.test.ts packages/ui/test/request-intelligence-rail.test.tsx
```

Expected: fails because `buildPrrWorkspaceIntelligenceModel` and `RequestWorkspaceIntelligenceRail` do not exist.

- [ ] **Step 5: Add intelligence types**

Add to `packages/ui/src/requests/request-types.ts`:

```ts
export interface PrrWorkspaceIntelligenceSignal {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly tone: PrrSignalTone;
  readonly detail: string;
}

export interface PrrWorkspaceIntelligenceNextWork {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly tone: PrrSignalTone;
}

export interface PrrWorkspaceIntelligenceModel {
  readonly activeRequestCount: number;
  readonly generatedAt: string;
  readonly healthSignals: readonly PrrWorkspaceIntelligenceSignal[];
  readonly nextWork: readonly PrrWorkspaceIntelligenceNextWork[];
}
```

- [ ] **Step 6: Add intelligence model builder**

Add to `packages/ui/src/requests/request-model.ts`:

```ts
export function buildPrrWorkspaceIntelligenceModel(workspace: PrrWorkspaceData): PrrWorkspaceIntelligenceModel {
  const feeScopeCount = workspace.cards.filter((card) => card.laneId === "review-fee-scope").length;
  const escalationCount = workspace.cards.filter((card) => card.laneId === "appeal-escalation").length;
  const overdueCount = workspace.cards.filter((card) => card.dueState === "overdue").length;
  const diagnosticCount = workspace.diagnostics.length;
  const draftCount = workspace.cards.filter((card) => card.laneId === "drafting").length;

  const healthSignals: PrrWorkspaceIntelligenceSignal[] = [
    {
      id: "active-requests",
      label: "Active requests",
      value: String(workspace.cards.length),
      tone: "cyan",
      detail: "Requests currently projected from the local PRR ledger."
    },
    {
      id: "review-fee-scope",
      label: "Review fee/scope",
      value: String(feeScopeCount),
      tone: feeScopeCount > 0 ? "amber" : "neutral",
      detail: "Fee estimates and scope narrowing need human review before action."
    },
    {
      id: "appeal-escalation",
      label: "Appeal/escalation",
      value: String(escalationCount),
      tone: escalationCount > 0 ? "red" : "neutral",
      detail: "Appeals and legal escalation candidates stay locked behind explicit approval."
    },
    {
      id: "deadlines",
      label: "Deadline pressure",
      value: String(overdueCount),
      tone: overdueCount > 0 ? "red" : "green",
      detail: "Overdue requests based on replayed deadline state."
    },
    {
      id: "diagnostics",
      label: "Diagnostics",
      value: String(diagnosticCount),
      tone: diagnosticCount > 0 ? "amber" : "green",
      detail: "Open projection or workflow diagnostics tied to PRR events."
    }
  ];

  const nextWork: PrrWorkspaceIntelligenceNextWork[] = [
    {
      id: "review-drafts",
      label: "Review draft queue",
      detail: `${draftCount} draft request${draftCount === 1 ? "" : "s"} can be checked before send approval.`,
      tone: draftCount > 0 ? "cyan" : "neutral"
    },
    {
      id: "review-fee-scope-work",
      label: "Review fee and scope signals",
      detail: `${feeScopeCount} request${feeScopeCount === 1 ? "" : "s"} need fee or scope review.`,
      tone: feeScopeCount > 0 ? "amber" : "neutral"
    },
    {
      id: "inspect-escalation",
      label: "Inspect escalation candidates",
      detail: `${escalationCount} request${escalationCount === 1 ? "" : "s"} sit in appeal or escalation lanes.`,
      tone: escalationCount > 0 ? "red" : "neutral"
    }
  ];

  return Object.freeze({
    activeRequestCount: workspace.cards.length,
    generatedAt: workspace.generatedAt,
    healthSignals: Object.freeze(healthSignals.map((signal) => Object.freeze(signal))),
    nextWork: Object.freeze(nextWork.map((item) => Object.freeze(item)))
  });
}
```

Also add the needed imports from `request-types.ts`.

- [ ] **Step 7: Implement the intelligence rail**

Create `packages/ui/src/requests/RequestWorkspaceIntelligenceRail.tsx`:

```tsx
import { buildPrrWorkspaceIntelligenceModel } from "./request-model.js";
import type { PrrSignalTone, PrrWorkspaceData, PrrWorkspaceIntelligenceModel } from "./request-types.js";

interface RequestWorkspaceIntelligenceRailProps {
  readonly workspace: PrrWorkspaceData | undefined;
}

const toneClasses: Record<PrrSignalTone, string> = {
  amber: "border-[var(--signal-amber)] text-[var(--signal-amber)]",
  red: "border-[var(--signal-red)] text-[var(--signal-red)]",
  green: "border-[var(--signal-green)] text-[var(--signal-green)]",
  cyan: "border-[var(--signal-cyan)] text-[var(--signal-cyan)]",
  neutral: "border-[var(--console-line)] text-[var(--muted-amber)]"
};

export function RequestWorkspaceIntelligenceRail({ workspace }: RequestWorkspaceIntelligenceRailProps) {
  if (workspace === undefined) {
    return (
      <aside aria-label="Requests workspace intelligence" className="h-full p-4 lg:p-5">
        <h2 className="text-lg font-semibold text-balance text-[var(--paper-light)]">Workspace intelligence</h2>
        <p className="mt-3 text-base text-pretty text-[var(--muted-amber)] sm:text-sm">Requests workspace loading</p>
      </aside>
    );
  }

  return <IntelligenceRailContent model={buildPrrWorkspaceIntelligenceModel(workspace)} />;
}

function IntelligenceRailContent({ model }: { readonly model: PrrWorkspaceIntelligenceModel }) {
  return (
    <aside aria-label="Requests workspace intelligence" className="h-full p-4 lg:p-5">
      <p className="font-mono text-base text-[var(--signal-amber)] sm:text-sm">PRR sync local</p>
      <h2 className="mt-2 text-lg font-semibold text-balance text-[var(--paper-light)]">Workspace intelligence</h2>
      <p className="mt-3 text-base text-pretty text-[var(--muted-amber)] sm:text-sm">
        {model.activeRequestCount} active request{model.activeRequestCount === 1 ? "" : "s"} from replayed PRR DTOs.
      </p>

      <section className="mt-5 border-t border-[var(--console-line)] pt-5">
        <h3 className="text-base font-semibold text-balance text-[var(--paper-light)] sm:text-sm">Health signals</h3>
        <ul role="list" className="mt-3 space-y-3">
          {model.healthSignals.map((signal) => (
            <li key={signal.id} className="border border-[var(--console-line)] bg-[var(--console-panel)]/56 p-3">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-base font-medium text-[var(--paper-light)] sm:text-sm">{signal.label}</div>
                  <p className="mt-1 text-base text-pretty text-[var(--muted-amber)] sm:text-sm">{signal.detail}</p>
                </div>
                <div className={`shrink-0 border px-2 py-1 font-mono text-base sm:text-sm ${toneClasses[signal.tone]}`}>
                  {signal.value}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-5 border-t border-[var(--console-line)] pt-5">
        <h3 className="text-base font-semibold text-balance text-[var(--paper-light)] sm:text-sm">Suggested next work</h3>
        <ul role="list" className="mt-3 space-y-3">
          {model.nextWork.map((item) => (
            <li key={item.id} className="border-l border-[var(--console-line)] pl-3">
              <div className={`w-fit border px-2 py-1 font-mono text-base sm:text-sm ${toneClasses[item.tone]}`}>{item.label}</div>
              <p className="mt-2 text-base text-pretty text-[var(--muted-amber)] sm:text-sm">{item.detail}</p>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
```

- [ ] **Step 8: Run the targeted green command**

Run:

```bash
npm test -- packages/ui/test/request-model.test.ts packages/ui/test/request-intelligence-rail.test.tsx
```

Expected: 2 test files pass.

- [ ] **Step 9: Run full verification and commit**

Run:

```bash
npm run verify
```

Expected: typecheck, all tests, UI build, and factory readiness pass.

Update the claim with command evidence and status `ready-for-review`, then run:

```bash
git add docs/agentic/claims/task-2-request-intelligence-rail.md packages/ui/src/requests/RequestWorkspaceIntelligenceRail.tsx packages/ui/src/requests/request-types.ts packages/ui/src/requests/request-model.ts packages/ui/test/request-intelligence-rail.test.tsx packages/ui/test/request-model.test.ts
git commit -m "feat: add requests workspace intelligence rail"
```

Expected: commit succeeds.

## Task 3: Wire Requests Modal And Intelligence Rail Through App

**Outcome:** Requests card clicks open the detail modal immediately, Requests uses the Workspace Intelligence rail, and Command keeps its current rail.

**Files:**

- Create: `docs/agentic/claims/task-3-wire-request-detail-modal.md`
- Modify: `packages/ui/src/App.tsx`
- Modify: `packages/ui/src/requests/RequestWorkspace.tsx`
- Modify: `packages/ui/src/requests/RequestBoard.tsx`
- Modify: `packages/ui/src/requests/RequestLane.tsx`
- Modify: `packages/ui/src/requests/RequestCard.tsx`
- Modify: `packages/ui/test/request-board.test.tsx`
- Modify: `packages/ui/test/app-smoke.test.tsx`

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-3-wire-request-detail-modal.md` with status `claimed`, then change it to `in-progress` and commit that state.

Use commit messages:

```bash
git commit -m "chore: claim task 3 request detail modal wiring"
git commit -m "chore: start task 3 request detail modal wiring"
```

Expected: both commits succeed.

- [ ] **Step 2: Update failing Requests board/App tests**

Update `packages/ui/test/request-board.test.tsx` so the selected request test expects a modal and Workspace Intelligence rail:

```tsx
it("opens the request detail modal immediately when a request card is selected", async () => {
  render(<App />);

  fireEvent.click(screen.getByRole("link", { name: "Requests" }));
  expect(await screen.findByRole("heading", { name: "Requests" })).toBeInTheDocument();
  expect(screen.getByRole("complementary", { name: "Requests workspace intelligence" })).toBeInTheDocument();
  expect(screen.queryByRole("complementary", { name: "Request detail rail" })).not.toBeInTheDocument();

  const card = screen.getByRole("button", {
    name: "Select Please provide building permit inspection records for the riverfront project."
  });
  card.focus();
  fireEvent.click(card);

  const dialog = await screen.findByRole("dialog", { name: /Request investigation detail/i });
  expect(within(dialog).getByText("Building Services Department")).toBeInTheDocument();
  expect(within(dialog).getByText("Review fee or scope")).toBeInTheDocument();

  fireEvent.click(within(dialog).getByRole("button", { name: "Close request detail" }));

  expect(screen.queryByRole("dialog", { name: /Request investigation detail/i })).not.toBeInTheDocument();
  expect(screen.getByRole("complementary", { name: "Requests workspace intelligence" })).toBeInTheDocument();
  expect(card).toHaveAttribute("aria-pressed", "true");
  expect(card).toHaveFocus();
});
```

Also update the two direct `RequestWorkspace` renders in this file to pass `onOpenRequestDetail={() => undefined}`, and replace the old one-detail-rail landmark regression with:

```tsx
it("keeps App Requests mode to one workspace intelligence rail landmark", async () => {
  render(<App />);

  fireEvent.click(screen.getByRole("link", { name: "Requests" }));

  await screen.findByRole("heading", { name: "Requests" });
  expect(screen.getAllByRole("complementary", { name: "Requests workspace intelligence" })).toHaveLength(1);
  expect(screen.queryByRole("complementary", { name: "Request detail rail" })).not.toBeInTheDocument();
});
```

Update `packages/ui/test/app-smoke.test.tsx` so the Requests smoke path checks the intelligence rail and modal after saved-view selection:

```tsx
expect(screen.getByRole("complementary", { name: "Requests workspace intelligence" })).toBeInTheDocument();
fireEvent.click(feeCard);
const detailModal = await screen.findByRole("dialog", { name: /Request investigation detail/i });
expect(within(detailModal).getByText(/Building Services Department/)).toBeInTheDocument();
fireEvent.click(within(detailModal).getByRole("button", { name: "Close request detail" }));
```

Also keep the builder-open assertion in the same smoke test. In the builder-submit smoke test, replace the old `Request detail rail` assertion after draft creation with:

```tsx
expect(screen.getByRole("complementary", { name: "Requests workspace intelligence" })).toBeInTheDocument();
expect(screen.queryByRole("complementary", { name: "Request detail rail" })).not.toBeInTheDocument();
```

- [ ] **Step 3: Run the targeted red command**

Run:

```bash
npm test -- packages/ui/test/request-board.test.tsx packages/ui/test/app-smoke.test.tsx
```

Expected: fails because Requests still renders `RequestDetailRail` and card click does not open `RequestDetailModal`.

- [ ] **Step 4: Update card selection callbacks**

Change `RequestWorkspaceProps` in `packages/ui/src/requests/RequestWorkspace.tsx` to include:

```ts
readonly onOpenRequestDetail: () => void;
```

Add a local handler:

```ts
function handleSelectRequest(prrRequestId: string) {
  onSelectRequest(prrRequestId);
  onOpenRequestDetail();
}
```

Pass `handleSelectRequest` to `RequestBoard`.

Keep `RequestBoard`, `RequestLane`, and `RequestCard` callback names simple. If workers choose to rename `onSelectRequest` to `onOpenRequest`, update all three files and tests in this task together.

- [ ] **Step 5: Update App state and rail wiring**

In `packages/ui/src/App.tsx`:

1. Import the new components:

```ts
import { RequestDetailModal } from "./requests/RequestDetailModal.js";
import { RequestWorkspaceIntelligenceRail } from "./requests/RequestWorkspaceIntelligenceRail.js";
```

Also import `getSelectedPrrRequest` with the existing request-model import:

```ts
import { buildPrrBuilderModel, getSelectedPrrRequest } from "./requests/request-model.js";
```

2. Add modal state:

```ts
const [requestDetailModalOpen, setRequestDetailModalOpen] = useState(false);
```

3. Derive the modal detail synchronously from the loaded workspace and selected request ID so the modal never renders a stale prior selection:

```ts
const selectedPrrModalRequest = useMemo(
  () => (requestsWorkspace === undefined ? undefined : getSelectedPrrRequest(requestsWorkspace, selectedPrrRequestId)),
  [requestsWorkspace, selectedPrrRequestId]
);
```

4. Pass `onOpenRequestDetail={() => setRequestDetailModalOpen(true)}` through `renderRequestsMain` into `RequestWorkspace`.

5. Replace the Requests rail:

```tsx
decisionRail={
  requestsActive ? (
    <RequestWorkspaceIntelligenceRail workspace={requestsWorkspace} />
  ) : (
    commandDecisionRail
  )
}
```

6. Hide the background app for either Requests modal:

```tsx
<div aria-hidden={requestsActive && (requestBuilderOpen || requestDetailModalOpen) ? "true" : undefined}>
```

7. Render the detail modal:

```tsx
{requestsActive && requestDetailModalOpen ? (
  <RequestDetailModal selectedRequest={selectedPrrModalRequest} onClose={() => setRequestDetailModalOpen(false)} />
) : null}
```

8. Close stale detail modal when leaving Requests:

```ts
function handleModuleSelect(moduleId: string) {
  if (implementedModuleIds.has(moduleId)) {
    setActiveModuleId(moduleId);
    if (moduleId !== "requests") {
      setRequestDetailModalOpen(false);
    }
  }
}
```

- [ ] **Step 6: Run the targeted green command**

Run:

```bash
npm test -- packages/ui/test/request-board.test.tsx packages/ui/test/app-smoke.test.tsx
```

Expected: 2 test files pass.

- [ ] **Step 7: Run full verification and commit**

Run:

```bash
npm run verify
```

Expected: typecheck, all tests, UI build, and factory readiness pass.

Update the claim with command evidence and status `ready-for-review`, then run:

```bash
git add docs/agentic/claims/task-3-wire-request-detail-modal.md packages/ui/src/App.tsx packages/ui/src/requests/RequestWorkspace.tsx packages/ui/src/requests/RequestBoard.tsx packages/ui/src/requests/RequestLane.tsx packages/ui/src/requests/RequestCard.tsx packages/ui/test/request-board.test.tsx packages/ui/test/app-smoke.test.tsx
git commit -m "feat: open request details in modal"
```

Expected: commit succeeds.

## Task 4: Final UI Contracts And Overlay Coexistence

**Outcome:** Accessibility, data-boundary, visual-contract, and builder coexistence tests protect the modal and intelligence rail behavior.

**Files:**

- Create: `docs/agentic/claims/task-4-request-detail-modal-contracts.md`
- Modify: `packages/ui/test/request-detail-modal.test.tsx`
- Modify: `packages/ui/test/request-builder.test.tsx`
- Modify: `packages/ui/test/request-data-boundary.test.ts`
- Modify: `packages/ui/test/visual-contract.test.ts`
- Modify: `packages/ui/test/ui-picker.test.tsx`
- Modify: `packages/ui/test/app-smoke.test.tsx`

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-4-request-detail-modal-contracts.md` with status `claimed`, then change it to `in-progress` and commit that state.

Use commit messages:

```bash
git commit -m "chore: claim task 4 request modal contracts"
git commit -m "chore: start task 4 request modal contracts"
```

Expected: both commits succeed.

- [ ] **Step 2: Tighten failing modal and builder coexistence tests**

Add to `packages/ui/test/request-detail-modal.test.tsx`:

```tsx
it("renders a safe empty detail state", () => {
  render(<RequestDetailModal selectedRequest={undefined} onClose={() => undefined} />);

  const dialog = screen.getByRole("dialog", { name: /Request investigation detail/i });
  expect(within(dialog).getByText("Request detail unavailable")).toBeInTheDocument();
  expect(within(dialog).getByText(/selected request detail is unavailable/i)).toBeInTheDocument();
});
```

Update `packages/ui/test/request-builder.test.tsx` with an App-level regression:

```tsx
it("opens the guided builder after a request detail modal has been closed", async () => {
  render(<App />);

  fireEvent.click(screen.getByRole("link", { name: "Requests" }));
  const card = await screen.findByRole("button", {
    name: "Select Please provide building permit inspection records for the riverfront project."
  });
  fireEvent.click(card);
  const detailModal = await screen.findByRole("dialog", { name: /Request investigation detail/i });
  fireEvent.click(within(detailModal).getByRole("button", { name: "Close request detail" }));

  fireEvent.click(screen.getByRole("button", { name: "New request" }));

  expect(await screen.findByRole("dialog", { name: "Guided request builder" })).toBeInTheDocument();
  expect(screen.queryByRole("dialog", { name: /Request investigation detail/i })).not.toBeInTheDocument();
});
```

Add `within` to the Testing Library import in this file.

- [ ] **Step 3: Tighten data-boundary and visual contracts**

Update `packages/ui/test/request-data-boundary.test.ts` expected product scan to include the new modal, shared sections, and intelligence rail files:

```ts
expect(productUiBoundaryFiles).toContain("packages/ui/src/requests/RequestDetailSections.tsx");
expect(productUiBoundaryFiles).toContain("packages/ui/src/requests/RequestDetailModal.tsx");
expect(productUiBoundaryFiles).toContain("packages/ui/src/requests/RequestWorkspaceIntelligenceRail.tsx");
```

Append to `packages/ui/test/visual-contract.test.ts`:

```ts
it("keeps request detail modal full-screen and page-scale", () => {
  const modalSource = readFileSync("packages/ui/src/requests/RequestDetailModal.tsx", "utf8");

  expect(modalSource).toContain("fixed inset-0");
  expect(modalSource).toContain("min-h-[calc(100dvh-2rem)]");
  expect(modalSource).toContain("max-w-7xl");
  expect(modalSource).toContain('role="dialog"');
  expect(modalSource).toContain('aria-modal="true"');
  expect(modalSource).not.toMatch(/rounded-(?:sm|md|lg|xl|2xl|3xl|full)/);
  expect(modalSource).not.toMatch(/shadow-(?:sm|md|lg|xl|2xl)/);
});
```

Also add the new Requests files to the `uiTsxFiles` list, and include `RequestDetailSections.tsx`, `RequestDetailModal.tsx`, and `RequestWorkspaceIntelligenceRail.tsx` in the final Requests contract source set.

Update `packages/ui/test/ui-picker.test.tsx` source file list to include:

```ts
"packages/ui/src/requests/RequestDetailSections.tsx",
"packages/ui/src/requests/RequestDetailModal.tsx",
"packages/ui/src/requests/RequestWorkspaceIntelligenceRail.tsx"
```

- [ ] **Step 4: Run the targeted red command**

Run:

```bash
npm test -- packages/ui/test/request-detail-modal.test.tsx packages/ui/test/request-builder.test.tsx packages/ui/test/request-data-boundary.test.ts packages/ui/test/visual-contract.test.ts packages/ui/test/ui-picker.test.tsx packages/ui/test/app-smoke.test.tsx
```

Expected: fails until modal, builder coexistence, and visual-contract expectations are satisfied.

- [ ] **Step 5: Make focused test repairs only where needed**

If tests expose missing modal attributes, focus behavior, or source file coverage, update only:

- `packages/ui/src/requests/RequestDetailModal.tsx`
- `packages/ui/src/requests/RequestWorkspaceIntelligenceRail.tsx`
- `packages/ui/test/request-detail-modal.test.tsx`
- `packages/ui/test/request-builder.test.tsx`
- `packages/ui/test/request-data-boundary.test.ts`
- `packages/ui/test/visual-contract.test.ts`
- `packages/ui/test/ui-picker.test.tsx`
- `packages/ui/test/app-smoke.test.tsx`

Record any production-file repair in the claim with the failing assertion that required it.

- [ ] **Step 6: Run the targeted green command**

Run:

```bash
npm test -- packages/ui/test/request-detail-modal.test.tsx packages/ui/test/request-builder.test.tsx packages/ui/test/request-data-boundary.test.ts packages/ui/test/visual-contract.test.ts packages/ui/test/ui-picker.test.tsx packages/ui/test/app-smoke.test.tsx
```

Expected: listed test files pass.

- [ ] **Step 7: Run full verification and commit**

Run:

```bash
npm run verify
```

Expected: typecheck, all tests, UI build, and factory readiness pass.

Update the claim with command evidence and status `ready-for-review`, then run:

```bash
git add docs/agentic/claims/task-4-request-detail-modal-contracts.md packages/ui/test/request-detail-modal.test.tsx packages/ui/test/request-builder.test.tsx packages/ui/test/request-data-boundary.test.ts packages/ui/test/visual-contract.test.ts packages/ui/test/ui-picker.test.tsx packages/ui/test/app-smoke.test.tsx packages/ui/src/requests/RequestDetailModal.tsx packages/ui/src/requests/RequestWorkspaceIntelligenceRail.tsx
git commit -m "test: lock request detail modal contracts"
```

Expected: commit succeeds.

## Task 5: Factory Readiness And Human Preview Gate

**Outcome:** Factory readiness records the new detail-modal spec and plan, final verification passes, and the Requests modal/rail change is exposed for human preview.

**Files:**

- Create: `docs/agentic/claims/task-5-request-modal-readiness.md`
- Modify: `scripts/check-agent-readiness.mjs`
- Modify: `docs/agentic/software-factory.md`
- Modify: `packages/ui/test/request-data-boundary.test.ts`
- Modify: `packages/ui/test/app-smoke.test.tsx`

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-5-request-modal-readiness.md` with status `claimed`, then change it to `in-progress` and commit that state.

Use commit messages:

```bash
git commit -m "chore: claim task 5 request modal readiness"
git commit -m "chore: start task 5 request modal readiness"
```

Expected: both commits succeed.

- [ ] **Step 2: Add failing readiness tests**

Update `packages/ui/test/request-data-boundary.test.ts` so the readiness required-files test expects:

```ts
const requestModalSpecPath = "docs/superpowers/specs/2026-07-04-requests-detail-modal-design.md";
const requestModalPlanPath = "docs/superpowers/plans/2026-07-04-requests-detail-modal-implementation.md";
```

and:

```ts
expect(requiredFiles).toEqual(expect.arrayContaining([requestModalSpecPath, requestModalPlanPath]));
```

Update `packages/ui/test/app-smoke.test.tsx` with a final smoke assertion that:

```tsx
expect(screen.getByRole("complementary", { name: "Requests workspace intelligence" })).toBeInTheDocument();
expect(screen.queryByRole("complementary", { name: "Request detail rail" })).not.toBeInTheDocument();
```

after switching to Requests.

- [ ] **Step 3: Run the targeted red command**

Run:

```bash
npm test -- packages/ui/test/request-data-boundary.test.ts packages/ui/test/app-smoke.test.tsx
```

Expected: fails because `scripts/check-agent-readiness.mjs` does not require the new detail-modal spec and plan yet.

- [ ] **Step 4: Update factory readiness**

In `scripts/check-agent-readiness.mjs`, add:

```js
"docs/superpowers/specs/2026-07-04-requests-detail-modal-design.md",
"docs/superpowers/plans/2026-07-04-requests-detail-modal-implementation.md"
```

to the `requiredFiles` array.

- [ ] **Step 5: Update software factory evidence**

Append to `docs/agentic/software-factory.md`:

```markdown
## Requests Detail Modal Plan Readiness

The Requests detail modal plan was prepared from the approved design spec on 2026-07-04.

Required design and plan files:

- `docs/superpowers/specs/2026-07-04-requests-detail-modal-design.md`
- `docs/superpowers/plans/2026-07-04-requests-detail-modal-implementation.md`

Factory readiness now checks both files through `scripts/check-agent-readiness.mjs`.

Recorded command evidence:

```text
npm test -- packages/ui/test/request-data-boundary.test.ts packages/ui/test/app-smoke.test.tsx
Test Files  2 passed (2)

npm run verify
typecheck passed
tests passed
vite build succeeded
factory-readiness passed
```

Preview evidence: pending final controller preview gate.
```

- [ ] **Step 6: Run the targeted green command**

Run:

```bash
npm test -- packages/ui/test/request-data-boundary.test.ts packages/ui/test/app-smoke.test.tsx
```

Expected: listed tests pass.

- [ ] **Step 7: Run factory readiness and full verification**

Run:

```bash
npm run factory:check
npm run verify
```

Expected: factory readiness passes, then full verification passes.

- [ ] **Step 8: Commit readiness changes**

Update the claim with command evidence and status `ready-for-review`, then run:

```bash
git add docs/agentic/claims/task-5-request-modal-readiness.md scripts/check-agent-readiness.mjs docs/agentic/software-factory.md packages/ui/test/request-data-boundary.test.ts packages/ui/test/app-smoke.test.tsx
git commit -m "test: finalize request detail modal readiness"
```

Expected: commit succeeds.

- [ ] **Step 9: Start preview server for human review**

Run:

```bash
npm run dev -- --port 5175 --strictPort
```

Expected output includes local and network URLs.

In another terminal, run:

```bash
curl -I http://127.0.0.1:5175/
```

Expected: `HTTP/1.1 200 OK`.

If a tailnet URL is printed, verify it:

```bash
curl -I --max-time 5 http://100.126.143.105:5175/
```

Expected: `HTTP/1.1 200 OK`.

Record preview URLs and reachability in the claim. Ask the user to review the Requests detail modal and Workspace Intelligence rail before marking the preview gate complete.

## Completion Criteria

- Requests card click opens a full-screen investigation modal immediately.
- Requests no longer uses `RequestDetailRail` as the shell right rail.
- Requests right rail renders Workspace Intelligence from backend-derived DTO/view-model data.
- Command still renders its existing `DecisionRail`.
- Detail modal supports close button, Escape, focus trap, and focus restoration.
- Closing the modal keeps card selection stable.
- Builder modal still opens and submits after detail modal interactions.
- Product UI still imports no fixtures, PRR runtime, SQLite, or Node-only modules.
- Visual contracts cover full-screen modal dimensions and page-scale surface rules.
- New spec and plan are required by factory readiness.
- `npm run verify` passes.
- Human preview gate is satisfied or explicitly skipped by the user.

## Execution Handoff

Run this plan task-by-task. Use `superpowers:subagent-driven-development` when available so implementation workers and reviewers have separate context. Use `superpowers:executing-plans` for inline execution if subagents are unavailable. Do not start Task 2 until Task 1 is committed and reviewed, and continue that sequencing through Task 5.
