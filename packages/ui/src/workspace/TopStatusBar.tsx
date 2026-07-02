import { Bars3Icon, MagnifyingGlassIcon, PlusIcon } from "@heroicons/react/16/solid";

interface TopStatusBarProps {
  readonly workspaceName: string;
  readonly syncLabel: string;
  readonly onNewRequest: () => void;
  readonly onOpenMenu: () => void;
}

export function TopStatusBar({ workspaceName, syncLabel, onNewRequest, onOpenMenu }: TopStatusBarProps) {
  return (
    <header className="border-b border-white/10 p-4 lg:px-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <button
            type="button"
            aria-label="Open module menu"
            onClick={onOpenMenu}
            className="relative flex min-h-9 items-center border border-white/10 px-2 py-2 lg:hidden"
          >
            <span
              aria-hidden="true"
              className="pointer-fine:hidden absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2"
            />
            <Bars3Icon aria-hidden="true" className="size-4 shrink-0 fill-[var(--cestus-text)]" />
          </button>
          <div className="min-w-0">
            <p className="font-mono text-base text-[var(--cestus-muted)] sm:text-sm">{workspaceName}</p>
            <p className="mt-1 text-base text-[var(--cestus-green)] sm:text-sm">{syncLabel}</p>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-3 md:flex-1 md:flex-row md:items-center md:justify-end">
          <label className="relative flex min-w-0 md:max-w-xl md:flex-1">
            <span className="sr-only">Search command workspace</span>
            <MagnifyingGlassIcon
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 shrink-0 fill-[var(--cestus-muted)]"
            />
            <input
              type="search"
              name="command-search"
              aria-label="Search command workspace"
              placeholder="Search records, requests, evidence"
              className="min-h-10 w-full border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-base text-[var(--cestus-text)] outline-none focus-visible:-outline-offset-1 focus-visible:outline-2 focus-visible:outline-[var(--cestus-cyan)] sm:min-h-9 sm:text-sm"
            />
          </label>
          <button
            type="button"
            onClick={onNewRequest}
            className="relative flex min-h-10 items-center justify-center gap-2 border border-[var(--cestus-amber)] bg-[var(--cestus-amber)] py-2 pl-2 pr-3 text-base font-semibold text-[#120d05] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cestus-cyan)] sm:min-h-9 sm:text-sm"
          >
            <span
              aria-hidden="true"
              className="pointer-fine:hidden absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2"
            />
            <PlusIcon aria-hidden="true" className="size-4 shrink-0 fill-[#120d05]" />
            New request
          </button>
        </div>
      </div>
    </header>
  );
}
