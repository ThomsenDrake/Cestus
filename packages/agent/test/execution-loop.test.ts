import { describe, expect, it } from "vitest";
import type { AppendableKnowledgeEvent } from "../../ontology/src/contracts.js";
import { InMemoryEventLedger, type AppendOptions, type EventLedger } from "../../ontology/src/event-ledger.js";
import {
  createFakeAgentExecutionLoop,
  type FakeAgentActiveLock,
  type FakeAgentToolExecutor,
  type FakeAgentToolExecutorResult
} from "../src/execution-loop.js";

const agentActor = { id: "actor_cestus_agent", kind: "agent" as const, label: "Cestus Agent" };
const fakeDomainServiceActor = { id: "actor_fake_domain_service", kind: "system" as const, label: "Fake Domain Service" };
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

  it.each([
    ["client_secret", "a"],
    ["private_key", "b"]
  ] as const)(
    "rejects secret-shaped approval preview key %s without appending a request event",
    async (secretKey, idSuffix) => {
      const ledger = new InMemoryEventLedger();
      const loop = createFakeAgentExecutionLoop({
        ledger,
        actor: agentActor,
        now: () => "2026-07-07T23:00:00.000Z",
        executor: { async execute() { return { eventIds: [], artifactHashes: [], readModelChanges: [] }; } }
      });
      const secretValue = "redacted";

      const error = await captureError(() =>
        loop.requestApprovalOnly({
          taskId: "task_provider_readiness",
          runId: "run_provider_readiness",
          toolRequestId: `toolreq_preview_field_${idSuffix}`,
          toolId: "provider.parse.preview",
          toolVersion: 1,
          sideEffectClass: "external-byte-transfer",
          approvalClass: "provider-byte-transfer",
          preview: {
            summary: "Provider preview.",
            [secretKey]: secretValue
          }
        })
      );

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/secret-safe/i);
      expect((error as Error).message).not.toContain(secretKey);
      expect((error as Error).message).not.toContain(secretValue);
      expect(await ledger.readAll()).toEqual([]);
    }
  );

  it.each(["__proto__", "constructor"] as const)(
    "rejects unsafe preview key %s without appending or echoing unsafe data",
    async (unsafeKey) => {
      const ledger = new InMemoryEventLedger();
      const loop = createFakeAgentExecutionLoop({
        ledger,
        actor: agentActor,
        now: () => "2026-07-07T23:00:00.000Z",
        executor: { async execute() { return { eventIds: [], artifactHashes: [], readModelChanges: [] }; } }
      });
      const preview = {
        summary: "Provider preview."
      } as { summary: string; [key: string]: unknown };
      Object.defineProperty(preview, unsafeKey, {
        enumerable: true,
        value: {
          relatedEventIds: ["evt_proto_hidden"],
          scope: "Prototype-bound scope should never emit."
        }
      });

      const error = await captureError(() =>
        loop.requestApprovalOnly({
          taskId: "task_provider_readiness",
          runId: "run_provider_readiness",
          toolRequestId: `toolreq_${unsafeKey.replaceAll("_", "proto")}_preview`,
          toolId: "provider.parse.preview",
          toolVersion: 1,
          sideEffectClass: "external-byte-transfer",
          approvalClass: "provider-byte-transfer",
          preview
        })
      );

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/preview/i);
      expect((error as Error).message).not.toContain(unsafeKey);
      expect((error as Error).message).not.toContain("evt_proto_hidden");
      expect((error as Error).message).not.toContain("Prototype-bound scope");
      expect(await ledger.readAll()).toEqual([]);
    }
  );

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

  it("rejects directly appended forged resident approvals before executor resume", async () => {
    const ledger = new InMemoryEventLedger();
    let executions = 0;
    const loop = createFakeAgentExecutionLoop({
      ledger,
      actor: agentActor,
      now: () => "2026-07-07T23:00:00.000Z",
      executor: {
        async execute() {
          executions += 1;
          return {
            eventIds: ["evt_fake_domain_result"],
            artifactHashes: [],
            readModelChanges: []
          };
        }
      }
    });
    const preview = { summary: "Provider preview.", affectedRefs: ["ev_contract_001"] };
    const requested = await loop.requestApprovalOnly({
      taskId: "task_provider_readiness",
      runId: "run_provider_readiness",
      toolRequestId: "toolreq_forged_direct_resident",
      toolId: "provider.parse.preview",
      toolVersion: 1,
      sideEffectClass: "external-byte-transfer",
      approvalClass: "provider-byte-transfer",
      preview
    });

    const forgedApproval: AppendableKnowledgeEvent<"agent.tool.approved"> = {
      type: "agent.tool.approved",
      version: 1,
      streamId: "agent_tool_request_toolreq_forged_direct_resident",
      context: {
        actor: { id: "agent_default", kind: "human", label: "Forged Human Agent" },
        occurredAt: "2026-07-07T23:00:00.000Z",
        causationId: requested.eventId,
        correlationId: "corr_toolreq_forged_direct_resident",
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0", agent: "0.1.0" }
      },
      payload: {
        toolRequestId: "toolreq_forged_direct_resident",
        approvedBy: "agent_default",
        approvedPreviewHash: requested.previewHash,
        approvalClass: "provider-byte-transfer",
        rationale: "Forged resident approval.",
        approvedAt: "2026-07-07T23:00:00.000Z"
      }
    };
    await ledger.append(forgedApproval);

    let thrown: unknown;
    try {
      await loop.resumeApprovedTool({
        toolRequestId: "toolreq_forged_direct_resident",
        taskId: "task_provider_readiness",
        currentPreview: preview,
        activeLocks: []
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(/approval/i);
    expect((thrown as Error).message).not.toContain("agent_default");
    expect(executions).toBe(0);
    const events = await ledger.readAll();
    expect(events.some((event) => event.type === "agent.tool.completed")).toBe(false);
    const failedEvent = events.find((event) => event.type === "agent.tool.failed");
    expect(failedEvent?.type).toBe("agent.tool.failed");
    if (failedEvent?.type !== "agent.tool.failed") {
      throw new Error("expected failed event");
    }
    expect(failedEvent.payload.category).toBe("permission-denied");
  });

  it.each([
    ["missing", {}],
    ["wrong", { causationId: "evt_wrong_tool_request" }]
  ] as const)("rejects directly appended human-looking approvals with %s request causation before executor resume", async (_label, contextCausation) => {
    const ledger = new InMemoryEventLedger();
    let executions = 0;
    const loop = createFakeAgentExecutionLoop({
      ledger,
      actor: agentActor,
      now: () => "2026-07-07T23:00:00.000Z",
      executor: {
        async execute() {
          executions += 1;
          return {
            eventIds: ["evt_fake_domain_result"],
            artifactHashes: [],
            readModelChanges: []
          };
        }
      }
    });
    const preview = { summary: "Provider preview.", affectedRefs: ["ev_contract_001"] };
    const requested = await loop.requestApprovalOnly({
      taskId: "task_provider_readiness",
      runId: "run_provider_readiness",
      toolRequestId: `toolreq_direct_human_${_label}_causation`,
      toolId: "provider.parse.preview",
      toolVersion: 1,
      sideEffectClass: "external-byte-transfer",
      approvalClass: "provider-byte-transfer",
      preview
    });

    const approval: AppendableKnowledgeEvent<"agent.tool.approved"> = {
      type: "agent.tool.approved",
      version: 1,
      streamId: `agent_tool_request_toolreq_direct_human_${_label}_causation`,
      context: {
        actor: humanActor,
        occurredAt: "2026-07-07T23:00:00.000Z",
        ...contextCausation,
        correlationId: `corr_toolreq_direct_human_${_label}_causation`,
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0", agent: "0.1.0" }
      },
      payload: {
        toolRequestId: `toolreq_direct_human_${_label}_causation`,
        approvedBy: humanActor.id,
        approvedPreviewHash: requested.previewHash,
        approvalClass: "provider-byte-transfer",
        rationale: "Human-looking approval was appended outside the gateway.",
        approvedAt: "2026-07-07T23:00:00.000Z"
      }
    };
    await ledger.append(approval);

    const error = await captureError(() =>
      loop.resumeApprovedTool({
        toolRequestId: `toolreq_direct_human_${_label}_causation`,
        taskId: "task_provider_readiness",
        currentPreview: preview,
        activeLocks: []
      })
    );

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/approval/i);
    expect(executions).toBe(0);
    const events = await ledger.readAll();
    expect(events.some((event) => event.type === "agent.tool.completed")).toBe(false);
    const failedEvent = events.find((event) => event.type === "agent.tool.failed");
    expect(failedEvent?.type).toBe("agent.tool.failed");
    if (failedEvent?.type !== "agent.tool.failed") {
      throw new Error("expected failed event");
    }
    expect(failedEvent.payload.category).toBe("permission-denied");
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
          const domainResult = await appendFakeDomainResult(ledger, input.toolRequestId);
          return {
            eventIds: [domainResult.id],
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

  it("propagates completion lifecycle failures without reclassifying them as fake result validation", async () => {
    const inner = new InMemoryEventLedger();
    const ledger = new CompletionInterleavingLedger(inner);
    let executions = 0;
    const loop = createFakeAgentExecutionLoop({
      ledger,
      actor: agentActor,
      now: () => "2026-07-07T23:00:00.000Z",
      executor: {
        async execute(input) {
          executions += 1;
          const domainResult = await appendFakeDomainResult(inner, input.toolRequestId);
          return {
            eventIds: [domainResult.id],
            artifactHashes: [],
            readModelChanges: []
          };
        }
      }
    });
    const preview = { summary: "Provider preview.", affectedRefs: ["ev_contract_001"] };
    const requested = await loop.requestApprovalOnly({
      taskId: "task_provider_readiness",
      runId: "run_provider_readiness",
      toolRequestId: "toolreq_interleaved_completion_denial",
      toolId: "provider.parse.preview",
      toolVersion: 1,
      sideEffectClass: "external-byte-transfer",
      approvalClass: "provider-byte-transfer",
      preview
    });
    await loop.approveForTest({
      toolRequestId: "toolreq_interleaved_completion_denial",
      actor: humanActor,
      approvedPreviewHash: requested.previewHash,
      rationale: "Human approved the exact preview."
    });

    const error = await captureError(() =>
      loop.resumeApprovedTool({
        toolRequestId: "toolreq_interleaved_completion_denial",
        taskId: "task_provider_readiness",
        currentPreview: preview,
        activeLocks: []
      })
    );

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/concurrency|conflict/i);
    expect(executions).toBe(1);
    expect((await inner.readAll()).map((event) => event.type)).toEqual([
      "agent.tool.requested",
      "agent.tool.approved",
      "agent.tool.execution.claimed",
      "evidence.ingested",
      "agent.tool.denied"
    ]);
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
      "agent.tool.execution.claimed",
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

  it.each([
    "accessor-backed result field",
    "accessor-backed result array item"
  ] as const)("rejects %s without invoking getters or completing", async (caseName) => {
    const ledger = new InMemoryEventLedger();
    let resultFieldGetterCalls = 0;
    let arrayItemGetterCalls = 0;
    const toolRequestId = `toolreq_${caseName.replaceAll(" ", "_").replaceAll("-", "_")}`;
    const loop = createFakeAgentExecutionLoop({
      ledger,
      actor: agentActor,
      now: () => "2026-07-07T23:00:00.000Z",
      executor: {
        async execute() {
          if (caseName === "accessor-backed result field") {
            const result = {
              artifactHashes: [],
              readModelChanges: []
            } as unknown as FakeAgentToolExecutorResult;
            Object.defineProperty(result, "eventIds", {
              enumerable: true,
              get() {
                resultFieldGetterCalls += 1;
                return ["evt_fake_domain_result"];
              }
            });
            return result;
          }

          const eventIds = [] as string[];
          Object.defineProperty(eventIds, "0", {
            enumerable: true,
            get() {
              arrayItemGetterCalls += 1;
              return "evt_fake_domain_result";
            }
          });
          return {
            eventIds,
            artifactHashes: [],
            readModelChanges: []
          };
        }
      }
    });
    const requested = await loop.requestApprovalOnly({
      taskId: "task_provider_readiness",
      runId: "run_provider_readiness",
      toolRequestId,
      toolId: "provider.parse.preview",
      toolVersion: 1,
      sideEffectClass: "external-byte-transfer",
      approvalClass: "provider-byte-transfer",
      preview: { summary: "Provider preview.", affectedRefs: ["ev_contract_001"] }
    });
    await loop.approveForTest({
      toolRequestId,
      actor: humanActor,
      approvedPreviewHash: requested.previewHash,
      rationale: "Human approved the exact preview."
    });

    await expect(
      loop.resumeApprovedTool({
        toolRequestId,
        taskId: "task_provider_readiness",
        currentPreview: { affectedRefs: ["ev_contract_001"], summary: "Provider preview." },
        activeLocks: []
      })
    ).rejects.toThrow(/fake tool result failed validation/i);

    expect(resultFieldGetterCalls).toBe(0);
    expect(arrayItemGetterCalls).toBe(0);
    const events = await ledger.readAll();
    expect(events.map((event) => event.type)).toEqual([
      "agent.tool.requested",
      "agent.tool.approved",
      "agent.tool.execution.claimed",
      "agent.tool.failed"
    ]);
    const failedEvent = events.find((event) => event.type === "agent.tool.failed");
    expect(failedEvent?.type).toBe("agent.tool.failed");
    if (failedEvent?.type !== "agent.tool.failed") {
      throw new Error("expected failed event");
    }
    expect(failedEvent.payload.category).toBe("model-output-invalid");
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
          const domainResult = await appendFakeDomainResult(ledger, input.toolRequestId);
          return {
            eventIds: [domainResult.id],
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
    expect(failedEvent.payload.category).toBe("lock-active");
  });

  it("rejects accessor-backed active lock fields without invoking getters or executing", async () => {
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
      toolRequestId: "toolreq_accessor_lock",
      toolId: "report.export.preview",
      sideEffectClass: "export-or-publication",
      approvalClass: "export-or-publication",
      preview
    });
    await loop.approveForTest({
      toolRequestId: "toolreq_accessor_lock",
      actor: humanActor,
      approvedPreviewHash: requested.previewHash,
      rationale: "Human approved the exact preview."
    });
    let lockGetterCalls = 0;
    const activeLock = {
      category: "export",
      message: "Export review lock active."
    } as Record<string, unknown>;
    Object.defineProperty(activeLock, "lockId", {
      enumerable: true,
      get() {
        lockGetterCalls += 1;
        return "api key sk-live-value";
      }
    });

    await expect(
      loop.resumeApprovedTool({
        toolRequestId: "toolreq_accessor_lock",
        taskId: "task_export_readiness",
        currentPreview: preview,
        activeLocks: [activeLock as unknown as FakeAgentActiveLock]
      })
    ).rejects.toThrow(/lock/i);

    expect(lockGetterCalls).toBe(0);
    expect(executions).toBe(0);
    const events = await ledger.readAll();
    expect(events.some((event) => event.type === "agent.tool.completed")).toBe(false);
    const failedEvent = events.find((event) => event.type === "agent.tool.failed");
    expect(failedEvent?.type).toBe("agent.tool.failed");
    if (failedEvent?.type !== "agent.tool.failed") {
      throw new Error("expected failed event");
    }
    expect(failedEvent.payload.category).toBe("secret-detected");
    expect(failedEvent.payload.message).not.toMatch(/sk[_-]live|api key/i);
    expect(failedEvent.payload.allowedActions.join(" ")).not.toMatch(/sk[_-]live|api key/i);
  });

  it("rejects accessor-backed preview fields and array items without invoking getters", async () => {
    const ledger = new InMemoryEventLedger();
    const loop = createFakeAgentExecutionLoop({
      ledger,
      actor: agentActor,
      now: () => "2026-07-07T23:00:00.000Z",
      executor: { async execute() { return { eventIds: [], artifactHashes: [], readModelChanges: [] }; } }
    });
    let previewGetterCalls = 0;
    const accessorPreview = {
      summary: "Provider preview."
    } as { summary: string; relatedEventIds?: readonly string[] };
    Object.defineProperty(accessorPreview, "relatedEventIds", {
      enumerable: true,
      get() {
        previewGetterCalls += 1;
        return ["evt_import_001"];
      }
    });

    await expect(
      loop.requestApprovalOnly({
        taskId: "task_provider_readiness",
        runId: "run_provider_readiness",
        toolRequestId: "toolreq_accessor_preview",
        toolId: "provider.parse.preview",
        toolVersion: 1,
        sideEffectClass: "external-byte-transfer",
        approvalClass: "provider-byte-transfer",
        preview: accessorPreview
      })
    ).rejects.toThrow(/preview/i);
    expect(previewGetterCalls).toBe(0);

    let arrayGetterCalls = 0;
    const relatedEventIds = [] as string[];
    Object.defineProperty(relatedEventIds, "0", {
      enumerable: true,
      get() {
        arrayGetterCalls += 1;
        return "evt_import_001";
      }
    });

    await expect(
      loop.requestApprovalOnly({
        taskId: "task_provider_readiness",
        runId: "run_provider_readiness",
        toolRequestId: "toolreq_accessor_array_preview",
        toolId: "provider.parse.preview",
        toolVersion: 1,
        sideEffectClass: "external-byte-transfer",
        approvalClass: "provider-byte-transfer",
        preview: {
          summary: "Provider preview.",
          relatedEventIds
        }
      })
    ).rejects.toThrow(/preview/i);
    expect(arrayGetterCalls).toBe(0);
    expect(await ledger.readAll()).toEqual([]);
  });
});

class CompletionInterleavingLedger implements EventLedger {
  private injected = false;

  constructor(private readonly inner: InMemoryEventLedger) {}

  async append(event: AppendableKnowledgeEvent, options?: AppendOptions) {
    if (!this.injected && event.type === "agent.tool.completed") {
      this.injected = true;
      await this.inner.append({
        type: "agent.tool.denied",
        version: 1,
        streamId: event.streamId,
        context: {
          actor: humanActor,
          occurredAt: "2026-07-07T23:00:00.000Z",
          correlationId: "corr_interleaved_completion_denial",
          coreVersion: "0.1.0",
          packVersions: { core: "0.1.0", agent: "0.1.0" }
        },
        payload: {
          toolRequestId: event.payload.toolRequestId,
          deniedBy: humanActor.id,
          rationale: "Human denial arrived before completion append.",
          deniedAt: "2026-07-07T23:00:00.000Z",
          approvalClass: "provider-byte-transfer"
        }
      });
    }
    return this.inner.append(event, options);
  }

  readStream(streamId: string) {
    return this.inner.readStream(streamId);
  }

  readAll() {
    return this.inner.readAll();
  }
}

async function captureError(action: () => Promise<unknown>): Promise<unknown> {
  try {
    await action();
    return undefined;
  } catch (error) {
    return error;
  }
}

async function appendFakeDomainResult(ledger: InMemoryEventLedger, toolRequestId: string) {
  const claim = (await ledger.readStream(`agent_tool_request_${toolRequestId}`)).find(
    (event) => event.type === "agent.tool.execution.claimed"
  );
  if (claim === undefined) throw new Error("fake domain result requires execution claim");
  return await ledger.append({
    type: "evidence.ingested",
    version: 1,
    streamId: `evidence_fake_result_${toolRequestId}`,
    context: {
      actor: fakeDomainServiceActor,
      occurredAt: "2026-07-07T23:00:00.000Z",
      causationId: claim.id,
      correlationId: `corr_${toolRequestId}_fake_result`,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", agent: "0.1.0" }
    },
    payload: {
      evidenceId: "ev_fake_domain_result",
      source: { kind: "manual", label: "Fake domain result" },
      contentHash: "sha256:6666666666666666666666666666666666666666666666666666666666666666",
      mediaType: "application/json",
      sizeBytes: 1
    }
  });
}
