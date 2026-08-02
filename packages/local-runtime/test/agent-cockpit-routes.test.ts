import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAgentRuntime,
  createAgentToolGateway,
  isAgentSecretSafeText,
  type AgentStatusDto
} from "../../agent/src/index.js";
import { SQLiteEventLedger } from "../../ontology/src/sqlite-event-ledger.js";
import { resolveLocalRuntimeConfig } from "../src/config.js";
import type { LocalAgentRuntimeFactory } from "../src/agent-runtime-factory.js";
import { createLocalRuntimeHttpHandler, type LocalRuntimeHttpHandler } from "../src/http-handler.js";

const mockedOntologyBootstrapBoundary = vi.hoisted(() => ({
  calls: [] as string[]
}));

vi.mock("../src/agent-ontology-bootstrap-routes.js", () => ({
  handleAgentOntologyBootstrapRoute: vi.fn(async (input: { readonly request: { readonly url: string } }) => {
    mockedOntologyBootstrapBoundary.calls.push(new URL(input.request.url, "http://localhost").pathname);
    return undefined;
  })
}));

const handlers: LocalRuntimeHttpHandler[] = [];
const tempDirs: string[] = [];
const routeActor = { id: "actor_case_owner", kind: "human" as const, label: "Case Owner" };
const agentActor = { id: "actor_cestus_agent", kind: "agent" as const, label: "Cestus Agent" };
const workspaceId = "ws_case_001";
const inputArtifactHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const now = () => "2026-07-09T02:00:00.000Z";

afterEach(async () => {
  for (const handler of handlers.splice(0)) {
    await handler.close();
  }
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
  mockedOntologyBootstrapBoundary.calls.splice(0);
});

describe("agent cockpit routes", () => {
  it("returns cockpit DTO from current runtime status and approval queue", async () => {
    const context = routeContext();
    await seedRunningTaskWithApproval(context);

    const response = await context.handler({
      method: "GET",
      url: "/api/agent/cockpit"
    });
    const body = JSON.parse(response.body) as {
      readonly schemaVersion: string;
      readonly summary: { readonly pendingApprovalCount: number };
      readonly taskQueue: readonly { readonly taskId: string }[];
      readonly providerReadiness?: {
        readonly cards: readonly { readonly providerId: string }[];
      };
    };

    expect(response.status).toBe(200);
    expect(body.schemaVersion).toBe("agent-cockpit.v1");
    expect(body.summary.pendingApprovalCount).toBe(1);
    expect(body.taskQueue[0]?.taskId).toBe("task_route_review");
    expect(body.providerReadiness?.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({ providerId: "provider_fake_local" })
    ]));
    expect(JSON.stringify(body)).not.toMatch(/raw-token|authorization:\s*bearer|sk_live|password/i);
  });

  it("keeps cockpit and generic run routes out of the legacy bootstrap boundary", async () => {
    const context = routeContext();
    await seedIdentityAndTask(context);

    const cockpit = await context.handler({
      method: "GET",
      url: "/api/agent/cockpit"
    });
    const runStart = await context.handler({
      method: "POST",
      url: "/api/agent/runs",
      body: JSON.stringify({
        runId: "run_route_no_bootstrap",
        taskId: "task_route_review",
        runType: "evidence-triage",
        scope: { kind: "workspace", refs: [workspaceId] }
      })
    });

    expect(cockpit.status).toBe(200);
    expect(runStart.status).toBe(404);
    expect(mockedOntologyBootstrapBoundary.calls).toEqual([]);
  });

  it("does not expose a generic POST /api/agent/runs execution route", async () => {
    const context = routeContext();
    await seedIdentityAndTask(context);

    const response = await context.handler({
      method: "POST",
      url: "/api/agent/runs",
      body: JSON.stringify({
        runId: "run_route_gateway_only",
        taskId: "task_route_review",
        runType: "evidence-triage",
        scope: { kind: "workspace", refs: [workspaceId] },
        sourceEventIds: ["evt_task_route_review"],
        inputArtifactHashes: [inputArtifactHash]
      })
    });

    expect(response.status).toBe(404);
    expect(JSON.parse(response.body)).toEqual({
      ok: false,
      diagnostic: {
        message: "Local runtime route was not found.",
        allowedRepairActions: ["check the request path and method"]
      }
    });
    expect(response.body).not.toContain("run_route_gateway_only");
    expect(isAgentSecretSafeText(response.body)).toBe(true);
    expect(await eventTypes(context)).toEqual([
      "agent.identity.initialized",
      "agent.task.created",
      "agent.task.status.changed"
    ]);
  });

  it("does not call runtime execution for absent generic run routes", async () => {
    const touched: string[] = [];
    const context = routeContext({
      agentRuntimeFactory: (() => ({
        status: async () => {
          touched.push("status");
          throw new Error("status should not be called for absent generic run routes");
        },
        initializeDefaultIdentity: async () => {
          touched.push("initializeDefaultIdentity");
          throw new Error("initializeDefaultIdentity should not be called for absent generic run routes");
        },
        createTask: async () => {
          touched.push("createTask");
          throw new Error("createTask should not be called for absent generic run routes");
        },
        startRun: async () => {
          touched.push("startRun");
          throw new Error("startRun should not be called for absent generic run routes");
        },
        invokeModel: async () => ({ ok: false, error: { severity: "error", category: "provider", message: "unused" } }),
        gateway: {}
      })) as unknown as LocalAgentRuntimeFactory
    });

    const response = await context.handler({
      method: "POST",
      url: "/api/agent/runs",
      body: JSON.stringify({
        runId: "run_route_gateway_only",
        taskId: "task_route_review",
        runType: "evidence-triage",
        scope: { kind: "workspace", refs: [workspaceId] },
        sourceEventIds: ["evt_task_route_review"],
        inputArtifactHashes: [inputArtifactHash]
      })
    });

    expect(response.status).toBe(404);
    expect(JSON.parse(response.body).diagnostic.message).toBe("Local runtime route was not found.");
    expect(touched).toEqual([]);
  });

  it("builds cockpit without touching run execution or tool gateway surfaces", async () => {
    const touched: string[] = [];
    const context = routeContext({
      agentRuntimeFactory: (() => ({
        status: async () => cockpitStatusFixture(),
        initializeDefaultIdentity: async () => {
          touched.push("initializeDefaultIdentity");
          throw new Error("initializeDefaultIdentity should not be called for GET /api/agent/cockpit");
        },
        createTask: async () => {
          touched.push("createTask");
          throw new Error("createTask should not be called for GET /api/agent/cockpit");
        },
        startRun: async () => {
          touched.push("startRun");
          throw new Error("startRun should not be called for GET /api/agent/cockpit");
        },
        invokeModel: async () => {
          touched.push("invokeModel");
          throw new Error("invokeModel should not be called for GET /api/agent/cockpit");
        },
        gateway: new Proxy({}, {
          get(_target, property) {
            touched.push(`gateway:${String(property)}`);
            throw new Error(`gateway.${String(property)} should not be called for GET /api/agent/cockpit`);
          }
        })
      })) as unknown as LocalAgentRuntimeFactory
    });

    const response = await context.handler({
      method: "GET",
      url: "/api/agent/cockpit"
    });

    expect(response.status).toBe(200);
    const body = JSON.parse(response.body) as {
      readonly specialists: {
        readonly readiness: readonly {
          readonly runType: string;
          readonly missingContractIds: readonly string[];
          readonly missingAdapterFamilies: readonly string[];
        }[];
      };
    };
    expect(body.specialists.readiness.flatMap((item) => item.missingContractIds)).not.toEqual(
      expect.arrayContaining(["agent.scheduler-resumer.v1", "agent.domain-adapter.v1"])
    );
    expect(body.specialists.readiness.find((item) => item.runType === "contradiction-finder")?.missingAdapterFamilies)
      .toEqual(["contradiction-claim-review"]);
    expect(touched).toEqual([]);
  });

  it("keeps forbidden-effect cockpit and run subpaths unavailable", async () => {
    const context = routeContext();
    const attempts = [
      { method: "POST", url: "/api/agent/runs/scheduler-wake" },
      { method: "POST", url: "/api/agent/runs/provider-invocation" },
      { method: "POST", url: "/api/agent/runs/prr-send" },
      { method: "POST", url: "/api/agent/runs/provider-byte-transfer" },
      { method: "POST", url: "/api/agent/runs/export" },
      { method: "POST", url: "/api/agent/runs/legal-escalation" },
      { method: "POST", url: "/api/agent/runs/repair" },
      { method: "POST", url: "/api/agent/runs/accepted-graph-review" },
      { method: "POST", url: "/api/agent/runs/legacy-import" },
      { method: "POST", url: "/api/agent/runs/legacy-staging" },
      { method: "GET", url: "/api/agent/cockpit/scheduler-wake" },
      { method: "GET", url: "/api/agent/cockpit/provider-byte-transfer" }
    ] as const;

    const responses = await Promise.all(attempts.map((request) => context.handler(request)));

    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(response.body).not.toMatch(/authorization:\s*bearer|sk_live|password/i);
      expect(JSON.parse(response.body)).toEqual({
        ok: false,
        diagnostic: {
          message: "Local runtime route was not found.",
          allowedRepairActions: ["check the request path and method"]
        }
      });
    }

    expect(await eventTypes(context)).toEqual([]);
  });

  it("keeps generic run bodies fail-closed before validating run semantics", async () => {
    const context = routeContext();
    const attempts = [
      {},
      { runId: "run_unsupported_review", taskId: "task_missing_review", runType: "legacy-bootstrap" },
      { runId: "run_sk_live_secret", taskId: "task_route_review", runType: "evidence-triage" },
      { runId: "run_extra_keys_review", taskId: "task_route_review", extra: "password hunter2" }
    ];

    for (const body of attempts) {
      const response = await context.handler({
        method: "POST",
        url: "/api/agent/runs",
        body: JSON.stringify(body)
      });

      expect(response.status).toBe(404);
      expect(response.body).not.toMatch(/legacy-bootstrap|run_sk_live_secret|hunter2|password/i);
      expect(JSON.parse(response.body).diagnostic.message).toBe("Local runtime route was not found.");
    }
    expect(await eventTypes(context)).toEqual([]);
  });
});

function routeContext(input: {
  readonly agentRuntimeFactory?: LocalAgentRuntimeFactory;
} = {}) {
  const config = resolveLocalRuntimeConfig({ cwd: tempDir(), env: {} });
  const handler = createLocalRuntimeHttpHandler({
    config,
    actor: routeActor,
    now,
    ...(input.agentRuntimeFactory === undefined ? {} : { agentRuntimeFactory: input.agentRuntimeFactory })
  });
  handlers.push(handler);
  return { config, handler };
}

function tempDir(): string {
  const cwd = mkdtempSync(join(tmpdir(), "cestus-agent-cockpit-routes-"));
  tempDirs.push(cwd);
  return cwd;
}

async function seedIdentityAndTask(context: ReturnType<typeof routeContext>): Promise<void> {
  await withRuntime(context, async (runtime) => {
    const initialized = await runtime.initializeDefaultIdentity({
      workspaceId,
      initializedBy: routeActor.id
    });
    expect(initialized.ok).toBe(true);

    const created = await runtime.createTask({
      taskId: "task_route_review",
      title: "Review resident route behavior",
      requestedBy: routeActor.id,
      priority: "normal"
    });
    expect(created.ok).toBe(true);
  });
}

async function seedRunningTaskWithApproval(context: ReturnType<typeof routeContext>): Promise<void> {
  await withLedger(context.config, async (ledger) => {
    const runtime = createAgentRuntime({
      ledger,
      actor: routeActor,
      now
    });
    const initialized = await runtime.initializeDefaultIdentity({
      workspaceId,
      initializedBy: routeActor.id
    });
    expect(initialized.ok).toBe(true);

    const created = await runtime.createTask({
      taskId: "task_route_review",
      title: "Review resident route behavior",
      requestedBy: routeActor.id,
      priority: "normal"
    });
    expect(created.ok).toBe(true);

    const started = await runtime.startRun({
      runId: "run_route_review",
      taskId: "task_route_review",
      runType: "evidence-triage",
      scope: { kind: "workspace", refs: [workspaceId] },
      startedBy: routeActor.id,
      inputArtifactHashes: [inputArtifactHash]
    });
    expect(started.ok).toBe(true);

    const gateway = createAgentToolGateway({
      ledger,
      actor: agentActor,
      now
    });
    await gateway.requestTool({
      toolRequestId: "toolreq_provider_transfer",
      residentAgentId: "agent_default",
      taskId: "task_route_review",
      runId: "run_route_review",
      toolId: "provider.bytes.transfer",
      sideEffectClass: "external-byte-transfer",
      requiredApprovalClass: "provider-byte-transfer",
      preview: {
        summary: "Send selected synthetic evidence excerpts to the configured provider.",
        relatedEventIds: ["evt_provider_preview"],
        artifactHashes: [inputArtifactHash],
        scope: "Selected synthetic evidence excerpts.",
        estimatedEffect: "Provider byte transfer after human approval."
      }
    });
  });
}

async function eventTypes(context: ReturnType<typeof routeContext>): Promise<readonly string[]> {
  return await withLedger(context.config, async (ledger) => (await ledger.readAll()).map((event) => event.type));
}

async function withRuntime(
  context: ReturnType<typeof routeContext>,
  callback: (runtime: ReturnType<typeof createAgentRuntime>) => Promise<void>
): Promise<void> {
  await withLedger(context.config, async (ledger) => {
    await callback(createAgentRuntime({
      ledger,
      actor: routeActor,
      now
    }));
  });
}

async function withLedger<T>(
  config: ReturnType<typeof resolveLocalRuntimeConfig>,
  callback: (ledger: SQLiteEventLedger) => Promise<T>
): Promise<T> {
  const ledger = new SQLiteEventLedger(config.storage.sqlitePath);
  try {
    return await callback(ledger);
  } finally {
    ledger.close();
  }
}

function cockpitStatusFixture(): AgentStatusDto {
  return {
    schemaVersion: "agent-status.v1",
    generatedAt: now(),
    identityLifecycle: {
      schemaVersion: "resident-identity-lifecycle.v1",
      state: "not-mounted",
      residentAgentId: "agent_default",
      initialized: false,
      eventIds: [],
      safeMessage: "Resident identity is not mounted.",
      allowedRepairActions: ["mount a workspace before initializing the resident identity"]
    },
    identity: undefined,
    tasks: [],
    runs: [],
    toolRequests: [],
    permissions: [],
    locks: [],
    activeMemory: [],
    modelInvocations: [],
    providers: [],
    pendingApprovalCount: 0,
    activeLockCount: 0,
    diagnostics: []
  };
}
