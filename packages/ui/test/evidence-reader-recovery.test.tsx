/** @vitest-environment jsdom */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
