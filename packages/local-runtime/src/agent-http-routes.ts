import type { AgentTaskPriority } from "../../agent/src/index.js";
import { isAgentSecretSafeText } from "../../agent/src/index.js";
import type { ActorRef } from "../../ontology/src/contracts.js";
import type { LocalRuntimeRequest, LocalRuntimeResponse } from "./http-handler.js";
import {
  defaultLocalAgentRuntimeFactory,
  type LocalAgentRuntimeFactory
} from "./agent-runtime-factory.js";
import type { LocalRuntimeHandle } from "./runtime-factory.js";

export interface HandleAgentHttpRouteInput {
  readonly request: LocalRuntimeRequest;
  readonly handle: LocalRuntimeHandle;
  readonly actor: ActorRef;
  readonly now: () => string;
  readonly agentRuntimeFactory?: LocalAgentRuntimeFactory;
}

export async function handleAgentHttpRoute(
  input: HandleAgentHttpRouteInput
): Promise<LocalRuntimeResponse | undefined> {
  const path = new URL(input.request.url, "http://localhost").pathname;
  if (!path.startsWith("/api/agent/")) {
    return undefined;
  }

  const runtimeFactory = input.agentRuntimeFactory ?? defaultLocalAgentRuntimeFactory;
  const runtime = runtimeFactory({
    handle: input.handle,
    actor: input.actor,
    now: input.now
  });

  try {
    if (input.request.method === "GET" && path === "/api/agent/status") {
      return json(200, await runtime.status());
    }

    if (input.request.method === "GET" && path === "/api/agent/tool-requests") {
      const status = await runtime.status();
      return json(200, {
        schemaVersion: "agent-tool-requests.v1",
        generatedAt: status.generatedAt,
        pendingApprovalCount: status.pendingApprovalCount,
        toolRequests: status.toolRequests
      });
    }

    if (input.request.method === "POST" && path === "/api/agent/tasks") {
      const payload = parseJsonObjectBody(input.request.body);
      if (!payload.ok) {
        return json(400, payload.body);
      }

      const taskInput = taskInputFromBody(payload.value);
      if (taskInput === undefined) {
        return json(400, invalidTaskBodyDiagnostic());
      }

      const initialized = await ensureDefaultIdentity(runtime, input);
      if (!initialized.ok) {
        return json(500, initialized.body);
      }

      const status = await runtime.status();
      if (status.tasks.some((task) => task.taskId === taskInput.taskId)) {
        return json(409, duplicateTaskDiagnostic());
      }

      return json(200, await runtime.createTask({
        ...taskInput,
        requestedBy: input.actor.id
      }));
    }

    return undefined;
  } catch {
    return json(
      500,
      diagnostic("Agent runtime route failed.", ["retry the local agent request", "inspect agent diagnostics"])
    );
  }
}

type LocalAgentRuntime = ReturnType<LocalAgentRuntimeFactory>;

async function ensureDefaultIdentity(
  runtime: LocalAgentRuntime,
  input: HandleAgentHttpRouteInput
): Promise<{ readonly ok: true } | { readonly ok: false; readonly body: unknown }> {
  const result = await runtime.initializeDefaultIdentity({
    workspaceId: input.handle.mountedWorkspace?.workspaceId ?? "ws_local_runtime",
    initializedBy: input.actor.id
  });

  if (result.ok) {
    return { ok: true };
  }

  return {
    ok: false,
    body: diagnostic("Agent identity could not be initialized.", [
      "inspect the local agent runtime configuration"
    ])
  };
}

function taskInputFromBody(value: Record<string, unknown>): {
  readonly taskId: string;
  readonly title: string;
  readonly priority: AgentTaskPriority;
} | undefined {
  if (!hasOnlyKeys(value, ["taskId", "title", "priority"])) {
    return undefined;
  }

  const priority = value.priority ?? "normal";
  if (
    !isAgentTaskId(value.taskId) ||
    !isSafeNonEmptyText(value.title) ||
    !isRouteTaskPriority(priority)
  ) {
    return undefined;
  }

  return {
    taskId: value.taskId,
    title: value.title,
    priority
  };
}

function parseJsonObjectBody(
  body: string | undefined
):
  | { readonly ok: true; readonly value: Record<string, unknown> }
  | { readonly ok: false; readonly body: unknown } {
  try {
    const value = body === undefined || body.trim() === "" ? {} : JSON.parse(body);
    if (!isJsonObject(value)) {
      return { ok: false, body: invalidTaskBodyDiagnostic() };
    }
    return { ok: true, value };
  } catch {
    return {
      ok: false,
      body: diagnostic("Agent request body must be valid JSON.", ["send a valid JSON request body"])
    };
  }
}

function invalidTaskBodyDiagnostic(): {
  readonly ok: false;
  readonly diagnostic: {
    readonly message: string;
    readonly allowedRepairActions: readonly string[];
  };
} {
  return diagnostic("Agent task body is invalid.", [
    "send taskId, title, and optional priority as a JSON object"
  ]);
}

function duplicateTaskDiagnostic(): {
  readonly ok: false;
  readonly diagnostic: {
    readonly message: string;
    readonly allowedRepairActions: readonly string[];
  };
} {
  return diagnostic("Agent task already exists.", [
    "choose a different task id",
    "refresh agent status"
  ]);
}

function isAgentTaskId(value: unknown): value is string {
  return typeof value === "string" && /^task_[a-zA-Z0-9_-]+$/.test(value) && isAgentSecretSafeText(value);
}

function isSafeNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && isAgentSecretSafeText(value);
}

function isRouteTaskPriority(value: unknown): value is AgentTaskPriority {
  return value === "low" || value === "normal" || value === "high";
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
