/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExtractionArtifact } from "../../ontology/src/extraction-contracts.js";
import type { DocumentProcessingJob, DocumentProcessingManifest } from "../../ontology/src/document-processing-contracts.js";
import { DocumentProcessingPanel } from "../src/evidence/DocumentProcessingPanel.js";

const evidenceId = "ev_processing";
const extractionHash = `sha256:${"a".repeat(64)}`;
const extraction: ExtractionArtifact = {
  schemaVersion: "evidence-extraction.v1", evidenceId, extractionId: "extract_1", sourceContentHash: `sha256:${"b".repeat(64)}`,
  extractor: { name: "local", version: "1" }, format: "text", text: "first second",
  passages: ["first", "second"].map((text, index) => ({ text, locator: { kind: "text", block: index + 1, start: 0, end: text.length } }))
};
const selection = { evidenceId, extractionId: extraction.extractionId, passageIndexes: [1] };
const manifest: DocumentProcessingManifest = {
  schemaVersion: "document-processing-manifest.v1", invocationId: "inv_test", actorId: "human_test", selection,
  resolved: { evidenceId, extractionId: extraction.extractionId, sourceHash: extraction.sourceContentHash, extractionHash,
    policyRevision: "policy1", classification: "public_safe", classificationEventId: "classification1", reviewEventId: "review1",
    passages: [{ index: 1, text: "second", locator: extraction.passages[1]!.locator }] },
  destination: { endpoint: "https://provider.example/v1/chat/completions", model: "example-model", inputUsdPerMillion: 1, outputUsdPerMillion: 2 },
  operation: "document-summary.v1", provider: "openai-compatible-chat.v1", inputText: '{"passages":[{"index":1,"text":"second"}]}',
  systemPrompt: "Summarize only this evidence.", inputBytes: 123, inputTokenUpperBound: 635, maxOutputTokens: 512,
  maxResponseBytes: 65536, maximumEstimatedUsd: 0.001659, budgetUsd: 0.01, timeoutMs: 30000
};
const preview = { invocationId: "inv_test", manifestHash: "sha256:manifest", manifest };
const job = (state: DocumentProcessingJob["state"]): DocumentProcessingJob => ({ invocationId: "inv_test", manifestHash: preview.manifestHash, selection, state, createdAt: "2026-09-05T12:00:00Z" });

function backend(options: { ready?: boolean; initialState?: DocumentProcessingJob["state"]; deferRun?: boolean; manifest?: DocumentProcessingManifest } = {}) {
  let jobs = options.initialState ? [job(options.initialState)] : [];
  let finishRun: (() => void) | undefined;
  const fetch = vi.fn(async (path: string, init?: RequestInit) => {
    const route = path.replace("/api/document-processing", "");
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    let value: unknown;
    if (route === "/readiness") value = { ready: options.ready ?? true, message: options.ready === false ? "Provider missing. No fallback provider is selected." : "Provider configured. No request sent." };
    else if (route === "/jobs") value = { jobs };
    else if (route === "/preview") {
      jobs = [job("awaiting_approval")];
      value = { ...preview, manifest: { ...(options.manifest ?? manifest), ...(body.retryOf ? { retryOf: body.retryOf } : {}) } };
    } else if (route === "/approve") { jobs = [job("queued")]; value = jobs[0]; }
    else if (route.endsWith("/run")) {
      jobs = [job("running")];
      if (options.deferRun) await new Promise<void>(resolve => { finishRun = resolve; });
      if (jobs[0]?.state === "running") jobs = [job("completed")];
      value = jobs[0];
    } else if (route.endsWith("/cancel")) { jobs = [job("uncertain")]; value = jobs[0]; }
    else if (route.endsWith("/preview")) value = { ...preview, manifest: options.manifest ?? manifest };
    else if (route.endsWith("/output")) value = { invocationId: "inv_test", model: "example-model", proposalState: "unreviewed", output: {
      summary: '<img src=x onerror="alert(1)">', citations: [{ passageIndex: 1, quote: "second" }]
    } };
    else throw new Error(`Unexpected request ${route}`);
    return { ok: true, json: async () => value } as Response;
  });
  vi.stubGlobal("fetch", fetch);
  return { fetch, finishRun: () => finishRun?.(), mutations: () => fetch.mock.calls.filter(([, init]) => init?.method === "POST") };
}
function mount() { return render(<DocumentProcessingPanel evidenceId={evidenceId} extraction={extraction} extractionHash={extractionHash} />); }
async function selectAndPreview() {
  await screen.findByText("Provider configured. No request sent.");
  fireEvent.click(screen.getByRole("checkbox", { name: /Send passage 2/ }));
  fireEvent.change(screen.getByLabelText("Maximum budget (USD)"), { target: { value: "0.01" } });
  fireEvent.click(screen.getByRole("button", { name: "Preview exact transfer" }));
  await screen.findByRole("button", { name: "Approve this transfer" });
}
afterEach(() => vi.unstubAllGlobals());

describe("DocumentProcessingPanel", () => {
  it("requires exact selection, a user budget, approval and a separate run action", async () => {
    const api = backend(); mount();
    expect(screen.getByRole("button", { name: "Preview exact transfer" })).toBeDisabled();
    await selectAndPreview();
    expect(api.mutations()).toHaveLength(1);
    expect(JSON.parse(api.mutations()[0]![1]!.body as string)).toEqual({ selection, budgetUsd: 0.01, maxOutputTokens: 512 });
    expect(screen.getByRole("region", { name: "Exact transfer approval" })).toHaveTextContent("https://provider.example/v1/chat/completions");
    expect(screen.getByText(manifest.inputText)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Run approved operation" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Approve this transfer" }));
    await screen.findByRole("button", { name: "Run approved operation" });
    expect(api.mutations()).toHaveLength(2);
    expect(JSON.parse(api.mutations()[1]![1]!.body as string)).toEqual({ manifestHash: preview.manifestHash });
    fireEvent.click(screen.getByRole("button", { name: "Run approved operation" }));
    await screen.findByRole("button", { name: /Read result/ });
    expect(api.mutations().filter(([path]) => path.endsWith("/run"))).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /Read result/ }));
    const result = await screen.findByRole("region", { name: "Unreviewed provider result" });
    expect(result).toHaveTextContent('<img src=x onerror="alert(1)">');
    expect(result.querySelector("img")).toBeNull();
    expect(screen.getByRole("link", { name: "Supporting passage 2" })).toHaveAttribute("href", "#evidence/ev_processing/extract_1/1");
  });

  it("reopens a queued transfer without automatically submitting and invalidates the visible approval after changing selection", async () => {
    const api = backend({ initialState: "queued" }); mount();
    fireEvent.click(await screen.findByRole("button", { name: /Review saved transfer/ }));
    await screen.findByRole("button", { name: "Run approved operation" });
    expect(api.mutations()).toHaveLength(0);
    fireEvent.click(screen.getByRole("checkbox", { name: /Send passage 1/ }));
    expect(screen.queryByRole("button", { name: "Run approved operation" })).not.toBeInTheDocument();
    expect(api.mutations()).toHaveLength(0);
  });

  it.each(["uncertain", "failed"] as const)("requires a new budget and fresh approval for an explicitly billable %s retry", async initialState => {
    const api = backend({ initialState }); mount();
    const retry = await screen.findByRole("button", { name: /Prepare potentially billable retry/ });
    expect(retry).toBeDisabled();
    if (initialState === "failed") expect(screen.getByText(/Failed does not mean unbilled/)).toBeInTheDocument();
    expect(api.mutations()).toHaveLength(0);
    fireEvent.change(screen.getByLabelText("Maximum budget (USD)"), { target: { value: "0.01" } });
    fireEvent.click(retry);
    await screen.findByRole("button", { name: "Approve this transfer" });
    expect(JSON.parse(api.mutations()[0]![1]!.body as string)).toEqual({ selection, budgetUsd: 0.01, maxOutputTokens: 512, retryOf: "inv_test" });
    expect(screen.getByRole("alert")).toHaveTextContent("new potentially billable invocation");
    expect(api.mutations()).toHaveLength(1);
  });

  it("keeps configuration absence honest and makes no processing mutation", async () => {
    const api = backend({ ready: false }); mount();
    await screen.findByText("Provider missing. No fallback provider is selected.");
    expect(screen.getByRole("checkbox", { name: /Send passage 1/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Preview exact transfer" })).toBeDisabled();
    expect(api.mutations()).toHaveLength(0);
  });

  it("keeps cancellation accessible while a submitted operation is pending", async () => {
    const api = backend({ initialState: "queued", deferRun: true }); mount();
    fireEvent.click(await screen.findByRole("button", { name: /Review saved transfer/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Run approved operation" }));
    const cancel = screen.getByRole("button", { name: /Cancel inv_test/ });
    expect(cancel).toBeEnabled();
    fireEvent.click(cancel);
    await waitFor(() => expect(api.mutations().some(([path]) => path.endsWith("/cancel"))).toBe(true));
    await screen.findByText("uncertain", { exact: true });
    api.finishRun();
    await waitFor(() => expect(screen.getByRole("button", { name: /Review saved transfer/ })).toBeEnabled());
    expect(screen.queryByRole("button", { name: /Read result/ })).not.toBeInTheDocument();
  });

  it("shows the exact saved transfer coverage rather than inventing it from the open document", async () => {
    backend({ initialState: "queued", manifest: { ...manifest, resolved: { ...manifest.resolved,
      pdfCoverage: { status: "partial", pages: [{ page: 1, status: "text-extracted" }, { page: 2, status: "unextracted" }] }
    } } });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: /Review saved transfer/ }));
    const approval = await screen.findByRole("region", { name: "Exact transfer approval" });
    expect(within(approval).getByText("Partial PDF text extraction: text from 1 of 2 pages.")).toBeInTheDocument();
    expect(within(approval).getByText("Pages without extracted text: 2.")).toBeInTheDocument();
    expect(within(approval).getByText(/Only the selected extracted passages/)).toBeInTheDocument();
  });

});
