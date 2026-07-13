import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eventContracts, validateKnowledgeEvent } from "../src/contracts.js";

const hash = (letter: string): `sha256:${string}` => `sha256:${letter.repeat(64)}`;

function canonicalJson(value: Record<string, unknown>): string {
  const serialize = (item: unknown): string => {
    if (item === null || typeof item === "boolean" || typeof item === "number" || typeof item === "string") return JSON.stringify(item);
    if (Array.isArray(item)) return `[${item.map(serialize).join(",")}]`;
    const record = item as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${serialize(record[key])}`).join(",")}}`;
  };
  return serialize(value);
}

function sha256(value: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function requestIdFor(fingerprint: `sha256:${string}`): string {
  const bytes = Buffer.from(fingerprint.slice("sha256:".length), "hex");
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return `trq_${output}`;
}

function triggerRequestedEvent(overrides: Record<string, unknown> = {}) {
  const persisted = {
    admissionScope: {
      admissionScopeVersion: "resident-trigger-admission-scope.v1",
      workspaceId: "ws_trigger_contracts",
      residentAgentId: "agent_default",
      triggerId: "trigger_prr_monitor",
      policyVersion: "1",
      policyArtifactHash: hash("c"),
      cooldownScopeSelector: "workspace-trigger",
      budgetScopeSelector: "workspace-trigger",
      policySubjectScope: "none",
      policySourcePartition: "prr"
    },
    triggerGateKey: hash("d"),
    residentAgentId: "agent_default",
    workspaceId: "ws_trigger_contracts",
    triggerId: "trigger_prr_monitor",
    triggerFamily: "prr-monitoring",
    policyVersion: "1",
    policyArtifactHash: hash("c"),
    subjectRef: { kind: "prr-request", id: "prr_contracts" },
    sourceRefs: [{
      sourceEventId: "evt_source_contracts",
      sourceStreamId: "prr_contracts",
      sourceSequence: 4,
      sourceKind: "prr",
      contentHash: hash("e"),
      observedAt: "2026-07-13T00:00:00.000Z"
    }],
    sourceHighWaterMark: {
      workspaceId: "ws_trigger_contracts",
      triggerId: "trigger_prr_monitor",
      policyVersion: "1",
      sourcePartition: "prr",
      sourceStreamId: "prr_contracts",
      sourceSequence: 4,
      sourceEventId: "evt_source_contracts"
    },
    requestedRunType: "prr-negotiation",
    provenance: {
      descriptorRevision: "1",
      policyVersion: "1",
      policyArtifactHash: hash("c"),
      workspaceIdentityEventId: "evt_workspace_identity",
      mountInstanceId: "mount_contracts",
      mountHash: hash("f"),
      lockHash: hash("0"),
      evaluationSourceEventIds: ["evt_source_contracts"],
      causationId: "evt_source_contracts",
      correlationId: "pending"
    }
  };
  const requestFingerprint = sha256(canonicalJson({
    fingerprintVersion: "resident-trigger-request-fingerprint.v1",
    residentAgentId: persisted.residentAgentId,
    workspaceId: persisted.workspaceId,
    triggerId: persisted.triggerId,
    triggerFamily: persisted.triggerFamily,
    descriptorRevision: persisted.provenance.descriptorRevision,
    policyVersion: persisted.policyVersion,
    policyArtifactHash: persisted.policyArtifactHash,
    subjectRef: persisted.subjectRef,
    requestedRunType: persisted.requestedRunType,
    sourceRefs: persisted.sourceRefs,
    sourceHighWaterMark: persisted.sourceHighWaterMark,
    workspaceIdentityEventId: persisted.provenance.workspaceIdentityEventId,
    causationId: persisted.provenance.causationId
  }));
  const requestId = requestIdFor(requestFingerprint);
  const payload = {
    requestId,
    dedupeKey: sha256(canonicalJson({ dedupeVersion: "resident-trigger-dedupe.v1", requestFingerprint })),
    requestFingerprint,
    ...persisted,
    provenance: { ...persisted.provenance, correlationId: requestId }
  };
  const event = {
    id: "evt_trigger_contracts",
    type: "agent.trigger.requested.v1",
    version: 1,
    streamId: "agent_trigger_ws_trigger_contracts_trigger_prr_monitor",
    sequence: 1,
    context: {
      actor: { id: "agent_default", kind: "agent", label: "Resident" },
      occurredAt: "2026-07-13T00:00:00.000Z",
      causationId: "evt_source_contracts",
      correlationId: requestId,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", agent: "0.1.0" }
    },
    payload
  };
  return { ...event, ...overrides, payload: { ...payload, ...(overrides.payload as Record<string, unknown> | undefined) } };
}

describe("agent.trigger.requested.v1", () => {
  it("registers the canonical provenance-bound trigger request contract", () => {
    expect(eventContracts["agent.trigger.requested.v1"]).toMatchObject({
      type: "agent.trigger.requested.v1",
      version: 1
    });
    expect(validateKnowledgeEvent(triggerRequestedEvent())).toMatchObject({ success: true });
  });

  it("accepts one complete provenance-bound request and rejects widened payloads", () => {
    expect(validateKnowledgeEvent(triggerRequestedEvent())).toMatchObject({ success: true });
    expect(validateKnowledgeEvent(triggerRequestedEvent({
      payload: { ...triggerRequestedEvent().payload, residentAgentId: "agent_other" }
    }))).toMatchObject({ success: false });
    for (const field of ["inputText", "providerId", "modelId", "approvalId", "handoffId", "taskId", "schedulerId", "sourceBytes", "rawBytes"]) {
      expect(validateKnowledgeEvent(triggerRequestedEvent({
        payload: { ...triggerRequestedEvent().payload, [field]: "unsafe" }
      }))).toMatchObject({ success: false });
    }
  });

  it("rejects unsorted, stale, and authority-mismatched persisted bindings", () => {
    const valid = triggerRequestedEvent();
    expect(validateKnowledgeEvent({
      ...valid,
      payload: { ...valid.payload, sourceRefs: [...valid.payload.sourceRefs].reverse() }
    })).toMatchObject({ success: true });
    expect(validateKnowledgeEvent({
      ...valid,
      payload: {
        ...valid.payload,
        provenance: { ...valid.payload.provenance, mountHash: hash("a") }
      }
    })).toMatchObject({ success: true });
    expect(validateKnowledgeEvent({
      ...valid,
      payload: {
        ...valid.payload,
        sourceHighWaterMark: { ...valid.payload.sourceHighWaterMark, sourceEventId: "evt_other_source" }
      }
    })).toMatchObject({ success: false });
  });

  it("rejects forged deterministic request fingerprints, request IDs, and dedupe keys", () => {
    const valid = triggerRequestedEvent();
    const forgedRequestId = "trq_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    for (const payload of [
      { ...valid.payload, requestFingerprint: hash("9") },
      {
        ...valid.payload,
        requestId: forgedRequestId,
        provenance: { ...valid.payload.provenance, correlationId: forgedRequestId }
      },
      { ...valid.payload, dedupeKey: hash("8") }
    ]) {
      expect(validateKnowledgeEvent({
        ...valid,
        context: { ...valid.context, correlationId: payload.provenance.correlationId },
        payload
      })).toMatchObject({ success: false });
    }
  });
});
