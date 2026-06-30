import type { z } from "zod";
import { actorRefSchema, type AppendableKnowledgeEvent, type KnowledgeEventOf } from "./contracts.js";
import type { EventLedger } from "./event-ledger.js";

type ActorRef = z.infer<typeof actorRefSchema>;

export interface MissingEvidenceValidationDiagnosticInput {
  diagnosticId: string;
  message: string;
  contract: "assertion.proposed";
  violatedPath: "payload.evidenceId";
  actor: ActorRef;
}

const missingEvidenceValidationAllowedActions = [
  "add evidenceId",
  "reject assertion proposal",
  "request human review"
] as const;

/**
 * Records the narrow validation diagnostic used when an assertion proposal lacks evidence provenance.
 */
export async function recordValidationDiagnostic(
  ledger: EventLedger,
  input: MissingEvidenceValidationDiagnosticInput
): Promise<KnowledgeEventOf<"diagnostic.recorded">> {
  const event: AppendableKnowledgeEvent<"diagnostic.recorded"> = {
    type: "diagnostic.recorded",
    version: 1,
    streamId: `diagnostic_${input.diagnosticId}`,
    context: {
      actor: input.actor,
      occurredAt: new Date().toISOString(),
      correlationId: `corr_${input.diagnosticId}`,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0" }
    },
    payload: {
      diagnosticId: input.diagnosticId,
      severity: "error",
      category: "validation",
      message: input.message,
      repairHint: {
        contract: input.contract,
        violatedPath: input.violatedPath,
        allowedActions: [...missingEvidenceValidationAllowedActions]
      }
    }
  };

  const appended = await ledger.append(event);

  if (appended.type !== "diagnostic.recorded") {
    throw new Error(`Unexpected event type appended for validation diagnostic: ${appended.type}`);
  }

  return appended;
}
