/**
 * The V2 handoff binding is durable data.  The witness carrying it is not:
 * membership in this module's WeakMap is the only authority to use it.
 */
import { approvedAgentSpecialistRunTypes, type AgentSpecialistRunType } from "./specialists.js";

export interface HandoffAuthorityBinding {
  readonly workspaceIdentityHash: `sha256:${string}`;
  readonly mountGeneration: string;
  readonly ledgerStoreIdentity: string;
  readonly artifactStoreIdentity: string;
  readonly ledgerHighWaterEventId: string;
  readonly policyHash: `sha256:${string}`;
  readonly activeLocksHash: `sha256:${string}`;
}

declare const mountedSpecialistHandoffAuthorityWitnessBrand: unique symbol;

export interface MountedSpecialistHandoffAuthorityWitness {
  readonly [mountedSpecialistHandoffAuthorityWitnessBrand]: "agent-mounted-specialist-handoff-authority.v1";
  readonly schemaVersion: "agent-mounted-specialist-handoff-authority.v1";
}

interface MountedSpecialistHandoffTaskLifecycle {
  readonly taskId: string;
  readonly attemptId: string;
  readonly runId: string;
  readonly runType: AgentSpecialistRunType;
  readonly retryGeneration: number;
}

export interface ConsumedMountedSpecialistHandoffAuthorityWitness {
  readonly binding: HandoffAuthorityBinding;
  readonly taskLifecycle: MountedSpecialistHandoffTaskLifecycle;
  readonly revalidateCurrent: () => Promise<void>;
}

interface WitnessState {
  readonly binding: HandoffAuthorityBinding;
  readonly taskLifecycle: MountedSpecialistHandoffTaskLifecycle;
  readonly revalidate: () => Promise<void>;
  state: "available" | "consuming" | "consumed";
}

const witnessStates = new WeakMap<object, WitnessState>();

/**
 * This issuer is intentionally not re-exported through the agent barrel. The
 * portable mounted-store producer is the only production caller.
 */
export function issueMountedSpecialistHandoffAuthorityWitness(input: {
  readonly authorityBinding: HandoffAuthorityBinding;
  readonly taskLifecycle: {
    readonly taskId: string;
    readonly attemptId: string;
    readonly runId: string;
    readonly runType: string;
    readonly retryGeneration: number;
  };
  readonly revalidateCurrent: () => Promise<void>;
}): MountedSpecialistHandoffAuthorityWitness {
  const values = exactOwnDataRecord(input, ["authorityBinding", "taskLifecycle", "revalidateCurrent"]);
  if (typeof values.revalidateCurrent !== "function") throw authorityError();
  const binding = normalizeBinding(values.authorityBinding);
  const taskLifecycle = normalizeTaskLifecycle(values.taskLifecycle);
  const witness = Object.freeze({
    schemaVersion: "agent-mounted-specialist-handoff-authority.v1" as const
  }) as MountedSpecialistHandoffAuthorityWitness;
  witnessStates.set(witness, {
    binding,
    taskLifecycle,
    revalidate: async () => {
      try {
        await (values.revalidateCurrent as () => Promise<void>)();
      } catch {
        throw authorityError();
      }
    },
    state: "available"
  });
  return witness;
}

/** Consumes exactly one factory-issued authority witness. */
export async function consumeMountedSpecialistHandoffAuthorityWitness(
  witness: unknown
): Promise<ConsumedMountedSpecialistHandoffAuthorityWitness> {
  if (typeof witness !== "object" || witness === null) throw authorityError();
  const state = witnessStates.get(witness);
  if (state === undefined) throw authorityError();
  if (state.state !== "available") throw consumedError();
  state.state = "consuming";
  try {
    await state.revalidate();
    const binding = state.binding;
    return Object.freeze({
      binding,
      taskLifecycle: state.taskLifecycle,
      revalidateCurrent: async () => await state.revalidate()
    });
  } finally {
    state.state = "consumed";
  }
}

/**
 * Verifies one factory-issued witness for an exact lifecycle binding without
 * consuming it. The later V2 recorder remains the sole one-shot consumer.
 */
export async function preflightMountedSpecialistHandoffAuthorityWitness(input: unknown): Promise<void> {
  let state: WitnessState | undefined;
  try {
    const values = exactOwnDataRecord(input, [
      "witness",
      "taskId",
      "attemptId",
      "runId",
      "runType",
      "retryGeneration"
    ]);
    if (typeof values.witness !== "object" || values.witness === null) throw authorityError();
    state = witnessStates.get(values.witness);
    if (state === undefined || state.state !== "available") throw authorityError();
    const expected = normalizeTaskLifecycle({
      taskId: values.taskId,
      attemptId: values.attemptId,
      runId: values.runId,
      runType: values.runType,
      retryGeneration: values.retryGeneration
    });
    if (!sameTaskLifecycle(state.taskLifecycle, expected) || !sameBinding(state.binding, normalizeBinding(state.binding))) {
      throw authorityError();
    }
    await state.revalidate();
    if (state.state !== "available") throw authorityError();
  } catch {
    if (state?.state === "available") state.state = "consumed";
    throw authorityError();
  }
}

function normalizeTaskLifecycle(value: unknown): MountedSpecialistHandoffTaskLifecycle {
  const record = exactOwnDataRecord(value, ["taskId", "attemptId", "runId", "runType", "retryGeneration"]);
  const retryGeneration = record.retryGeneration;
  if (typeof retryGeneration !== "number" || !Number.isSafeInteger(retryGeneration) || retryGeneration < 0) {
    throw authorityError();
  }
  return Object.freeze({
    taskId: text(record.taskId),
    attemptId: text(record.attemptId),
    runId: text(record.runId),
    runType: agentSpecialistRunType(record.runType),
    retryGeneration
  });
}

function agentSpecialistRunType(value: unknown): AgentSpecialistRunType {
  if (typeof value !== "string" || !isAgentSpecialistRunType(value)) throw authorityError();
  return value;
}

function isAgentSpecialistRunType(value: string): value is AgentSpecialistRunType {
  return approvedAgentSpecialistRunTypes.some((candidate) => candidate === value);
}

function normalizeBinding(value: unknown): HandoffAuthorityBinding {
  const record = exactOwnDataRecord(value, [
    "workspaceIdentityHash",
    "mountGeneration",
    "ledgerStoreIdentity",
    "artifactStoreIdentity",
    "ledgerHighWaterEventId",
    "policyHash",
    "activeLocksHash"
  ]);
  const workspaceIdentityHash = hash(record.workspaceIdentityHash);
  const mountGeneration = text(record.mountGeneration);
  const ledgerStoreIdentity = text(record.ledgerStoreIdentity);
  const artifactStoreIdentity = text(record.artifactStoreIdentity);
  const ledgerHighWaterEventId = eventId(record.ledgerHighWaterEventId);
  const policyHash = hash(record.policyHash);
  const activeLocksHash = hash(record.activeLocksHash);
  return Object.freeze({
    workspaceIdentityHash,
    mountGeneration,
    ledgerStoreIdentity,
    artifactStoreIdentity,
    ledgerHighWaterEventId,
    policyHash,
    activeLocksHash
  });
}

function sameTaskLifecycle(
  left: MountedSpecialistHandoffTaskLifecycle,
  right: MountedSpecialistHandoffTaskLifecycle
): boolean {
  return left.taskId === right.taskId &&
    left.attemptId === right.attemptId &&
    left.runId === right.runId &&
    left.runType === right.runType &&
    left.retryGeneration === right.retryGeneration;
}

function sameBinding(left: HandoffAuthorityBinding, right: HandoffAuthorityBinding): boolean {
  return left.workspaceIdentityHash === right.workspaceIdentityHash &&
    left.mountGeneration === right.mountGeneration &&
    left.ledgerStoreIdentity === right.ledgerStoreIdentity &&
    left.artifactStoreIdentity === right.artifactStoreIdentity &&
    left.ledgerHighWaterEventId === right.ledgerHighWaterEventId &&
    left.policyHash === right.policyHash &&
    left.activeLocksHash === right.activeLocksHash;
}

function exactOwnDataRecord(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (
    typeof value !== "object" || value === null || Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) ||
    Object.getOwnPropertySymbols(value).length !== 0
  ) {
    throw authorityError();
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Object.keys(descriptors).sort();
  const expected = [...fields].sort();
  if (actual.length !== expected.length || actual.some((field, index) => field !== expected[index])) throw authorityError();
  const result: Record<string, unknown> = Object.create(null);
  for (const field of fields) {
    const descriptor = descriptors[field];
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) throw authorityError();
    result[field] = descriptor.value;
  }
  return Object.freeze(result);
}

function hash(value: unknown): `sha256:${string}` {
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value)) throw authorityError();
  return value as `sha256:${string}`;
}

function text(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw authorityError();
  return value;
}

function eventId(value: unknown): string {
  if (typeof value !== "string" || !/^evt_[a-zA-Z0-9_-]+$/.test(value)) throw authorityError();
  return value;
}

function authorityError(): Error {
  return new Error("Mounted specialist handoff authority is invalid.");
}

function consumedError(): Error {
  return new Error("Mounted specialist handoff authority is already consumed.");
}
