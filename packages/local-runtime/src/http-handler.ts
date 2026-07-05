import type { KnowledgeEvent } from "../../ontology/src/contracts.js";
import type { ActorRef, CreateDraftRequestInput } from "../../prr/src/draft-events.js";
import type { DeadlineCalculator, PrrRuntimeNow } from "../../prr/src/runtime.js";
import { prrWorkspaceSeedEvents } from "../../prr/src/workspace-seed.js";
import type { ResolvedLocalRuntimeConfig } from "./config.js";
import { createSqlitePrrRuntime } from "./runtime-factory.js";

export interface LocalRuntimeRequest {
  readonly method: string;
  readonly url: string;
  readonly headers?: Record<string, string | undefined>;
  readonly body?: string;
}

export interface LocalRuntimeResponse {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: string;
}

export interface LocalRuntimeHttpHandler {
  (request: LocalRuntimeRequest): Promise<LocalRuntimeResponse>;
  close(): void;
}

export interface CreateLocalRuntimeHttpHandlerInput {
  readonly config: ResolvedLocalRuntimeConfig;
  readonly actor: ActorRef;
  readonly now?: PrrRuntimeNow;
  readonly requestIdFactory?: () => string;
  readonly deadlineCalculator?: DeadlineCalculator;
  readonly seedEvents?: readonly KnowledgeEvent[];
}

export function createLocalRuntimeHttpHandler(
  input: CreateLocalRuntimeHttpHandlerInput
): LocalRuntimeHttpHandler {
  const handle = createSqlitePrrRuntime({
    config: input.config,
    actor: input.actor,
    ...(input.now === undefined ? {} : { now: input.now }),
    ...(input.requestIdFactory === undefined ? {} : { requestIdFactory: input.requestIdFactory }),
    ...(input.deadlineCalculator === undefined ? {} : { deadlineCalculator: input.deadlineCalculator })
  });
  const seedEvents = input.seedEvents ?? prrWorkspaceSeedEvents;

  const handler = (async (request: LocalRuntimeRequest): Promise<LocalRuntimeResponse> => {
    const path = new URL(request.url, "http://localhost").pathname;

    if (request.method === "GET" && path === "/api/health") {
      return json(200, {
        ok: true,
        storageStrategy: input.config.storage.strategy,
        bindMode: input.config.http.bindMode,
        authRequired: input.config.http.authRequired,
        devSeedEnabled: input.config.http.devSeedEnabled
      });
    }

    if (path.startsWith("/api/") && !authorized(input.config, request)) {
      return json(
        401,
        diagnostic("Authentication is required for this local runtime route.", [
          "provide the configured local runtime auth token"
        ])
      );
    }

    if (request.method === "GET" && path === "/api/requests/workspace") {
      return json(200, await handle.runtime.loadWorkspace());
    }

    if (request.method === "POST" && path === "/api/requests/drafts") {
      const parsed = parseJsonBody(request.body);
      if (!parsed.ok) {
        return json(400, parsed.body);
      }

      const draftInput = draftRequestInputFromBody(parsed.value);
      if (draftInput === undefined) {
        return json(400, invalidDraftRequestBodyDiagnostic());
      }

      return json(200, await handle.runtime.createDraftRequest(draftInput));
    }

    if (request.method === "POST" && path === "/api/dev/seed-prr") {
      if (!input.config.http.devSeedEnabled) {
        return json(
          404,
          diagnostic("PRR seed endpoint is disabled.", [
            "enable CESTUS_DEV_SEED_PRR for local development"
          ])
        );
      }

      const seed = await handle.runtime.seedIfEmpty(seedEvents);
      return json(200, {
        ok: true,
        seed,
        workspace: await handle.runtime.loadWorkspace()
      });
    }

    return json(
      404,
      diagnostic("Local runtime route was not found.", ["check the request path and method"])
    );
  }) as LocalRuntimeHttpHandler;

  handler.close = () => handle.close();
  return handler;
}

function draftRequestInputFromBody(value: unknown): CreateDraftRequestInput | undefined {
  if (!isJsonObject(value)) {
    return undefined;
  }

  const jurisdictionPack = jurisdictionPackRefFromBody(value.jurisdictionPack);
  const agency = contactRefFromBody(value.agency);
  const requester = contactRefFromBody(value.requester);
  const deadlineEstimateKind = value.deadlineEstimateKind;

  if (
    jurisdictionPack === undefined ||
    agency === undefined ||
    requester === undefined ||
    typeof value.requestText !== "string" ||
    typeof value.receivedAt !== "string" ||
    (Object.hasOwn(value, "deadlineEstimateKind") && typeof deadlineEstimateKind !== "string")
  ) {
    return undefined;
  }

  const draftInput = {
    jurisdictionPack,
    agency,
    requester,
    requestText: value.requestText,
    receivedAt: value.receivedAt
  };

  if (Object.hasOwn(value, "deadlineEstimateKind")) {
    return {
      ...draftInput,
      deadlineEstimateKind: deadlineEstimateKind as NonNullable<
        CreateDraftRequestInput["deadlineEstimateKind"]
      >
    };
  }

  return draftInput;
}

function jurisdictionPackRefFromBody(
  value: unknown
): CreateDraftRequestInput["jurisdictionPack"] | undefined {
  if (!isJsonObject(value) || typeof value.name !== "string" || typeof value.version !== "string") {
    return undefined;
  }

  return {
    name: value.name,
    version: value.version
  };
}

function contactRefFromBody(value: unknown): CreateDraftRequestInput["agency"] | undefined {
  if (
    !isJsonObject(value) ||
    typeof value.name !== "string" ||
    (value.email !== undefined && typeof value.email !== "string") ||
    (value.phone !== undefined && typeof value.phone !== "string")
  ) {
    return undefined;
  }

  return {
    name: value.name,
    ...(value.email === undefined ? {} : { email: value.email }),
    ...(value.phone === undefined ? {} : { phone: value.phone })
  };
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidDraftRequestBodyDiagnostic(): {
  readonly ok: false;
  readonly diagnostic: {
    readonly message: string;
    readonly allowedRepairActions: readonly string[];
  };
} {
  return diagnostic("Draft request body is invalid.", [
    "send agency, requester, jurisdiction, request text, and received timestamp"
  ]);
}

function parseJsonBody(
  body: string | undefined
):
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly body: unknown } {
  try {
    return {
      ok: true,
      value: body === undefined || body.trim() === "" ? {} : JSON.parse(body)
    };
  } catch {
    return {
      ok: false,
      body: diagnostic("Request body must be valid JSON.", ["send a valid JSON request body"])
    };
  }
}

function authorized(config: ResolvedLocalRuntimeConfig, request: LocalRuntimeRequest): boolean {
  if (!config.http.authRequired) {
    return true;
  }

  const expected = config.http.authToken;
  const header = request.headers?.authorization ?? request.headers?.Authorization;
  return expected !== undefined && header === `Bearer ${expected}`;
}

function diagnostic(message: string, allowedRepairActions: readonly string[]): {
  readonly ok: false;
  readonly diagnostic: {
    readonly message: string;
    readonly allowedRepairActions: readonly string[];
  };
} {
  return Object.freeze({
    ok: false,
    diagnostic: Object.freeze({
      message,
      allowedRepairActions: Object.freeze([...allowedRepairActions])
    })
  });
}

function json(status: number, body: unknown): LocalRuntimeResponse {
  return Object.freeze({
    status,
    headers: Object.freeze({ "content-type": "application/json; charset=utf-8" }),
    body: JSON.stringify(body)
  });
}
