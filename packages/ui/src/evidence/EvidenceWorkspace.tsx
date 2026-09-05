import { useEffect, useMemo, useState } from "react";
import { EvidenceReader } from "./EvidenceReader.js";
import { ExportPreview } from "../governance/ExportPreview.js";
import { GovernanceReview } from "../governance/GovernanceReview.js";
import type { AppendGovernanceReviewInput } from "../governance/governance-types.js";
import type {
  EvidenceAssertionCandidateDto,
  EvidenceItemDto,
  EvidenceWorkspaceDto,
  PrepareEvidenceAssertionCandidateInput
} from "./evidence-types.js";

interface EvidenceWorkspaceProps {
  readonly initialEvidenceId?: string | undefined;
  readonly workspace: EvidenceWorkspaceDto | undefined;
  readonly loadState: "idle" | "loading" | "loaded" | "error";
  readonly loadError: string | undefined;
  readonly onRetry: () => void;
  readonly onPrepareAssertionCandidate: (
    input: PrepareEvidenceAssertionCandidateInput
  ) => Promise<EvidenceAssertionCandidateDto>;
  readonly onAppendGovernanceReview: (input: AppendGovernanceReviewInput) => Promise<void> | void;
}

export function EvidenceWorkspace({
  initialEvidenceId,
  workspace,
  loadState,
  loadError,
  onRetry,
  onPrepareAssertionCandidate,
  onAppendGovernanceReview
}: EvidenceWorkspaceProps) {
  const [query, setQuery] = useState("");
  const [governanceTag, setGovernanceTag] = useState("all");
  const [parseState, setParseState] = useState("all");
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | undefined>(initialEvidenceId);
  useEffect(() => { if (initialEvidenceId) setSelectedEvidenceId(initialEvidenceId); }, [initialEvidenceId]);
  const [assertionId, setAssertionId] = useState("");
  const [subjectRef, setSubjectRef] = useState("");
  const [predicate, setPredicate] = useState("");
  const [object, setObject] = useState("");
  const [confidence, setConfidence] = useState("0.8");
  const [submitting, setSubmitting] = useState(false);
  const [preparedCandidate, setPreparedCandidate] = useState<EvidenceAssertionCandidateDto | undefined>();
  const [actionDiagnostic, setActionDiagnostic] = useState<string | undefined>();
  const selectedItem = workspace?.items.find((item) => item.evidenceId === selectedEvidenceId)
    ?? workspace?.items[0];
  const selectedGovernanceReview = workspace?.governance.reviews.find(
    (review) => review.evidenceRef === selectedItem?.evidenceId
  );
  const governanceTags = useMemo(
    () => [...new Set(workspace?.items.flatMap((item) => item.governanceTags.map((tag) => tag.tag)) ?? [])].sort(),
    [workspace]
  );
  const filteredItems = useMemo(
    () => (workspace?.items ?? []).filter((item) => evidenceMatches(item, query, governanceTag, parseState)),
    [governanceTag, parseState, query, workspace]
  );

  useEffect(() => {
    // Loading is not evidence that a requested record disappeared.
    if (workspace === undefined || loadState !== "loaded") return;
    if (selectedEvidenceId !== undefined && workspace?.items.some((item) => item.evidenceId === selectedEvidenceId)) {
      return;
    }
    setSelectedEvidenceId(workspace?.items[0]?.evidenceId);
  }, [selectedEvidenceId, workspace, loadState]);

  useEffect(() => {
    setAssertionId("");
    setSubjectRef("");
    setPredicate("");
    setObject("");
    setConfidence("0.8");
    setPreparedCandidate(undefined);
    setActionDiagnostic(undefined);
  }, [selectedItem?.evidenceId]);

  if (loadState === "error") {
    return (
      <section aria-label="Evidence load error" className="border border-[var(--signal-red)] bg-[var(--console-panel)]/72 p-4">
        <p className="font-mono text-base text-[var(--signal-red)] sm:text-sm">Evidence unavailable</p>
        <p className="mt-3 text-base text-[var(--paper-light)] sm:text-sm">
          {loadError ?? "Evidence workspace could not be loaded safely."}
        </p>
        <button type="button" onClick={onRetry} className={actionButtonClass}>Retry evidence replay</button>
      </section>
    );
  }

  if (workspace === undefined || loadState !== "loaded") {
    return (
      <section aria-label="Evidence loading state" className="border border-[var(--console-line)] bg-[var(--console-panel)]/72 p-4">
        <p className="font-mono text-base text-[var(--signal-amber)] sm:text-sm">Loading Evidence workspace</p>
        <p className="mt-3 text-base text-[var(--muted-amber)] sm:text-sm">
          Replaying canonical evidence, occurrence provenance, parsing, and governance state.
        </p>
      </section>
    );
  }

  async function prepareAssertionCandidate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedItem === undefined || !selectedItem.selectableForAssertionCandidate) {
      return;
    }
    setSubmitting(true);
    setPreparedCandidate(undefined);
    setActionDiagnostic(undefined);
    try {
      const numericConfidence = Number(confidence);
      const input: PrepareEvidenceAssertionCandidateInput = {
        assertionId,
        evidenceId: selectedItem.evidenceId,
        ...(subjectRef.trim().length === 0 ? {} : { subjectRef: subjectRef.trim() }),
        predicate: predicate.trim(),
        object,
        confidence: numericConfidence
      };
      setPreparedCandidate(await onPrepareAssertionCandidate(input));
    } catch {
      setActionDiagnostic("Assertion candidate preparation was blocked safely. Reload evidence and review provenance.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section aria-label="Evidence review workspace" className="space-y-4">
      <header className="border-y border-[var(--console-line-strong)] py-4">
        <p className="font-mono text-base uppercase tracking-[0.16em] text-[var(--signal-red)] sm:text-sm">
          Canonical corpus · high-water {workspace.sourceHighWaterMark}
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-[var(--paper-light)]">Evidence</h1>
        <p className="mt-2 max-w-3xl text-base text-[var(--muted-amber)] sm:text-sm">
          Inspect source lineage, derivatives, and governance. Prepared assertions remain review-required proposals.
        </p>
      </header>

      <EvidenceReader workspace={workspace} evidenceId={selectedItem?.evidenceId} onSelectEvidence={setSelectedEvidenceId} onRefresh={onRetry} />
      {workspace.diagnostics.length > 0 ? (
        <section aria-label="Evidence diagnostics" className="border border-[var(--signal-red)] bg-[var(--console-panel)]/72 p-4">
          <h2 className="font-mono text-base text-[var(--signal-red)] sm:text-sm">Safe replay diagnostics</h2>
          <ul role="list" className="mt-3 space-y-3">
            {workspace.diagnostics.map((diagnostic, index) => (
              <li key={`${diagnostic.code}:${index}`} className="border-l border-[var(--signal-red)] pl-3">
                <p className="font-mono text-base text-[var(--signal-amber)] sm:text-sm">{diagnostic.code}</p>
                <p className="mt-1 text-base text-[var(--paper-light)] sm:text-sm">{diagnostic.message}</p>
                <p className="mt-1 text-base text-[var(--muted-amber)] sm:text-sm">{diagnostic.repairActions.join(" · ")}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-label="Evidence filters" className="grid gap-3 border border-[var(--console-line)] bg-[var(--console-void)]/72 p-4 md:grid-cols-3">
        <label className="grid gap-1 text-base text-[var(--muted-amber)] sm:text-sm">
          Filter evidence
          <input
            type="search"
            aria-label="Filter evidence"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className={inputClass}
          />
        </label>
        <label className="grid gap-1 text-base text-[var(--muted-amber)] sm:text-sm">
          Governance tag
          <select aria-label="Governance tag" value={governanceTag} onChange={(event) => setGovernanceTag(event.target.value)} className={inputClass}>
            <option value="all">All tags</option>
            {governanceTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-base text-[var(--muted-amber)] sm:text-sm">
          Parse state
          <select aria-label="Parse state" value={parseState} onChange={(event) => setParseState(event.target.value)} className={inputClass}>
            <option value="all">All parse states</option>
            {(["queued", "running", "succeeded", "partial", "failed"] as const).map((state) => (
              <option key={state} value={state}>{state === "partial" ? "partial text extraction" : state}</option>
            ))}
          </select>
        </label>
      </section>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(17rem,0.8fr)_minmax(22rem,1.2fr)]">
        <section aria-label="Evidence corpus" className="min-w-0 border border-[var(--console-line)] bg-[var(--console-void)]/72">
          <header className="border-b border-[var(--console-line)] px-4 py-3">
            <h2 className="text-base font-semibold text-[var(--paper-light)]">Canonical evidence</h2>
            <p className="mt-1 font-mono text-base text-[var(--muted-amber)] sm:text-sm">{filteredItems.length} items</p>
          </header>
          {filteredItems.length === 0 ? (
            <p className="p-4 text-base text-[var(--muted-amber)] sm:text-sm">No evidence matches the active filters.</p>
          ) : (
            <ul role="list" className="divide-y divide-[var(--console-line)]">
              {filteredItems.map((item) => (
                <li key={item.evidenceId}>
                  <button
                    type="button"
                    aria-label={`Inspect evidence ${item.evidenceId}`}
                    aria-pressed={selectedItem?.evidenceId === item.evidenceId}
                    onClick={() => setSelectedEvidenceId(item.evidenceId)}
                    className="w-full min-w-0 px-4 py-3 text-left hover:bg-[var(--console-panel)] focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-[var(--signal-cyan)]"
                  >
                    <span className="block break-all font-mono text-base text-[var(--signal-cyan)] sm:text-sm">{item.evidenceId}</span>
                    <span className="mt-1 block break-words text-base text-[var(--paper-light)] sm:text-sm">{[...new Set(item.occurrences.map(occurrence => occurrence.sourcePath))].join(", ") || item.source?.label || "Provenance incomplete"}</span>
                    <span className="mt-1 block font-mono text-base text-[var(--muted-amber)] sm:text-sm">
                      {item.occurrences.length} occurrences · {item.quarantined ? "quarantined" : item.provenanceComplete ? "provenance complete" : "provenance incomplete"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {selectedItem === undefined ? (
          <section aria-label="Evidence detail" className="border border-[var(--console-line)] bg-[var(--console-void)]/72 p-4">
            <h2 className="font-mono text-base text-[var(--signal-amber)] sm:text-sm">Evidence detail</h2>
            <p className="mt-3 text-base text-[var(--muted-amber)] sm:text-sm">No canonical evidence item is available.</p>
          </section>
        ) : (
          <section aria-label="Evidence detail" className="min-w-0 space-y-4 border border-[var(--console-line)] bg-[var(--console-void)]/72 p-4">
            <div>
              <p className="font-mono text-base uppercase tracking-[0.12em] text-[var(--signal-red)] sm:text-sm">Evidence provenance</p>
              <h2 className="mt-2 break-all text-xl font-semibold text-[var(--paper-light)]">{selectedItem.evidenceId}</h2>
            </div>
            <dl className="grid min-w-0 gap-3 text-base sm:text-sm">
              <Detail label="Content hash" values={[selectedItem.contentHash ?? "Unavailable"]} />
              <Detail label="Media" values={[selectedItem.mediaType ?? "Unavailable", selectedItem.sizeBytes === undefined ? "size unavailable" : `${selectedItem.sizeBytes} bytes`]} />
              <Detail label="Source collections" values={selectedItem.sourceCollections.map((source) => `${source.label} · ${source.sourceCollectionId}`)} />
              <Detail label="Import batches" values={selectedItem.importBatchIds} />
              <Detail label="Governance state" values={[
                selectedItem.quarantined ? "quarantined" : "not quarantined",
                selectedItem.tombstoned ? "tombstoned" : "active",
                ...selectedItem.quarantineLockLevels.map((level) => `${level} lock`)
              ]} />
              <Detail label="Linked PRR or investigations" values={selectedItem.linkedReferences.map((reference) => `${reference.kind} · ${reference.id}`)} />
            </dl>

            <section aria-label="Source occurrences" className="border-t border-[var(--console-line)] pt-3">
              <h3 className="font-mono text-base text-[var(--signal-amber)] sm:text-sm">Source occurrences</h3>
              <ul role="list" className="mt-2 space-y-2">
                {selectedItem.occurrences.map((occurrence) => (
                  <li key={occurrence.occurrenceId} className="min-w-0 border-l border-[var(--console-line)] pl-3 text-base sm:text-sm">
                    <p className="break-all text-[var(--paper-light)]">{occurrence.sourcePath}</p>
                    <p className="mt-1 break-all font-mono text-[var(--muted-amber)]">{occurrence.occurrenceId} · {occurrence.status}</p>
                    {occurrence.archive === undefined ? null : (
                      <p className="mt-1 break-all text-[var(--muted-amber)]">
                        Archive {occurrence.archive.containerPath} → {occurrence.archive.internalPath} · {occurrence.archive.containerHash}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            <section aria-label="Parse and derivatives" className="border-t border-[var(--console-line)] pt-3">
              <h3 className="font-mono text-base text-[var(--signal-amber)] sm:text-sm">Parse and derivatives</h3>
              <ul role="list" className="mt-2 space-y-2">
                {selectedItem.parseJobs.map((job) => (
                  <li key={job.parseJobId} className="text-base text-[var(--paper-light)] sm:text-sm">
                    <span className="font-mono">{job.parser.name}@{job.parser.version}</span> · {job.lane} · {job.coverageStatus === "partial" ? "partial text extraction" : job.state}
                    {job.derivative === undefined ? null : <span className="block break-all text-[var(--muted-amber)]">{job.derivative.contentHash} · {job.derivative.mediaType}</span>}
                  </li>
                ))}
              </ul>
            </section>

            <section aria-label="Governance tags" className="border-t border-[var(--console-line)] pt-3">
              <h3 className="font-mono text-base text-[var(--signal-amber)] sm:text-sm">Governance tags</h3>
              <ul role="list" className="mt-2 space-y-2">
                {selectedItem.governanceTags.map((tag) => (
                  <li key={tag.tag} className="text-base text-[var(--paper-light)] sm:text-sm">
                    <span className="font-mono">{tag.tag}</span> · {tag.source} · {tag.status} · {Math.round(tag.confidence * 100)}%
                    <span className="block text-[var(--muted-amber)]">{tag.rationale}</span>
                  </li>
                ))}
              </ul>
            </section>

            {selectedItem.blockingReasons.length > 0 ? (
              <section aria-label="Assertion preparation blocks" className="border border-[var(--signal-red)] bg-[var(--console-panel)]/72 p-3">
                <h3 className="font-mono text-base text-[var(--signal-red)] sm:text-sm">Assertion preparation blocked</h3>
                <ul role="list" className="mt-2 list-disc space-y-1 pl-5 text-base text-[var(--paper-light)] sm:text-sm">
                  {selectedItem.blockingReasons.map((reason) => <li key={reason}>{reason}</li>)}
                </ul>
              </section>
            ) : null}

            <form aria-label="Prepare assertion candidate" onSubmit={(event) => void prepareAssertionCandidate(event)} className="grid gap-3 border-t border-[var(--console-line)] pt-4">
              <h3 className="text-base font-semibold text-[var(--paper-light)]">Prepare review-required assertion</h3>
              <FormField label="Assertion ID" value={assertionId} onChange={setAssertionId} />
              <FormField label="Subject reference" value={subjectRef} onChange={setSubjectRef} optional />
              <FormField label="Predicate" value={predicate} onChange={setPredicate} />
              <FormField label="Object" value={object} onChange={setObject} />
              <label className="grid gap-1 text-base text-[var(--muted-amber)] sm:text-sm">
                Confidence
                <input aria-label="Confidence" type="number" min="0" max="1" step="0.01" value={confidence} onChange={(event) => setConfidence(event.target.value)} className={inputClass} />
              </label>
              <button
                type="submit"
                disabled={!selectedItem.selectableForAssertionCandidate || submitting || assertionId.trim() === "" || predicate.trim() === "" || object === "" || !validConfidence(confidence)}
                className={actionButtonClass}
              >
                {submitting ? "Preparing candidate" : "Prepare assertion candidate"}
              </button>
              {actionDiagnostic === undefined ? null : <p role="alert" className="text-base text-[var(--signal-red)] sm:text-sm">{actionDiagnostic}</p>}
              {preparedCandidate === undefined ? null : (
                <div role="status" aria-label="Assertion candidate prepared" className="border border-[var(--signal-cyan)] p-3 text-base text-[var(--paper-light)] sm:text-sm">
                  <p className="font-mono text-[var(--signal-cyan)]">{preparedCandidate.assertionId} · review required</p>
                  <p className="mt-1">Evidence {preparedCandidate.evidenceReferences.map((reference) => reference.evidenceId).join(" · ")}</p>
                </div>
              )}
            </form>

            {workspace.assertionCandidates.length > 0 ? (
              <section aria-label="Prepared assertion candidates" className="border-t border-[var(--console-line)] pt-3">
                <h3 className="font-mono text-base text-[var(--signal-amber)] sm:text-sm">Prepared assertion candidates</h3>
                <ul role="list" className="mt-2 space-y-2">
                  {workspace.assertionCandidates.map((candidate) => (
                    <li key={candidate.eventId} className="text-base text-[var(--paper-light)] sm:text-sm">
                      <span className="font-mono">{candidate.assertionId}</span> · {candidate.reviewState} · review required
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </section>
        )}
      </div>

      {selectedGovernanceReview === undefined ? null : (
        <GovernanceReview
          key={selectedGovernanceReview.evidenceRef}
          review={selectedGovernanceReview}
          onAppendReview={onAppendGovernanceReview}
        />
      )}
      <ExportPreview preview={workspace.governance.exportPreview} />
    </section>
  );
}

function evidenceMatches(item: EvidenceItemDto, query: string, governanceTag: string, parseState: string): boolean {
  const normalized = query.trim().toLowerCase();
  const searchable = [
    item.evidenceId,
    item.contentHash ?? "",
    item.source?.label ?? "",
    ...item.sourceCollections.flatMap((source) => [source.sourceCollectionId, source.label]),
    ...item.occurrences.flatMap((occurrence) => [occurrence.sourcePath, occurrence.archive?.containerPath ?? "", occurrence.archive?.internalPath ?? ""]),
    ...item.linkedReferences.map((reference) => reference.id)
  ].join(" ").toLowerCase();
  return (normalized === "" || searchable.includes(normalized)) &&
    (governanceTag === "all" || item.governanceTags.some((tag) => tag.tag === governanceTag)) &&
    (parseState === "all" || item.parseJobs.some((job) => (job.coverageStatus === "partial" ? "partial" : job.state) === parseState));
}

function Detail({ label, values }: { readonly label: string; readonly values: readonly string[] }) {
  return (
    <div className="min-w-0 border-t border-[var(--console-line)] pt-3 first:border-t-0 first:pt-0">
      <dt className="font-mono uppercase text-[var(--muted-amber)]">{label}</dt>
      <dd className="mt-1 min-w-0 break-all text-[var(--paper-light)]">{values.length === 0 ? "None recorded" : values.join(" · ")}</dd>
    </div>
  );
}

function FormField({
  label,
  value,
  onChange,
  optional = false
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly optional?: boolean;
}) {
  return (
    <label className="grid gap-1 text-base text-[var(--muted-amber)] sm:text-sm">
      {label}{optional ? " (optional)" : ""}
      <input aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className={inputClass} />
    </label>
  );
}

function validConfidence(value: string): boolean {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1;
}

const inputClass = "min-h-10 min-w-0 border border-[var(--console-line)] bg-[var(--console-panel)] px-3 py-2 text-base text-[var(--paper-light)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--signal-cyan)] sm:text-sm";
const actionButtonClass = "relative mt-1 min-h-10 justify-self-start border border-[var(--signal-amber)] px-3 py-2 text-base text-[var(--signal-amber)] hover:bg-[var(--console-panel)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--signal-cyan)] disabled:cursor-not-allowed disabled:border-[var(--console-line)] disabled:text-[var(--muted-amber)] sm:text-sm";
