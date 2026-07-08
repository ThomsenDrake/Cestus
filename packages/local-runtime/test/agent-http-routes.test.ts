import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isAgentSecretSafeText } from "../../agent/src/index.js";
import { SQLiteEventLedger } from "../../ontology/src/sqlite-event-ledger.js";
import { LOCAL_RUNTIME_SESSION_COOKIE_NAME, localRuntimeSessionCookieValue } from "../src/auth.js";
import { resolveLocalRuntimeConfig } from "../src/config.js";
import type { LocalAgentRuntimeFactory } from "../src/agent-runtime-factory.js";
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
    expectAgentStatusBodyToHideRuntimeMaterial(response.body);
    closeHandler(handler);
    expect(await eventTypes(config)).toEqual([]);
  });

  it("can surface a Nous Portal provider descriptor without leaking setup material", async () => {
    const config = resolveLocalRuntimeConfig({ cwd: tempDir(), env: {} });
    const handler = testHandler({ config, agentRuntimeFactory: nousStatusRuntimeFactory() });
    const response = await handler({ method: "GET", url: "/api/agent/status" });
    const body = JSON.parse(response.body) as {
      readonly schemaVersion: string;
      readonly providers: readonly {
        readonly providerId: string;
        readonly endpointKind: string;
        readonly modelFamilies: readonly string[];
      }[];
    };

    expect(response.status).toBe(200);
    expect(body.schemaVersion).toBe("agent-status.v1");
    expect(body.providers).toEqual(expect.arrayContaining([
      expect.objectContaining({ providerId: "provider_fake_local", modelFamilies: ["fake-local"] }),
      expect.objectContaining({
        providerId: "provider_nous_portal",
        endpointKind: "openai-compatible-api",
        modelFamilies: ["tencent/hy3:free"]
      })
    ]));
    expect(response.body).not.toContain("Cestus local runtime prompt artifact");
    expect(response.body).not.toContain(providerSetupSentinel());
    expectAgentStatusBodyToHideRuntimeMaterial(response.body);
    closeHandler(handler);
    expect(await eventTypes(config)).toEqual([]);
  });

  it("includes provider readiness in agent status for configured Nous", async () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, ".env"), ["CESTUS_AGENT_NOUS_API_KEY=runtime-provider-material"].join("\n"));
    const config = resolveLocalRuntimeConfig({ cwd, env: {} });
    const handler = testHandler({ config });

    const response = await handler({ method: "GET", url: "/api/agent/status" });
    const body = JSON.parse(response.body) as {
      readonly providerReadiness?: {
        readonly cards: ReadonlyArray<{
          readonly providerId: string;
          readonly credentialHealth: string;
          readonly dataHandlingPosture: string;
        }>;
      };
    };

    expect(response.status).toBe(200);
    expect(body.providerReadiness?.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        providerId: "provider_nous_portal",
        credentialHealth: "local-binding-healthy",
        dataHandlingPosture: "remote-prompt-byte-transfer-gated"
      })
    ]));
    expect(response.body).not.toMatch(/runtime-provider-material|authorization:\s*bearer|provider error|response body/i);
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
        taskId: "task_route_invalid_shape",
        title: "invalid task shape sentinel",
        priority: "urgent",
        extra: "invalid extra sentinel"
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
    expect(response.body).not.toContain("invalid task shape sentinel");
    expect(response.body).not.toContain("invalid extra sentinel");
    expect(isAgentSecretSafeText(response.body)).toBe(true);
  });

  it("uses existing auth policy for protected agent routes", async () => {
    const config = protectedConfig();
    const handler = testHandler({ config });
    const sessionCookie = localRuntimeSessionCookieValue(config);
    expect(sessionCookie).toBeDefined();

    const rejected = await handler({ method: "GET", url: "/api/agent/status" });
    const accepted = await handler({
      method: "GET",
      url: "/api/agent/status",
      headers: {
        cookie: `${LOCAL_RUNTIME_SESSION_COOKIE_NAME}=${sessionCookie}`
      }
    });

    expect(rejected.status).toBe(401);
    expect(accepted.status).toBe(200);
    expect(rejected.body).not.toContain(routeSessionSentinel());
    expect(accepted.body).not.toContain(routeSessionSentinel());
    expect(isAgentSecretSafeText(rejected.body)).toBe(true);
    expectAgentStatusBodyToHideRuntimeMaterial(accepted.body);
  });
});

function testHandler(input: {
  readonly config?: ReturnType<typeof resolveLocalRuntimeConfig>;
  readonly env?: Record<string, string | undefined>;
  readonly agentRuntimeFactory?: LocalAgentRuntimeFactory;
} = {}) {
  const config = input.config ?? resolveLocalRuntimeConfig({ cwd: tempDir(), env: input.env ?? {} });
  const handler = createLocalRuntimeHttpHandler({
    config,
    actor: { id: "actor_agent_route", kind: "human", label: "Agent Route Test" },
    now: () => "2026-07-07T20:00:00.000Z",
    ...(input.agentRuntimeFactory === undefined ? {} : { agentRuntimeFactory: input.agentRuntimeFactory })
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

function protectedConfig(): ReturnType<typeof resolveLocalRuntimeConfig> {
  const cwd = tempDir();
  return {
    cwd,
    storage: {
      strategy: "repo-local",
      sqlitePath: join(cwd, ".cestus", "local", "prr-ledger.sqlite")
    },
    http: {
      host: "0.0.0.0",
      port: 8787,
      bindMode: "lan",
      authRequired: true,
      authToken: routeSessionSentinel(),
      devSeedEnabled: false
    },
    staticUi: { distDir: join(cwd, "dist") },
    logs: { dir: join(cwd, ".cestus", "local", "logs") }
  };
}

function nousStatusRuntimeFactory(): LocalAgentRuntimeFactory {
  return (() => ({
    status: async () => ({
      schemaVersion: "agent-status.v1",
      generatedAt: "2026-07-07T20:00:00.000Z",
      identity: undefined,
      tasks: [],
      runs: [],
      toolRequests: [],
      permissions: [],
      locks: [],
      memories: [],
      modelInvocations: [],
      providerReadiness: undefined,
      providers: [
        {
          providerId: "provider_fake_local",
          label: "Fake Local Model Provider",
          adapterVersion: "fake-provider.v1",
          endpointKind: "local-engine",
          modelFamilies: ["fake-local"],
          credentialKinds: ["local-no-secret"],
          supportsStructuredOutput: false,
          supportsToolCalling: false,
          safeDataNotes: "Deterministic local fake provider."
        },
        {
          providerId: "provider_nous_portal",
          label: "Nous Portal",
          adapterVersion: "openai-compatible-chat.v1",
          endpointKind: "openai-compatible-api",
          modelFamilies: ["tencent/hy3:free"],
          credentialKinds: [],
          supportsStructuredOutput: false,
          supportsToolCalling: false,
          safeDataNotes: "Remote model provider used only with approved prompt artifacts."
        }
      ],
      pendingApprovalCount: 0,
      activeLockCount: 0,
      diagnostics: []
    }),
    initializeDefaultIdentity: async () => ({ ok: true, residentAgentId: "agent_default", alreadyInitialized: false, eventIds: [] }),
    createTask: async () => ({ ok: true, taskId: "task_route", eventIds: [] }),
    startRun: async () => ({ ok: true, runId: "run_route", eventIds: [] }),
    invokeModel: async () => ({ ok: false, error: { severity: "error", category: "provider", message: "unused" } }),
    gateway: {}
  })) as unknown as LocalAgentRuntimeFactory;
}

function providerSetupSentinel(): string {
  return "provider-setup-sentinel";
}

function routeSessionSentinel(): string {
  return "route-session-sentinel";
}

function expectAgentStatusBodyToHideRuntimeMaterial(body: string): void {
  expect(body).not.toContain(providerSetupSentinel());
  expect(body).not.toContain(routeSessionSentinel());
  expect(body).not.toMatch(/runtime-provider-material|authorization:\s*bearer|provider error|response body|private key|password=|secret=/i);
}
