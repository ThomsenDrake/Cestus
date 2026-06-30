import { describe, expect, it } from "vitest";
import { InMemoryEventLedger, recordValidationDiagnostic } from "../src/index.js";

const systemActor = { id: "actor_validator", kind: "system", label: "Ontology validator" } as const;

describe("recordValidationDiagnostic", () => {
  it("appends a structured validation diagnostic with repair guidance", async () => {
    const ledger = new InMemoryEventLedger();

    const event = await recordValidationDiagnostic(ledger, {
      diagnosticId: "diag_missing_evidence",
      message: "Accepted assertion requires evidence provenance.",
      contract: "assertion.accepted",
      violatedPath: "payload.assertionId",
      actor: systemActor
    });

    const streamEvents = await ledger.readStream("diagnostic_diag_missing_evidence");

    expect(streamEvents).toEqual([event]);
    expect(event).toMatchObject({
      type: "diagnostic.recorded",
      version: 1,
      streamId: "diagnostic_diag_missing_evidence",
      sequence: 1,
      context: {
        actor: systemActor,
        correlationId: "corr_diag_missing_evidence",
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0" }
      },
      payload: {
        diagnosticId: "diag_missing_evidence",
        severity: "error",
        category: "validation",
        message: "Accepted assertion requires evidence provenance.",
        repairHint: {
          contract: "assertion.accepted",
          violatedPath: "payload.assertionId",
          allowedActions: ["add evidenceId", "reject assertion proposal", "request human review"]
        }
      }
    });
    expect(event.context.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});
