import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CaseComparisonContext,
  ComparisonAssertion,
} from "../../../ontology/src/case-comparison.js";
import type { CrossCaseOutput } from "../../../ontology/src/cross-case-output.js";
import type {
  DocumentProcessingJob,
  DocumentProcessingManifest,
} from "../../../ontology/src/document-processing-contracts.js";
import type { InvestigationRecordView } from "../../../ontology/src/investigation-records.js";
import type {
  InvestigationRecord,
  KnowledgeCitation,
} from "../../../ontology/src/knowledge-contracts.js";
import { knowledgeRequest, newKnowledgeId } from "./shared-ontology-adapter.js";

const button =
  "min-w-0 max-w-full rounded border border-[var(--console-line-strong)] px-3 py-2 text-sm [overflow-wrap:anywhere] disabled:opacity-50";
const field =
  "min-w-0 w-full rounded border border-[var(--console-line)] bg-[var(--console-panel)] p-2";
const box =
  "min-w-0 space-y-3 rounded border border-[var(--console-line)] p-4 [overflow-wrap:anywhere]";
const defaultQuestion =
  "What connects these cases? Look for the same people or organizations, and similar relationships or sequences of events involving different people. Explain what the sources show, what differs, what challenges each possible pattern, and what ordinary circumstances could account for it. Be clear about what the evidence cannot establish.";
type Workspace = {
  revision: number;
  eligibleCases: { caseId: string; title: string }[];
  context: CaseComparisonContext | null;
  limitation?: string;
  records: (InvestigationRecordView & { stale?: boolean })[];
  jobs: DocumentProcessingJob[];
};
type Preview = {
  invocationId: string;
  manifestHash: string;
  manifest: DocumentProcessingManifest;
};
type Result = {
  schemaVersion: "case-comparison.v1";
  comparison: CaseComparisonContext;
  question: string;
  output: CrossCaseOutput;
  stale: boolean;
  invocationId: string;
};
const patternLabels: Record<
  CrossCaseOutput["findings"][number]["kind"],
  string
> = {
  shared_identity: "Same person or organization across cases",
  relationship_structure:
    "Similar relationships involving different people or organizations",
  event_structure: "Similar events involving different people or organizations",
  event_sequence: "Similar sequences of events",
  tentative_identity: "Possible identity match — unconfirmed",
};
const selectionKey = (ids: string[], question: string) =>
  JSON.stringify([[...ids].sort(), question]);
const evidenceHref = (c: KnowledgeCitation) =>
  `#evidence/${encodeURIComponent(c.evidenceId)}/${encodeURIComponent(c.extractionId)}/${c.passageIndex}`;
const caseNames = (context: CaseComparisonContext, ids: string[]) =>
  ids
    .map((id) => context.cases.find((c) => c.caseId === id)?.title ?? id)
    .join(", ");
const entityName = (context: CaseComparisonContext, id: string) =>
  context.entities.find((e) => e.entityId === id)?.canonicalLabel ?? id;
function assertionLabel(
  a: ComparisonAssertion,
  context: CaseComparisonContext,
) {
  const value = a.objectEntityId
    ? entityName(context, a.objectEntityId)
    : a.value.type === "entity"
      ? "Linked entity"
      : String(a.value.value);
  return `${a.predicate}: ${a.subjectEntityId ? `${entityName(context, a.subjectEntityId)} → ` : ""}${value}`;
}
function linkedFactLabel(context: CaseComparisonContext | null, id: string) {
  const fact = context?.assertions.find((a) => a.assertionId === id);
  return fact && context
    ? assertionLabel(fact, context)
    : "Previously linked fact (review history)";
}
function SourceLinks({ citations }: { citations: KnowledgeCitation[] }) {
  return (
    <ul className="space-y-2">
      {citations.map((c, index) => (
        <li
          key={`${c.evidenceId}-${c.extractionId}-${c.passageIndex}-${index}`}
        >
          <a className="underline" href={evidenceHref(c)}>
            Source passage {index + 1}
          </a>
          <blockquote className="whitespace-pre-wrap">{c.quote}</blockquote>
        </li>
      ))}
    </ul>
  );
}
function Scope({ context }: { context: CaseComparisonContext }) {
  return (
    <details className={box}>
      <summary>What was compared and how strong are the sources?</summary>
      <p>
        Compared: {caseNames(context, context.scope.comparedCaseIds)}.{" "}
        {context.assertions.length} reviewed facts;{" "}
        {context.scope.uniquePassageCount} distinct source passages.
      </p>
      <p>
        {context.scope.unexaminedEligibleCaseIds.length} other available cases
        are not included. Records excluded from analysis are not used here or
        included in these counts.
      </p>
      <p>
        This comparison uses facts an investigator has reviewed and the passages
        supporting them. It does not search every document in these cases.
        Missing details or different descriptions of the same activity can hide
        similarities. Check all compared cases for evidence that challenges a
        possible pattern.
      </p>
      <p>
        Several documents may repeat one original account. Repetition does not
        provide independent confirmation or prove that separate events occurred.
        An event date and a document’s publication date may differ; incomplete,
        uncertain, or overlapping dates cannot reliably establish which came
        first.
      </p>
      <p>
        {context.candidates.length} possible similarities to examine. These are
        starting points for analysis, not conclusions.
      </p>
      {context.candidates.map((c, i) => (
        <details key={i}>
          <summary>
            {patternLabels[c.kind]} · {caseNames(context, c.caseIds)}
          </summary>
          <p>
            {c.independentSourceCount} source origins have been marked as
            independent by an investigator. This does not count separate events.
            {c.sourceIndependence === "uncertain" &&
              " Some sources may come from the same original account; their independence has not been established."}
          </p>
          <p>
            Actors:{" "}
            {c.entityIds.map((id) => entityName(context, id)).join(", ")}
          </p>
          <p>
            Read the cited passages and consider differences and ordinary
            explanations. Matching names, shared addresses, or copies of the
            same document do not prove a connection.
          </p>
        </details>
      ))}
      <details>
        <summary>Source origins and repeated material</summary>
        {context.passages.map((p) => (
          <p key={p.index}>
            <a className="underline" href={evidenceHref(p.citation)}>
              Passage {p.index + 1}
            </a>{" "}
            ·{" "}
            {p.lineage?.independence === "independent"
              ? "Marked as an independent source"
              : p.lineage?.independence === "derived"
                ? "Draws on another source; not independent confirmation"
                : "Original source or independence not established"}
          </p>
        ))}
      </details>
      <details>
        <summary>Technical comparison details</summary>
        <p className="text-xs">Evidence version: {context.fingerprint}</p>
        {context.scope.coverageLimits.map((text, i) => (
          <p key={i}>{text}</p>
        ))}
        {context.passages.map((p) => (
          <p key={p.index}>
            Passage {p.index + 1} · {p.duplicateGroup} · origin{" "}
            {p.lineage?.originId ?? "unknown"}
          </p>
        ))}
        {context.candidates.flatMap((c, i) =>
          c.limitations.map((text, j) => <p key={`${i}-${j}`}>{text}</p>),
        )}
      </details>
    </details>
  );
}

export function InvestigationWorkspace() {
  const [loadedWorkspace, setWorkspace] = useState<
    Workspace & { scopeKey: string }
  >();
  const [caseIds, setCaseIds] = useState<string[]>([]);
  const [explicit, setExplicit] = useState(false);
  const [question, setQuestion] = useState(defaultQuestion);
  const [preview, setPreview] = useState<Preview & { key: string }>();
  const [result, setResult] = useState<Result>();
  const [setupOpen, setSetupOpen] = useState(false);
  const resultPanel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!result) return;
    resultPanel.current?.focus({ preventScroll: true });
    resultPanel.current?.scrollIntoView?.({ block: "start" });
  }, [result]);
  const [editor, setEditor] = useState<InvestigationRecord>();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const scope = explicit
    ? [...caseIds].sort().join(",") || "empty-selection"
    : "";
  const workspace =
    loadedWorkspace?.scopeKey === scope ? loadedWorkspace : undefined;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const loadRequest = useRef(0);
  const load = useCallback(async () => {
    const request = ++loadRequest.current;
    try {
      const data = await knowledgeRequest<Workspace>(
        `/api/investigation?${scope ? `caseIds=${encodeURIComponent(scope === "empty-selection" ? "" : scope)}` : ""}`,
      );
      if (scopeRef.current === scope && request === loadRequest.current)
        setWorkspace({ ...data, scopeKey: scope });
    } catch (reason) {
      if (request === loadRequest.current) throw reason;
    }
  }, [scope]);
  useEffect(() => {
    setWorkspace(undefined);
    setResult(undefined);
    setEditor(undefined);
    setError(undefined);
    void load().catch(() =>
      setError(
        "Investigation unavailable. Refresh and review the selected scope.",
      ),
    );
    return () => {
      loadRequest.current++;
    };
  }, [load]);
  useEffect(() => {
    if (!workspace?.jobs.some((j) => j.state === "running")) return;
    const timer = setTimeout(() => {
      void load().catch(() =>
        setError("Unable to refresh the running comparison."),
      );
    }, 1500);
    return () => clearTimeout(timer);
  }, [workspace?.jobs, load]);
  useEffect(() => {
    const followRecord = () => {
      const match = /^#investigation\/record\/([A-Za-z0-9_-]+)$/.exec(
        window.location.hash,
      );
      if (match) {
        setQuery("");
        document
          .getElementById(`record-${match[1]}`)
          ?.scrollIntoView?.({ block: "start" });
      }
    };
    followRecord();
    window.addEventListener("hashchange", followRecord);
    return () => window.removeEventListener("hashchange", followRecord);
  }, [workspace?.records]);
  async function act(work: () => Promise<void>) {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      await work();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Operation unavailable. Refresh and retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  const key = selectionKey(explicit ? caseIds : [], question);
  const currentPreview =
    preview?.key === key &&
    preview.manifest.comparison?.context.fingerprint ===
      workspace?.context?.fingerprint
      ? preview
      : undefined;
  const activeJob =
    currentPreview &&
    workspace?.jobs.find((j) => j.invocationId === currentPreview.invocationId);
  const safeProvider =
    currentPreview?.manifest.provider === "codex-chatgpt.v1" &&
    currentPreview.manifest.destination.model === "gpt-6-astra" &&
    currentPreview.manifest.destination.authentication === "chatgpt";
  async function save(record: InvestigationRecord) {
    if (!workspace) return;
    await knowledgeRequest("/api/investigation/records", {
      decisionId: newKnowledgeId("decision"),
      expectedRevision: workspace.revision,
      record,
    });
    await load();
    setEditor(undefined);
    setNotice("Local record saved.");
  }
  function newRecord(
    kind: InvestigationRecord["kind"] = "note",
    title = "",
    body = "",
    linkedResult?: Result,
  ): InvestigationRecord {
    const context = linkedResult?.comparison ?? workspace!.context;
    return {
      recordId: newKnowledgeId("record"),
      kind,
      status: "open",
      title,
      body,
      caseIds:
        context?.scope.comparedCaseIds ??
        (explicit
          ? caseIds
          : workspace!.eligibleCases.map((c) => c.caseId).slice(0, 12)),
      supporting: linkedResult
        ? context!.assertions.map((a) => a.assertionId)
        : [],
      contradicting: [],
      citations: context?.passages.map((p) => p.citation) ?? [],
      ...(context ? { scopeFingerprint: context.fingerprint } : {}),
      ...(linkedResult
        ? {
            invocationId: linkedResult.invocationId,
            scopeFingerprint: context!.fingerprint,
          }
        : {}),
    };
  }
  function copyRecord(record: InvestigationRecordView): InvestigationRecord {
    const {
      recordId,
      kind,
      status,
      title,
      body,
      caseIds: savedCases,
      supporting,
      contradicting,
      citations,
      occurredOn,
      relatedRecordId,
      invocationId,
      scopeFingerprint,
    } = record;
    return {
      recordId,
      kind,
      status,
      title,
      body,
      caseIds: savedCases,
      supporting: supporting.filter(
        (id) => !record.staleAssertionIds.includes(id),
      ),
      contradicting: contradicting.filter(
        (id) => !record.staleAssertionIds.includes(id),
      ),
      citations,
      ...(occurredOn ? { occurredOn } : {}),
      ...(relatedRecordId ? { relatedRecordId } : {}),
      ...(invocationId ? { invocationId } : {}),
      ...(scopeFingerprint ? { scopeFingerprint } : {}),
    };
  }
  async function readComparison(invocationId: string) {
    await act(async () => {
      const data = await knowledgeRequest<Omit<Result, "invocationId">>(
        `/api/document-processing/jobs/${encodeURIComponent(invocationId)}/output`,
      );
      setSetupOpen(false);
      setResult({ ...data, invocationId });
    });
  }
  const completedJobs =
    workspace?.jobs.filter((j) => j.state === "completed") ?? [];
  const latestCompleted = completedJobs.sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  )[0];
  const resultSavable =
    result &&
    !result.stale &&
    result.comparison.assertions.length <= 100 &&
    result.comparison.passages.length <= 256;
  return (
    <section
      aria-label="Investigation workspace"
      className="space-y-5 text-[var(--paper-light)]"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold">Cross-case investigation</h2>
        <button
          className={button}
          disabled={busy}
          onClick={() =>
            void act(async () => {
              setResult(undefined);
              await load();
            })
          }
        >
          Refresh investigation
        </button>
      </div>
      <p>
        Discover tentative patterns, challenge their evidence, and keep local
        investigation records. Recurrence does not establish coordination or
        causation.{" "}
        <a className="underline" href="#ontology">
          Review people, organizations, and facts
        </a>
        .
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!workspace ? (
        <p role="status">Loading investigation…</p>
      ) : (
        <>
          <section
            ref={resultPanel}
            tabIndex={-1}
            className={`${box} border-l-4 border-[var(--console-line-strong)] bg-[var(--console-panel-raised)] p-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4`}
            aria-label={result ? "Cross-case analysis" : "Comparison results"}
          >
            <h3 className="text-2xl font-semibold">Comparison results</h3>
            {result ? (
              <>
                <p className="text-sm">
                  {caseNames(
                    result.comparison,
                    result.comparison.scope.comparedCaseIds,
                  )}
                </p>
                {result.stale && (
                  <p role="alert">
                    Evidence changed—review before relying on this comparison. A
                    fact or source used here has changed since this was written.
                    To update the analysis, select these cases and use “Find
                    patterns across cases” to review and approve a new
                    comparison.
                  </p>
                )}
                <h4 className="text-lg font-semibold">Summary</h4>
                <p className="whitespace-pre-wrap text-base leading-relaxed">
                  {result.output.answer}
                </p>
                <details>
                  <summary className="cursor-pointer underline">
                    Read sources for this summary
                  </summary>
                  <SourceLinks
                    citations={result.output.citations.map((c) => ({
                      ...result.comparison.passages[c.passageIndex]!.citation,
                      quote: c.quote,
                    }))}
                  />
                </details>
                {!result.output.findings.length && (
                  <p>
                    No supported pattern finding was returned. Absence of a
                    finding is not evidence that cases are unrelated.
                  </p>
                )}
                {!resultSavable && (
                  <p>
                    This analysis cannot be saved as current. If its evidence
                    has changed, run a new comparison first. Results that exceed
                    100 linked facts or 256 source references require a smaller
                    case selection; no supporting material is silently dropped.
                  </p>
                )}
                {result.output.findings.map((f, index) => (
                  <article className={box} key={index}>
                    <p className="text-sm font-semibold uppercase tracking-wide">
                      Possible pattern {index + 1} of{" "}
                      {result.output.findings.length}
                    </p>
                    <h4 className="text-xl font-semibold">{f.title}</h4>
                    <p>
                      {patternLabels[f.kind]} ·{" "}
                      {caseNames(result.comparison, f.caseIds)}
                    </p>
                    <p>{f.explanation}</p>
                    <details>
                      <summary className="cursor-pointer underline">
                        Read sources for this pattern
                      </summary>
                      <SourceLinks
                        citations={f.citations.map((c) => ({
                          ...result.comparison.passages[c.passageIndex]!
                            .citation,
                          quote: c.quote,
                        }))}
                      />
                    </details>
                    {(
                      [
                        ["Relevant differences", f.differences],
                        [
                          "Evidence that challenges the pattern",
                          f.counterexamples,
                        ],
                        [
                          "What else could account for this?",
                          f.ordinaryExplanations,
                        ],
                        ["What the evidence cannot tell us", f.limitations],
                      ] as const
                    ).map(([label, values]) => (
                      <div key={label}>
                        <h5 className="font-semibold">{label}</h5>
                        <ul>
                          {values.map((v, i) => (
                            <li key={i}>{v}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                    <details>
                      <summary>
                        Examined relationships, roles, and dates
                      </summary>
                      {result.comparison.assertions
                        .filter((a) => f.assertionIds.includes(a.assertionId))
                        .map((a) => (
                          <Assertion
                            key={a.assertionId}
                            assertion={a}
                            context={result.comparison}
                          />
                        ))}
                    </details>
                    <button
                      className={button}
                      disabled={busy || !resultSavable}
                      onClick={() =>
                        void act(() =>
                          save({
                            ...newRecord(
                              "pattern",
                              f.title,
                              `${f.explanation}\n\nPattern: ${patternLabels[f.kind]}\nInvolved cases: ${caseNames(result.comparison, f.caseIds)}\n\nDifferences:\n${f.differences.join("\n")}\n\nCounterexamples:\n${f.counterexamples.join("\n")}\n\nOrdinary explanations:\n${f.ordinaryExplanations.join("\n")}\n\nLimitations:\n${f.limitations.join("\n")}\n\nRecurrence does not establish coordination or causation.`,
                              result,
                            ),
                            status: "saved",
                          }),
                        )
                      }
                    >
                      Save pattern hypothesis
                    </button>
                  </article>
                ))}
                <button
                  className={button}
                  disabled={busy || !resultSavable}
                  onClick={() =>
                    setEditor(
                      newRecord(
                        "brief",
                        "Cited cross-case brief",
                        `${result.question}\n\n${result.output.answer}`,
                        result,
                      ),
                    )
                  }
                >
                  Edit cited local brief
                </button>
                <h4 className="font-semibold">Unresolved questions</h4>
                {result.output.unresolvedQuestions.map((q, i) => (
                  <div key={i}>
                    <p>{q}</p>
                    <button
                      className={button}
                      disabled={busy || !resultSavable}
                      onClick={() =>
                        setEditor(
                          newRecord("question", q.slice(0, 1000), q, result),
                        )
                      }
                    >
                      Keep unresolved question {i + 1}
                    </button>
                  </div>
                ))}
                <details>
                  <summary className="cursor-pointer">Question asked</summary>
                  <p>{result.question}</p>
                </details>
                <Scope context={result.comparison} />
              </>
            ) : (
              <>
                <p>
                  {latestCompleted
                    ? "A completed comparison is ready. Open it to read the answer, possible patterns, and the evidence behind them."
                    : "No completed comparison for these cases yet. Start a comparison to look for connections and recurring patterns."}
                </p>
                {latestCompleted && (
                  <>
                    <p className="text-sm">
                      Latest completed comparison · {latestCompleted.createdAt}
                    </p>
                    <button
                      className={`${button} border-[var(--console-line-strong)] bg-[var(--console-panel)] font-semibold`}
                      disabled={busy}
                      onClick={() =>
                        void readComparison(latestCompleted.invocationId)
                      }
                    >
                      Read comparison
                    </button>
                  </>
                )}
              </>
            )}
          </section>
          <details
            className={box}
            open={setupOpen}
            onToggle={(event) => setSetupOpen(event.currentTarget.open)}
          >
            <summary className="cursor-pointer font-semibold">
              Start a new comparison
            </summary>
            <p>
              Select cases and a question, then review and approve what will be
              sent for analysis.
            </p>
            <section className={box} aria-label="Comparison scope">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!explicit}
                  disabled={busy}
                  onChange={(event) => {
                    setPreview(undefined);
                    setResult(undefined);
                    setExplicit(!event.target.checked);
                    if (!event.target.checked)
                      setCaseIds(
                        workspace.eligibleCases
                          .slice(0, 12)
                          .map((c) => c.caseId),
                      );
                  }}
                />
                All available cases (up to 12)
              </label>
              {explicit && (
                <fieldset className="space-y-2" disabled={busy}>
                  <legend>Select cases to compare (maximum 12)</legend>
                  {workspace.eligibleCases.map((c) => (
                    <label className="flex items-center gap-2" key={c.caseId}>
                      <input
                        type="checkbox"
                        checked={caseIds.includes(c.caseId)}
                        onChange={(event) => {
                          setPreview(undefined);
                          setCaseIds((ids) =>
                            event.target.checked
                              ? [...ids, c.caseId]
                              : ids.filter((id) => id !== c.caseId),
                          );
                        }}
                      />
                      {c.title}
                    </label>
                  ))}
                </fieldset>
              )}
              {workspace.limitation && (
                <p role="status">{workspace.limitation}</p>
              )}
              <label className="block">
                Cross-case question
                <textarea
                  className={field}
                  value={question}
                  maxLength={2000}
                  disabled={busy}
                  onChange={(event) => {
                    setQuestion(event.target.value);
                    setResult(undefined);
                  }}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  className={button}
                  disabled={
                    busy ||
                    !workspace.context ||
                    (explicit && (!caseIds.length || caseIds.length > 12))
                  }
                  onClick={() =>
                    void act(async () => {
                      setQuestion(defaultQuestion);
                      setResult(undefined);
                      const p = await knowledgeRequest<Preview>(
                        "/api/investigation/preview",
                        {
                          ...(explicit ? { caseIds } : {}),
                          question: defaultQuestion,
                        },
                      );
                      setPreview({
                        ...p,
                        key: selectionKey(
                          explicit ? caseIds : [],
                          defaultQuestion,
                        ),
                      });
                      await load();
                    })
                  }
                >
                  Find patterns across cases
                </button>
                <button
                  className={button}
                  disabled={
                    busy ||
                    !workspace.context ||
                    !question.trim() ||
                    (explicit && (!caseIds.length || caseIds.length > 12))
                  }
                  onClick={() =>
                    void act(async () => {
                      setResult(undefined);
                      const p = await knowledgeRequest<Preview>(
                        "/api/investigation/preview",
                        { ...(explicit ? { caseIds } : {}), question },
                      );
                      setPreview({ ...p, key });
                      await load();
                    })
                  }
                >
                  Preview cited question
                </button>
              </div>
              <p>
                Review what will be sent, approve it, then start the comparison.
                The evidence may be too limited to identify a pattern.
              </p>
            </section>
            {workspace.context && <Scope context={workspace.context} />}
            {currentPreview && (
              <section aria-label="Exact comparison transfer" className={box}>
                <h3 className="font-semibold">
                  Review exact outgoing comparison
                </h3>
                <p>
                  Destination: official Codex ChatGPT subscription · model{" "}
                  {currentPreview.manifest.destination.model}. One use of your
                  subscription; failed comparisons are not retried
                  automatically.
                </p>
                <pre className="max-h-56 overflow-auto whitespace-pre-wrap text-xs">
                  {JSON.stringify(currentPreview.manifest.destination, null, 2)}
                </pre>
                <p>
                  Input {currentPreview.manifest.inputBytes} bytes; maximum
                  response {currentPreview.manifest.maxResponseBytes} bytes;
                  timeout {currentPreview.manifest.timeoutMs} ms.
                </p>
                <h4>Exact system instructions</h4>
                <pre className="max-h-60 overflow-auto whitespace-pre-wrap text-xs">
                  {currentPreview.manifest.systemPrompt}
                </pre>
                <h4>
                  Exact question, reviewed facts, and source passages to be sent
                </h4>
                <pre className="max-h-96 overflow-auto whitespace-pre-wrap text-xs">
                  {currentPreview.manifest.inputText}
                </pre>
                <p className="text-xs">
                  Approval fingerprint: {currentPreview.manifestHash}
                </p>
                {!safeProvider && (
                  <p role="alert">
                    This comparison requires official Codex, ChatGPT
                    authentication, and exactly gpt-6-astra.
                  </p>
                )}
                {activeJob?.state === "awaiting_approval" && (
                  <button
                    className={button}
                    disabled={busy || !safeProvider}
                    onClick={() =>
                      void act(async () => {
                        await knowledgeRequest(
                          "/api/document-processing/approve",
                          { manifestHash: currentPreview.manifestHash },
                        );
                        await load();
                      })
                    }
                  >
                    Approve this comparison
                  </button>
                )}
                {activeJob?.state === "queued" && (
                  <button
                    className={button}
                    disabled={busy || !safeProvider}
                    onClick={() =>
                      void act(async () => {
                        setWorkspace(
                          (w) =>
                            w && {
                              ...w,
                              jobs: w.jobs.map((j) =>
                                j.invocationId === currentPreview.invocationId
                                  ? { ...j, state: "running" }
                                  : j,
                              ),
                            },
                        );
                        await knowledgeRequest(
                          `/api/document-processing/jobs/${encodeURIComponent(currentPreview.invocationId)}/run`,
                          {},
                        );
                        await load();
                      })
                    }
                  >
                    Run approved comparison
                  </button>
                )}
              </section>
            )}
          </details>
          <section className={box} aria-label="Comparison runs">
            <h3 className="font-semibold">Comparison history</h3>
            {!workspace.jobs.length && <p>No comparison runs in this scope.</p>}
            {workspace.jobs.map((j) => (
              <div
                className="flex flex-wrap items-center gap-2"
                key={j.invocationId}
              >
                <span>
                  {j.createdAt} · {j.state.replaceAll("_", " ")}
                </span>
                <details>
                  <summary>Run details</summary>
                  <p>
                    {j.invocationId}
                    {j.reason && ` · ${j.reason}`}
                  </p>
                </details>
                {j.state === "completed" ? (
                  <button
                    className={button}
                    disabled={busy}
                    onClick={() => void readComparison(j.invocationId)}
                  >
                    Open comparison
                  </button>
                ) : (
                  ["queued", "awaiting_approval"].includes(j.state) && (
                    <button
                      className={button}
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          const p = await knowledgeRequest<Preview>(
                            `/api/document-processing/jobs/${encodeURIComponent(j.invocationId)}/preview`,
                          );
                          setSetupOpen(true);
                          const comparison = p.manifest.comparison;
                          if (!comparison)
                            throw new Error("Comparison preview unavailable.");
                          const ids = comparison.requestedCaseIds ?? [];
                          setExplicit(Boolean(comparison.requestedCaseIds));
                          setCaseIds(ids);
                          setQuestion(comparison.question);
                          setPreview({
                            ...p,
                            key: selectionKey(ids, comparison.question),
                          });
                        })
                      }
                    >
                      Review saved comparison
                    </button>
                  )
                )}
                {["awaiting_approval", "queued", "running"].includes(
                  j.state,
                ) && (
                  <button
                    className={button}
                    onClick={() =>
                      void act(async () => {
                        await knowledgeRequest(
                          `/api/document-processing/jobs/${encodeURIComponent(j.invocationId)}/cancel`,
                          {},
                        );
                        await load();
                      })
                    }
                  >
                    Cancel comparison
                  </button>
                )}
              </div>
            ))}
          </section>
          <div className="border-t border-[var(--console-line)] pt-6">
            <h3 className="text-xl font-semibold">Investigation notebook</h3>
            <p className="mt-2 text-sm">
              Your timeline, notes, saved hypotheses, and request history. The
              comparison answer is above.
            </p>
          </div>
          {workspace.context && (
            <>
              <section className={box} aria-label="Sourced timeline">
                <h3 className="font-semibold">Sourced timeline</h3>
                <p>
                  When an event happened may differ from when it was reported.
                  Partial or uncertain dates do not establish an event order.
                </p>
                {!workspace.context.assertions.some(
                  (a) => a.kind === "occurrence",
                ) && (
                  <p>
                    There is not enough reviewed evidence to build a timeline.
                  </p>
                )}
                {workspace.context.assertions
                  .filter((a) => a.kind === "occurrence")
                  .sort((a, b) =>
                    (a.occurredTime?.start ?? "z").localeCompare(
                      b.occurredTime?.start ?? "z",
                    ),
                  )
                  .map((a) => (
                    <Assertion
                      key={a.assertionId}
                      assertion={a}
                      context={workspace.context!}
                    />
                  ))}
              </section>
              <section className={box} aria-label="Search examined knowledge">
                <label className="block">
                  Search cases, people, facts, and notes
                  <input
                    className={field}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <p>
                  Search covers the cases and records shown here.{" "}
                  <a className="underline" href="#ontology">
                    Review or correct a person, organization, or fact
                  </a>
                  .
                </p>
                {query &&
                  workspace.context.assertions
                    .filter((a) =>
                      `${assertionLabel(a, workspace.context!)} ${caseNames(workspace.context!, a.caseIds)} ${a.participants.map((p) => entityName(workspace.context!, p.entityId)).join(" ")}`
                        .toLocaleLowerCase()
                        .includes(query.toLocaleLowerCase()),
                    )
                    .map((a) => (
                      <Assertion
                        key={a.assertionId}
                        assertion={a}
                        context={workspace.context!}
                      />
                    ))}
              </section>
            </>
          )}
          <section className={box} aria-label="Local investigation records">
            <h3 className="font-semibold">
              Local notes, briefs, hypotheses, and request history
            </h3>
            {!workspace.context && (
              <p>
                Saved records cannot be shown for this selection. Select fewer
                cases or check whether their facts and sources are available for
                analysis.
              </p>
            )}
            <p>
              Keep notes and record requests, correspondence, and responses
              here. New entries link to the sources in the selected cases, so
              changes to those sources will flag your writing for review. Select
              fewer cases to write about a smaller set. Request drafts stay
              local and send nothing. Saving an idea does not make it an
              established fact.
            </p>
            <button
              className={button}
              disabled={busy || !workspace.context}
              onClick={() => setEditor(newRecord())}
            >
              New local record
            </button>
            {workspace.records
              .filter((record) =>
                `${record.title} ${record.body} ${record.kind} ${record.status}`
                  .toLocaleLowerCase()
                  .includes(query.toLocaleLowerCase()),
              )
              .map((record) => (
                <article
                  id={`record-${record.recordId}`}
                  className={box}
                  key={record.recordId}
                >
                  <h4 className="font-semibold">{record.title}</h4>
                  <p>
                    {record.kind} · {record.status} ·{" "}
                    {record.occurredOn ?? "No recorded date"}
                  </p>
                  {(record.stale || record.staleAssertionIds.length > 0) && (
                    <p role="alert">
                      Evidence changed—review this record. A linked fact or
                      source has changed. Check your notes; if this record uses
                      a comparison, compare its cases again before relying on
                      it.
                    </p>
                  )}
                  <p className="whitespace-pre-wrap">{record.body}</p>
                  <p>
                    Supporting facts:{" "}
                    {record.supporting.map((id) => (
                      <a
                        key={id}
                        className="underline mr-2"
                        href={`#ontology/assertion/${encodeURIComponent(id)}`}
                      >
                        {linkedFactLabel(workspace.context, id)}
                      </a>
                    ))}
                    {!record.supporting.length && "none"}. Contradicting facts:{" "}
                    {record.contradicting.map((id) => (
                      <a
                        key={id}
                        className="underline mr-2"
                        href={`#ontology/assertion/${encodeURIComponent(id)}`}
                      >
                        {linkedFactLabel(workspace.context, id)}
                      </a>
                    ))}
                    {!record.contradicting.length && "none"}.
                  </p>
                  {record.relatedRecordId && (
                    <p>
                      Related record:{" "}
                      <a
                        className="underline"
                        href={`#investigation/record/${encodeURIComponent(record.relatedRecordId)}`}
                      >
                        {workspace.records.find(
                          (r) => r.recordId === record.relatedRecordId,
                        )?.title ?? record.relatedRecordId}
                      </a>
                    </p>
                  )}
                  <SourceLinks citations={record.citations} />
                  <div className="flex flex-wrap gap-2">
                    <button
                      className={button}
                      disabled={busy}
                      onClick={() => setEditor(copyRecord(record))}
                    >
                      Edit or annotate {record.title}
                    </button>
                    <button
                      className={button}
                      disabled={busy}
                      onClick={() =>
                        void act(() =>
                          save({
                            ...copyRecord(record),
                            status:
                              record.status === "dismissed"
                                ? "open"
                                : "dismissed",
                          }),
                        )
                      }
                    >
                      {record.status === "dismissed" ? "Reopen" : "Dismiss"}{" "}
                      {record.title}
                    </button>
                    {record.scopeFingerprint && (
                      <button
                        className={button}
                        disabled={busy}
                        onClick={() => {
                          setSetupOpen(true);
                          setExplicit(true);
                          setCaseIds(record.caseIds);
                          setQuestion(defaultQuestion);
                          setPreview(undefined);
                          setResult(undefined);
                          setNotice(
                            "The same cases are selected. Check their facts and sources, then preview and approve a new comparison.",
                          );
                        }}
                      >
                        Compare these cases again
                      </button>
                    )}
                  </div>
                  <details>
                    <summary>
                      Preserved history ({record.history.length} recent
                      revisions)
                    </summary>
                    {record.history.map((h) => (
                      <p key={h.eventId}>
                        {h.savedAt} · {h.status} · {h.actorId}
                      </p>
                    ))}
                  </details>
                </article>
              ))}
          </section>
          {editor && (
            <RecordEditor
              key={editor.recordId}
              record={editor}
              context={workspace.context}
              records={workspace.records}
              busy={busy}
              onSave={(record) => void act(() => save(record))}
              onCancel={() => setEditor(undefined)}
            />
          )}
        </>
      )}
    </section>
  );
}
function Assertion({
  assertion: a,
  context,
}: {
  assertion: ComparisonAssertion;
  context: CaseComparisonContext;
}) {
  const time = (value: ComparisonAssertion["occurredTime"]) =>
    value
      ? `${value.start}${value.end ? ` to ${value.end}` : ""}${value.uncertain ? " (uncertain)" : ""}`
      : "Unknown";
  return (
    <article className="space-y-2 border-t border-[var(--console-line)] py-3">
      <p>
        {assertionLabel(a, context)} · {caseNames(context, a.caseIds)}
      </p>
      <p>
        <a
          className="underline"
          href={`#ontology/assertion/${encodeURIComponent(a.assertionId)}`}
        >
          Review or correct this fact
        </a>
      </p>
      <p>
        Actors:{" "}
        {[
          ...new Set(
            [
              a.entityId,
              a.subjectEntityId,
              a.objectEntityId,
              ...a.participants.map((p) => p.entityId),
            ].filter((id): id is string => Boolean(id)),
          ),
        ].map((id) => (
          <a
            key={id}
            className="underline mr-2"
            href={`#ontology/entity/${encodeURIComponent(id)}`}
          >
            {entityName(context, id)}
          </a>
        ))}
      </p>
      <p>
        Roles:{" "}
        {a.participants
          .map((p) => `${p.role}: ${entityName(context, p.entityId)}`)
          .join("; ") || "None recorded"}
      </p>
      {a.kind === "occurrence" && (
        <p>
          Event date: {time(a.occurredTime)}. Document publication date:{" "}
          {time(a.publicationTime)}.
        </p>
      )}
      <SourceLinks
        citations={a.citationIndices.map((i) => context.passages[i]!.citation)}
      />
    </article>
  );
}
function RecordEditor({
  record,
  context,
  records,
  busy,
  onSave,
  onCancel,
}: {
  record: InvestigationRecord;
  context: CaseComparisonContext | null;
  records: InvestigationRecordView[];
  busy: boolean;
  onSave: (record: InvestigationRecord) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(record);
  function toggle(
    fieldName: "supporting" | "contradicting",
    id: string,
    included: boolean,
  ) {
    setDraft((d) => ({
      ...d,
      [fieldName]: included
        ? [...d[fieldName], id]
        : d[fieldName].filter((value) => value !== id),
    }));
  }
  const linkedIds = [...new Set([...draft.supporting, ...draft.contradicting])];
  const linkedCitations =
    context?.assertions
      .filter((a) => linkedIds.includes(a.assertionId))
      .flatMap((a) =>
        a.citationIndices.map((i) => context.passages[i]!.citation),
      ) ?? [];
  const citations = [
    ...new Map(
      [...draft.citations, ...linkedCitations].map((c) => [
        JSON.stringify(c),
        c,
      ]),
    ).values(),
  ];
  const tooLarge = linkedIds.length > 100 || citations.length > 256;
  return (
    <form
      className={box}
      aria-label="Edit local investigation record"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ ...draft, citations });
      }}
    >
      <h3 className="font-semibold">Edit local investigation record</h3>
      <fieldset className="min-w-0 space-y-3" disabled={busy}>
        <label className="block">
          Record kind
          <select
            className={field}
            value={draft.kind}
            disabled={records.some((r) => r.recordId === draft.recordId)}
            onChange={(event) =>
              setDraft((d) => ({
                ...d,
                kind: event.target.value as InvestigationRecord["kind"],
              }))
            }
          >
            {[
              "note",
              "brief",
              "question",
              "pattern",
              "request",
              "correspondence",
              "response",
            ].map((kind) => (
              <option key={kind}>{kind}</option>
            ))}
          </select>
        </label>
        <label className="block">
          Record title
          <input
            className={field}
            required
            maxLength={1000}
            value={draft.title}
            onChange={(event) =>
              setDraft((d) => ({ ...d, title: event.target.value }))
            }
          />
        </label>
        <label className="block">
          Record text
          <textarea
            className={`${field} min-h-40`}
            maxLength={10000}
            value={draft.body}
            onChange={(event) =>
              setDraft((d) => ({ ...d, body: event.target.value }))
            }
          />
        </label>
        <label className="block">
          Recorded date (YYYY, YYYY-MM, or YYYY-MM-DD)
          <input
            className={field}
            value={draft.occurredOn ?? ""}
            pattern="[0-9]{4}(-[0-9]{2})?(-[0-9]{2})?"
            onChange={(event) =>
              setDraft((d) => {
                const { occurredOn: _old, ...rest } = d;
                return event.target.value
                  ? { ...rest, occurredOn: event.target.value }
                  : rest;
              })
            }
          />
        </label>
        <label className="block">
          Related local record
          <select
            className={field}
            value={draft.relatedRecordId ?? ""}
            onChange={(event) =>
              setDraft((d) => {
                const { relatedRecordId: _old, ...rest } = d;
                return event.target.value
                  ? { ...rest, relatedRecordId: event.target.value }
                  : rest;
              })
            }
          >
            <option value="">None</option>
            {records
              .filter((r) => r.recordId !== draft.recordId)
              .map((r) => (
                <option key={r.recordId} value={r.recordId}>
                  {r.kind}: {r.title}
                </option>
              ))}
          </select>
        </label>
        <p>
          Scope:{" "}
          {context
            ? caseNames(context, draft.caseIds)
            : draft.caseIds.join(", ")}
          . Earlier versions and their source links are kept when you save
          changes.
        </p>
        <details>
          <summary>Facts that support or challenge this record</summary>
          {context?.assertions.map((a) => (
            <div className="my-2 flex flex-wrap gap-3" key={a.assertionId}>
              <label>
                <input
                  type="checkbox"
                  checked={draft.supporting.includes(a.assertionId)}
                  onChange={(event) =>
                    toggle("supporting", a.assertionId, event.target.checked)
                  }
                />{" "}
                Support: {assertionLabel(a, context)}
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={draft.contradicting.includes(a.assertionId)}
                  onChange={(event) =>
                    toggle("contradicting", a.assertionId, event.target.checked)
                  }
                />{" "}
                Contradict: {assertionLabel(a, context)}
              </label>
            </div>
          ))}
        </details>
        <details>
          <summary>Linked source passages</summary>
          {context?.passages.map((p) => (
            <label className="block py-2" key={p.index}>
              <input
                type="checkbox"
                checked={draft.citations.some(
                  (c) => JSON.stringify(c) === JSON.stringify(p.citation),
                )}
                onChange={(event) =>
                  setDraft((d) => ({
                    ...d,
                    citations: event.target.checked
                      ? [...d.citations, p.citation]
                      : d.citations.filter(
                          (c) =>
                            JSON.stringify(c) !== JSON.stringify(p.citation),
                        ),
                  }))
                }
              />{" "}
              {p.citation.quote}
            </label>
          ))}
        </details>
        <p>
          Request drafts stay local. Record actual sending or receipt manually
          as correspondence or response, with its date and supporting evidence.
        </p>
        {tooLarge && (
          <p role="alert">
            A record can link to at most 100 facts and 256 source references,
            including sources for linked facts. Narrow the record before saving.
          </p>
        )}
        <button className={button} disabled={tooLarge}>
          Save local record
        </button>
        <button className={button} type="button" onClick={onCancel}>
          Cancel editing
        </button>
      </fieldset>
    </form>
  );
}
