import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SQLiteEventLedger } from "../../ontology/src/sqlite-event-ledger.js";
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
    const config = resolveLocalRuntimeConfig({ cwd: tempDir(), env: {} });
    const handler = testHandler({ config });
    const response = await handler({ method: "GET", url: "/api/agent/status" });
    const body = JSON.parse(response.body) as {
      readonly schemaVersion: string;
      readonly providers: readonly { readonly providerId: string; readonly modelFamilies: readonly string[] }[];
    };

    expect(response.status).toBe(200);
    expect(body.schemaVersion).toBe("agent-status.v1");
    expect(body.providers).toEqual([
      expect.objectContaining({ providerId: "provider_fake_local", modelFamilies: ["fake-local"] })
    ]);
    expect(response.body).not.toMatch(/sk_live|password|private key|bearer [a-z0-9._-]+/i);
    closeHandler(handler);
    expect(await eventTypes(config)).toEqual([]);
  });

  it("returns pending tool requests from GET /api/agent/tool-requests", async () => {
    const config = resolveLocalRuntimeConfig({ cwd: tempDir(), env: {} });
    const handler = testHandler({ config });
    const response = await handler({ method: "GET", url: "/api/agent/tool-requests" });

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      schemaVersion: "agent-tool-requests.v1",
      generatedAt: "2026-07-07T20:00:00.000Z",
      pendingApprovalCount: 0,
      toolRequests: []
    });
    closeHandler(handler);
    expect(await eventTypes(config)).toEqual([]);
  });

  it("creates a durable task through POST /api/agent/tasks", async () => {
    const cwd = tempDir();
    const config = resolveLocalRuntimeConfig({ cwd, env: {} });
    const first = testHandler({ config });
    const response = await first({
      method: "POST",
      url: "/api/agent/tasks",
      body: JSON.stringify({ taskId: "task_route_001", title: "Inspect resident status", priority: "normal" })
    });

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ ok: true, taskId: "task_route_001" });
    first.close();
    handlers.splice(handlers.indexOf(first), 1);

    const second = testHandler({ config });
    const reloaded = await second({ method: "GET", url: "/api/agent/status" });
    expect(JSON.parse(reloaded.body).tasks.map((task: { readonly taskId: string }) => task.taskId)).toContain(
      "task_route_001"
    );
  });

  it("returns a stable conflict for duplicate task ids", async () => {
    const handler = testHandler();
    const body = JSON.stringify({
      taskId: "task_route_duplicate",
      title: "Inspect duplicate behavior",
      priority: "normal"
    });

    const first = await handler({ method: "POST", url: "/api/agent/tasks", body });
    const second = await handler({ method: "POST", url: "/api/agent/tasks", body });

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(JSON.parse(second.body)).toEqual({
      ok: false,
      diagnostic: {
        message: "Agent task already exists.",
        allowedRepairActions: ["choose a different task id", "refresh agent status"]
      }
    });
  });

  it("returns a stable conflict when duplicate task ids race", async () => {
    const handler = testHandler();
    const warmup = await handler({
      method: "POST",
      url: "/api/agent/tasks",
      body: JSON.stringify({
        taskId: "task_route_warmup",
        title: "Initialize resident identity",
        priority: "normal"
      })
    });
    const body = JSON.stringify({
      taskId: "task_route_concurrent_duplicate",
      title: "Inspect concurrent duplicate behavior",
      priority: "normal"
    });

    const responses = await Promise.all([
      handler({ method: "POST", url: "/api/agent/tasks", body }),
      handler({ method: "POST", url: "/api/agent/tasks", body })
    ]);
    const statuses = responses.map((response) => response.status).sort((left, right) => left - right);
    const conflict = responses.find((response) => response.status === 409);

    expect(warmup.status).toBe(200);
    expect(statuses).toEqual([200, 409]);
    expect(conflict).toBeDefined();
    expect(JSON.parse(conflict?.body ?? "{}")).toEqual({
      ok: false,
      diagnostic: {
        message: "Agent task already exists.",
        allowedRepairActions: ["choose a different task id", "refresh agent status"]
      }
    });
  });

  it("returns a stable conflict when duplicate task ids race on an empty ledger", async () => {
    const handler = testHandler();
    const body = JSON.stringify({
      taskId: "task_route_empty_concurrent_duplicate",
      title: "Inspect empty ledger duplicate behavior",
      priority: "normal"
    });

    const responses = await Promise.all([
      handler({ method: "POST", url: "/api/agent/tasks", body }),
      handler({ method: "POST", url: "/api/agent/tasks", body })
    ]);
    const statuses = responses.map((response) => response.status).sort((left, right) => left - right);
    const conflict = responses.find((response) => response.status === 409);

    expect(statuses).toEqual([200, 409]);
    expect(conflict).toBeDefined();
    expect(JSON.parse(conflict?.body ?? "{}")).toEqual({
      ok: false,
      diagnostic: {
        message: "Agent task already exists.",
        allowedRepairActions: ["choose a different task id", "refresh agent status"]
      }
    });
  });

  it("returns HTTP 400 for invalid task bodies without echoing secret-shaped text", async () => {
    const handler = testHandler();
    const response = await handler({
      method: "POST",
      url: "/api/agent/tasks",
      body: JSON.stringify({
        taskId: "sk_live_unsafe",
        title: "password hunter2",
        priority: "urgent",
        extra: "private key"
      })
    });

    expect(response.status).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      ok: false,
      diagnostic: {
        message: "Agent task body is invalid.",
        allowedRepairActions: ["send taskId, title, and optional priority as a JSON object"]
      }
    });
    expect(response.body).not.toMatch(/sk_live|hunter2|private key/i);
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

function testHandler(input: {
  readonly config?: ReturnType<typeof resolveLocalRuntimeConfig>;
  readonly env?: Record<string, string | undefined>;
} = {}) {
  const config = input.config ?? resolveLocalRuntimeConfig({ cwd: tempDir(), env: input.env ?? {} });
  const handler = createLocalRuntimeHttpHandler({
    config,
    actor: { id: "actor_agent_route", kind: "human", label: "Agent Route Test" },
    now: () => "2026-07-07T20:00:00.000Z"
  });
  handlers.push(handler);
  return handler;
}

function tempDir(): string {
  const cwd = mkdtempSync(join(tmpdir(), "cestus-agent-route-"));
  tempDirs.push(cwd);
  return cwd;
}

function closeHandler(handler: LocalRuntimeHttpHandler): void {
  handler.close();
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
