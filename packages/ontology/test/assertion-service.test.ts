import { describe, expect, it } from "vitest";
import { AssertionService } from "../src/assertion-service.js";
import { type AppendableKnowledgeEvent } from "../src/contracts.js";
import { InMemoryEventLedger } from "../src/event-ledger.js";

const reviewer = { id: "actor_reviewer", kind: "human", label: "Reviewer" } as const;
const extractor = { id: "actor_extractor", kind: "extractor", label: "Record extractor" } as const;

describe("AssertionService", () => {
  it("appends an assertion.proposed event with evidence provenance", async () => {
    const ledger = new InMemoryEventLedger();
    const service = new AssertionService({ ledger });

    const event = await service.propose({
      assertionId: "as_service_001",
      evidenceId: "ev_service_001",
      subjectRef: "ent_agency_001",
      predicate: "agency.name",
      object: "Example Agency",
      confidence: 0.91,
      actor: extractor
    });

    const streamEvents = await ledger.readStream("assertion_as_service_001");

    expect(streamEvents).toEqual([event]);
    expect(event).toMatchObject({
      type: "assertion.proposed",
      version: 1,
      streamId: "assertion_as_service_001",
      sequence: 1,
      context: {
        actor: extractor,
        correlationId: "corr_as_service_001",
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0" }
      },
      payload: {
        assertionId: "as_service_001",
        evidenceId: "ev_service_001",
        subjectRef: "ent_agency_001",
        predicate: "agency.name",
        object: "Example Agency",
        confidence: 0.91,
        reviewState: "proposed"
      }
    });
    expect(event.context.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("accepts a proposed assertion with causation and reused correlation", async () => {
    const ledger = new InMemoryEventLedger();
    const service = new AssertionService({ ledger });
    const proposed = await service.propose({
      assertionId: "as_service_002",
      evidenceId: "ev_service_002",
      predicate: "agency.name",
      object: "Example Agency",
      confidence: 0.87,
      actor: extractor
    });

    const accepted = await service.accept({
      assertionId: "as_service_002",
      acceptedBy: "actor_reviewer",
      rationale: "The source record directly names the agency.",
      actor: reviewer
    });

    expect(accepted).toMatchObject({
      type: "assertion.accepted",
      version: 1,
      streamId: "assertion_as_service_002",
      sequence: 2,
      context: {
        actor: reviewer,
        causationId: proposed.id,
        correlationId: proposed.context.correlationId,
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0" }
      },
      payload: {
        assertionId: "as_service_002",
        acceptedBy: "actor_reviewer",
        rationale: "The source record directly names the agency."
      }
    });
    expect(accepted.context.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("rejects acceptance when the assertion stream has no proposal", async () => {
    const ledger = new InMemoryEventLedger();
    const service = new AssertionService({ ledger });
    const acceptedWithoutProposal = {
      type: "assertion.accepted",
      version: 1,
      streamId: "assertion_as_service_003",
      context: {
        actor: reviewer,
        occurredAt: "2026-06-30T17:00:00.000Z",
        correlationId: "corr_as_service_003",
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0" }
      },
      payload: {
        assertionId: "as_service_003",
        acceptedBy: "actor_reviewer",
        rationale: "Existing event is not enough."
      }
    } satisfies AppendableKnowledgeEvent<"assertion.accepted">;
    await ledger.append(acceptedWithoutProposal);

    await expect(
      service.accept({
        assertionId: "as_service_003",
        acceptedBy: "actor_reviewer",
        rationale: "Reviewed later.",
        actor: reviewer
      })
    ).rejects.toThrow("Cannot accept assertion as_service_003 without an assertion.proposed event");
  });
});
