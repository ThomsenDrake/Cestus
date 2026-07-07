import type { KnowledgeEvent } from "../../../ontology/src/contracts.js";

const agentContext = {
  actor: { id: "actor_cestus_agent", kind: "agent", label: "Cestus Agent" },
  occurredAt: "2026-07-07T18:00:00.000Z",
  correlationId: "corr_agent_projection",
  coreVersion: "0.1.0",
  packVersions: { core: "0.1.0", agent: "0.1.0" }
} as const;

const humanContext = {
  ...agentContext,
  actor: { id: "actor_case_owner", kind: "human", label: "Case Owner" }
} as const;

const hash111 = "sha256:1111111111111111111111111111111111111111111111111111111111111111";
const hash222 = "sha256:2222222222222222222222222222222222222222222222222222222222222222";
const hash333 = "sha256:3333333333333333333333333333333333333333333333333333333333333333";
const hash444 = "sha256:4444444444444444444444444444444444444444444444444444444444444444";
const hash555 = "sha256:5555555555555555555555555555555555555555555555555555555555555555";
const hash666 = "sha256:6666666666666666666666666666666666666666666666666666666666666666";

export const goldenAgentLedgerEvents: KnowledgeEvent[] = [
  {
    id: "evt_agent_fixture_evidence",
    type: "evidence.ingested",
    version: 1,
    streamId: "evidence_ev_agent_fixture",
    sequence: 1,
    context: {
      ...agentContext,
      actor: { id: "actor_system", kind: "system", label: "Fixture system" }
    },
    payload: {
      evidenceId: "ev_agent_fixture",
      source: { kind: "manual", label: "Agent projection fixture" },
      contentHash: hash111,
      mediaType: "text/plain",
      sizeBytes: 128
    }
  },
  {
    id: "evt_agent_identity_initialized_default",
    type: "agent.identity.initialized",
    version: 1,
    streamId: "agent_identity_agent_default",
    sequence: 1,
    context: agentContext,
    payload: {
      residentAgentId: "agent_default",
      workspaceId: "ws_case_001",
      label: "Cestus Agent",
      policyId: "agent_policy_default",
      initializedBy: "actor_case_owner",
      allowedRunTypes: ["evidence-triage"],
      memoryProjectionVersion: "0.1.0"
    }
  },
  {
    id: "evt_agent_policy_installed_default",
    type: "agent.policy.installed",
    version: 1,
    streamId: "agent_policy_agent_policy_default",
    sequence: 1,
    context: {
      ...humanContext,
      causationId: "evt_agent_identity_initialized_default"
    },
    payload: {
      policyId: "agent_policy_default",
      residentAgentId: "agent_default",
      version: "0.1.0",
      installedBy: "actor_case_owner",
      humanGatedActionClasses: ["external-byte-transfer", "legal-escalation"],
      allowedRunTypes: ["evidence-triage"],
      credentialKinds: ["local-no-secret"],
      rationale: "Install local resident agent policy."
    }
  },
  {
    id: "evt_agent_task_created_provider_readiness",
    type: "agent.task.created",
    version: 1,
    streamId: "agent_task_task_provider_readiness",
    sequence: 1,
    context: {
      ...humanContext,
      causationId: "evt_agent_policy_installed_default"
    },
    payload: {
      taskId: "task_provider_readiness",
      residentAgentId: "agent_default",
      title: "Review provider readiness",
      requestedBy: "actor_case_owner",
      priority: "normal",
      description: "Review provider preview before external byte transfer.",
      sourceEventIds: ["evt_agent_policy_installed_default"],
      inputArtifactHashes: [hash111]
    }
  },
  {
    id: "evt_agent_run_started_provider_readiness",
    type: "agent.specialist-run.started",
    version: 1,
    streamId: "agent_run_run_provider_readiness",
    sequence: 1,
    context: {
      ...agentContext,
      occurredAt: "2026-07-07T18:01:00.000Z",
      causationId: "evt_agent_task_created_provider_readiness"
    },
    payload: {
      runId: "run_provider_readiness",
      residentAgentId: "agent_default",
      runType: "evidence-triage",
      startedBy: "actor_cestus_agent",
      taskId: "task_provider_readiness",
      workspaceId: "ws_case_001",
      sourceEventIds: ["evt_agent_task_created_provider_readiness"],
      inputArtifactHashes: [hash111]
    }
  },
  {
    id: "evt_agent_model_requested_provider_readiness",
    type: "agent.model-invocation.requested",
    version: 1,
    streamId: "agent_model_invocation_inv_provider_readiness",
    sequence: 1,
    context: {
      ...agentContext,
      occurredAt: "2026-07-07T18:02:00.000Z",
      causationId: "evt_agent_run_started_provider_readiness"
    },
    payload: {
      invocationId: "inv_provider_readiness",
      runId: "run_provider_readiness",
      providerId: "provider_fake",
      modelFamily: "fake-local",
      inputArtifactHash: hash222,
      safetyClass: "workspace-safe",
      credentialRefId: "agent_credref_local",
      credentialKind: "local-no-secret"
    }
  },
  {
    id: "evt_agent_model_completed_provider_readiness",
    type: "agent.model-invocation.completed",
    version: 1,
    streamId: "agent_model_invocation_inv_provider_readiness",
    sequence: 2,
    context: {
      ...agentContext,
      occurredAt: "2026-07-07T18:03:00.000Z",
      causationId: "evt_agent_model_requested_provider_readiness"
    },
    payload: {
      invocationId: "inv_provider_readiness",
      runId: "run_provider_readiness",
      providerId: "provider_fake",
      outputArtifactHash: hash333,
      completedAt: "2026-07-07T18:03:00.000Z",
      modelFamily: "fake-local",
      usage: { inputTokens: 10, outputTokens: 12, totalTokens: 22 }
    }
  },
  {
    id: "evt_agent_tool_requested_provider_preview",
    type: "agent.tool.requested",
    version: 1,
    streamId: "agent_tool_request_toolreq_provider_preview",
    sequence: 1,
    context: {
      ...agentContext,
      occurredAt: "2026-07-07T18:04:00.000Z",
      causationId: "evt_agent_model_completed_provider_readiness"
    },
    payload: {
      toolRequestId: "toolreq_provider_preview",
      runId: "run_provider_readiness",
      toolId: "tool_provider_preview",
      toolVersion: "0.1.0",
      requestedBy: "agent_default",
      sideEffectClass: "external-byte-transfer",
      requiredApprovalClass: "provider-byte-transfer",
      previewHash: hash444,
      scope: "Selected evidence metadata only.",
      estimatedEffect: "Queues provider preview for human approval.",
      sourceEventIds: ["evt_agent_model_completed_provider_readiness"],
      inputArtifactHashes: [hash222]
    }
  },
  {
    id: "evt_agent_tool_requested_provider_transfer",
    type: "agent.tool.requested",
    version: 1,
    streamId: "agent_tool_request_toolreq_provider_transfer",
    sequence: 1,
    context: {
      ...agentContext,
      occurredAt: "2026-07-07T18:04:10.000Z",
      causationId: "evt_agent_run_started_provider_readiness"
    },
    payload: {
      toolRequestId: "toolreq_provider_transfer",
      runId: "run_provider_readiness",
      toolId: "tool_provider_transfer",
      toolVersion: "0.1.0",
      requestedBy: "agent_default",
      sideEffectClass: "external-byte-transfer",
      requiredApprovalClass: "provider-byte-transfer",
      previewHash: hash444,
      scope: "Selected evidence bytes.",
      estimatedEffect: "Transfers selected evidence bytes after approval.",
      sourceEventIds: ["evt_agent_model_completed_provider_readiness"],
      inputArtifactHashes: [hash222]
    }
  },
  {
    id: "evt_agent_tool_approved_provider_transfer",
    type: "agent.tool.approved",
    version: 1,
    streamId: "agent_tool_request_toolreq_provider_transfer",
    sequence: 2,
    context: {
      ...humanContext,
      occurredAt: "2026-07-07T18:04:20.000Z",
      causationId: "evt_agent_tool_requested_provider_transfer"
    },
    payload: {
      toolRequestId: "toolreq_provider_transfer",
      approvedBy: "actor_case_owner",
      approvedPreviewHash: hash444,
      approvalClass: "provider-byte-transfer",
      rationale: "Approved transfer for selected evidence bytes.",
      approvedAt: "2026-07-07T18:04:20.000Z"
    }
  },
  {
    id: "evt_agent_tool_completed_provider_transfer",
    type: "agent.tool.completed",
    version: 1,
    streamId: "agent_tool_request_toolreq_provider_transfer",
    sequence: 3,
    context: {
      ...agentContext,
      occurredAt: "2026-07-07T18:04:30.000Z",
      causationId: "evt_agent_tool_approved_provider_transfer"
    },
    payload: {
      toolRequestId: "toolreq_provider_transfer",
      completedAt: "2026-07-07T18:04:30.000Z",
      eventIds: ["evt_agent_fixture_evidence"],
      artifactHashes: [hash555],
      readModelChanges: [
        {
          projectionName: "agent-tool-requests",
          change: "Recorded approved provider transfer completion.",
          relatedIds: ["toolreq_provider_transfer", "evt_agent_fixture_evidence"]
        }
      ],
      resultSummary: "Provider transfer completed for the approved preview."
    }
  },
  {
    id: "evt_agent_tool_requested_export_denied",
    type: "agent.tool.requested",
    version: 1,
    streamId: "agent_tool_request_toolreq_export_denied",
    sequence: 1,
    context: {
      ...agentContext,
      occurredAt: "2026-07-07T18:04:40.000Z",
      causationId: "evt_agent_run_started_provider_readiness"
    },
    payload: {
      toolRequestId: "toolreq_export_denied",
      runId: "run_provider_readiness",
      toolId: "tool_export_preview",
      toolVersion: "0.1.0",
      requestedBy: "agent_default",
      sideEffectClass: "export-or-publication",
      requiredApprovalClass: "export-or-publication",
      previewHash: hash555,
      scope: "Draft export preview only.",
      estimatedEffect: "Would prepare an export if approved.",
      sourceEventIds: ["evt_agent_model_completed_provider_readiness"],
      inputArtifactHashes: [hash333]
    }
  },
  {
    id: "evt_agent_tool_denied_export_denied",
    type: "agent.tool.denied",
    version: 1,
    streamId: "agent_tool_request_toolreq_export_denied",
    sequence: 2,
    context: {
      ...humanContext,
      occurredAt: "2026-07-07T18:04:50.000Z",
      causationId: "evt_agent_tool_requested_export_denied"
    },
    payload: {
      toolRequestId: "toolreq_export_denied",
      deniedBy: "actor_case_owner",
      rationale: "Export review is not approved.",
      deniedAt: "2026-07-07T18:04:50.000Z",
      approvalClass: "export-or-publication"
    }
  },
  {
    id: "evt_agent_tool_requested_local_failed",
    type: "agent.tool.requested",
    version: 1,
    streamId: "agent_tool_request_toolreq_local_failed",
    sequence: 1,
    context: {
      ...agentContext,
      occurredAt: "2026-07-07T18:04:55.000Z",
      causationId: "evt_agent_run_started_provider_readiness"
    },
    payload: {
      toolRequestId: "toolreq_local_failed",
      runId: "run_provider_readiness",
      toolId: "tool_local_projection_read",
      toolVersion: "0.1.0",
      requestedBy: "agent_default",
      sideEffectClass: "read-only",
      requiredApprovalClass: "none",
      previewHash: hash666,
      scope: "Read local projection status.",
      estimatedEffect: "Reads local projection state.",
      sourceEventIds: ["evt_agent_model_completed_provider_readiness"],
      inputArtifactHashes: [hash333]
    }
  },
  {
    id: "evt_agent_tool_failed_local_failed",
    type: "agent.tool.failed",
    version: 1,
    streamId: "agent_tool_request_toolreq_local_failed",
    sequence: 2,
    context: {
      ...agentContext,
      occurredAt: "2026-07-07T18:04:59.000Z",
      causationId: "evt_agent_tool_requested_local_failed"
    },
    payload: {
      toolRequestId: "toolreq_local_failed",
      failedAt: "2026-07-07T18:04:59.000Z",
      category: "projection-lag",
      message: "Local projection is stale.",
      retryable: true,
      allowedActions: ["rebuild the stale projection before retrying"]
    }
  },
  {
    id: "evt_agent_task_waiting_provider_readiness",
    type: "agent.task.status.changed",
    version: 1,
    streamId: "agent_task_task_provider_readiness",
    sequence: 2,
    context: {
      ...agentContext,
      occurredAt: "2026-07-07T18:05:00.000Z",
      causationId: "evt_agent_tool_requested_provider_preview"
    },
    payload: {
      taskId: "task_provider_readiness",
      status: "waiting-for-approval",
      changedBy: "actor_cestus_agent",
      reason: "Provider preview requires human approval.",
      runId: "run_provider_readiness"
    }
  },
  {
    id: "evt_agent_memory_recorded_workspace_policy",
    type: "agent.memory.recorded",
    version: 1,
    streamId: "agent_memory_mem_workspace_policy",
    sequence: 1,
    context: {
      ...agentContext,
      occurredAt: "2026-07-07T18:06:00.000Z",
      causationId: "evt_agent_policy_installed_default"
    },
    payload: {
      memoryId: "mem_workspace_policy",
      residentAgentId: "agent_default",
      scope: "workspace",
      summary: "Use local fake providers until live setup is reviewed.",
      sourceEventIds: ["evt_agent_policy_installed_default"],
      confidence: 0.95,
      createdAt: "2026-07-07T18:06:00.000Z"
    }
  },
  {
    id: "evt_agent_memory_recorded_superseded_context",
    type: "agent.memory.recorded",
    version: 1,
    streamId: "agent_memory_mem_superseded_context",
    sequence: 1,
    context: {
      ...agentContext,
      occurredAt: "2026-07-07T18:06:30.000Z",
      causationId: "evt_agent_memory_recorded_workspace_policy"
    },
    payload: {
      memoryId: "mem_superseded_context",
      residentAgentId: "agent_default",
      scope: "workspace",
      summary: "Use the earlier workspace policy memory.",
      sourceEventIds: ["evt_agent_memory_recorded_workspace_policy"],
      confidence: 0.5,
      createdAt: "2026-07-07T18:06:30.000Z"
    }
  },
  {
    id: "evt_agent_memory_superseded_context",
    type: "agent.memory.superseded",
    version: 1,
    streamId: "agent_memory_mem_superseded_context",
    sequence: 2,
    context: {
      ...humanContext,
      occurredAt: "2026-07-07T18:06:40.000Z",
      causationId: "evt_agent_memory_recorded_superseded_context"
    },
    payload: {
      memoryId: "mem_superseded_context",
      supersededByMemoryId: "mem_workspace_policy",
      supersededBy: "actor_case_owner",
      rationale: "Workspace policy memory is the canonical active memory.",
      supersededAt: "2026-07-07T18:06:40.000Z"
    }
  },
  {
    id: "evt_agent_memory_recorded_retracted_context",
    type: "agent.memory.recorded",
    version: 1,
    streamId: "agent_memory_mem_retracted_context",
    sequence: 1,
    context: {
      ...agentContext,
      occurredAt: "2026-07-07T18:07:00.000Z",
      causationId: "evt_agent_task_created_provider_readiness"
    },
    payload: {
      memoryId: "mem_retracted_context",
      residentAgentId: "agent_default",
      scope: "task",
      summary: "Draft note removed from active context.",
      sourceEventIds: ["evt_agent_task_created_provider_readiness"],
      confidence: 0.4,
      createdAt: "2026-07-07T18:07:00.000Z"
    }
  },
  {
    id: "evt_agent_memory_retracted_context",
    type: "agent.memory.retracted",
    version: 1,
    streamId: "agent_memory_mem_retracted_context",
    sequence: 2,
    context: {
      ...humanContext,
      occurredAt: "2026-07-07T18:08:00.000Z",
      causationId: "evt_agent_memory_recorded_retracted_context"
    },
    payload: {
      memoryId: "mem_retracted_context",
      retractedBy: "actor_case_owner",
      rationale: "Remove stale draft note from active context.",
      retractedAt: "2026-07-07T18:08:00.000Z"
    }
  },
  {
    id: "evt_agent_permission_granted_read_workspace",
    type: "agent.permission.granted",
    version: 1,
    streamId: "agent_permission_perm_read_workspace",
    sequence: 1,
    context: {
      ...humanContext,
      occurredAt: "2026-07-07T18:09:00.000Z",
      causationId: "evt_agent_policy_installed_default"
    },
    payload: {
      permissionId: "perm_read_workspace",
      residentAgentId: "agent_default",
      grantedBy: "actor_case_owner",
      scope: "Read workspace status projections.",
      sideEffectClasses: ["read-only"],
      rationale: "Human granted bounded read access.",
      grantedAt: "2026-07-07T18:09:00.000Z"
    }
  },
  {
    id: "evt_agent_permission_granted_export_review",
    type: "agent.permission.granted",
    version: 1,
    streamId: "agent_permission_perm_export_review",
    sequence: 1,
    context: {
      ...humanContext,
      occurredAt: "2026-07-07T18:09:10.000Z",
      causationId: "evt_agent_policy_installed_default"
    },
    payload: {
      permissionId: "perm_export_review",
      residentAgentId: "agent_default",
      grantedBy: "actor_case_owner",
      scope: "Prepare export preview for review.",
      sideEffectClasses: ["export-or-publication"],
      rationale: "Temporary export review permission.",
      grantedAt: "2026-07-07T18:09:10.000Z"
    }
  },
  {
    id: "evt_agent_permission_revoked_export_review",
    type: "agent.permission.revoked",
    version: 1,
    streamId: "agent_permission_perm_export_review",
    sequence: 2,
    context: {
      ...humanContext,
      occurredAt: "2026-07-07T18:09:20.000Z",
      causationId: "evt_agent_permission_granted_export_review"
    },
    payload: {
      permissionId: "perm_export_review",
      revokedBy: "actor_case_owner",
      rationale: "Export review permission window closed.",
      revokedAt: "2026-07-07T18:09:20.000Z"
    }
  },
  {
    id: "evt_agent_lock_activated_legal_escalation",
    type: "agent.lock.activated",
    version: 1,
    streamId: "agent_lock_lock_legal_escalation",
    sequence: 1,
    context: {
      ...agentContext,
      occurredAt: "2026-07-07T18:10:00.000Z",
      causationId: "evt_agent_tool_requested_provider_preview"
    },
    payload: {
      lockId: "lock_legal_escalation",
      residentAgentId: "agent_default",
      kind: "legal-escalation",
      activatedBy: "actor_cestus_agent",
      reason: "Legal language requires human review.",
      activatedAt: "2026-07-07T18:10:00.000Z",
      relatedEventIds: ["evt_agent_tool_requested_provider_preview"]
    }
  },
  {
    id: "evt_agent_lock_activated_export_review",
    type: "agent.lock.activated",
    version: 1,
    streamId: "agent_lock_lock_export_review",
    sequence: 1,
    context: {
      ...agentContext,
      occurredAt: "2026-07-07T18:11:00.000Z",
      causationId: "evt_agent_tool_requested_export_denied"
    },
    payload: {
      lockId: "lock_export_review",
      residentAgentId: "agent_default",
      kind: "export",
      activatedBy: "actor_cestus_agent",
      reason: "Export request requires human review.",
      activatedAt: "2026-07-07T18:11:00.000Z",
      relatedEventIds: ["evt_agent_tool_requested_export_denied"]
    }
  },
  {
    id: "evt_agent_lock_cleared_export_review",
    type: "agent.lock.cleared",
    version: 1,
    streamId: "agent_lock_lock_export_review",
    sequence: 2,
    context: {
      ...humanContext,
      occurredAt: "2026-07-07T18:11:30.000Z",
      causationId: "evt_agent_lock_activated_export_review"
    },
    payload: {
      lockId: "lock_export_review",
      clearedBy: "actor_case_owner",
      rationale: "Denied export request closed the review lock.",
      clearedAt: "2026-07-07T18:11:30.000Z",
      relatedEventIds: ["evt_agent_tool_denied_export_denied"]
    }
  },
  {
    id: "evt_agent_run_started_completed_triage",
    type: "agent.specialist-run.started",
    version: 1,
    streamId: "agent_run_run_completed_triage",
    sequence: 1,
    context: {
      ...agentContext,
      occurredAt: "2026-07-07T18:12:00.000Z",
      causationId: "evt_agent_task_created_provider_readiness"
    },
    payload: {
      runId: "run_completed_triage",
      residentAgentId: "agent_default",
      runType: "evidence-triage",
      startedBy: "actor_cestus_agent",
      taskId: "task_provider_readiness",
      workspaceId: "ws_case_001",
      sourceEventIds: ["evt_agent_task_created_provider_readiness"],
      inputArtifactHashes: [hash111]
    }
  },
  {
    id: "evt_agent_run_completed_completed_triage",
    type: "agent.specialist-run.completed",
    version: 1,
    streamId: "agent_run_run_completed_triage",
    sequence: 2,
    context: {
      ...agentContext,
      occurredAt: "2026-07-07T18:12:30.000Z",
      causationId: "evt_agent_tool_completed_provider_transfer"
    },
    payload: {
      runId: "run_completed_triage",
      completedAt: "2026-07-07T18:12:30.000Z",
      outputArtifactHashes: [hash555],
      relatedEventIds: ["evt_agent_tool_completed_provider_transfer"],
      summary: "Completed provider readiness triage."
    }
  },
  {
    id: "evt_agent_run_started_failed_triage",
    type: "agent.specialist-run.started",
    version: 1,
    streamId: "agent_run_run_failed_triage",
    sequence: 1,
    context: {
      ...agentContext,
      occurredAt: "2026-07-07T18:13:00.000Z",
      causationId: "evt_agent_task_created_provider_readiness"
    },
    payload: {
      runId: "run_failed_triage",
      residentAgentId: "agent_default",
      runType: "evidence-triage",
      startedBy: "actor_cestus_agent",
      taskId: "task_provider_readiness",
      workspaceId: "ws_case_001",
      sourceEventIds: ["evt_agent_task_created_provider_readiness"],
      inputArtifactHashes: [hash111]
    }
  },
  {
    id: "evt_agent_run_failed_failed_triage",
    type: "agent.specialist-run.failed",
    version: 1,
    streamId: "agent_run_run_failed_triage",
    sequence: 2,
    context: {
      ...agentContext,
      occurredAt: "2026-07-07T18:13:30.000Z",
      causationId: "evt_agent_run_started_failed_triage"
    },
    payload: {
      runId: "run_failed_triage",
      failedAt: "2026-07-07T18:13:30.000Z",
      category: "projection-lag",
      message: "Required projection is stale.",
      retryable: true,
      allowedActions: ["rebuild the stale projection before retrying"],
      relatedEventIds: ["evt_agent_tool_failed_local_failed"],
      toolRequestId: "toolreq_local_failed"
    }
  }
];
