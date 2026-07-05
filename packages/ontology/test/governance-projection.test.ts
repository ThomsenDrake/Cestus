import { describe, expect, it } from "vitest";
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
