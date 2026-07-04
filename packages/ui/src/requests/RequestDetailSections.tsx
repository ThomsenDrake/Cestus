import type { ReactNode } from "react";
import { sendGateArmed, unresolvedEscalationPrerequisites } from "./request-model.js";
import type { PrrDetailModel, PrrGateCheck, PrrSignalTone } from "./request-types.js";

export interface RequestDetailSectionsProps {
  readonly selectedRequest: PrrDetailModel;
  readonly disableUnavailableAction?: boolean;
}

const toneClasses: Record<PrrSignalTone, string> = {
  amber: "border-[var(--signal-amber)] text-[var(--signal-amber)]",
  red: "border-[var(--signal-red)] text-[var(--signal-red)]",
  green: "border-[var(--signal-green)] text-[var(--signal-green)]",
  cyan: "border-[var(--signal-cyan)] text-[var(--signal-cyan)]",
  neutral: "border-[var(--console-line)] text-[var(--muted-amber)]"
};

const providerLabels: Record<PrrDetailModel["correspondence"]["provider"], string> = {
  none: "No provider event",
  gmail: "Gmail",
  "imap-smtp": "IMAP/SMTP",
  himalaya: "Himalaya"
};

export function RequestDetailSections({
  selectedRequest,
  disableUnavailableAction = true
}: RequestDetailSectionsProps) {
  const sendArmed = sendGateArmed(selectedRequest.sendGate);
  const primaryButtonLabel = sendArmed ? "Send now" : "Review to send";
  const showActionLabel = selectedRequest.nextAction.label !== primaryButtonLabel;
  const missingEscalationPrerequisites = unresolvedEscalationPrerequisites(selectedRequest.escalationGate);
  const actionDisabled = !sendArmed && disableUnavailableAction;

  return (
    <>
      <section className="border border-[var(--console-line)] bg-[var(--console-panel)]/56 p-3">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-balance text-[var(--paper-light)] sm:text-sm">
              Next action packet
            </h3>
            {showActionLabel ? (
              <p className="mt-1 text-base font-medium text-pretty text-[var(--signal-amber)] sm:text-sm">
                {selectedRequest.nextAction.label}
              </p>
            ) : null}
          </div>
          <div className={`shrink-0 border px-2 py-1 font-mono text-base sm:text-sm ${toneClasses[selectedRequest.nextAction.risk]}`}>
            {selectedRequest.nextAction.risk}
          </div>
        </div>
        <p className="mt-3 text-base text-pretty text-[var(--paper-light)] sm:text-sm">
          {selectedRequest.nextAction.summary}
        </p>
        <p className="mt-3 border-l border-[var(--console-line)] pl-3 text-base text-pretty text-[var(--muted-amber)] sm:text-sm">
          {selectedRequest.nextAction.requiredHumanDecision}
        </p>
        <ul role="list" className="mt-3 space-y-2">
          {selectedRequest.nextAction.explanation.map((explanation) => (
            <li
              key={explanation}
              className="border-l border-[var(--console-line)] pl-3 text-base text-pretty text-[var(--muted-amber)] sm:text-sm"
            >
              {explanation}
            </li>
          ))}
        </ul>
        <button
          type="button"
          disabled={actionDisabled}
          aria-disabled={sendArmed ? undefined : "true"}
          className={[
            "relative mt-4 min-h-10 w-full border px-3 py-2 text-base font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--signal-cyan)] sm:min-h-9 sm:text-sm",
            sendArmed
              ? "border-[var(--signal-green)] bg-[var(--signal-green)] text-[var(--console-ink)]"
              : "border-[var(--console-line)] text-[var(--muted-amber)] opacity-70"
          ].join(" ")}
        >
          <span
            aria-hidden="true"
            className="pointer-fine:hidden absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2"
          />
          {primaryButtonLabel}
        </button>
      </section>

      <GateSection title="Send review gate" checks={selectedRequest.sendGate} />

      <section className="mt-5 border-t border-[var(--console-line)] pt-5">
        <h3 className="text-base font-semibold text-balance text-[var(--paper-light)] sm:text-sm">
          Legal escalation locked
        </h3>
        {missingEscalationPrerequisites.length > 0 ? (
          <ul role="list" className="mt-2 space-y-2">
            {missingEscalationPrerequisites.map((prerequisite) => (
              <li key={prerequisite} className="font-mono text-base text-[var(--signal-red)] sm:text-sm">
                Missing: {prerequisite}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-base text-pretty text-[var(--signal-green)] sm:text-sm">
            All escalation prerequisites are satisfied.
          </p>
        )}
        <GateChecklist checks={selectedRequest.escalationGate} />
      </section>

      <RailSection title="Deadline posture">
        <p className="text-base text-pretty text-[var(--muted-amber)] sm:text-sm">{selectedRequest.deadlinePosture}</p>
      </RailSection>

      <RailSection title="Correspondence">
        <dl className="space-y-3">
          <RailFact label="Provider" value={providerLabels[selectedRequest.correspondence.provider]} />
          <RailFact label="Sync state" value={selectedRequest.correspondence.syncState} />
          <RailFact label="Latest inbound" value={selectedRequest.correspondence.latestInbound} />
          <RailFact label="Latest outbound" value={selectedRequest.correspondence.latestOutbound} />
        </dl>
      </RailSection>

      <RailSection title="Evidence intake">
        {selectedRequest.evidencePackets.length === 0 ? (
          <p className="text-base text-pretty text-[var(--muted-amber)] sm:text-sm">No evidence packets linked.</p>
        ) : (
          <ul role="list" className="space-y-3">
            {selectedRequest.evidencePackets.map((packet) => (
              <li key={packet.evidenceId} className="border border-[var(--console-line)] bg-[var(--console-void)]/62 p-3">
                <h4 className="text-base font-semibold text-balance text-[var(--paper-light)] sm:text-sm">{packet.title}</h4>
                <dl className="mt-3 space-y-2">
                  <RailFact label="Source" value={packet.sourceArtifact} />
                  <RailFact label="Files" value={String(packet.fileCount)} />
                  <RailFact label="Hash" value={packet.hashState} />
                  <RailFact label="Extraction" value={packet.extractionState} />
                  <RailFact label="Classification" value={packet.classificationState} />
                </dl>
              </li>
            ))}
          </ul>
        )}
      </RailSection>

      <RailList title="Diagnostics" emptyLabel="No diagnostics open." items={selectedRequest.diagnostics} />
      <RailList title="Timeline" emptyLabel="No timeline events recorded." items={selectedRequest.timeline} mono />
    </>
  );
}

function GateSection({ title, checks }: { readonly title: string; readonly checks: readonly PrrGateCheck[] }) {
  return (
    <section className="mt-5 border-t border-[var(--console-line)] pt-5">
      <h3 className="text-base font-semibold text-balance text-[var(--paper-light)] sm:text-sm">{title}</h3>
      <GateChecklist checks={checks} />
    </section>
  );
}

function GateChecklist({ checks }: { readonly checks: readonly PrrGateCheck[] }) {
  return (
    <ul role="list" className="mt-3 space-y-3">
      {checks.map((check) => (
        <li key={check.id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
          <div
            aria-hidden="true"
            className={[
              "mt-1 size-2 shrink-0 border",
              check.complete ? "border-[var(--signal-green)] bg-[var(--signal-green)]" : "border-[var(--signal-red)]"
            ].join(" ")}
          />
          <div className="min-w-0">
            <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-base font-medium text-[var(--paper-light)] sm:text-sm">{check.label}</div>
              <div
                className={[
                  "w-fit shrink-0 border px-2 py-1 font-mono text-base sm:text-sm",
                  check.complete
                    ? "border-[var(--signal-green)] text-[var(--signal-green)]"
                    : "border-[var(--signal-red)] text-[var(--signal-red)]"
                ].join(" ")}
              >
                {check.complete ? "Complete" : "Needs review"}
              </div>
            </div>
            <div className="mt-1 text-base text-pretty text-[var(--muted-amber)] sm:text-sm">{check.detail}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function RailSection({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="mt-5 border-t border-[var(--console-line)] pt-5">
      <h3 className="mb-3 text-base font-semibold text-balance text-[var(--paper-light)] sm:text-sm">{title}</h3>
      {children}
    </section>
  );
}

function RailFact({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <dt className="text-base font-medium text-[var(--paper-light)] sm:text-sm">{label}</dt>
      <dd className="mt-1 text-base text-pretty text-[var(--muted-amber)] sm:text-sm">{value}</dd>
    </div>
  );
}

function RailList({
  title,
  emptyLabel,
  items,
  mono = false
}: {
  readonly title: string;
  readonly emptyLabel: string;
  readonly items: readonly string[];
  readonly mono?: boolean;
}) {
  return (
    <RailSection title={title}>
      {items.length === 0 ? (
        <p className="text-base text-pretty text-[var(--muted-amber)] sm:text-sm">{emptyLabel}</p>
      ) : (
        <ul role="list" className="space-y-2">
          {items.map((item) => (
            <li
              key={item}
              className={[
                "border-l border-[var(--console-line)] pl-3 text-base text-pretty text-[var(--muted-amber)] sm:text-sm",
                mono ? "font-mono" : ""
              ].join(" ")}
            >
              {item}
            </li>
          ))}
        </ul>
      )}
    </RailSection>
  );
}
