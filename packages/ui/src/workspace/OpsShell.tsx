import { XMarkIcon } from "@heroicons/react/16/solid";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { CommandBand } from "./CommandBand.js";
import { ModuleLink, ModuleRail } from "./ModuleRail.js";
import type { WorkspaceModule } from "./workspace-nav.js";

interface OpsShellProps {
  readonly modules: readonly WorkspaceModule[];
  readonly activeModuleId: string;
  readonly workspaceName: string;
  readonly modeLabel: string;
  readonly ledgerLabel: string;
  readonly syncLabel: string;
  readonly deploymentLabel: string;
  readonly onNewRequest: () => void;
  readonly main: ReactNode;
  readonly decisionRail: ReactNode;
}

export function OpsShell({
  modules,
  activeModuleId,
  workspaceName,
  modeLabel,
  ledgerLabel,
  syncLabel,
  deploymentLabel,
  onNewRequest,
  main,
  decisionRail
}: OpsShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const focusReturnRef = useRef<HTMLElement | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const wasMobileMenuOpenRef = useRef(false);

  useEffect(() => {
    if (mobileMenuOpen) {
      wasMobileMenuOpenRef.current = true;
      closeButtonRef.current?.focus();
      return;
    }

    if (wasMobileMenuOpenRef.current) {
      wasMobileMenuOpenRef.current = false;
      const fallbackButton = document.querySelector<HTMLButtonElement>('button[aria-label="Open module menu"]');
      (focusReturnRef.current ?? fallbackButton)?.focus();
      focusReturnRef.current = null;
    }
  }, [mobileMenuOpen]);

  function openMobileMenu() {
    focusReturnRef.current =
      document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    setMobileMenuOpen(true);
  }

  function closeMobileMenu() {
    setMobileMenuOpen(false);
  }

  function handleMobileMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMobileMenu();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusable = getFocusableMenuItems(menuRef.current);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (first === undefined || last === undefined) {
      return;
    }

    if (event.shiftKey && (document.activeElement === first || !menuRef.current?.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
      return;
    }

    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const mobileMenu = (
    <div
      ref={menuRef}
      role="dialog"
      aria-modal="true"
      aria-label="Cestus tactical modules"
      onKeyDown={handleMobileMenuKeyDown}
      className="fixed inset-0 z-50 bg-[var(--command-black)]/95 p-4 lg:hidden"
    >
      <div className="flex items-center justify-between gap-4 border-b border-[var(--console-line)] pb-4">
        <a href="/" aria-label="Cestus home" className="font-mono text-base text-[var(--signal-red)] sm:text-sm">
          CESTUS
        </a>
        <button
          ref={closeButtonRef}
          type="button"
          aria-label="Close module menu"
          onClick={closeMobileMenu}
          className="relative flex min-h-10 items-center border border-[var(--console-line)] px-2 py-2 text-base sm:min-h-9 sm:text-sm"
        >
          <span
            aria-hidden="true"
            className="pointer-fine:hidden absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2"
          />
          <XMarkIcon aria-hidden="true" className="size-4 shrink-0 fill-[var(--paper-light)]" />
        </button>
      </div>
      <nav aria-label="Mobile Cestus tactical modules" className="pt-4">
        <ul role="list" className="space-y-2">
          {modules.map((module) => (
            <li key={module.id}>
              <ModuleLink module={module} active={module.id === activeModuleId} />
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );

  return (
    <div className="isolate min-h-dvh bg-[var(--command-black)] text-[var(--paper-light)] antialiased">
      <div aria-hidden="true" className="cestus-scan-layer pointer-events-none fixed inset-0 opacity-80" />
      <div className="relative grid min-h-dvh lg:grid-cols-[12rem_minmax(0,1fr)_22rem]">
        <ModuleRail modules={modules} activeModuleId={activeModuleId} />
        <div className="min-w-0">
          <CommandBand
            workspaceName={workspaceName}
            modeLabel={modeLabel}
            ledgerLabel={ledgerLabel}
            syncLabel={syncLabel}
            deploymentLabel={deploymentLabel}
            onNewRequest={onNewRequest}
            onOpenMenu={openMobileMenu}
          />
          <main id="command" className="min-w-0 px-4 py-4 lg:px-5">
            {main}
          </main>
        </div>
        <div className="border-t border-[var(--console-line)] bg-[var(--console-void)]/82 lg:border-l lg:border-t-0">
          {decisionRail}
        </div>
      </div>
      {mobileMenuOpen ? mobileMenu : null}
    </div>
  );
}

function getFocusableMenuItems(menu: HTMLElement | null): HTMLElement[] {
  if (menu === null) {
    return [];
  }

  return Array.from(
    menu.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  );
}
