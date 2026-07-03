import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { PrrBuilderModel, PrrBuilderStep, PrrSuggestedFill } from "./request-types.js";

interface RequestBuilderProps {
  readonly builder: PrrBuilderModel;
  readonly onClose: () => void;
}

const stateLabels: Record<PrrBuilderStep["state"], string> = {
  complete: "Complete",
  "needs-review": "Needs review",
  ready: "Ready"
};

const stateClasses: Record<PrrBuilderStep["state"], string> = {
  complete: "border-[var(--signal-green)] text-[var(--signal-green)]",
  "needs-review": "border-[var(--signal-amber)] text-[var(--signal-amber)]",
  ready: "border-[var(--signal-cyan)] text-[var(--signal-cyan)]"
};

export function RequestBuilder({ builder, onClose }: RequestBuilderProps) {
  const [activeStepId, setActiveStepId] = useState(builder.steps[0]?.id ?? "");
  const [suggestedFillValues, setSuggestedFillValues] = useState<Record<string, string>>(() =>
    getInitialSuggestedFillValues(builder)
  );
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const activeStep = builder.steps.find((step) => step.id === activeStepId) ?? builder.steps[0];

  useEffect(() => {
    previousActiveElementRef.current =
      document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    const focusTarget = closeButtonRef.current ?? getFocusableDialogControls(dialogRef.current)[0];
    focusTarget?.focus();

    return () => {
      const previousActiveElement = previousActiveElementRef.current;
      if (previousActiveElement?.isConnected) {
        previousActiveElement.focus();
      }
    };
  }, []);

  function handleSuggestedFillChange(fillId: string, value: string) {
    setSuggestedFillValues((current) => ({ ...current, [fillId]: value }));
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusableControls = getFocusableDialogControls(dialogRef.current);
    const firstControl = focusableControls[0];
    const lastControl = focusableControls.at(-1);

    if (firstControl === undefined || lastControl === undefined) {
      event.preventDefault();
      return;
    }

    if (event.shiftKey && (document.activeElement === firstControl || !dialogRef.current?.contains(document.activeElement))) {
      event.preventDefault();
      lastControl.focus();
      return;
    }

    if (!event.shiftKey && document.activeElement === lastControl) {
      event.preventDefault();
      firstControl.focus();
    }
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Guided request builder"
      onKeyDown={handleDialogKeyDown}
      className="fixed inset-0 z-50 overflow-y-auto bg-[var(--command-black)]/95 p-4"
    >
      <div className="mx-auto grid min-h-[calc(100dvh-2rem)] max-w-6xl gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <aside className="border border-[var(--console-line)] bg-[var(--console-void)]/92 p-4 lg:sticky lg:top-4 lg:self-start">
          <div className="flex min-w-0 items-start justify-between gap-4 border-b border-[var(--console-line)] pb-4">
            <div className="min-w-0">
              <p className="font-mono text-base text-[var(--signal-amber)] sm:text-sm">Command checklist</p>
              <h2 className="mt-1 text-2xl font-semibold text-balance text-[var(--paper-light)]">New request</h2>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              className="relative min-h-10 shrink-0 border border-[var(--console-line)] px-3 py-2 text-base text-[var(--paper-light)] hover:border-[var(--signal-amber)] hover:text-[var(--signal-amber)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--signal-cyan)] sm:min-h-9 sm:text-sm"
            >
              <span
                aria-hidden="true"
                className="pointer-fine:hidden absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2"
              />
              Close
            </button>
          </div>
          <ol className="mt-4 space-y-2">
            {builder.steps.map((step, index) => {
              const active = step.id === activeStep?.id;

              return (
                <li key={step.id}>
                  <button
                    type="button"
                    aria-label={`Open ${step.label}`}
                    aria-current={active ? "step" : undefined}
                    onClick={() => setActiveStepId(step.id)}
                    className={[
                      "relative grid min-h-12 w-full grid-cols-[auto_minmax(0,1fr)] gap-3 border px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--signal-cyan)]",
                      active
                        ? "border-[var(--signal-amber)] bg-[var(--console-panel-raised)] text-[var(--paper-light)]"
                        : "border-[var(--console-line)] text-[var(--muted-amber)] hover:border-[var(--signal-amber)] hover:text-[var(--paper-light)]"
                    ].join(" ")}
                  >
                    <span
                      aria-hidden="true"
                      className="pointer-fine:hidden absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2"
                    />
                    <span className="font-mono text-base text-[var(--signal-cyan)] sm:text-sm">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-base font-semibold sm:text-sm">{step.label}</span>
                      <span className="mt-1 block font-mono text-base text-[var(--muted-amber)] sm:text-sm">
                        {stateLabels[step.state]}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>

        <main className="min-w-0 border border-[var(--console-line)] bg-[var(--console-panel)]/86 p-4 lg:p-5">
          {activeStep === undefined ? (
            <p className="text-base text-pretty text-[var(--muted-amber)] sm:text-sm">No checklist steps are available.</p>
          ) : (
            <ActiveStepPanel
              step={activeStep}
              suggestedFillValues={suggestedFillValues}
              onSuggestedFillChange={handleSuggestedFillChange}
            />
          )}
        </main>
      </div>
    </div>
  );
}

function ActiveStepPanel({
  step,
  suggestedFillValues,
  onSuggestedFillChange
}: {
  readonly step: PrrBuilderStep;
  readonly suggestedFillValues: Readonly<Record<string, string>>;
  readonly onSuggestedFillChange: (fillId: string, value: string) => void;
}) {
  return (
    <section aria-labelledby="request-builder-active-step" className="min-w-0">
      <div className="flex min-w-0 flex-col gap-3 border-b border-[var(--console-line)] pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-base text-[var(--muted-amber)] sm:text-sm">Active step</p>
          <h3 id="request-builder-active-step" className="mt-1 text-2xl font-semibold text-balance text-[var(--paper-light)]">
            {step.label}
          </h3>
        </div>
        <div className={`w-fit shrink-0 border px-2 py-1 font-mono text-base sm:text-sm ${stateClasses[step.state]}`}>
          {stateLabels[step.state]}
        </div>
      </div>

      <div className="mt-5">
        <h4 className="text-base font-semibold text-[var(--paper-light)] sm:text-sm">Suggested fills</h4>
        {step.suggestedFills.length === 0 ? (
          <p className="mt-3 text-base text-pretty text-[var(--muted-amber)] sm:text-sm">
            No learned fill is suggested for this step yet. The user can complete it manually.
          </p>
        ) : (
          <div className="mt-3 space-y-4">
            {step.suggestedFills.map((fill) => (
              <SuggestedFillEditor
                key={fill.id}
                fill={fill}
                value={suggestedFillValues[fill.id] ?? fill.value}
                onChange={(value) => onSuggestedFillChange(fill.id, value)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function SuggestedFillEditor({
  fill,
  value,
  onChange
}: {
  readonly fill: PrrSuggestedFill;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <label className="block border border-[var(--console-line)] bg-[var(--console-void)]/68 p-3">
      <span className="block text-base font-medium text-[var(--paper-light)] sm:text-sm">{fill.fieldLabel}</span>
      <input
        type="text"
        aria-label={`${fill.fieldLabel} suggestion`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 min-h-11 w-full border border-[var(--console-line)] bg-[var(--command-black)] px-3 py-2 font-mono text-base text-[var(--paper-light)] outline-none focus-visible:-outline-offset-1 focus-visible:outline-2 focus-visible:outline-[var(--signal-cyan)] sm:min-h-9 sm:text-sm"
      />
      <span className="mt-2 block text-base text-pretty text-[var(--muted-amber)] sm:text-sm">{fill.provenance}</span>
    </label>
  );
}

function getInitialSuggestedFillValues(builder: PrrBuilderModel): Record<string, string> {
  return Object.fromEntries(
    builder.steps.flatMap((step) => step.suggestedFills.map((fill) => [fill.id, fill.value]))
  );
}

function getFocusableDialogControls(dialog: HTMLElement | null): HTMLElement[] {
  if (dialog === null) {
    return [];
  }

  return Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  );
}
