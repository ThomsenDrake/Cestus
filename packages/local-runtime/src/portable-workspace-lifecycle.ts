import type {
  ActiveClaimReconciliationPort,
  ClaimReconciliationAdmissionTuple,
  DurableSupervisorLeasePort,
  RevalidatedActiveClaimEvidence,
  SupervisorLeaseAdmissionInput,
  WorkspaceAdmissionGeneration,
  WorkspaceAdmissionSnapshot,
  WorkspaceAvailabilityAuthority,
  WorkspaceOutageObservation
} from "../../agent/src/wake-supervisor.js";

type AvailabilityFailure = Extract<
  Awaited<ReturnType<WorkspaceAvailabilityAuthority["revalidate"]>>,
  { readonly ok: false }
>;

type AvailabilityCategory = AvailabilityFailure["category"];
type OutageCategory = WorkspaceOutageObservation["category"];

export interface PortableWorkspaceMountedFacts {
  readonly schemaVersion: "portable-workspace-mounted-facts.v1";
  readonly workspaceId: string;
  readonly residentId: "agent_default";
  readonly workspaceIdentityEventId: string;
  readonly mountInstanceId: string;
  readonly mountEvidenceId: string;
  readonly authorityEvidenceId: string;
  readonly ledgerStoreEvidenceId: string;
  readonly artifactStoreEvidenceId: string;
  readonly derivativeStoreEvidenceId: string;
  readonly policyVersion: string;
  readonly policyDigest: string;
  readonly lockStateDigest: string;
  readonly policyAndLockReadbackEventId: string;
  readonly highWaterMark: string;
  readonly highWaterReadbackEventId: string;
  readonly highWaterOrdinal: number;
  readonly observedActiveClaim?: RevalidatedActiveClaimEvidence;
}

export interface PortableWorkspaceMountedFactsPort {
  read(): Promise<
    | { readonly ok: true; readonly facts: PortableWorkspaceMountedFacts }
    | { readonly ok: false; readonly category: AvailabilityCategory }
  >;
}

export interface PortableWorkspaceLifecycleInput {
  readonly workspaceId: string;
  readonly residentId: "agent_default";
  readonly supervisorEpoch: string;
  readonly mountedFacts: PortableWorkspaceMountedFactsPort;
  readonly supervisorLease: DurableSupervisorLeasePort;
  readonly activeClaimReconciliation: ActiveClaimReconciliationPort;
  readonly now: () => string;
  readonly createSafeOutageObservationId: () => string;
}

export interface PortableWorkspaceLifecyclePorts {
  readonly authority: WorkspaceAvailabilityAuthority;
  readonly supervisorLease: DurableSupervisorLeasePort;
  readonly activeClaimReconciliation: ActiveClaimReconciliationPort;
}

interface ActiveAdmission {
  readonly revision: number;
  readonly snapshot: WorkspaceAdmissionSnapshot;
  readonly facts: PortableWorkspaceMountedFacts;
  readonly verifiedLease?: ClaimReconciliationAdmissionTuple["verifiedLease"];
}

/**
 * Creates the availability façade without exposing a ledger, writer, provider,
 * tool, runtime, or fallback store. A generation is issued for one admission
 * only; matching mount facts cannot make a revoked generation current again.
 */
export function createPortableWorkspaceLifecyclePorts(
  input: PortableWorkspaceLifecycleInput
): PortableWorkspaceLifecyclePorts {
  const workspaceId = requiredText(input.workspaceId);
  const residentId = input.residentId;
  const supervisorEpoch = requiredText(input.supervisorEpoch);
  const mountedFacts = input.mountedFacts;
  const mountedLease = input.supervisorLease;
  const mountedReconciliation = input.activeClaimReconciliation;
  const now = input.now;
  const createSafeOutageObservationId = input.createSafeOutageObservationId;
  let revision = 0;
  let nextGeneration = 0;
  let active: ActiveAdmission | undefined;
  let lastAccepted: PortableWorkspaceMountedFacts | undefined;
  let pendingOutage: WorkspaceOutageObservation | undefined;
  let pendingOutageClaim: RevalidatedActiveClaimEvidence | undefined;
  const issuedAdmissionIdentities = new WeakSet<object>();
  const issuedAdmissionGenerations = new WeakSet<object>();
  const invalidationListeners = new Set<(reason: "authority-loss" | "admission-mismatch") => void>();

  const authority: WorkspaceAvailabilityAuthority = Object.freeze({
    async revalidate(rawRequest: Parameters<WorkspaceAvailabilityAuthority["revalidate"]>[0]) {
      const request = canonicalRevalidationRequest(rawRequest);
      if (request.expectedWorkspaceId !== workspaceId) return unavailable("workspace-identity-mismatch");
      const admissionRevision = revision;
      let mounted: { readonly ok: true; readonly facts: PortableWorkspaceMountedFacts } | { readonly ok: false; readonly category: AvailabilityCategory };
      try {
        mounted = canonicalMountedReadback(await mountedFacts.read());
      } catch {
        return fail("workspace-readback-failed");
      }
      if (admissionRevision !== revision) return unavailable("workspace-unavailable");
      if (!mounted.ok) return fail(mounted.category);
      if (!matchesRuntime(mounted.facts, workspaceId, residentId, supervisorEpoch)) {
        return fail("workspace-identity-mismatch");
      }
      if (!compatibleWithPriorReadback(mounted.facts, lastAccepted)) {
        return fail("workspace-identity-mismatch");
      }

      lastAccepted = mounted.facts;
      const snapshot = freezeAdmission(
        mounted.facts,
        supervisorEpoch,
        ++nextGeneration,
        issuedAdmissionIdentities,
        issuedAdmissionGenerations
      );
      active = Object.freeze({ revision: admissionRevision, snapshot, facts: mounted.facts });
      if (pendingOutage === undefined) return Object.freeze({ ok: true as const, admission: snapshot });
      if (mounted.facts.observedActiveClaim === undefined) {
        active = undefined;
        return unavailable("workspace-readback-failed");
      }
      return Object.freeze({
        ok: true as const,
        admission: snapshot,
        observedActiveClaim: mounted.facts.observedActiveClaim,
        outage: pendingOutage
      });
    },
    invalidate(reason: "shutdown" | "authority-loss" | "admission-mismatch") {
      revision += 1;
      active = undefined;
      recordOutage(invalidationCategory(reason));
      if (reason === "authority-loss" || reason === "admission-mismatch") {
        for (const listener of invalidationListeners) {
          try { listener(reason); } catch { /* listener failure cannot restore authority */ }
        }
      }
    },
    subscribeInvalidation(listener: (reason: "authority-loss" | "admission-mismatch") => void) {
      invalidationListeners.add(listener);
      return () => { invalidationListeners.delete(listener); };
    }
  });

  const supervisorLease: DurableSupervisorLeasePort = Object.freeze({
    async readOrAcquire(rawInput: SupervisorLeaseAdmissionInput) {
      const leaseInput = canonicalLeaseInput(rawInput, issuedAdmissionIdentities, issuedAdmissionGenerations);
      requireCurrentLeaseInput(leaseInput);
      const result = canonicalLeaseResult(await mountedLease.readOrAcquire(leaseInput));
      const current = requireCurrentLeaseInput(leaseInput);
      if (result.outcome === "acquired-and-read-back") {
        requireLeaseReadback(result.readback, current);
        if (current.verifiedLease !== undefined && !sameLeaseReadback(current.verifiedLease, result.readback)) {
          throw new Error("workspace admission is no longer current");
        }
        active = Object.freeze({ ...current, verifiedLease: result.readback });
      }
      return result;
    }
  });

  const activeClaimReconciliation: ActiveClaimReconciliationPort = Object.freeze({
    async readByIdempotencyKey(rawInput: Parameters<ActiveClaimReconciliationPort["readByIdempotencyKey"]>[0]) {
      const reconciliationInput = canonicalReconciliationReadInput(rawInput, issuedAdmissionIdentities, issuedAdmissionGenerations);
      requireCurrentReconciliationInput(reconciliationInput);
      const rawResult = await mountedReconciliation.readByIdempotencyKey(reconciliationInput);
      requireCurrentReconciliationInput(reconciliationInput);
      if (rawResult === undefined) return undefined;
      try {
        const result = canonicalReconciliationReadback(rawResult);
        requireExactReconciliationReadback(result, reconciliationInput);
        return result;
      } catch (error) {
        active = undefined;
        throw error;
      }
    },
    async appendAndReadBack(rawInput: Parameters<ActiveClaimReconciliationPort["appendAndReadBack"]>[0]) {
      const reconciliationInput = canonicalReconciliationAppendInput(rawInput, issuedAdmissionIdentities, issuedAdmissionGenerations);
      requireCurrentAppendInput(reconciliationInput);
      const rawResult = await mountedReconciliation.appendAndReadBack(reconciliationInput);
      requireCurrentAppendInput(reconciliationInput);
      try {
        const result = canonicalReconciliationReadback(rawResult);
        requireExactReconciliationReadback(result, reconciliationInput, reconciliationInput.record);
        pendingOutage = undefined;
        pendingOutageClaim = undefined;
        return result;
      } catch (error) {
        active = undefined;
        throw error;
      }
    }
  });

  return Object.freeze({ authority, supervisorLease, activeClaimReconciliation });

  function requireCurrentAdmission(admission: WorkspaceAdmissionSnapshot): ActiveAdmission {
    const current = active;
    if (current === undefined || current.revision !== revision || !sameAdmission(admission, current.snapshot)) {
      throw new Error("workspace admission is no longer current");
    }
    return current;
  }

  function requireCurrentLeaseInput(leaseInput: SupervisorLeaseAdmissionInput): ActiveAdmission {
    const current = requireCurrentAdmission(leaseInput.admission);
    const identity = current.snapshot.identityAndMount;
    const facts = current.facts;
    if (leaseInput.residentId !== identity.residentId || leaseInput.supervisorEpoch !== identity.supervisorEpoch
      || leaseInput.policyVersion !== facts.policyVersion || leaseInput.policyDigest !== facts.policyDigest
      || leaseInput.lockStateDigest !== facts.lockStateDigest) {
      throw new Error("workspace admission is no longer current");
    }
    return current;
  }

  function requireCurrentTuple(tuple: ClaimReconciliationAdmissionTuple): ActiveAdmission {
    const current = requireCurrentAdmission(Object.freeze({
      identityAndMount: tuple.authorityIdentityAndMount,
      admissionGeneration: tuple.admissionGeneration
    }));
    if (current.verifiedLease === undefined || !sameLeaseReadback(tuple.verifiedLease, current.verifiedLease)
      || !samePolicyAndLock(tuple.policyAndLock, current.verifiedLease.policyAndLock)
      || !sameHighWater(tuple.highWater, current.verifiedLease.highWater)) {
      throw new Error("workspace admission is no longer current");
    }
    return current;
  }

  function requireCurrentReconciliationInput(input: Parameters<ActiveClaimReconciliationPort["readByIdempotencyKey"]>[0]): ActiveAdmission {
    const current = requireCurrentTuple(input.admission);
    const identity = current.snapshot.identityAndMount;
    if (input.workspaceId !== identity.workspaceId || input.residentId !== identity.residentId || input.supervisorEpoch !== identity.supervisorEpoch) {
      throw new Error("workspace admission is no longer current");
    }
    return current;
  }

  function requireCurrentAppendInput(input: Parameters<ActiveClaimReconciliationPort["appendAndReadBack"]>[0]): ActiveAdmission {
    const current = requireCurrentReconciliationInput(input);
    const tuple = input.admission;
    const record = input.record;
    const mountedActiveClaim = current.facts.observedActiveClaim;
    if (pendingOutage === undefined || pendingOutageClaim === undefined || mountedActiveClaim === undefined
      || !sameActiveClaim(mountedActiveClaim, pendingOutageClaim)
      || !sameActiveClaim(input.observedActiveClaim, mountedActiveClaim)
      || !sameOutage(input.outage, pendingOutage)
      || input.observedActiveClaim.workspaceId !== input.workspaceId || input.observedActiveClaim.residentId !== input.residentId
      || input.observedActiveClaim.supervisorEpoch !== input.supervisorEpoch || record.workspaceId !== input.workspaceId
      || record.residentId !== input.residentId || record.supervisorEpoch !== input.supervisorEpoch
      || record.claimId !== input.observedActiveClaim.claimId || record.attemptId !== input.observedActiveClaim.attemptId
      || !sameOutage(record.outageObservation, input.outage) || !sameCausation(record.causation, input.observedActiveClaim.causation)
      || record.reconciliationIdempotencyKey !== input.reconciliationIdempotencyKey
      || record.revalidatedAuthority.identityEventId !== tuple.authorityIdentityAndMount.workspaceIdentityEventId
      || record.revalidatedAuthority.mountEvidenceId !== tuple.authorityIdentityAndMount.mountEvidenceId
      || record.revalidatedAuthority.authorityEvidenceId !== tuple.authorityIdentityAndMount.authorityEvidenceId
      || record.revalidatedAuthority.highWaterAfterRevalidation !== tuple.highWater.highWaterMark
      || record.revalidatedAuthority.policyVersion !== tuple.policyAndLock.policyVersion
      || record.revalidatedAuthority.policyDigest !== tuple.policyAndLock.policyDigest
      || record.revalidatedAuthority.lockStateDigest !== tuple.policyAndLock.lockStateDigest
      || record.revalidatedAuthority.supervisorLeaseEventId !== tuple.verifiedLease.leaseEventId
      || record.revalidatedAuthority.supervisorLeaseReadbackEventId !== tuple.verifiedLease.readbackEventId
      || record.revalidatedAuthority.supervisorLeaseExpiresAt !== tuple.verifiedLease.expiresAt) {
      throw new Error("workspace admission is no longer current");
    }
    return current;
  }

  function fail(category: AvailabilityCategory): AvailabilityFailure {
    active = undefined;
    if (isOutageCategory(category)) recordOutage(category);
    return unavailable(category);
  }

  function recordOutage(category: OutageCategory): void {
    const facts = lastAccepted;
    const claim = facts?.observedActiveClaim;
    if (pendingOutage !== undefined || facts === undefined || claim === undefined) return;
    try {
      const safeObservationId = requiredText(createSafeOutageObservationId());
      const outageObservedAt = requiredText(now());
      pendingOutageClaim = claim;
      pendingOutage = Object.freeze({
        safeObservationId,
        outageObservedAt,
        category,
        priorClaimEventId: claim.priorClaimEventId,
        priorClaimLeaseId: claim.priorClaimLeaseId,
        priorAuthorityEvidenceId: facts.authorityEvidenceId,
        highWaterBeforeOutage: facts.highWaterMark
      });
    } catch {
      pendingOutage = undefined;
      pendingOutageClaim = undefined;
    }
  }
}

export function createPortableWorkspaceAvailabilityAuthority(
  input: PortableWorkspaceLifecycleInput
): WorkspaceAvailabilityAuthority {
  return createPortableWorkspaceLifecyclePorts(input).authority;
}

function canonicalRevalidationRequest(value: unknown): { readonly operation: "wake" | "pause" | "resume" | "recovery"; readonly expectedWorkspaceId: string; readonly requiredCapabilities: readonly ["wake", "lifecycle"] } {
  const record = ownDataRecord(value, "workspace revalidation request");
  requireKeys(record, ["operation", "expectedWorkspaceId", "requiredCapabilities"], "workspace revalidation request");
  if (record.operation !== "wake" && record.operation !== "pause" && record.operation !== "resume" && record.operation !== "recovery") {
    throw new Error("workspace revalidation request is invalid");
  }
  const capabilities = ownDataArray(record.requiredCapabilities, "workspace revalidation capabilities");
  if (capabilities.length !== 2 || capabilities[0] !== "wake" || capabilities[1] !== "lifecycle") {
    throw new Error("workspace revalidation capabilities are invalid");
  }
  return Object.freeze({ operation: record.operation, expectedWorkspaceId: requiredText(record.expectedWorkspaceId), requiredCapabilities: Object.freeze(["wake", "lifecycle"] as const) });
}

function canonicalMountedReadback(value: unknown): { readonly ok: true; readonly facts: PortableWorkspaceMountedFacts } | { readonly ok: false; readonly category: AvailabilityCategory } {
  const record = ownDataRecord(value, "mounted workspace readback");
  if (record.ok === true) {
    requireKeys(record, ["ok", "facts"], "mounted workspace readback");
    return Object.freeze({ ok: true as const, facts: canonicalMountedFacts(record.facts) });
  }
  if (record.ok === false) {
    requireKeys(record, ["ok", "category"], "mounted workspace readback");
    return Object.freeze({ ok: false as const, category: availabilityCategory(record.category) });
  }
  throw new Error("mounted workspace readback is invalid");
}

function canonicalMountedFacts(value: unknown): PortableWorkspaceMountedFacts {
  const record = ownDataRecord(value, "mounted workspace facts");
  const baseKeys = ["schemaVersion", "workspaceId", "residentId", "workspaceIdentityEventId", "mountInstanceId", "mountEvidenceId", "authorityEvidenceId", "ledgerStoreEvidenceId", "artifactStoreEvidenceId", "derivativeStoreEvidenceId", "policyVersion", "policyDigest", "lockStateDigest", "policyAndLockReadbackEventId", "highWaterMark", "highWaterReadbackEventId", "highWaterOrdinal"];
  const includesClaim = Object.prototype.hasOwnProperty.call(record, "observedActiveClaim");
  requireKeys(record, includesClaim ? [...baseKeys, "observedActiveClaim"] : baseKeys, "mounted workspace facts");
  if (record.schemaVersion !== "portable-workspace-mounted-facts.v1" || record.residentId !== "agent_default" || typeof record.highWaterOrdinal !== "number" || !Number.isSafeInteger(record.highWaterOrdinal) || record.highWaterOrdinal < 0) {
    throw new Error("mounted workspace facts are invalid");
  }
  const facts = {
    schemaVersion: record.schemaVersion,
    workspaceId: requiredText(record.workspaceId),
    residentId: record.residentId,
    workspaceIdentityEventId: requiredText(record.workspaceIdentityEventId),
    mountInstanceId: requiredText(record.mountInstanceId),
    mountEvidenceId: requiredText(record.mountEvidenceId),
    authorityEvidenceId: requiredText(record.authorityEvidenceId),
    ledgerStoreEvidenceId: requiredText(record.ledgerStoreEvidenceId),
    artifactStoreEvidenceId: requiredText(record.artifactStoreEvidenceId),
    derivativeStoreEvidenceId: requiredText(record.derivativeStoreEvidenceId),
    policyVersion: requiredText(record.policyVersion),
    policyDigest: requiredText(record.policyDigest),
    lockStateDigest: requiredText(record.lockStateDigest),
    policyAndLockReadbackEventId: requiredText(record.policyAndLockReadbackEventId),
    highWaterMark: requiredText(record.highWaterMark),
    highWaterReadbackEventId: requiredText(record.highWaterReadbackEventId),
    highWaterOrdinal: record.highWaterOrdinal
  } as const;
  return Object.freeze(includesClaim ? { ...facts, observedActiveClaim: canonicalActiveClaim(record.observedActiveClaim) } : facts);
}

function canonicalActiveClaim(value: unknown): RevalidatedActiveClaimEvidence {
  const record = ownDataRecord(value, "mounted active claim");
  requireKeys(record, ["workspaceId", "residentId", "supervisorEpoch", "claimId", "attemptId", "priorClaimEventId", "priorClaimLeaseId", "readbackEventId", "causation"], "mounted active claim");
  if (record.residentId !== "agent_default") throw new Error("mounted active claim is invalid");
  const causation = ownDataRecord(record.causation, "mounted active claim causation");
  requireKeys(causation, ["causationId", "correlationId"], "mounted active claim causation");
  return Object.freeze({
    workspaceId: requiredText(record.workspaceId), residentId: record.residentId, supervisorEpoch: requiredText(record.supervisorEpoch),
    claimId: requiredText(record.claimId), attemptId: requiredText(record.attemptId), priorClaimEventId: requiredText(record.priorClaimEventId),
    priorClaimLeaseId: requiredText(record.priorClaimLeaseId), readbackEventId: requiredText(record.readbackEventId),
    causation: Object.freeze({ causationId: requiredText(causation.causationId), correlationId: requiredText(causation.correlationId) })
  });
}

function freezeAdmission(
  facts: PortableWorkspaceMountedFacts,
  supervisorEpoch: string,
  sequence: number,
  issuedIdentities: WeakSet<object>,
  issuedGenerations: WeakSet<object>
): WorkspaceAdmissionSnapshot {
  const identityAndMount = Object.freeze({
    workspaceId: facts.workspaceId, residentId: facts.residentId, supervisorEpoch,
    workspaceIdentityEventId: facts.workspaceIdentityEventId, mountEvidenceId: facts.mountEvidenceId,
    authorityEvidenceId: facts.authorityEvidenceId
  });
  const admissionGeneration: WorkspaceAdmissionGeneration = Object.freeze({
    schemaVersion: "resident-wake-admission-generation.v1",
    generationId: `admission:${sequence}`
  });
  issuedIdentities.add(identityAndMount);
  issuedGenerations.add(admissionGeneration);
  return Object.freeze({ identityAndMount, admissionGeneration });
}

function canonicalLeaseInput(
  value: unknown,
  issuedIdentities: WeakSet<object>,
  issuedGenerations: WeakSet<object>
): SupervisorLeaseAdmissionInput {
  const record = ownDataRecord(value, "supervisor lease admission");
  requireKeys(record, ["admission", "residentId", "supervisorEpoch", "policyVersion", "policyDigest", "lockStateDigest", "causationId", "correlationId"], "supervisor lease admission");
  if (record.residentId !== "agent_default") throw new Error("supervisor lease admission is invalid");
  return Object.freeze({
    admission: canonicalIssuedAdmission(record.admission, issuedIdentities, issuedGenerations), residentId: record.residentId, supervisorEpoch: requiredText(record.supervisorEpoch),
    policyVersion: requiredText(record.policyVersion), policyDigest: requiredText(record.policyDigest), lockStateDigest: requiredText(record.lockStateDigest),
    causationId: requiredText(record.causationId), correlationId: requiredText(record.correlationId)
  });
}

function canonicalReconciliationReadInput(
  value: unknown,
  issuedIdentities: WeakSet<object>,
  issuedGenerations: WeakSet<object>
): Parameters<ActiveClaimReconciliationPort["readByIdempotencyKey"]>[0] {
  const record = ownDataRecord(value, "reconciliation read");
  requireKeys(record, ["admission", "reconciliationIdempotencyKey", "workspaceId", "residentId", "supervisorEpoch"], "reconciliation read");
  if (record.residentId !== "agent_default") throw new Error("reconciliation read is invalid");
  return Object.freeze({ admission: canonicalTuple(record.admission, issuedIdentities, issuedGenerations), reconciliationIdempotencyKey: requiredText(record.reconciliationIdempotencyKey), workspaceId: requiredText(record.workspaceId), residentId: record.residentId, supervisorEpoch: requiredText(record.supervisorEpoch) });
}

function canonicalReconciliationAppendInput(
  value: unknown,
  issuedIdentities: WeakSet<object>,
  issuedGenerations: WeakSet<object>
): Parameters<ActiveClaimReconciliationPort["appendAndReadBack"]>[0] {
  const record = ownDataRecord(value, "reconciliation append");
  requireKeys(record, ["admission", "reconciliationIdempotencyKey", "workspaceId", "residentId", "supervisorEpoch", "record", "observedActiveClaim", "outage"], "reconciliation append");
  if (record.residentId !== "agent_default") throw new Error("reconciliation append is invalid");
  return Object.freeze({
    admission: canonicalTuple(record.admission, issuedIdentities, issuedGenerations), reconciliationIdempotencyKey: requiredText(record.reconciliationIdempotencyKey), workspaceId: requiredText(record.workspaceId), residentId: record.residentId, supervisorEpoch: requiredText(record.supervisorEpoch),
    record: canonicalReconciliationRecord(record.record), observedActiveClaim: canonicalActiveClaim(record.observedActiveClaim), outage: canonicalOutage(record.outage)
  });
}

function canonicalReconciliationReadback(
  value: unknown
): Awaited<ReturnType<ActiveClaimReconciliationPort["appendAndReadBack"]>> {
  const record = ownDataRecord(value, "reconciliation readback");
  requireKeys(record, ["record", "reconciliationEventId", "readbackEventId", "admission"], "reconciliation readback");
  return Object.freeze({
    record: canonicalReconciliationRecord(record.record),
    reconciliationEventId: requiredText(record.reconciliationEventId),
    readbackEventId: requiredText(record.readbackEventId),
    admission: canonicalReadbackTuple(record.admission)
  });
}

function canonicalIssuedAdmission(
  value: unknown,
  issuedIdentities: WeakSet<object>,
  issuedGenerations: WeakSet<object>
): WorkspaceAdmissionSnapshot {
  const record = ownDataRecord(value, "workspace admission");
  requireKeys(record, ["identityAndMount", "admissionGeneration"], "workspace admission");
  const identity = ownDataRecord(record.identityAndMount, "workspace admission identity");
  requireKeys(identity, ["workspaceId", "residentId", "supervisorEpoch", "workspaceIdentityEventId", "mountEvidenceId", "authorityEvidenceId"], "workspace admission identity");
  if (identity.residentId !== "agent_default") throw new Error("workspace admission is invalid");
  const generation = ownDataRecord(record.admissionGeneration, "workspace admission generation");
  requireKeys(generation, ["schemaVersion", "generationId"], "workspace admission generation");
  if (generation.schemaVersion !== "resident-wake-admission-generation.v1") throw new Error("workspace admission generation is invalid");
  if (!issuedIdentities.has(record.identityAndMount as object) || !issuedGenerations.has(record.admissionGeneration as object)) {
    throw new Error("workspace admission is no longer current");
  }
  return Object.freeze({
    identityAndMount: Object.freeze({ workspaceId: requiredText(identity.workspaceId), residentId: identity.residentId, supervisorEpoch: requiredText(identity.supervisorEpoch), workspaceIdentityEventId: requiredText(identity.workspaceIdentityEventId), mountEvidenceId: requiredText(identity.mountEvidenceId), authorityEvidenceId: requiredText(identity.authorityEvidenceId) }),
    admissionGeneration: Object.freeze({ schemaVersion: generation.schemaVersion, generationId: requiredText(generation.generationId) })
  });
}

function canonicalTuple(
  value: unknown,
  issuedIdentities: WeakSet<object>,
  issuedGenerations: WeakSet<object>
): ClaimReconciliationAdmissionTuple {
  const record = ownDataRecord(value, "reconciliation admission");
  requireKeys(record, ["authorityIdentityAndMount", "admissionGeneration", "verifiedLease", "policyAndLock", "highWater"], "reconciliation admission");
  const admission = canonicalIssuedAdmission({ identityAndMount: record.authorityIdentityAndMount, admissionGeneration: record.admissionGeneration }, issuedIdentities, issuedGenerations);
  const verifiedLease = canonicalLeaseReadback(record.verifiedLease);
  const policyAndLock = canonicalPolicyAndLock(record.policyAndLock);
  const highWater = canonicalHighWater(record.highWater);
  return Object.freeze({
    authorityIdentityAndMount: admission.identityAndMount,
    admissionGeneration: admission.admissionGeneration,
    verifiedLease,
    policyAndLock,
    highWater
  });
}

function canonicalReadbackTuple(value: unknown): ClaimReconciliationAdmissionTuple {
  const record = ownDataRecord(value, "reconciliation readback admission");
  requireKeys(record, ["authorityIdentityAndMount", "admissionGeneration", "verifiedLease", "policyAndLock", "highWater"], "reconciliation readback admission");
  const identity = ownDataRecord(record.authorityIdentityAndMount, "reconciliation readback authority identity");
  requireKeys(identity, ["workspaceId", "residentId", "supervisorEpoch", "workspaceIdentityEventId", "mountEvidenceId", "authorityEvidenceId"], "reconciliation readback authority identity");
  if (identity.residentId !== "agent_default") throw new Error("reconciliation readback admission is invalid");
  const generation = ownDataRecord(record.admissionGeneration, "reconciliation readback admission generation");
  requireKeys(generation, ["schemaVersion", "generationId"], "reconciliation readback admission generation");
  if (generation.schemaVersion !== "resident-wake-admission-generation.v1") throw new Error("reconciliation readback admission generation is invalid");
  return Object.freeze({
    authorityIdentityAndMount: Object.freeze({
      workspaceId: requiredText(identity.workspaceId),
      residentId: identity.residentId,
      supervisorEpoch: requiredText(identity.supervisorEpoch),
      workspaceIdentityEventId: requiredText(identity.workspaceIdentityEventId),
      mountEvidenceId: requiredText(identity.mountEvidenceId),
      authorityEvidenceId: requiredText(identity.authorityEvidenceId)
    }),
    admissionGeneration: Object.freeze({
      schemaVersion: generation.schemaVersion,
      generationId: requiredText(generation.generationId)
    }),
    verifiedLease: canonicalLeaseReadback(record.verifiedLease),
    policyAndLock: canonicalPolicyAndLock(record.policyAndLock),
    highWater: canonicalHighWater(record.highWater)
  });
}

function canonicalLeaseResult(value: unknown): Awaited<ReturnType<DurableSupervisorLeasePort["readOrAcquire"]>> {
  const record = ownDataRecord(value, "supervisor lease result");
  if (record.outcome === "acquired-and-read-back") {
    requireKeys(record, ["outcome", "readback"], "supervisor lease result");
    return Object.freeze({ outcome: "acquired-and-read-back" as const, readback: canonicalLeaseReadback(record.readback) });
  }
  if (record.outcome === "supervisor-lease-held") {
    requireKeys(record, ["outcome", "readback"], "supervisor lease result");
    const readback = ownDataRecord(record.readback, "supervisor lease held readback");
    requireKeys(readback, ["schemaVersion", "workspaceId", "residentId", "holderEpoch", "leaseEventId", "readbackEventId", "expiresAt"], "supervisor lease held readback");
    if (readback.schemaVersion !== "resident-supervisor-lease-held.v1" || readback.residentId !== "agent_default") throw new Error("supervisor lease held readback is invalid");
    return Object.freeze({
      outcome: "supervisor-lease-held" as const,
      readback: Object.freeze({
        schemaVersion: readback.schemaVersion,
        workspaceId: requiredText(readback.workspaceId),
        residentId: readback.residentId,
        holderEpoch: requiredText(readback.holderEpoch),
        leaseEventId: requiredText(readback.leaseEventId),
        readbackEventId: requiredText(readback.readbackEventId),
        expiresAt: requiredText(readback.expiresAt)
      })
    });
  }
  throw new Error("supervisor lease result is invalid");
}

function canonicalLeaseReadback(value: unknown): ClaimReconciliationAdmissionTuple["verifiedLease"] {
  const record = ownDataRecord(value, "supervisor lease readback");
  requireKeys(record, ["schemaVersion", "workspaceId", "residentId", "supervisorEpoch", "workspaceIdentityEventId", "mountEvidenceId", "authorityEvidenceId", "policyVersion", "policyDigest", "lockStateDigest", "highWaterMark", "leaseEventId", "readbackEventId", "expiresAt", "causation", "policyAndLock", "highWater"], "supervisor lease readback");
  if (record.schemaVersion !== "resident-supervisor-lease-readback.v1" || record.residentId !== "agent_default") throw new Error("supervisor lease readback is invalid");
  return Object.freeze({
    schemaVersion: record.schemaVersion,
    workspaceId: requiredText(record.workspaceId),
    residentId: record.residentId,
    supervisorEpoch: requiredText(record.supervisorEpoch),
    workspaceIdentityEventId: requiredText(record.workspaceIdentityEventId),
    mountEvidenceId: requiredText(record.mountEvidenceId),
    authorityEvidenceId: requiredText(record.authorityEvidenceId),
    policyVersion: requiredText(record.policyVersion),
    policyDigest: requiredText(record.policyDigest),
    lockStateDigest: requiredText(record.lockStateDigest),
    highWaterMark: requiredText(record.highWaterMark),
    leaseEventId: requiredText(record.leaseEventId),
    readbackEventId: requiredText(record.readbackEventId),
    expiresAt: requiredText(record.expiresAt),
    causation: canonicalCausation(record.causation, "supervisor lease causation"),
    policyAndLock: canonicalPolicyAndLock(record.policyAndLock),
    highWater: canonicalHighWater(record.highWater)
  });
}

function canonicalPolicyAndLock(value: unknown): ClaimReconciliationAdmissionTuple["policyAndLock"] {
  const record = ownDataRecord(value, "policy and lock readback");
  requireKeys(record, ["authorityEvidenceId", "mountEvidenceId", "leaseEventId", "leaseReadbackEventId", "policyVersion", "policyDigest", "lockStateDigest", "readbackEventId"], "policy and lock readback");
  return Object.freeze({
    authorityEvidenceId: requiredText(record.authorityEvidenceId),
    mountEvidenceId: requiredText(record.mountEvidenceId),
    leaseEventId: requiredText(record.leaseEventId),
    leaseReadbackEventId: requiredText(record.leaseReadbackEventId),
    policyVersion: requiredText(record.policyVersion),
    policyDigest: requiredText(record.policyDigest),
    lockStateDigest: requiredText(record.lockStateDigest),
    readbackEventId: requiredText(record.readbackEventId)
  });
}

function canonicalHighWater(value: unknown): ClaimReconciliationAdmissionTuple["highWater"] {
  const record = ownDataRecord(value, "high-water readback");
  requireKeys(record, ["authorityEvidenceId", "mountEvidenceId", "leaseEventId", "leaseReadbackEventId", "highWaterMark", "readbackEventId"], "high-water readback");
  return Object.freeze({
    authorityEvidenceId: requiredText(record.authorityEvidenceId),
    mountEvidenceId: requiredText(record.mountEvidenceId),
    leaseEventId: requiredText(record.leaseEventId),
    leaseReadbackEventId: requiredText(record.leaseReadbackEventId),
    highWaterMark: requiredText(record.highWaterMark),
    readbackEventId: requiredText(record.readbackEventId)
  });
}

function canonicalCausation(value: unknown, label: string): ClaimReconciliationAdmissionTuple["verifiedLease"]["causation"] {
  const record = ownDataRecord(value, label);
  requireKeys(record, ["causationId", "correlationId"], label);
  return Object.freeze({ causationId: requiredText(record.causationId), correlationId: requiredText(record.correlationId) });
}

function canonicalReconciliationRecord(value: unknown): Parameters<ActiveClaimReconciliationPort["appendAndReadBack"]>[0]["record"] {
  const record = ownDataRecord(value, "workspace-unavailable reconciliation record");
  requireKeys(record, ["schemaVersion", "outcome", "resumable", "claimDisposition", "workspaceId", "residentId", "supervisorEpoch", "claimId", "attemptId", "outageObservation", "causation", "revalidatedAuthority", "reconciliationIdempotencyKey"], "workspace-unavailable reconciliation record");
  if (record.schemaVersion !== "resident-wake-workspace-unavailable.v1" || record.outcome !== "workspace-unavailable" || record.resumable !== true || (record.claimDisposition !== "released" && record.claimDisposition !== "checkpointed") || record.residentId !== "agent_default") throw new Error("workspace-unavailable reconciliation record is invalid");
  const authority = ownDataRecord(record.revalidatedAuthority, "revalidated authority");
  requireKeys(authority, ["identityEventId", "mountEvidenceId", "authorityEvidenceId", "highWaterAfterRevalidation", "policyVersion", "policyDigest", "lockStateDigest", "supervisorLeaseEventId", "supervisorLeaseReadbackEventId", "supervisorLeaseExpiresAt"], "revalidated authority");
  return Object.freeze({
    schemaVersion: record.schemaVersion,
    outcome: record.outcome,
    resumable: true,
    claimDisposition: record.claimDisposition,
    workspaceId: requiredText(record.workspaceId),
    residentId: record.residentId,
    supervisorEpoch: requiredText(record.supervisorEpoch),
    claimId: requiredText(record.claimId),
    attemptId: requiredText(record.attemptId),
    outageObservation: canonicalOutage(record.outageObservation),
    causation: canonicalCausation(record.causation, "reconciliation causation"),
    revalidatedAuthority: Object.freeze({
      identityEventId: requiredText(authority.identityEventId),
      mountEvidenceId: requiredText(authority.mountEvidenceId),
      authorityEvidenceId: requiredText(authority.authorityEvidenceId),
      highWaterAfterRevalidation: requiredText(authority.highWaterAfterRevalidation),
      policyVersion: requiredText(authority.policyVersion),
      policyDigest: requiredText(authority.policyDigest),
      lockStateDigest: requiredText(authority.lockStateDigest),
      supervisorLeaseEventId: requiredText(authority.supervisorLeaseEventId),
      supervisorLeaseReadbackEventId: requiredText(authority.supervisorLeaseReadbackEventId),
      supervisorLeaseExpiresAt: requiredText(authority.supervisorLeaseExpiresAt)
    }),
    reconciliationIdempotencyKey: requiredText(record.reconciliationIdempotencyKey)
  });
}

function canonicalOutage(value: unknown): WorkspaceOutageObservation {
  const record = ownDataRecord(value, "workspace outage observation");
  requireKeys(record, ["safeObservationId", "outageObservedAt", "category", "priorClaimEventId", "priorClaimLeaseId", "priorAuthorityEvidenceId", "highWaterBeforeOutage"], "workspace outage observation");
  const category = availabilityCategory(record.category);
  if (!isOutageCategory(category)) throw new Error("workspace outage observation is invalid");
  return Object.freeze({
    safeObservationId: requiredText(record.safeObservationId), outageObservedAt: requiredText(record.outageObservedAt), category,
    priorClaimEventId: requiredText(record.priorClaimEventId), priorClaimLeaseId: requiredText(record.priorClaimLeaseId), priorAuthorityEvidenceId: requiredText(record.priorAuthorityEvidenceId), highWaterBeforeOutage: requiredText(record.highWaterBeforeOutage)
  });
}

function requireExactReconciliationReadback(
  readback: Awaited<ReturnType<ActiveClaimReconciliationPort["appendAndReadBack"]>>,
  input: Parameters<ActiveClaimReconciliationPort["readByIdempotencyKey"]>[0],
  expectedRecord?: Parameters<ActiveClaimReconciliationPort["appendAndReadBack"]>[0]["record"]
): void {
  if (!sameTuple(readback.admission, input.admission)
    || readback.record.workspaceId !== input.workspaceId
    || readback.record.residentId !== input.residentId
    || readback.record.supervisorEpoch !== input.supervisorEpoch
    || readback.record.reconciliationIdempotencyKey !== input.reconciliationIdempotencyKey
    || (expectedRecord !== undefined && !sameReconciliationRecord(readback.record, expectedRecord))) {
    throw new Error("workspace admission is no longer current");
  }
}

function requireLeaseReadback(lease: ClaimReconciliationAdmissionTuple["verifiedLease"], current: ActiveAdmission): void {
  const identity = current.snapshot.identityAndMount;
  const facts = current.facts;
  const policyAndLock = lease.policyAndLock;
  const highWater = lease.highWater;
  if (lease.workspaceId !== identity.workspaceId || lease.residentId !== identity.residentId || lease.supervisorEpoch !== identity.supervisorEpoch
    || lease.workspaceIdentityEventId !== identity.workspaceIdentityEventId || lease.mountEvidenceId !== identity.mountEvidenceId
    || lease.authorityEvidenceId !== identity.authorityEvidenceId || lease.policyVersion !== facts.policyVersion
    || lease.policyDigest !== facts.policyDigest || lease.lockStateDigest !== facts.lockStateDigest || lease.highWaterMark !== facts.highWaterMark
    || policyAndLock.authorityEvidenceId !== identity.authorityEvidenceId || policyAndLock.mountEvidenceId !== identity.mountEvidenceId
    || policyAndLock.leaseEventId !== lease.leaseEventId || policyAndLock.leaseReadbackEventId !== lease.readbackEventId
    || policyAndLock.policyVersion !== facts.policyVersion || policyAndLock.policyDigest !== facts.policyDigest
    || policyAndLock.lockStateDigest !== facts.lockStateDigest || policyAndLock.readbackEventId !== facts.policyAndLockReadbackEventId
    || highWater.authorityEvidenceId !== identity.authorityEvidenceId || highWater.mountEvidenceId !== identity.mountEvidenceId
    || highWater.leaseEventId !== lease.leaseEventId || highWater.leaseReadbackEventId !== lease.readbackEventId
    || highWater.highWaterMark !== facts.highWaterMark || highWater.readbackEventId !== facts.highWaterReadbackEventId) {
    throw new Error("workspace admission is no longer current");
  }
}

function sameLeaseReadback(left: ClaimReconciliationAdmissionTuple["verifiedLease"], right: ClaimReconciliationAdmissionTuple["verifiedLease"]): boolean {
  return left.schemaVersion === right.schemaVersion && left.workspaceId === right.workspaceId && left.residentId === right.residentId
    && left.supervisorEpoch === right.supervisorEpoch && left.workspaceIdentityEventId === right.workspaceIdentityEventId
    && left.mountEvidenceId === right.mountEvidenceId && left.authorityEvidenceId === right.authorityEvidenceId
    && left.policyVersion === right.policyVersion && left.policyDigest === right.policyDigest && left.lockStateDigest === right.lockStateDigest
    && left.highWaterMark === right.highWaterMark && left.leaseEventId === right.leaseEventId && left.readbackEventId === right.readbackEventId
    && left.expiresAt === right.expiresAt && sameCausation(left.causation, right.causation)
    && samePolicyAndLock(left.policyAndLock, right.policyAndLock) && sameHighWater(left.highWater, right.highWater);
}

function samePolicyAndLock(left: ClaimReconciliationAdmissionTuple["policyAndLock"], right: ClaimReconciliationAdmissionTuple["policyAndLock"]): boolean {
  return left.authorityEvidenceId === right.authorityEvidenceId && left.mountEvidenceId === right.mountEvidenceId
    && left.leaseEventId === right.leaseEventId && left.leaseReadbackEventId === right.leaseReadbackEventId
    && left.policyVersion === right.policyVersion && left.policyDigest === right.policyDigest
    && left.lockStateDigest === right.lockStateDigest && left.readbackEventId === right.readbackEventId;
}

function sameHighWater(left: ClaimReconciliationAdmissionTuple["highWater"], right: ClaimReconciliationAdmissionTuple["highWater"]): boolean {
  return left.authorityEvidenceId === right.authorityEvidenceId && left.mountEvidenceId === right.mountEvidenceId
    && left.leaseEventId === right.leaseEventId && left.leaseReadbackEventId === right.leaseReadbackEventId
    && left.highWaterMark === right.highWaterMark && left.readbackEventId === right.readbackEventId;
}

function sameCausation(
  left: ClaimReconciliationAdmissionTuple["verifiedLease"]["causation"],
  right: ClaimReconciliationAdmissionTuple["verifiedLease"]["causation"]
): boolean {
  return left.causationId === right.causationId && left.correlationId === right.correlationId;
}

function sameActiveClaim(left: RevalidatedActiveClaimEvidence, right: RevalidatedActiveClaimEvidence): boolean {
  return left.workspaceId === right.workspaceId && left.residentId === right.residentId && left.supervisorEpoch === right.supervisorEpoch
    && left.claimId === right.claimId && left.attemptId === right.attemptId && left.priorClaimEventId === right.priorClaimEventId
    && left.priorClaimLeaseId === right.priorClaimLeaseId && left.readbackEventId === right.readbackEventId
    && sameCausation(left.causation, right.causation);
}

function sameTuple(left: ClaimReconciliationAdmissionTuple, right: ClaimReconciliationAdmissionTuple): boolean {
  return sameAdmission(
    Object.freeze({ identityAndMount: left.authorityIdentityAndMount, admissionGeneration: left.admissionGeneration }),
    Object.freeze({ identityAndMount: right.authorityIdentityAndMount, admissionGeneration: right.admissionGeneration })
  ) && sameLeaseReadback(left.verifiedLease, right.verifiedLease)
    && samePolicyAndLock(left.policyAndLock, right.policyAndLock)
    && sameHighWater(left.highWater, right.highWater);
}

function sameReconciliationRecord(
  left: Parameters<ActiveClaimReconciliationPort["appendAndReadBack"]>[0]["record"],
  right: Parameters<ActiveClaimReconciliationPort["appendAndReadBack"]>[0]["record"]
): boolean {
  return left.schemaVersion === right.schemaVersion && left.outcome === right.outcome && left.resumable === right.resumable
    && left.claimDisposition === right.claimDisposition && left.workspaceId === right.workspaceId && left.residentId === right.residentId
    && left.supervisorEpoch === right.supervisorEpoch && left.claimId === right.claimId && left.attemptId === right.attemptId
    && sameOutage(left.outageObservation, right.outageObservation) && sameCausation(left.causation, right.causation)
    && left.revalidatedAuthority.identityEventId === right.revalidatedAuthority.identityEventId
    && left.revalidatedAuthority.mountEvidenceId === right.revalidatedAuthority.mountEvidenceId
    && left.revalidatedAuthority.authorityEvidenceId === right.revalidatedAuthority.authorityEvidenceId
    && left.revalidatedAuthority.highWaterAfterRevalidation === right.revalidatedAuthority.highWaterAfterRevalidation
    && left.revalidatedAuthority.policyVersion === right.revalidatedAuthority.policyVersion
    && left.revalidatedAuthority.policyDigest === right.revalidatedAuthority.policyDigest
    && left.revalidatedAuthority.lockStateDigest === right.revalidatedAuthority.lockStateDigest
    && left.revalidatedAuthority.supervisorLeaseEventId === right.revalidatedAuthority.supervisorLeaseEventId
    && left.revalidatedAuthority.supervisorLeaseReadbackEventId === right.revalidatedAuthority.supervisorLeaseReadbackEventId
    && left.revalidatedAuthority.supervisorLeaseExpiresAt === right.revalidatedAuthority.supervisorLeaseExpiresAt
    && left.reconciliationIdempotencyKey === right.reconciliationIdempotencyKey;
}

function sameOutage(left: WorkspaceOutageObservation, right: WorkspaceOutageObservation): boolean {
  return left.safeObservationId === right.safeObservationId && left.outageObservedAt === right.outageObservedAt && left.category === right.category
    && left.priorClaimEventId === right.priorClaimEventId && left.priorClaimLeaseId === right.priorClaimLeaseId
    && left.priorAuthorityEvidenceId === right.priorAuthorityEvidenceId && left.highWaterBeforeOutage === right.highWaterBeforeOutage;
}

function sameAdmission(left: WorkspaceAdmissionSnapshot, right: WorkspaceAdmissionSnapshot): boolean {
  const a = left.identityAndMount;
  const b = right.identityAndMount;
  return a.workspaceId === b.workspaceId && a.residentId === b.residentId && a.supervisorEpoch === b.supervisorEpoch
    && a.workspaceIdentityEventId === b.workspaceIdentityEventId && a.mountEvidenceId === b.mountEvidenceId
    && a.authorityEvidenceId === b.authorityEvidenceId && left.admissionGeneration.schemaVersion === right.admissionGeneration.schemaVersion
    && left.admissionGeneration.generationId === right.admissionGeneration.generationId;
}

function matchesRuntime(facts: PortableWorkspaceMountedFacts, workspaceId: string, residentId: "agent_default", supervisorEpoch: string): boolean {
  const claim = facts.observedActiveClaim;
  return facts.workspaceId === workspaceId && facts.residentId === residentId && (claim === undefined || (claim.workspaceId === workspaceId && claim.residentId === residentId && claim.supervisorEpoch === supervisorEpoch));
}

function compatibleWithPriorReadback(next: PortableWorkspaceMountedFacts, prior: PortableWorkspaceMountedFacts | undefined): boolean {
  if (prior === undefined) return true;
  return next.workspaceId === prior.workspaceId && next.residentId === prior.residentId && next.workspaceIdentityEventId === prior.workspaceIdentityEventId
    && next.mountInstanceId === prior.mountInstanceId && next.mountEvidenceId === prior.mountEvidenceId && next.authorityEvidenceId === prior.authorityEvidenceId
    && next.ledgerStoreEvidenceId === prior.ledgerStoreEvidenceId && next.artifactStoreEvidenceId === prior.artifactStoreEvidenceId && next.derivativeStoreEvidenceId === prior.derivativeStoreEvidenceId
    && next.policyVersion === prior.policyVersion && next.policyDigest === prior.policyDigest && next.lockStateDigest === prior.lockStateDigest
    && next.policyAndLockReadbackEventId === prior.policyAndLockReadbackEventId && next.highWaterOrdinal >= prior.highWaterOrdinal
    && (next.highWaterOrdinal !== prior.highWaterOrdinal || (next.highWaterMark === prior.highWaterMark && next.highWaterReadbackEventId === prior.highWaterReadbackEventId));
}

function invalidationCategory(reason: "shutdown" | "authority-loss" | "admission-mismatch"): OutageCategory {
  return reason === "admission-mismatch" ? "workspace-readback-failed" : "workspace-unavailable";
}

function unavailable(category: AvailabilityCategory): AvailabilityFailure { return Object.freeze({ ok: false as const, category }); }

function availabilityCategory(value: unknown): AvailabilityCategory {
  if (value === "workspace-unavailable" || value === "workspace-identity-mismatch" || value === "workspace-readback-failed" || value === "active-lock") return value;
  throw new Error("workspace availability category is invalid");
}

function isOutageCategory(category: AvailabilityCategory): category is OutageCategory {
  return category !== "active-lock";
}

function ownDataRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || Object.getOwnPropertySymbols(value).length !== 0) throw new Error(`${label} must be a plain own-data object`);
  const result = Object.create(null) as Record<string, unknown>;
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (descriptor.get !== undefined || descriptor.set !== undefined || !descriptor.enumerable) throw new Error(`${label} must contain enumerable own data`);
    result[key] = descriptor.value;
  }
  return result;
}

function ownDataArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length !== 0) throw new Error(`${label} must be a plain array`);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || descriptor.get !== undefined || descriptor.set !== undefined || !descriptor.enumerable) throw new Error(`${label} must contain own data`);
  }
  if (Object.keys(value).length !== value.length) throw new Error(`${label} has unsupported keys`);
  return Object.freeze([...value]);
}

function requireKeys(record: Record<string, unknown>, expected: readonly string[], label: string): void {
  const keys = Object.keys(record);
  if (keys.length !== expected.length || expected.some((key) => !Object.prototype.hasOwnProperty.call(record, key))) throw new Error(`${label} has unsupported or missing fields`);
}

function requiredText(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new Error("required lifecycle text is invalid");
  return value;
}
