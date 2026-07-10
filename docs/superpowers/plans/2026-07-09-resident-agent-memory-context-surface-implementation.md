# Resident Agent Memory Context Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make resident-agent memory visible, correctable, and usable in context packs while keeping it a provenance-backed aid rather than accepted ontology truth.

**Architecture:** Extend the existing resident-agent event contracts, projection, runtime, local HTTP routes, and Agent workspace instead of creating a second memory store. Memory recording, supersession, and retraction append ledger events; read surfaces derive list/detail DTOs from replayed projection state. `agent-memory-summary.v1` is built from active memory summaries only, with source refs, artifact hashes, stable hashes, size budgets, and no raw evidence text.

**Tech Stack:** TypeScript, Zod, Vitest, React, Testing Library, existing ontology ledger contracts, `packages/agent` projection/runtime/context-pack helpers, existing local-runtime auth boundary, and browser-safe Agent UI adapter patterns.

## Global Constraints

- Memory is resident-agent working memory, not accepted ontology truth.
- Memory can guide future actions, but any factual graph effect must become evidence-backed proposed assertion or reasoning and pass normal review.
- Every memory event remains append-only; supersession and retraction append new events and never mutate prior events.
- Agent-recorded memory requires source event IDs or artifact hashes.
- Human-entered preference/context memory is allowed only as visible working memory and still needs a source event ID or artifact hash for provenance.
- Memory summaries must be secret-safe, raw-content-free, budgeted, stable-hashed, and source-linked.
- Memory routes and UI must not accept assertions, resolve entities, send PRRs, export material, clear locks, run provider byte transfer, execute repair, or mutate old source trees.
- React renders browser-safe DTOs and route results only; it must not import runtime, SQLite, filesystem, ontology services, or local source-tree modules.
- If scheduler DTOs are needed, use current agent status/run/tool DTOs and leave a narrow bridge note instead of blocking this slice.
- Run the exact targeted command in each task and `npm run verify` before each task commit.

---

## File Structure

- `packages/ontology/src/contracts.ts`: optional memory kind contract for `agent.memory.recorded` and strict tests for non-authoritative guidance.
- `packages/ontology/test/agent-contracts.test.ts`: event-contract tests for memory kind, provenance, stream routing, and forbidden graph-truth shortcuts.
- `packages/agent/src/projection-types.ts`: projected memory fields and memory DTO interfaces shared by runtime and UI.
- `packages/agent/src/projection.ts`: replay memory kind, recorder actor metadata, full memory history, and DTO snapshots.
- `packages/agent/src/memory.ts`: pure memory list/detail DTO builders, command validators, and `agent-memory-summary.v1` context-pack builder.
- `packages/agent/src/runtime.ts`: append-only `recordMemory`, `supersedeMemory`, `retractMemory`, `listMemory`, and `memoryDetail` runtime methods.
- `packages/agent/src/runtime-types.ts`: exported DTO/result types for memory routes and UI adapter parsing.
- `packages/agent/src/index.ts`: export the memory surface.
- `packages/agent/test/memory.test.ts`: pure memory DTO and context-pack tests.
- `packages/agent/test/memory-runtime.test.ts`: runtime append, supersede, retract, provenance, and non-authoritative tests.
- `packages/local-runtime/src/agent-http-routes.ts`: safe memory list/detail/record/supersede/retract HTTP routes under the existing auth policy.
- `packages/local-runtime/test/agent-memory-routes.test.ts`: route tests for DTOs, human correction, auth, secret safety, and forbidden effects.
- `packages/ui/src/agent/agent-types.ts`: browser-visible memory DTO type exports.
- `packages/ui/src/agent/agent-adapter.ts`: HTTP/static adapter methods and Zod parsers for memory DTOs and mutation results.
- `packages/ui/src/agent/AgentMemoryPanel.tsx`: filterable memory list/detail and correction controls.
- `packages/ui/src/agent/AgentWorkspace.tsx`: integrate the memory panel into the existing Agent workspace.
- `packages/ui/test/agent-memory-adapter.test.ts`: adapter and secret-safety tests for memory DTOs/routes.
- `packages/ui/test/agent-workspace.test.tsx`: UI tests for filters, source refs, non-authoritative state, and no forbidden controls.
- `scripts/check-agent-readiness.mjs`: add this plan to required factory files after implementation is ready for merge.
- `docs/agentic/software-factory.md`: record final readiness evidence for this slice.

---

### Task 1: Memory DTOs And Context Pack Contract

**Files:**
- Modify: `packages/ontology/src/contracts.ts`
- Modify: `packages/ontology/test/agent-contracts.test.ts`
- Modify: `packages/agent/src/projection-types.ts`
- Modify: `packages/agent/src/projection.ts`
- Create: `packages/agent/src/memory.ts`
- Modify: `packages/agent/src/runtime-types.ts`
- Modify: `packages/agent/src/index.ts`
- Create: `packages/agent/test/memory.test.ts`
- Modify: `packages/agent/test/projection.test.ts`
- Modify: `packages/agent/test/context-packs.test.ts`

**Interfaces:**
- Consumes: existing `KnowledgeEvent`, `AgentProjection`, `ProjectedAgentMemory`, `buildContextPackRef`, and `assertAgentSecretSafeText`.
- Produces:
  - `type AgentMemoryKind = "operator-preference" | "agent-observation" | "policy-caveat" | "provider-note"`
  - `interface AgentMemoryListDto`
  - `interface AgentMemoryDetailDto`
  - `interface BuildAgentMemoryListInput`
  - `function buildAgentMemoryList(input: BuildAgentMemoryListInput): AgentMemoryListDto`
  - `function buildAgentMemoryDetail(input: { projection: AgentProjection; memoryId: string; generatedAt: string }): AgentMemoryDetailDto | undefined`
  - `function buildAgentMemorySummaryContextPack(input: BuildAgentMemorySummaryContextPackInput): ContextPackRef`

- [ ] **Step 1: Write failing ontology contract tests**

Add cases to `packages/ontology/test/agent-contracts.test.ts`:

```ts
it("records memory kind while requiring provenance and non-authoritative guidance", () => {
  const result = validateKnowledgeEvent({
    id: "evt_agent_memory_recorded_operator_pref",
    type: "agent.memory.recorded",
    version: 1,
    streamId: "agent_memory_mem_operator_preference",
    sequence: 1,
    context,
    payload: {
      memoryId: "mem_operator_preference",
      residentAgentId: "agent_default",
      scope: "workspace",
      memoryKind: "operator-preference",
      summary: "Case owner prefers concise PRR draft summaries.",
      sourceEventIds: ["evt_agent_task_created"],
      confidence: 0.9,
      createdAt: "2026-07-09T12:00:00.000Z"
    }
  });

  expect(result.success).toBe(true);
  expect(eventContracts["agent.memory.recorded"].agentGuidance).toMatch(/not accepted graph state/i);
  expect(eventContracts["agent.memory.recorded"].agentGuidance).toMatch(/forbidden autonomous effects/i);
});

it("rejects memory records without source events or artifact hashes", () => {
  expect(
    validateKnowledgeEvent({
      id: "evt_agent_memory_recorded_unproven",
      type: "agent.memory.recorded",
      version: 1,
      streamId: "agent_memory_mem_unproven",
      sequence: 1,
      context,
      payload: {
        memoryId: "mem_unproven",
        residentAgentId: "agent_default",
        scope: "investigation",
        memoryKind: "agent-observation",
        summary: "Agency X is connected to Vendor Y.",
        confidence: 0.7,
        createdAt: "2026-07-09T12:00:00.000Z"
      }
    }).success
  ).toBe(false);
});
```

- [ ] **Step 2: Write failing pure memory tests**

Create `packages/agent/test/memory.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildAgentProjection } from "../src/projection.js";
import {
  buildAgentMemoryDetail,
  buildAgentMemoryList,
  buildAgentMemorySummaryContextPack
} from "../src/memory.js";
import { goldenAgentLedgerEvents } from "./fixtures/golden-agent-ledger.js";

describe("agent memory surface", () => {
  it("lists active, superseded, and retracted memory with visible non-authoritative state", () => {
    const projection = buildAgentProjection(goldenAgentLedgerEvents);
    const dto = buildAgentMemoryList({
      projection,
      generatedAt: "2026-07-09T12:30:00.000Z",
      filters: { state: "all" }
    });

    expect(dto.schemaVersion).toBe("agent-memory-list.v1");
    expect(dto.truthBoundary.authoritativeForOntology).toBe(false);
    expect(dto.items.map((item) => item.state)).toEqual(expect.arrayContaining(["active", "superseded", "retracted"]));
    expect(dto.items.every((item) => item.sourceEventIds.length + item.artifactHashes.length > 0)).toBe(true);
  });

  it("builds a detail DTO with event history and source refs", () => {
    const projection = buildAgentProjection(goldenAgentLedgerEvents);
    const detail = buildAgentMemoryDetail({
      projection,
      memoryId: "mem_superseded_context",
      generatedAt: "2026-07-09T12:30:00.000Z"
    });

    expect(detail).toMatchObject({
      schemaVersion: "agent-memory-detail.v1",
      memory: {
        memoryId: "mem_superseded_context",
        state: "superseded"
      },
      truthBoundary: { authoritativeForOntology: false }
    });
    expect(detail?.history.map((entry) => entry.eventType)).toContain("agent.memory.superseded");
  });

  it("builds a stable budgeted agent-memory-summary.v1 context pack from active memory only", () => {
    const projection = buildAgentProjection(goldenAgentLedgerEvents);
    const ref = buildAgentMemorySummaryContextPack({
      projection,
      generatedAt: "2026-07-09T12:30:00.000Z",
      policyVersion: "agent-policy-v1",
      scope: { kind: "workspace", id: "ws_case_001" },
      sizeBudgetBytes: 16_384
    });

    expect(ref.contextPackId).toBe("agent-memory-summary.v1");
    expect(ref.version).toBe(1);
    expect(ref.provenanceRefs).toEqual(expect.arrayContaining(["evt_agent_memory_recorded_workspace_policy"]));
    expect(ref.safeSummary).toMatch(/working memory/i);
    expect(ref.sizeBytes).toBeLessThanOrEqual(16_384);
    expect(JSON.stringify(ref)).not.toContain("raw evidence");
  });
});
```

- [ ] **Step 3: Run targeted failing tests**

Run:

```bash
npm test -- packages/ontology/test/agent-contracts.test.ts packages/agent/test/projection.test.ts packages/agent/test/memory.test.ts packages/agent/test/context-packs.test.ts
```

Expected before implementation:

```text
memoryKind is rejected or ../src/memory.js is missing
```

- [ ] **Step 4: Add memory kind and projected memory metadata**

Modify `packages/ontology/src/contracts.ts`:

```ts
const agentMemoryKindSchema = z.enum([
  "operator-preference",
  "agent-observation",
  "policy-caveat",
  "provider-note"
]);

const agentMemoryRecordedPayloadSchema = z.object({
  memoryId: agentMemoryIdSchema,
  residentAgentId: residentAgentIdSchema,
  scope: agentMemoryScopeSchema,
  memoryKind: agentMemoryKindSchema.optional(),
  summary: secretSafeTextSchema,
  sourceEventIds: agentSourceEventIdsSchema.optional(),
  artifactHashes: agentArtifactHashesSchema.optional(),
  confidence: z.number().min(0).max(1),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional()
}).strict().superRefine((memory, ctx) => {
  if ((memory.sourceEventIds?.length ?? 0) === 0 && (memory.artifactHashes?.length ?? 0) === 0) {
    ctx.addIssue({
      code: "custom",
      path: ["sourceEventIds"],
      message: "memory requires sourceEventIds or artifactHashes provenance"
    });
  }
});
```

Keep stream routing unchanged: `agent.memory.* -> agent_memory_${payload.memoryId}`. Update `eventContracts["agent.memory.recorded"].agentGuidance` to name `memoryKind` and repeat that memory cannot accept assertions, resolve entities, create relationships, send PRRs, export material, clear locks, or mutate source trees.

Modify `packages/agent/src/projection-types.ts`:

```ts
export type AgentMemoryKind = "operator-preference" | "agent-observation" | "policy-caveat" | "provider-note";

export interface ProjectedAgentMemory extends ProjectedAgentProvenance {
  readonly memoryId: string;
  readonly residentAgentId: string;
  readonly scope: AgentMemoryScope;
  readonly memoryKind: AgentMemoryKind;
  readonly summary: string;
  readonly recordedBy: string;
  readonly recordedByKind: "human" | "agent" | "extractor" | "system";
  readonly sourceEventIds: readonly string[];
  readonly artifactHashes: readonly string[];
  readonly confidence: number;
  readonly createdAt: string;
  readonly expiresAt?: string | undefined;
  readonly state: AgentMemoryState;
  readonly supersededByMemoryId?: string | undefined;
  readonly supersededBy?: string | undefined;
  readonly supersededAt?: string | undefined;
  readonly supersessionRationale?: string | undefined;
  readonly retractedBy?: string | undefined;
  readonly retractedAt?: string | undefined;
  readonly retractionRationale?: string | undefined;
}
```

Modify `packages/agent/src/projection.ts` in the `agent.memory.recorded` case:

```ts
memoryKind: event.payload.memoryKind ?? "agent-observation",
recordedBy: event.context.actor.id,
recordedByKind: event.context.actor.kind,
```

- [ ] **Step 5: Add pure DTO and context-pack builders**

Create `packages/agent/src/memory.ts` with exported DTO builders:

```ts
import { buildContextPackRef, type ContextPackRef, type ContextPackScope } from "./context-packs.js";
import type { AgentProjection } from "./projection.js";
import type { AgentMemoryScope, AgentMemoryState, ProjectedAgentMemory } from "./projection-types.js";
import { assertAgentSecretSafeText } from "./secret-safety.js";

export interface AgentMemoryTruthBoundaryDto {
  readonly authoritativeForOntology: false;
  readonly label: "working-memory-not-ontology-truth";
  readonly graphEffectRequires: "evidence-backed-proposed-assertion-or-reviewed-reasoning";
}

export interface AgentMemoryListDto {
  readonly schemaVersion: "agent-memory-list.v1";
  readonly generatedAt: string;
  readonly filters: AgentMemoryFiltersDto;
  readonly truthBoundary: AgentMemoryTruthBoundaryDto;
  readonly items: readonly ProjectedAgentMemory[];
}

export interface AgentMemoryDetailDto {
  readonly schemaVersion: "agent-memory-detail.v1";
  readonly generatedAt: string;
  readonly truthBoundary: AgentMemoryTruthBoundaryDto;
  readonly memory: ProjectedAgentMemory;
  readonly history: readonly AgentMemoryHistoryEntryDto[];
}

export interface AgentMemoryFiltersDto {
  readonly scope?: AgentMemoryScope | "all";
  readonly state?: AgentMemoryState | "all";
}

export interface AgentMemoryHistoryEntryDto {
  readonly eventId: string;
  readonly eventType: "agent.memory.recorded" | "agent.memory.superseded" | "agent.memory.retracted";
  readonly occurredAt?: string;
}

export interface BuildAgentMemoryListInput {
  readonly projection: AgentProjection;
  readonly generatedAt: string;
  readonly filters?: AgentMemoryFiltersDto;
}

export interface BuildAgentMemorySummaryContextPackInput {
  readonly projection: AgentProjection;
  readonly generatedAt: string;
  readonly policyVersion?: string;
  readonly scope?: ContextPackScope;
  readonly sizeBudgetBytes?: number;
  readonly maxItems?: number;
}

export function buildAgentMemoryList(input: BuildAgentMemoryListInput): AgentMemoryListDto {
  const filters = Object.freeze({
    scope: input.filters?.scope ?? "all",
    state: input.filters?.state ?? "active"
  });
  const allMemory = [...input.projection.memoryHistory.values()];
  const items = allMemory
    .filter((memory) => filters.scope === "all" || memory.scope === filters.scope)
    .filter((memory) => filters.state === "all" || memory.state === filters.state)
    .sort(compareMemory);

  return deepFreeze({
    schemaVersion: "agent-memory-list.v1",
    generatedAt: input.generatedAt,
    filters,
    truthBoundary: memoryTruthBoundary(),
    items
  });
}

export function buildAgentMemoryDetail(input: {
  readonly projection: AgentProjection;
  readonly memoryId: string;
  readonly generatedAt: string;
}): AgentMemoryDetailDto | undefined {
  assertAgentSecretSafeText(input.memoryId, "memoryId");
  const memory = input.projection.memoryHistory.get(input.memoryId);
  if (memory === undefined) {
    return undefined;
  }

  return deepFreeze({
    schemaVersion: "agent-memory-detail.v1",
    generatedAt: input.generatedAt,
    truthBoundary: memoryTruthBoundary(),
    memory,
    history: historyFor(memory)
  });
}

export function buildAgentMemorySummaryContextPack(input: BuildAgentMemorySummaryContextPackInput): ContextPackRef {
  const active = [...input.projection.activeMemory].sort(compareMemory).slice(0, input.maxItems ?? 25);
  const payload = {
    truthBoundary: memoryTruthBoundary(),
    items: active.map((memory) => ({
      memoryId: memory.memoryId,
      scope: memory.scope,
      memoryKind: memory.memoryKind,
      summary: memory.summary,
      confidence: memory.confidence,
      sourceEventIds: memory.sourceEventIds,
      artifactHashes: memory.artifactHashes,
      expiresAt: memory.expiresAt
    }))
  };
  const sourceEventIds = unique(active.flatMap((memory) => [...memory.eventIds, ...memory.sourceEventIds]));
  const artifactHashes = unique(active.flatMap((memory) => memory.artifactHashes));
  const provenanceRefs = [...sourceEventIds, ...artifactHashes];

  return buildContextPackRef({
    contextPackId: "agent-memory-summary.v1",
    version: 1,
    generatedAt: input.generatedAt,
    payload,
    safeSummary: `${active.length} active working memory item${active.length === 1 ? "" : "s"}; not ontology truth.`,
    provenanceRefs: provenanceRefs.length === 0 ? ["agent-memory:none"] : provenanceRefs,
    sourceEventIds,
    artifactHashes,
    ...(input.policyVersion === undefined ? {} : { policyVersion: input.policyVersion }),
    ...(input.scope === undefined ? {} : { scope: input.scope }),
    ...(input.sizeBudgetBytes === undefined ? {} : { sizeBudgetBytes: input.sizeBudgetBytes }),
    stalenessInputs: [{ kind: "projection-high-water-mark", ref: "agent.projection.memory", value: String(sourceEventIds.length) }]
  });
}

function memoryTruthBoundary(): AgentMemoryTruthBoundaryDto {
  return Object.freeze({
    authoritativeForOntology: false,
    label: "working-memory-not-ontology-truth",
    graphEffectRequires: "evidence-backed-proposed-assertion-or-reviewed-reasoning"
  });
}
```

Also add local helpers `compareMemory`, `historyFor`, `unique`, and `deepFreeze` in the same file. `historyFor` maps memory `eventIds` to event types using recorded first, superseded if `supersededAt` exists, and retracted if `retractedAt` exists.

- [ ] **Step 6: Export DTO types**

Modify `packages/agent/src/runtime-types.ts`:

```ts
export type {
  AgentMemoryDetailDto,
  AgentMemoryFiltersDto,
  AgentMemoryListDto,
  AgentMemoryTruthBoundaryDto
} from "./memory.js";
```

Modify `packages/agent/src/index.ts`:

```ts
export * from "./memory.js";
```

- [ ] **Step 7: Run targeted tests**

Run:

```bash
npm test -- packages/ontology/test/agent-contracts.test.ts packages/agent/test/projection.test.ts packages/agent/test/memory.test.ts packages/agent/test/context-packs.test.ts
```

Expected:

```text
Test Files  4 passed
```

- [ ] **Step 8: Run full verification and commit**

Run:

```bash
npm run verify
git add packages/ontology/src/contracts.ts packages/ontology/test/agent-contracts.test.ts packages/agent/src/projection-types.ts packages/agent/src/projection.ts packages/agent/src/memory.ts packages/agent/src/runtime-types.ts packages/agent/src/index.ts packages/agent/test/memory.test.ts packages/agent/test/projection.test.ts packages/agent/test/context-packs.test.ts
git commit -m "feat: define resident agent memory surface"
```

**Acceptance Criteria:**

- Memory events can carry memory kind without breaking existing golden ledgers.
- Memory list/detail DTOs include active, superseded, and retracted entries.
- DTOs make non-authoritative state machine-readable.
- `agent-memory-summary.v1` is stable, budgeted, source-linked, and secret-safe.
- No test or contract path treats memory as accepted assertion, entity resolution, relationship acceptance, PRR send, export, lock clearing, repair, or legacy source mutation authority.

**Rollback/Escalation:**

- Escalate if ontology schema changes would require weakening strict event validation.
- Revert only this task's files if existing agent/ontology contract tests fail for unrelated event families.

---

### Task 2: Append-Only Memory Runtime Methods

**Files:**
- Modify: `packages/agent/src/runtime.ts`
- Modify: `packages/agent/src/runtime-types.ts`
- Create: `packages/agent/test/memory-runtime.test.ts`
- Modify: `packages/agent/test/runtime.test.ts`

**Interfaces:**
- Consumes: Task 1 memory DTO builders and existing `EventLedger`.
- Produces:
  - `interface RecordAgentMemoryInput`
  - `interface SupersedeAgentMemoryInput`
  - `interface RetractAgentMemoryInput`
  - `interface AgentMemoryMutationResult`
  - Runtime methods `listMemory`, `memoryDetail`, `recordMemory`, `supersedeMemory`, and `retractMemory`.

- [ ] **Step 1: Write failing runtime tests**

Create `packages/agent/test/memory-runtime.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { createAgentRuntime } from "../src/runtime.js";

const humanActor = { id: "actor_case_owner", kind: "human" as const, label: "Case Owner" };
const agentActor = { id: "actor_cestus_agent", kind: "agent" as const, label: "Cestus Agent" };
const now = () => "2026-07-09T13:00:00.000Z";

describe("agent runtime memory", () => {
  it("records provenance-backed memory without appending ontology truth events", async () => {
    const ledger = new InMemoryEventLedger();
    const runtime = createAgentRuntime({ ledger, actor: agentActor, now });
    await runtime.initializeDefaultIdentity({ workspaceId: "ws_case_001" });

    const result = await runtime.recordMemory({
      memoryId: "mem_case_goal",
      scope: "investigation",
      memoryKind: "agent-observation",
      summary: "The current investigation is prioritizing fee-waiver evidence gaps.",
      sourceEventIds: ["evt_agent_task_created"],
      confidence: 0.82
    });

    expect(result).toMatchObject({ ok: true, memoryId: "mem_case_goal" });
    expect((await runtime.listMemory({ state: "active" })).items.map((item) => item.memoryId)).toEqual(["mem_case_goal"]);
    expect((await ledger.readAll()).map((event) => event.type)).not.toEqual(expect.arrayContaining([
      "assertion.accepted",
      "entity.resolved",
      "relationship.accepted",
      "prr.request.sent",
      "agent.lock.cleared"
    ]));
  });

  it("rejects unproven memory and redacts unsafe summaries", async () => {
    const ledger = new InMemoryEventLedger();
    const runtime = createAgentRuntime({ ledger, actor: agentActor, now });
    await runtime.initializeDefaultIdentity({ workspaceId: "ws_case_001" });

    const result = await runtime.recordMemory({
      memoryId: "mem_unproven",
      scope: "workspace",
      memoryKind: "agent-observation",
      summary: `Remember ${unsafeCredentialText()}`,
      confidence: 0.5
    });

    expect(result).toMatchObject({ ok: false, error: { category: "agent" } });
    expect(JSON.stringify(result)).not.toContain("unsafe-memory-value");
    expect(await ledger.readAll()).toHaveLength(1);
  });

  it("lets a human supersede and retract memory through new events only", async () => {
    const ledger = new InMemoryEventLedger();
    const runtime = createAgentRuntime({ ledger, actor: humanActor, now });
    await runtime.initializeDefaultIdentity({ workspaceId: "ws_case_001" });
    await runtime.recordMemory({
      memoryId: "mem_old_style",
      scope: "workspace",
      memoryKind: "operator-preference",
      summary: "Case owner prefers terse summaries.",
      sourceEventIds: ["evt_agent_task_created"],
      confidence: 0.9
    });

    await runtime.supersedeMemory({
      memoryId: "mem_old_style",
      supersededByMemoryId: "mem_new_style",
      scope: "workspace",
      memoryKind: "operator-preference",
      summary: "Case owner prefers concise summaries with source IDs.",
      sourceEventIds: ["evt_agent_task_updated"],
      confidence: 0.95,
      rationale: "Preference clarified during review."
    });
    await runtime.retractMemory({
      memoryId: "mem_new_style",
      rationale: "Operator removed this preference."
    });

    const events = await ledger.readAll();
    expect(events.map((event) => event.type)).toEqual([
      "agent.identity.initialized",
      "agent.memory.recorded",
      "agent.memory.recorded",
      "agent.memory.superseded",
      "agent.memory.retracted"
    ]);
    const list = await runtime.listMemory({ state: "all" });
    expect(list.items.find((item) => item.memoryId === "mem_old_style")?.state).toBe("superseded");
    expect(list.items.find((item) => item.memoryId === "mem_new_style")?.state).toBe("retracted");
  });
});

function unsafeCredentialText(): string {
  return `${"bear" + "er"} unsafe-memory-value`;
}
```

- [ ] **Step 2: Run targeted failing tests**

Run:

```bash
npm test -- packages/agent/test/memory-runtime.test.ts packages/agent/test/runtime.test.ts packages/agent/test/memory.test.ts
```

Expected before implementation:

```text
runtime.recordMemory is not a function
```

- [ ] **Step 3: Add runtime memory command types**

Modify `packages/agent/src/runtime.ts` near other command interfaces:

```ts
export interface RecordAgentMemoryInput {
  readonly memoryId: string;
  readonly scope: AgentMemoryScope;
  readonly memoryKind?: AgentMemoryKind;
  readonly summary: string;
  readonly sourceEventIds?: readonly string[];
  readonly artifactHashes?: readonly string[];
  readonly confidence: number;
  readonly expiresAt?: string;
}

export interface SupersedeAgentMemoryInput extends RecordAgentMemoryInput {
  readonly supersededByMemoryId: string;
  readonly rationale: string;
}

export interface RetractAgentMemoryInput {
  readonly memoryId: string;
  readonly rationale: string;
}

export interface AgentMemoryMutationResult {
  readonly memoryId: string;
  readonly eventIds: readonly string[];
}
```

Import `AgentMemoryKind`, `AgentMemoryScope`, `AgentMemoryState`, `buildAgentMemoryDetail`, and `buildAgentMemoryList`.

- [ ] **Step 4: Implement runtime memory methods**

Inside `createAgentRuntime`, add:

```ts
async listMemory(filters: { readonly scope?: AgentMemoryScope | "all"; readonly state?: AgentMemoryState | "all" } = {}) {
  return buildAgentMemoryList({
    projection: buildAgentProjection(await input.ledger.readAll()),
    generatedAt: input.now(),
    filters
  });
},

async memoryDetail(memoryId: string) {
  return buildAgentMemoryDetail({
    projection: buildAgentProjection(await input.ledger.readAll()),
    memoryId,
    generatedAt: input.now()
  });
},

async recordMemory(command: RecordAgentMemoryInput): Promise<AgentRuntimeResult<AgentMemoryMutationResult>> {
  const projection = buildAgentProjection(await input.ledger.readAll());
  const identity = projection.identity;
  if (identity === undefined) {
    return failedResult(agentDiagnostic("agent", "Resident identity is not initialized.", ["initialize the default resident identity"]));
  }
  const event = memoryRecordedEvent(input, identity.residentAgentId, command, lastValue(identity.eventIds));
  try {
    const committed = await appendRuntimeEvent(input.ledger, event, { expectedNextSequence: 1 });
    return { ok: true, memoryId: command.memoryId, eventIds: Object.freeze([committed.id]) };
  } catch {
    return failedResult(agentDiagnostic("agent", "Memory could not be recorded safely.", ["review memory provenance and safe summary"]));
  }
},

async supersedeMemory(command: SupersedeAgentMemoryInput): Promise<AgentRuntimeResult<AgentMemoryMutationResult>> {
  const projection = buildAgentProjection(await input.ledger.readAll());
  const previous = projection.memoryHistory.get(command.memoryId);
  const identity = projection.identity;
  if (identity === undefined || previous === undefined || previous.state !== "active") {
    return failedResult(agentDiagnostic("agent", "Active memory item was not found.", ["refresh memory before superseding"]));
  }
  try {
    const replacement = await appendRuntimeEvent(
      input.ledger,
      memoryRecordedEvent(input, identity.residentAgentId, { ...command, memoryId: command.supersededByMemoryId }, lastValue(previous.eventIds)),
      { expectedNextSequence: 1 }
    );
    const streamEvents = await input.ledger.readStream(memoryStreamId(command.memoryId));
    const superseded = await appendRuntimeEvent(input.ledger, {
      type: "agent.memory.superseded",
      version: 1,
      streamId: memoryStreamId(command.memoryId),
      context: agentContext(input, `corr_${command.memoryId}`, input.actor, replacement.id),
      payload: {
        memoryId: command.memoryId,
        supersededByMemoryId: command.supersededByMemoryId,
        supersededBy: input.actor.id,
        rationale: command.rationale,
        supersededAt: input.now()
      }
    }, { expectedNextSequence: streamEvents.length + 1 });
    return { ok: true, memoryId: command.supersededByMemoryId, eventIds: Object.freeze([replacement.id, superseded.id]) };
  } catch {
    return failedResult(agentDiagnostic("agent", "Memory could not be superseded safely.", ["refresh memory and review provenance"]));
  }
},

async retractMemory(command: RetractAgentMemoryInput): Promise<AgentRuntimeResult<AgentMemoryMutationResult>> {
  const projection = buildAgentProjection(await input.ledger.readAll());
  const previous = projection.memoryHistory.get(command.memoryId);
  if (previous === undefined || previous.state !== "active") {
    return failedResult(agentDiagnostic("agent", "Active memory item was not found.", ["refresh memory before retracting"]));
  }
  try {
    const streamEvents = await input.ledger.readStream(memoryStreamId(command.memoryId));
    const retracted = await appendRuntimeEvent(input.ledger, {
      type: "agent.memory.retracted",
      version: 1,
      streamId: memoryStreamId(command.memoryId),
      context: agentContext(input, `corr_${command.memoryId}`, input.actor, lastValue(previous.eventIds)),
      payload: {
        memoryId: command.memoryId,
        retractedBy: input.actor.id,
        rationale: command.rationale,
        retractedAt: input.now()
      }
    }, { expectedNextSequence: streamEvents.length + 1 });
    return { ok: true, memoryId: command.memoryId, eventIds: Object.freeze([retracted.id]) };
  } catch {
    return failedResult(agentDiagnostic("agent", "Memory could not be retracted safely.", ["refresh memory and review rationale"]));
  }
}
```

Add helper `memoryRecordedEvent` that constructs only `agent.memory.recorded`, uses `agentContext`, and passes `sourceEventIds`/`artifactHashes` through `optionalArray`. Add `memoryStreamId(memoryId: string): string { return \`agent_memory_${memoryId}\`; }`. Extend `RuntimeEventType` to include `agent.memory.recorded`, `agent.memory.superseded`, and `agent.memory.retracted`.

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npm test -- packages/agent/test/memory-runtime.test.ts packages/agent/test/runtime.test.ts packages/agent/test/memory.test.ts
```

Expected:

```text
Test Files  3 passed
```

- [ ] **Step 6: Run full verification and commit**

Run:

```bash
npm run verify
git add packages/agent/src/runtime.ts packages/agent/src/runtime-types.ts packages/agent/test/memory-runtime.test.ts packages/agent/test/runtime.test.ts
git commit -m "feat: add append-only agent memory runtime"
```

**Acceptance Criteria:**

- Runtime memory reads do not append ledger events.
- Recording requires provenance and secret-safe summaries.
- Supersession records a replacement memory and an append-only supersession event.
- Retraction appends a retraction event and keeps history replayable.
- Runtime memory methods never append accepted graph, PRR send, export, lock-clearing, repair, or legacy-source mutation events.

**Rollback/Escalation:**

- Escalate if runtime methods require scheduler-specific DTOs to compile.
- Escalate if append ordering cannot be made optimistic-concurrency safe without weakening the ledger contract.

---

### Task 3: Safe Local Runtime Memory Routes

**Files:**
- Modify: `packages/local-runtime/src/agent-http-routes.ts`
- Create: `packages/local-runtime/test/agent-memory-routes.test.ts`
- Modify: `packages/local-runtime/test/agent-http-routes.test.ts`

**Interfaces:**
- Consumes: Task 2 runtime memory methods.
- Produces:
  - `GET /api/agent/memory`
  - `GET /api/agent/memory/:memoryId`
  - `POST /api/agent/memory`
  - `POST /api/agent/memory/:memoryId/supersede`
  - `POST /api/agent/memory/:memoryId/retract`

- [ ] **Step 1: Write failing route tests**

Create `packages/local-runtime/test/agent-memory-routes.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveLocalRuntimeConfig } from "../src/config.js";
import { createLocalRuntimeHttpHandler, type LocalRuntimeHttpHandler } from "../src/http-handler.js";

const handlers: LocalRuntimeHttpHandler[] = [];
const tempDirs: string[] = [];

afterEach(() => {
  for (const handler of handlers.splice(0)) {
    handler.close();
  }
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("agent memory HTTP routes", () => {
  it("records, lists, supersedes, details, and retracts memory without hidden effects", async () => {
    const handler = testHandler();
    const recorded = await handler({
      method: "POST",
      url: "/api/agent/memory",
      body: JSON.stringify({
        memoryId: "mem_route_preference",
        scope: "workspace",
        memoryKind: "operator-preference",
        summary: "Case owner prefers source IDs in memory summaries.",
        sourceEventIds: ["evt_agent_task_created"],
        confidence: 0.91
      })
    });
    expect(recorded.status).toBe(200);

    const superseded = await handler({
      method: "POST",
      url: "/api/agent/memory/mem_route_preference/supersede",
      body: JSON.stringify({
        supersededByMemoryId: "mem_route_preference_v2",
        scope: "workspace",
        memoryKind: "operator-preference",
        summary: "Case owner prefers concise memory summaries with event IDs.",
        sourceEventIds: ["evt_agent_task_updated"],
        confidence: 0.95,
        rationale: "Preference clarified by operator."
      })
    });
    expect(superseded.status).toBe(200);

    const listed = await handler({ method: "GET", url: "/api/agent/memory?state=all&scope=workspace" });
    const list = JSON.parse(listed.body) as { readonly schemaVersion: string; readonly items: readonly { readonly memoryId: string; readonly state: string }[] };
    expect(list.schemaVersion).toBe("agent-memory-list.v1");
    expect(list.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ memoryId: "mem_route_preference", state: "superseded" }),
      expect.objectContaining({ memoryId: "mem_route_preference_v2", state: "active" })
    ]));

    const detail = await handler({ method: "GET", url: "/api/agent/memory/mem_route_preference" });
    expect(JSON.parse(detail.body)).toMatchObject({
      schemaVersion: "agent-memory-detail.v1",
      truthBoundary: { authoritativeForOntology: false }
    });

    const retracted = await handler({
      method: "POST",
      url: "/api/agent/memory/mem_route_preference_v2/retract",
      body: JSON.stringify({ rationale: "Operator removed this preference." })
    });
    expect(retracted.status).toBe(200);

    const status = await handler({ method: "GET", url: "/api/agent/status" });
    const eventTypes = JSON.stringify(JSON.parse(status.body));
    expect(eventTypes).not.toMatch(/assertion\.accepted|entity\.resolved|relationship\.accepted|prr\.request\.sent|agent\.lock\.cleared/);
  });

  it("rejects unsafe or unproven memory bodies without echoing source text", async () => {
    const handler = testHandler();
    const response = await handler({
      method: "POST",
      url: "/api/agent/memory",
      body: JSON.stringify({
        memoryId: "mem_route_secret",
        scope: "workspace",
        memoryKind: "agent-observation",
        summary: `Remember ${unsafeCredentialText()}`,
        confidence: 0.5
      })
    });

    expect(response.status).toBe(400);
    expect(response.body).not.toContain("unsafe-memory-value");
    expect(JSON.parse(response.body)).toMatchObject({
      ok: false,
      diagnostic: { message: "Agent memory body is invalid." }
    });
  });

  it("requires a human actor for HTTP memory correction routes", async () => {
    const handler = testHandler({ actor: { id: "actor_cestus_agent", kind: "agent", label: "Cestus Agent" } });
    const response = await handler({
      method: "POST",
      url: "/api/agent/memory",
      body: JSON.stringify({
        memoryId: "mem_agent_route",
        scope: "workspace",
        memoryKind: "agent-observation",
        summary: "Safe observation with provenance.",
        sourceEventIds: ["evt_agent_task_created"],
        confidence: 0.7
      })
    });

    expect(response.status).toBe(403);
    expect(JSON.parse(response.body)).toMatchObject({
      ok: false,
      diagnostic: { message: "Agent memory correction requires a human actor." }
    });
  });
});

function unsafeCredentialText(): string {
  return `${"bear" + "er"} unsafe-memory-value`;
}

function testHandler(input: {
  readonly actor?: { readonly id: string; readonly kind: "human" | "agent" | "system"; readonly label: string };
} = {}) {
  const cwd = mkdtempSync(join(tmpdir(), "cestus-agent-memory-route-"));
  tempDirs.push(cwd);
  const handler = createLocalRuntimeHttpHandler({
    config: resolveLocalRuntimeConfig({ cwd, env: {} }),
    actor: input.actor ?? { id: "actor_case_owner", kind: "human", label: "Case Owner" },
    now: () => "2026-07-09T14:00:00.000Z"
  });
  handlers.push(handler);
  return handler;
}
```

- [ ] **Step 2: Run targeted failing tests**

Run:

```bash
npm test -- packages/local-runtime/test/agent-memory-routes.test.ts packages/local-runtime/test/agent-http-routes.test.ts
```

Expected before implementation:

```text
expected 200 but received 404
```

- [ ] **Step 3: Add route matching and parsing**

Modify `packages/local-runtime/src/agent-http-routes.ts`:

```ts
type MemoryRoute =
  | { readonly kind: "list" }
  | { readonly kind: "detail"; readonly memoryId: string }
  | { readonly kind: "record" }
  | { readonly kind: "supersede"; readonly memoryId: string }
  | { readonly kind: "retract"; readonly memoryId: string };

function matchMemoryRoute(path: string): MemoryRoute | undefined {
  if (path === "/api/agent/memory") {
    return { kind: "list" };
  }
  const match = /^\/api\/agent\/memory\/([^/]+?)(?:\/(supersede|retract))?$/.exec(path);
  if (match === null || !isSafeNonEmptyText(match[1])) {
    return undefined;
  }
  if (match[2] === "supersede") {
    return { kind: "supersede", memoryId: match[1] };
  }
  if (match[2] === "retract") {
    return { kind: "retract", memoryId: match[1] };
  }
  return { kind: "detail", memoryId: match[1] };
}
```

Add body parsers:

```ts
function memoryRecordInputFromBody(value: Record<string, unknown>) {
  if (!hasOnlyKeys(value, ["memoryId", "scope", "memoryKind", "summary", "sourceEventIds", "artifactHashes", "confidence", "expiresAt"])) {
    return undefined;
  }
  if (!isSafeNonEmptyText(value.memoryId) || !isMemoryScope(value.scope) || !isMemoryKind(value.memoryKind ?? "agent-observation") || !isSafeNonEmptyText(value.summary) || typeof value.confidence !== "number") {
    return undefined;
  }
  const sourceEventIds = stringArray(value.sourceEventIds);
  const artifactHashes = stringArray(value.artifactHashes);
  if ((sourceEventIds?.length ?? 0) === 0 && (artifactHashes?.length ?? 0) === 0) {
    return undefined;
  }
  return {
    memoryId: value.memoryId,
    scope: value.scope,
    memoryKind: value.memoryKind ?? "agent-observation",
    summary: value.summary,
    sourceEventIds,
    artifactHashes,
    confidence: value.confidence,
    ...(typeof value.expiresAt === "string" ? { expiresAt: value.expiresAt } : {})
  };
}
```

Add equivalent parsers for supersede and retract. Keep invalid responses generic and never echo request bodies.

- [ ] **Step 4: Add safe route behavior**

In `handleAgentHttpRoute`, after runtime creation and before generic task routes:

```ts
const memoryRoute = matchMemoryRoute(path);
if (memoryRoute !== undefined) {
  if (input.request.method === "GET" && memoryRoute.kind === "list") {
    const url = new URL(input.request.url, "http://localhost");
    return json(200, await runtime.listMemory({
      scope: memoryScopeFilter(url.searchParams.get("scope")),
      state: memoryStateFilter(url.searchParams.get("state"))
    }));
  }
  if (input.request.method === "GET" && memoryRoute.kind === "detail") {
    const detail = await runtime.memoryDetail(memoryRoute.memoryId);
    return detail === undefined ? json(404, missingMemoryDiagnostic()) : json(200, detail);
  }
  if (input.actor.kind !== "human") {
    return json(403, humanMemoryActorDiagnostic());
  }
  const initialized = await ensureDefaultIdentity(runtime, input);
  if (!initialized.ok) {
    return json(500, initialized.body);
  }
  if (input.request.method === "POST" && memoryRoute.kind === "list") {
    const payload = parseJsonObjectBody(input.request.body, invalidMemoryBodyDiagnostic);
    if (!payload.ok) {
      return json(400, payload.body);
    }
    const command = memoryRecordInputFromBody(payload.value);
    return command === undefined ? json(400, invalidMemoryBodyDiagnostic()) : memoryMutationResponse(await runtime.recordMemory(command));
  }
  if (input.request.method === "POST" && memoryRoute.kind === "supersede") {
    const payload = parseJsonObjectBody(input.request.body, invalidMemoryBodyDiagnostic);
    const command = payload.ok ? memorySupersedeInputFromBody(memoryRoute.memoryId, payload.value) : undefined;
    return payload.ok && command !== undefined ? memoryMutationResponse(await runtime.supersedeMemory(command)) : json(400, invalidMemoryBodyDiagnostic());
  }
  if (input.request.method === "POST" && memoryRoute.kind === "retract") {
    const payload = parseJsonObjectBody(input.request.body, invalidMemoryBodyDiagnostic);
    const command = payload.ok ? memoryRetractInputFromBody(memoryRoute.memoryId, payload.value) : undefined;
    return payload.ok && command !== undefined ? memoryMutationResponse(await runtime.retractMemory(command)) : json(400, invalidMemoryBodyDiagnostic());
  }
}
```

`memoryMutationResponse` returns HTTP 200 for `ok: true`, HTTP 400 for runtime validation failures, and includes only the runtime's safe diagnostic message/actions.

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npm test -- packages/local-runtime/test/agent-memory-routes.test.ts packages/local-runtime/test/agent-http-routes.test.ts
```

Expected:

```text
Test Files  2 passed
```

- [ ] **Step 6: Run full verification and commit**

Run:

```bash
npm run verify
git add packages/local-runtime/src/agent-http-routes.ts packages/local-runtime/test/agent-memory-routes.test.ts packages/local-runtime/test/agent-http-routes.test.ts
git commit -m "feat: expose safe agent memory routes"
```

**Acceptance Criteria:**

- Memory list/detail routes are read-only.
- Record/supersede/retract routes append memory events only and require a human actor in the local HTTP surface.
- Existing local-runtime auth still protects routes when bind mode requires auth.
- Invalid and unsafe bodies return generic diagnostics without echoing secrets or source text.
- Routes do not expose accepted graph review, PRR send, export, lock clearing, repair, provider byte transfer, or legacy mutation commands.

**Rollback/Escalation:**

- Escalate if route support requires bypassing existing local-runtime auth.
- Escalate if memory correction needs scheduler-specific route contracts not present on this branch.

---

### Task 4: Inspectable Agent Memory UI

**Files:**
- Modify: `packages/ui/src/agent/agent-types.ts`
- Modify: `packages/ui/src/agent/agent-adapter.ts`
- Create: `packages/ui/src/agent/AgentMemoryPanel.tsx`
- Modify: `packages/ui/src/agent/AgentWorkspace.tsx`
- Create: `packages/ui/test/agent-memory-adapter.test.ts`
- Modify: `packages/ui/test/agent-workspace.test.tsx`
- Modify: `packages/ui/test/agent-app-integration.test.tsx`

**Interfaces:**
- Consumes: Task 3 memory routes and Task 1 memory DTO schemas.
- Produces:
  - Adapter methods `loadMemory`, `loadMemoryDetail`, `recordMemory`, `supersedeMemory`, `retractMemory`.
  - `AgentMemoryPanel` with scope/status filtering, source refs, artifact hashes, confidence, expiry, and correction controls.

- [ ] **Step 1: Write failing adapter tests**

Create `packages/ui/test/agent-memory-adapter.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createHttpAgentAdapter, createStaticAgentAdapter } from "../src/agent/agent-adapter.js";
import { agentMemoryList } from "./fixtures/agent-memory.js";

describe("agent memory adapter", () => {
  it("loads filtered memory through a safe GET route", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(agentMemoryList()), { status: 200 }));
    const adapter = createHttpAgentAdapter({ baseUrl: "http://127.0.0.1:8787", authToken: "local-token", fetcher });

    await expect(adapter.loadMemory({ scope: "workspace", state: "all" })).resolves.toMatchObject({
      schemaVersion: "agent-memory-list.v1",
      truthBoundary: { authoritativeForOntology: false }
    });
    expect(fetcher).toHaveBeenCalledWith("http://127.0.0.1:8787/api/agent/memory?scope=workspace&state=all", expect.objectContaining({
      method: "GET",
      headers: { authorization: "Bearer local-token" }
    }));
  });

  it("posts record, supersede, and retract bodies without adding forbidden commands", async () => {
    const responses = [
      new Response(JSON.stringify({ ok: true, memoryId: "mem_ui", eventIds: ["evt_memory_recorded"] }), { status: 200 }),
      new Response(JSON.stringify({ ok: true, memoryId: "mem_ui_v2", eventIds: ["evt_memory_replacement", "evt_memory_superseded"] }), { status: 200 }),
      new Response(JSON.stringify({ ok: true, memoryId: "mem_ui_v2", eventIds: ["evt_memory_retracted"] }), { status: 200 })
    ];
    const fetcher = vi.fn(async () => responses.shift() ?? new Response("{}", { status: 500 }));
    const adapter = createHttpAgentAdapter({ fetcher });

    await adapter.recordMemory({
      memoryId: "mem_ui",
      scope: "workspace",
      memoryKind: "operator-preference",
      summary: "Use compact memory summaries.",
      sourceEventIds: ["evt_task"],
      confidence: 0.8
    });
    await adapter.supersedeMemory({
      memoryId: "mem_ui",
      supersededByMemoryId: "mem_ui_v2",
      scope: "workspace",
      memoryKind: "operator-preference",
      summary: "Use compact memory summaries with source refs.",
      sourceEventIds: ["evt_task_update"],
      confidence: 0.9,
      rationale: "Clarified by user."
    });
    await adapter.retractMemory({ memoryId: "mem_ui_v2", rationale: "No longer useful." });

    const calledUrls = fetcher.mock.calls.map((call) => String(call[0]));
    expect(calledUrls).toEqual([
      "/api/agent/memory",
      "/api/agent/memory/mem_ui/supersede",
      "/api/agent/memory/mem_ui_v2/retract"
    ]);
    expect(JSON.stringify(fetcher.mock.calls)).not.toMatch(/send prr|export|clear lock|accepted graph|provider byte/i);
  });

  it("redacts unsafe memory summaries before parsing", async () => {
    const adapter = createStaticAgentAdapter(undefined, undefined, agentMemoryList({
      items: [{
        memoryId: "mem_secret",
        residentAgentId: "agent_default",
        scope: "provider",
        memoryKind: "provider-note",
        summary: `Provider echoed ${unsafeCredentialText()} and ${unsafeEnvName()}.`,
        recordedBy: "actor_cestus_agent",
        recordedByKind: "agent",
        sourceEventIds: ["evt_memory"],
        artifactHashes: [],
        confidence: 0.5,
        createdAt: "2026-07-09T15:00:00.000Z",
        state: "active",
        eventIds: ["evt_memory"],
        causationIds: []
      }]
    }));

    const loaded = await adapter.loadMemory({ state: "all" });
    expect(JSON.stringify(loaded)).not.toContain("unsafe-memory-value");
    expect(JSON.stringify(loaded)).not.toContain(unsafeEnvName());
  });
});

function unsafeCredentialText(): string {
  return `${"bear" + "er"} unsafe-memory-value`;
}

function unsafeEnvName(): string {
  return ["OPENAI", "API", "KEY"].join("_");
}
```

Add a small fixture helper in the same test file or `packages/ui/test/fixtures/agent-memory.ts` if fixtures already exist for agent status.

- [ ] **Step 2: Write failing workspace tests**

Modify `packages/ui/test/agent-workspace.test.tsx`:

```ts
it("renders filterable working memory with source refs and correction controls", () => {
  const onRecordMemory = vi.fn();
  const onSupersedeMemory = vi.fn();
  const onRetractMemory = vi.fn();

  render(
    <AgentWorkspace
      status={agentStatus()}
      memoryList={agentMemoryList({ state: "all" })}
      loadState="loaded"
      onRefresh={vi.fn()}
      onRecordMemory={onRecordMemory}
      onSupersedeMemory={onSupersedeMemory}
      onRetractMemory={onRetractMemory}
    />
  );

  const memory = screen.getByRole("region", { name: "Agent working memory" });
  expect(within(memory).getByText("working-memory-not-ontology-truth")).toBeInTheDocument();
  expect(within(memory).getByText("workspace")).toBeInTheDocument();
  expect(within(memory).getByText("operator-preference")).toBeInTheDocument();
  expect(within(memory).getByText("evt_memory_recorded")).toBeInTheDocument();
  expect(within(memory).getByLabelText("Memory scope")).toBeInTheDocument();
  expect(within(memory).getByLabelText("Memory state")).toBeInTheDocument();

  fireEvent.change(within(memory).getByLabelText("New memory summary"), {
    target: { value: "Use concise source-linked memory summaries." }
  });
  fireEvent.change(within(memory).getByLabelText("New memory source event IDs"), {
    target: { value: "evt_agent_task_created" }
  });
  fireEvent.click(within(memory).getByRole("button", { name: "Record memory" }));
  expect(onRecordMemory).toHaveBeenCalledWith(expect.objectContaining({
    summary: "Use concise source-linked memory summaries.",
    sourceEventIds: ["evt_agent_task_created"]
  }));

  fireEvent.click(within(memory).getAllByRole("button", { name: "Retract memory" })[0]!);
  expect(onRetractMemory).toHaveBeenCalled();

  for (const forbiddenName of [/send prr/i, /export/i, /clear lock/i, /accepted graph/i, /provider transfer/i, /repair/i]) {
    expect(within(memory).queryByRole("button", { name: forbiddenName })).not.toBeInTheDocument();
  }
});
```

- [ ] **Step 3: Run targeted failing tests**

Run:

```bash
npm test -- packages/ui/test/agent-memory-adapter.test.ts packages/ui/test/agent-workspace.test.tsx packages/ui/test/agent-app-integration.test.tsx
```

Expected before implementation:

```text
adapter.loadMemory is not a function or AgentMemoryPanel is missing
```

- [ ] **Step 4: Extend adapter types and schemas**

Modify `packages/ui/src/agent/agent-types.ts`:

```ts
export type {
  AgentMemoryDetailDto,
  AgentMemoryFiltersDto,
  AgentMemoryListDto
} from "../../../agent/src/runtime-types.js";
```

Modify `packages/ui/src/agent/agent-adapter.ts`:

```ts
export interface AgentAdapter {
  loadStatus(): Promise<AgentStatusDto>;
  loadApprovalCockpit(): Promise<AgentApprovalCockpitDto>;
  loadMemory(filters?: AgentMemoryFiltersDto): Promise<AgentMemoryListDto>;
  loadMemoryDetail(memoryId: string): Promise<AgentMemoryDetailDto>;
  recordMemory(input: RecordMemoryInput): Promise<AgentMemoryMutationResultDto>;
  supersedeMemory(input: SupersedeMemoryInput): Promise<AgentMemoryMutationResultDto>;
  retractMemory(input: RetractMemoryInput): Promise<AgentMemoryMutationResultDto>;
  approveToolRequest(input: ApproveToolRequestInput): Promise<AgentApprovalDecisionResultDto>;
  denyToolRequest(input: DenyToolRequestInput): Promise<AgentApprovalDecisionResultDto>;
}
```

Add Zod schemas mirroring Task 1 DTOs, using the existing `safeAgentValue` sanitizer before parsing. Add HTTP methods:

```ts
async loadMemory(filters = {}) {
  const params = new URLSearchParams();
  if (filters.scope !== undefined) params.set("scope", filters.scope);
  if (filters.state !== undefined) params.set("state", filters.state);
  const suffix = params.toString();
  const response = await fetchAgentRoute({
    path: `${baseUrl}/api/agent/memory${suffix.length === 0 ? "" : `?${suffix}`}`,
    credentials,
    fetcher,
    ...(options.authToken === undefined ? {} : { authToken: options.authToken })
  });
  return agentMemoryListFromJson(await readRouteJson(response, "Agent memory"));
}
```

Static adapters should store a memory list and return deep-frozen clones. If no memory list is supplied, return an empty `agent-memory-list.v1` with `authoritativeForOntology: false`.

- [ ] **Step 5: Add AgentMemoryPanel**

Create `packages/ui/src/agent/AgentMemoryPanel.tsx`:

```tsx
import type {
  AgentMemoryFiltersDto,
  AgentMemoryListDto
} from "./agent-types.js";

export interface AgentMemoryPanelProps {
  readonly memoryList: AgentMemoryListDto;
  readonly filters: AgentMemoryFiltersDto;
  readonly onFilterChange?: (filters: AgentMemoryFiltersDto) => void;
  readonly onRecordMemory?: (input: RecordMemoryInput) => void;
  readonly onSupersedeMemory?: (input: SupersedeMemoryInput) => void;
  readonly onRetractMemory?: (input: RetractMemoryInput) => void;
}

export function AgentMemoryPanel(props: AgentMemoryPanelProps) {
  return (
    <section aria-label="Agent working memory" className="border border-[var(--console-line)] bg-[var(--console-panel)]">
      <div className="flex min-w-0 flex-col gap-2 border-b border-[var(--console-line)] px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-base font-semibold text-[var(--paper-light)]">Working memory</h2>
          <p className="mt-1 font-mono text-base text-[var(--muted-amber)] sm:text-sm">
            {props.memoryList.truthBoundary.label}
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1 font-mono text-base text-[var(--muted-amber)] sm:text-sm">
            Memory scope
            <select value={props.filters.scope ?? "all"} onChange={(event) => props.onFilterChange?.({ ...props.filters, scope: event.currentTarget.value as AgentMemoryFiltersDto["scope"] })}>
              <option value="all">all</option>
              <option value="workspace">workspace</option>
              <option value="investigation">investigation</option>
              <option value="task">task</option>
              <option value="provider">provider</option>
              <option value="policy">policy</option>
            </select>
          </label>
          <label className="grid gap-1 font-mono text-base text-[var(--muted-amber)] sm:text-sm">
            Memory state
            <select value={props.filters.state ?? "active"} onChange={(event) => props.onFilterChange?.({ ...props.filters, state: event.currentTarget.value as AgentMemoryFiltersDto["state"] })}>
              <option value="active">active</option>
              <option value="superseded">superseded</option>
              <option value="retracted">retracted</option>
              <option value="all">all</option>
            </select>
          </label>
        </div>
      </div>
      <ul role="list" className="divide-y divide-[var(--console-line)]">
        {props.memoryList.items.map((memory) => (
          <li key={memory.memoryId} className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.5fr)]">
            <div className="min-w-0">
              <p className="font-mono text-base text-[var(--signal-cyan)] sm:text-sm">{memory.scope} | {memory.state} | {memory.memoryKind}</p>
              <p className="mt-1 text-base text-pretty text-[var(--paper-light)] sm:text-sm">{memory.summary}</p>
            </div>
            <div className="min-w-0 space-y-2">
              <p className="font-mono text-base text-[var(--muted-amber)] sm:text-sm">confidence {Math.round(memory.confidence * 100)}%</p>
              <MemoryRefs refs={[...memory.eventIds, ...memory.sourceEventIds, ...memory.artifactHashes]} />
              {memory.state === "active" ? (
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => props.onSupersedeMemory?.(draftSupersedeInput(memory))}>Supersede memory</button>
                  <button type="button" onClick={() => props.onRetractMemory?.({ memoryId: memory.memoryId, rationale: "Retracted from Agent workspace." })}>Retract memory</button>
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {props.memoryList.items.length === 0 ? <p className="px-4 py-3 text-base text-[var(--muted-amber)] sm:text-sm">No memory items match these filters.</p> : null}
      <MemoryRecordForm onRecordMemory={props.onRecordMemory} />
    </section>
  );
}
```

Keep forms compact, stable-width, and source-ref oriented. `MemoryRecordForm` parses comma-separated source event IDs and artifact hashes into arrays before calling `onRecordMemory`. Use existing color variables and no nested cards.

- [ ] **Step 6: Wire AgentWorkspace and App data loading**

Modify `AgentWorkspace` props to accept `memoryList`, `memoryFilters`, memory handlers, and memory mutation state. Render `AgentMemoryPanel` where the current simple "Agent memory" section lives. Keep the existing summary metric, but count `memoryList.items` when supplied.

Modify `packages/ui/src/App.tsx` only if the existing Agent workspace loading path owns status loading directly. Add a second load for `agentAdapter.loadMemory(memoryFilters)` when the active module is `agents`. Reuse current fake/static DTOs in tests; do not wait for scheduler DTOs.

Add bridge note in code comment near the load function:

```ts
// Scheduler bridge: future scheduler DTOs can refresh this same memory route after a run records memory.
```

- [ ] **Step 7: Run targeted UI tests**

Run:

```bash
npm test -- packages/ui/test/agent-memory-adapter.test.ts packages/ui/test/agent-workspace.test.tsx packages/ui/test/agent-app-integration.test.tsx
```

Expected:

```text
Test Files  3 passed
```

- [ ] **Step 8: Run full verification and commit**

Run:

```bash
npm run verify
git add packages/ui/src/agent/agent-types.ts packages/ui/src/agent/agent-adapter.ts packages/ui/src/agent/AgentMemoryPanel.tsx packages/ui/src/agent/AgentWorkspace.tsx packages/ui/src/App.tsx packages/ui/test/agent-memory-adapter.test.ts packages/ui/test/agent-workspace.test.tsx packages/ui/test/agent-app-integration.test.tsx
git commit -m "feat: add inspectable agent memory workspace"
```

**Acceptance Criteria:**

- UI supports filtering memory by scope and state.
- UI shows active, superseded, and retracted state with source event IDs/artifact hashes where available.
- UI copy/state clearly marks memory as working memory, not ontology truth.
- UI correction controls call only memory record/supersede/retract routes.
- No button or adapter method sends PRRs, exports, clears locks, accepts graph truth, executes repair, transfers provider bytes, or mutates legacy source trees.

**Rollback/Escalation:**

- Escalate if making memory visible requires importing Node-only runtime/domain modules into React.
- Escalate if text cannot fit cleanly in the existing Agent workspace layout on mobile without a larger design pass.

---

### Task 5: Factory Readiness And Final Verification

**Files:**
- Modify: `scripts/check-agent-readiness.mjs`
- Modify: `docs/agentic/software-factory.md`
- Modify: `docs/superpowers/plans/2026-07-09-resident-agent-memory-context-surface-implementation.md`

**Interfaces:**
- Consumes: completed Task 1 through Task 4 commits.
- Produces: factory readiness tracking for this approved plan and recorded verification evidence.

- [x] **Step 1: Add plan to readiness check**

Modify `scripts/check-agent-readiness.mjs` `requiredFiles`:

```js
"docs/superpowers/plans/2026-07-09-resident-agent-memory-context-surface-implementation.md"
```

- [x] **Step 2: Run focused verification**

Run:

```bash
npm test -- packages/ontology/test/agent-contracts.test.ts packages/agent/test/memory.test.ts packages/agent/test/memory-runtime.test.ts packages/agent/test/context-packs.test.ts packages/local-runtime/test/agent-memory-routes.test.ts packages/ui/test/agent-memory-adapter.test.ts packages/ui/test/agent-workspace.test.tsx packages/ui/test/agent-app-integration.test.tsx
```

Expected:

```text
Test Files  8 passed
```

- [x] **Step 3: Run whitespace and factory checks**

Run:

```bash
git diff --check
npm run factory:check
```

Expected:

```text
factory-readiness passed
```

`git diff --check` should produce no output.

- [x] **Step 4: Run full verification**

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

- [x] **Step 5: Record readiness evidence**

Append a section to `docs/agentic/software-factory.md`:

```md
## Resident Agent Memory Context Surface Readiness

The resident-agent memory context surface was implemented from the approved resident-agent designs and the memory/context plan on 2026-07-09.

Required design and plan files:

- `docs/superpowers/specs/2026-07-07-cestus-resident-agent-design.md`
- `docs/superpowers/specs/2026-07-07-resident-agent-execution-approval-design.md`
- `docs/superpowers/plans/2026-07-09-resident-agent-memory-context-surface-implementation.md`

Recorded focused verification:

```text
npm test -- packages/ontology/test/agent-contracts.test.ts packages/agent/test/memory.test.ts packages/agent/test/memory-runtime.test.ts packages/agent/test/context-packs.test.ts packages/local-runtime/test/agent-memory-routes.test.ts packages/ui/test/agent-memory-adapter.test.ts packages/ui/test/agent-workspace.test.tsx packages/ui/test/agent-app-integration.test.tsx
Test Files  8 passed
```

Recorded full verification:

```text
npm run verify
typecheck passed
tests passed
vite build succeeded
factory-readiness passed
```

Memory is now visible as resident-agent working memory with active, superseded, and retracted states, source event IDs or artifact hashes, scope, confidence, expiry when present, safe summaries, human correction routes, and `agent-memory-summary.v1` context packs. The slice does not accept assertions, resolve entities, send PRRs, export material, clear locks, execute provider byte transfer, run repair, or mutate old source trees.
```

Before committing, replace the example verification summaries in this readiness note with the exact observed command output from Step 2 and Step 4.

- [x] **Step 6: Run final readiness checks after docs update**

Run:

```bash
git diff --check
npm run factory:check
npm run verify
```

Expected:

```text
factory-readiness passed
typecheck passed
tests passed
vite build succeeded
factory-readiness passed
```

- [x] **Step 7: Commit readiness**

Run:

```bash
git add scripts/check-agent-readiness.mjs docs/agentic/software-factory.md docs/superpowers/plans/2026-07-09-resident-agent-memory-context-surface-implementation.md
git commit -m "docs: record resident agent memory readiness"
```

**Acceptance Criteria:**

- Focused verification and `npm run verify` pass.
- Factory readiness tracks this memory/context plan.
- Readiness notes preserve the non-authoritative memory boundary.
- The final diff contains no credential-shaped values, raw provider output, raw evidence bodies, unapproved scheduler DTO assumptions, or hidden direct-execution paths.

**Rollback/Escalation:**

- Escalate after two focused repair attempts on the same failing verifier.
- Escalate if final review finds any path from memory to accepted graph truth or external side effects.

---

## Completion Criteria

The resident-agent memory context surface is complete when:

- Every task above has a commit.
- `npm run verify` passes.
- `npm run factory:check` passes.
- Memory list/detail, record, supersede, and retract routes are available through local runtime.
- `agent-memory-summary.v1` is stable, budgeted, source-linked, and safe for prompt artifacts.
- Agent workspace shows memory scope, status, confidence, expiry, source refs, artifact hashes, and correction controls.
- Superseded and retracted memory remains replayable history and is absent from active context packs.
- Memory remains visibly non-authoritative and cannot create accepted ontology truth or external effects.
