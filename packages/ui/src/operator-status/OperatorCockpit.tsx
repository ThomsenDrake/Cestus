import { useMemo, useRef, useState } from "react";
import type { OperatorSafeActionDto, OperatorStatusDto, OperatorStatusSectionDto } from "./operator-status-types.js";
import { OperatorStatusBand } from "./OperatorStatusBand.js";
import { OperatorStatusDetail } from "./OperatorStatusDetail.js";

interface OperatorCockpitProps {
  readonly status: OperatorStatusDto;
  readonly onNavigate?: (target: OperatorSafeActionDto["target"]) => void;
  readonly onRefresh?: () => void;
  readonly title?: string;
}

const sectionFallbackLabels: Record<OperatorStatusSectionDto["sectionId"], string> = {
  workspace: "Workspace",
  ingestion: "Ingestion",
  "legacy-import": "Legacy Import",
  prr: "PRR/Investigations"
};

export function OperatorCockpit({ status, onNavigate, onRefresh, title = "Operator cockpit" }: OperatorCockpitProps) {
  const tabRefs = useRef(new Map<OperatorStatusSectionDto["sectionId"], HTMLDivElement>());
  const sections = useMemo(
    () =>
      status.sections.map((section) => ({
        ...section,
        label: section.label || sectionFallbackLabels[section.sectionId]
      })),
    [status.sections]
  );
  const actionsById = useMemo(
    () => new Map(status.safeActions.map((action) => [action.actionId, action])),
    [status.safeActions]
  );
  const initialSectionId = useMemo(
    () => findInitialSection(sections, status.summary.nextSafeActionId)?.sectionId ?? sections[0]?.sectionId,
    [sections, status.summary.nextSafeActionId]
  );
  const [selectedSectionId, setSelectedSectionId] = useState<OperatorStatusSectionDto["sectionId"] | undefined>(
    initialSectionId
  );
  const selectedSection =
    sections.find((section) => section.sectionId === selectedSectionId) ??
    findInitialSection(sections, status.summary.nextSafeActionId) ??
    sections[0];

  if (selectedSection === undefined) {
    return null;
  }

  const selectedActions = actionsForSection(selectedSection, actionsById);
  const selectedTabId = tabIdForSection(selectedSection.sectionId);
  const selectedPanelId = panelIdForSection(selectedSection.sectionId);

  function setTabRef(sectionId: OperatorStatusSectionDto["sectionId"], node: HTMLDivElement | null) {
    if (node === null) {
      tabRefs.current.delete(sectionId);
      return;
    }

    tabRefs.current.set(sectionId, node);
  }

  function handleKeyboardNavigate(
    sectionId: OperatorStatusSectionDto["sectionId"],
    direction: "first" | "last" | "next" | "previous"
  ) {
    const nextSectionId = sectionIdForKeyboardNavigation(sections, sectionId, direction);
    setSelectedSectionId(nextSectionId);
    tabRefs.current.get(nextSectionId)?.focus();
  }

  return (
    <section aria-label={title} className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-[var(--console-line)] pb-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-base text-[var(--signal-amber)] sm:text-sm">Operator status bridge</p>
          <h2 className="mt-1 text-xl font-semibold text-balance text-[var(--paper-light)]">{title}</h2>
          <p className="mt-2 text-base text-pretty text-[var(--muted-amber)] sm:text-sm">{status.runtime.safeMessage}</p>
        </div>
        <div className="grid grid-cols-3 gap-3 border border-[var(--console-line)] bg-[var(--console-void)]/72 p-3">
          <SummaryMetric label="Blocked" value={status.summary.blockedCount} tone="text-[var(--signal-red)]" />
          <SummaryMetric label="Action" value={status.summary.actionRequiredCount} tone="text-[var(--signal-cyan)]" />
          <SummaryMetric label="Degraded" value={status.summary.degradedCount} tone="text-[var(--signal-amber)]" />
        </div>
      </div>
      <div role="tablist" aria-label="Operator status bands" className="grid gap-3 lg:grid-cols-4">
        {sections.map((section) => (
          <OperatorStatusBand
            key={section.sectionId}
            section={section}
            tabId={tabIdForSection(section.sectionId)}
            panelId={panelIdForSection(section.sectionId)}
            primaryAction={primaryActionForSection(section, actionsById)}
            selected={section.sectionId === selectedSection.sectionId}
            onSelect={setSelectedSectionId}
            onKeyboardNavigate={handleKeyboardNavigate}
            tabRef={(node) => setTabRef(section.sectionId, node)}
          />
        ))}
      </div>
      <OperatorStatusDetail
        section={selectedSection}
        panelId={selectedPanelId}
        labelledByTabId={selectedTabId}
        actions={selectedActions}
        {...(onNavigate === undefined ? {} : { onNavigate })}
        {...(onRefresh === undefined ? {} : { onRefresh })}
      />
    </section>
  );
}

function SummaryMetric({
  label,
  value,
  tone
}: {
  readonly label: string;
  readonly value: number;
  readonly tone: string;
}) {
  return (
    <div className="min-w-0">
      <div className="truncate font-mono text-base text-[var(--muted-amber)] sm:text-sm">{label}</div>
      <div className={`mt-1 font-mono text-lg tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

function findInitialSection(
  sections: readonly OperatorStatusSectionDto[],
  nextSafeActionId: string | undefined
): OperatorStatusSectionDto | undefined {
  if (nextSafeActionId !== undefined) {
    const nextActionSection = sections.find((section) => section.nextSafeActionIds.includes(nextSafeActionId));
    if (nextActionSection !== undefined) {
      return nextActionSection;
    }
  }

  return (
    sections.find((section) => section.state === "action-required") ??
    sections.find((section) => section.state === "blocked") ??
    sections.find((section) => section.state === "degraded") ??
    sections.find((section) => section.state === "unavailable") ??
    sections[0]
  );
}

function actionsForSection(
  section: OperatorStatusSectionDto,
  actionsById: ReadonlyMap<string, OperatorSafeActionDto>
): OperatorSafeActionDto[] {
  return section.nextSafeActionIds
    .map((actionId) => actionsById.get(actionId))
    .filter((action): action is OperatorSafeActionDto => action !== undefined);
}

function primaryActionForSection(
  section: OperatorStatusSectionDto,
  actionsById: ReadonlyMap<string, OperatorSafeActionDto>
): OperatorSafeActionDto | undefined {
  return actionsForSection(section, actionsById)[0];
}

function tabIdForSection(sectionId: OperatorStatusSectionDto["sectionId"]): string {
  return `operator-status-tab-${sectionId}`;
}

function panelIdForSection(sectionId: OperatorStatusSectionDto["sectionId"]): string {
  return `operator-status-panel-${sectionId}`;
}

function sectionIdForKeyboardNavigation(
  sections: readonly OperatorStatusSectionDto[],
  sectionId: OperatorStatusSectionDto["sectionId"],
  direction: "first" | "last" | "next" | "previous"
): OperatorStatusSectionDto["sectionId"] {
  if (sections.length === 0) {
    return sectionId;
  }

  if (direction === "first") {
    return sections[0]?.sectionId ?? sectionId;
  }

  if (direction === "last") {
    return sections[sections.length - 1]?.sectionId ?? sectionId;
  }

  const currentIndex = sections.findIndex((section) => section.sectionId === sectionId);
  if (currentIndex === -1) {
    return sections[0]?.sectionId ?? sectionId;
  }

  const nextIndex =
    direction === "next"
      ? (currentIndex + 1) % sections.length
      : (currentIndex - 1 + sections.length) % sections.length;

  return sections[nextIndex]?.sectionId ?? sectionId;
}
