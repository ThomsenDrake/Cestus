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
  const invalidationListeners = new Set<(reason: "authority-loss" | "admission-mismatch") => void>();

  const authority: WorkspaceAvailabilityAuthority = Object.freeze({
    async revalidate(rawRequest) {
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
      const snapshot = freezeAdmission(mounted.facts, supervisorEpoch, ++nextGeneration);
      active = Object.freeze({ revision: admissionRevision, snapshot });
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
    invalidate(reason) {
      revision += 1;
      active = undefined;
      recordOutage(invalidationCategory(reason));
      if (reason === "authority-loss" || reason === "admission-mismatch") {
        for (const listener of invalidationListeners) {
          try { listener(reason); } catch { /* listener failure cannot restore authority */ }
        }
      }
    },
    subscribeInvalidation(listener) {
      invalidationListeners.add(listener);
      return () => { invalidationListeners.delete(listener); };
    }
  });

  const supervisorLease: DurableSupervisorLeasePort = Object.freeze({
    async readOrAcquire(rawInput) {
      const leaseInput = canonicalLeaseInput(rawInput);
      requireCurrentAdmission(leaseInput.admission);
      const result = await mountedLease.readOrAcquire(leaseInput);
      requireCurrentAdmission(leaseInput.admission);
      return result;
    }
  });

  const activeClaimReconciliation: ActiveClaimReconciliationPort = Object.freeze({
    async readByIdempotencyKey(rawInput) {
      const reconciliationInput = canonicalReconciliationReadInput(rawInput);
      requireCurrentTuple(reconciliationInput.admission);
      const result = await mountedReconciliation.readByIdempotencyKey(reconciliationInput);
      requireCurrentTuple(reconciliationInput.admission);
      return result;
    },
    async appendAndReadBack(rawInput) {
      const reconciliationInput = canonicalReconciliationAppendInput(rawInput);
      requireCurrentTuple(reconciliationInput.admission);
      const result = await mountedReconciliation.appendAndReadBack(reconciliationInput);
      requireCurrentTuple(reconciliationInput.admission);
      return result;
    }
  });

  return Object.freeze({ authority, supervisorLease, activeClaimReconciliation });

  function requireCurrentAdmission(admission: WorkspaceAdmissionSnapshot): void {
    const current = active;
    if (current === undefined || current.revision !== revision || !sameAdmission(admission, current.snapshot)) {
      throw new Error("workspace admission is no longer current");
    }
  }

  function requireCurrentTuple(tuple: ClaimReconciliationAdmissionTuple): void {
    requireCurrentAdmission(Object.freeze({
      identityAndMount: tuple.authorityIdentityAndMount,
      admissionGeneration: tuple.admissionGeneration
    }));
  }

  function fail(category: AvailabilityCategory): AvailabilityFailure {
    active = undefined;
    recordOutage(category);
    return unavailable(category);
  }

  function recordOutage(category: AvailabilityCategory): void {
    const facts = lastAccepted;
    const claim = facts?.observedActiveClaim;
    if (pendingOutage !== undefined || facts === undefined || claim === undefined) return;
    try {
      const safeObservationId = requiredText(createSafeOutageObservationId());
      const outageObservedAt = requiredText(now());
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
  if (record.schemaVersion !== "portable-workspace-mounted-facts.v1" || record.residentId !== "agent_default" || !Number.isSafeInteger(record.highWaterOrdinal) || record.highWaterOrdinal < 0) {
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

function freezeAdmission(facts: PortableWorkspaceMountedFacts, supervisorEpoch: string, sequence: number): WorkspaceAdmissionSnapshot {
  const identityAndMount = Object.freeze({
    workspaceId: facts.workspaceId, residentId: facts.residentId, supervisorEpoch,
    workspaceIdentityEventId: facts.workspaceIdentityEventId, mountEvidenceId: facts.mountEvidenceId,
    authorityEvidenceId: facts.authorityEvidenceId
  });
  const admissionGeneration: WorkspaceAdmissionGeneration = Object.freeze({
    schemaVersion: "resident-wake-admission-generation.v1",
    generationId: `admission:${sequence}`
  });
  return Object.freeze({ identityAndMount, admissionGeneration });
}

function canonicalLeaseInput(value: unknown): SupervisorLeaseAdmissionInput {
  const record = ownDataRecord(value, "supervisor lease admission");
  requireKeys(record, ["admission", "residentId", "supervisorEpoch", "policyVersion", "policyDigest", "lockStateDigest", "causationId", "correlationId"], "supervisor lease admission");
  if (record.residentId !== "agent_default") throw new Error("supervisor lease admission is invalid");
  return Object.freeze({
    admission: canonicalAdmission(record.admission), residentId: record.residentId, supervisorEpoch: requiredText(record.supervisorEpoch),
    policyVersion: requiredText(record.policyVersion), policyDigest: requiredText(record.policyDigest), lockStateDigest: requiredText(record.lockStateDigest),
    causationId: requiredText(record.causationId), correlationId: requiredText(record.correlationId)
  });
}

function canonicalReconciliationReadInput(value: unknown): Parameters<ActiveClaimReconciliationPort["readByIdempotencyKey"]>[0] {
  const record = ownDataRecord(value, "reconciliation read");
  requireKeys(record, ["admission", "reconciliationIdempotencyKey", "workspaceId", "residentId", "supervisorEpoch"], "reconciliation read");
  if (record.residentId !== "agent_default") throw new Error("reconciliation read is invalid");
  return Object.freeze({ admission: canonicalTuple(record.admission), reconciliationIdempotencyKey: requiredText(record.reconciliationIdempotencyKey), workspaceId: requiredText(record.workspaceId), residentId: record.residentId, supervisorEpoch: requiredText(record.supervisorEpoch) });
}

function canonicalReconciliationAppendInput(value: unknown): Parameters<ActiveClaimReconciliationPort["appendAndReadBack"]>[0] {
  const record = ownDataRecord(value, "reconciliation append");
  requireKeys(record, ["admission", "reconciliationIdempotencyKey", "workspaceId", "residentId", "supervisorEpoch", "record", "observedActiveClaim", "outage"], "reconciliation append");
  if (record.residentId !== "agent_default") throw new Error("reconciliation append is invalid");
  return Object.freeze({
    admission: canonicalTuple(record.admission), reconciliationIdempotencyKey: requiredText(record.reconciliationIdempotencyKey), workspaceId: requiredText(record.workspaceId), residentId: record.residentId, supervisorEpoch: requiredText(record.supervisorEpoch),
    record: record.record as Parameters<ActiveClaimReconciliationPort["appendAndReadBack"]>[0]["record"], observedActiveClaim: canonicalActiveClaim(record.observedActiveClaim), outage: canonicalOutage(record.outage)
  });
}

function canonicalAdmission(value: unknown): WorkspaceAdmissionSnapshot {
  const record = ownDataRecord(value, "workspace admission");
  requireKeys(record, ["identityAndMount", "admissionGeneration"], "workspace admission");
  const identity = ownDataRecord(record.identityAndMount, "workspace admission identity");
  requireKeys(identity, ["workspaceId", "residentId", "supervisorEpoch", "workspaceIdentityEventId", "mountEvidenceId", "authorityEvidenceId"], "workspace admission identity");
  if (identity.residentId !== "agent_default") throw new Error("workspace admission is invalid");
  const generation = ownDataRecord(record.admissionGeneration, "workspace admission generation");
  requireKeys(generation, ["schemaVersion", "generationId"], "workspace admission generation");
  if (generation.schemaVersion !== "resident-wake-admission-generation.v1") throw new Error("workspace admission generation is invalid");
  return Object.freeze({
    identityAndMount: Object.freeze({ workspaceId: requiredText(identity.workspaceId), residentId: identity.residentId, supervisorEpoch: requiredText(identity.supervisorEpoch), workspaceIdentityEventId: requiredText(identity.workspaceIdentityEventId), mountEvidenceId: requiredText(identity.mountEvidenceId), authorityEvidenceId: requiredText(identity.authorityEvidenceId) }),
    admissionGeneration: Object.freeze({ schemaVersion: generation.schemaVersion, generationId: requiredText(generation.generationId) })
  });
}

function canonicalTuple(value: unknown): ClaimReconciliationAdmissionTuple {
  const record = ownDataRecord(value, "reconciliation admission");
  requireKeys(record, ["authorityIdentityAndMount", "admissionGeneration", "verifiedLease", "policyAndLock", "highWater"], "reconciliation admission");
  const admission = canonicalAdmission({ identityAndMount: record.authorityIdentityAndMount, admissionGeneration: record.admissionGeneration });
  return Object.freeze({
    authorityIdentityAndMount: admission.identityAndMount,
    admissionGeneration: admission.admissionGeneration,
    verifiedLease: record.verifiedLease as ClaimReconciliationAdmissionTuple["verifiedLease"],
    policyAndLock: record.policyAndLock as ClaimReconciliationAdmissionTuple["policyAndLock"],
    highWater: record.highWater as ClaimReconciliationAdmissionTuple["highWater"]
  });
}

function canonicalOutage(value: unknown): WorkspaceOutageObservation {
  const record = ownDataRecord(value, "workspace outage observation");
  requireKeys(record, ["safeObservationId", "outageObservedAt", "category", "priorClaimEventId", "priorClaimLeaseId", "priorAuthorityEvidenceId", "highWaterBeforeOutage"], "workspace outage observation");
  return Object.freeze({
    safeObservationId: requiredText(record.safeObservationId), outageObservedAt: requiredText(record.outageObservedAt), category: availabilityCategory(record.category),
    priorClaimEventId: requiredText(record.priorClaimEventId), priorClaimLeaseId: requiredText(record.priorClaimLeaseId), priorAuthorityEvidenceId: requiredText(record.priorAuthorityEvidenceId), highWaterBeforeOutage: requiredText(record.highWaterBeforeOutage)
  });
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

function invalidationCategory(reason: "shutdown" | "authority-loss" | "admission-mismatch"): AvailabilityCategory {
  return reason === "admission-mismatch" ? "workspace-readback-failed" : "workspace-unavailable";
}

function unavailable(category: AvailabilityCategory): AvailabilityFailure { return Object.freeze({ ok: false as const, category }); }

function availabilityCategory(value: unknown): AvailabilityCategory {
  if (value === "workspace-unavailable" || value === "workspace-identity-mismatch" || value === "workspace-readback-failed" || value === "active-lock") return value;
  throw new Error("workspace availability category is invalid");
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
