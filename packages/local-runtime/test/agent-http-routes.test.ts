import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createAgentToolGateway,
  hashAgentToolPreview,
  isAgentSecretSafeText,
  type AgentApprovedToolExecutorDescriptor,
  type AgentToolPreview
} from "../../agent/src/index.js";
import { SQLiteEventLedger } from "../../ontology/src/sqlite-event-ledger.js";
import { createPortableWorkspace } from "../../workspace/src/index.js";
import { LOCAL_RUNTIME_SESSION_COOKIE_NAME, localRuntimeSessionCookieValue } from "../src/auth.js";
import { resolveLocalRuntimeConfig } from "../src/config.js";
import {
  defaultLocalAgentRuntimeFactory,
  type LocalAgentRuntimeFactory
} from "../src/agent-runtime-factory.js";
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
      readonly identityLifecycle: { readonly state: string };
    };

    expect(response.status).toBe(200);
    expect(body.schemaVersion).toBe("agent-status.v1");
    expect(body.identityLifecycle.state).toBe("not-mounted");
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
    const config = portableConfig("ws_task_route");
    const first = testHandler({ config });
    const response = await first({
      method: "POST",
      url: "/api/agent/tasks",
      body: JSON.stringify({
        taskId: "task_route_001",
        title: "Inspect resident status",
        priority: "normal",
        description: "Check readiness before handing work to the resident agent."
      })
    });

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ ok: true, taskId: "task_route_001" });
    first.close();
    handlers.splice(handlers.indexOf(first), 1);

    const second = testHandler({ config });
    const reloaded = await second({ method: "GET", url: "/api/agent/status" });
    expect(JSON.parse(reloaded.body).tasks).toContainEqual(expect.objectContaining({
      taskId: "task_route_001",
      description: "Check readiness before handing work to the resident agent."
    }));
  });

  it("accepts and persists urgent task priority through POST /api/agent/tasks", async () => {
    const config = portableConfig("ws_task_urgent");
    const first = testHandler({ config });
    const response = await first({
      method: "POST",
      url: "/api/agent/tasks",
      body: JSON.stringify({
        taskId: "task_route_urgent",
        title: "Inspect urgent resident status",
        priority: "urgent",
        description: "Handle a time-sensitive task handoff."
      })
    });

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ ok: true, taskId: "task_route_urgent" });
    first.close();
    handlers.splice(handlers.indexOf(first), 1);

    const second = testHandler({ config });
    const reloaded = await second({ method: "GET", url: "/api/agent/status" });
    expect(JSON.parse(reloaded.body).tasks).toContainEqual(expect.objectContaining({
      taskId: "task_route_urgent",
      priority: "urgent",
      description: "Handle a time-sensitive task handoff."
    }));
  });

  it("returns a stable conflict for duplicate task ids", async () => {
    const handler = testHandler({ config: portableConfig("ws_task_duplicate") });
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
    const handler = testHandler({ config: portableConfig("ws_task_race") });
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
    const handler = testHandler({ config: portableConfig("ws_task_empty_race") });
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

  it("wakes the resident agent scheduler without accepting tool input", async () => {
    const { handler } = await seededApprovedToolHandler();
    const emptyObject = await seededApprovedToolHandler("toolreq_scheduler_route_empty_object");

    const rejected = await handler({
      method: "POST",
      url: "/api/agent/scheduler/wake",
      body: JSON.stringify({ toolRequestId: "toolreq_must_not_be_routed" })
    });
    const accepted = await handler({
      method: "POST",
      url: "/api/agent/scheduler/wake"
    });
    const acceptedEmptyObject = await emptyObject.handler({
      method: "POST",
      url: "/api/agent/scheduler/wake",
      body: JSON.stringify({})
    });

    expect(rejected.status).toBe(400);
    expect(accepted.status).toBe(200);
    expect(acceptedEmptyObject.status).toBe(200);
    const body = JSON.parse(accepted.body) as {
      readonly schemaVersion: string;
      readonly examinedCount: number;
      readonly completedCount: number;
      readonly eventIds: readonly string[];
    };
    expect(body.schemaVersion).toBe("agent-scheduler-wake-result.v1");
    expect(body.examinedCount).toBe(1);
    expect(body.completedCount).toBe(1);
    expect(body.eventIds).toEqual(expect.arrayContaining([expect.stringMatching(/^evt_/)]));
    expect(accepted.body).not.toMatch(/prr\.request\.sent|legal-escalation|accepted graph|provider byte transfer/i);
  });

  it("does not double-execute an approved descriptor across concurrent scheduler wake posts", async () => {
    const previewBarrier = createBarrier(2);
    let executions = 0;
    const { handler, config } = await seededApprovedToolHandler(
      "toolreq_scheduler_route_concurrent_claim",
      (preview) => schedulerWakeDescriptor(preview, {
        async buildCurrentPreview() {
          await previewBarrier.arrive();
          return {
            preview,
            sourceEventIds: ["evt_source_route_review"],
            inputArtifactHashes: [schedulerWakeArtifactHash()],
            provenanceRefs: ["evt_source_route_review", schedulerWakeArtifactHash()],
            activeLocks: [],
            freshnessChecks: [{
              name: "agent-projection",
              expected: "high-watermark:1",
              actual: "high-watermark:1",
              ok: true
            }]
          };
        },
        async executeApproved() {
          executions += 1;
          await Promise.resolve();
          return {
            eventIds: ["evt_scheduler_route_domain_completed"],
            artifactHashes: [schedulerWakeArtifactHash()],
            readModelChanges: [{
              projectionName: "agent-route-test",
              change: "scheduler wake route completed approved work"
            }],
            resultSummary: "Scheduler wake route completed approved work."
          };
        }
      })
    );

    const responses = await Promise.all([
      handler({ method: "POST", url: "/api/agent/scheduler/wake" }),
      handler({ method: "POST", url: "/api/agent/scheduler/wake" })
    ]);

    expect(responses.map((response) => response.status).sort((left, right) => left - right)).toEqual([200, 200]);
    const bodies = responses.map((response) => JSON.parse(response.body) as {
      readonly completedCount: number;
      readonly failedCount: number;
      readonly items: readonly { readonly state: string; readonly eventIds: readonly string[] }[];
    });
    const items = bodies.flatMap((body) => body.items);
    const types = await eventTypes(config);
    expect(executions).toBe(1);
    expect(bodies.reduce((sum, body) => sum + body.completedCount, 0)).toBe(1);
    expect(bodies.reduce((sum, body) => sum + body.failedCount, 0)).toBe(0);
    expect(items.filter((item) => item.state === "completed")).toHaveLength(1);
    expect(items.filter((item) => item.state === "not-ready" || item.state === "blocked")).toHaveLength(1);
    expect(items.find((item) => item.state === "completed")?.eventIds).toHaveLength(2);
    expect(types.filter((type) => type === "agent.tool.execution.claimed")).toHaveLength(1);
    expect(types.filter((type) => type === "agent.tool.completed")).toHaveLength(1);
  });

  it("uses existing auth policy for scheduler wake routes", async () => {
    const handler = testHandler({
      env: {
        CESTUS_LOCAL_BIND: "lan",
        CESTUS_LOCAL_AUTH_TOKEN: "route-secret"
      }
    });

    const rejected = await handler({ method: "POST", url: "/api/agent/scheduler/wake" });
    const accepted = await handler({
      method: "POST",
      url: "/api/agent/scheduler/wake",
      headers: { authorization: "Bearer route-secret" }
    });

    expect(rejected.status).toBe(401);
    expect(accepted.status).toBe(200);
  });

  it("uses existing auth policy for protected agent routes", async () => {
    const config = protectedConfig();
    const handler = testHandler({ config });
    const sessionCookie = localRuntimeSessionCookieValue(config);
    expect(sessionCookie).toBeDefined();

    const rejected = await handler({ method: "GET", url: "/api/agent/status" });
    const rejectedCockpit = await handler({ method: "GET", url: "/api/agent/cockpit" });
    const accepted = await handler({
      method: "GET",
      url: "/api/agent/status",
      headers: {
        cookie: `${LOCAL_RUNTIME_SESSION_COOKIE_NAME}=${sessionCookie}`
      }
    });
    const acceptedCockpit = await handler({
      method: "GET",
      url: "/api/agent/cockpit",
      headers: {
        cookie: `${LOCAL_RUNTIME_SESSION_COOKIE_NAME}=${sessionCookie}`
      }
    });

    expect(rejected.status).toBe(401);
    expect(rejectedCockpit.status).toBe(401);
    expect(accepted.status).toBe(200);
    expect(acceptedCockpit.status).toBe(200);
    expect(rejected.body).not.toContain(routeSessionSentinel());
    expect(rejectedCockpit.body).not.toContain(routeSessionSentinel());
    expect(accepted.body).not.toContain(routeSessionSentinel());
    expect(acceptedCockpit.body).not.toContain(routeSessionSentinel());
    expect(isAgentSecretSafeText(rejected.body)).toBe(true);
    expect(isAgentSecretSafeText(rejectedCockpit.body)).toBe(true);
    expectAgentStatusBodyToHideRuntimeMaterial(accepted.body);
    expectAgentStatusBodyToHideRuntimeMaterial(acceptedCockpit.body);
  });

  it("applies the same auth policy to agent memory routes", async () => {
    const config = protectedConfig();
    const handler = testHandler({ config });
    const sessionCookie = localRuntimeSessionCookieValue(config);
    expect(sessionCookie).toBeDefined();

    const rejected = await handler({ method: "GET", url: "/api/agent/memory" });
    const accepted = await handler({
      method: "GET",
      url: "/api/agent/memory",
      headers: {
        cookie: `${LOCAL_RUNTIME_SESSION_COOKIE_NAME}=${sessionCookie}`
      }
    });

    expect(rejected.status).toBe(401);
    expect(accepted.status).toBe(200);
    expect(rejected.body).not.toContain(routeSessionSentinel());
    expect(accepted.body).not.toContain(routeSessionSentinel());
    expect(isAgentSecretSafeText(rejected.body)).toBe(true);
  });

  it("preserves safe runtime diagnostics for memory validation failures", async () => {
    const handler = testHandler({
      config: portableConfig("ws_memory_validation"),
      agentRuntimeFactory: memoryValidationFailureRuntimeFactory()
    });
    const response = await handler({
      method: "POST",
      url: "/api/agent/memory",
      body: JSON.stringify({
        memoryId: "mem_route_diagnostic",
        scope: "workspace",
        memoryKind: "agent-observation",
        summary: "Source text sentinel that must not echo back.",
        sourceEventIds: ["evt_route_diagnostic"],
        confidence: 0.8
      })
    });

    expect(response.status).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      ok: false,
      diagnostic: {
        message: "Memory could not be recorded safely.",
        allowedRepairActions: ["review memory provenance and safe summary"]
      }
    });
    expect(response.body).not.toContain("Source text sentinel that must not echo back.");
    expect(response.body).not.toContain("evt_route_diagnostic");
    expect(isAgentSecretSafeText(response.body)).toBe(true);
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

function portableConfig(workspaceId: string): ReturnType<typeof resolveLocalRuntimeConfig> {
  const cwd = tempDir();
  const workspaceRoot = join(cwd, workspaceId);
  createPortableWorkspace({
    rootDir: workspaceRoot,
    workspaceId,
    label: `Workspace ${workspaceId}`,
    createdAt: "2026-07-10T12:00:00.000Z",
    createdBy: "agent-route-test"
  });
  return resolveLocalRuntimeConfig({
    cwd,
    env: {
      CESTUS_LOCAL_STORAGE: "portable-workspace",
      CESTUS_WORKSPACE_ROOT: workspaceRoot
    }
  });
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

async function seededApprovedToolHandler(
  toolRequestId = "toolreq_scheduler_route",
  descriptorFactory: (preview: AgentToolPreview) => AgentApprovedToolExecutorDescriptor = schedulerWakeDescriptor
) {
  const config = resolveLocalRuntimeConfig({ cwd: tempDir(), env: {} });
  const preview = schedulerWakePreview(toolRequestId);
  const previewHash = hashAgentToolPreview(preview);
  const ledger = new SQLiteEventLedger(config.storage.sqlitePath);
  try {
    const gateway = createAgentToolGateway({
      ledger,
      actor: { id: "actor_cestus_agent", kind: "agent", label: "Cestus Agent" },
      now: () => "2026-07-07T20:00:00.000Z"
    });
    await gateway.requestTool({
      toolRequestId,
      residentAgentId: "agent_default",
      taskId: "task_scheduler_route",
      runId: "run_scheduler_route",
      toolId: "agent.test.route-wake",
      toolVersion: "1.0.0",
      sideEffectClass: "ledger-review",
      requiredApprovalClass: "ledger-review",
      preview
    });
    await gateway.approveTool({
      toolRequestId,
      actor: { id: "actor_case_owner", kind: "human", label: "Case Owner" },
      approvedPreviewHash: previewHash,
      rationale: "Approved exact scheduler route preview."
    });
  } finally {
    ledger.close();
  }

  return {
    config,
    handler: testHandler({
      config,
      agentRuntimeFactory: (input) => defaultLocalAgentRuntimeFactory({
        ...input,
        approvedToolExecutors: [descriptorFactory(preview)]
      })
    }),
    previewHash
  };
}

function schedulerWakePreview(toolRequestId: string): AgentToolPreview {
  return {
    summary: `Review approved scheduler route request ${toolRequestId}.`,
    relatedEventIds: ["evt_source_route_review"],
    artifactHashes: [schedulerWakeArtifactHash()]
  };
}

function schedulerWakeDescriptor(
  preview: AgentToolPreview,
  overrides: Partial<AgentApprovedToolExecutorDescriptor> = {}
): AgentApprovedToolExecutorDescriptor {
  return {
    toolId: "agent.test.route-wake",
    toolVersion: "1.0.0",
    sideEffectClass: "ledger-review",
    approvalClass: "ledger-review",
    async buildCurrentPreview() {
      return {
        preview,
        sourceEventIds: ["evt_source_route_review"],
        inputArtifactHashes: [schedulerWakeArtifactHash()],
        provenanceRefs: ["evt_source_route_review", schedulerWakeArtifactHash()],
        activeLocks: [],
        freshnessChecks: [{
          name: "agent-projection",
          expected: "high-watermark:1",
          actual: "high-watermark:1",
          ok: true
        }]
      };
    },
    async executeApproved() {
      return {
        eventIds: ["evt_scheduler_route_domain_completed"],
        artifactHashes: [schedulerWakeArtifactHash()],
        readModelChanges: [{
          projectionName: "agent-route-test",
          change: "scheduler wake route completed approved work"
        }],
        resultSummary: "Scheduler wake route completed approved work."
      };
    },
    ...overrides
  };
}

function schedulerWakeArtifactHash(): `sha256:${string}` {
  return "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";
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
    scheduler: {
      wake: async () => ({
        schemaVersion: "agent-scheduler-wake-result.v1",
        generatedAt: "2026-07-07T20:00:00.000Z",
        examinedCount: 0,
        resumedCount: 0,
        completedCount: 0,
        blockedCount: 0,
        failedCount: 0,
        eventIds: [],
        allowedNextActions: [],
        items: []
      })
    },
    gateway: {}
  })) as unknown as LocalAgentRuntimeFactory;
}

function memoryValidationFailureRuntimeFactory(): LocalAgentRuntimeFactory {
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
      providers: [],
      pendingApprovalCount: 0,
      activeLockCount: 0,
      diagnostics: []
    }),
    listMemory: async () => ({ schemaVersion: "agent-memory-list.v1", generatedAt: "2026-07-07T20:00:00.000Z", truthBoundary: { authoritativeForOntology: false, scope: "working-memory" }, filters: { scope: "all", state: "active" }, items: [] }),
    memoryDetail: async () => undefined,
    initializeDefaultIdentity: async () => ({
      ok: true,
      residentAgentId: "agent_default",
      alreadyInitialized: false,
      eventIds: []
    }),
    recordMemory: async () => ({
      ok: false,
      error: {
        severity: "error",
        category: "agent",
        message: "Memory could not be recorded safely.",
        allowedRepairActions: ["review memory provenance and safe summary"]
      }
    }),
    supersedeMemory: async () => ({
      ok: false,
      error: {
        severity: "error",
        category: "agent",
        message: "Memory could not be superseded safely.",
        allowedRepairActions: ["refresh memory and review provenance"]
      }
    }),
    retractMemory: async () => ({
      ok: false,
      error: {
        severity: "error",
        category: "agent",
        message: "Memory could not be retracted safely.",
        allowedRepairActions: ["refresh memory and review rationale"]
      }
    }),
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

function createBarrier(count: number): { readonly arrive: () => Promise<void> } {
  let arrivals = 0;
  let release: (() => void) | undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });

  return {
    async arrive() {
      arrivals += 1;
      if (arrivals >= count) {
        release?.();
      }
      await released;
    }
  };
}
