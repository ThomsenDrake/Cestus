import { describe, expect, it } from "vitest";
import {
  eventContracts,
  validateKnowledgeEvent,
  type KnowledgeEvent
} from "../src/contracts.js";

const context = {
  actor: { id: "actor_system", kind: "system", label: "test runner" },
  occurredAt: "2026-06-30T17:00:00.000Z",
  correlationId: "corr_contracts",
  coreVersion: "0.1.0",
  packVersions: { core: "0.1.0" }
} as const;

describe("event contracts", () => {
  it("contains agent guidance for every event contract", () => {
    for (const contract of Object.values(eventContracts)) {
      expect(contract.description.length).toBeGreaterThan(20);
      expect(contract.agentGuidance.length).toBeGreaterThan(20);
      expect(contract.invariants.length).toBeGreaterThan(0);
    }
  });

  it("validates a self-describing evidence.ingested event", () => {
    const event: KnowledgeEvent = {
      id: "evt_000000000000000000000001",
      type: "evidence.ingested",
      version: 1,
      streamId: "evidence_ev_001",
      sequence: 1,
      context,
      payload: {
        evidenceId: "ev_001",
        source: { kind: "file", label: "invoice.pdf" },
        contentHash: "sha256:9f2c8b7a5f4e3d2c1b0a99887766554433221100ffeeddccbbaa998877665544",
        mediaType: "application/pdf",
        sizeBytes: 128
      }
    };

    expect(validateKnowledgeEvent(event).success).toBe(true);
  });

  it("rejects an assertion without provenance", () => {
    const result = validateKnowledgeEvent({
      id: "evt_000000000000000000000002",
      type: "assertion.proposed",
      version: 1,
      streamId: "assertion_as_001",
      sequence: 1,
      context,
      payload: {
        assertionId: "as_001",
        predicate: "agency.name",
        object: "Example Agency",
        confidence: 0.91,
        reviewState: "proposed"
      }
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toContain("payload.evidenceId");
    }
  });
});
