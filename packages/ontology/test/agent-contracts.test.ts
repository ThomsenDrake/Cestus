import { describe, expect, it } from "vitest";
import {
  eventContracts,
  hashAgentTaskOrchestratorPromptBindingReceipt,
  validateKnowledgeEvent
} from "../src/contracts.js";

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
const orchestratorAttemptId = "attempt_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const orchestratorStreamId = "agent_task_orchestration_task_001_evidence-triage";
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
  it("accepts agent.task.orchestration.claimed with stable attempt and lease generation", () => {
    expect(
      validateKnowledgeEvent(
        agentEvent(
          "evt_agent_task_orchestration_claimed",
          "agent.task.orchestration.claimed",
          orchestratorStreamId,
          taskOrchestrationClaimedPayload()
        )
      ).success
    ).toBe(true);
  });

  it("accepts agent.task.orchestration.checkpointed without raw context payload", () => {
    const checkpointed = agentEvent(
      "evt_agent_task_orchestration_checkpointed",
      "agent.task.orchestration.checkpointed",
      orchestratorStreamId,
      taskOrchestrationCheckpointedPayload()
    );

    expect(validateKnowledgeEvent(checkpointed).success).toBe(true);
    expect(
      validateKnowledgeEvent({
        ...checkpointed,
        id: "evt_agent_task_orchestration_checkpointed_provider_capabilities",
        payload: {
          ...checkpointed.payload,
          providerPosture: {
            ...(checkpointed.payload.providerPosture as Record<string, unknown>),
            capabilityIds: [
              "capability_provider_provider_nous_portal",
              "capability_model_tencent-hy3-free",
              "capability_adapter_0.1.0"
            ]
          }
        }
      }).success
    ).toBe(true);
    expect(
      validateKnowledgeEvent({
        ...checkpointed,
        id: "evt_agent_task_orchestration_checkpointed_raw_payload",
        payload: {
          ...checkpointed.payload,
          contextPayload: { raw: "resolved context payload must stay transient" }
        }
      }).success
    ).toBe(false);

    for (const [id, field] of [
      ["evt_agent_task_orchestration_checkpointed_missing_run", "runId"],
      ["evt_agent_task_orchestration_checkpointed_missing_tools", "toolRequestIds"],
      ["evt_agent_task_orchestration_checkpointed_missing_provider", "providerPosture"],
      ["evt_agent_task_orchestration_checkpointed_missing_prompt", "promptArtifactHash"],
      ["evt_agent_task_orchestration_checkpointed_missing_locks", "lockSnapshot"],
      ["evt_agent_task_orchestration_checkpointed_missing_sources", "sourceEventIds"],
      ["evt_agent_task_orchestration_checkpointed_missing_inputs", "inputArtifactHashes"]
    ] as const) {
      const payload = { ...checkpointed.payload };
      delete payload[field];
      expect(
        validateKnowledgeEvent({
          ...checkpointed,
          id,
          payload
        }).success
      ).toBe(false);
    }

    expect(
      validateKnowledgeEvent({
        ...checkpointed,
        id: "evt_agent_task_orchestration_checkpointed_empty_context",
        payload: { ...checkpointed.payload, contextBindings: [] }
      }).success
    ).toBe(false);

    expect(
      validateKnowledgeEvent({
        ...checkpointed,
        id: "evt_agent_task_orchestration_checkpointed_empty_tools",
        payload: { ...checkpointed.payload, toolRequestIds: [] }
      }).success
    ).toBe(false);
  });

  it("rejects missing unknown or unversioned durable prompt binding", () => {
    const receiptMaterial = {
      schemaVersion: "agent-task-orchestrator.prompt-binding-receipt.v1",
      taskId: "task_001",
      attemptId: orchestratorAttemptId,
      runId: "run_001",
      sourceApprovedPromptArtifactHash: hash111,
      boundPromptArtifactHash: hash222,
      generatedAt: context.occurredAt,
      approvalEventId: "evt_agent_tool_approved_provider_transfer",
      providerPostureHash: hash333,
      exactRunBindingHash: hash111,
      workspaceId: "ws_001",
      mountInstanceId: "mount_001"
    };
    const receipt = {
      ...receiptMaterial,
      receiptHash: hashAgentTaskOrchestratorPromptBindingReceipt(receiptMaterial)
    };
    const checkpointed = agentEvent(
      "evt_agent_task_orchestration_prompt_bound",
      "agent.task.orchestration.checkpointed",
      orchestratorStreamId,
      {
        ...taskOrchestrationCheckpointedPayload(),
        checkpointKind: "prompt-bound",
        checkpointedAt: receipt.generatedAt,
        promptArtifactHash: hash222,
        sourceEventIds: ["evt_agent_task_created", receipt.approvalEventId],
        inputArtifactHashes: [hash111, hash222],
        promptBindingReceipt: receipt
      }
    );

    expect(validateKnowledgeEvent(checkpointed).success).toBe(true);
    const { schemaVersion: _schemaVersion, ...versionlessReceipt } = receipt;
    for (const [suffix, promptBindingReceipt] of [
      ["unknown", { ...receipt, unexpectedReceiptField: "reject" }],
      ["missing", versionlessReceipt],
      ["v0", { ...receipt, schemaVersion: "agent-task-orchestrator.prompt-binding-receipt.v0" }]
    ] as const) {
      expect(validateKnowledgeEvent({
        ...checkpointed,
        id: `evt_agent_task_orchestration_prompt_bound_strict_${suffix}`,
        payload: { ...checkpointed.payload, promptBindingReceipt }
      }).success).toBe(false);
    }
    for (const production of [
      undefined,
      { schemaVersion: "agent-production-prompt-binding.v0" },
      { rendererId: "unversioned" }
    ]) {
      expect(validateKnowledgeEvent({
        ...checkpointed,
        id: `evt_agent_task_orchestration_prompt_bound_${String(production)}`,
        payload: {
          ...checkpointed.payload,
          promptBindingReceipt: production === undefined ? undefined : receipt,
          production
        }
      }).success).toBe(false);
    }
  });

  it("rejects prompt-bound receipts transplanted across task attempt or run identity", () => {
    const receiptMaterial = {
      schemaVersion: "agent-task-orchestrator.prompt-binding-receipt.v1",
      taskId: "task_001",
      attemptId: orchestratorAttemptId,
      runId: "run_001",
      sourceApprovedPromptArtifactHash: hash111,
      boundPromptArtifactHash: hash222,
      generatedAt: context.occurredAt,
      approvalEventId: "evt_agent_tool_approved_provider_transfer",
      providerPostureHash: hash333,
      exactRunBindingHash: hash111,
      workspaceId: "ws_001",
      mountInstanceId: "mount_001"
    };
    const receipt = {
      ...receiptMaterial,
      receiptHash: hashAgentTaskOrchestratorPromptBindingReceipt(receiptMaterial)
    };
    const checkpointed = agentEvent(
      "evt_agent_task_orchestration_prompt_bound_identity",
      "agent.task.orchestration.checkpointed",
      orchestratorStreamId,
      {
        ...taskOrchestrationCheckpointedPayload(),
        checkpointKind: "prompt-bound",
        checkpointedAt: receipt.generatedAt,
        promptArtifactHash: hash222,
        sourceEventIds: ["evt_agent_task_created", receipt.approvalEventId],
        inputArtifactHashes: [hash111, hash222],
        promptBindingReceipt: receipt
      }
    );

    for (const [field, value] of [
      ["taskId", "task_002"],
      ["attemptId", "attempt_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"],
      ["runId", "run_002"]
    ] as const) {
      expect(validateKnowledgeEvent({
        ...checkpointed,
        id: `evt_agent_task_orchestration_prompt_bound_transplanted_${field}`,
        payload: { ...checkpointed.payload, [field]: value }
      }).success).toBe(false);
    }

    for (const [field, value] of [
      ["taskId", "task_002"],
      ["attemptId", "attempt_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"],
      ["runId", "run_002"]
    ] as const) {
      const transplantedMaterial = { ...receiptMaterial, [field]: value };
      const transplantedReceipt = {
        ...transplantedMaterial,
        receiptHash: hashAgentTaskOrchestratorPromptBindingReceipt(transplantedMaterial)
      };
      expect(validateKnowledgeEvent({
        ...checkpointed,
        id: `evt_agent_task_orchestration_prompt_bound_receipt_transplanted_${field}`,
        payload: { ...checkpointed.payload, promptBindingReceipt: transplantedReceipt }
      }).success).toBe(false);
    }
  });

  it("accepts agent.task.orchestration.released for approval suspension and stale claim recovery", () => {
    for (const [id, releaseReason] of [
      ["evt_agent_task_orchestration_released_approval", "approval-suspended"],
      ["evt_agent_task_orchestration_released_stale", "stale-recovered"]
    ] as const) {
      expect(
        validateKnowledgeEvent(
          agentEvent(
            id,
            "agent.task.orchestration.released",
            orchestratorStreamId,
            taskOrchestrationReleasedPayload(releaseReason)
          )
        ).success
      ).toBe(true);
    }

    const approvalRelease = agentEvent(
      "evt_agent_task_orchestration_released_approval_missing_checkpoint",
      "agent.task.orchestration.released",
      orchestratorStreamId,
      taskOrchestrationReleasedPayload("approval-suspended")
    );
    const { checkpointEventId: _checkpointEventId, ...withoutCheckpoint } = approvalRelease.payload;
    expect(
      validateKnowledgeEvent({
        ...approvalRelease,
        payload: withoutCheckpoint
      }).success
    ).toBe(false);
  });

  it("accepts agent.task.orchestration.completed only with preceding handoff readback reference", () => {
    const completed = agentEvent(
      "evt_agent_task_orchestration_completed",
      "agent.task.orchestration.completed",
      orchestratorStreamId,
      taskOrchestrationCompletedPayload()
    );

    expect(validateKnowledgeEvent(completed).success).toBe(true);
    const { handoffReadback, ...withoutReadback } = completed.payload;
    expect(
      validateKnowledgeEvent({
        ...completed,
        id: "evt_agent_task_orchestration_completed_no_readback",
        payload: withoutReadback
      }).success
    ).toBe(false);

    expect(
      validateKnowledgeEvent({
        ...completed,
        id: "evt_agent_task_orchestration_completed_mismatched_handoff_readback",
        payload: {
          ...completed.payload,
          handoffReadback: {
            ...(completed.payload.handoffReadback as Record<string, unknown>),
            handoffRecordedEventId: "evt_handoff_recorded_other"
          }
        }
      }).success
    ).toBe(false);
  });

  it("rejects orchestration events that include payload, domainProof, approvalByAgent, or missing retryGeneration", () => {
    const validClaimed = agentEvent(
      "evt_agent_task_orchestration_claimed_valid_for_negative_controls",
      "agent.task.orchestration.claimed",
      orchestratorStreamId,
      taskOrchestrationClaimedPayload()
    );
    expect(validateKnowledgeEvent(validClaimed).success).toBe(true);

    for (const [id, patch] of [
      ["evt_agent_task_orchestration_claimed_raw_payload", { payload: { raw: "context bytes" } }],
      ["evt_agent_task_orchestration_claimed_domain_proof", { domainProof: "synthetic-domain-proof" }],
      ["evt_agent_task_orchestration_claimed_self_approval", { approvalByAgent: "agent_default" }]
    ] as const) {
      expect(
        validateKnowledgeEvent({
          ...validClaimed,
          id,
          payload: { ...validClaimed.payload, ...patch }
        }).success
      ).toBe(false);
    }

    const { retryGeneration: _retryGeneration, ...missingRetryGeneration } = validClaimed.payload;
    expect(
      validateKnowledgeEvent({
        ...validClaimed,
        id: "evt_agent_task_orchestration_claimed_missing_retry_generation",
        payload: missingRetryGeneration
      }).success
    ).toBe(false);
  });

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
        handoffMaterialArtifactHash: hash333,
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

  it("keeps handoff material optional on ordinary and legacy steps but requires it on compact handoff bindings", () => {
    const legacyFinalOutput = agentEvent(
      "evt_legacy_final_output",
      "agent.specialist-run.step.recorded",
      "agent_run_run_handoff_legacy",
      {
        runId: "run_handoff_legacy",
        stepId: "step_run_handoff_legacy_final_output",
        summary: "Legacy final output remains replay-valid.",
        stepKind: "final-output",
        stepSchemaId: "evidence-triage-final-output.v1",
        idempotencyKey: "legacy-final-output",
        outputArtifactHashes: [hash222]
      }
    );
    expect(validateKnowledgeEvent(legacyFinalOutput).success).toBe(true);

    const preparedWithoutMaterial = agentEvent(
      "evt_handoff_prepared_without_material",
      "agent.specialist-handoff.prepared",
      "agent_run_run_handoff_001",
      {
        handoffId: "handoff_run_handoff_001_0123456789abcdef",
        handoffRevision: 1,
        idempotencyKey: `specialist-handoff:run_handoff_001:task_handoff_001:evidence-triage:ready-for-review:${hash222}`,
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
      }
    );
    expect(validateKnowledgeEvent(preparedWithoutMaterial).success).toBe(false);
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
      handoffMaterialArtifactHash: hash333,
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

    expect(
      validateKnowledgeEvent(
        agentEvent(
          "evt_handoff_prepared_bad_idempotency",
          "agent.specialist-handoff.prepared",
          "agent_run_run_handoff_001",
          {
            ...compactBinding,
            idempotencyKey: "not-deterministic"
          }
        )
      ).success
    ).toBe(false);
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

  it("accepts a strict production prompt audit binding while keeping historical prompt audits replay-valid", () => {
    const productionEvent = agentEvent(
      "evt_agent_model_requested_production_audit",
      "agent.model-invocation.requested",
      "agent_model_invocation_inv_001",
      { ...modelInvocationPromptAuditPayload(), production: productionPromptAuditBinding() }
    );

    expect(validateKnowledgeEvent(productionEvent).success).toBe(true);
    expect(validateKnowledgeEvent(
      agentEvent(
        "evt_agent_model_requested_historical_audit",
        "agent.model-invocation.requested",
        "agent_model_invocation_inv_001",
        modelInvocationPromptAuditPayload()
      )
    ).success).toBe(true);
  });

  it.each([
    ["unknown production field", { unexpected: "metadata-bag" }],
    ["unknown resolved payload field", {
      resolvedPayloadAudits: [{
        contextPackId: "task-run-history.v1",
        contentHash: hash222,
        sizeBytes: 512,
        schemaId: "task-run-history.v1",
        resolvedPayload: "must-not-appear"
      }]
    }],
    ["applicable requirement with omission", {
      evaluatedContextRequirements: [{
        contextPackId: "task-run-history.v1",
        requirementMode: "always",
        status: "applicable",
        contentHash: hash222,
        omissionReason: "no-associated-prr"
      }]
    }],
    ["not-applicable requirement with content hash", {
      evaluatedContextRequirements: [{
        contextPackId: "prr-read-model.v1",
        requirementMode: "when-scope-associated-prr",
        status: "not-applicable",
        contentHash: hash222,
        omissionReason: "no-associated-prr"
      }]
    }]
  ])("rejects invalid production prompt audit binding: %s", (_name, patch) => {
    expect(validateKnowledgeEvent(
      agentEvent(
        "evt_agent_model_requested_invalid_production_audit",
        "agent.model-invocation.requested",
        "agent_model_invocation_inv_001",
        {
          ...modelInvocationPromptAuditPayload(),
          production: { ...productionPromptAuditBinding(), ...patch }
        }
      )
    ).success).toBe(false);
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

  it("accepts the strict advisory provider feasibility observation", () => {
    expect(validateKnowledgeEvent(providerFeasibilityEvent()).success).toBe(true);
  });

  it("routes provider feasibility observations to the exact provider stream", () => {
    const event = providerFeasibilityEvent();
    expect(validateKnowledgeEvent({ ...event, streamId: "agent_provider_feasibility_wrong" }).success).toBe(false);
  });

  it("requires the resident-agent actor for provider feasibility observations", () => {
    const event = providerFeasibilityEvent();
    expect(validateKnowledgeEvent({ ...event, context: humanContext }).success).toBe(false);
    expect(validateKnowledgeEvent({
      ...event,
      context: { ...event.context, actor: { id: "system_feasibility", kind: "system", label: "System" } }
    }).success).toBe(false);
  });

  it("rejects mismatched resident workspace mount task attempt and run feasibility facts", () => {
    const event = providerFeasibilityEvent();
    for (const [field, value] of [
      ["residentAgentId", "agent_other"],
      ["workspaceId", "workspace_other"],
      ["mountInstanceId", "mounted_other"],
      ["taskId", "review_other"],
      ["attemptId", "attempt_not_hex"],
      ["runId", "review_other"]
    ] as const) {
      expect(validateKnowledgeEvent({
        ...event,
        id: `evt_provider_feasibility_mismatch_${field}`,
        payload: { ...event.payload, [field]: value }
      }).success).toBe(false);
    }
  });

  it("rejects unknown fields and unsafe payload shapes", () => {
    const event = providerFeasibilityEvent();
    expect(validateKnowledgeEvent({
      ...event,
      payload: { ...event.payload, unknown: true }
    }).success).toBe(false);
    const hostile = { ...event.payload } as Record<string, unknown>;
    Object.defineProperty(hostile, "providerId", { enumerable: true, get: () => "provider_openai_codex_review" });
    expect(validateKnowledgeEvent({ ...event, payload: hostile }).success).toBe(false);
  });

  it("rejects a non-advisory availability outcome or category", () => {
    const event = providerFeasibilityEvent();
    expect(validateKnowledgeEvent({
      ...event,
      payload: { ...event.payload, posture: "ready" }
    }).success).toBe(false);
    expect(validateKnowledgeEvent({
      ...event,
      payload: { ...event.payload, category: "provider-ready" }
    }).success).toBe(false);
  });

  it("requires nonempty feasibility provenance with causation inside the source set", () => {
    const event = providerFeasibilityEvent();
    expect(validateKnowledgeEvent({
      ...event,
      payload: { ...event.payload, sourceEventIds: [] }
    }).success).toBe(false);
    expect(validateKnowledgeEvent({
      ...event,
      context: { ...event.context, causationId: "evt_other" }
    }).success).toBe(false);
  });

  it("rejects secret-shaped provider feasibility material", () => {
    const event = providerFeasibilityEvent();
    expect(validateKnowledgeEvent({
      ...event,
      payload: { ...event.payload, modelId: unsafeCredentialHeaderMarker() }
    }).success).toBe(false);
    expect(validateKnowledgeEvent({
      ...event,
      context: { ...event.context, correlationId: "Cookie: session=abc" }
    }).success).toBe(false);
  });
});

function providerFeasibilityEvent() {
  const payload = {
    recordVersion: "agent-provider-feasibility.v1",
    residentAgentId: "agent_default",
    workspaceId: "ws_review",
    mountInstanceId: "mount_review",
    admissionGenerationId: "admission_review",
    workspaceIdentityEventId: "evt_workspace_review",
    mountEvidenceId: "mount_evidence_review",
    authorityEvidenceId: "authority_evidence_review",
    ledgerStoreEvidenceId: "ledger_store_evidence_review",
    policyVersion: "policy_review.v1",
    policyDigest: "sha256:policy_review",
    lockStateDigest: "sha256:lock_review",
    highWaterMark: "hwm_review",
    highWaterOrdinal: 7,
    taskId: "task_review",
    attemptId: `attempt_${"a".repeat(64)}`,
    runId: "run_review",
    providerFamily: "codex",
    providerId: "provider_openai_codex_review",
    modelId: "codex-review",
    capabilityHash: hash222,
    credentialRefId: "agent_credref_review",
    credentialKind: "subscription-oauth",
    capabilityScopes: ["harness-execution"],
    officialFlowId: "codex-review",
    approvalClass: "provider-byte-transfer",
    approvalBindingHash: hash333,
    posture: "unavailable",
    category: "official-flow-unavailable",
    classification: "official-flow-absent",
    classificationHash: hash111,
    sourceEventIds: ["evt_approval_review", "evt_checkpoint_review"],
    idempotencyKey: hash111,
    observedAt: "2026-07-16T00:00:00.000Z"
  };
  return {
    id: "evt_provider_feasibility_review",
    type: "agent.provider.feasibility.observed.v1",
    version: 1,
    streamId: "agent_provider_feasibility_task_review_attempt_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa_run_review_provider_openai_codex_review",
    sequence: 1,
    context: {
      ...context,
      actor: { id: "agent_default", kind: "agent" as const, label: "Cestus Agent" },
      causationId: "evt_checkpoint_review"
    },
    payload
  };
}

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

function productionPromptAuditBinding(): Record<string, unknown> {
  return {
    schemaVersion: "agent-production-prompt-binding.v1",
    rendererId: "evidence-triage.classify.renderer",
    rendererVersion: 1,
    rendererHash: hash111,
    renderedPromptHash: hash222,
    providerOutputSchemaId: "evidence-triage.classify-output.v1",
    providerOutputSchemaVersion: 1,
    handoffSchemaId: "evidence-triage-handoff.v1",
    handoffSchemaVersion: 1,
    scopeApplicabilityHash: hash333,
    evaluatedContextRequirements: [{
      contextPackId: "task-run-history.v1",
      requirementMode: "always",
      status: "applicable",
      contentHash: hash222
    }, {
      contextPackId: "prr-read-model.v1",
      requirementMode: "when-scope-associated-prr",
      status: "not-applicable",
      omissionReason: "no-associated-prr"
    }],
    resolvedPayloadAudits: [{
      contextPackId: "task-run-history.v1",
      contentHash: hash222,
      sizeBytes: 512,
      schemaId: "task-run-history.v1"
    }]
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

function taskOrchestrationClaimedPayload(): Record<string, unknown> {
  return {
    taskId: "task_001",
    runType: "evidence-triage",
    attemptId: orchestratorAttemptId,
    retryGeneration: 0,
    leaseClaimGeneration: 1,
    workerId: "actor_task_orchestrator_worker",
    claimedAt: "2026-07-10T14:00:00.000Z",
    leaseExpiresAt: "2026-07-10T14:05:00.000Z",
    idempotencyKey: `task-orchestrator:task_001:evidence-triage:0:${orchestratorAttemptId}:claim`,
    selectedOrderingPosition: {
      priorityRank: 1,
      queuedAt: "2026-07-10T13:59:00.000Z",
      taskId: "task_001",
      runType: "evidence-triage",
      retryGeneration: 0
    },
    activeBudgetSnapshot: {
      maxProviderInvocations: 1,
      remainingProviderInvocations: 1,
      contextByteBudget: 16384,
      promptByteBudget: 8192,
      derivativeArtifactByteBudget: 65536,
      wallClockBudgetMs: 300000
    },
    causationEventId: "evt_agent_task_created"
  };
}

function taskOrchestrationCheckpointedPayload(): Record<string, unknown> {
  return {
    taskId: "task_001",
    runType: "evidence-triage",
    attemptId: orchestratorAttemptId,
    retryGeneration: 0,
    leaseClaimGeneration: 1,
    checkpointKind: "approval-wait",
    checkpointedAt: "2026-07-10T14:01:00.000Z",
    runId: "run_001",
    resumeIdempotencyKey: `task-orchestrator:task_001:evidence-triage:0:${orchestratorAttemptId}:resume-approval-wait`,
    toolRequestIds: ["toolreq_provider_transfer"],
    approvalRequirement: {
      approvalClass: "provider-byte-transfer",
      previewHash: hash333,
      approvalRequestEventId: "evt_agent_tool_requested_provider_transfer"
    },
    providerPosture: {
      providerId: "provider_nous_portal",
      modelFamily: "tencent-hy3-free",
      adapterVersion: "0.1.0",
      capabilityIds: [
        "capability_provider_provider_nous_portal",
        "capability_model_tencent-hy3-free",
        "capability_adapter_0.1.0"
      ],
      credentialRefId: "agent_credref_local",
      credentialKind: "local-no-secret",
      readinessState: "ready",
      approvalProfile: "provider-byte-transfer",
      dataHandlingPosture: "remote-provider-approved",
      selectionPolicyVersion: "agent-provider-policy-v1",
      sensitivityClass: "provider-approved",
      requiredApprovalClass: "provider-byte-transfer"
    },
    contextBindings: [
      {
        contextPackId: "task-run-history.v1",
        contentHash: hash222,
        sizeBytes: 512,
        schemaId: "task-run-history.v1",
        provenanceEventIds: ["evt_agent_task_created"],
        projectionHighWaterMark: 42,
        stalenessInputCount: 1
      }
    ],
    sourceEventIds: ["evt_agent_task_created"],
    inputArtifactHashes: [hash111],
    promptArtifactHash: hash111,
    lockSnapshot: {
      activeLockIds: [],
      highWaterMark: 42
    },
    safeNextActions: ["wait for exact provider byte transfer approval"]
  };
}

function taskOrchestrationReleasedPayload(releaseReason: string): Record<string, unknown> {
  return {
    taskId: "task_001",
    runType: "evidence-triage",
    attemptId: orchestratorAttemptId,
    retryGeneration: 0,
    leaseClaimGeneration: releaseReason === "stale-recovered" ? 2 : 1,
    releasedBy: "actor_task_orchestrator_worker",
    releasedAt: "2026-07-10T14:02:00.000Z",
    releaseReason,
    claimEventId: "evt_agent_task_orchestration_claimed",
    checkpointEventId: "evt_agent_task_orchestration_checkpointed",
    safeNextActions: ["reclaim after exact durable proof is current"]
  };
}

function taskOrchestrationCompletedPayload(): Record<string, unknown> {
  return {
    taskId: "task_001",
    runType: "evidence-triage",
    attemptId: orchestratorAttemptId,
    retryGeneration: 0,
    runId: "run_001",
    completedAt: "2026-07-10T14:10:00.000Z",
    specialistRunCompletedEventId: "evt_agent_specialist_run_completed",
    finalOutputStepEventId: "evt_final_output",
    handoffPreparedEventId: "evt_handoff_prepared",
    handoffRecordedEventId: "evt_handoff_recorded",
    handoffReadback: {
      handoffId: "handoff_run_001_0123456789abcdef",
      handoffManifestHash: hash222,
      handoffRecordedEventId: "evt_handoff_recorded",
      verifiedAt: "2026-07-10T14:09:00.000Z"
    }
  };
}
