import { useEffect, useRef, useState } from "react";
import type { ExtractionArtifact, EvidenceLocator } from "../../../ontology/src/extraction-contracts.js";
import type { EvidenceWorkspaceDto } from "./evidence-types.js";
import { DocumentProcessingPanel } from "./DocumentProcessingPanel.js";
import { locatorLabel } from "./evidence-location.js";
import { governanceTags } from "../../../ontology/src/governance-policy.js";

const evidenceButton = "rounded border border-[var(--console-line-strong)] px-3 py-2 text-sm text-[var(--paper-light)] disabled:opacity-50";
const field = "min-w-0 rounded border border-[var(--console-line)] bg-[var(--console-panel)] p-2 text-[var(--paper-light)]";
type DocumentContent = {
  extraction?: ExtractionArtifact; extractionHash?: string;
  item: { evidenceId: string; contentHash?: string; mediaType?: string; source?: { label: string }; occurrences: { sourcePath: string }[]; governanceTags: { tag: string }[] };
  extractions: { extractionId: string; contentHash: string; completedAt: string; parser: { name: string; version: string } }[];
  failures: { jobId: string; message: string; retryable: boolean; failedAt: string }[];
};
type SearchResult = { evidenceId: string; extractionId: string; passageIndex: number; locator: EvidenceLocator; snippet: string; label: string };

async function evidenceRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin", ...(body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok || result.ok === false) throw new Error(typeof result.message === "string" ? result.message : "Action unavailable. Refresh the workspace and review its status.");
  return result as T;
}
function citationFromHash() {
  const parts = window.location.hash.slice(1).split("/");
  if (parts[0] !== "evidence" || !parts[1]) return undefined;
  return { evidenceId: parts[1], extractionId: parts[2], passageIndex: Number(parts[3] ?? 0) };
}

export function EvidenceReader({ workspace, evidenceId, onSelectEvidence, onRefresh }: {
  workspace: EvidenceWorkspaceDto; evidenceId: string | undefined; onSelectEvidence: (id: string) => void; onRefresh: () => void;
}) {
  const [query, setQuery] = useState("");
  const [format, setFormat] = useState("");
  const [source, setSource] = useState("");
  const [search, setSearch] = useState<{ total: number; results: SearchResult[]; offset: number; accessRevision: string }>();
  const [document, setDocument] = useState<DocumentContent>();
  const [extractionId, setExtractionId] = useState<string>();
  const [passageIndex, setPassageIndex] = useState<number>();
  const [error, setError] = useState<string>();
  const [searchError, setSearchError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [originalText, setOriginalText] = useState<string>();
  const [classification, setClassification] = useState("");
  const [rationale, setRationale] = useState("");
  const originalRequestVersion = useRef(0);
  const searchRequestVersion = useRef(0);
  // Governance can change independently of the corpus projection's watermark.
  const accessRevision = JSON.stringify([workspace.sourceHighWaterMark, workspace.governance]);

  useEffect(() => {
    function navigate() {
      const citation = citationFromHash();
      if (citation) { onSelectEvidence(citation.evidenceId); setExtractionId(citation.extractionId); setPassageIndex(citation.passageIndex); }
    }
    navigate(); window.addEventListener("hashchange", navigate);
    return () => window.removeEventListener("hashchange", navigate);
  }, [onSelectEvidence]);
  useEffect(() => {
    let canceled = false;
    originalRequestVersion.current += 1;
    setDocument(undefined); setError(undefined); setOriginalText(undefined);
    setClassification(""); setRationale("");
    if (!evidenceId) return;
    const citation = citationFromHash();
    const selectedExtraction = citation?.evidenceId === evidenceId ? extractionId : undefined;
    const params = selectedExtraction ? `?extractionId=${encodeURIComponent(selectedExtraction)}` : "";
    void evidenceRequest<DocumentContent>(`/api/evidence/${encodeURIComponent(evidenceId)}/content${params}`)
      .then(value => { if (!canceled) setDocument(value); })
      .catch(reason => { if (!canceled) setError(reason instanceof Error ? reason.message : "Content unavailable."); });
    return () => { canceled = true; originalRequestVersion.current += 1; };
  }, [evidenceId, extractionId, accessRevision]);
  useEffect(() => {
    searchRequestVersion.current += 1;
    setSearch(undefined); setSearchError(undefined); setBusy(false);
    return () => { searchRequestVersion.current += 1; };
  }, [accessRevision]);
  useEffect(() => {
    if (document && passageIndex !== undefined) window.document.getElementById(`evidence-passage-${passageIndex}`)?.scrollIntoView?.({ block: "center" });
  }, [document, passageIndex]);

  async function runSearch(offset = 0) {
    const requestVersion = ++searchRequestVersion.current;
    setBusy(true); setSearchError(undefined);
    try {
      const params = new URLSearchParams({ q: query, limit: "20", offset: String(offset), ...(source ? { sourceCollectionId: source } : {}), ...(format ? { format } : {}) });
      const result = await evidenceRequest<{ total: number; results: SearchResult[]; offset: number }>(`/api/evidence/search?${params}`);
      if (requestVersion === searchRequestVersion.current) setSearch({ ...result, accessRevision });
    } catch (reason) {
      if (requestVersion === searchRequestVersion.current) { setSearch(undefined); setSearchError(reason instanceof Error ? reason.message : "Search unavailable."); }
    } finally { if (requestVersion === searchRequestVersion.current) setBusy(false); }
  }
  function navigate(result: { evidenceId: string; extractionId: string; passageIndex: number }) {
    setExtractionId(result.extractionId); setPassageIndex(result.passageIndex); onSelectEvidence(result.evidenceId);
    window.location.hash = `evidence/${result.evidenceId}/${result.extractionId}/${result.passageIndex}`;
  }
  async function openOriginal() {
    if (!evidenceId) return;
    const requestVersion = ++originalRequestVersion.current;
    try {
      const result = await evidenceRequest<{ mediaType?: string; base64: string }>(`/api/evidence/${encodeURIComponent(evidenceId)}/original`);
      if (requestVersion !== originalRequestVersion.current) return;
      const bytes = Uint8Array.from(atob(result.base64), char => char.charCodeAt(0));
      if (result.mediaType?.startsWith("text/")) setOriginalText(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      else {
        const url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
        const link = window.document.createElement("a"); link.href = url; link.download = `${evidenceId}${result.mediaType === "application/pdf" ? ".pdf" : ".bin"}`; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (reason) { if (requestVersion === originalRequestVersion.current) setError(reason instanceof Error ? reason.message : "Original unavailable."); }
  }
  const sources = [...new Map(workspace.items.flatMap(item => item.sourceCollections).map(source => [source.sourceCollectionId, source])).values()];
  return <section aria-label="Document reader and search" className="space-y-4 rounded border border-[var(--console-line)] bg-[var(--console-panel)] p-4 text-[var(--paper-light)]">
    <h2 className="text-lg font-semibold">Read and search records</h2>
    <form className="flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); void runSearch(); }}>
      <label className="flex min-w-0 flex-1 flex-col gap-1">Phrase in document contents<input className={field} value={query} onChange={event => setQuery(event.target.value)} maxLength={500} required /></label>
      <label className="flex flex-col gap-1">Source<select className={field} value={source} onChange={event => setSource(event.target.value)}><option value="">All sources</option>{sources.map(source => <option key={source.sourceCollectionId} value={source.sourceCollectionId}>{source.label}</option>)}</select></label>
      <label className="flex flex-col gap-1">Format<select className={field} value={format} onChange={event => setFormat(event.target.value)}><option value="">All formats</option><option value="text">Text</option><option value="csv">CSV</option><option value="pdf">PDF</option></select></label>
      <button className={evidenceButton} disabled={busy || !query.trim()}>{busy ? "Searching…" : "Search contents"}</button>
    </form>
    {searchError && <p role="alert">{searchError}</p>}
    {search && search.accessRevision === accessRevision && <section aria-label="Passage search results" className="space-y-2"><p>{search.total} matching passages</p>{search.results.map(result => <button key={`${result.evidenceId}-${result.extractionId}-${result.passageIndex}`} className="block w-full break-words border border-[var(--console-line)] p-3 text-left" onClick={() => navigate(result)}><strong>{result.label} · {locatorLabel(result.locator)}</strong><p className="mt-1 whitespace-pre-wrap">{result.snippet}</p></button>)}<div className="flex gap-2"><button className={evidenceButton} disabled={busy || search.offset === 0} onClick={() => void runSearch(Math.max(0, search.offset - 20))}>Previous results</button><button className={evidenceButton} disabled={busy || search.offset + 20 >= search.total} onClick={() => void runSearch(search.offset + 20)}>Next results</button></div></section>}
    {error && <p role="alert">{error}</p>}
    {!evidenceId && <p>Import records from Ingestion to begin.</p>}
    {evidenceId && !document && !error && <p>Loading document…</p>}
    {document && <section aria-label="Selected document contents" className="min-w-0 space-y-3">
      <h3 className="break-words font-semibold">{[...new Set(document.item.occurrences.map(occurrence => occurrence.sourcePath))].join(", ") || evidenceId}</h3>
      <p className="break-all text-xs">Evidence {document.item.evidenceId} · Original {document.item.contentHash}</p>
      <button className={evidenceButton} onClick={() => void openOriginal()}>Open immutable original</button>
      {originalText !== undefined && <pre aria-label="Original text" className="whitespace-pre-wrap break-words border p-3">{originalText}</pre>}
      {document.extractions.length > 1 && <label className="flex flex-col gap-1">Extraction version<select className={field} value={document.extraction?.extractionId} onChange={event => navigate({ evidenceId: evidenceId!, extractionId: event.target.value, passageIndex: 0 })}>{document.extractions.map(version => <option value={version.extractionId} key={version.extractionId}>{version.completedAt} · {version.parser.name} {version.parser.version}</option>)}</select></label>}
      {document.failures.map((failure, index) => <p role="status" key={`${failure.jobId}-${index}`}>{failure.failedAt}: {failure.message} {failure.retryable ? "Retry this job in Ingestion." : "Supply a supported, complete source and scan again."}</p>)}
      {!document.extraction && <p>No readable extraction yet. Run local extraction in Ingestion. Scanned PDF pages and images require OCR, which this local path does not support.</p>}
      {document.extraction && <>
        <p className="break-all text-xs">{document.extraction.extractor.name} {document.extraction.extractor.version} · {document.extraction.extractor.engine} {document.extraction.extractor.engineVersion} · Extraction {document.extraction.extractionId} · {document.extractionHash}</p>
        <div className="max-h-[36rem] overflow-y-auto space-y-3" aria-label="Extracted passages">{document.extraction.passages.map((passage, index) => <article id={`evidence-passage-${index}`} key={index} className={`min-w-0 rounded border p-3 ${passageIndex === index ? "border-[var(--signal-amber)]" : "border-[var(--console-line)]"}`}>
          <a className="text-xs underline" href={`#evidence/${document.item.evidenceId}/${document.extraction!.extractionId}/${index}`} onClick={() => navigate({ evidenceId: document.item.evidenceId, extractionId: document.extraction!.extractionId, passageIndex: index })}>{locatorLabel(passage.locator)}</a>
          <p className="mt-2 whitespace-pre-wrap break-words">{passage.text}</p>
        </article>)}</div>
        {document.item.governanceTags.length === 0 && <form aria-label="Initial human classification" className="space-y-2 border border-[var(--console-line)] p-3" onSubmit={event => {
          event.preventDefault(); setBusy(true);
          void evidenceRequest("/api/evidence/initial-classification", { evidenceRef: document.item.evidenceId, tag: classification, rationale })
            .then(onRefresh).catch(reason => setError(reason instanceof Error ? reason.message : "Classification unavailable.")).finally(() => setBusy(false));
        }}>
          <h4 className="font-semibold">Review initial classification</h4>
          <p>This document is unclassified. Choose its handling requirements before any external processing. Public_safe means the selected content is suitable to disclose; it does not approve a transfer.</p>
          <label className="flex flex-col gap-1">Initial classification<select className={field} required value={classification} onChange={event => setClassification(event.target.value)}><option value="">Choose a classification</option>{governanceTags.map(tag => <option key={tag}>{tag}</option>)}</select></label>
          <label className="flex flex-col gap-1">Classification rationale<textarea className={field} required value={rationale} onChange={event => setRationale(event.target.value)} /></label>
          <button className={evidenceButton} disabled={busy || !classification || !rationale.trim()}>Record human classification and review</button>
        </form>}
        <DocumentProcessingPanel key={`${document.item.evidenceId}-${document.extraction.extractionId}`} evidenceId={document.item.evidenceId} extraction={document.extraction} extractionHash={document.extractionHash!} />
      </>}
    </section>}
  </section>;
}
