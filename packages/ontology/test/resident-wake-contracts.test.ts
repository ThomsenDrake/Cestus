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
      reconciliationReadbackEventId: "evt_reconciliation_readback"
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
