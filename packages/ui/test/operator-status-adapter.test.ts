import { describe, expect, it, vi } from "vitest";
import {
  createHttpOperatorStatusAdapter,
  createStaticOperatorStatusAdapter,
  operatorStatusDtoFromJson,
  runtimeUnavailableStatus
} from "../src/operator-status/operator-status-adapter.js";
import type { OperatorStatusDto } from "../src/operator-status/operator-status-types.js";

describe("createHttpOperatorStatusAdapter", () => {
  it("loads operator status from the local runtime API with a browser-safe GET request", async () => {
    const payload = readyOperatorStatus();
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(200, payload)
    );
    const adapter = createHttpOperatorStatusAdapter({
      baseUrl: "http://127.0.0.1:8787",
      fetcher
    });

    await expect(adapter.loadStatus()).resolves.toEqual(payload);
    expect(fetcher).toHaveBeenCalledWith("http://127.0.0.1:8787/api/operator/status", {
      credentials: "same-origin",
      headers: {},
      method: "GET"
    });
  });

  it("includes an authorization header only when an auth token is provided", async () => {
    const payload = readyOperatorStatus();
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(200, payload)
    );
    const adapter = createHttpOperatorStatusAdapter({
      authToken: "local-runtime-token",
      credentials: "include",
      fetcher
    });

    await adapter.loadStatus();

    expect(fetcher).toHaveBeenCalledWith("/api/operator/status", {
      credentials: "include",
      headers: { authorization: "Bearer local-runtime-token" },
      method: "GET"
    });
  });

  it("returns a parsed OperatorStatusDto for successful JSON", () => {
    const payload = readyOperatorStatus();

    expect(operatorStatusDtoFromJson(payload)).toEqual(payload);
  });

  it("maps non-2xx JSON into a runtime-unavailable DTO without leaking raw response text", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(503, {
        ok: false,
        error: {
          message: "Runtime failed with token=abc123 at /Volumes/Cestus and Bearer raw-token",
          diagnostics: [
            {
              severity: "error",
              category: "runtime",
              message: "Workspace path /tmp/cestus contains password=hunter2"
            }
          ]
        }
      })
    );
    const adapter = createHttpOperatorStatusAdapter({ fetcher });

    const status = await adapter.loadStatus();

    expect(status.runtime.available).toBe(false);
    expect(status.summary.overallState).toBe("unavailable");
    expect(JSON.stringify(status)).not.toMatch(
      /token=abc123|Bearer raw-token|password=hunter2|\/Volumes\/Cestus|\/tmp\/cestus/
    );
  });

  it("maps fetch rejection or invalid JSON into a runtime-unavailable DTO", async () => {
    const rejected = createHttpOperatorStatusAdapter({
      fetcher: vi.fn(async () => {
        throw new Error("connect ECONNREFUSED 127.0.0.1 token=abc123");
      })
    });
    const invalidJson = createHttpOperatorStatusAdapter({
      fetcher: vi.fn(async () => new Response("not json", { status: 200 }))
    });

    await expect(rejected.loadStatus()).resolves.toMatchObject({
      runtime: { available: false },
      summary: { overallState: "unavailable" }
    });
    await expect(invalidJson.loadStatus()).resolves.toMatchObject({
      runtime: { available: false },
      summary: { overallState: "unavailable" }
    });
  });

  it("redacts secret-shaped diagnostics and local absolute path prefixes before returning DTOs", async () => {
    const unsafePayload = {
      ...readyOperatorStatus(),
      runtime: {
        ...readyOperatorStatus().runtime,
        safeMessage: "Runtime saw Bearer raw-token at /Volumes/Cestus"
      },
      sections: [
        {
          ...readyOperatorStatus().sections[0],
          diagnostics: [
            {
              diagnosticId: "diag_runtime_unavailable",
              severity: "error",
              category: "runtime",
              message: "token=abc123 in /tmp/cestus with Bearer raw-token"
            }
          ]
        }
      ]
    };
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(200, unsafePayload)
    );
    const adapter = createHttpOperatorStatusAdapter({ fetcher });

    const status = await adapter.loadStatus();
    const serialized = JSON.stringify(status);

    expect(status.schemaVersion).toBe("operator-status.v1");
    expect(serialized).not.toMatch(/token=abc123|Bearer raw-token|\/Volumes\/Cestus|\/tmp\/cestus/);
    expect(serialized).toContain("[path redacted]");
  });
});

describe("createStaticOperatorStatusAdapter", () => {
  it("returns frozen test DTOs and caller mutation cannot affect future loads", async () => {
    const source = readyOperatorStatus();
    const adapter = createStaticOperatorStatusAdapter(source);

    const first = await adapter.loadStatus();
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.sections[0])).toBe(true);

    try {
      (first.runtime as { safeMessage: string }).safeMessage = "mutated";
      (first.sections as OperatorStatusDto["sections"] & unknown[]).push(first.sections[0]);
    } catch {
      // Frozen DTOs may throw in strict mode; either way the next load must stay pristine.
    }

    const second = await adapter.loadStatus();
    expect(second.runtime.safeMessage).toBe("Local runtime is serving a mounted portable workspace.");
    expect(second.sections).toHaveLength(1);
    expect(second).toEqual(source);
    expect(second).not.toBe(first);
  });
});

describe("runtimeUnavailableStatus", () => {
  it("returns a safe operator status DTO", () => {
    const status = runtimeUnavailableStatus({
      generatedAt: "2026-07-06T22:00:00.000Z",
      message: "No runtime at /Volumes/Cestus with token=abc123"
    });

    expect(status).toMatchObject({
      schemaVersion: "operator-status.v1",
      generatedAt: "2026-07-06T22:00:00.000Z",
      runtime: { available: false },
      summary: { overallState: "unavailable" }
    });
    expect(JSON.stringify(status)).not.toMatch(/token=abc123|\/Volumes\/Cestus/);
  });
});

function readyOperatorStatus(): OperatorStatusDto {
  return {
    schemaVersion: "operator-status.v1",
    generatedAt: "2026-07-06T22:00:00.000Z",
    runtime: {
      available: true,
      storageStrategy: "portable-workspace",
      bindMode: "loopback",
      workspaceMounted: true,
      safeMessage: "Local runtime is serving a mounted portable workspace."
    },
    summary: {
      overallState: "ready",
      blockedCount: 0,
      actionRequiredCount: 0,
      degradedCount: 0,
      nextSafeActionId: "action_open_ingestion"
    },
    sections: [
      {
        sectionId: "workspace",
        label: "Workspace",
        state: "ready",
        headline: "Mounted portable workspace",
        safeSummary: "Workspace manifest, ledger, and blob roots are readable.",
        metrics: [
          { metricId: "ledger_events", label: "Ledger events", value: "42", tone: "healthy" }
        ],
        diagnostics: [],
        sourceEvidence: [
          {
            evidenceId: "src_workspace_verify",
            sourceContract: "workspace-ops.v1",
            sourceKind: "workspace-ops",
            label: "verify workspace",
            refs: [{ label: "workspaceId", value: "ws_case_001" }]
          }
        ],
        nextSafeActionIds: ["action_open_ingestion"]
      }
    ],
    safeActions: [
      {
        actionId: "action_open_ingestion",
        label: "Open Ingestion",
        kind: "navigate",
        target: "ingestion",
        sourceContract: "operator-status.v1",
        requiresHumanApproval: false,
        mutatesCanonicalState: false,
        externalEffect: false,
        enabled: true
      }
    ]
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}
