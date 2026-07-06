import type { ResolvedLocalRuntimeConfig } from "./config.js";
import type { LocalRuntimeRequest, LocalRuntimeResponse } from "./http-handler.js";
import {
  buildOperatorStatusDto,
  type OperatorStatusProviderSet
} from "./operator-status.js";

export interface HandleOperatorStatusRouteInput {
  readonly request: LocalRuntimeRequest;
  readonly config: ResolvedLocalRuntimeConfig;
  readonly runtime: {
    readonly workspaceMounted?: boolean;
  };
  readonly now: () => string;
  readonly providers?: OperatorStatusProviderSet;
}

export async function handleOperatorStatusRoute(
  input: HandleOperatorStatusRouteInput
): Promise<LocalRuntimeResponse | undefined> {
  const path = new URL(input.request.url, "http://localhost").pathname;
  if (input.request.method !== "GET" || path !== "/api/operator/status") {
    return undefined;
  }

  const dto = await buildOperatorStatusDto({
    now: input.now,
    runtime: {
      available: true,
      storageStrategy: input.config.storage.strategy,
      bindMode: input.config.http.bindMode,
      ...(input.runtime.workspaceMounted === undefined
        ? {}
        : { workspaceMounted: input.runtime.workspaceMounted }),
      safeMessage: input.runtime.workspaceMounted === true
        ? "Runtime ready with a mounted workspace."
        : "Runtime ready."
    },
    ...(input.providers ?? {})
  });

  return json(200, dto);
}

function json(status: number, body: unknown): LocalRuntimeResponse {
  return Object.freeze({
    status,
    headers: Object.freeze({ "content-type": "application/json; charset=utf-8" }),
    body: JSON.stringify(body)
  });
}
