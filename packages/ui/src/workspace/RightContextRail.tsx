import type { AgentBrief, CommandQueueItem } from "./command-types.js";

interface RightContextRailProps {
  readonly agentBrief: AgentBrief;
  readonly selectedItem: CommandQueueItem | undefined;
  readonly onClearSelection: () => void;
}

export function RightContextRail({ agentBrief, selectedItem, onClearSelection }: RightContextRailProps) {
  return (
    <aside aria-label="Context rail" className="h-full p-4 lg:p-5">
      <div data-uidotsh-pick="Right rail treatment" className="contents">
        <div data-uidotsh-option="Agent brief dominant (current)" className="contents">
          {selectedItem === undefined ? (
            <AgentBriefView agentBrief={agentBrief} />
          ) : (
            <SelectedItemDetail selectedItem={selectedItem} onClearSelection={onClearSelection} />
          )}
        </div>
        <div data-uidotsh-option="Detail dominant" className="contents" hidden>
          {selectedItem === undefined ? (
            <AgentBriefView agentBrief={agentBrief} compact />
          ) : (
            <SelectedItemDetail selectedItem={selectedItem} onClearSelection={onClearSelection} expanded />
          )}
        </div>
        <div data-uidotsh-option="Split brief/detail stack" className="contents" hidden>
          <AgentBriefView agentBrief={agentBrief} compact />
          {selectedItem === undefined ? null : (
            <div className="mt-6 border-t border-white/10 pt-5">
              <SelectedItemDetail selectedItem={selectedItem} onClearSelection={onClearSelection} />
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

function AgentBriefView({ agentBrief, compact = false }: { readonly agentBrief: AgentBrief; readonly compact?: boolean }) {
  return (
    <div>
      <p className="font-mono text-base text-[var(--cestus-cyan)] sm:text-sm">Watch</p>
      <h2 className="mt-2 text-lg font-semibold text-balance">Agent brief</h2>
      <RailList title="What Cestus is watching" items={agentBrief.watching} />
      {compact ? null : <RailList title="Changed since review" items={agentBrief.changedSinceReview} />}
      {compact ? null : <RailList title="Uncertain" items={agentBrief.uncertain} />}
      <RailList title="Recommended next actions" items={agentBrief.recommendedActions} />
    </div>
  );
}

function SelectedItemDetail({
  selectedItem,
  onClearSelection
}: {
  readonly selectedItem: CommandQueueItem;
  readonly onClearSelection: () => void;
  readonly expanded?: boolean;
}) {
  return (
    <div>
      <button type="button" onClick={onClearSelection} className="relative min-h-9 text-base text-[var(--cestus-cyan)] sm:text-sm">
        <span
          aria-hidden="true"
          className="pointer-fine:hidden absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2"
        />
        Back to agent brief
      </button>
      <p className="mt-4 font-mono text-base text-[var(--cestus-amber)] sm:text-sm">{selectedItem.kind}</p>
      <h2 className="mt-2 text-lg font-semibold text-balance">{selectedItem.title}</h2>
      <dl className="mt-5 space-y-4">
        <div>
          <dt className="text-base font-medium text-[var(--cestus-text)] sm:text-sm">State</dt>
          <dd className="mt-1 text-base text-[var(--cestus-muted-soft)] sm:text-sm">{selectedItem.state}</dd>
        </div>
        <div>
          <dt className="text-base font-medium text-[var(--cestus-text)] sm:text-sm">Basis</dt>
          <dd className="mt-1 text-base text-[var(--cestus-muted-soft)] sm:text-sm">{selectedItem.detail.basis}</dd>
        </div>
        <div>
          <dt className="text-base font-medium text-[var(--cestus-text)] sm:text-sm">Recommended action</dt>
          <dd className="mt-1 text-base text-[var(--cestus-muted-soft)] sm:text-sm">{selectedItem.actionLabel}</dd>
        </div>
        <div>
          <dt className="text-base font-medium text-[var(--cestus-text)] sm:text-sm">Provenance</dt>
          <dd className="mt-1 space-y-1 font-mono text-base text-[var(--cestus-cyan)] sm:text-sm">
            {selectedItem.detail.provenanceRefs.map((ref) => (
              <div key={ref}>{ref}</div>
            ))}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function RailList({ title, items }: { readonly title: string; readonly items: readonly string[] }) {
  return (
    <section className="mt-5">
      <h3 className="text-base font-semibold text-balance text-[var(--cestus-text)] sm:text-sm">{title}</h3>
      <ul role="list" className="mt-2 space-y-2">
        {items.map((item, index) => (
          <li
            key={`${title}:${index}:${item}`}
            className="border-l border-white/10 pl-3 text-base text-pretty text-[var(--cestus-muted-soft)] sm:text-sm"
          >
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
