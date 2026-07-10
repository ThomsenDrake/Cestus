import { describe, expect, it } from "vitest";
import type { AppendableKnowledgeEvent } from "../../ontology/src/contracts.js";
import { InMemoryEventLedger, type AppendOptions, type EventLedger } from "../../ontology/src/event-ledger.js";
import { createAgentToolGateway } from "../src/tool-gateway.js";

const agentActor = { id: "actor_cestus_agent", kind: "agent" as const, label: "Cestus Agent" };
const humanActor = { id: "actor_case_owner", kind: "human" as const, label: "Case Owner" };
const policyActor = { id: "actor_policy_guard", kind: "system" as const, label: "Policy Guard" };
const schedulerActor = { id: "actor_agent_scheduler", kind: "system" as const, label: "Agent Scheduler" };
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

  it("keeps human-review approval aligned with the ontology side-effect matrix", async () => {
    const ledger = new InMemoryEventLedger();
    const gateway = createAgentToolGateway({ ledger, actor: agentActor, now: fixedNow });

    await expect(gateway.requestTool({
      toolRequestId: "toolreq_bad_human_review_matrix",
      residentAgentId: "agent_default",
      taskId: "task_review_matrix",
      runId: "run_review_matrix",
      toolId: "claim.review.request",
      sideEffectClass: "ledger-review",
      preview: { summary: "Request accepted-graph review.", relatedEventIds: ["evt_review_source"] },
      requiredApprovalClass: "human-review"
    })).rejects.toThrow(/sideEffectClass risk|requiredApprovalClass/i);

    expect(await ledger.readAll()).toEqual([]);

    const requested = await gateway.requestTool({
      toolRequestId: "toolreq_good_human_review_matrix",
      residentAgentId: "agent_default",
      taskId: "task_review_matrix",
      runId: "run_review_matrix",
      toolId: "governance.classification.propose",
      sideEffectClass: "ledger-proposal",
      preview: { summary: "Queue an inert human review.", relatedEventIds: ["evt_review_source"] },
      requiredApprovalClass: "human-review"
    });

    expect(requested.payload.requiredApprovalClass).toBe("human-review");
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

  it("claims approved tool execution with a lease before external effects run", async () => {
    const ledger = new InMemoryEventLedger();
    const gateway = createAgentToolGateway({ ledger, actor: agentActor, now: fixedNow });

    const requested = await gateway.requestTool({
      toolRequestId: "toolreq_execution_claim",
      residentAgentId: "agent_default",
      taskId: "task_claim",
      runId: "run_claim",
      toolId: "ledger.review.claim",
      sideEffectClass: "ledger-review",
      preview: { summary: "Review ledger proposal after claim.", relatedEventIds: ["evt_claim_source"] },
      requiredApprovalClass: "ledger-review"
    });
    await gateway.approveTool({
      toolRequestId: "toolreq_execution_claim",
      approvedPreviewHash: requested.payload.previewHash,
      actor: humanActor,
      rationale: "Human approved the exact claim preview."
    });

    const claimed = await claimCapableGateway(gateway).claimExecution({
      toolRequestId: "toolreq_execution_claim",
      approvedPreviewHash: requested.payload.previewHash,
      leaseExpiresAt: "2026-07-07T18:35:00.000Z"
    });

    expect(claimed.type).toBe("agent.tool.execution.claimed");
    expect(claimed.payload).toEqual({
      toolRequestId: "toolreq_execution_claim",
      claimedBy: agentActor.id,
      claimedAt: fixedNow(),
      approvedPreviewHash: requested.payload.previewHash,
      leaseExpiresAt: "2026-07-07T18:35:00.000Z"
    });
    await expect(
      claimCapableGateway(gateway).claimExecution({
        toolRequestId: "toolreq_execution_claim",
        approvedPreviewHash: requested.payload.previewHash,
        leaseExpiresAt: "2026-07-07T18:36:00.000Z"
      })
    ).rejects.toThrow(/claim|lease|execution/i);
    expect((await ledger.readAll()).map((event) => event.type)).toEqual([
      "agent.tool.requested",
      "agent.tool.approved",
      "agent.tool.execution.claimed"
    ]);
  });

  it("allows re-claiming approved execution after the previous lease expires", async () => {
    const ledger = new InMemoryEventLedger();
    const firstGateway = createAgentToolGateway({ ledger, actor: agentActor, now: fixedNow });

    const requested = await firstGateway.requestTool({
      toolRequestId: "toolreq_execution_reclaim",
      residentAgentId: "agent_default",
      taskId: "task_claim",
      runId: "run_claim",
      toolId: "ledger.review.claim",
      sideEffectClass: "ledger-review",
      preview: { summary: "Review ledger proposal after re-claim.", relatedEventIds: ["evt_claim_source"] },
      requiredApprovalClass: "ledger-review"
    });
    await firstGateway.approveTool({
      toolRequestId: "toolreq_execution_reclaim",
      approvedPreviewHash: requested.payload.previewHash,
      actor: humanActor,
      rationale: "Human approved the exact re-claim preview."
    });
    await claimCapableGateway(firstGateway).claimExecution({
      toolRequestId: "toolreq_execution_reclaim",
      approvedPreviewHash: requested.payload.previewHash,
      leaseExpiresAt: "2026-07-07T18:31:00.000Z"
    });

    const laterGateway = createAgentToolGateway({
      ledger,
      actor: agentActor,
      now: () => "2026-07-07T18:32:00.000Z"
    });
    const reclaimed = await claimCapableGateway(laterGateway).claimExecution({
      toolRequestId: "toolreq_execution_reclaim",
      approvedPreviewHash: requested.payload.previewHash,
      leaseExpiresAt: "2026-07-07T18:37:00.000Z"
    });

    expect(reclaimed.payload).toMatchObject({
      toolRequestId: "toolreq_execution_reclaim",
      claimedAt: "2026-07-07T18:32:00.000Z",
      leaseExpiresAt: "2026-07-07T18:37:00.000Z"
    });
    expect((await ledger.readAll()).map((event) => event.type)).toEqual([
      "agent.tool.requested",
      "agent.tool.approved",
      "agent.tool.execution.claimed",
      "agent.tool.execution.claimed"
    ]);
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

  it("rejects directly appended forged resident approvals at completion time", async () => {
    const ledger = new InMemoryEventLedger();
    const gateway = createAgentToolGateway({ ledger, actor: agentActor, now: fixedNow });

    const requested = await gateway.requestTool({
      toolRequestId: "toolreq_forged_direct_resident",
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

    await ledger.append({
      type: "agent.tool.approved",
      version: 1,
      streamId: "agent_tool_request_toolreq_forged_direct_resident",
      context: {
        actor: { id: "agent_default", kind: "human", label: "Forged Human Agent" },
        occurredAt: fixedNow(),
        causationId: requested.id,
        correlationId: "corr_toolreq_forged_direct_resident",
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0", agent: "0.1.0" }
      },
      payload: {
        toolRequestId: "toolreq_forged_direct_resident",
        approvedBy: "agent_default",
        approvedPreviewHash: requested.payload.previewHash,
        approvalClass: requested.payload.requiredApprovalClass,
        rationale: "Forged resident approval.",
        approvedAt: fixedNow()
      }
    });

    const error = await captureError(() =>
      gateway.completeTool({
        toolRequestId: "toolreq_forged_direct_resident",
        approvedPreviewHash: requested.payload.previewHash,
        result: {
          eventIds: [],
          artifactHashes: [],
          readModelChanges: [{ projectionName: "agent-tool-requests", change: "Should not complete." }],
          resultSummary: "Should not complete."
        }
      })
    );

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/approval/i);
    expect((error as Error).message).not.toContain("agent_default");
    expect((await ledger.readAll()).map((event) => event.type)).toEqual([
      "agent.tool.requested",
      "agent.tool.approved"
    ]);
  });

  it.each([
    ["missing", {}],
    ["wrong", { causationId: "evt_wrong_tool_request" }]
  ] as const)("rejects directly appended human approvals with %s request causation", async (_label, contextCausation) => {
    const ledger = new InMemoryEventLedger();
    const gateway = createAgentToolGateway({ ledger, actor: agentActor, now: fixedNow });

    const requested = await gateway.requestTool({
      toolRequestId: `toolreq_direct_human_${_label}_causation`,
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

    const approval: AppendableKnowledgeEvent<"agent.tool.approved"> = {
      type: "agent.tool.approved",
      version: 1,
      streamId: `agent_tool_request_toolreq_direct_human_${_label}_causation`,
      context: {
        actor: humanActor,
        occurredAt: fixedNow(),
        ...contextCausation,
        correlationId: `corr_toolreq_direct_human_${_label}_causation`,
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0", agent: "0.1.0" }
      },
      payload: {
        toolRequestId: `toolreq_direct_human_${_label}_causation`,
        approvedBy: humanActor.id,
        approvedPreviewHash: requested.payload.previewHash,
        approvalClass: requested.payload.requiredApprovalClass,
        rationale: "Human-looking approval was appended outside the gateway.",
        approvedAt: fixedNow()
      }
    };
    await ledger.append(approval);

    const error = await captureError(() =>
      gateway.completeTool({
        toolRequestId: `toolreq_direct_human_${_label}_causation`,
        approvedPreviewHash: requested.payload.previewHash,
        result: {
          eventIds: [],
          artifactHashes: [],
          readModelChanges: [{ projectionName: "agent-tool-requests", change: "Should not complete." }],
          resultSummary: "Should not complete."
        }
      })
    );

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/approval/i);
    expect((await ledger.readAll()).map((event) => event.type)).toEqual([
      "agent.tool.requested",
      "agent.tool.approved"
    ]);
  });

  it("rejects claim execution with directly appended approval by the original request actor", async () => {
    const ledger = new InMemoryEventLedger();
    const requestGateway = createAgentToolGateway({ ledger, actor: agentActor, now: fixedNow });
    const consumingGateway = createAgentToolGateway({ ledger, actor: schedulerActor, now: fixedNow });

    const requested = await requestGateway.requestTool({
      toolRequestId: "toolreq_direct_request_actor_claim",
      residentAgentId: "agent_default",
      taskId: "task_claim",
      runId: "run_claim",
      toolId: "ledger.review.claim",
      sideEffectClass: "ledger-review",
      preview: { summary: "Review ledger proposal after claim.", relatedEventIds: ["evt_claim_source"] },
      requiredApprovalClass: "ledger-review"
    });
    await ledger.append({
      type: "agent.tool.approved",
      version: 1,
      streamId: "agent_tool_request_toolreq_direct_request_actor_claim",
      context: {
        actor: { id: agentActor.id, kind: "human", label: "Spoofed Original Request Actor" },
        occurredAt: fixedNow(),
        causationId: requested.id,
        correlationId: "corr_toolreq_direct_request_actor_claim",
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0", agent: "0.1.0" }
      },
      payload: {
        toolRequestId: "toolreq_direct_request_actor_claim",
        approvedBy: agentActor.id,
        approvedPreviewHash: requested.payload.previewHash,
        approvalClass: requested.payload.requiredApprovalClass,
        rationale: "Spoofed approval by the original request event actor.",
        approvedAt: fixedNow()
      }
    });

    const error = await captureError(() =>
      claimCapableGateway(consumingGateway).claimExecution({
        toolRequestId: "toolreq_direct_request_actor_claim",
        approvedPreviewHash: requested.payload.previewHash,
        leaseExpiresAt: "2026-07-07T18:35:00.000Z"
      })
    );

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/approval/i);
    expect((error as Error).message).not.toContain(agentActor.id);
    expect((await ledger.readAll()).map((event) => event.type)).toEqual([
      "agent.tool.requested",
      "agent.tool.approved"
    ]);
  });

  it("rejects completion with directly appended approval by the original request actor", async () => {
    const ledger = new InMemoryEventLedger();
    const requestGateway = createAgentToolGateway({ ledger, actor: agentActor, now: fixedNow });
    const consumingGateway = createAgentToolGateway({ ledger, actor: schedulerActor, now: fixedNow });

    const requested = await requestGateway.requestTool({
      toolRequestId: "toolreq_direct_request_actor_complete",
      residentAgentId: "agent_default",
      taskId: "task_claim",
      runId: "run_claim",
      toolId: "ledger.review.claim",
      sideEffectClass: "ledger-review",
      preview: { summary: "Review ledger proposal before completion.", relatedEventIds: ["evt_claim_source"] },
      requiredApprovalClass: "ledger-review"
    });
    await ledger.append({
      type: "agent.tool.approved",
      version: 1,
      streamId: "agent_tool_request_toolreq_direct_request_actor_complete",
      context: {
        actor: { id: agentActor.id, kind: "human", label: "Spoofed Original Request Actor" },
        occurredAt: fixedNow(),
        causationId: requested.id,
        correlationId: "corr_toolreq_direct_request_actor_complete",
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0", agent: "0.1.0" }
      },
      payload: {
        toolRequestId: "toolreq_direct_request_actor_complete",
        approvedBy: agentActor.id,
        approvedPreviewHash: requested.payload.previewHash,
        approvalClass: requested.payload.requiredApprovalClass,
        rationale: "Spoofed approval by the original request event actor.",
        approvedAt: fixedNow()
      }
    });

    const error = await captureError(() =>
      consumingGateway.completeTool({
        toolRequestId: "toolreq_direct_request_actor_complete",
        approvedPreviewHash: requested.payload.previewHash,
        result: {
          eventIds: [],
          artifactHashes: [],
          readModelChanges: [{ projectionName: "agent-tool-requests", change: "Should not complete." }],
          resultSummary: "Should not complete."
        }
      })
    );

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/approval/i);
    expect((error as Error).message).not.toContain(agentActor.id);
    expect((await ledger.readAll()).map((event) => event.type)).toEqual([
      "agent.tool.requested",
      "agent.tool.approved"
    ]);
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

  it("rejects forged approval causation on no-approval requests", async () => {
    const ledger = new InMemoryEventLedger();
    const gateway = createAgentToolGateway({ ledger, actor: agentActor, now: fixedNow });

    const requested = await gateway.requestTool({
      toolRequestId: "toolreq_projection_forged_none",
      residentAgentId: "agent_default",
      taskId: "task_projection",
      runId: "run_projection",
      toolId: "projection.read",
      sideEffectClass: "read-only",
      preview: { summary: "Read local projection status.", relatedEventIds: ["evt_projection_check"] }
    });

    await ledger.append({
      type: "agent.tool.approved",
      version: 1,
      streamId: "agent_tool_request_toolreq_projection_forged_none",
      context: {
        actor: humanActor,
        occurredAt: fixedNow(),
        causationId: requested.id,
        correlationId: "corr_toolreq_projection_forged_none",
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0", agent: "0.1.0" }
      },
      payload: {
        toolRequestId: "toolreq_projection_forged_none",
        approvedBy: humanActor.id,
        approvedPreviewHash: requested.payload.previewHash,
        approvalClass: "none",
        rationale: "Forged approval for an ungated read.",
        approvedAt: fixedNow()
      }
    });

    await expect(
      gateway.completeTool({
        toolRequestId: "toolreq_projection_forged_none",
        result: {
          eventIds: [],
          artifactHashes: [],
          readModelChanges: [{ projectionName: "agent-tool-requests", change: "Should not complete." }],
          resultSummary: "Should not complete."
        }
      })
    ).rejects.toThrow(/approval/i);

    expect((await ledger.readAll()).map((event) => event.type)).toEqual([
      "agent.tool.requested",
      "agent.tool.approved"
    ]);
  });

  it("rejects secret-shaped completion event IDs without appending lifecycle events", async () => {
    const ledger = new InMemoryEventLedger();
    const gateway = createAgentToolGateway({ ledger, actor: agentActor, now: fixedNow });
    const badEventId = "evt_sk_live_value";

    await gateway.requestTool({
      toolRequestId: "toolreq_projection_bad_result",
      residentAgentId: "agent_default",
      taskId: "task_projection",
      runId: "run_projection",
      toolId: "projection.read",
      sideEffectClass: "read-only",
      preview: { summary: "Read local projection status.", relatedEventIds: ["evt_projection_check"] }
    });

    const error = await captureError(() =>
      gateway.completeTool({
        toolRequestId: "toolreq_projection_bad_result",
        result: {
          eventIds: [badEventId],
          artifactHashes: [],
          readModelChanges: [],
          resultSummary: "Read-only projection check completed."
        }
      })
    );

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/event id/i);
    expect((error as Error).message).not.toContain(badEventId);
    expect((error as Error).message).not.toMatch(/sk[_-]live/i);
    expect((await ledger.readAll()).map((event) => event.type)).toEqual(["agent.tool.requested"]);
  });

  it("keeps ordinary preview and result DTO keys valid", async () => {
    const ledger = new InMemoryEventLedger();
    const gateway = createAgentToolGateway({ ledger, actor: agentActor, now: fixedNow });

    await gateway.requestTool({
      toolRequestId: "toolreq_preview_domain_fields",
      residentAgentId: "agent_default",
      taskId: "task_projection",
      runId: "run_projection",
      toolId: "projection.read",
      sideEffectClass: "read-only",
      preview: {
        summary: "Read local projection status.",
        relatedEventIds: ["evt_projection_check"],
        artifactHashes: ["sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"],
        affectedRefs: ["ev_contract_001"],
        scope: "Projection readiness scope.",
        estimatedEffect: "Projection read has no external effect."
      }
    });

    const completed = await gateway.completeTool({
      toolRequestId: "toolreq_preview_domain_fields",
      result: {
        eventIds: ["evt_projection_result"],
        artifactHashes: ["sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"],
        readModelChanges: [{
          projectionName: "agent-tool-requests",
          change: "Recorded projection read.",
          relatedIds: ["projection-agent-tool-requests"]
        }],
        resultSummary: "Projection read completed."
      }
    });

    expect(completed.type).toBe("agent.tool.completed");
    expect((await ledger.readAll()).map((event) => event.type)).toEqual(["agent.tool.requested", "agent.tool.completed"]);
  });

  it.each([
    ["api_key", "a"],
    ["authorization", "b"]
  ] as const)(
    "rejects secret-shaped preview key %s without appending request events",
    async (secretKey, idSuffix) => {
      const ledger = new InMemoryEventLedger();
      const gateway = createAgentToolGateway({ ledger, actor: agentActor, now: fixedNow });
      const secretValue = "redacted";

      const error = await captureError(() =>
        gateway.requestTool({
          toolRequestId: `toolreq_preview_field_${idSuffix}`,
          residentAgentId: "agent_default",
          taskId: "task_projection",
          runId: "run_projection",
          toolId: "projection.read",
          sideEffectClass: "read-only",
          preview: {
            summary: "Read local projection status.",
            [secretKey]: secretValue
          }
        })
      );

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/secret-safe/i);
      expect((error as Error).message).not.toContain(secretKey);
      expect((error as Error).message).not.toContain(secretValue);
      expect(await ledger.readAll()).toEqual([]);
    }
  );

  it("rejects preview accessors without invoking getters", async () => {
    const ledger = new InMemoryEventLedger();
    const gateway = createAgentToolGateway({ ledger, actor: agentActor, now: fixedNow });
    let getterCalls = 0;
    const preview = {
      summary: "Read local projection status."
    } as { summary: string; unsafe?: string };
    Object.defineProperty(preview, "unsafe", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "api key sk-live-value";
      }
    });

    const error = await captureError(() =>
      gateway.requestTool({
        toolRequestId: "toolreq_accessor_preview",
        residentAgentId: "agent_default",
        taskId: "task_projection",
        runId: "run_projection",
        toolId: "projection.read",
        sideEffectClass: "read-only",
        preview
      })
    );

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/preview/i);
    expect(getterCalls).toBe(0);
    expect(await ledger.readAll()).toEqual([]);
  });

  it("rejects symbol-keyed preview metadata", async () => {
    const ledger = new InMemoryEventLedger();
    const gateway = createAgentToolGateway({ ledger, actor: agentActor, now: fixedNow });
    const metadata = Symbol("metadata");
    const preview = {
      summary: "Read local projection status.",
      [metadata]: "hidden metadata"
    } as AgentPreviewWithSymbol;

    const error = await captureError(() =>
      gateway.requestTool({
        toolRequestId: "toolreq_symbol_preview",
        residentAgentId: "agent_default",
        taskId: "task_projection",
        runId: "run_projection",
        toolId: "projection.read",
        sideEffectClass: "read-only",
        preview
      })
    );

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/preview/i);
    expect(await ledger.readAll()).toEqual([]);
  });

  it("rejects __proto__ preview keys without appending or echoing unsafe data", async () => {
    const ledger = new InMemoryEventLedger();
    const gateway = createAgentToolGateway({ ledger, actor: agentActor, now: fixedNow });
    const preview = {
      summary: "Read local projection status."
    } as { summary: string; "__proto__"?: unknown };
    Object.defineProperty(preview, "__proto__", {
      enumerable: true,
      value: {
        relatedEventIds: ["evt_proto_hidden"],
        scope: "Prototype-bound scope should never emit."
      }
    });

    const error = await captureError(() =>
      gateway.requestTool({
        toolRequestId: "toolreq_proto_preview",
        residentAgentId: "agent_default",
        taskId: "task_projection",
        runId: "run_projection",
        toolId: "projection.read",
        sideEffectClass: "read-only",
        preview
      })
    );

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/preview/i);
    expect((error as Error).message).not.toContain("__proto__");
    expect((error as Error).message).not.toContain("evt_proto_hidden");
    expect((error as Error).message).not.toContain("Prototype-bound scope");
    expect(await ledger.readAll()).toEqual([]);
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

  it("records extended failure categories for domain execution scaffolding", async () => {
    const ledger = new InMemoryEventLedger();
    const gateway = createAgentToolGateway({ ledger, actor: agentActor, now: fixedNow });

    await gateway.requestTool({
      toolRequestId: "toolreq_domain_stale_source",
      residentAgentId: "agent_default",
      taskId: "task_domain",
      runId: "run_domain",
      toolId: "provider.bytes.transfer",
      toolVersion: "0.1.0",
      sideEffectClass: "external-byte-transfer",
      preview: { summary: "Resume the approved provider transfer.", relatedEventIds: ["evt_provider_preview"] },
      requiredApprovalClass: "provider-byte-transfer"
    });

    const failed = await gateway.failTool({
      toolRequestId: "toolreq_domain_stale_source",
      category: "stale-source",
      message: "Approved source hashes no longer match the current evidence state.",
      retryable: false,
      allowedActions: ["request a fresh approval for the current source hashes"]
    });

    expect(failed.type).toBe("agent.tool.failed");
    expect(failed.payload.category).toBe("stale-source");
  });

  it("does not let denial or failure overwrite terminal request state", async () => {
    const ledger = new InMemoryEventLedger();
    const gateway = createAgentToolGateway({ ledger, actor: agentActor, now: fixedNow });

    await gateway.requestTool({
      toolRequestId: "toolreq_terminal_denied",
      residentAgentId: "agent_default",
      taskId: "task_projection",
      runId: "run_projection",
      toolId: "projection.read",
      sideEffectClass: "read-only",
      preview: { summary: "Read local projection status.", relatedEventIds: ["evt_projection_check"] }
    });
    await gateway.denyTool({
      toolRequestId: "toolreq_terminal_denied",
      actor: policyActor,
      rationale: "Policy denied the read."
    });
    await expect(
      gateway.denyTool({
        toolRequestId: "toolreq_terminal_denied",
        actor: policyActor,
        rationale: "Second denial should not append."
      })
    ).rejects.toThrow(/denied/i);
    await expect(
      gateway.failTool({
        toolRequestId: "toolreq_terminal_denied",
        category: "projection-lag",
        message: "Failure should not overwrite denial.",
        retryable: false,
        allowedActions: ["open a fresh request"]
      })
    ).rejects.toThrow(/denied/i);

    await gateway.requestTool({
      toolRequestId: "toolreq_terminal_failed",
      residentAgentId: "agent_default",
      taskId: "task_projection",
      runId: "run_projection",
      toolId: "projection.read",
      sideEffectClass: "read-only",
      preview: { summary: "Read local projection status.", relatedEventIds: ["evt_projection_check"] }
    });
    await gateway.failTool({
      toolRequestId: "toolreq_terminal_failed",
      category: "projection-lag",
      message: "Local projection is stale.",
      retryable: true,
      allowedActions: ["rebuild the stale projection before retrying"]
    });
    await expect(
      gateway.denyTool({
        toolRequestId: "toolreq_terminal_failed",
        actor: policyActor,
        rationale: "Denial should not overwrite failure."
      })
    ).rejects.toThrow(/failed/i);
    await expect(
      gateway.failTool({
        toolRequestId: "toolreq_terminal_failed",
        category: "projection-lag",
        message: "Second failure should not append.",
        retryable: false,
        allowedActions: ["open a fresh request"]
      })
    ).rejects.toThrow(/failed/i);

    await gateway.requestTool({
      toolRequestId: "toolreq_terminal_completed",
      residentAgentId: "agent_default",
      taskId: "task_projection",
      runId: "run_projection",
      toolId: "projection.read",
      sideEffectClass: "read-only",
      preview: { summary: "Read local projection status.", relatedEventIds: ["evt_projection_check"] }
    });
    await gateway.completeTool({
      toolRequestId: "toolreq_terminal_completed",
      result: { eventIds: [], artifactHashes: [], readModelChanges: [] }
    });
    await expect(
      gateway.denyTool({
        toolRequestId: "toolreq_terminal_completed",
        actor: policyActor,
        rationale: "Denial should not overwrite completion."
      })
    ).rejects.toThrow(/completed/i);
    await expect(
      gateway.failTool({
        toolRequestId: "toolreq_terminal_completed",
        category: "projection-lag",
        message: "Failure should not overwrite completion.",
        retryable: false,
        allowedActions: ["open a fresh request"]
      })
    ).rejects.toThrow(/completed/i);

    expect((await ledger.readAll()).map((event) => event.type)).toEqual([
      "agent.tool.requested",
      "agent.tool.denied",
      "agent.tool.requested",
      "agent.tool.failed",
      "agent.tool.requested",
      "agent.tool.completed"
    ]);
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

type AgentPreviewWithSymbol = {
  readonly summary: string;
  readonly [key: symbol]: string;
};

type ClaimCapableGateway = ReturnType<typeof createAgentToolGateway> & {
  readonly claimExecution: (command: {
    readonly toolRequestId: string;
    readonly approvedPreviewHash: string;
    readonly leaseExpiresAt: string;
  }) => Promise<{
    readonly type: "agent.tool.execution.claimed";
    readonly payload: {
      readonly toolRequestId: string;
      readonly claimedBy: string;
      readonly claimedAt: string;
      readonly approvedPreviewHash: string;
      readonly leaseExpiresAt: string;
    };
  }>;
};

function claimCapableGateway(gateway: ReturnType<typeof createAgentToolGateway>): ClaimCapableGateway {
  return gateway as unknown as ClaimCapableGateway;
}

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
