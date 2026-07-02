import { XMarkIcon } from "@heroicons/react/16/solid";
import { useState, type ReactNode } from "react";
import { LeftRail, ModuleLink } from "./LeftRail.js";
import { TopStatusBar } from "./TopStatusBar.js";
import type { WorkspaceModule } from "./workspace-nav.js";

interface OpsShellProps {
  readonly modules: readonly WorkspaceModule[];
  readonly activeModuleId: string;
  readonly workspaceName: string;
  readonly syncLabel: string;
  readonly onNewRequest: () => void;
  readonly main: ReactNode;
  readonly contextRail: ReactNode;
}

export function OpsShell({
  modules,
  activeModuleId,
  workspaceName,
  syncLabel,
  onNewRequest,
  main,
  contextRail
}: OpsShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="isolate min-h-dvh bg-[var(--cestus-bg)] text-[var(--cestus-text)] antialiased">
      <div className="grid min-h-dvh lg:grid-cols-[14rem_minmax(0,1fr)_22rem]">
        <LeftRail modules={modules} activeModuleId={activeModuleId} />
        <div className="min-w-0">
          <TopStatusBar
            workspaceName={workspaceName}
            syncLabel={syncLabel}
            onNewRequest={onNewRequest}
            onOpenMenu={() => setMobileMenuOpen(true)}
          />
          <main id="command" className="min-w-0 p-4 lg:px-5">
            {main}
          </main>
        </div>
        <div className="border-t border-white/10 lg:border-l lg:border-t-0">{contextRail}</div>
      </div>
      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-50 bg-[var(--cestus-bg)]/95 p-4 lg:hidden">
          <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
            <a href="/" aria-label="Homepage" className="font-mono text-base text-[var(--cestus-cyan)]">
              Cestus
            </a>
            <button
              type="button"
              aria-label="Close module menu"
              onClick={() => setMobileMenuOpen(false)}
              className="relative flex min-h-9 items-center border border-white/10 px-2 py-2"
            >
              <span
                aria-hidden="true"
                className="pointer-fine:hidden absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2"
              />
              <XMarkIcon aria-hidden="true" className="size-4 shrink-0 fill-[var(--cestus-text)]" />
            </button>
          </div>
          <nav aria-label="Mobile Cestus modules" className="pt-4">
            <ul role="list" className="space-y-2">
              {modules.map((module) => (
                <li key={module.id}>
                  <ModuleLink module={module} active={module.id === activeModuleId} />
                </li>
              ))}
            </ul>
          </nav>
        </div>
      ) : null}
    </div>
  );
}
