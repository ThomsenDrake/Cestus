import { describe, expect, it } from "vitest";
import type { AppendableKnowledgeEvent, KnowledgeEvent } from "../../ontology/src/contracts.js";
import { InMemoryEventLedger, type AppendOptions, type EventLedger } from "../../ontology/src/event-ledger.js";
import { createAgentRuntime } from "../src/runtime.js";
import type {
  AgentMemoryMutationResult,
  RecordAgentMemoryInput,
  RetractAgentMemoryInput,
  SupersedeAgentMemoryInput
} from "../src/runtime-types.js";

const humanActor = { id: "actor_case_owner", kind: "human" as const, label: "Case Owner" };
const agentActor = { id: "actor_cestus_agent", kind: "agent" as const, label: "Cestus Agent" };
const now = () => "2026-07-09T13:00:00.000Z";
const compileTimeMemoryCommandCoverage = {
  record: {
    memoryId: "mem_compile_record",
    scope: "workspace",
    summary: "Compile-time record coverage.",
    confidence: 0.7
  } satisfies RecordAgentMemoryInput,
  supersede: {
    memoryId: "mem_compile_old",
    supersededByMemoryId: "mem_compile_new",
    scope: "workspace",
    summary: "Compile-time supersede coverage.",
    confidence: 0.8,
    rationale: "Compile-time coverage."
  } satisfies SupersedeAgentMemoryInput,
  retract: {
    memoryId: "mem_compile_old",
    rationale: "Compile-time coverage."
  } satisfies RetractAgentMemoryInput,
  result: {
    memoryId: "mem_compile_result",
    eventIds: ["evt_compile_memory"]
  } satisfies AgentMemoryMutationResult
} as const;

void compileTimeMemoryCommandCoverage;

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

  it("rejects operator preference memory from agent actors without appending a memory event", async () => {
    const ledger = new InMemoryEventLedger();
    const runtime = createAgentRuntime({ ledger, actor: agentActor, now });
    await runtime.initializeDefaultIdentity({ workspaceId: "ws_case_001" });

    const result = await runtime.recordMemory({
      memoryId: "mem_agent_preference",
      scope: "workspace",
      memoryKind: "operator-preference",
      summary: "Operator prefers source-linked summaries.",
      sourceEventIds: ["evt_agent_task_created"],
      confidence: 0.88
    });

    expect(result).toMatchObject({ ok: false, error: { category: "agent" } });
    expect(await ledger.readAll()).toHaveLength(1);
    expect((await runtime.listMemory({ state: "all" })).items).toEqual([]);
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

  it("rejects agent supersession of a human-created operator preference without appending mutation events", async () => {
    const ledger = new InMemoryEventLedger();
    const humanRuntime = createAgentRuntime({ ledger, actor: humanActor, now });
    await humanRuntime.initializeDefaultIdentity({ workspaceId: "ws_case_001" });
    await humanRuntime.recordMemory({
      memoryId: "mem_operator_preference",
      scope: "workspace",
      memoryKind: "operator-preference",
      summary: "Case owner prefers terse summaries.",
      sourceEventIds: ["evt_agent_task_created"],
      confidence: 0.9
    });

    const runtime = createAgentRuntime({ ledger, actor: agentActor, now });
    const beforeEvents = await ledger.readAll();

    const result = await runtime.supersedeMemory({
      memoryId: "mem_operator_preference",
      supersededByMemoryId: "mem_agent_attempt",
      scope: "workspace",
      memoryKind: "agent-observation",
      summary: "Agent tried to replace the operator preference.",
      sourceEventIds: ["evt_agent_task_updated"],
      confidence: 0.7,
      rationale: "Agent guessed at an operator preference."
    });

    expect(result).toMatchObject({ ok: false, error: { category: "agent" } });
    expect(await ledger.readAll()).toEqual(beforeEvents);
    expect((await runtime.listMemory({ state: "all" })).items).toHaveLength(1);
    expect((await runtime.listMemory({ state: "all" })).items[0]).toMatchObject({
      memoryId: "mem_operator_preference",
      state: "active"
    });
  });

  it("rejects agent supersession into an operator preference without appending mutation events", async () => {
    const ledger = new InMemoryEventLedger();
    const humanRuntime = createAgentRuntime({ ledger, actor: humanActor, now });
    await humanRuntime.initializeDefaultIdentity({ workspaceId: "ws_case_001" });
    await humanRuntime.recordMemory({
      memoryId: "mem_agent_observation",
      scope: "workspace",
      memoryKind: "agent-observation",
      summary: "Investigation notes currently prefer source-linked summaries.",
      sourceEventIds: ["evt_agent_task_created"],
      confidence: 0.72
    });

    const runtime = createAgentRuntime({ ledger, actor: agentActor, now });
    const beforeEvents = await ledger.readAll();

    const result = await runtime.supersedeMemory({
      memoryId: "mem_agent_observation",
      supersededByMemoryId: "mem_agent_preference_attempt",
      scope: "workspace",
      memoryKind: "operator-preference",
      summary: "Operator prefers source-linked summaries.",
      sourceEventIds: ["evt_agent_task_updated"],
      confidence: 0.7,
      rationale: "Agent tried to turn an observation into an operator preference."
    });

    expect(result).toMatchObject({ ok: false, error: { category: "agent" } });
    expect(await ledger.readAll()).toEqual(beforeEvents);
    expect((await runtime.listMemory({ state: "all" })).items).toHaveLength(1);
    expect((await runtime.listMemory({ state: "all" })).items[0]).toMatchObject({
      memoryId: "mem_agent_observation",
      memoryKind: "agent-observation",
      state: "active"
    });
  });

  it("rejects agent retraction of a human-created operator preference without appending mutation events", async () => {
    const ledger = new InMemoryEventLedger();
    const humanRuntime = createAgentRuntime({ ledger, actor: humanActor, now });
    await humanRuntime.initializeDefaultIdentity({ workspaceId: "ws_case_001" });
    await humanRuntime.recordMemory({
      memoryId: "mem_operator_preference",
      scope: "workspace",
      memoryKind: "operator-preference",
      summary: "Case owner prefers terse summaries.",
      sourceEventIds: ["evt_agent_task_created"],
      confidence: 0.9
    });

    const runtime = createAgentRuntime({ ledger, actor: agentActor, now });
    const beforeEvents = await ledger.readAll();

    const result = await runtime.retractMemory({
      memoryId: "mem_operator_preference",
      rationale: "Agent tried to remove the operator preference."
    });

    expect(result).toMatchObject({ ok: false, error: { category: "agent" } });
    expect(await ledger.readAll()).toEqual(beforeEvents);
    expect((await runtime.listMemory({ state: "all" })).items).toHaveLength(1);
    expect((await runtime.listMemory({ state: "all" })).items[0]).toMatchObject({
      memoryId: "mem_operator_preference",
      state: "active"
    });
  });

  it("retracts the replacement memory if supersession fails after the replacement append", async () => {
    const ledger = new FailOriginalMemorySupersessionLedger("mem_original_context");
    const runtime = createAgentRuntime({ ledger, actor: humanActor, now });
    await runtime.initializeDefaultIdentity({ workspaceId: "ws_case_001" });
    await runtime.recordMemory({
      memoryId: "mem_original_context",
      scope: "workspace",
      memoryKind: "operator-preference",
      summary: "Case owner prefers terse summaries.",
      sourceEventIds: ["evt_agent_task_created"],
      confidence: 0.9
    });

    const result = await runtime.supersedeMemory({
      memoryId: "mem_original_context",
      supersededByMemoryId: "mem_replacement_context",
      scope: "workspace",
      memoryKind: "operator-preference",
      summary: "Case owner prefers concise summaries with source IDs.",
      sourceEventIds: ["evt_agent_task_updated"],
      confidence: 0.95,
      rationale: "Preference clarified during review."
    });

    expect(result).toMatchObject({ ok: false, error: { category: "agent" } });
    const events = await ledger.readAll();
    expect(events.map((event) => event.type)).toEqual([
      "agent.identity.initialized",
      "agent.memory.recorded",
      "agent.memory.recorded",
      "agent.memory.retracted"
    ]);

    const list = await runtime.listMemory({ state: "all" });
    expect(list.items.find((item) => item.memoryId === "mem_original_context")?.state).toBe("active");
    expect(list.items.find((item) => item.memoryId === "mem_replacement_context")?.state).toBe("retracted");
  });

  it("surfaces a runtime partial-write diagnostic if supersession compensation also fails", async () => {
    const ledger = new FailSupersessionCompensationLedger("mem_original_context", "mem_replacement_context");
    const runtime = createAgentRuntime({ ledger, actor: humanActor, now });
    await runtime.initializeDefaultIdentity({ workspaceId: "ws_case_001" });
    await runtime.recordMemory({
      memoryId: "mem_original_context",
      scope: "workspace",
      memoryKind: "operator-preference",
      summary: "Case owner prefers terse summaries.",
      sourceEventIds: ["evt_agent_task_created"],
      confidence: 0.9
    });

    const result = await runtime.supersedeMemory({
      memoryId: "mem_original_context",
      supersededByMemoryId: "mem_replacement_context",
      scope: "workspace",
      memoryKind: "operator-preference",
      summary: "Case owner prefers concise summaries with source IDs.",
      sourceEventIds: ["evt_agent_task_updated"],
      confidence: 0.95,
      rationale: "Preference clarified during review."
    });

    expect(result).toMatchObject({ ok: false, error: { category: "runtime" } });
    expect(result.ok ? undefined : result.error.message).toMatch(/partially applied/i);
    expect(result.ok ? undefined : result.error.message).toMatch(/operator review|retraction/i);
    expect(JSON.stringify(result)).not.toContain("Case owner prefers concise summaries with source IDs.");

    const events = await ledger.readAll();
    expect(events.map((event) => event.type)).toEqual([
      "agent.identity.initialized",
      "agent.memory.recorded",
      "agent.memory.recorded"
    ]);

    const list = await runtime.listMemory({ state: "all" });
    expect(list.items.find((item) => item.memoryId === "mem_original_context")?.state).toBe("active");
    expect(list.items.find((item) => item.memoryId === "mem_replacement_context")?.state).toBe("active");
  });
});

function unsafeCredentialText(): string {
  return `${"bear" + "er"} unsafe-memory-value`;
}

class FailOriginalMemorySupersessionLedger implements EventLedger {
  private readonly ledger = new InMemoryEventLedger();
  private didFailSupersession = false;

  constructor(private readonly memoryId: string) {}

  async append(event: AppendableKnowledgeEvent, options?: AppendOptions): Promise<KnowledgeEvent> {
    if (
      !this.didFailSupersession &&
      event.type === "agent.memory.superseded" &&
      event.payload.memoryId === this.memoryId
    ) {
      this.didFailSupersession = true;
      throw new Error("injected supersession append failure");
    }

    return this.ledger.append(event, options);
  }

  async readStream(streamId: string): Promise<KnowledgeEvent[]> {
    return this.ledger.readStream(streamId);
  }

  async readAll(): Promise<KnowledgeEvent[]> {
    return this.ledger.readAll();
  }
}

class FailSupersessionCompensationLedger implements EventLedger {
  private readonly ledger = new InMemoryEventLedger();
  private didFailSupersession = false;
  private didFailCompensation = false;

  constructor(
    private readonly originalMemoryId: string,
    private readonly replacementMemoryId: string
  ) {}

  async append(event: AppendableKnowledgeEvent, options?: AppendOptions): Promise<KnowledgeEvent> {
    if (
      !this.didFailSupersession &&
      event.type === "agent.memory.superseded" &&
      event.payload.memoryId === this.originalMemoryId
    ) {
      this.didFailSupersession = true;
      throw new Error("injected supersession append failure");
    }

    if (
      this.didFailSupersession &&
      !this.didFailCompensation &&
      event.type === "agent.memory.retracted" &&
      event.payload.memoryId === this.replacementMemoryId
    ) {
      this.didFailCompensation = true;
      throw new Error("injected compensation append failure");
    }

    return this.ledger.append(event, options);
  }

  async readStream(streamId: string): Promise<KnowledgeEvent[]> {
    return this.ledger.readStream(streamId);
  }

  async readAll(): Promise<KnowledgeEvent[]> {
    return this.ledger.readAll();
  }
}
