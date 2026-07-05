import { describe, expect, it } from "vitest";
import { type AppendableKnowledgeEvent, type KnowledgeEvent } from "../src/contracts.js";
import { type AppendOptions, type EventLedger, InMemoryEventLedger } from "../src/event-ledger.js";
import { GovernanceService } from "../src/governance-service.js";

const actor = { id: "actor_investigator", kind: "human" as const, label: "Investigator" };
const classifier = { id: "actor_classifier", kind: "extractor" as const, label: "Governance classifier" };
const contentHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

class RecordingLedger implements EventLedger {
  private readonly ledger = new InMemoryEventLedger();
  readonly appendOptions: AppendOptions[] = [];

  async append(event: AppendableKnowledgeEvent, options: AppendOptions = {}): Promise<KnowledgeEvent> {
    this.appendOptions.push(options);
    return this.ledger.append(event, options);
  }

  async readStream(streamId: string): Promise<KnowledgeEvent[]> {
    return this.ledger.readStream(streamId);
  }

  async readAll(): Promise<KnowledgeEvent[]> {
    return this.ledger.readAll();
  }
}

async function appendEvidence(ledger: EventLedger) {
  const event = {
    type: "evidence.ingested",
    version: 1,
    streamId: "evidence_ev_source_001",
    context: {
      actor,
      occurredAt: "2026-07-05T12:00:00.000Z",
      correlationId: "corr_ev_source_001",
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0" }
    },
    payload: {
      evidenceId: "ev_source_001",
      source: { kind: "file", label: "source.pdf" },
      contentHash,
      mediaType: "application/pdf",
      sizeBytes: 42
    }
  } satisfies AppendableKnowledgeEvent<"evidence.ingested">;

  return ledger.append(event);
}

describe("GovernanceService", () => {
  it("classifies evidence with causation to the evidence event and copies the content hash", async () => {
    const ledger = new InMemoryEventLedger();
    const evidence = await appendEvidence(ledger);
    const service = new GovernanceService({ ledger, actor: classifier });

    const event = await service.classifyEvidence({
      evidenceId: "ev_source_001",
      policy: { policyId: "gov_policy_default", version: "0.1.0" },
      classifier: {
        actorId: "actor_classifier",
        kind: "ai",
        label: "Cestus governance classifier",
        model: "local-fixture-model"
      },
      tags: [
        { tag: "public_record", confidence: 0.96, rationale: "Produced by a public agency." },
        { tag: "contains_pii", confidence: 0.91, rationale: "Names and addresses are visible." }
      ]
    });

    expect(event.type).toBe("evidence.governance.classified");
    expect(event.streamId).toBe("evidence_ev_source_001");
    expect(event.sequence).toBe(2);
    expect(event.context).toMatchObject({
      actor: classifier,
      causationId: evidence.id,
      correlationId: "corr_governance_ev_source_001",
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0" }
    });
    expect(event.payload).toMatchObject({
      evidenceId: "ev_source_001",
      evidenceEventId: evidence.id,
      contentHash
    });
  });

  it("rejects classification when the evidence event is missing", async () => {
    const ledger = new InMemoryEventLedger();
    const service = new GovernanceService({ ledger, actor: classifier });

    await expect(
      service.classifyEvidence({
        evidenceId: "ev_missing",
        policy: { policyId: "gov_policy_default", version: "0.1.0" },
        classifier: { actorId: "actor_classifier", kind: "ai", label: "Classifier" },
        tags: [{ tag: "public_record", confidence: 0.96, rationale: "Public agency source." }]
      })
    ).rejects.toThrow("Cannot classify evidence ev_missing without evidence.ingested");
  });

  it("rejects classifier attribution that does not match the service actor before append", async () => {
    const ledger = new InMemoryEventLedger();
    await appendEvidence(ledger);
    const service = new GovernanceService({ ledger, actor: classifier });

    await expect(
      service.classifyEvidence({
        evidenceId: "ev_source_001",
        policy: { policyId: "gov_policy_default", version: "0.1.0" },
        classifier: { actorId: "actor_other_classifier", kind: "ai", label: "Classifier" },
        tags: [{ tag: "public_record", confidence: 0.96, rationale: "Public agency source." }]
      })
    ).rejects.toThrow("Governance classifier actorId must match the service actor");

    expect(await ledger.readStream("evidence_ev_source_001")).toHaveLength(1);
  });

  it("classifies evidence with optimistic append concurrency", async () => {
    const ledger = new RecordingLedger();
    await appendEvidence(ledger);
    const service = new GovernanceService({ ledger, actor: classifier });

    await service.classifyEvidence({
      evidenceId: "ev_source_001",
      policy: { policyId: "gov_policy_default", version: "0.1.0" },
      classifier: { actorId: "actor_classifier", kind: "ai", label: "Classifier" },
      tags: [{ tag: "public_record", confidence: 0.96, rationale: "Public agency source." }]
    });

    expect(ledger.appendOptions[1]).toEqual({ expectedNextSequence: 2 });
  });

  it("records a human governance review after classification with latest governance causation and expected sequence", async () => {
    const ledger = new InMemoryEventLedger();
    await appendEvidence(ledger);
    const service = new GovernanceService({ ledger, actor: classifier });
    const classified = await service.classifyEvidence({
      evidenceId: "ev_source_001",
      policy: { policyId: "gov_policy_default", version: "0.1.0" },
      classifier: { actorId: "actor_classifier", kind: "ai", label: "Classifier" },
      tags: [{ tag: "public_record", confidence: 0.96, rationale: "Public agency source." }]
    });

    const reviewService = new GovernanceService({ ledger, actor });
    const reviewed = await reviewService.reviewEvidenceGovernance({
      evidenceId: "ev_source_001",
      reviewedBy: "actor_investigator",
      policy: { policyId: "gov_policy_default", version: "0.1.0" },
      decisions: [
        {
          tag: "public_safe",
          action: "add",
          rationale: "Reviewed and safe for public report defaults.",
          supersedesEventId: classified.id
        }
      ]
    });

    expect(reviewed.type).toBe("evidence.governance.reviewed");
    expect(reviewed.sequence).toBe(3);
    expect(reviewed.context).toMatchObject({
      actor,
      causationId: classified.id,
      correlationId: "corr_governance_ev_source_001",
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0" }
    });
    expect((await ledger.readStream("evidence_ev_source_001")).map((event) => event.type)).toEqual([
      "evidence.ingested",
      "evidence.governance.classified",
      "evidence.governance.reviewed"
    ]);
  });

  it("links a later review to the latest classification or review event", async () => {
    const ledger = new InMemoryEventLedger();
    await appendEvidence(ledger);
    const classificationService = new GovernanceService({ ledger, actor: classifier });
    const classified = await classificationService.classifyEvidence({
      evidenceId: "ev_source_001",
      policy: { policyId: "gov_policy_default", version: "0.1.0" },
      classifier: { actorId: "actor_classifier", kind: "ai", label: "Classifier" },
      tags: [{ tag: "public_record", confidence: 0.96, rationale: "Public agency source." }]
    });
    const reviewService = new GovernanceService({ ledger, actor });
    const firstReview = await reviewService.reviewEvidenceGovernance({
      evidenceId: "ev_source_001",
      reviewedBy: "actor_investigator",
      policy: { policyId: "gov_policy_default", version: "0.1.0" },
      decisions: [
        {
          tag: "public_safe",
          action: "add",
          rationale: "Initial review supports public default use.",
          supersedesEventId: classified.id
        }
      ]
    });

    const secondReview = await reviewService.reviewEvidenceGovernance({
      evidenceId: "ev_source_001",
      reviewedBy: "actor_investigator",
      policy: { policyId: "gov_policy_default", version: "0.1.0" },
      decisions: [
        {
          tag: "public_safe",
          action: "affirm",
          rationale: "Second review affirms the prior decision.",
          supersedesEventId: firstReview.id
        }
      ]
    });

    expect(secondReview.context.causationId).toBe(firstReview.id);
    expect(secondReview.sequence).toBe(4);
  });

  it("rejects secret-bearing classification rationale before append", async () => {
    const ledger = new InMemoryEventLedger();
    await appendEvidence(ledger);
    const service = new GovernanceService({ ledger, actor: classifier });

    await expect(
      service.classifyEvidence({
        evidenceId: "ev_source_001",
        policy: { policyId: "gov_policy_default", version: "0.1.0" },
        classifier: { actorId: "actor_classifier", kind: "ai", label: "Classifier" },
        tags: [{ tag: "credential_risk", confidence: 0.96, rationale: "Found password abc123." }]
      })
    ).rejects.toThrow("Governance text must not contain secrets");

    expect(await ledger.readStream("evidence_ev_source_001")).toHaveLength(1);
  });

  it("rejects invalid constructor actors", () => {
    const ledger = new InMemoryEventLedger();

    expect(() =>
      new GovernanceService({
        ledger,
        actor: { id: "ai", kind: "extractor", label: "Governance classifier" }
      })
    ).toThrow("Invalid governance actor");
  });

  it("requires a human service actor for governance review", async () => {
    const ledger = new InMemoryEventLedger();
    await appendEvidence(ledger);
    const service = new GovernanceService({ ledger, actor: classifier });
    const classified = await service.classifyEvidence({
      evidenceId: "ev_source_001",
      policy: { policyId: "gov_policy_default", version: "0.1.0" },
      classifier: { actorId: "actor_classifier", kind: "ai", label: "Classifier" },
      tags: [{ tag: "public_record", confidence: 0.96, rationale: "Public agency source." }]
    });

    await expect(
      service.reviewEvidenceGovernance({
        evidenceId: "ev_source_001",
        reviewedBy: "actor_investigator",
        policy: { policyId: "gov_policy_default", version: "0.1.0" },
        decisions: [
          {
            tag: "public_safe",
            action: "add",
            rationale: "Reviewed and safe for public report defaults.",
            supersedesEventId: classified.id
          }
        ]
      })
    ).rejects.toThrow("Governance review requires a human service actor");

    expect(await ledger.readStream("evidence_ev_source_001")).toHaveLength(2);
  });

  it("rejects reviewedBy attribution that does not match the service actor before append", async () => {
    const ledger = new InMemoryEventLedger();
    await appendEvidence(ledger);
    const classificationService = new GovernanceService({ ledger, actor: classifier });
    const classified = await classificationService.classifyEvidence({
      evidenceId: "ev_source_001",
      policy: { policyId: "gov_policy_default", version: "0.1.0" },
      classifier: { actorId: "actor_classifier", kind: "ai", label: "Classifier" },
      tags: [{ tag: "public_record", confidence: 0.96, rationale: "Public agency source." }]
    });
    const reviewService = new GovernanceService({ ledger, actor });

    await expect(
      reviewService.reviewEvidenceGovernance({
        evidenceId: "ev_source_001",
        reviewedBy: "actor_other_reviewer",
        policy: { policyId: "gov_policy_default", version: "0.1.0" },
        decisions: [
          {
            tag: "public_safe",
            action: "add",
            rationale: "Reviewed and safe for public report defaults.",
            supersedesEventId: classified.id
          }
        ]
      })
    ).rejects.toThrow("Governance reviewedBy must match the service actor");

    expect(await ledger.readStream("evidence_ev_source_001")).toHaveLength(2);
  });

  it("rejects supersedes references that are unknown in the evidence stream before append", async () => {
    const ledger = new InMemoryEventLedger();
    await appendEvidence(ledger);
    const classificationService = new GovernanceService({ ledger, actor: classifier });
    await classificationService.classifyEvidence({
      evidenceId: "ev_source_001",
      policy: { policyId: "gov_policy_default", version: "0.1.0" },
      classifier: { actorId: "actor_classifier", kind: "ai", label: "Classifier" },
      tags: [{ tag: "public_record", confidence: 0.96, rationale: "Public agency source." }]
    });
    const reviewService = new GovernanceService({ ledger, actor });

    await expect(
      reviewService.reviewEvidenceGovernance({
        evidenceId: "ev_source_001",
        reviewedBy: "actor_investigator",
        policy: { policyId: "gov_policy_default", version: "0.1.0" },
        decisions: [
          {
            tag: "public_safe",
            action: "add",
            rationale: "Reviewed and safe for public report defaults.",
            supersedesEventId: "evt_unknown_governance"
          }
        ]
      })
    ).rejects.toThrow("Governance supersedesEventId must reference an earlier governance event in the evidence stream");

    expect(await ledger.readStream("evidence_ev_source_001")).toHaveLength(2);
  });

  it("rejects supersedes references to non-governance events before append", async () => {
    const ledger = new InMemoryEventLedger();
    const evidence = await appendEvidence(ledger);
    const classificationService = new GovernanceService({ ledger, actor: classifier });
    await classificationService.classifyEvidence({
      evidenceId: "ev_source_001",
      policy: { policyId: "gov_policy_default", version: "0.1.0" },
      classifier: { actorId: "actor_classifier", kind: "ai", label: "Classifier" },
      tags: [{ tag: "public_record", confidence: 0.96, rationale: "Public agency source." }]
    });
    const reviewService = new GovernanceService({ ledger, actor });

    await expect(
      reviewService.reviewEvidenceGovernance({
        evidenceId: "ev_source_001",
        reviewedBy: "actor_investigator",
        policy: { policyId: "gov_policy_default", version: "0.1.0" },
        decisions: [
          {
            tag: "public_safe",
            action: "add",
            rationale: "Reviewed and safe for public report defaults.",
            supersedesEventId: evidence.id
          }
        ]
      })
    ).rejects.toThrow("Governance supersedesEventId must reference an earlier governance event in the evidence stream");

    expect(await ledger.readStream("evidence_ev_source_001")).toHaveLength(2);
  });

  it("allows safe rationale containing credential_risk", async () => {
    const ledger = new InMemoryEventLedger();
    await appendEvidence(ledger);
    const service = new GovernanceService({ ledger, actor: classifier });

    const event = await service.classifyEvidence({
      evidenceId: "ev_source_001",
      policy: { policyId: "gov_policy_default", version: "0.1.0" },
      classifier: { actorId: "actor_classifier", kind: "ai", label: "Classifier" },
      tags: [{ tag: "credential_risk", confidence: 0.96, rationale: "credential_risk requires review." }]
    });

    expect(event.payload.tags[0]?.rationale).toBe("credential_risk requires review.");
  });
});
