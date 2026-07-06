/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { IngestionWorkspace } from "../src/ingestion/IngestionWorkspace.js";
import type { IngestionReviewDto } from "../src/ingestion/ingestion-types.js";

describe("IngestionWorkspace", () => {
  it("renders mounted workspace review, explicit gates, retryable jobs, and diagnostics", () => {
    const onApproveRawImport = vi.fn();
    const onImportApproved = vi.fn();
    const onApproveProviderParsing = vi.fn();
    const onRetryJob = vi.fn();

    render(
      <IngestionWorkspace
        loadState="loaded"
        workspace={{
          mounted: true,
          workspaceId: "ws_ui_001",
          label: "Mounted evidence workspace",
          review: reviewDto(),
          diagnostics: [
            {
              severity: "warning",
              category: "ingestion",
              message: "Archive child hash should be rechecked before import."
            }
          ],
        }}
        jobs={[
          {
            jobId: "parse_001",
            kind: "local-parse",
            state: "failed",
            retryable: true,
            sourceCollectionId: "src_drive_001",
            diagnosticIds: []
          }
        ]}
        diagnostics={[
          {
            severity: "error",
            category: "ingestion",
            message: "Provider approval is still required."
          }
        ]}
        onApproveRawImport={onApproveRawImport}
        onImportApproved={onImportApproved}
        onApproveProviderParsing={onApproveProviderParsing}
        onRetryJob={onRetryJob}
      />
    );

    expect(screen.getByRole("heading", { name: "Ingestion" })).toBeInTheDocument();
    expect(screen.getByText("Mounted evidence workspace")).toBeInTheDocument();
    expect(screen.getByText("External investigation archive")).toBeInTheDocument();
    expect(screen.getByText("2 observed files")).toBeInTheDocument();
    expect(screen.getAllByText("imp_001").length).toBeGreaterThan(0);
    expect(screen.getByText("Provider approval is still required.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Approve raw import" }));
    expect(onApproveRawImport).toHaveBeenCalledTimes(1);
    expect(onImportApproved).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Run approved import" }));
    expect(onImportApproved).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Approve provider parsing" }));
    expect(onApproveProviderParsing).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Retry parse_001" }));
    expect(onRetryJob).toHaveBeenCalledWith({ jobId: "parse_001" });
  });

  it("renders workspace-not-mounted diagnostics without accepting arbitrary paths", () => {
    render(
      <IngestionWorkspace
        loadState="loaded"
        workspace={{
          mounted: false,
          diagnostics: [
            {
              severity: "error",
              category: "workspace",
              message: "Portable workspace is not mounted."
            }
          ]
        }}
        jobs={[]}
        diagnostics={[]}
      />
    );

    expect(screen.getByRole("heading", { name: "Ingestion" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Workspace not mounted" })).toHaveTextContent(
      "Portable workspace is not mounted."
    );
    expect(screen.queryByLabelText(/workspace path/i)).not.toBeInTheDocument();
  });
});

function reviewDto(): IngestionReviewDto {
  return {
    sourceCollectionId: "src_drive_001",
    label: "External investigation archive",
    latestScanBatchId: "scan_001",
    latestImportBatchId: "imp_001",
    totals: {
      observedFiles: 2,
      uniqueContent: 1,
      duplicateOccurrences: 1,
      skipped: 0,
      bytes: 8,
      estimatedNewBlobBytes: 4
    },
    approvalRequired: true,
    duplicateGroups: [
      {
        contentHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
        occurrenceCount: 2,
        occurrenceIds: ["occ_001", "occ_002"],
        sourcePaths: ["/source/a.txt", "/source/copy.txt"]
      }
    ],
    evidenceLinks: [
      {
        contentHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
        evidenceId: "ev_ing_001",
        occurrenceIds: ["occ_001", "occ_002"]
      }
    ],
    parseJobs: [
      {
        parseJobId: "parse_001",
        evidenceId: "ev_ing_001",
        lane: "local",
        parser: { name: "local-text", version: "0.1.0" },
        state: "failed"
      }
    ],
    diagnostics: []
  };
}
