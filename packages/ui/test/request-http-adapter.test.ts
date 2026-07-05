import { describe, expect, it, vi } from "vitest";
import { buildPrrProjection } from "../../prr/src/projection.js";
import { buildPrrWorkspaceDto } from "../../prr/src/read-api.js";
import { prrWorkspaceSeedEvents } from "../../prr/src/workspace-seed.js";
import { createHttpRequestsAdapter, httpRequestsAdapter } from "../src/requests/request-adapter.js";

const workspace = buildPrrWorkspaceDto(buildPrrProjection(prrWorkspaceSeedEvents), {
  now: "2026-07-20T12:00:00.000Z"
});

describe("createHttpRequestsAdapter", () => {
  it("loads workspace DTOs from the local runtime API", async () => {
    const fetcher = vi.fn(async () => jsonResponse(200, workspace));
    const adapter = createHttpRequestsAdapter({
      baseUrl: "http://127.0.0.1:8787",
      fetcher
    });

    await expect(adapter.loadRequestsWorkspace()).resolves.toEqual(workspace);
    expect(fetcher).toHaveBeenCalledWith("http://127.0.0.1:8787/api/requests/workspace", {
      headers: {},
      method: "GET"
    });
  });

  it("turns workspace fetch failures into safe load errors", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("Bearer raw-token");
    });
    const adapter = createHttpRequestsAdapter({ fetcher });

    await expect(adapter.loadRequestsWorkspace()).rejects.toThrow(
      "Requests runtime request failed."
    );
    await expect(adapter.loadRequestsWorkspace()).rejects.not.toThrow("raw-token");
  });

  it("turns invalid workspace JSON into a safe load error", async () => {
    const fetcher = vi.fn(async () => textResponse(200, "Bearer raw-token"));
    const adapter = createHttpRequestsAdapter({ fetcher });

    await expect(adapter.loadRequestsWorkspace()).rejects.toThrow(
      "Requests runtime returned invalid workspace JSON."
    );
    await expect(adapter.loadRequestsWorkspace()).rejects.not.toThrow("raw-token");
  });

  it("submits draft creation JSON and maps the runtime result", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(200, {
        ok: true,
        prrRequestId: "prr_http_city_budget",
        committedEventIds: ["evt_created", "evt_deadline"],
        workspace
      })
    );
    const adapter = createHttpRequestsAdapter({
      baseUrl: "",
      authToken: "secret-token",
      fetcher
    });

    const result = await adapter.createDraftRequest({
      jurisdictionPack: { name: "florida-public-records", version: "0.1.0" },
      agency: { name: "City Clerk" },
      requester: { name: "Avery Investigator" },
      requestText: "All budget amendment memos from January 2026."
    });

    expect(result).toEqual({
      ok: true,
      prrRequestId: "prr_http_city_budget",
      committedEventIds: ["evt_created", "evt_deadline"],
      workspace
    });
    expect(fetcher).toHaveBeenCalledWith("/api/requests/drafts", {
      body: expect.stringContaining("City Clerk"),
      headers: {
        authorization: "Bearer secret-token",
        "content-type": "application/json"
      },
      method: "POST"
    });
  });

  it("turns HTTP failures into safe diagnostics", async () => {
    const fetcher = vi.fn(async () => jsonResponse(503, { message: "Bearer raw-token" }));
    const adapter = createHttpRequestsAdapter({ fetcher });

    const result = await adapter.createDraftRequest({
      jurisdictionPack: { name: "florida-public-records", version: "0.1.0" },
      agency: { name: "City Clerk" },
      requester: { name: "Avery Investigator" },
      requestText: "All budget amendment memos from January 2026."
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failedStep).toBe("append-request");
      expect(result.diagnostic.message).toBe("Requests runtime returned HTTP 503.");
      expect(result.diagnostic.message).not.toContain("raw-token");
    }
  });

  it("turns invalid draft creation JSON into a safe diagnostic", async () => {
    const fetcher = vi.fn(async () => textResponse(200, "Bearer raw-token"));
    const adapter = createHttpRequestsAdapter({ fetcher });

    const result = await adapter.createDraftRequest({
      jurisdictionPack: { name: "florida-public-records", version: "0.1.0" },
      agency: { name: "City Clerk" },
      requester: { name: "Avery Investigator" },
      requestText: "All budget amendment memos from January 2026."
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostic.message).toBe("Requests runtime returned invalid JSON.");
      expect(result.diagnostic.message).not.toContain("raw-token");
    }
  });

  it("redacts successful runtime failure diagnostics before returning them", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(200, {
        ok: false,
        failedStep: "append-request",
        committedEventIds: [],
        diagnostic: {
          message: "Bearer raw-token",
          allowedRepairActions: ["retry with token secret"]
        },
        workspace
      })
    );
    const adapter = createHttpRequestsAdapter({ fetcher });

    const result = await adapter.createDraftRequest({
      jurisdictionPack: { name: "florida-public-records", version: "0.1.0" },
      agency: { name: "City Clerk" },
      requester: { name: "Avery Investigator" },
      requestText: "All budget amendment memos from January 2026."
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostic.message).toBe("Requests runtime returned a failure result.");
      expect(result.diagnostic.allowedRepairActions).toEqual(["retry request creation"]);
    }
  });

  it("uses the current global fetch when the default HTTP adapter is called", async () => {
    const originalFetch = globalThis.fetch;
    const fetcher = vi.fn(async () => jsonResponse(200, workspace));
    globalThis.fetch = fetcher as typeof fetch;

    try {
      await expect(httpRequestsAdapter.loadRequestsWorkspace()).resolves.toEqual(workspace);
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(fetcher).toHaveBeenCalledWith("/api/requests/workspace", {
      headers: {},
      method: "GET"
    });
  });
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function textResponse(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "application/json" }
  });
}
