import { describe, expect, it } from "vitest";
import {
  createPortableWorkspaceLifecyclePorts,
  inspectCurrentPortableWorkspaceAdmissionForMountedArtifactAuthority,
  type PortableWorkspaceLifecycleInput
} from "../src/portable-workspace-lifecycle.js";
import type {
  ActiveClaimReconciliationPort,
  ClaimReconciliationAdmissionTuple,
  DurableSupervisorLeasePort,
  RevalidatedActiveClaimEvidence,
  SupervisorLeaseAdmissionInput,
  SupervisorLeaseReadbackEvidence,
  WorkspaceAdmissionSnapshot
} from "../../agent/src/wake-supervisor.js";

const revalidate = (operation: "wake" | "resume" | "recovery") => ({
  operation,
  expectedWorkspaceId: "ws_portable_lifecycle",
  requiredCapabilities: ["wake", "lifecycle"] as const
});

describe("portable workspace lifecycle authority", () => {
  it("inspects only an exact fully leased current lifecycle admission for mounted artifact authority", async () => {
    const fixture = createFixture({ issueLeaseReadback: true });
    const ports = createPortableWorkspaceLifecyclePorts(fixture.input);
    const grant = await ports.authority.revalidate(revalidate("wake"));
    if (!grant.ok) throw new Error("fixture must issue an admission");
    const lease = await ports.supervisorLease.readOrAcquire(leaseInput(grant.admission));
    if (lease.outcome !== "acquired-and-read-back") {
      throw new Error("fixture must issue a mounted lease readback");
    }

    const inspection = inspectCurrentPortableWorkspaceAdmissionForMountedArtifactAuthority(ports);

    expect(inspection.admission).toBe(grant.admission);
    expect(inspection.facts).toMatchObject({
      workspaceId: fixture.workspaceId,
      mountInstanceId: "mount-instance:1",
      highWaterOrdinal: 5
    });
    expect(Object.isFrozen(inspection.facts)).toBe(true);
    expect(() => inspectCurrentPortableWorkspaceAdmissionForMountedArtifactAuthority({ ...ports })).toThrow(
      "portable workspace lifecycle ports are not registered"
    );
  });

  it("rejects a freshly constructed matching admission before either mounted port is called", async () => {
    const fixture = createFixture();
    const ports = createPortableWorkspaceLifecyclePorts(fixture.input);
    const grant = await ports.authority.revalidate(revalidate("wake"));
    if (!grant.ok) throw new Error("fixture must issue an admission");
    const constructed = {
      identityAndMount: { ...grant.admission.identityAndMount },
      admissionGeneration: { ...grant.admission.admissionGeneration }
    } as WorkspaceAdmissionSnapshot;

    await Promise.all([
      ports.supervisorLease.readOrAcquire(leaseInput(constructed)).catch(() => undefined),
      ports.activeClaimReconciliation.readByIdempotencyKey(reconciliationReadInput(constructed)).catch(() => undefined)
    ]);

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

  it("rejects swapped policy, lock, high-water, and readback evidence before the relevant mounted port is called", async () => {
    for (const [label, mutate] of [
      ["lease policy digest", (admission: WorkspaceAdmissionSnapshot) => leaseInput({
        ...admission,
        admissionGeneration: admission.admissionGeneration
      }, { policyDigest: "sha256:swapped-policy" })],
      ["lease lock digest", (admission: WorkspaceAdmissionSnapshot) => leaseInput({
        ...admission,
        admissionGeneration: admission.admissionGeneration
      }, { lockStateDigest: "sha256:swapped-lock" })],
      ["reconciliation policy digest", (admission: WorkspaceAdmissionSnapshot) => reconciliationReadInput(admission, swappedTuple(admission, "policyDigest"))],
      ["reconciliation lock digest", (admission: WorkspaceAdmissionSnapshot) => reconciliationReadInput(admission, swappedTuple(admission, "lockStateDigest"))],
      ["reconciliation high-water mark", (admission: WorkspaceAdmissionSnapshot) => reconciliationReadInput(admission, swappedTuple(admission, "highWaterMark"))],
      ["reconciliation policy readback", (admission: WorkspaceAdmissionSnapshot) => reconciliationReadInput(admission, swappedTuple(admission, "policyReadbackEventId"))],
      ["reconciliation high-water readback", (admission: WorkspaceAdmissionSnapshot) => reconciliationReadInput(admission, swappedTuple(admission, "highWaterReadbackEventId"))]
    ] as const) {
      const fixture = createFixture();
      const ports = createPortableWorkspaceLifecyclePorts(fixture.input);
      const grant = await ports.authority.revalidate(revalidate("wake"));
      if (!grant.ok) throw new Error("fixture must issue an admission");

      if (label.startsWith("lease")) {
        await ports.supervisorLease.readOrAcquire(mutate(grant.admission) as SupervisorLeaseAdmissionInput).catch(() => undefined);
      } else {
        await ports.activeClaimReconciliation.readByIdempotencyKey(mutate(grant.admission) as ReturnType<typeof reconciliationReadInput>).catch(() => undefined);
      }

      expect(fixture.calls, label).toEqual({
        lease: 0,
        reconciliation: 0,
        runtime: 0,
        provider: 0,
        tool: 0,
        artifact: 0,
        fallback: 0
      });
    }
  });

  it("rejects caller-supplied lease event and lease-readback facts before reconciliation reaches the mount", async () => {
    for (const field of ["leaseEventId", "readbackEventId"] as const) {
      const fixture = createFixture({ issueLeaseReadback: true });
      const ports = createPortableWorkspaceLifecyclePorts(fixture.input);
      const grant = await ports.authority.revalidate(revalidate("wake"));
      if (!grant.ok) throw new Error("fixture must issue an admission");
      const lease = await ports.supervisorLease.readOrAcquire(leaseInput(grant.admission));
      if (lease.outcome !== "acquired-and-read-back") throw new Error("fixture must issue a mounted lease readback");
      fixture.calls.lease = 0;

      await ports.activeClaimReconciliation.readByIdempotencyKey(
        reconciliationReadInput(grant.admission, swappedIssuedLeaseTuple(grant.admission, lease.readback, field))
      ).catch(() => undefined);

      expect(fixture.calls, field).toEqual({
        lease: 0,
        reconciliation: 0,
        runtime: 0,
        provider: 0,
        tool: 0,
        artifact: 0,
        fallback: 0
      });
    }
  });

  it("rejects hostile nested reconciliation evidence before the reconciliation mount is called", async () => {
    const rejected: string[] = [];
    for (const form of ["accessor", "custom-prototype", "sparse-array", "extra-key"] as const) {
      for (const path of forwardedReconciliationEvidencePaths) {
        const fixture = createFixture({ issueLeaseReadback: true });
        const ports = createPortableWorkspaceLifecyclePorts(fixture.input);
        const grant = await ports.authority.revalidate(revalidate("wake"));
        if (!grant.ok) throw new Error("fixture must issue an admission");
        const lease = await ports.supervisorLease.readOrAcquire(leaseInput(grant.admission));
        if (lease.outcome !== "acquired-and-read-back") throw new Error("fixture must issue a mounted lease readback");
        fixture.calls.lease = 0;
        const input = reconciliationAppendInput(grant.admission, reconciliationAdmission(grant.admission, lease.readback));
        const hostile = hostileNestedEvidence(path.read(input), form);
        path.write(input, hostile.value);

        await ports.activeClaimReconciliation.appendAndReadBack(input).catch(() => undefined);
        if (fixture.calls.reconciliation !== 0 || hostile.getterCalls !== 0) rejected.push(`${path.name}:${form}`);
      }
    }

    expect(rejected).toEqual([]);
  });

  it("rejects an invented reconciliation when no mounted outage is pending before the reconciliation mount is called", async () => {
    const fixture = createFixture({ issueLeaseReadback: true, observedActiveClaim: canonicalObservedActiveClaim() });
    const ports = createPortableWorkspaceLifecyclePorts(fixture.input);
    const grant = await ports.authority.revalidate(revalidate("wake"));
    if (!grant.ok) throw new Error("fixture must issue an admission");
    const lease = await ports.supervisorLease.readOrAcquire(leaseInput(grant.admission));
    if (lease.outcome !== "acquired-and-read-back") throw new Error("fixture must issue a mounted lease readback");
    fixture.calls.lease = 0;

    await ports.activeClaimReconciliation.appendAndReadBack(
      reconciliationAppendInput(grant.admission, reconciliationAdmission(grant.admission, lease.readback))
    ).catch(() => undefined);

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

  it("rejects a reconciliation whose active claim is swapped from the mounted outage before the reconciliation mount is called", async () => {
    const fixture = createFixture({ issueLeaseReadback: true, observedActiveClaim: canonicalObservedActiveClaim() });
    const ports = createPortableWorkspaceLifecyclePorts(fixture.input);
    await ports.authority.revalidate(revalidate("wake"));
    ports.authority.invalidate!("authority-loss");
    const grant = await ports.authority.revalidate(revalidate("resume"));
    if (!grant.ok || grant.observedActiveClaim === undefined || grant.outage === undefined) {
      throw new Error("fixture must issue a reconciled admission");
    }
    const lease = await ports.supervisorLease.readOrAcquire(leaseInput(grant.admission));
    if (lease.outcome !== "acquired-and-read-back") throw new Error("fixture must issue a mounted lease readback");
    fixture.calls.lease = 0;
    const swappedClaim = { ...grant.observedActiveClaim, claimId: "claim_swapped" };

    await ports.activeClaimReconciliation.appendAndReadBack(
      reconciliationAppendInput(
        grant.admission,
        reconciliationAdmission(grant.admission, lease.readback),
        swappedClaim,
        grant.outage
      )
    ).catch(() => undefined);

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

  it("rejects reconciliation when the mounted active claim changed after the pending outage formed", async () => {
    const outageClaim = canonicalObservedActiveClaim();
    const fixture = createFixture({ issueLeaseReadback: true, observedActiveClaim: outageClaim });
    const ports = createPortableWorkspaceLifecyclePorts(fixture.input);
    await ports.authority.revalidate(revalidate("wake"));
    ports.authority.invalidate!("authority-loss");
    fixture.setMountedObservedActiveClaim({ ...outageClaim, claimId: "claim_later" });
    const grant = await ports.authority.revalidate(revalidate("resume"));
    if (!grant.ok || grant.observedActiveClaim === undefined || grant.outage === undefined) {
      throw new Error("fixture must issue a later-claim reconciled admission");
    }
    const lease = await ports.supervisorLease.readOrAcquire(leaseInput(grant.admission));
    if (lease.outcome !== "acquired-and-read-back") throw new Error("fixture must issue a mounted lease readback");
    fixture.calls.lease = 0;

    await ports.activeClaimReconciliation.appendAndReadBack(
      reconciliationAppendInput(
        grant.admission,
        reconciliationAdmission(grant.admission, lease.readback),
        grant.observedActiveClaim,
        grant.outage
      )
    ).catch(() => undefined);

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

  it("does not turn an active lock into a workspace-unavailable outage", async () => {
    const fixture = createFixture({ observedActiveClaim: canonicalObservedActiveClaim() });
    const ports = createPortableWorkspaceLifecyclePorts(fixture.input);
    const firstGrant = await ports.authority.revalidate(revalidate("wake"));
    if (!firstGrant.ok) throw new Error("fixture must issue an admission");

    fixture.setMountedFailureCategory("active-lock");
    await expect(ports.authority.revalidate(revalidate("resume"))).resolves.toEqual({
      ok: false,
      category: "active-lock"
    });

    fixture.setMountedFailureCategory(undefined);
    const laterGrant = await ports.authority.revalidate(revalidate("resume"));
    if (!laterGrant.ok) throw new Error("fixture must issue a later admission");
    expect(laterGrant.outage).toBeUndefined();
    expect(laterGrant.observedActiveClaim).toBeUndefined();
  });

  it("rejects hostile and swapped reconciliation readbacks while returning only canonical immutable evidence", async () => {
    for (const readbackKind of ["hostile", "swapped", "canonical"] as const) {
      const fixture = createFixture({ issueLeaseReadback: true, observedActiveClaim: canonicalObservedActiveClaim() });
      const ports = createPortableWorkspaceLifecyclePorts(fixture.input);
      await ports.authority.revalidate(revalidate("wake"));
      ports.authority.invalidate!("authority-loss");
      const grant = await ports.authority.revalidate(revalidate("resume"));
      if (!grant.ok || grant.observedActiveClaim === undefined || grant.outage === undefined) {
        throw new Error("fixture must issue a reconciled admission");
      }
      const lease = await ports.supervisorLease.readOrAcquire(leaseInput(grant.admission));
      if (lease.outcome !== "acquired-and-read-back") throw new Error("fixture must issue a mounted lease readback");
      const appendInput = reconciliationAppendInput(
        grant.admission,
        reconciliationAdmission(grant.admission, lease.readback),
        grant.observedActiveClaim,
        grant.outage
      );
      const canonicalReadback = {
        record: appendInput.record,
        reconciliationEventId: "evt_reconciliation",
        readbackEventId: "evt_reconciliation_readback",
        admission: appendInput.admission
      };
      if (readbackKind === "hostile") {
        Object.defineProperty(canonicalReadback, "record", {
          enumerable: true,
          get() { throw new Error("hostile reconciliation readback getter must not execute"); }
        });
      } else if (readbackKind === "swapped") {
        canonicalReadback.record = { ...appendInput.record, claimId: "claim_swapped" };
      }
      fixture.setReconciliationReadback(canonicalReadback);

      if (readbackKind === "canonical") {
        const result = await ports.activeClaimReconciliation.appendAndReadBack(appendInput);
        expect(Object.isFrozen(result)).toBe(true);
        expect(Object.isFrozen(result.record)).toBe(true);
        expect(Object.isFrozen(result.record.outageObservation)).toBe(true);
        expect(Object.isFrozen(result.record.causation)).toBe(true);
        expect(Object.isFrozen(result.record.revalidatedAuthority)).toBe(true);
        expect(Object.isFrozen(result.admission)).toBe(true);
        expect(Object.isFrozen(result.admission.authorityIdentityAndMount)).toBe(true);
        expect(Object.isFrozen(result.admission.admissionGeneration)).toBe(true);
        expect(Object.isFrozen(result.admission.verifiedLease)).toBe(true);
      } else {
        await expect(ports.activeClaimReconciliation.appendAndReadBack(appendInput)).rejects.toThrow();
      }
      expect(fixture.calls.reconciliation, readbackKind).toBe(1);
    }
  });

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

    ports.authority.invalidate!("authority-loss");
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

function leaseInput(
  admission: WorkspaceAdmissionSnapshot,
  overrides: Partial<Pick<SupervisorLeaseAdmissionInput, "policyDigest" | "lockStateDigest">> = {}
): SupervisorLeaseAdmissionInput {
  return {
    admission,
    residentId: "agent_default",
    supervisorEpoch: "epoch_portable",
    policyVersion: "policy.v1",
    policyDigest: "sha256:policy",
    lockStateDigest: "sha256:lock",
    causationId: "cause_portable",
    correlationId: "correlation_portable",
    ...overrides
  };
}

function reconciliationReadInput(
  admission: WorkspaceAdmissionSnapshot,
  tuple = reconciliationAdmission(admission)
) {
  return {
    admission: tuple,
    reconciliationIdempotencyKey: "reconcile:authority-repair",
    workspaceId: "ws_portable_lifecycle",
    residentId: "agent_default" as const,
    supervisorEpoch: "epoch_portable"
  };
}

function swappedTuple(
  admission: WorkspaceAdmissionSnapshot,
  field: "policyDigest" | "lockStateDigest" | "highWaterMark" | "policyReadbackEventId" | "highWaterReadbackEventId"
): ClaimReconciliationAdmissionTuple {
  const tuple = reconciliationAdmission(admission);
  if (field === "policyDigest" || field === "lockStateDigest") {
    const value = field === "policyDigest" ? "sha256:swapped-policy" : "sha256:swapped-lock";
    const policyAndLock = { ...tuple.policyAndLock, [field]: value };
    return {
      ...tuple,
      verifiedLease: { ...tuple.verifiedLease, [field]: value, policyAndLock },
      policyAndLock
    };
  }
  if (field === "highWaterMark") {
    const highWater = { ...tuple.highWater, highWaterMark: "high-water:swapped" };
    return {
      ...tuple,
      verifiedLease: { ...tuple.verifiedLease, highWaterMark: "high-water:swapped", highWater },
      highWater
    };
  }
  if (field === "policyReadbackEventId") {
    const policyAndLock = { ...tuple.policyAndLock, readbackEventId: "evt_policy_lock_readback_swapped" };
    return {
      ...tuple,
      verifiedLease: { ...tuple.verifiedLease, policyAndLock },
      policyAndLock
    };
  }
  const highWater = { ...tuple.highWater, readbackEventId: "evt_high_water_readback_swapped" };
  return {
    ...tuple,
    verifiedLease: { ...tuple.verifiedLease, highWater },
    highWater
  };
}

function swappedIssuedLeaseTuple(
  admission: WorkspaceAdmissionSnapshot,
  readback: SupervisorLeaseReadbackEvidence,
  field: "leaseEventId" | "readbackEventId"
): ClaimReconciliationAdmissionTuple {
  const tuple = reconciliationAdmission(admission, readback);
  if (field === "leaseEventId") {
    const policyAndLock = { ...tuple.policyAndLock, leaseEventId: "evt_lease_swapped" };
    const highWater = { ...tuple.highWater, leaseEventId: "evt_lease_swapped" };
    return {
      ...tuple,
      verifiedLease: { ...tuple.verifiedLease, leaseEventId: "evt_lease_swapped", policyAndLock, highWater },
      policyAndLock,
      highWater
    };
  }
  const policyAndLock = { ...tuple.policyAndLock, leaseReadbackEventId: "evt_lease_readback_swapped" };
  const highWater = { ...tuple.highWater, leaseReadbackEventId: "evt_lease_readback_swapped" };
  return {
    ...tuple,
    verifiedLease: { ...tuple.verifiedLease, readbackEventId: "evt_lease_readback_swapped", policyAndLock, highWater },
    policyAndLock,
    highWater
  };
}

function reconciliationAdmission(
  admission: WorkspaceAdmissionSnapshot,
  verifiedLease: SupervisorLeaseReadbackEvidence = canonicalLeaseReadback()
): ClaimReconciliationAdmissionTuple {
  return {
    authorityIdentityAndMount: admission.identityAndMount,
    admissionGeneration: admission.admissionGeneration,
    verifiedLease,
    policyAndLock: verifiedLease.policyAndLock,
    highWater: verifiedLease.highWater
  };
}

function canonicalLeaseReadback(): SupervisorLeaseReadbackEvidence {
  return {
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
}

function canonicalObservedActiveClaim(): RevalidatedActiveClaimEvidence {
  return {
    workspaceId: "ws_portable_lifecycle",
    residentId: "agent_default",
    supervisorEpoch: "epoch_portable",
    claimId: "claim_portable",
    attemptId: "attempt_portable",
    priorClaimEventId: "evt_prior_claim",
    priorClaimLeaseId: "lease_prior_claim",
    readbackEventId: "evt_claim_readback",
    causation: { causationId: "cause_portable", correlationId: "correlation_portable" }
  };
}

function reconciliationAppendInput(
  admission: WorkspaceAdmissionSnapshot,
  tuple: ClaimReconciliationAdmissionTuple,
  observedActiveClaim = canonicalObservedActiveClaim(),
  outage: {
    readonly safeObservationId: string;
    readonly outageObservedAt: string;
    readonly category: "workspace-unavailable" | "workspace-identity-mismatch" | "workspace-readback-failed";
    readonly priorClaimEventId: string;
    readonly priorClaimLeaseId: string;
    readonly priorAuthorityEvidenceId: string;
    readonly highWaterBeforeOutage: string;
  } = {
    safeObservationId: "outage:portable",
    outageObservedAt: "2026-07-14T17:30:00.000Z",
    category: "workspace-unavailable" as const,
    priorClaimEventId: observedActiveClaim.priorClaimEventId,
    priorClaimLeaseId: observedActiveClaim.priorClaimLeaseId,
    priorAuthorityEvidenceId: tuple.authorityIdentityAndMount.authorityEvidenceId,
    highWaterBeforeOutage: tuple.highWater.highWaterMark
  }
) {
  return {
    admission: tuple,
    reconciliationIdempotencyKey: "reconcile:append-authority-repair",
    workspaceId: "ws_portable_lifecycle",
    residentId: "agent_default" as const,
    supervisorEpoch: "epoch_portable",
    record: {
      schemaVersion: "resident-wake-workspace-unavailable.v1" as const,
      outcome: "workspace-unavailable" as const,
      resumable: true as const,
      claimDisposition: "checkpointed" as const,
      workspaceId: observedActiveClaim.workspaceId,
      residentId: observedActiveClaim.residentId,
      supervisorEpoch: observedActiveClaim.supervisorEpoch,
      claimId: observedActiveClaim.claimId,
      attemptId: observedActiveClaim.attemptId,
      outageObservation: { ...outage },
      causation: { ...observedActiveClaim.causation },
      revalidatedAuthority: {
        identityEventId: tuple.authorityIdentityAndMount.workspaceIdentityEventId,
        mountEvidenceId: tuple.authorityIdentityAndMount.mountEvidenceId,
        authorityEvidenceId: tuple.authorityIdentityAndMount.authorityEvidenceId,
        highWaterAfterRevalidation: tuple.highWater.highWaterMark,
        policyVersion: tuple.policyAndLock.policyVersion,
        policyDigest: tuple.policyAndLock.policyDigest,
        lockStateDigest: tuple.policyAndLock.lockStateDigest,
        supervisorLeaseEventId: tuple.verifiedLease.leaseEventId,
        supervisorLeaseReadbackEventId: tuple.verifiedLease.readbackEventId,
        supervisorLeaseExpiresAt: tuple.verifiedLease.expiresAt
      },
      reconciliationIdempotencyKey: "reconcile:append-authority-repair"
    },
    observedActiveClaim,
    outage
  };
}

type HostileEvidenceForm = "accessor" | "custom-prototype" | "sparse-array" | "extra-key";

function hostileNestedEvidence(value: object, form: HostileEvidenceForm): { readonly value: unknown; readonly getterCalls: number } {
  if (form === "custom-prototype") return { value: Object.assign(Object.create({ inherited: true }), value), getterCalls: 0 };
  if (form === "sparse-array") return { value: [value, ,], getterCalls: 0 };
  if (form === "extra-key") return { value: { ...value, unsupported: true }, getterCalls: 0 };
  const copy = { ...value } as Record<string, unknown>;
  const field = Object.keys(copy)[0];
  if (field === undefined) throw new Error("hostile fixture needs a field");
  let getterCalls = 0;
  Object.defineProperty(copy, field, {
    enumerable: true,
    get() {
      getterCalls += 1;
      throw new Error("hostile accessor must not execute");
    }
  });
  return {
    value: copy,
    get getterCalls() { return getterCalls; }
  };
}

const forwardedReconciliationEvidencePaths = [
  {
    name: "admission.verifiedLease",
    read: (input: ReturnType<typeof reconciliationAppendInput>) => input.admission.verifiedLease,
    write: (input: ReturnType<typeof reconciliationAppendInput>, value: unknown) => { input.admission = { ...input.admission, verifiedLease: value as SupervisorLeaseReadbackEvidence }; }
  },
  {
    name: "admission.verifiedLease.causation",
    read: (input: ReturnType<typeof reconciliationAppendInput>) => input.admission.verifiedLease.causation,
    write: (input: ReturnType<typeof reconciliationAppendInput>, value: unknown) => { input.admission = { ...input.admission, verifiedLease: { ...input.admission.verifiedLease, causation: value as RevalidatedActiveClaimEvidence["causation"] } }; }
  },
  {
    name: "admission.verifiedLease.policyAndLock",
    read: (input: ReturnType<typeof reconciliationAppendInput>) => input.admission.verifiedLease.policyAndLock,
    write: (input: ReturnType<typeof reconciliationAppendInput>, value: unknown) => { input.admission = { ...input.admission, verifiedLease: { ...input.admission.verifiedLease, policyAndLock: value as SupervisorLeaseReadbackEvidence["policyAndLock"] } }; }
  },
  {
    name: "admission.verifiedLease.highWater",
    read: (input: ReturnType<typeof reconciliationAppendInput>) => input.admission.verifiedLease.highWater,
    write: (input: ReturnType<typeof reconciliationAppendInput>, value: unknown) => { input.admission = { ...input.admission, verifiedLease: { ...input.admission.verifiedLease, highWater: value as SupervisorLeaseReadbackEvidence["highWater"] } }; }
  },
  {
    name: "admission.policyAndLock",
    read: (input: ReturnType<typeof reconciliationAppendInput>) => input.admission.policyAndLock,
    write: (input: ReturnType<typeof reconciliationAppendInput>, value: unknown) => { input.admission = { ...input.admission, policyAndLock: value as ClaimReconciliationAdmissionTuple["policyAndLock"] }; }
  },
  {
    name: "admission.highWater",
    read: (input: ReturnType<typeof reconciliationAppendInput>) => input.admission.highWater,
    write: (input: ReturnType<typeof reconciliationAppendInput>, value: unknown) => { input.admission = { ...input.admission, highWater: value as ClaimReconciliationAdmissionTuple["highWater"] }; }
  },
  {
    name: "record",
    read: (input: ReturnType<typeof reconciliationAppendInput>) => input.record,
    write: (input: ReturnType<typeof reconciliationAppendInput>, value: unknown) => { input.record = value as typeof input.record; }
  },
  {
    name: "record.outageObservation",
    read: (input: ReturnType<typeof reconciliationAppendInput>) => input.record.outageObservation,
    write: (input: ReturnType<typeof reconciliationAppendInput>, value: unknown) => { input.record = { ...input.record, outageObservation: value as typeof input.record.outageObservation }; }
  },
  {
    name: "record.causation",
    read: (input: ReturnType<typeof reconciliationAppendInput>) => input.record.causation,
    write: (input: ReturnType<typeof reconciliationAppendInput>, value: unknown) => { input.record = { ...input.record, causation: value as typeof input.record.causation }; }
  },
  {
    name: "record.revalidatedAuthority",
    read: (input: ReturnType<typeof reconciliationAppendInput>) => input.record.revalidatedAuthority,
    write: (input: ReturnType<typeof reconciliationAppendInput>, value: unknown) => { input.record = { ...input.record, revalidatedAuthority: value as typeof input.record.revalidatedAuthority }; }
  }
] as const;

function createFixture(options: {
  readonly issueLeaseReadback?: boolean;
  readonly observedActiveClaim?: RevalidatedActiveClaimEvidence;
} = {}) {
  let mountedObservedActiveClaim = options.observedActiveClaim;
  let mountedFailureCategory: "active-lock" | undefined;
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
      if (options.issueLeaseReadback === true) {
        return { outcome: "acquired-and-read-back" as const, readback: canonicalLeaseReadback() };
      }
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
      if (reconciliationReadback !== undefined) {
        return reconciliationReadback as Awaited<ReturnType<ActiveClaimReconciliationPort["appendAndReadBack"]>>;
      }
      throw new Error("revoked admission reached mounted reconciliation");
    }
  };
  let reconciliationReadback: unknown;
  const input: PortableWorkspaceLifecycleInput = {
    workspaceId,
    residentId: "agent_default",
    supervisorEpoch,
    mountedFacts: {
      async read() {
        if (mountedFailureCategory !== undefined) {
          return { ok: false as const, category: mountedFailureCategory };
        }
        return {
          ok: true as const,
          facts: {
            schemaVersion: "portable-workspace-mounted-facts.v1" as const,
            ...mountedReadback,
            mountInstanceId: "mount-instance:1",
            ledgerStoreEvidenceId: "evidence_ledger",
            artifactStoreEvidenceId: "evidence_artifact",
            derivativeStoreEvidenceId: "evidence_derivative",
            highWaterOrdinal: 5,
            ...(mountedObservedActiveClaim === undefined ? {} : { observedActiveClaim: mountedObservedActiveClaim })
          }
        };
      }
    },
    supervisorLease,
    activeClaimReconciliation,
    now: () => "2026-07-14T17:30:00.000Z",
    createSafeOutageObservationId: () => "outage:1"
  };
  return {
    input,
    calls,
    workspaceId,
    supervisorEpoch,
    mountedIdentity,
    mountedReadback,
    setReconciliationReadback(value: unknown) { reconciliationReadback = value; },
    setMountedFailureCategory(value: "active-lock" | undefined) { mountedFailureCategory = value; },
    setMountedObservedActiveClaim(value: RevalidatedActiveClaimEvidence | undefined) { mountedObservedActiveClaim = value; }
  };
}
