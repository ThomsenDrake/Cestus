import { describe, expect, it, vi } from "vitest";
import { buildPrrProjection } from "../../prr/src/projection.js";
import { buildPrrWorkspaceDto } from "../../prr/src/read-api.js";
import { prrWorkspaceSeedEvents } from "../../prr/src/workspace-seed.js";
import { createHttpRequestsAdapter } from "../src/requests/request-adapter.js";

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
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}
