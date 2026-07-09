# MVP Resident Agent Scheduler Resumer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the narrow production scheduler/resumer spine for the resident Cestus Agent.

**Architecture:** Add a descriptor-backed scheduler in `packages/agent` that derives runnable, resumable, blocked, completed, and failed state from the append-only agent ledger, performs one-pass wake/resume work, validates approvals at consume time, and records tool completion or failure through the existing tool gateway. Domain execution remains injected behind a small executor descriptor interface; this slice defines the shared contract and fake test descriptors only.

**Tech Stack:** TypeScript, Zod, Vitest, existing ontology `EventLedger`, existing agent projection/runtime/tool-gateway modules, and local-runtime HTTP route plumbing.

## Global Constraints

- Use a task-scoped branch or worktree.
- Change only files listed by each task unless a verifier requires a small supporting edit.
- Write failing tests before production code.
- Run the exact targeted command in each task.
- Run `npm run verify` before committing implementation readiness.
- Preserve append-only ledger semantics, provenance requirements, and projection rebuildability.
- Approval validity must be checked when consumed, not only when appended.
- The scheduler must not bypass domain services or execute PRR send, legal escalation, export, destructive repair, provider byte transfer, accepted graph review, or legacy staging directly.
- `POST /api/agent/scheduler/wake` is a wake signal only. It must accept no tool input and must not bypass approval checks.
- Stop on data-loss risk, schema conflict, unavailable dependency, credential need, external-service dependency, or repeated verifier failure.

---

## Existing Context

The current resident-agent execution slice is deliberately fake-only:

- `packages/agent/src/execution-loop.ts` resumes a single approved fake request and takes `currentPreview` plus `activeLocks` from the caller.
- `packages/agent/src/tool-gateway.ts` already appends `agent.tool.requested`, `agent.tool.approved`, `agent.tool.denied`, `agent.tool.completed`, and `agent.tool.failed`, and validates independent human approvals before completion.
- `packages/agent/src/projection.ts` rebuilds task, run, tool request, memory, permission, and lock state from agent ledger events.
- `packages/local-runtime/src/agent-http-routes.ts` exposes status, tool requests, approval cockpit, approval decisions, and task creation. It does not expose scheduler wake.
- `docs/agentic/software-factory.md` records that scheduler wake and execution adapters remain a later slice after approval UI.

## File Structure

- `packages/agent/src/scheduler-types.ts`: stable scheduler DTOs, descriptor interfaces, preview/freshness/lock result types, and Zod schemas for the public wake result.
- `packages/agent/src/scheduler.ts`: ledger-derived scheduler state, one-pass wake/resume service, descriptor registry, consume-time validation, and gateway completion/failure recording.
- `packages/agent/src/tool-gateway.ts`: export the existing stable preview hash helper so scheduler and descriptors hash previews exactly like the gateway.
- `packages/agent/src/runtime.ts`: accept scheduler descriptors and expose `scheduler.wake()`.
- `packages/agent/src/index.ts`: export scheduler contracts and service.
- `packages/agent/test/scheduler-types.test.ts`: DTO, schema, descriptor, and preview-hash contract tests.
- `packages/agent/test/scheduler.test.ts`: ledger-derived state, one-pass wake, missing descriptor, stale approval, lock, freshness, provenance, forged approval, completion, and failure tests.
- `packages/local-runtime/src/agent-runtime-factory.ts`: pass scheduler descriptors from local runtime construction; default remains empty.
- `packages/local-runtime/src/agent-http-routes.ts`: add `POST /api/agent/scheduler/wake` as an authenticated/local wake signal with no tool input.
- `packages/local-runtime/test/agent-http-routes.test.ts`: route tests for wake DTOs, auth, body rejection, and no direct domain execution.
- `docs/agentic/claims/task-1-agent-scheduler-contracts.md`: Task 1 durable claim.
- `docs/agentic/claims/task-2-agent-scheduler-wake.md`: Task 2 durable claim.
- `docs/agentic/claims/task-3-agent-scheduler-runtime-route.md`: Task 3 durable claim.
- `docs/agentic/claims/task-4-agent-scheduler-readiness.md`: Task 4 durable claim and readiness evidence.
- `docs/agentic/software-factory.md`: final readiness note.
- `docs/superpowers/plans/2026-07-09-mvp-resident-agent-scheduler-resumer-implementation.md`: checkbox progress and final evidence.

## Shared Interface Shape

The scheduler descriptor contract should stay generic. Specialist and domain adapter threads plug into this later by registering descriptors.

```ts
export interface AgentApprovedToolExecutorDescriptor {
  readonly toolId: string;
  readonly toolVersion: string;
  readonly sideEffectClass: AgentToolSideEffectClass;
  readonly approvalClass: AgentToolApprovalClass;
  buildCurrentPreview(input: AgentApprovedToolPreviewInput): AgentApprovedToolPreviewResult | Promise<AgentApprovedToolPreviewResult>;
  executeApproved(input: AgentApprovedToolExecutionInput): AgentApprovedToolExecutionResult | Promise<AgentApprovedToolExecutionResult>;
}
```

Descriptor responsibilities:

- `buildCurrentPreview` rebuilds the current semantic preview from source refs, artifacts, context packs, projection/read-model state, policy, and locks.
- `executeApproved` calls the authoritative domain service later; in this branch tests use fake executors that return safe event IDs, artifact hashes, and read-model changes.
- Missing descriptors fail closed with safe scheduler diagnostics and an `agent.tool.failed` event.

Scheduler responsibilities:

- Derive runnable/resumable/blocked state from ledger events and projection snapshots.
- Process a one-pass `wake` over currently approved open tool requests.
- Recheck independent human approval, approval class, exact preview hash, approval causation, current descriptor preview, active locks, source/provenance/artifact hashes, projection/read-model freshness, terminal state, and secret-safety before execution.
- Record every completed or failed tool through `createAgentToolGateway`.
- Return a stable DTO with examined, resumed, completed, blocked, failed counts, safe item summaries, event IDs, and allowed next actions.

## Review Gates

- Gate A after Task 1: scheduler contract review for DTO stability, AI-legibility, preview hash parity, and absence of specialist semantics.
- Gate B after Task 2: consume-time validation review for approval freshness, locks, provenance, staleness, descriptor failure, and gateway event recording.
- Gate C after Task 3: local-runtime route review for auth, no tool input, and no direct PRR/provider/export/repair/accepted-graph execution.
- Gate D after Task 4: final factory readiness review before implementation merge.

## Task 1: Scheduler Contracts And Preview Hash Boundary

**Files:**
- Create: `docs/agentic/claims/task-1-agent-scheduler-contracts.md`
- Create: `packages/agent/src/scheduler-types.ts`
- Create: `packages/agent/test/scheduler-types.test.ts`
- Modify: `packages/agent/src/tool-gateway.ts`
- Modify: `packages/agent/src/index.ts`
- Modify: `docs/superpowers/plans/2026-07-09-mvp-resident-agent-scheduler-resumer-implementation.md`

**Interfaces:**
- Consumes: `AgentToolPreview`, `AgentToolResult`, `AgentToolReadModelChange`, `AgentToolApprovalClass`, `AgentToolSideEffectClass`.
- Produces: `AgentApprovedToolExecutorDescriptor`, `AgentSchedulerWakeResultDto`, `AgentSchedulerItemSummaryDto`, `hashAgentToolPreview(preview)`.

- [x] **Step 1: Claim the task**

Create `docs/agentic/claims/task-1-agent-scheduler-contracts.md`:

```markdown
# Task 1 Claim: Agent Scheduler Contracts

Plan: `docs/superpowers/plans/2026-07-09-mvp-resident-agent-scheduler-resumer-implementation.md`
Task: Task 1: Scheduler Contracts And Preview Hash Boundary
Branch: `codex/mvp-resident-agent-scheduler-resumer-plan`
Status: claimed

## Owned Files

- `packages/agent/src/scheduler-types.ts`
- `packages/agent/test/scheduler-types.test.ts`
- `packages/agent/src/tool-gateway.ts`
- `packages/agent/src/index.ts`
- `docs/agentic/claims/task-1-agent-scheduler-contracts.md`
- `docs/superpowers/plans/2026-07-09-mvp-resident-agent-scheduler-resumer-implementation.md`

## Verification

- Red: `npm test -- packages/agent/test/scheduler-types.test.ts`
- Green: `npm test -- packages/agent/test/scheduler-types.test.ts packages/agent/test/tool-gateway.test.ts`
```

Then change `Status: claimed` to `Status: in-progress` before editing source files.

- [x] **Step 2: Write failing scheduler contract tests**

Create `packages/agent/test/scheduler-types.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  agentSchedulerWakeResultDtoSchema,
  hashAgentToolPreview,
  type AgentApprovedToolExecutorDescriptor,
  type AgentSchedulerWakeResultDto
} from "../src/index.js";

const safeHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("agent scheduler contracts", () => {
  it("exports a stable wake result DTO with boring counts and safe item summaries", () => {
    const dto: AgentSchedulerWakeResultDto = {
      schemaVersion: "agent-scheduler-wake-result.v1",
      generatedAt: "2026-07-09T12:00:00.000Z",
      examinedCount: 1,
      resumedCount: 1,
      completedCount: 1,
      blockedCount: 0,
      failedCount: 0,
      eventIds: ["evt_agent_tool_completed"],
      allowedNextActions: ["refresh agent status"],
      items: [{
        toolRequestId: "toolreq_scheduler_contract",
        runId: "run_scheduler_contract",
        toolId: "agent.test.effect",
        toolVersion: "1.0.0",
        state: "completed",
        approvalClass: "ledger-review",
        previewHash: safeHash,
        currentPreviewHash: safeHash,
        eventIds: ["evt_agent_tool_completed"],
        allowedNextActions: ["refresh agent status"]
      }]
    };

    expect(agentSchedulerWakeResultDtoSchema.parse(dto)).toEqual(dto);
  });

  it("keeps descriptor execution behind buildCurrentPreview and executeApproved", async () => {
    const descriptor: AgentApprovedToolExecutorDescriptor = {
      toolId: "agent.test.effect",
      toolVersion: "1.0.0",
      sideEffectClass: "ledger-review",
      approvalClass: "ledger-review",
      async buildCurrentPreview(input) {
        return {
          preview: {
            summary: `Review ledger proposal for ${input.toolRequestId}.`,
            relatedEventIds: ["evt_source_review"]
          },
          sourceEventIds: ["evt_source_review"],
          inputArtifactHashes: [],
          provenanceRefs: ["evt_source_review"],
          activeLocks: [],
          freshnessChecks: [{
            name: "agent-projection",
            expected: "high-watermark:1",
            actual: "high-watermark:1",
            ok: true
          }]
        };
      },
      async executeApproved() {
        return {
          eventIds: ["evt_fake_domain_result"],
          artifactHashes: ["sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"],
          readModelChanges: [{
            projectionName: "agent-test",
            change: "fake executor completed"
          }],
          resultSummary: "Fake executor completed."
        };
      }
    };

    const current = await descriptor.buildCurrentPreview({
      toolRequestId: "toolreq_scheduler_contract",
      runId: "run_scheduler_contract",
      toolId: "agent.test.effect",
      toolVersion: "1.0.0",
      requestedPreviewHash: safeHash
    });

    expect(current.provenanceRefs).toEqual(["evt_source_review"]);
    expect(current.freshnessChecks.every((check) => check.ok)).toBe(true);
    await expect(descriptor.executeApproved({
      toolRequestId: "toolreq_scheduler_contract",
      runId: "run_scheduler_contract",
      toolId: "agent.test.effect",
      toolVersion: "1.0.0",
      sideEffectClass: "ledger-review",
      approvalClass: "ledger-review",
      previewHash: safeHash,
      approvedPreviewHash: safeHash,
      approvedBy: "actor_case_owner",
      sourceEventIds: ["evt_source_review"],
      inputArtifactHashes: [],
      provenanceRefs: ["evt_source_review"]
    })).resolves.toMatchObject({ resultSummary: "Fake executor completed." });
  });

  it("uses the same stable preview hash boundary as the tool gateway", () => {
    const left = hashAgentToolPreview({
      summary: "Stable preview.",
      zeta: "last",
      alpha: "first"
    });
    const right = hashAgentToolPreview({
      alpha: "first",
      zeta: "last",
      summary: "Stable preview."
    });

    expect(left).toBe(right);
    expect(left).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});
```

- [x] **Step 3: Run targeted failing tests**

Run:

```bash
npm test -- packages/agent/test/scheduler-types.test.ts
```

Expected before implementation:

```text
Failed to resolve import "../src/index.js" because scheduler exports are missing
```

- [x] **Step 4: Add scheduler DTOs and descriptor contracts**

Create `packages/agent/src/scheduler-types.ts`:

```ts
import { z } from "zod";
import type {
  AgentToolApprovalClass,
  AgentToolSideEffectClass
} from "./projection-types.js";
import type {
  AgentToolPreview,
  AgentToolReadModelChange,
  AgentToolResult
} from "./tool-gateway.js";

export const agentSchedulerItemStateSchema = z.enum([
  "not-ready",
  "blocked",
  "resumed",
  "completed",
  "failed"
]);

export const agentSchedulerItemSummaryDtoSchema = z.object({
  toolRequestId: z.string().min(1),
  runId: z.string().min(1),
  taskId: z.string().min(1).optional(),
  toolId: z.string().min(1),
  toolVersion: z.string().min(1),
  state: agentSchedulerItemStateSchema,
  approvalClass: z.string().min(1),
  previewHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  currentPreviewHash: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional(),
  category: z.string().min(1).optional(),
  message: z.string().min(1).optional(),
  eventIds: z.array(z.string().regex(/^evt_[a-zA-Z0-9_-]+$/)),
  allowedNextActions: z.array(z.string().min(1))
});

export const agentSchedulerWakeResultDtoSchema = z.object({
  schemaVersion: z.literal("agent-scheduler-wake-result.v1"),
  generatedAt: z.string().datetime(),
  examinedCount: z.number().int().nonnegative(),
  resumedCount: z.number().int().nonnegative(),
  completedCount: z.number().int().nonnegative(),
  blockedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  eventIds: z.array(z.string().regex(/^evt_[a-zA-Z0-9_-]+$/)),
  allowedNextActions: z.array(z.string().min(1)),
  items: z.array(agentSchedulerItemSummaryDtoSchema)
});

export type AgentSchedulerItemState = z.infer<typeof agentSchedulerItemStateSchema>;
export type AgentSchedulerItemSummaryDto = z.infer<typeof agentSchedulerItemSummaryDtoSchema>;
export type AgentSchedulerWakeResultDto = z.infer<typeof agentSchedulerWakeResultDtoSchema>;

export interface AgentApprovedToolPreviewInput {
  readonly toolRequestId: string;
  readonly runId: string;
  readonly taskId?: string;
  readonly toolId: string;
  readonly toolVersion: string;
  readonly requestedPreviewHash: string;
}

export interface AgentApprovedToolFreshnessCheck {
  readonly name: string;
  readonly expected: string;
  readonly actual: string;
  readonly ok: boolean;
}

export interface AgentApprovedToolActiveLock {
  readonly lockId: string;
  readonly category: string;
  readonly message: string;
}

export interface AgentApprovedToolPreviewResult {
  readonly preview: AgentToolPreview;
  readonly sourceEventIds: readonly string[];
  readonly inputArtifactHashes: readonly string[];
  readonly provenanceRefs: readonly string[];
  readonly activeLocks: readonly AgentApprovedToolActiveLock[];
  readonly freshnessChecks: readonly AgentApprovedToolFreshnessCheck[];
}

export interface AgentApprovedToolExecutionInput {
  readonly toolRequestId: string;
  readonly runId: string;
  readonly taskId?: string;
  readonly toolId: string;
  readonly toolVersion: string;
  readonly sideEffectClass: AgentToolSideEffectClass;
  readonly approvalClass: AgentToolApprovalClass;
  readonly previewHash: string;
  readonly approvedPreviewHash: string;
  readonly approvedBy: string;
  readonly sourceEventIds: readonly string[];
  readonly inputArtifactHashes: readonly string[];
  readonly provenanceRefs: readonly string[];
}

export interface AgentApprovedToolExecutionResult extends AgentToolResult {
  readonly readModelChanges: readonly AgentToolReadModelChange[];
}

export interface AgentApprovedToolExecutorDescriptor {
  readonly toolId: string;
  readonly toolVersion: string;
  readonly sideEffectClass: AgentToolSideEffectClass;
  readonly approvalClass: AgentToolApprovalClass;
  buildCurrentPreview(input: AgentApprovedToolPreviewInput): AgentApprovedToolPreviewResult | Promise<AgentApprovedToolPreviewResult>;
  executeApproved(input: AgentApprovedToolExecutionInput): AgentApprovedToolExecutionResult | Promise<AgentApprovedToolExecutionResult>;
}
```

- [x] **Step 5: Export the gateway preview hash helper**

Modify `packages/agent/src/tool-gateway.ts` by renaming the private helper and reusing it:

```ts
export function hashAgentToolPreview(preview: AgentToolPreview): `sha256:${string}` {
  const safePreview = sanitizeAgentToolPreview(preview);
  const digest = createHash("sha256").update(stableJsonStringify(safePreview)).digest("hex");
  return `sha256:${digest}`;
}
```

Then change `requestTool()` to use `hashAgentToolPreview(preview)` instead of the private `hashPreview(preview)` and remove the old private `hashPreview` function.

- [x] **Step 6: Export scheduler contracts**

Modify `packages/agent/src/index.ts`:

```ts
export * from "./scheduler-types.js";
```

Preserve all existing exports.

- [x] **Step 7: Run targeted passing tests**

Run:

```bash
npm test -- packages/agent/test/scheduler-types.test.ts packages/agent/test/tool-gateway.test.ts
```

Expected:

```text
Test Files  2 passed
```

- [x] **Step 8: Commit Task 1**

Run:

```bash
git add docs/agentic/claims/task-1-agent-scheduler-contracts.md packages/agent/src/scheduler-types.ts packages/agent/test/scheduler-types.test.ts packages/agent/src/tool-gateway.ts packages/agent/src/index.ts docs/superpowers/plans/2026-07-09-mvp-resident-agent-scheduler-resumer-implementation.md
git commit -m "feat: add agent scheduler contracts"
```

**Acceptance Criteria:**

- Scheduler DTO schemas are stable and parse the expected result shape.
- Descriptor interfaces expose only generic preview rebuild and approved execution hooks.
- Preview hash computation is shared with the gateway.
- No domain-specific provider, PRR, export, repair, legal, legacy, or accepted-graph semantics are introduced.

**Rollback/Escalation:**

- Escalate if exporting preview hashing would weaken gateway secret-safety checks or allow unsanitized previews to be hashed.

## Task 2: Ledger-Derived Scheduler Wake And Consume-Time Validation

**Files:**
- Create: `docs/agentic/claims/task-2-agent-scheduler-wake.md`
- Create: `packages/agent/src/scheduler.ts`
- Create: `packages/agent/test/scheduler.test.ts`
- Modify: `packages/agent/src/index.ts`
- Modify: `docs/superpowers/plans/2026-07-09-mvp-resident-agent-scheduler-resumer-implementation.md`

**Interfaces:**
- Consumes: `buildAgentProjection(events)`, `createAgentToolGateway(input)`, `hashAgentToolPreview(preview)`, `AgentApprovedToolExecutorDescriptor`.
- Produces: `createAgentScheduler(input).wake()`, one-pass `AgentSchedulerWakeResultDto`.

- [x] **Step 1: Claim the task**

Create `docs/agentic/claims/task-2-agent-scheduler-wake.md`:

```markdown
# Task 2 Claim: Agent Scheduler Wake

Plan: `docs/superpowers/plans/2026-07-09-mvp-resident-agent-scheduler-resumer-implementation.md`
Task: Task 2: Ledger-Derived Scheduler Wake And Consume-Time Validation
Branch: `codex/mvp-resident-agent-scheduler-resumer-plan`
Status: claimed

## Owned Files

- `packages/agent/src/scheduler.ts`
- `packages/agent/test/scheduler.test.ts`
- `packages/agent/src/index.ts`
- `docs/agentic/claims/task-2-agent-scheduler-wake.md`
- `docs/superpowers/plans/2026-07-09-mvp-resident-agent-scheduler-resumer-implementation.md`

## Verification

- Red: `npm test -- packages/agent/test/scheduler.test.ts`
- Green: `npm test -- packages/agent/test/scheduler.test.ts packages/agent/test/scheduler-types.test.ts packages/agent/test/tool-gateway.test.ts packages/agent/test/projection.test.ts packages/agent/test/execution-loop.test.ts`
```

Then change `Status: claimed` to `Status: in-progress` before editing source files.

- [x] **Step 2: Write failing scheduler wake tests**

Create `packages/agent/test/scheduler.test.ts` with these cases:

```ts
import type { AppendableKnowledgeEvent } from "../../ontology/src/contracts.js";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { describe, expect, it } from "vitest";
import {
  createAgentScheduler,
  createAgentToolGateway,
  hashAgentToolPreview,
  type AgentApprovedToolExecutorDescriptor,
  type AgentToolPreview
} from "../src/index.js";

const agentActor = { id: "actor_cestus_agent", kind: "agent" as const, label: "Cestus Agent" };
const schedulerActor = { id: "actor_agent_scheduler", kind: "system" as const, label: "Agent Scheduler" };
const humanActor = { id: "actor_case_owner", kind: "human" as const, label: "Case Owner" };
const artifactHash = "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";

describe("agent scheduler wake", () => {
  it("resumes an approved request once and records completion through the gateway", async () => {
    const ledger = new InMemoryEventLedger();
    const preview = previewFor("toolreq_scheduler_complete");
    const requested = await requestAndApprove(ledger, preview, "toolreq_scheduler_complete");
    let executions = 0;
    const scheduler = createAgentScheduler({
      ledger,
      actor: schedulerActor,
      now: () => "2026-07-09T12:00:00.000Z",
      descriptors: [fakeDescriptor(preview, {
        async executeApproved(input) {
          executions += 1;
          expect(input.approvedBy).toBe(humanActor.id);
          return {
            eventIds: ["evt_fake_domain_completed"],
            artifactHashes: [artifactHash],
            readModelChanges: [{ projectionName: "agent-test", change: "approved tool executed" }],
            resultSummary: "Approved tool executed."
          };
        }
      })]
    });

    const result = await scheduler.wake();

    expect(result).toMatchObject({
      schemaVersion: "agent-scheduler-wake-result.v1",
      examinedCount: 1,
      resumedCount: 1,
      completedCount: 1,
      blockedCount: 0,
      failedCount: 0
    });
    expect(result.items[0]).toMatchObject({
      toolRequestId: "toolreq_scheduler_complete",
      state: "completed",
      previewHash: requested.payload.previewHash,
      currentPreviewHash: requested.payload.previewHash
    });
    expect(executions).toBe(1);
    expect((await ledger.readAll()).map((event) => event.type)).toContain("agent.tool.completed");
  });

  it("fails closed when an approved request has no descriptor", async () => {
    const ledger = new InMemoryEventLedger();
    await requestAndApprove(ledger, previewFor("toolreq_missing_descriptor"), "toolreq_missing_descriptor");
    const scheduler = createAgentScheduler({
      ledger,
      actor: schedulerActor,
      now: () => "2026-07-09T12:00:00.000Z",
      descriptors: []
    });

    const result = await scheduler.wake();

    expect(result.failedCount).toBe(1);
    expect(result.items[0]).toMatchObject({
      toolRequestId: "toolreq_missing_descriptor",
      state: "failed",
      category: "permission-denied"
    });
    expect((await ledger.readAll()).map((event) => event.type)).toContain("agent.tool.failed");
  });

  it("fails closed before execution when the rebuilt preview is stale", async () => {
    const ledger = new InMemoryEventLedger();
    await requestAndApprove(ledger, previewFor("toolreq_stale_preview"), "toolreq_stale_preview");
    let executions = 0;
    const scheduler = createAgentScheduler({
      ledger,
      actor: schedulerActor,
      now: () => "2026-07-09T12:00:00.000Z",
      descriptors: [fakeDescriptor({ summary: "Changed preview.", relatedEventIds: ["evt_source_changed"] }, {
        async executeApproved() {
          executions += 1;
          throw new Error("stale previews must not execute");
        }
      })]
    });

    const result = await scheduler.wake();

    expect(result.failedCount).toBe(1);
    expect(result.items[0].category).toBe("approval-stale");
    expect(executions).toBe(0);
  });

  it("fails closed when active locks, missing provenance, or stale read models block consume-time validation", async () => {
    const lockCase = await wakeWithPreviewResult("toolreq_lock_active", {
      activeLocks: [{ lockId: "lock_export_review", category: "export", message: "Export review lock active." }]
    });
    const provenanceCase = await wakeWithPreviewResult("toolreq_missing_provenance", {
      provenanceRefs: [],
      sourceEventIds: [],
      inputArtifactHashes: []
    });
    const freshnessCase = await wakeWithPreviewResult("toolreq_projection_lag", {
      freshnessChecks: [{ name: "agent-projection", expected: "high-watermark:10", actual: "high-watermark:9", ok: false }]
    });

    expect(lockCase.result.items[0].category).toBe("legal-lock-active");
    expect(provenanceCase.result.items[0].category).toBe("provenance-missing");
    expect(freshnessCase.result.items[0].category).toBe("projection-lag");
    expect(lockCase.executions + provenanceCase.executions + freshnessCase.executions).toBe(0);
  });

  it("rejects directly appended forged approvals at consume time", async () => {
    const ledger = new InMemoryEventLedger();
    const preview = previewFor("toolreq_forged_approval");
    const gateway = createAgentToolGateway({ ledger, actor: agentActor, now: () => "2026-07-09T12:00:00.000Z" });
    const requested = await gateway.requestTool({
      toolRequestId: "toolreq_forged_approval",
      residentAgentId: "agent_default",
      taskId: "task_scheduler",
      runId: "run_scheduler",
      toolId: "agent.test.effect",
      toolVersion: "1.0.0",
      sideEffectClass: "ledger-review",
      requiredApprovalClass: "ledger-review",
      preview
    });
    const forgedApproval: AppendableKnowledgeEvent<"agent.tool.approved"> = {
      type: "agent.tool.approved",
      version: 1,
      streamId: "agent_tool_request_toolreq_forged_approval",
      context: {
        actor: humanActor,
        occurredAt: "2026-07-09T12:00:00.000Z",
        correlationId: "corr_toolreq_forged_approval",
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0", agent: "0.1.0" }
      },
      payload: {
        toolRequestId: "toolreq_forged_approval",
        approvedBy: humanActor.id,
        approvedPreviewHash: requested.payload.previewHash,
        approvalClass: "ledger-review",
        rationale: "Forged approval lacks causation.",
        approvedAt: "2026-07-09T12:00:00.000Z"
      }
    };
    await ledger.append(forgedApproval);
    let executions = 0;
    const scheduler = createAgentScheduler({
      ledger,
      actor: schedulerActor,
      now: () => "2026-07-09T12:00:00.000Z",
      descriptors: [fakeDescriptor(preview, {
        async executeApproved() {
          executions += 1;
          throw new Error("forged approvals must not execute");
        }
      })]
    });

    const result = await scheduler.wake();

    expect(result.failedCount).toBe(1);
    expect(result.items[0].category).toBe("permission-denied");
    expect(executions).toBe(0);
  });
});

function previewFor(toolRequestId: string): AgentToolPreview {
  return {
    summary: `Review approved scheduler request ${toolRequestId}.`,
    relatedEventIds: ["evt_source_review"],
    artifactHashes: [artifactHash]
  };
}

function fakeDescriptor(
  preview: AgentToolPreview,
  overrides: Partial<AgentApprovedToolExecutorDescriptor> = {}
): AgentApprovedToolExecutorDescriptor {
  return {
    toolId: "agent.test.effect",
    toolVersion: "1.0.0",
    sideEffectClass: "ledger-review",
    approvalClass: "ledger-review",
    async buildCurrentPreview() {
      return {
        preview,
        sourceEventIds: ["evt_source_review"],
        inputArtifactHashes: [artifactHash],
        provenanceRefs: ["evt_source_review", artifactHash],
        activeLocks: [],
        freshnessChecks: [{ name: "agent-projection", expected: "high-watermark:1", actual: "high-watermark:1", ok: true }]
      };
    },
    async executeApproved() {
      return {
        eventIds: ["evt_fake_domain_completed"],
        artifactHashes: [artifactHash],
        readModelChanges: [{ projectionName: "agent-test", change: "approved tool executed" }],
        resultSummary: "Approved tool executed."
      };
    },
    ...overrides
  };
}

async function requestAndApprove(ledger: InMemoryEventLedger, preview: AgentToolPreview, toolRequestId: string) {
  const gateway = createAgentToolGateway({ ledger, actor: agentActor, now: () => "2026-07-09T12:00:00.000Z" });
  const requested = await gateway.requestTool({
    toolRequestId,
    residentAgentId: "agent_default",
    taskId: "task_scheduler",
    runId: "run_scheduler",
    toolId: "agent.test.effect",
    toolVersion: "1.0.0",
    sideEffectClass: "ledger-review",
    requiredApprovalClass: "ledger-review",
    preview
  });
  expect(requested.payload.previewHash).toBe(hashAgentToolPreview(preview));
  await gateway.approveTool({
    toolRequestId,
    actor: humanActor,
    approvedPreviewHash: requested.payload.previewHash,
    rationale: "Human approved the exact scheduler preview."
  });
  return requested;
}

async function wakeWithPreviewResult(
  toolRequestId: string,
  previewPatch: Partial<Awaited<ReturnType<AgentApprovedToolExecutorDescriptor["buildCurrentPreview"]>>>
) {
  const ledger = new InMemoryEventLedger();
  const preview = previewFor(toolRequestId);
  await requestAndApprove(ledger, preview, toolRequestId);
  let executions = 0;
  const descriptor = fakeDescriptor(preview, {
    async buildCurrentPreview() {
      return {
        preview,
        sourceEventIds: ["evt_source_review"],
        inputArtifactHashes: [artifactHash],
        provenanceRefs: ["evt_source_review", artifactHash],
        activeLocks: [],
        freshnessChecks: [{ name: "agent-projection", expected: "high-watermark:1", actual: "high-watermark:1", ok: true }],
        ...previewPatch
      };
    },
    async executeApproved() {
      executions += 1;
      return {
        eventIds: ["evt_fake_domain_completed"],
        artifactHashes: [artifactHash],
        readModelChanges: [{ projectionName: "agent-test", change: "approved tool executed" }],
        resultSummary: "Approved tool executed."
      };
    }
  });
  const scheduler = createAgentScheduler({
    ledger,
    actor: schedulerActor,
    now: () => "2026-07-09T12:00:00.000Z",
    descriptors: [descriptor]
  });
  return { result: await scheduler.wake(), executions };
}
```

- [x] **Step 3: Run targeted failing tests**

Run:

```bash
npm test -- packages/agent/test/scheduler.test.ts
```

Expected before implementation:

```text
Failed to resolve import "../src/index.js" because createAgentScheduler is not exported
```

- [x] **Step 4: Implement the scheduler service**

Create `packages/agent/src/scheduler.ts` with these exported surfaces:

```ts
import type { ActorRef, KnowledgeEventOf } from "../../ontology/src/contracts.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";
import { buildAgentProjection } from "./projection.js";
import type { ProjectedAgentToolRequest } from "./projection-types.js";
import { assertAgentSecretSafeText } from "./secret-safety.js";
import {
  createAgentToolGateway,
  hashAgentToolPreview,
  type AgentToolResult
} from "./tool-gateway.js";
import type {
  AgentApprovedToolExecutorDescriptor,
  AgentApprovedToolPreviewResult,
  AgentSchedulerItemSummaryDto,
  AgentSchedulerWakeResultDto
} from "./scheduler-types.js";

export interface CreateAgentSchedulerInput {
  readonly ledger: EventLedger;
  readonly actor: ActorRef;
  readonly now: () => string;
  readonly descriptors: readonly AgentApprovedToolExecutorDescriptor[];
}

export function createAgentScheduler(input: CreateAgentSchedulerInput) {
  const descriptorRegistry = new Map(input.descriptors.map((descriptor) => [
    descriptorKey(descriptor.toolId, descriptor.toolVersion),
    descriptor
  ]));
  const gateway = createAgentToolGateway({ ledger: input.ledger, actor: input.actor, now: input.now });

  return Object.freeze({
    async wake(): Promise<AgentSchedulerWakeResultDto> {
      const events = await input.ledger.readAll();
      const projection = buildAgentProjection(events);
      const candidates = [...projection.toolRequests.values()].filter(isApprovedOpenRequest);
      const items: AgentSchedulerItemSummaryDto[] = [];
      const eventIds: string[] = [];

      for (const request of candidates) {
        const descriptor = descriptorRegistry.get(descriptorKey(request.toolId, request.toolVersion));
        const item = descriptor === undefined
          ? await failRequest(gateway, request, "permission-denied", "Approved tool descriptor is unavailable.", ["install or register the approved tool descriptor"])
          : await consumeApprovedRequest(input.ledger, gateway, input.actor.id, descriptor, request);
        items.push(item);
        eventIds.push(...item.eventIds);
      }

      const completedCount = items.filter((item) => item.state === "completed").length;
      const failedCount = items.filter((item) => item.state === "failed").length;
      const blockedCount = items.filter((item) => item.state === "blocked").length;
      return {
        schemaVersion: "agent-scheduler-wake-result.v1",
        generatedAt: input.now(),
        examinedCount: candidates.length,
        resumedCount: completedCount,
        completedCount,
        blockedCount,
        failedCount,
        eventIds,
        allowedNextActions: ["refresh agent status", "inspect agent approval queue"],
        items
      };
    }
  });
}
```

Implementation requirements:

- `isApprovedOpenRequest()` returns true only for projection tool requests with `state === "approved"` and no completion/failure/denial data.
- `consumeApprovedRequest()` must read the tool request stream and validate the latest usable approval event before descriptor execution.
- Approval validation must require:
  - approval context actor kind is `human`;
  - approval payload `approvedBy` equals approval context actor ID;
  - approval context `causationId` equals the request event ID;
  - approval approval class equals request required approval class;
  - approval preview hash equals request preview hash;
  - approving actor is not the resident agent/requesting actor;
  - approving actor is not the scheduler actor.
- `descriptor.buildCurrentPreview()` must run before `descriptor.executeApproved()`.
- The scheduler must compute `currentPreviewHash = hashAgentToolPreview(previewResult.preview)` and compare it to request/approval hashes.
- The scheduler must fail before execution if:
  - descriptor is missing: `permission-denied`;
  - approval is forged or not independently human: `permission-denied`;
  - current preview hash differs: `approval-stale`;
  - active locks are present: `legal-lock-active` for gateway compatibility, item message should say lock active;
  - `sourceEventIds`, `inputArtifactHashes`, and `provenanceRefs` together contain no provenance: `provenance-missing`;
  - any freshness check has `ok: false`: `projection-lag`;
  - preview/result/message/action fields are not secret-safe: `secret-detected`;
  - descriptor execution throws: `external-effect-failed`;
  - descriptor result validation fails through the gateway: `model-output-invalid` or `external-effect-failed` with safe message.
- All failure/completion events must be appended through `gateway.failTool()` or `gateway.completeTool()`.
- The wake loop must be one-pass: do not recursively inspect tool requests appended by descriptor execution.
- The scheduler must not call any PRR, ingestion provider byte transfer, governance export, destructive repair, accepted graph review, legal escalation, or legacy staging service directly.

- [x] **Step 5: Export the scheduler**

Modify `packages/agent/src/index.ts`:

```ts
export * from "./scheduler.js";
```

Preserve existing exports.

- [x] **Step 6: Run targeted passing tests**

Run:

```bash
npm test -- packages/agent/test/scheduler.test.ts packages/agent/test/scheduler-types.test.ts packages/agent/test/tool-gateway.test.ts packages/agent/test/projection.test.ts packages/agent/test/execution-loop.test.ts
```

Expected:

```text
Test Files  5 passed
```

- [x] **Step 7: Commit Task 2**

Run:

```bash
git add docs/agentic/claims/task-2-agent-scheduler-wake.md packages/agent/src/scheduler.ts packages/agent/test/scheduler.test.ts packages/agent/src/index.ts docs/superpowers/plans/2026-07-09-mvp-resident-agent-scheduler-resumer-implementation.md
git commit -m "feat: add agent scheduler wake spine"
```

**Acceptance Criteria:**

- Wake derives approved open requests from the ledger and projection.
- Wake processes only the current snapshot once.
- Consume-time validation rejects forged approvals, stale previews, active locks, missing provenance, stale read models, missing descriptors, and unsafe diagnostics.
- Successful execution records `agent.tool.completed` through the existing gateway.
- Failures record `agent.tool.failed` through the existing gateway.
- No specialist-specific execution semantics enter the scheduler.

**Rollback/Escalation:**

- Escalate if existing gateway failure categories cannot safely represent lock-active or descriptor-missing failures without weakening event schemas.

## Task 3: Runtime Contract And Wake HTTP Route

**Files:**
- Create: `docs/agentic/claims/task-3-agent-scheduler-runtime-route.md`
- Modify: `packages/agent/src/runtime.ts`
- Modify: `packages/local-runtime/src/agent-runtime-factory.ts`
- Modify: `packages/local-runtime/src/agent-http-routes.ts`
- Modify: `packages/local-runtime/test/agent-http-routes.test.ts`
- Modify: `docs/superpowers/plans/2026-07-09-mvp-resident-agent-scheduler-resumer-implementation.md`

**Interfaces:**
- Consumes: `createAgentScheduler(input).wake()`.
- Produces: `runtime.scheduler.wake()` and `POST /api/agent/scheduler/wake`.

- [x] **Step 1: Claim the task**

Create `docs/agentic/claims/task-3-agent-scheduler-runtime-route.md`:

```markdown
# Task 3 Claim: Agent Scheduler Runtime Route

Plan: `docs/superpowers/plans/2026-07-09-mvp-resident-agent-scheduler-resumer-implementation.md`
Task: Task 3: Runtime Contract And Wake HTTP Route
Branch: `codex/mvp-resident-agent-scheduler-resumer-plan`
Status: claimed

## Owned Files

- `packages/agent/src/runtime.ts`
- `packages/local-runtime/src/agent-runtime-factory.ts`
- `packages/local-runtime/src/agent-http-routes.ts`
- `packages/local-runtime/test/agent-http-routes.test.ts`
- `docs/agentic/claims/task-3-agent-scheduler-runtime-route.md`
- `docs/superpowers/plans/2026-07-09-mvp-resident-agent-scheduler-resumer-implementation.md`

## Verification

- Red: `npm test -- packages/local-runtime/test/agent-http-routes.test.ts`
- Green: `npm test -- packages/local-runtime/test/agent-http-routes.test.ts packages/local-runtime/test/agent-approval-routes.test.ts packages/agent/test/runtime.test.ts packages/agent/test/scheduler.test.ts`
```

Then change `Status: claimed` to `Status: in-progress` before editing source files.

- [x] **Step 2: Write failing local-runtime wake route tests**

Append tests to `packages/local-runtime/test/agent-http-routes.test.ts`:

```ts
it("wakes the resident agent scheduler without accepting tool input", async () => {
  const { handler } = await seededApprovedToolHandler();

  const rejected = await handler({
    method: "POST",
    url: "/api/agent/scheduler/wake",
    body: JSON.stringify({ toolRequestId: "toolreq_must_not_be_routed" })
  });
  const accepted = await handler({
    method: "POST",
    url: "/api/agent/scheduler/wake"
  });

  expect(rejected.status).toBe(400);
  expect(accepted.status).toBe(200);
  const body = JSON.parse(accepted.body) as {
    readonly schemaVersion: string;
    readonly examinedCount: number;
    readonly eventIds: readonly string[];
  };
  expect(body.schemaVersion).toBe("agent-scheduler-wake-result.v1");
  expect(body.examinedCount).toBe(1);
  expect(accepted.body).not.toMatch(/prr\.request\.sent|legal-escalation|accepted graph|provider byte transfer/i);
});

it("uses existing auth policy for scheduler wake routes", async () => {
  const handler = testHandler({
    env: {
      CESTUS_LOCAL_BIND: "lan",
      CESTUS_LOCAL_AUTH_TOKEN: "route-secret"
    }
  });

  const rejected = await handler({ method: "POST", url: "/api/agent/scheduler/wake" });
  const accepted = await handler({
    method: "POST",
    url: "/api/agent/scheduler/wake",
    headers: { authorization: "Bearer route-secret" }
  });

  expect(rejected.status).toBe(401);
  expect(accepted.status).toBe(200);
});
```

Add a local test helper that seeds an approved request through the existing gateway and injects a fake descriptor through `agentRuntimeFactory`. The fake descriptor must return only event IDs, artifact hashes, read-model changes, and safe result text.

- [x] **Step 3: Run targeted failing tests**

Run:

```bash
npm test -- packages/local-runtime/test/agent-http-routes.test.ts
```

Expected before implementation:

```text
expected 200 but received 404 or undefined route for /api/agent/scheduler/wake
```

- [x] **Step 4: Expose scheduler from the agent runtime**

Modify `packages/agent/src/runtime.ts`:

```ts
import {
  createAgentScheduler,
  type AgentApprovedToolExecutorDescriptor
} from "./scheduler.js";

export interface CreateAgentRuntimeInput {
  readonly ledger: EventLedger;
  readonly actor: ActorRef;
  readonly now: () => string;
  readonly providers?: readonly ModelProviderAdapter[];
  readonly approvedToolExecutors?: readonly AgentApprovedToolExecutorDescriptor[];
}
```

Inside `createAgentRuntime(input)`, add:

```ts
const scheduler = createAgentScheduler({
  ledger: input.ledger,
  actor: input.actor,
  now: input.now,
  descriptors: input.approvedToolExecutors ?? []
});
```

Return it as:

```ts
scheduler,
gateway: createAgentToolGateway({ ledger: input.ledger, actor: input.actor, now: input.now })
```

- [x] **Step 5: Thread descriptor injection through local runtime factory**

Modify `packages/local-runtime/src/agent-runtime-factory.ts`:

```ts
import type { AgentApprovedToolExecutorDescriptor } from "../../agent/src/index.js";

export interface LocalAgentRuntimeFactoryInput {
  readonly handle: LocalRuntimeHandle;
  readonly actor: ActorRef;
  readonly now: () => string;
  readonly approvedToolExecutors?: readonly AgentApprovedToolExecutorDescriptor[];
}
```

Pass the descriptors into `createAgentRuntime`:

```ts
return createAgentRuntime({
  ledger: input.handle.ledger,
  actor: input.actor,
  now: input.now,
  providers: configuredProviders.providers,
  approvedToolExecutors: input.approvedToolExecutors ?? []
});
```

- [x] **Step 6: Add the wake route**

Modify `packages/local-runtime/src/agent-http-routes.ts` before the task creation route:

```ts
if (input.request.method === "POST" && path === "/api/agent/scheduler/wake") {
  if (input.request.body !== undefined && input.request.body.trim().length > 0) {
    const parsed = parseJsonObjectBody(input.request.body, invalidSchedulerWakeBodyDiagnostic);
    if (!parsed.ok || Object.keys(parsed.value).length > 0) {
      return json(400, invalidSchedulerWakeBodyDiagnostic());
    }
  }

  return json(200, await runtime.scheduler.wake());
}
```

Add:

```ts
function invalidSchedulerWakeBodyDiagnostic() {
  return diagnostic("Agent scheduler wake does not accept tool input.", [
    "send an empty POST body to wake the scheduler",
    "use approval routes to append human decisions"
  ]);
}
```

Route requirements:

- Do not parse or accept `toolRequestId`, `toolId`, approval data, preview data, or descriptor data from HTTP.
- Do not call gateway approve/deny/complete directly from this route.
- Do not call PRR, ingestion provider byte transfer, governance export, destructive repair, legal escalation, accepted graph review, or legacy staging services.
- Return only the scheduler wake DTO.
- Rely on existing local-runtime auth wrapper.

- [x] **Step 7: Run targeted passing tests**

Run:

```bash
npm test -- packages/local-runtime/test/agent-http-routes.test.ts packages/local-runtime/test/agent-approval-routes.test.ts packages/agent/test/runtime.test.ts packages/agent/test/scheduler.test.ts
```

Expected:

```text
Test Files  4 passed
```

- [x] **Step 8: Commit Task 3**

Run:

```bash
git add docs/agentic/claims/task-3-agent-scheduler-runtime-route.md packages/agent/src/runtime.ts packages/local-runtime/src/agent-runtime-factory.ts packages/local-runtime/src/agent-http-routes.ts packages/local-runtime/test/agent-http-routes.test.ts docs/superpowers/plans/2026-07-09-mvp-resident-agent-scheduler-resumer-implementation.md
git commit -m "feat: expose agent scheduler wake route"
```

**Acceptance Criteria:**

- `runtime.scheduler.wake()` returns the stable wake DTO.
- `POST /api/agent/scheduler/wake` accepts only an empty wake signal.
- Existing auth behavior applies.
- Approval routes remain decision-only.
- Wake route cannot receive or execute tool input from HTTP.

**Rollback/Escalation:**

- Escalate if route auth cannot be preserved without changing `http-handler.ts`.

## Task 4: Scheduler Readiness And Review Evidence

**Files:**
- Create: `docs/agentic/claims/task-4-agent-scheduler-readiness.md`
- Modify: `docs/agentic/software-factory.md`
- Modify: `docs/superpowers/plans/2026-07-09-mvp-resident-agent-scheduler-resumer-implementation.md`

**Interfaces:**
- Consumes: all Task 1-3 implementation outputs.
- Produces: readiness evidence and final review handoff.

- [x] **Step 1: Claim the task**

Create `docs/agentic/claims/task-4-agent-scheduler-readiness.md`:

```markdown
# Task 4 Claim: Agent Scheduler Readiness

Plan: `docs/superpowers/plans/2026-07-09-mvp-resident-agent-scheduler-resumer-implementation.md`
Task: Task 4: Scheduler Readiness And Review Evidence
Branch: `codex/mvp-resident-agent-scheduler-resumer-plan`
Status: claimed

## Owned Files

- `docs/agentic/claims/task-4-agent-scheduler-readiness.md`
- `docs/agentic/software-factory.md`
- `docs/superpowers/plans/2026-07-09-mvp-resident-agent-scheduler-resumer-implementation.md`

## Verification

- Focused: `npm test -- packages/agent/test/scheduler-types.test.ts packages/agent/test/scheduler.test.ts packages/agent/test/tool-gateway.test.ts packages/agent/test/runtime.test.ts packages/local-runtime/test/agent-http-routes.test.ts packages/local-runtime/test/agent-approval-routes.test.ts`
- Full: `npm run verify`
- Whitespace: `git diff --check`
- Factory: `npm run factory:check`
```

Then change `Status: claimed` to `Status: in-progress`.

Recorded: `docs/agentic/claims/task-4-agent-scheduler-readiness.md` was created from the brief and moved to `Status: in-progress` before edits to `docs/agentic/software-factory.md` or this plan.

- [x] **Step 2: Run focused verification**

Run:

```bash
npm test -- packages/agent/test/scheduler-types.test.ts packages/agent/test/scheduler.test.ts packages/agent/test/tool-gateway.test.ts packages/agent/test/runtime.test.ts packages/local-runtime/test/agent-http-routes.test.ts packages/local-runtime/test/agent-approval-routes.test.ts
```

Expected:

```text
Test Files  6 passed
```

Observed:

```text
Test Files  6 passed (6)
Tests  97 passed (97)
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

Observed:

```text
typecheck passed
Test Files  145 passed | 1 skipped (146)
Tests  1404 passed | 1 skipped (1405)
tests passed
vite build succeeded
factory-readiness passed
```

- [x] **Step 4: Check whitespace and factory readiness**

Run:

```bash
git diff --check
npm run factory:check
```

Expected:

```text
git diff --check has no output
factory-readiness passed
```

Observed:

```text
git diff --check
no output

npm run factory:check
factory-readiness passed
```

- [x] **Step 5: Record readiness evidence**

Append a `Resident Agent Scheduler Resumer Readiness` section to `docs/agentic/software-factory.md` with:

- plan path;
- focused verification command and result;
- full `npm run verify` result;
- `git diff --check` result;
- `npm run factory:check` result;
- statement that the scheduler derives state from the append-only ledger and projection;
- statement that wake is one-pass and the route accepts no tool input;
- statement that consume-time validation rechecks independent human approval, causation, approval class, exact preview hash, current descriptor preview, active locks, source/provenance/artifact hashes, projection/read-model freshness, terminal state, and secret-safety;
- statement that completions and failures are recorded through the existing gateway;
- statement that provider byte transfer, PRR send/follow-up, legal escalation, export/publication, destructive repair, accepted graph review, and legacy staging remain descriptor/domain-service follow-up work and are not executed directly in this branch.

Recorded: `docs/agentic/software-factory.md` now includes `Resident Agent Scheduler Resumer Readiness` with the plan path, exact verification evidence, append-only ledger/projection source of scheduler state, one-pass wake and no-tool-input route boundary, consume-time validation list, gateway completion/failure recording, and deferred descriptor/domain-service scope statement.

- [x] **Step 6: Commit readiness**

Run:

```bash
git add docs/agentic/claims/task-4-agent-scheduler-readiness.md docs/agentic/software-factory.md docs/superpowers/plans/2026-07-09-mvp-resident-agent-scheduler-resumer-implementation.md
git commit -m "docs: record agent scheduler readiness"
```

**Acceptance Criteria:**

- Focused scheduler, gateway, runtime, and route tests pass.
- `npm run verify` passes.
- `git diff --check` has no output.
- `npm run factory:check` passes.
- Readiness notes preserve append-only ledger semantics, provenance, projection rebuildability, human approval gates, legal locks, and secret-safe diagnostics.

**Rollback/Escalation:**

- Escalate if full verification fails twice after focused repair attempts.

## Completion Criteria

The scheduler/resumer foundation is complete when:

- Scheduler DTOs and descriptor interfaces are exported and stable.
- Other threads can register `AgentApprovedToolExecutorDescriptor` implementations without changing the scheduler contract.
- The scheduler derives approved open work from ledger/projection state.
- `wake()` performs a bounded one-pass inspection and resume attempt.
- Consume-time validation rejects stale, forged, locked, unprovenanced, projection-lagged, missing-descriptor, terminal, and secret-unsafe requests.
- Successful approved execution appends `agent.tool.completed` through the gateway.
- Failed consume-time validation or execution appends `agent.tool.failed` through the gateway.
- `POST /api/agent/scheduler/wake` is local/authenticated, accepts no tool input, and returns the stable wake DTO.
- No PRR send, provider byte transfer, legal escalation, export/publication, destructive repair, accepted graph review, or legacy staging is directly executed.
- `npm run verify` passes.
- Readiness evidence is recorded.

## Deferred Follow-Up Plans

Create separate approved plans for:

- provider byte transfer descriptor and ingestion/model-provider domain adapter;
- PRR send and follow-up descriptor through PRR correspondence services;
- legal escalation descriptor through PRR/governance legal confirmation semantics;
- export and publication descriptor through governance export/report services;
- destructive repair and projection rebuild execution gates;
- accepted graph review descriptor through ontology review services;
- legacy staging descriptor through evidence-first import/staging services;
- specialist workflow orchestration that emits descriptor-backed tool requests.

## Plan Self-Review

- Spec coverage: the plan covers scheduler/resumer contracts, descriptor injection, one-pass wake behavior, consume-time validation, gateway completion/failure recording, and the HTTP wake route.
- Scope boundary: the plan avoids specialist semantics and only uses fake descriptors in tests.
- Placeholder scan: no step uses reserved placeholder language or undefined file ownership.
- Type consistency: `AgentApprovedToolExecutorDescriptor`, `AgentSchedulerWakeResultDto`, and `hashAgentToolPreview` are defined in Task 1 and consumed by later tasks.
- Verification: each implementation task has a targeted red/green command, and Task 4 requires full `npm run verify`.
