import { describe, expect, it } from "vitest";
import type { AppendableKnowledgeEvent, KnowledgeEvent } from "../../ontology/src/contracts.js";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { goldenIngestionLedgerEvents } from "../../ingestion/test/fixtures/golden-ingestion-ledger.js";
import { handleEvidenceHttpRoute } from "../src/evidence-http-routes.js";

const actor = { id: "actor_evidence_reviewer", kind: "human", label: "Evidence reviewer" } as const;

describe("local runtime evidence HTTP routes", () => {
  it("returns the browser-safe evidence corpus and records proposal-only assertion candidates", async () => {
    const ledger = new InMemoryEventLedger();
    await seedEvents(ledger, [...goldenIngestionLedgerEvents, evidenceIngestedEvent()]);

    const workspaceResponse = await handleEvidenceHttpRoute({
      request: { method: "GET", url: "/api/evidence/workspace" },
      ledger,
      actor
    });
    expect(workspaceResponse?.status).toBe(200);
    expect(JSON.parse(workspaceResponse!.body)).toMatchObject({
      schemaVersion: "evidence-workspace.v1",
      items: [{ evidenceId: "ev_ing_001", occurrences: [{ occurrenceId: "occ_001" }, { occurrenceId: "occ_002" }] }]
    });

    const proposalResponse = await handleEvidenceHttpRoute({
      request: {
        method: "POST",
        url: "/api/evidence/assertion-candidates",
        body: JSON.stringify({
          assertionId: "as_evidence_http_001",
          evidenceId: "ev_ing_001",
          predicate: "agency.name",
          object: "Example Agency",
          confidence: 0.84
        })
      },
      ledger,
      actor,
      now: () => "2026-07-05T12:08:00.000Z"
    });

    expect(proposalResponse?.status).toBe(201);
    expect(JSON.parse(proposalResponse!.body)).toMatchObject({
      ok: true,
      candidate: {
        assertionId: "as_evidence_http_001",
        evidenceReferences: [{ evidenceId: "ev_ing_001" }],
        reviewState: "proposed",
        reviewRequired: true
      },
      workspace: {
        assertionCandidates: [{ assertionId: "as_evidence_http_001", reviewState: "proposed" }]
      }
    });
    const events = await ledger.readAll();
    expect(events.filter((event) => event.type === "assertion.proposed")).toHaveLength(1);
  });

  it("reads governance state and appends a human review with refreshed replay and preview", async () => {
    const ledger = new InMemoryEventLedger();
    const ingestion = evidenceIngestedEvent();
    await seedEvents(ledger, [...goldenIngestionLedgerEvents, ingestion]);
    const committedIngestion = (await ledger.readStream("evidence_ev_ing_001"))
      .find((event) => event.type === "evidence.ingested");
    if (committedIngestion === undefined) {
      throw new Error("test setup requires committed evidence ingestion");
    }
    const classification = await ledger.append(evidenceGovernanceClassifiedEvent(committedIngestion.id));

    const before = structuredClone(await ledger.readAll());
    const workspaceResponse = await handleEvidenceHttpRoute({
      request: { method: "GET", url: "/api/evidence/workspace" },
      ledger,
      actor
    });
    expect(workspaceResponse?.status).toBe(200);
    expect(JSON.parse(workspaceResponse!.body)).toMatchObject({
      governance: {
        schemaVersion: "evidence-governance-workspace.v1",
        reviews: [{
          evidenceRef: "ev_ing_001",
          classificationStatus: "succeeded",
          proposedTags: [{ tag: "public_record", eventRef: classification.id }],
          humanDecisions: []
        }],
        exportPreview: {
          mode: "preview-only",
          includedEvidence: [],
          excludedEvidence: [{ evidenceRef: "ev_ing_001" }]
        }
      }
    });

    const reviewResponse = await handleEvidenceHttpRoute({
      request: {
        method: "POST",
        url: "/api/evidence/governance-reviews",
        body: JSON.stringify({
          evidenceRef: "ev_ing_001",
          tag: "public_safe",
          action: "add",
          rationale: "Human review confirmed default preview eligibility."
        })
      },
      ledger,
      actor
    });
    expect(reviewResponse?.status).toBe(201);
    const reviewed = JSON.parse(reviewResponse!.body);
    expect(reviewed).toMatchObject({
      ok: true,
      workspace: {
        governance: {
          reviews: [{
            evidenceRef: "ev_ing_001",
            humanDecisions: [{
              tag: "public_safe",
              action: "add",
              rationale: "Human review confirmed default preview eligibility."
            }]
          }],
          exportPreview: {
            mode: "preview-only",
            includedEvidence: [{ evidenceRef: "ev_ing_001" }],
            excludedEvidence: []
          }
        }
      }
    });

    const after = await ledger.readAll();
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.filter((event) => event.type === "evidence.governance.reviewed")).toHaveLength(1);
    expect(after.some((event) => [
      "export.generated",
      "report.generated",
      "evidence.quarantined",
      "evidence.tombstoned"
    ].includes(event.type))).toBe(false);
  });

  it("rejects credential-shaped proposal material without appending or echoing it", async () => {
    const ledger = new InMemoryEventLedger();
    await seedEvents(ledger, [...goldenIngestionLedgerEvents, evidenceIngestedEvent()]);
    const before = await ledger.readAll();
    const secret = "access_token=super-sensitive-value-123";

    const response = await handleEvidenceHttpRoute({
      request: {
        method: "POST",
        url: "/api/evidence/assertion-candidates",
        body: JSON.stringify({
          assertionId: "as_evidence_http_credential",
          evidenceId: "ev_ing_001",
          predicate: "agency.name",
          object: secret,
          confidence: 0.84
        })
      },
      ledger,
      actor
    });

    expect(response?.status).toBe(400);
    expect(response?.body).not.toContain(secret);
    expect(await ledger.readAll()).toEqual(before);
  });

  it("rejects credential-shaped governance review material without appending or echoing it", async () => {
    const ledger = new InMemoryEventLedger();
    const before = await ledger.readAll();
    const secret = "Authorization: Bearer governance-secret-value";

    const response = await handleEvidenceHttpRoute({
      request: {
        method: "POST",
        url: "/api/evidence/governance-reviews",
        body: JSON.stringify({
          evidenceRef: "ev_ing_001",
          tag: "public_safe",
          action: "add",
          rationale: secret
        })
      },
      ledger,
      actor
    });

    expect(response?.status).toBe(400);
    expect(response?.body).not.toContain(secret);
    expect(await ledger.readAll()).toEqual(before);
  });

  it("returns a stable diagnostic and appends nothing when evidence is blocked", async () => {
    const ledger = new InMemoryEventLedger();
    await seedEvents(ledger, [evidenceIngestedEvent()]);
    const before = await ledger.readAll();

    const response = await handleEvidenceHttpRoute({
      request: {
        method: "POST",
        url: "/api/evidence/assertion-candidates",
        body: JSON.stringify({
          assertionId: "as_evidence_http_blocked",
          evidenceId: "ev_ing_001",
          predicate: "agency.name",
          object: "Example Agency",
          confidence: 0.84
        })
      },
      ledger,
      actor
    });

    expect(response?.status).toBe(409);
    expect(JSON.parse(response!.body)).toMatchObject({
      ok: false,
      diagnostic: {
        code: "EVIDENCE_ASSERTION_PREPARATION_BLOCKED",
        message: "Evidence occurrence lineage is missing."
      }
    });
    expect(await ledger.readAll()).toEqual(before);
  });

  it("reports a committed proposal even when the follow-up workspace refresh fails", async () => {
    const stored = new InMemoryEventLedger();
    await seedEvents(stored, [...goldenIngestionLedgerEvents, evidenceIngestedEvent()]);
    let readCount = 0;
    const ledger = {
      append: stored.append.bind(stored),
      readStream: stored.readStream.bind(stored),
      async readAll() {
        readCount += 1;
        if (readCount > 1) {
          throw new Error("Authorization Bearer secret-value");
        }
        return stored.readAll();
      }
    };

    const response = await handleEvidenceHttpRoute({
      request: {
        method: "POST",
        url: "/api/evidence/assertion-candidates",
        body: JSON.stringify({
          assertionId: "as_evidence_http_refresh_failure",
          evidenceId: "ev_ing_001",
          predicate: "agency.name",
          object: "Example Agency",
          confidence: 0.84
        })
      },
      ledger,
      actor
    });

    expect(response?.status).toBe(201);
    expect(JSON.parse(response!.body)).toMatchObject({
      ok: true,
      candidate: { assertionId: "as_evidence_http_refresh_failure", reviewState: "proposed" },
      workspace: {
        status: "degraded",
        items: [],
        diagnostics: [{ code: "projection-error" }]
      }
    });
    expect(response?.body).not.toContain("secret-value");
    expect((await stored.readAll()).filter((event) => event.type === "assertion.proposed")).toHaveLength(1);
  });

  it("fails closed with no fixture corpus when ledger replay throws", async () => {
    const ledger = {
      async append() {
        throw new Error("should not append");
      },
      async readStream() {
        return [];
      },
      async readAll() {
        throw new Error("Authorization Bearer secret-value");
      }
    };

    const response = await handleEvidenceHttpRoute({
      request: { method: "GET", url: "/api/evidence/workspace" },
      ledger,
      actor
    });
    const body = JSON.parse(response!.body);

    expect(response?.status).toBe(503);
    expect(body).toMatchObject({
      schemaVersion: "evidence-workspace.v1",
      status: "degraded",
      items: [],
      diagnostics: [{ code: "projection-error", severity: "error" }]
    });
    expect(response?.body).not.toContain("secret-value");
  });
});

async function seedEvents(ledger: InMemoryEventLedger, events: readonly KnowledgeEvent[]): Promise<void> {
  for (const event of events) {
    const { id: _id, sequence: _sequence, ...appendable } = event;
    await ledger.append(appendable as AppendableKnowledgeEvent);
  }
}

function evidenceIngestedEvent(): KnowledgeEvent {
  return {
    id: "evt_ing_evidence_ingested",
    type: "evidence.ingested",
    version: 1,
    streamId: "evidence_ev_ing_001",
    sequence: 1,
    context: {
      actor: { id: "actor_investigator", kind: "human", label: "Investigator" },
      occurredAt: "2026-07-05T12:04:00.000Z",
      correlationId: "corr_ingestion_golden",
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", ingestion: "0.1.0" }
    },
    payload: {
      evidenceId: "ev_ing_001",
      source: { kind: "file", label: "a.txt", uri: "file:///source/contracts/a.txt" },
      contentHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      mediaType: "text/plain",
      sizeBytes: 4
    }
  };
}

function evidenceGovernanceClassifiedEvent(
  evidenceEventId: string
): AppendableKnowledgeEvent<"evidence.governance.classified"> {
  return {
    type: "evidence.governance.classified",
    version: 1,
    streamId: "evidence_ev_ing_001",
    context: {
      actor: { id: "actor_classifier", kind: "extractor", label: "Governance classifier" },
      occurredAt: "2026-07-05T12:05:00.000Z",
      causationId: evidenceEventId,
      correlationId: "corr_ingestion_golden",
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", ingestion: "0.1.0" }
    },
    payload: {
      evidenceId: "ev_ing_001",
      evidenceEventId,
      contentHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      policy: { policyId: "gov_policy_default", version: "0.1.0" },
      classifier: { actorId: "actor_classifier", kind: "ai", label: "Governance classifier" },
      tags: [{ tag: "public_record", confidence: 0.99, rationale: "Imported public record." }]
    }
  };
}
