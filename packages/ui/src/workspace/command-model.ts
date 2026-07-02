import type { PrrDiagnostic } from "../../../prr/src/diagnostics.js";
import type { RequestQueueRow } from "../../../prr/src/read-api.js";
import type { PrrStatus } from "../../../prr/src/types.js";
import type {
  CommandBoardInput,
  CommandBoardViewModel,
  CommandQueueItem,
  EvidenceAlert,
  MetricTone,
  QueueFilter,
  StatusMetric,
  TacticalPanelModel
} from "./command-types.js";

const severityRank: Record<CommandQueueItem["severity"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3
};

export function buildCommandBoardViewModel(input: CommandBoardInput): CommandBoardViewModel {
  const reviewedItemIds = new Set(input.reviewedItemIds);
  const queueItems = [
    ...input.requestRows.flatMap((row) => itemsFromRequest(row, input.todayIso)),
    ...input.diagnostics.map((diagnostic) => itemFromDiagnostic(diagnostic)),
    ...input.evidenceAlerts.map((alert) => itemFromEvidenceAlert(alert))
  ]
    .map((item) => freezeQueueItem({ ...item, reviewed: reviewedItemIds.has(item.id) }))
    .sort(compareQueueItems);

  return Object.freeze({
    statusMetrics: Object.freeze(buildStatusMetrics(input).map(freezeMetric)),
    queueItems: Object.freeze(queueItems),
    tacticalPanels: Object.freeze(buildTacticalPanels(input, queueItems).map(freezePanel)),
    agentBrief: Object.freeze({
      watching: Object.freeze([
        `${input.requestRows.length} public records request streams`,
        `${input.evidenceAlerts.length} new evidence signals`,
        `${input.diagnostics.length} diagnostics`
      ]),
      changedSinceReview: Object.freeze(
        queueItems
          .filter((item) => !item.reviewed)
          .slice(0, 3)
          .map((item) => item.title)
      ),
      uncertain: Object.freeze([
        "Deadline confidence depends on jurisdiction pack coverage",
        "Stalling signals remain recommendations until confirmed by review"
      ]),
      recommendedActions: Object.freeze(queueItems.slice(0, 3).map((item) => item.actionLabel))
    })
  });
}

export function filterQueueItems(
  items: readonly CommandQueueItem[],
  filter: QueueFilter
): readonly CommandQueueItem[] {
  if (filter === "all") {
    return items;
  }

  return items.filter((item) => item.kind === filter);
}

export function getSelectedCommandItem(
  model: CommandBoardViewModel,
  selectedItemId: string | undefined
): CommandQueueItem | undefined {
  if (selectedItemId === undefined) {
    return undefined;
  }

  return model.queueItems.find((item) => item.id === selectedItemId);
}

function buildStatusMetrics(input: CommandBoardInput): StatusMetric[] {
  const dueSoon = input.requestRows.filter(
    (row) => row.deadlineDate !== undefined && daysUntil(input.todayIso, row.deadlineDate) <= 14
  ).length;
  const stalled = input.requestRows.filter((row) => row.possibleStalling || row.confirmedStalling).length;

  return [
    {
      id: "open-requests",
      label: "Open requests",
      value: String(input.requestRows.filter(isOpenStatus).length),
      tone: "cyan"
    },
    {
      id: "due-soon",
      label: "Due soon",
      value: String(dueSoon),
      tone: dueSoon > 0 ? "amber" : "neutral"
    },
    {
      id: "stalled-signals",
      label: "Stalled signals",
      value: String(stalled),
      tone: stalled > 0 ? "red" : "neutral"
    },
    {
      id: "new-evidence",
      label: "New evidence",
      value: String(input.evidenceAlerts.length),
      tone: input.evidenceAlerts.length > 0 ? "cyan" : "neutral"
    },
    {
      id: "diagnostics",
      label: "Diagnostics",
      value: String(input.diagnostics.length),
      tone: input.diagnostics.length > 0 ? "amber" : "green"
    }
  ];
}

function itemsFromRequest(row: RequestQueueRow, todayIso: string): CommandQueueItem[] {
  const items: CommandQueueItem[] = [];

  if (row.confirmedStalling || row.possibleStalling) {
    items.push({
      id: `signal:${row.prrRequestId}`,
      kind: "signal",
      severity: row.confirmedStalling ? "critical" : "high",
      title: `${row.agencyName} stalling signal`,
      context: `${statusLabel(row.status)} | ${row.prrRequestId}`,
      state: row.confirmedStalling ? "Confirmed" : "Possible",
      sourceLabel: "stalling model",
      actionLabel: row.confirmedStalling ? "Prepare escalation" : "Review agency posture",
      reviewed: false,
      detail: {
        summary: `${row.agencyName} may be delaying production.`,
        basis: row.confirmedStalling ? "Human-confirmed stalling event" : "Internal estimate from PRR events",
        recommendedAction: row.confirmedStalling
          ? "Review legal escalation language before sending."
          : "Check correspondence before escalating.",
        provenanceRefs: [row.prrRequestId]
      }
    });
  }

  if (row.deadlineDate !== undefined) {
    const remainingDays = daysUntil(todayIso, row.deadlineDate);
    items.push({
      id: `deadline:${row.prrRequestId}`,
      kind: "deadline",
      severity: row.confirmedStalling || remainingDays <= 7 ? "high" : "medium",
      title: `${row.agencyName} response window`,
      context: `${statusLabel(row.status)} | ${row.prrRequestId}`,
      state: `Due ${row.deadlineDate}`,
      sourceLabel: `${row.deadlineSource ?? "estimated"} deadline`,
      actionLabel: "Review deadline",
      reviewed: false,
      deadlineDate: row.deadlineDate,
      detail: {
        summary: `${row.agencyName} has an active response deadline.`,
        basis: `${row.deadlineSource ?? "estimated"} deadline from PRR read model`,
        recommendedAction: "Check request scope, fee posture, and next correspondence.",
        provenanceRefs: [row.prrRequestId]
      }
    });
  }

  if (row.productionCount > 0) {
    items.push({
      id: `production:${row.prrRequestId}`,
      kind: "evidence",
      severity: "medium",
      title: `${row.agencyName} production received`,
      context: `${row.productionCount} production artifacts | ${row.prrRequestId}`,
      state: "Needs review",
      sourceLabel: "production intake",
      actionLabel: "Review production",
      reviewed: false,
      detail: {
        summary: "A production is linked to this request and should be reviewed for assertions.",
        basis: "Production count from PRR projection",
        recommendedAction: "Open evidence intake and decide what becomes assertions.",
        provenanceRefs: [row.prrRequestId]
      }
    });
  }

  return items;
}

function itemFromDiagnostic(diagnostic: PrrDiagnostic): CommandQueueItem {
  return {
    id: `diagnostic:${diagnostic.diagnosticId}`,
    kind: "diagnostic",
    severity: "high",
    title: diagnostic.message,
    context: diagnostic.prrRequestId,
    state: diagnostic.category,
    sourceLabel: "projection diagnostic",
    actionLabel: "Repair diagnostic",
    reviewed: false,
    detail: {
      summary: diagnostic.message,
      basis: diagnostic.repairHint.violatedPath,
      recommendedAction: diagnostic.repairHint.allowedActions[0] ?? "Review diagnostic state.",
      provenanceRefs: [diagnostic.diagnosticId]
    }
  };
}

function itemFromEvidenceAlert(alert: EvidenceAlert): CommandQueueItem {
  return {
    id: `evidence:${alert.evidenceId}`,
    kind: "evidence",
    severity: "medium",
    title: alert.title,
    context: alert.linkedRequestId ?? "unlinked evidence",
    state: "New",
    sourceLabel: alert.sourceLabel,
    actionLabel: "Review evidence",
    reviewed: false,
    occurredAt: alert.receivedAt,
    detail: {
      summary: alert.title,
      basis: alert.sourceLabel,
      recommendedAction: "Classify the evidence and decide whether it supports new assertions.",
      provenanceRefs: [alert.evidenceId]
    }
  };
}

function buildTacticalPanels(
  input: CommandBoardInput,
  queueItems: readonly CommandQueueItem[]
): TacticalPanelModel[] {
  return [
    {
      id: "active-investigations",
      title: "Active investigations",
      items: input.requestRows.slice(0, 3).map((row) => ({
        id: row.prrRequestId,
        title: row.agencyName,
        meta: statusLabel(row.status),
        tone: row.confirmedStalling ? "red" : row.possibleStalling ? "amber" : "cyan"
      }))
    },
    {
      id: "recent-evidence",
      title: "Recent evidence",
      items: input.evidenceAlerts.slice(0, 3).map((alert) => ({
        id: alert.evidenceId,
        title: alert.title,
        meta: alert.sourceLabel,
        tone: "cyan"
      }))
    },
    {
      id: "sync-watch",
      title: "Sync watch",
      items: queueItems.slice(0, 3).map((item) => ({
        id: item.id,
        title: item.title,
        meta: item.sourceLabel,
        tone: toneForSeverity(item.severity)
      }))
    }
  ];
}

function compareQueueItems(left: CommandQueueItem, right: CommandQueueItem): number {
  const severityDelta = severityRank[left.severity] - severityRank[right.severity];
  if (severityDelta !== 0) {
    return severityDelta;
  }

  const leftDate = left.deadlineDate ?? left.occurredAt ?? "9999-12-31";
  const rightDate = right.deadlineDate ?? right.occurredAt ?? "9999-12-31";
  return leftDate.localeCompare(rightDate) || left.title.localeCompare(right.title);
}

function daysUntil(todayIso: string, dateIso: string): number {
  const today = Date.parse(`${todayIso}T00:00:00.000Z`);
  const target = Date.parse(`${dateIso}T00:00:00.000Z`);
  return Math.ceil((target - today) / 86_400_000);
}

function isOpenStatus(row: RequestQueueRow): boolean {
  return !["produced", "closed"].includes(row.status);
}

function statusLabel(status: PrrStatus): string {
  return status.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`);
}

function toneForSeverity(severity: CommandQueueItem["severity"]): MetricTone {
  if (severity === "critical") {
    return "red";
  }
  if (severity === "high") {
    return "amber";
  }
  return "cyan";
}

function freezeQueueItem(item: CommandQueueItem): CommandQueueItem {
  return Object.freeze({
    ...item,
    detail: Object.freeze({
      ...item.detail,
      provenanceRefs: Object.freeze([...item.detail.provenanceRefs])
    })
  });
}

function freezeMetric(metric: StatusMetric): StatusMetric {
  return Object.freeze(metric);
}

function freezePanel(panel: TacticalPanelModel): TacticalPanelModel {
  return Object.freeze({
    ...panel,
    items: Object.freeze(panel.items.map(freezePanelItem))
  });
}

function freezePanelItem(item: TacticalPanelModel["items"][number]): TacticalPanelModel["items"][number] {
  return Object.freeze(item);
}
