import { createLocalRuntimeHttpHandler, type CreateLocalRuntimeHttpHandlerInput, type LocalRuntimeHttpHandler } from "../../src/http-handler.js";

/** Internal route tests authenticate explicitly; boundary tests supply their own token/headers. */
export function createAuthenticatedTestHandler(input: CreateLocalRuntimeHttpHandlerInput): LocalRuntimeHttpHandler {
  if (input.config.http.authToken !== undefined) return createLocalRuntimeHttpHandler(input);
  const token = "disposable-internal-route-test-token";
  const handler = createLocalRuntimeHttpHandler({
    ...input, config: { ...input.config, http: { ...input.config.http, authRequired: true, authToken: token } }
  });
  return Object.assign((request: Parameters<LocalRuntimeHttpHandler>[0]) => handler({
    ...request, headers: { authorization: `Bearer ${token}`, ...request.headers }
  }), { close: () => handler.close() });
}
