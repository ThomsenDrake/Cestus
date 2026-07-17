import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { describe, expect, it } from "vitest";
import { createResidentLoopSchedulerCompletionAdapter } from "../src/resident-loop-scheduler-completion.js";
import { createAgentToolGateway } from "../src/tool-gateway.js";

describe("resident-loop scheduler completion adapter", () => {
  it("rejects copied result bytes with no durable result evidence", async () => {
    const ledger = new InMemoryEventLedger();
    const now = () => "2026-07-09T12:00:00.000Z";
    const requested = await createAgentToolGateway({
      ledger,
      actor: { id: "agent_default", kind: "agent", label: "Cestus Agent" },
      now
    }).requestTool({
      toolRequestId: "toolreq_completion_missing_evidence",
      residentAgentId: "agent_default",
      taskId: "task_completion",
      runId: "run_completion",
      toolId: "agent.test.effect",
      toolVersion: "1.0.0",
      sideEffectClass: "ledger-review",
      requiredApprovalClass: "ledger-review",
      preview: { summary: "Approve the exact completion evidence test." }
    });
    await createAgentToolGateway({
      ledger,
      actor: { id: "scheduler_completion", kind: "system", label: "Scheduler" },
      now
    }).approveTool({
      toolRequestId: requested.payload.toolRequestId,
      approvedPreviewHash: requested.payload.previewHash,
      actor: { id: "human_completion", kind: "human", label: "Reviewer" },
      rationale: "Approved the exact completion evidence test."
    });
    const claim = await createAgentToolGateway({
      ledger,
      actor: { id: "scheduler_completion", kind: "system", label: "Scheduler" },
      now
    }).claimExecution({
      toolRequestId: requested.payload.toolRequestId,
      approvedPreviewHash: requested.payload.previewHash,
      leaseExpiresAt: "2026-07-09T12:05:00.000Z"
    });
    const adapter = createResidentLoopSchedulerCompletionAdapter({
      ledger
    });

    await expect(adapter.reread({
      toolRequestId: "toolreq_completion_missing_evidence",
      runId: "run_completion",
      toolId: "agent.test.effect",
      toolVersion: "1.0.0",
      approvedPreviewHash: requested.payload.previewHash,
      executionClaimEventId: claim.id,
      result: {
        eventIds: ["evt_copied_result"],
        artifactHashes: [],
        readModelChanges: [],
        resultSummary: "Copied result bytes."
      }
    })).rejects.toThrow(/result evidence/i);
  });
});
