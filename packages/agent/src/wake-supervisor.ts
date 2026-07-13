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

export interface WakeSignal {
  readonly source: WakeSource;
  readonly idempotencyKey: string;
  readonly sourceEventIds?: readonly string[];
  readonly requestedAt?: string;
}

export interface RevalidatedAuthorityIdentityAndMountEvidence {
  readonly workspaceId: string;
  readonly residentId: "agent_default";
  readonly supervisorEpoch: string;
  readonly workspaceIdentityEventId: string;
  readonly mountEvidenceId: string;
  readonly authorityEvidenceId: string;
}

export interface WorkspaceAdmissionSnapshot {
  readonly identityAndMount: RevalidatedAuthorityIdentityAndMountEvidence;
}

export interface SupervisorLeaseReadbackEvidence {
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
}

export interface WorkspaceAvailabilityAuthority {
  revalidate(input: { readonly operation: "wake" | "resume" | "recovery"; readonly workspaceId: string }): Promise<
    | { readonly ok: true; readonly admission: WorkspaceAdmissionSnapshot }
    | { readonly ok: false; readonly category: "workspace-unavailable" | "workspace-identity-mismatch" | "workspace-readback-failed" }
  >;
}

export interface DurableSupervisorLeasePort {
  readOrAcquire(input: {
    readonly admission: WorkspaceAdmissionSnapshot;
    readonly residentId: "agent_default";
    readonly supervisorEpoch: string;
    readonly policyVersion: string;
    readonly policyDigest: string;
  }): Promise<
    | { readonly outcome: "acquired-and-read-back"; readonly readback: SupervisorLeaseReadbackEvidence }
    | { readonly outcome: "supervisor-lease-held" }
  >;
}

export interface WakeRuntimePort {
  wakeOnce(input: { readonly admission: WorkspaceAdmissionSnapshot; readonly signal: WakeSignal; readonly cancellation: AbortSignal }): Promise<unknown>;
}

export interface WakeCommandInput { readonly commandId: string; }
export interface WakeLifecyclePort {
  pauseAndReadBack(input: { readonly command: WakeCommandInput; readonly residentId: "agent_default"; readonly supervisorEpoch: string }): Promise<{ readonly ok: true } | { readonly ok: false }>;
}

export interface WakeHealthDiagnosticDto {
  readonly category: "supervisor-lease-held" | "workspace-unavailable" | "workspace-identity-mismatch" | "workspace-readback-failed" | "admission-mismatch" | "wake-failed";
}

export interface WakeStatusDto {
  readonly schemaVersion: "wake-status.v1";
  readonly supervisorState: WakeSupervisorState;
  readonly workspaceState: WorkspaceAvailabilityState;
  readonly diagnostics: readonly WakeHealthDiagnosticDto[];
}

export interface WakeSupervisorCommandResultDto {
  readonly outcome: "accepted" | "blocked";
  readonly status: WakeStatusDto;
}

export interface WakeSupervisor {
  signal(input: WakeSignal): Promise<WakeSupervisorCommandResultDto>;
  pause(input: WakeCommandInput): Promise<WakeSupervisorCommandResultDto>;
  status(): Promise<WakeStatusDto>;
}

export interface CreateWakeSupervisorInput {
  readonly residentId: "agent_default";
  readonly supervisorEpoch: string;
  readonly workspaceId: string;
  readonly policyVersion: string;
  readonly policyDigest: string;
  readonly lockStateDigest: string;
  readonly authority: WorkspaceAvailabilityAuthority;
  readonly lease: DurableSupervisorLeasePort;
  readonly runtime: WakeRuntimePort;
  readonly lifecycle?: WakeLifecyclePort;
  readonly maximumMailboxSize?: number;
}

export function createWakeSupervisor(input: CreateWakeSupervisorInput): WakeSupervisor {
  const mailbox = new Set<string>();
  const maximumMailboxSize = input.maximumMailboxSize ?? 64;
  let inFlight: Promise<WakeSupervisorCommandResultDto> | undefined;
  let supervisorState: WakeSupervisorState = "initializing";
  let workspaceState: WorkspaceAvailabilityState = "verifying";
  let diagnostics: readonly WakeHealthDiagnosticDto[] = [];
  let intakeClosed = false;

  return Object.freeze({
    async signal(rawSignal: WakeSignal) {
      const signal = parseWakeSignal(rawSignal);
      if (intakeClosed) return blockedStatus();
      const key = `${signal.source}\u0000${signal.idempotencyKey}`;
      if (mailbox.has(key) && inFlight !== undefined) return await inFlight;
      if (mailbox.size >= maximumMailboxSize) {
        supervisorState = "degraded";
        diagnostics = Object.freeze([{ category: "wake-failed" }]);
        return blockedStatus();
      }
      mailbox.add(key);
      const current = admitAndWake(signal);
      inFlight = current;
      try {
        return await current;
      } finally {
        mailbox.delete(key);
        if (inFlight === current) inFlight = undefined;
      }
    },
    async pause(command: WakeCommandInput) {
      const safeCommand = parseWakeCommand(command);
      intakeClosed = true;
      supervisorState = "pause-pending";
      if (input.lifecycle === undefined) return blockedStatus();
      const readback = await input.lifecycle.pauseAndReadBack({ command: safeCommand, residentId: input.residentId, supervisorEpoch: input.supervisorEpoch });
      if (!readback.ok) {
        supervisorState = "workspace-unavailable";
        workspaceState = "unavailable";
        diagnostics = Object.freeze([{ category: "workspace-readback-failed" }]);
        return blockedStatus();
      }
      supervisorState = "paused";
      return acceptedStatus();
    },
    async status() {
      return currentStatus();
    }
  });

  async function admitAndWake(signal: WakeSignal): Promise<WakeSupervisorCommandResultDto> {
    const authorityResult = await input.authority.revalidate({ operation: "wake", workspaceId: input.workspaceId });
    if (!authorityResult.ok) {
      supervisorState = "workspace-unavailable";
      workspaceState = authorityResult.category === "workspace-identity-mismatch" ? "identity-mismatch" : "unavailable";
      diagnostics = Object.freeze([{ category: authorityResult.category }]);
      return blockedStatus();
    }
    const admission = freezeAdmission(authorityResult.admission);
    const lease = await input.lease.readOrAcquire({
      admission,
      residentId: input.residentId,
      supervisorEpoch: input.supervisorEpoch,
      policyVersion: input.policyVersion,
      policyDigest: input.policyDigest
    });
    if (lease.outcome === "supervisor-lease-held") {
      supervisorState = "running";
      workspaceState = "available";
      diagnostics = Object.freeze([{ category: "supervisor-lease-held" }]);
      return blockedStatus();
    }
    if (!matchesAdmission(lease.readback, admission, input)) {
      supervisorState = "workspace-unavailable";
      workspaceState = "stale";
      diagnostics = Object.freeze([{ category: "admission-mismatch" }]);
      return blockedStatus();
    }
    supervisorState = "running";
    workspaceState = "available";
    diagnostics = Object.freeze([]);
    try {
      await input.runtime.wakeOnce({ admission, signal, cancellation: new AbortController().signal });
      return acceptedStatus();
    } catch {
      supervisorState = "degraded";
      diagnostics = Object.freeze([{ category: "wake-failed" }]);
      return blockedStatus();
    }
  }

  function currentStatus(): WakeStatusDto {
    return Object.freeze({ schemaVersion: "wake-status.v1", supervisorState, workspaceState, diagnostics });
  }

  function acceptedStatus(): WakeSupervisorCommandResultDto {
    return Object.freeze({ outcome: "accepted", status: currentStatus() });
  }

  function blockedStatus(): WakeSupervisorCommandResultDto {
    return Object.freeze({ outcome: "blocked", status: currentStatus() });
  }
}

export function parseWakeSignal(value: unknown): WakeSignal {
  const record = plainDataRecord(value, "wake signal");
  requireOnlyKeys(record, ["source", "idempotencyKey", "sourceEventIds", "requestedAt"], "wake signal");
  if (!isWakeSource(record.source) || typeof record.idempotencyKey !== "string" || record.idempotencyKey.length === 0) {
    throw new Error("wake signal must have a finite source and idempotency key.");
  }
  const sourceEventIds = record.sourceEventIds === undefined ? undefined : parseStringArray(record.sourceEventIds, "wake signal source event ids");
  if (record.requestedAt !== undefined && typeof record.requestedAt !== "string") throw new Error("wake signal requestedAt must be a string.");
  return Object.freeze({ source: record.source, idempotencyKey: record.idempotencyKey, ...(sourceEventIds === undefined ? {} : { sourceEventIds }), ...(record.requestedAt === undefined ? {} : { requestedAt: record.requestedAt }) });
}

export function parseWakeHealthDiagnostic(value: unknown): WakeHealthDiagnosticDto {
  const record = plainDataRecord(value, "wake health diagnostic");
  requireOnlyKeys(record, ["category"], "wake health diagnostic");
  if (!isDiagnosticCategory(record.category)) throw new Error("wake health diagnostic category must be canonical.");
  return Object.freeze({ category: record.category });
}

export function parseWakeCommand(value: unknown): WakeCommandInput {
  const record = plainDataRecord(value, "wake command");
  requireOnlyKeys(record, ["commandId"], "wake command");
  if (typeof record.commandId !== "string" || record.commandId.length === 0) throw new Error("wake command id must be a non-empty string.");
  return Object.freeze({ commandId: record.commandId });
}

function freezeAdmission(value: WorkspaceAdmissionSnapshot): WorkspaceAdmissionSnapshot {
  const identity = value.identityAndMount;
  return Object.freeze({ identityAndMount: Object.freeze({ ...identity }) });
}

function matchesAdmission(readback: SupervisorLeaseReadbackEvidence, admission: WorkspaceAdmissionSnapshot, input: CreateWakeSupervisorInput): boolean {
  const identity = admission.identityAndMount;
  return readback.workspaceId === identity.workspaceId && readback.residentId === identity.residentId &&
    readback.supervisorEpoch === identity.supervisorEpoch && readback.workspaceIdentityEventId === identity.workspaceIdentityEventId &&
    readback.mountEvidenceId === identity.mountEvidenceId && readback.authorityEvidenceId === identity.authorityEvidenceId &&
    readback.policyVersion === input.policyVersion && readback.policyDigest === input.policyDigest && readback.lockStateDigest === input.lockStateDigest;
}

function plainDataRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || Object.getOwnPropertySymbols(value).length > 0) throw new Error(`${label} must be a plain data object.`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const [key, descriptor] of Object.entries(descriptors)) if (descriptor.get !== undefined || descriptor.set !== undefined) throw new Error(`${label}.${key} must not be an accessor.`);
  return value as Record<string, unknown>;
}

function requireOnlyKeys(record: Record<string, unknown>, allowed: readonly string[], label: string): void {
  for (const key of Object.keys(record)) if (!allowed.includes(key)) throw new Error(`${label} has an unsupported key.`);
}

function parseStringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length > 0 || Object.keys(value).length !== value.length) throw new Error(`${label} must be a dense plain array.`);
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) if (descriptor.get !== undefined || descriptor.set !== undefined) throw new Error(`${label} must not contain accessors.`);
  if (!value.every((item) => typeof item === "string")) throw new Error(`${label} must contain only strings.`);
  return Object.freeze([...value]);
}

function isWakeSource(value: unknown): value is WakeSource { return value === "startup" || value === "poll" || value === "event" || value === "command" || value === "recovery"; }
function isDiagnosticCategory(value: unknown): value is WakeHealthDiagnosticDto["category"] { return value === "supervisor-lease-held" || value === "workspace-unavailable" || value === "workspace-identity-mismatch" || value === "workspace-readback-failed" || value === "admission-mismatch" || value === "wake-failed"; }
