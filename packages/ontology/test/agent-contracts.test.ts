import { describe, expect, it } from "vitest";
import { eventContracts, validateKnowledgeEvent } from "../src/contracts.js";

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
const adapterFailureCategories = [
  "approval-required",
  "approval-denied",
  "approval-stale",
  "provider-unavailable",
  "provider-rate-limited",
  "credential-missing",
  "credential-revoked",
  "model-output-invalid",
  "secret-detected",
  "permission-denied",
  "legal-lock-active",
  "lock-active",
  "projection-lag",
  "context-budget-exceeded",
  "missing-provenance",
  "domain-gate-failed",
  "stale-source",
  "external-effect-failed",
  "data-loss-risk"
] as const;

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
  it("accepts final-output specialist steps while keeping ordinary steps valid", () => {
    const finalOutput = agentEvent(
      "evt_final_output",
      "agent.specialist-run.step.recorded",
      "agent_run_run_handoff_001",
      {
        runId: "run_handoff_001",
        stepId: "step_run_handoff_001_final_output",
        summary: "Final durable output artifacts are persisted.",
        stepKind: "final-output",
        stepSchemaId: "evidence-triage-final-output.v1",
        idempotencyKey: "specialist-final-output:run_handoff_001:task_handoff_001:evidence-triage:ready-for-review:sha256:1111111111111111111111111111111111111111111111111111111111111111",
        inputArtifactHashes: [hash111],
        outputArtifactHashes: [hash222, hash333]
      }
    );

    expect(validateKnowledgeEvent(finalOutput).success).toBe(true);
    expect(
      validateKnowledgeEvent({
        ...finalOutput,
        id: "evt_final_output_unknown",
        payload: { ...finalOutput.payload, bulkyDto: { hidden: true } }
      }).success
    ).toBe(false);

    expect(
      validateKnowledgeEvent(
        agentEvent(
          "evt_audit_step",
          "agent.specialist-run.step.recorded",
          "agent_run_run_handoff_001",
          {
            runId: "run_handoff_001",
            stepId: "step_run_handoff_001_audit",
            summary: "Audit step remains valid but is not final output.",
            outputArtifactHashes: [hash111]
          }
        )
      ).success
    ).toBe(true);
  });

  it("accepts compact handoff prepared and recorded events on the run stream", () => {
    const compactBinding = {
      handoffId: "handoff_run_handoff_001_0123456789abcdef",
      handoffRevision: 1,
      idempotencyKey: "specialist-handoff:run_handoff_001:task_handoff_001:evidence-triage:ready-for-review:sha256:2222222222222222222222222222222222222222222222222222222222222222",
      handoffManifestHash: hash222,
      handoffDtoHash: hash333,
      runId: "run_handoff_001",
      taskId: "task_handoff_001",
      runType: "evidence-triage",
      residentAgentId: "agent_default",
      status: "ready-for-review",
      safeSummary: "Evidence triage handoff is ready for human review.",
      finalOutputStepId: "step_run_handoff_001_final_output",
      finalOutputEventId: "evt_final_output",
      contextPackHashes: [hash111],
      promptArtifactHash: hash111,
      outputArtifactHashes: [hash222],
      toolRequestIds: [],
      sourceEventIds: ["evt_source_001"],
      relatedEventIds: ["evt_final_output"]
    };

    const prepared = agentEvent(
      "evt_handoff_prepared",
      "agent.specialist-handoff.prepared",
      "agent_run_run_handoff_001",
      compactBinding
    );
    expect(validateKnowledgeEvent(prepared).success).toBe(true);
    expect(validateKnowledgeEvent({ ...prepared, streamId: "agent_handoff_handoff_run_handoff_001_0123456789abcdef" }).success).toBe(false);

    expect(
      validateKnowledgeEvent(
        agentEvent(
          "evt_handoff_recorded",
          "agent.specialist-handoff.recorded",
          "agent_run_run_handoff_001",
          {
            ...compactBinding,
            preparedEventId: "evt_handoff_prepared",
            verifiedAt: "2026-07-10T14:00:00.000Z"
          }
        )
      ).success
    ).toBe(true);
  });

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

  it("accepts model invocation prompt artifact audit metadata without prompt text", () => {
    expect(
      validateKnowledgeEvent(
        agentEvent(
          "evt_agent_model_requested_prompt_audit",
          "agent.model-invocation.requested",
          "agent_model_invocation_inv_001",
          modelInvocationPromptAuditPayload()
        )
      ).success
    ).toBe(true);
  });

  it.each([
    {
      name: "credential header marker in safe prompt summary",
      patch: { safePromptSummary: unsafeCredentialHeaderMarker() }
    },
    {
      name: "private key marker in context pack summary",
      patch: { contextPackRefs: [{ ...contextPackRef(), safeSummary: unsafePrivateKeyMarker() }] }
    },
    {
      name: "credential-setting name in prompt template ID",
      patch: { promptTemplateId: unsafeCredentialSettingName() }
    },
    {
      name: "unknown context pack field",
      patch: { contextPackRefs: [{ ...contextPackRef(), unexpectedContextField: "extra metadata" }] }
    }
  ])("rejects unsafe or non-strict prompt metadata: $name", ({ patch }) => {
    expect(
      validateKnowledgeEvent(
        agentEvent(
          "evt_agent_model_requested_prompt_audit_rejected",
          "agent.model-invocation.requested",
          "agent_model_invocation_inv_001",
          { ...modelInvocationPromptAuditPayload(), ...patch }
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

  it("records memory kind while requiring provenance and non-authoritative guidance", () => {
    const result = validateKnowledgeEvent({
      id: "evt_agent_memory_recorded_operator_pref",
      type: "agent.memory.recorded",
      version: 1,
      streamId: "agent_memory_mem_operator_preference",
      sequence: 1,
      context,
      payload: {
        memoryId: "mem_operator_preference",
        residentAgentId: "agent_default",
        scope: "workspace",
        memoryKind: "operator-preference",
        summary: "Case owner prefers concise PRR draft summaries.",
        sourceEventIds: ["evt_agent_task_created"],
        confidence: 0.9,
        createdAt: "2026-07-09T12:00:00.000Z"
      }
    });

    expect(result.success).toBe(true);
    expect(eventContracts["agent.memory.recorded"].agentGuidance).toMatch(/not accepted graph state/i);
    expect(eventContracts["agent.memory.recorded"].agentGuidance).toMatch(/forbidden autonomous effects/i);
  });

  it("rejects memory records without source events or artifact hashes", () => {
    expect(
      validateKnowledgeEvent({
        id: "evt_agent_memory_recorded_unproven",
        type: "agent.memory.recorded",
        version: 1,
        streamId: "agent_memory_mem_unproven",
        sequence: 1,
        context,
        payload: {
          memoryId: "mem_unproven",
          residentAgentId: "agent_default",
          scope: "investigation",
          memoryKind: "agent-observation",
          summary: "Agency X is connected to Vendor Y.",
          confidence: 0.7,
          createdAt: "2026-07-09T12:00:00.000Z"
        }
      }).success
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
          change: "Marked the tool request completed.",
          relatedIds: ["evt_assertion_proposed_from_tool", "ent_vendor_001", "task_001"]
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
    expect(
      validateKnowledgeEvent(
        agentEvent(
          "evt_agent_tool_completed_secret_related_id",
          "agent.tool.completed",
          "agent_tool_request_toolreq_001",
          {
            ...completedPayload,
            readModelChanges: [
              {
                projectionName: "agent-tool-requests",
                change: "Completed.",
                relatedIds: ["sk_live_unsafe"]
              }
            ]
          }
        )
      ).success
    ).toBe(false);
  });

  it("validates tool execution claim events for scheduler reservations", () => {
    const claimPayload = {
      toolRequestId: "toolreq_001",
      claimedBy: "actor_agent_scheduler",
      claimedAt: "2026-07-07T18:09:00.000Z",
      approvedPreviewHash: hash222,
      leaseExpiresAt: "2026-07-07T18:14:00.000Z"
    };

    const claimEvent = agentEvent(
      "evt_agent_tool_execution_claimed",
      "agent.tool.execution.claimed",
      "agent_tool_request_toolreq_001",
      claimPayload
    );

    expect(validateKnowledgeEvent(claimEvent).success).toBe(true);
    expect(
      validateKnowledgeEvent(
        agentEvent(
          "evt_agent_tool_execution_claimed_expired",
          "agent.tool.execution.claimed",
          "agent_tool_request_toolreq_001",
          { ...claimPayload, leaseExpiresAt: "2026-07-07T18:09:00.000Z" }
        )
      ).success
    ).toBe(false);
    expect(
      validateKnowledgeEvent({ ...claimEvent, streamId: "wrong_stream" }).success
    ).toBe(false);
    expect(
      validateKnowledgeEvent(
        agentEvent(
          "evt_agent_tool_execution_claimed_extra",
          "agent.tool.execution.claimed",
          "agent_tool_request_toolreq_001",
          { ...claimPayload, unsafe: true }
        )
      ).success
    ).toBe(false);
  });

  it.each(adapterFailureCategories)(
    "accepts adapter-facing tool failure category %s",
    (category) => {
      expect(
        validateKnowledgeEvent(
          agentEvent(
            `evt_agent_tool_failed_${category.replaceAll("-", "_")}`,
            "agent.tool.failed",
            "agent_tool_request_toolreq_failure_category",
            {
              toolRequestId: "toolreq_failure_category",
              failedAt: "2026-07-07T18:11:00.000Z",
              category,
              message: "Execution stopped behind an explicit domain gate.",
              retryable: false,
              allowedActions: ["request a fresh approval after the blocking state changes"]
            }
          )
        ).success
      ).toBe(true);
    }
  );

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

function modelInvocationPromptAuditPayload(): Record<string, unknown> {
  return {
    invocationId: "inv_001",
    runId: "run_001",
    providerId: "provider_fake",
    modelFamily: "fake-local",
    inputArtifactHash: hash111,
    safetyClass: "provider-approved",
    credentialRefId: "agent_credref_local",
    credentialKind: "local-no-secret",
    contextPackRefs: [contextPackRef()],
    promptTemplateId: "resident-agent-context-pack.v1",
    promptTemplateVersion: 1,
    runType: "evidence-triage",
    safePromptSummary: "Provider-approved prompt artifact assembled from safe context pack summaries.",
    omissions: [
      {
        reason: "budget",
        sourceRef: "evidence-summary.v1",
        safeSummary: "One evidence pack was omitted because the declared size budget was reached."
      }
    ],
    transferApprovalClass: "provider-byte-transfer"
  };
}

function contextPackRef(): Record<string, unknown> {
  return {
    contextPackId: "task-run-history.v1",
    version: 1,
    contentHash: hash222,
    sizeBytes: 512,
    generatedAt: "2026-07-08T12:00:00.000Z",
    safeSummary: "One resident-agent task event.",
    provenanceRefs: ["evt_agent_task_created"],
    projectionHighWaterMark: 42,
    sourceEventIds: ["evt_agent_task_created"],
    artifactHashes: [hash333],
    policyVersion: "agent-policy-v1",
    scope: { kind: "workspace", id: "ws_case_001" },
    sizeBudgetBytes: 16384,
    stalenessInputs: [
      {
        kind: "projection-high-water-mark",
        ref: "agent.projection",
        value: "42"
      }
    ]
  };
}

function unsafeCredentialHeaderMarker(): string {
  return ["Author", "ization", ": ", "Bear", "er", " raw-provider-material"].join("");
}

function unsafePrivateKeyMarker(): string {
  return ["private", " ", "key", ": ", "raw-provider-material"].join("");
}

function unsafeCredentialSettingName(): string {
  return ["OPEN", "AI", "_", "API", "_", "KEY"].join("");
}
