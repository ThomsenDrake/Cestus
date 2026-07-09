import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createAgentRuntime,
  createAgentToolGateway,
  isAgentSecretSafeText,
  type StartAgentRunInput
} from "../../agent/src/index.js";
import { SQLiteEventLedger } from "../../ontology/src/sqlite-event-ledger.js";
import { resolveLocalRuntimeConfig } from "../src/config.js";
import type { LocalAgentRuntimeFactory } from "../src/agent-runtime-factory.js";
import { createLocalRuntimeHttpHandler, type LocalRuntimeHttpHandler } from "../src/http-handler.js";

const handlers: LocalRuntimeHttpHandler[] = [];
const tempDirs: string[] = [];
const routeActor = { id: "actor_case_owner", kind: "human" as const, label: "Case Owner" };
const agentActor = { id: "actor_cestus_agent", kind: "agent" as const, label: "Cestus Agent" };
const workspaceId = "ws_case_001";
const inputArtifactHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const now = () => "2026-07-09T02:00:00.000Z";

afterEach(() => {
  for (const handler of handlers.splice(0)) {
    handler.close();
  }
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
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

  it("starts a safe specialist run without executing the specialist workflow", async () => {
    const context = routeContext();
    await seedIdentityAndTask(context);

    const response = await context.handler({
      method: "POST",
      url: "/api/agent/runs",
      body: JSON.stringify({
        runId: "run_route_review",
        taskId: "task_route_review",
        runType: "evidence-triage",
        scope: { kind: "workspace", refs: [workspaceId] },
        inputArtifactHashes: [inputArtifactHash]
      })
    });

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      ok: true,
      schemaVersion: "agent-run-start-result.v1",
      runId: "run_route_review"
    });
    expect(await eventTypes(context)).toEqual([
      "agent.identity.initialized",
      "agent.task.created",
      "agent.task.status.changed",
      "agent.specialist-run.started",
      "agent.task.status.changed"
    ]);
  });

  it("calls runtime.startRun without reading runtime status on POST /api/agent/runs", async () => {
    const seen: {
      readonly statusCalls: number[];
      readonly startRunBodies: unknown[];
    } = {
      statusCalls: [],
      startRunBodies: []
    };
    const context = routeContext({
      agentRuntimeFactory: (() => ({
        status: async () => {
          seen.statusCalls.push(1);
          throw new Error("status should not be called for POST /api/agent/runs");
        },
        initializeDefaultIdentity: async () => {
          throw new Error("initializeDefaultIdentity should not be called for POST /api/agent/runs");
        },
        createTask: async () => {
          throw new Error("createTask should not be called for POST /api/agent/runs");
        },
        startRun: async (command: StartAgentRunInput) => {
          seen.startRunBodies.push(command);
          return { ok: true, runId: command.runId, eventIds: ["evt_run_started"] };
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

    expect(response.status).toBe(200);
    expect(seen.statusCalls).toEqual([]);
    expect(seen.startRunBodies).toEqual([{
      runId: "run_route_gateway_only",
      taskId: "task_route_review",
      runType: "evidence-triage",
      scope: { kind: "workspace", refs: [workspaceId] },
      sourceEventIds: ["evt_task_route_review"],
      inputArtifactHashes: [inputArtifactHash],
      startedBy: routeActor.id
    }]);
  });

  it("rejects missing tasks with a safe 404 diagnostic", async () => {
    const context = routeContext();
    await seedIdentity(context);

    const response = await context.handler({
      method: "POST",
      url: "/api/agent/runs",
      body: JSON.stringify({
        runId: "run_missing_task",
        taskId: "task_missing_review",
        runType: "evidence-triage",
        scope: { kind: "workspace", refs: [workspaceId] }
      })
    });

    expect(response.status).toBe(404);
    expect(JSON.parse(response.body)).toEqual({
      ok: false,
      diagnostic: {
        message: "Agent task was not found.",
        allowedRepairActions: ["create the task before starting a run"]
      }
    });
    expect(response.body).not.toContain("task_missing_review");
    expect(isAgentSecretSafeText(response.body)).toBe(true);
    expect(await eventTypes(context)).toEqual(["agent.identity.initialized"]);
  });

  it("rejects duplicate run ids with a safe 409 diagnostic", async () => {
    const context = routeContext();
    await seedIdentityAndTask(context);
    const body = JSON.stringify({
      runId: "run_duplicate_review",
      taskId: "task_route_review",
      runType: "evidence-triage",
      scope: { kind: "workspace", refs: [workspaceId] }
    });

    const first = await context.handler({ method: "POST", url: "/api/agent/runs", body });
    const second = await context.handler({ method: "POST", url: "/api/agent/runs", body });

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(JSON.parse(second.body)).toEqual({
      ok: false,
      diagnostic: {
        message: "Agent run already exists.",
        allowedRepairActions: ["choose a different run id", "refresh the agent cockpit"]
      }
    });
    expect(second.body).not.toContain("run_duplicate_review");
    expect(await eventTypes(context)).toEqual([
      "agent.identity.initialized",
      "agent.task.created",
      "agent.task.status.changed",
      "agent.specialist-run.started",
      "agent.task.status.changed"
    ]);
  });

  it("rejects unsupported run types, unsafe ids, and extra body keys with safe diagnostics", async () => {
    const context = routeContext();
    await seedIdentityAndTask(context);

    const unsupported = await context.handler({
      method: "POST",
      url: "/api/agent/runs",
      body: JSON.stringify({
        runId: "run_unsupported_review",
        taskId: "task_route_review",
        runType: "legacy-bootstrap",
        scope: { kind: "workspace", refs: [workspaceId] }
      })
    });
    const unsafe = await context.handler({
      method: "POST",
      url: "/api/agent/runs",
      body: JSON.stringify({
        runId: "run_sk_live_secret",
        taskId: "task_route_review",
        runType: "evidence-triage",
        scope: { kind: "workspace", refs: [workspaceId] }
      })
    });
    const extraKeys = await context.handler({
      method: "POST",
      url: "/api/agent/runs",
      body: JSON.stringify({
        runId: "run_extra_keys_review",
        taskId: "task_route_review",
        runType: "evidence-triage",
        scope: { kind: "workspace", refs: [workspaceId] },
        extra: "password hunter2"
      })
    });

    expect(unsupported.status).toBe(400);
    expect(unsafe.status).toBe(400);
    expect(extraKeys.status).toBe(400);
    expect(unsupported.body).not.toContain("legacy-bootstrap");
    expect(unsafe.body).not.toContain("run_sk_live_secret");
    expect(extraKeys.body).not.toContain("hunter2");
    expect(extraKeys.body).not.toContain("password");
    expect(JSON.parse(extraKeys.body)).toEqual({
      ok: false,
      diagnostic: {
        message: "Agent run body is invalid.",
        allowedRepairActions: [
          "send runId, taskId, runType, scope, and optional sourceEventIds/inputArtifactHashes as a JSON object"
        ]
      }
    });
    expect(await eventTypes(context)).toEqual([
      "agent.identity.initialized",
      "agent.task.created",
      "agent.task.status.changed"
    ]);
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

async function seedIdentity(context: ReturnType<typeof routeContext>): Promise<void> {
  await withRuntime(context, async (runtime) => {
    const initialized = await runtime.initializeDefaultIdentity({
      workspaceId,
      initializedBy: routeActor.id
    });
    expect(initialized.ok).toBe(true);
  });
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
