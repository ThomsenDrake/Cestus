import { describe, expect, it } from "vitest";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import {
  createFakeAgentExecutionLoop,
  type FakeAgentToolExecutor
} from "../src/execution-loop.js";

const agentActor = { id: "actor_cestus_agent", kind: "agent" as const, label: "Cestus Agent" };
const humanActor = { id: "actor_case_owner", kind: "human" as const, label: "Case Owner" };

describe("resident agent fake execution loop", () => {
  it("pauses for approval without executing the requested tool", async () => {
    const ledger = new InMemoryEventLedger();
    const executor: FakeAgentToolExecutor = {
      async execute() {
        throw new Error("executor should not run before approval");
      }
    };
    const loop = createFakeAgentExecutionLoop({
      ledger,
      actor: agentActor,
      now: () => "2026-07-07T23:00:00.000Z",
      executor
    });

    const result = await loop.requestApprovalOnly({
      taskId: "task_provider_readiness",
      runId: "run_provider_readiness",
      toolRequestId: "toolreq_provider_preview",
      toolId: "provider.parse.preview",
      toolVersion: 1,
      sideEffectClass: "external-byte-transfer",
      approvalClass: "provider-byte-transfer",
      preview: {
        summary: "Send two evidence excerpts to a configured provider.",
        affectedRefs: ["ev_contract_001"]
      }
    });

    expect(result.state).toBe("waiting-for-approval");
    expect((await ledger.readAll()).map((event) => event.type)).toContain("agent.tool.requested");
  });

  it("rejects approvalClass none without appending a request event", async () => {
    const ledger = new InMemoryEventLedger();
    const loop = createFakeAgentExecutionLoop({
      ledger,
      actor: agentActor,
      now: () => "2026-07-07T23:00:00.000Z",
      executor: { async execute() { return { eventIds: [], artifactHashes: [], readModelChanges: [] }; } }
    });

    await expect(
      loop.requestApprovalOnly({
        taskId: "task_projection_readiness",
        runId: "run_projection_readiness",
        toolRequestId: "toolreq_projection_read",
        toolId: "projection.read",
        sideEffectClass: "read-only",
        approvalClass: "none",
        preview: {
          summary: "Read local projection status.",
          affectedRefs: ["evt_projection_check"]
        }
      })
    ).rejects.toThrow(/requires a human approval class/i);

    expect(await ledger.readAll()).toEqual([]);
  });

  it("rejects agent self-approval before resume", async () => {
    const ledger = new InMemoryEventLedger();
    const loop = createFakeAgentExecutionLoop({
      ledger,
      actor: agentActor,
      now: () => "2026-07-07T23:00:00.000Z",
      executor: { async execute() { return { eventIds: [], artifactHashes: [], readModelChanges: [] }; } }
    });
    const preview = { summary: "Provider preview.", affectedRefs: ["ev_contract_001"] };
    const requested = await loop.requestApprovalOnly({
      taskId: "task_provider_readiness",
      runId: "run_provider_readiness",
      toolRequestId: "toolreq_provider_preview",
      toolId: "provider.parse.preview",
      toolVersion: 1,
      sideEffectClass: "external-byte-transfer",
      approvalClass: "provider-byte-transfer",
      preview
    });

    await expect(
      loop.approveForTest({
        toolRequestId: "toolreq_provider_preview",
        actor: agentActor,
        approvedPreviewHash: requested.previewHash,
        rationale: "Agent cannot approve itself."
      })
    ).rejects.toThrow(/human/i);
  });

  it("resumes after exact human approval and records fake completion", async () => {
    const ledger = new InMemoryEventLedger();
    let executions = 0;
    const loop = createFakeAgentExecutionLoop({
      ledger,
      actor: agentActor,
      now: () => "2026-07-07T23:00:00.000Z",
      executor: {
        async execute(input) {
          executions += 1;
          expect(input.toolRequestId).toBe("toolreq_provider_preview");
          return {
            eventIds: ["evt_fake_domain_result"],
            artifactHashes: ["sha256:6666666666666666666666666666666666666666666666666666666666666666"],
            readModelChanges: ["fake approval resume complete"]
          };
        }
      }
    });
    const requested = await loop.requestApprovalOnly({
      taskId: "task_provider_readiness",
      runId: "run_provider_readiness",
      toolRequestId: "toolreq_provider_preview",
      toolId: "provider.parse.preview",
      toolVersion: 1,
      sideEffectClass: "external-byte-transfer",
      approvalClass: "provider-byte-transfer",
      preview: { summary: "Provider preview.", affectedRefs: ["ev_contract_001"] }
    });
    await loop.approveForTest({
      toolRequestId: "toolreq_provider_preview",
      actor: humanActor,
      approvedPreviewHash: requested.previewHash,
      rationale: "Human approved the exact preview."
    });

    const resumed = await loop.resumeApprovedTool({
      toolRequestId: "toolreq_provider_preview",
      taskId: "task_provider_readiness",
      currentPreview: { affectedRefs: ["ev_contract_001"], summary: "Provider preview." },
      activeLocks: []
    });

    expect(resumed.state).toBe("completed");
    expect(executions).toBe(1);
    const completedEvent = (await ledger.readAll()).find((event) => event.type === "agent.tool.completed");
    expect(completedEvent?.type).toBe("agent.tool.completed");
    if (completedEvent?.type !== "agent.tool.completed") {
      throw new Error("expected completed event");
    }
    expect(completedEvent.payload.readModelChanges).toEqual([{
      projectionName: "fake-agent-execution-loop",
      change: "fake approval resume complete"
    }]);
  });

  it("fails closed with a secret-safe failure when a fake executor returns a malformed result", async () => {
    const ledger = new InMemoryEventLedger();
    const malformedEventId = "not-a-valid-event-id";
    const loop = createFakeAgentExecutionLoop({
      ledger,
      actor: agentActor,
      now: () => "2026-07-07T23:00:00.000Z",
      executor: {
        async execute() {
          return {
            eventIds: [malformedEventId],
            artifactHashes: [],
            readModelChanges: []
          };
        }
      }
    });
    const requested = await loop.requestApprovalOnly({
      taskId: "task_provider_readiness",
      runId: "run_provider_readiness",
      toolRequestId: "toolreq_provider_malformed_result",
      toolId: "provider.parse.preview",
      toolVersion: 1,
      sideEffectClass: "external-byte-transfer",
      approvalClass: "provider-byte-transfer",
      preview: { summary: "Provider preview.", affectedRefs: ["ev_contract_001"] }
    });
    await loop.approveForTest({
      toolRequestId: "toolreq_provider_malformed_result",
      actor: humanActor,
      approvedPreviewHash: requested.previewHash,
      rationale: "Human approved the exact preview."
    });

    let thrown: unknown;
    try {
      await loop.resumeApprovedTool({
        toolRequestId: "toolreq_provider_malformed_result",
        taskId: "task_provider_readiness",
        currentPreview: { affectedRefs: ["ev_contract_001"], summary: "Provider preview." },
        activeLocks: []
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).toMatch(/fake tool result failed validation/i);
    expect(message).not.toContain(malformedEventId);

    const events = await ledger.readAll();
    expect(events.map((event) => event.type)).toEqual([
      "agent.tool.requested",
      "agent.tool.approved",
      "agent.tool.failed"
    ]);
    const failedEvent = events.find((event) => event.type === "agent.tool.failed");
    expect(failedEvent?.type).toBe("agent.tool.failed");
    if (failedEvent?.type !== "agent.tool.failed") {
      throw new Error("expected failed event");
    }
    expect(failedEvent.payload.category).toBe("model-output-invalid");
    expect(failedEvent.payload.retryable).toBe(false);
    expect(failedEvent.payload.message).not.toContain(malformedEventId);
    expect(failedEvent.payload.allowedActions.join(" ")).not.toContain(malformedEventId);
    expect(events.some((event) => event.type === "agent.tool.completed")).toBe(false);
  });

  it("resumes durably after loop recreation using explicit task context", async () => {
    const ledger = new InMemoryEventLedger();
    const requestLoop = createFakeAgentExecutionLoop({
      ledger,
      actor: agentActor,
      now: () => "2026-07-07T23:00:00.000Z",
      executor: { async execute() { throw new Error("request loop executor should not run"); } }
    });
    const requested = await requestLoop.requestApprovalOnly({
      taskId: "task_provider_readiness",
      runId: "run_provider_readiness",
      toolRequestId: "toolreq_provider_preview",
      toolId: "provider.parse.preview",
      toolVersion: 1,
      sideEffectClass: "external-byte-transfer",
      approvalClass: "provider-byte-transfer",
      preview: { summary: "Provider preview.", affectedRefs: ["ev_contract_001"] }
    });
    await requestLoop.approveForTest({
      toolRequestId: "toolreq_provider_preview",
      actor: humanActor,
      approvedPreviewHash: requested.previewHash,
      rationale: "Human approved the exact preview."
    });

    let executions = 0;
    const freshLoop = createFakeAgentExecutionLoop({
      ledger,
      actor: agentActor,
      now: () => "2026-07-07T23:05:00.000Z",
      executor: {
        async execute(input) {
          executions += 1;
          expect(input.taskId).toBe("task_provider_readiness");
          expect(input.toolRequestId).toBe("toolreq_provider_preview");
          return {
            eventIds: ["evt_fake_domain_result"],
            artifactHashes: ["sha256:6666666666666666666666666666666666666666666666666666666666666666"],
            readModelChanges: ["fresh loop approval resume complete"]
          };
        }
      }
    });

    const resumed = await freshLoop.resumeApprovedTool({
      toolRequestId: "toolreq_provider_preview",
      taskId: "task_provider_readiness",
      currentPreview: { affectedRefs: ["ev_contract_001"], summary: "Provider preview." },
      activeLocks: []
    });

    expect(resumed.state).toBe("completed");
    expect(executions).toBe(1);
    expect((await ledger.readAll()).map((event) => event.type)).toContain("agent.tool.completed");
  });

  it("fails closed when approval is stale", async () => {
    const ledger = new InMemoryEventLedger();
    let executions = 0;
    const loop = createFakeAgentExecutionLoop({
      ledger,
      actor: agentActor,
      now: () => "2026-07-07T23:00:00.000Z",
      executor: { async execute() { executions += 1; throw new Error("executor should not run for stale approval"); } }
    });
    const preview = { summary: "Provider preview.", affectedRefs: ["ev_contract_001"] };
    const requested = await loop.requestApprovalOnly({
      taskId: "task_provider_readiness",
      runId: "run_provider_readiness",
      toolRequestId: "toolreq_provider_preview",
      toolId: "provider.parse.preview",
      toolVersion: 1,
      sideEffectClass: "external-byte-transfer",
      approvalClass: "provider-byte-transfer",
      preview
    });
    await loop.approveForTest({
      toolRequestId: "toolreq_provider_preview",
      actor: humanActor,
      approvedPreviewHash: requested.previewHash,
      rationale: "Human approved the exact preview."
    });

    await expect(
      loop.resumeApprovedTool({
        toolRequestId: "toolreq_provider_preview",
        taskId: "task_provider_readiness",
        currentPreview: { summary: "Changed provider preview.", affectedRefs: ["ev_contract_001"] },
        activeLocks: []
      })
    ).rejects.toThrow(/stale/i);
    expect(executions).toBe(0);
    expect((await ledger.readAll()).map((event) => event.type)).toContain("agent.tool.failed");
  });

  it("fails closed when an active legal export or data-loss lock blocks resume", async () => {
    const ledger = new InMemoryEventLedger();
    let executions = 0;
    const loop = createFakeAgentExecutionLoop({
      ledger,
      actor: agentActor,
      now: () => "2026-07-07T23:00:00.000Z",
      executor: {
        async execute() {
          executions += 1;
          return { eventIds: [], artifactHashes: [], readModelChanges: [] };
        }
      }
    });
    const preview = { summary: "Export governed report preview.", affectedRefs: ["ev_contract_001"] };
    const requested = await loop.requestApprovalOnly({
      taskId: "task_export_readiness",
      runId: "run_export_readiness",
      toolRequestId: "toolreq_export_preview",
      toolId: "report.export.preview",
      sideEffectClass: "export-or-publication",
      approvalClass: "export-or-publication",
      preview
    });
    await loop.approveForTest({
      toolRequestId: "toolreq_export_preview",
      actor: humanActor,
      approvedPreviewHash: requested.previewHash,
      rationale: "Human approved the exact preview."
    });

    await expect(
      loop.resumeApprovedTool({
        toolRequestId: "toolreq_export_preview",
        taskId: "task_export_readiness",
        currentPreview: preview,
        activeLocks: [
          { lockId: "lock_legal_review", category: "legal-escalation", message: "Legal review lock active." },
          { lockId: "lock_export_review", category: "export", message: "Export review lock active." },
          { lockId: "lock_data_loss", category: "data-loss", message: "Data-loss lock active." }
        ]
      })
    ).rejects.toThrow(/lock/i);

    expect(executions).toBe(0);
    const failedEvent = (await ledger.readAll()).find((event) => event.type === "agent.tool.failed");
    expect(failedEvent?.type).toBe("agent.tool.failed");
    if (failedEvent?.type !== "agent.tool.failed") {
      throw new Error("expected failed event");
    }
    expect(failedEvent.payload.category).toBe("legal-lock-active");
  });
});
