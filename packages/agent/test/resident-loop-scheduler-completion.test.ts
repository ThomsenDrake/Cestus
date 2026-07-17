import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { describe, expect, it } from "vitest";
import { createResidentLoopSchedulerCompletionAdapter } from "../src/resident-loop-scheduler-completion.js";

describe("resident-loop scheduler completion adapter", () => {
  it("rejects copied result bytes with no durable result evidence", async () => {
    const adapter = createResidentLoopSchedulerCompletionAdapter({
      ledger: new InMemoryEventLedger()
    });

    await expect(adapter.reread({
      toolRequestId: "toolreq_completion_missing_evidence",
      runId: "run_completion",
      toolId: "agent.test.effect",
      toolVersion: "1.0.0",
      approvedPreviewHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      executionClaimEventId: "evt_completion_claim",
      result: {
        eventIds: ["evt_copied_result"],
        artifactHashes: [],
        readModelChanges: [],
        resultSummary: "Copied result bytes."
      }
    })).rejects.toThrow(/durable.*evidence/i);
  });
});
