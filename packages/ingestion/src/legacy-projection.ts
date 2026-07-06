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

interface DiagnosticStreamIdentity {
  sourceCollectionId?: string;
  scanBatchId?: string;
  legacyReportId?: string;
  stagingBatchId?: string;
}

export function buildLegacyImportProjection(events: readonly unknown[]): LegacyImportProjection {
  const projection: LegacyImportProjection = {
    reports: new Map(),
    latestReportBySource: new Map(),
    stagingApprovals: new Map(),
    diagnostics: new Map(),
    diagnosticsBySourceCollectionId: new Map()
  };
  const streamIdentityByStreamId = new Map<string, DiagnosticStreamIdentity>();

  for (const rawEvent of events) {
    const eventResult = validateKnowledgeEvent(rawEvent);

    if (!eventResult.success) {
      continue;
    }

    const event = eventResult.data;

    switch (event.type) {
      case "ingestion.source.registered":
        streamIdentityByStreamId.set(event.streamId, { sourceCollectionId: event.payload.sourceCollectionId });
        break;
      case "ingestion.scan.started":
      case "ingestion.occurrence.observed":
      case "ingestion.scan.completed":
        streamIdentityByStreamId.set(event.streamId, {
          sourceCollectionId: event.payload.sourceCollectionId,
          scanBatchId: event.payload.scanBatchId
        });
        break;
      case "legacy.import.report.generated":
        streamIdentityByStreamId.set(event.streamId, {
          sourceCollectionId: event.payload.sourceCollectionId,
          scanBatchId: event.payload.scanBatchId,
          legacyReportId: event.payload.legacyReportId
        });
        projectReport(projection, event);
        break;
      case "legacy.ontology.staging.approved":
        streamIdentityByStreamId.set(event.streamId, {
          sourceCollectionId: event.payload.sourceCollectionId,
          scanBatchId: event.payload.scanBatchId,
          legacyReportId: event.payload.legacyReportId,
          stagingBatchId: event.payload.stagingBatchId
        });
        projectStagingApproval(projection, event);
        break;
      case "diagnostic.recorded":
        projectDiagnostic(projection, event, streamIdentityByStreamId);
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
  streamIdentityByStreamId: ReadonlyMap<string, DiagnosticStreamIdentity>
): void {
  const streamIdentity = streamIdentityByStreamId.get(event.streamId) ?? inferNonLegacyStreamIdentity(event.streamId);
  const diagnostic: LegacyDiagnosticReference = {
    diagnosticId: event.payload.diagnosticId,
    eventId: event.id,
    severity: event.payload.severity,
    category: event.payload.category,
    message: event.payload.message,
    streamId: event.streamId,
    occurredAt: event.context.occurredAt,
    ...(streamIdentity?.sourceCollectionId === undefined ? {} : { sourceCollectionId: streamIdentity.sourceCollectionId }),
    ...(streamIdentity?.scanBatchId === undefined ? {} : { scanBatchId: streamIdentity.scanBatchId }),
    ...(streamIdentity?.legacyReportId === undefined ? {} : { legacyReportId: streamIdentity.legacyReportId }),
    ...(streamIdentity?.stagingBatchId === undefined ? {} : { stagingBatchId: streamIdentity.stagingBatchId })
  };

  projection.diagnostics.set(diagnostic.diagnosticId, diagnostic);

  if (streamIdentity?.sourceCollectionId !== undefined) {
    appendUnique(projection.diagnosticsBySourceCollectionId, streamIdentity.sourceCollectionId, diagnostic.diagnosticId);
  }
}

function inferNonLegacyStreamIdentity(streamId: string): DiagnosticStreamIdentity | undefined {
  const matched = /^ingestion_source_(src_[a-zA-Z0-9_-]+)$/.exec(streamId);

  if (matched?.[1] === undefined) {
    return undefined;
  }

  return { sourceCollectionId: matched[1] };
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
