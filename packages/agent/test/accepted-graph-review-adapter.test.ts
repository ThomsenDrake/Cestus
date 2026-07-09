import { describe, expect, it, vi } from "vitest";
import {
  AssertionService,
  InMemoryEventLedger,
  type ActorRef,
  type AppendableKnowledgeEvent,
  type EventLedger,
  type KnowledgeEvent,
  type KnowledgeEventOf
} from "../../ontology/src/index.js";
import {
  acceptedGraphAssertionReviewDescriptor,
  acceptedGraphReviewDescriptors,
  buildAcceptedGraphReviewApprovalPreview,
  createAcceptedGraphAssertionReviewAdapter,
  rebuildAcceptedGraphReviewCurrentPreview,
  type AcceptedGraphReviewAdapterContext
} from "../src/adapters/accepted-graph-review.js";
import { createAgentDomainExecutionDispatcher } from "../src/domain-execution-dispatcher.js";
import type { AgentApprovedToolExecutionInput } from "../src/scheduler-types.js";
import { createAgentToolGateway, hashAgentToolPreview } from "../src/tool-gateway.js";

const evidenceHash = "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" as const;
const changedEvidenceHash = "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" as const;
const reviewer = { id: "actor_graph_reviewer", kind: "human", label: "Graph reviewer" } as const;
const agentReviewer = { id: "agent_default", kind: "agent", label: "Resident agent" } as const;
const schedulerActor = { id: "actor_graph_scheduler", kind: "system", label: "Graph scheduler" } as const;
const extractor = { id: "actor_graph_extractor", kind: "extractor", label: "Graph extractor" } as const;
const ontologyPackVersions = { core: "0.1.0" } as const;

describe("accepted graph review adapter", () => {
  it("builds an evidence-bound assertion acceptance preview with projected graph impact", async () => {
    const prepared = await prepareAssertionReview();

    const preview = buildAcceptedGraphReviewApprovalPreview(previewInput(prepared));

    expect(preview).toMatchObject({
      toolId: "ontology.assertion.accept",
      toolVersion: "0.1.0",
      sideEffectClass: "ledger-review",
      requiredApprovalClass: "ledger-review",
      targetDomainService: "ontology.assertion-service",
      assertionId: prepared.assertionId,
      proposalEventId: prepared.proposal.id,
      evidenceId: prepared.evidence.payload.evidenceId,
      evidenceEventId: prepared.evidence.id,
      evidenceContentHash: prepared.evidence.payload.contentHash,
      currentReviewState: "proposed",
      reviewerRationaleDraft: "The source directly supports the proposed agency name.",
      ontologyPackVersions,
      projectedGraphImpact: expect.stringContaining("agency.name")
    });
    expect(preview.relatedEventIds).toEqual([prepared.proposal.id, prepared.evidence.id]);
    expect(preview.artifactHashes).toEqual([prepared.evidence.payload.contentHash]);
    expect(preview.affectedRefs).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "assertion", id: prepared.assertionId, eventId: prepared.proposal.id }),
      expect.objectContaining({
        kind: "evidence",
        id: prepared.evidence.payload.evidenceId,
        eventId: prepared.evidence.id,
        hash: prepared.evidence.payload.contentHash
      })
    ]));
    expect(preview.expectedOutputs).toEqual([{ kind: "event", type: "assertion.accepted" }]);
  });

  it("rejects unknown or swapped tool metadata at the public preview boundary", async () => {
    const prepared = await prepareAssertionReview();
    const input = previewInput(prepared);

    expect(() => buildAcceptedGraphReviewApprovalPreview({
      ...input,
      toolId: "ontology.relationship.accept"
    })).toThrow(/canonical accepted graph review tool descriptor/i);
    expect(() => buildAcceptedGraphReviewApprovalPreview({
      ...input,
      toolVersion: "9.9.9"
    })).toThrow(/canonical accepted graph review tool descriptor/i);
  });

  it("rejects missing, stale, swapped, or forged assertion and provenance bindings", async () => {
    const first = await prepareAssertionReview();
    const second = await prepareAssertionReview({
      assertionId: "as_graph_review_other",
      evidenceId: "ev_graph_review_other"
    });
    const input = previewInput(first);

    expect(() => buildAcceptedGraphReviewApprovalPreview({
      ...input,
      assertionId: "as_graph_review_missing"
    })).toThrow(/assertion id/i);
    expect(() => buildAcceptedGraphReviewApprovalPreview({
      ...input,
      proposalEventId: second.proposal.id
    })).toThrow(/proposal event id/i);
    expect(() => buildAcceptedGraphReviewApprovalPreview({
      ...input,
      proposalEvent: second.proposal
    })).toThrow(/assertion id|proposal event/i);
    expect(() => buildAcceptedGraphReviewApprovalPreview({
      ...input,
      evidenceId: second.evidence.payload.evidenceId
    })).toThrow(/evidence id/i);
    expect(() => buildAcceptedGraphReviewApprovalPreview({
      ...input,
      evidenceEventId: second.evidence.id
    })).toThrow(/evidence event id/i);
    expect(() => buildAcceptedGraphReviewApprovalPreview({
      ...input,
      evidenceEvent: second.evidence
    })).toThrow(/evidence id|evidence event/i);
    expect(() => buildAcceptedGraphReviewApprovalPreview({
      ...input,
      evidenceContentHash: changedEvidenceHash
    })).toThrow(/evidence content hash/i);
    expect(() => buildAcceptedGraphReviewApprovalPreview({
      ...input,
      ontologyPackVersions: { core: "9.9.9" }
    })).toThrow(/ontology pack versions/i);
    const { proposalEventId: _proposalEventId, ...missingProposalEventId } = input;
    expect(() => buildAcceptedGraphReviewApprovalPreview(missingProposalEventId as never)).toThrow(/missing proposalEventId/i);
    expect(() => buildAcceptedGraphReviewApprovalPreview({
      ...input,
      evidenceContentHash: "sha256:forged" as `sha256:${string}`
    })).toThrow(/sha-256 hash/i);
  });

  it("rejects hostile DTO shapes without invoking getters", async () => {
    const prepared = await prepareAssertionReview();
    let getterCalls = 0;
    const symbolKey = Symbol("accepted-graph-shadow");
    const input = previewInput(prepared) as unknown as Record<PropertyKey, unknown>;
    Object.defineProperty(input, "extra", {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("top-level getter invoked");
      }
    });
    Object.defineProperty(input, symbolKey, {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("symbol getter invoked");
      }
    });

    expect(() => buildAcceptedGraphReviewApprovalPreview(input as never)).toThrow(/symbol-keyed|unsupported|data properties/i);
    expect(getterCalls).toBe(0);

    const nested = previewInput(prepared) as unknown as Record<string, unknown>;
    const packVersions = { core: "0.1.0" } as Record<string, unknown>;
    Object.defineProperty(packVersions, "shadow", {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("nested getter invoked");
      }
    });
    Object.defineProperty(nested, "ontologyPackVersions", {
      enumerable: true,
      configurable: true,
      value: packVersions
    });

    expect(() => buildAcceptedGraphReviewApprovalPreview(nested as never)).toThrow(/data properties/i);
    expect(getterCalls).toBe(0);
  });

  it("rejects secret-shaped assertion material before deriving graph-impact preview text", async () => {
    const prepared = await prepareAssertionReview();
    const unsafeProposal = {
      ...prepared.proposal,
      payload: {
        ...prepared.proposal.payload,
        predicate: "password"
      }
    };

    expect(() => buildAcceptedGraphReviewApprovalPreview({
      ...previewInput(prepared),
      proposalEvent: unsafeProposal
    })).toThrow(/secret-safe/i);
  });

  it("marks accepted, missing, superseded, and evidence-changed assertions stale", async () => {
    const accepted = await prepareAssertionReview();
    await accepted.service.accept({
      assertionId: accepted.assertionId,
      acceptedBy: reviewer.id,
      rationale: "Reviewed before the resident-agent request resumed.",
      actor: reviewer
    });
    const acceptedCurrent = await rebuildAcceptedGraphReviewCurrentPreview(rebuildInput(accepted));
    expect(acceptedCurrent.preview.currentReviewState).toBe("accepted");
    expect(acceptedCurrent.freshnessChecks).toContainEqual(expect.objectContaining({
      name: "assertion-review-state",
      expected: "proposed",
      actual: "accepted",
      ok: false
    }));

    const missing = await prepareAssertionReview();
    const missingLedger = new InMemoryEventLedger();
    const missingCurrent = await rebuildAcceptedGraphReviewCurrentPreview(rebuildInput({
      ...missing,
      ledger: missingLedger,
      service: new AssertionService({ ledger: missingLedger })
    }));
    expect(missingCurrent.preview.currentReviewState).toBe("missing");
    expect(missingCurrent.freshnessChecks).toContainEqual(expect.objectContaining({
      name: "assertion-review-state",
      actual: "missing",
      ok: false
    }));

    const superseded = await prepareAssertionReview();
    const supersededLedger = ledgerWithSupersession(superseded.ledger, superseded.assertionId, superseded.proposal.id);
    const supersededCurrent = await rebuildAcceptedGraphReviewCurrentPreview(rebuildInput({
      ...superseded,
      ledger: supersededLedger,
      service: new AssertionService({ ledger: supersededLedger })
    }));
    expect(supersededCurrent.preview.currentReviewState).toBe("superseded");
    expect(supersededCurrent.freshnessChecks).toContainEqual(expect.objectContaining({
      name: "assertion-review-state",
      actual: "superseded",
      ok: false
    }));

    const changed = await prepareAssertionReview();
    const changedEvidence = await changed.ledger.append(evidenceEvent(
      changed.evidence.payload.evidenceId,
      changedEvidenceHash,
      "2026-07-09T19:45:00.000Z"
    ));
    const changedCurrent = await rebuildAcceptedGraphReviewCurrentPreview(rebuildInput(changed));
    expect(changedCurrent.preview.evidenceEventId).toBe(changedEvidence.id);
    expect(changedCurrent.preview.evidenceContentHash).toBe(changedEvidenceHash);
    expect(changedCurrent.freshnessChecks).toContainEqual({
      name: "evidence-content-hash",
      expected: evidenceHash,
      actual: changedEvidenceHash,
      ok: false
    });
  });

  it("reports and enforces active resident-agent locks at consume time", async () => {
    const prepared = await prepareAssertionReview();
    const previewHash = hashAgentToolPreview(buildAcceptedGraphReviewApprovalPreview(previewInput(prepared)));
    await prepared.ledger.append({
      type: "agent.lock.activated",
      version: 1,
      streamId: "agent_lock_lock_accepted_graph_review",
      context: {
        actor: reviewer,
        occurredAt: fixedNow(),
        correlationId: "corr_lock_accepted_graph_review",
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0", agent: "0.1.0" }
      },
      payload: {
        lockId: "lock_accepted_graph_review",
        residentAgentId: "agent_default",
        kind: "governance",
        activatedBy: reviewer.id,
        reason: "Governance review must finish before graph acceptance."
      }
    });

    const current = await rebuildAcceptedGraphReviewCurrentPreview(rebuildInput(prepared));
    expect(current.activeLocks).toEqual([{
      lockId: "lock_accepted_graph_review",
      category: "governance",
      message: "Governance review must finish before graph acceptance."
    }]);
    await expect(
      createAcceptedGraphAssertionReviewAdapter(adapterContext(prepared)).executeApproved(
        executionInput(prepared, previewHash)
      )
    ).rejects.toMatchObject({ category: "lock-active" });
    expect((await prepared.ledger.readAll()).filter((event) => event.type === "assertion.accepted")).toHaveLength(0);
  });

  it("calls AssertionService.accept and maps the exact accepted event and graph change", async () => {
    const prepared = await prepareAssertionReview();
    const accept = vi.spyOn(prepared.service, "accept");
    const adapter = createAcceptedGraphAssertionReviewAdapter(adapterContext(prepared));
    const preview = buildAcceptedGraphReviewApprovalPreview(previewInput(prepared));
    const previewHash = hashAgentToolPreview(preview);

    const result = await adapter.executeApproved(executionInput(prepared, previewHash));
    const events = await prepared.ledger.readStream(`assertion_${prepared.assertionId}`);
    const accepted = events.find((event): event is KnowledgeEventOf<"assertion.accepted"> =>
      event.type === "assertion.accepted"
    );

    expect(accept).toHaveBeenCalledOnce();
    expect(accept).toHaveBeenCalledWith({
      assertionId: prepared.assertionId,
      acceptedBy: reviewer.id,
      rationale: "The source directly supports the proposed agency name.",
      actor: reviewer
    });
    expect(accepted).toBeDefined();
    expect(result.eventIds).toEqual([accepted?.id]);
    expect(result.artifactHashes).toEqual([]);
    expect(result.readModelChanges).toEqual([{
      projectionName: "ontology-graph",
      change: `accepted assertion ${prepared.assertionId}`,
      relatedIds: [prepared.assertionId, prepared.evidence.payload.evidenceId]
    }]);
    expect(accepted?.context.causationId).toBe(prepared.proposal.id);
    expect(accepted?.context.actor).toEqual(reviewer);
  });

  it("completes through the scheduler and gateway with exact domain event evidence", async () => {
    const prepared = await prepareAssertionReview();
    const preview = buildAcceptedGraphReviewApprovalPreview(previewInput(prepared));
    const gateway = createAgentToolGateway({
      ledger: prepared.ledger,
      actor: agentReviewer,
      now: fixedNow
    });
    const requested = await gateway.requestTool({
      toolRequestId: "toolreq_accept_graph_assertion",
      residentAgentId: "agent_default",
      taskId: "task_accept_graph_assertion",
      runId: "run_accept_graph_assertion",
      toolId: acceptedGraphAssertionReviewDescriptor.toolId,
      toolVersion: acceptedGraphAssertionReviewDescriptor.toolVersion,
      sideEffectClass: acceptedGraphAssertionReviewDescriptor.sideEffectClass,
      requiredApprovalClass: "ledger-review",
      preview
    });
    await gateway.approveTool({
      toolRequestId: requested.payload.toolRequestId,
      approvedPreviewHash: requested.payload.previewHash,
      actor: reviewer,
      rationale: "Approve the exact evidence-backed assertion review."
    });
    const dispatcher = createAgentDomainExecutionDispatcher({
      ledger: prepared.ledger,
      actor: schedulerActor,
      now: fixedNow,
      adapters: [createAcceptedGraphAssertionReviewAdapter(adapterContext(prepared))]
    });

    const result = await dispatcher.wake();
    const events = await prepared.ledger.readAll();
    expect(result).toMatchObject({ completedCount: 1, failedCount: 0 });
    const accepted = eventOfType(events, "assertion.accepted");
    const completed = eventOfType(events, "agent.tool.completed");

    expect(completed.payload.eventIds).toEqual([accepted.id]);
    expect(completed.payload.readModelChanges).toEqual([{
      projectionName: "ontology-graph",
      change: `accepted assertion ${prepared.assertionId}`,
      relatedIds: [prepared.assertionId, prepared.evidence.payload.evidenceId]
    }]);
    expect(accepted.context.causationId).toBe(prepared.proposal.id);
    expect(prepared.proposal.context.causationId).toBe(prepared.evidence.id);
  });

  it("rejects agent reviewers and approval actors that do not match the domain reviewer", async () => {
    const prepared = await prepareAssertionReview();

    expect(() => createAcceptedGraphAssertionReviewAdapter({
      ...adapterContext(prepared),
      reviewer: agentReviewer
    })).toThrow(/human domain review actor/i);

    const adapter = createAcceptedGraphAssertionReviewAdapter(adapterContext(prepared));
    const previewHash = hashAgentToolPreview(buildAcceptedGraphReviewApprovalPreview(previewInput(prepared)));
    await expect(adapter.executeApproved({
      ...executionInput(prepared, previewHash),
      approvedBy: "actor_other_reviewer"
    })).rejects.toMatchObject({
      category: "permission-denied"
    });
  });

  it("rejects forged preview, source-event, evidence-hash, and provenance execution inputs", async () => {
    const prepared = await prepareAssertionReview();
    const adapter = createAcceptedGraphAssertionReviewAdapter(adapterContext(prepared));
    const previewHash = hashAgentToolPreview(buildAcceptedGraphReviewApprovalPreview(previewInput(prepared)));
    const valid = executionInput(prepared, previewHash);

    await expect(adapter.executeApproved({
      ...valid,
      approvedPreviewHash: "sha256:not-a-hash"
    })).rejects.toMatchObject({ category: "approval-stale" });
    await expect(adapter.executeApproved({
      ...valid,
      approvedPreviewHash: changedEvidenceHash
    })).rejects.toMatchObject({ category: "approval-stale" });
    await expect(adapter.executeApproved({
      ...valid,
      previewHash: changedEvidenceHash,
      approvedPreviewHash: changedEvidenceHash
    })).rejects.toMatchObject({ category: "approval-stale" });
    await expect(adapter.executeApproved({
      ...valid,
      toolId: "ontology.entity.resolve"
    })).rejects.toMatchObject({ category: "permission-denied" });
    await expect(adapter.executeApproved({
      ...valid,
      sourceEventIds: [prepared.evidence.id, prepared.proposal.id]
    })).rejects.toMatchObject({ category: "approval-stale" });
    await expect(adapter.executeApproved({
      ...valid,
      sourceEventIds: [prepared.proposal.id]
    })).rejects.toMatchObject({ category: "approval-stale" });
    await expect(adapter.executeApproved({
      ...valid,
      inputArtifactHashes: [changedEvidenceHash]
    })).rejects.toMatchObject({ category: "approval-stale" });
    await expect(adapter.executeApproved({
      ...valid,
      provenanceRefs: [prepared.assertionId, prepared.proposal.id]
    })).rejects.toMatchObject({ category: "provenance-missing" });
  });

  it("rejects hostile approved-execution DTO fields without invoking getters", async () => {
    const prepared = await prepareAssertionReview();
    const adapter = createAcceptedGraphAssertionReviewAdapter(adapterContext(prepared));
    const previewHash = hashAgentToolPreview(buildAcceptedGraphReviewApprovalPreview(previewInput(prepared)));
    const input = executionInput(prepared, previewHash) as unknown as Record<PropertyKey, unknown>;
    let getterCalls = 0;
    Object.defineProperty(input, "shadow", {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("execution getter invoked");
      }
    });

    await expect(adapter.executeApproved(input as never)).rejects.toBeDefined();
    expect(getterCalls).toBe(0);
  });

  it("rejects changed reviewer rationale as stale review input", async () => {
    const prepared = await prepareAssertionReview();
    const approvedPreview = buildAcceptedGraphReviewApprovalPreview(previewInput(prepared));
    const adapter = createAcceptedGraphAssertionReviewAdapter({
      ...adapterContext(prepared),
      reviewerRationaleDraft: "A different rationale was supplied after approval."
    });

    await expect(adapter.executeApproved(
      executionInput(prepared, hashAgentToolPreview(approvedPreview))
    )).rejects.toMatchObject({ category: "approval-stale" });
  });

  it("returns the original accepted event idempotently without duplicate accepted graph events", async () => {
    const prepared = await prepareAssertionReview();
    const adapter = createAcceptedGraphAssertionReviewAdapter(adapterContext(prepared));
    const previewHash = hashAgentToolPreview(buildAcceptedGraphReviewApprovalPreview(previewInput(prepared)));
    const input = executionInput(prepared, previewHash);

    const first = await adapter.executeApproved(input);
    const second = await adapter.executeApproved(input);
    const events = await prepared.ledger.readStream(`assertion_${prepared.assertionId}`);

    expect(second.eventIds).toEqual(first.eventIds);
    expect(events.filter((event) => event.type === "assertion.accepted")).toHaveLength(1);

    await expect(adapter.executeApproved({
      ...input,
      previewHash: changedEvidenceHash,
      approvedPreviewHash: changedEvidenceHash
    })).rejects.toMatchObject({ category: "approval-stale" });
  });

  it("returns one accepted event for concurrent approved retries", async () => {
    const prepared = await prepareAssertionReview();
    const adapter = createAcceptedGraphAssertionReviewAdapter(adapterContext(prepared));
    const previewHash = hashAgentToolPreview(buildAcceptedGraphReviewApprovalPreview(previewInput(prepared)));
    const input = executionInput(prepared, previewHash);

    const [first, second] = await Promise.all([
      adapter.executeApproved(input),
      adapter.executeApproved(input)
    ]);
    const events = await prepared.ledger.readStream(`assertion_${prepared.assertionId}`);

    expect(second.eventIds).toEqual(first.eventIds);
    expect(events.filter((event) => event.type === "assertion.accepted")).toHaveLength(1);
  });

  it("registers assertion acceptance only until relationship and entity review services exist", () => {
    expect(acceptedGraphReviewDescriptors).toEqual([acceptedGraphAssertionReviewDescriptor]);
    expect(acceptedGraphReviewDescriptors.map((descriptor) => descriptor.toolId)).toEqual([
      "ontology.assertion.accept"
    ]);
    expect(acceptedGraphReviewDescriptors.map((descriptor) => descriptor.toolId)).not.toContain(
      "ontology.relationship.accept"
    );
    expect(acceptedGraphReviewDescriptors.map((descriptor) => descriptor.toolId)).not.toContain(
      "ontology.entity.resolve"
    );
  });
});

interface PreparedAssertionReview {
  readonly ledger: EventLedger;
  readonly service: AssertionService;
  readonly assertionId: string;
  readonly evidence: KnowledgeEventOf<"evidence.ingested">;
  readonly proposal: KnowledgeEventOf<"assertion.proposed">;
}

async function prepareAssertionReview(
  overrides: { readonly assertionId?: string; readonly evidenceId?: string } = {}
): Promise<PreparedAssertionReview> {
  const ledger = new InMemoryEventLedger();
  const service = new AssertionService({ ledger });
  const assertionId = overrides.assertionId ?? "as_graph_review_agency_name";
  const evidenceId = overrides.evidenceId ?? "ev_graph_review_agency_pdf";
  const evidence = await ledger.append(evidenceEvent(evidenceId, evidenceHash));
  if (evidence.type !== "evidence.ingested") {
    throw new Error("Expected evidence.ingested fixture event");
  }
  const proposal = await service.propose({
    assertionId,
    evidenceId,
    subjectRef: "ent_graph_review_agency",
    predicate: "agency.name",
    object: "Graph Review Agency",
    confidence: 0.94,
    actor: extractor
  });
  return { ledger, service, assertionId, evidence, proposal };
}

function evidenceEvent(
  evidenceId: string,
  contentHash: `sha256:${string}`,
  occurredAt = "2026-07-09T19:30:00.000Z"
): AppendableKnowledgeEvent<"evidence.ingested"> {
  return {
    type: "evidence.ingested",
    version: 1,
    streamId: `evidence_${evidenceId}`,
    context: {
      actor: { id: "actor_fixture", kind: "system", label: "Accepted graph fixture" },
      occurredAt,
      correlationId: `corr_${evidenceId}`,
      coreVersion: "0.1.0",
      packVersions: ontologyPackVersions
    },
    payload: {
      evidenceId,
      source: { kind: "file", label: `${evidenceId}.pdf` },
      contentHash,
      mediaType: "application/pdf",
      sizeBytes: 256
    }
  };
}

function fixedNow(): string {
  return "2026-07-09T20:00:00.000Z";
}

function previewInput(
  prepared: PreparedAssertionReview
): Parameters<typeof buildAcceptedGraphReviewApprovalPreview>[0] {
  return {
    toolRequestId: "toolreq_accept_graph_assertion",
    toolId: acceptedGraphAssertionReviewDescriptor.toolId,
    toolVersion: acceptedGraphAssertionReviewDescriptor.toolVersion,
    runId: "run_accept_graph_assertion",
    taskId: "task_accept_graph_assertion",
    residentAgentId: "agent_default",
    assertionId: prepared.assertionId,
    proposalEventId: prepared.proposal.id,
    evidenceId: prepared.evidence.payload.evidenceId,
    evidenceEventId: prepared.evidence.id,
    evidenceContentHash: prepared.evidence.payload.contentHash as `sha256:${string}`,
    proposalEvent: prepared.proposal,
    evidenceEvent: prepared.evidence,
    reviewerRationaleDraft: "The source directly supports the proposed agency name.",
    ontologyPackVersions
  };
}

function adapterContext(prepared: PreparedAssertionReview): AcceptedGraphReviewAdapterContext {
  return {
    ledger: prepared.ledger,
    assertionService: prepared.service,
    reviewer,
    residentAgentId: "agent_default",
    taskId: "task_accept_graph_assertion",
    assertionId: prepared.assertionId,
    proposalEventId: prepared.proposal.id,
    evidenceId: prepared.evidence.payload.evidenceId,
    evidenceEventId: prepared.evidence.id,
    evidenceContentHash: prepared.evidence.payload.contentHash as `sha256:${string}`,
    reviewerRationaleDraft: "The source directly supports the proposed agency name.",
    ontologyPackVersions
  };
}

function rebuildInput(prepared: PreparedAssertionReview) {
  return {
    ...adapterContext(prepared),
    ledger: prepared.ledger,
    toolRequestId: "toolreq_accept_graph_assertion",
    toolId: acceptedGraphAssertionReviewDescriptor.toolId,
    toolVersion: acceptedGraphAssertionReviewDescriptor.toolVersion,
    runId: "run_accept_graph_assertion",
    taskId: "task_accept_graph_assertion"
  };
}

function executionInput(
  prepared: PreparedAssertionReview,
  previewHash: `sha256:${string}`
): AgentApprovedToolExecutionInput {
  return {
    toolRequestId: "toolreq_accept_graph_assertion",
    runId: "run_accept_graph_assertion",
    taskId: "task_accept_graph_assertion",
    toolId: acceptedGraphAssertionReviewDescriptor.toolId,
    toolVersion: acceptedGraphAssertionReviewDescriptor.toolVersion,
    sideEffectClass: acceptedGraphAssertionReviewDescriptor.sideEffectClass,
    approvalClass: acceptedGraphAssertionReviewDescriptor.requiredApprovalClass,
    previewHash,
    approvedPreviewHash: previewHash,
    approvedBy: reviewer.id,
    sourceEventIds: [prepared.proposal.id, prepared.evidence.id],
    inputArtifactHashes: [prepared.evidence.payload.contentHash],
    provenanceRefs: [
      prepared.assertionId,
      prepared.proposal.id,
      prepared.evidence.payload.evidenceId,
      prepared.evidence.id,
      prepared.evidence.payload.contentHash
    ]
  };
}

function ledgerWithSupersession(
  ledger: EventLedger,
  assertionId: string,
  proposalEventId: string
): EventLedger {
  const superseded = {
    id: "evt_assertion_superseded_fixture",
    type: "assertion.superseded",
    version: 1,
    streamId: `assertion_${assertionId}`,
    sequence: 2,
    context: {
      actor: reviewer,
      occurredAt: "2026-07-09T19:40:00.000Z",
      causationId: proposalEventId,
      correlationId: `corr_${assertionId}`,
      coreVersion: "0.1.0",
      packVersions: ontologyPackVersions
    },
    payload: {
      assertionId,
      supersededByAssertionId: "as_graph_review_replacement",
      rationale: "A later proposal replaces this candidate."
    }
  } as unknown as KnowledgeEvent;

  return {
    append(event, options) {
      return ledger.append(event, options);
    },
    async readStream(streamId) {
      const events = await ledger.readStream(streamId);
      return streamId === `assertion_${assertionId}` ? [...events, superseded] : events;
    },
    async readAll() {
      return [...await ledger.readAll(), superseded];
    }
  };
}

function eventOfType<Type extends KnowledgeEvent["type"]>(
  events: readonly KnowledgeEvent[],
  type: Type
): Extract<KnowledgeEvent, { readonly type: Type }> {
  const event = events.find(
    (candidate): candidate is Extract<KnowledgeEvent, { readonly type: Type }> => candidate.type === type
  );
  if (event === undefined) {
    throw new Error(`Expected ${type} event.`);
  }
  return event;
}

void (reviewer satisfies ActorRef);
