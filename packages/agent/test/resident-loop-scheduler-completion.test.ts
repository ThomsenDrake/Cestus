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
  input: { readonly evidenceId: string; readonly causationId?: string }
) {
  return await ledger.append({
    type: "evidence.ingested",
    version: 1,
    streamId: `evidence_${input.evidenceId}`,
    context: {
      actor: { id: "scheduler_completion", kind: "system", label: "Scheduler" },
      occurredAt: "2026-07-09T12:00:00.000Z",
      ...(input.causationId === undefined ? {} : { causationId: input.causationId }),
      correlationId: `corr_${input.evidenceId}`,
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
