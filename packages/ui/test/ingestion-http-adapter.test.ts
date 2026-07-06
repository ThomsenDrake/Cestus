import { describe, expect, it, vi } from "vitest";
import { createHttpIngestionWorkspaceAdapter } from "../src/ingestion/ingestion-adapter.js";

describe("createHttpIngestionWorkspaceAdapter", () => {
  it("loads mounted workspace DTOs from the local ingestion runtime API", async () => {
    const payload = {
      mounted: true,
      workspaceId: "ws_ui_001",
      label: "UI workspace",
      diagnostics: []
    };
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(200, { ok: true, workspace: payload })
    );
    const adapter = createHttpIngestionWorkspaceAdapter({
      baseUrl: "http://127.0.0.1:8787",
      fetcher
    });

    await expect(adapter.loadWorkspace()).resolves.toEqual(payload);
    expect(fetcher).toHaveBeenCalledWith("http://127.0.0.1:8787/api/ingestion/workspace", {
      credentials: "same-origin",
      headers: {},
      method: "GET"
    });
  });

  it("also accepts the current direct workspace DTO response shape", async () => {
    const payload = {
      mounted: true,
      workspaceId: "ws_ui_direct",
      label: "Direct workspace DTO",
      diagnostics: []
    };
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse(200, payload));
    const adapter = createHttpIngestionWorkspaceAdapter({ fetcher });

    await expect(adapter.loadWorkspace()).resolves.toEqual(payload);
  });

  it("maps workspace-not-mounted into a safe UI DTO", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(200, {
        ok: false,
        error: {
          code: "INGESTION_WORKSPACE_NOT_MOUNTED",
          message: "Portable workspace is not mounted.",
          allowedRepairActions: ["mount the workspace"],
          diagnostics: []
        }
      })
    );
    const adapter = createHttpIngestionWorkspaceAdapter({ fetcher });

    await expect(adapter.loadWorkspace()).resolves.toEqual({
      mounted: false,
      diagnostics: [
        {
          severity: "error",
          category: "workspace",
          message: "Portable workspace is not mounted."
        }
      ]
    });
  });

  it("does not send workspace paths in ingestion action bodies", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(200, { ok: true, review: reviewDto(), eventIds: ["evt_scan"] })
    );
    const adapter = createHttpIngestionWorkspaceAdapter({ fetcher });

    await adapter.dryRunScan({ sourceCollectionId: "src_drive_001", scanBatchId: "scan_001" });

    const init = fetcher.mock.calls[0]?.[1] as RequestInit | undefined;
    const body = JSON.parse(String(init?.body));
    expect(body).toEqual({ sourceCollectionId: "src_drive_001", scanBatchId: "scan_001" });
    expect(JSON.stringify(body)).not.toMatch(/workspace|storage|sqlite|blobRoot/i);
  });
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function reviewDto() {
  return {
    sourceCollectionId: "src_drive_001",
    label: "Old archive",
    totals: {
      observedFiles: 0,
      uniqueContent: 0,
      duplicateOccurrences: 0,
      skipped: 0,
      bytes: 0,
      estimatedNewBlobBytes: 0
    },
    approvalRequired: false,
    duplicateGroups: [],
    evidenceLinks: [],
    parseJobs: [],
    diagnostics: []
  };
}
