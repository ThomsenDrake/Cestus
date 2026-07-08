import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAgentToolGateway } from "../../agent/src/index.js";
import type { AppendableKnowledgeEvent } from "../../ontology/src/contracts.js";
import { SQLiteEventLedger } from "../../ontology/src/sqlite-event-ledger.js";
import { resolveLocalRuntimeConfig } from "../src/config.js";
import { createLocalRuntimeHttpHandler, type LocalRuntimeHttpHandler } from "../src/http-handler.js";

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
});

async function seededHandler(input: SeedToolRequestInput | string = "toolreq_provider_transfer") {
  const seeded = await seedToolRequest(input);
  const handler = createLocalRuntimeHttpHandler({
    config: seeded.config,
    actor: { id: "actor_case_owner", kind: "human", label: "Case Owner" },
    now
  });
  handlers.push(handler);
  return { ...seeded, handler };
}

interface SeedToolRequestInput {
  readonly toolRequestId?: string;
  readonly sourceEventIds?: readonly string[];
  readonly inputArtifactHashes?: readonly string[];
  readonly lockKind?: "provider-byte-transfer";
}

async function seedToolRequest(input: SeedToolRequestInput | string = "toolreq_provider_transfer") {
  const request = typeof input === "string" ? { toolRequestId: input } : input;
  const toolRequestId = request.toolRequestId ?? "toolreq_provider_transfer";
  const cwd = mkdtempSync(join(tmpdir(), "cestus-agent-approval-routes-"));
  tempDirs.push(cwd);
  const config = resolveLocalRuntimeConfig({ cwd, env: {} });
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
