# Resident Agent Cockpit Task Run Interface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Build the minimally viable resident-agent cockpit where an investigator can give Cestus Agent a task, understand task and run state, inspect audit material, review approvals, and see what the agent needs next without moving domain execution into React.

**Superseding correction after `neo` merge:** The implemented MVP is queue-only and read-only for generic specialist work. It creates local agent tasks, reads task/run audit state, reads canonical specialist readiness and handoffs, reviews approval decisions through existing approval routes, records memory through memory routes, and preserves the specialist-specific ontology-bootstrap route. It does not expose a generic run-start route, adapter method, app callback, or UI control.

**Final independent-review correction:** Context pack audit counts are explicit DTO fields, not inferred UI metrics: `omissionCount` comes from model invocation omissions and `stalenessInputCount` comes from context-pack staleness inputs. Specialist handoffs are displayed only when supplied as exact `agent-specialist-handoff.v1` DTOs bound to the selected run's `runId`, `runType`, and `taskId`; a durable production handoff source remains a future specialist-workflow blocker. Specialist readiness projects landed local scheduler/domain contracts and registered domain adapter families as available while keeping missing context, projection/provenance freshness, provider/template/approval/lock state, and `contradiction-claim-review` fail-closed.

**Architecture:** Add a browser-safe `agent-cockpit.v1` DTO in `packages/agent` that composes existing status, approval cockpit, run, model invocation, context pack, memory, canonical specialist registry/readiness/handoff, and provider-readiness state into an operational workspace model. Expose read state and queue-only task creation through local runtime, then render dense cockpit components in the Agent workspace. Scheduler wake is displayed or called only through the landed scheduler contract, and no UI path executes generic specialist workflows or risky domain effects.

**Tech Stack:** TypeScript, Zod, Vitest, React, Testing Library, existing `packages/agent` projections/runtime DTOs, existing approval cockpit DTOs/routes, local-runtime HTTP handler, and current `packages/ui/src/agent` adapter/component patterns.

## Global Constraints

- Use `docs/superpowers/specs/2026-07-07-cestus-resident-agent-design.md` and `docs/superpowers/specs/2026-07-07-resident-agent-execution-approval-design.md` as the design source.
- Preserve append-only ledger semantics, provenance requirements, projection rebuildability, human-approved PRR send gates, legal escalation locks, provider byte-transfer approvals, secret-safe credential references, evidence-first legacy bootstrap, and portable workspace compatibility.
- React may render browser-safe DTOs, create tasks through existing task routes, navigate, refresh, approve or deny through existing decision routes, record/correct/retract memory through memory routes, and call only landed specialist-specific routes such as ontology bootstrap.
- React must not directly send PRRs, transfer provider bytes, export, clear legal locks, execute repairs, accept graph truth, import legacy material, stage legacy material, mutate portable storage truth, call provider adapters, or duplicate domain validation.
- Generic scheduler wake wiring is merge-after-scheduler. Do not create `POST /api/agent/scheduler/wake` in this plan unless the scheduler branch has already landed that exact contract.
- Do not add or preserve a generic `POST /api/agent/runs` route. Scheduler integration must follow the landed scheduler contract, and generic specialist execution remains disabled until a future approved slice provides a real runner contract.
- The Agent workspace should be dense and operational for investigators and newsroom users, not a marketing page or hero layout.
- Deterministic tests use fake/static DTOs and in-memory ledgers. Live provider behavior remains covered by existing explicit live smoke lanes and is not part of this UI slice.
- All browser DTO parsing and failure states must be secret-safe, including malformed runtime JSON, DTO keys, diagnostic values, provider labels, run summaries, context pack summaries, and memory snippets.

---

## Design Sufficiency Check

No new design spec is required before this plan. The resident-agent design already names Agent status, task history, tool requests, memory view, provider settings, specialist launchers, and runtime task/run surfaces. The execution/approval design already requires task lifecycle, run state, model invocation audit, context pack summaries, approval cockpit UX, resume history, and human handoff. Coordinator guidance narrows the MVP product shape to:

- `Give Cestus Agent a task` -> enter the persisted task fields -> show provider, readiness, and approval posture in read-only cockpit panels -> queue the task through the task route.
- Show task queue, run detail, run steps, model invocation audit summaries, context pack summaries, memory snippets, pending approvals, blocked reasons, and final handoff artifacts.
- Answer what the resident is watching, what it is doing, what it needs from the human, what is blocked, what changed, and what evidence supports it.

The existing code already has `AgentStatusDto`, approval cockpit routes, task creation routes, scheduler wake, memory routes, ontology-bootstrap specialist launch/read routes, model invocation audit projection fields, and read-only Agent workspace panels. The missing exact slice is a unified cockpit/task/run interface and browser adapter actions that queue work for the resident agent without turning the browser into an executor or claiming generic specialist execution.

## File Structure

- Create `packages/agent/src/cockpit.ts`: `agent-cockpit.v1` DTO schemas and `buildAgentCockpit`.
- Create `packages/agent/test/cockpit.test.ts`: DTO projection, needs-next, run audit, handoff, and secret-safety tests.
- Modify `packages/agent/src/index.ts`: export the cockpit DTO surface.
- Modify `packages/local-runtime/src/agent-http-routes.ts`: expose `GET /api/agent/cockpit`, preserve `POST /api/agent/tasks`, preserve `POST /api/agent/scheduler/wake`, and keep generic `POST /api/agent/runs` absent.
- Create `packages/local-runtime/test/agent-cockpit-routes.test.ts`: local route tests for cockpit read, task creation regression, generic run-route absence, and no hidden scheduler/domain effects.
- Modify `packages/ui/src/agent/agent-types.ts`: export cockpit DTO and action result types.
- Modify `packages/ui/src/agent/agent-adapter.ts`: parse/load cockpit DTOs and call task, approval, memory, scheduler, and ontology-bootstrap routes without a generic run-start method.
- Create `packages/ui/test/agent-cockpit-adapter.test.ts`: adapter fetch, parsing, redaction, task creation, generic run-start absence, and forbidden route tests.
- Create `packages/ui/src/agent/AgentTaskComposer.tsx`: queue-only task form with only the fields persisted by the task route.
- Create `packages/ui/test/agent-task-composer.test.tsx`: form behavior, exact queued payload coverage, posture display, and forbidden-button tests.
- Create `packages/ui/src/agent/AgentRunCockpit.tsx`: task queue, run detail, steps, model audit, context packs, memory snippets, blocked reasons, and handoff artifacts.
- Create `packages/ui/test/agent-run-cockpit.test.tsx`: dense run-state rendering and blocked/handoff behavior tests.
- Modify `packages/ui/src/agent/AgentWorkspace.tsx`: compose the task handoff, run cockpit, existing approval cockpit, providers, diagnostics, tool ledger, and memory.
- Modify `packages/ui/src/App.tsx`: load status, approval cockpit, memory, ontology routes, and cockpit state; wire task queueing, approval decisions, and memory mutations through full state refreshes.
- Modify `packages/ui/test/agent-workspace.test.tsx`: workspace integration expectations.
- Modify `packages/ui/test/agent-app-integration.test.tsx`: app-level task queueing, approval, memory refresh, cockpit refresh, and no forbidden route calls.
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
- Gate B after Task 2: route review for read-only cockpit state, truthful task creation, generic run-route absence, landed scheduler wake preservation, local-runtime auth reuse, narrow route overlap, and no domain execution.
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
      kind: "queued-task",
      safeAction: "inspect-queue",
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
  4. queued task without a run and without any execution affordance,
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

## Task 2: Local Runtime Cockpit And Queue-Only Routes

**Files:**
- Modify: `packages/local-runtime/src/agent-http-routes.ts`
- Create: `packages/local-runtime/test/agent-cockpit-routes.test.ts`
- Modify: `packages/local-runtime/test/agent-http-routes.test.ts`
- Create: `docs/agentic/claims/task-2-agent-cockpit-routes.md`

**Interfaces:**
- Consumes: `buildAgentCockpit`, current `runtime.status()`, current `buildAgentApprovalCockpit`, existing `POST /api/agent/tasks`, landed `POST /api/agent/scheduler/wake`, approval routes, memory routes, and the specialist-specific ontology-bootstrap route.
- Produces: `GET /api/agent/cockpit`.
- Keeps generic `POST /api/agent/runs` absent. It must not validate, append, schedule, or execute generic specialist work.

- [x] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-2-agent-cockpit-routes.md` with owned files listed above and `Status: claimed`, then change it to `in-progress` and commit the status update.

- [x] **Step 2: Write failing route tests**

Create `packages/local-runtime/test/agent-cockpit-routes.test.ts` with tests that prove:

- `GET /api/agent/cockpit` returns `agent-cockpit.v1`.
- `POST /api/agent/runs` is not exposed and does not call runtime start methods.
- Generic run-route subpaths fail closed before domain semantics are considered.
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

it("does not expose a generic specialist run route", async () => {
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

  expect(response).toBeUndefined();
  expect(await eventTypes(context)).toEqual([
    "agent.identity.initialized",
    "agent.task.created",
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

- [x] **Step 4: Implement read routes and preserve queue-only behavior**

Modify `packages/local-runtime/src/agent-http-routes.ts`:

- Add `GET /api/agent/cockpit` after status and approval helpers are available.
- Build cockpit from `runtime.status()` and `buildAgentApprovalCockpit`.
- Keep `POST /api/agent/tasks` as the only generic work-handoff mutation in this slice.
- Preserve landed `POST /api/agent/scheduler/wake` semantics exactly.
- Preserve approval approve/deny routes, memory routes and provenance fields, and the ontology-bootstrap specialist-specific executable route.
- Do not add `POST /api/agent/runs` or generic run subpaths.
- Do not call execution loop, generic scheduler execution, provider adapters, ingestion, PRR, governance, workspace ops, ontology review services, or `runtime.startRun` from the generic cockpit routes.

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
- Generic `POST /api/agent/runs` and generic run subpaths are absent and do not call runtime start methods.
- Existing task route behavior remains intact.
- Landed scheduler wake semantics are preserved.

**Escalation conditions:**

- Escalate on any pressure to add a generic run-start route, route contract conflict with the scheduler branch, schema conflict in run state vocabulary, or any need to call domain execution services from these routes.

## Task 3: Browser Adapter For Cockpit And Task Handoff

**Files:**
- Modify: `packages/ui/src/agent/agent-types.ts`
- Modify: `packages/ui/src/agent/agent-adapter.ts`
- Create: `packages/ui/test/agent-cockpit-adapter.test.ts`
- Modify: `packages/ui/test/agent-adapter.test.ts`
- Create: `docs/agentic/claims/task-3-agent-cockpit-adapter.md`

**Interfaces:**
- Consumes: `AgentCockpitDto`, `GET /api/agent/cockpit`, `POST /api/agent/tasks`, approval routes, memory routes, scheduler wake, and ontology-bootstrap specialist routes.
- Produces: adapter methods `loadCockpit()` and `createTask(input)` without a generic `startRun(input)` method.
- Produces: `CreateAgentTaskInput` and `AgentTaskCreateResultDto` browser types.

- [x] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-3-agent-cockpit-adapter.md`, then mark it `in-progress` and commit.

- [x] **Step 2: Write failing adapter tests**

Create `packages/ui/test/agent-cockpit-adapter.test.ts` with tests that prove:

- `loadCockpit()` calls `/api/agent/cockpit` and parses `agent-cockpit.v1`.
- `createTask()` calls `/api/agent/tasks` with exactly task fields.
- The adapter exposes no generic `startRun()` method and calls no generic run route.
- Malformed runtime values become safe adapter errors or rejected promises without echoing raw text.
- No adapter method calls scheduler wake, provider transfer, PRR send, export, repair, legal escalation, accepted graph review, legacy import, or staging paths.

Use fetch call assertions such as:

```ts
expect(fetchCalls.map((call) => call.path)).toEqual([
  "/api/agent/cockpit",
  "/api/agent/tasks"
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
```

- Add strict Zod schemas matching `agent-cockpit.v1` and task create result.
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
- Task methods call only agent runtime task routes, and generic run-start methods are absent.
- Static adapter remains safe for tests and story-like fixtures.

## Task 4: Queue-Only Task Composer And Readiness Posture

**Files:**
- Create: `packages/ui/src/agent/AgentTaskComposer.tsx`
- Create: `packages/ui/test/agent-task-composer.test.tsx`
- Modify: `packages/ui/src/agent/AgentWorkspace.tsx`
- Modify: `packages/ui/test/agent-workspace.test.tsx`
- Create: `docs/agentic/claims/task-4-agent-task-composer.md`

**Interfaces:**
- Consumes: `AgentCockpitDto`, `AgentStatusDto`, `CreateAgentTaskInput`, and `createTask` callback.
- Produces: a browser-only task queue form that proposes a safe task ID and submits only the fields persisted by the task route: `taskId`, `title`, `priority`, and optional `description`.

- [x] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-4-agent-task-composer.md`, then mark it `in-progress` and commit.

- [x] **Step 2: Write failing component tests**

Create `packages/ui/test/agent-task-composer.test.tsx` with tests that prove:

- The form renders as `aria-label="Give Cestus Agent a task"`.
- Title input derives a safe `task_` ID for preview.
- The form does not render editable specialist, run type, scope kind, or scope refs controls because those values are not persisted by the task route.
- Provider/readiness/approval posture is visible before submit.
- Create task button calls `onCreateTask`.
- No start-run button or callback is exposed.
- A regression proves queued input contains exactly the visible persisted fields and no discarded specialist/scope affordance.
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

- Use a compact fieldset layout with title, optional description, and priority only.
- Generate proposed task IDs from safe title slugs and a timestamp/random suffix. The UI-generated IDs are proposals only; route validation remains authoritative.
- Show task-adjacent posture from cockpit summary: provider count, active locks, pending approvals, and merge-after-scheduler note.
- Leave specialist workflow readiness in the separate read-only run cockpit readiness section.
- Expose only:
  - `Queue task`
  - `Refresh`
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
- The UI can queue a task only through the task callback and exposes no generic run-start callback.
- The form shows only persisted task fields; specialist readiness remains visible in the separate read-only run cockpit.
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
- Produces: app-level load, refresh, task queueing, approval decisions, memory mutations, and ontology-bootstrap route reads without generic run-start behavior.

- [x] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-6-agent-cockpit-app-integration.md`, then mark it `in-progress` and commit.

- [x] **Step 2: Write failing app integration tests**

Modify `packages/ui/test/agent-app-integration.test.tsx` to prove:

- Opening the Agent module loads status, approval cockpit, cockpit DTO, and ontology bootstrap routes without blocking the page.
- Refresh reloads status, approval cockpit, and cockpit DTO.
- Create task calls only `agentAdapter.createTask`, then reloads cockpit and status.
- No app callback calls a generic `agentAdapter.startRun`.
- Approval decisions still call only approval decision methods and reload cockpit/status after success.
- Memory record/supersede/retract calls reload status, cockpit, approval cockpit, memory list, and ontology route state so `agent-cockpit.v1` memory snippets do not go stale.
- No unavailable run-start state is presented as an actionable workflow, and forbidden routes are not called.

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
- Load status, cockpit, approval cockpit, memory, and ontology bootstrap routes when the Agent module is active.
- Refresh all agent state together.
- Add `handleCreateAgentTask` only for generic task queueing.
- After task creation, reload status and cockpit exactly once through the shared state refresh.
- Keep approval handlers updating approval cockpit from decision result and reloading status/cockpit.
- Keep memory mutation handlers using the same shared state refresh, preserving selection of the returned memory ID when visible.
- Convert adapter errors to safe UI diagnostics.
- Do not call scheduler wake or generic run start in this task.

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

- App-level Agent workspace can queue tasks through adapter methods only.
- App-level approval behavior remains decision-only.
- App-level memory mutations refresh embedded cockpit memory snippets as well as the memory panel.
- Command agent brief does not import cockpit internals.
- No generic run-start route is called. Scheduler wake remains limited to the landed scheduler route contract.

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
- statement that the UI queues tasks only through the task route, refreshes, navigates, manages memory through memory routes, and approves/denies through decision routes;
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
- Local runtime exposes cockpit read state and queue-only task handoff routes without generic domain execution.
- Browser adapter parses cockpit DTOs and calls only task, approval, memory, ontology-bootstrap, scheduler-wake, and refresh routes; it has no generic run-start route.
- The Agent workspace supports the primary workflow: give Cestus Agent a task with only persisted task fields, show readiness/approval posture in read-only cockpit panels, and queue the task.
- The Agent workspace shows task queue, run detail, run steps, model invocation audit summaries, context pack summaries, memory snippets, pending approvals, blocked reasons, and final handoff artifacts.
- Context pack audit summaries use canonical `omissionCount` and `stalenessInputCount`; the UI must not infer omission or staleness counts from provenance/source/artifact refs.
- Final handoff artifacts appear only when runtime supplies matching canonical handoff DTOs for the selected run; absence of a durable production handoff source remains explicit future work, not an invented cockpit projection.
- The cockpit answers what the resident is watching, what it is doing, what it needs from the human, what is blocked, what changed, and what evidence supports it.
- No UI control or local-runtime route directly sends PRRs, transfers provider bytes, exports, clears legal locks, executes repairs, accepts graph truth, imports legacy material, or stages legacy material.
- Scheduler wake remains separate unless the scheduler branch has landed the exact route contract and this branch has adapted to it.
- Focused verification, `npm run verify`, and `git diff --check` pass.
