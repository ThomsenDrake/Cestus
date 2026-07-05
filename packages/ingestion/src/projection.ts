import type { KnowledgeEvent, KnowledgeEventOf } from "../../ontology/src/contracts.js";

export type IngestionScanState = "started" | "completed";
export type IngestionParseJobState = "queued" | "running" | "succeeded" | "failed";

export interface IngestionSourceSummary {
  sourceCollectionId: string;
  label: string;
  mode: "read-only";
  adapter: { name: string; version: string };
  rootUri: string;
  workspaceUri: string;
  registeredEventId: string;
  latestScanBatchId?: string;
  latestImportBatchId?: string;
  scanBatchIds: string[];
  importBatchIds: string[];
  diagnosticIds: string[];
}

export interface IngestionScanSummary {
  scanBatchId: string;
  sourceCollectionId: string;
  state: IngestionScanState;
  hashPolicy?: string;
  startedAt?: string;
  completedAt?: string;
  inventoryHash?: string;
  totals?: KnowledgeEventOf<"ingestion.scan.completed">["payload"]["totals"];
  occurrenceIds: string[];
  diagnosticIds: string[];
}

export type IngestionOccurrenceSummary = KnowledgeEventOf<"ingestion.occurrence.observed">["payload"] & {
  observedEventId: string;
};

export type IngestionImportApprovalSummary = KnowledgeEventOf<"ingestion.import.approved">["payload"] & {
  approvedEventId: string;
};

export type IngestionImportCompletionSummary = KnowledgeEventOf<"ingestion.import.completed">["payload"] & {
  completedEventId: string;
};

export type IngestionEvidenceLinkSummary = KnowledgeEventOf<"ingestion.evidence.linked">["payload"] & {
  linkedEventId: string;
};

export interface IngestionParseJobSummary {
  parseJobId: string;
  sourceCollectionId: string;
  importBatchId: string;
  evidenceId: string;
  lane: "local" | "provider";
  parser: { name: string; version: string };
  state: IngestionParseJobState;
  createdEventId?: string;
  completedEventId?: string;
  failedEventId?: string;
  outputHash?: string;
  outputMediaType?: string;
  completedAt?: string;
  failedAt?: string;
  message?: string;
  retryable?: boolean;
}

export type IngestionProviderApprovalSummary = KnowledgeEventOf<"ingestion.provider.approved">["payload"] & {
  approvedEventId: string;
};

export interface IngestionDiagnosticReference {
  diagnosticId: string;
  eventId: string;
  severity: "info" | "warning" | "error";
  category: "ingestion" | "validation" | "projection" | "migration" | "deduplication";
  message: string;
  streamId: string;
  occurredAt: string;
  sourceCollectionId?: string;
  scanBatchId?: string;
}

export interface IngestionProjection {
  sources: Map<string, IngestionSourceSummary>;
  scans: Map<string, IngestionScanSummary>;
  occurrencesById: Map<string, IngestionOccurrenceSummary>;
  occurrencesByHash: Map<string, string[]>;
  duplicatesByHash: Map<string, string[]>;
  importApprovals: Map<string, IngestionImportApprovalSummary>;
  importApprovalsByScanBatchId: Map<string, string[]>;
  importCompletions: Map<string, IngestionImportCompletionSummary>;
  importCompletionsByScanBatchId: Map<string, string[]>;
  evidenceLinks: Map<string, IngestionEvidenceLinkSummary>;
  evidenceByHash: Map<string, string>;
  parseJobs: Map<string, IngestionParseJobSummary>;
  providerApprovals: Map<string, IngestionProviderApprovalSummary>;
  diagnostics: Map<string, IngestionDiagnosticReference>;
  diagnosticsBySourceCollectionId: Map<string, string[]>;
}

export function buildIngestionProjection(events: readonly KnowledgeEvent[]): IngestionProjection {
  const projection: IngestionProjection = {
    sources: new Map(),
    scans: new Map(),
    occurrencesById: new Map(),
    occurrencesByHash: new Map(),
    duplicatesByHash: new Map(),
    importApprovals: new Map(),
    importApprovalsByScanBatchId: new Map(),
    importCompletions: new Map(),
    importCompletionsByScanBatchId: new Map(),
    evidenceLinks: new Map(),
    evidenceByHash: new Map(),
    parseJobs: new Map(),
    providerApprovals: new Map(),
    diagnostics: new Map(),
    diagnosticsBySourceCollectionId: new Map()
  };
  const scanIdByStreamId = new Map<string, string>();

  for (const event of events) {
    switch (event.type) {
      case "ingestion.source.registered":
        projectSourceRegistered(projection, event);
        break;
      case "ingestion.scan.started":
        scanIdByStreamId.set(event.streamId, event.payload.scanBatchId);
        projectScanStarted(projection, event);
        break;
      case "ingestion.occurrence.observed":
        scanIdByStreamId.set(event.streamId, event.payload.scanBatchId);
        projectOccurrenceObserved(projection, event);
        break;
      case "ingestion.scan.completed":
        scanIdByStreamId.set(event.streamId, event.payload.scanBatchId);
        projectScanCompleted(projection, event);
        break;
      case "ingestion.import.approved":
        projectImportApproved(projection, event);
        break;
      case "ingestion.import.completed":
        projectImportCompleted(projection, event);
        break;
      case "ingestion.evidence.linked":
        projectEvidenceLinked(projection, event);
        break;
      case "ingestion.parse.job.created":
        projectParseJobCreated(projection, event);
        break;
      case "ingestion.parse.completed":
        projectParseCompleted(projection, event);
        break;
      case "ingestion.parse.failed":
        projectParseFailed(projection, event);
        break;
      case "ingestion.provider.approved":
        projectProviderApproved(projection, event);
        break;
      case "diagnostic.recorded":
        projectDiagnostic(projection, event, scanIdByStreamId);
        break;
      default:
        break;
    }
  }

  finalizeOccurrenceGroups(projection);
  return projection;
}

function projectSourceRegistered(
  projection: IngestionProjection,
  event: KnowledgeEventOf<"ingestion.source.registered">
): void {
  const existing = projection.sources.get(event.payload.sourceCollectionId);
  projection.sources.set(event.payload.sourceCollectionId, {
    sourceCollectionId: event.payload.sourceCollectionId,
    label: event.payload.label,
    mode: event.payload.mode,
    adapter: { ...event.payload.adapter },
    rootUri: event.payload.rootUri,
    workspaceUri: event.payload.workspaceUri,
    registeredEventId: event.id,
    ...(existing?.latestScanBatchId === undefined ? {} : { latestScanBatchId: existing.latestScanBatchId }),
    ...(existing?.latestImportBatchId === undefined ? {} : { latestImportBatchId: existing.latestImportBatchId }),
    scanBatchIds: existing?.scanBatchIds ?? [],
    importBatchIds: existing?.importBatchIds ?? [],
    diagnosticIds: existing?.diagnosticIds ?? []
  });
}

function projectScanStarted(projection: IngestionProjection, event: KnowledgeEventOf<"ingestion.scan.started">): void {
  const scan = upsertScan(projection, event.payload.sourceCollectionId, event.payload.scanBatchId);
  scan.state = "started";
  scan.hashPolicy = event.payload.hashPolicy;
  scan.startedAt = event.payload.startedAt;
  rememberSourceScan(projection, event.payload.sourceCollectionId, event.payload.scanBatchId);
}

function projectOccurrenceObserved(
  projection: IngestionProjection,
  event: KnowledgeEventOf<"ingestion.occurrence.observed">
): void {
  const occurrence = {
    ...event.payload,
    adapter: event.payload.adapter === undefined ? undefined : { ...event.payload.adapter },
    archiveAdapter: event.payload.archiveAdapter === undefined ? undefined : { ...event.payload.archiveAdapter },
    observedEventId: event.id
  };
  projection.occurrencesById.set(event.payload.occurrenceId, occurrence);
  appendUnique(projection.occurrencesByHash, event.payload.contentHash, event.payload.occurrenceId);
  appendUniqueToArray(upsertScan(
    projection,
    event.payload.sourceCollectionId,
    event.payload.scanBatchId
  ).occurrenceIds, event.payload.occurrenceId);
  rememberSourceScan(projection, event.payload.sourceCollectionId, event.payload.scanBatchId);
}

function projectScanCompleted(projection: IngestionProjection, event: KnowledgeEventOf<"ingestion.scan.completed">): void {
  const scan = upsertScan(projection, event.payload.sourceCollectionId, event.payload.scanBatchId);
  scan.state = "completed";
  scan.completedAt = event.payload.completedAt;
  scan.inventoryHash = event.payload.inventoryHash;
  scan.totals = { ...event.payload.totals };
  rememberSourceScan(projection, event.payload.sourceCollectionId, event.payload.scanBatchId);
}

function projectImportApproved(
  projection: IngestionProjection,
  event: KnowledgeEventOf<"ingestion.import.approved">
): void {
  projection.importApprovals.set(event.payload.importBatchId, {
    ...event.payload,
    approvedEventId: event.id
  });
  appendUnique(projection.importApprovalsByScanBatchId, event.payload.scanBatchId, event.payload.importBatchId);
  rememberSourceImport(projection, event.payload.sourceCollectionId, event.payload.importBatchId);
}

function projectImportCompleted(
  projection: IngestionProjection,
  event: KnowledgeEventOf<"ingestion.import.completed">
): void {
  projection.importCompletions.set(event.payload.importBatchId, {
    ...event.payload,
    totals: { ...event.payload.totals },
    completedEventId: event.id
  });
  appendUnique(projection.importCompletionsByScanBatchId, event.payload.scanBatchId, event.payload.importBatchId);
  rememberSourceImport(projection, event.payload.sourceCollectionId, event.payload.importBatchId);
}

function projectEvidenceLinked(
  projection: IngestionProjection,
  event: KnowledgeEventOf<"ingestion.evidence.linked">
): void {
  projection.evidenceLinks.set(event.id, {
    ...event.payload,
    occurrenceIds: [...event.payload.occurrenceIds].sort(compareCodeUnits),
    linkedEventId: event.id
  });
  projection.evidenceByHash.set(event.payload.contentHash, event.payload.evidenceId);
}

function projectParseJobCreated(
  projection: IngestionProjection,
  event: KnowledgeEventOf<"ingestion.parse.job.created">
): void {
  projection.parseJobs.set(event.payload.parseJobId, {
    parseJobId: event.payload.parseJobId,
    sourceCollectionId: event.payload.sourceCollectionId,
    importBatchId: event.payload.importBatchId,
    evidenceId: event.payload.evidenceId,
    lane: event.payload.lane,
    parser: { ...event.payload.parser },
    state: event.payload.state,
    createdEventId: event.id
  });
}

function projectParseCompleted(projection: IngestionProjection, event: KnowledgeEventOf<"ingestion.parse.completed">): void {
  const job = upsertParseJob(projection, event);
  job.state = "succeeded";
  job.parser = { ...event.payload.parser };
  job.completedEventId = event.id;
  job.outputHash = event.payload.outputHash;
  job.outputMediaType = event.payload.outputMediaType;
  job.completedAt = event.payload.completedAt;
}

function projectParseFailed(projection: IngestionProjection, event: KnowledgeEventOf<"ingestion.parse.failed">): void {
  const job = upsertParseJob(projection, event);
  job.state = "failed";
  job.parser = { ...event.payload.parser };
  job.failedEventId = event.id;
  job.failedAt = event.payload.failedAt;
  job.message = event.payload.message;
  job.retryable = event.payload.retryable;
}

function projectProviderApproved(
  projection: IngestionProjection,
  event: KnowledgeEventOf<"ingestion.provider.approved">
): void {
  projection.providerApprovals.set(event.payload.providerJobId, {
    ...event.payload,
    provider: { ...event.payload.provider },
    eligibleMediaTypes: [...event.payload.eligibleMediaTypes].sort(compareCodeUnits),
    approvedEventId: event.id
  });
}

function projectDiagnostic(
  projection: IngestionProjection,
  event: KnowledgeEventOf<"diagnostic.recorded">,
  scanIdByStreamId: ReadonlyMap<string, string>
): void {
  const scanBatchId = scanIdByStreamId.get(event.streamId);
  const sourceCollectionId = scanBatchId === undefined
    ? undefined
    : projection.scans.get(scanBatchId)?.sourceCollectionId;
  const diagnostic: IngestionDiagnosticReference = {
    diagnosticId: event.payload.diagnosticId,
    eventId: event.id,
    severity: event.payload.severity,
    category: event.payload.category,
    message: event.payload.message,
    streamId: event.streamId,
    occurredAt: event.context.occurredAt,
    ...(sourceCollectionId === undefined ? {} : { sourceCollectionId }),
    ...(scanBatchId === undefined ? {} : { scanBatchId })
  };

  projection.diagnostics.set(event.payload.diagnosticId, diagnostic);

  if (scanBatchId !== undefined) {
    appendUniqueToArray(upsertScan(projection, sourceCollectionId ?? "src_unknown", scanBatchId).diagnosticIds, event.payload.diagnosticId);
  }

  if (sourceCollectionId !== undefined) {
    appendUnique(projection.diagnosticsBySourceCollectionId, sourceCollectionId, event.payload.diagnosticId);
    const source = projection.sources.get(sourceCollectionId);
    if (source !== undefined) {
      appendUniqueToArray(source.diagnosticIds, event.payload.diagnosticId);
    }
  }
}

function upsertScan(projection: IngestionProjection, sourceCollectionId: string, scanBatchId: string): IngestionScanSummary {
  const existing = projection.scans.get(scanBatchId);

  if (existing !== undefined) {
    return existing;
  }

  const scan: IngestionScanSummary = {
    scanBatchId,
    sourceCollectionId,
    state: "started",
    occurrenceIds: [],
    diagnosticIds: []
  };
  projection.scans.set(scanBatchId, scan);
  return scan;
}

function upsertParseJob(
  projection: IngestionProjection,
  event: KnowledgeEventOf<"ingestion.parse.completed"> | KnowledgeEventOf<"ingestion.parse.failed">
): IngestionParseJobSummary {
  const existing = projection.parseJobs.get(event.payload.parseJobId);

  if (existing !== undefined) {
    return existing;
  }

  const job: IngestionParseJobSummary = {
    parseJobId: event.payload.parseJobId,
    sourceCollectionId: event.payload.sourceCollectionId,
    importBatchId: event.payload.importBatchId,
    evidenceId: event.payload.evidenceId,
    lane: event.payload.lane,
    parser: { ...event.payload.parser },
    state: "running"
  };
  projection.parseJobs.set(event.payload.parseJobId, job);
  return job;
}

function rememberSourceScan(projection: IngestionProjection, sourceCollectionId: string, scanBatchId: string): void {
  const source = projection.sources.get(sourceCollectionId);

  if (source === undefined) {
    return;
  }

  appendUniqueToArray(source.scanBatchIds, scanBatchId);
  source.latestScanBatchId = scanBatchId;
}

function rememberSourceImport(projection: IngestionProjection, sourceCollectionId: string, importBatchId: string): void {
  const source = projection.sources.get(sourceCollectionId);

  if (source === undefined) {
    return;
  }

  appendUniqueToArray(source.importBatchIds, importBatchId);
  source.latestImportBatchId = importBatchId;
}

function finalizeOccurrenceGroups(projection: IngestionProjection): void {
  const sortedEntries = [...projection.occurrencesByHash.entries()]
    .map(([hash, occurrenceIds]) => [hash, [...occurrenceIds].sort(compareCodeUnits)] as const)
    .sort(([left], [right]) => compareCodeUnits(left, right));

  projection.occurrencesByHash = new Map(sortedEntries);
  projection.duplicatesByHash = new Map(
    sortedEntries.filter(([, occurrenceIds]) => occurrenceIds.length > 1)
  );

  for (const source of projection.sources.values()) {
    source.scanBatchIds.sort(compareCodeUnits);
    source.importBatchIds.sort(compareCodeUnits);
    source.diagnosticIds.sort(compareCodeUnits);
  }

  for (const scan of projection.scans.values()) {
    scan.occurrenceIds.sort(compareCodeUnits);
    scan.diagnosticIds.sort(compareCodeUnits);
  }
}

function appendUnique(map: Map<string, string[]>, key: string, value: string): void {
  const values = map.get(key);

  if (values === undefined) {
    map.set(key, [value]);
    return;
  }

  appendUniqueToArray(values, value);
}

function appendUniqueToArray(values: string[], value: string): void {
  if (!values.includes(value)) {
    values.push(value);
  }
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
