import type { AgentBrief, CommandQueueItem, DecisionVote } from "./command-types.js";

interface DecisionRailProps {
  readonly agentBrief: AgentBrief;
  readonly defaultVotes: readonly DecisionVote[];
  readonly selectedItem: CommandQueueItem | undefined;
  readonly onClearSelection: () => void;
  readonly onNavigate?: ((moduleId: string) => void) | undefined;
}

const voteToneClasses: Record<DecisionVote["tone"], string> = {
  amber: "border-[var(--signal-amber)] text-[var(--signal-amber)]",
  red: "border-[var(--signal-red)] text-[var(--signal-red)]",
  green: "border-[var(--signal-green)] text-[var(--signal-green)]",
  cyan: "border-[var(--signal-cyan)] text-[var(--signal-cyan)]",
  neutral: "border-[var(--console-line)] text-[var(--muted-amber)]"
};

export function DecisionRail({
  agentBrief,
  defaultVotes,
  selectedItem,
  onClearSelection,
  onNavigate = () => undefined
}: DecisionRailProps) {
  return (
    <aside aria-label="Decision rail" className="h-full p-4 lg:p-5">
      {selectedItem === undefined ? (
        <AgentBriefView agentBrief={agentBrief} votes={defaultVotes} />
      ) : (
        <SelectedItemDetail selectedItem={selectedItem} onClearSelection={onClearSelection} onNavigate={onNavigate} />
      )}
    </aside>
  );
}

function AgentBriefView({
  agentBrief,
  votes
}: {
  readonly agentBrief: AgentBrief;
  readonly votes: readonly DecisionVote[];
}) {
  return (
    <div>
      <p className="font-mono text-base text-[var(--signal-red)] sm:text-sm">Advisory model</p>
      <h2 className="mt-2 text-lg font-semibold text-balance text-[var(--paper-light)]">Agent brief</h2>
      <DecisionVotes votes={votes} />
      <RailList title="What Cestus is watching" items={agentBrief.watching} />
      <RailList title="Changed since review" items={agentBrief.changedSinceReview} />
      <RailList title="Uncertain" items={agentBrief.uncertain} />
      <RailList title="Recommended next actions" items={agentBrief.recommendedActions} />
    </div>
  );
}

function SelectedItemDetail({
  selectedItem,
  onClearSelection,
  onNavigate
}: {
  readonly selectedItem: CommandQueueItem;
  readonly onClearSelection: () => void;
  readonly onNavigate: (moduleId: string) => void;
}) {
  return (
    <div>
      <button type="button" onClick={onClearSelection} className="relative min-h-9 text-base text-[var(--signal-cyan)] sm:text-sm">
        <span
          aria-hidden="true"
          className="pointer-fine:hidden absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2"
        />
        Back to agent brief
      </button>
      <p className="mt-4 font-mono text-base text-[var(--signal-amber)] sm:text-sm">{selectedItem.kind}</p>
      <h2 className="mt-2 text-lg font-semibold text-balance text-[var(--paper-light)]">{selectedItem.title}</h2>
      <DecisionVotes votes={selectedItem.detail.decisionVotes} />
      <dl className="mt-5 space-y-4">
        <div>
          <dt className="text-base font-medium text-[var(--paper-light)] sm:text-sm">State</dt>
          <dd className="mt-1 text-base text-[var(--muted-amber)] sm:text-sm">{selectedItem.state}</dd>
        </div>
        <div>
          <dt className="text-base font-medium text-[var(--paper-light)] sm:text-sm">Source</dt>
          <dd className="mt-1 text-base text-[var(--muted-amber)] sm:text-sm">
            {selectedItem.sourceLabel} / {selectedItem.context}
          </dd>
        </div>
        <div>
          <dt className="text-base font-medium text-[var(--paper-light)] sm:text-sm">Source timestamp</dt>
          <dd className="mt-1 font-mono text-base text-[var(--signal-cyan)] sm:text-sm">
            {selectedItem.detail.runtimeTimestamp ?? "Unavailable from source DTO"}
          </dd>
        </div>
        {selectedItem.detail.confidence === undefined ? null : (
          <div>
            <dt className="text-base font-medium text-[var(--paper-light)] sm:text-sm">Confidence</dt>
            <dd className="mt-1 text-base text-[var(--muted-amber)] sm:text-sm">
              {Math.round(selectedItem.detail.confidence * 100)}%
            </dd>
          </div>
        )}
        <div>
          <dt className="text-base font-medium text-[var(--paper-light)] sm:text-sm">Basis</dt>
          <dd className="mt-1 text-base text-[var(--muted-amber)] sm:text-sm">{selectedItem.detail.basis}</dd>
        </div>
        <div>
          <dt className="text-base font-medium text-[var(--paper-light)] sm:text-sm">Uncertainty</dt>
          <dd className="mt-1 text-base text-[var(--muted-amber)] sm:text-sm">{selectedItem.detail.uncertainty}</dd>
        </div>
        <div>
          <dt className="text-base font-medium text-[var(--paper-light)] sm:text-sm">Supported next action</dt>
          <dd className="mt-1 text-base text-[var(--muted-amber)] sm:text-sm">
            {selectedItem.detail.recommendedAction}
          </dd>
          {selectedItem.actionTarget === undefined ? null : (
            <button
              type="button"
              onClick={() => onNavigate(selectedItem.actionTarget ?? "command")}
              className="relative mt-3 min-h-10 border border-[var(--console-line)] px-3 py-2 text-base text-[var(--signal-amber)] hover:border-[var(--signal-amber)] hover:bg-[var(--console-panel)] hover:text-[var(--paper-light)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--signal-cyan)] sm:text-sm"
            >
              <span
                aria-hidden="true"
                className="pointer-fine:hidden absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2"
              />
              {selectedItem.actionLabel}
            </button>
          )}
        </div>
        <div>
          <dt className="text-base font-medium text-[var(--paper-light)] sm:text-sm">Provenance</dt>
          <dd className="mt-1 space-y-1 font-mono text-base text-[var(--signal-cyan)] sm:text-sm">
            {selectedItem.detail.provenanceRefs.map((ref) => (
              <div key={ref}>{ref}</div>
            ))}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function DecisionVotes({ votes }: { readonly votes: readonly DecisionVote[] }) {
  return (
    <section className="mt-5" aria-label="Decision votes">
      <ul role="list" className="space-y-3">
        {votes.map((vote) => (
          <li key={vote.id} className="border border-[var(--console-line)] bg-[var(--console-void)]/72 p-3">
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <h3 className="text-base font-semibold text-balance text-[var(--paper-light)] sm:text-sm">{vote.label}</h3>
              <div
                className={`shrink-0 border px-2 py-1 font-mono text-base sm:text-sm ${voteToneClasses[vote.tone]}`}
              >
                {formatVoteState(vote.state)}
              </div>
            </div>
            <p className="mt-2 text-base text-pretty text-[var(--muted-amber)] sm:text-sm">{vote.summary}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RailList({ title, items }: { readonly title: string; readonly items: readonly string[] }) {
  return (
    <section className="mt-5">
      <h3 className="text-base font-semibold text-balance text-[var(--paper-light)] sm:text-sm">{title}</h3>
      <ul role="list" className="mt-2 space-y-2">
        {items.map((item, index) => (
          <li
            key={`${title}:${index}:${item}`}
            className="border-l border-[var(--console-line)] pl-3 text-base text-pretty text-[var(--muted-amber)] sm:text-sm"
          >
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

function formatVoteState(state: DecisionVote["state"]): string {
  return state.replaceAll("-", " ").replace(/^\w/, (letter) => letter.toUpperCase());
}
