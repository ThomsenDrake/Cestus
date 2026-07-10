import type { ActorRef, AppendableKnowledgeEvent, KnowledgeEvent } from "../../ontology/src/contracts.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";
import { approvedAgentSpecialistRunTypes } from "./specialists.js";

export const defaultResidentAgentId = "agent_default" as const;
export const defaultResidentIdentityStreamId = "agent_identity_agent_default" as const;
export const defaultResidentLabel = "Cestus Agent" as const;
export const defaultAgentPolicyId = "agent_policy_default" as const;
export const defaultMemoryProjectionVersion = "0.1.0" as const;

export type ResidentIdentityLifecycleState = "not-mounted" | "initializing" | "ready" | "blocked";

export interface ResidentIdentityLifecycleDto {
  readonly schemaVersion: "resident-identity-lifecycle.v1";
  readonly state: ResidentIdentityLifecycleState;
  readonly residentAgentId: typeof defaultResidentAgentId;
  readonly workspaceId?: string | undefined;
  readonly initialized: boolean;
  readonly eventIds: readonly string[];
  readonly safeMessage: string;
  readonly allowedRepairActions: readonly string[];
}

export interface BlockedResidentIdentityLifecycleInput {
  readonly workspaceId?: string | undefined;
  readonly initialized?: boolean;
  readonly eventIds?: readonly string[];
  readonly safeMessage: string;
  readonly allowedRepairActions: readonly string[];
}

export interface EnsureDefaultResidentIdentityInput {
  readonly ledger: EventLedger;
  readonly actor: ActorRef;
  readonly now: () => string;
  readonly workspaceId: string;
}

export interface ReadDefaultResidentIdentityLifecycleInput {
  readonly ledger: EventLedger;
  readonly workspaceId: string;
}

export function blockedResidentIdentityLifecycle(
  input: BlockedResidentIdentityLifecycleInput
): ResidentIdentityLifecycleDto {
  return Object.freeze({
    schemaVersion: "resident-identity-lifecycle.v1",
    state: "blocked",
    residentAgentId: defaultResidentAgentId,
    ...(input.workspaceId === undefined ? {} : { workspaceId: input.workspaceId }),
    initialized: input.initialized ?? false,
    eventIds: Object.freeze([...(input.eventIds ?? [])]),
    safeMessage: input.safeMessage,
    allowedRepairActions: Object.freeze([...input.allowedRepairActions])
  });
}

export function notMountedResidentIdentityLifecycle(): ResidentIdentityLifecycleDto {
  return residentIdentityLifecycle("not-mounted", false, [], "Resident identity is not mounted.", [
    "mount a workspace before initializing the resident identity"
  ]);
}

export function initializingResidentIdentityLifecycle(workspaceId: string): ResidentIdentityLifecycleDto {
  return residentIdentityLifecycle("initializing", false, [], "Resident identity initialization is in progress.", [], workspaceId);
}

export async function ensureDefaultResidentIdentity(
  input: EnsureDefaultResidentIdentityInput
): Promise<ResidentIdentityLifecycleDto> {
  const lifecycle = await readDefaultResidentIdentityLifecycle(input);
  if (lifecycle.state !== "not-mounted") {
    return lifecycle;
  }

  try {
    await input.ledger.append(identityInitializationEvent(input), { expectedNextSequence: 1 });
  } catch (error) {
    if (!isConcurrencyConflict(error)) {
      return blockedResidentIdentityLifecycle({
        workspaceId: input.workspaceId,
        safeMessage: "Resident identity bootstrap could not be initialized safely.",
        allowedRepairActions: ["inspect resident identity events before retrying"]
      });
    }
  }

  return readDefaultResidentIdentityLifecycle(input);
}

export async function readDefaultResidentIdentityLifecycle(
  input: ReadDefaultResidentIdentityLifecycleInput
): Promise<ResidentIdentityLifecycleDto> {
  let events: readonly KnowledgeEvent[];

  try {
    events = await input.ledger.readStream(defaultResidentIdentityStreamId);
  } catch {
    return blockedResidentIdentityLifecycle({
      workspaceId: input.workspaceId,
      safeMessage: "Resident identity stream could not be read safely.",
      allowedRepairActions: ["inspect resident identity events before retrying"]
    });
  }

  if (events.length === 0) {
    return notMountedResidentIdentityLifecycle();
  }

  if (events.some((event) => event.type !== "agent.identity.initialized" && event.type !== "agent.identity.updated")) {
    return blockedResidentIdentityLifecycle({
      workspaceId: input.workspaceId,
      eventIds: events.map((event) => event.id),
      safeMessage: "Resident identity stream contains unsupported events.",
      allowedRepairActions: ["inspect resident identity events before retrying"]
    });
  }

  const initializationEvents = events.filter(
    (event): event is Extract<KnowledgeEvent, { type: "agent.identity.initialized" }> =>
      event.type === "agent.identity.initialized"
  );

  if (initializationEvents.length !== 1) {
    return blockedResidentIdentityLifecycle({
      workspaceId: input.workspaceId,
      eventIds: initializationEvents.map((event) => event.id),
      safeMessage: "Resident identity bootstrap is blocked by duplicate initialization events.",
      allowedRepairActions: ["inspect resident identity events before retrying"]
    });
  }

  const initializationEvent = initializationEvents[0];
  if (
    initializationEvent === undefined ||
    initializationEvent.payload.residentAgentId !== defaultResidentAgentId
  ) {
    return blockedResidentIdentityLifecycle({
      workspaceId: input.workspaceId,
      eventIds: initializationEvents.map((event) => event.id),
      safeMessage: "Resident identity stream contains an unexpected resident identity.",
      allowedRepairActions: ["inspect resident identity events before retrying"]
    });
  }

  if (initializationEvent.payload.workspaceId !== input.workspaceId) {
    return blockedResidentIdentityLifecycle({
      workspaceId: input.workspaceId,
      initialized: true,
      eventIds: [initializationEvent.id],
      safeMessage: "Resident identity belongs to a different workspace.",
      allowedRepairActions: ["inspect resident identity events before retrying"]
    });
  }

  return residentIdentityLifecycle(
    "ready",
    true,
    [initializationEvent.id],
    "Resident identity is ready.",
    [],
    input.workspaceId
  );
}

function identityInitializationEvent(
  input: EnsureDefaultResidentIdentityInput
): AppendableKnowledgeEvent<"agent.identity.initialized"> {
  return {
    type: "agent.identity.initialized",
    version: 1,
    streamId: defaultResidentIdentityStreamId,
    context: {
      actor: input.actor,
      occurredAt: input.now(),
      correlationId: "corr_agent_default",
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", agent: "0.1.0" }
    },
    payload: {
      residentAgentId: defaultResidentAgentId,
      workspaceId: input.workspaceId,
      label: defaultResidentLabel,
      policyId: defaultAgentPolicyId,
      initializedBy: input.actor.id,
      allowedRunTypes: [...approvedAgentSpecialistRunTypes],
      memoryProjectionVersion: defaultMemoryProjectionVersion
    }
  };
}

function residentIdentityLifecycle(
  state: Exclude<ResidentIdentityLifecycleState, "blocked">,
  initialized: boolean,
  eventIds: readonly string[],
  safeMessage: string,
  allowedRepairActions: readonly string[],
  workspaceId?: string
): ResidentIdentityLifecycleDto {
  return Object.freeze({
    schemaVersion: "resident-identity-lifecycle.v1",
    state,
    residentAgentId: defaultResidentAgentId,
    ...(workspaceId === undefined ? {} : { workspaceId }),
    initialized,
    eventIds: Object.freeze([...eventIds]),
    safeMessage,
    allowedRepairActions: Object.freeze([...allowedRepairActions])
  });
}

function isConcurrencyConflict(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith("Concurrency conflict");
}
