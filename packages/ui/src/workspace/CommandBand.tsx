import { Bars3Icon, PlusIcon } from "@heroicons/react/16/solid";

interface CommandBandProps {
  readonly workspaceName: string;
  readonly modeLabel: string;
  readonly onOpenMenu: () => void;
  readonly onNewRequest?: (() => void) | undefined;
}

export function CommandBand({
  workspaceName,
  modeLabel,
  onOpenMenu,
  onNewRequest
}: CommandBandProps) {
  return (
    <header
      aria-label="Cestus command band"
      className="border-b border-[var(--console-line-strong)] bg-[var(--console-void)]"
    >
      <div className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:px-5">
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
        <div className="flex min-w-0 flex-wrap items-center gap-2 lg:justify-end">
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
