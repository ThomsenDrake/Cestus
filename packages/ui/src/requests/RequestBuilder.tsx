import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { RequestsCreateDraftInput } from "./request-adapter.js";
import type { PrrBuilderModel, PrrBuilderStep, PrrSuggestedFill } from "./request-types.js";

interface RequestBuilderProps {
  readonly builder: PrrBuilderModel;
  readonly onClose: () => void;
  readonly onSubmit: (input: RequestsCreateDraftInput) => void | Promise<void>;
  readonly submitting?: boolean;
  readonly diagnosticMessage?: string | undefined;
}

interface DraftFormState {
  readonly jurisdictionPackValue: string;
  readonly agencyName: string;
  readonly agencyEmail: string;
  readonly agencyPhone: string;
  readonly requesterName: string;
  readonly requesterEmail: string;
  readonly requesterPhone: string;
  readonly requestText: string;
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

const fallbackJurisdictionPackValue = "florida-public-records@0.1.0";
const fieldClassName =
  "mt-2 min-h-11 w-full border border-[var(--console-line)] bg-[var(--command-black)] px-3 py-2 font-mono text-base text-[var(--paper-light)] outline-none focus-visible:-outline-offset-1 focus-visible:outline-2 focus-visible:outline-[var(--signal-cyan)] disabled:cursor-wait disabled:text-[var(--muted-amber)] sm:min-h-9 sm:text-sm";

export function RequestBuilder({
  builder,
  onClose,
  onSubmit,
  submitting = false,
  diagnosticMessage
}: RequestBuilderProps) {
  const [activeStepId, setActiveStepId] = useState(builder.steps[0]?.id ?? "");
  const [draftForm, setDraftForm] = useState<DraftFormState>(() => getInitialDraftForm(builder));
  const [validationMessages, setValidationMessages] = useState<readonly string[]>([]);
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

  function handleDraftFieldChange<Field extends keyof DraftFormState>(field: Field, value: DraftFormState[Field]) {
    if (validationMessages.length > 0) {
      setValidationMessages([]);
    }

    setDraftForm((current) => ({ ...current, [field]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }

    const draftValidationMessages = validateDraftForm(draftForm);
    if (draftValidationMessages.length > 0) {
      setValidationMessages(draftValidationMessages);
      return;
    }

    setValidationMessages([]);
    void onSubmit(toCreateDraftInput(draftForm));
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
          <form className="min-w-0 space-y-5" onSubmit={handleSubmit}>
            {diagnosticMessage === undefined ? null : (
              <div role="alert" className="border border-[var(--signal-red)] bg-[var(--command-black)]/72 p-3">
                <p className="text-base text-pretty text-[var(--paper-light)] sm:text-sm">{diagnosticMessage}</p>
              </div>
            )}
            {validationMessages.length === 0 ? null : (
              <div role="alert" className="border border-[var(--signal-amber)] bg-[var(--command-black)]/72 p-3">
                <p className="text-base font-semibold text-[var(--paper-light)] sm:text-sm">Review required draft fields.</p>
                <ul className="mt-2 space-y-1">
                  {validationMessages.map((message) => (
                    <li key={message} className="text-base text-pretty text-[var(--muted-amber)] sm:text-sm">
                      {message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <DraftRequestFields
              builder={builder}
              form={draftForm}
              onFieldChange={handleDraftFieldChange}
              disabled={submitting}
            />
            {activeStep === undefined ? (
              <p className="text-base text-pretty text-[var(--muted-amber)] sm:text-sm">No checklist steps are available.</p>
            ) : (
              <ActiveStepPanel
                step={activeStep}
                suggestedFillValues={suggestedFillValues}
                onSuggestedFillChange={handleSuggestedFillChange}
              />
            )}
            <div className="flex justify-end border-t border-[var(--console-line)] pt-4">
              <button
                type="submit"
                disabled={submitting}
                className="relative min-h-11 border border-[var(--signal-amber)] bg-[var(--signal-amber)]/12 px-4 py-2 text-base font-semibold text-[var(--paper-light)] hover:bg-[var(--signal-amber)]/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--signal-cyan)] disabled:cursor-wait disabled:border-[var(--console-line)] disabled:text-[var(--muted-amber)] sm:min-h-10 sm:text-sm"
              >
                <span
                  aria-hidden="true"
                  className="pointer-fine:hidden absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2"
                />
                {submitting ? "Creating draft" : "Create draft"}
              </button>
            </div>
          </form>
        </main>
      </div>
    </div>
  );
}

function DraftRequestFields({
  builder,
  form,
  onFieldChange,
  disabled
}: {
  readonly builder: PrrBuilderModel;
  readonly form: DraftFormState;
  readonly onFieldChange: <Field extends keyof DraftFormState>(field: Field, value: DraftFormState[Field]) => void;
  readonly disabled: boolean;
}) {
  const jurisdictionOptions = jurisdictionPackOptions(builder);

  return (
    <section aria-label="Draft request fields" className="min-w-0 border-b border-[var(--console-line)] pb-5">
      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        <label className="block min-w-0">
          <span className="block text-base font-medium text-[var(--paper-light)] sm:text-sm">Jurisdiction pack</span>
          <select
            value={form.jurisdictionPackValue}
            disabled={disabled}
            onChange={(event) => onFieldChange("jurisdictionPackValue", event.target.value)}
            className={fieldClassName}
          >
            {jurisdictionOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <DraftTextField
          label="Agency name"
          value={form.agencyName}
          disabled={disabled}
          onChange={(value) => onFieldChange("agencyName", value)}
        />
        <DraftTextField
          label="Agency email"
          type="email"
          value={form.agencyEmail}
          disabled={disabled}
          onChange={(value) => onFieldChange("agencyEmail", value)}
        />
        <DraftTextField
          label="Agency phone"
          type="tel"
          value={form.agencyPhone}
          disabled={disabled}
          onChange={(value) => onFieldChange("agencyPhone", value)}
        />
        <DraftTextField
          label="Requester name"
          value={form.requesterName}
          disabled={disabled}
          onChange={(value) => onFieldChange("requesterName", value)}
        />
        <DraftTextField
          label="Requester email"
          type="email"
          value={form.requesterEmail}
          disabled={disabled}
          onChange={(value) => onFieldChange("requesterEmail", value)}
        />
        <DraftTextField
          label="Requester phone"
          type="tel"
          value={form.requesterPhone}
          disabled={disabled}
          onChange={(value) => onFieldChange("requesterPhone", value)}
        />
        <label className="block min-w-0 md:col-span-2">
          <span className="block text-base font-medium text-[var(--paper-light)] sm:text-sm">Request text</span>
          <textarea
            value={form.requestText}
            disabled={disabled}
            onChange={(event) => onFieldChange("requestText", event.target.value)}
            className={`${fieldClassName} min-h-32 resize-y`}
          />
        </label>
      </div>
    </section>
  );
}

function DraftTextField({
  label,
  value,
  onChange,
  disabled,
  type = "text"
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly disabled: boolean;
  readonly type?: "email" | "tel" | "text";
}) {
  return (
    <label className="block min-w-0">
      <span className="block text-base font-medium text-[var(--paper-light)] sm:text-sm">{label}</span>
      <input
        type={type}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={fieldClassName}
      />
    </label>
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
    <section aria-label="Active builder step" className="min-w-0">
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

function getInitialDraftForm(builder: PrrBuilderModel): DraftFormState {
  return {
    jurisdictionPackValue: jurisdictionPackOptions(builder)[0]?.value ?? fallbackJurisdictionPackValue,
    agencyName: "",
    agencyEmail: "",
    agencyPhone: "",
    requesterName: "",
    requesterEmail: "",
    requesterPhone: "",
    requestText: ""
  };
}

function jurisdictionPackOptions(builder: PrrBuilderModel): readonly { readonly value: string; readonly label: string }[] {
  const options =
    builder.jurisdictionPacks?.map((pack) =>
      Object.freeze({
        value: jurisdictionPackValue(pack.name, pack.version),
        label: `${pack.jurisdiction} (${pack.name}@${pack.version})`
      })
    ) ?? [];

  if (options.length > 0) {
    return Object.freeze(options);
  }

  return Object.freeze([
    Object.freeze({
      value: fallbackJurisdictionPackValue,
      label: "Florida Public Records (florida-public-records@0.1.0)"
    })
  ]);
}

function toCreateDraftInput(form: DraftFormState): RequestsCreateDraftInput {
  return {
    jurisdictionPack: parseJurisdictionPackValue(form.jurisdictionPackValue),
    agency: contactInput(form.agencyName, form.agencyEmail, form.agencyPhone),
    requester: contactInput(form.requesterName, form.requesterEmail, form.requesterPhone),
    requestText: form.requestText.trim()
  };
}

function validateDraftForm(form: DraftFormState): readonly string[] {
  const messages: string[] = [];
  if (missingRequiredText(form.agencyName)) {
    messages.push("Agency name is required.");
  }
  if (missingRequiredText(form.requesterName)) {
    messages.push("Requester name is required.");
  }
  if (missingRequiredText(form.requestText)) {
    messages.push("Request text is required.");
  }

  return Object.freeze(messages);
}

function missingRequiredText(value: string): boolean {
  return value.trim().length === 0;
}

function parseJurisdictionPackValue(value: string): RequestsCreateDraftInput["jurisdictionPack"] {
  const separatorIndex = value.lastIndexOf("@");
  if (separatorIndex < 1 || separatorIndex === value.length - 1) {
    return { name: "florida-public-records", version: "0.1.0" };
  }

  return {
    name: value.slice(0, separatorIndex),
    version: value.slice(separatorIndex + 1)
  };
}

function jurisdictionPackValue(name: string, version: string): string {
  return `${name}@${version}`;
}

function contactInput(name: string, email: string, phone: string): RequestsCreateDraftInput["agency"] {
  const trimmedEmail = optionalTrimmedValue(email);
  const trimmedPhone = optionalTrimmedValue(phone);

  return {
    name: name.trim(),
    ...(trimmedEmail === undefined ? {} : { email: trimmedEmail }),
    ...(trimmedPhone === undefined ? {} : { phone: trimmedPhone })
  };
}

function optionalTrimmedValue(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
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
