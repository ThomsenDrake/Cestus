import { useEffect, useRef, useState } from "react";
import type { ExtractionArtifact } from "../../../ontology/src/extraction-contracts.js";
import type { DocumentProcessingJob, DocumentProcessingManifest } from "../../../ontology/src/document-processing-contracts.js";

import { PdfCoverageNotice } from "./PdfCoverageNotice.js";

const button = "max-w-full break-words rounded border border-[var(--console-line-strong)] px-3 py-2 text-sm disabled:opacity-50";
const field = "rounded border border-[var(--console-line)] bg-[var(--console-panel)] p-2";
const base = "/api/document-processing";
type Preview = { invocationId: string; manifestHash: string; manifest: DocumentProcessingManifest; warning?: string };
type Readiness = { ready: boolean; message: string };
type Summary = { invocationId: string; model: string; proposalState: "unreviewed"; output: { summary: string; citations: { passageIndex: number; quote: string }[] } };
type Props = { evidenceId: string; extraction: ExtractionArtifact; extractionHash: string };

async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${base}${path}`, { credentials: "same-origin", ...(body === undefined ? {} : {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
  }) });
  const value = await response.json();
  if (!response.ok || value.ok === false) throw new Error(typeof value.message === "string" ? value.message : "Processing unavailable. Refresh and review the job state before taking another action.");
  return value as T;
}
import { locatorLabel as location } from "./evidence-location.js";
function message(reason: unknown) { return reason instanceof Error ? reason.message : "Processing unavailable."; }

/** Reset selection and approvals whenever the reader changes immutable content identity. */
export function DocumentProcessingPanel(props: Props) {
  return <ProcessingSelection key={`${props.evidenceId}/${props.extraction.extractionId}/${props.extractionHash}`} {...props} />;
}

function ProcessingSelection({ evidenceId, extraction, extractionHash }: Props) {
  const [readiness, setReadiness] = useState<Readiness>();
  const [jobs, setJobs] = useState<DocumentProcessingJob[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [budget, setBudget] = useState("");
  const [maxOutputTokens, setMaxOutputTokens] = useState("512");
  const [preview, setPreview] = useState<Preview>();
  const [output, setOutput] = useState<Summary>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState<string>();
  const mounted = useRef(true);

  async function refresh() {
    const result = await request<{ jobs: DocumentProcessingJob[] }>("/jobs");
    if (!mounted.current) return;
    const visible = result.jobs.filter(job => job.selection.evidenceId === evidenceId && job.selection.extractionId === extraction.extractionId);
    setJobs(visible);
    setPreview(current => current && visible.some(job => job.invocationId === current.invocationId) ? current : undefined);
    setOutput(current => current && visible.some(job => job.invocationId === current.invocationId) ? current : undefined);
  }
  function failed(reason: unknown) {
    if (!mounted.current) return;
    setError(message(reason)); setPreview(undefined); setOutput(undefined);
  }
  useEffect(() => {
    mounted.current = true;
    void request<Readiness>("/readiness").then(value => { if (mounted.current) setReadiness(value); }).catch(failed);
    void refresh().catch(failed);
    return () => { mounted.current = false; };
  }, []);
  const hasRunning = jobs.some(job => job.state === "running") || running !== undefined;
  useEffect(() => {
    if (!hasRunning) return;
    let canceled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try { await refresh(); } catch (reason) { failed(reason); }
      if (!canceled) timer = setTimeout(() => void poll(), 2000);
    }
    timer = setTimeout(() => void poll(), 2000);
    return () => { canceled = true; clearTimeout(timer); };
  }, [hasRunning]);

  async function action(operation: () => Promise<void>) {
    setBusy(true); setError(undefined);
    try { await operation(); } catch (reason) { failed(reason); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function makePreview(retry?: DocumentProcessingJob) {
    await action(async () => {
      setPreview(undefined); setOutput(undefined);
      const value = await request<Preview>("/preview", {
        selection: retry?.selection ?? { evidenceId, extractionId: extraction.extractionId, passageIndexes: selected },
        budgetUsd: Number(budget), maxOutputTokens: Number(maxOutputTokens), ...(retry ? { retryOf: retry.invocationId } : {})
      });
      await refresh();
      if (mounted.current) setPreview(value);
    });
  }
  async function run(job: DocumentProcessingJob) {
    setRunning(job.invocationId); setError(undefined);
    try { await request(`/jobs/${encodeURIComponent(job.invocationId)}/run`, {}); }
    catch (reason) { failed(reason); }
    finally {
      try { await refresh(); } catch (reason) { failed(reason); }
      if (mounted.current) setRunning(undefined);
    }
  }
  const previewJob = jobs.find(job => job.invocationId === preview?.invocationId);
  const validBudget = Number.isFinite(Number(budget)) && Number(budget) > 0 && Number(budget) <= 100;
  const validTokens = Number.isInteger(Number(maxOutputTokens)) && Number(maxOutputTokens) >= 64 && Number(maxOutputTokens) <= 2048;
  const changeSelection = (index: number) => {
    setSelected(current => current.includes(index) ? current.filter(value => value !== index) : [...current, index].sort((a, b) => a - b));
    setPreview(undefined); setOutput(undefined);
  };

  return <section aria-label="External document processing" className="space-y-3 rounded border border-[var(--console-line)] p-3">
    <h3 className="font-semibold">External document processing</h3>
    <p role="status" className="break-words">{readiness?.message ?? "Checking provider readiness…"}</p>
    <p>Only evidence reviewed as public_safe can leave this machine. Use the Governance review below. Restricted, unclassified, or redacted records are blocked; importing and reviewing a separately redacted copy is required when safe redaction is needed.</p>
    <p className="break-all text-xs">Selection identity: {evidenceId} · {extraction.extractionId} · {extractionHash}</p>
    <fieldset disabled={!readiness?.ready || busy || hasRunning} className="min-w-0 space-y-2">
      <legend>Select up to 24 passages to send ({selected.length} selected)</legend>
      <div className="max-h-64 overflow-y-auto space-y-2">{extraction.passages.map((passage, index) => <label key={index} className="flex items-start gap-2 rounded border border-[var(--console-line)] p-2">
        <input type="checkbox" checked={selected.includes(index)} disabled={!selected.includes(index) && selected.length >= 24} onChange={() => changeSelection(index)} aria-label={`Send passage ${index + 1}: ${location(passage.locator)}`} />
        <span className="min-w-0"><strong className="text-xs">{location(passage.locator)}</strong><span className="block whitespace-pre-wrap break-words">{passage.text}</span></span>
      </label>)}</div>
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1">Maximum budget (USD)<input className={field} type="number" min="0.000001" max="100" step="any" value={budget} onChange={event => { setBudget(event.target.value); setPreview(undefined); }} /></label>
        <label className="flex flex-col gap-1">Maximum output tokens<input className={field} type="number" min="64" max="2048" step="1" value={maxOutputTokens} onChange={event => { setMaxOutputTokens(event.target.value); setPreview(undefined); }} /></label>
      </div>
      <button className={button} disabled={!selected.length || !validBudget || !validTokens} onClick={() => void makePreview()}>Preview exact transfer</button>
    </fieldset>
    {error && <p role="alert">{error}</p>}
    {preview && <section aria-label="Exact transfer approval" className="space-y-2 border border-[var(--console-line-strong)] p-3">
      <h4 className="font-semibold">Review what will leave this machine</h4>
      {(preview.warning || preview.manifest.retryOf) && <p role="alert">{preview.warning ?? "This is a new potentially billable invocation. The prior attempt may already have completed at the provider."}</p>}
      <p className="break-all">Destination: {preview.manifest.destination.endpoint} · Model: {preview.manifest.destination.model} · Operation: {preview.manifest.operation}</p>
      <p>{preview.manifest.resolved.passages.length} passages · {preview.manifest.inputBytes} input bytes including instructions · at most {preview.manifest.inputTokenUpperBound} input tokens and {preview.manifest.maxOutputTokens} output tokens.</p>
      <p>Maximum estimated cost: ${preview.manifest.maximumEstimatedUsd.toFixed(6)} · Budget: ${preview.manifest.budgetUsd}. Operator-supplied prices: ${preview.manifest.destination.inputUsdPerMillion} input / ${preview.manifest.destination.outputUsdPerMillion} output per million tokens. Verify pricing with the provider; actual charges depend on provider accounting.</p>
      <p>Timeout: {preview.manifest.timeoutMs / 1000} seconds · Maximum response: {preview.manifest.maxResponseBytes} bytes · One invocation at a time.</p>
      <p className="break-all text-xs">Original: {preview.manifest.resolved.sourceHash} · Extraction: {preview.manifest.resolved.extractionHash} · Approval manifest: {preview.manifestHash}</p>
      {preview.manifest.resolved.pdfCoverage && <>
        <PdfCoverageNotice coverage={preview.manifest.resolved.pdfCoverage} />
        <p>Only the selected extracted passages and their coverage context will be sent. Original PDF pages and images are not transferred.</p>
      </>}
      <details><summary>Exact outgoing instructions and content</summary><pre className="whitespace-pre-wrap break-words">{preview.manifest.systemPrompt}</pre><pre className="mt-2 whitespace-pre-wrap break-words">{preview.manifest.inputText}</pre></details>
      <p>Approval covers this exact content, destination, model, operation and limits. Content, authority and policy are checked again immediately before transfer.</p>
      {previewJob?.state === "awaiting_approval" && <button className={button} disabled={busy || hasRunning || !readiness?.ready} onClick={() => void action(async () => { await request("/approve", { manifestHash: preview.manifestHash }); await refresh(); })}>Approve this transfer</button>}
      {previewJob?.state === "queued" && <button className={button} disabled={busy || hasRunning || !readiness?.ready} onClick={() => void run(previewJob)}>Run approved operation</button>}
    </section>}
    <section aria-label="Persisted processing jobs" className="space-y-2">
      <div className="flex flex-wrap items-center gap-2"><h4 className="font-semibold">Processing history for this extraction</h4><button className={button} disabled={busy} onClick={() => void action(refresh)}>Refresh jobs</button></div>
      {!jobs.length && <p>No processing jobs for this extraction.</p>}
      <p>Queued work runs only when you choose Run. Interrupted or timed-out submissions remain uncertain; no automatic paid retry occurs. Canceling a submitted request may still incur a charge.</p>
      {jobs.map(job => <article key={job.invocationId} className="space-y-2 border border-[var(--console-line)] p-2">
        <p className="break-all">{job.invocationId} · <strong>{job.state.replaceAll("_", " ")}</strong> · {job.createdAt}{job.reason ? ` · ${job.reason}` : ""}</p>
        {job.state === "failed" && <p>No validated result is available. Failed does not mean unbilled; the provider may have charged for this request. A retry requires a new preview, budget and explicit approval.</p>}
        {job.state === "uncertain" && <p>The provider may have completed and charged for this request. Check its records before preparing another potentially billable invocation.</p>}
        <div className="flex flex-wrap gap-2">
          <button className={button} disabled={busy || hasRunning} onClick={() => void action(async () => { const value = await request<Preview>(`/jobs/${encodeURIComponent(job.invocationId)}/preview`); if (mounted.current) { setPreview(value); setOutput(undefined); } })}>Review saved transfer {job.invocationId}</button>
          {["awaiting_approval", "queued", "running"].includes(job.state) && <button className={button} disabled={busy} onClick={() => void action(async () => { await request(`/jobs/${encodeURIComponent(job.invocationId)}/cancel`, {}); await refresh(); })}>Cancel {job.invocationId}</button>}
          {job.state === "completed" && <button className={button} disabled={busy} onClick={() => void action(async () => { const value = await request<Summary>(`/jobs/${encodeURIComponent(job.invocationId)}/output`); if (mounted.current) setOutput(value); })}>Read result {job.invocationId}</button>}
          {["failed", "canceled", "uncertain"].includes(job.state) && <button className={button} disabled={busy || hasRunning || !readiness?.ready || !validBudget || !validTokens} onClick={() => void makePreview(job)}>Prepare potentially billable retry {job.invocationId}</button>}
        </div>
      </article>)}
    </section>
    {output && <section aria-label="Unreviewed provider result" className="space-y-2 border border-[var(--console-line)] p-3">
      <h4 className="font-semibold">Unreviewed provider summary</h4><p>Model: {output.model}. This proposal has not been accepted as an investigative fact.</p>
      <p className="whitespace-pre-wrap break-words">{output.output.summary}</p>
      {output.output.citations.map((citation, index) => <blockquote className="whitespace-pre-wrap break-words border-l-2 pl-3" key={index}><p>{citation.quote}</p><a className="underline" href={`#evidence/${evidenceId}/${extraction.extractionId}/${citation.passageIndex}`}>Supporting passage {citation.passageIndex + 1}</a></blockquote>)}
    </section>}
  </section>;
}
