/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IngestionWorkspace } from "../src/ingestion/IngestionWorkspace.js";

describe("IngestionWorkspace", () => {
  it("renders dry-run review, import gate, and provider gate state", () => {
    render(
      <IngestionWorkspace
        review={{
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
              occurrenceCount: 2
            }
          ],
          diagnostics: []
        }}
      />
    );

    expect(screen.getByRole("heading", { name: "Ingestion" })).toBeInTheDocument();
    expect(screen.getByText("External investigation archive")).toBeInTheDocument();
    expect(screen.getByText("2 observed files")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve raw import" })).toBeInTheDocument();
  });
});
