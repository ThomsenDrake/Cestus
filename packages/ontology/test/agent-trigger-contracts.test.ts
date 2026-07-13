import { describe, expect, it } from "vitest";
import { eventContracts, validateKnowledgeEvent } from "../src/contracts.js";

const hash = (letter: string): `sha256:${string}` => `sha256:${letter.repeat(64)}`;

function triggerRequestedEvent(overrides: Record<string, unknown> = {}) {
  const payload = {
    requestId: "trq_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    dedupeKey: hash("b"),
    requestFingerprint: hash("a"),
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
      correlationId: "trq_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    }
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
      correlationId: "trq_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
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
});
