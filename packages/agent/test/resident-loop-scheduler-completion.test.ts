import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import type { ActorRef } from "../../ontology/src/contracts.js";
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

  it("accepts a post-claim domain result through the exact frozen source lineage", async () => {
    const fixture = await prepareCompletionFixture();
    const domainResult = await appendEvidence(fixture.ledger, {
      evidenceId: "ev_completion_domain_result",
      causationId: fixture.source.id
    });

    await expect(fixture.adapter.reread({
      ...fixture.command,
      result: {
        eventIds: [domainResult.id],
        artifactHashes: [],
        readModelChanges: [],
        resultSummary: "Domain result retained its existing provenance chain."
      }
    })).resolves.toMatchObject({ toolRequestId: fixture.command.toolRequestId });
  });

  it("rejects post-claim ordering without the exact frozen source lineage", async () => {
    const fixture = await prepareCompletionFixture();
    const unrelated = await appendEvidence(fixture.ledger, { evidenceId: "ev_unrelated_source" });
    const domainResult = await appendEvidence(fixture.ledger, {
      evidenceId: "ev_unrelated_domain_result",
      causationId: unrelated.id
    });

    await expect(fixture.adapter.reread({
      ...fixture.command,
      result: {
        eventIds: [domainResult.id],
        artifactHashes: [],
        readModelChanges: [],
        resultSummary: "Unrelated post-claim domain result."
      }
    })).rejects.toThrow(/causal domain result evidence/i);
  });

  it.each([
    ["the resident agent", { id: "agent_default", kind: "agent", label: "Cestus Agent" }],
    ["the exact claiming actor", { id: "scheduler_completion", kind: "system", label: "Scheduler" }]
  ] as const)("rejects non-agent result evidence authored by %s", async (_label, actor) => {
    const fixture = await prepareCompletionFixture();
    const selfMintedResult = await appendEvidence(fixture.ledger, {
      evidenceId: `ev_completion_self_minted_${actor.id}`,
      causationId: fixture.command.executionClaimEventId,
      actor
    });

    await expect(fixture.adapter.reread({
      ...fixture.command,
      result: {
        eventIds: [selfMintedResult.id],
        artifactHashes: [],
        readModelChanges: [],
        resultSummary: "Self-minted non-agent event must not become completion authority."
      }
    })).rejects.toThrow(/causal domain result evidence/i);

    expect((await fixture.ledger.readStream(`agent_tool_request_${fixture.command.toolRequestId}`)).some(
      (event) => event.type === "agent.tool.completed"
    )).toBe(false);
  });

  it.each(["B-before-A", "A-before-B"] as const)(
    "rejects a B-correlated shared-source result submitted to A when claims are %s",
    async (claimOrder) => {
      const fixture = await prepareOverlappingCompletionFixtures(claimOrder);
      const bResult = await appendEvidence(fixture.ledger, {
        evidenceId: `ev_completion_cross_request_${claimOrder}`,
        causationId: fixture.source.id,
        correlationId: fixture.requestB.context.correlationId
      });

      await expect(fixture.adapter.reread({
        ...fixture.commandA,
        result: {
          eventIds: [bResult.id],
          artifactHashes: [],
          readModelChanges: [],
          resultSummary: "B-correlated evidence cannot terminalize request A."
        }
      })).rejects.toThrow(/causal domain result evidence/i);

      expect((await fixture.ledger.readStream(`agent_tool_request_${fixture.commandA.toolRequestId}`)).some(
        (event) => event.type === "agent.tool.completed"
      )).toBe(false);
    }
  );

  it("rejects an indirect result correlated to a terminalized competing request", async () => {
    const fixture = await prepareOverlappingCompletionFixtures("B-before-A");
    await fixture.schedulerGateway.failTool({
      toolRequestId: fixture.requestB.payload.toolRequestId,
      category: "domain-gate-failed",
      message: "Request B cannot complete its domain effect.",
      retryable: false,
      allowedActions: ["open a fresh tool request"]
    });
    const bResult = await appendEvidence(fixture.ledger, {
      evidenceId: "ev_completion_terminal_b_correlation",
      causationId: fixture.source.id,
      correlationId: fixture.requestB.context.correlationId
    });

    await expect(fixture.adapter.reread({
      ...fixture.commandA,
      result: {
        eventIds: [bResult.id],
        artifactHashes: [],
        readModelChanges: [],
        resultSummary: "A result cannot claim terminal request B correlation."
      }
    })).rejects.toThrow(/causal domain result evidence/i);
  });
});

async function prepareCompletionFixture() {
  const ledger = new InMemoryEventLedger();
  const now = () => "2026-07-09T12:00:00.000Z";
  const source = await appendEvidence(ledger, { evidenceId: "ev_completion_source" });
  const agentGateway = createAgentToolGateway({
    ledger,
    actor: { id: "agent_default", kind: "agent", label: "Cestus Agent" },
    now
  });
  const schedulerGateway = createAgentToolGateway({
    ledger,
    actor: { id: "scheduler_completion", kind: "system", label: "Scheduler" },
    now
  });
  const requested = await agentGateway.requestTool({
    toolRequestId: "toolreq_completion_lineage",
    residentAgentId: "agent_default",
    taskId: "task_completion",
    runId: "run_completion",
    toolId: "agent.test.effect",
    toolVersion: "1.0.0",
    sideEffectClass: "ledger-review",
    requiredApprovalClass: "ledger-review",
    preview: { summary: "Approve the exact completion lineage test.", relatedEventIds: [source.id] }
  });
  await schedulerGateway.approveTool({
    toolRequestId: requested.payload.toolRequestId,
    approvedPreviewHash: requested.payload.previewHash,
    actor: { id: "human_completion", kind: "human", label: "Reviewer" },
    rationale: "Approved the exact completion lineage test."
  });
  const claim = await schedulerGateway.claimExecution({
    toolRequestId: requested.payload.toolRequestId,
    approvedPreviewHash: requested.payload.previewHash,
    leaseExpiresAt: "2026-07-09T12:05:00.000Z"
  });
  return {
    ledger,
    source,
    adapter: createResidentLoopSchedulerCompletionAdapter({ ledger }),
    command: {
      toolRequestId: requested.payload.toolRequestId,
      runId: "run_completion",
      toolId: "agent.test.effect",
      toolVersion: "1.0.0",
      approvedPreviewHash: requested.payload.previewHash,
      executionClaimEventId: claim.id
    }
  };
}

async function appendEvidence(
  ledger: InMemoryEventLedger,
  input: {
    readonly evidenceId: string;
    readonly causationId?: string;
    readonly correlationId?: string;
    readonly actor?: ActorRef;
  }
) {
  return await ledger.append({
    type: "evidence.ingested",
    version: 1,
    streamId: `evidence_${input.evidenceId}`,
    context: {
      actor: input.actor ?? domainServiceActor,
      occurredAt: "2026-07-09T12:00:00.000Z",
      ...(input.causationId === undefined ? {} : { causationId: input.causationId }),
      correlationId: input.correlationId ?? `corr_${input.evidenceId}`,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", agent: "0.1.0" }
    },
    payload: {
      evidenceId: input.evidenceId,
      source: { kind: "manual", label: "Completion lineage evidence" },
      contentHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      mediaType: "application/json",
      sizeBytes: 1
    }
  });
}

const domainServiceActor: ActorRef = {
  id: "domain_completion_service",
  kind: "system",
  label: "Completion Domain Service"
};

async function prepareOverlappingCompletionFixtures(claimOrder: "B-before-A" | "A-before-B") {
  const ledger = new InMemoryEventLedger();
  const now = () => "2026-07-09T12:00:00.000Z";
  const source = await appendEvidence(ledger, { evidenceId: "ev_completion_shared_source" });
  const agentGateway = createAgentToolGateway({
    ledger,
    actor: { id: "agent_default", kind: "agent", label: "Cestus Agent" },
    now
  });
  const schedulerGateway = createAgentToolGateway({
    ledger,
    actor: { id: "scheduler_completion", kind: "system", label: "Scheduler" },
    now
  });
  const requestA = await agentGateway.requestTool({
    toolRequestId: "toolreq_completion_overlap_a",
    residentAgentId: "agent_default",
    taskId: "task_completion_overlap_a",
    runId: "run_completion_overlap_a",
    toolId: "agent.test.effect",
    toolVersion: "1.0.0",
    sideEffectClass: "ledger-review",
    requiredApprovalClass: "ledger-review",
    preview: { summary: "Approve completion request A.", relatedEventIds: [source.id] }
  });
  const requestB = await agentGateway.requestTool({
    toolRequestId: "toolreq_completion_overlap_b",
    residentAgentId: "agent_default",
    taskId: "task_completion_overlap_b",
    runId: "run_completion_overlap_b",
    toolId: "agent.test.effect",
    toolVersion: "1.0.0",
    sideEffectClass: "ledger-review",
    requiredApprovalClass: "ledger-review",
    preview: { summary: "Approve completion request B.", relatedEventIds: [source.id] }
  });
  for (const request of [requestA, requestB]) {
    await schedulerGateway.approveTool({
      toolRequestId: request.payload.toolRequestId,
      approvedPreviewHash: request.payload.previewHash,
      actor: { id: "human_completion", kind: "human", label: "Reviewer" },
      rationale: "Approved the exact overlapping completion request."
    });
  }
  const claimed = new Map<string, string>();
  for (const request of claimOrder === "B-before-A" ? [requestB, requestA] : [requestA, requestB]) {
    const claim = await schedulerGateway.claimExecution({
      toolRequestId: request.payload.toolRequestId,
      approvedPreviewHash: request.payload.previewHash,
      leaseExpiresAt: "2026-07-09T12:05:00.000Z"
    });
    claimed.set(request.payload.toolRequestId, claim.id);
  }

  return {
    ledger,
    source,
    requestB,
    schedulerGateway,
    adapter: createResidentLoopSchedulerCompletionAdapter({ ledger }),
    commandA: {
      toolRequestId: requestA.payload.toolRequestId,
      runId: requestA.payload.runId,
      toolId: requestA.payload.toolId,
      toolVersion: requestA.payload.toolVersion,
      approvedPreviewHash: requestA.payload.previewHash,
      executionClaimEventId: claimed.get(requestA.payload.toolRequestId)!
    }
  };
}
