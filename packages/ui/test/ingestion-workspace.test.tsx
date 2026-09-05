/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { IngestionWorkspace } from "../src/ingestion/IngestionWorkspace.js";
import type { IngestionReviewDto } from "../src/ingestion/ingestion-types.js";

describe("IngestionWorkspace", () => {
  it("labels successful execution with PDF coverage gaps as partial text extraction", () => {
    render(<IngestionWorkspace loadState="loaded" workspace={{ mounted: true, review: reviewDto(), diagnostics: [] }}
      jobs={[{ jobId: "parse_partial", kind: "local-parse", state: "succeeded", coverageStatus: "partial", retryable: false, diagnosticIds: [] }]} />);
    expect(screen.getByRole("region", { name: "Ingestion jobs" })).toHaveTextContent("partial text extraction");
    expect(screen.getByRole("region", { name: "Ingestion jobs" })).not.toHaveTextContent("succeeded");
    expect(screen.getByRole("button", { name: "Retry parse_partial" })).toBeDisabled();
  });
  it("offers explicit recovery when restart leaves only a running local parse", () => {
    const onRunLocalParsing = vi.fn();
    render(<IngestionWorkspace loadState="loaded" workspace={{ mounted: true, review: reviewDto(), diagnostics: [] }} onRunLocalParsing={onRunLocalParsing}
      jobs={[{ jobId: "parse_interrupted", kind: "local-parse", state: "running", retryable: false, diagnosticIds: [] }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Recover interrupted extraction" }));
    expect(onRunLocalParsing).toHaveBeenCalledWith({ sourceCollectionId: "src_drive_001" });
  });
  it("registers only the entered source folder and exposes scan, reopen and local extraction", () => {
    const onRegisterSource = vi.fn();
    const onSelectSource = vi.fn();
    const onDryRunScan = vi.fn();
    const onRunLocalParsing = vi.fn();
    render(<IngestionWorkspace loadState="loaded" workspace={{ mounted: true, review: reviewDto(), diagnostics: [] }}
      sources={[{ sourceCollectionId: "src_saved", label: "Saved source", scanBatchIds: [], importBatchIds: [], diagnosticIds: [] }]}
      onRegisterSource={onRegisterSource} onSelectSource={onSelectSource} onDryRunScan={onDryRunScan}
      onRunLocalParsing={onRunLocalParsing} jobs={[{jobId:"parse_queued", kind:"local-parse", state:"queued", retryable:false, diagnosticIds:[]}]}
    />);
    fireEvent.change(screen.getByLabelText("Source label"), { target: { value: "Selected records" } });
    fireEvent.change(screen.getByLabelText("Source folder path"), { target: { value: "/tmp/selected records" } });
    fireEvent.click(screen.getByRole("button", { name: "Register source folder" }));
    expect(onRegisterSource).toHaveBeenCalledWith({ label: "Selected records", sourceRoot: "/tmp/selected records", rootUri: "file:///tmp/selected%20records", sourceCollectionId: expect.stringMatching(/^src_[a-f0-9-]{36}$/) });
    fireEvent.change(screen.getByLabelText("Registered source"), { target: { value: "src_saved" } });
    expect(onSelectSource).toHaveBeenCalledWith({ sourceCollectionId: "src_saved" });
    fireEvent.click(screen.getByRole("button", { name: "Scan source folder" }));
    expect(onDryRunScan).toHaveBeenCalledWith({ sourceCollectionId: "src_drive_001", scanBatchId: expect.stringMatching(/^scan_[a-f0-9-]{36}$/) });
    fireEvent.click(screen.getByRole("button", { name: "Extract queued documents" }));
    expect(onRunLocalParsing).toHaveBeenCalledWith({ sourceCollectionId: "src_drive_001" });
    expect(screen.getByText(/Scanned PDFs and images require OCR, which is not supported/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve provider parsing" })).not.toBeInTheDocument();
  });

  it("permits a newly approved scan import even when old evidence exists", () => {
    const onImportApproved = vi.fn();
    render(<IngestionWorkspace loadState="loaded" workspace={{ mounted: true, diagnostics: [], review: reviewDto({
      approvalRequired: false, latestImportBatchId: "imp_old", approvedImportBatchId: "imp_new",
      importCompleted: false, evidenceLinks: [evidenceLinkDto()]
    }) }} onImportApproved={onImportApproved} />);
    fireEvent.click(screen.getByRole("button", { name: "Run approved import" }));
    expect(onImportApproved).toHaveBeenCalledWith({ sourceCollectionId: "src_drive_001", scanBatchId: "scan_001", importBatchId: "imp_new" });
  });

  it("shows the reviewed filenames and parser failures while blocking concurrent actions", () => {
    const onApproveRawImport = vi.fn();
    render(<IngestionWorkspace loadState="loaded" busy workspace={{ mounted: true, diagnostics: [], review: reviewDto({
      files: [{ occurrenceId: "occ_text", sourcePath: "minutes.txt", contentHash: "sha256:abc", byteLength: 15, status: "observed" }]
    }) }} onApproveRawImport={onApproveRawImport}
      jobs={[{ jobId: "parse_bad", kind: "local-parse", state: "failed", retryable: false, diagnosticIds: [], message: "PDF is encrypted." }]} />);
    expect(screen.getByText("minutes.txt")).toBeInTheDocument();
    expect(screen.getByText("PDF is encrypted.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve raw import" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Scan source folder" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Processing this action");
    expect(onApproveRawImport).not.toHaveBeenCalled();
  });

  it("renders mounted workspace review, explicit gates, retryable jobs, and diagnostics", () => {
    const onApproveRawImport = vi.fn();
    const onImportApproved = vi.fn();
    const onRetryJob = vi.fn();

    render(
      <IngestionWorkspace
        loadState="loaded"
        workspace={{
          mounted: true,
          workspaceId: "ws_ui_001",
          label: "Mounted evidence workspace",
          review: reviewDto({
            approvalRequired: false,
            latestImportBatchId: "imp_001",
            evidenceLinks: [evidenceLinkDto()]
          }),
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
        onRetryJob={onRetryJob}
      />
    );

    expect(screen.getByRole("heading", { name: "Ingestion" })).toBeInTheDocument();
    expect(screen.getByText("Mounted evidence workspace")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "External investigation archive" })).toBeInTheDocument();
    expect(screen.getByText("2 observed files")).toBeInTheDocument();
    expect(screen.getAllByText("imp_001").length).toBeGreaterThan(0);
    expect(screen.getByText("Provider approval is still required.")).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Approve raw import" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Run approved import" })).toBeDisabled();
    expect(onApproveRawImport).not.toHaveBeenCalled();
    expect(onImportApproved).not.toHaveBeenCalled();


    fireEvent.click(screen.getByRole("button", { name: "Retry parse_001" }));
    expect(onRetryJob).toHaveBeenCalledWith({ jobId: "parse_001" });
  });

  it("keeps approval, import execution, and provider gates aligned to import state", () => {
    const onApproveRawImport = vi.fn();
    const onImportApproved = vi.fn();
    const { rerender } = render(
      <IngestionWorkspace
        loadState="loaded"
        workspace={{
          mounted: true,
          label: "Mounted evidence workspace",
          review: reviewDto({ approvalRequired: true }),
          diagnostics: []
        }}
        jobs={[]}
        diagnostics={[]}
        onApproveRawImport={onApproveRawImport}
        onImportApproved={onImportApproved}
      />
    );

    expect(screen.getByRole("button", { name: "Approve raw import" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Run approved import" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Approve provider parsing" })).not.toBeInTheDocument();

    rerender(
      <IngestionWorkspace
        loadState="loaded"
        workspace={{
          mounted: true,
          label: "Mounted evidence workspace",
          review: reviewDto({
            approvalRequired: false,
            latestImportBatchId: "imp_001",
            evidenceLinks: []
          }),
          diagnostics: []
        }}
        jobs={[]}
        diagnostics={[]}
        onApproveRawImport={onApproveRawImport}
        onImportApproved={onImportApproved}
      />
    );

    expect(screen.getByRole("button", { name: "Approve raw import" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Run approved import" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Approve provider parsing" })).not.toBeInTheDocument();

    rerender(
      <IngestionWorkspace
        loadState="loaded"
        workspace={{
          mounted: true,
          label: "Mounted evidence workspace",
          review: reviewDto({
            approvalRequired: false,
            latestImportBatchId: "imp_001",
            evidenceLinks: [evidenceLinkDto()]
          }),
          diagnostics: []
        }}
        jobs={[]}
        diagnostics={[]}
        onApproveRawImport={onApproveRawImport}
        onImportApproved={onImportApproved}
      />
    );

    expect(screen.getByRole("button", { name: "Approve raw import" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Run approved import" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Approve provider parsing" })).not.toBeInTheDocument();
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
    expect(screen.getByRole("region", { name: "Ingestion workspace not connected" })).toHaveTextContent(
      "Portable workspace is not mounted."
    );
    expect(screen.queryByLabelText(/workspace path/i)).not.toBeInTheDocument();
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
    duplicateGroups: [
      {
        contentHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
        occurrenceCount: 2,
        occurrenceIds: ["occ_001", "occ_002"],
        sourcePaths: ["/source/a.txt", "/source/copy.txt"]
      }
    ],
    evidenceLinks: [],
    parseJobs: [
      {
        parseJobId: "parse_001",
        evidenceId: "ev_ing_001",
        lane: "local",
        parser: { name: "local-text", version: "0.1.0" },
        state: "failed"
      }
    ],
    diagnostics: [],
    ...overrides
  };
}

function evidenceLinkDto() {
  return {
    contentHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    evidenceId: "ev_ing_001",
    occurrenceIds: ["occ_001", "occ_002"]
  };
}
