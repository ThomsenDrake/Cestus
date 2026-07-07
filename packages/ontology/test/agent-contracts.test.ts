import { describe, expect, it } from "vitest";
import { validateKnowledgeEvent } from "../src/contracts.js";

const context = {
  actor: { id: "actor_cestus_agent", kind: "agent" as const, label: "Cestus Agent" },
  occurredAt: "2026-07-07T18:00:00.000Z",
  correlationId: "corr_agent_foundation",
  coreVersion: "0.1.0",
  packVersions: { core: "0.1.0", agent: "0.1.0" }
};

const humanContext = {
  ...context,
  actor: { id: "actor_case_owner", kind: "human" as const, label: "Case Owner" }
};

const hash111 = "sha256:1111111111111111111111111111111111111111111111111111111111111111";
const hash222 = "sha256:2222222222222222222222222222222222222222222222222222222222222222";
const hash333 = "sha256:3333333333333333333333333333333333333333333333333333333333333333";

function agentEvent(id: string, type: string, streamId: string, payload: Record<string, unknown>) {
  return {
    id,
    type,
    version: 1,
    streamId,
    sequence: 1,
    context,
    payload
  };
}

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

  it("rejects unknown payload fields independently", () => {
    const validPayload = {
      invocationId: "inv_001",
      runId: "run_001",
      providerId: "provider_fake",
      modelFamily: "fake-local",
      inputArtifactHash: hash111,
      safetyClass: "workspace-safe",
      credentialRefId: "agent_credref_local"
    };

    expect(
      validateKnowledgeEvent(
        agentEvent(
          "evt_agent_model_requested",
          "agent.model-invocation.requested",
          "agent_model_invocation_inv_001",
          validPayload
        )
      ).success
    ).toBe(true);
    expect(
      validateKnowledgeEvent(
        agentEvent(
          "evt_agent_model_requested_extra",
          "agent.model-invocation.requested",
          "agent_model_invocation_inv_001",
          { ...validPayload, unexpected: true }
        )
      ).success
    ).toBe(false);
  });

  it("rejects secret-shaped credential references independently", () => {
    expect(
      validateKnowledgeEvent(
        agentEvent(
          "evt_agent_model_requested_secret_ref",
          "agent.model-invocation.requested",
          "agent_model_invocation_inv_001",
          {
            invocationId: "inv_001",
            runId: "run_001",
            providerId: "provider_fake",
            modelFamily: "fake-local",
            inputArtifactHash: hash111,
            safetyClass: "workspace-safe",
            credentialRefId: "agent_credref_oauth_token"
          }
        )
      ).success
    ).toBe(false);
  });

  it.each([
    ["agent_credref_local", true],
    ["agent_credref_sk_live_unsafe", false],
    ["agent_credref_ghp_abc123456789", false]
  ])("validates credential reference ID secret safety for %s", (credentialRefId, expectedSuccess) => {
    expect(
      validateKnowledgeEvent(
        agentEvent(
          `evt_agent_model_requested_${credentialRefId}`,
          "agent.model-invocation.requested",
          "agent_model_invocation_inv_001",
          {
            invocationId: "inv_001",
            runId: "run_001",
            providerId: "provider_fake",
            modelFamily: "fake-local",
            inputArtifactHash: hash111,
            safetyClass: "workspace-safe",
            credentialRefId
          }
        )
      ).success
    ).toBe(expectedSuccess);
  });

  it("rejects tool requests that understate required approval for risky side effects", () => {
    const providerTransferRequest = {
      toolRequestId: "toolreq_provider_transfer",
      runId: "run_001",
      toolId: "tool_provider_parse",
      toolVersion: "0.1.0",
      requestedBy: "agent_default",
      sideEffectClass: "external-byte-transfer",
      requiredApprovalClass: "provider-byte-transfer",
      previewHash: hash333,
      scope: "Selected evidence IDs only.",
      estimatedEffect: "Transfers approved evidence bytes to the configured provider."
    };

    expect(
      validateKnowledgeEvent(
        agentEvent(
          "evt_agent_tool_requested_provider_transfer",
          "agent.tool.requested",
          "agent_tool_request_toolreq_provider_transfer",
          providerTransferRequest
        )
      ).success
    ).toBe(true);
    expect(
      validateKnowledgeEvent(
        agentEvent(
          "evt_agent_tool_requested_understated",
          "agent.tool.requested",
          "agent_tool_request_toolreq_provider_transfer",
          { ...providerTransferRequest, requiredApprovalClass: "none" }
        )
      ).success
    ).toBe(false);
  });

  it("requires strict read model change summaries on completed tools", () => {
    const completedPayload = {
      toolRequestId: "toolreq_001",
      completedAt: "2026-07-07T18:10:00.000Z",
      eventIds: ["evt_assertion_proposed_from_tool"],
      artifactHashes: [hash333],
      readModelChanges: [
        {
          projectionName: "agent-tool-requests",
          change: "Marked the tool request completed."
        }
      ],
      resultSummary: "Created a reviewable assertion proposal."
    };

    expect(
      validateKnowledgeEvent(
        agentEvent(
          "evt_agent_tool_completed",
          "agent.tool.completed",
          "agent_tool_request_toolreq_001",
          completedPayload
        )
      ).success
    ).toBe(true);
    expect(
      validateKnowledgeEvent(
        agentEvent(
          "evt_agent_tool_completed_extra",
          "agent.tool.completed",
          "agent_tool_request_toolreq_001",
          {
            ...completedPayload,
            readModelChanges: [{ projectionName: "agent-tool-requests", change: "Completed.", unsafe: true }]
          }
        )
      ).success
    ).toBe(false);
  });

  it.each([
    {
      name: "identity update",
      event: agentEvent("evt_agent_identity_updated", "agent.identity.updated", "agent_identity_agent_default", {
        residentAgentId: "agent_default",
        updatedBy: "actor_case_owner",
        rationale: "Reviewed resident identity metadata update.",
        label: "Cestus Agent"
      })
    },
    {
      name: "policy install",
      event: agentEvent("evt_agent_policy_installed", "agent.policy.installed", "agent_policy_agent_policy_default", {
        policyId: "agent_policy_default",
        residentAgentId: "agent_default",
        version: "0.1.0",
        installedBy: "actor_case_owner",
        humanGatedActionClasses: ["external-byte-transfer"],
        allowedRunTypes: ["evidence-triage"],
        credentialKinds: ["local-no-secret"],
        rationale: "Install the default local-only resident-agent policy."
      })
    },
    {
      name: "tool approval",
      event: agentEvent("evt_agent_tool_approved", "agent.tool.approved", "agent_tool_request_toolreq_001", {
        toolRequestId: "toolreq_001",
        approvedBy: "actor_case_owner",
        approvedPreviewHash: hash222,
        approvalClass: "provider-byte-transfer",
        rationale: "Approved only for the listed evidence IDs."
      })
    },
    {
      name: "permission grant",
      event: agentEvent("evt_agent_permission_granted", "agent.permission.granted", "agent_permission_perm_read_workspace", {
        permissionId: "perm_read_workspace",
        residentAgentId: "agent_default",
        grantedBy: "actor_case_owner",
        scope: "Read workspace status projections.",
        sideEffectClasses: ["read-only"],
        rationale: "Human granted bounded read access."
      })
    },
    {
      name: "permission revoke",
      event: agentEvent("evt_agent_permission_revoked", "agent.permission.revoked", "agent_permission_perm_read_workspace", {
        permissionId: "perm_read_workspace",
        revokedBy: "actor_case_owner",
        rationale: "Review window ended."
      })
    },
    {
      name: "lock clear",
      event: agentEvent("evt_agent_lock_cleared", "agent.lock.cleared", "agent_lock_lock_legal_escalation", {
        lockId: "lock_legal_escalation",
        clearedBy: "actor_case_owner",
        rationale: "Legal counsel completed review."
      })
    }
  ])("requires human actors for $name", ({ event }) => {
    expect(validateKnowledgeEvent(event).success).toBe(false);
    expect(validateKnowledgeEvent({ ...event, context: humanContext }).success).toBe(true);
  });

  it.each([
    {
      name: "task events",
      validStreamId: "agent_task_task_001",
      payload: {
        taskId: "task_001",
        residentAgentId: "agent_default",
        title: "Review provider readiness",
        requestedBy: "actor_case_owner",
        priority: "normal"
      }
    },
    {
      name: "run events",
      validStreamId: "agent_run_run_001",
      eventType: "agent.specialist-run.started",
      payload: {
        runId: "run_001",
        residentAgentId: "agent_default",
        runType: "evidence-triage",
        startedBy: "actor_case_owner"
      }
    },
    {
      name: "tool events",
      validStreamId: "agent_tool_request_toolreq_001",
      eventType: "agent.tool.requested",
      payload: {
        toolRequestId: "toolreq_001",
        runId: "run_001",
        toolId: "tool_read_evidence",
        toolVersion: "0.1.0",
        requestedBy: "agent_default",
        sideEffectClass: "read-only",
        requiredApprovalClass: "none",
        previewHash: hash333,
        scope: "Workspace evidence metadata.",
        estimatedEffect: "Reads selected evidence metadata."
      }
    },
    {
      name: "memory events",
      validStreamId: "agent_memory_mem_workspace_policy",
      eventType: "agent.memory.recorded",
      payload: {
        memoryId: "mem_workspace_policy",
        residentAgentId: "agent_default",
        scope: "workspace",
        summary: "Use local fake providers until credentials are configured.",
        sourceEventIds: ["evt_agent_identity_initialized"],
        confidence: 0.9,
        createdAt: "2026-07-07T18:05:00.000Z"
      }
    },
    {
      name: "permission events",
      validStreamId: "agent_permission_perm_read_workspace",
      eventType: "agent.permission.granted",
      eventContext: humanContext,
      payload: {
        permissionId: "perm_read_workspace",
        residentAgentId: "agent_default",
        grantedBy: "actor_case_owner",
        scope: "Read workspace status projections.",
        sideEffectClasses: ["read-only"],
        rationale: "Human granted bounded read access."
      }
    },
    {
      name: "lock events",
      validStreamId: "agent_lock_lock_legal_escalation",
      eventType: "agent.lock.activated",
      payload: {
        lockId: "lock_legal_escalation",
        residentAgentId: "agent_default",
        kind: "legal-escalation",
        activatedBy: "actor_cestus_agent",
        reason: "Legal language requires human review."
      }
    }
  ])("enforces stream routing for $name", ({ eventType = "agent.task.created", eventContext = context, payload, validStreamId }) => {
    const validEvent = {
      id: `evt_${eventType.replaceAll(".", "_").replaceAll("-", "_")}_routing`,
      type: eventType,
      version: 1,
      streamId: validStreamId,
      sequence: 1,
      context: eventContext,
      payload
    };

    expect(validateKnowledgeEvent(validEvent).success).toBe(true);
    expect(validateKnowledgeEvent({ ...validEvent, streamId: "wrong_stream" }).success).toBe(false);
  });
});
