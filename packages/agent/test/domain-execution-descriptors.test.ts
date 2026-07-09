import { describe, expect, it } from "vitest";
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
      normalizedInputHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      summary: "Send selected evidence bytes to the configured provider.",
      scope: "Selected evidence for provider parsing.",
      estimatedEffect: "Provider receives the listed byte hashes after approval is consumed.",
      consequence: "The provider may process the listed evidence; no PRR, export, repair, or graph review occurs.",
      affectedRefs: [{ kind: "evidence", id: "ev_provider_001", hash: "sha256:2222222222222222222222222222222222222222222222222222222222222222" }],
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
      affectedRefs: [{ hash: "sha256:2222222222222222222222222222222222222222222222222222222222222222", id: "ev_provider_001", kind: "evidence" }],
      consequence: "The provider may process the listed evidence; no PRR, export, repair, or graph review occurs.",
      estimatedEffect: "Provider receives the listed byte hashes after approval is consumed.",
      scope: "Selected evidence for provider parsing.",
      summary: "Send selected evidence bytes to the configured provider.",
      normalizedInputHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
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

  it("rejects descriptors that mismatch side-effect and approval classes", () => {
    expect(() => createAgentDomainToolRegistry([{
      toolId: "prr.initial-send.execute",
      toolVersion: "0.1.0",
      family: "prr-correspondence",
      sideEffectClass: "external-message-send",
      requiredApprovalClass: "provider-byte-transfer",
      inputSchemaId: "prr-send-input.v1",
      outputSchemaId: "agent-domain-result.v1",
      targetDomainService: "prr.correspondence",
      idempotencyKeyFields: ["prrRequestId", "correspondenceId"],
      forbiddenEffects: ["provider-byte-transfer", "accepted-graph-review"]
    }])).toThrow(/approval class/i);
  });
});
