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
    expect(events.some((event) => event.type === "assertion.accepted")).toBe(false);
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
