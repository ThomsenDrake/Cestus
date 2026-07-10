import { useMemo, useState } from "react";
import type {
  AgentMemoryDetailDto,
  AgentMemoryFiltersDto,
  AgentMemoryListDto,
  RecordMemoryInput,
  RetractMemoryInput,
  SupersedeMemoryInput
} from "./agent-types.js";

export interface AgentMemoryPanelProps {
  readonly memoryList: AgentMemoryListDto | undefined;
  readonly memoryDetail?: AgentMemoryDetailDto | undefined;
  readonly loadState: "idle" | "loading" | "loaded" | "error";
  readonly onFilterChange?: ((filters: AgentMemoryFiltersDto) => void) | undefined;
  readonly onSelectMemory?: ((memoryId: string) => void) | undefined;
  readonly onRecordMemory?: ((input: RecordMemoryInput) => void) | undefined;
  readonly onSupersedeMemory?: ((input: SupersedeMemoryInput) => void) | undefined;
  readonly onRetractMemory?: ((input: RetractMemoryInput) => void) | undefined;
}

interface RecordDraftState {
  readonly scope: NonNullable<RecordMemoryInput["scope"]>;
  readonly memoryKind: NonNullable<RecordMemoryInput["memoryKind"]>;
  readonly summary: string;
  readonly sourceEventIds: string;
  readonly artifactHashes: string;
  readonly confidence: string;
  readonly expiresAt: string;
}

interface SupersedeDraftState {
  readonly summary: string;
  readonly rationale: string;
  readonly sourceEventIds: string;
  readonly artifactHashes: string;
}

export function AgentMemoryPanel({
  memoryList,
  memoryDetail,
  loadState,
  onFilterChange,
  onSelectMemory,
  onRecordMemory,
  onSupersedeMemory,
  onRetractMemory
}: AgentMemoryPanelProps) {
  const filters = memoryList?.filters ?? { scope: "all", state: "all" };
  const [recordDraft, setRecordDraft] = useState<RecordDraftState>({
    scope: "workspace",
    memoryKind: "operator-preference",
    summary: "",
    sourceEventIds: "",
    artifactHashes: "",
    confidence: "0.8",
    expiresAt: ""
  });
  const [supersedeDrafts, setSupersedeDrafts] = useState<Record<string, SupersedeDraftState>>({});
  const [supersedeAttempted, setSupersedeAttempted] = useState<Record<string, boolean>>({});
  const [recordAttempted, setRecordAttempted] = useState(false);

  const selectedHistory = memoryDetail?.history ?? [];
  const items = memoryList?.items ?? [];
  const recordSummary = recordDraft.summary.trim();
  const recordSourceEventIds = splitRefs(recordDraft.sourceEventIds);
  const recordArtifactHashes = splitRefs(recordDraft.artifactHashes);
  const recordErrors = {
    summary: recordSummary.length === 0 ? "Enter a memory summary before recording." : undefined,
    provenance:
      recordSourceEventIds.length === 0 && recordArtifactHashes.length === 0
        ? "Add at least one source event ID or artifact hash before recording memory."
        : undefined
  };
  const detailRefs = useMemo(() => {
    if (memoryDetail === undefined) {
      return [];
    }

    return [...new Set([
      ...memoryDetail.memory.sourceEventIds,
      ...memoryDetail.memory.artifactHashes,
      ...memoryDetail.memory.eventIds
    ])];
  }, [memoryDetail]);

  return (
    <section aria-label="Agent working memory" className="@container border border-[var(--console-line)] bg-[var(--console-panel)]">
      <div className="flex min-w-0 flex-col gap-2 border-b border-[var(--console-line)] px-4 py-3 @lg:flex-row @lg:items-start @lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-[var(--paper-light)]">Working memory</h2>
          <p className="mt-1 font-mono text-base text-[var(--muted-amber)] sm:text-sm">
            {memoryList?.truthBoundary.label ?? "working-memory-not-ontology-truth"}
          </p>
        </div>
        <p className="max-w-[42ch] text-base text-pretty text-[var(--muted-amber)] sm:text-sm">
          Visible operator memory only. Any graph effect still needs evidence-backed proposed assertions or reviewed reasoning.
        </p>
      </div>

      <div className="grid gap-3 border-b border-[var(--console-line)] px-4 py-3 @lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <label className="grid gap-1">
          <span className="font-mono text-base text-[var(--muted-amber)] sm:text-sm">Memory scope</span>
          <select
            aria-label="Memory scope"
            name="memory-scope"
            value={filters.scope ?? "all"}
            onChange={(event) =>
              onFilterChange?.({
                ...(filters.state === undefined ? {} : { state: filters.state }),
                scope: event.target.value as NonNullable<AgentMemoryFiltersDto["scope"]>
              })
            }
            className="min-w-0 border border-[var(--console-line)] bg-[var(--console-void)] px-3 py-2 text-base text-[var(--paper-light)] sm:text-sm"
          >
            <option value="all">all scopes</option>
            <option value="workspace">workspace</option>
            <option value="investigation">investigation</option>
            <option value="task">task</option>
            <option value="provider">provider</option>
            <option value="policy">policy</option>
          </select>
        </label>
        <label className="grid gap-1">
          <span className="font-mono text-base text-[var(--muted-amber)] sm:text-sm">Memory state</span>
          <select
            aria-label="Memory state"
            name="memory-state"
            value={filters.state ?? "all"}
            onChange={(event) =>
              onFilterChange?.({
                ...(filters.scope === undefined ? {} : { scope: filters.scope }),
                state: event.target.value as NonNullable<AgentMemoryFiltersDto["state"]>
              })
            }
            className="min-w-0 border border-[var(--console-line)] bg-[var(--console-void)] px-3 py-2 text-base text-[var(--paper-light)] sm:text-sm"
          >
            <option value="all">all states</option>
            <option value="active">active</option>
            <option value="superseded">superseded</option>
            <option value="retracted">retracted</option>
          </select>
        </label>
      </div>

      <div className="grid gap-3 border-b border-[var(--console-line)] px-4 py-3">
        <div className="grid gap-3 @lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <label className="grid gap-1">
            <span className="font-mono text-base text-[var(--muted-amber)] sm:text-sm">New memory summary</span>
            <textarea
              aria-label="New memory summary"
              name="new-memory-summary"
              rows={3}
              value={recordDraft.summary}
              onChange={(event) => setRecordDraft((current) => ({ ...current, summary: event.target.value }))}
              className="min-w-0 border border-[var(--console-line)] bg-[var(--console-void)] px-3 py-2 text-base text-[var(--paper-light)] outline-offset-0 sm:text-sm"
            />
          </label>
          <div className="grid gap-3">
            <label className="grid gap-1">
              <span className="font-mono text-base text-[var(--muted-amber)] sm:text-sm">New memory source event IDs</span>
              <input
                aria-label="New memory source event IDs"
                name="new-memory-source-event-ids"
                value={recordDraft.sourceEventIds}
                onChange={(event) => setRecordDraft((current) => ({ ...current, sourceEventIds: event.target.value }))}
                className="min-w-0 border border-[var(--console-line)] bg-[var(--console-void)] px-3 py-2 text-base text-[var(--paper-light)] sm:text-sm"
              />
            </label>
            <label className="grid gap-1">
              <span className="font-mono text-base text-[var(--muted-amber)] sm:text-sm">New memory artifact hashes</span>
              <input
                aria-label="New memory artifact hashes"
                name="new-memory-artifact-hashes"
                value={recordDraft.artifactHashes}
                onChange={(event) => setRecordDraft((current) => ({ ...current, artifactHashes: event.target.value }))}
                className="min-w-0 border border-[var(--console-line)] bg-[var(--console-void)] px-3 py-2 text-base text-[var(--paper-light)] sm:text-sm"
              />
            </label>
          </div>
        </div>
        {recordAttempted && (recordErrors.summary !== undefined || recordErrors.provenance !== undefined) ? (
          <div className="grid gap-1">
            {recordErrors.summary === undefined ? null : (
              <p className="text-base text-[var(--signal-red)] sm:text-sm">{recordErrors.summary}</p>
            )}
            {recordErrors.provenance === undefined ? null : (
              <p className="text-base text-[var(--signal-red)] sm:text-sm">{recordErrors.provenance}</p>
            )}
          </div>
        ) : null}
        <div className="grid gap-3 @lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <label className="grid gap-1">
            <span className="font-mono text-base text-[var(--muted-amber)] sm:text-sm">Memory kind</span>
            <select
              aria-label="Memory kind"
              name="memory-kind"
              value={recordDraft.memoryKind}
              onChange={(event) =>
                setRecordDraft((current) => ({
                  ...current,
                  memoryKind: event.target.value as NonNullable<RecordMemoryInput["memoryKind"]>
                }))
              }
              className="min-w-0 border border-[var(--console-line)] bg-[var(--console-void)] px-3 py-2 text-base text-[var(--paper-light)] sm:text-sm"
            >
              <option value="operator-preference">operator-preference</option>
              <option value="agent-observation">agent-observation</option>
              <option value="policy-caveat">policy-caveat</option>
              <option value="provider-note">provider-note</option>
            </select>
          </label>
          <label className="grid gap-1">
            <span className="font-mono text-base text-[var(--muted-amber)] sm:text-sm">Confidence</span>
            <input
              aria-label="Memory confidence"
              name="memory-confidence"
              value={recordDraft.confidence}
              onChange={(event) => setRecordDraft((current) => ({ ...current, confidence: event.target.value }))}
              className="min-w-0 border border-[var(--console-line)] bg-[var(--console-void)] px-3 py-2 text-base text-[var(--paper-light)] sm:text-sm"
            />
          </label>
          <label className="grid gap-1">
            <span className="font-mono text-base text-[var(--muted-amber)] sm:text-sm">Expires at</span>
            <input
              aria-label="Memory expiry"
              name="memory-expiry"
              value={recordDraft.expiresAt}
              onChange={(event) => setRecordDraft((current) => ({ ...current, expiresAt: event.target.value }))}
              className="min-w-0 border border-[var(--console-line)] bg-[var(--console-void)] px-3 py-2 text-base text-[var(--paper-light)] sm:text-sm"
            />
          </label>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => {
                setRecordAttempted(true);
                if (recordErrors.summary !== undefined || recordErrors.provenance !== undefined) {
                  return;
                }

                const memoryId = nextMemoryId(recordSummary);
                onRecordMemory?.({
                  memoryId,
                  scope: recordDraft.scope,
                  memoryKind: recordDraft.memoryKind,
                  summary: recordSummary,
                  sourceEventIds: recordSourceEventIds,
                  artifactHashes: recordArtifactHashes,
                  confidence: parseConfidence(recordDraft.confidence),
                  ...(recordDraft.expiresAt.length === 0 ? {} : { expiresAt: recordDraft.expiresAt })
                });
                setRecordAttempted(false);
              }}
              className="relative min-h-10 border border-[var(--console-line)] px-3 py-2 font-mono text-base text-[var(--signal-amber)] sm:min-h-9 sm:text-sm"
            >
              <span
                aria-hidden="true"
                className="pointer-fine:hidden absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2"
              />
              Record memory
            </button>
          </div>
        </div>
      </div>

      {loadState === "loading" && items.length === 0 ? (
        <p className="px-4 py-3 text-base text-[var(--muted-amber)] sm:text-sm">Loading working memory.</p>
      ) : items.length === 0 ? (
        <p className="px-4 py-3 text-base text-[var(--muted-amber)] sm:text-sm">No working memory matches the current filters.</p>
      ) : (
        <div className="grid @xl:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
          <ul role="list" className="divide-y divide-[var(--console-line)]">
            {items.map((memory) => {
              const supersedeDraft = supersedeDrafts[memory.memoryId] ?? {
                summary: "",
                rationale: "",
                sourceEventIds: "",
                artifactHashes: ""
              };
              const replacementSourceEventIds = splitRefs(supersedeDraft.sourceEventIds);
              const replacementArtifactHashes = splitRefs(supersedeDraft.artifactHashes);
              const supersedeErrors = {
                summary: supersedeDraft.summary.trim().length === 0 ? "Enter a replacement summary before superseding memory." : undefined,
                rationale:
                  supersedeDraft.rationale.trim().length === 0 ? "Enter a replacement rationale before superseding memory." : undefined,
                provenance:
                  replacementSourceEventIds.length === 0 && replacementArtifactHashes.length === 0
                    ? "Add replacement source event IDs or artifact hashes before superseding memory."
                    : undefined
              };
              const showCorrectionControls = memory.state === "active";
              return (
                <li key={memory.memoryId} className="grid gap-3 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onSelectMemory?.(memory.memoryId)}
                    className="min-w-0 text-left"
                  >
                    <p className="font-mono text-base text-[var(--signal-cyan)] sm:text-sm">
                      {memory.scope} | {memory.memoryKind}
                    </p>
                    <p className="mt-1 text-base text-pretty text-[var(--paper-light)] sm:text-sm">{memory.summary}</p>
                  </button>
                  <dl className="grid gap-2 @lg:grid-cols-3">
                    <InlineStat label="State" value={memory.state} />
                    <InlineStat label="Confidence" value={memory.confidence.toFixed(1)} />
                    <InlineStat label="Expiry" value={memory.expiresAt ?? "not set"} />
                  </dl>
                  <RefGroup refs={[...memory.sourceEventIds, ...memory.artifactHashes, ...memory.eventIds]} />
                  {!showCorrectionControls ? null : (
                    <div className="grid gap-3 border-t border-[var(--console-line)] pt-3 @lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
                    <label className="grid gap-1">
                      <span className="font-mono text-base text-[var(--muted-amber)] sm:text-sm">Superseding summary</span>
                      <input
                        aria-label={`Superseding summary ${memory.memoryId}`}
                        name={`superseding-summary-${memory.memoryId}`}
                        value={supersedeDraft.summary}
                        onChange={(event) =>
                          setSupersedeDrafts((current) => ({
                            ...current,
                            [memory.memoryId]: {
                              ...supersedeDraft,
                              summary: event.target.value
                            }
                          }))
                        }
                        className="min-w-0 border border-[var(--console-line)] bg-[var(--console-void)] px-3 py-2 text-base text-[var(--paper-light)] sm:text-sm"
                      />
                    </label>
                    <label className="grid gap-1">
                      <span className="font-mono text-base text-[var(--muted-amber)] sm:text-sm">Superseding rationale</span>
                      <input
                        aria-label={`Superseding rationale ${memory.memoryId}`}
                        name={`superseding-rationale-${memory.memoryId}`}
                        value={supersedeDraft.rationale}
                        onChange={(event) =>
                          setSupersedeDrafts((current) => ({
                            ...current,
                            [memory.memoryId]: {
                              ...supersedeDraft,
                              rationale: event.target.value
                            }
                          }))
                        }
                        className="min-w-0 border border-[var(--console-line)] bg-[var(--console-void)] px-3 py-2 text-base text-[var(--paper-light)] sm:text-sm"
                      />
                    </label>
                    <label className="grid gap-1">
                      <span className="font-mono text-base text-[var(--muted-amber)] sm:text-sm">Superseding source event IDs</span>
                      <input
                        aria-label={`Superseding source event IDs ${memory.memoryId}`}
                        name={`superseding-source-event-ids-${memory.memoryId}`}
                        value={supersedeDraft.sourceEventIds}
                        onChange={(event) =>
                          setSupersedeDrafts((current) => ({
                            ...current,
                            [memory.memoryId]: {
                              ...supersedeDraft,
                              sourceEventIds: event.target.value
                            }
                          }))
                        }
                        className="min-w-0 border border-[var(--console-line)] bg-[var(--console-void)] px-3 py-2 text-base text-[var(--paper-light)] sm:text-sm"
                      />
                    </label>
                    <label className="grid gap-1">
                      <span className="font-mono text-base text-[var(--muted-amber)] sm:text-sm">Superseding artifact hashes</span>
                      <input
                        aria-label={`Superseding artifact hashes ${memory.memoryId}`}
                        name={`superseding-artifact-hashes-${memory.memoryId}`}
                        value={supersedeDraft.artifactHashes}
                        onChange={(event) =>
                          setSupersedeDrafts((current) => ({
                            ...current,
                            [memory.memoryId]: {
                              ...supersedeDraft,
                              artifactHashes: event.target.value
                            }
                          }))
                        }
                        className="min-w-0 border border-[var(--console-line)] bg-[var(--console-void)] px-3 py-2 text-base text-[var(--paper-light)] sm:text-sm"
                      />
                    </label>
                    </div>
                  )}
                  {!showCorrectionControls ? null : (
                    <div className="grid gap-3 @lg:grid-cols-[minmax(0,1fr)_auto_auto]">
                      <div className="grid gap-2">
                        <p className="font-mono text-base text-[var(--muted-amber)] sm:text-sm">Current provenance refs</p>
                        <RefGroup refs={[...memory.sourceEventIds, ...memory.artifactHashes]} />
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setSupersedeDrafts((current) => ({
                                ...current,
                                [memory.memoryId]: {
                                  ...supersedeDraft,
                                  sourceEventIds: memory.sourceEventIds.join(", "),
                                  artifactHashes: memory.artifactHashes.join(", ")
                                }
                              }))
                            }
                            className="relative min-h-10 border border-[var(--console-line)] px-3 py-2 font-mono text-base text-[var(--signal-cyan)] sm:min-h-9 sm:text-sm"
                          >
                            Reuse current refs
                          </button>
                        </div>
                        {supersedeAttempted[memory.memoryId] === true &&
                        (supersedeErrors.summary !== undefined ||
                          supersedeErrors.rationale !== undefined ||
                          supersedeErrors.provenance !== undefined) ? (
                            <div className="grid gap-1">
                              {supersedeErrors.summary === undefined ? null : (
                                <p className="text-base text-[var(--signal-red)] sm:text-sm">{supersedeErrors.summary}</p>
                              )}
                              {supersedeErrors.rationale === undefined ? null : (
                                <p className="text-base text-[var(--signal-red)] sm:text-sm">{supersedeErrors.rationale}</p>
                              )}
                              {supersedeErrors.provenance === undefined ? null : (
                                <p className="text-base text-[var(--signal-red)] sm:text-sm">{supersedeErrors.provenance}</p>
                              )}
                            </div>
                          ) : null}
                      </div>
                    <div className="flex items-end">
                      <button
                        type="button"
                        aria-label={`Supersede memory ${memory.memoryId}`}
                        onClick={() => {
                          setSupersedeAttempted((current) => ({ ...current, [memory.memoryId]: true }));
                          if (
                            supersedeErrors.summary !== undefined ||
                            supersedeErrors.rationale !== undefined ||
                            supersedeErrors.provenance !== undefined
                          ) {
                            return;
                          }

                          onSupersedeMemory?.({
                            memoryId: memory.memoryId,
                            supersededByMemoryId: nextSupersedingMemoryId(memory.memoryId),
                            scope: memory.scope,
                            memoryKind: memory.memoryKind,
                            summary: supersedeDraft.summary.trim(),
                            sourceEventIds: replacementSourceEventIds,
                            artifactHashes: replacementArtifactHashes,
                            confidence: memory.confidence,
                            ...(memory.expiresAt === undefined ? {} : { expiresAt: memory.expiresAt }),
                            rationale: supersedeDraft.rationale.trim()
                          });
                        }}
                        className="relative min-h-10 border border-[var(--console-line)] px-3 py-2 font-mono text-base text-[var(--signal-amber)] sm:min-h-9 sm:text-sm"
                      >
                        <span
                          aria-hidden="true"
                          className="pointer-fine:hidden absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2"
                        />
                        Supersede memory
                      </button>
                    </div>
                    <div className="flex items-end">
                      <button
                        type="button"
                        aria-label={`Retract memory ${memory.memoryId}`}
                        onClick={() => onRetractMemory?.({ memoryId: memory.memoryId, rationale: "No longer useful." })}
                        className="relative min-h-10 border border-[var(--console-line)] px-3 py-2 font-mono text-base text-[var(--signal-amber)] sm:min-h-9 sm:text-sm"
                      >
                        <span
                          aria-hidden="true"
                          className="pointer-fine:hidden absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2"
                        />
                        Retract memory
                      </button>
                    </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="border-t border-[var(--console-line)] px-4 py-3 @xl:border-l @xl:border-t-0">
            <h3 className="text-base font-semibold text-[var(--paper-light)]">Inspectable detail</h3>
            {memoryDetail === undefined ? (
              <p className="mt-2 text-base text-pretty text-[var(--muted-amber)] sm:text-sm">
                Select a memory row to inspect its recorded history and provenance refs.
              </p>
            ) : (
              <div className="mt-3 grid gap-3">
                <p className="font-mono text-base text-[var(--signal-cyan)] sm:text-sm">{memoryDetail.memory.memoryId}</p>
                <p className="text-base text-pretty text-[var(--paper-light)] sm:text-sm">{memoryDetail.memory.summary}</p>
                <dl className="grid gap-2">
                  <InlineStat label="History entries" value={String(selectedHistory.length)} />
                  <InlineStat label="Recorded by" value={memoryDetail.memory.recordedByKind} />
                </dl>
                <RefGroup refs={detailRefs} />
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function InlineStat({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-base text-[var(--muted-amber)] sm:text-sm">{label}</dt>
      <dd className="mt-1 break-words text-base text-[var(--paper-light)] sm:text-sm">{value}</dd>
    </div>
  );
}

function RefGroup({ refs }: { readonly refs: readonly string[] }) {
  const visibleRefs = [...new Set(refs)].filter((ref) => ref.length > 0);
  if (visibleRefs.length === 0) {
    return null;
  }

  return (
    <div className="min-w-0 space-y-1">
      {visibleRefs.map((ref) => (
        <p key={ref} className="break-all font-mono text-base text-[var(--signal-cyan)] sm:text-sm">{ref}</p>
      ))}
    </div>
  );
}

function splitRefs(value: string): readonly string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parseConfidence(value: string): number {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return 0.8;
  }
  return Math.max(0, Math.min(1, parsed));
}

function nextMemoryId(summary: string): string {
  const slug = summary
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
  return `mem_${slug.length > 0 ? slug : "working_memory"}_${randomToken()}`;
}

function nextSupersedingMemoryId(memoryId: string): string {
  return `${memoryId}_sup_${randomToken()}`;
}

function randomToken(): string {
  const token = globalThis.crypto?.randomUUID?.();
  if (typeof token === "string") {
    return token.replace(/-/g, "").slice(0, 12);
  }

  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
