# Resident Agent Cockpit Task Run Interface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Build the minimally viable resident-agent cockpit where an investigator can give Cestus Agent a task, understand task and run state, inspect audit material, review approvals, and see what the agent needs next without moving domain execution into React.

**Architecture:** Add a browser-safe `agent-cockpit.v1` DTO in `packages/agent` that composes existing status, approval cockpit, run, model invocation, context pack, memory, and provider-readiness state into an operational workspace model. Expose read state and narrow safe action routes through local runtime, then render dense cockpit components in the Agent workspace. Task creation and safe run start append agent events through runtime routes only; scheduler wake is displayed only when an upstream scheduler route is present, and no UI path executes risky domain effects.

**Tech Stack:** TypeScript, Zod, Vitest, React, Testing Library, existing `packages/agent` projections/runtime DTOs, existing approval cockpit DTOs/routes, local-runtime HTTP handler, and current `packages/ui/src/agent` adapter/component patterns.

## Global Constraints

- Use `docs/superpowers/specs/2026-07-07-cestus-resident-agent-design.md` and `docs/superpowers/specs/2026-07-07-resident-agent-execution-approval-design.md` as the design source.
- Preserve append-only ledger semantics, provenance requirements, projection rebuildability, human-approved PRR send gates, legal escalation locks, provider byte-transfer approvals, secret-safe credential references, evidence-first legacy bootstrap, and portable workspace compatibility.
- React may render browser-safe DTOs, create tasks through existing task routes, call safe run-start routes when present, navigate, refresh, and approve or deny through existing decision routes.
- React must not directly send PRRs, transfer provider bytes, export, clear legal locks, execute repairs, accept graph truth, import legacy material, stage legacy material, mutate portable storage truth, call provider adapters, or duplicate domain validation.
- Generic scheduler wake wiring is merge-after-scheduler. Do not create `POST /api/agent/scheduler/wake` in this plan unless the scheduler branch has already landed that exact contract.
- If generic run routes conflict with a scheduler branch, adapt to the landed scheduler contract before merging this branch.
- The Agent workspace should be dense and operational for investigators and newsroom users, not a marketing page or hero layout.
- Deterministic tests use fake/static DTOs and in-memory ledgers. Live provider behavior remains covered by existing explicit live smoke lanes and is not part of this UI slice.
- All browser DTO parsing and failure states must be secret-safe, including malformed runtime JSON, DTO keys, diagnostic values, provider labels, run summaries, context pack summaries, and memory snippets.

---

## Design Sufficiency Check

No new design spec is required before this plan. The resident-agent design already names Agent status, task history, tool requests, memory view, provider settings, specialist launchers, and runtime task/run surfaces. The execution/approval design already requires task lifecycle, run state, model invocation audit, context pack summaries, approval cockpit UX, resume history, and human handoff. Coordinator guidance narrows the MVP product shape to:

- `Give Cestus Agent a task` -> choose or derive run type -> choose scope -> show provider, readiness, and approval posture -> create task and start a safe run when the route exists.
- Show task queue, run detail, run steps, model invocation audit summaries, context pack summaries, memory snippets, pending approvals, blocked reasons, and final handoff artifacts.
- Answer what the resident is watching, what it is doing, what it needs from the human, what is blocked, what changed, and what evidence supports it.

The existing code already has `AgentStatusDto`, approval cockpit routes, task creation routes, runtime `startRun`, ontology-bootstrap specialist launch/read routes, model invocation audit projection fields, and read-only Agent workspace panels. The missing exact slice is a unified cockpit/task/run interface and browser adapter actions that hand work to the resident agent without turning the browser into an executor.

## File Structure

- Create `packages/agent/src/cockpit.ts`: `agent-cockpit.v1` DTO schemas and `buildAgentCockpit`.
- Create `packages/agent/test/cockpit.test.ts`: DTO projection, needs-next, run audit, handoff, and secret-safety tests.
- Modify `packages/agent/src/index.ts`: export the cockpit DTO surface.
- Modify `packages/local-runtime/src/agent-http-routes.ts`: expose `GET /api/agent/cockpit` and a narrow `POST /api/agent/runs` only if the scheduler branch has not provided a conflicting contract.
- Create `packages/local-runtime/test/agent-cockpit-routes.test.ts`: local route tests for cockpit read, safe task creation regression, safe run start, duplicate rejection, and no scheduler wake.
- Modify `packages/ui/src/agent/agent-types.ts`: export cockpit DTO and action result types.
- Modify `packages/ui/src/agent/agent-adapter.ts`: parse/load cockpit DTOs and call task/run routes.
- Create `packages/ui/test/agent-cockpit-adapter.test.ts`: adapter fetch, parsing, redaction, task creation, safe run start, and forbidden route tests.
- Create `packages/ui/src/agent/AgentTaskComposer.tsx`: task handoff form with run type and scope controls.
- Create `packages/ui/test/agent-task-composer.test.tsx`: form behavior, readiness posture, disabled states, and forbidden-button tests.
- Create `packages/ui/src/agent/AgentRunCockpit.tsx`: task queue, run detail, steps, model audit, context packs, memory snippets, blocked reasons, and handoff artifacts.
- Create `packages/ui/test/agent-run-cockpit.test.tsx`: dense run-state rendering and blocked/handoff behavior tests.
- Modify `packages/ui/src/agent/AgentWorkspace.tsx`: compose the task handoff, run cockpit, existing approval cockpit, providers, diagnostics, tool ledger, and memory.
- Modify `packages/ui/src/App.tsx`: load status, approval cockpit, ontology routes, and cockpit state; wire create task and run start callbacks.
- Modify `packages/ui/test/agent-workspace.test.tsx`: workspace integration expectations.
- Modify `packages/ui/test/agent-app-integration.test.tsx`: app-level task/run action wiring and no forbidden route calls.
- Modify `packages/ui/test/app-smoke.test.tsx`: keep Agent route smoke passing.
- Modify `packages/ui/test/command-model.test.ts`: keep Command agent brief decoupled from cockpit internals.
- Modify `docs/agentic/software-factory.md`: append readiness evidence after implementation.
- Modify this plan: check off completed tasks and record command evidence.
- Create task claim files:
  - `docs/agentic/claims/task-1-agent-cockpit-dto.md`
  - `docs/agentic/claims/task-2-agent-cockpit-routes.md`
  - `docs/agentic/claims/task-3-agent-cockpit-adapter.md`
  - `docs/agentic/claims/task-4-agent-task-composer.md`
  - `docs/agentic/claims/task-5-agent-run-cockpit.md`
  - `docs/agentic/claims/task-6-agent-cockpit-app-integration.md`
  - `docs/agentic/claims/task-7-agent-cockpit-readiness.md`

## Review Gates

- Gate A after Task 1: DTO review for browser safety, needs-next derivation, model audit coverage, handoff refs, and no hidden execution semantics.
- Gate B after Task 2: route review for append-only task/run events, local-runtime auth reuse, narrow route overlap, and no scheduler wake or domain execution.
- Gate C after Tasks 3 through 6: UI review for dense operational ergonomics, browser-safe parsing, disabled unsafe actions, and no forbidden buttons or route calls.
- Gate D after Task 7: factory readiness review before merge.

## Task 1: Agent Cockpit DTO Builder

**Files:**
- Create: `packages/agent/src/cockpit.ts`
- Create: `packages/agent/test/cockpit.test.ts`
- Modify: `packages/agent/src/index.ts`
- Create: `docs/agentic/claims/task-1-agent-cockpit-dto.md`

**Interfaces:**
- Consumes: `AgentStatusDto`, `AgentApprovalCockpitDto`, `ProjectedAgentRun`, `ProjectedAgentTask`, `ProjectedAgentModelInvocation`, `ProjectedAgentMemory`, and provider readiness fields already carried on status DTOs.
- Produces: `buildAgentCockpit(input: BuildAgentCockpitInput): AgentCockpitDto`.
- Produces: `agentCockpitDtoSchema` and `AgentCockpitDto` for local runtime and UI parsing.
- Produces: `AgentCockpitNeedDto`, `AgentCockpitRunCardDto`, `AgentCockpitTaskCardDto`, `AgentCockpitModelAuditDto`, `AgentCockpitContextPackDto`, `AgentCockpitMemorySnippetDto`, and `AgentCockpitHandoffDto`.

- [x] **Step 1: Claim the task**

Create `docs/agentic/claims/task-1-agent-cockpit-dto.md`:

```md
# Task 1 Claim: Agent Cockpit DTO

Plan: `docs/superpowers/plans/2026-07-09-resident-agent-cockpit-task-run-interface-implementation.md`
Task: Task 1: Agent Cockpit DTO Builder
Worker: <agent name>
Branch: `codex/resident-agent-cockpit-task-run-plan`
Worktree: `/home/drake/.codex/worktrees/50b6/Cestus`
Claimed-at: <UTC timestamp>
Status: claimed

Owned files:
- `packages/agent/src/cockpit.ts`
- `packages/agent/test/cockpit.test.ts`
- `packages/agent/src/index.ts`
- `docs/agentic/claims/task-1-agent-cockpit-dto.md`
```

Commit the claim:

```bash
git add docs/agentic/claims/task-1-agent-cockpit-dto.md
git commit -m "chore: claim agent cockpit dto task"
```

- [x] **Step 2: Mark claim in progress**

Change `Status: claimed` to `Status: in-progress`, then commit:

```bash
git add docs/agentic/claims/task-1-agent-cockpit-dto.md
git commit -m "chore: start agent cockpit dto task"
```

- [x] **Step 3: Write the failing DTO tests**

Create `packages/agent/test/cockpit.test.ts` with tests that assert these exact behaviors:

```ts
import { describe, expect, it } from "vitest";
import {
  agentCockpitDtoSchema,
  buildAgentCockpit
} from "../src/cockpit.js";
import type { AgentApprovalCockpitDto } from "../src/approval-cockpit.js";
import type { AgentStatusDto } from "../src/runtime-types.js";

describe("agent cockpit dto", () => {
  it("summarizes task queue, active run, approvals, and what the agent needs next", () => {
    const cockpit = buildAgentCockpit({
      status: statusFixture(),
      approvalCockpit: approvalCockpitFixture(),
      selectedRunId: "run_provider_review",
      generatedAt: "2026-07-09T12:00:00.000Z",
      mergeAfterScheduler: true
    });

    expect(agentCockpitDtoSchema.parse(cockpit)).toEqual(cockpit);
    expect(cockpit.schemaVersion).toBe("agent-cockpit.v1");
    expect(cockpit.summary).toMatchObject({
      activeTaskCount: 2,
      activeRunCount: 1,
      pendingApprovalCount: 1,
      activeLockCount: 1,
      mergeAfterScheduler: true
    });
    expect(cockpit.taskQueue.map((task) => task.taskId)).toEqual([
      "task_provider_review",
      "task_unstarted"
    ]);
    expect(cockpit.runQueue[0]).toMatchObject({
      runId: "run_provider_review",
      taskId: "task_provider_review",
      runType: "evidence-triage",
      state: "running",
      currentStepCount: 1,
      modelInvocationCount: 2,
      pendingApprovalCount: 1
    });
    expect(cockpit.selectedRun?.runId).toBe("run_provider_review");
    expect(cockpit.needsNext[0]).toMatchObject({
      kind: "approval",
      severity: "action-required",
      label: "Review provider byte-transfer approval",
      relatedRunId: "run_provider_review",
      relatedTaskId: "task_provider_review",
      safeAction: "review-approval"
    });
    expect(cockpit.needsNext).toContainEqual(expect.objectContaining({
      kind: "run-start",
      safeAction: "start-run",
      relatedTaskId: "task_unstarted"
    }));
    expect(cockpit.forbiddenDirectEffects).toContain("provider-byte-transfer");
    expect(JSON.stringify(cockpit)).not.toMatch(/raw-token|authorization|bearer|sk_live|password/i);
  });

  it("projects model invocation audit, context packs, memory snippets, and final handoff refs", () => {
    const cockpit = buildAgentCockpit({
      status: statusFixture({ completedRun: true }),
      generatedAt: "2026-07-09T12:05:00.000Z",
      selectedRunId: "run_report_done"
    });

    expect(cockpit.selectedRun?.modelInvocations).toContainEqual(expect.objectContaining({
      invocationId: "inv_report_done",
      providerId: "provider_fake",
      modelFamily: "fake-local",
      status: "completed",
      inputArtifactHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      outputArtifactHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      usageSummary: "12 input, 8 output, 20 total"
    }));
    expect(cockpit.selectedRun?.contextPacks).toContainEqual(expect.objectContaining({
      contextPackId: "task-run-history.v1",
      contentHash: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      safeSummary: "Prior agent task history."
    }));
    expect(cockpit.memorySnippets).toContainEqual(expect.objectContaining({
      memoryId: "mem_case_goal",
      scope: "investigation",
      summary: "Keep PRR drafts human-reviewed."
    }));
    expect(cockpit.selectedRun?.handoff).toMatchObject({
      state: "ready-for-human-review",
      summary: "Draft report outline produced.",
      artifactHashes: ["sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"]
    });
  });
});
```

The fixture helpers must build strict `AgentStatusDto` and `AgentApprovalCockpitDto` objects with only safe strings, active lock coverage, one pending approval, one task without a run, one running run with step IDs, one failed model invocation, one completed invocation with context pack refs, one completed run with output artifact hashes, and one active memory entry.

- [x] **Step 4: Run the targeted failing command**

Run:

```bash
npm test -- packages/agent/test/cockpit.test.ts
```

Expected before implementation:

```text
Failed to resolve import "../src/cockpit.js"
```

- [x] **Step 5: Implement the DTO builder**

Create `packages/agent/src/cockpit.ts` with:

- `schemaVersion = "agent-cockpit.v1"`.
- Zod schemas for every produced DTO.
- `buildAgentCockpit(input)` that sorts tasks by non-terminal status first, then `createdAt`.
- run cards that join `status.runs`, model invocations, tool requests, and tasks by IDs.
- selected run detail with step IDs, model invocation audit summaries, context pack summaries, pending approval IDs, blocked reasons, and handoff artifacts.
- `needsNext` derived in this priority order:
  1. pending approval from approval cockpit,
  2. active lock,
  3. failed retryable run or invocation,
  4. queued task without run,
  5. completed run with handoff artifacts,
  6. provider readiness action,
  7. quiet status.
- `forbiddenDirectEffects` containing provider byte transfer, PRR send/follow-up, export/publication, destructive repair, legal escalation, lock clearing, accepted graph review, legacy raw import, and legacy staging execution.

The DTO must reject unsafe text by reusing existing agent secret-safety helpers. It may summarize and reference hashes, event IDs, context pack IDs, provider IDs, model families, task IDs, run IDs, memory IDs, and safe status labels. It must not include raw prompt text, provider output text, raw errors, evidence bodies, credential values, environment variable names, or domain-service inputs.

Modify `packages/agent/src/index.ts`:

```ts
export * from "./cockpit.js";
```

- [x] **Step 6: Run targeted passing command**

Run:

```bash
npm test -- packages/agent/test/cockpit.test.ts packages/agent/test/approval-cockpit.test.ts packages/agent/test/projection.test.ts
```

Expected:

```text
Test Files  3 passed
```

- [x] **Step 7: Commit Task 1**

Update the claim with red/green command evidence and `Status: ready-for-review`, then commit:

```bash
git add packages/agent/src/cockpit.ts packages/agent/src/index.ts packages/agent/test/cockpit.test.ts docs/agentic/claims/task-1-agent-cockpit-dto.md
git commit -m "feat: add resident agent cockpit dto"
```

**Acceptance criteria:**

- `agent-cockpit.v1` parses through Zod.
- Cockpit answers what the agent is doing, needs, has blocked, and has changed.
- Model invocation audit summaries include safe provider/model/hash/context/usage fields only.
- Handoff artifacts are hashes and event refs only.
- No DTO field contains raw prompt text, provider output text, raw errors, evidence bodies, or secret-shaped material.

**Escalation conditions:**

- Escalate if a useful cockpit DTO requires raw evidence text, raw prompt text, provider output text, credential values, local filesystem secrets, or non-rebuildable state.

## Task 2: Local Runtime Cockpit And Safe Run Routes

**Files:**
- Modify: `packages/local-runtime/src/agent-http-routes.ts`
- Create: `packages/local-runtime/test/agent-cockpit-routes.test.ts`
- Modify: `packages/local-runtime/test/agent-http-routes.test.ts`
- Create: `docs/agentic/claims/task-2-agent-cockpit-routes.md`

**Interfaces:**
- Consumes: `buildAgentCockpit`, current `runtime.status()`, current `buildAgentApprovalCockpit`, existing `POST /api/agent/tasks`, and `runtime.startRun`.
- Produces: `GET /api/agent/cockpit`.
- Produces: `POST /api/agent/runs` only as a safe event-appending run-start route. If a scheduler branch has already landed a conflicting run route, adapt this task to the landed contract and keep this plan's acceptance criteria.

- [x] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-2-agent-cockpit-routes.md` with owned files listed above and `Status: claimed`, then change it to `in-progress` and commit the status update.

- [x] **Step 2: Write failing route tests**

Create `packages/local-runtime/test/agent-cockpit-routes.test.ts` with tests that prove:

- `GET /api/agent/cockpit` returns `agent-cockpit.v1`.
- `POST /api/agent/runs` starts a run by appending only `agent.specialist-run.started` and the task `running` status event.
- `POST /api/agent/runs` rejects missing tasks, duplicate run IDs, unsupported run types, unsafe IDs, and extra body keys.
- No request path calls scheduler wake, provider invocation, PRR send, provider byte transfer, export, legal escalation, repair, accepted graph review, legacy import, or legacy staging.

Use this test shape:

```ts
it("returns cockpit DTO from current runtime status and approval queue", async () => {
  const context = await routeContext();
  await seedIdentityAndTask(context);

  const response = await context.handler({
    method: "GET",
    url: "/api/agent/cockpit"
  });

  expect(response.status).toBe(200);
  const body = JSON.parse(response.body);
  expect(body.schemaVersion).toBe("agent-cockpit.v1");
  expect(body.taskQueue[0].taskId).toBe("task_route_review");
  expect(JSON.stringify(body)).not.toMatch(/raw-token|authorization|bearer|sk_live|password/i);
});

it("starts a safe specialist run without executing the specialist workflow", async () => {
  const context = await routeContext();
  await seedIdentityAndTask(context);

  const response = await context.handler({
    method: "POST",
    url: "/api/agent/runs",
    body: JSON.stringify({
      runId: "run_route_review",
      taskId: "task_route_review",
      runType: "evidence-triage",
      scope: { kind: "workspace", refs: ["ws_case_001"] },
      inputArtifactHashes: ["sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]
    })
  });

  expect(response.status).toBe(200);
  expect(JSON.parse(response.body)).toMatchObject({
    ok: true,
    schemaVersion: "agent-run-start-result.v1",
    runId: "run_route_review"
  });
  expect(await eventTypes(context)).toEqual([
    "agent.identity.initialized",
    "agent.task.created",
    "agent.task.status.changed",
    "agent.specialist-run.started",
    "agent.task.status.changed"
  ]);
});
```

- [x] **Step 3: Run targeted failing command**

Run:

```bash
npm test -- packages/local-runtime/test/agent-cockpit-routes.test.ts
```

Expected before implementation:

```text
expected 200 received 404
```

- [x] **Step 4: Implement read and safe run routes**

Modify `packages/local-runtime/src/agent-http-routes.ts`:

- Add `GET /api/agent/cockpit` after status and approval helpers are available.
- Build cockpit from `runtime.status()` and `buildAgentApprovalCockpit`.
- Add `POST /api/agent/runs` with body keys exactly `runId`, `taskId`, `runType`, `scope`, `sourceEventIds`, and `inputArtifactHashes`.
- Validate `runId` with `^run_[a-zA-Z0-9_-]+$`, `taskId` with `^task_[a-zA-Z0-9_-]+$`, approved run types with existing specialist vocabulary, and scope as `{ kind: "workspace" | "investigation", refs: string[] }`.
- Reject duplicate run IDs with HTTP 409.
- Reject missing tasks with HTTP 404 and a safe diagnostic.
- Call `runtime.startRun` only. Do not call execution loop, scheduler wake, ontology-bootstrap workflow, provider adapters, ingestion, PRR, governance, workspace ops, or ontology review services.
- Return:

```ts
{
  ok: true,
  schemaVersion: "agent-run-start-result.v1",
  runId,
  eventIds
}
```

If the scheduler branch has already provided a generic run-start route, preserve this route's tests by changing the path and adapter to the scheduler branch's accepted path rather than creating duplicate local-runtime contracts.

- [x] **Step 5: Run targeted passing command**

Run:

```bash
npm test -- packages/local-runtime/test/agent-cockpit-routes.test.ts packages/local-runtime/test/agent-http-routes.test.ts packages/agent/test/cockpit.test.ts
```

Expected:

```text
Test Files  3 passed
```

- [x] **Step 6: Commit Task 2**

Update the claim with red/green command evidence and `Status: ready-for-review`, then commit:

```bash
git add packages/local-runtime/src/agent-http-routes.ts packages/local-runtime/test/agent-cockpit-routes.test.ts packages/local-runtime/test/agent-http-routes.test.ts docs/agentic/claims/task-2-agent-cockpit-routes.md
git commit -m "feat: expose resident agent cockpit routes"
```

**Acceptance criteria:**

- Cockpit read route is browser-safe.
- Run-start route appends only agent run/task status events.
- Existing task route behavior remains intact.
- Scheduler wake remains absent unless provided by another landed branch.

**Escalation conditions:**

- Escalate on route contract conflict with the scheduler branch, schema conflict in run state vocabulary, or any need to call domain execution services from these routes.

## Task 3: Browser Adapter For Cockpit And Task Handoff

**Files:**
- Modify: `packages/ui/src/agent/agent-types.ts`
- Modify: `packages/ui/src/agent/agent-adapter.ts`
- Create: `packages/ui/test/agent-cockpit-adapter.test.ts`
- Modify: `packages/ui/test/agent-adapter.test.ts`
- Create: `docs/agentic/claims/task-3-agent-cockpit-adapter.md`

**Interfaces:**
- Consumes: `AgentCockpitDto`, `GET /api/agent/cockpit`, `POST /api/agent/tasks`, and safe run-start route from Task 2 or the landed scheduler branch.
- Produces: adapter methods `loadCockpit()`, `createTask(input)`, and `startRun(input)`.
- Produces: `CreateAgentTaskInput`, `StartAgentRunInput`, `AgentTaskCreateResultDto`, and `AgentRunStartResultDto` browser types.

- [x] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-3-agent-cockpit-adapter.md`, then mark it `in-progress` and commit.

- [x] **Step 2: Write failing adapter tests**

Create `packages/ui/test/agent-cockpit-adapter.test.ts` with tests that prove:

- `loadCockpit()` calls `/api/agent/cockpit` and parses `agent-cockpit.v1`.
- `createTask()` calls `/api/agent/tasks` with exactly task fields.
- `startRun()` calls the safe run-start route with exactly run fields.
- Malformed runtime values become safe adapter errors or rejected promises without echoing raw text.
- No adapter method calls scheduler wake, provider transfer, PRR send, export, repair, legal escalation, accepted graph review, legacy import, or staging paths.

Use fetch call assertions such as:

```ts
expect(fetchCalls.map((call) => call.path)).toEqual([
  "/api/agent/cockpit",
  "/api/agent/tasks",
  "/api/agent/runs"
]);
expect(fetchCalls.map((call) => call.path).join(" ")).not.toMatch(
  /scheduler\/wake|provider-transfer|prr|export|repair|legal|accepted-graph|legacy.*import|staging/i
);
```

- [x] **Step 3: Run targeted failing command**

Run:

```bash
npm test -- packages/ui/test/agent-cockpit-adapter.test.ts
```

Expected before implementation:

```text
Agent adapter does not expose loadCockpit
```

- [x] **Step 4: Extend UI types and adapter**

Modify `packages/ui/src/agent/agent-types.ts` to export the cockpit DTO types from `packages/agent/src/cockpit.js`.

Modify `packages/ui/src/agent/agent-adapter.ts`:

- Extend `AgentAdapter` with:

```ts
loadCockpit(): Promise<AgentCockpitDto>;
createTask(input: CreateAgentTaskInput): Promise<AgentTaskCreateResultDto>;
startRun(input: StartAgentRunInput): Promise<AgentRunStartResultDto>;
```

- Add strict Zod schemas matching `agent-cockpit.v1`, task create result, and run start result.
- Implement HTTP methods using existing `fetchAgentRoute`.
- Keep `createStaticAgentAdapter` returning frozen cockpit fixtures and throwing safe errors for mutation methods unless explicit test doubles override them.
- Redact URL paths in error messages with the existing redaction helper.

- [x] **Step 5: Run targeted passing command**

Run:

```bash
npm test -- packages/ui/test/agent-cockpit-adapter.test.ts packages/ui/test/agent-adapter.test.ts
```

Expected:

```text
Test Files  2 passed
```

- [x] **Step 6: Commit Task 3**

Update the claim with command evidence and `Status: ready-for-review`, then commit:

```bash
git add packages/ui/src/agent/agent-types.ts packages/ui/src/agent/agent-adapter.ts packages/ui/test/agent-cockpit-adapter.test.ts packages/ui/test/agent-adapter.test.ts docs/agentic/claims/task-3-agent-cockpit-adapter.md
git commit -m "feat: add agent cockpit browser adapter"
```

**Acceptance criteria:**

- Browser adapter parses cockpit DTOs without Node-only imports.
- Task and run methods call only agent runtime routes.
- Static adapter remains safe for tests and story-like fixtures.

## Task 4: Task Composer And Safe Handoff Controls

**Files:**
- Create: `packages/ui/src/agent/AgentTaskComposer.tsx`
- Create: `packages/ui/test/agent-task-composer.test.tsx`
- Modify: `packages/ui/src/agent/AgentWorkspace.tsx`
- Modify: `packages/ui/test/agent-workspace.test.tsx`
- Create: `docs/agentic/claims/task-4-agent-task-composer.md`

**Interfaces:**
- Consumes: `AgentCockpitDto`, `AgentStatusDto`, `CreateAgentTaskInput`, `StartAgentRunInput`, `createTask`, and `startRun` callbacks.
- Produces: a browser-only task handoff form that proposes safe task/run IDs, run type, scope, and scope refs.

- [x] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-4-agent-task-composer.md`, then mark it `in-progress` and commit.

- [x] **Step 2: Write failing component tests**

Create `packages/ui/test/agent-task-composer.test.tsx` with tests that prove:

- The form renders as `aria-label="Give Cestus Agent a task"`.
- Title input derives safe `task_` and `run_` IDs for preview.
- Run type uses identity allowed run types.
- Scope kind is a segmented or select control with workspace and investigation.
- Provider/readiness/approval posture is visible before submit.
- Create task button calls `onCreateTask`.
- Create and start run button calls `onCreateTask` then `onStartRun` only when run start is available and the selected run type is allowed.
- Start controls are disabled with a clear safe message when run start route is unavailable, active locks block handoff, or provider readiness is unavailable.
- No button label matches provider transfer, PRR send, export, repair, lock clearing, accepted graph, scheduler wake, import, or staging execution.

- [x] **Step 3: Run targeted failing command**

Run:

```bash
npm test -- packages/ui/test/agent-task-composer.test.tsx
```

Expected before implementation:

```text
Failed to resolve import "../src/agent/AgentTaskComposer.js"
```

- [x] **Step 4: Build task composer**

Create `AgentTaskComposer.tsx`:

- Use a compact fieldset layout with title, optional description, priority, run type, scope kind, and scope ref.
- Generate proposed IDs from safe title slugs and a timestamp/random suffix. The UI-generated IDs are proposals only; route validation remains authoritative.
- Show readiness posture from cockpit summary: provider count, active locks, pending approvals, and merge-after-scheduler note.
- Expose only:
  - `Create task`
  - `Create task and start run`
  - `Refresh`
- Disable `Create task and start run` when `onStartRun` is absent, selected run type is not allowed, active locks include data-loss or secret locks, or task title/scope refs are invalid.
- Render safe diagnostics from callback errors without raw runtime text.

Modify `AgentWorkspace.tsx` to render the composer above task/run state when cockpit DTO is present.

- [x] **Step 5: Run targeted passing command**

Run:

```bash
npm test -- packages/ui/test/agent-task-composer.test.tsx packages/ui/test/agent-workspace.test.tsx
```

Expected:

```text
Test Files  2 passed
```

- [x] **Step 6: Commit Task 4**

Update the claim with evidence and `Status: ready-for-review`, then commit:

```bash
git add packages/ui/src/agent/AgentTaskComposer.tsx packages/ui/src/agent/AgentWorkspace.tsx packages/ui/test/agent-task-composer.test.tsx packages/ui/test/agent-workspace.test.tsx docs/agentic/claims/task-4-agent-task-composer.md
git commit -m "feat: add resident agent task composer"
```

**Acceptance criteria:**

- The primary workflow starts with giving the resident agent a task.
- The UI can create a task and can start a safe run only through provided callbacks.
- The form makes readiness and approval posture visible before handoff.
- The UI does not render forbidden execution controls.

## Task 5: Run Cockpit Panels

**Files:**
- Create: `packages/ui/src/agent/AgentRunCockpit.tsx`
- Create: `packages/ui/test/agent-run-cockpit.test.tsx`
- Modify: `packages/ui/src/agent/AgentWorkspace.tsx`
- Modify: `packages/ui/test/agent-workspace.test.tsx`
- Modify: `packages/ui/test/agent-approval-cockpit.test.tsx`
- Create: `docs/agentic/claims/task-5-agent-run-cockpit.md`

**Interfaces:**
- Consumes: `AgentCockpitDto`.
- Produces: dense read-only cockpit panels for task queue, selected run detail, run steps, model invocation audit summaries, context pack summaries, memory snippets, pending approvals, blocked reasons, and final handoff artifacts.

- [x] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-5-agent-run-cockpit.md`, then mark it `in-progress` and commit.

- [x] **Step 2: Write failing run cockpit tests**

Create `packages/ui/test/agent-run-cockpit.test.tsx` with tests that prove:

- The component renders `aria-label="Agent run cockpit"`.
- It answers these labels with safe data: `Watching`, `Doing`, `Needs`, `Blocked`, `Changed`, `Evidence`.
- It renders task queue rows and selected run detail.
- It renders run step IDs and handoff artifact hashes.
- It renders model invocation summaries with provider/model/status/hash/usage and no prompt/output text.
- It renders context pack summaries with content hashes, omission counts, and staleness input counts.
- It renders memory snippets with source refs and confidence.
- It links pending approval IDs to the existing approval cockpit through text and callback-free refs.
- It never renders forbidden direct action buttons.

- [x] **Step 3: Run targeted failing command**

Run:

```bash
npm test -- packages/ui/test/agent-run-cockpit.test.tsx
```

Expected before implementation:

```text
Failed to resolve import "../src/agent/AgentRunCockpit.js"
```

- [x] **Step 4: Build run cockpit**

Create `AgentRunCockpit.tsx`:

- Use unframed dense sections and small repeated rows, not nested cards.
- Include tabs or segmented controls for `Queue`, `Run`, `Audit`, and `Handoff`.
- Keep all panels read-only.
- Do not import local-runtime, provider adapters, filesystem, SQLite, blob-store, workspace validation, ingestion, PRR, governance, or ontology services.
- Use stable widths and wrapping for hashes/IDs so mobile and desktop text does not overlap.
- Keep copy operational and compact.

Modify `AgentWorkspace.tsx` to render `AgentRunCockpit` near the top of the workspace and keep the existing approval cockpit visible for decisions.

- [x] **Step 5: Run targeted passing command**

Run:

```bash
npm test -- packages/ui/test/agent-run-cockpit.test.tsx packages/ui/test/agent-workspace.test.tsx packages/ui/test/agent-approval-cockpit.test.tsx
```

Expected:

```text
Test Files  3 passed
```

- [x] **Step 6: Commit Task 5**

Update the claim with evidence and `Status: ready-for-review`, then commit:

```bash
git add packages/ui/src/agent/AgentRunCockpit.tsx packages/ui/src/agent/AgentWorkspace.tsx packages/ui/test/agent-run-cockpit.test.tsx packages/ui/test/agent-workspace.test.tsx packages/ui/test/agent-approval-cockpit.test.tsx docs/agentic/claims/task-5-agent-run-cockpit.md
git commit -m "feat: add resident agent run cockpit"
```

**Acceptance criteria:**

- The cockpit shows task queue, run detail, run steps, model audit, context packs, memory snippets, pending approvals, blocked reasons, and final handoff artifacts.
- It answers what the resident is watching, doing, needs, has blocked, changed, and is using as evidence.
- It stays read-only except for callbacks already owned by composer or approval cockpit.

## Task 6: App Integration And Command Regression

**Files:**
- Modify: `packages/ui/src/App.tsx`
- Modify: `packages/ui/test/agent-app-integration.test.tsx`
- Modify: `packages/ui/test/app-smoke.test.tsx`
- Modify: `packages/ui/test/command-model.test.ts`
- Modify: `packages/ui/test/agent-workspace.test.tsx`
- Create: `docs/agentic/claims/task-6-agent-cockpit-app-integration.md`

**Interfaces:**
- Consumes: extended `AgentAdapter`, `AgentWorkspace`, `AgentTaskComposer`, `AgentRunCockpit`, and existing approval cockpit wiring.
- Produces: app-level load, refresh, create task, safe run start, approve, and deny behavior.

- [x] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-6-agent-cockpit-app-integration.md`, then mark it `in-progress` and commit.

- [x] **Step 2: Write failing app integration tests**

Modify `packages/ui/test/agent-app-integration.test.tsx` to prove:

- Opening the Agent module loads status, approval cockpit, cockpit DTO, and ontology bootstrap routes without blocking the page.
- Refresh reloads status, approval cockpit, and cockpit DTO.
- Create task calls only `agentAdapter.createTask`, then reloads cockpit and status.
- Start run calls only `agentAdapter.startRun`, then reloads cockpit and status.
- Approval decisions still call only approval decision methods and reload cockpit/status after success.
- If run start route is unavailable, the app shows a safe message and does not call forbidden routes.

- [x] **Step 3: Run targeted failing command**

Run:

```bash
npm test -- packages/ui/test/agent-app-integration.test.tsx
```

Expected before implementation:

```text
expected loadCockpit to have been called
```

- [x] **Step 4: Wire App state and callbacks**

Modify `App.tsx`:

- Add cockpit state beside existing `agentStatus` and `agentApprovalCockpit`.
- Load status, approval cockpit, cockpit, and ontology bootstrap routes when the Agent module is active.
- Refresh all agent state together.
- Add `handleCreateAgentTask` and `handleStartAgentRun` callbacks.
- After create/start success, reload status and cockpit exactly once.
- Keep approval handlers updating approval cockpit from decision result and reloading status/cockpit.
- Convert adapter errors to safe UI diagnostics.
- Do not call scheduler wake in this task.

Modify command and smoke tests only to preserve existing Agent brief behavior and route smoke.

- [x] **Step 5: Run targeted passing command**

Run:

```bash
npm test -- packages/ui/test/agent-app-integration.test.tsx packages/ui/test/app-smoke.test.tsx packages/ui/test/command-model.test.ts packages/ui/test/agent-workspace.test.tsx
```

Expected:

```text
Test Files  4 passed
```

- [x] **Step 6: Commit Task 6**

Update the claim with evidence and `Status: ready-for-review`, then commit:

```bash
git add packages/ui/src/App.tsx packages/ui/test/agent-app-integration.test.tsx packages/ui/test/app-smoke.test.tsx packages/ui/test/command-model.test.ts packages/ui/test/agent-workspace.test.tsx docs/agentic/claims/task-6-agent-cockpit-app-integration.md
git commit -m "feat: wire resident agent cockpit app flow"
```

**Acceptance criteria:**

- App-level Agent workspace can create tasks and start safe runs through adapter methods only.
- App-level approval behavior remains decision-only.
- Command agent brief does not import cockpit internals.
- No scheduler wake route is called unless a landed scheduler adapter explicitly provides it in a subsequent branch integration.

## Task 7: Verification And Readiness

**Files:**
- Modify: `docs/agentic/software-factory.md`
- Modify: `docs/superpowers/plans/2026-07-09-resident-agent-cockpit-task-run-interface-implementation.md`
- Create: `docs/agentic/claims/task-7-agent-cockpit-readiness.md`

**Interfaces:**
- Consumes: completed Tasks 1 through 6.
- Produces: factory readiness evidence and final review handoff.

- [x] **Step 1: Claim readiness task**

Create and commit `docs/agentic/claims/task-7-agent-cockpit-readiness.md`, then mark it `in-progress` and commit.

- [x] **Step 2: Run focused verification**

Run:

```bash
npm test -- packages/agent/test/cockpit.test.ts packages/agent/test/approval-cockpit.test.ts packages/local-runtime/test/agent-cockpit-routes.test.ts packages/local-runtime/test/agent-http-routes.test.ts packages/ui/test/agent-cockpit-adapter.test.ts packages/ui/test/agent-task-composer.test.tsx packages/ui/test/agent-run-cockpit.test.tsx packages/ui/test/agent-approval-cockpit.test.tsx packages/ui/test/agent-workspace.test.tsx packages/ui/test/agent-app-integration.test.tsx packages/ui/test/app-smoke.test.tsx packages/ui/test/command-model.test.ts
```

Expected:

```text
Test Files  12 passed
```

- [x] **Step 3: Run full verification**

Run:

```bash
npm run verify
```

Expected:

```text
typecheck passed
tests passed
vite build succeeded
factory-readiness passed
```

- [x] **Step 4: Run whitespace check**

Run:

```bash
git diff --check
```

Expected:

```text
no output
```

- [x] **Step 5: Record readiness**

Append a `Resident Agent Cockpit Task Run Interface Readiness` section to `docs/agentic/software-factory.md` with:

- required design and plan files;
- focused verification command and observed pass summary;
- `npm run verify` summary;
- `git diff --check` summary;
- statement that the UI creates tasks, starts safe runs only through runtime routes, refreshes, navigates, and approves/denies through decision routes;
- statement that no route or button directly sends PRRs, transfers provider bytes, exports, clears legal locks, executes repairs, accepts graph truth, imports legacy material, or stages legacy material;
- statement that scheduler wake remains merge-after-scheduler and route wiring must adapt to the landed scheduler branch if contracts overlap.

Check off completed tasks in this plan and record command evidence in the claim.

- [x] **Step 6: Commit readiness**

```bash
git add docs/agentic/software-factory.md docs/superpowers/plans/2026-07-09-resident-agent-cockpit-task-run-interface-implementation.md docs/agentic/claims/task-7-agent-cockpit-readiness.md
git commit -m "docs: record resident agent cockpit readiness"
```

**Acceptance criteria:**

- Focused verification passes.
- `npm run verify` passes.
- `git diff --check` passes.
- Readiness notes preserve merge-after-scheduler and forbidden-effect boundaries.

## Completion Criteria

The resident-agent cockpit/task/run interface slice is complete when:

- `agent-cockpit.v1` builds from current status, approval cockpit, model invocation audit, context pack, memory, provider readiness, and run state.
- Local runtime exposes cockpit read state and safe task/run handoff routes without domain execution.
- Browser adapter parses cockpit DTOs and calls only task, run-start, approval, deny, and refresh routes.
- The Agent workspace supports the primary workflow: give Cestus Agent a task, choose or derive run type, choose scope, show readiness/approval posture, create task, and start safe run when route support exists.
- The Agent workspace shows task queue, run detail, run steps, model invocation audit summaries, context pack summaries, memory snippets, pending approvals, blocked reasons, and final handoff artifacts.
- The cockpit answers what the resident is watching, what it is doing, what it needs from the human, what is blocked, what changed, and what evidence supports it.
- No UI control or local-runtime route directly sends PRRs, transfers provider bytes, exports, clears legal locks, executes repairs, accepts graph truth, imports legacy material, or stages legacy material.
- Scheduler wake remains separate unless the scheduler branch has landed the exact route contract and this branch has adapted to it.
- Focused verification, `npm run verify`, and `git diff --check` pass.
