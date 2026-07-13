import { describe, expect, it } from "vitest";
import type { KnowledgeEventOf } from "../../ontology/src/contracts.js";
import {
  buildTriggerGateKey,
  deriveAdmissionScope,
  deriveTriggerRequestIdentity,
  type MountedTriggerPolicy
} from "../src/proactive-triggers.js";
import { buildTriggerRequestProjection, type TriggerPolicyReadback } from "../src/trigger-projection.js";

const hash = (letter: string): `sha256:${string}` => `sha256:${letter.repeat(64)}`;

const policy: MountedTriggerPolicy = {
  policyVersion: "1",
  policyArtifactHash: hash("c"),
  cooldownMs: 0,
  maxRequests: 8,
  budgetWindowMs: 86_400_000,
  subjectScope: "none",
  sourcePartition: "prr",
  cooldownScopeSelector: "workspace-trigger",
  budgetScopeSelector: "workspace-trigger"
};

function requestEvent(
  sequence = 4,
  overrides: Record<string, unknown> = {}
): KnowledgeEventOf<"agent.trigger.requested.v1"> {
  const source = {
    sourceEventId: `evt_projection_source_${sequence}`,
    sourceStreamId: "projection_source_stream",
    sourceSequence: sequence,
    sourceKind: "prr",
    contentHash: hash(sequence === 4 ? "e" : "f"),
    observedAt: "2026-07-13T00:00:00.000Z"
  };
  const request = {
    descriptor: {
      descriptorVersion: "resident-trigger-descriptor.v1" as const,
      triggerId: "trigger_prr_monitor",
      triggerFamily: "prr-monitoring" as const,
      descriptorRevision: "1",
      requestedRunType: "prr-negotiation",
      policyRef: { policyVersion: "1", policyArtifactHash: hash("c") },
      allowedSourceKinds: ["prr"]
    },
    workspaceId: "ws_trigger_projection",
    residentAgentId: "agent_default" as const,
    triggerId: "trigger_prr_monitor",
    subjectRef: { kind: "prr-request", id: "prr_projection" },
    policyVersion: "1",
    policyArtifactHash: hash("c"),
    sourceRefs: [source],
    requestedRunType: "prr-negotiation"
  };
  const sourceHighWaterMark = {
    workspaceId: "ws_trigger_projection",
    triggerId: "trigger_prr_monitor",
    policyVersion: "1",
    sourcePartition: "prr",
    sourceStreamId: source.sourceStreamId,
    sourceSequence: source.sourceSequence,
    sourceEventId: source.sourceEventId
  };
  const verifiedRequest = {
    ...request,
    sourceHighWaterMark,
    workspaceIdentityEventId: "evt_workspace_identity",
    mountInstanceId: "mount_projection",
    mountHash: hash("9"),
    lockHash: hash("0"),
    causationId: source.sourceEventId
  };
  const admissionScope = deriveAdmissionScope(policy, verifiedRequest);
  const identity = deriveTriggerRequestIdentity(verifiedRequest);
  const payload = {
    requestId: identity.requestId,
    dedupeKey: identity.dedupeKey,
    requestFingerprint: identity.requestFingerprint,
    admissionScope,
    triggerGateKey: buildTriggerGateKey(admissionScope),
    residentAgentId: "agent_default",
    workspaceId: "ws_trigger_projection",
    triggerId: "trigger_prr_monitor",
    triggerFamily: "prr-monitoring",
    policyVersion: "1",
    policyArtifactHash: hash("c"),
    subjectRef: request.subjectRef,
    sourceRefs: [source],
    sourceHighWaterMark,
    requestedRunType: "prr-negotiation",
    provenance: {
      descriptorRevision: "1",
      policyVersion: "1",
      policyArtifactHash: hash("c"),
      workspaceIdentityEventId: "evt_workspace_identity",
      mountInstanceId: "mount_projection",
      mountHash: hash("9"),
      lockHash: hash("0"),
      evaluationSourceEventIds: [source.sourceEventId],
      causationId: source.sourceEventId,
      correlationId: identity.requestId
    }
  };
  const event = {
    id: `evt_trigger_projection_${sequence}`,
    type: "agent.trigger.requested.v1",
    version: 1,
    streamId: "agent_trigger_ws_trigger_projection_trigger_prr_monitor",
    sequence,
    context: {
      actor: { id: "agent_default", kind: "agent", label: "Resident" },
      occurredAt: "2026-07-13T00:00:00.000Z",
      causationId: source.sourceEventId,
      correlationId: identity.requestId,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", agent: "0.1.0" }
    },
    payload
  };
  return {
    ...event,
    ...overrides,
    payload: { ...payload, ...(overrides.payload as Record<string, unknown> | undefined) }
  } as KnowledgeEventOf<"agent.trigger.requested.v1">;
}

function policyReadback(overrides: Record<string, unknown> = {}): TriggerPolicyReadback {
  return {
    readPolicy: () => policy,
    verifyAuthority: () => true,
    verifySource: () => true,
    ...overrides
  } as TriggerPolicyReadback;
}

describe("trigger request projection", () => {
  it("replays exact requested records and orders high-water by source sequence then event ID", () => {
    const replayed = buildTriggerRequestProjection([requestEvent(5), requestEvent(4)], policyReadback());
    expect(replayed).toMatchObject({ state: "ready" });
    expect(replayed.records.map((record) => record.eventId)).toEqual([
      "evt_trigger_projection_4",
      "evt_trigger_projection_5"
    ]);
    expect(replayed.highWater).toEqual([{
      workspaceId: "ws_trigger_projection",
      triggerId: "trigger_prr_monitor",
      policyVersion: "1",
      sourcePartition: "prr",
      sourceStreamId: "projection_source_stream",
      sourceSequence: 5,
      sourceEventId: "evt_projection_source_5"
    }]);
  });

  it("replays an exact duplicate without a second trusted request record", () => {
    const first = requestEvent(4);
    const duplicate = requestEvent(5, {
      context: { ...first.context },
      payload: {
        ...first.payload,
        sourceRefs: first.payload.sourceRefs,
        sourceHighWaterMark: first.payload.sourceHighWaterMark,
        provenance: { ...first.payload.provenance },
        requestId: first.payload.requestId,
        requestFingerprint: first.payload.requestFingerprint,
        dedupeKey: first.payload.dedupeKey
      }
    });
    const replayed = buildTriggerRequestProjection([first, duplicate], policyReadback());
    expect(replayed).toMatchObject({ state: "ready" });
    expect(replayed.records).toHaveLength(1);
    expect(replayed.highWater).toHaveLength(1);
  });

  it("fails closed on replayed cooldown and budget violations", () => {
    for (const replayPolicy of [{ ...policy, cooldownMs: 60_000 }, { ...policy, maxRequests: 1 }]) {
      const projection = buildTriggerRequestProjection([requestEvent(4), requestEvent(5)], policyReadback({ readPolicy: () => replayPolicy }));
      expect(projection).toMatchObject({ state: "blocked" });
      expect(projection.records).toEqual([]);
      expect(projection.highWater).toEqual([]);
    }
  });

  it("excludes stale source, swapped content, policy, mount, and lock records", () => {
    const event = requestEvent(4);
    for (const reader of [
      policyReadback({ verifySource: () => false }),
      policyReadback({ readPolicy: () => undefined }),
      policyReadback({ verifyAuthority: () => false }),
      policyReadback({ verifyAuthority: () => false, verifySource: () => false })
    ]) {
      const projection = buildTriggerRequestProjection([event], reader);
      expect(projection.records).toEqual([]);
      expect(projection.highWater).toEqual([]);
      expect(projection.diagnostics[0]).toMatchObject({ category: expect.any(String) });
      expect(JSON.stringify(projection.diagnostics)).not.toContain("unsafe");
    }
  });

  it("rejects same-dedupe different-fingerprint and altered persisted scope or gate key", () => {
    const event = requestEvent(4);
    const conflict = requestEvent(5, {
      context: { ...event.context, correlationId: "trq_conflicting" },
      payload: {
        ...event.payload,
        requestFingerprint: hash("9"),
        requestId: "trq_conflicting",
        provenance: { ...event.payload.provenance, correlationId: "trq_conflicting" }
      }
    });
    const alteredScope = requestEvent(4, {
      payload: {
        ...event.payload,
        admissionScope: { ...event.payload.admissionScope, policySourcePartition: "caller-controlled" }
      }
    });
    const alteredGate = requestEvent(4, { payload: { ...event.payload, triggerGateKey: hash("8") } });
    for (const events of [[event, conflict], [alteredScope], [alteredGate]]) {
      const projection = buildTriggerRequestProjection(events, policyReadback());
      expect(projection).toMatchObject({ state: "blocked" });
      expect(projection.records).toEqual([]);
      expect(projection.highWater).toEqual([]);
      expect(projection.diagnostics.some((diagnostic) => diagnostic.category === "invalid-scope" || diagnostic.category === "dedupe-conflict")).toBe(true);
    }
  });

  it("rebuilds the same trusted high-water after restart from immutable event replay", () => {
    const events = [requestEvent(4), requestEvent(5)];
    const first = buildTriggerRequestProjection(events, policyReadback());
    const afterRestart = buildTriggerRequestProjection(JSON.parse(JSON.stringify(events)), policyReadback());
    expect(afterRestart).toEqual(first);
  });
});
