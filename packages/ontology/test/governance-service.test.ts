import { describe, expect, it } from "vitest";
import { type AppendableKnowledgeEvent, type KnowledgeEvent } from "../src/contracts.js";
import { type AppendOptions, type EventLedger, InMemoryEventLedger } from "../src/event-ledger.js";
import { defaultGovernancePolicy } from "../src/governance-policy.js";
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

async function appendEvidence(ledger: EventLedger, evidenceId = "ev_source_001") {
  const event = {
    type: "evidence.ingested",
    version: 1,
    streamId: `evidence_${evidenceId}`,
    context: {
      actor,
      occurredAt: "2026-07-05T12:00:00.000Z",
      correlationId: `corr_${evidenceId}`,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0" }
    },
    payload: {
      evidenceId,
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
    expect(event.payload.tags).toEqual([
      { tag: "public_record", confidence: 0.96, rationale: "Produced by a public agency." },
      { tag: "contains_pii", confidence: 0.91, rationale: "Names and addresses are visible." }
    ]);
  });

  it("installs governance policy through a human-gated service helper", async () => {
    const ledger = new RecordingLedger();
    const service = new GovernanceService({ ledger, actor });

    const event = await service.installPolicy({
      policy: defaultGovernancePolicy,
      installedBy: "actor_investigator"
    });

    expect(event.type).toBe("governance.policy.installed");
    expect(event.streamId).toBe("governance_policy_gov_policy_default");
    expect(event.sequence).toBe(1);
    expect(event.context.actor).toEqual(actor);
    expect(event.payload).toMatchObject({
      policyId: "gov_policy_default",
      version: "0.1.0",
      installedBy: "actor_investigator",
      confidenceThreshold: 0.9,
      tags: defaultGovernancePolicy.tags
    });
    expect(ledger.appendOptions[0]).toEqual({ expectedNextSequence: 1 });
  });

  it("rejects non-human policy installation before append", async () => {
    const ledger = new InMemoryEventLedger();
    const service = new GovernanceService({ ledger, actor: classifier });

    await expect(
      service.installPolicy({
        policy: defaultGovernancePolicy,
        installedBy: "actor_classifier"
      })
    ).rejects.toThrow("Governance policy installation requires a human service actor");

    expect(await ledger.readAll()).toHaveLength(0);
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

  it("requires supersede to reference an earlier governance event for the same tag", async () => {
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

    await expect(reviewService.reviewEvidenceGovernance({
      evidenceId: "ev_source_001",
      reviewedBy: "actor_investigator",
      policy: { policyId: "gov_policy_default", version: "0.1.0" },
      decisions: [{
        tag: "public_record",
        action: "supersede",
        rationale: "Missing provenance must fail closed."
      }]
    })).rejects.toThrow("Governance supersede requires an earlier governance event reference");

    await expect(reviewService.reviewEvidenceGovernance({
      evidenceId: "ev_source_001",
      reviewedBy: "actor_investigator",
      policy: { policyId: "gov_policy_default", version: "0.1.0" },
      decisions: [{
        tag: "public_safe",
        action: "supersede",
        rationale: "Wrong-tag provenance must fail closed.",
        supersedesEventId: classified.id
      }]
    })).rejects.toThrow("Governance supersede target must contain the same governance tag");

    const reviewed = await reviewService.reviewEvidenceGovernance({
      evidenceId: "ev_source_001",
      reviewedBy: "actor_investigator",
      policy: { policyId: "gov_policy_default", version: "0.1.0" },
      decisions: [{
        tag: "public_record",
        action: "supersede",
        rationale: "Same-tag provenance is traceable.",
        supersedesEventId: classified.id
      }]
    });

    expect(reviewed.payload.decisions[0]).toMatchObject({
      tag: "public_record",
      action: "supersede",
      supersedesEventId: classified.id
    });
  });

  it("rejects a supersede target from another evidence stream", async () => {
    const ledger = new InMemoryEventLedger();
    await appendEvidence(ledger);
    await appendEvidence(ledger, "ev_other_source");
    const classificationService = new GovernanceService({ ledger, actor: classifier });
    await classificationService.classifyEvidence({
      evidenceId: "ev_source_001",
      policy: { policyId: "gov_policy_default", version: "0.1.0" },
      classifier: { actorId: "actor_classifier", kind: "ai", label: "Classifier" },
      tags: [{ tag: "public_record", confidence: 0.96, rationale: "Public agency source." }]
    });
    const otherClassification = await classificationService.classifyEvidence({
      evidenceId: "ev_other_source",
      policy: { policyId: "gov_policy_default", version: "0.1.0" },
      classifier: { actorId: "actor_classifier", kind: "ai", label: "Classifier" },
      tags: [{ tag: "public_record", confidence: 0.96, rationale: "Other public agency source." }]
    });
    const reviewService = new GovernanceService({ ledger, actor });

    await expect(reviewService.reviewEvidenceGovernance({
      evidenceId: "ev_source_001",
      reviewedBy: "actor_investigator",
      policy: { policyId: "gov_policy_default", version: "0.1.0" },
      decisions: [{
        tag: "public_record",
        action: "supersede",
        rationale: "Cross-evidence provenance must fail closed.",
        supersedesEventId: otherClassification.id
      }]
    })).rejects.toThrow("Governance supersedesEventId must reference an earlier governance event in the evidence stream");
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

  it("records redaction, quarantine, and tombstone decisions through human-gated helpers", async () => {
    const ledger = new RecordingLedger();
    const evidence = await appendEvidence(ledger);
    const service = new GovernanceService({ ledger, actor });

    const redaction = await service.applyEvidenceRedaction({
      evidenceId: "ev_source_001",
      redactionId: "redaction_source_001",
      appliedBy: "actor_investigator",
      rationale: "Removed private phone numbers from the shared view.",
      redactedContentHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    });
    const quarantine = await service.quarantineEvidence({
      evidenceId: "ev_source_001",
      quarantineId: "quarantine_source_001",
      quarantinedBy: "actor_investigator",
      reason: "Needs source-protection review before workflow use.",
      lockLevel: "workflow"
    });
    const tombstone = await service.tombstoneEvidence({
      evidenceId: "ev_source_001",
      tombstoneId: "tombstone_source_001",
      tombstonedBy: "actor_investigator",
      reason: "Duplicate evidence superseded by a cleaner ingested copy."
    });

    expect(redaction.type).toBe("evidence.redaction.applied");
    expect(redaction.context.causationId).toBe(evidence.id);
    expect(quarantine.type).toBe("evidence.quarantined");
    expect(quarantine.context.causationId).toBe(redaction.id);
    expect(tombstone.type).toBe("evidence.tombstoned");
    expect(tombstone.context.causationId).toBe(quarantine.id);
    expect(ledger.appendOptions.slice(1)).toEqual([
      { expectedNextSequence: 2 },
      { expectedNextSequence: 3 },
      { expectedNextSequence: 4 }
    ]);
  });

  it("rejects non-human redaction, quarantine, and tombstone helpers before append", async () => {
    const ledger = new InMemoryEventLedger();
    await appendEvidence(ledger);
    const service = new GovernanceService({ ledger, actor: classifier });

    await expect(
      service.applyEvidenceRedaction({
        evidenceId: "ev_source_001",
        redactionId: "redaction_source_001",
        appliedBy: "actor_classifier",
        rationale: "Attempted redaction."
      })
    ).rejects.toThrow("Evidence redaction requires a human service actor");
    await expect(
      service.quarantineEvidence({
        evidenceId: "ev_source_001",
        quarantineId: "quarantine_source_001",
        quarantinedBy: "actor_classifier",
        reason: "Attempted quarantine.",
        lockLevel: "workflow"
      })
    ).rejects.toThrow("Evidence quarantine requires a human service actor");
    await expect(
      service.tombstoneEvidence({
        evidenceId: "ev_source_001",
        tombstoneId: "tombstone_source_001",
        tombstonedBy: "actor_classifier",
        reason: "Attempted tombstone."
      })
    ).rejects.toThrow("Evidence tombstone requires a human service actor");

    expect(await ledger.readStream("evidence_ev_source_001")).toHaveLength(1);
  });
});
