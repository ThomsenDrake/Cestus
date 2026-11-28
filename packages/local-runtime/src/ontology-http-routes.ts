import {
  HelixProjectionLagError,
  HelixUnavailableError
} from "../../ontology/src/helix-adapter.js";
import {
  invalidOntologyWorkspaceReadDto,
  unavailableOntologyWorkspaceReadDto,
  type OntologyWorkspaceReadDto
} from "../../ontology/src/ontology-workspace-read.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";
import type { LocalRuntimeRequest, LocalRuntimeResponse } from "./http-handler.js";

export async function handleOntologyHttpRoute(input: {
  readonly request: LocalRuntimeRequest;
  readonly ledger: EventLedger;
  readonly readAuthorized?: () => Promise<OntologyWorkspaceReadDto>;
}): Promise<LocalRuntimeResponse | undefined> {
  const path = new URL(input.request.url, "http://localhost").pathname;
  if (input.request.method !== "GET" || path !== "/api/ontology/workspace") {
    return undefined;
  }

  // Fail closed when no live Helix reader (or injected test reader) is wired;
  // never fall back to scanning the ledger into a second answer.
  if (input.readAuthorized === undefined) {
    return json(503, unavailableOntologyWorkspaceReadDto());
  }

  try {
    return json(200, await input.readAuthorized());
  } catch (error: unknown) {
    if (error instanceof HelixProjectionLagError) {
      return json(503, {
        schemaVersion: "ontology-workspace.v1",
        status: "degraded",
        sourceHighWaterMark: error.helixHighWaterMark,
        entities: [],
        relationships: [],
        assertions: [],
        diagnostics: [
          {
            code: "projection-lag",
            severity: "error",
            message: "The ontology projection is not caught up to its source ledger.",
            repairActions: [
              "rebuild the ontology projection from the ledger",
              "retry after the projection is ready"
            ]
          }
        ]
      } satisfies OntologyWorkspaceReadDto);
    }
    if (error instanceof HelixUnavailableError) {
      return json(503, unavailableOntologyWorkspaceReadDto());
    }
    const body =
      error instanceof Error && /^Stored knowledge event .* is invalid(?: JSON)?:/i.test(error.message)
        ? invalidOntologyWorkspaceReadDto()
        : unavailableOntologyWorkspaceReadDto();
    return json(503, body);
  }
}

function json(status: number, body: unknown): LocalRuntimeResponse {
  return Object.freeze({
    status,
    headers: Object.freeze({ "content-type": "application/json; charset=utf-8" }),
    body: JSON.stringify(body)
  });
}
