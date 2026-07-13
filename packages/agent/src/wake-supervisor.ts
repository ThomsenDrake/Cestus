export type WakeSupervisorState =
  | "initializing"
  | "running"
  | "pause-pending"
  | "paused"
  | "recovering"
  | "workspace-unavailable"
  | "degraded"
  | "unrecoverable";

export type WorkspaceAvailabilityState = "verifying" | "available" | "unavailable" | "identity-mismatch" | "stale" | "lock-blocked" | "unrecoverable";
export type WakeSource = "startup" | "poll" | "event" | "command" | "recovery";
export type WakeOperation = "wake" | "pause" | "resume" | "recovery";
export type WakeLifecycleTransition = "started" | "paused" | "resumed" | "recovered";
export type WakeDiagnosticCategory =
  | "supervisor-lease-held"
  | "workspace-unavailable"
  | "workspace-identity-mismatch"
  | "workspace-readback-failed"
  | "admission-mismatch"
  | "active-lock"
  | "scheduler-unavailable"
  | "recovery-exhausted"
  | "pause-quiescence-timeout"
  | "secret-detected"
  | "unrecoverable"
  | "supervisor-stopped";

class WorkspaceReadbackFailure extends Error {}

export interface CausationCorrelationEvidence { readonly causationId: string; readonly correlationId: string; }

export interface WakeSignal {
  readonly schemaVersion: "resident-wake-signal.v1";
  readonly source: WakeSource;
  readonly idempotencyKey: string;
  readonly sourceEventIds: readonly string[];
  readonly requestedAt: string;
}

export interface WakeCommandInput {
  readonly schemaVersion: "resident-wake-command.v1";
  readonly commandId: string;
  readonly sourceEventIds: readonly string[];
  readonly requestedAt: string;
  readonly causation: CausationCorrelationEvidence;
}

export interface RevalidatedAuthorityIdentityAndMountEvidence {
  readonly workspaceId: string;
  readonly residentId: "agent_default";
  readonly supervisorEpoch: string;
  readonly workspaceIdentityEventId: string;
  readonly mountEvidenceId: string;
  readonly authorityEvidenceId: string;
}

/** The opaque authority is deliberately not serializable or callable by this lane. */
export interface WorkspaceAdmissionSnapshot {
  readonly identityAndMount: RevalidatedAuthorityIdentityAndMountEvidence;
}

export interface PolicyAndLockReadbackEvidence {
  readonly authorityEvidenceId: string;
  readonly mountEvidenceId: string;
  readonly leaseEventId: string;
  readonly leaseReadbackEventId: string;
  readonly policyVersion: string;
  readonly policyDigest: string;
  readonly lockStateDigest: string;
  readonly readbackEventId: string;
}

export interface HighWaterReadbackEvidence {
  readonly authorityEvidenceId: string;
  readonly mountEvidenceId: string;
  readonly leaseEventId: string;
  readonly leaseReadbackEventId: string;
  readonly highWaterMark: string;
  readonly readbackEventId: string;
}

export interface SupervisorLeaseReadbackEvidence {
  readonly schemaVersion: "resident-supervisor-lease-readback.v1";
  readonly workspaceId: string;
  readonly residentId: "agent_default";
  readonly supervisorEpoch: string;
  readonly workspaceIdentityEventId: string;
  readonly mountEvidenceId: string;
  readonly authorityEvidenceId: string;
  readonly policyVersion: string;
  readonly policyDigest: string;
  readonly lockStateDigest: string;
  readonly highWaterMark: string;
  readonly leaseEventId: string;
  readonly readbackEventId: string;
  readonly expiresAt: string;
  readonly causation: CausationCorrelationEvidence;
  readonly policyAndLock: PolicyAndLockReadbackEvidence;
  readonly highWater: HighWaterReadbackEvidence;
}

export interface SupervisorLeaseHeldEvidence {
  readonly schemaVersion: "resident-supervisor-lease-held.v1";
  readonly workspaceId: string;
  readonly residentId: "agent_default";
  readonly holderEpoch: string;
  readonly leaseEventId: string;
  readonly readbackEventId: string;
  readonly expiresAt: string;
}

export interface SupervisorLeaseAdmissionInput {
  readonly admission: WorkspaceAdmissionSnapshot;
  readonly residentId: "agent_default";
  readonly supervisorEpoch: string;
  readonly policyVersion: string;
  readonly policyDigest: string;
  readonly lockStateDigest: string;
  readonly causationId: string;
  readonly correlationId: string;
}

export interface WorkspaceAvailabilityAuthority {
  revalidate(input: { readonly operation: WakeOperation; readonly expectedWorkspaceId: string; readonly requiredCapabilities: readonly ["wake", "lifecycle"] }): Promise<
    | { readonly ok: true; readonly admission: WorkspaceAdmissionSnapshot; readonly observedActiveClaim?: RevalidatedActiveClaimEvidence; readonly outage?: WorkspaceOutageObservation }
    | { readonly ok: false; readonly category: "workspace-unavailable" | "workspace-identity-mismatch" | "workspace-readback-failed" | "active-lock" }
  >;
  invalidate?(reason: "shutdown" | "authority-loss" | "admission-mismatch"): void;
}

export interface DurableSupervisorLeasePort {
  readOrAcquire(input: SupervisorLeaseAdmissionInput): Promise<
    | { readonly outcome: "acquired-and-read-back"; readonly readback: SupervisorLeaseReadbackEvidence }
    | { readonly outcome: "supervisor-lease-held"; readonly readback: SupervisorLeaseHeldEvidence }
  >;
}

export interface ClaimReconciliationAdmissionTuple {
  readonly authorityIdentityAndMount: RevalidatedAuthorityIdentityAndMountEvidence;
  readonly verifiedLease: SupervisorLeaseReadbackEvidence;
  readonly policyAndLock: PolicyAndLockReadbackEvidence;
  readonly highWater: HighWaterReadbackEvidence;
}

export interface RevalidatedActiveClaimEvidence {
  readonly workspaceId: string;
  readonly residentId: "agent_default";
  readonly supervisorEpoch: string;
  readonly claimId: string;
  readonly attemptId: string;
  readonly priorClaimEventId: string;
  readonly priorClaimLeaseId: string;
  readonly readbackEventId: string;
  readonly causation: CausationCorrelationEvidence;
}

export interface WorkspaceOutageObservation {
  readonly safeObservationId: string;
  readonly outageObservedAt: string;
  readonly category: "workspace-unavailable" | "workspace-identity-mismatch" | "workspace-readback-failed";
  readonly priorClaimEventId: string;
  readonly priorClaimLeaseId: string;
  readonly priorAuthorityEvidenceId: string;
  readonly highWaterBeforeOutage: string;
}

export interface WorkspaceUnavailableClaimReconciliationV1 {
  readonly schemaVersion: "resident-wake-workspace-unavailable.v1";
  readonly outcome: "workspace-unavailable";
  readonly resumable: true;
  readonly claimDisposition: "released" | "checkpointed";
  readonly workspaceId: string;
  readonly residentId: "agent_default";
  readonly supervisorEpoch: string;
  readonly claimId: string;
  readonly attemptId: string;
  readonly outageObservation: WorkspaceOutageObservation;
  readonly causation: CausationCorrelationEvidence;
  readonly revalidatedAuthority: {
    readonly identityEventId: string;
    readonly mountEvidenceId: string;
    readonly authorityEvidenceId: string;
    readonly highWaterAfterRevalidation: string;
    readonly policyVersion: string;
    readonly policyDigest: string;
    readonly lockStateDigest: string;
    readonly supervisorLeaseEventId: string;
    readonly supervisorLeaseReadbackEventId: string;
    readonly supervisorLeaseExpiresAt: string;
  };
  readonly reconciliationIdempotencyKey: string;
}

export interface ClaimReconciliationReadback {
  readonly record: WorkspaceUnavailableClaimReconciliationV1;
  readonly reconciliationEventId: string;
  readonly readbackEventId: string;
  readonly admission: ClaimReconciliationAdmissionTuple;
}

export interface ActiveClaimReconciliationPort {
  readByIdempotencyKey(input: { readonly admission: ClaimReconciliationAdmissionTuple; readonly reconciliationIdempotencyKey: string; readonly workspaceId: string; readonly residentId: "agent_default"; readonly supervisorEpoch: string }): Promise<ClaimReconciliationReadback | undefined>;
  appendAndReadBack(input: { readonly admission: ClaimReconciliationAdmissionTuple; readonly reconciliationIdempotencyKey: string; readonly workspaceId: string; readonly residentId: "agent_default"; readonly supervisorEpoch: string; readonly record: WorkspaceUnavailableClaimReconciliationV1; readonly observedActiveClaim: RevalidatedActiveClaimEvidence; readonly outage: WorkspaceOutageObservation }): Promise<ClaimReconciliationReadback>;
}

export interface WakeLifecycleEvidenceDto {
  readonly schemaVersion: "resident-wake-evidence.v1";
  readonly transition: WakeLifecycleTransition;
  readonly workspaceId: string;
  readonly residentId: "agent_default";
  readonly supervisorEpoch: string;
  readonly policyVersion: string;
  readonly policyDigest: string;
  readonly lockStateDigest: string;
  readonly highWaterMark: string;
  readonly causation: CausationCorrelationEvidence;
  readonly lifecycleEventId: string;
  readonly readbackEventId: string;
}

export interface WakeRuntimeResult { readonly outcome: "accepted" | "completed"; readonly evidence?: WakeLifecycleEvidenceDto; }
export interface WakeRuntimePort {
  wakeOnce(input: { readonly admission: WorkspaceAdmissionSnapshot; readonly signal: WakeSignal; readonly cancellation: AbortSignal }): Promise<WakeRuntimeResult | void>;
}

export interface WakeLifecyclePort {
  pauseAndReadBack(input: { readonly command: WakeCommandInput; readonly residentId: "agent_default"; readonly supervisorEpoch: string }): Promise<{ readonly ok: true; readonly evidence: WakeLifecycleEvidenceDto } | { readonly ok: false; readonly category: "workspace-unavailable" | "workspace-readback-failed" }>;
}

export interface WakeHealthDiagnosticDto { readonly schemaVersion: "resident-wake-diagnostic.v1"; readonly category: WakeDiagnosticCategory; readonly safeDiagnosticId: string; readonly durable: boolean; readonly allowedCommandIds: readonly string[]; }
export interface WakeStatusDto {
  readonly schemaVersion: "resident-wake-status.v1";
  readonly workspaceId: string;
  readonly residentId: "agent_default";
  readonly supervisorEpoch: string;
  readonly observedAt: string;
  readonly supervisorState: WakeSupervisorState;
  readonly workspaceState: WorkspaceAvailabilityState;
  readonly policyVersion: string;
  readonly policyDigest: string;
  readonly lockStateDigest: string;
  readonly highWaterMark: string;
  readonly transition: WakeLifecycleTransition | "none";
  readonly recoveryAttempts: number;
  readonly maximumRecoveryAttempts: number;
  readonly activeCycle: boolean;
  readonly diagnostics: readonly WakeHealthDiagnosticDto[];
  readonly lifecycleEvidence: readonly WakeLifecycleEvidenceDto[];
}
export interface WorkspaceUnavailableResult { readonly schemaVersion: "workspace-unavailable-result.v1"; readonly category: WakeDiagnosticCategory; readonly retryable: boolean; readonly operation: WakeOperation; readonly safeDiagnosticId: string; readonly durable: boolean; readonly allowedCommandIds: readonly string[]; }
export interface WakeSupervisorCommandResultDto {
  readonly schemaVersion: "resident-wake-command-result.v1";
  readonly requestedTransition: WakeLifecycleTransition;
  readonly outcome: "accepted" | "completed" | "blocked";
  readonly status: WakeStatusDto;
  readonly evidence: readonly WakeLifecycleEvidenceDto[];
  readonly blocked?: WorkspaceUnavailableResult;
}

export interface WakeSupervisor {
  start(): Promise<WakeSupervisorCommandResultDto>;
  signal(input: WakeSignal): Promise<WakeSupervisorCommandResultDto>;
  pause(input: WakeCommandInput): Promise<WakeSupervisorCommandResultDto>;
  resume(input: WakeCommandInput): Promise<WakeSupervisorCommandResultDto>;
  recover(input: WakeCommandInput): Promise<WakeSupervisorCommandResultDto>;
  status(): Promise<WakeStatusDto>;
  stop(): Promise<void>;
}

export interface CreateWakeSupervisorInput {
  readonly residentId: "agent_default";
  readonly supervisorEpoch: string;
  readonly workspaceId: string;
  readonly policyVersion: string;
  readonly policyDigest: string;
  readonly lockStateDigest: string;
  readonly expectedHighWaterMark: string;
  readonly authority: WorkspaceAvailabilityAuthority;
  readonly lease: DurableSupervisorLeasePort;
  readonly reconciliation?: ActiveClaimReconciliationPort;
  readonly runtime: WakeRuntimePort;
  readonly lifecycle?: WakeLifecyclePort;
  readonly maximumMailboxSize?: number;
  readonly maximumRecoveryAttempts?: number;
  readonly now?: () => string;
  readonly cancelTimer?: () => void;
  readonly cancelSignalSource?: () => void;
}

export function createWakeSupervisor(input: CreateWakeSupervisorInput): WakeSupervisor {
  const maximumMailboxSize = input.maximumMailboxSize ?? 64;
  const maximumRecoveryAttempts = input.maximumRecoveryAttempts ?? 2;
  const mailbox = new Map<string, Promise<WakeSupervisorCommandResultDto>>();
  let supervisorState: WakeSupervisorState = "initializing";
  let workspaceState: WorkspaceAvailabilityState = "verifying";
  let diagnostics: readonly WakeHealthDiagnosticDto[] = Object.freeze([]);
  let lifecycleEvidence: readonly WakeLifecycleEvidenceDto[] = Object.freeze([]);
  let recoveryAttempts = 0;
  let highWaterMark = input.expectedHighWaterMark;
  let transition: WakeLifecycleTransition | "none" = "none";
  let stopped = false;
  let intakeClosed = false;
  let activeController: AbortController | undefined;
  let activeCycle = false;

  const supervisor: WakeSupervisor = {
    async start() {
      return runAdmission("wake", startupSignal(), undefined);
    },
    async signal(rawSignal) {
      const signal = parseWakeSignal(rawSignal);
      if (intakeClosed || stopped) return blocked("workspace-unavailable", "wake", false);
      const key = `${signal.source}\u0000${signal.idempotencyKey}`;
      const prior = mailbox.get(key);
      if (prior !== undefined) return prior;
      if (mailbox.size >= maximumMailboxSize || activeCycle) return blocked("scheduler-unavailable", "wake", true);
      const current = runAdmission("wake", signal, undefined);
      mailbox.set(key, current);
      try { return await current; } finally { mailbox.delete(key); }
    },
    async pause(rawCommand) {
      const command = parseWakeCommand(rawCommand);
      if (stopped) return blocked("supervisor-stopped", "pause", false);
      intakeClosed = true;
      supervisorState = "pause-pending";
      activeController?.abort();
      if (input.lifecycle === undefined) return blocked("workspace-readback-failed", "pause", true);
      try {
        const result = freezePauseResult(await input.lifecycle.pauseAndReadBack({ command, residentId: input.residentId, supervisorEpoch: input.supervisorEpoch }));
        if (!result.ok || !matchesLifecycleEvidence(result.evidence, input, command.causation, "paused", highWaterMark)) return blocked(result.ok ? "workspace-readback-failed" : result.category, "pause", true);
        lifecycleEvidence = Object.freeze([...lifecycleEvidence, freezeLifecycleEvidence(result.evidence)]);
        transition = "paused";
        supervisorState = "paused";
        workspaceState = "available";
        diagnostics = Object.freeze([]);
        return completed([result.evidence]);
      } catch { return blocked("workspace-readback-failed", "pause", true); }
    },
    async resume(rawCommand) {
      const command = parseWakeCommand(rawCommand);
      if (stopped) return blocked("supervisor-stopped", "resume", false);
      return runAdmission("resume", commandSignal(command, "command"), command);
    },
    async recover(rawCommand) {
      const command = parseWakeCommand(rawCommand);
      if (stopped) return blocked("supervisor-stopped", "recovery", false);
      return runAdmission("recovery", commandSignal(command, "recovery"), command);
    },
    async status() { return currentStatus(); },
    async stop() {
      if (stopped) return;
      stopped = true;
      intakeClosed = true;
      input.cancelTimer?.();
      input.cancelSignalSource?.();
      input.authority.invalidate?.("shutdown");
      activeController?.abort();
      supervisorState = "paused";
      diagnostics = Object.freeze([diagnostic("supervisor-stopped", false)]);
    }
  };
  return Object.freeze(supervisor);

  async function runAdmission(operation: WakeOperation, signal: WakeSignal, command: WakeCommandInput | undefined): Promise<WakeSupervisorCommandResultDto> {
    if (stopped || intakeClosed) return blocked("supervisor-stopped", operation, false);
    if (activeCycle) return blocked("scheduler-unavailable", operation, true);
    activeCycle = true;
    if (operation === "recovery") supervisorState = "recovering";
    transition = transitionFor(operation);
    const causation = command?.causation ?? Object.freeze({ causationId: signal.idempotencyKey, correlationId: signal.idempotencyKey });
    try {
      const authorityResult = freezeAuthorityResult(await input.authority.revalidate({ operation, expectedWorkspaceId: input.workspaceId, requiredCapabilities: ["wake", "lifecycle"] }));
      if (closed()) return cancelled(operation);
      if (!authorityResult.ok) return unavailable(authorityResult.category, operation);
      const admission = freezeAdmission(authorityResult.admission);
      const leaseResult = freezeLeaseResult(await input.lease.readOrAcquire(Object.freeze({ admission, residentId: input.residentId, supervisorEpoch: input.supervisorEpoch, policyVersion: input.policyVersion, policyDigest: input.policyDigest, lockStateDigest: input.lockStateDigest, causationId: causation.causationId, correlationId: causation.correlationId })));
      if (closed()) return cancelled(operation);
      if (leaseResult.outcome === "supervisor-lease-held") {
        if (!matchesHeldLease(leaseResult.readback, input)) return unavailable("workspace-readback-failed", operation);
        supervisorState = "running";
        workspaceState = "available";
        diagnostics = Object.freeze([diagnostic("supervisor-lease-held", true)]);
        return blocked("supervisor-lease-held", operation, true);
      }
      const lease = freezeLeaseReadback(leaseResult.readback);
      if (!matchesAdmission(lease, admission, input, causation)) return unavailable("workspace-readback-failed", operation);
      highWaterMark = lease.highWaterMark;
      const tuple = freezeTuple(admission, lease);
      if (authorityResult.observedActiveClaim !== undefined || authorityResult.outage !== undefined) {
        if (authorityResult.observedActiveClaim === undefined || authorityResult.outage === undefined || input.reconciliation === undefined) return unavailable("workspace-readback-failed", operation);
        const reconciliation = await reconcile(tuple, authorityResult.observedActiveClaim, authorityResult.outage, causation);
        if (reconciliation === "closed") return cancelled(operation);
        if (reconciliation !== "ok") return unavailable("workspace-readback-failed", operation);
      }
      if (closed()) return cancelled(operation);
      const controller = new AbortController();
      activeController = controller;
      supervisorState = "running";
      workspaceState = "available";
      diagnostics = Object.freeze([]);
      const runtimeResult = freezeRuntimeResult(await input.runtime.wakeOnce({ admission, signal, cancellation: controller.signal }));
      if (closed() || controller.signal.aborted) return cancelled(operation);
      if (runtimeResult?.outcome === "completed") {
        if (runtimeResult.evidence === undefined || !matchesLifecycleEvidence(runtimeResult.evidence, input, causation, transitionFor(operation), highWaterMark)) return unavailable("workspace-readback-failed", operation);
        lifecycleEvidence = Object.freeze([...lifecycleEvidence, freezeLifecycleEvidence(runtimeResult.evidence)]);
        recoveryAttempts = 0;
        return completed([runtimeResult.evidence]);
      }
      recoveryAttempts = operation === "recovery" ? recoveryAttempts + 1 : recoveryAttempts;
      return accepted();
    } catch (error) {
      if (stopped) return blocked("supervisor-stopped", operation, false);
      if (error instanceof WorkspaceReadbackFailure) return unavailable("workspace-readback-failed", operation);
      if (operation === "recovery") {
        recoveryAttempts += 1;
        if (recoveryAttempts >= maximumRecoveryAttempts) {
          supervisorState = "unrecoverable";
          workspaceState = "unrecoverable";
          diagnostics = Object.freeze([diagnostic("recovery-exhausted", true)]);
          return blocked("recovery-exhausted", operation, false);
        }
      }
      supervisorState = "degraded";
      diagnostics = Object.freeze([diagnostic("scheduler-unavailable", false)]);
      return blocked("scheduler-unavailable", operation, true);
    } finally {
      activeCycle = false;
      activeController = undefined;
    }
  }

  async function reconcile(tuple: ClaimReconciliationAdmissionTuple, activeClaim: RevalidatedActiveClaimEvidence, outage: WorkspaceOutageObservation, causation: CausationCorrelationEvidence): Promise<"ok" | "closed" | "invalid"> {
    const safeClaim = freezeActiveClaim(activeClaim);
    const safeOutage = freezeOutage(outage);
    if (!matchesActiveClaim(safeClaim, tuple.authorityIdentityAndMount) || !matchesOutage(safeOutage, safeClaim, tuple)) return "invalid";
    const reconciliationIdempotencyKey = reconciliationKey(tuple, safeClaim, safeOutage);
    const lookup = Object.freeze({ admission: tuple, reconciliationIdempotencyKey, workspaceId: input.workspaceId, residentId: input.residentId, supervisorEpoch: input.supervisorEpoch });
    const existing = await input.reconciliation!.readByIdempotencyKey(lookup);
    if (closed()) return "closed";
    const record = reconciliationRecord(safeClaim, safeOutage, causation, tuple, reconciliationIdempotencyKey);
    const rawReadback = existing ?? await input.reconciliation!.appendAndReadBack(Object.freeze({ ...lookup, record, observedActiveClaim: safeClaim, outage: safeOutage }));
    if (closed()) return "closed";
    return matchesReconciliationReadback(freezeReconciliationReadback(rawReadback), tuple, record) ? "ok" : "invalid";
  }

  function startupSignal(): WakeSignal { return Object.freeze({ schemaVersion: "resident-wake-signal.v1", source: "startup", idempotencyKey: `start:${input.supervisorEpoch}`, sourceEventIds: Object.freeze([]), requestedAt: now() }); }
  function commandSignal(command: WakeCommandInput, source: "command" | "recovery"): WakeSignal { return Object.freeze({ schemaVersion: "resident-wake-signal.v1", source, idempotencyKey: command.commandId, sourceEventIds: command.sourceEventIds, requestedAt: command.requestedAt }); }
  function now(): string { return input.now?.() ?? "1970-01-01T00:00:00.000Z"; }
  function currentStatus(): WakeStatusDto { return Object.freeze({ schemaVersion: "resident-wake-status.v1", workspaceId: input.workspaceId, residentId: input.residentId, supervisorEpoch: input.supervisorEpoch, observedAt: now(), supervisorState, workspaceState, policyVersion: input.policyVersion, policyDigest: input.policyDigest, lockStateDigest: input.lockStateDigest, highWaterMark, transition, recoveryAttempts, maximumRecoveryAttempts, activeCycle, diagnostics, lifecycleEvidence }); }
  function accepted(): WakeSupervisorCommandResultDto { return Object.freeze({ schemaVersion: "resident-wake-command-result.v1", requestedTransition: transition, outcome: "accepted", status: currentStatus(), evidence: Object.freeze([]) }); }
  function completed(evidence: readonly WakeLifecycleEvidenceDto[]): WakeSupervisorCommandResultDto { return Object.freeze({ schemaVersion: "resident-wake-command-result.v1", requestedTransition: transition, outcome: "completed", status: currentStatus(), evidence: Object.freeze(evidence.map(freezeLifecycleEvidence)) }); }
  function blocked(category: WakeDiagnosticCategory, operation: WakeOperation, retryable: boolean): WakeSupervisorCommandResultDto { const unavailable = Object.freeze({ schemaVersion: "workspace-unavailable-result.v1" as const, category, retryable, operation, safeDiagnosticId: `wake:${category}`, durable: category === "supervisor-lease-held" || category === "recovery-exhausted", allowedCommandIds: Object.freeze(retryable ? ["resume", "recover"] : []) }); return Object.freeze({ schemaVersion: "resident-wake-command-result.v1", requestedTransition: transitionFor(operation), outcome: "blocked", status: currentStatus(), evidence: Object.freeze([]), blocked: unavailable }); }
  function unavailable(category: "workspace-unavailable" | "workspace-identity-mismatch" | "workspace-readback-failed" | "active-lock", operation: WakeOperation): WakeSupervisorCommandResultDto { input.authority.invalidate?.(category === "workspace-identity-mismatch" ? "authority-loss" : "admission-mismatch"); supervisorState = "workspace-unavailable"; workspaceState = category === "workspace-identity-mismatch" ? "identity-mismatch" : category === "active-lock" ? "lock-blocked" : "unavailable"; diagnostics = Object.freeze([diagnostic(category, false)]); return blocked(category, operation, true); }
  function closed(): boolean { return stopped || intakeClosed; }
  function cancelled(operation: WakeOperation): WakeSupervisorCommandResultDto { return blocked("supervisor-stopped", operation, false); }
}

export function parseWakeSignal(value: unknown): WakeSignal { const record = dataRecord(value, "wake signal"); requireKeys(record, ["schemaVersion", "source", "idempotencyKey", "sourceEventIds", "requestedAt"], "wake signal"); if (record.schemaVersion !== "resident-wake-signal.v1" || !isWakeSource(record.source) || !nonEmptyString(record.idempotencyKey) || !nonEmptyString(record.requestedAt)) throw new Error("wake signal is not canonical."); return Object.freeze({ schemaVersion: record.schemaVersion, source: record.source, idempotencyKey: record.idempotencyKey, sourceEventIds: stringArray(record.sourceEventIds, "wake signal source event ids"), requestedAt: record.requestedAt }); }
export function parseWakeCommand(value: unknown): WakeCommandInput { const record = dataRecord(value, "wake command"); requireKeys(record, ["schemaVersion", "commandId", "sourceEventIds", "requestedAt", "causation"], "wake command"); if (record.schemaVersion !== "resident-wake-command.v1" || !nonEmptyString(record.commandId) || !nonEmptyString(record.requestedAt)) throw new Error("wake command is not canonical."); return Object.freeze({ schemaVersion: record.schemaVersion, commandId: record.commandId, sourceEventIds: stringArray(record.sourceEventIds, "wake command source event ids"), requestedAt: record.requestedAt, causation: parseCausation(record.causation) }); }
export function parseWakeHealthDiagnostic(value: unknown): WakeHealthDiagnosticDto { const record = dataRecord(value, "wake health diagnostic"); requireKeys(record, ["schemaVersion", "category", "safeDiagnosticId", "durable", "allowedCommandIds"], "wake health diagnostic"); if (record.schemaVersion !== "resident-wake-diagnostic.v1" || !isDiagnosticCategory(record.category) || !nonEmptyString(record.safeDiagnosticId) || typeof record.durable !== "boolean") throw new Error("wake health diagnostic is not canonical."); return Object.freeze({ schemaVersion: record.schemaVersion, category: record.category, safeDiagnosticId: record.safeDiagnosticId, durable: record.durable, allowedCommandIds: stringArray(record.allowedCommandIds, "allowed command ids") }); }

function diagnostic(category: WakeDiagnosticCategory, durable: boolean): WakeHealthDiagnosticDto { return Object.freeze({ schemaVersion: "resident-wake-diagnostic.v1", category, safeDiagnosticId: `wake:${category}`, durable, allowedCommandIds: Object.freeze(category === "recovery-exhausted" ? ["recover"] : []) }); }
function transitionFor(operation: WakeOperation): WakeLifecycleTransition { return operation === "pause" ? "paused" : operation === "resume" ? "resumed" : operation === "recovery" ? "recovered" : "started"; }
function freezeAdmission(value: unknown): WorkspaceAdmissionSnapshot { const record = dataRecord(value, "admission"); requireKeys(record, ["identityAndMount"], "admission"); return Object.freeze({ identityAndMount: freezeIdentity(record.identityAndMount) }); }
function freezeIdentity(value: unknown): RevalidatedAuthorityIdentityAndMountEvidence { const record = dataRecord(value, "admission identity"); requireKeys(record, ["workspaceId", "residentId", "supervisorEpoch", "workspaceIdentityEventId", "mountEvidenceId", "authorityEvidenceId"], "admission identity"); if (!nonEmptyString(record.workspaceId) || record.residentId !== "agent_default" || !nonEmptyString(record.supervisorEpoch) || !nonEmptyString(record.workspaceIdentityEventId) || !nonEmptyString(record.mountEvidenceId) || !nonEmptyString(record.authorityEvidenceId)) throw new Error("unsafe admission snapshot."); return Object.freeze({ workspaceId: record.workspaceId, residentId: record.residentId, supervisorEpoch: record.supervisorEpoch, workspaceIdentityEventId: record.workspaceIdentityEventId, mountEvidenceId: record.mountEvidenceId, authorityEvidenceId: record.authorityEvidenceId }); }
function freezeLeaseResult(value: unknown): Awaited<ReturnType<DurableSupervisorLeasePort["readOrAcquire"]>> { return readbackBoundary(() => { const record = dataRecord(value, "lease result"); if (record.outcome === "acquired-and-read-back") { requireKeys(record, ["outcome", "readback"], "lease result"); return Object.freeze({ outcome: "acquired-and-read-back" as const, readback: freezeLeaseReadback(record.readback) }); } if (record.outcome === "supervisor-lease-held") { requireKeys(record, ["outcome", "readback"], "lease result"); return Object.freeze({ outcome: "supervisor-lease-held" as const, readback: freezeHeldLease(record.readback) }); } throw new Error("unsafe lease result."); }); }
function freezeLeaseReadback(value: unknown): SupervisorLeaseReadbackEvidence { const record = dataRecord(value, "lease readback"); requireKeys(record, ["schemaVersion", "workspaceId", "residentId", "supervisorEpoch", "workspaceIdentityEventId", "mountEvidenceId", "authorityEvidenceId", "policyVersion", "policyDigest", "lockStateDigest", "highWaterMark", "leaseEventId", "readbackEventId", "expiresAt", "causation", "policyAndLock", "highWater"], "lease readback"); return Object.freeze({ schemaVersion: record.schemaVersion as "resident-supervisor-lease-readback.v1", workspaceId: stringField(record, "workspaceId"), residentId: record.residentId as "agent_default", supervisorEpoch: stringField(record, "supervisorEpoch"), workspaceIdentityEventId: stringField(record, "workspaceIdentityEventId"), mountEvidenceId: stringField(record, "mountEvidenceId"), authorityEvidenceId: stringField(record, "authorityEvidenceId"), policyVersion: stringField(record, "policyVersion"), policyDigest: stringField(record, "policyDigest"), lockStateDigest: stringField(record, "lockStateDigest"), highWaterMark: stringField(record, "highWaterMark"), leaseEventId: stringField(record, "leaseEventId"), readbackEventId: stringField(record, "readbackEventId"), expiresAt: stringField(record, "expiresAt"), causation: parseCausation(record.causation), policyAndLock: freezePolicyLock(record.policyAndLock), highWater: freezeHighWater(record.highWater) }); }
function freezeHeldLease(value: unknown): SupervisorLeaseHeldEvidence { const record = dataRecord(value, "held lease"); requireKeys(record, ["schemaVersion", "workspaceId", "residentId", "holderEpoch", "leaseEventId", "readbackEventId", "expiresAt"], "held lease"); return Object.freeze({ schemaVersion: record.schemaVersion as "resident-supervisor-lease-held.v1", workspaceId: stringField(record, "workspaceId"), residentId: record.residentId as "agent_default", holderEpoch: stringField(record, "holderEpoch"), leaseEventId: stringField(record, "leaseEventId"), readbackEventId: stringField(record, "readbackEventId"), expiresAt: stringField(record, "expiresAt") }); }
function freezePolicyLock(value: unknown): PolicyAndLockReadbackEvidence { const record = dataRecord(value, "policy lock readback"); requireKeys(record, ["authorityEvidenceId", "mountEvidenceId", "leaseEventId", "leaseReadbackEventId", "policyVersion", "policyDigest", "lockStateDigest", "readbackEventId"], "policy lock readback"); return Object.freeze({ authorityEvidenceId: stringField(record, "authorityEvidenceId"), mountEvidenceId: stringField(record, "mountEvidenceId"), leaseEventId: stringField(record, "leaseEventId"), leaseReadbackEventId: stringField(record, "leaseReadbackEventId"), policyVersion: stringField(record, "policyVersion"), policyDigest: stringField(record, "policyDigest"), lockStateDigest: stringField(record, "lockStateDigest"), readbackEventId: stringField(record, "readbackEventId") }); }
function freezeHighWater(value: unknown): HighWaterReadbackEvidence { const record = dataRecord(value, "high water readback"); requireKeys(record, ["authorityEvidenceId", "mountEvidenceId", "leaseEventId", "leaseReadbackEventId", "highWaterMark", "readbackEventId"], "high water readback"); return Object.freeze({ authorityEvidenceId: stringField(record, "authorityEvidenceId"), mountEvidenceId: stringField(record, "mountEvidenceId"), leaseEventId: stringField(record, "leaseEventId"), leaseReadbackEventId: stringField(record, "leaseReadbackEventId"), highWaterMark: stringField(record, "highWaterMark"), readbackEventId: stringField(record, "readbackEventId") }); }
function freezeTuple(admission: WorkspaceAdmissionSnapshot, verifiedLease: SupervisorLeaseReadbackEvidence): ClaimReconciliationAdmissionTuple { return Object.freeze({ authorityIdentityAndMount: admission.identityAndMount, verifiedLease, policyAndLock: verifiedLease.policyAndLock, highWater: verifiedLease.highWater }); }
function freezeLifecycleEvidence(value: unknown): WakeLifecycleEvidenceDto { const record = dataRecord(value, "lifecycle evidence"); requireKeys(record, ["schemaVersion", "transition", "workspaceId", "residentId", "supervisorEpoch", "policyVersion", "policyDigest", "lockStateDigest", "highWaterMark", "causation", "lifecycleEventId", "readbackEventId"], "lifecycle evidence"); if (record.schemaVersion !== "resident-wake-evidence.v1" || !isTransition(record.transition) || record.residentId !== "agent_default") throw new Error("unsafe lifecycle evidence."); return Object.freeze({ schemaVersion: record.schemaVersion, transition: record.transition, workspaceId: stringField(record, "workspaceId"), residentId: record.residentId, supervisorEpoch: stringField(record, "supervisorEpoch"), policyVersion: stringField(record, "policyVersion"), policyDigest: stringField(record, "policyDigest"), lockStateDigest: stringField(record, "lockStateDigest"), highWaterMark: stringField(record, "highWaterMark"), causation: parseCausation(record.causation), lifecycleEventId: stringField(record, "lifecycleEventId"), readbackEventId: stringField(record, "readbackEventId") }); }
function freezePauseResult(value: unknown): { readonly ok: true; readonly evidence: WakeLifecycleEvidenceDto } | { readonly ok: false; readonly category: "workspace-unavailable" | "workspace-readback-failed" } { const record = dataRecord(value, "pause result"); if (record.ok === true) { requireKeys(record, ["ok", "evidence"], "pause result"); return Object.freeze({ ok: true, evidence: freezeLifecycleEvidence(record.evidence) }); } if (record.ok === false && (record.category === "workspace-unavailable" || record.category === "workspace-readback-failed")) { requireKeys(record, ["ok", "category"], "pause result"); return Object.freeze({ ok: false, category: record.category }); } throw new Error("unsafe pause result."); }
function freezeRuntimeResult(value: unknown): WakeRuntimeResult | void { if (value === undefined) return undefined; const record = dataRecord(value, "runtime result"); if (record.outcome === "accepted") { requireKeys(record, ["outcome"], "runtime result"); return Object.freeze({ outcome: "accepted" }); } if (record.outcome === "completed") { requireKeys(record, ["outcome", "evidence"], "runtime result"); return Object.freeze({ outcome: "completed", evidence: freezeLifecycleEvidence(record.evidence) }); } throw new Error("unsafe runtime result."); }
function parseCausation(value: unknown): CausationCorrelationEvidence { const record = dataRecord(value, "causation"); requireKeys(record, ["causationId", "correlationId"], "causation"); return Object.freeze({ causationId: stringField(record, "causationId"), correlationId: stringField(record, "correlationId") }); }
function matchesAdmission(lease: SupervisorLeaseReadbackEvidence, admission: WorkspaceAdmissionSnapshot, input: CreateWakeSupervisorInput, causation: CausationCorrelationEvidence): boolean { const i = admission.identityAndMount; const p = lease.policyAndLock; const h = lease.highWater; return lease.schemaVersion === "resident-supervisor-lease-readback.v1" && lease.workspaceId === i.workspaceId && lease.residentId === i.residentId && lease.supervisorEpoch === i.supervisorEpoch && lease.workspaceIdentityEventId === i.workspaceIdentityEventId && lease.mountEvidenceId === i.mountEvidenceId && lease.authorityEvidenceId === i.authorityEvidenceId && lease.policyVersion === input.policyVersion && lease.policyDigest === input.policyDigest && lease.lockStateDigest === input.lockStateDigest && lease.highWaterMark === input.expectedHighWaterMark && lease.causation.causationId === causation.causationId && lease.causation.correlationId === causation.correlationId && nonEmptyString(lease.leaseEventId) && nonEmptyString(lease.readbackEventId) && nonEmptyString(lease.expiresAt) && p.authorityEvidenceId === lease.authorityEvidenceId && p.mountEvidenceId === lease.mountEvidenceId && p.leaseEventId === lease.leaseEventId && p.leaseReadbackEventId === lease.readbackEventId && p.policyVersion === lease.policyVersion && p.policyDigest === lease.policyDigest && p.lockStateDigest === lease.lockStateDigest && nonEmptyString(p.readbackEventId) && h.authorityEvidenceId === lease.authorityEvidenceId && h.mountEvidenceId === lease.mountEvidenceId && h.leaseEventId === lease.leaseEventId && h.leaseReadbackEventId === lease.readbackEventId && h.highWaterMark === lease.highWaterMark && nonEmptyString(h.readbackEventId); }
function matchesHeldLease(value: SupervisorLeaseHeldEvidence, input: CreateWakeSupervisorInput): boolean { return value.schemaVersion === "resident-supervisor-lease-held.v1" && value.workspaceId === input.workspaceId && value.residentId === input.residentId && nonEmptyString(value.holderEpoch) && nonEmptyString(value.leaseEventId) && nonEmptyString(value.readbackEventId) && nonEmptyString(value.expiresAt); }
function matchesActiveClaim(value: RevalidatedActiveClaimEvidence, identity: RevalidatedAuthorityIdentityAndMountEvidence): boolean { return value.workspaceId === identity.workspaceId && value.residentId === identity.residentId && value.supervisorEpoch === identity.supervisorEpoch && nonEmptyString(value.claimId) && nonEmptyString(value.attemptId) && nonEmptyString(value.priorClaimEventId) && nonEmptyString(value.priorClaimLeaseId) && nonEmptyString(value.readbackEventId) && nonEmptyString(value.causation.causationId) && nonEmptyString(value.causation.correlationId); }
function matchesOutage(value: WorkspaceOutageObservation, active: RevalidatedActiveClaimEvidence, tuple: ClaimReconciliationAdmissionTuple): boolean { return nonEmptyString(value.safeObservationId) && nonEmptyString(value.outageObservedAt) && value.priorClaimEventId === active.priorClaimEventId && value.priorClaimLeaseId === active.priorClaimLeaseId && value.priorAuthorityEvidenceId === tuple.verifiedLease.authorityEvidenceId && value.highWaterBeforeOutage === tuple.highWater.highWaterMark; }
function reconciliationKey(tuple: ClaimReconciliationAdmissionTuple, active: RevalidatedActiveClaimEvidence, outage: WorkspaceOutageObservation): string { return `wake-reconcile:${JSON.stringify([tuple.authorityIdentityAndMount.workspaceId, tuple.authorityIdentityAndMount.supervisorEpoch, outage.safeObservationId, outage.priorClaimEventId, active.claimId, active.attemptId, tuple.verifiedLease.leaseEventId, tuple.verifiedLease.authorityEvidenceId, tuple.verifiedLease.readbackEventId, tuple.highWater.highWaterMark, tuple.policyAndLock.lockStateDigest])}`; }
function reconciliationRecord(active: RevalidatedActiveClaimEvidence, outage: WorkspaceOutageObservation, causation: CausationCorrelationEvidence, tuple: ClaimReconciliationAdmissionTuple, reconciliationIdempotencyKey: string): WorkspaceUnavailableClaimReconciliationV1 { const lease = tuple.verifiedLease; return Object.freeze({ schemaVersion: "resident-wake-workspace-unavailable.v1", outcome: "workspace-unavailable", resumable: true, claimDisposition: "checkpointed", workspaceId: active.workspaceId, residentId: active.residentId, supervisorEpoch: active.supervisorEpoch, claimId: active.claimId, attemptId: active.attemptId, outageObservation: Object.freeze({ ...outage }), causation: Object.freeze({ ...causation }), revalidatedAuthority: Object.freeze({ identityEventId: tuple.authorityIdentityAndMount.workspaceIdentityEventId, mountEvidenceId: lease.mountEvidenceId, authorityEvidenceId: lease.authorityEvidenceId, highWaterAfterRevalidation: tuple.highWater.highWaterMark, policyVersion: tuple.policyAndLock.policyVersion, policyDigest: tuple.policyAndLock.policyDigest, lockStateDigest: tuple.policyAndLock.lockStateDigest, supervisorLeaseEventId: lease.leaseEventId, supervisorLeaseReadbackEventId: lease.readbackEventId, supervisorLeaseExpiresAt: lease.expiresAt }), reconciliationIdempotencyKey }); }
function matchesReconciliationReadback(readback: ClaimReconciliationReadback, tuple: ClaimReconciliationAdmissionTuple, record: WorkspaceUnavailableClaimReconciliationV1): boolean { return sameTuple(readback.admission, tuple) && sameRecord(readback.record, record) && nonEmptyString(readback.reconciliationEventId) && nonEmptyString(readback.readbackEventId); }
function sameTuple(a: ClaimReconciliationAdmissionTuple, b: ClaimReconciliationAdmissionTuple): boolean { return JSON.stringify(a) === JSON.stringify(b); }
function sameRecord(a: WorkspaceUnavailableClaimReconciliationV1, b: WorkspaceUnavailableClaimReconciliationV1): boolean { return JSON.stringify(a) === JSON.stringify(b); }
function matchesLifecycleEvidence(value: WakeLifecycleEvidenceDto, input: CreateWakeSupervisorInput, causation: CausationCorrelationEvidence, expectedTransition: WakeLifecycleTransition, expectedHighWaterMark: string): boolean { return value.schemaVersion === "resident-wake-evidence.v1" && value.transition === expectedTransition && value.workspaceId === input.workspaceId && value.residentId === input.residentId && value.supervisorEpoch === input.supervisorEpoch && value.policyVersion === input.policyVersion && value.policyDigest === input.policyDigest && value.lockStateDigest === input.lockStateDigest && value.highWaterMark === expectedHighWaterMark && value.causation.causationId === causation.causationId && value.causation.correlationId === causation.correlationId && nonEmptyString(value.lifecycleEventId) && nonEmptyString(value.readbackEventId); }
function freezeAuthorityResult(value: unknown): Awaited<ReturnType<WorkspaceAvailabilityAuthority["revalidate"]>> { const record = dataRecord(value, "authority result"); if (record.ok === false) { requireKeys(record, ["ok", "category"], "authority result"); if (record.category !== "workspace-unavailable" && record.category !== "workspace-identity-mismatch" && record.category !== "workspace-readback-failed" && record.category !== "active-lock") throw new Error("unsafe authority result."); return Object.freeze({ ok: false, category: record.category }); } if (record.ok !== true) throw new Error("unsafe authority result."); const hasClaim = Object.prototype.hasOwnProperty.call(record, "observedActiveClaim"); const hasOutage = Object.prototype.hasOwnProperty.call(record, "outage"); requireKeys(record, hasClaim || hasOutage ? ["ok", "admission", "observedActiveClaim", "outage"] : ["ok", "admission"], "authority result"); if (hasClaim !== hasOutage) throw new Error("unsafe authority result."); const admission = freezeAdmission(record.admission); return hasClaim ? Object.freeze({ ok: true, admission, observedActiveClaim: freezeActiveClaim(record.observedActiveClaim), outage: freezeOutage(record.outage) }) : Object.freeze({ ok: true, admission }); }
function freezeActiveClaim(value: unknown): RevalidatedActiveClaimEvidence { const record = dataRecord(value, "active claim readback"); requireKeys(record, ["workspaceId", "residentId", "supervisorEpoch", "claimId", "attemptId", "priorClaimEventId", "priorClaimLeaseId", "readbackEventId", "causation"], "active claim readback"); if (record.residentId !== "agent_default") throw new Error("unsafe active claim readback."); return Object.freeze({ workspaceId: stringField(record, "workspaceId"), residentId: record.residentId, supervisorEpoch: stringField(record, "supervisorEpoch"), claimId: stringField(record, "claimId"), attemptId: stringField(record, "attemptId"), priorClaimEventId: stringField(record, "priorClaimEventId"), priorClaimLeaseId: stringField(record, "priorClaimLeaseId"), readbackEventId: stringField(record, "readbackEventId"), causation: parseCausation(record.causation) }); }
function freezeOutage(value: unknown): WorkspaceOutageObservation { const record = dataRecord(value, "outage observation"); requireKeys(record, ["safeObservationId", "outageObservedAt", "category", "priorClaimEventId", "priorClaimLeaseId", "priorAuthorityEvidenceId", "highWaterBeforeOutage"], "outage observation"); if (record.category !== "workspace-unavailable" && record.category !== "workspace-identity-mismatch" && record.category !== "workspace-readback-failed") throw new Error("unsafe outage observation."); return Object.freeze({ safeObservationId: stringField(record, "safeObservationId"), outageObservedAt: stringField(record, "outageObservedAt"), category: record.category, priorClaimEventId: stringField(record, "priorClaimEventId"), priorClaimLeaseId: stringField(record, "priorClaimLeaseId"), priorAuthorityEvidenceId: stringField(record, "priorAuthorityEvidenceId"), highWaterBeforeOutage: stringField(record, "highWaterBeforeOutage") }); }
function freezeReconciliationReadback(value: unknown): ClaimReconciliationReadback { const record = dataRecord(value, "reconciliation readback"); requireKeys(record, ["record", "reconciliationEventId", "readbackEventId", "admission"], "reconciliation readback"); return Object.freeze({ record: freezeReconciliationRecord(record.record), reconciliationEventId: stringField(record, "reconciliationEventId"), readbackEventId: stringField(record, "readbackEventId"), admission: freezeReadbackTuple(record.admission) }); }
function freezeReadbackTuple(value: unknown): ClaimReconciliationAdmissionTuple { const record = dataRecord(value, "reconciliation tuple"); requireKeys(record, ["authorityIdentityAndMount", "verifiedLease", "policyAndLock", "highWater"], "reconciliation tuple"); return Object.freeze({ authorityIdentityAndMount: freezeIdentity(record.authorityIdentityAndMount), verifiedLease: freezeLeaseReadback(record.verifiedLease), policyAndLock: freezePolicyLock(record.policyAndLock), highWater: freezeHighWater(record.highWater) }); }
function freezeReconciliationRecord(value: unknown): WorkspaceUnavailableClaimReconciliationV1 { const record = dataRecord(value, "reconciliation record"); requireKeys(record, ["schemaVersion", "outcome", "resumable", "claimDisposition", "workspaceId", "residentId", "supervisorEpoch", "claimId", "attemptId", "outageObservation", "causation", "revalidatedAuthority", "reconciliationIdempotencyKey"], "reconciliation record"); if (record.schemaVersion !== "resident-wake-workspace-unavailable.v1" || record.outcome !== "workspace-unavailable" || record.resumable !== true || (record.claimDisposition !== "released" && record.claimDisposition !== "checkpointed") || record.residentId !== "agent_default") throw new Error("unsafe reconciliation record."); const authority = dataRecord(record.revalidatedAuthority, "revalidated authority"); requireKeys(authority, ["identityEventId", "mountEvidenceId", "authorityEvidenceId", "highWaterAfterRevalidation", "policyVersion", "policyDigest", "lockStateDigest", "supervisorLeaseEventId", "supervisorLeaseReadbackEventId", "supervisorLeaseExpiresAt"], "revalidated authority"); return Object.freeze({ schemaVersion: record.schemaVersion, outcome: record.outcome, resumable: true, claimDisposition: record.claimDisposition, workspaceId: stringField(record, "workspaceId"), residentId: record.residentId, supervisorEpoch: stringField(record, "supervisorEpoch"), claimId: stringField(record, "claimId"), attemptId: stringField(record, "attemptId"), outageObservation: freezeOutage(record.outageObservation), causation: parseCausation(record.causation), revalidatedAuthority: Object.freeze({ identityEventId: stringField(authority, "identityEventId"), mountEvidenceId: stringField(authority, "mountEvidenceId"), authorityEvidenceId: stringField(authority, "authorityEvidenceId"), highWaterAfterRevalidation: stringField(authority, "highWaterAfterRevalidation"), policyVersion: stringField(authority, "policyVersion"), policyDigest: stringField(authority, "policyDigest"), lockStateDigest: stringField(authority, "lockStateDigest"), supervisorLeaseEventId: stringField(authority, "supervisorLeaseEventId"), supervisorLeaseReadbackEventId: stringField(authority, "supervisorLeaseReadbackEventId"), supervisorLeaseExpiresAt: stringField(authority, "supervisorLeaseExpiresAt") }), reconciliationIdempotencyKey: stringField(record, "reconciliationIdempotencyKey") }); }
function readbackBoundary<T>(read: () => T): T { try { return read(); } catch { throw new WorkspaceReadbackFailure(); } }
function dataRecord(value: unknown, label: string): Record<string, unknown> { if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || Object.getOwnPropertySymbols(value).length > 0) throw new Error(`${label} must be a plain data object.`); const descriptors = Object.getOwnPropertyDescriptors(value); const copy: Record<string, unknown> = {}; for (const [key, descriptor] of Object.entries(descriptors)) { if (descriptor.get !== undefined || descriptor.set !== undefined || !descriptor.enumerable) throw new Error(`${label}.${key} must be enumerable data.`); copy[key] = descriptor.value; } return copy; }
function requireKeys(record: Record<string, unknown>, expected: readonly string[], label: string): void { const keys = Object.keys(record); if (keys.length !== expected.length || expected.some((key) => !Object.prototype.hasOwnProperty.call(record, key))) throw new Error(`${label} has unsupported or missing keys.`); }
function stringArray(value: unknown, label: string): readonly string[] { if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length > 0 || Object.keys(value).length !== value.length) throw new Error(`${label} must be a dense plain array.`); const descriptors = Object.getOwnPropertyDescriptors(value); const copy: string[] = []; for (let index = 0; index < value.length; index += 1) { const descriptor = descriptors[String(index)]; if (descriptor === undefined || descriptor.get !== undefined || descriptor.set !== undefined || typeof descriptor.value !== "string" || descriptor.value.length === 0) throw new Error(`${label} is not canonical.`); copy.push(descriptor.value); } return Object.freeze(copy); }
function nonEmptyString(value: unknown): value is string { return typeof value === "string" && value.length > 0; }
function stringField(record: Record<string, unknown>, key: string): string { const value = record[key]; if (!nonEmptyString(value)) throw new Error(`${key} must be a nonempty string.`); return value; }
function isTransition(value: unknown): value is WakeLifecycleTransition { return value === "started" || value === "paused" || value === "resumed" || value === "recovered"; }
function isWakeSource(value: unknown): value is WakeSource { return value === "startup" || value === "poll" || value === "event" || value === "command" || value === "recovery"; }
function isDiagnosticCategory(value: unknown): value is WakeDiagnosticCategory { return value === "supervisor-lease-held" || value === "workspace-unavailable" || value === "workspace-identity-mismatch" || value === "workspace-readback-failed" || value === "admission-mismatch" || value === "active-lock" || value === "scheduler-unavailable" || value === "recovery-exhausted" || value === "pause-quiescence-timeout" || value === "secret-detected" || value === "unrecoverable" || value === "supervisor-stopped"; }
