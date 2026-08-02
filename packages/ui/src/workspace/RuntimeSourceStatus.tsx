import type { CommandRuntimeSourceStatus as RuntimeSource } from "./command-types.js";

const stateClasses: Record<RuntimeSource["state"], string> = {
  loading: "border-[var(--console-line)] text-[var(--muted-amber)]",
  ready: "border-[var(--signal-green)] text-[var(--signal-green)]",
  degraded: "border-[var(--signal-amber)] text-[var(--signal-amber)]",
  unavailable: "border-[var(--signal-red)] text-[var(--signal-red)]"
};

export function RuntimeSourceStatus({
  sources,
  onNavigate
}: {
  readonly sources: readonly RuntimeSource[];
  readonly onNavigate: (moduleId: string) => void;
}) {
  if (sources.length === 0) {
    return null;
  }

  return (
    <section aria-label="Command runtime source status" className="border-y border-[var(--console-line)] py-3">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-lg font-semibold text-balance text-[var(--paper-light)]">Runtime sources</h2>
        <p className="font-mono text-base text-[var(--muted-amber)] sm:text-sm">Verified DTOs only</p>
      </div>
      <ul role="list" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {sources.map((source) => (
          <li key={source.sourceId} className="border border-[var(--console-line)] bg-[var(--console-void)]/72 p-3">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <h3 className="text-base font-semibold text-[var(--paper-light)] sm:text-sm">{source.label}</h3>
              <span className={`shrink-0 border px-2 py-1 font-mono text-base sm:text-sm ${stateClasses[source.state]}`}>
                {formatState(source.state)}
              </span>
            </div>
            <p className="mt-2 text-base text-pretty text-[var(--muted-amber)] sm:text-sm">{source.summary}</p>
            {source.runtimeTimestamp === undefined ? null : (
              <p className="mt-2 font-mono text-base text-[var(--signal-cyan)] sm:text-sm">
                Snapshot {source.runtimeTimestamp}
              </p>
            )}
            <button
              type="button"
              disabled={source.state === "loading" || source.actionTarget === undefined}
              onClick={() => {
                if (source.actionTarget !== undefined) {
                  onNavigate(source.actionTarget);
                }
              }}
              className="relative mt-3 min-h-10 border border-[var(--console-line)] px-3 py-2 text-base text-[var(--signal-amber)] enabled:hover:border-[var(--signal-amber)] enabled:hover:bg-[var(--console-panel)] enabled:hover:text-[var(--paper-light)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--signal-cyan)] disabled:cursor-not-allowed disabled:text-[var(--muted-amber)] sm:text-sm"
            >
              <span
                aria-hidden="true"
                className="pointer-fine:hidden absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2"
              />
              {source.actionLabel}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function formatState(state: RuntimeSource["state"]): string {
  return state.replace(/(^|-)(\w)/g, (_match, _separator: string, letter: string) => letter.toUpperCase());
}
