import { describe, expect, it } from "vitest";
import {
  buildAgentApprovalQueue,
  type AgentApprovalQueueInput
} from "../src/approval-queue.js";

const matchingPreviewHash = "sha256:2222222222222222222222222222222222222222222222222222222222222222";

const baseRequest = {
  toolRequestId: "toolreq_provider_preview",
  runId: "run_provider_readiness",
  taskId: "task_provider_readiness",
  toolId: "provider.parse.preview",
  toolVersion: 1,
  sideEffectClass: "external-byte-transfer",
  requiredApprovalClass: "provider-byte-transfer",
  previewHash: matchingPreviewHash,
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

function queueInput(overrides: Partial<AgentApprovalQueueInput> = {}): AgentApprovalQueueInput {
  return {
    now: "2026-07-07T22:01:00.000Z",
    requests: [baseRequest],
    approvals: [],
    denials: [],
    completed: [],
    failures: [],
    currentPreviewHashes: { toolreq_provider_preview: baseRequest.previewHash },
    activeLocks: [],
    ...overrides
  };
}

function approvedProvider(overrides: Partial<AgentApprovalQueueInput["approvals"][number]> = {}) {
  return {
    toolRequestId: "toolreq_provider_preview",
    approvedBy: "actor_case_owner",
    approvedPreviewHash: baseRequest.previewHash,
    approvedAt: "2026-07-07T22:02:00.000Z",
    rationale: "Approved the listed excerpts.",
    ...overrides
  };
}

describe("agent approval queue", () => {
  it("projects pending approvals with exact preview hash and risk fields", () => {
    const queue = buildAgentApprovalQueue(queueInput());

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
    const input = queueInput({
      approvals: [approvedProvider()],
      currentPreviewHashes: {
        toolreq_provider_preview: "sha256:5555555555555555555555555555555555555555555555555555555555555555"
      }
    });

    const queue = buildAgentApprovalQueue(input);

    expect(queue.stale.map((item) => item.toolRequestId)).toEqual(["toolreq_provider_preview"]);
    expect(queue.resumable).toHaveLength(0);
  });

  it("keeps approved items non-resumable when a lock is active", () => {
    const queue = buildAgentApprovalQueue(queueInput({
      approvals: [approvedProvider()],
      activeLocks: [{ lockId: "lock_export", category: "export", message: "Export lock active." }]
    }));

    expect(queue.blocked[0]?.blockingReasons).toContain("lock-active");
    expect(queue.resumable).toHaveLength(0);
  });

  it("normalizes foundation approval classes into cockpit approval classes", () => {
    const requests: AgentApprovalQueueInput["requests"] = [
      {
        ...baseRequest,
        toolRequestId: "toolreq_prr_followup",
        toolId: "prr.send.followup",
        sideEffectClass: "external-message-send",
        requiredApprovalClass: "external-message-send"
      },
      {
        ...baseRequest,
        toolRequestId: "toolreq_export",
        toolId: "report.export",
        sideEffectClass: "export-or-publication",
        requiredApprovalClass: "export-or-publication"
      },
      {
        ...baseRequest,
        toolRequestId: "toolreq_repair",
        toolId: "workspace.repair",
        sideEffectClass: "destructive-or-repair",
        requiredApprovalClass: "destructive-or-repair"
      }
    ];

    const queue = buildAgentApprovalQueue(queueInput({
      requests,
      currentPreviewHashes: {
        toolreq_prr_followup: matchingPreviewHash,
        toolreq_export: matchingPreviewHash,
        toolreq_repair: matchingPreviewHash
      }
    }));

    expect(queue.pending.map((item) => item.approvalClass)).toEqual([
      "prr-send-followup",
      "export-publication",
      "destructive-repair"
    ]);
    expect(queue.pending.map((item) => item.risk.approvalClass)).toEqual([
      "prr-send-followup",
      "export-publication",
      "destructive-repair"
    ]);
  });

  it("preserves future approval classes and forbidden direct-effect identifiers as extensible strings", () => {
    const queue = buildAgentApprovalQueue(queueInput({
      requests: [{
        ...baseRequest,
        toolRequestId: "toolreq_future_review",
        toolId: "evidence.retention.review",
        sideEffectClass: "evidence-retention",
        requiredApprovalClass: "evidence-retention-review"
      }],
      approvals: [approvedProvider({
        toolRequestId: "toolreq_future_review",
        approvalClass: "evidence-retention-review"
      })],
      currentPreviewHashes: {
        toolreq_future_review: matchingPreviewHash
      },
      activeLocks: [{
        lockId: "lock_retention",
        category: "retention",
        message: "Retention review lock active.",
        appliesToApprovalClasses: ["evidence-retention-review"]
      }]
    }));

    expect(queue.blocked[0]).toMatchObject({
      approvalClass: "evidence-retention-review",
      currentPreviewHash: matchingPreviewHash,
      activeLocks: [{
        appliesToApprovalClasses: ["evidence-retention-review"]
      }],
      approval: {
        approvalClass: "evidence-retention-review"
      },
      risk: {
        approvalClass: "evidence-retention-review"
      }
    });
    expect(queue.blocked[0]?.blockingReasons).toContain("lock-active");

    const deniedQueue = buildAgentApprovalQueue(queueInput({
      requests: [{
        ...baseRequest,
        toolRequestId: "toolreq_future_review",
        toolId: "evidence.retention.review",
        sideEffectClass: "evidence-retention",
        requiredApprovalClass: "evidence-retention-review"
      }],
      denials: [{
        toolRequestId: "toolreq_future_review",
        deniedBy: "actor_case_owner",
        deniedAt: "2026-07-07T22:03:00.000Z",
        rationale: "Need a narrower retention scope.",
        approvalClass: "evidence-retention-review"
      }],
      currentPreviewHashes: {
        toolreq_future_review: matchingPreviewHash
      }
    }));

    expect(deniedQueue.denied[0]?.denial?.approvalClass).toBe("evidence-retention-review");
  });

  it.each([
    "none",
    "human-review"
  ])("rejects sentinel approval class %s at canonical queue boundaries", (approvalClass) => {
    expect(() =>
      buildAgentApprovalQueue(queueInput({
        requests: [{
          ...baseRequest,
          requiredApprovalClass: approvalClass
        }]
      }))
    ).toThrow(/approval class/i);

    expect(() =>
      buildAgentApprovalQueue(queueInput({
        approvals: [approvedProvider({ approvalClass })]
      }))
    ).toThrow(/approval class/i);

    expect(() =>
      buildAgentApprovalQueue(queueInput({
        denials: [{
          toolRequestId: "toolreq_provider_preview",
          deniedBy: "actor_case_owner",
          deniedAt: "2026-07-07T22:03:00.000Z",
          rationale: "Needs review.",
          approvalClass
        }]
      }))
    ).toThrow(/approval class/i);

    expect(() =>
      buildAgentApprovalQueue(queueInput({
        activeLocks: [{
          lockId: "lock_provider_review",
          category: "review",
          message: "Waiting for review.",
          appliesToApprovalClasses: [approvalClass]
        }]
      }))
    ).toThrow(/approval class/i);
  });

  it("marks requested items stale before approval when the current preview hash differs", () => {
    const queue = buildAgentApprovalQueue(queueInput({
      currentPreviewHashes: {
        toolreq_provider_preview: "sha256:5555555555555555555555555555555555555555555555555555555555555555"
      }
    }));

    expect(queue.pending).toHaveLength(0);
    expect(queue.stale[0]?.toolRequestId).toBe("toolreq_provider_preview");
    expect(queue.stale[0]?.blockingReasons).toContain("approval-stale");
    expect(queue.stale[0]?.executableByApproval).toBe(false);
  });

  it("blocks requested items before approval when scoped locks apply", () => {
    const exportRequest: AgentApprovalQueueInput["requests"][number] = {
      ...baseRequest,
      toolRequestId: "toolreq_export_preview",
      toolId: "report.export",
      sideEffectClass: "export-or-publication",
      requiredApprovalClass: "export-or-publication"
    };
    const queue = buildAgentApprovalQueue(queueInput({
      requests: [baseRequest, exportRequest],
      currentPreviewHashes: {
        toolreq_provider_preview: matchingPreviewHash,
        toolreq_export_preview: matchingPreviewHash
      },
      activeLocks: [{
        lockId: "lock_export",
        category: "export",
        message: "Export lock active.",
        appliesToToolRequestIds: ["toolreq_export_preview"],
        appliesToApprovalClasses: ["export-or-publication"]
      }]
    }));

    expect(queue.pending.map((item) => item.toolRequestId)).toEqual(["toolreq_provider_preview"]);
    expect(queue.blocked[0]?.toolRequestId).toBe("toolreq_export_preview");
    expect(queue.blocked[0]?.approvalClass).toBe("export-publication");
    expect(queue.blocked[0]?.blockingReasons).toContain("lock-active");
  });

  it("blocks approved items when the approval class does not match the request", () => {
    const queue = buildAgentApprovalQueue(queueInput({
      approvals: [approvedProvider({ approvalClass: "legal-escalation" })]
    }));

    expect(queue.resumable).toHaveLength(0);
    expect(queue.blocked[0]?.blockingReasons).toContain("approval-class-mismatch");
    expect(queue.blocked[0]?.executableByApproval).toBe(false);
  });

  it("projects exact approved requests as resumable without making approval executable", () => {
    const queue = buildAgentApprovalQueue(queueInput({
      approvals: [approvedProvider({ approvalClass: "provider-byte-transfer" })]
    }));

    expect(queue.resumable).toHaveLength(1);
    expect(queue.resumable[0]).toMatchObject({
      toolRequestId: "toolreq_provider_preview",
      stale: false,
      executableByApproval: false
    });
  });

  it("projects denied completed and failed terminal buckets", () => {
    const denied = buildAgentApprovalQueue(queueInput({
      denials: [{
        toolRequestId: "toolreq_provider_preview",
        deniedBy: "actor_case_owner",
        deniedAt: "2026-07-07T22:03:00.000Z",
        rationale: "Needs a narrower preview.",
        approvalClass: "provider-byte-transfer"
      }]
    }));
    const completed = buildAgentApprovalQueue(queueInput({
      completed: [{
        toolRequestId: "toolreq_provider_preview",
        completedAt: "2026-07-07T22:04:00.000Z",
        resultSummary: "Preview request completed.",
        eventIds: ["evt_tool_completed"],
        artifactHashes: ["sha256:6666666666666666666666666666666666666666666666666666666666666666"],
        readModelChanges: ["approval queue updated"]
      }]
    }));
    const failed = buildAgentApprovalQueue(queueInput({
      failures: [{
        toolRequestId: "toolreq_provider_preview",
        failedAt: "2026-07-07T22:05:00.000Z",
        category: "approval-stale",
        message: "Preview changed before resume.",
        retryable: false,
        allowedActions: ["request revised preview"]
      }]
    }));

    expect(denied.denied[0]?.denial?.rationale).toBe("Needs a narrower preview.");
    expect(completed.completed[0]?.completion?.eventIds).toEqual(["evt_tool_completed"]);
    expect(failed.failed[0]?.failure?.category).toBe("approval-stale");
    expect([
      denied.denied[0]?.executableByApproval,
      completed.completed[0]?.executableByApproval,
      failed.failed[0]?.executableByApproval
    ]).toEqual([false, false, false]);
  });

  it("rejects secret-shaped queue messages", () => {
    expect(() =>
      buildAgentApprovalQueue(queueInput({
        requests: [{
          ...baseRequest,
          previewSummary: "api key sk-live-value"
        }]
      }))
    ).toThrow(/secret/i);
  });

  it("returns deeply frozen queue DTOs", () => {
    const queue = buildAgentApprovalQueue(queueInput());
    const item = queue.pending[0];

    expect(Object.isFrozen(queue.pending)).toBe(true);
    expect(Object.isFrozen(item)).toBe(true);
    expect(Object.isFrozen(item?.affectedRefs)).toBe(true);
    expect(Object.isFrozen(item?.affectedRefs[0])).toBe(true);
    expect(Object.isFrozen(item?.contextPackRefs)).toBe(true);
    expect(Object.isFrozen(item?.contextPackRefs[0])).toBe(true);
    expect(Object.isFrozen(item?.risk)).toBe(true);
    expect(Object.isFrozen(item?.risk.blockingReasons)).toBe(true);
  });
});
