import { describe, expect, it } from "vitest";
import { eventContracts, validateKnowledgeEvent, type KnowledgeEventType } from "../src/contracts.js";

const context = Object.freeze({
  actor: { id: "agent_wake_contracts", kind: "agent" as const, label: "Wake contracts" },
  occurredAt: "2026-07-16T00:00:00.000Z",
  causationId: "evt_wake_cause",
  correlationId: "corr_wake_contracts",
  coreVersion: "0.1.0",
  packVersions: { core: "0.1.0", agent: "0.1.0" }
});

const binding = Object.freeze({
  workspaceId: "ws_wake_contracts",
  residentId: "agent_default" as const,
  supervisorEpoch: "epoch_wake_contracts",
  workspaceIdentityEventId: "evt_workspace_identity",
  mountInstanceId: "mount_wake_contracts",
  mountEvidenceId: "evt_mount_evidence",
  authorityEvidenceId: "evt_authority_evidence",
  policyVersion: "policy.v1",
  policyDigest: "sha256:policy_wake_contracts",
  lockStateDigest: "sha256:lock_wake_contracts",
  highWaterMark: "evt_high_water",
  causation: { causationId: "evt_wake_cause", correlationId: "corr_wake_contracts" }
});

const reconciliationAdmission = Object.freeze({
  authorityIdentityAndMount: Object.freeze({
    workspaceId: binding.workspaceId,
    residentId: binding.residentId,
    supervisorEpoch: binding.supervisorEpoch,
    workspaceIdentityEventId: binding.workspaceIdentityEventId,
    mountEvidenceId: binding.mountEvidenceId,
    authorityEvidenceId: binding.authorityEvidenceId
  }),
  admissionGeneration: Object.freeze({
    schemaVersion: "resident-wake-admission-generation.v1",
    generationId: "generation_wake_contracts"
  }),
  verifiedLease: Object.freeze({
    schemaVersion: "resident-supervisor-lease-readback.v1",
    workspaceId: binding.workspaceId,
    residentId: binding.residentId,
    supervisorEpoch: binding.supervisorEpoch,
    workspaceIdentityEventId: binding.workspaceIdentityEventId,
    mountEvidenceId: binding.mountEvidenceId,
    authorityEvidenceId: binding.authorityEvidenceId,
    policyVersion: binding.policyVersion,
    policyDigest: binding.policyDigest,
    lockStateDigest: binding.lockStateDigest,
    highWaterMark: binding.highWaterMark,
    leaseEventId: "evt_lease_wake_contracts",
    readbackEventId: "evt_lease_wake_contracts",
    expiresAt: "2026-07-16T01:00:00.000Z",
    causation: binding.causation,
    policyAndLock: Object.freeze({
      authorityEvidenceId: binding.authorityEvidenceId,
      mountEvidenceId: binding.mountEvidenceId,
      leaseEventId: "evt_lease_wake_contracts",
      leaseReadbackEventId: "evt_lease_wake_contracts",
      policyVersion: binding.policyVersion,
      policyDigest: binding.policyDigest,
      lockStateDigest: binding.lockStateDigest,
      readbackEventId: binding.workspaceIdentityEventId
    }),
    highWater: Object.freeze({
      authorityEvidenceId: binding.authorityEvidenceId,
      mountEvidenceId: binding.mountEvidenceId,
      leaseEventId: "evt_lease_wake_contracts",
      leaseReadbackEventId: "evt_lease_wake_contracts",
      highWaterMark: binding.highWaterMark,
      readbackEventId: binding.highWaterMark
    })
  }),
  policyAndLock: Object.freeze({
    authorityEvidenceId: binding.authorityEvidenceId,
    mountEvidenceId: binding.mountEvidenceId,
    leaseEventId: "evt_lease_wake_contracts",
    leaseReadbackEventId: "evt_lease_wake_contracts",
    policyVersion: binding.policyVersion,
    policyDigest: binding.policyDigest,
    lockStateDigest: binding.lockStateDigest,
    readbackEventId: binding.workspaceIdentityEventId
  }),
  highWater: Object.freeze({
    authorityEvidenceId: binding.authorityEvidenceId,
    mountEvidenceId: binding.mountEvidenceId,
    leaseEventId: "evt_lease_wake_contracts",
    leaseReadbackEventId: "evt_lease_wake_contracts",
    highWaterMark: binding.highWaterMark,
    readbackEventId: binding.highWaterMark
  })
});

const reconciliationRecord = Object.freeze({
  schemaVersion: "resident-wake-workspace-unavailable.v1",
  outcome: "workspace-unavailable",
  resumable: true,
  claimDisposition: "checkpointed",
  workspaceId: binding.workspaceId,
  residentId: binding.residentId,
  supervisorEpoch: binding.supervisorEpoch,
  claimId: "task_wake_contracts",
  attemptId: `attempt_${"a".repeat(64)}`,
  outageObservation: Object.freeze({
    safeObservationId: "outage_wake_contracts",
    outageObservedAt: "2026-07-16T00:30:00.000Z",
    category: "workspace-unavailable",
    priorClaimEventId: "evt_claim_wake_contracts",
    priorClaimLeaseId: "claim_lease_wake_contracts",
    priorAuthorityEvidenceId: binding.authorityEvidenceId,
    highWaterBeforeOutage: binding.highWaterMark
  }),
  causation: binding.causation,
  revalidatedAuthority: Object.freeze({
    identityEventId: binding.workspaceIdentityEventId,
    mountEvidenceId: binding.mountEvidenceId,
    authorityEvidenceId: binding.authorityEvidenceId,
    highWaterAfterRevalidation: binding.highWaterMark,
    policyVersion: binding.policyVersion,
    policyDigest: binding.policyDigest,
    lockStateDigest: binding.lockStateDigest,
    supervisorLeaseEventId: "evt_lease_wake_contracts",
    supervisorLeaseReadbackEventId: "evt_lease_wake_contracts",
    supervisorLeaseExpiresAt: "2026-07-16T01:00:00.000Z"
  }),
  reconciliationIdempotencyKey: "wake-reconcile:contracts"
});

function wakeEvent(type: KnowledgeEventType, payload: Record<string, unknown>) {
  return {
    id: "evt_wake_contract",
    type,
    version: 1,
    streamId: "agent_wake_supervisor_ws_wake_contracts_epoch_wake_contracts",
    sequence: 1,
    context,
    payload
  };
}

describe("resident wake lifecycle contracts", () => {
  it("accepts a compact mounted task admission reference and rejects manifest drift or nested inputs", () => {
    const admissionManifestHash = `sha256:${"a".repeat(64)}`;
    const payload = {
      admissionId: `admission_${"a".repeat(64)}`,
      admissionManifestHash,
      workspaceId: "ws_wake_contracts",
      workspaceManifestHash: `sha256:${"b".repeat(64)}`,
      residentAgentId: "agent_default",
      taskId: "task_wake_contracts",
      runId: "run_wake_contracts",
      runType: "evidence-triage",
      providerMode: "local-fake",
      sourceEventIds: ["evt_evidence_wake_contracts", "evt_link_wake_contracts"],
      policyEventId: "evt_policy_wake_contracts",
      policyId: "agent_policy_wake_contracts",
      policyVersion: "policy.v1",
      policyHash: `sha256:${"d".repeat(64)}`,
      activeLocksHash: `sha256:${"e".repeat(64)}`,
      admittedAt: "2026-07-16T00:00:00.000Z",
      admittedBy: "agent_default"
    } as const;
    const event = {
      id: "evt_mounted_admission",
      type: "agent.mounted-task.execution.admitted.v1",
      version: 1,
      streamId: "agent_mounted_task_execution_task_wake_contracts_run_wake_contracts",
      sequence: 1,
      context,
      payload
    };

    expect(validateKnowledgeEvent(event).success).toBe(true);
    expect(validateKnowledgeEvent({
      ...event,
      payload: { ...payload, admissionManifestHash: `sha256:${"f".repeat(64)}` }
    }).success).toBe(false);
    expect(validateKnowledgeEvent({
      ...event,
      payload: { ...payload, evidenceBindings: [{ evidenceId: "ev_nested_input_forbidden" }] }
    }).success).toBe(false);
    expect(eventContracts["agent.mounted-task.execution.admitted.v1"]).toMatchObject({ version: 1 });
  });

  it("accepts a claimed supervisor lease with complete durable bindings", () => {
    expect(validateKnowledgeEvent(wakeEvent("agent.wake.supervisor.lease.claimed.v1", {
      ...binding, leaseId: "lease_wake_contracts", leaseExpiresAt: "2026-07-16T01:00:00.000Z"
    })).success).toBe(true);
  });

  it("accepts a pause request with its command provenance", () => {
    expect(validateKnowledgeEvent(wakeEvent("agent.wake.supervisor.pause.requested.v1", {
      ...binding, commandId: "pause_wake_contracts", sourceEventIds: ["evt_pause_source"]
    })).success).toBe(true);
  });

  it("accepts a paused readback bound to its request", () => {
    expect(validateKnowledgeEvent(wakeEvent("agent.wake.supervisor.paused.v1", {
      ...binding, pauseRequestEventId: "evt_pause_request"
    })).success).toBe(true);
  });

  it("accepts a resume request with its command provenance", () => {
    expect(validateKnowledgeEvent(wakeEvent("agent.wake.supervisor.resume.requested.v1", {
      ...binding, commandId: "resume_wake_contracts", sourceEventIds: ["evt_resume_source"]
    })).success).toBe(true);
  });

  it("accepts a recovery verification with exact reconciliation readback", () => {
    expect(validateKnowledgeEvent(wakeEvent("agent.wake.supervisor.recovery.verified.v1", {
      ...binding,
      reconciliationEventId: "evt_reconciliation",
      reconciliationReadbackEventId: "evt_reconciliation_readback",
      reconciliationRecord,
      reconciliationAdmission
    })).success).toBe(true);
  });

  it("accepts a degraded lifecycle fact with a safe diagnostic identity", () => {
    expect(validateKnowledgeEvent(wakeEvent("agent.wake.supervisor.degraded.v1", {
      ...binding, diagnosticId: "diag_wake_degraded", category: "scheduler-unavailable"
    })).success).toBe(true);
  });

  it("accepts an unrecoverable lifecycle fact with a safe diagnostic identity", () => {
    expect(validateKnowledgeEvent(wakeEvent("agent.wake.supervisor.unrecoverable.v1", {
      ...binding, diagnosticId: "diag_wake_unrecoverable", category: "recovery-exhausted"
    })).success).toBe(true);
  });

  it("rejects an event whose stream does not bind the workspace and epoch", () => {
    expect(validateKnowledgeEvent({
      ...wakeEvent("agent.wake.supervisor.lease.claimed.v1", {
        ...binding, leaseId: "lease_wake_contracts", leaseExpiresAt: "2026-07-16T01:00:00.000Z"
      }),
      streamId: "agent_wake_supervisor_ws_other_epoch_wake_contracts"
    }).success).toBe(false);
  });

  it("rejects missing causation and incomplete durable readback bindings", () => {
    const payload = { ...binding, leaseId: "lease_wake_contracts", leaseExpiresAt: "2026-07-16T01:00:00.000Z" };
    delete (payload as Partial<typeof payload>).causation;
    expect(validateKnowledgeEvent(wakeEvent("agent.wake.supervisor.lease.claimed.v1", payload)).success).toBe(false);
  });

  it("rejects hostile secret-shaped lifecycle payload material without accepting an unknown key", () => {
    expect(validateKnowledgeEvent(wakeEvent("agent.wake.supervisor.degraded.v1", {
      ...binding,
      diagnosticId: "diag_wake_degraded",
      category: "scheduler-unavailable",
      token: "sk_live_not_allowed"
    })).success).toBe(false);
  });

});
