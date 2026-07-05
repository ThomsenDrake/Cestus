import { describe, expect, it } from "vitest";
import type { KnowledgeEvent } from "../src/contracts.js";
import { buildGovernanceProjection } from "../src/governance-projection.js";
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

    expect(projection.evidenceGovernance.get("ev_source_review_locked")?.currentTags.get("public_safe")).toMatchObject({
      tag: "public_safe",
      status: "removed",
      source: "human",
      eventId: "evt_review_governance_review_locked_remove"
    });
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
