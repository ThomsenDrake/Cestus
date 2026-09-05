/** @vitest-environment jsdom */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EvidenceReader } from "../src/evidence/EvidenceReader.js";
import { EvidenceWorkspace } from "../src/evidence/EvidenceWorkspace.js";
import { workspaceDto } from "./fixtures/evidence.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const response = (value: unknown) => ({ ok: true, json: async () => value }) as Response;
const content = (evidenceId: string) => ({ item: { evidenceId, mediaType: "text/plain", occurrences: [{ sourcePath: `${evidenceId}.txt` }], governanceTags: [] }, extractions: [], failures: [] });
const searchResult = { total: 1, offset: 0, results: [{ evidenceId: "ev_ing_001", extractionId: "extract_1", passageIndex: 0, locator: { kind: "text", block: 1, start: 0, end: 19 }, snippet: "Previously readable confidential phrase", label: "Record" }] };
const callbacks = { onSelectEvidence: vi.fn(), onRefresh: vi.fn() };
const reader = (workspace = workspaceDto(), evidenceId = "ev_ing_001") => <EvidenceReader workspace={workspace} evidenceId={evidenceId} {...callbacks} />;
function search() {
  fireEvent.change(screen.getByLabelText("Phrase in document contents"), { target: { value: "confidential phrase" } });
  fireEvent.click(screen.getByRole("button", { name: "Search contents" }));
}
afterEach(() => { vi.unstubAllGlobals(); window.location.hash = ""; });

describe("evidence reader selection and governance recovery", () => {
  it("retains the requested non-first evidence while the workspace is loading", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(content("ev_ing_blocked"))));
    const props = { initialEvidenceId: "ev_ing_blocked", loadError: undefined, onRetry: vi.fn(), onPrepareAssertionCandidate: vi.fn(), onAppendGovernanceReview: vi.fn() };
    const view = render(<EvidenceWorkspace {...props} workspace={undefined} loadState="loading" />);
    view.rerender(<EvidenceWorkspace {...props} workspace={workspaceDto()} loadState="loaded" />);
    expect(screen.getByRole("button", { name: "Inspect evidence ev_ing_blocked" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Inspect evidence ev_ing_001" })).toHaveAttribute("aria-pressed", "false");
    await screen.findByRole("region", { name: "Selected document contents" });
  });

  it("discards an original response after selecting another evidence record", async () => {
    const original = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn((path: string) => path.endsWith("/original") ? original.promise : Promise.resolve(response(content(path.includes("ev_ing_blocked") ? "ev_ing_blocked" : "ev_ing_001")))));
    const view = render(reader());
    fireEvent.click(await screen.findByRole("button", { name: "Open immutable original" }));
    view.rerender(reader(workspaceDto(), "ev_ing_blocked"));
    await screen.findByRole("heading", { name: "ev_ing_blocked.txt" });
    await act(async () => { original.resolve(response({ mediaType: "text/plain", base64: btoa("Original from record A") })); });
    expect(screen.queryByText("Original from record A")).not.toBeInTheDocument();
  });

  it.each(["source", "governance"])("clears cached search snippets when the %s revision changes", async revision => {
    vi.stubGlobal("fetch", vi.fn(async (path: string) => response(path.includes("/search?") ? searchResult : content("ev_ing_001"))));
    const workspace = workspaceDto();
    const view = render(reader(workspace));
    search(); await screen.findByText("Previously readable confidential phrase");
    const next = revision === "source" ? { ...workspace, sourceHighWaterMark: workspace.sourceHighWaterMark + 1 } : {
      ...workspace, governance: { ...workspace.governance, reviews: [] }
    };
    view.rerender(reader(next));
    expect(screen.queryByText("Previously readable confidential phrase")).not.toBeInTheDocument();
    await screen.findByRole("button", { name: "Open immutable original" });
  });

  it("discards a search response requested before a governance revision and allows a fresh search", async () => {
    const pending = deferred<Response>();
    let searches = 0;
    vi.stubGlobal("fetch", vi.fn((path: string) => path.includes("/search?") && searches++ === 0 ? pending.promise : Promise.resolve(response(path.includes("/search?") ? { total: 0, offset: 0, results: [] } : content("ev_ing_001")))));
    const workspace = workspaceDto();
    const view = render(reader(workspace)); search();
    view.rerender(reader({ ...workspace, sourceHighWaterMark: workspace.sourceHighWaterMark + 1 }));
    await act(async () => { pending.resolve(response(searchResult)); });
    expect(screen.queryByText("Previously readable confidential phrase")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Search contents" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Search contents" }));
    await screen.findByText("0 matching passages");
  });
});


describe("PDF extraction coverage", () => {
  function pdfContent(coverage?: { status: "partial" | "complete"; pages: { page: number; status: "text-extracted" | "unextracted" }[] }, empty = false) {
    return { ...content("ev_ing_001"), extractionHash: "sha256:derivative", extraction: {
      schemaVersion: "evidence-extraction.v1", evidenceId: "ev_ing_001", extractionId: "extract_pdf", sourceContentHash: "sha256:original",
      extractor: { name: "local", version: "1.1.0" }, format: "pdf", text: empty ? "" : "Readable page three",
      ...(coverage ? { pdfCoverage: coverage } : {}),
      passages: empty ? [] : (coverage?.status === "complete" ? [1, 2, 3] : [3]).map(page => ({ text: "Readable page three", locator: { kind: "pdf", page, block: 1, start: 0, end: 19 } }))
    } };
  }
  function backend(document: ReturnType<typeof pdfContent>, results = searchResult) {
    vi.stubGlobal("fetch", vi.fn(async (path: string) => response(path.includes("/search?") ? results : path.endsWith("/readiness") ? { ready: false, message: "Provider missing." } : path.endsWith("/jobs") ? { jobs: [] } : document)));
  }

  it("shows gaps without renumbering readable pages or presenting partial output as complete", async () => {
    backend(pdfContent({ status: "partial", pages: [{ page: 1, status: "unextracted" }, { page: 2, status: "unextracted" }, { page: 3, status: "text-extracted" }] }));
    render(reader());
    const selected = await screen.findByRole("region", { name: "Selected document contents" });
    expect(within(selected).getByText("Partial PDF text extraction: text from 1 of 3 pages.")).toBeInTheDocument();
    expect(within(selected).getByText("Pages without extracted text: 1, 2.")).toBeInTheDocument();
    expect(within(selected).getByRole("link", { name: /Page 3/i })).toHaveAttribute("href", "#evidence/ev_ing_001/extract_pdf/0");
    expect(within(selected).getByText(/No OCR was run/)).toBeInTheDocument();
  });

  it("qualifies all-page embedded text coverage without claiming that visual evidence was extracted", async () => {
    backend(pdfContent({ status: "complete", pages: [{ page: 1, status: "text-extracted" }, { page: 2, status: "text-extracted" }, { page: 3, status: "text-extracted" }] }));
    render(reader());
    await screen.findByText("PDF text extracted from 3 of 3 pages.");
    expect(screen.getByText("Images and other visual content are not covered, including on pages with text. No OCR was run.")).toBeInTheDocument();
    expect(screen.queryByText(/Pages without extracted text:/)).not.toBeInTheDocument();
  });

  it("keeps legacy PDF coverage unknown and says when no passages can be read", async () => {
    backend(pdfContent(undefined, true)); render(reader());
    await screen.findByText("PDF page coverage is unknown for this extraction. Inspect the original for omitted evidence.");
    expect(screen.getByText("No readable passages were extracted. Open the immutable original to inspect the document.")).toBeInTheDocument();
  });

  it("retains a coverage warning on search matches and on zero results", async () => {
    const results = { ...searchResult, results: searchResult.results.map(result => ({ ...result, pdfCoverage: { status: "partial" as const, pages: [{ page: 1, status: "text-extracted" as const }, { page: 2, status: "unextracted" as const }] } })) };
    backend(pdfContent(undefined), results); render(reader()); search();
    const matches = await screen.findByRole("region", { name: "Passage search results" });
    expect(within(matches).getByText("Partial PDF text extraction: text from 1 of 2 pages.")).toBeInTheDocument();
    expect(screen.getByText("Search covers extracted text only. A search with no matches does not establish that evidence is absent; unreadable pages and visual content are not searched.")).toBeInTheDocument();
    backend(pdfContent(undefined), { total: 0, offset: 0, results: [] });
    fireEvent.click(screen.getByRole("button", { name: "Search contents" }));
    await screen.findByText("0 matching passages");
    expect(screen.getByText(/A search with no matches does not establish/)).toBeInTheDocument();
  });
});
