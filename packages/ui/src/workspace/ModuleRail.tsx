import type { WorkspaceModule } from "./workspace-nav.js";

interface ModuleRailProps {
  readonly modules: readonly WorkspaceModule[];
  readonly activeModuleId: string;
  readonly onModuleSelect?: ((moduleId: string) => void) | undefined;
}

export function ModuleRail({ modules, activeModuleId, onModuleSelect }: ModuleRailProps) {
  return (
    <nav
      aria-label="Cestus tactical modules"
      className="hidden border-r border-[var(--console-line)] bg-[var(--console-void)] lg:block"
    >
      <div className="px-3 py-4">
        <a href="/" aria-label="Cestus home" className="font-mono text-base text-[var(--signal-red)] sm:text-sm">
          CESTUS
        </a>
        <div className="mt-1 font-mono text-base text-[var(--muted-amber)] sm:text-sm">NEO</div>
      </div>
      <ul role="list" className="space-y-1 px-2">
        {modules.map((module) => (
          <li key={module.id}>
            <ModuleLink module={module} active={module.id === activeModuleId} onModuleSelect={onModuleSelect} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function ModuleLink({
  module,
  active,
  onModuleSelect
}: {
  readonly module: WorkspaceModule;
  readonly active: boolean;
  readonly onModuleSelect?: ((moduleId: string) => void) | undefined;
}) {
  const label = module.label.replace(/\sPreview$/, "");

  return (
    <a
      href={module.href}
      aria-label={module.label}
      aria-current={active ? "page" : undefined}
      aria-disabled={module.preview ? "true" : undefined}
      onClick={(event) => {
        if (module.preview) {
          event.preventDefault();
          return;
        }

        onModuleSelect?.(module.id);
      }}
      className={[
        "group flex min-h-10 items-center justify-between gap-3 border px-3 py-2 font-mono text-base sm:min-h-9 sm:text-sm",
        active
          ? "border-[var(--signal-orange)] bg-[var(--signal-orange)]/12 text-[var(--paper-light)]"
          : "border-transparent text-[var(--muted-amber)] hover:border-[var(--console-line)] hover:bg-[var(--console-panel)] hover:text-[var(--paper-light)]"
      ].join(" ")}
    >
      <span className="truncate">{label.toUpperCase()}</span>
      {module.preview ? (
        <span aria-hidden="true" className="shrink-0 text-[var(--signal-amber)]">
          Preview
        </span>
      ) : null}
    </a>
  );
}
