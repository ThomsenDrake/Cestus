import { buildPrrWorkspaceIntelligenceModel } from "./request-model.js";
import type { PrrSignalTone, PrrViewMode, PrrWorkspaceData, PrrWorkspaceIntelligenceModel } from "./request-types.js";

interface RequestWorkspaceIntelligenceRailProps {
  readonly workspace: PrrWorkspaceData | undefined;
  readonly savedViewId?: string | undefined;
  readonly viewMode?: PrrViewMode | undefined;
}

const toneClasses: Record<PrrSignalTone, string> = {
  amber: "border-[var(--signal-amber)] text-[var(--signal-amber)]",
  red: "border-[var(--signal-red)] text-[var(--signal-red)]",
  green: "border-[var(--signal-green)] text-[var(--signal-green)]",
  cyan: "border-[var(--signal-cyan)] text-[var(--signal-cyan)]",
  neutral: "border-[var(--console-line)] text-[var(--muted-amber)]"
};

export function RequestWorkspaceIntelligenceRail({ workspace, savedViewId, viewMode }: RequestWorkspaceIntelligenceRailProps) {
  if (workspace === undefined) {
    return (
      <aside aria-label="Requests workspace intelligence" className="h-full p-4 lg:p-5">
        <h2 className="text-lg font-semibold text-balance text-[var(--paper-light)]">Workspace intelligence</h2>
        <p className="mt-3 text-base text-pretty text-[var(--muted-amber)] sm:text-sm">Requests workspace loading</p>
      </aside>
    );
  }

  return <IntelligenceRailContent model={buildPrrWorkspaceIntelligenceModel(workspace, { savedViewId, viewMode })} />;
}

function IntelligenceRailContent({ model }: { readonly model: PrrWorkspaceIntelligenceModel }) {
  return (
    <aside aria-label="Requests workspace intelligence" className="h-full p-4 lg:p-5">
      <p className="font-mono text-base text-[var(--signal-amber)] sm:text-sm">PRR sync local</p>
      <h2 className="mt-2 text-lg font-semibold text-balance text-[var(--paper-light)]">Workspace intelligence</h2>
      <p className="mt-3 text-base text-pretty text-[var(--muted-amber)] sm:text-sm">
        {model.visibleRequestCount} visible request{model.visibleRequestCount === 1 ? "" : "s"} in{" "}
        {model.activeViewLabel}.
      </p>

      <section className="mt-5 border-t border-[var(--console-line)] pt-5">
        <h3 className="text-base font-semibold text-balance text-[var(--paper-light)] sm:text-sm">Health signals</h3>
        <ul role="list" className="mt-3 space-y-3">
          {model.healthSignals.map((signal) => (
            <li key={signal.id} className="border border-[var(--console-line)] bg-[var(--console-panel)]/56 p-3">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-base font-medium text-[var(--paper-light)] sm:text-sm">{signal.label}</div>
                  <p className="mt-1 text-base text-pretty text-[var(--muted-amber)] sm:text-sm">{signal.detail}</p>
                </div>
                <div className={`shrink-0 border px-2 py-1 font-mono text-base sm:text-sm ${toneClasses[signal.tone]}`}>
                  {signal.value}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-5 border-t border-[var(--console-line)] pt-5">
        <h3 className="text-base font-semibold text-balance text-[var(--paper-light)] sm:text-sm">Suggested next work</h3>
        <ul role="list" className="mt-3 space-y-3">
          {model.nextWork.map((item) => (
            <li key={item.id} className="border-l border-[var(--console-line)] pl-3">
              <div className={`w-fit border px-2 py-1 font-mono text-base sm:text-sm ${toneClasses[item.tone]}`}>
                {item.label}
              </div>
              <p className="mt-2 text-base text-pretty text-[var(--muted-amber)] sm:text-sm">{item.detail}</p>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
