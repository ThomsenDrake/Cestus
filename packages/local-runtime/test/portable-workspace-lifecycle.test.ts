import { describe, expect, it } from "vitest";
import {
  createPortableWorkspaceLifecyclePorts,
  type PortableWorkspaceLifecycleInput
} from "../src/portable-workspace-lifecycle.js";
import type {
  ActiveClaimReconciliationPort,
  ClaimReconciliationAdmissionTuple,
  DurableSupervisorLeasePort,
  SupervisorLeaseAdmissionInput,
  WorkspaceAdmissionSnapshot
} from "../../agent/src/wake-supervisor.js";

const revalidate = (operation: "wake" | "resume" | "recovery") => ({
  operation,
  expectedWorkspaceId: "ws_portable_lifecycle",
  requiredCapabilities: ["wake", "lifecycle"] as const
});

describe("portable workspace lifecycle authority", () => {
  it("does not revive an invalidated admission when the same mounted identity revalidates", async () => {
    const fixture = createFixture();
    const ports = createPortableWorkspaceLifecyclePorts(fixture.input);
    const firstGrant = await ports.authority.revalidate(revalidate("wake"));
    if (!firstGrant.ok) throw new Error("fixture must issue the first admission");

    expect(firstGrant.admission).toMatchObject({
      identityAndMount: fixture.mountedIdentity,
      admissionGeneration: {
        schemaVersion: "resident-wake-admission-generation.v1",
        generationId: "admission:1"
      }
    });
    expect(fixture.mountedReadback).toEqual({
      workspaceId: fixture.workspaceId,
      residentId: "agent_default",
      workspaceIdentityEventId: "evt_workspace_identity",
      mountEvidenceId: "evidence_mount",
      authorityEvidenceId: "evidence_authority",
      policyVersion: "policy.v1",
      policyDigest: "sha256:policy",
      lockStateDigest: "sha256:lock",
      policyAndLockReadbackEventId: "evt_policy_lock_readback",
      highWaterMark: "high-water:5",
      highWaterReadbackEventId: "evt_high_water_readback"
    });

    ports.authority.invalidate("authority-loss");
    const laterSameIdentityGrant = await ports.authority.revalidate(revalidate("resume"));
    if (!laterSameIdentityGrant.ok) throw new Error("fixture must issue a fresh admission");
    expect(laterSameIdentityGrant.admission.identityAndMount).toEqual(firstGrant.admission.identityAndMount);
    expect(laterSameIdentityGrant.admission.admissionGeneration).toEqual({
      schemaVersion: "resident-wake-admission-generation.v1",
      generationId: "admission:2"
    });

    await expect(ports.supervisorLease.readOrAcquire(leaseInput(firstGrant.admission))).rejects.toThrow(
      "workspace admission is no longer current"
    );
    await expect(ports.activeClaimReconciliation.readByIdempotencyKey({
      admission: reconciliationAdmission(firstGrant.admission),
      reconciliationIdempotencyKey: "reconcile:revoked-generation",
      workspaceId: fixture.workspaceId,
      residentId: "agent_default",
      supervisorEpoch: fixture.supervisorEpoch
    })).rejects.toThrow("workspace admission is no longer current");

    expect(fixture.calls).toEqual({
      lease: 0,
      reconciliation: 0,
      runtime: 0,
      provider: 0,
      tool: 0,
      artifact: 0,
      fallback: 0
    });
  });
});

function leaseInput(admission: WorkspaceAdmissionSnapshot): SupervisorLeaseAdmissionInput {
  return {
    admission,
    residentId: "agent_default",
    supervisorEpoch: "epoch_portable",
    policyVersion: "policy.v1",
    policyDigest: "sha256:policy",
    lockStateDigest: "sha256:lock",
    causationId: "cause_portable",
    correlationId: "correlation_portable"
  };
}

function reconciliationAdmission(admission: WorkspaceAdmissionSnapshot): ClaimReconciliationAdmissionTuple {
  const verifiedLease = {
    schemaVersion: "resident-supervisor-lease-readback.v1" as const,
    workspaceId: "ws_portable_lifecycle",
    residentId: "agent_default" as const,
    supervisorEpoch: "epoch_portable",
    workspaceIdentityEventId: "evt_workspace_identity",
    mountEvidenceId: "evidence_mount",
    authorityEvidenceId: "evidence_authority",
    policyVersion: "policy.v1",
    policyDigest: "sha256:policy",
    lockStateDigest: "sha256:lock",
    highWaterMark: "high-water:5",
    leaseEventId: "evt_lease",
    readbackEventId: "evt_lease_readback",
    expiresAt: "2026-07-14T18:00:00.000Z",
    causation: { causationId: "cause_portable", correlationId: "correlation_portable" },
    policyAndLock: {
      authorityEvidenceId: "evidence_authority",
      mountEvidenceId: "evidence_mount",
      leaseEventId: "evt_lease",
      leaseReadbackEventId: "evt_lease_readback",
      policyVersion: "policy.v1",
      policyDigest: "sha256:policy",
      lockStateDigest: "sha256:lock",
      readbackEventId: "evt_policy_lock_readback"
    },
    highWater: {
      authorityEvidenceId: "evidence_authority",
      mountEvidenceId: "evidence_mount",
      leaseEventId: "evt_lease",
      leaseReadbackEventId: "evt_lease_readback",
      highWaterMark: "high-water:5",
      readbackEventId: "evt_high_water_readback"
    }
  };
  return {
    authorityIdentityAndMount: admission.identityAndMount,
    admissionGeneration: admission.admissionGeneration,
    verifiedLease,
    policyAndLock: verifiedLease.policyAndLock,
    highWater: verifiedLease.highWater
  };
}

function createFixture() {
  const calls = {
    lease: 0,
    reconciliation: 0,
    runtime: 0,
    provider: 0,
    tool: 0,
    artifact: 0,
    fallback: 0
  };
  const workspaceId = "ws_portable_lifecycle";
  const supervisorEpoch = "epoch_portable";
  const mountedIdentity = {
    workspaceId,
    residentId: "agent_default" as const,
    supervisorEpoch,
    workspaceIdentityEventId: "evt_workspace_identity",
    mountEvidenceId: "evidence_mount",
    authorityEvidenceId: "evidence_authority"
  };
  const mountedReadback = {
    workspaceId,
    residentId: "agent_default" as const,
    workspaceIdentityEventId: "evt_workspace_identity",
    mountEvidenceId: "evidence_mount",
    authorityEvidenceId: "evidence_authority",
    policyVersion: "policy.v1",
    policyDigest: "sha256:policy",
    lockStateDigest: "sha256:lock",
    policyAndLockReadbackEventId: "evt_policy_lock_readback",
    highWaterMark: "high-water:5",
    highWaterReadbackEventId: "evt_high_water_readback"
  };
  const supervisorLease: DurableSupervisorLeasePort = {
    async readOrAcquire() {
      calls.lease += 1;
      throw new Error("revoked admission reached mounted lease");
    }
  };
  const activeClaimReconciliation: ActiveClaimReconciliationPort = {
    async readByIdempotencyKey() {
      calls.reconciliation += 1;
      throw new Error("revoked admission reached mounted reconciliation");
    },
    async appendAndReadBack() {
      calls.reconciliation += 1;
      throw new Error("revoked admission reached mounted reconciliation");
    }
  };
  const input: PortableWorkspaceLifecycleInput = {
    workspaceId,
    residentId: "agent_default",
    supervisorEpoch,
    mountedFacts: {
      async read() {
        return {
          ok: true as const,
          facts: {
            schemaVersion: "portable-workspace-mounted-facts.v1" as const,
            ...mountedReadback,
            mountInstanceId: "mount-instance:1",
            ledgerStoreEvidenceId: "evidence_ledger",
            artifactStoreEvidenceId: "evidence_artifact",
            derivativeStoreEvidenceId: "evidence_derivative",
            highWaterOrdinal: 5
          }
        };
      }
    },
    supervisorLease,
    activeClaimReconciliation,
    now: () => "2026-07-14T17:30:00.000Z",
    createSafeOutageObservationId: () => "outage:1"
  };
  return { input, calls, workspaceId, supervisorEpoch, mountedIdentity, mountedReadback };
}
