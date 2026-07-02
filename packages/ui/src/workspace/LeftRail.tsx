import type { WorkspaceModule } from "./workspace-nav.js";

interface LeftRailProps {
  readonly modules: readonly WorkspaceModule[];
  readonly activeModuleId: string;
}

export function LeftRail({ modules, activeModuleId }: LeftRailProps) {
  return (
    <nav aria-label="Cestus modules" className="hidden border-r border-white/10 lg:block">
      <div className="border-b border-white/10 p-4">
        <a href="/" aria-label="Homepage" className="font-mono text-base text-[var(--cestus-cyan)] sm:text-sm">
          Cestus
        </a>
        <div className="mt-1 font-mono text-base text-[var(--cestus-muted)] sm:text-sm">neo</div>
      </div>
      <ul role="list" className="space-y-1 p-3">
        {modules.map((module) => (
          <li key={module.id}>
            <ModuleLink module={module} active={module.id === activeModuleId} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function ModuleLink({ module, active }: { readonly module: WorkspaceModule; readonly active: boolean }) {
  return (
    <a
      href={module.href}
      aria-label={module.preview ? `${module.label} Preview` : undefined}
      aria-current={active ? "page" : undefined}
      aria-disabled={module.preview ? "true" : undefined}
      className={[
        "flex min-h-9 items-center justify-between gap-2 border px-3 py-2 text-base sm:text-sm",
        active
          ? "border-[var(--cestus-cyan)]/40 bg-[var(--cestus-cyan)]/10 text-[var(--cestus-text)]"
          : "border-transparent text-[var(--cestus-muted-strong)] hover:border-white/10 hover:bg-white/5 hover:text-[var(--cestus-text)]",
        module.preview ? "opacity-60" : ""
      ].join(" ")}
    >
      <span className="min-w-0 truncate">{module.label}</span>
      {module.preview ? <span className="shrink-0 font-mono text-[var(--cestus-amber)]">Preview</span> : null}
    </a>
  );
}
