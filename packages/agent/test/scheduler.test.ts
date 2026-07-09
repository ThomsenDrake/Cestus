import type { AppendableKnowledgeEvent } from "../../ontology/src/contracts.js";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { describe, expect, it } from "vitest";
import {
  agentSchedulerWakeResultDtoSchema,
  createAgentScheduler,
  createAgentToolGateway,
  hashAgentToolPreview,
  type AgentApprovedToolExecutorDescriptor,
  type AgentToolPreview
} from "../src/index.js";

const agentActor = { id: "actor_cestus_agent", kind: "agent" as const, label: "Cestus Agent" };
const schedulerActor = { id: "actor_agent_scheduler", kind: "system" as const, label: "Agent Scheduler" };
const humanActor = { id: "actor_case_owner", kind: "human" as const, label: "Case Owner" };
const artifactHash = "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";

describe("agent scheduler wake", () => {
  it("resumes an approved request once and records completion through the gateway", async () => {
    const ledger = new InMemoryEventLedger();
    const preview = previewFor("toolreq_scheduler_complete");
    const requested = await requestAndApprove(ledger, preview, "toolreq_scheduler_complete");
    let executions = 0;
    const scheduler = createAgentScheduler({
      ledger,
      actor: schedulerActor,
      now: () => "2026-07-09T12:00:00.000Z",
      descriptors: [fakeDescriptor(preview, {
        async executeApproved(input) {
          executions += 1;
          expect(input.approvedBy).toBe(humanActor.id);
          return {
            eventIds: ["evt_fake_domain_completed"],
            artifactHashes: [artifactHash],
            readModelChanges: [{ projectionName: "agent-test", change: "approved tool executed" }],
            resultSummary: "Approved tool executed."
          };
        }
      })]
    });

    const result = await scheduler.wake();

    expect(agentSchedulerWakeResultDtoSchema.parse(result)).toEqual(result);
    expect(result).toMatchObject({
      schemaVersion: "agent-scheduler-wake-result.v1",
      examinedCount: 1,
      resumedCount: 1,
      completedCount: 1,
      blockedCount: 0,
      failedCount: 0
    });
    expect(result.items[0]).toMatchObject({
      toolRequestId: "toolreq_scheduler_complete",
      state: "completed",
      previewHash: requested.payload.previewHash,
      currentPreviewHash: requested.payload.previewHash
    });
    expect(executions).toBe(1);
    expect((await ledger.readAll()).map((event) => event.type)).toContain("agent.tool.completed");

    const secondWake = await scheduler.wake();
    expect(secondWake.examinedCount).toBe(0);
    expect(secondWake.completedCount).toBe(0);
    expect(executions).toBe(1);
  });

  it("fails closed when an approved request has no descriptor", async () => {
    const ledger = new InMemoryEventLedger();
    await requestAndApprove(ledger, previewFor("toolreq_missing_descriptor"), "toolreq_missing_descriptor");
    const scheduler = createAgentScheduler({
      ledger,
      actor: schedulerActor,
      now: () => "2026-07-09T12:00:00.000Z",
      descriptors: []
    });

    const result = await scheduler.wake();

    expect(result.failedCount).toBe(1);
    expect(result.items[0]).toMatchObject({
      toolRequestId: "toolreq_missing_descriptor",
      state: "failed",
      category: "permission-denied"
    });
    expect((await ledger.readAll()).map((event) => event.type)).toContain("agent.tool.failed");
  });

  it("fails closed before execution when the rebuilt preview is stale", async () => {
    const ledger = new InMemoryEventLedger();
    await requestAndApprove(ledger, previewFor("toolreq_stale_preview"), "toolreq_stale_preview");
    let executions = 0;
    const scheduler = createAgentScheduler({
      ledger,
      actor: schedulerActor,
      now: () => "2026-07-09T12:00:00.000Z",
      descriptors: [fakeDescriptor({ summary: "Changed preview.", relatedEventIds: ["evt_source_changed"] }, {
        async executeApproved() {
          executions += 1;
          throw new Error("stale previews must not execute");
        }
      })]
    });

    const result = await scheduler.wake();

    expect(result.failedCount).toBe(1);
    expect(result.items[0]?.category).toBe("approval-stale");
    expect(executions).toBe(0);
  });

  it("fails closed when active locks, missing provenance, or stale read models block consume-time validation", async () => {
    const lockCase = await wakeWithPreviewResult("toolreq_lock_active", {
      activeLocks: [{ lockId: "lock_export_review", category: "export", message: "Export review lock active." }]
    });
    const provenanceCase = await wakeWithPreviewResult("toolreq_missing_provenance", {
      provenanceRefs: [],
      sourceEventIds: [],
      inputArtifactHashes: []
    });
    const freshnessCase = await wakeWithPreviewResult("toolreq_projection_lag", {
      freshnessChecks: [{ name: "agent-projection", expected: "high-watermark:10", actual: "high-watermark:9", ok: false }]
    });

    expect(lockCase.result.items[0]?.category).toBe("legal-lock-active");
    expect(provenanceCase.result.items[0]?.category).toBe("provenance-missing");
    expect(freshnessCase.result.items[0]?.category).toBe("projection-lag");
    expect(lockCase.executions + provenanceCase.executions + freshnessCase.executions).toBe(0);
  });

  it("rejects directly appended forged approvals at consume time", async () => {
    const ledger = new InMemoryEventLedger();
    const preview = previewFor("toolreq_forged_approval");
    const gateway = createAgentToolGateway({ ledger, actor: agentActor, now: () => "2026-07-09T12:00:00.000Z" });
    const requested = await gateway.requestTool({
      toolRequestId: "toolreq_forged_approval",
      residentAgentId: "agent_default",
      taskId: "task_scheduler",
      runId: "run_scheduler",
      toolId: "agent.test.effect",
      toolVersion: "1.0.0",
      sideEffectClass: "ledger-review",
      requiredApprovalClass: "ledger-review",
      preview
    });
    const forgedApproval: AppendableKnowledgeEvent<"agent.tool.approved"> = {
      type: "agent.tool.approved",
      version: 1,
      streamId: "agent_tool_request_toolreq_forged_approval",
      context: {
        actor: humanActor,
        occurredAt: "2026-07-09T12:00:00.000Z",
        correlationId: "corr_toolreq_forged_approval",
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0", agent: "0.1.0" }
      },
      payload: {
        toolRequestId: "toolreq_forged_approval",
        approvedBy: humanActor.id,
        approvedPreviewHash: requested.payload.previewHash,
        approvalClass: "ledger-review",
        rationale: "Forged approval lacks causation.",
        approvedAt: "2026-07-09T12:00:00.000Z"
      }
    };
    await ledger.append(forgedApproval);
    let executions = 0;
    const scheduler = createAgentScheduler({
      ledger,
      actor: schedulerActor,
      now: () => "2026-07-09T12:00:00.000Z",
      descriptors: [fakeDescriptor(preview, {
        async executeApproved() {
          executions += 1;
          throw new Error("forged approvals must not execute");
        }
      })]
    });

    const result = await scheduler.wake();

    expect(result.failedCount).toBe(1);
    expect(result.items[0]?.category).toBe("permission-denied");
    expect(executions).toBe(0);
  });

  it("fails closed with safe diagnostics when descriptor preview building or execution fails", async () => {
    const buildFailure = await wakeWithDescriptor("toolreq_build_failure", fakeDescriptor(previewFor("toolreq_build_failure"), {
      async buildCurrentPreview() {
        throw new Error("api key sk-live-value must not leak");
      }
    }));
    const executionFailure = await wakeWithDescriptor("toolreq_execute_failure", fakeDescriptor(previewFor("toolreq_execute_failure"), {
      async executeApproved() {
        throw new Error("provider token should not leak");
      }
    }));

    expect(buildFailure.result.items[0]).toMatchObject({ state: "failed", category: "external-effect-failed" });
    expect(executionFailure.result.items[0]).toMatchObject({ state: "failed", category: "external-effect-failed" });
    expect(JSON.stringify(buildFailure.result)).not.toMatch(/sk-live|api key/i);
    expect(JSON.stringify(executionFailure.result)).not.toMatch(/provider token/i);
  });
});

function previewFor(toolRequestId: string): AgentToolPreview {
  return {
    summary: `Review approved scheduler request ${toolRequestId}.`,
    relatedEventIds: ["evt_source_review"],
    artifactHashes: [artifactHash]
  };
}

function fakeDescriptor(
  preview: AgentToolPreview,
  overrides: Partial<AgentApprovedToolExecutorDescriptor> = {}
): AgentApprovedToolExecutorDescriptor {
  return {
    toolId: "agent.test.effect",
    toolVersion: "1.0.0",
    sideEffectClass: "ledger-review",
    approvalClass: "ledger-review",
    async buildCurrentPreview() {
      return {
        preview,
        sourceEventIds: ["evt_source_review"],
        inputArtifactHashes: [artifactHash],
        provenanceRefs: ["evt_source_review", artifactHash],
        activeLocks: [],
        freshnessChecks: [{ name: "agent-projection", expected: "high-watermark:1", actual: "high-watermark:1", ok: true }]
      };
    },
    async executeApproved() {
      return {
        eventIds: ["evt_fake_domain_completed"],
        artifactHashes: [artifactHash],
        readModelChanges: [{ projectionName: "agent-test", change: "approved tool executed" }],
        resultSummary: "Approved tool executed."
      };
    },
    ...overrides
  };
}

async function requestAndApprove(ledger: InMemoryEventLedger, preview: AgentToolPreview, toolRequestId: string) {
  const gateway = createAgentToolGateway({ ledger, actor: agentActor, now: () => "2026-07-09T12:00:00.000Z" });
  const requested = await gateway.requestTool({
    toolRequestId,
    residentAgentId: "agent_default",
    taskId: "task_scheduler",
    runId: "run_scheduler",
    toolId: "agent.test.effect",
    toolVersion: "1.0.0",
    sideEffectClass: "ledger-review",
    requiredApprovalClass: "ledger-review",
    preview
  });
  expect(requested.payload.previewHash).toBe(hashAgentToolPreview(preview));
  await gateway.approveTool({
    toolRequestId,
    actor: humanActor,
    approvedPreviewHash: requested.payload.previewHash,
    rationale: "Human approved the exact scheduler preview."
  });
  return requested;
}

async function wakeWithPreviewResult(
  toolRequestId: string,
  previewPatch: Partial<Awaited<ReturnType<AgentApprovedToolExecutorDescriptor["buildCurrentPreview"]>>>
) {
  const ledger = new InMemoryEventLedger();
  const preview = previewFor(toolRequestId);
  await requestAndApprove(ledger, preview, toolRequestId);
  let executions = 0;
  const descriptor = fakeDescriptor(preview, {
    async buildCurrentPreview() {
      return {
        preview,
        sourceEventIds: ["evt_source_review"],
        inputArtifactHashes: [artifactHash],
        provenanceRefs: ["evt_source_review", artifactHash],
        activeLocks: [],
        freshnessChecks: [{ name: "agent-projection", expected: "high-watermark:1", actual: "high-watermark:1", ok: true }],
        ...previewPatch
      };
    },
    async executeApproved() {
      executions += 1;
      return {
        eventIds: ["evt_fake_domain_completed"],
        artifactHashes: [artifactHash],
        readModelChanges: [{ projectionName: "agent-test", change: "approved tool executed" }],
        resultSummary: "Approved tool executed."
      };
    }
  });
  const scheduler = createAgentScheduler({
    ledger,
    actor: schedulerActor,
    now: () => "2026-07-09T12:00:00.000Z",
    descriptors: [descriptor]
  });
  return { result: await scheduler.wake(), executions };
}

async function wakeWithDescriptor(
  toolRequestId: string,
  descriptor: AgentApprovedToolExecutorDescriptor
) {
  const ledger = new InMemoryEventLedger();
  await requestAndApprove(ledger, previewFor(toolRequestId), toolRequestId);
  const scheduler = createAgentScheduler({
    ledger,
    actor: schedulerActor,
    now: () => "2026-07-09T12:00:00.000Z",
    descriptors: [descriptor]
  });
  return { result: await scheduler.wake() };
}
