import { describe, expect, it } from "vitest";
import {
  buildAgentApprovalQueue,
  type AgentApprovalQueueInput
} from "../src/approval-queue.js";

const baseRequest = {
  toolRequestId: "toolreq_provider_preview",
  runId: "run_provider_readiness",
  taskId: "task_provider_readiness",
  toolId: "provider.parse.preview",
  toolVersion: 1,
  sideEffectClass: "external-byte-transfer",
  requiredApprovalClass: "provider-byte-transfer",
  previewHash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
  previewSummary: "Send two evidence excerpts to a configured provider.",
  affectedRefs: [{ kind: "evidence", id: "ev_contract_001", hash: "sha256:3333333333333333333333333333333333333333333333333333333333333333" }],
  contextPackRefs: [{
    contextPackId: "evidence-summary.v1",
    version: 1,
    contentHash: "sha256:4444444444444444444444444444444444444444444444444444444444444444",
    sizeBytes: 256,
    generatedAt: "2026-07-07T22:00:00.000Z",
    safeSummary: "Evidence summary for one artifact.",
    provenanceRefs: ["evt_evidence_001"]
  }],
  requestedAt: "2026-07-07T22:00:00.000Z",
  state: "requested"
} as const;

describe("agent approval queue", () => {
  it("projects pending approvals with exact preview hash and risk fields", () => {
    const queue = buildAgentApprovalQueue({
      now: "2026-07-07T22:01:00.000Z",
      requests: [baseRequest],
      approvals: [],
      denials: [],
      completed: [],
      failures: [],
      currentPreviewHashes: { toolreq_provider_preview: baseRequest.previewHash },
      activeLocks: []
    });

    expect(queue.pending).toHaveLength(1);
    expect(queue.pending[0]).toMatchObject({
      toolRequestId: "toolreq_provider_preview",
      approvalClass: "provider-byte-transfer",
      stale: false,
      executableByApproval: false
    });
    expect(queue.pending[0]?.previewHash).toBe(baseRequest.previewHash);
  });

  it("marks approval stale when the current preview hash differs", () => {
    const input: AgentApprovalQueueInput = {
      now: "2026-07-07T22:01:00.000Z",
      requests: [baseRequest],
      approvals: [{
        toolRequestId: "toolreq_provider_preview",
        approvedBy: "actor_case_owner",
        approvedPreviewHash: baseRequest.previewHash,
        approvedAt: "2026-07-07T22:02:00.000Z",
        rationale: "Approved the listed excerpts."
      }],
      denials: [],
      completed: [],
      failures: [],
      currentPreviewHashes: {
        toolreq_provider_preview: "sha256:5555555555555555555555555555555555555555555555555555555555555555"
      },
      activeLocks: []
    };

    const queue = buildAgentApprovalQueue(input);

    expect(queue.stale.map((item) => item.toolRequestId)).toEqual(["toolreq_provider_preview"]);
    expect(queue.resumable).toHaveLength(0);
  });

  it("keeps approved items non-resumable when a lock is active", () => {
    const queue = buildAgentApprovalQueue({
      now: "2026-07-07T22:01:00.000Z",
      requests: [baseRequest],
      approvals: [{
        toolRequestId: "toolreq_provider_preview",
        approvedBy: "actor_case_owner",
        approvedPreviewHash: baseRequest.previewHash,
        approvedAt: "2026-07-07T22:02:00.000Z",
        rationale: "Approved the listed excerpts."
      }],
      denials: [],
      completed: [],
      failures: [],
      currentPreviewHashes: { toolreq_provider_preview: baseRequest.previewHash },
      activeLocks: [{ lockId: "lock_export", category: "export", message: "Export lock active." }]
    });

    expect(queue.blocked[0]?.blockingReasons).toContain("lock-active");
    expect(queue.resumable).toHaveLength(0);
  });
});
