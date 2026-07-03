# Cestus Tactical Command UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the rejected generic dark Command workspace with an always-on tactical product console that is strongly NGE-inspired, usable, responsive, tested, and ready for user visual review on the tailnet.

**Architecture:** Keep the existing React/Vite/Tailwind UI package and pure `CommandBoardViewModel`, but revise the visual system and component boundaries around the approved tactical console spec. The implementation progresses from design tokens, to view-model decision data, to shell components, to central command field, to decision rail, then removes old picker scaffolding and exposes a tailnet preview for review.

**Tech Stack:** React 19, React DOM, Vite 8, Tailwind CSS 4 with `@tailwindcss/vite`, Heroicons React Micro icons, Vitest, Testing Library, jsdom, TypeScript, existing Cestus PRR read-model fixtures.

---

## Inputs

- Approved redesign spec: `docs/superpowers/specs/2026-07-03-cestus-tactical-command-ui-redesign.md`
- Prior UI spec for historical context: `docs/superpowers/specs/2026-07-02-cestus-command-workspace-ui-design.md`
- Existing UI implementation: `packages/ui/src`
- Existing UI tests: `packages/ui/test`
- Repo contract: `AGENTS.md`
- Software factory model: `docs/agentic/software-factory.md`

## Required Skills For Workers

Use `$design` from `/home/drake/.agents/skills/design/SKILL.md` before Tasks 1, 3, 4, 5, and 6 because those tasks create or modify visual structure, Tailwind classes, responsive behavior, or interaction states.

Use `superpowers:test-driven-development` before each task that changes code. Each task writes or updates the failing test first, runs the targeted failing command, then implements the smallest passing change.

Do not use `$ideas` for this plan unless the user asks for another comparison round. The design direction has already been selected, so this plan removes old ui.sh picker branches and the picker script.

## Scope Boundary

This plan updates the Cestus home/Command workspace UI only. It does not build the full PRR request workspace, live mail adapters, Gmail integration, Himalaya integration, or ontology graph exploration.

## File Structure

- `index.html`: remove the old ui.sh picker script after the selected direction is implemented.
- `packages/ui/src/styles.css`: tactical design tokens, command canvas, scan layer helpers, reduced-motion handling.
- `packages/ui/src/App.tsx`: app composition and local state wiring.
- `packages/ui/src/workspace/command-types.ts`: UI view-model types, decision vote types, and rail model types.
- `packages/ui/src/workspace/command-model.ts`: pure transformation from PRR-like input into metrics, queue rows, tactical panels, and decision-rail data.
- `packages/ui/src/workspace/command-fixtures.ts`: local PRR/evidence fixtures that exercise stalling, deadline, fee, production, diagnostics, and evidence states.
- `packages/ui/src/workspace/workspace-nav.ts`: data-driven tactical module list.
- `packages/ui/src/workspace/OpsShell.tsx`: page grid, tactical background, mobile menu, and layout slots.
- `packages/ui/src/workspace/CommandBand.tsx`: top command band with workspace identity, mode, ledger/sync/deployment states, command search, and primary action.
- `packages/ui/src/workspace/ModuleRail.tsx`: compact tactical left rail and mobile nav list.
- `packages/ui/src/workspace/CommandDashboard.tsx`: central command field composition.
- `packages/ui/src/workspace/SignalStrip.tsx`: metric strip with tactical signal styling and container queries.
- `packages/ui/src/workspace/QueueFilters.tsx`: compact filter controls.
- `packages/ui/src/workspace/PriorityQueue.tsx`: selectable command queue rows.
- `packages/ui/src/workspace/TacticalPanel.tsx`: reusable secondary operation panels.
- `packages/ui/src/workspace/DecisionRail.tsx`: agent brief, selected item detail, decision vote model, provenance, and diagnostics hints.
- Delete after replacements are wired: `packages/ui/src/workspace/LeftRail.tsx`, `packages/ui/src/workspace/TopStatusBar.tsx`, `packages/ui/src/workspace/StatusStrip.tsx`, `packages/ui/src/workspace/RightContextRail.tsx`.
- `packages/ui/test/*.test.tsx` and `packages/ui/test/*.test.ts`: update focused tests for the new names and behavior.

## Factory Rules

Each task is one work order. A worker must:

1. Read `AGENTS.md`, this plan, and the approved redesign spec before editing.
2. Use a task-scoped branch or worktree.
3. Change only the files listed by the task.
4. Write the failing test first.
5. Run the targeted failing command and confirm the expected failure.
6. Implement the smallest passing change.
7. Run the targeted passing command.
8. Run `npm run verify`.
9. Commit only the task files.
10. Stop on visual overlap that cannot be resolved in two focused attempts, dependency failure, schema conflict, unavailable browser tooling, or any change that weakens append-only ledger semantics, provenance requirements, or projection rebuildability.

## Task 1: Add Tactical Design Tokens And Visual Contract

**Files:**
- Modify: `packages/ui/src/styles.css`
- Modify: `packages/ui/test/visual-contract.test.ts`

- [ ] **Step 1: Write the failing visual token test**

Update `packages/ui/test/visual-contract.test.ts` so the first test asserts the approved tactical token names and scan-layer helper:

```ts
it("defines tactical command console design tokens", () => {
  const css = readFileSync("packages/ui/src/styles.css", "utf8");

  for (const token of [
    "--command-black",
    "--console-void",
    "--signal-red",
    "--signal-orange",
    "--signal-amber",
    "--signal-green",
    "--signal-cyan",
    "--paper-light",
    "--muted-amber"
  ]) {
    expect(css).toContain(token);
  }

  expect(css).toContain(".cestus-scan-layer");
  expect(css).toContain("@media (prefers-reduced-motion: reduce)");
});
```

- [ ] **Step 2: Run the visual contract test to verify it fails**

Run:

```bash
npm test -- packages/ui/test/visual-contract.test.ts
```

Expected:

```text
FAIL packages/ui/test/visual-contract.test.ts
AssertionError: expected CSS text to contain '--command-black'
```

- [ ] **Step 3: Implement tactical tokens and scan helpers**

Modify `packages/ui/src/styles.css` with this structure. Keep transitional `--cestus-*` aliases in this task so existing components keep rendering until later tasks replace their usages:

```css
@import "@fontsource-variable/inter";
@import "tailwindcss";

:root {
  color-scheme: dark;
  --command-black: #080302;
  --console-void: #120504;
  --console-panel: #190806;
  --console-panel-raised: #220d08;
  --console-line: rgba(255, 179, 56, 0.18);
  --console-line-strong: rgba(255, 86, 56, 0.48);
  --signal-red: #ff5638;
  --signal-orange: #d93620;
  --signal-amber: #ffb338;
  --signal-green: #70f0a7;
  --signal-cyan: #4ea2ff;
  --paper-light: #f8ead0;
  --muted-amber: #c9a46d;
  --console-ink: #090302;

  --cestus-bg: var(--command-black);
  --cestus-panel: var(--console-panel);
  --cestus-panel-raised: var(--console-panel-raised);
  --cestus-line: var(--console-line);
  --cestus-muted: var(--muted-amber);
  --cestus-muted-strong: #dec18d;
  --cestus-muted-soft: #f0d5a3;
  --cestus-text: var(--paper-light);
  --cestus-ink: var(--console-ink);
  --cestus-amber: var(--signal-amber);
  --cestus-red: var(--signal-red);
  --cestus-green: var(--signal-green);
  --cestus-cyan: var(--signal-cyan);

  background: var(--command-black);
  color: var(--paper-light);
  font-family:
    InterVariable, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
    sans-serif;
  font-feature-settings:
    "cv02" 1,
    "cv03" 1,
    "cv04" 1,
    "cv11" 1,
    "ss01" 1,
    "ss03" 1;
}

* {
  box-sizing: border-box;
}

body {
  min-width: 320px;
  margin: 0;
  background: var(--command-black);
}

button,
input {
  font: inherit;
}

.cestus-scan-layer {
  background:
    linear-gradient(rgba(255, 179, 56, 0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 179, 56, 0.045) 1px, transparent 1px),
    radial-gradient(circle at 58% 38%, rgba(112, 240, 167, 0.11) 0 1px, transparent 2px),
    radial-gradient(circle at 58% 38%, transparent 0 5rem, rgba(78, 162, 255, 0.09) 5.05rem 5.12rem, transparent 5.2rem),
    radial-gradient(circle at 58% 38%, transparent 0 10rem, rgba(78, 162, 255, 0.07) 10.05rem 10.12rem, transparent 10.2rem);
  background-size: 34px 34px, 34px 34px, auto, auto, auto;
}

@media (prefers-reduced-motion: reduce) {
  *,
  ::before,
  ::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 4: Run the targeted test to verify it passes**

Run:

```bash
npm test -- packages/ui/test/visual-contract.test.ts
```

Expected:

```text
Test Files  1 passed
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

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/styles.css packages/ui/test/visual-contract.test.ts
git commit -m "style: add tactical command design tokens"
```

## Task 2: Extend The Command View Model With Decision Votes

**Files:**
- Modify: `packages/ui/src/workspace/command-types.ts`
- Modify: `packages/ui/src/workspace/command-model.ts`
- Modify: `packages/ui/src/workspace/command-fixtures.ts`
- Modify: `packages/ui/test/command-model.test.ts`

- [ ] **Step 1: Write the failing decision-model tests**

Append these assertions to `packages/ui/test/command-model.test.ts`:

```ts
it("adds decision votes to the default rail and selected queue details", () => {
  const model = buildCommandBoardViewModel(commandWorkspaceFixture);
  const stalled = getSelectedCommandItem(model, "signal:prr_req_airport_022");

  expect(model.decisionRail.defaultVotes.map((vote) => [vote.id, vote.state])).toStrictEqual([
    ["legal-risk", "review"],
    ["factual-confidence", "watch"],
    ["cost-pressure", "review"]
  ]);

  expect(stalled?.detail.decisionVotes.map((vote) => [vote.id, vote.state])).toStrictEqual([
    ["legal-risk", "human-decision-required"],
    ["factual-confidence", "review"],
    ["cost-pressure", "watch"]
  ]);
  expect(stalled?.detail.provenanceRefs).toContain("prr_req_airport_022");
});
```

- [ ] **Step 2: Run the model test to verify it fails**

Run:

```bash
npm test -- packages/ui/test/command-model.test.ts
```

Expected:

```text
FAIL packages/ui/test/command-model.test.ts
Property 'decisionRail' does not exist
```

- [ ] **Step 3: Add decision types**

Add these types to `packages/ui/src/workspace/command-types.ts`:

```ts
export type DecisionVoteId = "legal-risk" | "factual-confidence" | "cost-pressure";
export type DecisionVoteState = "go" | "review" | "watch" | "blocked" | "needs-evidence" | "human-decision-required";

export interface DecisionVote {
  readonly id: DecisionVoteId;
  readonly label: string;
  readonly state: DecisionVoteState;
  readonly tone: MetricTone;
  readonly summary: string;
}

export interface DecisionRailModel {
  readonly modeLabel: string;
  readonly defaultVotes: readonly DecisionVote[];
}
```

Update `CommandItemDetail` and `CommandBoardViewModel`:

```ts
export interface CommandItemDetail {
  readonly summary: string;
  readonly basis: string;
  readonly recommendedAction: string;
  readonly provenanceRefs: readonly string[];
  readonly decisionVotes: readonly DecisionVote[];
}

export interface CommandBoardViewModel {
  readonly statusMetrics: readonly StatusMetric[];
  readonly queueItems: readonly CommandQueueItem[];
  readonly tacticalPanels: readonly TacticalPanelModel[];
  readonly agentBrief: AgentBrief;
  readonly decisionRail: DecisionRailModel;
}
```

- [ ] **Step 4: Build decision votes in the model**

In `packages/ui/src/workspace/command-model.ts`, import `DecisionVote` and add helper functions with these exact return shapes:

```ts
function buildDefaultDecisionVotes(input: CommandBoardInput): readonly DecisionVote[] {
  const hasConfirmedStalling = input.requestRows.some((row) => row.confirmedStalling);
  const hasEvidence = input.evidenceAlerts.length > 0;
  const hasFeeOrDeadlinePressure = input.requestRows.some(
    (row) => row.possibleStalling || row.deadlineDate !== undefined
  );

  return Object.freeze([
    Object.freeze({
      id: "legal-risk",
      label: "Legal risk",
      state: hasConfirmedStalling ? "review" : "watch",
      tone: hasConfirmedStalling ? "amber" : "cyan",
      summary: hasConfirmedStalling
        ? "Escalation language needs human review before sending."
        : "No legal threat is queued without human confirmation."
    }),
    Object.freeze({
      id: "factual-confidence",
      label: "Factual confidence",
      state: hasEvidence ? "watch" : "needs-evidence",
      tone: hasEvidence ? "cyan" : "amber",
      summary: hasEvidence ? "Evidence signals are present and awaiting classification." : "Evidence support is thin."
    }),
    Object.freeze({
      id: "cost-pressure",
      label: "Cost pressure",
      state: hasFeeOrDeadlinePressure ? "review" : "go",
      tone: hasFeeOrDeadlinePressure ? "amber" : "green",
      summary: hasFeeOrDeadlinePressure
        ? "Fee and deadline posture should be checked before the next send."
        : "No cost-pressure signal is active."
    })
  ]);
}

function votesForQueueItem(item: Omit<CommandQueueItem, "reviewed">): readonly DecisionVote[] {
  if (item.kind === "signal" && item.severity === "critical") {
    return Object.freeze([
      vote("legal-risk", "Legal risk", "human-decision-required", "red", "Threatening legal action requires human confirmation."),
      vote("factual-confidence", "Factual confidence", "review", "amber", "Review the stalling basis and correspondence chain."),
      vote("cost-pressure", "Cost pressure", "watch", "amber", "Cost pressure may rise if scope is not narrowed.")
    ]);
  }

  if (item.kind === "diagnostic") {
    return Object.freeze([
      vote("legal-risk", "Legal risk", "blocked", "amber", "Legal posture is blocked until the diagnostic is repaired."),
      vote("factual-confidence", "Factual confidence", "needs-evidence", "red", "Projection state needs repair before claims are trusted."),
      vote("cost-pressure", "Cost pressure", "watch", "cyan", "Cost impact is unknown until the diagnostic is resolved.")
    ]);
  }

  return Object.freeze([
    vote("legal-risk", "Legal risk", "watch", "cyan", "No autonomous legal escalation is queued."),
    vote("factual-confidence", "Factual confidence", "review", "amber", "Evidence and provenance should be reviewed."),
    vote("cost-pressure", "Cost pressure", item.kind === "deadline" ? "review" : "watch", item.kind === "deadline" ? "amber" : "cyan", "Check whether narrowing can reduce cost or delay.")
  ]);
}

function vote(
  id: DecisionVote["id"],
  label: string,
  state: DecisionVote["state"],
  tone: DecisionVote["tone"],
  summary: string
): DecisionVote {
  return Object.freeze({ id, label, state, tone, summary });
}
```

When creating each queue item, set `detail.decisionVotes` after the item object is assembled:

```ts
const withVotes = (item: Omit<CommandQueueItem, "reviewed">): Omit<CommandQueueItem, "reviewed"> => ({
  ...item,
  detail: {
    ...item.detail,
    decisionVotes: votesForQueueItem(item)
  }
});
```

Use `withVotes(item)` for every request, diagnostic, and evidence item before the final freeze step.

Add this field to the returned model:

```ts
decisionRail: Object.freeze({
  modeLabel: "Advisory decision model",
  defaultVotes: buildDefaultDecisionVotes(input)
})
```

Update `freezeQueueItem` so `decisionVotes` are frozen:

```ts
decisionVotes: Object.freeze([...item.detail.decisionVotes])
```

- [ ] **Step 5: Enrich fixture data**

In `packages/ui/src/workspace/command-fixtures.ts`, ensure the fixture includes one confirmed stalling item, one possible stalling item, and one evidence alert as already present. Add one diagnostic fixture so diagnostic decision votes are exercised:

```ts
diagnostics: Object.freeze([
  {
    diagnosticId: "diag_projection_gap_001",
    prrRequestId: "prr_req_airport_022",
    category: "projection",
    message: "Projection lag detected for accepted request event",
    repairHint: {
      violatedPath: "prr.projection.highWaterMark",
      allowedActions: Object.freeze(["Replay PRR projection from the append-only ledger"])
    }
  }
]),
```

- [ ] **Step 6: Run the targeted model test**

Run:

```bash
npm test -- packages/ui/test/command-model.test.ts
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

```bash
git add packages/ui/src/workspace/command-types.ts packages/ui/src/workspace/command-model.ts packages/ui/src/workspace/command-fixtures.ts packages/ui/test/command-model.test.ts
git commit -m "feat: add command decision vote model"
```

## Task 3: Rebuild The Tactical Shell

**Files:**
- Create: `packages/ui/src/workspace/CommandBand.tsx`
- Create: `packages/ui/src/workspace/ModuleRail.tsx`
- Modify: `packages/ui/src/workspace/OpsShell.tsx`
- Modify: `packages/ui/src/App.tsx`
- Modify: `packages/ui/src/workspace/workspace-nav.ts`
- Modify: `packages/ui/test/shell.test.tsx`
- Modify: `packages/ui/test/visual-contract.test.ts`
- Delete: `packages/ui/src/workspace/LeftRail.tsx`
- Delete: `packages/ui/src/workspace/TopStatusBar.tsx`

- [ ] **Step 1: Write the failing shell test**

Replace the render props in `packages/ui/test/shell.test.tsx` with the new shell contract:

```tsx
render(
  <OpsShell
    modules={workspaceModules}
    activeModuleId="command"
    workspaceName="Cestus Local"
    modeLabel="Command"
    ledgerLabel="Ledger synced"
    syncLabel="Local sync live"
    deploymentLabel="Solo laptop"
    onNewRequest={vi.fn()}
    main={<h1>Command</h1>}
    decisionRail={<aside aria-label="Decision rail">Agent brief</aside>}
  />
);

expect(screen.getByRole("navigation", { name: "Cestus tactical modules" })).toBeInTheDocument();
expect(screen.getByRole("banner", { name: "Cestus command band" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: "New request" })).toBeInTheDocument();
expect(screen.getByRole("searchbox", { name: "Command search" })).toBeInTheDocument();
expect(screen.getByText("Ledger synced")).toBeInTheDocument();
expect(screen.getByText("Solo laptop")).toBeInTheDocument();
expect(screen.getByText("Command")).toBeInTheDocument();
expect(screen.getByRole("link", { name: "Command" })).toHaveAttribute("aria-current", "page");
expect(screen.getByRole("link", { name: "Agents Preview" })).toHaveAttribute("aria-disabled", "true");
```

- [ ] **Step 2: Run the shell test to verify it fails**

Run:

```bash
npm test -- packages/ui/test/shell.test.tsx
```

Expected:

```text
FAIL packages/ui/test/shell.test.tsx
Property 'modeLabel' does not exist
```

- [ ] **Step 3: Create `CommandBand.tsx`**

Create `packages/ui/src/workspace/CommandBand.tsx` with this component shape:

```tsx
import { Bars3Icon, PlusIcon } from "@heroicons/react/16/solid";

interface CommandBandProps {
  readonly workspaceName: string;
  readonly modeLabel: string;
  readonly ledgerLabel: string;
  readonly syncLabel: string;
  readonly deploymentLabel: string;
  readonly onOpenMenu: () => void;
  readonly onNewRequest: () => void;
}

export function CommandBand({
  workspaceName,
  modeLabel,
  ledgerLabel,
  syncLabel,
  deploymentLabel,
  onOpenMenu,
  onNewRequest
}: CommandBandProps) {
  const signals = [
    { label: "Ledger", value: ledgerLabel, className: "text-[var(--signal-green)]" },
    { label: "Sync", value: syncLabel, className: "text-[var(--signal-cyan)]" },
    { label: "Mode", value: deploymentLabel, className: "text-[var(--signal-amber)]" }
  ];

  return (
    <header
      aria-label="Cestus command band"
      className="border-b border-[var(--console-line-strong)] bg-[var(--console-void)]"
    >
      <div className="grid gap-3 px-4 py-3 lg:grid-cols-[auto_minmax(16rem,1fr)_auto] lg:items-center lg:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            aria-label="Open module menu"
            onClick={onOpenMenu}
            className="relative flex min-h-10 items-center border border-[var(--console-line)] px-2 py-2 text-base sm:min-h-9 sm:text-sm lg:hidden"
          >
            <span aria-hidden="true" className="pointer-fine:hidden absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2" />
            <Bars3Icon aria-hidden="true" className="size-4 shrink-0 fill-[var(--paper-light)]" />
          </button>
          <a href="/" aria-label="Homepage" className="shrink-0 font-mono text-base text-[var(--signal-red)] sm:text-sm">
            CESTUS
          </a>
          <div className="min-w-0 border-l border-[var(--console-line)] pl-3">
            <p className="truncate font-mono text-base text-[var(--signal-amber)] sm:text-sm">{modeLabel}</p>
            <p className="truncate text-base text-[var(--paper-light)] sm:text-sm">{workspaceName}</p>
          </div>
        </div>
        <label className="min-w-0">
          <span className="sr-only">Command search</span>
          <input
            name="command-search"
            type="search"
            aria-label="Command search"
            placeholder="Search requests, evidence, agencies, and assertions"
            className="min-h-11 w-full border border-[var(--console-line)] bg-[var(--command-black)] px-3 py-2 font-mono text-base text-[var(--paper-light)] outline-none placeholder:text-[var(--muted-amber)] focus-visible:-outline-offset-1 focus-visible:outline-2 focus-visible:outline-[var(--signal-cyan)] sm:min-h-9 sm:text-sm"
          />
        </label>
        <div className="flex min-w-0 flex-wrap items-center gap-2 lg:justify-end">
          {signals.map((signal) => (
            <div key={signal.label} className="border border-[var(--console-line)] px-2 py-1 font-mono text-base sm:text-sm">
              <span className="text-[var(--muted-amber)]">{signal.label}: </span>
              <span className={signal.className}>{signal.value}</span>
            </div>
          ))}
          <button
            type="button"
            onClick={onNewRequest}
            className="relative flex min-h-10 items-center gap-2 border border-[var(--signal-orange)] bg-[var(--signal-orange)] py-2 pl-2 pr-3 text-base font-semibold text-[var(--console-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--signal-cyan)] sm:min-h-9 sm:text-sm"
          >
            <span aria-hidden="true" className="pointer-fine:hidden absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2" />
            <PlusIcon aria-hidden="true" className="size-4 shrink-0 fill-[var(--console-ink)]" />
            New request
          </button>
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Create `ModuleRail.tsx`**

Create `packages/ui/src/workspace/ModuleRail.tsx` with an exported `ModuleLink` so the mobile menu can reuse it:

```tsx
import type { WorkspaceModule } from "./workspace-nav.js";

interface ModuleRailProps {
  readonly modules: readonly WorkspaceModule[];
  readonly activeModuleId: string;
}

export function ModuleRail({ modules, activeModuleId }: ModuleRailProps) {
  return (
    <nav aria-label="Cestus tactical modules" className="hidden border-r border-[var(--console-line)] bg-[var(--console-void)] lg:block">
      <div className="px-3 py-4">
        <a href="/" aria-label="Homepage" className="font-mono text-base text-[var(--signal-red)] sm:text-sm">
          CESTUS
        </a>
        <div className="mt-1 font-mono text-base text-[var(--muted-amber)] sm:text-sm">NEO</div>
      </div>
      <ul role="list" className="space-y-1 px-2">
        {modules.map((module) => (
          <li key={module.id}>
            <ModuleLink module={module} active={module.id === activeModuleId} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function ModuleLink({ module, active }: { readonly module: WorkspaceModule; readonly active: boolean }) {
  return (
    <a
      href={module.href}
      aria-current={active ? "page" : undefined}
      aria-disabled={module.preview ? "true" : undefined}
      className={[
        "group flex min-h-10 items-center justify-between gap-3 border px-3 py-2 font-mono text-base sm:min-h-9 sm:text-sm",
        active
          ? "border-[var(--signal-orange)] bg-[var(--signal-orange)]/12 text-[var(--paper-light)]"
          : "border-transparent text-[var(--muted-amber)] hover:border-[var(--console-line)] hover:bg-[var(--console-panel)] hover:text-[var(--paper-light)]"
      ].join(" ")}
    >
      <span className="truncate">{module.label}</span>
      {module.preview ? <span className="shrink-0 text-[var(--signal-amber)]">Preview</span> : null}
    </a>
  );
}
```

- [ ] **Step 5: Update `OpsShell.tsx`**

Change the `OpsShellProps` contract and imports:

```tsx
import { XMarkIcon } from "@heroicons/react/16/solid";
import { useState, type ReactNode } from "react";
import { CommandBand } from "./CommandBand.js";
import { ModuleLink, ModuleRail } from "./ModuleRail.js";
import type { WorkspaceModule } from "./workspace-nav.js";

interface OpsShellProps {
  readonly modules: readonly WorkspaceModule[];
  readonly activeModuleId: string;
  readonly workspaceName: string;
  readonly modeLabel: string;
  readonly ledgerLabel: string;
  readonly syncLabel: string;
  readonly deploymentLabel: string;
  readonly onNewRequest: () => void;
  readonly main: ReactNode;
  readonly decisionRail: ReactNode;
}
```

Render the shell as:

```tsx
<div className="isolate min-h-dvh bg-[var(--command-black)] text-[var(--paper-light)] antialiased">
  <div aria-hidden="true" className="cestus-scan-layer pointer-events-none fixed inset-0 opacity-80" />
  <div className="relative grid min-h-dvh lg:grid-cols-[12rem_minmax(0,1fr)_22rem]">
    <ModuleRail modules={modules} activeModuleId={activeModuleId} />
    <div className="min-w-0">
      <CommandBand
        workspaceName={workspaceName}
        modeLabel={modeLabel}
        ledgerLabel={ledgerLabel}
        syncLabel={syncLabel}
        deploymentLabel={deploymentLabel}
        onNewRequest={onNewRequest}
        onOpenMenu={() => setMobileMenuOpen(true)}
      />
      <main id="command" className="min-w-0 px-4 py-4 lg:px-5">
        {main}
      </main>
    </div>
    <div className="border-t border-[var(--console-line)] bg-[var(--console-void)]/82 lg:border-l lg:border-t-0">
      {decisionRail}
    </div>
  </div>
  {mobileMenuOpen ? mobileMenu : null}
</div>
```

The mobile menu must keep the `XMarkIcon`, use `ModuleLink`, and have a close button with `aria-label="Close module menu"`.

- [ ] **Step 6: Update `App.tsx` and navigation**

Update `App.tsx` to pass the new props:

```tsx
<OpsShell
  modules={workspaceModules}
  activeModuleId="command"
  workspaceName="Cestus Local"
  modeLabel="Command"
  ledgerLabel="Ledger synced"
  syncLabel="Local sync live"
  deploymentLabel="Solo laptop"
  onNewRequest={() => undefined}
  main={
    <CommandDashboard
      model={model}
      activeFilter={activeFilter}
      selectedItemId={selectedItemId}
      onFilterChange={setActiveFilter}
      onSelectItem={setSelectedItemId}
      onMarkReviewed={(itemId) => setReviewedItemIds((current) => [...new Set([...current, itemId])])}
    />
  }
  decisionRail={
    <DecisionRail
      agentBrief={model.agentBrief}
      defaultVotes={model.decisionRail.defaultVotes}
      selectedItem={selectedItem}
      onClearSelection={() => setSelectedItemId(undefined)}
    />
  }
/>
```

Update `workspace-nav.ts` so module labels are:

```ts
Command
Requests
Evidence
Ontology
Agents Preview
Ingestion Preview
Settings
```

- [ ] **Step 7: Update the visual contract file list**

In `packages/ui/test/visual-contract.test.ts`, replace old shell filenames with:

```ts
"packages/ui/src/workspace/OpsShell.tsx",
"packages/ui/src/workspace/CommandBand.tsx",
"packages/ui/src/workspace/ModuleRail.tsx",
```

- [ ] **Step 8: Delete replaced files**

Delete:

```text
packages/ui/src/workspace/LeftRail.tsx
packages/ui/src/workspace/TopStatusBar.tsx
```

- [ ] **Step 9: Run targeted tests**

Run:

```bash
npm test -- packages/ui/test/shell.test.tsx packages/ui/test/app-smoke.test.tsx packages/ui/test/visual-contract.test.ts
```

Expected:

```text
Test Files  3 passed
```

- [ ] **Step 10: Run full verification**

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

- [ ] **Step 11: Commit**

```bash
git add packages/ui/src/App.tsx packages/ui/src/workspace/OpsShell.tsx packages/ui/src/workspace/CommandBand.tsx packages/ui/src/workspace/ModuleRail.tsx packages/ui/src/workspace/workspace-nav.ts packages/ui/test/shell.test.tsx packages/ui/test/visual-contract.test.ts
git rm packages/ui/src/workspace/LeftRail.tsx packages/ui/src/workspace/TopStatusBar.tsx
git commit -m "feat: rebuild tactical command shell"
```

## Task 4: Rebuild The Central Tactical Field

**Files:**
- Create: `packages/ui/src/workspace/SignalStrip.tsx`
- Modify: `packages/ui/src/workspace/CommandDashboard.tsx`
- Modify: `packages/ui/src/workspace/PriorityQueue.tsx`
- Modify: `packages/ui/src/workspace/QueueFilters.tsx`
- Modify: `packages/ui/src/workspace/TacticalPanel.tsx`
- Modify: `packages/ui/test/dashboard.test.tsx`
- Modify: `packages/ui/test/visual-contract.test.ts`
- Delete: `packages/ui/src/workspace/StatusStrip.tsx`

- [ ] **Step 1: Write the failing dashboard test**

Update `packages/ui/test/dashboard.test.tsx` so the render test asserts tactical field naming and diagnostic visibility:

```tsx
expect(screen.getByRole("region", { name: "Central tactical field" })).toBeInTheDocument();
expect(screen.getByRole("region", { name: "Command signal strip" })).toBeInTheDocument();
expect(screen.getByRole("heading", { name: "Priority queue" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: "Signals" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: "Diagnostics" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: "Select Miami-Dade Aviation Department stalling signal" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: "Select Projection lag detected for accepted request event" })).toBeInTheDocument();
expect(screen.getByRole("region", { name: "Active investigations" })).toBeInTheDocument();
```

- [ ] **Step 2: Run the dashboard test to verify it fails**

Run:

```bash
npm test -- packages/ui/test/dashboard.test.tsx
```

Expected:

```text
FAIL packages/ui/test/dashboard.test.tsx
Unable to find an accessible element with the role "region" and name "Central tactical field"
```

- [ ] **Step 3: Create `SignalStrip.tsx`**

Create `packages/ui/src/workspace/SignalStrip.tsx`:

```tsx
import type { StatusMetric } from "./command-types.js";

interface SignalStripProps {
  readonly metrics: readonly StatusMetric[];
}

const toneClasses: Record<StatusMetric["tone"], string> = {
  amber: "text-[var(--signal-amber)]",
  red: "text-[var(--signal-red)]",
  green: "text-[var(--signal-green)]",
  cyan: "text-[var(--signal-cyan)]",
  neutral: "text-[var(--muted-amber)]"
};

export function SignalStrip({ metrics }: SignalStripProps) {
  return (
    <section aria-label="Command signal strip" className="@container border-y border-[var(--console-line-strong)]">
      <div className="grid @lg:grid-cols-5">
        {metrics.map((metric) => (
          <div
            key={metric.id}
            className="border-t border-[var(--console-line)] py-3 first:border-t-0 @lg:border-l @lg:border-t-0 @lg:px-4 @lg:first:border-l-0"
          >
            <div className={`font-mono text-2xl tabular-nums ${toneClasses[metric.tone]}`}>{metric.value}</div>
            <div className="truncate font-mono text-base text-[var(--muted-amber)] sm:text-sm">{metric.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Update `CommandDashboard.tsx`**

Import `SignalStrip` instead of `StatusStrip`. Wrap the dashboard in a region:

```tsx
<section aria-label="Central tactical field" className="space-y-5">
  <div className="border-b border-[var(--console-line)] pb-4">
    <p className="font-mono text-base text-[var(--signal-amber)] sm:text-sm">Public records operations</p>
    <h1 className="mt-1 text-2xl font-semibold text-balance text-[var(--paper-light)]">Command</h1>
  </div>
  <SignalStrip metrics={model.statusMetrics} />
  <section className="space-y-3" aria-labelledby="priority-queue-heading">
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <h2 id="priority-queue-heading" className="text-lg font-semibold text-balance text-[var(--paper-light)]">
        Priority queue
      </h2>
      <QueueFilters activeFilter={activeFilter} onFilterChange={onFilterChange} />
    </div>
    <PriorityQueue
      items={visibleItems}
      selectedItemId={selectedItemId}
      onSelectItem={onSelectItem}
      onMarkReviewed={onMarkReviewed}
    />
  </section>
  <div className="grid gap-3 xl:grid-cols-3">
    {model.tacticalPanels.map((panel) => (
      <TacticalPanel key={panel.id} panel={panel} />
    ))}
  </div>
</section>
```

- [ ] **Step 5: Update queue and panel styling**

In `PriorityQueue.tsx`, remove all `data-uidotsh-*` wrappers and unselected variants. Keep one queue implementation. Use these tone classes:

```ts
const severityClasses: Record<CommandQueueItem["severity"], string> = {
  critical: "border-[var(--signal-red)] text-[var(--signal-red)]",
  high: "border-[var(--signal-amber)] text-[var(--signal-amber)]",
  medium: "border-[var(--signal-cyan)] text-[var(--signal-cyan)]",
  low: "border-[var(--console-line)] text-[var(--muted-amber)]"
};
```

Each row must remain a `role="listitem"` with a selectable title button and a review button. Use only horizontal sibling separation inside row content.

In `QueueFilters.tsx`, keep the same labels and callback contract but change selected styles to signal outlines:

```ts
active
  ? "border-[var(--signal-orange)] bg-[var(--signal-orange)]/12 text-[var(--paper-light)]"
  : "border-[var(--console-line)] text-[var(--muted-amber)] hover:border-[var(--signal-amber)] hover:bg-[var(--console-panel)] hover:text-[var(--paper-light)]"
```

In `TacticalPanel.tsx`, render each panel as:

```tsx
<section aria-label={panel.title} className="border border-[var(--console-line)] bg-[var(--console-void)]/72 p-3">
```

- [ ] **Step 6: Update visual contract file list and delete `StatusStrip.tsx`**

Replace `StatusStrip.tsx` with `SignalStrip.tsx` in `packages/ui/test/visual-contract.test.ts`.

Delete:

```text
packages/ui/src/workspace/StatusStrip.tsx
```

- [ ] **Step 7: Run targeted tests**

Run:

```bash
npm test -- packages/ui/test/dashboard.test.tsx packages/ui/test/visual-contract.test.ts
```

Expected:

```text
Test Files  2 passed
```

- [ ] **Step 8: Run full verification**

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

- [ ] **Step 9: Commit**

```bash
git add packages/ui/src/workspace/CommandDashboard.tsx packages/ui/src/workspace/SignalStrip.tsx packages/ui/src/workspace/PriorityQueue.tsx packages/ui/src/workspace/QueueFilters.tsx packages/ui/src/workspace/TacticalPanel.tsx packages/ui/test/dashboard.test.tsx packages/ui/test/visual-contract.test.ts
git rm packages/ui/src/workspace/StatusStrip.tsx
git commit -m "feat: rebuild central tactical command field"
```

## Task 5: Replace The Right Rail With DecisionRail

**Files:**
- Create: `packages/ui/src/workspace/DecisionRail.tsx`
- Modify: `packages/ui/src/App.tsx`
- Modify: `packages/ui/test/right-rail.test.tsx`
- Modify: `packages/ui/test/visual-contract.test.ts`
- Delete: `packages/ui/src/workspace/RightContextRail.tsx`

- [ ] **Step 1: Write the failing decision rail tests**

Update `packages/ui/test/right-rail.test.tsx` to use the new complementary landmark:

```tsx
const rail = screen.getByRole("complementary", { name: "Decision rail" });
expect(within(rail).getByRole("heading", { name: "Agent brief" })).toBeInTheDocument();
expect(within(rail).getByText("Legal risk")).toBeInTheDocument();
expect(within(rail).getByText("Factual confidence")).toBeInTheDocument();
expect(within(rail).getByText("Cost pressure")).toBeInTheDocument();
```

Update the selection test:

```tsx
fireEvent.click(screen.getByRole("button", { name: "Select Miami-Dade Aviation Department stalling signal" }));

const rail = screen.getByRole("complementary", { name: "Decision rail" });
expect(within(rail).getByRole("heading", { name: "Miami-Dade Aviation Department stalling signal" })).toBeInTheDocument();
expect(within(rail).getByText("Human decision required")).toBeInTheDocument();
expect(within(rail).getAllByText("Prepare escalation").length).toBeGreaterThan(0);

fireEvent.click(within(rail).getByRole("button", { name: "Back to agent brief" }));
expect(within(rail).getByRole("heading", { name: "Agent brief" })).toBeInTheDocument();
```

- [ ] **Step 2: Run the right rail test to verify it fails**

Run:

```bash
npm test -- packages/ui/test/right-rail.test.tsx
```

Expected:

```text
FAIL packages/ui/test/right-rail.test.tsx
Unable to find an accessible element with the role "complementary" and name "Decision rail"
```

- [ ] **Step 3: Create `DecisionRail.tsx`**

Create `packages/ui/src/workspace/DecisionRail.tsx` with these props:

```tsx
import type { AgentBrief, CommandQueueItem, DecisionVote } from "./command-types.js";

interface DecisionRailProps {
  readonly agentBrief: AgentBrief;
  readonly defaultVotes: readonly DecisionVote[];
  readonly selectedItem: CommandQueueItem | undefined;
  readonly onClearSelection: () => void;
}
```

Render:

```tsx
<aside aria-label="Decision rail" className="h-full p-4 lg:p-5">
  {selectedItem === undefined ? (
    <AgentBriefView agentBrief={agentBrief} votes={defaultVotes} />
  ) : (
    <SelectedItemDetail selectedItem={selectedItem} onClearSelection={onClearSelection} />
  )}
</aside>
```

The default view must include:

```tsx
<p className="font-mono text-base text-[var(--signal-red)] sm:text-sm">Advisory model</p>
<h2 className="mt-2 text-lg font-semibold text-balance text-[var(--paper-light)]">Agent brief</h2>
<DecisionVotes votes={votes} />
```

The selected detail view must include:

```tsx
<button type="button" onClick={onClearSelection} className="relative min-h-9 text-base text-[var(--signal-cyan)] sm:text-sm">
  <span aria-hidden="true" className="pointer-fine:hidden absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2" />
  Back to agent brief
</button>
<p className="mt-4 font-mono text-base text-[var(--signal-amber)] sm:text-sm">{selectedItem.kind}</p>
<h2 className="mt-2 text-lg font-semibold text-balance text-[var(--paper-light)]">{selectedItem.title}</h2>
<DecisionVotes votes={selectedItem.detail.decisionVotes} />
```

Implement `formatVoteState`:

```ts
function formatVoteState(state: DecisionVote["state"]): string {
  return state.replaceAll("-", " ").replace(/^\w/, (letter) => letter.toUpperCase());
}
```

Render provenance in monospace and keep the detail labels: State, Basis, Recommended action, Provenance.

- [ ] **Step 4: Wire `DecisionRail` in `App.tsx`**

Replace the `RightContextRail` import with:

```ts
import { DecisionRail } from "./workspace/DecisionRail.js";
```

Pass:

```tsx
decisionRail={
  <DecisionRail
    agentBrief={model.agentBrief}
    defaultVotes={model.decisionRail.defaultVotes}
    selectedItem={selectedItem}
    onClearSelection={() => setSelectedItemId(undefined)}
  />
}
```

- [ ] **Step 5: Update visual contract and delete old rail**

Replace `RightContextRail.tsx` with `DecisionRail.tsx` in `packages/ui/test/visual-contract.test.ts`.

Delete:

```text
packages/ui/src/workspace/RightContextRail.tsx
```

- [ ] **Step 6: Run targeted tests**

Run:

```bash
npm test -- packages/ui/test/right-rail.test.tsx packages/ui/test/app-smoke.test.tsx packages/ui/test/visual-contract.test.ts
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

```bash
git add packages/ui/src/App.tsx packages/ui/src/workspace/DecisionRail.tsx packages/ui/test/right-rail.test.tsx packages/ui/test/visual-contract.test.ts
git rm packages/ui/src/workspace/RightContextRail.tsx
git commit -m "feat: add tactical decision rail"
```

## Task 6: Remove Picker Artifacts And Harden Visual Contracts

**Files:**
- Modify: `index.html`
- Modify: `packages/ui/test/ui-picker.test.tsx`
- Modify: `packages/ui/test/visual-contract.test.ts`

- [ ] **Step 1: Rewrite picker test as a cleanup test**

Replace `packages/ui/test/ui-picker.test.tsx` with:

```tsx
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sourceFiles = [
  "index.html",
  "packages/ui/src/workspace/CommandDashboard.tsx",
  "packages/ui/src/workspace/SignalStrip.tsx",
  "packages/ui/src/workspace/PriorityQueue.tsx",
  "packages/ui/src/workspace/DecisionRail.tsx"
];

describe("ui picker cleanup", () => {
  it("removes old comparison scaffolding after the tactical direction is approved", () => {
    const source = sourceFiles.map((file) => readFileSync(file, "utf8")).join("\n");

    expect(source).not.toContain("ui-picker.js");
    expect(source).not.toContain("data-uidotsh-pick");
    expect(source).not.toContain("data-uidotsh-option");
  });
});
```

- [ ] **Step 2: Run the picker cleanup test to verify it fails**

Run:

```bash
npm test -- packages/ui/test/ui-picker.test.tsx
```

Expected:

```text
FAIL packages/ui/test/ui-picker.test.tsx
expected combined source text not to contain "ui-picker.js"
```

- [ ] **Step 3: Remove picker script from `index.html`**

Remove this line:

```html
<script src="https://ui.sh/ui-picker.js"></script>
```

- [ ] **Step 4: Harden visual contracts**

In `packages/ui/test/visual-contract.test.ts`, update `uiTsxFiles` to the final component list:

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
  "packages/ui/src/workspace/DecisionRail.tsx"
];
```

Add these assertions to the existing copy and utility test:

```ts
expect(joined).not.toContain("data-uidotsh-pick");
expect(joined).not.toContain("data-uidotsh-option");
expect(joined).not.toMatch(/var\(--cestus-/);
expect(joined).toContain("var(--signal-orange)");
expect(joined).toContain("var(--signal-red)");
expect(joined).toContain("var(--console-line)");
```

- [ ] **Step 5: Replace remaining `--cestus-*` references**

Update final TSX files to use only:

```text
--command-black
--console-void
--console-panel
--console-line
--console-line-strong
--signal-red
--signal-orange
--signal-amber
--signal-green
--signal-cyan
--paper-light
--muted-amber
--console-ink
```

Keep the transitional CSS aliases in `styles.css` until the next broad CSS cleanup plan. The TSX contract must use only tactical token names.

- [ ] **Step 6: Run targeted cleanup tests**

Run:

```bash
npm test -- packages/ui/test/ui-picker.test.tsx packages/ui/test/visual-contract.test.ts
```

Expected:

```text
Test Files  2 passed
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

```bash
git add index.html packages/ui/test/ui-picker.test.tsx packages/ui/test/visual-contract.test.ts packages/ui/src/App.tsx packages/ui/src/workspace/OpsShell.tsx packages/ui/src/workspace/CommandBand.tsx packages/ui/src/workspace/ModuleRail.tsx packages/ui/src/workspace/CommandDashboard.tsx packages/ui/src/workspace/SignalStrip.tsx packages/ui/src/workspace/QueueFilters.tsx packages/ui/src/workspace/PriorityQueue.tsx packages/ui/src/workspace/TacticalPanel.tsx packages/ui/src/workspace/DecisionRail.tsx
git commit -m "test: harden tactical ui visual contracts"
```

## Task 7: Tailnet Preview And Human Visual Review Gate

**Files:**
- No source file changes unless the user requests a visual adjustment after reviewing the preview.

- [ ] **Step 1: Run full verification**

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

- [ ] **Step 2: Start the Vite dev server on the tailnet**

Run:

```bash
npm run dev -- --host 0.0.0.0 --port 5174
```

Expected output includes:

```text
Local:   http://localhost:5174/
Network: http://100.126.143.105:5174/
```

If port `5174` is in use, use the next available port and record it in the handoff.

- [ ] **Step 3: Verify tailnet reachability**

Run:

```bash
curl -sS -I --max-time 10 http://100.126.143.105:5174/ | sed -n '1,8p'
```

Expected:

```text
HTTP/1.1 200 OK
Content-Type: text/html
```

Also check MagicDNS:

```bash
curl -sS -I --max-time 10 http://omarchy-mbp.tail7e7910.ts.net:5174/ | sed -n '1,8p'
```

Expected:

```text
HTTP/1.1 200 OK
Content-Type: text/html
```

- [ ] **Step 4: Ask for user visual review**

Report both URLs:

```text
http://omarchy-mbp.tail7e7910.ts.net:5174/
http://100.126.143.105:5174/
```

Ask the user to review the always-on tactical console before merge or cleanup decisions.

## User Review Gate

Stop after Task 7. Do not merge or mark the UI redesign complete until the user reviews the tailnet preview.

If the user requests visual changes after reviewing the preview, create a new focused task or plan section with exact files, a failing test or visual contract assertion, targeted verification, full verification, and a separate commit. Keep that follow-up scoped to the user's concrete feedback.

## Final Readiness Checklist

Before presenting the branch as complete, confirm:

- `npm run verify` passes.
- The dev server is reachable on the tailnet.
- The UI no longer exposes old ui.sh picker branches.
- The first viewport reads as an always-on tactical Cestus command console.
- The priority queue, filters, selected detail, mobile menu, and decision rail are usable with keyboard and pointer input.
- No UI copy contains protected NGE names, organization names, or exact iconography.
- The implementation keeps PRR and ontology semantics as view-model data only; no UI action appends ledger events in this slice.
