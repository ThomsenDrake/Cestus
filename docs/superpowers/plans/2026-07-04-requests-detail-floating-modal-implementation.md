# Requests Detail Floating Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Requests detail modal feel like an inset floating panel over the live Requests workspace instead of a separate screen.

**Architecture:** Keep the existing modal state, accessibility behavior, and ledger-derived `PrrDetailModel` content unchanged. Change only the modal surface contract and its UI tests: lower the backdrop opacity, add viewport margins, bound the panel height, move scrolling inside the panel body, and allow one explicit custom elevation class.

**Tech Stack:** TypeScript, React, Vite, Vitest, Testing Library, Tailwind utility classes, existing Requests UI components.

---

## Research Inputs

Local Cestus patterns to preserve:

- The ledger-backed PRR workspace plan used narrow worker tasks, durable claim files, exact red and green commands, full `npm run verify`, and review evidence.
- The Requests detail modal plan used a UI-only boundary, explicit no-backend rule, accessibility tests, data-boundary checks, visual-contract checks, and tailnet preview evidence.

External agentic-development references applied:

- Steipete, [Just Talk To It](https://steipete.me/posts/just-talk-to-it): read the code, iterate with visible UI feedback, keep docs current, use tests to catch regressions, and commit only scoped changes.
- Steipete, [Essential Reading for Agentic Engineers](https://steipete.me/posts/2025/essential-reading): keep tasks small, use worktrees/checkpoints, and prefer precise context over broad prompting.
- Factory AI, [How Missions Work](https://factory.ai/news/missions-architecture): keep worker context focused, separate implementation and validation incentives, and define correctness before code.
- Factory AI, [Factory 2.0](https://factory.ai/news/software-factory): treat the work as signal, planned change, build, test, review, and durable feedback into the project loop.

## Required Reading

Every worker must read these files before editing:

- `AGENTS.md`
- `docs/agentic/software-factory.md`
- `docs/superpowers/specs/2026-07-04-requests-detail-modal-design.md`
- `docs/superpowers/specs/2026-07-04-requests-detail-floating-modal-design.md`
- `docs/superpowers/plans/2026-07-04-requests-detail-modal-implementation.md`
- This implementation plan

Workers must also read every source and test file listed in the task before editing.

## Factory Rules

- Start by creating and committing the durable claim file.
- Mark the claim `in-progress` in a second commit before changing source or tests.
- Write or update failing tests before production code.
- Run the exact targeted red command and record the failure in the claim.
- Change only the files listed in the task unless a verifier exposes a narrow supporting edit. Record supporting edits in the claim before committing them.
- Run the targeted green command, then `npm run verify`, before setting the claim to `ready-for-review`.
- Commit the completed task.
- Do not edit PRR backend packages, projection code, ledger contracts, ontology code, adapter code, or workspace intelligence.
- Stop and escalate on data-loss risk, schema conflict, browser import of Node-only code, autonomous send/escalation behavior, or repeated verifier failure after two focused repair attempts.

## File Map

- `packages/ui/src/requests/RequestDetailModal.tsx`: owns the modal wrapper, panel surface, focus handling, close behavior, empty state, and detail section rendering.
- `packages/ui/test/request-detail-modal.test.tsx`: verifies modal role, aria contract, floating dimensions, detail rendering, empty state, close behavior, Escape handling, focus trap, and focus restore.
- `packages/ui/test/visual-contract.test.ts`: static visual contract that protects the floating modal treatment and keeps generic card styling out of Requests surfaces.
- `scripts/check-agent-readiness.mjs`: factory readiness required-file list for the new floating-modal spec and plan.
- `docs/agentic/claims/task-1-floating-request-detail-modal.md`: durable task claim and verification evidence.

---

## Task 1: Float Request Detail Modal Over The Workspace

**Outcome:** The Requests detail modal remains accessible and ledger-backed while visually floating over the visible Requests workspace with internal panel scrolling.

**Allowed files:**

- `docs/agentic/claims/task-1-floating-request-detail-modal.md`
- `packages/ui/src/requests/RequestDetailModal.tsx`
- `packages/ui/test/request-detail-modal.test.tsx`
- `packages/ui/test/visual-contract.test.ts`
- `scripts/check-agent-readiness.mjs`

### Steps

- [ ] **Step 1: Claim the task**

Create `docs/agentic/claims/task-1-floating-request-detail-modal.md` with:

```markdown
# Task 1: Floating Request Detail Modal

Plan path: `docs/superpowers/plans/2026-07-04-requests-detail-floating-modal-implementation.md`
Task heading: `Task 1: Float Request Detail Modal Over The Workspace`
Worker identity: Codex
Branch: `codex/prr-ledger-backed-workspace-design`
Worktree path: `/home/drake/.codex/worktrees/3ea1/Cestus`
Claimed at: run `date -u +"%Y-%m-%dT%H:%M:%SZ"` and paste the emitted timestamp
Status: `claimed`

## Owned Files

- `packages/ui/src/requests/RequestDetailModal.tsx`
- `packages/ui/test/request-detail-modal.test.tsx`
- `packages/ui/test/visual-contract.test.ts`
- `scripts/check-agent-readiness.mjs`

## Evidence

- Red command: not run yet
- Green command: not run yet
- Full verification: not run yet

## Review

- Review status: not started
- Concerns: none recorded
```

Run:

```bash
git add docs/agentic/claims/task-1-floating-request-detail-modal.md
git commit -m "chore: claim floating request detail modal"
```

Expected: commit succeeds.

- [ ] **Step 2: Mark the claim in progress**

Change the claim status line to:

```markdown
Status: `in-progress`
```

Run:

```bash
git add docs/agentic/claims/task-1-floating-request-detail-modal.md
git commit -m "chore: start floating request detail modal"
```

Expected: commit succeeds.

- [ ] **Step 3: Update modal tests before production code**

In `packages/ui/test/request-detail-modal.test.tsx`, replace the first test with:

```tsx
  it("renders selected request details in a floating investigation dialog", () => {
    render(<RequestDetailModal selectedRequest={selectedRequest()} onClose={() => undefined} />);

    const dialog = screen.getByRole("dialog", { name: /Request investigation detail/i });
    const surface = dialog.firstElementChild;
    const detailBody = surface?.querySelector('[data-request-detail-modal-body="true"]');

    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveClass("fixed", "inset-0", "overflow-hidden", "bg-[var(--command-black)]/58");
    expect(surface).toHaveClass(
      "mx-auto",
      "flex",
      "max-h-[calc(100dvh-1.5rem)]",
      "max-w-7xl",
      "flex-col",
      "overflow-hidden",
      "border",
      "border-[var(--console-line)]",
      "bg-[var(--console-void)]/96",
      "shadow-[0_24px_80px_rgba(0,0,0,0.72)]",
      "sm:max-h-[calc(100dvh-2.5rem)]",
      "lg:max-h-[calc(100dvh-4rem)]"
    );
    expect(surface).not.toHaveClass("min-h-[calc(100dvh-2rem)]");
    expect(detailBody).not.toBeNull();
    expect(detailBody).toHaveClass("min-h-0", "overflow-y-auto");
    expect(within(dialog).getByText("Building Services Department")).toBeInTheDocument();
    expect(within(dialog).getByText("Review fee or scope")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Review to send" })).toBeDisabled();
    expect(within(dialog).getByText("Legal escalation locked")).toBeInTheDocument();
  });
```

In `packages/ui/test/visual-contract.test.ts`, replace the final modal contract test with:

```ts
  it("keeps request detail modal floating over the workspace", () => {
    const modalSource = readFileSync("packages/ui/src/requests/RequestDetailModal.tsx", "utf8");

    expect(modalSource).toContain("fixed inset-0");
    expect(modalSource).toContain("bg-[var(--command-black)]/58");
    expect(modalSource).toContain("max-h-[calc(100dvh-1.5rem)]");
    expect(modalSource).toContain("sm:max-h-[calc(100dvh-2.5rem)]");
    expect(modalSource).toContain("lg:max-h-[calc(100dvh-4rem)]");
    expect(modalSource).toContain("overflow-hidden");
    expect(modalSource).toContain('data-request-detail-modal-body="true"');
    expect(modalSource).toContain("overflow-y-auto");
    expect(modalSource).toContain("shadow-[0_24px_80px_rgba(0,0,0,0.72)]");
    expect(modalSource).toContain('role="dialog"');
    expect(modalSource).toContain('aria-modal="true"');
    expect(modalSource).not.toContain("min-h-[calc(100dvh-2rem)]");
    expect(modalSource).not.toMatch(/rounded-(?:sm|md|lg|xl|2xl|3xl|full)/);
    expect(modalSource).not.toMatch(/shadow-(?:sm|md|lg|xl|2xl)/);
  });
```

- [ ] **Step 4: Run the targeted red command**

Run:

```bash
npm test -- packages/ui/test/request-detail-modal.test.tsx packages/ui/test/visual-contract.test.ts
```

Expected red result: Vitest fails because `RequestDetailModal.tsx` still uses the page-like `bg-[var(--command-black)]/92`, `overflow-y-auto`, and `min-h-[calc(100dvh-2rem)]` surface contract and lacks `data-request-detail-modal-body="true"`.

- [ ] **Step 5: Update the modal surface**

In `packages/ui/src/requests/RequestDetailModal.tsx`, replace the `return (` block in `RequestDetailModal` with:

```tsx
  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Request investigation detail: ${title}`}
      onKeyDown={handleDialogKeyDown}
      className="fixed inset-0 z-50 overflow-hidden bg-[var(--command-black)]/58 p-3 sm:p-5 lg:p-8"
    >
      <div className="mx-auto flex max-h-[calc(100dvh-1.5rem)] max-w-7xl flex-col overflow-hidden border border-[var(--console-line)] bg-[var(--console-void)]/96 shadow-[0_24px_80px_rgba(0,0,0,0.72)] sm:max-h-[calc(100dvh-2.5rem)] lg:max-h-[calc(100dvh-4rem)]">
        <header className="flex min-w-0 shrink-0 flex-col gap-3 border-b border-[var(--console-line)] p-4 md:flex-row md:items-start md:justify-between lg:p-5">
          <div className="min-w-0">
            <p className="font-mono text-base text-[var(--signal-amber)] sm:text-sm">
              {selectedRequest === undefined ? (
                "No request selected"
              ) : (
                <>
                  <span>{selectedRequest.prrRequestId}</span>
                  <span aria-hidden="true"> / </span>
                  <span>{selectedRequest.agencyName}</span>
                </>
              )}
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-balance text-[var(--paper-light)]">{title}</h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={handleClose}
            className="relative min-h-10 w-fit shrink-0 border border-[var(--console-line)] px-3 py-2 text-base text-[var(--paper-light)] hover:border-[var(--signal-amber)] hover:text-[var(--signal-amber)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--signal-cyan)] sm:text-sm"
          >
            <span
              aria-hidden="true"
              className="pointer-fine:hidden absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2"
            />
            Close request detail
          </button>
        </header>
        <div data-request-detail-modal-body="true" className="min-h-0 overflow-y-auto p-4 lg:p-5">
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
```

- [ ] **Step 6: Add the new spec and plan to factory readiness**

In `scripts/check-agent-readiness.mjs`, add these required files immediately after `docs/superpowers/plans/2026-07-04-requests-detail-modal-implementation.md`:

```js
  "docs/superpowers/specs/2026-07-04-requests-detail-floating-modal-design.md",
  "docs/superpowers/plans/2026-07-04-requests-detail-floating-modal-implementation.md"
```

The surrounding list should become:

```js
  "docs/superpowers/specs/2026-07-04-requests-detail-modal-design.md",
  "docs/superpowers/plans/2026-07-04-requests-detail-modal-implementation.md",
  "docs/superpowers/specs/2026-07-04-requests-detail-floating-modal-design.md",
  "docs/superpowers/plans/2026-07-04-requests-detail-floating-modal-implementation.md"
];
```

- [ ] **Step 7: Run the targeted green command**

Run:

```bash
npm test -- packages/ui/test/request-detail-modal.test.tsx packages/ui/test/visual-contract.test.ts
```

Expected green result: 2 test files pass, including the floating modal class contract and existing accessibility behavior.

- [ ] **Step 8: Run full verification**

Run:

```bash
npm run verify
```

Expected output includes `typecheck passed`, Vitest pass output, `tests passed`, Vite build success, and `factory-readiness passed`.

- [ ] **Step 9: Update the claim with command evidence**

Update `docs/agentic/claims/task-1-floating-request-detail-modal.md` to:

```markdown
# Task 1: Floating Request Detail Modal

Plan path: `docs/superpowers/plans/2026-07-04-requests-detail-floating-modal-implementation.md`
Task heading: `Task 1: Float Request Detail Modal Over The Workspace`
Worker identity: Codex
Branch: `codex/prr-ledger-backed-workspace-design`
Worktree path: `/home/drake/.codex/worktrees/3ea1/Cestus`
Claimed at: keep the original claimed-at timestamp
Status: `ready-for-review`

## Owned Files

- `packages/ui/src/requests/RequestDetailModal.tsx`
- `packages/ui/test/request-detail-modal.test.tsx`
- `packages/ui/test/visual-contract.test.ts`
- `scripts/check-agent-readiness.mjs`

## Evidence

- Red command: `npm test -- packages/ui/test/request-detail-modal.test.tsx packages/ui/test/visual-contract.test.ts` failed as expected because the modal still used the page-like full-screen surface contract.
- Green command: `npm test -- packages/ui/test/request-detail-modal.test.tsx packages/ui/test/visual-contract.test.ts` passed with the floating modal contract.
- Full verification: `npm run verify` passed with typecheck, Vitest, Vite build, and factory readiness.

## Review

- Review status: ready for review
- Concerns: none recorded
```

Keep the real timestamp emitted in Step 1.

- [ ] **Step 10: Commit the completed task**

Run:

```bash
git add docs/agentic/claims/task-1-floating-request-detail-modal.md packages/ui/src/requests/RequestDetailModal.tsx packages/ui/test/request-detail-modal.test.tsx packages/ui/test/visual-contract.test.ts scripts/check-agent-readiness.mjs
git commit -m "fix: float request detail modal over workspace"
```

Expected: commit succeeds with only the allowed files staged.

## Review And Preview Gate

After the task commit, run a reviewer pass against the spec:

- Confirm no PRR backend, ledger, projection, ontology, or adapter files changed.
- Confirm modal accessibility tests still cover close button, Escape, focus trap, and focus restore.
- Confirm visual contract permits only the explicit arbitrary-value modal elevation and still blocks generic Tailwind shadow scale classes.
- Start or reuse the Vite dev server exposed on the tailnet and open the Requests workspace for human preview.

Human preview acceptance criteria:

- The detail modal clearly sits above the main Requests workspace.
- The board remains visible as background context.
- The modal does not read as a separate route or screen.
- The modal content remains readable and scrollable.
