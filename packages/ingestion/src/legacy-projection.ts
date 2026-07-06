import {
  validateKnowledgeEvent,
  type KnowledgeEventOf
} from "../../ontology/src/contracts.js";

export type LegacyReportSummary = KnowledgeEventOf<"legacy.import.report.generated">["payload"] & {
  reportEventId: string;
  streamId: string;
  occurredAt: string;
};

export type LegacyStagingApprovalSummary = KnowledgeEventOf<"legacy.ontology.staging.approved">["payload"] & {
  approvedEventId: string;
  streamId: string;
  occurredAt: string;
};

export interface LegacyDiagnosticReference {
  diagnosticId: string;
  eventId: string;
  severity: "info" | "warning" | "error";
  category: string;
  message: string;
  streamId: string;
  occurredAt: string;
  sourceCollectionId?: string;
  scanBatchId?: string;
  legacyReportId?: string;
  stagingBatchId?: string;
}

export interface LegacyImportProjection {
  reports: Map<string, LegacyReportSummary>;
  latestReportBySource: Map<string, string>;
  stagingApprovals: Map<string, LegacyStagingApprovalSummary>;
  diagnostics: Map<string, LegacyDiagnosticReference>;
  diagnosticsBySourceCollectionId: Map<string, string[]>;
}

export function buildLegacyImportProjection(events: readonly unknown[]): LegacyImportProjection {
  const projection: LegacyImportProjection = {
    reports: new Map(),
    latestReportBySource: new Map(),
    stagingApprovals: new Map(),
    diagnostics: new Map(),
    diagnosticsBySourceCollectionId: new Map()
  };
  const sourceCollectionIdByStreamId = new Map<string, string>();

  for (const rawEvent of events) {
    const eventResult = validateKnowledgeEvent(rawEvent);

    if (!eventResult.success) {
      continue;
    }

    const event = eventResult.data;

    switch (event.type) {
      case "ingestion.source.registered":
        sourceCollectionIdByStreamId.set(event.streamId, event.payload.sourceCollectionId);
        break;
      case "ingestion.scan.started":
      case "ingestion.occurrence.observed":
      case "ingestion.scan.completed":
        sourceCollectionIdByStreamId.set(event.streamId, event.payload.sourceCollectionId);
        break;
      case "legacy.import.report.generated":
        sourceCollectionIdByStreamId.set(event.streamId, event.payload.sourceCollectionId);
        projectReport(projection, event);
        break;
      case "legacy.ontology.staging.approved":
        sourceCollectionIdByStreamId.set(event.streamId, event.payload.sourceCollectionId);
        projectStagingApproval(projection, event);
        break;
      case "diagnostic.recorded":
        projectDiagnostic(projection, event, sourceCollectionIdByStreamId);
        break;
      default:
        break;
    }
  }

  sortDiagnosticIndexes(projection);
  return projection;
}

function projectReport(
  projection: LegacyImportProjection,
  event: KnowledgeEventOf<"legacy.import.report.generated">
): void {
  projection.reports.set(event.payload.legacyReportId, {
    ...event.payload,
    generator: { ...event.payload.generator },
    totals: { ...event.payload.totals },
    reportEventId: event.id,
    streamId: event.streamId,
    occurredAt: event.context.occurredAt
  });
  projection.latestReportBySource.set(event.payload.sourceCollectionId, event.payload.legacyReportId);
}

function projectStagingApproval(
  projection: LegacyImportProjection,
  event: KnowledgeEventOf<"legacy.ontology.staging.approved">
): void {
  projection.stagingApprovals.set(event.payload.stagingBatchId, {
    ...event.payload,
    approvedAssertionCandidateIds: [...event.payload.approvedAssertionCandidateIds].sort(compareCodeUnits),
    approvedEventId: event.id,
    streamId: event.streamId,
    occurredAt: event.context.occurredAt
  });
}

function projectDiagnostic(
  projection: LegacyImportProjection,
  event: KnowledgeEventOf<"diagnostic.recorded">,
  sourceCollectionIdByStreamId: ReadonlyMap<string, string>
): void {
  const streamIdentity = inferLegacyStreamIdentity(event.streamId);
  const sourceCollectionId = sourceCollectionIdByStreamId.get(event.streamId)
    ?? streamIdentity?.sourceCollectionId
    ?? inferIngestionSourceStreamId(event.streamId);
  const diagnostic: LegacyDiagnosticReference = {
    diagnosticId: event.payload.diagnosticId,
    eventId: event.id,
    severity: event.payload.severity,
    category: event.payload.category,
    message: event.payload.message,
    streamId: event.streamId,
    occurredAt: event.context.occurredAt,
    ...(sourceCollectionId === undefined ? {} : { sourceCollectionId }),
    ...(streamIdentity?.scanBatchId === undefined ? {} : { scanBatchId: streamIdentity.scanBatchId }),
    ...(streamIdentity?.legacyReportId === undefined ? {} : { legacyReportId: streamIdentity.legacyReportId }),
    ...(streamIdentity?.stagingBatchId === undefined ? {} : { stagingBatchId: streamIdentity.stagingBatchId })
  };

  projection.diagnostics.set(diagnostic.diagnosticId, diagnostic);

  if (sourceCollectionId !== undefined) {
    appendUnique(projection.diagnosticsBySourceCollectionId, sourceCollectionId, diagnostic.diagnosticId);
  }
}

function inferLegacyStreamIdentity(streamId: string): {
  sourceCollectionId: string;
  scanBatchId: string;
  legacyReportId?: string;
  stagingBatchId?: string;
} | undefined {
  const reportMatch =
    /^legacy_report_(src_[a-zA-Z0-9_-]+)_(scan_[a-zA-Z0-9_-]+)_(legacy_report_[a-zA-Z0-9_-]+)$/.exec(streamId);

  if (reportMatch?.[1] !== undefined && reportMatch[2] !== undefined && reportMatch[3] !== undefined) {
    return {
      sourceCollectionId: reportMatch[1],
      scanBatchId: reportMatch[2],
      legacyReportId: reportMatch[3]
    };
  }

  const stagingMatch =
    /^legacy_staging_(src_[a-zA-Z0-9_-]+)_(scan_[a-zA-Z0-9_-]+)_(legacy_stage_[a-zA-Z0-9_-]+)$/.exec(streamId);

  if (stagingMatch?.[1] !== undefined && stagingMatch[2] !== undefined && stagingMatch[3] !== undefined) {
    return {
      sourceCollectionId: stagingMatch[1],
      scanBatchId: stagingMatch[2],
      stagingBatchId: stagingMatch[3]
    };
  }

  return undefined;
}

function inferIngestionSourceStreamId(streamId: string): string | undefined {
  const matched = /^ingestion_source_(src_[a-zA-Z0-9_-]+)$/.exec(streamId);
  return matched?.[1];
}

function sortDiagnosticIndexes(projection: LegacyImportProjection): void {
  for (const diagnosticIds of projection.diagnosticsBySourceCollectionId.values()) {
    diagnosticIds.sort(compareCodeUnits);
  }
}

function appendUnique(map: Map<string, string[]>, key: string, value: string): void {
  const values = map.get(key);

  if (values === undefined) {
    map.set(key, [value]);
    return;
  }

  if (!values.includes(value)) {
    values.push(value);
  }
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
