import {
  payloadSchemas,
  validateKnowledgeEvent,
  type KnowledgeEvent,
  type KnowledgeEventOf,
  type KnowledgeEventType
} from "../../ontology/src/contracts.js";

export type IngestionScanState = "started" | "completed";
export type IngestionParseJobState = "queued" | "running" | "succeeded" | "failed";
export type IngestionDiagnosticCategory = KnowledgeEventOf<"diagnostic.recorded">["payload"]["category"];

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

export type IngestionEvidenceSummary = KnowledgeEventOf<"evidence.ingested">["payload"] & {
  ingestedEventId: string;
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
  category: IngestionDiagnosticCategory;
  message: string;
  streamId: string;
  occurredAt: string;
  sourceCollectionId?: string;
  scanBatchId?: string;
  validationIssues?: Array<{
    path: string;
    message: string;
  }>;
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
  evidenceById: Map<string, IngestionEvidenceSummary>;
  evidenceLinks: Map<string, IngestionEvidenceLinkSummary>;
  evidenceByHash: Map<string, string>;
  parseJobs: Map<string, IngestionParseJobSummary>;
  providerApprovals: Map<string, IngestionProviderApprovalSummary>;
  diagnostics: Map<string, IngestionDiagnosticReference>;
  diagnosticsBySourceCollectionId: Map<string, string[]>;
}

export function buildIngestionProjection(events: readonly unknown[]): IngestionProjection {
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
    evidenceById: new Map(),
    evidenceLinks: new Map(),
    evidenceByHash: new Map(),
    parseJobs: new Map(),
    providerApprovals: new Map(),
    diagnostics: new Map(),
    diagnosticsBySourceCollectionId: new Map()
  };
  const scanIdByStreamId = new Map<string, string>();
  const sourceCollectionIdByStreamId = new Map<string, string>();

  for (const [index, rawEvent] of events.entries()) {
    const eventResult = validateKnowledgeEvent(rawEvent);

    if (!eventResult.success) {
      if (isKnownKnowledgeEventType(stringField(asRecord(rawEvent), "type"))) {
        projectValidationFailedEvent(
          projection,
          rawEvent,
          index,
          eventResult.error.issues,
          sourceCollectionIdByStreamId,
          scanIdByStreamId
        );
      } else {
        projectUnrecognizedEvent(projection, rawEvent, index, sourceCollectionIdByStreamId, scanIdByStreamId);
      }
      continue;
    }

    const event = eventResult.data;

    switch (event.type) {
      case "ingestion.source.registered":
        sourceCollectionIdByStreamId.set(event.streamId, event.payload.sourceCollectionId);
        projectSourceRegistered(projection, event);
        break;
      case "ingestion.scan.started":
        scanIdByStreamId.set(event.streamId, event.payload.scanBatchId);
        sourceCollectionIdByStreamId.set(event.streamId, event.payload.sourceCollectionId);
        projectScanStarted(projection, event);
        break;
      case "ingestion.occurrence.observed":
        scanIdByStreamId.set(event.streamId, event.payload.scanBatchId);
        sourceCollectionIdByStreamId.set(event.streamId, event.payload.sourceCollectionId);
        projectOccurrenceObserved(projection, event);
        break;
      case "ingestion.scan.completed":
        scanIdByStreamId.set(event.streamId, event.payload.scanBatchId);
        sourceCollectionIdByStreamId.set(event.streamId, event.payload.sourceCollectionId);
        projectScanCompleted(projection, event);
        break;
      case "ingestion.import.approved":
        scanIdByStreamId.set(event.streamId, event.payload.scanBatchId);
        sourceCollectionIdByStreamId.set(event.streamId, event.payload.sourceCollectionId);
        projectImportApproved(projection, event);
        break;
      case "ingestion.import.completed":
        scanIdByStreamId.set(event.streamId, event.payload.scanBatchId);
        sourceCollectionIdByStreamId.set(event.streamId, event.payload.sourceCollectionId);
        projectImportCompleted(projection, event);
        break;
      case "evidence.ingested":
        projectEvidenceIngested(projection, event);
        break;
      case "ingestion.evidence.linked":
        sourceCollectionIdByStreamId.set(event.streamId, event.payload.sourceCollectionId);
        projectEvidenceLinked(projection, event);
        break;
      case "ingestion.parse.job.created":
        sourceCollectionIdByStreamId.set(event.streamId, event.payload.sourceCollectionId);
        projectParseJobCreated(projection, event);
        break;
      case "ingestion.parse.completed":
        sourceCollectionIdByStreamId.set(event.streamId, event.payload.sourceCollectionId);
        projectParseCompleted(projection, event);
        break;
      case "ingestion.parse.failed":
        sourceCollectionIdByStreamId.set(event.streamId, event.payload.sourceCollectionId);
        projectParseFailed(projection, event);
        break;
      case "ingestion.provider.approved":
        sourceCollectionIdByStreamId.set(event.streamId, event.payload.sourceCollectionId);
        projectProviderApproved(projection, event);
        break;
      case "diagnostic.recorded":
        projectDiagnostic(projection, event, sourceCollectionIdByStreamId, scanIdByStreamId);
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

function projectEvidenceIngested(
  projection: IngestionProjection,
  event: KnowledgeEventOf<"evidence.ingested">
): void {
  if (projection.evidenceById.has(event.payload.evidenceId)) {
    return;
  }

  projection.evidenceById.set(event.payload.evidenceId, {
    ...event.payload,
    source: { ...event.payload.source },
    ingestedEventId: event.id
  });
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
  delete job.failedEventId;
  delete job.failedAt;
  delete job.message;
  delete job.retryable;
}

function projectParseFailed(projection: IngestionProjection, event: KnowledgeEventOf<"ingestion.parse.failed">): void {
  const job = upsertParseJob(projection, event);
  job.state = "failed";
  job.parser = { ...event.payload.parser };
  job.failedEventId = event.id;
  job.failedAt = event.payload.failedAt;
  job.message = event.payload.message;
  job.retryable = event.payload.retryable;
  delete job.completedEventId;
  delete job.completedAt;
  delete job.outputHash;
  delete job.outputMediaType;
}

function projectProviderApproved(
  projection: IngestionProjection,
  event: KnowledgeEventOf<"ingestion.provider.approved">
): void {
  projection.providerApprovals.set(providerApprovalProjectionKey(event.payload), {
    ...event.payload,
    provider: { ...event.payload.provider },
    eligibleMediaTypes: [...event.payload.eligibleMediaTypes].sort(compareCodeUnits),
    approvedEventId: event.id
  });
}

function providerApprovalProjectionKey(payload: KnowledgeEventOf<"ingestion.provider.approved">["payload"]): string {
  return `ingestion_provider_${payload.sourceCollectionId}_${payload.importBatchId}_${payload.providerJobId}`;
}

function projectDiagnostic(
  projection: IngestionProjection,
  event: KnowledgeEventOf<"diagnostic.recorded">,
  sourceCollectionIdByStreamId: ReadonlyMap<string, string>,
  scanIdByStreamId: ReadonlyMap<string, string>
): void {
  const scanBatchId = scanIdByStreamId.get(event.streamId) ?? inferScanBatchIdFromStreamId(event.streamId);
  const sourceCollectionId = sourceCollectionIdByStreamId.get(event.streamId)
    ?? inferSourceCollectionIdFromStreamId(event.streamId)
    ?? (scanBatchId === undefined ? undefined : projection.scans.get(scanBatchId)?.sourceCollectionId);
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

  addDiagnosticReference(projection, diagnostic);
}

function projectUnrecognizedEvent(
  projection: IngestionProjection,
  event: unknown,
  index: number,
  sourceCollectionIdByStreamId: ReadonlyMap<string, string>,
  scanIdByStreamId: ReadonlyMap<string, string>
): void {
  const eventRecord = asRecord(event);
  const eventId = stringField(eventRecord, "id") ?? `unknown_event_${index + 1}`;
  const streamId = stringField(eventRecord, "streamId") ?? `unknown_stream_${index + 1}`;
  const eventType = stringField(eventRecord, "type");
  const context = asRecord(eventRecord?.context);
  const payload = asRecord(eventRecord?.payload);
  const scanBatchId = stringField(payload, "scanBatchId")
    ?? scanIdByStreamId.get(streamId)
    ?? inferScanBatchIdFromStreamId(streamId);
  const sourceCollectionId = stringField(payload, "sourceCollectionId")
    ?? sourceCollectionIdByStreamId.get(streamId)
    ?? inferSourceCollectionIdFromStreamId(streamId)
    ?? (scanBatchId === undefined ? undefined : projection.scans.get(scanBatchId)?.sourceCollectionId);
  const diagnosticId = `diag_projection_unrecognized_${stableDiagnosticToken(eventId, index)}`;
  const diagnostic: IngestionDiagnosticReference = {
    diagnosticId,
    eventId,
    severity: "warning",
    category: "projection",
    message: eventType === undefined ? "Unrecognized event shape" : `Unrecognized event type ${eventType}`,
    streamId,
    occurredAt: stringField(context, "occurredAt") ?? "unknown",
    ...(sourceCollectionId === undefined ? {} : { sourceCollectionId }),
    ...(scanBatchId === undefined ? {} : { scanBatchId })
  };

  addDiagnosticReference(projection, diagnostic);
}

function projectValidationFailedEvent(
  projection: IngestionProjection,
  event: unknown,
  index: number,
  issues: readonly { path: readonly (string | number | symbol)[]; message: string }[],
  sourceCollectionIdByStreamId: ReadonlyMap<string, string>,
  scanIdByStreamId: ReadonlyMap<string, string>
): void {
  const eventRecord = asRecord(event);
  const eventId = stringField(eventRecord, "id") ?? `invalid_event_${index + 1}`;
  const streamId = stringField(eventRecord, "streamId") ?? `invalid_stream_${index + 1}`;
  const eventType = stringField(eventRecord, "type") as KnowledgeEventType;
  const context = asRecord(eventRecord?.context);
  const payload = asRecord(eventRecord?.payload);
  const scanBatchId = stringField(payload, "scanBatchId")
    ?? scanIdByStreamId.get(streamId)
    ?? inferScanBatchIdFromStreamId(streamId);
  const sourceCollectionId = stringField(payload, "sourceCollectionId")
    ?? sourceCollectionIdByStreamId.get(streamId)
    ?? inferSourceCollectionIdFromStreamId(streamId)
    ?? (scanBatchId === undefined ? undefined : projection.scans.get(scanBatchId)?.sourceCollectionId);
  const diagnostic: IngestionDiagnosticReference = {
    diagnosticId: `diag_projection_validation_${stableDiagnosticToken(eventId, index)}`,
    eventId,
    severity: "error",
    category: "validation",
    message: `Validation failed for event type ${eventType}`,
    streamId,
    occurredAt: stringField(context, "occurredAt") ?? "unknown",
    validationIssues: issues.map((issue) => ({
      path: diagnosticIssuePath(issue.path),
      message: issue.message
    })),
    ...(sourceCollectionId === undefined ? {} : { sourceCollectionId }),
    ...(scanBatchId === undefined ? {} : { scanBatchId })
  };

  addDiagnosticReference(projection, diagnostic);
}

function addDiagnosticReference(projection: IngestionProjection, diagnostic: IngestionDiagnosticReference): void {
  projection.diagnostics.set(diagnostic.diagnosticId, diagnostic);

  if (diagnostic.scanBatchId !== undefined && diagnostic.sourceCollectionId !== undefined) {
    const scan = projection.scans.get(diagnostic.scanBatchId);
    if (scan !== undefined) {
      appendUniqueToArray(scan.diagnosticIds, diagnostic.diagnosticId);
    }
  }

  if (diagnostic.sourceCollectionId !== undefined) {
    appendUnique(projection.diagnosticsBySourceCollectionId, diagnostic.sourceCollectionId, diagnostic.diagnosticId);
    const source = projection.sources.get(diagnostic.sourceCollectionId);
    if (source !== undefined) {
      appendUniqueToArray(source.diagnosticIds, diagnostic.diagnosticId);
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

function inferSourceCollectionIdFromStreamId(streamId: string): string | undefined {
  const sourceStream = /^ingestion_source_(src_[a-zA-Z0-9_-]+)$/.exec(streamId);
  if (sourceStream?.[1] !== undefined) {
    return sourceStream[1];
  }

  return sourceAndScanFromStreamId(streamId)?.sourceCollectionId;
}

function inferScanBatchIdFromStreamId(streamId: string): string | undefined {
  return sourceAndScanFromStreamId(streamId)?.scanBatchId;
}

function sourceAndScanFromStreamId(streamId: string): {
  sourceCollectionId: string;
  scanBatchId: string;
} | undefined {
  const encodedDiagnostic = encodedDiagnosticSourceAndScanFromStreamId(streamId);
  if (encodedDiagnostic !== undefined) {
    return encodedDiagnostic;
  }

  const streamPrefix = [
    "ingestion_import_",
    "ingestion_evidence_link_",
    "ingestion_diagnostic_"
  ].find((prefix) => streamId.startsWith(prefix));

  if (streamPrefix === undefined) {
    return undefined;
  }

  const body = streamId.slice(streamPrefix.length).replace(/_[a-f0-9]{64}$/, "");
  const importMarkerIndex = body.lastIndexOf("_imp_");

  if (importMarkerIndex < 0) {
    return undefined;
  }

  const sourceAndScan = body.slice(0, importMarkerIndex);
  const importBatchId = body.slice(importMarkerIndex + 1);
  const scanMarkerIndex = sourceAndScan.lastIndexOf("_scan_");

  if (scanMarkerIndex < 0) {
    return undefined;
  }

  const sourceCollectionId = sourceAndScan.slice(0, scanMarkerIndex);
  const scanBatchId = sourceAndScan.slice(scanMarkerIndex + 1);

  if (
    !isStreamIdSegment(sourceCollectionId, "src_")
    || !isStreamIdSegment(scanBatchId, "scan_")
    || !isStreamIdSegment(importBatchId, "imp_")
  ) {
    return undefined;
  }

  return {
    sourceCollectionId,
    scanBatchId
  };
}

function encodedDiagnosticSourceAndScanFromStreamId(streamId: string): {
  sourceCollectionId: string;
  scanBatchId: string;
} | undefined {
  const matched = /^ingestion_diagnostic_v1\.([a-zA-Z0-9_-]+)\.([a-zA-Z0-9_-]+)\.([a-zA-Z0-9_-]+)$/.exec(streamId);

  if (matched?.[1] === undefined || matched[2] === undefined || matched[3] === undefined) {
    return undefined;
  }

  const sourceCollectionId = decodeBase64Url(matched[1]);
  const scanBatchId = decodeBase64Url(matched[2]);
  const importBatchId = decodeBase64Url(matched[3]);

  if (
    sourceCollectionId === undefined ||
    scanBatchId === undefined ||
    importBatchId === undefined ||
    !isStreamIdSegment(sourceCollectionId, "src_") ||
    !isStreamIdSegment(scanBatchId, "scan_") ||
    !isStreamIdSegment(importBatchId, "imp_")
  ) {
    return undefined;
  }

  return {
    sourceCollectionId,
    scanBatchId
  };
}

function decodeBase64Url(value: string): string | undefined {
  try {
    return Buffer.from(value, "base64url").toString("utf8");
  } catch {
    return undefined;
  }
}

function isStreamIdSegment(value: string, prefix: "src_" | "scan_" | "imp_"): boolean {
  return value.startsWith(prefix) && /^[a-zA-Z0-9_-]+$/.test(value);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined;
}

function stringField(record: Record<string, unknown> | undefined, field: string): string | undefined {
  const value = record?.[field];
  return typeof value === "string" ? value : undefined;
}

function isKnownKnowledgeEventType(value: string | undefined): value is KnowledgeEventType {
  return value !== undefined && Object.hasOwn(payloadSchemas, value);
}

function stableDiagnosticToken(eventId: string, index: number): string {
  const safeToken = eventId.replaceAll(/[^a-zA-Z0-9_-]/g, "_");
  return safeToken.length === 0 ? `event_${index + 1}` : safeToken;
}

function diagnosticIssuePath(path: readonly (string | number | symbol)[]): string {
  if (path.length === 0) {
    return "$";
  }

  return path.map(String).join(".");
}
