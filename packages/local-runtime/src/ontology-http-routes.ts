import {
  buildOntologyWorkspaceReadDto,
  invalidOntologyWorkspaceReadDto,
  unavailableOntologyWorkspaceReadDto
} from "../../ontology/src/ontology-workspace-read.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";
import type { LocalRuntimeRequest, LocalRuntimeResponse } from "./http-handler.js";

export async function handleOntologyHttpRoute(input: {
  readonly request: LocalRuntimeRequest;
  readonly ledger: EventLedger;
}): Promise<LocalRuntimeResponse | undefined> {
  const path = new URL(input.request.url, "http://localhost").pathname;
  if (input.request.method !== "GET" || path !== "/api/ontology/workspace") {
    return undefined;
  }

  try {
    return json(200, buildOntologyWorkspaceReadDto(await input.ledger.readAll()));
  } catch (error: unknown) {
    const body = error instanceof Error && /^Stored knowledge event .* is invalid(?: JSON)?:/i.test(error.message)
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
