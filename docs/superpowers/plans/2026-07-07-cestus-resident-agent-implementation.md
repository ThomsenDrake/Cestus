# Cestus Resident Agent Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the smallest coherent end-to-end foundation for the approved resident Cestus Agent: one default resident identity, strict agent events and projections, provider credential references with fake providers, tool-gateway approval contracts, and a minimal local runtime, CLI, operator-status, and UI surface that works without live credentials.

**Architecture:** The ontology ledger remains canonical. Agent events are strict ontology event contracts. A new `packages/agent` domain package builds replayable projections, provider abstractions, tool-gateway policy, specialist run registration, and runtime DTOs from ledger events. Local runtime exposes browser-safe agent status and task surfaces. Operator status and Command use safe DTOs only; they do not duplicate approval gates, provider byte transfer, PRR send, legal escalation, export, repair, or accepted graph decisions.

**Tech Stack:** TypeScript, Zod, Vitest, React, Vite, existing ontology `EventLedger`, local-runtime HTTP handler, operator-status DTOs, and secret-safe browser adapters.

---

## Scope Boundary

This plan implements resident-agent foundation slices 1 through 5 from `docs/superpowers/specs/2026-07-07-cestus-resident-agent-design.md`, plus a small specialist registry guardrail for slice 6.

Included:

- Default resident agent identity and `agent` actor kind.
- Strict append-only agent event vocabulary.
- Replayable task, run, model invocation, tool request, permission, lock, and memory projections.
- Provider and credential reference contracts with deterministic fake providers only.
- Tool gateway approval requests, human approval binding, stale preview rejection, and safe failure events.
- Runtime status/task/tool-request DTOs, local HTTP routes, CLI JSON, operator-status section, and Agent UI workspace.
- Specialist run-type registration for `ontology-bootstrap`, `prr-negotiation`, `evidence-triage`, `timeline-builder`, `contradiction-finder`, `investigation-planner`, and `report-builder`, with unsupported execution failing closed.

Deferred to follow-up implementation plans:

- Full `ontology-bootstrap` orchestration over legacy migration reports, imported evidence, staging candidates, and evidence-tied assertion proposals.
- PRR negotiation, evidence triage, timeline, contradiction, investigation planning, and report-building specialist behavior.
- Live OpenAI, xAI, OpenAI-compatible, BYOK, local model, and enterprise gateway adapters.
- Team role policy beyond the minimal actor-bound approval fields required by this foundation.

## Invariants

- Agent implementation must not weaken append-only ledger semantics, provenance requirements, projection rebuildability, human-approved PRR send gates, legal escalation locks, provider byte-transfer approvals, secret-safe credential references, evidence-first legacy bootstrap, or portable workspace compatibility.
- Providers are execution backends, not agent identities.
- Raw credential values, raw provider errors, source private keys, access bearer material, device secrets, environment variable names, and credential-shaped diagnostics must not enter ledger events, memory, DTOs, tracked docs, or browser output.
- Agent memory must not become accepted graph state.
- Legacy import and old-Cestus ontology material remain evidence-first; no resident-agent path may append accepted assertion, resolved entity, accepted relationship, or accepted merge/split events from legacy truth.

## Review Gates

- Gate A after Tasks 1 through 4: contract and policy review for event schemas, projection replay, credential references, and tool approval semantics.
- Gate B after Tasks 5 and 6: runtime review for local-only execution, auth, workspace mounting, and secret redaction.
- Gate C after Tasks 7 and 8: UI review for browser-safe DTOs, no hidden mutation, no forbidden visible actions, and no layout regression.
- Gate D after Task 10: final factory readiness review before merge.

## Global Escalation Conditions

Stop and ask for review if any of these occur:

- An agent event schema conflicts with existing ontology stream routing, human-gated event checks, or projection rebuild assumptions.
- A change requires a live provider credential or external service.
- A route or UI action would send bytes outside the local machine, send a PRR, clear a legal lock, approve provider byte transfer, execute destructive repair, or accept graph truth.
- Verification repeatedly fails after the same fix path has been tried three times.
- A migration would rewrite, delete, reset, compact, or reinterpret existing ledger history.

---

## Task 1: Agent Event Contracts

**Files:**

- Modify: `packages/ontology/src/contracts.ts`
- Create: `packages/ontology/test/agent-contracts.test.ts`

- [ ] **Step 1: Write failing contract tests**

Create `packages/ontology/test/agent-contracts.test.ts` with tests that prove the agent event family is strict and human-gated where required:

```ts
import { describe, expect, it } from "vitest";
import { validateKnowledgeEvent } from "../src/contracts.js";

const context = {
  actor: { id: "actor_cestus_agent", kind: "agent" as const, label: "Cestus Agent" },
  occurredAt: "2026-07-07T18:00:00.000Z",
  correlationId: "corr_agent_foundation",
  coreVersion: "0.1.0",
  packVersions: { core: "0.1.0", agent: "0.1.0" }
};

describe("resident agent event contracts", () => {
  it("accepts the default resident identity and agent actor kind", () => {
    expect(
      validateKnowledgeEvent({
        id: "evt_agent_identity_initialized",
        type: "agent.identity.initialized",
        version: 1,
        streamId: "agent_identity_agent_default",
        sequence: 1,
        context,
        payload: {
          residentAgentId: "agent_default",
          workspaceId: "ws_case_001",
          label: "Cestus Agent",
          policyId: "agent_policy_default",
          initializedBy: "actor_case_owner"
        }
      }).success
    ).toBe(true);
  });

  it("rejects unknown payload fields and secret-shaped credential references", () => {
    expect(
      validateKnowledgeEvent({
        id: "evt_agent_model_requested",
        type: "agent.model-invocation.requested",
        version: 1,
        streamId: "agent_model_invocation_inv_001",
        sequence: 1,
        context,
        payload: {
          invocationId: "inv_001",
          runId: "run_001",
          providerId: "provider_fake",
          modelFamily: "fake-local",
          inputArtifactHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
          safetyClass: "workspace-safe",
          credentialRefId: "sk_live_unsafe",
          unexpected: true
        }
      }).success
    ).toBe(false);
  });

  it("requires human actors for tool approvals and lock clearing", () => {
    const approved = {
      id: "evt_agent_tool_approved",
      type: "agent.tool.approved",
      version: 1,
      streamId: "agent_tool_request_toolreq_001",
      sequence: 1,
      context,
      payload: {
        toolRequestId: "toolreq_001",
        approvedBy: "actor_case_owner",
        approvedPreviewHash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
        approvalClass: "provider-byte-transfer",
        rationale: "Approved only for the listed evidence IDs."
      }
    };

    expect(
      validateKnowledgeEvent(approved).success
    ).toBe(false);
    expect(
      validateKnowledgeEvent({
        ...approved,
        context: { ...context, actor: { id: "actor_case_owner", kind: "human", label: "Case Owner" } }
      }).success
    ).toBe(true);
  });

  it("enforces stream routing for task, run, tool, memory, permission, and lock events", () => {
    expect(
      validateKnowledgeEvent({
        id: "evt_bad_stream",
        sequence: 1,
        type: "agent.task.created",
        version: 1,
        streamId: "wrong_stream",
        context,
        payload: {
          taskId: "task_001",
          residentAgentId: "agent_default",
          title: "Review provider readiness",
          requestedBy: "actor_case_owner",
          priority: "normal"
        }
      }).success
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run the targeted failing tests**

Run:

```bash
npm test -- packages/ontology/test/agent-contracts.test.ts
```

Expected before implementation:

```text
agent actor kind and agent event types are rejected
```

- [ ] **Step 3: Add strict agent payload schemas**

Modify `packages/ontology/src/contracts.ts`:

- Extend `actorRefSchema` to include `"agent"`.
- Export an `ActorRef` alias immediately after `actorRefSchema` so later agent package tasks can import the canonical actor type:

```ts
export type ActorRef = z.infer<typeof actorRefSchema>;
```

- Add secret-safe ID schemas for resident agent IDs, task IDs, run IDs, tool request IDs, memory IDs, permission IDs, lock IDs, provider IDs, credential reference IDs, invocation IDs, and artifact hashes.
- Add payload schemas for:
  - `agent.identity.initialized`
  - `agent.identity.updated`
  - `agent.policy.installed`
  - `agent.task.created`
  - `agent.task.status.changed`
  - `agent.specialist-run.started`
  - `agent.specialist-run.step.recorded`
  - `agent.specialist-run.completed`
  - `agent.specialist-run.failed`
  - `agent.model-invocation.requested`
  - `agent.model-invocation.completed`
  - `agent.model-invocation.failed`
  - `agent.tool.requested`
  - `agent.tool.approved`
  - `agent.tool.denied`
  - `agent.tool.completed`
  - `agent.tool.failed`
  - `agent.memory.recorded`
  - `agent.memory.superseded`
  - `agent.memory.retracted`
  - `agent.permission.granted`
  - `agent.permission.revoked`
  - `agent.lock.activated`
  - `agent.lock.cleared`

Use these exact value sets:

```ts
const agentTaskStatusSchema = z.enum([
  "queued",
  "running",
  "waiting-for-approval",
  "blocked",
  "completed",
  "failed",
  "canceled"
]);

const agentSpecialistRunTypeSchema = z.enum([
  "ontology-bootstrap",
  "prr-negotiation",
  "evidence-triage",
  "timeline-builder",
  "contradiction-finder",
  "investigation-planner",
  "report-builder"
]);

const agentCredentialKindSchema = z.enum([
  "api-key-bearer",
  "workload-identity-token",
  "subscription-oauth",
  "device-code-oauth",
  "local-no-secret",
  "mtls-certificate",
  "enterprise-gateway"
]);

const agentToolSideEffectClassSchema = z.enum([
  "read-only",
  "local-derivative",
  "ledger-proposal",
  "ledger-review",
  "external-byte-transfer",
  "external-message-send",
  "export-or-publication",
  "destructive-or-repair",
  "legal-escalation"
]);
```

Add human-gated checks for `agent.identity.updated`, `agent.policy.installed`, `agent.tool.approved`, `agent.permission.granted`, `agent.permission.revoked`, and `agent.lock.cleared`.

Add stream routing checks:

```ts
agent.identity.* -> agent_identity_${payload.residentAgentId}
agent.policy.installed -> agent_policy_${payload.policyId}
agent.task.* -> agent_task_${payload.taskId}
agent.specialist-run.* -> agent_run_${payload.runId}
agent.model-invocation.* -> agent_model_invocation_${payload.invocationId}
agent.tool.* -> agent_tool_request_${payload.toolRequestId}
agent.memory.* -> agent_memory_${payload.memoryId}
agent.permission.* -> agent_permission_${payload.permissionId}
agent.lock.* -> agent_lock_${payload.lockId}
```

- [ ] **Step 4: Register event guidance**

Add all agent event types to `payloadSchemas` and `eventContracts` with guidance that names required provenance fields and forbidden autonomous effects. `agent.tool.requested` guidance must mention exact preview hash binding. `agent.memory.recorded` guidance must state memory is not accepted graph state.

- [ ] **Step 5: Run targeted and nearby contract tests**

Run:

```bash
npm test -- packages/ontology/test/agent-contracts.test.ts packages/ontology/test/contracts.test.ts
```

Expected:

```text
Test Files  2 passed
```

- [ ] **Step 6: Commit**

Run:

```bash
git add packages/ontology/src/contracts.ts packages/ontology/test/agent-contracts.test.ts
git commit -m "feat: add resident agent event contracts"
```

**Acceptance Criteria:**

- `agent` actor kind is accepted without permitting agent actors to satisfy human-gated events.
- All agent events are strict Zod contracts and reject unknown fields.
- Credential references are IDs only and reject secret-shaped values.
- Human approval and lock-clearing events require human actors.
- Stream routing is deterministic and projection-replay friendly.

**Rollback/Escalation:**

- Revert only this task's files if the schema breaks unrelated existing event tests.
- Escalate if adding `agent` actor kind requires weakening existing human-gated enforcement.

---

## Task 2: Agent Projection Package

**Files:**

- Create: `packages/agent/src/projection.ts`
- Create: `packages/agent/src/projection-types.ts`
- Create: `packages/agent/src/index.ts`
- Create: `packages/agent/test/fixtures/golden-agent-ledger.ts`
- Create: `packages/agent/test/projection.test.ts`

- [ ] **Step 1: Write failing replay tests**

Create `packages/agent/test/projection.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildAgentProjection } from "../src/projection.js";
import { goldenAgentLedgerEvents } from "./fixtures/golden-agent-ledger.js";

describe("buildAgentProjection", () => {
  it("rebuilds resident identity, tasks, runs, tools, memory, permissions, and locks", () => {
    const projection = buildAgentProjection(goldenAgentLedgerEvents);

    expect(projection.identity?.residentAgentId).toBe("agent_default");
    expect(projection.tasks.get("task_provider_readiness")?.status).toBe("waiting-for-approval");
    expect(projection.runs.get("run_provider_readiness")?.runType).toBe("evidence-triage");
    expect(projection.toolRequests.get("toolreq_provider_preview")?.state).toBe("requested");
    expect(projection.activeMemory.map((memory) => memory.memoryId)).toEqual(["mem_workspace_policy"]);
    expect(projection.permissions.get("perm_read_workspace")?.state).toBe("granted");
    expect(projection.locks.get("lock_legal_escalation")?.state).toBe("active");
  });

  it("is deterministic across replay and preserves memory history after retraction", () => {
    const first = buildAgentProjection(goldenAgentLedgerEvents);
    const second = buildAgentProjection([...goldenAgentLedgerEvents]);

    expect(JSON.stringify(first.toDto())).toEqual(JSON.stringify(second.toDto()));
    expect(first.memoryHistory.get("mem_retracted_context")?.state).toBe("retracted");
    expect(first.activeMemory.some((memory) => memory.memoryId === "mem_retracted_context")).toBe(false);
  });
});
```

Create `packages/agent/test/fixtures/golden-agent-ledger.ts` with valid `KnowledgeEvent[]` covering identity, policy, task, run start, model request/completion, tool request, memory record/retract, permission grant, and active lock. Use fixed IDs, timestamps, and hashes.

- [ ] **Step 2: Run the targeted failing tests**

Run:

```bash
npm test -- packages/agent/test/projection.test.ts
```

Expected before implementation:

```text
Failed to resolve import "../src/projection.js"
```

- [ ] **Step 3: Implement projection types**

Create `packages/agent/src/projection-types.ts` with frozen DTO-friendly types:

```ts
export type AgentTaskStatus =
  | "queued"
  | "running"
  | "waiting-for-approval"
  | "blocked"
  | "completed"
  | "failed"
  | "canceled";

export type AgentToolRequestState = "requested" | "approved" | "denied" | "completed" | "failed";
export type AgentMemoryState = "active" | "superseded" | "retracted";
export type AgentPermissionState = "granted" | "revoked";
export type AgentLockState = "active" | "cleared";

export interface AgentProjectionDto {
  readonly residentAgentId?: string;
  readonly tasks: readonly ProjectedAgentTask[];
  readonly runs: readonly ProjectedAgentRun[];
  readonly toolRequests: readonly ProjectedAgentToolRequest[];
  readonly activeMemory: readonly ProjectedAgentMemory[];
  readonly permissions: readonly ProjectedAgentPermission[];
  readonly locks: readonly ProjectedAgentLock[];
}
```

Add the concrete projected interfaces referenced by `AgentProjectionDto`. Store event IDs for provenance on every projected object.

- [ ] **Step 4: Implement replay**

Create `packages/agent/src/projection.ts`:

```ts
import type { KnowledgeEvent } from "../../ontology/src/contracts.js";
import type {
  AgentProjectionDto,
  ProjectedAgentLock,
  ProjectedAgentMemory,
  ProjectedAgentPermission,
  ProjectedAgentRun,
  ProjectedAgentTask,
  ProjectedAgentToolRequest
} from "./projection-types.js";

export interface AgentProjection {
  readonly identity?: { readonly residentAgentId: string; readonly workspaceId: string; readonly label: string };
  readonly tasks: ReadonlyMap<string, ProjectedAgentTask>;
  readonly runs: ReadonlyMap<string, ProjectedAgentRun>;
  readonly toolRequests: ReadonlyMap<string, ProjectedAgentToolRequest>;
  readonly memoryHistory: ReadonlyMap<string, ProjectedAgentMemory>;
  readonly activeMemory: readonly ProjectedAgentMemory[];
  readonly permissions: ReadonlyMap<string, ProjectedAgentPermission>;
  readonly locks: ReadonlyMap<string, ProjectedAgentLock>;
  toDto(): AgentProjectionDto;
}

export function buildAgentProjection(events: readonly KnowledgeEvent[]): AgentProjection {
  // Replay only agent.* events; ignore unrelated domain events.
}
```

Implementation requirements:

- Ignore non-agent events.
- Process events in input order without sorting.
- Preserve event IDs and causation IDs on projected state.
- Superseded or retracted memory remains in `memoryHistory` and is absent from `activeMemory`.
- Tool requests move through requested, approved, denied, completed, and failed states without deleting prior provenance.
- `toDto()` returns arrays sorted by stable ID for deterministic tests.

- [ ] **Step 5: Export package surface**

Create `packages/agent/src/index.ts`:

```ts
export * from "./projection.js";
export * from "./projection-types.js";
```

- [ ] **Step 6: Run targeted tests**

Run:

```bash
npm test -- packages/agent/test/projection.test.ts packages/ontology/test/agent-contracts.test.ts
```

Expected:

```text
Test Files  2 passed
```

- [ ] **Step 7: Commit**

Run:

```bash
git add packages/agent/src/projection.ts packages/agent/src/projection-types.ts packages/agent/src/index.ts packages/agent/test/fixtures/golden-agent-ledger.ts packages/agent/test/projection.test.ts
git commit -m "feat: add resident agent projection"
```

**Acceptance Criteria:**

- Golden replay produces deterministic DTO output.
- Projection rebuilds all foundation state from ledger events only.
- Projection stores provenance refs and never infers accepted ontology truth from memory.

**Rollback/Escalation:**

- Escalate if projection requires mutation outside replayed events or a non-ledger cache to pass tests.

---

## Task 3: Provider And Credential Abstraction

**Files:**

- Create: `packages/agent/src/provider.ts`
- Create: `packages/agent/src/secret-safety.ts`
- Modify: `packages/agent/src/index.ts`
- Create: `packages/agent/test/provider.test.ts`

- [ ] **Step 1: Write failing provider tests**

Create `packages/agent/test/provider.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  FakeModelProvider,
  assertCredentialReferenceIsSafe,
  providerDescriptorSchema
} from "../src/provider.js";

describe("agent provider abstraction", () => {
  it("describes a fake provider without becoming an agent identity", async () => {
    const provider = new FakeModelProvider({
      providerId: "provider_fake_local",
      modelFamilies: ["fake-local"],
      responseText: "deterministic response"
    });

    expect(providerDescriptorSchema.parse(provider.describe())).toMatchObject({
      providerId: "provider_fake_local",
      endpointKind: "local-engine",
      credentialKinds: ["local-no-secret"]
    });
    expect(provider.describe()).not.toHaveProperty("residentAgentId");
  });

  it("returns deterministic fake output without live credentials", async () => {
    const provider = new FakeModelProvider({
      providerId: "provider_fake_local",
      modelFamilies: ["fake-local"],
      responseText: "review complete"
    });

    await expect(
      provider.invoke({
        invocationId: "inv_fake_001",
        runId: "run_fake_001",
        modelFamily: "fake-local",
        inputArtifactHash: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
        credentialRef: { credentialRefId: "agent_credref_local", providerId: "provider_fake_local", kind: "local-no-secret" }
      })
    ).resolves.toMatchObject({
      outputText: "review complete",
      outputArtifactHash: expect.stringMatching(/^sha256:/)
    });
  });

  it("rejects secret-shaped credential reference values", () => {
    expect(() =>
      assertCredentialReferenceIsSafe({
        credentialRefId: "agent_credref_safe",
        providerId: "provider_fake_local",
        kind: "api-key-bearer",
        safeLabel: "api key sk-live-value"
      })
    ).toThrow(/secret/i);
  });
});
```

- [ ] **Step 2: Run the targeted failing tests**

Run:

```bash
npm test -- packages/agent/test/provider.test.ts
```

Expected before implementation:

```text
Failed to resolve import "../src/provider.js"
```

- [ ] **Step 3: Implement secret-safety helpers**

Create `packages/agent/src/secret-safety.ts` with one exported predicate and one assertion:

```ts
export function isAgentSecretSafeText(value: string): boolean {
  return !/(?:^|[^a-z0-9])(?:access[\s._-]*bearer|api[\s._-]*key|authorization|bearer|password|private[\s._-]*key|client[\s._-]*secret|refresh[\s._-]*secret|session[\s._-]*secret|oauth|credential)(?:\s*[:=]\s*|\s+)(?=[a-z0-9._~+/=-]{3,})[a-z0-9][a-z0-9._~+/=-]*/i.test(value) &&
    !/\b(?:auth[\s._-]*bearer|bearer|password|private[\s._-]*key)\b/i.test(value) &&
    !/-----BEGIN [A-Z ]*PRIVATE KEY-----/i.test(value);
}

export function assertAgentSecretSafeText(value: string, label: string): void {
  if (!isAgentSecretSafeText(value)) {
    throw new Error(`${label} must be secret-safe`);
  }
}
```

- [ ] **Step 4: Implement provider contracts and fake provider**

Create `packages/agent/src/provider.ts`:

```ts
import { createHash } from "node:crypto";
import { z } from "zod";
import { assertAgentSecretSafeText } from "./secret-safety.js";

export const credentialKindSchema = z.enum([
  "api-key-bearer",
  "workload-identity-token",
  "subscription-oauth",
  "device-code-oauth",
  "local-no-secret",
  "mtls-certificate",
  "enterprise-gateway"
]);

export const providerDescriptorSchema = z.object({
  providerId: z.string().regex(/^provider_[a-zA-Z0-9_-]+$/),
  label: z.string().min(1),
  adapterVersion: z.string().min(1),
  endpointKind: z.enum(["openai-api", "openai-compatible-api", "local-engine", "enterprise-gateway", "custom-adapter"]),
  modelFamilies: z.array(z.string().min(1)).min(1),
  credentialKinds: z.array(credentialKindSchema).min(1),
  supportsStructuredOutput: z.boolean(),
  supportsToolCalling: z.boolean(),
  safeDataNotes: z.string().min(1)
}).strict();

export type CredentialKind = z.infer<typeof credentialKindSchema>;
export type ProviderDescriptor = z.infer<typeof providerDescriptorSchema>;

export interface CredentialReference {
  readonly credentialRefId: string;
  readonly providerId: string;
  readonly kind: CredentialKind;
  readonly safeLabel?: string;
}

export interface ModelInvocationRequest {
  readonly invocationId: string;
  readonly runId: string;
  readonly modelFamily: string;
  readonly inputArtifactHash: string;
  readonly credentialRef: CredentialReference;
}

export interface ModelInvocationResult {
  readonly outputText: string;
  readonly outputArtifactHash: string;
  readonly usage: { readonly inputUnits: number; readonly outputUnits: number };
}

export interface ModelProviderAdapter {
  describe(): ProviderDescriptor;
  invoke(request: ModelInvocationRequest): Promise<ModelInvocationResult>;
}
```

Implement `assertCredentialReferenceIsSafe` and `FakeModelProvider` in the same file. The fake provider must hash `invocationId`, `runId`, `inputArtifactHash`, and `responseText` to derive a deterministic `sha256:` output artifact hash. It must not read process environment variables.

- [ ] **Step 5: Export provider surface**

Modify `packages/agent/src/index.ts`:

```ts
export * from "./projection.js";
export * from "./projection-types.js";
export * from "./provider.js";
export * from "./secret-safety.js";
```

- [ ] **Step 6: Run targeted tests**

Run:

```bash
npm test -- packages/agent/test/provider.test.ts packages/agent/test/projection.test.ts
```

Expected:

```text
Test Files  2 passed
```

- [ ] **Step 7: Commit**

Run:

```bash
git add packages/agent/src/provider.ts packages/agent/src/secret-safety.ts packages/agent/src/index.ts packages/agent/test/provider.test.ts
git commit -m "feat: add agent provider abstraction"
```

**Acceptance Criteria:**

- Provider descriptors are backend metadata only and contain no agent identity.
- Credential references serialize IDs, provider IDs, kinds, and safe labels only.
- Fake provider runs without network, environment credentials, or browser secrets.
- Secret-shaped provider labels and credential references fail closed.

**Rollback/Escalation:**

- Escalate if tests require live provider credentials, outbound network, or environment-specific auth behavior.

---

## Task 4: Tool Gateway And Permission Policy

**Files:**

- Create: `packages/agent/src/permission-policy.ts`
- Create: `packages/agent/src/tool-gateway.ts`
- Modify: `packages/agent/src/index.ts`
- Create: `packages/agent/test/tool-gateway.test.ts`

- [ ] **Step 1: Write failing gateway tests**

Create `packages/agent/test/tool-gateway.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { createAgentToolGateway } from "../src/tool-gateway.js";

const agentActor = { id: "actor_cestus_agent", kind: "agent" as const, label: "Cestus Agent" };
const humanActor = { id: "actor_case_owner", kind: "human" as const, label: "Case Owner" };

describe("agent tool gateway", () => {
  it("records approval-required tool requests without executing them", async () => {
    const ledger = new InMemoryEventLedger();
    const gateway = createAgentToolGateway({ ledger, actor: agentActor, now: () => "2026-07-07T18:30:00.000Z" });

    const requested = await gateway.requestTool({
      toolRequestId: "toolreq_provider_preview",
      residentAgentId: "agent_default",
      taskId: "task_provider_readiness",
      runId: "run_provider_readiness",
      toolId: "provider.parse.preview",
      sideEffectClass: "external-byte-transfer",
      preview: { summary: "Send two evidence text excerpts to a fake provider.", relatedEventIds: ["evt_import_001"] },
      requiredApprovalClass: "provider-byte-transfer"
    });

    expect(requested.type).toBe("agent.tool.requested");
    expect((await ledger.readAll()).map((event) => event.type)).toEqual(["agent.tool.requested"]);
  });

  it("requires human approval and exact preview hash before completion", async () => {
    const ledger = new InMemoryEventLedger();
    const gateway = createAgentToolGateway({ ledger, actor: agentActor, now: () => "2026-07-07T18:30:00.000Z" });

    const requested = await gateway.requestTool({
      toolRequestId: "toolreq_prr_send",
      residentAgentId: "agent_default",
      taskId: "task_prr",
      runId: "run_prr",
      toolId: "prr.send.followup",
      sideEffectClass: "external-message-send",
      preview: { summary: "Send PRR follow-up draft.", relatedEventIds: ["evt_prr_draft"] },
      requiredApprovalClass: "external-message-send"
    });

    await expect(
      gateway.approveTool({
        toolRequestId: "toolreq_prr_send",
        approvedPreviewHash: requested.payload.previewHash,
        actor: agentActor,
        rationale: "Agent cannot approve itself."
      })
    ).rejects.toThrow(/human/i);

    await gateway.approveTool({
      toolRequestId: "toolreq_prr_send",
      approvedPreviewHash: requested.payload.previewHash,
      actor: humanActor,
      rationale: "Human approved the exact preview."
    });

    await expect(
      gateway.completeTool({
        toolRequestId: "toolreq_prr_send",
        approvedPreviewHash: "sha256:9999999999999999999999999999999999999999999999999999999999999999",
        result: { eventIds: [], artifactHashes: [], readModelChanges: [] }
      })
    ).rejects.toThrow(/stale/i);
  });
});
```

- [ ] **Step 2: Run targeted failing tests**

Run:

```bash
npm test -- packages/agent/test/tool-gateway.test.ts
```

Expected before implementation:

```text
Failed to resolve import "../src/tool-gateway.js"
```

- [ ] **Step 3: Implement default permission policy**

Create `packages/agent/src/permission-policy.ts`:

```ts
export type AgentApprovalClass =
  | "none"
  | "provider-byte-transfer"
  | "external-message-send"
  | "legal-escalation"
  | "export-or-publication"
  | "destructive-or-repair"
  | "ledger-review";

export function approvalClassForSideEffect(sideEffectClass: string): AgentApprovalClass {
  switch (sideEffectClass) {
    case "read-only":
    case "local-derivative":
    case "ledger-proposal":
      return "none";
    case "external-byte-transfer":
      return "provider-byte-transfer";
    case "external-message-send":
      return "external-message-send";
    case "legal-escalation":
      return "legal-escalation";
    case "export-or-publication":
      return "export-or-publication";
    case "destructive-or-repair":
      return "destructive-or-repair";
    case "ledger-review":
      return "ledger-review";
    default:
      return "destructive-or-repair";
  }
}
```

- [ ] **Step 4: Implement gateway service**

Create `packages/agent/src/tool-gateway.ts`:

```ts
import { createHash } from "node:crypto";
import type { ActorRef, AppendableKnowledgeEvent } from "../../ontology/src/contracts.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";
import { approvalClassForSideEffect, type AgentApprovalClass } from "./permission-policy.js";

export interface CreateAgentToolGatewayInput {
  readonly ledger: EventLedger;
  readonly actor: ActorRef;
  readonly now: () => string;
}

export function createAgentToolGateway(input: CreateAgentToolGatewayInput) {
  return {
    async requestTool(command: RequestAgentToolInput) {
      const previewHash = hashPreview(command.preview);
      const requiredApprovalClass = command.requiredApprovalClass ?? approvalClassForSideEffect(command.sideEffectClass);
      const event: AppendableKnowledgeEvent<"agent.tool.requested"> = {
        type: "agent.tool.requested",
        version: 1,
        streamId: `agent_tool_request_${command.toolRequestId}`,
        context: agentContext(input, `corr_${command.toolRequestId}`),
        payload: {
          toolRequestId: command.toolRequestId,
          residentAgentId: command.residentAgentId,
          taskId: command.taskId,
          runId: command.runId,
          toolId: command.toolId,
          sideEffectClass: command.sideEffectClass,
          previewHash,
          preview: command.preview,
          requiredApprovalClass,
          state: "requested"
        }
      };
      return input.ledger.append(event);
    },
    approveTool(command: ApproveAgentToolInput) {
      // Read the request, require human actor, bind exact preview hash, append agent.tool.approved.
    },
    denyTool(command: DenyAgentToolInput) {
      // Append agent.tool.denied with human or policy actor and safe rationale.
    },
    completeTool(command: CompleteAgentToolInput) {
      // Require approval for gated requests, reject stale preview hash, append agent.tool.completed.
    },
    failTool(command: FailAgentToolInput) {
      // Append agent.tool.failed with safe category and repair actions.
    }
  };
}
```

Implementation requirements:

- `hashPreview` must use stable JSON stringification of sorted object keys.
- `approveTool` must reject non-human actors.
- `completeTool` must reject gated requests with no approval, denied requests, failed requests, and mismatched preview hashes.
- The gateway appends events only; it must not call PRR send, provider parse, export, projection rebuild, repair, or accepted ontology review services in this task.
- Failure messages must pass `assertAgentSecretSafeText`.

- [ ] **Step 5: Export gateway surface**

Modify `packages/agent/src/index.ts`:

```ts
export * from "./permission-policy.js";
export * from "./tool-gateway.js";
```

- [ ] **Step 6: Run targeted tests**

Run:

```bash
npm test -- packages/agent/test/tool-gateway.test.ts packages/agent/test/projection.test.ts packages/ontology/test/agent-contracts.test.ts
```

Expected:

```text
Test Files  3 passed
```

- [ ] **Step 7: Commit**

Run:

```bash
git add packages/agent/src/permission-policy.ts packages/agent/src/tool-gateway.ts packages/agent/src/index.ts packages/agent/test/tool-gateway.test.ts
git commit -m "feat: add agent tool gateway"
```

**Acceptance Criteria:**

- Approval-required actions append request events and do not execute.
- Human approval binds exact preview hash.
- Agent actors cannot approve their own requests.
- Stale or denied tool requests fail closed.
- Gateway has no direct provider byte transfer, PRR send, legal escalation, export, repair, or accepted graph write path.

**Rollback/Escalation:**

- Escalate if a tool path needs to bypass event approval to satisfy a test.

---

## Task 5: Agent Runtime Core

**Files:**

- Create: `packages/agent/src/runtime-types.ts`
- Create: `packages/agent/src/runtime.ts`
- Modify: `packages/agent/src/index.ts`
- Create: `packages/agent/test/runtime.test.ts`

- [ ] **Step 1: Write failing runtime tests**

Create `packages/agent/test/runtime.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { FakeModelProvider, createAgentRuntime } from "../src/index.js";

const humanActor = { id: "actor_case_owner", kind: "human" as const, label: "Case Owner" };

describe("agent runtime core", () => {
  it("initializes a default resident identity and creates durable tasks", async () => {
    const ledger = new InMemoryEventLedger();
    const runtime = createAgentRuntime({ ledger, actor: humanActor, now: () => "2026-07-07T19:00:00.000Z" });

    await runtime.initializeDefaultIdentity({ workspaceId: "ws_case_001" });
    const task = await runtime.createTask({
      taskId: "task_foundation_status",
      title: "Summarize resident status",
      requestedBy: humanActor.id,
      priority: "normal"
    });

    expect(task.ok).toBe(true);
    expect((await runtime.status()).identity?.residentAgentId).toBe("agent_default");
    expect((await runtime.status()).tasks.map((item) => item.taskId)).toContain("task_foundation_status");
  });

  it("invokes fake providers through resident-agent events only", async () => {
    const ledger = new InMemoryEventLedger();
    const runtime = createAgentRuntime({
      ledger,
      actor: humanActor,
      now: () => "2026-07-07T19:00:00.000Z",
      providers: [
        new FakeModelProvider({
          providerId: "provider_fake_local",
          modelFamilies: ["fake-local"],
          responseText: "fake response"
        })
      ]
    });

    await runtime.initializeDefaultIdentity({ workspaceId: "ws_case_001" });
    await runtime.createTask({ taskId: "task_fake_model", title: "Run fake model", requestedBy: humanActor.id, priority: "normal" });
    await runtime.startRun({
      runId: "run_fake_model",
      taskId: "task_fake_model",
      runType: "evidence-triage",
      scope: { kind: "workspace", refs: ["ws_case_001"] }
    });
    const result = await runtime.invokeModel({
      invocationId: "inv_fake_model",
      runId: "run_fake_model",
      providerId: "provider_fake_local",
      modelFamily: "fake-local",
      inputArtifactHash: "sha256:4444444444444444444444444444444444444444444444444444444444444444",
      credentialRef: { credentialRefId: "agent_credref_local", providerId: "provider_fake_local", kind: "local-no-secret" }
    });

    expect(result.ok).toBe(true);
    expect((await ledger.readAll()).map((event) => event.type)).toContain("agent.model-invocation.completed");
    expect((await ledger.readAll()).some((event) => event.type === "assertion.accepted")).toBe(false);
  });
});
```

- [ ] **Step 2: Run targeted failing tests**

Run:

```bash
npm test -- packages/agent/test/runtime.test.ts
```

Expected before implementation:

```text
Failed to resolve import "../src/runtime.js"
```

- [ ] **Step 3: Implement runtime DTOs**

Create `packages/agent/src/runtime-types.ts`:

```ts
import type { AgentProjectionDto } from "./projection-types.js";
import type { ProviderDescriptor } from "./provider.js";

export interface AgentRuntimeDiagnosticDto {
  readonly diagnosticId?: string;
  readonly severity: "info" | "warning" | "error";
  readonly category: "agent" | "provider" | "credential" | "tool-gateway" | "policy" | "runtime";
  readonly message: string;
  readonly allowedRepairActions?: readonly string[];
}

export interface AgentStatusDto extends AgentProjectionDto {
  readonly schemaVersion: "agent-status.v1";
  readonly generatedAt: string;
  readonly providers: readonly ProviderDescriptor[];
  readonly pendingApprovalCount: number;
  readonly activeLockCount: number;
  readonly diagnostics: readonly AgentRuntimeDiagnosticDto[];
}

export type AgentRuntimeResult<T> =
  | ({ readonly ok: true } & T)
  | { readonly ok: false; readonly error: AgentRuntimeDiagnosticDto };
```

- [ ] **Step 4: Implement runtime service**

Create `packages/agent/src/runtime.ts`:

```ts
import type { ActorRef, AppendableKnowledgeEvent } from "../../ontology/src/contracts.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";
import { buildAgentProjection } from "./projection.js";
import type { ModelProviderAdapter } from "./provider.js";
import { assertCredentialReferenceIsSafe } from "./provider.js";
import type { AgentRuntimeResult, AgentStatusDto } from "./runtime-types.js";
import { createAgentToolGateway } from "./tool-gateway.js";

export interface CreateAgentRuntimeInput {
  readonly ledger: EventLedger;
  readonly actor: ActorRef;
  readonly now: () => string;
  readonly providers?: readonly ModelProviderAdapter[];
}

export function createAgentRuntime(input: CreateAgentRuntimeInput) {
  const providers = new Map((input.providers ?? []).map((provider) => [provider.describe().providerId, provider]));

  return {
    async status(): Promise<AgentStatusDto> {
      const projection = buildAgentProjection(await input.ledger.readAll());
      return {
        schemaVersion: "agent-status.v1",
        generatedAt: input.now(),
        ...projection.toDto(),
        providers: [...providers.values()].map((provider) => provider.describe()),
        pendingApprovalCount: [...projection.toolRequests.values()].filter((request) => request.state === "requested").length,
        activeLockCount: [...projection.locks.values()].filter((lock) => lock.state === "active").length,
        diagnostics: []
      };
    },
    initializeDefaultIdentity(command: InitializeDefaultIdentityInput) {
      // Append agent.identity.initialized only when the projection has no identity.
    },
    createTask(command: CreateAgentTaskInput) {
      // Append agent.task.created and agent.task.status.changed queued.
    },
    startRun(command: StartAgentRunInput) {
      // Append agent.specialist-run.started and task running status.
    },
    invokeModel(command: InvokeAgentModelInput) {
      // Append requested, call selected fake/local provider, append completed or failed.
    },
    gateway: createAgentToolGateway({ ledger: input.ledger, actor: input.actor, now: input.now })
  };
}
```

Implementation requirements:

- `status()` must be read-only.
- `initializeDefaultIdentity()` must not create a second default identity.
- `invokeModel()` must reject missing providers, unsupported model families, unsafe credential references, and provider failures with `AgentRuntimeResult` errors plus `agent.model-invocation.failed` where an invocation event is safe to append.
- Runtime methods must use `AppendableKnowledgeEvent` types from ontology contracts.
- No live provider adapter is added in this task.

- [ ] **Step 5: Export runtime surface**

Modify `packages/agent/src/index.ts`:

```ts
export * from "./runtime.js";
export * from "./runtime-types.js";
```

- [ ] **Step 6: Run targeted tests**

Run:

```bash
npm test -- packages/agent/test/runtime.test.ts packages/agent/test/provider.test.ts packages/agent/test/tool-gateway.test.ts packages/agent/test/projection.test.ts
```

Expected:

```text
Test Files  4 passed
```

- [ ] **Step 7: Commit**

Run:

```bash
git add packages/agent/src/runtime-types.ts packages/agent/src/runtime.ts packages/agent/src/index.ts packages/agent/test/runtime.test.ts
git commit -m "feat: add resident agent runtime core"
```

**Acceptance Criteria:**

- Runtime status is read-only and rebuilds from ledger events.
- Runtime task, run, model invocation, and tool gateway methods append agent events only.
- Fake provider invocation works without live credentials.
- Missing provider or unsafe credential state becomes inspectable failure, not raw provider text.

**Rollback/Escalation:**

- Escalate if runtime needs external network, secret-store access, or non-ledger state to pass the foundation tests.

---

## Task 6: Local Runtime HTTP And CLI Surfaces

**Files:**

- Create: `packages/local-runtime/src/agent-runtime-factory.ts`
- Create: `packages/local-runtime/src/agent-http-routes.ts`
- Modify: `packages/local-runtime/src/http-handler.ts`
- Modify: `packages/local-runtime/src/cli.ts`
- Create: `packages/local-runtime/test/agent-http-routes.test.ts`
- Modify: `packages/local-runtime/test/cli.test.ts`

- [ ] **Step 1: Write failing HTTP route tests**

Create `packages/local-runtime/test/agent-http-routes.test.ts`:

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

describe("agent HTTP routes", () => {
  it("returns agent-status.v1 from GET /api/agent/status without live credentials", async () => {
    const handler = testHandler();
    const response = await handler({ method: "GET", url: "/api/agent/status" });
    const body = JSON.parse(response.body) as { schemaVersion: string; providers: unknown[] };

    expect(response.status).toBe(200);
    expect(body.schemaVersion).toBe("agent-status.v1");
    expect(response.body).not.toMatch(/sk_live|password|private key/i);
  });

  it("creates a durable task through POST /api/agent/tasks", async () => {
    const handler = testHandler();
    const response = await handler({
      method: "POST",
      url: "/api/agent/tasks",
      body: JSON.stringify({ taskId: "task_route_001", title: "Inspect resident status", priority: "normal" })
    });

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ ok: true, taskId: "task_route_001" });
  });

  it("uses existing auth policy for protected agent routes", async () => {
    const handler = testHandler({
      env: {
        CESTUS_LOCAL_BIND: "lan",
        CESTUS_LOCAL_AUTH_TOKEN: "route-secret"
      }
    });

    const rejected = await handler({ method: "GET", url: "/api/agent/status" });
    const accepted = await handler({
      method: "GET",
      url: "/api/agent/status",
      headers: { authorization: "Bearer route-secret" }
    });

    expect(rejected.status).toBe(401);
    expect(accepted.status).toBe(200);
  });
});

function testHandler(input: { readonly env?: Record<string, string | undefined> } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), "cestus-agent-route-"));
  tempDirs.push(cwd);
  const handler = createLocalRuntimeHttpHandler({
    config: resolveLocalRuntimeConfig({ cwd, env: input.env ?? {} }),
    actor: { id: "actor_agent_route", kind: "human", label: "Agent Route Test" },
    now: () => "2026-07-07T20:00:00.000Z"
  });
  handlers.push(handler);
  return handler;
}
```

- [ ] **Step 2: Add failing CLI tests**

Modify `packages/local-runtime/test/cli.test.ts` with cases for:

- `runLocalRuntimeCli(["agent-status"], ...)` prints `agent-status.v1`.
- `runLocalRuntimeCli(["agent-create-task", "--task-id", "task_cli_001", "--title", "Review resident status"], ...)` prints `{ "ok": true }`.
- CLI output does not contain secret-shaped text supplied by a failing injected dependency.

- [ ] **Step 3: Run targeted failing tests**

Run:

```bash
npm test -- packages/local-runtime/test/agent-http-routes.test.ts packages/local-runtime/test/cli.test.ts
```

Expected before implementation:

```text
agent route and CLI commands are not found
```

- [ ] **Step 4: Add runtime factory**

Create `packages/local-runtime/src/agent-runtime-factory.ts`:

```ts
import { FakeModelProvider, createAgentRuntime } from "../../agent/src/index.js";
import type { ActorRef } from "../../ontology/src/contracts.js";
import type { LocalRuntimeHandle } from "./runtime-factory.js";

export interface LocalAgentRuntimeFactoryInput {
  readonly handle: LocalRuntimeHandle;
  readonly actor: ActorRef;
  readonly now: () => string;
}

export function defaultLocalAgentRuntimeFactory(input: LocalAgentRuntimeFactoryInput) {
  return createAgentRuntime({
    ledger: input.handle.ledger,
    actor: input.actor,
    now: input.now,
    providers: [
      new FakeModelProvider({
        providerId: "provider_fake_local",
        modelFamilies: ["fake-local"],
        responseText: "Fake local provider ready."
      })
    ]
  });
}
```

- [ ] **Step 5: Add HTTP routes**

Create `packages/local-runtime/src/agent-http-routes.ts` with:

- `GET /api/agent/status`
- `GET /api/agent/tool-requests`
- `POST /api/agent/tasks`

Route requirements:

- Use the existing local-runtime auth boundary in `http-handler.ts`; do not add route-local auth.
- Parse JSON with strict object checks and stable diagnostics.
- Call `runtime.status()` for status and approval queue.
- Call `runtime.createTask()` for task creation.
- Return HTTP 400 for invalid task bodies.
- Return secret-safe diagnostic bodies only.

Modify `packages/local-runtime/src/http-handler.ts`:

- Import `handleAgentHttpRoute` and `defaultLocalAgentRuntimeFactory`.
- Add optional dependency injection fields for tests:

```ts
readonly agentRuntimeFactory?: LocalAgentRuntimeFactory;
```

- Route `/api/agent/` before PRR request routes and after operator status.

- [ ] **Step 6: Add CLI commands**

Modify `packages/local-runtime/src/cli.ts`:

- Add dependency injection fields:

```ts
readonly agentStatus?: () => Promise<unknown>;
readonly agentCreateTask?: (input: { readonly taskId: string; readonly title: string; readonly priority?: string }) => Promise<unknown>;
```

- Add commands:
  - `agent-status`
  - `agent-create-task --task-id <id> --title <title> [--priority normal|high|low]`

CLI requirements:

- Output stable JSON.
- Redact unsafe diagnostic text with the same style as current config and seed output.
- Do not add a package script unless a test needs one.

- [ ] **Step 7: Run targeted tests**

Run:

```bash
npm test -- packages/local-runtime/test/agent-http-routes.test.ts packages/local-runtime/test/http-handler.test.ts packages/local-runtime/test/cli.test.ts
```

Expected:

```text
Test Files  3 passed
```

- [ ] **Step 8: Commit**

Run:

```bash
git add packages/local-runtime/src/agent-runtime-factory.ts packages/local-runtime/src/agent-http-routes.ts packages/local-runtime/src/http-handler.ts packages/local-runtime/src/cli.ts packages/local-runtime/test/agent-http-routes.test.ts packages/local-runtime/test/cli.test.ts
git commit -m "feat: expose resident agent runtime locally"
```

**Acceptance Criteria:**

- Agent status works through local HTTP without live credentials.
- Agent task creation appends durable agent events through runtime service.
- Protected routes keep existing auth behavior for non-loopback exposure.
- CLI JSON is stable and secret-safe.

**Rollback/Escalation:**

- Escalate if routes need to bypass local-runtime auth, use browser-stored secrets, or call external services.

---

## Task 7: Operator Status Agent Section

**Files:**

- Modify: `packages/operator-status/src/contracts.ts`
- Modify: `packages/operator-status/test/contracts.test.ts`
- Modify: `packages/local-runtime/src/operator-status.ts`
- Modify: `packages/local-runtime/src/operator-status-providers.ts`
- Modify: `packages/local-runtime/test/operator-status.test.ts`
- Modify: `packages/local-runtime/test/operator-status-routes.test.ts`

- [ ] **Step 1: Write failing operator-status tests**

Modify `packages/operator-status/test/contracts.test.ts`:

- Expect `operatorSectionIds` to include `"agent"`.
- Expect `operatorNavigationTargets` to include `"agents"`.
- Expect `operatorDiagnosticSchema` to accept category `"agent"`.
- Expect `operatorSourceEvidenceSchema` to accept sourceKind `"agent"`.

Modify `packages/local-runtime/test/operator-status.test.ts` and `packages/local-runtime/test/operator-status-routes.test.ts`:

- Expect `/api/operator/status` to include an Agent section.
- Expect the Agent section to report pending approvals and active locks from an injected provider DTO.
- Expect unavailable agent provider errors to be redacted.

- [ ] **Step 2: Run targeted failing tests**

Run:

```bash
npm test -- packages/operator-status/test/contracts.test.ts packages/local-runtime/test/operator-status.test.ts packages/local-runtime/test/operator-status-routes.test.ts
```

Expected before implementation:

```text
agent section id and provider are not accepted
```

- [ ] **Step 3: Extend operator-status contracts**

Modify `packages/operator-status/src/contracts.ts`:

- Add `"agent"` to `operatorSectionIds`.
- Add `"agents"` to `operatorNavigationTargets`.
- Add `"agent"` to diagnostic categories.
- Add `"agent"` to source evidence kinds.
- Add forbidden command patterns for visible commands that would approve agent tool requests, execute agent tools, invoke providers, or send external messages.

Forbidden command examples to cover in tests:

```text
cestus agent approve-tool toolreq_001
cestus agent execute-tool toolreq_001
cestus agent invoke-provider inv_001
```

- [ ] **Step 4: Add Agent provider aggregation**

Modify `packages/local-runtime/src/operator-status.ts`:

- Extend `OperatorStatusProviderSet`:

```ts
readonly agent?: () => Promise<AgentStatusDto>;
```

- Add `buildAgentSection()` and include it in the aggregate section list.
- Add safe action:

```ts
{
  actionId: "action_open_agents",
  label: "Open Agent",
  kind: "navigate",
  target: "agents",
  sourceContract: "agent-status.v1",
  requiresHumanApproval: false,
  mutatesCanonicalState: false,
  externalEffect: false,
  enabled: true
}
```

Agent section metrics:

- `tasks`
- `pending_approvals`
- `active_locks`
- `providers`

Agent state mapping:

- `blocked` if any agent diagnostic severity is error or active legal/export/secret/data-loss lock exists.
- `action-required` if `pendingApprovalCount > 0`.
- `degraded` if any warning diagnostic exists.
- `ready` otherwise.

Modify `packages/local-runtime/src/operator-status-providers.ts` to provide agent status through `defaultLocalAgentRuntimeFactory`.

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npm test -- packages/operator-status/test/contracts.test.ts packages/local-runtime/test/operator-status.test.ts packages/local-runtime/test/operator-status-routes.test.ts
```

Expected:

```text
Test Files  3 passed
```

- [ ] **Step 6: Commit**

Run:

```bash
git add packages/operator-status/src/contracts.ts packages/operator-status/test/contracts.test.ts packages/local-runtime/src/operator-status.ts packages/local-runtime/src/operator-status-providers.ts packages/local-runtime/test/operator-status.test.ts packages/local-runtime/test/operator-status-routes.test.ts
git commit -m "feat: add resident agent operator status"
```

**Acceptance Criteria:**

- Operator status includes an Agent section from the runtime provider.
- Agent safe action only navigates to the Agent workspace.
- Visible command descriptors remain display-only and cannot approve or execute tools.
- Agent provider failures are redacted and degrade the section safely.

**Rollback/Escalation:**

- Escalate if adding the section requires weakening operator safe-action forbiddance.

---

## Task 8: Agent UI And Command Board Surface

**Files:**

- Create: `packages/ui/src/agent/agent-types.ts`
- Create: `packages/ui/src/agent/agent-adapter.ts`
- Create: `packages/ui/src/agent/AgentWorkspace.tsx`
- Modify: `packages/ui/src/App.tsx`
- Modify: `packages/ui/src/workspace/workspace-nav.ts`
- Modify: `packages/ui/src/workspace/command-types.ts`
- Modify: `packages/ui/src/workspace/command-model.ts`
- Modify: `packages/ui/test/command-model.test.ts`
- Create: `packages/ui/test/agent-adapter.test.ts`
- Create: `packages/ui/test/agent-workspace.test.tsx`
- Create: `packages/ui/test/agent-app-integration.test.tsx`
- Modify: `packages/ui/test/app-smoke.test.tsx`
- Modify: `packages/ui/test/operator-app-integration.test.tsx`

- [ ] **Step 1: Write failing UI tests**

Create `packages/ui/test/agent-adapter.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { agentStatusFromJson, createStaticAgentAdapter, runtimeUnavailableAgentStatus } from "../src/agent/agent-adapter.js";

describe("agent UI adapter", () => {
  it("parses agent-status.v1 and freezes browser DTOs", async () => {
    const status = agentStatusFromJson({
      schemaVersion: "agent-status.v1",
      generatedAt: "2026-07-07T21:00:00.000Z",
      providers: [],
      pendingApprovalCount: 0,
      activeLockCount: 0,
      diagnostics: [],
      tasks: [],
      runs: [],
      toolRequests: [],
      activeMemory: [],
      permissions: [],
      locks: []
    });

    await expect(createStaticAgentAdapter(status).loadStatus()).resolves.toMatchObject({
      schemaVersion: "agent-status.v1"
    });
    expect(Object.isFrozen(status)).toBe(true);
  });

  it("redacts unsafe runtime text", () => {
    const status = runtimeUnavailableAgentStatus({ message: "provider failed with bearer raw-value" });
    expect(JSON.stringify(status)).not.toContain("raw-value");
  });
});
```

Create `packages/ui/test/agent-workspace.test.tsx` and `packages/ui/test/agent-app-integration.test.tsx`:

- Agent workspace renders identity, pending approvals, providers, active locks, task history, and memory count from a static adapter.
- Clicking the `Agent` module opens the Agent workspace.
- Command `AgentBrief` uses agent status when supplied and keeps provenance references visible.
- Browser UI does not show buttons for provider transfer, PRR send, legal escalation, destructive repair, or accepted graph review.

- [ ] **Step 2: Run targeted failing tests**

Run:

```bash
npm test -- packages/ui/test/agent-adapter.test.ts packages/ui/test/agent-workspace.test.tsx packages/ui/test/agent-app-integration.test.tsx packages/ui/test/command-model.test.ts
```

Expected before implementation:

```text
Agent UI modules are missing
```

- [ ] **Step 3: Add browser-safe agent DTO adapter**

Create `packages/ui/src/agent/agent-types.ts`:

```ts
export type {
  AgentRuntimeDiagnosticDto,
  AgentStatusDto
} from "../../../agent/src/runtime-types.js";
```

Create `packages/ui/src/agent/agent-adapter.ts`:

- `createHttpAgentAdapter({ baseUrl, authToken, credentials, fetcher })`
- `httpAgentAdapter`
- `createStaticAgentAdapter(dto)`
- `agentStatusFromJson(value)`
- `runtimeUnavailableAgentStatus(input)`

Adapter requirements:

- Fetch `GET /api/agent/status`.
- Parse through a Zod schema exported by `packages/agent/src/runtime-types.ts` or a local DTO schema that mirrors it exactly.
- Redact unsafe strings before schema parsing, following the operator-status adapter pattern.
- Return frozen DTOs.

- [ ] **Step 4: Add Agent workspace**

Create `packages/ui/src/agent/AgentWorkspace.tsx` with:

- Region label `Resident agent workspace`.
- Status metrics for pending approvals, active locks, providers, tasks, and memory.
- A task list with run type and provenance refs.
- A tool request list that displays preview hash, side-effect class, required approval class, and state.
- A provider list showing labels, endpoint kind, model families, and credential kind summaries.
- Diagnostics with redacted messages.

No buttons in this task should approve, deny, execute, send, export, repair, or clear a lock. The only active control may be a refresh callback.

- [ ] **Step 5: Wire App navigation**

Modify `packages/ui/src/workspace/workspace-nav.ts`:

- Change the module label from `Agents Preview` to `Agent`.
- Keep module id `agents`.

Modify `packages/ui/src/App.tsx`:

- Add `agentAdapter?: AgentAdapter` prop with default `httpAgentAdapter`.
- Add `"agents"` to `implementedModuleIds`.
- Load agent status when the active module is `agents`.
- Render `AgentWorkspace` for the Agent module.
- Make operator navigation target `"agents"` select the Agent module.
- Keep Command, Requests, and Ingestion behavior unchanged.

- [ ] **Step 6: Evolve Command AgentBrief**

Modify `packages/ui/src/workspace/command-types.ts`:

- Add optional `agentStatus?: AgentStatusDto` to `CommandBoardInput`.

Modify `packages/ui/src/workspace/command-model.ts`:

- If `agentStatus` exists, derive `agentBrief` from pending approvals, active locks, providers, and recent task titles.
- If `agentStatus` is absent, preserve the existing fixture-derived advisory brief exactly enough for current tests.
- Never copy raw diagnostics into `AgentBrief` without passing safe text from the adapter.

- [ ] **Step 7: Run targeted UI tests**

Run:

```bash
npm test -- packages/ui/test/agent-adapter.test.ts packages/ui/test/agent-workspace.test.tsx packages/ui/test/agent-app-integration.test.tsx packages/ui/test/command-model.test.ts packages/ui/test/app-smoke.test.tsx packages/ui/test/operator-app-integration.test.tsx
```

Expected:

```text
Test Files  6 passed
```

- [ ] **Step 8: Commit**

Run:

```bash
git add packages/ui/src/agent/agent-types.ts packages/ui/src/agent/agent-adapter.ts packages/ui/src/agent/AgentWorkspace.tsx packages/ui/src/App.tsx packages/ui/src/workspace/workspace-nav.ts packages/ui/src/workspace/command-types.ts packages/ui/src/workspace/command-model.ts packages/ui/test/command-model.test.ts packages/ui/test/agent-adapter.test.ts packages/ui/test/agent-workspace.test.tsx packages/ui/test/agent-app-integration.test.tsx packages/ui/test/app-smoke.test.tsx packages/ui/test/operator-app-integration.test.tsx
git commit -m "feat: add resident agent workspace"
```

**Acceptance Criteria:**

- Agent module is first-class, not preview-only.
- UI can render agent status from a fake/local runtime without credentials.
- Command `AgentBrief` can reflect durable resident-agent state.
- UI exposes no hidden execution path for risky tool requests.

**Rollback/Escalation:**

- Escalate if browser UI needs credential values, raw provider errors, or direct access to ledger-writing services.

---

## Task 9: Specialist Registry Guardrails

**Files:**

- Create: `packages/agent/src/specialists.ts`
- Modify: `packages/agent/src/runtime.ts`
- Modify: `packages/agent/src/index.ts`
- Create: `packages/agent/test/specialists.test.ts`

- [ ] **Step 1: Write failing specialist tests**

Create `packages/agent/test/specialists.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { approvedAgentSpecialistRunTypes, specialistExecutionStatusFor } from "../src/specialists.js";

describe("resident agent specialist registry", () => {
  it("registers approved specialist run types under the resident identity", () => {
    expect(approvedAgentSpecialistRunTypes).toEqual([
      "ontology-bootstrap",
      "prr-negotiation",
      "evidence-triage",
      "timeline-builder",
      "contradiction-finder",
      "investigation-planner",
      "report-builder"
    ]);
  });

  it("fails closed for workflow execution that belongs to follow-up plans", () => {
    expect(specialistExecutionStatusFor("ontology-bootstrap")).toEqual({
      enabled: false,
      diagnosticCode: "AGENT_SPECIALIST_WORKFLOW_NOT_ENABLED",
      allowedRepairActions: ["review the approved resident-agent foundation", "create a focused specialist implementation plan"]
    });
  });
});
```

- [ ] **Step 2: Run targeted failing tests**

Run:

```bash
npm test -- packages/agent/test/specialists.test.ts
```

Expected before implementation:

```text
Failed to resolve import "../src/specialists.js"
```

- [ ] **Step 3: Implement specialist registry**

Create `packages/agent/src/specialists.ts`:

```ts
export const approvedAgentSpecialistRunTypes = Object.freeze([
  "ontology-bootstrap",
  "prr-negotiation",
  "evidence-triage",
  "timeline-builder",
  "contradiction-finder",
  "investigation-planner",
  "report-builder"
] as const);

export type AgentSpecialistRunType = typeof approvedAgentSpecialistRunTypes[number];

export function specialistExecutionStatusFor(runType: AgentSpecialistRunType) {
  return Object.freeze({
    enabled: false,
    diagnosticCode: "AGENT_SPECIALIST_WORKFLOW_NOT_ENABLED",
    allowedRepairActions: Object.freeze([
      "review the approved resident-agent foundation",
      "create a focused specialist implementation plan"
    ])
  });
}
```

Modify `packages/agent/src/runtime.ts`:

- Validate `startRun.runType` against `approvedAgentSpecialistRunTypes`.
- Permit creation of `agent.specialist-run.started` for all approved run types.
- Do not execute workflow behavior for any specialist in this foundation slice.

Modify `packages/agent/src/index.ts`:

```ts
export * from "./specialists.js";
```

- [ ] **Step 4: Run targeted tests**

Run:

```bash
npm test -- packages/agent/test/specialists.test.ts packages/agent/test/runtime.test.ts packages/agent/test/projection.test.ts
```

Expected:

```text
Test Files  3 passed
```

- [ ] **Step 5: Commit**

Run:

```bash
git add packages/agent/src/specialists.ts packages/agent/src/runtime.ts packages/agent/src/index.ts packages/agent/test/specialists.test.ts
git commit -m "feat: register resident agent specialist types"
```

**Acceptance Criteria:**

- Approved run types are explicit and stable.
- `ontology-bootstrap` is recognized as a resident-agent workflow type but no legacy bootstrap behavior runs in this foundation slice.
- Unsupported workflow execution fails closed with a safe diagnostic and allowed repair actions.

**Rollback/Escalation:**

- Escalate if registering specialist types tempts implementation of legacy, PRR, report, or investigation workflows inside this foundation branch.

---

## Task 10: Verification And Factory Readiness

**Files:**

- Modify: `scripts/check-agent-readiness.mjs`
- Modify: `docs/agentic/software-factory.md`
- Modify: `docs/superpowers/plans/2026-07-07-cestus-resident-agent-implementation.md`

- [ ] **Step 1: Run focused verification bundle**

Run:

```bash
npm test -- packages/ontology/test/agent-contracts.test.ts packages/ontology/test/contracts.test.ts packages/agent/test/projection.test.ts packages/agent/test/provider.test.ts packages/agent/test/tool-gateway.test.ts packages/agent/test/runtime.test.ts packages/agent/test/specialists.test.ts packages/operator-status/test/contracts.test.ts packages/local-runtime/test/agent-http-routes.test.ts packages/local-runtime/test/operator-status.test.ts packages/local-runtime/test/operator-status-routes.test.ts packages/local-runtime/test/http-handler.test.ts packages/local-runtime/test/cli.test.ts packages/ui/test/agent-adapter.test.ts packages/ui/test/agent-workspace.test.tsx packages/ui/test/agent-app-integration.test.tsx packages/ui/test/command-model.test.ts packages/ui/test/app-smoke.test.tsx packages/ui/test/operator-app-integration.test.tsx
```

Expected:

```text
Test Files  19 passed
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

- [ ] **Step 3: Update readiness tracking if the implementation branch adds final docs**

If `scripts/check-agent-readiness.mjs` does not already track this implementation plan, add:

```text
docs/superpowers/plans/2026-07-07-cestus-resident-agent-implementation.md
```

Append a `Resident Cestus Agent Foundation Implementation Readiness` section to `docs/agentic/software-factory.md` with:

- Design file path.
- Plan file path.
- Targeted command evidence.
- Full verification evidence.
- A statement that the foundation uses fake providers only and preserves all Cestus invariants.

- [ ] **Step 4: Check whitespace**

Run:

```bash
git diff --check
```

Expected:

```text
no output
```

- [ ] **Step 5: Run factory check**

Run:

```bash
npm run factory:check
```

Expected:

```text
factory-readiness passed
```

- [ ] **Step 6: Commit readiness evidence**

Run:

```bash
git add scripts/check-agent-readiness.mjs docs/agentic/software-factory.md docs/superpowers/plans/2026-07-07-cestus-resident-agent-implementation.md
git commit -m "docs: record resident agent foundation readiness"
```

**Acceptance Criteria:**

- Targeted verification and full verification pass.
- Factory readiness tracks the resident-agent implementation plan.
- Factory docs record that live provider adapters and full specialist workflows remain follow-up implementation plans.

**Rollback/Escalation:**

- Escalate if factory readiness fails on a real unfinished marker in tracked files.
- Do not remove readiness checks to pass verification.

---

## Completion Criteria

The resident Cestus Agent foundation is complete when:

- Every task above has a commit.
- `npm run verify` passes.
- `npm run factory:check` passes.
- The one default resident agent identity exists in append-only events.
- Agent projections rebuild status, tasks, runs, tool requests, permissions, locks, model invocations, and memory from ledger events.
- Provider credentials are references only and fake-provider tests need no live credentials.
- Tool approvals are human-bound and preview-hash-bound.
- Local runtime, CLI, operator-status, and UI surfaces expose safe status without hidden risky execution paths.
- Specialist run types are registered and fail closed until focused follow-up plans implement each workflow.
