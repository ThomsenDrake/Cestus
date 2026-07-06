import type { OperatorSafeActionDto, OperatorStatusSectionDto } from "./operator-status-types.js";

interface OperatorStatusDetailProps {
  readonly section: OperatorStatusSectionDto;
  readonly panelId: string;
  readonly labelledByTabId: string;
  readonly actions: readonly OperatorSafeActionDto[];
  readonly onNavigate?: (target: OperatorSafeActionDto["target"]) => void;
  readonly onRefresh?: () => void;
}

const diagnosticToneClasses: Record<OperatorStatusSectionDto["diagnostics"][number]["severity"], string> = {
  error: "text-[var(--signal-red)]",
  info: "text-[var(--signal-cyan)]",
  warning: "text-[var(--signal-amber)]"
};

export function OperatorStatusDetail({
  section,
  panelId,
  labelledByTabId,
  actions,
  onNavigate,
  onRefresh
}: OperatorStatusDetailProps) {
  const commandActions = actions.filter((action) => action.kind === "show-command");
  const controlActions = actions.filter((action) => action.kind === "navigate" || action.kind === "refresh-status");

  return (
    <section
      id={panelId}
      role="tabpanel"
      aria-labelledby={labelledByTabId}
      className="grid gap-4 border border-[var(--console-line)] bg-[var(--console-void)]/72 p-3 lg:grid-cols-[minmax(0,1fr)_18rem]"
    >
      <div className="min-w-0 space-y-4">
        <div className="border-b border-[var(--console-line)] pb-3">
          <p className="font-mono text-base text-[var(--signal-amber)] sm:text-sm">{section.label}</p>
          <h2 className="mt-1 text-lg font-semibold text-balance text-[var(--paper-light)]">{section.headline}</h2>
          <p className="mt-2 text-base text-pretty text-[var(--muted-amber)] sm:text-sm">{section.safeSummary}</p>
        </div>
        <section aria-labelledby={`${section.sectionId}-diagnostics-heading`} className="space-y-3">
          <h3 id={`${section.sectionId}-diagnostics-heading`} className="text-base font-semibold text-[var(--paper-light)]">
            Diagnostics
          </h3>
          {section.diagnostics.length === 0 ? (
            <p className="text-base text-[var(--muted-amber)] sm:text-sm">No diagnostics reported.</p>
          ) : (
            <ul role="list" className="space-y-3">
              {section.diagnostics.map((diagnostic) => (
                <li key={diagnostic.diagnosticId} className="border border-[var(--console-line)] p-3">
                  <div className={`font-mono text-base sm:text-sm ${diagnosticToneClasses[diagnostic.severity]}`}>
                    {diagnostic.severity}
                  </div>
                  <p className="mt-1 text-base text-[var(--paper-light)] sm:text-sm">{diagnostic.message}</p>
                  <RefList refs={diagnostic.refs} />
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby={`${section.sectionId}-source-evidence-heading`} className="space-y-3">
          <h3
            id={`${section.sectionId}-source-evidence-heading`}
            className="text-base font-semibold text-[var(--paper-light)]"
          >
            source evidence
          </h3>
          {section.sourceEvidence.length === 0 ? (
            <p className="text-base text-[var(--muted-amber)] sm:text-sm">No source evidence reported.</p>
          ) : (
            <ul role="list" className="space-y-3">
              {section.sourceEvidence.map((source) => (
                <li key={source.evidenceId} className="border border-[var(--console-line)] p-3">
                  <div className="text-base font-medium text-[var(--paper-light)] sm:text-sm">{source.label}</div>
                  <div className="mt-1 font-mono text-base text-[var(--signal-cyan)] sm:text-sm">
                    {source.sourceContract}
                  </div>
                  <RefList refs={source.refs} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <aside aria-label={`${section.label} safe actions`} className="space-y-4 border-t border-[var(--console-line)] pt-4 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
        <section aria-labelledby={`${section.sectionId}-controls-heading`} className="space-y-3">
          <h3 id={`${section.sectionId}-controls-heading`} className="text-base font-semibold text-[var(--paper-light)]">
            Safe controls
          </h3>
          {controlActions.length === 0 ? (
            <p className="text-base text-[var(--muted-amber)] sm:text-sm">No safe controls for this section.</p>
          ) : (
            <div className="grid gap-2">
              {controlActions.map((action) => (
                <SafeActionButton
                  key={action.actionId}
                  action={action}
                  {...(onNavigate === undefined ? {} : { onNavigate })}
                  {...(onRefresh === undefined ? {} : { onRefresh })}
                />
              ))}
            </div>
          )}
        </section>
        <section aria-labelledby={`${section.sectionId}-commands-heading`} className="space-y-3">
          <h3 id={`${section.sectionId}-commands-heading`} className="text-base font-semibold text-[var(--paper-light)]">
            Command descriptors
          </h3>
          {commandActions.length === 0 ? (
            <p className="text-base text-[var(--muted-amber)] sm:text-sm">No display-only commands for this section.</p>
          ) : (
            <ul role="list" className="space-y-3">
              {commandActions.map((action) => (
                <li key={action.actionId} className="border border-[var(--console-line)] p-3">
                  <div className="text-base font-medium text-[var(--paper-light)] sm:text-sm">{action.label}</div>
                  <div className="mt-2 overflow-x-auto bg-[var(--console-panel)] p-2 font-mono text-base text-[var(--signal-green)] sm:text-sm">
                    <code>{action.command}</code>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </section>
  );
}

function SafeActionButton({
  action,
  onNavigate,
  onRefresh
}: {
  readonly action: OperatorSafeActionDto;
  readonly onNavigate?: (target: OperatorSafeActionDto["target"]) => void;
  readonly onRefresh?: () => void;
}) {
  function handleClick() {
    if (!action.enabled) {
      return;
    }

    if (action.kind === "navigate") {
      onNavigate?.(action.target);
      return;
    }

    onRefresh?.();
  }

  return (
    <button
      type="button"
      disabled={!action.enabled}
      onClick={handleClick}
      className="relative min-h-10 border border-[var(--console-line)] px-3 py-2 text-base text-[var(--signal-amber)] hover:border-[var(--signal-amber)] hover:bg-[var(--console-panel)] hover:text-[var(--paper-light)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--signal-cyan)] disabled:text-[var(--muted-amber)] sm:text-sm"
    >
      <span
        aria-hidden="true"
        className="pointer-fine:hidden absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2"
      />
      {action.label}
    </button>
  );
}

function RefList({
  refs
}: {
  readonly refs: readonly { readonly label: string; readonly value: string | number | boolean | null }[];
}) {
  if (refs.length === 0) {
    return null;
  }

  return (
    <dl className="mt-3 grid gap-2">
      {refs.map((ref) => (
        <div key={`${ref.label}:${String(ref.value)}`} className="grid grid-cols-[8rem_minmax(0,1fr)] gap-2">
          <dt className="truncate font-mono text-base text-[var(--muted-amber)] sm:text-sm">{ref.label}</dt>
          <dd className="min-w-0 truncate font-mono text-base text-[var(--paper-light)] sm:text-sm">
            {String(ref.value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
