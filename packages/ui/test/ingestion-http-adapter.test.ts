import { describe, expect, it, vi } from "vitest";
import { createHttpIngestionWorkspaceAdapter } from "../src/ingestion/ingestion-adapter.js";

describe("createHttpIngestionWorkspaceAdapter", () => {
  it("reopens persisted source reviews and executes local parsing through authenticated routes", async () => {
    const sources = [{ sourceCollectionId: "src_saved", label: "Saved folder", scanBatchIds: [], importBatchIds: [], diagnosticIds: [] }];
    const fetcher = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input).endsWith("/sources")) return jsonResponse(200, { ok: true, sources });
      if (String(input).includes("/review?")) return jsonResponse(200, { ok: true, review: reviewDto() });
      return jsonResponse(200, { ok: true, jobs: [] });
    });
    const adapter = createHttpIngestionWorkspaceAdapter({ fetcher, authToken: "local-session" });
    await expect(adapter.listSources()).resolves.toEqual({ sources });
    await expect(adapter.loadReview({ sourceCollectionId: "src_saved" })).resolves.toMatchObject({ ok: true, review: reviewDto() });
    await expect(adapter.runLocalParsing({ sourceCollectionId: "src_saved" })).resolves.toEqual({ jobs: [] });
    expect(fetcher).toHaveBeenNthCalledWith(2, "/api/ingestion/review?sourceCollectionId=src_saved", expect.objectContaining({
      method: "GET", credentials: "same-origin", headers: { authorization: "Bearer local-session" }
    }));
    expect(fetcher).toHaveBeenNthCalledWith(3, "/api/ingestion/parse/run", expect.objectContaining({
      method: "POST", body: JSON.stringify({ sourceCollectionId: "src_saved" })
    }));
  });

  it("keeps relative filenames reviewable and returns safe processing failures", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => String(input).includes("/review?")
      ? jsonResponse(200, { ok: true, review: { ...reviewDto(), importCompleted: false, approvedImportBatchId: "imp_new",
        files: [{ occurrenceId: "occ_file", sourcePath: "minutes/meeting.txt", contentHash: "sha256:abc", byteLength: 20, status: "observed" }] } })
      : jsonResponse(200, { ok: true, jobs: [{ jobId: "parse_failed", kind: "local-parse", state: "failed", retryable: false,
        diagnosticIds: [], message: "Encrypted PDF at /private/source.pdf token=secret" }] }));
    const adapter = createHttpIngestionWorkspaceAdapter({ fetcher });
    const result = await adapter.loadReview({ sourceCollectionId: "src_drive_001" });
    expect(result).toMatchObject({ ok: true, review: { importCompleted: false, approvedImportBatchId: "imp_new",
      files: [{ sourcePath: "minutes/meeting.txt" }] } });
    const jobs = await adapter.runLocalParsing({});
    expect(jobs.jobs[0]?.message).toBe("Encrypted PDF at [path redacted] token=[redacted]");
  });

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
      jsonResponse(503, {
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

  it("maps stable non-2xx action errors instead of throwing away diagnostics", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(400, {
        ok: false,
        error: {
          code: "INGESTION_HTTP_STORAGE_PATH_FORBIDDEN",
          message: "Ingestion HTTP request body must not include storage paths.",
          allowedRepairActions: ["remove storage paths"],
          diagnostics: [
            {
              severity: "error",
              category: "ingestion.http",
              message: "Storage path fields are forbidden."
            }
          ]
        }
      })
    );
    const adapter = createHttpIngestionWorkspaceAdapter({ fetcher });

    await expect(adapter.dryRunScan({ sourceCollectionId: "src_drive_001", scanBatchId: "scan_001" })).resolves.toEqual({
      ok: false,
      error: {
        code: "INGESTION_HTTP_STORAGE_PATH_FORBIDDEN",
        message: "Ingestion HTTP request body must not include storage paths.",
        allowedRepairActions: ["remove storage paths"],
        diagnostics: [
          {
            severity: "error",
            category: "ingestion.http",
            message: "Storage path fields are forbidden."
          }
        ]
      }
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

  it("sends the live source registration contract while stripping workspace storage paths", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(200, { ok: true, review: reviewDto(), eventIds: ["evt_source"] })
    );
    const adapter = createHttpIngestionWorkspaceAdapter({ fetcher });
    const input = {
      sourceCollectionId: "src_drive_001",
      label: "Old archive",
      rootUri: "file:///Volumes/OldArchive",
      sourceRoot: "/Volumes/OldArchive",
      workspaceRoot: "/Volumes/Cestus"
    };

    await adapter.registerSource(input);

    const init = fetcher.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/ingestion/sources");
    expect(JSON.parse(String(init?.body))).toEqual({
      sourceCollectionId: "src_drive_001",
      label: "Old archive",
      rootUri: "file:///Volumes/OldArchive",
      sourceRoot: "/Volumes/OldArchive"
    });
  });

  it("accepts retry job successes without requiring a review DTO", async () => {
    const job = {
      jobId: "parse_001",
      kind: "local-parse",
      state: "queued",
      retryable: false,
      sourceCollectionId: "src_drive_001",
      diagnosticIds: []
    };
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(200, { ok: true, job, eventIds: ["evt_retry"] })
    );
    const adapter = createHttpIngestionWorkspaceAdapter({ fetcher });

    await expect(adapter.retryJob({ jobId: "parse_001" })).resolves.toEqual({
      ok: true,
      job,
      eventIds: ["evt_retry"]
    });
  });

  it("maps stable job-list failures into diagnostics instead of hiding them", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(503, {
        ok: false,
        error: {
          code: "INGESTION_WORKSPACE_NOT_MOUNTED",
          message: "Portable workspace is not mounted.",
          allowedRepairActions: ["mount the workspace"],
          diagnostics: [
            {
              severity: "error",
              category: "ingestion.mount",
              message: "Missing drive /Volumes/Cestus"
            }
          ]
        }
      })
    );
    const adapter = createHttpIngestionWorkspaceAdapter({ fetcher });

    await expect(adapter.listJobs({ sourceCollectionId: "src_drive_001" })).resolves.toEqual({
      jobs: [],
      diagnostics: [
        {
          severity: "error",
          category: "ingestion.mount",
          message: "Missing drive [path redacted]"
        },
        {
          severity: "error",
          category: "ingestion",
          message: "Portable workspace is not mounted."
        }
      ]
    });
  });

  it("maps stable diagnostics endpoint failures without dropping server diagnostics", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(503, {
        ok: false,
        error: {
          code: "INGESTION_WORKSPACE_NOT_MOUNTED",
          message: "Portable workspace is not mounted.",
          allowedRepairActions: ["mount the workspace"],
          diagnostics: [
            {
              severity: "warning",
              category: "ingestion.mount",
              message: "Drive disappeared at /Volumes/Cestus"
            }
          ]
        }
      })
    );
    const adapter = createHttpIngestionWorkspaceAdapter({ fetcher });

    await expect(adapter.loadDiagnostics({ sourceCollectionId: "src_drive_001" })).resolves.toEqual({
      diagnostics: [
        {
          severity: "warning",
          category: "ingestion.mount",
          message: "Drive disappeared at [path redacted]"
        },
        {
          severity: "error",
          category: "ingestion",
          message: "Portable workspace is not mounted."
        }
      ]
    });
  });

  it("redacts secrets and private paths from successful workspace diagnostics", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(200, {
        mounted: true,
        workspaceId: "ws_ui_001",
        label: "UI workspace",
        diagnostics: [
          {
            severity: "error",
            category: "ingestion",
            message:
              "Bearer abc.def.ghi password=hunter2 oauth_token=tok_123 client_secret=client_123 apiKey=key_123 credential=cred_123 at /Users/drake/private/source /mnt/cestus/raw /media/cestus/raw /opt/cestus"
          }
        ],
        review: {
          ...reviewDto(),
          diagnostics: [
            {
              severity: "warning",
              category: "ingestion",
              message:
                "private key begins -----BEGIN PRIVATE KEY----- and path /Volumes/Cestus/raw /var/lib/cestus /etc/cestus.conf"
            }
          ]
        }
      })
    );
    const adapter = createHttpIngestionWorkspaceAdapter({ fetcher });

    const workspace = await adapter.loadWorkspace();

    expect(JSON.stringify(workspace)).not.toMatch(
      /abc\.def\.ghi|hunter2|tok_123|client_123|key_123|cred_123|PRIVATE KEY|\/Users\/drake|\/Volumes\/Cestus|\/mnt\/cestus|\/media\/cestus|\/opt\/cestus|\/var\/lib|\/etc\/cestus/
    );
    expect(JSON.stringify(workspace)).toContain("[redacted]");
    expect(JSON.stringify(workspace)).toContain("[path redacted]");
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
