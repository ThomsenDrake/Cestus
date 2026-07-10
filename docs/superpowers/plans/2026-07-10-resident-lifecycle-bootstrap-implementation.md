# Resident Lifecycle Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Initialize and verify the one default resident identity `agent_default` from workspace create and runtime mount/open flows before agent task or memory mutation can occur.

**Architecture:** Add a focused agent package bootstrap helper that proves `agent_identity_agent_default` by append-or-readback against the canonical workspace ID. Wire that helper into local-runtime create and mount/open entrypoints, while keeping status, workspace detect, and verify reads mutation-free. Add DTO and cockpit/operator surfaces that display not-mounted, initializing, ready, and blocked lifecycle states without creating another durable source of truth.

**Tech Stack:** TypeScript, Vitest, Zod, Node.js, existing `EventLedger`/`SQLiteEventLedger`, local-runtime HTTP/CLI handlers, React Agent cockpit, operator-status DTOs.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-10-resident-lifecycle-bootstrap-design.md`.
- Required reading before each task: `AGENTS.md`, `.agents/skills/cestus-software-factory/SKILL.md`, `docs/agentic/software-factory.md`, the spec above, and this plan.
- Use a task-scoped branch or worktree for implementation.
- Claim one task in `docs/agentic/claims/task-<number>-resident-lifecycle-<slug>.md` and commit the claim before editing task files.
- Write RED tests before production changes.
- Run the exact targeted command in the task after the RED test and after implementation.
- Run `npm run verify` before each task commit.
- Commit each completed task separately.
- Hand off to spec review and code-quality review after each task.
- Keep `packages/workspace/src/index.ts` pure and non-mutating.
- Do not edit context-pack, prompt-template, handoff, or specialist-runner files.
- Do not append provider identities, provider credential references, model names, OAuth accounts, API keys, or backend adapter metadata to resident identity events.
- Do not delete, rewrite, reset, compact, or compensate workspace manifests, layouts, ledgers, or identity streams after bootstrap failure.
- Stop on schema conflict, data-loss risk, ambiguous multi-workspace identity, credential need, unavailable dependency, repeated verifier failure, or any design path that creates multiple permanent agent personas.

---

## File Structure

- `packages/agent/src/identity-bootstrap.ts`: new package-level append-or-readback helper, lifecycle DTOs, canonical identity proof, and secret-safe blocked diagnostics.
- `packages/agent/test/identity-bootstrap.test.ts`: focused helper tests for canonical readback, duplicate streams, workspace mismatch, append conflict, corrupted stream, and concurrent opens.
- `packages/agent/src/index.ts`: export the new bootstrap helper and DTO types.
- `packages/agent/src/runtime-types.ts`: add `ResidentIdentityLifecycleDto` to `AgentStatusDto`.
- `packages/agent/src/runtime.ts`: project bare agent runtime identity lifecycle from ledger projection without appending from status reads.
- `packages/local-runtime/src/runtime-factory.ts`: start process-local resident identity bootstrap for portable workspace mounts and expose lifecycle readiness on `LocalRuntimeHandle`.
- `packages/local-runtime/src/agent-runtime-factory.ts`: pass readiness/lifecycle context into agent runtime creation where needed.
- `packages/local-runtime/src/agent-http-routes.ts`: overlay lifecycle DTOs on status/cockpit responses and gate task/memory mutation on readiness instead of silently initializing identity.
- `packages/local-runtime/src/http-handler.ts`: expose mount bootstrap lifecycle through the handler without changing auth or workspace verification behavior.
- `packages/local-runtime/src/cli.ts`: bootstrap identity after successful `create-workspace` ledger open and return visible failure without deleting created workspace files.
- `packages/local-runtime/test/resident-identity-bootstrap.test.ts`: local runtime create/mount/restart/remount/workspace-switch tests.
- `packages/local-runtime/test/agent-http-routes.test.ts`: update agent route expectations for read-only status and readiness-gated task/memory mutation.
- `packages/local-runtime/test/cli.test.ts`: update `create-workspace` and `agent-status` CLI expectations.
- `packages/local-runtime/test/http-handler.test.ts`: assert portable runtime mount appends identity and read-only request workspace routes do not append more identity events.
- `packages/local-runtime/test/operator-status.test.ts`: assert operator agent section reflects lifecycle blocked/ready state.
- `packages/ui/src/agent/agent-adapter.ts`: parse `identityLifecycle` from production-shaped agent status DTOs.
- `packages/ui/src/agent/agent-types.ts`: re-export lifecycle DTO types through the UI boundary.
- `packages/ui/src/agent/AgentWorkspace.tsx`: render lifecycle state in the Agent workspace without adding execution controls.
- `packages/ui/test/agent-adapter.test.ts`: browser parser coverage for lifecycle DTOs and secret-safe blocked diagnostics.
- `packages/ui/test/agent-app-integration.test.tsx`: Agent workspace DOM coverage for not-mounted, ready, and blocked lifecycle states.
- `scripts/check-agent-readiness.mjs`: add the approved spec and this plan to required durable files in the final readiness task.
- `docs/agentic/software-factory.md`: append a concise readiness record in the final readiness task.
- `docs/agentic/claims/task-*-resident-lifecycle-*.md`: durable task claims and verification evidence.

## Merge Dependencies

- Task 1 must land before Task 2 and Task 3 because it defines the shared bootstrap contract.
- Task 2 must land before Task 3 because browser and operator surfaces should parse real runtime DTOs, not provisional fixture-only fields.
- Task 3 should merge after any active context-pack, prompt-template, handoff, or specialist-runner lanes, then rebase and rerun its cross-boundary UI/runtime tests.
- Task 4 runs last after Tasks 1 through 3 pass and reviews are complete.

## Review Gates

- Gate A after Task 1: spec review for append-only identity proof, duplicate/corrupt stream blocking, and no provider identity leakage.
- Gate B after Task 2: runtime review for create/mount bootstrap, non-transactional create recovery, mutation-free status/detect/verify reads, and readiness-gated task/memory mutation.
- Gate C after Task 3: browser/operator review for DTO parsing, cockpit visibility, safe messages, and no new execution controls.
- Gate D after Task 4: final factory readiness review before merge.

---

### Task 1: Agent Package Resident Identity Bootstrap Contract

**Files:**
- Create: `docs/agentic/claims/task-1-resident-lifecycle-bootstrap-contract.md`
- Create: `packages/agent/src/identity-bootstrap.ts`
- Create: `packages/agent/test/identity-bootstrap.test.ts`
- Modify: `packages/agent/src/index.ts`

**Interfaces:**
- Consumes: `EventLedger`, `ActorRef`, `AppendableKnowledgeEvent<"agent.identity.initialized">`, and `approvedAgentSpecialistRunTypes`.
- Produces:
  - `defaultResidentAgentId: "agent_default"`
  - `defaultResidentIdentityStreamId: "agent_identity_agent_default"`
  - `type ResidentIdentityLifecycleState = "not-mounted" | "initializing" | "ready" | "blocked"`
  - `interface ResidentIdentityLifecycleDto`
  - `interface EnsureDefaultResidentIdentityInput`
  - `ensureDefaultResidentIdentity(input): Promise<ResidentIdentityLifecycleDto>`
  - `readDefaultResidentIdentityLifecycle(input): Promise<ResidentIdentityLifecycleDto>`
  - `notMountedResidentIdentityLifecycle(): ResidentIdentityLifecycleDto`
  - `initializingResidentIdentityLifecycle(workspaceId: string): ResidentIdentityLifecycleDto`

- [ ] **Step 1: Claim the task**

Create `docs/agentic/claims/task-1-resident-lifecycle-bootstrap-contract.md`:

```md
# Task 1 Claim: Resident Lifecycle Bootstrap Contract

Plan: `docs/superpowers/plans/2026-07-10-resident-lifecycle-bootstrap-implementation.md`
Task: Task 1: Agent Package Resident Identity Bootstrap Contract
Worker: <agent id>
Branch: <branch>
Worktree: <absolute path>
Claimed-at: <UTC timestamp>
Status: claimed

Owned files:
- `packages/agent/src/identity-bootstrap.ts`
- `packages/agent/test/identity-bootstrap.test.ts`
- `packages/agent/src/index.ts`
- `docs/agentic/claims/task-1-resident-lifecycle-bootstrap-contract.md`

Targeted commands:
- `npm test -- packages/agent/test/identity-bootstrap.test.ts`
- `npm test -- packages/agent/test/identity-bootstrap.test.ts packages/agent/test/runtime.test.ts packages/agent/test/projection.test.ts packages/ontology/test/agent-contracts.test.ts`
- `npm run verify`
```

Commit:

```bash
git add docs/agentic/claims/task-1-resident-lifecycle-bootstrap-contract.md
git commit -m "chore: claim resident lifecycle bootstrap contract"
```

- [ ] **Step 2: Mark the claim in progress**

Edit the claim status to `in-progress`, then commit:

```bash
git add docs/agentic/claims/task-1-resident-lifecycle-bootstrap-contract.md
git commit -m "chore: start resident lifecycle bootstrap contract"
```

- [ ] **Step 3: Write the RED package tests**

Create `packages/agent/test/identity-bootstrap.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AppendableKnowledgeEvent, KnowledgeEvent } from "../../ontology/src/contracts.js";
import { InMemoryEventLedger, type EventLedger } from "../../ontology/src/event-ledger.js";
import { SQLiteEventLedger } from "../../ontology/src/sqlite-event-ledger.js";
import {
  defaultResidentAgentId,
  defaultResidentIdentityStreamId,
  ensureDefaultResidentIdentity,
  initializingResidentIdentityLifecycle,
  notMountedResidentIdentityLifecycle,
  readDefaultResidentIdentityLifecycle
} from "../src/identity-bootstrap.js";

const actor = { id: "actor_runtime_bootstrap", kind: "system" as const, label: "Runtime Bootstrap" };
const now = () => "2026-07-10T12:00:00.000Z";
const workspaceId = "ws_bootstrap_001";
const otherWorkspaceId = "ws_bootstrap_other";
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("resident identity bootstrap", () => {
  it("appends one canonical identity and proves readiness by readback", async () => {
    const ledger = new InMemoryEventLedger();
    const result = await ensureDefaultResidentIdentity({ ledger, actor, now, workspaceId });
    const events = await ledger.readStream(defaultResidentIdentityStreamId);

    expect(result).toMatchObject({
      schemaVersion: "resident-identity-lifecycle.v1",
      state: "ready",
      residentAgentId: defaultResidentAgentId,
      workspaceId,
      initialized: true
    });
    expect(result.eventIds).toHaveLength(1);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "agent.identity.initialized",
      streamId: defaultResidentIdentityStreamId,
      sequence: 1,
      payload: {
        residentAgentId: defaultResidentAgentId,
        workspaceId
      }
    });
    expect(JSON.stringify(events)).not.toMatch(/provider_|agent_credref_|api[_-]?key|oauth|bearer|token|password/i);
  });

  it("restarts and remounts without duplicating identity events", async () => {
    const ledger = new InMemoryEventLedger();
    await ensureDefaultResidentIdentity({ ledger, actor, now, workspaceId });
    const second = await ensureDefaultResidentIdentity({ ledger, actor, now, workspaceId });
    const readOnly = await readDefaultResidentIdentityLifecycle({ ledger, workspaceId });

    expect(second.state).toBe("ready");
    expect(readOnly.state).toBe("ready");
    expect(await identityEventTypes(ledger)).toEqual(["agent.identity.initialized"]);
  });

  it("allows future identity updates while requiring exactly one initialization event", async () => {
    const ledger = new InMemoryEventLedger();
    await ensureDefaultResidentIdentity({ ledger, actor, now, workspaceId });
    await ledger.append({
      type: "agent.identity.updated",
      version: 1,
      streamId: defaultResidentIdentityStreamId,
      context: {
        actor: { id: "actor_case_owner", kind: "human", label: "Case Owner" },
        occurredAt: "2026-07-10T12:01:00.000Z",
        correlationId: "corr_identity_update",
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0", agent: "0.1.0" }
      },
      payload: {
        residentAgentId: defaultResidentAgentId,
        updatedBy: "actor_case_owner",
        rationale: "Reviewed label update.",
        label: "Cestus Agent"
      }
    }, { expectedNextSequence: 2 });

    const result = await readDefaultResidentIdentityLifecycle({ ledger, workspaceId });
    expect(result.state).toBe("ready");
    expect(result.eventIds).toHaveLength(1);
  });

  it("blocks duplicate initialization events instead of choosing one", async () => {
    const ledger = new InMemoryEventLedger();
    await appendIdentity(ledger, workspaceId, 1);
    await appendIdentity(ledger, workspaceId, 2);

    const result = await readDefaultResidentIdentityLifecycle({ ledger, workspaceId });
    expect(result).toMatchObject({
      state: "blocked",
      safeMessage: "Resident identity bootstrap is blocked by duplicate initialization events.",
      allowedRepairActions: ["inspect resident identity events before retrying"]
    });
  });

  it("blocks a copied ledger whose identity belongs to another workspace", async () => {
    const ledger = new InMemoryEventLedger();
    await appendIdentity(ledger, otherWorkspaceId, 1);

    const result = await ensureDefaultResidentIdentity({ ledger, actor, now, workspaceId });
    expect(result).toMatchObject({
      state: "blocked",
      safeMessage: "Resident identity belongs to a different workspace."
    });
    expect(await identityEventTypes(ledger)).toEqual(["agent.identity.initialized"]);
  });

  it("treats append conflict as success only after exact readback", async () => {
    const ledger = new ConflictThenReadbackLedger([identityEvent(workspaceId, 1)]);

    const result = await ensureDefaultResidentIdentity({ ledger, actor, now, workspaceId });
    expect(result.state).toBe("ready");
    expect(ledger.appendCalls).toBe(1);
  });

  it("blocks append conflict when readback does not prove the same workspace", async () => {
    const ledger = new ConflictThenReadbackLedger([identityEvent(otherWorkspaceId, 1)]);

    const result = await ensureDefaultResidentIdentity({ ledger, actor, now, workspaceId });
    expect(result.state).toBe("blocked");
    expect(result.safeMessage).toBe("Resident identity belongs to a different workspace.");
  });

  it("blocks unreadable or corrupted identity streams with safe diagnostics", async () => {
    const result = await readDefaultResidentIdentityLifecycle({
      ledger: {
        async append() {
          throw new Error("unused append");
        },
        async readAll() {
          return [];
        },
        async readStream() {
          throw new Error("raw sqlite stack /tmp/workspace/ledger/ontology.sqlite bearer secret");
        }
      },
      workspaceId
    });

    expect(result.state).toBe("blocked");
    expect(result.safeMessage).toBe("Resident identity stream could not be read safely.");
    expect(JSON.stringify(result)).not.toMatch(/sqlite|\/tmp|bearer|secret/i);
  });

  it("exposes not-mounted and initializing states without ledger mutation", () => {
    expect(notMountedResidentIdentityLifecycle()).toMatchObject({
      state: "not-mounted",
      initialized: false,
      eventIds: []
    });
    expect(initializingResidentIdentityLifecycle(workspaceId)).toMatchObject({
      state: "initializing",
      workspaceId,
      initialized: false,
      eventIds: []
    });
  });

  it("keeps concurrent SQLite opens to one initialization event", async () => {
    const path = sqlitePath();
    const first = new SQLiteEventLedger(path);
    const second = new SQLiteEventLedger(path);
    try {
      const results = await Promise.all([
        ensureDefaultResidentIdentity({ ledger: first, actor, now, workspaceId }),
        ensureDefaultResidentIdentity({ ledger: second, actor, now, workspaceId })
      ]);

      expect(results.map((result) => result.state)).toEqual(["ready", "ready"]);
      const events = await first.readStream(defaultResidentIdentityStreamId);
      expect(events.filter((event) => event.type === "agent.identity.initialized")).toHaveLength(1);
    } finally {
      first.close();
      second.close();
    }
  });
});

async function appendIdentity(ledger: EventLedger, id: string, expectedNextSequence: number): Promise<KnowledgeEvent> {
  return ledger.append(identityAppendEvent(id), { expectedNextSequence });
}

function identityAppendEvent(id: string): AppendableKnowledgeEvent<"agent.identity.initialized"> {
  return {
    type: "agent.identity.initialized",
    version: 1,
    streamId: defaultResidentIdentityStreamId,
    context: {
      actor,
      occurredAt: now(),
      correlationId: "corr_agent_default",
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", agent: "0.1.0" }
    },
    payload: {
      residentAgentId: defaultResidentAgentId,
      workspaceId: id,
      label: "Cestus Agent",
      policyId: "agent_policy_default",
      initializedBy: actor.id,
      allowedRunTypes: [
        "ontology-bootstrap",
        "prr-negotiation",
        "evidence-triage",
        "timeline-builder",
        "contradiction-finder",
        "investigation-planner",
        "report-builder"
      ],
      memoryProjectionVersion: "0.1.0"
    }
  };
}

function identityEvent(id: string, sequence: number): KnowledgeEvent {
  return {
    id: `evt_identity_${id}_${sequence}`,
    sequence,
    ...identityAppendEvent(id)
  };
}

async function identityEventTypes(ledger: EventLedger): Promise<readonly string[]> {
  return (await ledger.readStream(defaultResidentIdentityStreamId)).map((event) => event.type);
}

function sqlitePath(): string {
  const dir = mkdtempSync(join(tmpdir(), "cestus-agent-identity-"));
  tempDirs.push(dir);
  return join(dir, "ontology.sqlite");
}

class ConflictThenReadbackLedger implements EventLedger {
  appendCalls = 0;
  constructor(private readonly streamEvents: readonly KnowledgeEvent[]) {}

  async append(): Promise<KnowledgeEvent> {
    this.appendCalls += 1;
    throw new Error("Concurrency conflict for agent_identity_agent_default: expected sequence 1, next sequence 2");
  }

  async readStream(): Promise<KnowledgeEvent[]> {
    return [...this.streamEvents];
  }

  async readAll(): Promise<KnowledgeEvent[]> {
    return [...this.streamEvents];
  }
}
```

- [ ] **Step 4: Run the RED test**

Run:

```bash
npm test -- packages/agent/test/identity-bootstrap.test.ts
```

Expected:

```text
Cannot find module '../src/identity-bootstrap.js'
```

- [ ] **Step 5: Implement the bootstrap helper**

Create `packages/agent/src/identity-bootstrap.ts` with the interfaces named above. Required implementation points:

```ts
export const defaultResidentAgentId = "agent_default" as const;
export const defaultResidentIdentityStreamId = "agent_identity_agent_default" as const;
export const defaultResidentLabel = "Cestus Agent" as const;
export const defaultAgentPolicyId = "agent_policy_default" as const;
export const defaultMemoryProjectionVersion = "0.1.0" as const;

export type ResidentIdentityLifecycleState = "not-mounted" | "initializing" | "ready" | "blocked";

export interface ResidentIdentityLifecycleDto {
  readonly schemaVersion: "resident-identity-lifecycle.v1";
  readonly state: ResidentIdentityLifecycleState;
  readonly residentAgentId: typeof defaultResidentAgentId;
  readonly workspaceId?: string | undefined;
  readonly initialized: boolean;
  readonly eventIds: readonly string[];
  readonly safeMessage: string;
  readonly allowedRepairActions: readonly string[];
}
```

The helper must:

- append `agent.identity.initialized` only when `readStream(defaultResidentIdentityStreamId)` returns an empty stream
- append with `{ expectedNextSequence: 1 }`
- read the stream again after append or after a concurrency conflict
- count exactly one `agent.identity.initialized` event as canonical
- permit future `agent.identity.updated` events in the same stream
- block non-identity events in the identity stream
- block duplicate initialization events
- block initialization whose `payload.workspaceId` differs from the supplied workspace ID
- block unreadable stream errors without echoing raw errors
- never inspect provider descriptors or credential references

Modify `packages/agent/src/index.ts`:

```ts
export * from "./identity-bootstrap.js";
```

- [ ] **Step 6: Run targeted package tests**

Run:

```bash
npm test -- packages/agent/test/identity-bootstrap.test.ts packages/agent/test/runtime.test.ts packages/agent/test/projection.test.ts packages/ontology/test/agent-contracts.test.ts
```

Expected:

```text
Test Files  4 passed
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
vite build succeeded
factory-readiness passed
```

- [ ] **Step 8: Record evidence and commit**

Update the claim with RED, targeted, and verify evidence. Commit only the task files:

```bash
git add docs/agentic/claims/task-1-resident-lifecycle-bootstrap-contract.md packages/agent/src/identity-bootstrap.ts packages/agent/src/index.ts packages/agent/test/identity-bootstrap.test.ts
git commit -m "feat: add resident identity bootstrap contract"
```

**Acceptance Criteria:**

- Empty identity stream appends one canonical initialization event.
- Duplicate initialization events block.
- Future identity update events do not make the stream invalid.
- Append conflicts become success only after exact readback.
- Copied or mismatched workspace identity blocks.
- Concurrent SQLite opens produce one initialization event.
- Provider and credential identities are absent from identity events.

**Rollback/Escalation:**

- Revert only this task's files if helper semantics conflict with existing agent event contracts.
- Escalate if the existing `agent.identity.initialized` schema no longer includes `workspaceId`.

---

### Task 2: Local Runtime Create And Mount Bootstrap

**Files:**
- Create: `docs/agentic/claims/task-2-resident-lifecycle-local-runtime.md`
- Create: `packages/local-runtime/test/resident-identity-bootstrap.test.ts`
- Modify: `packages/local-runtime/src/runtime-factory.ts`
- Modify: `packages/local-runtime/src/agent-runtime-factory.ts`
- Modify: `packages/local-runtime/src/agent-http-routes.ts`
- Modify: `packages/local-runtime/src/http-handler.ts`
- Modify: `packages/local-runtime/src/cli.ts`
- Modify: `packages/local-runtime/test/agent-http-routes.test.ts`
- Modify: `packages/local-runtime/test/cli.test.ts`
- Modify: `packages/local-runtime/test/http-handler.test.ts`

**Interfaces:**
- Consumes from Task 1: `ensureDefaultResidentIdentity`, `readDefaultResidentIdentityLifecycle`, `notMountedResidentIdentityLifecycle`, `initializingResidentIdentityLifecycle`, and `ResidentIdentityLifecycleDto`.
- Produces:
  - `LocalRuntimeHandle.residentIdentity.lifecycle(): ResidentIdentityLifecycleDto`
  - `LocalRuntimeHandle.residentIdentity.ready(): Promise<ResidentIdentityLifecycleDto>`
  - HTTP agent mutations that call `ready()` and require `state === "ready"`
  - CLI `create-workspace` success only after bootstrap reaches `ready`

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-2-resident-lifecycle-local-runtime.md` with owned files, worker identity, branch, worktree, UTC timestamp, and status `claimed`. Then change status to `in-progress` and commit that change.

- [ ] **Step 2: Write RED local runtime tests**

Create `packages/local-runtime/test/resident-identity-bootstrap.test.ts`:

```ts
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  defaultResidentIdentityStreamId,
  ensureDefaultResidentIdentity
} from "../../agent/src/index.js";
import { SQLiteEventLedger } from "../../ontology/src/sqlite-event-ledger.js";
import { createPortableWorkspace } from "../../workspace/src/index.js";
import { runLocalRuntimeCli } from "../src/cli.js";
import { resolveLocalRuntimeConfig } from "../src/config.js";
import { createLocalRuntimeHttpHandler, type LocalRuntimeHttpHandler } from "../src/http-handler.js";

const actor = { id: "actor_local_runtime_test", kind: "human" as const, label: "Local Runtime Test" };
const now = () => "2026-07-10T13:00:00.000Z";
const tempDirs: string[] = [];
const handlers: LocalRuntimeHttpHandler[] = [];

afterEach(() => {
  for (const handler of handlers.splice(0)) handler.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("local runtime resident identity bootstrap", () => {
  it("bootstraps identity when opening a portable workspace before agent mutation", async () => {
    const cwd = tempDir();
    const workspaceRoot = join(cwd, "external-case");
    createPortableWorkspace({
      rootDir: workspaceRoot,
      workspaceId: "ws_runtime_bootstrap",
      label: "Runtime Bootstrap Workspace",
      createdAt: "2026-07-10T12:00:00.000Z",
      createdBy: "runtime-test"
    });
    const config = resolveLocalRuntimeConfig({
      cwd,
      env: {
        CESTUS_LOCAL_STORAGE: "portable-workspace",
        CESTUS_WORKSPACE_ROOT: workspaceRoot
      }
    });

    const handler = testHandler(config);
    const status = await handler({ method: "GET", url: "/api/agent/status" });
    const task = await handler({
      method: "POST",
      url: "/api/agent/tasks",
      body: JSON.stringify({
        taskId: "task_bootstrap_ready",
        title: "Review mounted workspace",
        priority: "normal"
      })
    });

    expect(status.status).toBe(200);
    expect(JSON.parse(status.body).identityLifecycle).toMatchObject({
      state: "ready",
      workspaceId: "ws_runtime_bootstrap"
    });
    expect(task.status).toBe(200);
    expect(await identityEventTypes(config.storage.sqlitePath)).toEqual(["agent.identity.initialized"]);
  });

  it("keeps status reads mutation-free after mount bootstrap completes", async () => {
    const { config, handler } = portableHandler("ws_status_readonly");
    await handler({ method: "GET", url: "/api/agent/status" });
    const before = await identityEventTypes(config.storage.sqlitePath);
    await handler({ method: "GET", url: "/api/agent/status" });
    await handler({ method: "GET", url: "/api/agent/cockpit" });

    expect(before).toEqual(["agent.identity.initialized"]);
    expect(await identityEventTypes(config.storage.sqlitePath)).toEqual(before);
  });

  it("blocks agent task mutation when no workspace is mounted", async () => {
    const cwd = tempDir();
    const config = resolveLocalRuntimeConfig({ cwd, env: {} });
    const handler = testHandler(config);

    const status = await handler({ method: "GET", url: "/api/agent/status" });
    const task = await handler({
      method: "POST",
      url: "/api/agent/tasks",
      body: JSON.stringify({
        taskId: "task_without_workspace",
        title: "Should not create hidden local identity",
        priority: "normal"
      })
    });

    expect(JSON.parse(status.body).identityLifecycle.state).toBe("not-mounted");
    expect(task.status).toBe(409);
    expect(JSON.parse(task.body)).toEqual({
      ok: false,
      diagnostic: {
        message: "Resident identity is not ready for this workspace.",
        allowedRepairActions: ["mount or create a portable workspace", "refresh agent status"]
      }
    });
    expect(await eventTypes(config.storage.sqlitePath)).toEqual([]);
  });

  it("blocks copied ledger workspace identity mismatch without appending a second identity", async () => {
    const cwd = tempDir();
    const firstRoot = join(cwd, "case-a");
    const copiedRoot = join(cwd, "case-b");
    createPortableWorkspace({
      rootDir: firstRoot,
      workspaceId: "ws_original_case",
      label: "Original Case",
      createdAt: "2026-07-10T12:00:00.000Z",
      createdBy: "runtime-test"
    });
    await withLedger(join(firstRoot, "ledger", "ontology.sqlite"), async (ledger) => {
      await ensureDefaultResidentIdentity({
        ledger,
        actor: { id: "actor_copy_seed", kind: "system", label: "Copy Seed" },
        now,
        workspaceId: "ws_original_case"
      });
    });
    createPortableWorkspace({
      rootDir: copiedRoot,
      workspaceId: "ws_copied_case",
      label: "Copied Case",
      createdAt: "2026-07-10T12:00:00.000Z",
      createdBy: "runtime-test"
    });
    await copyIdentityRows(join(firstRoot, "ledger", "ontology.sqlite"), join(copiedRoot, "ledger", "ontology.sqlite"));

    const config = resolveLocalRuntimeConfig({
      cwd,
      env: {
        CESTUS_LOCAL_STORAGE: "portable-workspace",
        CESTUS_WORKSPACE_ROOT: copiedRoot
      }
    });
    const handler = testHandler(config);
    const status = await handler({ method: "GET", url: "/api/agent/status" });
    const task = await handler({
      method: "POST",
      url: "/api/agent/tasks",
      body: JSON.stringify({ taskId: "task_copied_case", title: "Copied case", priority: "normal" })
    });

    expect(JSON.parse(status.body).identityLifecycle).toMatchObject({
      state: "blocked",
      workspaceId: "ws_copied_case"
    });
    expect(task.status).toBe(409);
    expect(await identityEventTypes(config.storage.sqlitePath)).toEqual(["agent.identity.initialized"]);
  });

  it("recomputes readiness when switching workspaces", async () => {
    const cwd = tempDir();
    const first = portableHandler("ws_switch_first", cwd);
    const second = portableHandler("ws_switch_second", cwd);

    await first.handler({ method: "GET", url: "/api/agent/status" });
    await second.handler({ method: "GET", url: "/api/agent/status" });

    expect(JSON.parse((await first.handler({ method: "GET", url: "/api/agent/status" })).body).identityLifecycle.workspaceId)
      .toBe("ws_switch_first");
    expect(JSON.parse((await second.handler({ method: "GET", url: "/api/agent/status" })).body).identityLifecycle.workspaceId)
      .toBe("ws_switch_second");
  });

  it("create-workspace reports bootstrap failure while retaining a recoverable workspace", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const cwd = tempDir();
    const workspaceRoot = join(cwd, "recoverable-case");

    const failed = await runLocalRuntimeCli(
      ["create-workspace", "--workspace", workspaceRoot, "--workspace-id", "ws_recoverable_case", "--label", "Recoverable Case"],
      {
        cwd,
        env: {},
        stdout: (line) => stdout.push(line),
        stderr: (line) => stderr.push(line),
        residentIdentityBootstrapForTest: async () => ({
          schemaVersion: "resident-identity-lifecycle.v1",
          state: "blocked",
          residentAgentId: "agent_default",
          workspaceId: "ws_recoverable_case",
          initialized: false,
          eventIds: [],
          safeMessage: "Injected bootstrap failure.",
          allowedRepairActions: ["retry workspace open"]
        })
      }
    );
    const retry = await runLocalRuntimeCli(
      ["agent-status"],
      {
        cwd,
        env: {
          CESTUS_LOCAL_STORAGE: "portable-workspace",
          CESTUS_WORKSPACE_ROOT: workspaceRoot
        },
        stdout: (line) => stdout.push(line),
        stderr: (line) => stderr.push(line)
      }
    );

    expect(failed).toBe(1);
    expect(existsSync(join(workspaceRoot, "cestus-workspace.json"))).toBe(true);
    expect(stderr.join("\n")).toContain("Resident identity bootstrap failed.");
    expect(retry).toBe(0);
    expect(await identityEventTypes(join(workspaceRoot, "ledger", "ontology.sqlite"))).toEqual(["agent.identity.initialized"]);
  });
});

function testHandler(config: ReturnType<typeof resolveLocalRuntimeConfig>) {
  const handler = createLocalRuntimeHttpHandler({ config, actor, now });
  handlers.push(handler);
  return handler;
}

function portableHandler(workspaceId: string, cwd = tempDir()) {
  const workspaceRoot = join(cwd, workspaceId);
  createPortableWorkspace({
    rootDir: workspaceRoot,
    workspaceId,
    label: `Workspace ${workspaceId}`,
    createdAt: "2026-07-10T12:00:00.000Z",
    createdBy: "runtime-test"
  });
  const config = resolveLocalRuntimeConfig({
    cwd,
    env: {
      CESTUS_LOCAL_STORAGE: "portable-workspace",
      CESTUS_WORKSPACE_ROOT: workspaceRoot
    }
  });
  return { config, handler: testHandler(config) };
}

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "cestus-resident-runtime-"));
  tempDirs.push(dir);
  return dir;
}

async function withLedger<T>(path: string, callback: (ledger: SQLiteEventLedger) => Promise<T>): Promise<T> {
  const ledger = new SQLiteEventLedger(path);
  try {
    return await callback(ledger);
  } finally {
    ledger.close();
  }
}

async function identityEventTypes(path: string): Promise<readonly string[]> {
  return withLedger(path, async (ledger) =>
    (await ledger.readStream(defaultResidentIdentityStreamId)).map((event) => event.type)
  );
}

async function eventTypes(path: string): Promise<readonly string[]> {
  return withLedger(path, async (ledger) => (await ledger.readAll()).map((event) => event.type));
}

async function copyIdentityRows(from: string, to: string): Promise<void> {
  const source = new SQLiteEventLedger(from);
  const target = new SQLiteEventLedger(to);
  try {
    for (const event of await source.readStream(defaultResidentIdentityStreamId)) {
      await target.append({
        type: event.type,
        version: event.version,
        streamId: event.streamId,
        context: event.context,
        payload: event.payload
      });
    }
  } finally {
    source.close();
    target.close();
  }
}
```

- [ ] **Step 3: Run the RED local runtime tests**

Run:

```bash
npm test -- packages/local-runtime/test/resident-identity-bootstrap.test.ts
```

Expected:

```text
residentIdentityBootstrapForTest does not exist
```

or:

```text
expected identityLifecycle to be defined
```

- [ ] **Step 4: Implement `LocalRuntimeHandle.residentIdentity`**

Modify `packages/local-runtime/src/runtime-factory.ts`:

- import the Task 1 helper
- add a `LocalResidentIdentityBootstrap` interface with `lifecycle()` and `ready()`
- add `residentIdentity` to `LocalRuntimeHandle`
- for `portable-workspace`, start bootstrap immediately after opening `SQLiteEventLedger`
- for non-portable strategies, return `notMountedResidentIdentityLifecycle()`
- keep `mountPortableWorkspace()` failure behavior unchanged
- never bootstrap inside `mountPortableWorkspace()` or workspace-ops verification

The implementation shape should be:

```ts
export interface LocalResidentIdentityBootstrap {
  lifecycle(): ResidentIdentityLifecycleDto;
  ready(): Promise<ResidentIdentityLifecycleDto>;
}

function createResidentIdentityBootstrap(input: {
  readonly ledger: EventLedger;
  readonly workspaceId?: string | undefined;
  readonly actor: ActorRef;
  readonly now: () => string;
}): LocalResidentIdentityBootstrap {
  if (input.workspaceId === undefined) {
    const lifecycle = notMountedResidentIdentityLifecycle();
    return { lifecycle: () => lifecycle, ready: async () => lifecycle };
  }

  let lifecycle = initializingResidentIdentityLifecycle(input.workspaceId);
  const ready = ensureDefaultResidentIdentity({
    ledger: input.ledger,
    actor: input.actor,
    now: input.now,
    workspaceId: input.workspaceId
  }).then((result) => {
    lifecycle = result;
    return result;
  }).catch(() => {
    lifecycle = blockedResidentIdentityLifecycle(input.workspaceId);
    return lifecycle;
  });

  return { lifecycle: () => lifecycle, ready: () => ready };
}
```

Use a local `currentRuntimeNow(now?: PrrRuntimeNow): () => string` helper so bootstrap timestamps match existing runtime tests.

- [ ] **Step 5: Gate agent mutations on readiness**

Modify `packages/local-runtime/src/agent-http-routes.ts`:

- remove the route-level `ensureDefaultIdentity()` calls for memory record, supersede, retract, and task creation
- add `requireResidentIdentityReady(input)` that awaits `input.handle.residentIdentity.ready()`
- return HTTP 409 with this safe diagnostic when state is not `ready`:

```json
{
  "ok": false,
  "diagnostic": {
    "message": "Resident identity is not ready for this workspace.",
    "allowedRepairActions": ["mount or create a portable workspace", "refresh agent status"]
  }
}
```

- keep POST routes human-gated exactly as they are today
- keep status, cockpit, tool-requests, approvals, and scheduler wake routes read-only with respect to identity initialization

- [ ] **Step 6: Overlay lifecycle onto status and cockpit DTOs**

Modify `packages/local-runtime/src/agent-http-routes.ts`:

```ts
async function statusWithProviderReadiness(
  runtime: LocalAgentRuntime,
  input: HandleAgentHttpRouteInput
) {
  const [status, providerReadiness] = await Promise.all([
    runtime.status(),
    buildLocalAgentProviderReadiness({
      cwd: input.handle.config.cwd,
      now: input.now
    })
  ]);
  return {
    ...status,
    identityLifecycle: input.handle.residentIdentity.lifecycle(),
    providerReadiness
  };
}
```

Use this lifecycle in `/api/agent/status`, `/api/agent/cockpit`, and operator status providers through the existing agent status provider.

- [ ] **Step 7: Bootstrap `create-workspace` in the CLI**

Modify `packages/local-runtime/src/cli.ts`:

- extend `LocalRuntimeCliDependencies` with a test-only hook:

```ts
readonly residentIdentityBootstrapForTest?: (input: {
  readonly ledger: SQLiteEventLedger;
  readonly workspaceId: string;
  readonly actor: ActorRef;
  readonly now: () => string;
}) => Promise<ResidentIdentityLifecycleDto>;
```

- after `createPortableWorkspace()` succeeds, open `workspace.paths.ledgerPath`, run the hook or `ensureDefaultResidentIdentity`, close the ledger, and only then print success
- if bootstrap returns non-ready, throw `new Error("Resident identity bootstrap failed.")`
- do not remove the manifest, layout, or ledger on failure

- [ ] **Step 8: Update existing route and CLI expectations**

Modify existing tests where they currently assert repo-local agent status writes no events or repo-local task creation succeeds:

- `packages/local-runtime/test/agent-http-routes.test.ts`
  - `GET /api/agent/status` on repo-local should include `identityLifecycle.state === "not-mounted"` and still append no events.
  - `POST /api/agent/tasks` on repo-local should return 409 unless the test uses portable workspace storage.
  - duplicate task race tests should use a portable workspace helper so resident identity is ready.

- `packages/local-runtime/test/cli.test.ts`
  - `agent-status` on repo-local should include `identityLifecycle.state === "not-mounted"` and still append no events.
  - `agent-create-task` success tests should configure a portable workspace.
  - `create-workspace` success should assert one `agent.identity.initialized` event exists in the new ledger.

- `packages/local-runtime/test/http-handler.test.ts`
  - portable runtime opening should assert the identity event exists before draft creation.
  - repeated `GET /api/requests/workspace` and `GET /api/health` should not append more identity events.

- [ ] **Step 9: Run targeted local runtime tests**

Run:

```bash
npm test -- packages/local-runtime/test/resident-identity-bootstrap.test.ts packages/local-runtime/test/agent-http-routes.test.ts packages/local-runtime/test/cli.test.ts packages/local-runtime/test/http-handler.test.ts
```

Expected:

```text
Test Files  4 passed
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
vite build succeeded
factory-readiness passed
```

- [ ] **Step 11: Record evidence and commit**

Update the claim with RED, targeted, and verify evidence. Commit:

```bash
git add docs/agentic/claims/task-2-resident-lifecycle-local-runtime.md packages/local-runtime/src/runtime-factory.ts packages/local-runtime/src/agent-runtime-factory.ts packages/local-runtime/src/agent-http-routes.ts packages/local-runtime/src/http-handler.ts packages/local-runtime/src/cli.ts packages/local-runtime/test/resident-identity-bootstrap.test.ts packages/local-runtime/test/agent-http-routes.test.ts packages/local-runtime/test/cli.test.ts packages/local-runtime/test/http-handler.test.ts
git commit -m "feat: bootstrap resident identity on workspace open"
```

**Acceptance Criteria:**

- Portable runtime open starts resident identity bootstrap.
- Runtime status exposes ready/not-mounted/blocked lifecycle without writing from status reads.
- Task and memory mutation routes require lifecycle `ready`.
- Repo-local runtime no longer creates hidden `ws_local_runtime` resident identity through HTTP or CLI mutation routes.
- `create-workspace` opens the new ledger, bootstraps identity, and leaves recoverable workspace files on failure.
- Restart, remount, and workspace switch behavior are deterministic.

**Rollback/Escalation:**

- Escalate if synchronous handler creation cannot safely start process-local bootstrap without hiding failures.
- Escalate if changing repo-local task creation breaks an approved developer-mode requirement not covered by the spec.

---

### Task 3: Agent Status DTO, Cockpit, UI, And Operator Integration

**Files:**
- Create: `docs/agentic/claims/task-3-resident-lifecycle-cockpit-integration.md`
- Modify: `packages/agent/src/runtime-types.ts`
- Modify: `packages/agent/src/runtime.ts`
- Modify: `packages/agent/src/cockpit.ts`
- Modify: `packages/agent/test/runtime.test.ts`
- Modify: `packages/agent/test/cockpit.test.ts`
- Modify: `packages/local-runtime/src/operator-status.ts`
- Modify: `packages/local-runtime/test/operator-status.test.ts`
- Modify: `packages/ui/src/agent/agent-adapter.ts`
- Modify: `packages/ui/src/agent/agent-types.ts`
- Modify: `packages/ui/src/agent/AgentWorkspace.tsx`
- Modify: `packages/ui/test/agent-adapter.test.ts`
- Modify: `packages/ui/test/agent-app-integration.test.tsx`

**Interfaces:**
- Consumes from Task 1 and Task 2: `ResidentIdentityLifecycleDto` and HTTP status `identityLifecycle`.
- Produces:
  - `AgentStatusDto.identityLifecycle: ResidentIdentityLifecycleDto`
  - browser parser schema support for `identityLifecycle`
  - Agent cockpit needs and Agent workspace display for identity lifecycle
  - operator agent section state that blocks when lifecycle is `blocked` or `not-mounted`

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-3-resident-lifecycle-cockpit-integration.md` with owned files and status `claimed`. Change status to `in-progress` and commit that claim update.

- [ ] **Step 2: Write RED DTO and cockpit tests**

Add these focused expectations:

In `packages/agent/test/runtime.test.ts`:

```ts
it("includes resident identity lifecycle in runtime status without appending from status reads", async () => {
  const ledger = new InMemoryEventLedger();
  const runtime = createAgentRuntime({
    ledger,
    actor: humanActor,
    now: fixedNow,
    identityLifecycle: {
      schemaVersion: "resident-identity-lifecycle.v1",
      state: "not-mounted",
      residentAgentId: "agent_default",
      initialized: false,
      eventIds: [],
      safeMessage: "Portable workspace is not mounted.",
      allowedRepairActions: ["mount or create a portable workspace"]
    }
  });

  const before = await ledger.readAll();
  const status = await runtime.status();
  const after = await ledger.readAll();

  expect(status.identityLifecycle.state).toBe("not-mounted");
  expect(after).toHaveLength(before.length);
});
```

In `packages/agent/test/cockpit.test.ts`:

```ts
it("surfaces resident identity lifecycle as the first cockpit need when blocked", () => {
  const cockpit = buildAgentCockpit({
    status: {
      ...agentStatusFixture(),
      identityLifecycle: {
        schemaVersion: "resident-identity-lifecycle.v1",
        state: "blocked",
        residentAgentId: "agent_default",
        workspaceId: "ws_blocked_identity",
        initialized: false,
        eventIds: [],
        safeMessage: "Resident identity belongs to a different workspace.",
        allowedRepairActions: ["inspect resident identity events before retrying"]
      }
    }
  });

  expect(cockpit.needsNext[0]).toMatchObject({
    kind: "lock",
    severity: "action-required",
    label: "Resident identity belongs to a different workspace.",
    safeAction: "refresh-status"
  });
});
```

In `packages/ui/test/agent-adapter.test.ts`:

```ts
it("parses resident identity lifecycle without leaking blocked diagnostic text", () => {
  const parsed = agentStatusFromJson({
    ...agentStatus(),
    identityLifecycle: {
      schemaVersion: "resident-identity-lifecycle.v1",
      state: "blocked",
      residentAgentId: "agent_default",
      workspaceId: "ws_blocked_identity",
      initialized: false,
      eventIds: ["evt_agent_identity"],
      safeMessage: "Resident identity stream could not be read safely.",
      allowedRepairActions: ["inspect resident identity events before retrying"]
    }
  });

  expect(parsed.identityLifecycle.state).toBe("blocked");
  expect(JSON.stringify(parsed)).not.toMatch(/authorization:\s*bearer|sk_live|password|private key/i);
});
```

In `packages/ui/test/agent-app-integration.test.tsx`:

```ts
it("renders resident identity lifecycle states without adding execution controls", async () => {
  render(
    <App
      requestsAdapter={createTestRequestsAdapter()}
      ingestionAdapter={createStaticIngestionWorkspaceAdapter({ mounted: false, diagnostics: [] })}
      operatorStatusAdapter={createStaticOperatorStatusAdapter(operatorStatus())}
      agentAdapter={createStaticAgentAdapter(
        agentStatus({
          identityLifecycle: {
            schemaVersion: "resident-identity-lifecycle.v1",
            state: "blocked",
            residentAgentId: "agent_default",
            workspaceId: "ws_blocked_identity",
            initialized: false,
            eventIds: [],
            safeMessage: "Resident identity belongs to a different workspace.",
            allowedRepairActions: ["inspect resident identity events before retrying"]
          }
        }),
        approvalCockpit(),
        { cockpit: agentCockpit() }
      )}
    />
  );

  fireEvent.click(screen.getByRole("link", { name: "Agent" }));
  const workspace = await screen.findByRole("region", { name: "Resident agent workspace" });

  expect(within(workspace).getByText("blocked")).toBeInTheDocument();
  expect(within(workspace).getByText("Resident identity belongs to a different workspace.")).toBeInTheDocument();
  expect(within(workspace).queryByRole("button", { name: /start run|execute|send|export|repair/i })).not.toBeInTheDocument();
});
```

In `packages/local-runtime/test/operator-status.test.ts`:

```ts
it("marks the agent section blocked when resident identity lifecycle is blocked", async () => {
  const status = await buildOperatorStatusDto({
    now,
    runtime: { available: true, safeMessage: "runtime ready" },
    agent: async () => ({
      ...readyAgentStatus(),
      identityLifecycle: {
        schemaVersion: "resident-identity-lifecycle.v1",
        state: "blocked",
        residentAgentId: "agent_default",
        workspaceId: "ws_blocked_identity",
        initialized: false,
        eventIds: [],
        safeMessage: "Resident identity belongs to a different workspace.",
        allowedRepairActions: ["inspect resident identity events before retrying"]
      }
    })
  });

  expect(status.sections.find((section) => section.sectionId === "agent")).toMatchObject({
    state: "blocked",
    headline: "Resident identity requires attention"
  });
});
```

- [ ] **Step 3: Run RED DTO and UI tests**

Run:

```bash
npm test -- packages/agent/test/runtime.test.ts packages/agent/test/cockpit.test.ts packages/local-runtime/test/operator-status.test.ts packages/ui/test/agent-adapter.test.ts packages/ui/test/agent-app-integration.test.tsx
```

Expected:

```text
identityLifecycle is missing
```

- [ ] **Step 4: Add lifecycle to runtime status types**

Modify `packages/agent/src/runtime-types.ts`:

```ts
import type { ResidentIdentityLifecycleDto } from "./identity-bootstrap.js";

export interface AgentStatusDto extends AgentProjectionDto {
  readonly schemaVersion: "agent-status.v1";
  readonly generatedAt: string;
  readonly identityLifecycle: ResidentIdentityLifecycleDto;
  readonly identity?: AgentProjectionIdentity | undefined;
  readonly providers: readonly ProviderDescriptor[];
  readonly providerReadiness?: ProviderReadinessDto | undefined;
  readonly pendingApprovalCount: number;
  readonly activeLockCount: number;
  readonly diagnostics: readonly AgentRuntimeDiagnosticDto[];
}
```

Modify `packages/agent/src/runtime.ts` so `createAgentRuntime` accepts an optional `identityLifecycle` in `CreateAgentRuntimeInput`. If omitted, derive a read-only status from the current projection:

- projection identity present: `ready`
- projection identity absent: `not-mounted`

This status derivation must not append events.

- [ ] **Step 5: Add cockpit lifecycle need**

Modify `packages/agent/src/cockpit.ts`:

- extend the schema by relying on the status type, not by creating a separate lifecycle schema
- in `deriveNeedsNext`, put identity lifecycle first when `state` is `blocked` or `not-mounted`
- use `safeAction: "refresh-status"` for blocked and `safeAction: "queued-task"` only for existing task needs
- do not add execution controls

- [ ] **Step 6: Update operator status section**

Modify `packages/local-runtime/src/operator-status.ts`:

- `agentState(agent)` returns `blocked` when `agent.identityLifecycle.state` is `blocked` or `not-mounted`
- `headlineForAgent(agent, state)` returns:
  - `"Resident identity requires attention"` for blocked lifecycle
  - `"Resident workspace is not mounted"` for not-mounted lifecycle
  - existing strings for approvals, locks, degraded, and ready
- include `identityLifecycle.state` and safe workspace ID in `sourceEvidence` refs
- convert lifecycle blocked state into an operator diagnostic with safe message and allowed repair actions

- [ ] **Step 7: Update UI parser and component**

Modify `packages/ui/src/agent/agent-adapter.ts`:

- add a strict Zod schema for `resident-identity-lifecycle.v1`
- require `identityLifecycle` in `agentStatusDtoSchema`
- keep the existing `safeAgentValue()` redaction path before parsing

Modify `packages/ui/src/agent/agent-types.ts`:

```ts
export type {
  ResidentIdentityLifecycleDto,
  ResidentIdentityLifecycleState
} from "../../../agent/src/identity-bootstrap.js";
```

Modify `packages/ui/src/agent/AgentWorkspace.tsx`:

- add one row in the identity section for lifecycle state
- show the lifecycle safe message when state is not `ready`
- show event IDs through existing provenance refs only when present
- do not add new buttons beyond refresh and existing queue/memory/approval controls

- [ ] **Step 8: Update fixtures**

Update local test fixture helpers named `agentStatus`, `readyAgentStatus`, or equivalent static status factories in `packages/ui/test/*.ts*` and `packages/local-runtime/test/*.ts` so every production-shaped `agent-status.v1` fixture includes:

```ts
identityLifecycle: {
  schemaVersion: "resident-identity-lifecycle.v1",
  state: "ready",
  residentAgentId: "agent_default",
  workspaceId: "ws_case_001",
  initialized: true,
  eventIds: ["evt_agent_identity"],
  safeMessage: "Resident identity is ready.",
  allowedRepairActions: []
}
```

- [ ] **Step 9: Run targeted DTO/UI/operator tests**

Run:

```bash
npm test -- packages/agent/test/runtime.test.ts packages/agent/test/cockpit.test.ts packages/local-runtime/test/operator-status.test.ts packages/ui/test/agent-adapter.test.ts packages/ui/test/agent-app-integration.test.tsx packages/ui/test/app-smoke.test.tsx
```

Expected:

```text
Test Files  6 passed
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
vite build succeeded
factory-readiness passed
```

- [ ] **Step 11: Record evidence and commit**

Update the claim with RED, targeted, and verify evidence. Commit:

```bash
git add docs/agentic/claims/task-3-resident-lifecycle-cockpit-integration.md packages/agent/src/runtime-types.ts packages/agent/src/runtime.ts packages/agent/src/cockpit.ts packages/agent/test/runtime.test.ts packages/agent/test/cockpit.test.ts packages/local-runtime/src/operator-status.ts packages/local-runtime/test/operator-status.test.ts packages/ui/src/agent/agent-adapter.ts packages/ui/src/agent/agent-types.ts packages/ui/src/agent/AgentWorkspace.tsx packages/ui/test/agent-adapter.test.ts packages/ui/test/agent-app-integration.test.tsx
git commit -m "feat: surface resident identity lifecycle"
```

**Acceptance Criteria:**

- `agent-status.v1` includes lifecycle state in runtime and browser DTOs.
- Agent cockpit and UI show not-mounted, ready, and blocked states.
- Operator status treats not-mounted and blocked identity lifecycle as blocked.
- Status/cockpit rendering does not append identity events.
- No new execution, send, export, repair, provider transfer, or run-start controls appear.

**Rollback/Escalation:**

- Escalate if active UI or operator lanes have changed the agent status shape and a rebase is needed.
- Escalate if lifecycle DTO changes require touching context-pack, prompt-template, handoff, or specialist-runner files.

---

### Task 4: Factory Readiness And Final Integration Review

**Files:**
- Create: `docs/agentic/claims/task-4-resident-lifecycle-readiness.md`
- Modify: `scripts/check-agent-readiness.mjs`
- Modify: `docs/agentic/software-factory.md`
- Modify: `docs/superpowers/plans/2026-07-10-resident-lifecycle-bootstrap-implementation.md`

**Interfaces:**
- Consumes: completed Tasks 1 through 3 with passing targeted tests and `npm run verify`.
- Produces: readiness evidence that the spec and plan are required durable files and final verification passed.

- [ ] **Step 1: Claim the readiness task**

Create and commit `docs/agentic/claims/task-4-resident-lifecycle-readiness.md` with owned files and status `claimed`. Change status to `in-progress` and commit that claim update.

- [ ] **Step 2: Write the RED readiness check**

Modify `scripts/check-agent-readiness.mjs` by adding these entries to `requiredFiles` near the resident-agent files:

```js
  "docs/superpowers/specs/2026-07-10-resident-lifecycle-bootstrap-design.md",
  "docs/superpowers/plans/2026-07-10-resident-lifecycle-bootstrap-implementation.md",
```

Run:

```bash
npm run factory:check
```

Expected before staging the plan/readiness files in this task:

```text
factory-readiness passed
```

Expected after temporarily moving the plan path in a local unstaged check:

```text
missing docs/superpowers/plans/2026-07-10-resident-lifecycle-bootstrap-implementation.md
```

Restore the plan path immediately after that local check. Do not commit the temporary move.

- [ ] **Step 3: Append readiness record**

Append this section to `docs/agentic/software-factory.md`:

```md
## Resident Lifecycle Bootstrap Plan Readiness

The resident lifecycle bootstrap plan was prepared from the approved design spec on 2026-07-10.

Required design and plan files:

- `docs/superpowers/specs/2026-07-10-resident-lifecycle-bootstrap-design.md`
- `docs/superpowers/plans/2026-07-10-resident-lifecycle-bootstrap-implementation.md`

The implementation initializes the one default resident identity `agent_default` from local-runtime create and mount/open flows only. Low-level workspace helpers, status reads, detection, and verification remain mutation-free. Bootstrap is append-or-readback, blocks copied or corrupted identity streams, and keeps providers as execution backends rather than resident identities.

Recorded targeted command evidence:

```text
npm test -- packages/agent/test/identity-bootstrap.test.ts packages/agent/test/runtime.test.ts packages/agent/test/projection.test.ts packages/ontology/test/agent-contracts.test.ts

npm test -- packages/local-runtime/test/resident-identity-bootstrap.test.ts packages/local-runtime/test/agent-http-routes.test.ts packages/local-runtime/test/cli.test.ts packages/local-runtime/test/http-handler.test.ts

npm test -- packages/agent/test/runtime.test.ts packages/agent/test/cockpit.test.ts packages/local-runtime/test/operator-status.test.ts packages/ui/test/agent-adapter.test.ts packages/ui/test/agent-app-integration.test.tsx packages/ui/test/app-smoke.test.tsx
```

Final verification evidence:

```text
npm run verify
typecheck passed
tests passed
vite build succeeded
factory-readiness passed
```
```

- [ ] **Step 4: Mark all plan tasks complete**

In this plan file, mark Tasks 1 through 4 checklist items complete only after the corresponding commits and reviews exist. Preserve the command evidence in the task claims.

- [ ] **Step 5: Run final targeted cross-boundary tests**

Run:

```bash
npm test -- packages/agent/test/identity-bootstrap.test.ts packages/local-runtime/test/resident-identity-bootstrap.test.ts packages/local-runtime/test/agent-http-routes.test.ts packages/local-runtime/test/operator-status.test.ts packages/ui/test/agent-adapter.test.ts packages/ui/test/agent-app-integration.test.tsx
```

Expected:

```text
Test Files  6 passed
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
vite build succeeded
factory-readiness passed
```

- [ ] **Step 7: Commit readiness**

Update the claim with targeted and verify evidence. Commit:

```bash
git add docs/agentic/claims/task-4-resident-lifecycle-readiness.md scripts/check-agent-readiness.mjs docs/agentic/software-factory.md docs/superpowers/plans/2026-07-10-resident-lifecycle-bootstrap-implementation.md
git commit -m "docs: record resident lifecycle bootstrap readiness"
```

**Acceptance Criteria:**

- Factory readiness requires both the design spec and implementation plan.
- Final targeted cross-boundary tests pass.
- `npm run verify` passes from the integration checkout.
- Readiness record names the non-mutating workspace-helper boundary, append-or-readback bootstrap, copied-ledger blocking, and provider identity separation.

**Rollback/Escalation:**

- Escalate if readiness script additions conflict with another active branch's requiredFiles ordering or shared readiness section.
- Preserve all existing readiness evidence additively when resolving merge conflicts.

---

## Final Completion Checklist

- [ ] All task claims are committed and marked `ready-for-review` or `merged` as appropriate.
- [ ] Gate A, Gate B, Gate C, and Gate D reviews are complete.
- [ ] Every task recorded RED, targeted PASS, and `npm run verify` evidence.
- [ ] No production implementation touched `packages/workspace/src/index.ts`.
- [ ] No context-pack, prompt-template, handoff, or specialist-runner files changed.
- [ ] No provider identity, credential reference, model name, OAuth account, API key, or backend adapter metadata appears in identity bootstrap events.
- [ ] Local-runtime `create-workspace` leaves a valid recoverable workspace on bootstrap failure.
- [ ] Status, detect, verify, and workspace-ops reads remain mutation-free.
- [ ] Workspace switch and copied-ledger tests pass.
- [ ] Final `git status --short` is clean.
