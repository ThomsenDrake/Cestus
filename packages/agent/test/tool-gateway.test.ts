import { describe, expect, it } from "vitest";
import type { AppendableKnowledgeEvent } from "../../ontology/src/contracts.js";
import { InMemoryEventLedger, type AppendOptions, type EventLedger } from "../../ontology/src/event-ledger.js";
import { createAgentToolGateway } from "../src/tool-gateway.js";

const agentActor = { id: "actor_cestus_agent", kind: "agent" as const, label: "Cestus Agent" };
const humanActor = { id: "actor_case_owner", kind: "human" as const, label: "Case Owner" };
const policyActor = { id: "actor_policy_guard", kind: "system" as const, label: "Policy Guard" };
const fixedNow = () => "2026-07-07T18:30:00.000Z";
const stalePreviewHash = "sha256:9999999999999999999999999999999999999999999999999999999999999999";

describe("agent tool gateway", () => {
  it("records approval-required tool requests without executing them", async () => {
    const ledger = new InMemoryEventLedger();
    const gateway = createAgentToolGateway({ ledger, actor: agentActor, now: fixedNow });

    const requested = await gateway.requestTool({
      toolRequestId: "toolreq_provider_preview",
      residentAgentId: "agent_default",
      taskId: "task_provider_readiness",
      runId: "run_provider_readiness",
      toolId: "provider.parse.preview",
      sideEffectClass: "external-byte-transfer",
      preview: { summary: "Send two evidence text excerpts to a fake provider.", relatedEventIds: ["evt_import_001"] },
      requiredApprovalClass: "provider-byte-transfer"
    });

    expect(requested.type).toBe("agent.tool.requested");
    expect(requested.payload.requiredApprovalClass).toBe("provider-byte-transfer");
    expect((await ledger.readAll()).map((event) => event.type)).toEqual(["agent.tool.requested"]);
  });

  it("requires human approval and exact preview hash before completion", async () => {
    const ledger = new InMemoryEventLedger();
    const gateway = createAgentToolGateway({ ledger, actor: agentActor, now: fixedNow });

    const requested = await gateway.requestTool({
      toolRequestId: "toolreq_prr_send",
      residentAgentId: "agent_default",
      taskId: "task_prr",
      runId: "run_prr",
      toolId: "prr.send.followup",
      sideEffectClass: "external-message-send",
      preview: { summary: "Send PRR follow-up draft.", relatedEventIds: ["evt_prr_draft"] },
      requiredApprovalClass: "external-message-send"
    });

    await expect(
      gateway.approveTool({
        toolRequestId: "toolreq_prr_send",
        approvedPreviewHash: requested.payload.previewHash,
        actor: agentActor,
        rationale: "Agent cannot approve itself."
      })
    ).rejects.toThrow(/human/i);

    await gateway.approveTool({
      toolRequestId: "toolreq_prr_send",
      approvedPreviewHash: requested.payload.previewHash,
      actor: humanActor,
      rationale: "Human approved the exact preview."
    });

    await expect(
      gateway.completeTool({
        toolRequestId: "toolreq_prr_send",
        approvedPreviewHash: stalePreviewHash,
        result: { eventIds: [], artifactHashes: [], readModelChanges: [] }
      })
    ).rejects.toThrow(/stale/i);
  });

  it("rejects duplicate changed-preview requests so old approvals cannot be reused", async () => {
    const ledger = new InMemoryEventLedger();
    const gateway = createAgentToolGateway({ ledger, actor: agentActor, now: fixedNow });

    const requested = await gateway.requestTool({
      toolRequestId: "toolreq_prr_duplicate",
      residentAgentId: "agent_default",
      taskId: "task_prr",
      runId: "run_prr",
      toolId: "prr.send.followup",
      sideEffectClass: "external-message-send",
      preview: { summary: "Send PRR follow-up draft.", relatedEventIds: ["evt_prr_draft"] }
    });
    await gateway.approveTool({
      toolRequestId: "toolreq_prr_duplicate",
      approvedPreviewHash: requested.payload.previewHash,
      actor: humanActor,
      rationale: "Human approved the first preview."
    });

    const duplicateError = await captureError(() =>
      gateway.requestTool({
        toolRequestId: "toolreq_prr_duplicate",
        residentAgentId: "agent_default",
        taskId: "task_prr",
        runId: "run_prr",
        toolId: "prr.send.followup",
        sideEffectClass: "external-message-send",
        preview: { summary: "Send changed PRR follow-up draft.", relatedEventIds: ["evt_prr_draft"] }
      })
    );

    expect(duplicateError).toBeInstanceOf(Error);
    expect((duplicateError as Error).message).toMatch(/already exists|duplicate/i);
    expect((duplicateError as Error).message).not.toContain("toolreq_prr_duplicate");
    expect((await ledger.readAll()).map((event) => event.type)).toEqual(["agent.tool.requested", "agent.tool.approved"]);
  });

  it("does not echo raw tool request IDs in missing-request errors", async () => {
    const ledger = new InMemoryEventLedger();
    const gateway = createAgentToolGateway({ ledger, actor: agentActor, now: fixedNow });

    const error = await captureError(() =>
      gateway.completeTool({
        toolRequestId: "toolreq_sk_live_value",
        result: { eventIds: [], artifactHashes: [], readModelChanges: [] }
      })
    );

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain("toolreq_sk_live_value");
    expect((error as Error).message).not.toMatch(/sk[_-]live/i);
  });

  it("fails closed when a gated request has no approval", async () => {
    const ledger = new InMemoryEventLedger();
    const gateway = createAgentToolGateway({ ledger, actor: agentActor, now: fixedNow });

    const requested = await gateway.requestTool({
      toolRequestId: "toolreq_legal_escalation",
      residentAgentId: "agent_default",
      taskId: "task_legal",
      runId: "run_legal",
      toolId: "legal.escalation.prepare",
      sideEffectClass: "legal-escalation",
      preview: { summary: "Prepare legal escalation language.", relatedEventIds: ["evt_legal_lock"] }
    });

    await expect(
      gateway.completeTool({
        toolRequestId: requested.payload.toolRequestId,
        approvedPreviewHash: requested.payload.previewHash,
        result: { eventIds: [], artifactHashes: [], readModelChanges: [] }
      })
    ).rejects.toThrow(/approval/i);

    expect((await ledger.readAll()).map((event) => event.type)).toEqual(["agent.tool.requested"]);
  });

  it("fails closed after human or policy denial", async () => {
    const ledger = new InMemoryEventLedger();
    const gateway = createAgentToolGateway({ ledger, actor: agentActor, now: fixedNow });

    const requested = await gateway.requestTool({
      toolRequestId: "toolreq_export_denied",
      residentAgentId: "agent_default",
      taskId: "task_export",
      runId: "run_export",
      toolId: "report.export",
      sideEffectClass: "export-or-publication",
      preview: { summary: "Export a report preview.", relatedEventIds: ["evt_report_preview"] }
    });

    await gateway.denyTool({
      toolRequestId: "toolreq_export_denied",
      actor: policyActor,
      rationale: "Policy denied report export until review completes."
    });

    await expect(
      gateway.completeTool({
        toolRequestId: "toolreq_export_denied",
        approvedPreviewHash: requested.payload.previewHash,
        result: { eventIds: [], artifactHashes: [], readModelChanges: [] }
      })
    ).rejects.toThrow(/denied/i);

    expect((await ledger.readAll()).map((event) => event.type)).toEqual(["agent.tool.requested", "agent.tool.denied"]);
  });

  it("completes approved gated requests when the approved preview is current", async () => {
    const ledger = new InMemoryEventLedger();
    const gateway = createAgentToolGateway({ ledger, actor: agentActor, now: fixedNow });

    const requested = await gateway.requestTool({
      toolRequestId: "toolreq_approved_complete",
      residentAgentId: "agent_default",
      taskId: "task_prr",
      runId: "run_prr",
      toolId: "prr.send.followup",
      sideEffectClass: "external-message-send",
      preview: { summary: "Send PRR follow-up draft.", relatedEventIds: ["evt_prr_draft"] }
    });
    await gateway.approveTool({
      toolRequestId: "toolreq_approved_complete",
      approvedPreviewHash: requested.payload.previewHash,
      actor: humanActor,
      rationale: "Human approved the exact preview."
    });

    const completed = await gateway.completeTool({
      toolRequestId: "toolreq_approved_complete",
      approvedPreviewHash: requested.payload.previewHash,
      result: {
        eventIds: ["evt_prr_sent"],
        artifactHashes: ["sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
        readModelChanges: [{ projectionName: "agent-tool-requests", change: "Recorded gated completion." }],
        resultSummary: "Approved gated tool completed."
      }
    });

    expect(completed.type).toBe("agent.tool.completed");
    expect((await ledger.readAll()).map((event) => event.type)).toEqual([
      "agent.tool.requested",
      "agent.tool.approved",
      "agent.tool.completed"
    ]);
  });

  it("rejects forged human approval from the resident agent identity", async () => {
    const ledger = new InMemoryEventLedger();
    const gateway = createAgentToolGateway({ ledger, actor: agentActor, now: fixedNow });

    const requested = await gateway.requestTool({
      toolRequestId: "toolreq_forged_resident_human",
      residentAgentId: "agent_default",
      taskId: "task_provider_readiness",
      runId: "run_provider_readiness",
      toolId: "provider.parse.preview",
      sideEffectClass: "external-byte-transfer",
      preview: {
        summary: "Send provider byte transfer preview.",
        relatedEventIds: ["evt_import_001"]
      },
      requiredApprovalClass: "provider-byte-transfer"
    });

    await expect(
      gateway.approveTool({
        toolRequestId: "toolreq_forged_resident_human",
        approvedPreviewHash: requested.payload.previewHash,
        actor: { id: "agent_default", kind: "human" as const, label: "Forged Human Agent" },
        rationale: "Forged resident approval."
      })
    ).rejects.toThrow(/independent human/i);

    expect((await ledger.readAll()).map((event) => event.type)).toEqual(["agent.tool.requested"]);
  });

  it("rejects forged human approval from the gateway actor identity", async () => {
    const ledger = new InMemoryEventLedger();
    const gateway = createAgentToolGateway({ ledger, actor: agentActor, now: fixedNow });

    const requested = await gateway.requestTool({
      toolRequestId: "toolreq_forged_gateway_actor",
      residentAgentId: "agent_default",
      taskId: "task_provider_readiness",
      runId: "run_provider_readiness",
      toolId: "provider.parse.preview",
      sideEffectClass: "external-byte-transfer",
      preview: {
        summary: "Send provider byte transfer preview.",
        relatedEventIds: ["evt_import_001"]
      },
      requiredApprovalClass: "provider-byte-transfer"
    });

    await expect(
      gateway.approveTool({
        toolRequestId: "toolreq_forged_gateway_actor",
        approvedPreviewHash: requested.payload.previewHash,
        actor: { id: agentActor.id, kind: "human" as const, label: "Forged Runtime Human" },
        rationale: "Forged runtime approval."
      })
    ).rejects.toThrow(/independent human/i);

    expect((await ledger.readAll()).map((event) => event.type)).toEqual(["agent.tool.requested"]);
  });

  it("rejects completion when denial is appended between state read and append", async () => {
    const inner = new InMemoryEventLedger();
    const ledger = new InterleavingLedger(inner, "agent.tool.denied");
    const gateway = createAgentToolGateway({ ledger, actor: agentActor, now: fixedNow });

    const requested = await gateway.requestTool({
      toolRequestId: "toolreq_interleaved_denial",
      residentAgentId: "agent_default",
      taskId: "task_prr",
      runId: "run_prr",
      toolId: "prr.send.followup",
      sideEffectClass: "external-message-send",
      preview: { summary: "Send PRR follow-up draft.", relatedEventIds: ["evt_prr_draft"] }
    });
    await gateway.approveTool({
      toolRequestId: "toolreq_interleaved_denial",
      approvedPreviewHash: requested.payload.previewHash,
      actor: humanActor,
      rationale: "Human approved the exact preview."
    });

    await expect(
      gateway.completeTool({
        toolRequestId: "toolreq_interleaved_denial",
        approvedPreviewHash: requested.payload.previewHash,
        result: { eventIds: [], artifactHashes: [], readModelChanges: [] }
      })
    ).rejects.toThrow(/concurrency|conflict/i);

    expect((await inner.readAll()).map((event) => event.type)).toEqual([
      "agent.tool.requested",
      "agent.tool.approved",
      "agent.tool.denied"
    ]);
  });

  it("rejects completion when failure is appended between state read and append", async () => {
    const inner = new InMemoryEventLedger();
    const ledger = new InterleavingLedger(inner, "agent.tool.failed");
    const gateway = createAgentToolGateway({ ledger, actor: agentActor, now: fixedNow });

    const requested = await gateway.requestTool({
      toolRequestId: "toolreq_interleaved_failure",
      residentAgentId: "agent_default",
      taskId: "task_prr",
      runId: "run_prr",
      toolId: "prr.send.followup",
      sideEffectClass: "external-message-send",
      preview: { summary: "Send PRR follow-up draft.", relatedEventIds: ["evt_prr_draft"] }
    });
    await gateway.approveTool({
      toolRequestId: "toolreq_interleaved_failure",
      approvedPreviewHash: requested.payload.previewHash,
      actor: humanActor,
      rationale: "Human approved the exact preview."
    });

    await expect(
      gateway.completeTool({
        toolRequestId: "toolreq_interleaved_failure",
        approvedPreviewHash: requested.payload.previewHash,
        result: { eventIds: [], artifactHashes: [], readModelChanges: [] }
      })
    ).rejects.toThrow(/concurrency|conflict/i);

    expect((await inner.readAll()).map((event) => event.type)).toEqual([
      "agent.tool.requested",
      "agent.tool.approved",
      "agent.tool.failed"
    ]);
  });

  it("allows read-only tool completion without approval", async () => {
    const ledger = new InMemoryEventLedger();
    const gateway = createAgentToolGateway({ ledger, actor: agentActor, now: fixedNow });

    const requested = await gateway.requestTool({
      toolRequestId: "toolreq_projection_read",
      residentAgentId: "agent_default",
      taskId: "task_projection",
      runId: "run_projection",
      toolId: "projection.read",
      sideEffectClass: "read-only",
      preview: { summary: "Read local projection status.", relatedEventIds: ["evt_projection_check"] }
    });
    const completed = await gateway.completeTool({
      toolRequestId: "toolreq_projection_read",
      result: {
        eventIds: [],
        artifactHashes: [],
        readModelChanges: [{ projectionName: "agent-tool-requests", change: "Recorded read-only completion." }],
        resultSummary: "Read-only projection check completed."
      }
    });

    expect(requested.payload.requiredApprovalClass).toBe("none");
    expect(completed.type).toBe("agent.tool.completed");
    expect((await ledger.readAll()).map((event) => event.type)).toEqual(["agent.tool.requested", "agent.tool.completed"]);
  });

  it("records secret-safe failures and blocks failed request completion", async () => {
    const ledger = new InMemoryEventLedger();
    const gateway = createAgentToolGateway({ ledger, actor: agentActor, now: fixedNow });

    await gateway.requestTool({
      toolRequestId: "toolreq_local_failed",
      residentAgentId: "agent_default",
      taskId: "task_local",
      runId: "run_local",
      toolId: "projection.read",
      sideEffectClass: "read-only",
      preview: { summary: "Read local projection status.", relatedEventIds: ["evt_projection_check"] }
    });

    await expect(
      gateway.failTool({
        toolRequestId: "toolreq_local_failed",
        category: "projection-lag",
        message: "api key sk-live-value leaked into an error",
        retryable: false,
        allowedActions: ["inspect safe diagnostics"]
      })
    ).rejects.toThrow(/secret-safe/i);

    await gateway.failTool({
      toolRequestId: "toolreq_local_failed",
      category: "projection-lag",
      message: "Local projection is stale.",
      retryable: true,
      allowedActions: ["rebuild the stale projection before retrying"]
    });

    await expect(
      gateway.completeTool({
        toolRequestId: "toolreq_local_failed",
        result: { eventIds: [], artifactHashes: [], readModelChanges: [] }
      })
    ).rejects.toThrow(/failed/i);
  });

  it("hashes previews with stable key ordering", async () => {
    const ledger = new InMemoryEventLedger();
    const gateway = createAgentToolGateway({ ledger, actor: agentActor, now: fixedNow });

    const first = await gateway.requestTool({
      toolRequestId: "toolreq_hash_a",
      residentAgentId: "agent_default",
      taskId: "task_hash",
      runId: "run_hash",
      toolId: "projection.read",
      sideEffectClass: "read-only",
      preview: { summary: "Read local projection status.", relatedEventIds: ["evt_projection_check"] }
    });
    const second = await gateway.requestTool({
      toolRequestId: "toolreq_hash_b",
      residentAgentId: "agent_default",
      taskId: "task_hash",
      runId: "run_hash",
      toolId: "projection.read",
      sideEffectClass: "read-only",
      preview: { relatedEventIds: ["evt_projection_check"], summary: "Read local projection status." }
    });

    expect(second.payload.previewHash).toBe(first.payload.previewHash);
  });

  it("hashes nested preview objects with stable key ordering", async () => {
    const ledger = new InMemoryEventLedger();
    const gateway = createAgentToolGateway({ ledger, actor: agentActor, now: fixedNow });

    const first = await gateway.requestTool({
      toolRequestId: "toolreq_nested_hash_a",
      residentAgentId: "agent_default",
      taskId: "task_hash",
      runId: "run_hash",
      toolId: "projection.read",
      sideEffectClass: "read-only",
      preview: {
        summary: "Read nested projection status.",
        relatedEventIds: ["evt_projection_check"],
        nested: { b: { y: 2, x: 1 }, a: [{ d: 4, c: 3 }] }
      }
    });
    const second = await gateway.requestTool({
      toolRequestId: "toolreq_nested_hash_b",
      residentAgentId: "agent_default",
      taskId: "task_hash",
      runId: "run_hash",
      toolId: "projection.read",
      sideEffectClass: "read-only",
      preview: {
        nested: { a: [{ c: 3, d: 4 }], b: { x: 1, y: 2 } },
        relatedEventIds: ["evt_projection_check"],
        summary: "Read nested projection status."
      }
    });

    expect(second.payload.previewHash).toBe(first.payload.previewHash);
  });
});

type InterleavedLifecycleEventType = "agent.tool.denied" | "agent.tool.failed";

class InterleavingLedger implements EventLedger {
  private injected = false;

  constructor(
    private readonly inner: InMemoryEventLedger,
    private readonly interleavedEventType: InterleavedLifecycleEventType
  ) {}

  async append(event: AppendableKnowledgeEvent, options?: AppendOptions) {
    if (!this.injected && event.type === "agent.tool.completed") {
      this.injected = true;
      await this.inner.append(this.buildInterleavedEvent(event));
    }
    return this.inner.append(event, options);
  }

  readStream(streamId: string) {
    return this.inner.readStream(streamId);
  }

  readAll() {
    return this.inner.readAll();
  }

  private buildInterleavedEvent(
    completedEvent: AppendableKnowledgeEvent<"agent.tool.completed">
  ): AppendableKnowledgeEvent<InterleavedLifecycleEventType> {
    if (this.interleavedEventType === "agent.tool.denied") {
      return {
        type: "agent.tool.denied",
        version: 1,
        streamId: completedEvent.streamId,
        context: {
          actor: humanActor,
          occurredAt: fixedNow(),
          correlationId: "corr_interleaved_denial",
          coreVersion: "0.1.0",
          packVersions: { core: "0.1.0", agent: "0.1.0" }
        },
        payload: {
          toolRequestId: completedEvent.payload.toolRequestId,
          deniedBy: humanActor.id,
          rationale: "Human denial arrived before completion append.",
          deniedAt: fixedNow(),
          approvalClass: "external-message-send"
        }
      };
    }

    return {
      type: "agent.tool.failed",
      version: 1,
      streamId: completedEvent.streamId,
      context: {
        actor: agentActor,
        occurredAt: fixedNow(),
        correlationId: "corr_interleaved_failure",
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0", agent: "0.1.0" }
      },
      payload: {
        toolRequestId: completedEvent.payload.toolRequestId,
        failedAt: fixedNow(),
        category: "approval-stale",
        message: "Tool request became stale before completion.",
        retryable: false,
        allowedActions: ["open a fresh tool request"]
      }
    };
  }
}

async function captureError(action: () => Promise<unknown>): Promise<unknown> {
  try {
    await action();
    return undefined;
  } catch (error) {
    return error;
  }
}
