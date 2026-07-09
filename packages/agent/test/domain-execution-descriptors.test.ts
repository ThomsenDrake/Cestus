import { describe, expect, it } from "vitest";
import type {
  AgentDomainPreview,
  AgentDomainToolDescriptor
} from "../src/domain-execution-descriptors.js";
import {
  createAgentDomainToolRegistry,
  hashAgentDomainPreview
} from "../src/domain-execution-descriptors.js";

describe("agent domain execution descriptors", () => {
  it("hashes semantic preview content with stable key ordering", () => {
    const left = hashAgentDomainPreview({
      schemaVersion: "agent-domain-preview.v1",
      toolRequestId: "toolreq_provider_transfer",
      toolId: "provider.bytes.transfer",
      toolVersion: "0.1.0",
      runId: "run_provider_transfer",
      taskId: "task_provider_transfer",
      residentAgentId: "agent_default",
      sideEffectClass: "external-byte-transfer",
      requiredApprovalClass: "provider-byte-transfer",
      targetDomainService: "ingestion.provider",
      inputSchemaId: "provider-bytes-transfer-input.v1",
      normalizedInputHash: hash("1"),
      summary: "Send selected evidence bytes to the configured provider.",
      scope: "Selected evidence for provider parsing.",
      estimatedEffect: "Provider receives the listed byte hashes after approval is consumed.",
      consequence: "The provider may process the listed evidence; no PRR, export, repair, or graph review occurs.",
      affectedRefs: [{ kind: "evidence", id: "ev_provider_001", hash: hash("2") }],
      expectedOutputs: [{ kind: "event", type: "ingestion.provider.approved" }],
      contextPackRefs: [],
      governancePolicyVersion: "policy_public_records_v1",
      lockSnapshot: [],
      projectionHighWaterMarks: [{ projectionName: "ingestion", highWaterMark: 12 }],
      idempotencyKey: "provider-bytes-transfer:provider_001",
      staleAfter: { kind: "source-hash-change", refs: ["ev_provider_001"] }
    });
    const right = hashAgentDomainPreview({
      schemaVersion: "agent-domain-preview.v1",
      staleAfter: { refs: ["ev_provider_001"], kind: "source-hash-change" },
      idempotencyKey: "provider-bytes-transfer:provider_001",
      projectionHighWaterMarks: [{ highWaterMark: 12, projectionName: "ingestion" }],
      lockSnapshot: [],
      governancePolicyVersion: "policy_public_records_v1",
      contextPackRefs: [],
      expectedOutputs: [{ type: "ingestion.provider.approved", kind: "event" }],
      affectedRefs: [{ hash: hash("2"), id: "ev_provider_001", kind: "evidence" }],
      consequence: "The provider may process the listed evidence; no PRR, export, repair, or graph review occurs.",
      estimatedEffect: "Provider receives the listed byte hashes after approval is consumed.",
      scope: "Selected evidence for provider parsing.",
      summary: "Send selected evidence bytes to the configured provider.",
      normalizedInputHash: hash("1"),
      inputSchemaId: "provider-bytes-transfer-input.v1",
      targetDomainService: "ingestion.provider",
      requiredApprovalClass: "provider-byte-transfer",
      sideEffectClass: "external-byte-transfer",
      residentAgentId: "agent_default",
      taskId: "task_provider_transfer",
      runId: "run_provider_transfer",
      toolVersion: "0.1.0",
      toolId: "provider.bytes.transfer",
      toolRequestId: "toolreq_provider_transfer"
    });

    expect(left).toBe(right);
  });

  it("looks up descriptors by toolId@toolVersion and freezes registry output", () => {
    const registry = createAgentDomainToolRegistry([baseDescriptor()]);

    const descriptor = registry.requireByKey("provider.bytes.transfer@0.1.0");
    const listed = registry.list();

    expect(descriptor.toolId).toBe("provider.bytes.transfer");
    expect(listed).toHaveLength(1);
    expect(listed[0]).toBe(descriptor);
    expect(Object.isFrozen(descriptor)).toBe(true);
    expect(Object.isFrozen(descriptor.idempotencyKeyFields)).toBe(true);
    expect(Object.isFrozen(descriptor.forbiddenEffects)).toBe(true);
    expect(Object.isFrozen(listed)).toBe(true);
  });

  it("rejects descriptors that mismatch side-effect and approval classes", () => {
    expect(() => createAgentDomainToolRegistry([{
      ...baseDescriptor(),
      toolId: "prr.initial-send.execute",
      family: "prr-correspondence",
      sideEffectClass: "external-message-send",
      requiredApprovalClass: "provider-byte-transfer",
      inputSchemaId: "prr-send-input.v1",
      targetDomainService: "prr.correspondence",
      idempotencyKeyFields: ["prrRequestId", "correspondenceId"],
      forbiddenEffects: ["provider-byte-transfer", "accepted-graph-review"]
    }])).toThrow(/approval class/i);
  });

  it("rejects descriptors whose family does not allow the descriptor profile", () => {
    expect(() => createAgentDomainToolRegistry([{
      ...baseDescriptor(),
      family: "provider-byte-transfer",
      sideEffectClass: "ledger-review",
      requiredApprovalClass: "ledger-review"
    }])).toThrow(/family|approval class/i);
  });

  it("rejects secret-shaped preview text", () => {
    expect(() => hashAgentDomainPreview({
      ...basePreview(),
      summary: "Authorization: Bearer sk-live-secret"
    })).toThrow(/secret-safe|text/i);
  });

  it("rejects accessor-backed preview fields without invoking getters", () => {
    let getterCalls = 0;
    const preview = basePreview() as Record<string, unknown>;
    Object.defineProperty(preview, "summary", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "Send selected evidence bytes to the configured provider.";
      }
    });

    expect(() => hashAgentDomainPreview(preview as AgentDomainPreview)).toThrow(/accessor/i);
    expect(getterCalls).toBe(0);
  });

  it("rejects symbol-keyed preview fields", () => {
    const preview = basePreview() as Record<string, unknown>;
    const hidden = Symbol("hidden");
    preview[hidden as unknown as string] = "shadow";

    expect(() => hashAgentDomainPreview(preview as AgentDomainPreview)).toThrow(/symbol-keyed/i);
  });

  it("rejects hidden descriptor fields", () => {
    const descriptor = { ...baseDescriptor() } as unknown as Record<string, unknown>;
    Object.defineProperty(descriptor, "hiddenField", {
      enumerable: false,
      value: "shadow"
    });

    expect(() => createAgentDomainToolRegistry([descriptor])).toThrow(/hidden fields/i);
  });

  it("rejects custom array fields in descriptor arrays", () => {
    const descriptor = { ...baseDescriptor(), idempotencyKeyFields: ["providerRequestId"] } as unknown as {
      idempotencyKeyFields: string[];
    } & AgentDomainToolDescriptor;
    const fields = ["providerRequestId"];
    Object.defineProperty(fields, "extra", {
      enumerable: true,
      value: "shadow"
    });
    descriptor.idempotencyKeyFields = fields;

    expect(() => createAgentDomainToolRegistry([descriptor])).toThrow(/custom array fields/i);
  });

  it("rejects sparse or accessor-backed array values without invoking getters", () => {
    const preview = { ...basePreview(), affectedRefs: [...basePreview().affectedRefs] } as {
      affectedRefs: Array<Record<string, unknown>>;
    } & AgentDomainPreview;
    const affectedRefs = [{ kind: "evidence", id: "ev_provider_001", hash: hash("2") }] as Array<Record<string, unknown>>;
    let getterCalls = 0;
    Object.defineProperty(affectedRefs, "0", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return { kind: "evidence", id: "ev_provider_001", hash: hash("2") };
      }
    });
    preview.affectedRefs = affectedRefs;

    expect(() => hashAgentDomainPreview(preview)).toThrow(/sparse, hidden, or accessor-backed values/i);
    expect(getterCalls).toBe(0);
  });

  it("rejects non-finite numeric values in preview hashing", () => {
    const preview = { ...basePreview(), projectionHighWaterMarks: [...basePreview().projectionHighWaterMarks] } as {
      projectionHighWaterMarks: Array<{ projectionName: string; highWaterMark: number }>;
    } & AgentDomainPreview;
    preview.projectionHighWaterMarks = [{ projectionName: "ingestion", highWaterMark: Number.NaN }];

    expect(() => hashAgentDomainPreview(preview)).toThrow(/JSON-compatible|non-negative integer/i);
  });
});

function baseDescriptor(): AgentDomainToolDescriptor {
  return {
    toolId: "provider.bytes.transfer",
    toolVersion: "0.1.0",
    family: "provider-byte-transfer",
    sideEffectClass: "external-byte-transfer",
    requiredApprovalClass: "provider-byte-transfer",
    inputSchemaId: "provider-bytes-transfer-input.v1",
    outputSchemaId: "agent-domain-result.v1",
    targetDomainService: "ingestion.provider",
    idempotencyKeyFields: ["providerRequestId"],
    forbiddenEffects: ["external-message-send", "accepted-graph-review"]
  };
}

function basePreview(): AgentDomainPreview {
  return {
    schemaVersion: "agent-domain-preview.v1",
    toolRequestId: "toolreq_provider_transfer",
    toolId: "provider.bytes.transfer",
    toolVersion: "0.1.0",
    runId: "run_provider_transfer",
    taskId: "task_provider_transfer",
    residentAgentId: "agent_default",
    sideEffectClass: "external-byte-transfer",
    requiredApprovalClass: "provider-byte-transfer",
    targetDomainService: "ingestion.provider",
    inputSchemaId: "provider-bytes-transfer-input.v1",
    normalizedInputHash: hash("1"),
    summary: "Send selected evidence bytes to the configured provider.",
    scope: "Selected evidence for provider parsing.",
    estimatedEffect: "Provider receives the listed byte hashes after approval is consumed.",
    consequence: "The provider may process the listed evidence; no PRR, export, repair, or graph review occurs.",
    affectedRefs: [{ kind: "evidence", id: "ev_provider_001", hash: hash("2") }],
    expectedOutputs: [{ kind: "event", type: "ingestion.provider.approved" }],
    contextPackRefs: [],
    governancePolicyVersion: "policy_public_records_v1",
    lockSnapshot: [],
    projectionHighWaterMarks: [{ projectionName: "ingestion", highWaterMark: 12 }],
    idempotencyKey: "provider-bytes-transfer:provider_001",
    staleAfter: { kind: "source-hash-change", refs: ["ev_provider_001"] }
  };
}

function hash(seed: string): `sha256:${string}` {
  return `sha256:${seed.repeat(64)}` as `sha256:${string}`;
}
