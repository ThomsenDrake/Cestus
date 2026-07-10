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
  private readCalls = 0;
  constructor(private readonly streamEvents: readonly KnowledgeEvent[]) {}

  async append(): Promise<KnowledgeEvent> {
    this.appendCalls += 1;
    throw new Error("Concurrency conflict for agent_identity_agent_default: expected sequence 1, next sequence 2");
  }

  async readStream(): Promise<KnowledgeEvent[]> {
    this.readCalls += 1;
    if (this.readCalls === 1) {
      return [];
    }
    return [...this.streamEvents];
  }

  async readAll(): Promise<KnowledgeEvent[]> {
    return [...this.streamEvents];
  }
}
