import { describe, expect, it } from "vitest";
import type { KnowledgeEvent, KnowledgeEventOf } from "../src/contracts.js";
import { buildGovernanceProjection } from "../src/governance-projection.js";
import { buildGovernanceExportPreview } from "../src/governance-export-preview.js";
import { validateKnowledgeEvent } from "../src/contracts.js";
import { goldenGovernanceLedgerEvents } from "./fixtures/golden-governance-ledger.js";

describe("governance projection", () => {
  it("uses only valid golden governance events", () => {
    expect(goldenGovernanceLedgerEvents.every((event) => validateKnowledgeEvent(event).success)).toBe(true);
  });

  it("rebuilds current governance tags from AI classification and human review", () => {
    const projection = buildGovernanceProjection(goldenGovernanceLedgerEvents);
    const source = projection.evidenceGovernance.get("ev_source_public");

    expect(source?.currentTags.get("public_record")).toMatchObject({
      tag: "public_record",
      status: "active",
      source: "ai"
    });
    expect(source?.currentTags.get("public_safe")).toMatchObject({
      tag: "public_safe",
      status: "active",
      source: "human"
    });
  });

  it("does not activate low-confidence AI governance tags", () => {
    const projection = buildGovernanceProjection(goldenGovernanceLedgerEvents);
    const source = projection.evidenceGovernance.get("ev_source_public");

    expect(source?.currentTags.get("contains_pii")).toBeUndefined();
  });

  it("keeps sensitive evidence out of default public-safe exports", () => {
    const projection = buildGovernanceProjection(goldenGovernanceLedgerEvents);
    expect(projection.publicSafeEvidenceIds()).toEqual(["ev_source_public"]);
    expect(projection.requiresExportOptIn("ev_source_private")).toBe(true);
    expect(projection.requiresExportOptIn("ev_source_public_restricted")).toBe(true);
  });

  it("does not let later AI classification override human review for the same tag", () => {
    const projection = buildGovernanceProjection(goldenGovernanceLedgerEvents);
    const state = projection.evidenceGovernance.get("ev_source_review_locked");

    expect(state?.currentTags.get("public_safe")).toMatchObject({
      tag: "public_safe",
      status: "removed",
      source: "human",
      eventId: "evt_review_governance_review_locked_remove"
    });
    expect(state?.classifiedEventIds).toEqual([
      "evt_classify_governance_review_locked_initial",
      "evt_classify_governance_review_locked_later"
    ]);
    expect(projection.publicSafeEvidenceIds()).not.toContain("ev_source_review_locked");
  });

  it("excludes public-safe evidence with active restricted tags from default public-safe exports", () => {
    const projection = buildGovernanceProjection(goldenGovernanceLedgerEvents);

    expect(projection.evidenceGovernance.get("ev_source_public_restricted")?.currentTags.get("public_safe")).toMatchObject({
      tag: "public_safe",
      status: "active"
    });
    expect(projection.evidenceGovernance.get("ev_source_public_restricted")?.currentTags.get("contains_pii")).toMatchObject({
      tag: "contains_pii",
      status: "active"
    });
    expect(projection.publicSafeEvidenceIds()).not.toContain("ev_source_public_restricted");
  });

  it("replays installed policy confidence thresholds for later AI classifications", () => {
    const projection = buildGovernanceProjection(goldenGovernanceLedgerEvents);

    expect(projection.evidenceGovernance.get("ev_source_policy_threshold")?.currentTags.get("public_record")).toMatchObject({
      tag: "public_record",
      status: "active",
      confidence: 0.85,
      source: "ai"
    });
  });

  it("ignores invalid installed policy events during replay", () => {
    const invalidPolicy = {
      id: "evt_install_governance_policy_invalid_threshold",
      type: "governance.policy.installed",
      version: 1,
      streamId: "governance_policy_gov_policy_default",
      sequence: 1,
      context: {
        actor: { id: "actor_investigator", kind: "human", label: "Investigator" },
        occurredAt: "2026-07-05T15:30:00.000Z",
        correlationId: "corr_invalid_policy",
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0" }
      },
      payload: {
        policyId: "gov_policy_default",
        version: "0.3.0",
        installedBy: "actor_investigator",
        confidenceThreshold: 0.1,
        tags: []
      }
    } as unknown as KnowledgeEvent;
    const borderlineClassification = {
      id: "evt_classify_invalid_policy_borderline",
      type: "evidence.governance.classified",
      version: 1,
      streamId: "evidence_ev_source_policy_threshold",
      sequence: 3,
      context: {
        actor: { id: "actor_ai_classifier", kind: "extractor", label: "Governance classifier" },
        occurredAt: "2026-07-05T15:31:00.000Z",
        causationId: "evt_install_governance_policy_invalid_threshold",
        correlationId: "corr_invalid_policy",
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0" }
      },
      payload: {
        evidenceId: "ev_source_policy_threshold",
        evidenceEventId: "evt_ingest_governance_policy_threshold",
        contentHash: "sha256:6666666666666666666666666666666666666666666666666666666666666666",
        policy: { policyId: "gov_policy_default", version: "0.3.0" },
        classifier: {
          actorId: "actor_ai_classifier",
          kind: "ai",
          label: "Cestus governance classifier"
        },
        tags: [{ tag: "contains_pii", confidence: 0.2, rationale: "Invalid policy should not lower threshold." }]
      }
    } as unknown as KnowledgeEvent;

    const projection = buildGovernanceProjection([
      ...goldenGovernanceLedgerEvents,
      invalidPolicy,
      borderlineClassification
    ]);

    expect(projection.evidenceGovernance.get("ev_source_policy_threshold")?.currentTags.get("contains_pii")).toBeUndefined();
  });

  it("projects human affirm and supersede decisions as human active tags", () => {
    const projection = buildGovernanceProjection(goldenGovernanceLedgerEvents);

    expect(projection.evidenceGovernance.get("ev_source_human_supersede")?.currentTags.get("legal_risk")).toMatchObject({
      tag: "legal_risk",
      status: "active",
      source: "human",
      eventId: "evt_review_governance_human_affirm"
    });
  });

  it("requires explicit opt-in for missing, quarantined, or tombstoned evidence", () => {
    const projection = buildGovernanceProjection(goldenGovernanceLedgerEvents);

    expect(projection.requiresExportOptIn("ev_missing")).toBe(true);
    expect(projection.requiresExportOptIn("ev_source_private")).toBe(true);
    expect(projection.requiresExportOptIn("ev_source_removed")).toBe(true);
  });

  it("projects quarantine and tombstone state without deleting history", () => {
    const projection = buildGovernanceProjection(goldenGovernanceLedgerEvents);
    expect(projection.evidenceGovernance.get("ev_source_private")?.quarantined).toBe(true);
    expect(projection.evidenceGovernance.get("ev_source_removed")?.tombstoned).toBe(true);
    expect(projection.evidenceGovernance.has("ev_source_removed")).toBe(true);
  });

  it("rebuilds tags, quarantine, incidents, and public-safe eligibility deterministically", () => {
    const snapshot = () => {
      const projection = buildGovernanceProjection(goldenGovernanceLedgerEvents);
      return {
        evidence: [...projection.evidenceGovernance.values()].map((state) => ({
          evidenceId: state.evidenceId,
          tags: [...state.currentTags.values()],
          quarantined: state.quarantined,
          tombstoned: state.tombstoned
        })),
        incidents: [...projection.incidents.values()],
        publicSafeEvidenceIds: projection.publicSafeEvidenceIds()
      };
    };

    expect(snapshot()).toEqual(snapshot());
  });

  it("fails closed when governance events lack valid prior ingestion lineage", () => {
    const lineage = governanceLineageEvents("ev_lineage_guard");
    const publicRecordClassification = {
      ...lineage.classification,
      payload: {
        ...lineage.classification.payload,
        tags: [{
          tag: "public_record",
          confidence: 0.99,
          rationale: "Classifier proposed public-record handling."
        }]
      }
    } satisfies KnowledgeEventOf<"evidence.governance.classified">;
    const cases: ReadonlyArray<{ readonly label: string; readonly events: readonly KnowledgeEvent[] }> = [
      {
        label: "orphan classification",
        events: [lineage.classification, lineage.review]
      },
      {
        label: "classification in the wrong stream",
        events: [
          lineage.ingestion,
          { ...lineage.classification, streamId: "evidence_ev_wrong_stream" },
          lineage.review
        ]
      },
      {
        label: "classification with the wrong evidence event reference",
        events: [
          lineage.ingestion,
          {
            ...lineage.classification,
            payload: { ...lineage.classification.payload, evidenceEventId: "evt_ingest_wrong_evidence" }
          },
          lineage.review
        ]
      },
      {
        label: "classification with a mismatched content hash",
        events: [
          lineage.ingestion,
          {
            ...lineage.classification,
            payload: {
              ...lineage.classification.payload,
              contentHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
            }
          },
          lineage.review
        ]
      },
      {
        label: "classification ordered before ingestion",
        events: [lineage.classification, lineage.ingestion, lineage.review]
      },
      {
        label: "classification with mismatched causation",
        events: [
          lineage.ingestion,
          {
            ...lineage.classification,
            context: { ...lineage.classification.context, causationId: "evt_ingest_wrong_causation" }
          },
          lineage.review
        ]
      },
      {
        label: "classification with non-prior stream sequence",
        events: [
          lineage.ingestion,
          { ...lineage.classification, sequence: lineage.ingestion.sequence },
          lineage.review
        ]
      },
      {
        label: "review causally linked directly to ingestion",
        events: [
          lineage.ingestion,
          publicRecordClassification,
          {
            ...lineage.review,
            context: { ...lineage.review.context, causationId: lineage.ingestion.id }
          }
        ]
      },
      {
        label: "review with non-prior stream sequence",
        events: [
          lineage.ingestion,
          publicRecordClassification,
          { ...lineage.review, sequence: publicRecordClassification.sequence }
        ]
      }
    ];

    for (const testCase of cases) {
      const originalEvents = structuredClone(testCase.events);
      const projection = buildGovernanceProjection(testCase.events);
      const preview = buildGovernanceExportPreview(testCase.events, ["ev_lineage_guard"]);

      expect(projection.publicSafeEvidenceIds(), testCase.label).not.toContain("ev_lineage_guard");
      expect(
        projection.evidenceGovernance.get("ev_lineage_guard")?.currentTags.get("public_safe"),
        testCase.label
      ).toBeUndefined();
      expect(preview.includedEvidence, testCase.label).toEqual([]);
      expect(testCase.events, testCase.label).toEqual(originalEvents);
    }
  });

  it("replays supersede only with an earlier same-tag governance target", () => {
    const lineage = governanceLineageEvents("ev_supersede_guard");
    const invalidReviews: KnowledgeEventOf<"evidence.governance.reviewed">[] = [
      {
        ...lineage.review,
        id: "evt_review_supersede_missing_ref",
        payload: {
          ...lineage.review.payload,
          decisions: [{
            tag: "public_safe",
            action: "supersede",
            rationale: "Missing target must not replace projected state."
          }]
        }
      },
      {
        ...lineage.review,
        id: "evt_review_supersede_wrong_tag",
        payload: {
          ...lineage.review.payload,
          decisions: [{
            tag: "legal_risk",
            action: "supersede",
            rationale: "Wrong-tag target must not replace projected state.",
            supersedesEventId: lineage.classification.id
          }]
        }
      },
      {
        ...lineage.review,
        id: "evt_review_supersede_self_ref",
        payload: {
          ...lineage.review.payload,
          decisions: [{
            tag: "public_safe",
            action: "supersede",
            rationale: "Self-reference must not replace projected state.",
            supersedesEventId: "evt_review_supersede_self_ref"
          }]
        }
      }
    ];

    for (const review of invalidReviews) {
      const projection = buildGovernanceProjection([lineage.ingestion, lineage.classification, review]);
      expect(projection.evidenceGovernance.get("ev_supersede_guard")?.currentTags.get("public_safe")).toMatchObject({
        source: "ai",
        eventId: lineage.classification.id
      });
      expect(projection.evidenceGovernance.get("ev_supersede_guard")?.currentTags.get("legal_risk")).toBeUndefined();
    }

    const validReview = {
      ...lineage.review,
      id: "evt_review_supersede_valid",
      payload: {
        ...lineage.review.payload,
        decisions: [{
          tag: "public_safe",
          action: "supersede",
          rationale: "Earlier same-tag target is traceable.",
          supersedesEventId: lineage.classification.id
        }]
      }
    } satisfies KnowledgeEventOf<"evidence.governance.reviewed">;
    const validProjection = buildGovernanceProjection([lineage.ingestion, lineage.classification, validReview]);
    expect(validProjection.evidenceGovernance.get("ev_supersede_guard")?.currentTags.get("public_safe")).toMatchObject({
      source: "human",
      eventId: validReview.id
    });
  });

  it("returns immutable projection snapshots", () => {
    const projection = buildGovernanceProjection(goldenGovernanceLedgerEvents);
    const firstState = projection.evidenceGovernance.values().next().value;

    expect(() => projection.evidenceGovernance.set("ev_mutated", firstState!)).toThrow(
      "GovernanceProjection.evidenceGovernance is read-only"
    );
  });

  it("returns immutable nested governance state", () => {
    const projection = buildGovernanceProjection(goldenGovernanceLedgerEvents);
    const source = projection.evidenceGovernance.get("ev_source_public");

    expect(() => source?.currentTags.set("contains_pii", source.currentTags.get("public_record")!)).toThrow(
      "EvidenceGovernanceState.currentTags is read-only"
    );
    expect(() => (source?.classifiedEventIds as string[]).push("evt_mutated")).toThrow();
    expect(source?.classifiedEventIds).toEqual(["evt_classify_governance_public"]);
  });
});

function governanceLineageEvents(evidenceId: string): {
  readonly ingestion: KnowledgeEventOf<"evidence.ingested">;
  readonly classification: KnowledgeEventOf<"evidence.governance.classified">;
  readonly review: KnowledgeEventOf<"evidence.governance.reviewed">;
} {
  const ingestion = {
    id: `evt_ingest_${evidenceId}`,
    type: "evidence.ingested",
    version: 1,
    streamId: `evidence_${evidenceId}`,
    sequence: 1,
    context: {
      actor: { id: "actor_system", kind: "system", label: "System" },
      occurredAt: "2026-08-02T14:00:00.000Z",
      correlationId: `corr_${evidenceId}`,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0" }
    },
    payload: {
      evidenceId,
      source: { kind: "file", label: "Lineage fixture" },
      contentHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      mediaType: "text/plain",
      sizeBytes: 1
    }
  } satisfies KnowledgeEventOf<"evidence.ingested">;
  const classification = {
    id: `evt_classify_${evidenceId}`,
    type: "evidence.governance.classified",
    version: 1,
    streamId: `evidence_${evidenceId}`,
    sequence: 2,
    context: {
      ...ingestion.context,
      actor: { id: "actor_classifier", kind: "extractor", label: "Classifier" },
      causationId: ingestion.id
    },
    payload: {
      evidenceId,
      evidenceEventId: ingestion.id,
      contentHash: ingestion.payload.contentHash,
      policy: { policyId: "gov_policy_default", version: "0.1.0" },
      classifier: { actorId: "actor_classifier", kind: "ai", label: "Classifier" },
      tags: [{ tag: "public_safe", confidence: 0.99, rationale: "Classifier proposed public-safe handling." }]
    }
  } satisfies KnowledgeEventOf<"evidence.governance.classified">;
  const review = {
    id: `evt_review_${evidenceId}`,
    type: "evidence.governance.reviewed",
    version: 1,
    streamId: `evidence_${evidenceId}`,
    sequence: 3,
    context: {
      ...ingestion.context,
      actor: { id: "actor_reviewer", kind: "human", label: "Reviewer" },
      causationId: classification.id
    },
    payload: {
      evidenceId,
      reviewedBy: "actor_reviewer",
      policy: { policyId: "gov_policy_default", version: "0.1.0" },
      decisions: [{
        tag: "public_safe",
        action: "add",
        rationale: "Reviewer proposed public-safe handling."
      }]
    }
  } satisfies KnowledgeEventOf<"evidence.governance.reviewed">;

  return { ingestion, classification, review };
}
