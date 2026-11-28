import { buildOntologyWorkspaceReadDto, unavailableOntologyWorkspaceReadDto } from "../../../ontology/src/ontology-workspace-read.js";
import { createLocalRuntimeHttpHandler, type CreateLocalRuntimeHttpHandlerInput, type LocalRuntimeHttpHandler, type OntologyReaderForTest } from "../../src/http-handler.js";
import { createWorkspaceKnowledgeService } from "../../src/knowledge-http-routes.js";

export const pureOntologyReaderForTest: OntologyReaderForTest = async ({ ledger, workspace, actor }) => {
  if (workspace !== undefined) {
    return createWorkspaceKnowledgeService(workspace).readLegacy(actor);
  }
  const events = await ledger.readAll();
  if (events.some((event) => event.version === 2)) {
    return unavailableOntologyWorkspaceReadDto();
  }
  return buildOntologyWorkspaceReadDto(events);
};

/** Internal route tests authenticate explicitly; boundary tests supply their own token/headers. */
export function createAuthenticatedTestHandler(input: CreateLocalRuntimeHttpHandlerInput): LocalRuntimeHttpHandler {
  const withReader: CreateLocalRuntimeHttpHandlerInput =
    input.ontologyReaderForTest === undefined &&
    input.helixTransportForTest === undefined &&
    input.config.helix === undefined
      ? { ...input, ontologyReaderForTest: pureOntologyReaderForTest }
      : input;
  if (withReader.config.http.authToken !== undefined) return createLocalRuntimeHttpHandler(withReader);
  const token = "disposable-internal-route-test-token";
  const handler = createLocalRuntimeHttpHandler({
    ...withReader, config: { ...withReader.config, http: { ...withReader.config.http, authRequired: true, authToken: token } }
  });
  return Object.assign((request: Parameters<LocalRuntimeHttpHandler>[0]) => handler({
    ...request, headers: { authorization: `Bearer ${token}`, ...request.headers }
  }), { close: () => handler.close() });
}
