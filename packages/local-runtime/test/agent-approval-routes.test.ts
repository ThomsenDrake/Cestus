import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createAgentRuntime,
  createAgentToolGateway
} from "../../agent/src/index.js";
import type { AppendableKnowledgeEvent, KnowledgeEvent } from "../../ontology/src/contracts.js";
import { InMemoryEventLedger, type AppendOptions, type EventLedger } from "../../ontology/src/event-ledger.js";
import { SQLiteEventLedger } from "../../ontology/src/sqlite-event-ledger.js";
import { createPortableWorkspace } from "../../workspace/src/index.js";
import { resolveLocalRuntimeConfig } from "../src/config.js";
import { handleAgentHttpRoute } from "../src/agent-http-routes.js";
import { createLocalRuntimeHttpHandler, type LocalRuntimeHttpHandler } from "../src/http-handler.js";
import type { LocalRuntimeHandle } from "../src/runtime-factory.js";

const handlers: LocalRuntimeHttpHandler[] = [];
const tempDirs: string[] = [];
const now = () => "2026-07-08T14:30:00.000Z";

afterEach(() => {
  for (const handler of handlers.splice(0)) {
    handler.close();
  }
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("agent approval routes", () => {
  it("lists provider byte-transfer approvals without executing provider transfer", async () => {
    const { config, handler } = await seededHandler();
    const response = await handler({ method: "GET", url: "/api/agent/approvals" });
    const body = JSON.parse(response.body) as {
      readonly schemaVersion: string;
      readonly queue: { readonly pending: readonly { readonly approvalClass: string; readonly executableByApproval: boolean }[] };
    };

    expect(response.status).toBe(200);
    expect(body.schemaVersion).toBe("agent-approval-cockpit.v1");
    expect(body.queue.pending[0]).toMatchObject({
      approvalClass: "provider-byte-transfer",
      executableByApproval: false
    });
    expect(response.body).not.toMatch(/synthetic-test-secret|authorization:\s*bearer|password|private key/i);
    handler.close();
    handlers.splice(handlers.indexOf(handler), 1);
    expect(await eventTypes(config)).toEqual(["agent.tool.requested"]);
  });

  it("tolerates mixed read-only and approval requests on GET /api/agent/approvals", async () => {
    const { config, handler } = await seededHandler({
      toolRequestId: "toolreq_provider_transfer",
      includeReadOnlyRequest: true
    });
    const response = await handler({ method: "GET", url: "/api/agent/approvals" });
    const body = JSON.parse(response.body) as {
      readonly summary: { readonly pendingCount: number };
      readonly queue: { readonly pending: readonly { readonly toolRequestId: string }[] };
    };

    expect(response.status).toBe(200);
    expect(body.summary.pendingCount).toBe(1);
    expect(body.queue.pending.map((item) => item.toolRequestId)).toEqual(["toolreq_provider_transfer"]);
    expect(response.body).not.toContain("toolreq_read_only");
    handler.close();
    handlers.splice(handlers.indexOf(handler), 1);
    expect(await eventTypes(config)).toEqual(["agent.tool.requested", "agent.tool.requested"]);
  });

  it("shows a single approval request by tool request id", async () => {
    const { handler } = await seededHandler();
    const response = await handler({
      method: "GET",
      url: "/api/agent/approvals/toolreq_provider_transfer"
    });
    const body = JSON.parse(response.body) as {
      readonly ok: true;
      readonly item: { readonly toolRequestId: string; readonly previewHash: string };
    };

    expect(response.status).toBe(200);
    expect(body.item.toolRequestId).toBe("toolreq_provider_transfer");
    expect(body.item.previewHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("appends exact human approval and no execution events", async () => {
    const { config, handler, previewHash } = await seededHandler();
    const response = await handler({
      method: "POST",
      url: "/api/agent/approvals/toolreq_provider_transfer/approve",
      body: JSON.stringify({
        approvedPreviewHash: previewHash,
        rationale: "Approved the exact synthetic provider byte-transfer preview."
      })
    });

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      ok: true,
      schemaVersion: "agent-approval-decision-result.v1"
    });
    handler.close();
    handlers.splice(handlers.indexOf(handler), 1);
    expect(await eventTypes(config)).toEqual(["agent.tool.requested", "agent.tool.approved"]);
    const approval = await eventByType(config, "agent.tool.approved");
    expect(approval?.payload).toMatchObject({
      toolRequestId: "toolreq_provider_transfer",
      approvedBy: "actor_case_owner",
      approvedPreviewHash: previewHash
    });
    expect(approval?.context.actor.id).toBe("actor_case_owner");
  });

  it("appends human denial and no execution events", async () => {
    const { config, handler } = await seededHandler("toolreq_provider_denied");
    const response = await handler({
      method: "POST",
      url: "/api/agent/approvals/toolreq_provider_denied/deny",
      body: JSON.stringify({
        rationale: "Need a revised provider byte-transfer preview."
      })
    });

    expect(response.status).toBe(200);
    handler.close();
    handlers.splice(handlers.indexOf(handler), 1);
    expect(await eventTypes(config)).toEqual(["agent.tool.requested", "agent.tool.denied"]);
    const denial = await eventByType(config, "agent.tool.denied");
    expect(denial?.payload).toMatchObject({
      toolRequestId: "toolreq_provider_denied",
      deniedBy: "actor_case_owner"
    });
    expect(denial?.context.actor.id).toBe("actor_case_owner");
  });

  it("rejects direct deny requests for filtered read-only tool requests", async () => {
    const { config, handler } = await seededHandler({
      toolRequestId: "toolreq_provider_transfer",
      includeReadOnlyRequest: true
    });
    const response = await handler({
      method: "POST",
      url: "/api/agent/approvals/toolreq_read_only/deny",
      body: JSON.stringify({
        rationale: "Read-only requests do not belong in the approval cockpit."
      })
    });

    expect(response.status).toBe(404);
    expect(response.body).not.toContain("toolreq_read_only");
    handler.close();
    handlers.splice(handlers.indexOf(handler), 1);
    expect(await eventTypes(config)).toEqual(["agent.tool.requested", "agent.tool.requested"]);
  });

  it("rejects stale approval hashes and secret-shaped rationales safely", async () => {
    const { handler } = await seededHandler();
    const stale = await handler({
      method: "POST",
      url: "/api/agent/approvals/toolreq_provider_transfer/approve",
      body: JSON.stringify({
        approvedPreviewHash: "sha256:9999999999999999999999999999999999999999999999999999999999999999",
        rationale: "Approved stale preview."
      })
    });
    const unsafe = await handler({
      method: "POST",
      url: "/api/agent/approvals/toolreq_provider_transfer/deny",
      body: JSON.stringify({
        rationale: "password hunter2"
      })
    });

    expect(stale.status).toBe(409);
    expect(unsafe.status).toBe(400);
    expect(stale.body).not.toMatch(/toolreq_provider_transfer|hunter2|password/i);
    expect(unsafe.body).not.toMatch(/hunter2|password/i);
  });

  it("uses denial diagnostics for malformed deny JSON and object bodies", async () => {
    const { handler } = await seededHandler("toolreq_provider_denial_diagnostics");
    const malformedJson = await handler({
      method: "POST",
      url: "/api/agent/approvals/toolreq_provider_denial_diagnostics/deny",
      body: "{"
    });
    const invalidObject = await handler({
      method: "POST",
      url: "/api/agent/approvals/toolreq_provider_denial_diagnostics/deny",
      body: JSON.stringify({
        approvedPreviewHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      })
    });

    expect(malformedJson.status).toBe(400);
    expect(invalidObject.status).toBe(400);
    expect(malformedJson.body).toContain("Agent denial body is invalid.");
    expect(invalidObject.body).toContain("Agent denial body is invalid.");
    expect(malformedJson.body).not.toContain("Agent approval body is invalid.");
    expect(invalidObject.body).not.toContain("Agent approval body is invalid.");
  });

  it("rejects locked provider byte-transfer approvals without appending approval events", async () => {
    const { config, handler, previewHash } = await seededHandler({
      toolRequestId: "toolreq_locked_provider_transfer",
      lockKind: "provider-byte-transfer"
    });
    const response = await handler({
      method: "POST",
      url: "/api/agent/approvals/toolreq_locked_provider_transfer/approve",
      body: JSON.stringify({
        approvedPreviewHash: previewHash,
        rationale: "Approved the exact locked preview."
      })
    });

    expect(response.status).toBe(409);
    expect(response.body).not.toMatch(/toolreq_locked_provider_transfer|lock_provider_byte_transfer/i);
    handler.close();
    handlers.splice(handlers.indexOf(handler), 1);
    expect(await eventTypes(config)).toEqual(["agent.tool.requested", "agent.lock.activated"]);
  });

  it("rejects missing-provenance blocked approvals without appending approval events", async () => {
    const { config, handler, previewHash } = await seededHandler({
      toolRequestId: "toolreq_missing_provenance_transfer",
      sourceEventIds: [],
      inputArtifactHashes: []
    });
    const response = await handler({
      method: "POST",
      url: "/api/agent/approvals/toolreq_missing_provenance_transfer/approve",
      body: JSON.stringify({
        approvedPreviewHash: previewHash,
        rationale: "Approved the exact provenance-missing preview."
      })
    });

    expect(response.status).toBe(409);
    expect(response.body).not.toMatch(/toolreq_missing_provenance_transfer/i);
    handler.close();
    handlers.splice(handlers.indexOf(handler), 1);
    expect(await eventTypes(config)).toEqual(["agent.tool.requested"]);
  });

  it("requires human route actors for approval decisions", async () => {
    const { config } = await seedToolRequest();
    const handler = createLocalRuntimeHttpHandler({
      config,
      actor: { id: "actor_policy_guard", kind: "system", label: "Policy Guard" },
      now
    });
    handlers.push(handler);
    const response = await handler({
      method: "POST",
      url: "/api/agent/approvals/toolreq_provider_transfer/approve",
      body: JSON.stringify({
        approvedPreviewHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        rationale: "Agent cannot approve."
      })
    });

    expect(response.status).toBe(403);
  });

  it("uses runtime-owned lifecycle before building an approval cockpit from snapshot events", async () => {
    const sourceLedger = new InMemoryEventLedger();
    const gateway = createAgentToolGateway({
      ledger: sourceLedger,
      actor: { id: "actor_cestus_agent", kind: "agent", label: "Cestus Agent" },
      now
    });
    const requested = await gateway.requestTool({
      toolRequestId: "toolreq_runtime_lifecycle",
      residentAgentId: "agent_default",
      taskId: "task_runtime_lifecycle",
      runId: "run_runtime_lifecycle",
      toolId: "provider.bytes.transfer",
      sideEffectClass: "external-byte-transfer",
      requiredApprovalClass: "provider-byte-transfer",
      preview: {
        summary: "Use the runtime-owned lifecycle for approval validation.",
        relatedEventIds: ["evt_runtime_lifecycle"],
        artifactHashes: ["sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"],
        scope: "Selected synthetic evidence excerpts.",
        estimatedEffect: "Provider byte transfer after human approval."
      }
    });
    let runtimeStatusRead = false;
    const guardedLedger: EventLedger = {
      append: (event, options) => sourceLedger.append(event, options),
      readStream: (streamId) => sourceLedger.readStream(streamId),
      readAll: async () => {
        if (!runtimeStatusRead) {
          throw new Error("runtime lifecycle must be read before approval snapshot");
        }
        return sourceLedger.readAll();
      }
    };
    const config = resolveLocalRuntimeConfig({ cwd: mkdtempSync(join(tmpdir(), "cestus-agent-approval-routes-")), env: {} });
    tempDirs.push(config.cwd);
    const lifecycle = readyResidentIdentityLifecycle("ws_runtime_lifecycle");
    const runtime = createAgentRuntime({
      ledger: sourceLedger,
      actor: { id: "actor_case_owner", kind: "human", label: "Case Owner" },
      now,
      identityLifecycle: lifecycle
    });
    const handle: LocalRuntimeHandle = {
      runtime: {} as LocalRuntimeHandle["runtime"],
      ledger: guardedLedger,
      config,
      residentIdentity: {
        lifecycle: () => lifecycle,
        ready: async () => lifecycle
      },
      close() {}
    };

    const response = await handleAgentHttpRoute({
      request: {
        method: "POST",
        url: "/api/agent/approvals/toolreq_runtime_lifecycle/approve",
        body: JSON.stringify({
          approvedPreviewHash: requested.payload.previewHash,
          rationale: "Approved after the runtime lifecycle was read."
        })
      },
      handle,
      actor: { id: "actor_case_owner", kind: "human", label: "Case Owner" },
      now,
      agentRuntimeFactory: () => ({
        status: async () => {
          runtimeStatusRead = true;
          return runtime.status();
        }
      }) as ReturnType<typeof createAgentRuntime>
    });

    expect(response?.status).toBe(200);
    expect(runtimeStatusRead).toBe(true);
    expect((await sourceLedger.readAll()).map((event) => event.type)).toEqual([
      "agent.tool.requested",
      "agent.tool.approved"
    ]);
  });

  it("rejects approval when a lock lands after the cockpit snapshot and before append", async () => {
    const ledger = new InterleavingApprovalLedger();
    const gateway = createAgentToolGateway({
      ledger,
      actor: { id: "actor_cestus_agent", kind: "agent", label: "Cestus Agent" },
      now
    });
    const requested = await gateway.requestTool({
      toolRequestId: "toolreq_interleaved_lock",
      residentAgentId: "agent_default",
      taskId: "task_provider_transfer",
      runId: "run_provider_transfer",
      toolId: "provider.bytes.transfer",
      sideEffectClass: "external-byte-transfer",
      requiredApprovalClass: "provider-byte-transfer",
      preview: {
        summary: "Send selected synthetic evidence excerpts to the configured provider.",
        relatedEventIds: ["evt_provider_preview"],
        artifactHashes: ["sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"],
        scope: "Selected synthetic evidence excerpts.",
        estimatedEffect: "Provider byte transfer after human approval."
      }
    });
    const config = resolveLocalRuntimeConfig({ cwd: mkdtempSync(join(tmpdir(), "cestus-agent-approval-routes-")), env: {} });
    tempDirs.push(config.cwd);
    const handle: LocalRuntimeHandle = {
      runtime: {} as LocalRuntimeHandle["runtime"],
      ledger,
      config,
      residentIdentity: {
        lifecycle: () => readyResidentIdentityLifecycle("ws_interleaved_approval"),
        ready: async () => readyResidentIdentityLifecycle("ws_interleaved_approval")
      },
      close() {}
    };
    const response = await handleAgentHttpRoute({
      request: {
        method: "POST",
        url: "/api/agent/approvals/toolreq_interleaved_lock/approve",
        body: JSON.stringify({
          approvedPreviewHash: requested.payload.previewHash,
          rationale: "Approved the exact synthetic provider byte-transfer preview."
        })
      },
      handle,
      actor: { id: "actor_case_owner", kind: "human", label: "Case Owner" },
      now,
      agentRuntimeFactory: ({ handle, actor, now }) => createAgentRuntime({
        ledger: handle.ledger,
        actor,
        now
      })
    });

    expect(response?.status).toBe(409);
    expect(response?.body).not.toMatch(/toolreq_interleaved_lock|lock_provider_byte_transfer/i);
    const allEvents = await ledger.readAll();
    expect(allEvents.map((event) => event.type)).toEqual(["agent.tool.requested", "agent.lock.activated"]);
  });
});

async function seededHandler(input: SeedToolRequestInput | string = "toolreq_provider_transfer") {
  const seeded = await seedToolRequest(input);
  const handler = createLocalRuntimeHttpHandler({
    config: seeded.config,
    actor: { id: "actor_case_owner", kind: "human", label: "Case Owner" },
    now,
    residentIdentityBootstrapForTest: async ({ workspaceId }) => readyResidentIdentityLifecycle(workspaceId)
  });
  handlers.push(handler);
  return { ...seeded, handler };
}

interface SeedToolRequestInput {
  readonly toolRequestId?: string;
  readonly sourceEventIds?: readonly string[];
  readonly inputArtifactHashes?: readonly string[];
  readonly lockKind?: "provider-byte-transfer";
  readonly includeReadOnlyRequest?: boolean;
}

async function seedToolRequest(input: SeedToolRequestInput | string = "toolreq_provider_transfer") {
  const request = typeof input === "string" ? { toolRequestId: input } : input;
  const toolRequestId = request.toolRequestId ?? "toolreq_provider_transfer";
  const cwd = mkdtempSync(join(tmpdir(), "cestus-agent-approval-routes-"));
  tempDirs.push(cwd);
  const config = portableConfig(cwd, "ws_approval_routes");
  const ledger = new SQLiteEventLedger(config.storage.sqlitePath);
  try {
    const gateway = createAgentToolGateway({
      ledger,
      actor: { id: "actor_cestus_agent", kind: "agent", label: "Cestus Agent" },
      now
    });
    const requested = await gateway.requestTool({
      toolRequestId,
      residentAgentId: "agent_default",
      taskId: "task_provider_transfer",
      runId: "run_provider_transfer",
      toolId: "provider.bytes.transfer",
      sideEffectClass: "external-byte-transfer",
      requiredApprovalClass: "provider-byte-transfer",
      preview: {
        summary: "Send selected synthetic evidence excerpts to the configured provider.",
        relatedEventIds: request.sourceEventIds ?? ["evt_provider_preview"],
        artifactHashes: request.inputArtifactHashes ?? ["sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"],
        scope: "Selected synthetic evidence excerpts.",
        estimatedEffect: "Provider byte transfer after human approval."
      }
    });

    if (request.includeReadOnlyRequest === true) {
      await gateway.requestTool({
        toolRequestId: "toolreq_read_only",
        residentAgentId: "agent_default",
        taskId: "task_read_only",
        runId: "run_read_only",
        toolId: "workspace.inspect",
        sideEffectClass: "read-only",
        preview: {
          summary: "Inspect local workspace state for planning.",
          relatedEventIds: ["evt_read_only_preview"],
          artifactHashes: [],
          scope: "Workspace inspection only.",
          estimatedEffect: "Read-only workspace inspection with no external effects."
        }
      });
    }

    if (request.lockKind !== undefined) {
      const lockEvent: AppendableKnowledgeEvent<"agent.lock.activated"> = {
        type: "agent.lock.activated",
        version: 1,
        streamId: "agent_lock_lock_provider_byte_transfer",
        context: {
          actor: { id: "actor_policy_guard", kind: "system", label: "Policy Guard" },
          occurredAt: now(),
          correlationId: "corr_lock_provider_byte_transfer",
          coreVersion: "0.1.0",
          packVersions: { core: "0.1.0", agent: "0.1.0" },
          causationId: requested.id
        },
        payload: {
          lockId: "lock_provider_byte_transfer",
          residentAgentId: "agent_default",
          kind: request.lockKind,
          activatedBy: "actor_policy_guard",
          reason: "Provider transfer locked pending review.",
          relatedEventIds: [requested.id]
        }
      };
      await ledger.append(lockEvent);
    }

    return { config, previewHash: requested.payload.previewHash };
  } finally {
    ledger.close();
  }
}

function portableConfig(cwd: string, workspaceId: string): ReturnType<typeof resolveLocalRuntimeConfig> {
  const workspaceRoot = join(cwd, workspaceId);
  createPortableWorkspace({
    rootDir: workspaceRoot,
    workspaceId,
    label: `Workspace ${workspaceId}`,
    createdAt: "2026-07-10T12:00:00.000Z",
    createdBy: "agent-approval-routes-test"
  });
  return resolveLocalRuntimeConfig({
    cwd,
    env: {
      CESTUS_LOCAL_STORAGE: "portable-workspace",
      CESTUS_WORKSPACE_ROOT: workspaceRoot
    }
  });
}

function readyResidentIdentityLifecycle(workspaceId: string) {
  return {
    schemaVersion: "resident-identity-lifecycle.v1" as const,
    state: "ready" as const,
    residentAgentId: "agent_default" as const,
    workspaceId,
    initialized: true,
    eventIds: [],
    safeMessage: "Resident identity is ready.",
    allowedRepairActions: []
  };
}

async function eventTypes(config: ReturnType<typeof resolveLocalRuntimeConfig>): Promise<readonly string[]> {
  return (await readAllEvents(config)).map((event) => event.type);
}

async function eventByType(
  config: ReturnType<typeof resolveLocalRuntimeConfig>,
  eventType: string
) {
  return (await readAllEvents(config)).find((event) => event.type === eventType);
}

async function readAllEvents(config: ReturnType<typeof resolveLocalRuntimeConfig>) {
  const ledger = new SQLiteEventLedger(config.storage.sqlitePath);
  try {
    return await ledger.readAll();
  } finally {
    ledger.close();
  }
}

class InterleavingApprovalLedger implements EventLedger {
  private readonly ledger = new InMemoryEventLedger();

  private didInterleave = false;

  async append(event: AppendableKnowledgeEvent, options: AppendOptions = {}): Promise<KnowledgeEvent> {
    if (event.type === "agent.tool.approved" && !this.didInterleave) {
      this.didInterleave = true;
      await this.ledger.append(approvalLockEvent(event.context.causationId ?? "evt_requested"));
    }

    return await this.ledger.append(event, options);
  }

  async readStream(streamId: string): Promise<KnowledgeEvent[]> {
    return await this.ledger.readStream(streamId);
  }

  async readAll(): Promise<KnowledgeEvent[]> {
    return await this.ledger.readAll();
  }
}

function approvalLockEvent(causationId: string): AppendableKnowledgeEvent<"agent.lock.activated"> {
  return {
    type: "agent.lock.activated",
    version: 1,
    streamId: "agent_lock_lock_provider_byte_transfer",
    context: {
      actor: { id: "actor_policy_guard", kind: "system", label: "Policy Guard" },
      occurredAt: now(),
      correlationId: "corr_lock_provider_byte_transfer",
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", agent: "0.1.0" },
      causationId
    },
    payload: {
      lockId: "lock_provider_byte_transfer",
      residentAgentId: "agent_default",
      kind: "provider-byte-transfer",
      activatedBy: "actor_policy_guard",
      reason: "Provider transfer locked pending review.",
      relatedEventIds: [causationId]
    }
  };
}
