import { describe, expect, it } from "vitest";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
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
});
