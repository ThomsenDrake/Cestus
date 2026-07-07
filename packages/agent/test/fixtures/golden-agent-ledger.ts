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
  }
];
