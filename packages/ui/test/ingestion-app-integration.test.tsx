/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.js";
import {
  createStaticIngestionWorkspaceAdapter,
  type IngestionWorkspaceAdapter
} from "../src/ingestion/ingestion-adapter.js";
import type { IngestionReviewDto } from "../src/ingestion/ingestion-types.js";
import { createTestRequestsAdapter } from "./request-test-utils.js";

describe("ingestion app integration", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("exposes the ingestion workspace through an injected adapter without the placeholder review", async () => {
    render(
      <App
        requestsAdapter={createTestRequestsAdapter()}
        ingestionAdapter={createStaticIngestionWorkspaceAdapter({
          mounted: false,
          diagnostics: []
        })}
      />
    );

    fireEvent.click(screen.getByRole("link", { name: /Ingestion/ }));

    expect(await screen.findByRole("heading", { name: "Ingestion" })).toBeInTheDocument();
    expect(screen.queryByText("External investigation archive placeholder")).not.toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Ingestion workspace not connected" })).toBeInTheDocument();
  });

  it("closes an open request builder when navigating to ingestion", async () => {
    render(
      <App
        requestsAdapter={createTestRequestsAdapter()}
        ingestionAdapter={createStaticIngestionWorkspaceAdapter({
          mounted: false,
          diagnostics: []
        })}
      />
    );

    fireEvent.click(screen.getByRole("link", { name: "Requests" }));
    fireEvent.click(await screen.findByRole("button", { name: "New request" }));
    expect(screen.getByRole("dialog", { name: "Guided request builder" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "Ingestion", hidden: true }));
    expect(screen.getByRole("heading", { name: "Ingestion" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Guided request builder" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "Requests" }));
    expect(await screen.findByRole("heading", { name: "Requests" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Guided request builder" })).not.toBeInTheDocument();
  });

  it("routes the ingestion new request action into Requests", async () => {
    render(
      <App
        requestsAdapter={createTestRequestsAdapter()}
        ingestionAdapter={createStaticIngestionWorkspaceAdapter({
          mounted: false,
          diagnostics: []
        })}
      />
    );

    fireEvent.click(screen.getByRole("link", { name: "Ingestion" }));
    expect(screen.getByRole("heading", { name: "Ingestion" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "New request" }));

    expect(await screen.findByRole("heading", { name: "Requests" })).toBeInTheDocument();
    expect(await screen.findByRole("dialog", { name: "Guided request builder" })).toBeInTheDocument();
  });

  it("restores a saved source after reopening and runs local extraction from the app", async () => {
    const saved = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => saved.set(key, value),
      removeItem: (key: string) => saved.delete(key)
    });
    const workspaceId = "ws_ingestion_restore";
    const savedReview = reviewDto({ sourceCollectionId: "src_saved", label: "Saved selection" });
    window.localStorage.setItem(`cestus.ingestion.source.${workspaceId}`, "src_saved");
    const loadReview = vi.fn(async () => ({ ok: true as const, review: savedReview, eventIds: [] }));
    const job = { jobId: "parse_saved", kind: "local-parse" as const, state: "queued" as const, retryable: false, diagnosticIds: [] };
    const runLocalParsing = vi.fn(async () => ({ jobs: [{ ...job, state: "succeeded" as const }] }));
    const adapter = {
      ...createStaticIngestionWorkspaceAdapter({ mounted: true, workspaceId, diagnostics: [] }, {
        sources: { sources: [
          { sourceCollectionId: "src_other", label: "Another source", scanBatchIds: [], importBatchIds: [], diagnosticIds: [] },
          { sourceCollectionId: "src_saved", label: "Saved selection", scanBatchIds: [], importBatchIds: [], diagnosticIds: [] }
        ] }, jobs: { jobs: [job] }
      }), loadReview, runLocalParsing
    };
    const first = render(<App requestsAdapter={createTestRequestsAdapter()} ingestionAdapter={adapter} />);
    fireEvent.click(screen.getByRole("link", { name: "Ingestion" }));
    await waitFor(() => expect(screen.getByLabelText("Registered source")).toHaveValue("src_saved"));
    expect(loadReview).toHaveBeenCalledWith({ sourceCollectionId: "src_saved" });
    fireEvent.click(screen.getByRole("button", { name: "Extract queued documents" }));
    await waitFor(() => expect(runLocalParsing).toHaveBeenCalledWith({ sourceCollectionId: "src_saved" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Reopen saved review" })).toBeEnabled());
    first.unmount();
    render(<App requestsAdapter={createTestRequestsAdapter()} ingestionAdapter={adapter} />);
    fireEvent.click(screen.getByRole("link", { name: "Ingestion" }));
    await waitFor(() => expect(screen.getByLabelText("Registered source")).toHaveValue("src_saved"));
    expect(runLocalParsing).toHaveBeenCalledTimes(1);
    window.localStorage.removeItem(`cestus.ingestion.source.${workspaceId}`);
  });

  it("keeps successful ingestion actions committed when support refresh fails", async () => {
    const approvedReview = reviewDto({
      approvalRequired: false,
      latestImportBatchId: "imp_001"
    });
    const listJobs = vi.fn()
      .mockResolvedValueOnce({ jobs: [] })
      .mockRejectedValueOnce(new Error("job state root unavailable"));
    const adapter: IngestionWorkspaceAdapter = {
      async loadWorkspace() {
        return {
          mounted: true,
          label: "Mounted evidence workspace",
          review: reviewDto({ approvalRequired: true }),
          diagnostics: []
        };
      },
      async listSources() { return { sources: [] }; },
      async loadReview() { return { ok: true, review: approvedReview, eventIds: [] }; },
      async runLocalParsing() { return { jobs: [] }; },
      async registerSource() {
        return { ok: true, review: approvedReview, eventIds: ["evt_source"] };
      },
      async dryRunScan() {
        return { ok: true, review: approvedReview, eventIds: ["evt_scan"] };
      },
      async approveRawImport() {
        return { ok: true, review: approvedReview, eventIds: ["evt_import_approval"] };
      },
      async importApproved() {
        return { ok: true, review: approvedReview, eventIds: ["evt_import"] };
      },
      listJobs,
      async retryJob() {
        return {
          ok: true,
          job: {
            jobId: "parse_001",
            kind: "local-parse",
            state: "queued",
            retryable: false,
            sourceCollectionId: "src_drive_001",
            diagnosticIds: []
          },
          eventIds: ["evt_retry"]
        };
      },
      async approveProviderParsing() {
        return { ok: true, review: approvedReview, eventIds: ["evt_provider"] };
      },
      async loadDiagnostics() {
        return { diagnostics: [] };
      }
    };

    render(<App requestsAdapter={createTestRequestsAdapter()} ingestionAdapter={adapter} />);
    fireEvent.click(screen.getByRole("link", { name: "Ingestion" }));

    const approveButton = await screen.findByRole("button", { name: "Approve raw import" });
    await waitFor(() => expect(approveButton).toBeEnabled());
    expect(listJobs).toHaveBeenCalledTimes(1);

    fireEvent.click(approveButton);

    expect((await screen.findAllByText("imp_001")).length).toBeGreaterThan(0);
    await waitFor(() => expect(listJobs).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Ingestion action failed. Reload the workspace and try again.")).not.toBeInTheDocument();
    expect((await screen.findAllByText(
      "Ingestion support state could not be refreshed. The action completed; reload jobs and diagnostics if needed."
    )).length).toBeGreaterThan(0);
  });
});

function reviewDto(overrides: Partial<IngestionReviewDto> = {}): IngestionReviewDto {
  return {
    sourceCollectionId: "src_drive_001",
    label: "External investigation archive",
    latestScanBatchId: "scan_001",
    totals: {
      observedFiles: 2,
      uniqueContent: 1,
      duplicateOccurrences: 1,
      skipped: 0,
      bytes: 8,
      estimatedNewBlobBytes: 4
    },
    approvalRequired: true,
    duplicateGroups: [],
    evidenceLinks: [],
    parseJobs: [],
    diagnostics: [],
    ...overrides
  };
}
