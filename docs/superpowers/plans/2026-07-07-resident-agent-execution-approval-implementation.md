# Resident Agent Execution And Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first resident-agent execution and approval slice: execution state contracts, context-pack interfaces, approval queue DTOs, and fake scheduler/resume tests.

**Architecture:** The resident-agent foundation remains the prerequisite. This slice adds a `packages/agent` scheduler/resumer contract layer that derives execution state from agent events, builds inspectable context-pack descriptors, projects approval queue DTOs, and proves fake approval/resume behavior without live providers or risky domain execution. The tool gateway still appends and validates tool requests and approvals; execution logic schedules, pauses, verifies resumability, and records fake results only.

**Tech Stack:** TypeScript, Zod, Vitest, existing ontology `EventLedger`, foundation `packages/agent` projection/provider/tool-gateway modules, and secret-safe DTO helpers.

---

## Prerequisites

This plan starts only after `docs/superpowers/plans/2026-07-07-cestus-resident-agent-implementation.md` has landed or is available in the worktree. Stop if these foundation pieces are absent:

- `packages/agent/src/projection.ts`
- `packages/agent/src/projection-types.ts`
- `packages/agent/src/tool-gateway.ts`
- `packages/agent/src/provider.ts`
- `packages/agent/src/secret-safety.ts`
- `packages/ontology/src/contracts.ts` with `agent.*` event contracts and actor kind `agent`

Do not implement live provider adapters, PRR send execution, provider byte transfer, legal escalation, export/publication execution, destructive repair execution, accepted graph review execution, or rich specialist workflows in this slice.

## Scope Boundary

Included:

- Execution state and transition contracts.
- Blocked and failure categories.
- Context pack descriptor interfaces and deterministic context pack hashes.
- Approval queue DTOs with approval class, preview hash, stale status, affected refs, and risk fields.
- Fake scheduler/resumer tests that prove approval does not execute directly and stale approvals fail closed.
- Secret-safety checks for execution diagnostics and context pack summaries.

Deferred:

- Local runtime approval routes and CLI commands.
- Browser approval cockpit UI.
- Domain execution adapters for provider transfer, PRR send/follow-up, legal escalation, export/publication, destructive repair, and accepted graph review.
- Live provider credentials or external service calls.
- Team role policy beyond the human actor requirement already present in foundation approvals.

## Hard Invariants

- The agent cannot approve its own requests.
- The agent cannot clear legal, export, data-loss, governance, secret, or workspace locks.
- The agent cannot send PRRs or external messages.
- The agent cannot transfer provider bytes.
- The agent cannot export sensitive material.
- The agent cannot accept graph truth without the exact existing human and domain gates.
- Tool approvals bind exact preview hashes and fail closed when stale.
- Memory and context packs cannot become accepted graph state.
- Diagnostics and DTOs must remain secret-safe.

## File Structure

- `packages/agent/src/execution-types.ts`: execution states, blocked categories, transition guard helpers, and DTO-safe run state types.
- `packages/agent/src/context-packs.ts`: context pack descriptor contracts, normalized context pack refs, hash helper, registry helper, and test fake pack builders.
- `packages/agent/src/approval-queue.ts`: approval queue DTOs and projector over agent projection/tool request state plus current context pack refs.
- `packages/agent/src/execution-loop.ts`: fake scheduler/resumer service that pauses for approval, validates approved preview hashes, rejects stale approvals, and records fake completion/failure.
- `packages/agent/src/index.ts`: exports the new modules.
- `packages/agent/test/execution-types.test.ts`: state transition and category tests.
- `packages/agent/test/context-packs.test.ts`: descriptor, hash, provenance, budget, and secret-safety tests.
- `packages/agent/test/approval-queue.test.ts`: queue DTO and stale approval tests.
- `packages/agent/test/execution-loop.test.ts`: fake scheduler and resume tests.
- `docs/agentic/software-factory.md`: readiness note after the slice passes.
- `docs/superpowers/plans/2026-07-07-resident-agent-execution-approval-implementation.md`: progress checkboxes and final evidence.

## Review Gates

- Gate A after Tasks 1 and 2: contract review for state machine, blocked categories, context pack descriptors, stable hashing, provenance, and secret safety.
- Gate B after Tasks 3 and 4: scheduler review for preview hash binding, self-approval rejection, stale approval rejection, and fake resume behavior.
- Gate C after Task 5: factory readiness review before merge.

## Task 1: Execution State Contracts

**Files:**
- Create: `packages/agent/src/execution-types.ts`
- Create: `packages/agent/test/execution-types.test.ts`
- Modify: `packages/agent/src/index.ts`

- [x] **Step 1: Write the failing execution state tests**

Create `packages/agent/test/execution-types.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  agentExecutionBlockedCategorySchema,
  agentExecutionStateSchema,
  assertAgentExecutionTransition,
  canAgentExecutionTransition
} from "../src/execution-types.js";

describe("resident agent execution state contracts", () => {
  it("accepts the conservative execution state vocabulary", () => {
    expect(agentExecutionStateSchema.options).toEqual([
      "created",
      "queued",
      "running",
      "waiting-for-approval",
      "approved-resumable",
      "blocked",
      "completed",
      "failed",
      "canceled"
    ]);
  });

  it("accepts first-class blocked and failure categories", () => {
    expect(agentExecutionBlockedCategorySchema.options).toContain("approval-stale");
    expect(agentExecutionBlockedCategorySchema.options).toContain("lock-active");
    expect(agentExecutionBlockedCategorySchema.options).toContain("missing-provenance");
    expect(agentExecutionBlockedCategorySchema.options).toContain("secret-detected");
    expect(agentExecutionBlockedCategorySchema.options).toContain("provider-unavailable");
    expect(agentExecutionBlockedCategorySchema.options).toContain("data-loss-risk");
  });

  it("permits the approved resume path and rejects unsafe shortcuts", () => {
    expect(canAgentExecutionTransition("created", "queued")).toBe(true);
    expect(canAgentExecutionTransition("queued", "running")).toBe(true);
    expect(canAgentExecutionTransition("running", "waiting-for-approval")).toBe(true);
    expect(canAgentExecutionTransition("waiting-for-approval", "approved-resumable")).toBe(true);
    expect(canAgentExecutionTransition("approved-resumable", "running")).toBe(true);
    expect(canAgentExecutionTransition("running", "completed")).toBe(true);

    expect(canAgentExecutionTransition("waiting-for-approval", "completed")).toBe(false);
    expect(canAgentExecutionTransition("approved-resumable", "completed")).toBe(false);
    expect(() => assertAgentExecutionTransition("waiting-for-approval", "completed")).toThrow(/Invalid agent execution transition/);
  });
});
```

- [x] **Step 2: Run the targeted failing test**

Run:

```bash
npm test -- packages/agent/test/execution-types.test.ts
```

Expected before implementation:

```text
Failed to resolve import "../src/execution-types.js"
```

- [x] **Step 3: Add execution state contracts**

Create `packages/agent/src/execution-types.ts`:

```ts
import { z } from "zod";

export const agentExecutionStateSchema = z.enum([
  "created",
  "queued",
  "running",
  "waiting-for-approval",
  "approved-resumable",
  "blocked",
  "completed",
  "failed",
  "canceled"
]);

export const agentExecutionBlockedCategorySchema = z.enum([
  "approval-required",
  "approval-denied",
  "approval-stale",
  "provider-unavailable",
  "provider-rate-limited",
  "credential-missing",
  "credential-revoked",
  "model-output-invalid",
  "secret-detected",
  "permission-denied",
  "lock-active",
  "projection-lag",
  "context-budget-exceeded",
  "missing-provenance",
  "domain-gate-failed",
  "stale-source",
  "external-effect-failed",
  "data-loss-risk"
]);

export type AgentExecutionState = z.infer<typeof agentExecutionStateSchema>;
export type AgentExecutionBlockedCategory = z.infer<typeof agentExecutionBlockedCategorySchema>;

export interface AgentExecutionDiagnosticDto {
  readonly category: AgentExecutionBlockedCategory;
  readonly message: string;
  readonly retryable: boolean;
  readonly allowedRepairActions: readonly string[];
  readonly relatedEventIds: readonly string[];
  readonly artifactHashes: readonly string[];
}

const allowedTransitions = new Map<AgentExecutionState, ReadonlySet<AgentExecutionState>>([
  ["created", new Set(["queued", "canceled"])],
  ["queued", new Set(["running", "blocked", "canceled"])],
  ["running", new Set(["waiting-for-approval", "blocked", "completed", "failed", "canceled"])],
  ["waiting-for-approval", new Set(["approved-resumable", "blocked", "failed", "canceled"])],
  ["approved-resumable", new Set(["running", "blocked", "failed", "canceled"])],
  ["blocked", new Set(["queued", "canceled"])],
  ["completed", new Set()],
  ["failed", new Set(["queued", "canceled"])],
  ["canceled", new Set()]
]);

export function canAgentExecutionTransition(from: AgentExecutionState, to: AgentExecutionState): boolean {
  return allowedTransitions.get(from)?.has(to) ?? false;
}

export function assertAgentExecutionTransition(from: AgentExecutionState, to: AgentExecutionState): void {
  if (!canAgentExecutionTransition(from, to)) {
    throw new Error(`Invalid agent execution transition from ${from} to ${to}`);
  }
}
```

Modify `packages/agent/src/index.ts`:

```ts
export * from "./execution-types.js";
```

Preserve all existing exports in the file.

- [x] **Step 4: Run the targeted passing test**

Run:

```bash
npm test -- packages/agent/test/execution-types.test.ts
```

Expected:

```text
Test Files  1 passed
```

- [x] **Step 5: Commit**

Run:

```bash
git add packages/agent/src/execution-types.ts packages/agent/src/index.ts packages/agent/test/execution-types.test.ts
git commit -m "feat: add agent execution state contracts"
```

**Acceptance Criteria:**

- Execution states match the approved conservative lifecycle.
- Waiting approval cannot transition directly to completed.
- Approved resumable cannot transition directly to completed.
- Blocked categories include stale approval, active lock, missing provenance, secret detection, provider unavailable, and data-loss risk.

**Rollback/Escalation:**

- Escalate if the foundation package lacks `packages/agent/src/index.ts` or if the existing projection uses an incompatible state vocabulary that cannot be adapted without changing event schemas.

## Task 2: Context Pack Descriptor Registry

**Files:**
- Create: `packages/agent/src/context-packs.ts`
- Create: `packages/agent/test/context-packs.test.ts`
- Modify: `packages/agent/src/index.ts`

- [x] **Step 1: Write the failing context pack tests**

Create `packages/agent/test/context-packs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildContextPackRef,
  contextPackDescriptorSchema,
  contextPackRefSchema,
  createContextPackRegistry,
  hashAgentContextPack
} from "../src/context-packs.js";

describe("agent context packs", () => {
  it("validates descriptor metadata for explicit context assembly", () => {
    const descriptor = contextPackDescriptorSchema.parse({
      contextPackId: "accepted-graph-projection.v1",
      version: 1,
      label: "Accepted graph projection",
      maxBytes: 32_768,
      requiredProvenanceKinds: ["event-id", "content-hash"],
      redactionPolicy: "safe-summary",
      sourceProjection: "ontology.graph"
    });

    expect(descriptor.contextPackId).toBe("accepted-graph-projection.v1");
  });

  it("builds stable context pack hashes from sorted JSON", () => {
    const left = hashAgentContextPack({ b: 2, a: 1 });
    const right = hashAgentContextPack({ a: 1, b: 2 });

    expect(left).toBe(right);
    expect(left).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("rejects secret-shaped summaries and refs", () => {
    expect(() =>
      contextPackRefSchema.parse({
        contextPackId: "evidence-summary.v1",
        version: 1,
        contentHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
        generatedAt: "2026-07-07T22:00:00.000Z",
        safeSummary: "api key sk-live-value",
        provenanceRefs: []
      })
    ).toThrow(/secret/i);
  });

  it("registers fake context builders by stable id", async () => {
    const registry = createContextPackRegistry();
    registry.register({
      descriptor: {
        contextPackId: "task-run-history.v1",
        version: 1,
        label: "Task and run history",
        maxBytes: 16_384,
        requiredProvenanceKinds: ["event-id"],
        redactionPolicy: "safe-summary",
        sourceProjection: "agent.projection"
      },
      async build() {
        return buildContextPackRef({
          contextPackId: "task-run-history.v1",
          version: 1,
          generatedAt: "2026-07-07T22:00:00.000Z",
          payload: { events: ["evt_agent_task"] },
          safeSummary: "One prior task event.",
          provenanceRefs: ["evt_agent_task"]
        });
      }
    });

    await expect(registry.build("task-run-history.v1")).resolves.toMatchObject({
      contextPackId: "task-run-history.v1",
      provenanceRefs: ["evt_agent_task"]
    });
  });
});
```

- [x] **Step 2: Run the targeted failing test**

Run:

```bash
npm test -- packages/agent/test/context-packs.test.ts
```

Expected before implementation:

```text
Failed to resolve import "../src/context-packs.js"
```

- [x] **Step 3: Add context pack descriptor contracts**

Create `packages/agent/src/context-packs.ts` with:

- `contextPackDescriptorSchema`
- `contextPackRefSchema`
- `hashAgentContextPack(value)`
- `buildContextPackRef(input)`
- `createContextPackRegistry()`

Implementation requirements:

- Use `node:crypto` `createHash`.
- Use stable JSON with sorted object keys for hashes.
- Accept JSON DTO-safe values only.
- Reject secret-shaped text using `assertAgentSecretSafeText` from `secret-safety.ts`.
- Freeze returned refs and registry snapshots.
- Registry duplicate IDs throw `Context pack <id> is already registered`.
- Missing builder IDs throw `Context pack <id> is not registered`.

- [x] **Step 4: Export context pack surface**

Modify `packages/agent/src/index.ts`:

```ts
export * from "./context-packs.js";
```

Preserve existing exports.

- [x] **Step 5: Run targeted tests**

Run:

```bash
npm test -- packages/agent/test/context-packs.test.ts packages/agent/test/provider.test.ts
```

Expected:

```text
Test Files  2 passed
```

- [x] **Step 6: Commit**

Run:

```bash
git add packages/agent/src/context-packs.ts packages/agent/src/index.ts packages/agent/test/context-packs.test.ts
git commit -m "feat: add agent context pack registry"
```

**Acceptance Criteria:**

- Context packs are explicit descriptor-backed inputs.
- Context pack refs include content hash, generated timestamp, safe summary, and provenance refs.
- Hashes are stable across object key ordering.
- Secret-shaped summaries fail closed.

**Rollback/Escalation:**

- Escalate if context pack refs require raw evidence bodies, credential names, or browser-unsafe values to satisfy tests.

## Task 3: Approval Queue DTOs

**Files:**
- Create: `packages/agent/src/approval-queue.ts`
- Create: `packages/agent/test/approval-queue.test.ts`
- Modify: `packages/agent/src/index.ts`

- [x] **Step 1: Write the failing approval queue tests**

Create `packages/agent/test/approval-queue.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildAgentApprovalQueue,
  type AgentApprovalQueueInput
} from "../src/approval-queue.js";

const baseRequest = {
  toolRequestId: "toolreq_provider_preview",
  runId: "run_provider_readiness",
  taskId: "task_provider_readiness",
  toolId: "provider.parse.preview",
  toolVersion: 1,
  sideEffectClass: "external-byte-transfer",
  requiredApprovalClass: "provider-byte-transfer",
  previewHash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
  previewSummary: "Send two evidence excerpts to a configured provider.",
  affectedRefs: [{ kind: "evidence", id: "ev_contract_001", hash: "sha256:3333333333333333333333333333333333333333333333333333333333333333" }],
  contextPackRefs: [{
    contextPackId: "evidence-summary.v1",
    version: 1,
    contentHash: "sha256:4444444444444444444444444444444444444444444444444444444444444444",
    generatedAt: "2026-07-07T22:00:00.000Z",
    safeSummary: "Evidence summary for one artifact.",
    provenanceRefs: ["evt_evidence_001"]
  }],
  requestedAt: "2026-07-07T22:00:00.000Z",
  state: "requested"
} as const;

describe("agent approval queue", () => {
  it("projects pending approvals with exact preview hash and risk fields", () => {
    const queue = buildAgentApprovalQueue({
      now: "2026-07-07T22:01:00.000Z",
      requests: [baseRequest],
      approvals: [],
      denials: [],
      completed: [],
      failures: [],
      currentPreviewHashes: { toolreq_provider_preview: baseRequest.previewHash },
      activeLocks: []
    });

    expect(queue.pending).toHaveLength(1);
    expect(queue.pending[0]).toMatchObject({
      toolRequestId: "toolreq_provider_preview",
      approvalClass: "provider-byte-transfer",
      stale: false,
      executableByApproval: false
    });
    expect(queue.pending[0]?.previewHash).toBe(baseRequest.previewHash);
  });

  it("marks approval stale when the current preview hash differs", () => {
    const input: AgentApprovalQueueInput = {
      now: "2026-07-07T22:01:00.000Z",
      requests: [baseRequest],
      approvals: [{
        toolRequestId: "toolreq_provider_preview",
        approvedBy: "actor_case_owner",
        approvedPreviewHash: baseRequest.previewHash,
        approvedAt: "2026-07-07T22:02:00.000Z",
        rationale: "Approved the listed excerpts."
      }],
      denials: [],
      completed: [],
      failures: [],
      currentPreviewHashes: {
        toolreq_provider_preview: "sha256:5555555555555555555555555555555555555555555555555555555555555555"
      },
      activeLocks: []
    };

    const queue = buildAgentApprovalQueue(input);

    expect(queue.stale.map((item) => item.toolRequestId)).toEqual(["toolreq_provider_preview"]);
    expect(queue.resumable).toHaveLength(0);
  });

  it("keeps approved items non-resumable when a lock is active", () => {
    const queue = buildAgentApprovalQueue({
      now: "2026-07-07T22:01:00.000Z",
      requests: [baseRequest],
      approvals: [{
        toolRequestId: "toolreq_provider_preview",
        approvedBy: "actor_case_owner",
        approvedPreviewHash: baseRequest.previewHash,
        approvedAt: "2026-07-07T22:02:00.000Z",
        rationale: "Approved the listed excerpts."
      }],
      denials: [],
      completed: [],
      failures: [],
      currentPreviewHashes: { toolreq_provider_preview: baseRequest.previewHash },
      activeLocks: [{ lockId: "lock_export", category: "export", message: "Export lock active." }]
    });

    expect(queue.blocked[0]?.blockingReasons).toContain("lock-active");
    expect(queue.resumable).toHaveLength(0);
  });
});
```

- [x] **Step 2: Run the targeted failing test**

Run:

```bash
npm test -- packages/agent/test/approval-queue.test.ts
```

Expected before implementation:

```text
Failed to resolve import "../src/approval-queue.js"
```

- [x] **Step 3: Add approval queue DTO builder**

Create `packages/agent/src/approval-queue.ts`.

Implementation requirements:

- Define `AgentApprovalClass` values:
  - `provider-byte-transfer`
  - `prr-send-followup`
  - `legal-escalation`
  - `export-publication`
  - `destructive-repair`
  - `accepted-graph-review`
  - `ledger-review`
- Define DTOs for affected refs, active locks, approvals, denials, completions, failures, queue items, and queue output.
- `buildAgentApprovalQueue(input)` returns frozen arrays: `pending`, `resumable`, `blocked`, `stale`, `denied`, `completed`, `failed`.
- `executableByApproval` is always false. Approval never executes the tool directly.
- An approved item is resumable only when the approved hash matches current hash, no denial exists, no completion exists, no failure exists, and no active lock applies.
- Stale items include blocking reason `approval-stale`.
- Locked items include blocking reason `lock-active`.
- All messages and summaries pass `assertAgentSecretSafeText`.

- [x] **Step 4: Export approval queue surface**

Modify `packages/agent/src/index.ts`:

```ts
export * from "./approval-queue.js";
```

Preserve existing exports.

- [x] **Step 5: Run targeted tests**

Run:

```bash
npm test -- packages/agent/test/approval-queue.test.ts packages/agent/test/context-packs.test.ts packages/agent/test/execution-types.test.ts
```

Expected:

```text
Test Files  3 passed
```

- [x] **Step 6: Commit**

Run:

```bash
git add packages/agent/src/approval-queue.ts packages/agent/src/index.ts packages/agent/test/approval-queue.test.ts
git commit -m "feat: add agent approval queue dto"
```

**Acceptance Criteria:**

- Queue DTOs show exact preview hash, approval class, affected refs, stale status, locks, and safe risk details.
- Approved requests are resumable only after runtime checks, not executable by the approval event itself.
- Active locks block resumability.

**Rollback/Escalation:**

- Escalate if an approval DTO needs to call PRR send, provider transfer, export, repair, or accepted graph services to compute queue state.

## Task 4: Fake Scheduler And Resumer

**Files:**
- Create: `packages/agent/src/execution-loop.ts`
- Create: `packages/agent/test/execution-loop.test.ts`
- Modify: `packages/agent/src/index.ts`

- [x] **Step 1: Write failing fake execution tests**

Create `packages/agent/test/execution-loop.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import {
  createFakeAgentExecutionLoop,
  type FakeAgentToolExecutor
} from "../src/execution-loop.js";

const agentActor = { id: "actor_cestus_agent", kind: "agent" as const, label: "Cestus Agent" };
const humanActor = { id: "actor_case_owner", kind: "human" as const, label: "Case Owner" };

describe("resident agent fake execution loop", () => {
  it("pauses for approval without executing the requested tool", async () => {
    const ledger = new InMemoryEventLedger();
    const executor: FakeAgentToolExecutor = {
      async execute() {
        throw new Error("executor should not run before approval");
      }
    };
    const loop = createFakeAgentExecutionLoop({
      ledger,
      actor: agentActor,
      now: () => "2026-07-07T23:00:00.000Z",
      executor
    });

    const result = await loop.requestApprovalOnly({
      taskId: "task_provider_readiness",
      runId: "run_provider_readiness",
      toolRequestId: "toolreq_provider_preview",
      toolId: "provider.parse.preview",
      toolVersion: 1,
      sideEffectClass: "external-byte-transfer",
      approvalClass: "provider-byte-transfer",
      preview: {
        summary: "Send two evidence excerpts to a configured provider.",
        affectedRefs: ["ev_contract_001"]
      }
    });

    expect(result.state).toBe("waiting-for-approval");
    expect((await ledger.readAll()).map((event) => event.type)).toContain("agent.tool.requested");
  });

  it("rejects agent self-approval before resume", async () => {
    const ledger = new InMemoryEventLedger();
    const loop = createFakeAgentExecutionLoop({
      ledger,
      actor: agentActor,
      now: () => "2026-07-07T23:00:00.000Z",
      executor: { async execute() { return { eventIds: [], artifactHashes: [], readModelChanges: [] }; } }
    });
    const requested = await loop.requestApprovalOnly({
      taskId: "task_provider_readiness",
      runId: "run_provider_readiness",
      toolRequestId: "toolreq_provider_preview",
      toolId: "provider.parse.preview",
      toolVersion: 1,
      sideEffectClass: "external-byte-transfer",
      approvalClass: "provider-byte-transfer",
      preview: { summary: "Provider preview.", affectedRefs: ["ev_contract_001"] }
    });

    await expect(
      loop.approveForTest({
        toolRequestId: "toolreq_provider_preview",
        actor: agentActor,
        approvedPreviewHash: requested.previewHash,
        rationale: "Agent cannot approve itself."
      })
    ).rejects.toThrow(/human/i);
  });

  it("resumes after exact human approval and records fake completion", async () => {
    const ledger = new InMemoryEventLedger();
    let executions = 0;
    const loop = createFakeAgentExecutionLoop({
      ledger,
      actor: agentActor,
      now: () => "2026-07-07T23:00:00.000Z",
      executor: {
        async execute(input) {
          executions += 1;
          expect(input.toolRequestId).toBe("toolreq_provider_preview");
          return {
            eventIds: ["evt_fake_domain_result"],
            artifactHashes: ["sha256:6666666666666666666666666666666666666666666666666666666666666666"],
            readModelChanges: ["fake approval resume complete"]
          };
        }
      }
    });
    const requested = await loop.requestApprovalOnly({
      taskId: "task_provider_readiness",
      runId: "run_provider_readiness",
      toolRequestId: "toolreq_provider_preview",
      toolId: "provider.parse.preview",
      toolVersion: 1,
      sideEffectClass: "external-byte-transfer",
      approvalClass: "provider-byte-transfer",
      preview: { summary: "Provider preview.", affectedRefs: ["ev_contract_001"] }
    });
    await loop.approveForTest({
      toolRequestId: "toolreq_provider_preview",
      actor: humanActor,
      approvedPreviewHash: requested.previewHash,
      rationale: "Human approved the exact preview."
    });

    const resumed = await loop.resumeApprovedTool({
      toolRequestId: "toolreq_provider_preview",
      currentPreviewHash: requested.previewHash,
      activeLocks: []
    });

    expect(resumed.state).toBe("completed");
    expect(executions).toBe(1);
    expect((await ledger.readAll()).map((event) => event.type)).toContain("agent.tool.completed");
  });

  it("fails closed when approval is stale", async () => {
    const ledger = new InMemoryEventLedger();
    const loop = createFakeAgentExecutionLoop({
      ledger,
      actor: agentActor,
      now: () => "2026-07-07T23:00:00.000Z",
      executor: { async execute() { throw new Error("executor should not run for stale approval"); } }
    });
    const requested = await loop.requestApprovalOnly({
      taskId: "task_provider_readiness",
      runId: "run_provider_readiness",
      toolRequestId: "toolreq_provider_preview",
      toolId: "provider.parse.preview",
      toolVersion: 1,
      sideEffectClass: "external-byte-transfer",
      approvalClass: "provider-byte-transfer",
      preview: { summary: "Provider preview.", affectedRefs: ["ev_contract_001"] }
    });
    await loop.approveForTest({
      toolRequestId: "toolreq_provider_preview",
      actor: humanActor,
      approvedPreviewHash: requested.previewHash,
      rationale: "Human approved the exact preview."
    });

    await expect(
      loop.resumeApprovedTool({
        toolRequestId: "toolreq_provider_preview",
        currentPreviewHash: "sha256:7777777777777777777777777777777777777777777777777777777777777777",
        activeLocks: []
      })
    ).rejects.toThrow(/stale/i);
    expect((await ledger.readAll()).map((event) => event.type)).toContain("agent.tool.failed");
  });
});
```

- [x] **Step 2: Run the targeted failing test**

Run:

```bash
npm test -- packages/agent/test/execution-loop.test.ts
```

Expected before implementation:

```text
Failed to resolve import "../src/execution-loop.js"
```

- [x] **Step 3: Add fake execution loop**

Create `packages/agent/src/execution-loop.ts`.

Implementation requirements:

- Export `FakeAgentToolExecutor`.
- Export `createFakeAgentExecutionLoop(input)`.
- `requestApprovalOnly()` appends `agent.tool.requested` through the foundation tool gateway or an equivalent typed append if the gateway API already provides it.
- `requestApprovalOnly()` returns state `waiting-for-approval` and the preview hash.
- `approveForTest()` exists only for tests in this slice and rejects non-human actors.
- `resumeApprovedTool()` reads the request and approval events, verifies exact preview hash, rejects active locks, calls the fake executor, and appends `agent.tool.completed`.
- A stale preview appends `agent.tool.failed` with category `approval-stale` and does not call the executor.
- Active locks append `agent.tool.failed` with category `lock-active` and do not call the executor.
- The fake executor cannot send external messages, transfer bytes, export material, repair canonical state, or accept graph truth because it returns event IDs and artifact hashes only.

- [x] **Step 4: Export execution loop surface**

Modify `packages/agent/src/index.ts`:

```ts
export * from "./execution-loop.js";
```

Preserve existing exports.

- [x] **Step 5: Run targeted tests**

Run:

```bash
npm test -- packages/agent/test/execution-loop.test.ts packages/agent/test/approval-queue.test.ts packages/agent/test/context-packs.test.ts packages/agent/test/execution-types.test.ts
```

Expected:

```text
Test Files  4 passed
```

- [x] **Step 6: Commit**

Run:

```bash
git add packages/agent/src/execution-loop.ts packages/agent/src/index.ts packages/agent/test/execution-loop.test.ts
git commit -m "feat: add fake agent scheduler resume loop"
```

**Acceptance Criteria:**

- Scheduler requests approval without executing the fake tool.
- Agent actors cannot approve.
- Exact human approval can become resumable through runtime checks.
- Stale approval fails closed and records a failure event.
- The fake executor cannot perform live provider, PRR, export, repair, or accepted graph effects.

**Rollback/Escalation:**

- Escalate if foundation tool-gateway APIs make it impossible to append a request without executing a tool.

**Implementation Evidence:**

- Initial fake loop commit: `954d727 feat: add fake agent scheduler resume loop`
- Review-loop hardening commits: `40a61b5`, `b5d06b0`, `135ac64`, `6250161`, `b05a9bf`, `ce6e65a`, `f3cb726`, `7bfda69`, `9dd1fa5`
- Final focused pass: `npm test -- packages/agent/test/execution-loop.test.ts packages/agent/test/tool-gateway.test.ts packages/agent/test/approval-queue.test.ts packages/agent/test/context-packs.test.ts packages/agent/test/execution-types.test.ts` passed with 5 files and 90 tests.
- Full gate: `npm run verify` passed with typecheck, 123 test files, 1187 tests, Vite build, and factory-readiness.
- Whitespace: `git diff --check` passed with no output.
- Final spec compliance reviewer `Meitner`: approved with no findings at `9dd1fa5`.
- Final code quality reviewer `Laplace`: approved with no findings at `9dd1fa5`.
- Accepted residual: active-lock failures emit schema-compatible `legal-lock-active` because the landed ontology/gateway failure category schema does not yet include generic `lock-active`.

## Task 5: Readiness And Review Evidence

**Files:**
- Modify: `docs/agentic/software-factory.md`
- Modify: `docs/superpowers/plans/2026-07-07-resident-agent-execution-approval-implementation.md`

- [ ] **Step 1: Run the focused verification bundle**

Run:

```bash
npm test -- packages/agent/test/execution-types.test.ts packages/agent/test/context-packs.test.ts packages/agent/test/approval-queue.test.ts packages/agent/test/execution-loop.test.ts
```

Expected:

```text
Test Files  4 passed
```

- [ ] **Step 2: Run full verification**

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

- [ ] **Step 3: Check whitespace**

Run:

```bash
git diff --check
```

Expected:

```text
no output
```

- [ ] **Step 4: Append readiness evidence**

Append a `Resident Agent Execution And Approval Readiness` section to `docs/agentic/software-factory.md` with:

- spec path
- plan path
- focused verification command
- full verification command
- statement that the slice uses fake execution only
- statement that approval does not execute tools directly
- statement that live provider, PRR send, legal escalation, export/publication, destructive repair, and accepted graph review execution remain follow-up slices

- [ ] **Step 5: Commit readiness evidence**

Run:

```bash
git add docs/agentic/software-factory.md docs/superpowers/plans/2026-07-07-resident-agent-execution-approval-implementation.md
git commit -m "docs: record agent execution approval readiness"
```

**Acceptance Criteria:**

- Focused tests pass.
- `npm run verify` passes.
- `git diff --check` has no output.
- Readiness notes preserve the no-hidden-executor boundary.

**Rollback/Escalation:**

- Escalate if full verification fails repeatedly after two focused repair attempts.

## Completion Criteria

The first execution and approval slice is complete when:

- Execution state contracts exist and pass focused tests.
- Context pack descriptors exist and produce stable hashes.
- Approval queue DTOs distinguish pending, resumable, blocked, stale, denied, completed, and failed states.
- Fake scheduler/resumer tests prove approval does not execute directly.
- Agent self-approval is rejected.
- Stale approvals fail closed.
- No live provider, PRR send, legal escalation, export/publication, destructive repair, or accepted graph review execution path is introduced.
- `npm run verify` passes.
- Readiness evidence is recorded.

## Deferred Follow-Up Plans

After this slice, create separate approved plans for:

- local runtime approval routes and CLI commands;
- browser approval cockpit UI;
- provider byte transfer domain adapter;
- PRR send and follow-up domain adapter;
- legal escalation review workflow;
- export and publication workflow;
- destructive repair and projection rebuild execution gates;
- accepted graph review cockpit integration;
- rich specialist orchestration;
- live provider and team hardening.
