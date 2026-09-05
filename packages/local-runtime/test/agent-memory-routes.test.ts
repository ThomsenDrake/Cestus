import { createAuthenticatedTestHandler as createLocalRuntimeHttpHandler } from "./support/authenticated-handler.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SQLiteEventLedger } from "../../ontology/src/sqlite-event-ledger.js";
import { createPortableWorkspace } from "../../workspace/src/index.js";
import { resolveLocalRuntimeConfig } from "../src/config.js";
import { type LocalRuntimeHttpHandler } from "../src/http-handler.js";

const handlers: LocalRuntimeHttpHandler[] = [];
const tempDirs: string[] = [];

afterEach(async () => {
  for (const handler of handlers.splice(0)) {
    await handler.close();
  }
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("agent memory HTTP routes", () => {
  it("records, lists, supersedes, details, and retracts memory without hidden effects", async () => {
    const config = portableConfig("ws_memory_route");
    const handler = testHandler({ config });
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
    const list = JSON.parse(listed.body) as {
      readonly schemaVersion: string;
      readonly items: readonly { readonly memoryId: string; readonly state: string }[];
    };
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
    const statusBody = JSON.parse(status.body) as {
      readonly modelInvocations: readonly unknown[];
      readonly toolRequests: readonly unknown[];
    };
    const eventTypes = await eventTypesFromLedger(config);
    expect(eventTypes).not.toEqual(
      expect.arrayContaining([
        "assertion.accepted",
        "entity.resolved",
        "relationship.accepted",
        "prr.request.sent",
        "export.generated",
        "agent.lock.cleared",
        "incident.repair.recorded",
        "legacy.import.report.generated",
        "legacy.ontology.staging.approved"
      ])
    );
    expect(eventTypes.some((eventType) => eventType.startsWith("agent.model-invocation."))).toBe(false);
    expect(statusBody.modelInvocations).toEqual([]);
    expect(statusBody.toolRequests).toEqual([]);
  });

  it("rejects unsafe or unproven memory bodies without echoing source text", async () => {
    const config = resolveLocalRuntimeConfig({ cwd: tempDir(), env: {} });
    const handler = testHandler({ config });
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
    await closeHandler(handler);
    expect(await eventTypes(config)).toEqual([]);
  });

  it("requires a human actor for HTTP memory correction routes", async () => {
    const handler = testHandler({ actor: { id: "actor_runtime_system", kind: "system", label: "Runtime System" } });
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
  readonly config?: ReturnType<typeof resolveLocalRuntimeConfig>;
  readonly actor?: { readonly id: string; readonly kind: "human" | "system"; readonly label: string };
} = {}) {
  const config = input.config ?? resolveLocalRuntimeConfig({ cwd: tempDir(), env: {} });
  const handler = createLocalRuntimeHttpHandler({
    config,
    actor: input.actor ?? { id: "actor_case_owner", kind: "human", label: "Case Owner" },
    now: () => "2026-07-09T14:00:00.000Z"
  });
  handlers.push(handler);
  return handler;
}

function tempDir(): string {
  const cwd = mkdtempSync(join(tmpdir(), "cestus-agent-memory-route-"));
  tempDirs.push(cwd);
  return cwd;
}

function portableConfig(workspaceId: string): ReturnType<typeof resolveLocalRuntimeConfig> {
  const cwd = tempDir();
  const workspaceRoot = join(cwd, workspaceId);
  createPortableWorkspace({
    rootDir: workspaceRoot,
    workspaceId,
    label: `Workspace ${workspaceId}`,
    createdAt: "2026-07-10T12:00:00.000Z",
    createdBy: "agent-memory-route-test"
  });
  return resolveLocalRuntimeConfig({
    cwd,
    env: {
      CESTUS_LOCAL_STORAGE: "portable-workspace",
      CESTUS_WORKSPACE_ROOT: workspaceRoot
    }
  });
}

async function closeHandler(handler: LocalRuntimeHttpHandler): Promise<void> {
  await handler.close();
  const index = handlers.indexOf(handler);
  if (index >= 0) {
    handlers.splice(index, 1);
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

const eventTypesFromLedger = eventTypes;
