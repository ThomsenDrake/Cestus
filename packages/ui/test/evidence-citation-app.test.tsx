/** @vitest-environment jsdom */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.js";
import { createStaticEvidenceWorkspaceAdapter } from "../src/evidence/evidence-adapter.js";
import { createStaticIngestionWorkspaceAdapter } from "../src/ingestion/ingestion-adapter.js";
import { createStaticOperatorStatusAdapter, runtimeUnavailableStatus } from "../src/operator-status/operator-status-adapter.js";
import { workspaceDto } from "./fixtures/evidence.js";

const citation = "#evidence/ev_ing_blocked/extraction_saved/1";
function setHash(hash: string) { window.history.replaceState(null, "", `/${hash}`); }
function mount() { return render(<App evidenceAdapter={createStaticEvidenceWorkspaceAdapter(workspaceDto())} />); }
async function expectCitedRecord() {
  expect(await screen.findByRole("main", { name: "Evidence workspace" })).toBeInTheDocument();
  expect(await screen.findByRole("button", { name: "Inspect evidence ev_ing_blocked" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Inspect evidence ev_ing_001" })).toHaveAttribute("aria-pressed", "false");
  expect(await screen.findByRole("heading", { name: "ev_ing_blocked.txt" })).toBeInTheDocument();
}
beforeEach(() => {
  setHash("");
  vi.stubGlobal("fetch", vi.fn(async (path: string) => {
    const evidenceId = /^\/api\/evidence\/(ev_[a-zA-Z0-9_-]+)\/content/.exec(path)?.[1];
    return new Response(JSON.stringify(evidenceId ? {
      item: { evidenceId, occurrences: [{ sourcePath: `${evidenceId}.txt` }], governanceTags: [] }, extractions: [], failures: []
    } : { ok: false, message: "Test endpoint unavailable." }), { status: evidenceId ? 200 : 503 });
  }));
});
afterEach(() => { setHash(""); vi.unstubAllGlobals(); });

describe("App evidence citation routing", () => {
  it("replaces a stale citation when explicitly reading another imported record", async () => {
    const status = runtimeUnavailableStatus();
    render(<App
      evidenceAdapter={createStaticEvidenceWorkspaceAdapter(workspaceDto())}
      operatorStatusAdapter={createStaticOperatorStatusAdapter({
        ...status,
        sections: status.sections.map(section => ({ ...section, nextSafeActionIds: ["action_open_ingestion"] })),
        safeActions: [{ actionId: "action_open_ingestion", label: "Open ingestion", kind: "navigate", target: "ingestion", sourceContract: "operator-status.v1", requiresHumanApproval: false, mutatesCanonicalState: false, externalEffect: false, enabled: true }]
      })}
      ingestionAdapter={createStaticIngestionWorkspaceAdapter({
        mounted: true, diagnostics: [], review: {
          sourceCollectionId: "src_citation", label: "Citation source", approvalRequired: false,
          totals: { observedFiles: 1, uniqueContent: 1, duplicateOccurrences: 0, skipped: 0, bytes: 4, estimatedNewBlobBytes: 0 },
          duplicateGroups: [], parseJobs: [], diagnostics: [],
          evidenceLinks: [{ evidenceId: "ev_ing_blocked", contentHash: workspaceDto().items[1]!.contentHash!, occurrenceIds: ["occ_citation"] }]
        }
      })}
    />);
    const openIngestion = await screen.findByRole("button", { name: "Open ingestion" });
    // A button-driven module change can retain a prior citation in the address bar.
    setHash("#evidence/ev_ing_001/extraction_old/0");
    fireEvent.click(openIngestion);
    const read = await screen.findByRole("button", { name: "Read ev_ing_blocked" });
    expect(window.location.hash).toBe("#evidence/ev_ing_001/extraction_old/0");
    fireEvent.click(read);
    await expectCitedRecord();
    expect(window.location.hash).toBe("#evidence/ev_ing_blocked");
    expect(fetch).toHaveBeenCalledWith("/api/evidence/ev_ing_blocked/content", expect.anything());
    expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining("extractionId=extraction_old"), expect.anything());
  });

  it("restores a bookmarked non-first record before evidence loading completes", async () => {
    setHash(citation); mount();
    await expectCitedRecord();
    expect(fetch).toHaveBeenCalledWith("/api/evidence/ev_ing_blocked/content?extractionId=extraction_saved", expect.anything());
  });

  it("opens a saved citation from Command on hashchange and preserves module navigation", async () => {
    mount();
    expect(screen.getByRole("main", { name: "Command workspace" })).toBeInTheDocument();
    act(() => { setHash(citation); window.dispatchEvent(new HashChangeEvent("hashchange")); });
    await expectCitedRecord();
    fireEvent.click(screen.getByRole("link", { name: "Command" }));
    expect(await screen.findByRole("main", { name: "Command workspace" })).toBeInTheDocument();
  });

  it("ignores a malformed evidence fragment", async () => {
    setHash("#evidence/not-an-evidence-id/extraction_saved/1"); mount();
    expect(screen.getByRole("main", { name: "Command workspace" })).toBeInTheDocument();
    act(() => { setHash("#evidence/ev_ing_blocked/extraction_saved/not-a-passage"); window.dispatchEvent(new HashChangeEvent("hashchange")); });
    expect(screen.getByRole("main", { name: "Command workspace" })).toBeInTheDocument();
  });
});
