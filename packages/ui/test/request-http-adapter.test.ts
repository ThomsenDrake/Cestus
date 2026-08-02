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
      credentials: "same-origin",
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

  it("turns malformed successful workspace payloads into safe load errors", async () => {
    const fetcher = vi.fn(async () => jsonResponse(200, { ok: true }));
    const adapter = createHttpRequestsAdapter({ fetcher });

    await expect(adapter.loadRequestsWorkspace()).rejects.toThrow(
      "Requests runtime returned invalid workspace payload."
    );
  });

  it.each([
    ["card", { cards: [{ ...workspace.cards[0], productionCount: "many" }] }],
    [
      "builder",
      {
        builder: {
          ...workspace.builder,
          steps: [{ ...workspace.builder.steps[0], suggestedFills: "not-an-array" }]
        }
      }
    ],
    ["gate", { gates: [{ ...workspace.gates[0], checks: [{ id: "risk-review", ready: "yes" }] }] }],
    [
      "request detail correspondence",
      { requestDetails: [{ ...workspace.requestDetails[0], latestInboundCorrespondence: {} }] }
    ],
    [
      "request detail production batch",
      { requestDetails: [{ ...workspace.requestDetails[0], productionBatches: [{}] }] }
    ],
    [
      "request detail follow-up preview",
      { requestDetails: [{ ...workspace.requestDetails[0], followUpDraft: {} }] }
    ]
  ])("rejects malformed nested %s workspace payloads", async (_label, override) => {
    const fetcher = vi.fn(async () => jsonResponse(200, { ...workspace, ...override }));
    const adapter = createHttpRequestsAdapter({ fetcher });

    await expect(adapter.loadRequestsWorkspace()).rejects.toThrow(
      "Requests runtime returned invalid workspace payload."
    );
  });

  it.each([
    ["a missing send check", (checks: readonly unknown[]) => checks.slice(1)],
    ["a duplicate send check", (checks: readonly unknown[]) => [...checks.slice(0, -1), checks[0]]],
    [
      "an unknown send check",
      (checks: readonly unknown[]) => [
        ...checks.slice(0, -1),
        { ...(checks.at(-1) as object), id: "provider-ready-unknown" }
      ]
    ],
    [
      "a ready-but-locked send check",
      (checks: readonly unknown[]) => [
        { ...(checks[0] as object), ready: true, locked: true },
        ...checks.slice(1)
      ]
    ]
  ])("rejects request details with %s", async (_label, mutateChecks) => {
    const detail = workspace.requestDetails[0]!;
    const malformedWorkspace = {
      ...workspace,
      requestDetails: workspace.requestDetails.map((candidate) =>
        candidate.prrRequestId === detail.prrRequestId
          ? { ...candidate, sendGate: mutateChecks(candidate.sendGate) }
          : candidate
      )
    };
    const adapter = createHttpRequestsAdapter({
      fetcher: vi.fn(async () => jsonResponse(200, malformedWorkspace))
    });

    await expect(adapter.loadRequestsWorkspace()).rejects.toThrow(
      "Requests runtime returned invalid workspace payload."
    );
  });

  it.each([
    ["a missing per-request summary", workspace.gates.slice(1)],
    [
      "a duplicate per-request summary",
      [...workspace.gates.slice(0, -1), workspace.gates[0]]
    ],
    [
      "an unknown summary check",
      workspace.gates.map((gate, index) =>
        index === 0
          ? {
              ...gate,
              checks: [...gate.checks.slice(0, -1), { ...gate.checks.at(-1), id: "provider-ready-unknown" }]
            }
          : gate
      )
    ],
    [
      "a summary that contradicts its checks",
      workspace.gates.map((gate, index) =>
        index === 0 ? { ...gate, ready: true, locked: false } : gate
      )
    ]
  ])("rejects gate summaries with %s", async (_label, gates) => {
    const adapter = createHttpRequestsAdapter({
      fetcher: vi.fn(async () => jsonResponse(200, { ...workspace, gates }))
    });

    await expect(adapter.loadRequestsWorkspace()).rejects.toThrow(
      "Requests runtime returned invalid workspace payload."
    );
  });

  it("rejects request-detail gates that contradict their matching summary", async () => {
    const target = workspace.requestDetails[0]!;
    const requestDetails = workspace.requestDetails.map((detail) =>
      detail.prrRequestId === target.prrRequestId
        ? {
            ...detail,
            sendGate: detail.sendGate.map((check, index) =>
              index === 0 ? { ...check, ready: true, locked: false } : check
            )
          }
        : detail
    );
    const adapter = createHttpRequestsAdapter({
      fetcher: vi.fn(async () => jsonResponse(200, { ...workspace, requestDetails }))
    });

    await expect(adapter.loadRequestsWorkspace()).rejects.toThrow(
      "Requests runtime returned invalid workspace payload."
    );
  });

  it("rejects malformed fee currency without exposing the raw value", async () => {
    const requestDetails = workspace.requestDetails.map((detail) =>
      detail.feeEstimate === undefined
        ? detail
        : {
            ...detail,
            feeEstimate: { ...detail.feeEstimate, currency: "Bearer raw-token" }
          }
    );
    const adapter = createHttpRequestsAdapter({
      fetcher: vi.fn(async () => jsonResponse(200, { ...workspace, requestDetails }))
    });

    await expect(adapter.loadRequestsWorkspace()).rejects.toThrow(
      "Requests runtime returned invalid workspace payload."
    );
    await expect(adapter.loadRequestsWorkspace()).rejects.not.toThrow("raw-token");
  });

  it.each([
    ["negative amount", -1],
    ["fractional amount", 10.5]
  ])("rejects a fee estimate with %s", async (_label, amountCents) => {
    const requestDetails = workspace.requestDetails.map((detail) =>
      detail.feeEstimate === undefined
        ? detail
        : {
            ...detail,
            feeEstimate: { ...detail.feeEstimate, amountCents }
          }
    );
    const adapter = createHttpRequestsAdapter({
      fetcher: vi.fn(async () => jsonResponse(200, { ...workspace, requestDetails }))
    });

    await expect(adapter.loadRequestsWorkspace()).rejects.toThrow(
      "Requests runtime returned invalid workspace payload."
    );
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
      credentials: "same-origin",
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

  it("turns malformed successful draft payloads into stale safe diagnostics", async () => {
    const fetcher = vi.fn(async () => jsonResponse(200, { ok: true }));
    const adapter = createHttpRequestsAdapter({ fetcher });

    const result = await adapter.createDraftRequest({
      jurisdictionPack: { name: "florida-public-records", version: "0.1.0" },
      agency: { name: "City Clerk" },
      requester: { name: "Avery Investigator" },
      requestText: "All budget amendment memos from January 2026."
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.workspaceStale).toBe(true);
      expect(result.diagnostic.message).toBe("Requests runtime returned invalid draft result.");
    }
  });

  it("turns malformed nested successful draft workspaces into stale safe diagnostics", async () => {
    const malformedWorkspace = {
      ...workspace,
      requestDetails: [{ ...workspace.requestDetails[0], activeDeadline: {} }]
    };
    const fetcher = vi.fn(async () =>
      jsonResponse(200, {
        ok: true,
        prrRequestId: "prr_http_city_budget",
        committedEventIds: ["evt_created", "evt_deadline"],
        workspace: malformedWorkspace
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
      expect(result.workspaceStale).toBe(true);
      expect(result.diagnostic.message).toBe("Requests runtime returned invalid draft result.");
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
      credentials: "same-origin",
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
