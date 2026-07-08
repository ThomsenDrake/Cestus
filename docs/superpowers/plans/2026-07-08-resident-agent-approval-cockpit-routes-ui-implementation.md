# Resident Agent Approval Cockpit Routes And UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an investigator-facing accountability cockpit for reviewing and deciding resident-agent tool approvals, with the first polished path focused on provider byte-transfer requests.

**Architecture:** Reuse the landed `packages/agent` tool gateway and approval queue contracts. Add a browser-safe approval cockpit DTO builder that enriches queue items with approval-class metadata, exact preview-hash and provenance facts, staleness/lock state, and a decision-only contract. Expose it through local runtime read and decision routes, then render it inside the Agent workspace. Approval and denial buttons append decision events only; scheduler resume and domain execution remain separate work.

**Tech Stack:** TypeScript, Zod, Vitest, React, Testing Library, existing `EventLedger`, existing `createAgentToolGateway`, existing `buildAgentApprovalQueue`, local-runtime HTTP handler, and the current Agent UI adapter/component patterns.

## Global Constraints

- Use `docs/superpowers/specs/2026-07-07-cestus-resident-agent-design.md`, `docs/superpowers/specs/2026-07-07-resident-agent-execution-approval-design.md`, and `docs/superpowers/specs/2026-07-07-resident-agent-provider-auth-design.md` as the active design source.
- Preserve append-only ledger semantics, provenance, projection rebuildability, human-only approval decisions, legal escalation locks, provider byte-transfer gates, and secret-safe DTOs.
- Do not add any route, button, adapter, or command that directly sends PRR correspondence, transfers provider bytes, exports sensitive material, clears a legal lock, executes repair, or accepts graph truth.
- Deterministic unit, route, and component tests may use synthetic provider-byte-transfer requests for pure contract behavior. Live Nous Portal usage is the authoritative acceptance path for model/provider behavior and smoke checks. Use the shared ignored `.env` symlink for live acceptance, and never print or commit API keys, raw provider errors, provider output text, or secret-shaped strings.
- Browser UI must import browser-safe DTO and adapter modules only. It must not import Node runtime, SQLite, filesystem, blob-store, workspace validation, provider adapter, or domain service modules.
- Approval decisions must bind the exact current preview hash. Stale, locked, missing-provenance, or secret-detected requests cannot be approved from the cockpit UI.
- A decision route may append only `agent.tool.approved` or `agent.tool.denied` through `createAgentToolGateway`.
- Optimize the UI for investigator accountability rather than generic administration. For each selected request the cockpit must answer: what the agent asks to do, why, what data leaves or changes, what evidence backs it, what happens after approval, and what prevents stale or unsafe execution.
- Stale and blocked states must be visually and contractually first-class. A stale request must be impossible to approve into execution and must guide the investigator toward rebuilding or requesting a new preview.
- Keep routes and DTOs extensible by approval class. Provider byte transfer is the first target, but DTO shape and route names must not hardcode provider-only semantics that block PRR send, export/report, destructive repair, legal escalation, or accepted graph review approvals later.

## Design Sufficiency Check

No spec amendment is required before this plan. The execution approval design already defines the approval cockpit UX, approval queue routes, exact preview hash semantics, and the no-hidden-executor boundary. The current implementation has the required domain primitives: `createAgentToolGateway`, `buildAgentApprovalQueue`, `createAgentRuntime().status()`, local agent HTTP routes, and a read-only Agent workspace.

One implementation constraint is explicit: the current `agent.tool.requested` event stores preview hash, scope, estimated effect, source event IDs, and artifact hashes, but not a full rich preview document. This first cockpit therefore shows the exact hash plus the safe event fields already in the ledger. The DTO should add class-level review notes such as "provider byte transfer requires exact-preview human approval and approval itself transfers no bytes" without inventing raw byte counts, excerpts, retention terms, or provider payload details. Rich provider-byte fields such as media type, byte count, excerpt policy, and provider retention note must come from the tool request builder or later domain adapter that owns that preview.

## File Structure

- Create `packages/agent/src/approval-cockpit.ts`: browser-safe approval cockpit DTO builder over `AgentStatusDto` and `buildAgentApprovalQueue`.
- Create `packages/agent/test/approval-cockpit.test.ts`: DTO projection, provider byte-transfer bucket, stale/lock blocking, terminal buckets, and secret-safety tests.
- Modify `packages/agent/src/index.ts`: export the approval cockpit DTO surface.
- Modify `packages/local-runtime/src/agent-http-routes.ts`: add approval queue read/detail and approve/deny decision routes.
- Create `packages/local-runtime/test/agent-approval-routes.test.ts`: local runtime route tests over a seeded deterministic provider-byte-transfer request.
- Modify `packages/ui/src/agent/agent-types.ts`: export approval cockpit DTO types.
- Modify `packages/ui/src/agent/agent-adapter.ts`: parse/load approval cockpit DTOs and call decision routes.
- Create `packages/ui/test/agent-approval-adapter.test.ts`: browser adapter fetch, parsing, redaction, and decision route tests.
- Create `packages/ui/src/agent/AgentApprovalCockpit.tsx`: reusable approval queue/detail/decision panel component.
- Create `packages/ui/test/agent-approval-cockpit.test.tsx`: component behavior tests for approve, deny, stale, lock, and forbidden buttons.
- Modify `packages/ui/src/agent/AgentWorkspace.tsx`: render the approval cockpit inside the Agent workspace.
- Modify `packages/ui/src/App.tsx`: load approval cockpit state and wire approval/denial handlers.
- Modify `packages/ui/test/agent-workspace.test.tsx`: update Agent workspace expectations for decision-only approval controls.
- Modify `packages/ui/test/agent-app-integration.test.tsx`: prove app-level approval decisions call only agent adapter methods.
- Modify `packages/ui/test/app-smoke.test.tsx`: keep the Agent route smoke passing.
- Modify `packages/ui/test/command-model.test.ts`: preserve command-board agent brief behavior with pending approvals.
- Modify `docs/agentic/software-factory.md`: append readiness evidence after implementation passes.
- Modify this plan: check off completed tasks and record command evidence.
- Create `docs/agentic/claims/task-1-agent-approval-cockpit-dto.md`.
- Create `docs/agentic/claims/task-2-agent-approval-routes.md`.
- Create `docs/agentic/claims/task-3-agent-approval-adapter.md`.
- Create `docs/agentic/claims/task-4-agent-approval-cockpit-component.md`.
- Create `docs/agentic/claims/task-5-agent-approval-app-integration.md`.
- Create `docs/agentic/claims/task-6-agent-approval-readiness.md`.

## Review Gates

- Gate A after Task 1: DTO review for projection shape, exact preview hash exposure, provider-byte-transfer grouping, lock/stale blocking, and secret safety.
- Gate B after Task 2: route review for append-only decisions, human actor enforcement, local-runtime auth reuse, and no side-effect execution.
- Gate C after Tasks 3 through 5: UI review for browser-safe DTO parsing, decision-only controls, disabled approval for stale/locked requests, and no forbidden execution buttons.
- Gate D after Task 6: factory readiness review before merge.

### Task 1: Approval Cockpit DTO Builder

**Files:**
- Create: `packages/agent/src/approval-cockpit.ts`
- Create: `packages/agent/test/approval-cockpit.test.ts`
- Modify: `packages/agent/src/index.ts`
- Create: `docs/agentic/claims/task-1-agent-approval-cockpit-dto.md`

**Interfaces:**
- Consumes: `AgentStatusDto`, `ProjectedAgentToolRequest`, `ProjectedAgentLock`, and `buildAgentApprovalQueue(input)`.
- Produces: `buildAgentApprovalCockpit(input: BuildAgentApprovalCockpitInput): AgentApprovalCockpitDto`.
- Produces: `agentApprovalCockpitDtoSchema` for local runtime and UI validation.
- Produces: `AgentApprovalDecisionResultDto` for route and adapter result parsing.

- [ ] **Step 1: Claim the task**

Create `docs/agentic/claims/task-1-agent-approval-cockpit-dto.md`:

```md
# Task 1 Claim: Agent Approval Cockpit DTO

Plan: `docs/superpowers/plans/2026-07-08-resident-agent-approval-cockpit-routes-ui-implementation.md`
Task: Task 1: Approval Cockpit DTO Builder
Worker: <agent name>
Branch: `codex/resident-agent-approval-cockpit-plan`
Worktree: `/home/drake/.codex/worktrees/b782/Cestus`
Claimed-at: <UTC timestamp>
Status: claimed

Owned files:
- `packages/agent/src/approval-cockpit.ts`
- `packages/agent/test/approval-cockpit.test.ts`
- `packages/agent/src/index.ts`
- `docs/agentic/claims/task-1-agent-approval-cockpit-dto.md`
```

Commit the claim:

```bash
git add docs/agentic/claims/task-1-agent-approval-cockpit-dto.md
git commit -m "chore: claim agent approval cockpit dto task"
```

- [ ] **Step 2: Mark claim in progress**

Edit the claim status to `in-progress`, then commit:

```bash
git add docs/agentic/claims/task-1-agent-approval-cockpit-dto.md
git commit -m "chore: start agent approval cockpit dto task"
```

- [ ] **Step 3: Write the failing DTO tests**

Create `packages/agent/test/approval-cockpit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  agentApprovalCockpitDtoSchema,
  buildAgentApprovalCockpit
} from "../src/approval-cockpit.js";
import type { AgentStatusDto } from "../src/runtime-types.js";

const previewHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const artifactHash = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

describe("agent approval cockpit dto", () => {
  it("projects provider byte-transfer requests into decision-only approval queues", () => {
    const cockpit = buildAgentApprovalCockpit({
      status: agentStatus({
        toolRequests: [providerTransferRequest()]
      }),
      generatedAt: "2026-07-08T14:00:00.000Z"
    });

    expect(agentApprovalCockpitDtoSchema.parse(cockpit)).toEqual(cockpit);
    expect(cockpit.schemaVersion).toBe("agent-approval-cockpit.v1");
    expect(cockpit.summary.pendingCount).toBe(1);
    expect(cockpit.decisionContract).toMatchObject({
      approvalAppendsDecisionOnly: true,
      denialAppendsDecisionOnly: true
    });
    expect(cockpit.decisionContract.afterApproval).toMatch(/revalidat.*preview hash/i);
    expect(cockpit.approvalClasses).toContainEqual(expect.objectContaining({
      approvalClass: "provider-byte-transfer",
      providerByteTransferNote: expect.stringMatching(/byte transfer/i)
    }));
    expect(cockpit.queue.pending[0]).toMatchObject({
      toolRequestId: "toolreq_provider_transfer",
      approvalClass: "provider-byte-transfer",
      requiredApprovalClass: "provider-byte-transfer",
      previewHash,
      executableByApproval: false,
      providerByteTransferNote: expect.stringMatching(/does not transfer bytes/i),
      staleness: {
        state: "current",
        approvable: true
      },
      approvalContract: {
        requiredApprovalClass: "provider-byte-transfer",
        approvalRouteAppendsOnly: true,
        denialRouteAppendsOnly: true,
        rationaleRequired: true,
        rationaleSecretSafe: true
      }
    });
    expect(cockpit.queue.pending[0]?.review).toMatchObject({
      what: "Selected evidence excerpts for provider processing.",
      dataLeavesOrChanges: "Send selected evidence excerpts to the configured provider after approval.",
      whatHappensAfterApproval: expect.stringMatching(/separate scheduler/i)
    });
    expect(cockpit.queue.pending[0]?.affectedRefs).toEqual([
      { kind: "event", id: "evt_provider_preview" },
      { kind: "artifact", id: artifactHash, hash: artifactHash }
    ]);
    expect(cockpit.forbiddenDirectEffects).toContain("provider-byte-transfer");
    expect(JSON.stringify(cockpit)).not.toMatch(/raw-token|password|authorization:\s*bearer|sk_live/i);
  });

  it("marks locked provider approvals blocked and non-approvable", () => {
    const cockpit = buildAgentApprovalCockpit({
      status: agentStatus({
        toolRequests: [providerTransferRequest()],
        locks: [{
          lockId: "lock_provider_transfer",
          residentAgentId: "agent_default",
          kind: "provider-byte-transfer",
          activatedBy: "actor_case_owner",
          reason: "Provider transfer locked pending review.",
          activatedAt: "2026-07-08T13:55:00.000Z",
          relatedEventIds: ["evt_provider_preview"],
          state: "active",
          clearRelatedEventIds: [],
          eventIds: ["evt_lock_provider_transfer"],
          causationIds: []
        }],
        activeLockCount: 1
      }),
      generatedAt: "2026-07-08T14:00:00.000Z"
    });

    expect(cockpit.queue.pending).toHaveLength(0);
    expect(cockpit.queue.blocked[0]?.blockingReasons).toContain("lock-active");
    expect(cockpit.queue.blocked[0]?.executableByApproval).toBe(false);
  });

  it("projects approved denied completed and failed terminal buckets", () => {
    const approved = buildAgentApprovalCockpit({
      status: agentStatus({
        toolRequests: [providerTransferRequest({
          state: "approved",
          approvedBy: "actor_case_owner",
          approvedPreviewHash: previewHash,
          approvalClass: "provider-byte-transfer",
          approvalRationale: "Approved the exact provider preview.",
          approvedAt: "2026-07-08T14:01:00.000Z"
        })]
      }),
      generatedAt: "2026-07-08T14:02:00.000Z"
    });
    const denied = buildAgentApprovalCockpit({
      status: agentStatus({
        toolRequests: [providerTransferRequest({
          state: "denied",
          deniedBy: "actor_case_owner",
          denialRationale: "Needs a smaller evidence subset.",
          deniedAt: "2026-07-08T14:01:00.000Z"
        })]
      }),
      generatedAt: "2026-07-08T14:02:00.000Z"
    });
    const completed = buildAgentApprovalCockpit({
      status: agentStatus({
        toolRequests: [providerTransferRequest({
          state: "completed",
          completedAt: "2026-07-08T14:02:00.000Z",
          resultEventIds: ["evt_provider_result"],
          artifactHashes: [artifactHash],
          readModelChanges: [{ projectionName: "agent", change: "Recorded fixture result." }]
        })]
      }),
      generatedAt: "2026-07-08T14:03:00.000Z"
    });
    const failed = buildAgentApprovalCockpit({
      status: agentStatus({
        toolRequests: [providerTransferRequest({
          state: "failed",
          failedAt: "2026-07-08T14:03:00.000Z",
          failureCategory: "approval-stale",
          failureMessage: "Preview changed before resume.",
          retryable: false,
          allowedActions: ["request a revised preview"]
        })]
      }),
      generatedAt: "2026-07-08T14:04:00.000Z"
    });

    expect(approved.queue.resumable[0]?.approval?.approvedBy).toBe("actor_case_owner");
    expect(denied.queue.denied[0]?.denial?.rationale).toBe("Needs a smaller evidence subset.");
    expect(completed.queue.completed[0]?.completion?.eventIds).toEqual(["evt_provider_result"]);
    expect(failed.queue.failed[0]?.failure?.category).toBe("approval-stale");
  });

  it("rejects secret-shaped status text before building browser DTOs", () => {
    expect(() =>
      buildAgentApprovalCockpit({
        status: agentStatus({
          toolRequests: [providerTransferRequest({
            estimatedEffect: "Send bearer raw-token to provider."
          })]
        }),
        generatedAt: "2026-07-08T14:00:00.000Z"
      })
    ).toThrow(/secret|credential/i);
  });
});

function agentStatus(overrides: Partial<AgentStatusDto> = {}): AgentStatusDto {
  return {
    schemaVersion: "agent-status.v1",
    generatedAt: "2026-07-08T14:00:00.000Z",
    residentAgentId: "agent_default",
    tasks: [],
    runs: [],
    toolRequests: [],
    activeMemory: [],
    permissions: [],
    locks: [],
    providers: [],
    pendingApprovalCount: 0,
    activeLockCount: 0,
    diagnostics: [],
    ...overrides
  };
}

function providerTransferRequest(
  overrides: Partial<AgentStatusDto["toolRequests"][number]> = {}
): AgentStatusDto["toolRequests"][number] {
  return {
    toolRequestId: "toolreq_provider_transfer",
    runId: "run_provider_transfer",
    toolId: "provider.bytes.transfer",
    toolVersion: "1",
    requestedBy: "agent_default",
    sideEffectClass: "external-byte-transfer",
    requiredApprovalClass: "provider-byte-transfer",
    previewHash,
    scope: "Selected evidence excerpts for provider processing.",
    estimatedEffect: "Send selected evidence excerpts to the configured provider after approval.",
    state: "requested",
    requestedAt: "2026-07-08T13:59:00.000Z",
    sourceEventIds: ["evt_provider_preview"],
    inputArtifactHashes: [artifactHash],
    resultEventIds: [],
    artifactHashes: [],
    readModelChanges: [],
    allowedActions: [],
    eventIds: ["evt_agent_tool_requested_provider_transfer"],
    causationIds: ["evt_agent_run_started_provider_transfer"],
    ...overrides
  };
}
```

- [ ] **Step 4: Run the targeted failing test**

Run:

```bash
npm test -- packages/agent/test/approval-cockpit.test.ts
```

Expected before implementation:

```text
Failed to resolve import "../src/approval-cockpit.js"
```

- [ ] **Step 5: Add the approval cockpit DTO builder**

Create `packages/agent/src/approval-cockpit.ts` with:

```ts
import { z } from "zod";
import {
  agentApprovalQueueClassValues,
  buildAgentApprovalQueue,
  type AgentAffectedRefDto,
  type AgentApprovalQueueItemDto,
  type AgentApprovalQueueOutput,
  type AgentApprovalQueueRequestDto
} from "./approval-queue.js";
import { assertAgentSecretSafeText } from "./secret-safety.js";
import type { AgentStatusDto } from "./runtime-types.js";

const schemaVersion = "agent-approval-cockpit.v1" as const;

export const agentApprovalCockpitDtoSchema = z.object({
  schemaVersion: z.literal(schemaVersion),
  generatedAt: z.string().datetime(),
  summary: z.object({
    pendingCount: z.number().int().nonnegative(),
    resumableCount: z.number().int().nonnegative(),
    blockedCount: z.number().int().nonnegative(),
    staleCount: z.number().int().nonnegative(),
    terminalCount: z.number().int().nonnegative()
  }).strict(),
  decisionContract: z.object({
    approvalAppendsDecisionOnly: z.literal(true),
    denialAppendsDecisionOnly: z.literal(true),
    requiresHumanActor: z.literal(true),
    afterApproval: z.string().min(1),
    forbiddenDirectEffects: z.array(z.string().min(1))
  }).strict(),
  approvalClasses: z.array(z.object({
    approvalClass: z.enum(agentApprovalQueueClassValues),
    label: z.string().min(1),
    requiredFor: z.string().min(1),
    providerByteTransferNote: z.string().min(1).optional(),
    rationale: z.object({
      required: z.literal(true),
      secretSafe: z.literal(true)
    }).strict()
  }).strict()),
  queue: z.custom<AgentApprovalCockpitQueueDto>(),
  forbiddenDirectEffects: z.array(z.enum([
    "provider-byte-transfer",
    "prr-send-followup",
    "legal-escalation",
    "export-publication",
    "destructive-repair",
    "accepted-graph-review"
  ]))
}).strict();

export type AgentApprovalCockpitDto = z.infer<typeof agentApprovalCockpitDtoSchema>;

export interface AgentApprovalCockpitQueueDto {
  readonly generatedAt: string;
  readonly pending: readonly AgentApprovalCockpitItemDto[];
  readonly resumable: readonly AgentApprovalCockpitItemDto[];
  readonly blocked: readonly AgentApprovalCockpitItemDto[];
  readonly stale: readonly AgentApprovalCockpitItemDto[];
  readonly denied: readonly AgentApprovalCockpitItemDto[];
  readonly completed: readonly AgentApprovalCockpitItemDto[];
  readonly failed: readonly AgentApprovalCockpitItemDto[];
}

export interface AgentApprovalCockpitItemDto extends AgentApprovalQueueItemDto {
  readonly requiredApprovalClass: AgentApprovalQueueItemDto["approvalClass"];
  readonly providerByteTransferNote?: string;
  readonly staleness: {
    readonly state: "current" | "stale";
    readonly approvable: boolean;
    readonly currentPreviewHash?: string;
    readonly guidance?: string;
  };
  readonly approvalContract: {
    readonly requiredApprovalClass: AgentApprovalQueueItemDto["approvalClass"];
    readonly approvalRouteAppendsOnly: true;
    readonly denialRouteAppendsOnly: true;
    readonly rationaleRequired: true;
    readonly rationaleSecretSafe: true;
    readonly afterApproval: string;
  };
  readonly review: {
    readonly what: string;
    readonly why: string;
    readonly dataLeavesOrChanges: string;
    readonly evidenceRefs: readonly AgentAffectedRefDto[];
    readonly artifactRefs: readonly AgentAffectedRefDto[];
    readonly riskAndLockStatus: string;
    readonly whatHappensAfterApproval: string;
    readonly staleOrUnsafePrevention: readonly string[];
  };
}

export interface BuildAgentApprovalCockpitInput {
  readonly status: AgentStatusDto;
  readonly generatedAt?: string;
  readonly currentPreviewHashes?: Readonly<Record<string, string>>;
}

export interface AgentApprovalDecisionResultDto {
  readonly ok: true;
  readonly schemaVersion: "agent-approval-decision-result.v1";
  readonly eventIds: readonly string[];
  readonly approvalCockpit: AgentApprovalCockpitDto;
}

export function buildAgentApprovalCockpit(input: BuildAgentApprovalCockpitInput): AgentApprovalCockpitDto {
  const generatedAt = input.generatedAt ?? input.status.generatedAt;
  assertAgentSecretSafeText(generatedAt, "approval cockpit generatedAt");
  const requests = input.status.toolRequests.map(projectRequestForQueue);
  const reviewInputsById = new Map(input.status.toolRequests.map((request) => [
    request.toolRequestId,
    {
      what: request.scope,
      why: `Agent requested ${request.toolId} during run ${request.runId}.`,
      dataLeavesOrChanges: request.estimatedEffect,
      evidenceRefs: request.sourceEventIds.map((id) => ({ kind: "event", id })),
      artifactRefs: request.inputArtifactHashes.map((hash) => ({ kind: "artifact", id: hash, hash }))
    }
  ]));
  const directEffects = [
    "provider-byte-transfer",
    "prr-send-followup",
    "legal-escalation",
    "export-publication",
    "destructive-repair",
    "accepted-graph-review"
  ] as const;
  const afterApproval =
    "Approval records a human decision only. A separate scheduler or executor may later revalidate the exact preview hash before doing any work.";
  const queue = enrichQueue(buildAgentApprovalQueue({
    now: generatedAt,
    requests,
    approvals: input.status.toolRequests.flatMap(projectApprovalForQueue),
    denials: input.status.toolRequests.flatMap(projectDenialForQueue),
    completed: input.status.toolRequests.flatMap(projectCompletionForQueue),
    failures: input.status.toolRequests.flatMap(projectFailureForQueue),
    currentPreviewHashes: input.currentPreviewHashes ?? currentPreviewHashesFor(requests),
    activeLocks: input.status.locks
      .filter((lock) => lock.state === "active")
      .map((lock) => ({
        lockId: lock.lockId,
        category: lock.kind,
        message: lock.reason,
        relatedRefs: lock.relatedEventIds.map((id) => ({ kind: "event", id })),
        appliesToApprovalClasses: lock.kind === "provider-byte-transfer" ? ["provider-byte-transfer"] : undefined
      }))
  }), reviewInputsById, afterApproval);
  const dto = {
    schemaVersion,
    generatedAt,
    summary: {
      pendingCount: queue.pending.length,
      resumableCount: queue.resumable.length,
      blockedCount: queue.blocked.length,
      staleCount: queue.stale.length,
      terminalCount: queue.denied.length + queue.completed.length + queue.failed.length
    },
    decisionContract: {
      approvalAppendsDecisionOnly: true,
      denialAppendsDecisionOnly: true,
      requiresHumanActor: true,
      afterApproval,
      forbiddenDirectEffects: [...directEffects]
    },
    approvalClasses: approvalClassMetadata(),
    queue,
    forbiddenDirectEffects: [...directEffects]
  } satisfies AgentApprovalCockpitDto;
  return deepFreeze(agentApprovalCockpitDtoSchema.parse(dto));
}
```

Complete the module by adding the small projector helpers named in the snippet. `projectRequestForQueue()` must map `sourceEventIds` to `{ kind: "event", id }`, `inputArtifactHashes` to `{ kind: "artifact", id: hash, hash }`, `estimatedEffect` to `previewSummary`, and `previewHash` to `currentPreviewHashes[toolRequestId]`. `enrichQueue()` must use `reviewInputsById` to preserve `scope` as request-review `what`, `estimatedEffect` as `dataLeavesOrChanges`, source event refs as evidence refs, and input artifact hashes as artifact refs. It must preserve the approval-queue bucket names while adding `requiredApprovalClass`, `providerByteTransferNote` only for provider byte-transfer items, `staleness`, `approvalContract`, and `review` to every item. Terminal projector helpers must read the flattened projection fields without appending events. Freeze all returned objects and arrays.

- [ ] **Step 6: Export the DTO surface**

Modify `packages/agent/src/index.ts`:

```ts
export * from "./approval-cockpit.js";
```

Preserve existing exports.

- [ ] **Step 7: Run targeted tests**

Run:

```bash
npm test -- packages/agent/test/approval-cockpit.test.ts packages/agent/test/approval-queue.test.ts
```

Expected:

```text
Test Files  2 passed
```

- [ ] **Step 8: Commit Task 1**

Run:

```bash
git add packages/agent/src/approval-cockpit.ts packages/agent/src/index.ts packages/agent/test/approval-cockpit.test.ts docs/agentic/claims/task-1-agent-approval-cockpit-dto.md
git commit -m "feat: add agent approval cockpit dto"
```

**Acceptance Criteria:**

- DTO schema version is `agent-approval-cockpit.v1`.
- Provider byte-transfer requests appear in `queue.pending` with `approvalClass: "provider-byte-transfer"`.
- Queue items expose exact preview hash, required approval class, affected evidence/artifact refs, staleness state, lock/blocking state, provider byte-transfer note when applicable, and safe rationale requirements.
- Top-level DTO exposes a decision-only contract and approval-class metadata without provider-only route semantics.
- Approval items expose `executableByApproval: false`.
- Active provider-byte-transfer locks block approval.
- DTO generation uses existing projection data and does not call provider, PRR, export, repair, legal, or ontology review services.

**Rollback/Escalation:**

- Escalate if a useful cockpit DTO requires storing raw provider preview bytes, raw evidence bodies, secret-bearing provider details, or live provider metadata.

### Task 2: Local Runtime Approval Routes

**Files:**
- Modify: `packages/local-runtime/src/agent-http-routes.ts`
- Create: `packages/local-runtime/test/agent-approval-routes.test.ts`
- Create: `docs/agentic/claims/task-2-agent-approval-routes.md`

**Interfaces:**
- Consumes: `buildAgentApprovalCockpit(status)`, `createAgentToolGateway({ ledger, actor, now })`, and the existing local runtime auth boundary.
- Produces: `GET /api/agent/approvals`.
- Produces: `GET /api/agent/approvals/:toolRequestId`.
- Produces: `POST /api/agent/approvals/:toolRequestId/approve`.
- Produces: `POST /api/agent/approvals/:toolRequestId/deny`.

- [ ] **Step 1: Claim the task**

Create `docs/agentic/claims/task-2-agent-approval-routes.md` with the same shape as Task 1, owned files set to this task, status `claimed`, then commit the claim.

- [ ] **Step 2: Mark claim in progress**

Set status to `in-progress` and commit the claim update.

- [ ] **Step 3: Write failing route tests**

Create `packages/local-runtime/test/agent-approval-routes.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAgentToolGateway } from "../../agent/src/index.js";
import { SQLiteEventLedger } from "../../ontology/src/sqlite-event-ledger.js";
import { resolveLocalRuntimeConfig } from "../src/config.js";
import { createLocalRuntimeHttpHandler, type LocalRuntimeHttpHandler } from "../src/http-handler.js";

const handlers: LocalRuntimeHttpHandler[] = [];
const tempDirs: string[] = [];
const now = () => "2026-07-08T14:30:00.000Z";

afterEach(() => {
  for (const handler of handlers.splice(0)) {
    handler.close();
  }
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("agent approval routes", () => {
  it("lists provider byte-transfer approvals without executing provider transfer", async () => {
    const { config, handler } = await seededHandler();
    const response = await handler({ method: "GET", url: "/api/agent/approvals" });
    const body = JSON.parse(response.body) as {
      readonly schemaVersion: string;
      readonly queue: { readonly pending: readonly { readonly approvalClass: string; readonly executableByApproval: boolean }[] };
    };

    expect(response.status).toBe(200);
    expect(body.schemaVersion).toBe("agent-approval-cockpit.v1");
    expect(body.queue.pending[0]).toMatchObject({
      approvalClass: "provider-byte-transfer",
      executableByApproval: false
    });
    expect(response.body).not.toMatch(/synthetic-test-secret|authorization:\s*bearer|password|private key/i);
    handler.close();
    handlers.splice(handlers.indexOf(handler), 1);
    expect(await eventTypes(config)).toEqual(["agent.tool.requested"]);
  });

  it("shows a single approval request by tool request id", async () => {
    const { handler } = await seededHandler();
    const response = await handler({
      method: "GET",
      url: "/api/agent/approvals/toolreq_provider_transfer"
    });
    const body = JSON.parse(response.body) as {
      readonly ok: true;
      readonly item: { readonly toolRequestId: string; readonly previewHash: string };
    };

    expect(response.status).toBe(200);
    expect(body.item.toolRequestId).toBe("toolreq_provider_transfer");
    expect(body.item.previewHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("appends exact human approval and no execution events", async () => {
    const { config, handler, previewHash } = await seededHandler();
    const response = await handler({
      method: "POST",
      url: "/api/agent/approvals/toolreq_provider_transfer/approve",
      body: JSON.stringify({
        approvedPreviewHash: previewHash,
        rationale: "Approved the exact synthetic provider byte-transfer preview."
      })
    });

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      ok: true,
      schemaVersion: "agent-approval-decision-result.v1"
    });
    handler.close();
    handlers.splice(handlers.indexOf(handler), 1);
    expect(await eventTypes(config)).toEqual(["agent.tool.requested", "agent.tool.approved"]);
  });

  it("appends human denial and no execution events", async () => {
    const { config, handler } = await seededHandler("toolreq_provider_denied");
    const response = await handler({
      method: "POST",
      url: "/api/agent/approvals/toolreq_provider_denied/deny",
      body: JSON.stringify({
        rationale: "Need a revised provider byte-transfer preview."
      })
    });

    expect(response.status).toBe(200);
    handler.close();
    handlers.splice(handlers.indexOf(handler), 1);
    expect(await eventTypes(config)).toEqual(["agent.tool.requested", "agent.tool.denied"]);
  });

  it("rejects stale approval hashes and secret-shaped rationales safely", async () => {
    const { handler } = await seededHandler();
    const stale = await handler({
      method: "POST",
      url: "/api/agent/approvals/toolreq_provider_transfer/approve",
      body: JSON.stringify({
        approvedPreviewHash: "sha256:9999999999999999999999999999999999999999999999999999999999999999",
        rationale: "Approved stale preview."
      })
    });
    const unsafe = await handler({
      method: "POST",
      url: "/api/agent/approvals/toolreq_provider_transfer/deny",
      body: JSON.stringify({
        rationale: "password hunter2"
      })
    });

    expect(stale.status).toBe(409);
    expect(unsafe.status).toBe(400);
    expect(stale.body).not.toMatch(/toolreq_provider_transfer|hunter2|password/i);
    expect(unsafe.body).not.toMatch(/hunter2|password/i);
  });

  it("requires human route actors for approval decisions", async () => {
    const { config } = await seedToolRequest();
    const handler = createLocalRuntimeHttpHandler({
      config,
      actor: { id: "actor_cestus_agent", kind: "agent", label: "Cestus Agent" },
      now
    });
    handlers.push(handler);
    const response = await handler({
      method: "POST",
      url: "/api/agent/approvals/toolreq_provider_transfer/approve",
      body: JSON.stringify({
        approvedPreviewHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        rationale: "Agent cannot approve."
      })
    });

    expect(response.status).toBe(403);
  });
});

async function seededHandler(toolRequestId = "toolreq_provider_transfer") {
  const seeded = await seedToolRequest(toolRequestId);
  const handler = createLocalRuntimeHttpHandler({
    config: seeded.config,
    actor: { id: "actor_case_owner", kind: "human", label: "Case Owner" },
    now
  });
  handlers.push(handler);
  return { ...seeded, handler };
}

async function seedToolRequest(toolRequestId = "toolreq_provider_transfer") {
  const cwd = mkdtempSync(join(tmpdir(), "cestus-agent-approval-routes-"));
  tempDirs.push(cwd);
  const config = resolveLocalRuntimeConfig({ cwd, env: {} });
  const ledger = new SQLiteEventLedger(config.storage.sqlitePath);
  try {
    const gateway = createAgentToolGateway({
      ledger,
      actor: { id: "actor_cestus_agent", kind: "agent", label: "Cestus Agent" },
      now
    });
    const requested = await gateway.requestTool({
      toolRequestId,
      residentAgentId: "agent_default",
      taskId: "task_provider_transfer",
      runId: "run_provider_transfer",
      toolId: "provider.bytes.transfer",
      sideEffectClass: "external-byte-transfer",
      requiredApprovalClass: "provider-byte-transfer",
      preview: {
        summary: "Send selected synthetic evidence excerpts to the configured provider.",
        relatedEventIds: ["evt_provider_preview"],
        artifactHashes: ["sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"],
        scope: "Selected synthetic evidence excerpts.",
        estimatedEffect: "Provider byte transfer after human approval."
      }
    });
    return { config, previewHash: requested.payload.previewHash };
  } finally {
    ledger.close();
  }
}

async function eventTypes(config: ReturnType<typeof resolveLocalRuntimeConfig>): Promise<readonly string[]> {
  const ledger = new SQLiteEventLedger(config.storage.sqlitePath);
  try {
    return (await ledger.readAll()).map((event) => event.type);
  } finally {
    ledger.close();
  }
}
```

- [ ] **Step 4: Run the targeted failing test**

Run:

```bash
npm test -- packages/local-runtime/test/agent-approval-routes.test.ts
```

Expected before implementation:

```text
Local runtime route was not found.
```

- [ ] **Step 5: Add read and decision routes**

Modify `packages/local-runtime/src/agent-http-routes.ts`:

- Add a local `approvalCockpit(runtime)` helper that loads `runtime.status()` and passes it to `buildAgentApprovalCockpit()`.
- Add `GET /api/agent/approvals` returning `AgentApprovalCockpitDto`.
- Add `GET /api/agent/approvals/:toolRequestId` returning `{ ok: true, schemaVersion: "agent-approval-detail.v1", generatedAt, item }` or `404` with safe diagnostic.
- Add `POST /api/agent/approvals/:toolRequestId/approve`.
- Add `POST /api/agent/approvals/:toolRequestId/deny`.
- Decision routes must reject `input.actor.kind !== "human"` with HTTP `403`.
- Approval route body must have exactly `approvedPreviewHash` and `rationale`, both safe strings.
- Denial route body must have exactly `rationale`, safe string.
- Use `createAgentToolGateway({ ledger: input.handle.ledger, actor: input.actor, now: input.now })`.
- Return `AgentApprovalDecisionResultDto` with the committed decision event ID and refreshed cockpit DTO.
- Map stale preview errors to `409` with a safe diagnostic.
- Map invalid body or unsafe rationale to `400` with a safe diagnostic.
- Never call `completeTool`, `resumeApprovedTool`, a provider adapter, PRR service, export service, repair service, or ontology acceptance service.

- [ ] **Step 6: Run targeted tests**

Run:

```bash
npm test -- packages/local-runtime/test/agent-approval-routes.test.ts packages/local-runtime/test/agent-http-routes.test.ts packages/agent/test/approval-cockpit.test.ts
```

Expected:

```text
Test Files  3 passed
```

- [ ] **Step 7: Commit Task 2**

Run:

```bash
git add packages/local-runtime/src/agent-http-routes.ts packages/local-runtime/test/agent-approval-routes.test.ts docs/agentic/claims/task-2-agent-approval-routes.md
git commit -m "feat: expose agent approval decision routes"
```

**Acceptance Criteria:**

- `GET /api/agent/approvals` and detail route return browser-safe DTOs.
- Approve and deny routes append only decision events.
- Human actor enforcement happens before gateway calls.
- Existing local-runtime auth rules protect the new routes.
- Stale preview hashes fail closed.

**Rollback/Escalation:**

- Escalate if decision routes require scheduler resume, provider invocation, PRR send, export, repair, legal escalation, or accepted graph review to satisfy tests.

### Task 3: Browser Adapter For Approval Cockpit

**Files:**
- Modify: `packages/ui/src/agent/agent-types.ts`
- Modify: `packages/ui/src/agent/agent-adapter.ts`
- Create: `packages/ui/test/agent-approval-adapter.test.ts`
- Create: `docs/agentic/claims/task-3-agent-approval-adapter.md`

**Interfaces:**
- Consumes: runtime routes from Task 2.
- Produces: `AgentAdapter.loadApprovalCockpit()`.
- Produces: `AgentAdapter.approveToolRequest(input)`.
- Produces: `AgentAdapter.denyToolRequest(input)`.
- Produces browser-safe parsing for `AgentApprovalCockpitDto` and `AgentApprovalDecisionResultDto`.

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-3-agent-approval-adapter.md`, then mark it `in-progress` and commit the status update.

- [ ] **Step 2: Write failing adapter tests**

Create `packages/ui/test/agent-approval-adapter.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  agentApprovalCockpitFromJson,
  createHttpAgentAdapter,
  createStaticAgentAdapter
} from "../src/agent/agent-adapter.js";

const previewHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("agent approval cockpit adapter", () => {
  it("loads approval cockpit from the local runtime API", async () => {
    const payload = approvalCockpit();
    const fetcher = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }));
    const adapter = createHttpAgentAdapter({
      baseUrl: "http://127.0.0.1:8787",
      authToken: "local-runtime-token",
      credentials: "include",
      fetcher
    });

    await expect(adapter.loadApprovalCockpit()).resolves.toEqual(payload);
    expect(fetcher).toHaveBeenCalledWith("http://127.0.0.1:8787/api/agent/approvals", {
      credentials: "include",
      headers: { authorization: "Bearer local-runtime-token" },
      method: "GET"
    });
  });

  it("calls approve and deny decision routes without execution routes", async () => {
    const calls: Array<readonly [RequestInfo | URL, RequestInit | undefined]> = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push([input, init]);
      return new Response(JSON.stringify({
        ok: true,
        schemaVersion: "agent-approval-decision-result.v1",
        eventIds: ["evt_agent_tool_decision"],
        approvalCockpit: approvalCockpit({ pendingCount: 0 })
      }), { status: 200 });
    });
    const adapter = createHttpAgentAdapter({ fetcher });

    await adapter.approveToolRequest({
      toolRequestId: "toolreq_provider_transfer",
      approvedPreviewHash: previewHash,
      rationale: "Approved the exact preview."
    });
    await adapter.denyToolRequest({
      toolRequestId: "toolreq_provider_transfer",
      rationale: "Need a narrower preview."
    });

    expect(calls.map(([url]) => String(url))).toEqual([
      "/api/agent/approvals/toolreq_provider_transfer/approve",
      "/api/agent/approvals/toolreq_provider_transfer/deny"
    ]);
    expect(calls.map(([, init]) => init?.method)).toEqual(["POST", "POST"]);
    expect(calls.map(([url]) => String(url)).join("\n")).not.toMatch(/send|transfer|export|repair|legal|accept/i);
  });

  it("redacts unsafe runtime text before parsing cockpit DTOs", () => {
    const cockpit = agentApprovalCockpitFromJson(approvalCockpit({
      unsafeSummary: "Provider returned bearer raw-value from /tmp/secret-agent"
    }));

    expect(JSON.stringify(cockpit)).not.toMatch(/raw-value|\/tmp\/secret-agent|bearer/i);
  });

  it("supports static adapters for component and app tests", async () => {
    const adapter = createStaticAgentAdapter(agentStatus(), approvalCockpit());

    await expect(adapter.loadApprovalCockpit()).resolves.toMatchObject({
      schemaVersion: "agent-approval-cockpit.v1"
    });
  });
});

function agentStatus() {
  return {
    schemaVersion: "agent-status.v1",
    generatedAt: "2026-07-08T15:00:00.000Z",
    tasks: [],
    runs: [],
    toolRequests: [],
    activeMemory: [],
    permissions: [],
    locks: [],
    providers: [],
    pendingApprovalCount: 0,
    activeLockCount: 0,
    diagnostics: []
  };
}

function approvalCockpit(input: { readonly pendingCount?: number; readonly unsafeSummary?: string } = {}) {
  const pending = input.pendingCount === 0 ? [] : [{
    toolRequestId: "toolreq_provider_transfer",
    runId: "run_provider_transfer",
    taskId: "task_provider_transfer",
    toolId: "provider.bytes.transfer",
    toolVersion: "1",
    sideEffectClass: "external-byte-transfer",
    approvalClass: "provider-byte-transfer",
    requiredApprovalClass: "provider-byte-transfer",
    previewHash,
    previewSummary: input.unsafeSummary ?? "Provider byte-transfer preview.",
    requestedAt: "2026-07-08T14:59:00.000Z",
    stale: false,
    executableByApproval: false,
    providerByteTransferNote: "Approval records a decision only; it does not transfer provider bytes.",
    staleness: {
      state: "current",
      approvable: true
    },
    approvalContract: {
      requiredApprovalClass: "provider-byte-transfer",
      approvalRouteAppendsOnly: true,
      denialRouteAppendsOnly: true,
      rationaleRequired: true,
      rationaleSecretSafe: true,
      afterApproval: "A separate scheduler revalidates the exact preview hash before any execution."
    },
    review: {
      what: "Selected evidence excerpts for provider processing.",
      why: "The resident agent requested model assistance for the selected evidence.",
      dataLeavesOrChanges: input.unsafeSummary ?? "Provider byte-transfer preview.",
      evidenceRefs: [],
      artifactRefs: [],
      riskAndLockStatus: "No active locks. Preview is current.",
      whatHappensAfterApproval: "A separate scheduler may resume after consume-time validation.",
      staleOrUnsafePrevention: ["Exact preview hash binding", "Human-only approval", "Active lock checks"]
    },
    affectedRefs: [],
    contextPackRefs: [],
    activeLocks: [],
    blockingReasons: [],
    risk: {
      sideEffectClass: "external-byte-transfer",
      approvalClass: "provider-byte-transfer",
      previewSummary: input.unsafeSummary ?? "Provider byte-transfer preview.",
      affectedRefs: [],
      contextPackRefs: [],
      activeLocks: [],
      blockingReasons: []
    }
  }];
  return {
    schemaVersion: "agent-approval-cockpit.v1",
    generatedAt: "2026-07-08T15:00:00.000Z",
    summary: {
      pendingCount: pending.length,
      resumableCount: 0,
      blockedCount: 0,
      staleCount: 0,
      terminalCount: 0
    },
    decisionContract: {
      approvalAppendsDecisionOnly: true,
      denialAppendsDecisionOnly: true,
      requiresHumanActor: true,
      afterApproval: "Approval records a human decision only. A separate scheduler revalidates the exact preview hash before work.",
      forbiddenDirectEffects: [
        "provider-byte-transfer",
        "prr-send-followup",
        "legal-escalation",
        "export-publication",
        "destructive-repair",
        "accepted-graph-review"
      ]
    },
    approvalClasses: [{
      approvalClass: "provider-byte-transfer",
      label: "Provider byte transfer",
      requiredFor: "Sending selected evidence/artifact bytes to the configured provider.",
      providerByteTransferNote: "Approval itself transfers no bytes.",
      rationale: { required: true, secretSafe: true }
    }],
    queue: {
      generatedAt: "2026-07-08T15:00:00.000Z",
      pending,
      resumable: [],
      blocked: [],
      stale: [],
      denied: [],
      completed: [],
      failed: []
    },
    forbiddenDirectEffects: [
      "provider-byte-transfer",
      "prr-send-followup",
      "legal-escalation",
      "export-publication",
      "destructive-repair",
      "accepted-graph-review"
    ]
  };
}
```

- [ ] **Step 3: Run the targeted failing test**

Run:

```bash
npm test -- packages/ui/test/agent-approval-adapter.test.ts
```

Expected before implementation:

```text
Property 'loadApprovalCockpit' does not exist
```

- [ ] **Step 4: Extend UI types and adapter**

Modify `packages/ui/src/agent/agent-types.ts`:

```ts
export type {
  AgentApprovalCockpitDto,
  AgentApprovalDecisionResultDto,
  AgentApprovalQueueItemDto,
  AgentRuntimeDiagnosticDto,
  AgentStatusDto
} from "../../../agent/src/index.js";
```

Modify `packages/ui/src/agent/agent-adapter.ts`:

- Extend `AgentAdapter` with `loadApprovalCockpit`, `approveToolRequest`, and `denyToolRequest`.
- Add `agentApprovalCockpitFromJson(value)`.
- Add `agentApprovalDecisionResultFromJson(value)`.
- Reuse `safeAgentValue()` before parsing.
- Add Zod schemas for cockpit summary, decision contract, approval-class metadata, queue item, staleness, approval contract, review facts, risk, terminal state snippets, and decision result.
- `createHttpAgentAdapter()` must use `GET /api/agent/approvals`, `POST /api/agent/approvals/:toolRequestId/approve`, and `POST /api/agent/approvals/:toolRequestId/deny`.
- `createStaticAgentAdapter(status, approvalCockpit?)` must return an empty frozen cockpit when one is not supplied.
- HTTP failures must return or throw safe runtime diagnostics without raw response text.

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npm test -- packages/ui/test/agent-approval-adapter.test.ts packages/ui/test/agent-adapter.test.ts
```

Expected:

```text
Test Files  2 passed
```

- [ ] **Step 6: Commit Task 3**

Run:

```bash
git add packages/ui/src/agent/agent-types.ts packages/ui/src/agent/agent-adapter.ts packages/ui/test/agent-approval-adapter.test.ts docs/agentic/claims/task-3-agent-approval-adapter.md
git commit -m "feat: add agent approval cockpit adapter"
```

**Acceptance Criteria:**

- Browser adapter parses cockpit DTOs and decision results.
- Fetch calls target decision-only approval routes.
- Secret-shaped runtime text is redacted before parsing.
- Static adapter remains convenient for component tests.

**Rollback/Escalation:**

- Escalate if UI parsing requires importing Node-only modules or provider/runtime services.

### Task 4: Approval Cockpit Component

**Files:**
- Create: `packages/ui/src/agent/AgentApprovalCockpit.tsx`
- Create: `packages/ui/test/agent-approval-cockpit.test.tsx`
- Modify: `packages/ui/src/agent/AgentWorkspace.tsx`
- Modify: `packages/ui/test/agent-workspace.test.tsx`
- Create: `docs/agentic/claims/task-4-agent-approval-cockpit-component.md`

**Interfaces:**
- Consumes: `AgentApprovalCockpitDto` and decision callbacks from the UI adapter layer.
- Produces: a browser-only cockpit component with approval queue, request detail, evidence/provenance refs, risk/locks, rationale input, and decision-only buttons.

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-4-agent-approval-cockpit-component.md`, then mark it `in-progress` and commit the status update.

- [ ] **Step 2: Write failing component tests**

Create `packages/ui/test/agent-approval-cockpit.test.tsx`:

```tsx
/** @vitest-environment jsdom */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AgentApprovalCockpit } from "../src/agent/AgentApprovalCockpit.js";
import type { AgentApprovalCockpitDto } from "../src/agent/agent-types.js";

const previewHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("AgentApprovalCockpit", () => {
  it("renders provider byte-transfer queue detail and appends approval decisions only", () => {
    const onApprove = vi.fn();
    const onDeny = vi.fn();
    render(
      <AgentApprovalCockpit
        cockpit={cockpit()}
        decisionState="idle"
        onApprove={onApprove}
        onDeny={onDeny}
      />
    );

    const region = screen.getByRole("region", { name: "Agent approval cockpit" });
    expect(within(region).getByText("provider-byte-transfer")).toBeInTheDocument();
    expect(within(region).getByText(previewHash)).toBeInTheDocument();
    expect(within(region).getByText("evt_provider_preview")).toBeInTheDocument();
    expect(within(region).getByText(/approval records a decision only/i)).toBeInTheDocument();
    expect(within(region).getByText(/what happens after approval/i)).toBeInTheDocument();
    expect(within(region).getByText(/separate scheduler may resume/i)).toBeInTheDocument();
    expect(within(region).getByText(/exact preview hash binding/i)).toBeInTheDocument();
    fireEvent.change(within(region).getByLabelText("Decision rationale"), {
      target: { value: "Approved the exact provider preview." }
    });
    fireEvent.click(within(region).getByRole("button", { name: "Approve exact preview" }));

    expect(onApprove).toHaveBeenCalledWith({
      toolRequestId: "toolreq_provider_transfer",
      approvedPreviewHash: previewHash,
      rationale: "Approved the exact provider preview."
    });
    expect(onDeny).not.toHaveBeenCalled();
  });

  it("denies requests through a decision-only callback", () => {
    const onDeny = vi.fn();
    render(
      <AgentApprovalCockpit
        cockpit={cockpit()}
        decisionState="idle"
        onApprove={vi.fn()}
        onDeny={onDeny}
      />
    );

    fireEvent.change(screen.getByLabelText("Decision rationale"), {
      target: { value: "Need a smaller provider transfer preview." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Deny request" }));

    expect(onDeny).toHaveBeenCalledWith({
      toolRequestId: "toolreq_provider_transfer",
      rationale: "Need a smaller provider transfer preview."
    });
  });

  it("blocks approval for stale or locked requests while allowing denial", () => {
    render(
      <AgentApprovalCockpit
        cockpit={cockpit({ blocked: true })}
        decisionState="idle"
        onApprove={vi.fn()}
        onDeny={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("Decision rationale"), {
      target: { value: "Deny locked request." }
    });

    expect(screen.getByRole("button", { name: "Approve exact preview" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Deny request" })).toBeEnabled();
  });

  it("does not render forbidden execution controls", () => {
    render(
      <AgentApprovalCockpit
        cockpit={cockpit()}
        decisionState="idle"
        onApprove={vi.fn()}
        onDeny={vi.fn()}
      />
    );

    for (const forbiddenName of [
      /transfer provider bytes/i,
      /send prr/i,
      /export/i,
      /repair/i,
      /clear lock/i,
      /accept graph/i,
      /execute/i,
      /scheduler wake/i
    ]) {
      expect(screen.queryByRole("button", { name: forbiddenName })).not.toBeInTheDocument();
    }
  });
});

function cockpit(input: { readonly blocked?: boolean } = {}): AgentApprovalCockpitDto {
  const item = {
    toolRequestId: "toolreq_provider_transfer",
    runId: "run_provider_transfer",
    taskId: "task_provider_transfer",
    toolId: "provider.bytes.transfer",
    toolVersion: "1",
    sideEffectClass: "external-byte-transfer",
    approvalClass: "provider-byte-transfer",
    requiredApprovalClass: "provider-byte-transfer",
    previewHash,
    previewSummary: "Provider byte-transfer preview.",
    requestedAt: "2026-07-08T15:29:00.000Z",
    stale: false,
    executableByApproval: false as const,
    providerByteTransferNote: "Approval records a decision only; it does not transfer provider bytes.",
    staleness: {
      state: "current",
      approvable: !input.blocked
    },
    approvalContract: {
      requiredApprovalClass: "provider-byte-transfer",
      approvalRouteAppendsOnly: true,
      denialRouteAppendsOnly: true,
      rationaleRequired: true,
      rationaleSecretSafe: true,
      afterApproval: "A separate scheduler revalidates the exact preview hash before any execution."
    },
    review: {
      what: "Selected evidence excerpts for provider processing.",
      why: "The resident agent requested model assistance for selected evidence.",
      dataLeavesOrChanges: "Provider byte-transfer preview.",
      evidenceRefs: [{ kind: "event", id: "evt_provider_preview" }],
      artifactRefs: [],
      riskAndLockStatus: input.blocked ? "Provider transfer lock active." : "No active locks. Preview is current.",
      whatHappensAfterApproval: "A separate scheduler may resume after consume-time validation.",
      staleOrUnsafePrevention: input.blocked
        ? ["Active lock checks", "Exact preview hash binding"]
        : ["Exact preview hash binding", "Human-only approval"]
    },
    affectedRefs: [{ kind: "event", id: "evt_provider_preview" }],
    contextPackRefs: [],
    activeLocks: input.blocked
      ? [{ lockId: "lock_provider", category: "provider-byte-transfer", message: "Provider transfer lock active." }]
      : [],
    blockingReasons: input.blocked ? ["lock-active"] : [],
    risk: {
      sideEffectClass: "external-byte-transfer",
      approvalClass: "provider-byte-transfer",
      previewSummary: "Provider byte-transfer preview.",
      affectedRefs: [{ kind: "event", id: "evt_provider_preview" }],
      contextPackRefs: [],
      activeLocks: input.blocked
        ? [{ lockId: "lock_provider", category: "provider-byte-transfer", message: "Provider transfer lock active." }]
        : [],
      blockingReasons: input.blocked ? ["lock-active"] : []
    }
  };
  return {
    schemaVersion: "agent-approval-cockpit.v1",
    generatedAt: "2026-07-08T15:30:00.000Z",
    summary: {
      pendingCount: input.blocked ? 0 : 1,
      resumableCount: 0,
      blockedCount: input.blocked ? 1 : 0,
      staleCount: 0,
      terminalCount: 0
    },
    decisionContract: {
      approvalAppendsDecisionOnly: true,
      denialAppendsDecisionOnly: true,
      requiresHumanActor: true,
      afterApproval: "Approval records a human decision only. A separate scheduler revalidates the exact preview hash before work.",
      forbiddenDirectEffects: [
        "provider-byte-transfer",
        "prr-send-followup",
        "legal-escalation",
        "export-publication",
        "destructive-repair",
        "accepted-graph-review"
      ]
    },
    approvalClasses: [{
      approvalClass: "provider-byte-transfer",
      label: "Provider byte transfer",
      requiredFor: "Sending selected evidence/artifact bytes to the configured provider.",
      providerByteTransferNote: "Approval itself transfers no bytes.",
      rationale: { required: true, secretSafe: true }
    }],
    queue: {
      generatedAt: "2026-07-08T15:30:00.000Z",
      pending: input.blocked ? [] : [item],
      resumable: [],
      blocked: input.blocked ? [item] : [],
      stale: [],
      denied: [],
      completed: [],
      failed: []
    },
    forbiddenDirectEffects: [
      "provider-byte-transfer",
      "prr-send-followup",
      "legal-escalation",
      "export-publication",
      "destructive-repair",
      "accepted-graph-review"
    ]
  };
}
```

- [ ] **Step 3: Run the targeted failing component test**

Run:

```bash
npm test -- packages/ui/test/agent-approval-cockpit.test.tsx
```

Expected before implementation:

```text
Failed to resolve import "../src/agent/AgentApprovalCockpit.js"
```

- [ ] **Step 4: Build the cockpit component**

Create `packages/ui/src/agent/AgentApprovalCockpit.tsx`.

Implementation requirements:

- Import button icons from `@heroicons/react/24/outline`, using `CheckCircleIcon`, `NoSymbolIcon`, and `ArrowPathIcon` when helpful.
- Render a section with `aria-label="Agent approval cockpit"`.
- Render summary metrics for pending, blocked, stale, resumable, and terminal counts.
- Combine queue buckets for display in this order: `pending`, `blocked`, `stale`, `resumable`, `denied`, `completed`, `failed`.
- Select the first visible request by default.
- Show exact preview hash, required approval class, side-effect class, staleness state, provider byte-transfer note when present, tool ID/version, run ID, task ID, affected refs, context pack refs, active locks, blocking reasons, and terminal decision/result details.
- Show review facts for what the agent asks to do, why, what data leaves or changes, what evidence backs the request, what happens after approval, and what prevents stale or unsafe execution.
- Include one textarea labeled `Decision rationale`.
- Render `Approve exact preview` only as a decision button. Disable it when selected item is stale, has `staleness.approvable === false`, has blocking reasons, is terminal, has no rationale, or callback is absent.
- Render `Deny request` as a decision button. Disable it when selected item is terminal, has no rationale, or callback is absent.
- Never render buttons with labels matching provider transfer, PRR send, export, repair, lock clearing, accepted graph, scheduler wake, or execution.
- Keep layout dense and consistent with the existing Agent workspace panels.
- Keep all text inside responsive containers with break-word or break-all for hashes and IDs.

- [ ] **Step 5: Wire the component into AgentWorkspace**

Modify `packages/ui/src/agent/AgentWorkspace.tsx`:

- Add props `approvalCockpit`, `decisionState`, `onApproveToolRequest`, and `onDenyToolRequest`.
- Render `AgentApprovalCockpit` after the identity/lock summary and before provider cards.
- Keep the existing `Tool requests` section as a compact historical list or rename it to `Tool request ledger` if the cockpit is present.
- Update the existing "read-only" test expectations so refresh plus approve/deny decision buttons are allowed, while direct execution buttons remain forbidden.

- [ ] **Step 6: Run targeted tests**

Run:

```bash
npm test -- packages/ui/test/agent-approval-cockpit.test.tsx packages/ui/test/agent-workspace.test.tsx
```

Expected:

```text
Test Files  2 passed
```

- [ ] **Step 7: Commit Task 4**

Run:

```bash
git add packages/ui/src/agent/AgentApprovalCockpit.tsx packages/ui/src/agent/AgentWorkspace.tsx packages/ui/test/agent-approval-cockpit.test.tsx packages/ui/test/agent-workspace.test.tsx docs/agentic/claims/task-4-agent-approval-cockpit-component.md
git commit -m "feat: add agent approval cockpit component"
```

**Acceptance Criteria:**

- Provider byte-transfer approval detail is visible with exact preview hash, affected evidence/artifact refs, risk/lock status, required approval class, staleness state, provider byte-transfer note, and safe rationale field.
- Investigator review can answer what the agent asks to do, why, what data leaves or changes, what evidence backs it, what happens after approval, and what prevents stale or unsafe execution.
- Approval controls append decision intents only.
- Stale or locked requests cannot be approved from the UI.
- Denial remains available for non-terminal stale or locked requests with a rationale.
- Forbidden direct-effect buttons are absent.

**Rollback/Escalation:**

- Escalate if the component needs raw provider bytes, raw evidence text, secret-bearing diagnostics, or direct domain-service calls.

### Task 5: App Integration And Command Regression

**Files:**
- Modify: `packages/ui/src/App.tsx`
- Modify: `packages/ui/test/agent-app-integration.test.tsx`
- Modify: `packages/ui/test/app-smoke.test.tsx`
- Modify: `packages/ui/test/command-model.test.ts`
- Create: `docs/agentic/claims/task-5-agent-approval-app-integration.md`

**Interfaces:**
- Consumes: extended `AgentAdapter`.
- Produces: app-level loading, refresh, approve, and deny behavior for the Agent approval cockpit.

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-5-agent-approval-app-integration.md`, then mark it `in-progress` and commit the status update.

- [ ] **Step 2: Write failing integration tests**

Modify `packages/ui/test/agent-app-integration.test.tsx` to add:

```tsx
it("approves provider byte-transfer previews through the Agent adapter only", async () => {
  const approvals: unknown[] = [];
  const adapter = {
    ...createStaticAgentAdapter(agentStatus(), approvalCockpit()),
    async approveToolRequest(input: unknown) {
      approvals.push(input);
      return {
        ok: true,
        schemaVersion: "agent-approval-decision-result.v1" as const,
        eventIds: ["evt_agent_tool_approved_provider_transfer"],
        approvalCockpit: approvalCockpit({ pendingCount: 0 })
      };
    }
  };

  render(
    <App
      requestsAdapter={createTestRequestsAdapter()}
      ingestionAdapter={createStaticIngestionWorkspaceAdapter({ mounted: false, diagnostics: [] })}
      operatorStatusAdapter={createStaticOperatorStatusAdapter(operatorStatus())}
      agentAdapter={adapter}
    />
  );

  fireEvent.click(screen.getByRole("link", { name: "Agent" }));
  await screen.findByRole("region", { name: "Agent approval cockpit" });
  fireEvent.change(screen.getByLabelText("Decision rationale"), {
    target: { value: "Approved exact provider preview." }
  });
  fireEvent.click(screen.getByRole("button", { name: "Approve exact preview" }));

  expect(approvals).toEqual([{
    toolRequestId: "toolreq_provider_transfer",
    approvedPreviewHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    rationale: "Approved exact provider preview."
  }]);
  expect(screen.queryByRole("button", { name: /transfer provider bytes|send prr|export|repair|clear lock|accept graph/i })).not.toBeInTheDocument();
});
```

Add local helpers `approvalCockpit()` and a provider transfer `agentStatus()` item in the same file. The helper can mirror Task 4's fixture but must use `toolreq_provider_transfer` and provider byte-transfer text.

- [ ] **Step 3: Run the targeted failing integration test**

Run:

```bash
npm test -- packages/ui/test/agent-app-integration.test.tsx
```

Expected before implementation:

```text
Unable to find role="region" and name "Agent approval cockpit"
```

- [ ] **Step 4: Wire cockpit loading and decisions in App**

Modify `packages/ui/src/App.tsx`:

- Add state for `agentApprovalCockpit`, `agentApprovalDecisionState`, and `agentApprovalDiagnostic`.
- When Agent module becomes active, load `agentAdapter.loadStatus()` and `agentAdapter.loadApprovalCockpit()` together.
- On refresh, clear both status and cockpit state.
- Add `handleApproveToolRequest(input)` and `handleDenyToolRequest(input)`.
- Decision handlers call the adapter, then update cockpit from the decision result and reload status once.
- On decision failure, show a safe diagnostic through the cockpit component or Agent workspace without raw runtime text.
- Do not call ingestion adapter, request adapter, operator-status actions, provider adapters, scheduler wake, or any execution endpoint from these handlers.

- [ ] **Step 5: Preserve command model behavior**

Modify `packages/ui/test/command-model.test.ts` only as needed so Command still derives pending agent approval counts from `AgentStatusDto` and does not depend on approval cockpit UI state. If no production change is needed, update only the assertion text in this task's claim.

- [ ] **Step 6: Run targeted tests**

Run:

```bash
npm test -- packages/ui/test/agent-app-integration.test.tsx packages/ui/test/app-smoke.test.tsx packages/ui/test/command-model.test.ts
```

Expected:

```text
Test Files  3 passed
```

- [ ] **Step 7: Commit Task 5**

Run:

```bash
git add packages/ui/src/App.tsx packages/ui/test/agent-app-integration.test.tsx packages/ui/test/app-smoke.test.tsx packages/ui/test/command-model.test.ts docs/agentic/claims/task-5-agent-approval-app-integration.md
git commit -m "feat: wire agent approval cockpit app flow"
```

**Acceptance Criteria:**

- The Agent module loads status and approval cockpit DTOs.
- Approve and deny UI actions call only Agent adapter decision methods.
- UI refresh reloads approval cockpit state.
- Command workspace agent brief continues to show approval pressure without importing cockpit internals.

**Rollback/Escalation:**

- Escalate if app integration requires adding a direct execution endpoint or weakening existing ingestion/request/operator status boundaries.

### Task 6: Verification And Readiness

**Files:**
- Modify: `docs/agentic/software-factory.md`
- Modify: `docs/superpowers/plans/2026-07-08-resident-agent-approval-cockpit-routes-ui-implementation.md`
- Create: `docs/agentic/claims/task-6-agent-approval-readiness.md`

**Interfaces:**
- Consumes: completed Tasks 1 through 5.
- Produces: readiness evidence and final review handoff.

- [x] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-6-agent-approval-readiness.md`, then mark it `in-progress` and commit the status update.

- [x] **Step 2: Run focused verification**

Run:

```bash
npm test -- packages/agent/test/approval-cockpit.test.ts packages/agent/test/approval-queue.test.ts packages/local-runtime/test/agent-approval-routes.test.ts packages/local-runtime/test/agent-http-routes.test.ts packages/ui/test/agent-approval-adapter.test.ts packages/ui/test/agent-approval-cockpit.test.tsx packages/ui/test/agent-workspace.test.tsx packages/ui/test/agent-app-integration.test.tsx packages/ui/test/app-smoke.test.tsx packages/ui/test/command-model.test.ts
```

Expected:

```text
Test Files  10 passed
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

- [x] **Step 4: Check whitespace**

Run:

```bash
git diff --check
```

Expected:

```text
no output
```

- [x] **Step 5: Run live Nous provider acceptance smoke**

Run the live smoke from the repo root. The command uses the ignored local `.env` for `CESTUS_AGENT_NOUS_API_KEY`, writes an isolated temporary SQLite ledger, invokes the real Nous Portal provider through `defaultLocalAgentRuntimeFactory`, and prints only safe provider IDs, model family names, event IDs, and output hashes. It must not print the API key, raw provider response text, raw provider errors, prompts, or any secret-shaped string.

```bash
node --disable-warning=ExperimentalWarning --import tsx - <<'TS'
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultLocalAgentRuntimeFactory } from "./packages/local-runtime/src/agent-runtime-factory.js";
import { resolveLocalRuntimeConfig } from "./packages/local-runtime/src/config.js";
import { createSqlitePrrRuntime } from "./packages/local-runtime/src/runtime-factory.js";

const now = () => "2026-07-08T18:00:00.000Z";
const actor = { id: "actor_live_nous_smoke", kind: "human", label: "Live Nous Smoke" } as const;
const tempDir = mkdtempSync(join(tmpdir(), "cestus-live-nous-smoke-"));
const env = {
  ...process.env,
  CESTUS_LOCAL_STORAGE: "explicit-path",
  CESTUS_LOCAL_SQLITE_PATH: join(tempDir, "ledger.sqlite")
};
const config = resolveLocalRuntimeConfig({ cwd: process.cwd(), env });
const handle = createSqlitePrrRuntime({ config, actor, now });

try {
  const runtime = defaultLocalAgentRuntimeFactory({ handle, actor, now });
  const status = await runtime.status();
  const provider = status.providers.find((candidate) => candidate.providerId === "provider_nous_portal");
  if (provider === undefined) {
    throw new Error("Nous provider was not discovered from local .env");
  }

  const suffix = String(Date.now());
  const taskId = `task_live_nous_smoke_${suffix}`;
  const runId = `run_live_nous_smoke_${suffix}`;
  const invocationId = `inv_live_nous_smoke_${suffix}`;

  await runtime.initializeDefaultIdentity({
    workspaceId: "ws_live_nous_smoke",
    initializedBy: actor.id
  });
  const task = await runtime.createTask({
    taskId,
    title: "Live Nous provider smoke",
    requestedBy: actor.id,
    priority: "normal"
  });
  if (!task.ok) {
    throw new Error("Unable to create live Nous smoke task");
  }
  const run = await runtime.startRun({
    runId,
    taskId,
    runType: "evidence-triage",
    scope: { kind: "workspace", refs: ["ws_live_nous_smoke"] },
    startedBy: actor.id
  });
  if (!run.ok) {
    throw new Error("Unable to start live Nous smoke run");
  }
  const result = await runtime.invokeModel({
    invocationId,
    runId,
    providerId: provider.providerId,
    modelFamily: provider.modelFamilies[0]!,
    inputArtifactHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    credentialRef: {
      credentialRefId: "agent_credref_nous_portal",
      providerId: provider.providerId,
      kind: "api-key-bearer",
      safeLabel: "Nous Portal local auth reference"
    },
    safetyClass: "provider-approved"
  });
  if (!result.ok) {
    throw new Error("Live Nous invocation failed; inspect safe ledger diagnostics locally");
  }

  console.log(JSON.stringify({
    ok: true,
    providerId: provider.providerId,
    modelFamily: provider.modelFamilies[0],
    outputArtifactHash: result.outputArtifactHash,
    eventIds: result.eventIds
  }));
} finally {
  handle.close();
  rmSync(tempDir, { recursive: true, force: true });
}
TS
```

Expected:

```text
{"ok":true,"providerId":"provider_nous_portal",...}
```

If this smoke cannot discover the Nous provider from the ignored `.env`, cannot reach the endpoint, or records unsafe diagnostics, stop and escalate as a credential/external-service dependency or secret-safety failure. Do not substitute synthetic provider output for this acceptance evidence.

- [x] **Step 6: Record readiness evidence**

Append a `Resident Agent Approval Cockpit Routes And UI Readiness` section to `docs/agentic/software-factory.md` with:

- design file paths;
- plan file path;
- focused verification command;
- full verification command;
- whitespace command outcome;
- live Nous acceptance smoke command outcome, including provider ID, model family, event IDs, and output artifact hash only;
- statement that deterministic tests use synthetic provider-byte-transfer fixtures only for pure contract behavior;
- statement that live Nous Portal is the authoritative provider/model acceptance path for this slice;
- statement that approval/denial routes append decision events only;
- statement that no route or button sends PRR correspondence, transfers provider bytes, exports sensitive material, clears legal locks, executes repair, or accepts graph truth;
- statement that scheduler wake, domain execution adapters, rich provider preview storage, live provider byte transfer execution, PRR send/follow-up execution, export/publication execution, destructive repair, accepted graph review execution, and team-role approvals remain separate approved slices.

Update this plan with observed command evidence and checked boxes.

- [x] **Step 7: Run factory check**

Run:

```bash
npm run factory:check
```

Expected:

```text
factory-readiness passed
```

- [x] **Step 8: Commit readiness evidence**

Run:

```bash
git add docs/agentic/software-factory.md docs/superpowers/plans/2026-07-08-resident-agent-approval-cockpit-routes-ui-implementation.md docs/agentic/claims/task-6-agent-approval-readiness.md
git commit -m "docs: record agent approval cockpit readiness"
```

Observed command evidence:

```text
Focused bundle
npm test -- packages/agent/test/approval-cockpit.test.ts packages/agent/test/approval-queue.test.ts packages/local-runtime/test/agent-approval-routes.test.ts packages/local-runtime/test/agent-http-routes.test.ts packages/ui/test/agent-approval-adapter.test.ts packages/ui/test/agent-approval-cockpit.test.tsx packages/ui/test/agent-workspace.test.tsx packages/ui/test/agent-app-integration.test.tsx packages/ui/test/app-smoke.test.tsx packages/ui/test/command-model.test.ts
Test Files  10 passed (10)
Tests  88 passed (88)

Full verification
npm run verify
typecheck passed
Test Files  134 passed (134)
Tests  1304 passed (1304)
tests passed
vite build succeeded
factory-readiness passed

Whitespace
git diff --check
no output

Initial live smoke blocker root cause
The original exact smoke failed before provider invocation because the credential reference safeLabel used "Nous Portal local credential reference". Secret-safety intentionally rejects that label because it contains the word "credential".

Safe lower-level provider probe
providerId: provider_nous_portal
modelFamily: tencent/hy3:free
outputArtifactHash: sha256:6c473d7019772af97a591cb7b6777bbedf3b8eb699f7e696f4149ba24a31eca4
HTTP status / shape: 200 OpenAI-compatible response

Authoritative live smoke rerun with safe label
safeLabel: Nous Portal local auth reference
providerId: provider_nous_portal
modelFamily: tencent/hy3:free
outputArtifactHash: sha256:270aa91a724b42b5319931c6abffcebe625f658589133d47d7ee5c922f731e35
eventIds: evt_7b76696c0db0415dba5149dcaa4e5214, evt_c1c112af6a6d4a5badabd6858bfea67d

Factory check after readiness docs
npm run factory:check
factory-readiness passed
```

**Acceptance Criteria:**

- Focused route/UI tests pass.
- `npm run verify` passes.
- `git diff --check` passes.
- Live Nous Portal acceptance smoke passes with safe output only.
- Readiness evidence states that approval decisions do not execute tools.
- Standard deterministic tests do not need credentials, outbound byte transfer, or external services; live Nous acceptance is run separately and is required for provider/model behavior evidence.

**Rollback/Escalation:**

- Escalate after two focused repair attempts if focused tests or full verification continue failing.
- Escalate immediately on data-loss risk, schema conflict, unavailable `.env` credentials, live Nous endpoint failure, secret-safety failure, or any implementation path that bypasses human/domain gates.

## Completion Criteria

The approval cockpit routes/UI slice is complete when:

- Approval cockpit DTOs build from existing agent projection state.
- Local runtime exposes approval list/detail/approve/deny routes.
- Approval and denial routes append only `agent.tool.approved` or `agent.tool.denied`.
- The browser Agent workspace renders a provider byte-transfer approval queue with exact preview hashes and provenance refs.
- Stale or locked requests cannot be approved from the cockpit.
- Denial remains available for non-terminal requests with a human rationale.
- No browser button or local route performs provider byte transfer, PRR send/follow-up, legal escalation, export/publication, destructive repair, lock clearing, or accepted graph review execution.
- Focused tests and `npm run verify` pass.
- Live Nous Portal acceptance smoke passes without printing secrets, prompts, raw provider output, or raw provider errors.
- Readiness evidence is recorded.

## Deferred Follow-Up Slices

- Scheduler wake route and visible resume status.
- Domain execution adapter for provider byte-transfer after consume-time approval revalidation.
- PRR send and follow-up adapter.
- Legal escalation review workflow.
- Export and publication workflow.
- Destructive repair and projection rebuild execution gates.
- Accepted graph review cockpit integration.
- Rich provider preview artifact storage for media types, byte counts, excerpt policies, and retention notes.
- Team role-aware approval policy.
