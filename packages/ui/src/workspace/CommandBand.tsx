import { Bars3Icon, PlusIcon } from "@heroicons/react/16/solid";

interface CommandBandProps {
  readonly workspaceName: string;
  readonly modeLabel: string;
  readonly ledgerLabel: string;
  readonly syncLabel: string;
  readonly deploymentLabel: string;
  readonly searchLabel?: string | undefined;
  readonly searchPlaceholder?: string | undefined;
  readonly onOpenMenu: () => void;
  readonly onNewRequest?: (() => void) | undefined;
}

export function CommandBand({
  workspaceName,
  modeLabel,
  ledgerLabel,
  syncLabel,
  deploymentLabel,
  searchLabel = "Command search",
  searchPlaceholder = "Search requests, evidence, agencies, and assertions",
  onOpenMenu,
  onNewRequest
}: CommandBandProps) {
  const signals = [
    { label: "Ledger", value: ledgerLabel, className: "text-[var(--signal-green)]" },
    { label: "Sync", value: syncLabel, className: "text-[var(--signal-cyan)]" },
    { label: "Node", value: deploymentLabel, className: "text-[var(--signal-amber)]" }
  ];

  return (
    <header
      aria-label="Cestus command band"
      className="border-b border-[var(--console-line-strong)] bg-[var(--console-void)]"
    >
      <div className="grid gap-3 px-4 py-3 lg:grid-cols-[auto_minmax(16rem,1fr)_auto] lg:items-center lg:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            aria-label="Open module menu"
            onClick={onOpenMenu}
            className="relative flex min-h-10 items-center border border-[var(--console-line)] px-2 py-2 text-base sm:min-h-9 sm:text-sm lg:hidden"
          >
            <span
              aria-hidden="true"
              className="pointer-fine:hidden absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2"
            />
            <Bars3Icon aria-hidden="true" className="size-4 shrink-0 fill-[var(--paper-light)]" />
          </button>
          <a href="/" aria-label="Cestus home" className="shrink-0 font-mono text-base text-[var(--signal-red)] sm:text-sm">
            CESTUS
          </a>
          <div className="min-w-0 border-l border-[var(--console-line)] pl-3">
            <p className="truncate font-mono text-base text-[var(--signal-amber)] sm:text-sm">{modeLabel.toUpperCase()}</p>
            <p className="truncate text-base text-[var(--paper-light)] sm:text-sm">{workspaceName}</p>
          </div>
        </div>
        <label className="min-w-0">
          <span className="sr-only">{searchLabel}</span>
          <input
            name="command-search"
            type="search"
            aria-label={searchLabel}
            placeholder={searchPlaceholder}
            className="min-h-11 w-full border border-[var(--console-line)] bg-[var(--command-black)] px-3 py-2 font-mono text-base text-[var(--paper-light)] outline-none placeholder:text-[var(--muted-amber)] focus-visible:-outline-offset-1 focus-visible:outline-2 focus-visible:outline-[var(--signal-cyan)] sm:min-h-9 sm:text-sm"
          />
        </label>
        <div className="flex min-w-0 flex-wrap items-center gap-2 lg:justify-end">
          {signals.map((signal) => (
            <div key={signal.label} className="border border-[var(--console-line)] px-2 py-1 font-mono text-base sm:text-sm">
              <span className="text-[var(--muted-amber)]">{signal.label}: </span>
              <span className={signal.className}>{signal.value}</span>
            </div>
          ))}
          {onNewRequest === undefined ? null : (
            <button
              type="button"
              onClick={onNewRequest}
              className="relative flex min-h-10 items-center gap-2 border border-[var(--signal-orange)] bg-[var(--signal-orange)] py-2 pl-2 pr-3 text-base font-semibold text-[var(--console-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--signal-cyan)] sm:min-h-9 sm:text-sm"
            >
              <span
                aria-hidden="true"
                className="pointer-fine:hidden absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2"
              />
              <PlusIcon aria-hidden="true" className="size-4 shrink-0 fill-[var(--console-ink)]" />
              New request
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
