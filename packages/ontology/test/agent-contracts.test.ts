import { describe, expect, it } from "vitest";
import { validateKnowledgeEvent } from "../src/contracts.js";

const context = {
  actor: { id: "actor_cestus_agent", kind: "agent" as const, label: "Cestus Agent" },
  occurredAt: "2026-07-07T18:00:00.000Z",
  correlationId: "corr_agent_foundation",
  coreVersion: "0.1.0",
  packVersions: { core: "0.1.0", agent: "0.1.0" }
};

describe("resident agent event contracts", () => {
  it("accepts the default resident identity and agent actor kind", () => {
    expect(
      validateKnowledgeEvent({
        id: "evt_agent_identity_initialized",
        type: "agent.identity.initialized",
        version: 1,
        streamId: "agent_identity_agent_default",
        sequence: 1,
        context,
        payload: {
          residentAgentId: "agent_default",
          workspaceId: "ws_case_001",
          label: "Cestus Agent",
          policyId: "agent_policy_default",
          initializedBy: "actor_case_owner"
        }
      }).success
    ).toBe(true);
  });

  it("rejects unknown payload fields and secret-shaped credential references", () => {
    expect(
      validateKnowledgeEvent({
        id: "evt_agent_model_requested",
        type: "agent.model-invocation.requested",
        version: 1,
        streamId: "agent_model_invocation_inv_001",
        sequence: 1,
        context,
        payload: {
          invocationId: "inv_001",
          runId: "run_001",
          providerId: "provider_fake",
          modelFamily: "fake-local",
          inputArtifactHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
          safetyClass: "workspace-safe",
          credentialRefId: "sk_live_unsafe",
          unexpected: true
        }
      }).success
    ).toBe(false);
  });

  it("requires human actors for tool approvals and lock clearing", () => {
    const approved = {
      id: "evt_agent_tool_approved",
      type: "agent.tool.approved",
      version: 1,
      streamId: "agent_tool_request_toolreq_001",
      sequence: 1,
      context,
      payload: {
        toolRequestId: "toolreq_001",
        approvedBy: "actor_case_owner",
        approvedPreviewHash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
        approvalClass: "provider-byte-transfer",
        rationale: "Approved only for the listed evidence IDs."
      }
    };

    expect(validateKnowledgeEvent(approved).success).toBe(false);
    expect(
      validateKnowledgeEvent({
        ...approved,
        context: { ...context, actor: { id: "actor_case_owner", kind: "human", label: "Case Owner" } }
      }).success
    ).toBe(true);
  });

  it("enforces stream routing for task, run, tool, memory, permission, and lock events", () => {
    expect(
      validateKnowledgeEvent({
        id: "evt_bad_stream",
        sequence: 1,
        type: "agent.task.created",
        version: 1,
        streamId: "wrong_stream",
        context,
        payload: {
          taskId: "task_001",
          residentAgentId: "agent_default",
          title: "Review provider readiness",
          requestedBy: "actor_case_owner",
          priority: "normal"
        }
      }).success
    ).toBe(false);
  });
});
