import { type KnowledgeEvent, type KnowledgeEventOf } from "../../ontology/src/contracts.js";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { describe, expect, it } from "vitest";
import {
  agentDomainExecutionFailure,
  createAgentDomainExecutionDispatcher,
  createAgentToolGateway,
  hashAgentToolPreview,
  toAgentApprovedToolExecutorDescriptor,
  type AgentApprovedToolExecutorDescriptor,
  type AgentDomainExecutionAdapter,
  type AgentDomainToolDescriptor,
  type AgentApprovalClass,
  type AgentToolPreview
} from "../src/index.js";

const agentActor = { id: "actor_cestus_agent", kind: "agent" as const, label: "Cestus Agent" };
const schedulerActor = { id: "actor_agent_scheduler", kind: "system" as const, label: "Agent Scheduler" };
const humanActor = { id: "actor_case_owner", kind: "human" as const, label: "Case Owner" };
const sourceEventId = "evt_source_review";
const inputArtifactHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const resultArtifactHash = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

describe("agent domain execution dispatcher", () => {
  it("fails closed through the scheduler when an approved request has no registered domain descriptor", async () => {
    const ledger = new InMemoryEventLedger();
    const preview = previewFor("toolreq_domain_missing_descriptor");
    await requestAndApprove(ledger, preview, "toolreq_domain_missing_descriptor");
    const dispatcher = createAgentDomainExecutionDispatcher({
      ledger,
      actor: schedulerActor,
      now: fixedNow,
      adapters: []
    });

    const result = await dispatcher.resumeApprovedDomainTools();
    const events = await ledger.readAll();

    expect(result.failedCount).toBe(1);
    expect(result.items[0]).toMatchObject({
      toolRequestId: "toolreq_domain_missing_descriptor",
      state: "failed",
      category: "permission-denied"
    });
    expect(events.filter((event) => event.type === "agent.tool.failed")).toHaveLength(1);
    expect(events.filter((event) => event.type === "agent.tool.execution.claimed")).toHaveLength(0);
    expect(events.filter((event) => event.type === "agent.tool.completed")).toHaveLength(0);
  });

  it("fails stale rebuilt previews before adapter execution", async () => {
    const ledger = new InMemoryEventLedger();
    const preview = previewFor("toolreq_domain_stale_preview");
    await requestAndApprove(ledger, preview, "toolreq_domain_stale_preview");
    let executions = 0;
    const dispatcher = createAgentDomainExecutionDispatcher({
      ledger,
      actor: schedulerActor,
      now: fixedNow,
      adapters: [adapterFor(preview, {
        async buildCurrentPreview() {
          return approvedPreviewResult({
            preview: {
              summary: "Changed accepted graph review preview.",
              relatedEventIds: [sourceEventId],
              artifactHashes: [inputArtifactHash]
            }
          });
        },
        async executeApproved() {
          executions += 1;
          throw new Error("stale previews must not execute");
        }
      })]
    });

    const result = await dispatcher.wake();
    const events = await ledger.readAll();

    expect(result.failedCount).toBe(1);
    expect(result.items[0]).toMatchObject({
      toolRequestId: "toolreq_domain_stale_preview",
      state: "failed",
      category: "approval-stale"
    });
    expect(executions).toBe(0);
    expect(events.filter((event) => event.type === "agent.tool.execution.claimed")).toHaveLength(0);
    expect(events.filter((event) => event.type === "agent.tool.completed")).toHaveLength(0);
  });

  it("preserves the landed legal-lock-active category for active lock failures", async () => {
    const lockCase = await wakeWithPreviewResult("toolreq_domain_lock_active", {
      activeLocks: [{
        lockId: "lock_export_review",
        category: "export",
        message: "Export review lock active."
      }]
    });

    expect(lockCase.result.failedCount).toBe(1);
    expect(lockCase.result.items[0]).toMatchObject({
      toolRequestId: "toolreq_domain_lock_active",
      state: "failed",
      category: "legal-lock-active"
    });
    expect(lockCase.executions).toBe(0);
    expect(lockCase.events.filter((event) => event.type === "agent.tool.execution.claimed")).toHaveLength(0);
    expect(lockCase.events.filter((event) => event.type === "agent.tool.completed")).toHaveLength(0);
  });

  it("preserves the landed provenance-missing category for missing provenance failures", async () => {
    const provenanceCase = await wakeWithPreviewResult("toolreq_domain_missing_provenance", {
      sourceEventIds: [],
      inputArtifactHashes: [],
      provenanceRefs: []
    });

    expect(provenanceCase.result.failedCount).toBe(1);
    expect(provenanceCase.result.items[0]).toMatchObject({
      toolRequestId: "toolreq_domain_missing_provenance",
      state: "failed",
      category: "provenance-missing"
    });
    expect(provenanceCase.executions).toBe(0);
    expect(provenanceCase.events.filter((event) => event.type === "agent.tool.execution.claimed")).toHaveLength(0);
    expect(provenanceCase.events.filter((event) => event.type === "agent.tool.completed")).toHaveLength(0);
  });

  it("records claims and maps successful domain adapter results through gateway completion", async () => {
    const ledger = new InMemoryEventLedger();
    const toolRequestId = "toolreq_domain_complete";
    const preview = previewFor(toolRequestId);
    const requested = await requestAndApprove(ledger, preview, toolRequestId);
    let executionInput: Parameters<AgentDomainExecutionAdapter["executeApproved"]>[0] | undefined;
    const dispatcher = createAgentDomainExecutionDispatcher({
      ledger,
      actor: schedulerActor,
      now: fixedNow,
      adapters: [adapterFor(preview, {
        async executeApproved(input) {
          executionInput = input;
          return {
            eventIds: ["evt_domain_assertion_accepted"],
            artifactHashes: [resultArtifactHash],
            readModelChanges: [{
              projectionName: "accepted-graph",
              change: "accepted reviewed assertion",
              relatedIds: ["assertion_accepted_001"]
            }],
            resultSummary: "Accepted graph review completed through domain service."
          };
        }
      })]
    });

    const result = await dispatcher.resumeApprovedDomainTools();
    const events = await ledger.readAll();
    const completed = eventOfType(events, "agent.tool.completed");

    expect(result).toMatchObject({
      examinedCount: 1,
      completedCount: 1,
      failedCount: 0
    });
    expect(result.items[0]).toMatchObject({
      toolRequestId,
      state: "completed",
      previewHash: requested.payload.previewHash,
      currentPreviewHash: requested.payload.previewHash
    });
    expect(result.items[0]?.eventIds).toHaveLength(2);
    expect(executionInput).toMatchObject({
      toolRequestId,
      toolId: domainDescriptor.toolId,
      toolVersion: domainDescriptor.toolVersion,
      sideEffectClass: domainDescriptor.sideEffectClass,
      approvalClass: domainDescriptor.requiredApprovalClass,
      approvedBy: humanActor.id,
      sourceEventIds: [sourceEventId],
      inputArtifactHashes: [inputArtifactHash],
      provenanceRefs: [sourceEventId, inputArtifactHash]
    });
    expect(events.filter((event) => event.type === "agent.tool.execution.claimed")).toHaveLength(1);
    expect(completed.payload).toMatchObject({
      toolRequestId,
      eventIds: ["evt_domain_assertion_accepted"],
      artifactHashes: [resultArtifactHash],
      resultSummary: "Accepted graph review completed through domain service.",
      readModelChanges: [{
        projectionName: "accepted-graph",
        change: "accepted reviewed assertion",
        relatedIds: ["assertion_accepted_001"]
      }]
    });
  });

  it("maps typed domain service rejections to secret-safe domain-gate-failed events after claim", async () => {
    const ledger = new InMemoryEventLedger();
    const toolRequestId = "toolreq_domain_gate_rejected";
    const preview = previewFor(toolRequestId);
    await requestAndApprove(ledger, preview, toolRequestId);
    const dispatcher = createAgentDomainExecutionDispatcher({
      ledger,
      actor: schedulerActor,
      now: fixedNow,
      adapters: [adapterFor(preview, {
        async executeApproved() {
          try {
            throw new Error("provider token should never be copied into diagnostics");
          } catch {
            throw agentDomainExecutionFailure({
              category: "domain-gate-failed",
              message: "Domain service rejected the approved request.",
              retryable: false,
              allowedActions: ["inspect domain service gate"]
            });
          }
        }
      })]
    });

    const result = await dispatcher.wake();
    const events = await ledger.readAll();
    const failed = eventOfType(events, "agent.tool.failed");
    const serializedResult = JSON.stringify(result);
    const serializedEvents = JSON.stringify(events);

    expect(result.failedCount).toBe(1);
    expect(result.completedCount).toBe(0);
    expect(result.items[0]).toMatchObject({
      toolRequestId,
      state: "failed",
      category: "domain-gate-failed",
      message: "Domain service rejected the approved request."
    });
    expect(failed.payload).toMatchObject({
      toolRequestId,
      category: "domain-gate-failed",
      message: "Domain service rejected the approved request.",
      retryable: false,
      allowedActions: ["inspect domain service gate"]
    });
    expect(events.filter((event) => event.type === "agent.tool.execution.claimed")).toHaveLength(1);
    expect(events.filter((event) => event.type === "agent.tool.completed")).toHaveLength(0);
    expect(serializedResult).not.toMatch(/provider token/i);
    expect(serializedEvents).not.toMatch(/provider token/i);
  });

  it("rejects domain adapter metadata that mismatches the descriptor family gate", () => {
    const invalidDescriptor = {
      ...domainDescriptor,
      family: "prr-correspondence"
    } as AgentDomainToolDescriptor;
    const invalidAdapter = adapterFor(previewFor("toolreq_invalid_domain_descriptor"), {
      descriptor: invalidDescriptor
    });

    expect(() => toAgentApprovedToolExecutorDescriptor(invalidAdapter)).toThrow(/approval class/i);
    expect(() => createAgentDomainExecutionDispatcher({
      ledger: new InMemoryEventLedger(),
      actor: schedulerActor,
      now: fixedNow,
      adapters: [invalidAdapter]
    })).toThrow(/approval class/i);
  });
});

const domainDescriptor: AgentDomainToolDescriptor = Object.freeze({
  toolId: "ontology.assertion.accept",
  toolVersion: "0.1.0",
  family: "accepted-graph-review",
  sideEffectClass: "ledger-review",
  requiredApprovalClass: "ledger-review",
  inputSchemaId: "ontology-assertion-accept-input.v1",
  outputSchemaId: "agent-domain-result.v1",
  targetDomainService: "ontology.assertion-service",
  idempotencyKeyFields: ["assertionId", "reviewEventId"],
  forbiddenEffects: ["prr-send", "provider-byte-transfer", "export-report"]
});

function fixedNow(): string {
  return "2026-07-09T12:00:00.000Z";
}

function previewFor(toolRequestId: string): AgentToolPreview {
  return {
    summary: `Accept reviewed assertion for ${toolRequestId}.`,
    relatedEventIds: [sourceEventId],
    artifactHashes: [inputArtifactHash],
    scope: "Accepted graph review for one previously proposed assertion.",
    estimatedEffect: "Calls the ontology assertion review service after approval is consumed."
  };
}

function adapterFor(
  preview: AgentToolPreview,
  overrides: Partial<AgentDomainExecutionAdapter> = {}
): AgentDomainExecutionAdapter {
  return {
    descriptor: domainDescriptor,
    async buildCurrentPreview() {
      return approvedPreviewResult({ preview });
    },
    async executeApproved() {
      return {
        eventIds: ["evt_domain_assertion_accepted"],
        artifactHashes: [resultArtifactHash],
        readModelChanges: [{
          projectionName: "accepted-graph",
          change: "accepted reviewed assertion",
          relatedIds: ["assertion_accepted_001"]
        }],
        resultSummary: "Accepted graph review completed through domain service."
      };
    },
    ...overrides
  };
}

function approvedPreviewResult(
  overrides: Partial<Awaited<ReturnType<AgentApprovedToolExecutorDescriptor["buildCurrentPreview"]>>> = {}
): Awaited<ReturnType<AgentApprovedToolExecutorDescriptor["buildCurrentPreview"]>> {
  return {
    preview: previewFor("toolreq_default_domain_preview"),
    sourceEventIds: [sourceEventId],
    inputArtifactHashes: [inputArtifactHash],
    provenanceRefs: [sourceEventId, inputArtifactHash],
    activeLocks: [],
    freshnessChecks: [{
      name: "agent-projection",
      expected: "high-watermark:1",
      actual: "high-watermark:1",
      ok: true
    }],
    ...overrides
  };
}

async function requestAndApprove(
  ledger: InMemoryEventLedger,
  preview: AgentToolPreview,
  toolRequestId: string
) {
  const gateway = createAgentToolGateway({ ledger, actor: agentActor, now: fixedNow });
  const requested = await gateway.requestTool({
    toolRequestId,
    residentAgentId: "agent_default",
    taskId: "task_domain_dispatcher",
    runId: "run_domain_dispatcher",
    toolId: domainDescriptor.toolId,
    toolVersion: domainDescriptor.toolVersion,
    sideEffectClass: domainDescriptor.sideEffectClass,
    requiredApprovalClass: domainDescriptor.requiredApprovalClass as AgentApprovalClass,
    preview
  });
  expect(requested.payload.previewHash).toBe(hashAgentToolPreview(preview));
  await gateway.approveTool({
    toolRequestId,
    actor: humanActor,
    approvedPreviewHash: requested.payload.previewHash,
    rationale: "Human approved the exact domain execution preview."
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
  const dispatcher = createAgentDomainExecutionDispatcher({
    ledger,
    actor: schedulerActor,
    now: fixedNow,
    adapters: [adapterFor(preview, {
      async buildCurrentPreview() {
        return approvedPreviewResult({ preview, ...previewPatch });
      },
      async executeApproved() {
        executions += 1;
        return {
          eventIds: ["evt_domain_assertion_accepted"],
          artifactHashes: [resultArtifactHash],
          readModelChanges: [{ projectionName: "accepted-graph", change: "accepted reviewed assertion" }],
          resultSummary: "Accepted graph review completed through domain service."
        };
      }
    })]
  });
  const result = await dispatcher.wake();
  return { result, executions, events: await ledger.readAll() };
}

function eventOfType<Type extends KnowledgeEvent["type"]>(
  events: readonly KnowledgeEvent[],
  type: Type
): Extract<KnowledgeEvent, { type: Type }> {
  const event = events.find((candidate): candidate is Extract<KnowledgeEvent, { type: Type }> =>
    candidate.type === type
  );
  if (event === undefined) {
    throw new Error(`Expected ${type} event`);
  }
  return event;
}
