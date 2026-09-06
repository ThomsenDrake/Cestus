import {
  validateKnowledgeEvent,
  type KnowledgeEvent,
  type KnowledgeEventOf
} from "../../ontology/src/contracts.js";
import {
  containsCredentialShapedEvidenceText,
  evaluateEvidenceProposalEligibility
} from "../../ontology/src/evidence-service.js";
import { buildGovernanceProjection } from "../../ontology/src/governance-projection.js";
import { governanceRationaleForDisplay } from "../../ontology/src/governance-read-model.js";
import type {
  IngestionDiagnosticReference,
  IngestionEvidenceLinkSummary,
  IngestionOccurrenceSummary,
  IngestionProjection
} from "./projection.js";
import { buildIngestionProjection } from "./projection.js";

export interface EvidenceWorkspaceDto {
  readonly schemaVersion: "evidence-workspace.v1";
  readonly status: "ready" | "degraded";
  readonly sourceHighWaterMark: number;
  readonly items: readonly EvidenceItemDto[];
  readonly assertionCandidates: readonly EvidenceAssertionCandidateDto[];
  readonly diagnostics: readonly EvidenceWorkspaceDiagnosticDto[];
}

export interface EvidenceItemDto {
  readonly evidenceId: string;
  readonly contentHash?: string;
  readonly mediaType?: string;
  readonly sizeBytes?: number;
  readonly source?: {
    readonly kind: string;
    readonly label: string;
  };
  readonly sourceCollections: ReadonlyArray<{
    readonly sourceCollectionId: string;
    readonly label: string;
  }>;
  readonly importBatchIds: readonly string[];
  readonly occurrences: readonly EvidenceOccurrenceDto[];
  readonly parseJobs: readonly EvidenceParseJobDto[];
  readonly governanceTags: readonly EvidenceGovernanceTagDto[];
  readonly quarantined: boolean;
  readonly quarantineLockLevels: readonly ("workflow" | "export" | "all")[];
  readonly tombstoned: boolean;
  readonly linkedReferences: readonly EvidenceLinkedReferenceDto[];
  readonly provenanceComplete: boolean;
  readonly selectableForAssertionCandidate: boolean;
  readonly blockingReasons: readonly string[];
}

export interface EvidenceOccurrenceDto {
  readonly occurrenceId: string;
  readonly sourceCollectionId: string;
  readonly scanBatchId: string;
  readonly sourcePath: string;
  readonly contentHash: string;
  readonly sizeBytes: number;
  readonly status: "new" | "duplicate" | "changed" | "missing" | "skipped";
  readonly adapter?: { readonly name: string; readonly version: string };
  readonly archive?: {
    readonly containerPath: string;
    readonly containerHash: string;
    readonly internalPath: string;
    readonly adapter: { readonly name: string; readonly version: string };
  };
}

export interface EvidenceParseJobDto {
  readonly parseJobId: string;
  readonly sourceCollectionId: string;
  readonly importBatchId: string;
  readonly lane: "local" | "provider";
  readonly parser: { readonly name: string; readonly version: string };
  readonly state: "queued" | "running" | "succeeded" | "failed";
  readonly coverageStatus?: "complete" | "partial";
  readonly derivative?: {
    readonly contentHash: string;
    readonly mediaType: string;
  };
}

export interface EvidenceGovernanceTagDto {
  readonly tag: string;
  readonly confidence: number;
  readonly rationale: string;
  readonly source: "ai" | "human";
  readonly status: "active" | "removed";
  readonly eventId: string;
}

export interface EvidenceLinkedReferenceDto {
  readonly kind: "prr" | "investigation";
  readonly id: string;
  readonly eventIds: readonly string[];
}

export interface EvidenceAssertionCandidateDto {
  readonly assertionId: string;
  readonly evidenceReferences: ReadonlyArray<{
    readonly evidenceId: string;
    readonly contentHash: string;
    readonly eventIds: readonly string[];
  }>;
  readonly predicate: string;
  readonly confidence: number;
  readonly reviewState: "proposed";
  readonly reviewRequired: true;
  readonly eventId: string;
}

export interface EvidenceWorkspaceDiagnosticDto {
  readonly code: "projection-error" | "missing-provenance" | "secret-safety";
  readonly severity: "warning" | "error";
  readonly message: string;
  readonly repairActions: readonly string[];
}

export function buildEvidenceWorkspaceDto(rawEvents: readonly unknown[]): EvidenceWorkspaceDto {
  const projection = buildIngestionProjection(rawEvents);
  const events = validKnowledgeEvents(rawEvents);
  const governance = buildGovernanceProjection(events);
  const evidenceIds = new Set([
    ...projection.evidenceById.keys(),
    ...[...projection.evidenceLinks.values()].map((link) => link.evidenceId)
  ]);
  let secretSafetyViolation = false;
  const items = [...evidenceIds]
    .sort(compareCodeUnits)
    .map((evidenceId): EvidenceItemDto | undefined => {
      const evidence = projection.evidenceById.get(evidenceId);
      const links = [...projection.evidenceLinks.values()]
        .filter((link) => link.evidenceId === evidenceId)
        .sort((left, right) => compareCodeUnits(left.linkedEventId, right.linkedEventId));
      const state = governance.evidenceGovernance.get(evidenceId);
      const eligibility = evaluateEvidenceProposalEligibility(events, evidenceId);
      const occurrenceIds = sortedUnique([
        ...links.flatMap((link) => link.occurrenceIds),
        ...eligibility.reconciledOccurrenceIds
      ]);
      const quarantineLockLevels = quarantineLockLevelsForEvidence(events, evidenceId);

      if (state?.tombstoned === true || quarantineLockLevels.includes("all")) {
        return undefined;
      }

      const item: EvidenceItemDto = {
        evidenceId,
        ...(evidence?.contentHash === undefined
          ? links[0]?.contentHash === undefined ? {} : { contentHash: links[0].contentHash }
          : { contentHash: evidence.contentHash }),
        ...(evidence?.mediaType === undefined ? {} : { mediaType: evidence.mediaType }),
        ...(evidence?.sizeBytes === undefined ? {} : { sizeBytes: evidence.sizeBytes }),
        ...(evidence?.source === undefined
          ? {}
          : { source: { kind: evidence.source.kind, label: evidence.source.label } }),
        sourceCollections: sourceCollectionsForLinks(projection, links),
        importBatchIds: sortedUnique(links.map((link) => link.importBatchId)),
        occurrences: occurrenceIds
          .map((occurrenceId) => projection.occurrencesById.get(occurrenceId))
          .filter((occurrence): occurrence is IngestionOccurrenceSummary => occurrence !== undefined)
          .map(evidenceOccurrenceDto),
        parseJobs: [...projection.parseJobs.values()]
          .filter((job) => job.evidenceId === evidenceId)
          .sort((left, right) => compareCodeUnits(left.parseJobId, right.parseJobId))
          .map((job) => ({
            parseJobId: job.parseJobId,
            sourceCollectionId: job.sourceCollectionId,
            importBatchId: job.importBatchId,
            lane: job.lane,
            parser: { ...job.parser },
            state: job.state,
            ...(job.coverageStatus === undefined ? {} : { coverageStatus: job.coverageStatus }),
            ...(job.outputHash === undefined || job.outputMediaType === undefined
              ? {}
              : { derivative: { contentHash: job.outputHash, mediaType: job.outputMediaType } })
          })),
        governanceTags: [...(state?.currentTags.values() ?? [])]
          .sort((left, right) => compareCodeUnits(left.tag, right.tag))
          .map((tag) => {
            const rationale = governanceRationaleForDisplay(tag.rationale);
            if (rationale !== tag.rationale) {
              secretSafetyViolation = true;
            }
            return { ...tag, rationale };
          }),
        quarantined: state?.quarantined === true,
        quarantineLockLevels,
        tombstoned: false,
        linkedReferences: linkedReferences(
          events,
          evidenceId,
          eligibility.provenanceEventIds,
          evidence?.contentHash ?? links[0]?.contentHash
        ),
        provenanceComplete: eligibility.provenanceComplete,
        selectableForAssertionCandidate: eligibility.selectable,
        blockingReasons: [...eligibility.blockingReasons]
      };
      if (containsCredentialShapedValue(item)) {
        secretSafetyViolation = true;
        return undefined;
      }
      return item;
    })
    .filter((item): item is EvidenceItemDto => item !== undefined);
  const visibleEvidenceIds = new Set(items.map((item) => item.evidenceId));
  const candidates = assertionCandidates(events, projection)
    .filter((candidate) => visibleEvidenceIds.has(candidate.evidenceReferences[0]?.evidenceId ?? ""))
    .filter((candidate) => {
      if (!containsCredentialShapedValue(candidate)) {
        return true;
      }
      secretSafetyViolation = true;
      return false;
    });
  const diagnostics: EvidenceWorkspaceDiagnosticDto[] = [
    ...[...projection.diagnostics.values()]
      .sort((left, right) => compareCodeUnits(left.diagnosticId, right.diagnosticId))
      .map((diagnostic) => ({
        code: "projection-error" as const,
        severity: diagnostic.severity === "error" ? "error" as const : "warning" as const,
        message: "An evidence ledger event could not be projected safely.",
        repairActions: ["inspect the local evidence ledger", "repair or supersede the invalid event"]
      })),
    ...items
      .filter((item) => !item.provenanceComplete)
      .map((item) => ({
        code: "missing-provenance" as const,
        severity: "error" as const,
        message: "An evidence item is missing required ingestion provenance.",
        repairActions: ["inspect the source occurrence and import lineage", "repair the projection from the ledger"]
      })),
    ...(secretSafetyViolation
      ? [{
          code: "secret-safety" as const,
          severity: "error" as const,
          message: "Unsafe evidence metadata was omitted from the browser workspace.",
          repairActions: ["inspect the local evidence ledger", "supersede unsafe metadata with a sanitized event"]
        }]
      : [])
  ];

  return {
    schemaVersion: "evidence-workspace.v1",
    status: diagnostics.length === 0 ? "ready" : "degraded",
    sourceHighWaterMark: rawEvents.length,
    items,
    assertionCandidates: candidates,
    diagnostics
  };
}

export interface IngestionReviewDuplicateGroupDto {
  contentHash: string;
  occurrenceCount: number;
  occurrenceIds: string[];
  sourcePaths: string[];
  evidenceId?: string;
}

export interface IngestionReviewDto {
  sourceCollectionId: string;
  label: string;
  latestScanBatchId?: string;
  latestImportBatchId?: string;
  totals: {
    observedFiles: number;
    uniqueContent: number;
    duplicateOccurrences: number;
    skipped: number;
    bytes: number;
    estimatedNewBlobBytes: number;
  };
  approvalRequired: boolean;
  importCompleted?: boolean;
  approvedImportBatchId?: string;
  files?: Array<{ occurrenceId: string; sourcePath: string; contentHash: string; byteLength: number; status: IngestionOccurrenceSummary["status"] }>;
  duplicateGroups: IngestionReviewDuplicateGroupDto[];
  evidenceLinks: Array<{
    contentHash: string;
    evidenceId: string;
    occurrenceIds: string[];
  }>;
  parseJobs: Array<{
    parseJobId: string;
    evidenceId: string;
    lane: "local" | "provider";
    parser: { name: string; version: string };
    state: "queued" | "running" | "succeeded" | "failed";
    coverageStatus?: "complete" | "partial";
  }>;
  diagnostics: Array<{
    diagnosticId: string;
    severity: "info" | "warning" | "error";
    category: IngestionDiagnosticReference["category"];
    message: string;
  }>;
}

export function buildIngestionReviewDto(
  projection: IngestionProjection,
  sourceCollectionId: string
): IngestionReviewDto {
  const source = projection.sources.get(sourceCollectionId);

  if (source === undefined) {
    throw new Error(`Unknown source collection ${sourceCollectionId}`);
  }

  const latestScan = source.latestScanBatchId === undefined
    ? undefined
    : projection.scans.get(source.latestScanBatchId);
  const approvalBatchIds = source.latestScanBatchId === undefined
    ? []
    : projection.importApprovalsByScanBatchId.get(source.latestScanBatchId) ?? [];
  const completionBatchIds = source.latestScanBatchId === undefined
    ? []
    : projection.importCompletionsByScanBatchId.get(source.latestScanBatchId) ?? [];

  return {
    sourceCollectionId,
    label: source.label,
    ...(source.latestScanBatchId === undefined ? {} : { latestScanBatchId: source.latestScanBatchId }),
    ...(source.latestImportBatchId === undefined ? {} : { latestImportBatchId: source.latestImportBatchId }),
    totals: copyTotals(latestScan?.totals),
    approvalRequired: latestScan?.state === "completed" && approvalBatchIds.length === 0,
    importCompleted: completionBatchIds.length > 0,
    ...(approvalBatchIds.at(-1) === undefined ? {} : { approvedImportBatchId: approvalBatchIds.at(-1)! }),
    files: (latestScan?.occurrenceIds ?? []).map((id) => projection.occurrencesById.get(id)).filter((occurrence): occurrence is IngestionOccurrenceSummary => occurrence !== undefined).map((occurrence) => ({ occurrenceId: occurrence.occurrenceId, sourcePath: occurrence.sourcePath, contentHash: occurrence.contentHash, byteLength: occurrence.sizeBytes, status: occurrence.status })),
    duplicateGroups: duplicateGroupsForSource(projection, sourceCollectionId),
    evidenceLinks: evidenceLinksForSource(projection, sourceCollectionId),
    parseJobs: parseJobsForSource(projection, sourceCollectionId),
    diagnostics: diagnosticsForSource(projection, sourceCollectionId)
  };
}

function copyTotals(totals: IngestionReviewDto["totals"] | undefined): IngestionReviewDto["totals"] {
  if (totals === undefined) {
    return {
      observedFiles: 0,
      uniqueContent: 0,
      duplicateOccurrences: 0,
      skipped: 0,
      bytes: 0,
      estimatedNewBlobBytes: 0
    };
  }

  return { ...totals };
}

function duplicateGroupsForSource(
  projection: IngestionProjection,
  sourceCollectionId: string
): IngestionReviewDuplicateGroupDto[] {
  return [...projection.duplicatesByHash.entries()]
    .map(([contentHash, occurrenceIds]) => {
      const sourceOccurrences = occurrenceIds
        .map((occurrenceId) => projection.occurrencesById.get(occurrenceId))
        .filter((occurrence): occurrence is IngestionOccurrenceSummary =>
          occurrence !== undefined && occurrence.sourceCollectionId === sourceCollectionId
        );

      if (sourceOccurrences.length < 2) {
        return undefined;
      }

      return {
        contentHash,
        occurrenceCount: sourceOccurrences.length,
        occurrenceIds: sourceOccurrences.map((occurrence) => occurrence.occurrenceId).sort(compareCodeUnits),
        sourcePaths: sourceOccurrences.map((occurrence) => occurrence.sourcePath).sort(compareCodeUnits),
        ...(projection.evidenceByHash.get(contentHash) === undefined
          ? {}
          : { evidenceId: projection.evidenceByHash.get(contentHash) })
      };
    })
    .filter((group): group is IngestionReviewDuplicateGroupDto => group !== undefined)
    .sort((left, right) => compareCodeUnits(left.contentHash, right.contentHash));
}

function evidenceLinksForSource(
  projection: IngestionProjection,
  sourceCollectionId: string
): IngestionReviewDto["evidenceLinks"] {
  return [...projection.evidenceLinks.values()]
    .filter((link) => link.sourceCollectionId === sourceCollectionId)
    .map((link) => ({
      contentHash: link.contentHash,
      evidenceId: link.evidenceId,
      occurrenceIds: [...link.occurrenceIds].sort(compareCodeUnits)
    }))
    .sort((left, right) => compareCodeUnits(left.contentHash, right.contentHash));
}

function parseJobsForSource(
  projection: IngestionProjection,
  sourceCollectionId: string
): IngestionReviewDto["parseJobs"] {
  return [...projection.parseJobs.values()]
    .filter((job) => job.sourceCollectionId === sourceCollectionId)
    .map((job) => ({
      parseJobId: job.parseJobId,
      evidenceId: job.evidenceId,
      lane: job.lane,
      parser: { ...job.parser },
      state: job.state,
      ...(job.coverageStatus === undefined ? {} : { coverageStatus: job.coverageStatus })
    }))
    .sort((left, right) => compareCodeUnits(left.parseJobId, right.parseJobId));
}

function diagnosticsForSource(
  projection: IngestionProjection,
  sourceCollectionId: string
): IngestionReviewDto["diagnostics"] {
  const diagnosticIds = projection.diagnosticsBySourceCollectionId.get(sourceCollectionId) ?? [];

  return diagnosticIds
    .map((diagnosticId) => projection.diagnostics.get(diagnosticId))
    .filter((diagnostic) => diagnostic !== undefined)
    .map((diagnostic) => ({
      diagnosticId: diagnostic.diagnosticId,
      severity: diagnostic.severity,
      category: diagnostic.category,
      message: diagnostic.message
    }))
    .sort((left, right) => compareCodeUnits(left.diagnosticId, right.diagnosticId));
}

function validKnowledgeEvents(rawEvents: readonly unknown[]): KnowledgeEvent[] {
  const events: KnowledgeEvent[] = [];
  for (const rawEvent of rawEvents) {
    const result = validateKnowledgeEvent(rawEvent);
    if (result.success) {
      events.push(result.data);
    }
  }
  return events;
}

function sourceCollectionsForLinks(
  projection: IngestionProjection,
  links: readonly IngestionEvidenceLinkSummary[]
): EvidenceItemDto["sourceCollections"] {
  return sortedUnique(links.map((link) => link.sourceCollectionId))
    .map((sourceCollectionId) => ({
      sourceCollectionId,
      label: projection.sources.get(sourceCollectionId)?.label ?? "Unavailable source collection"
    }));
}

function evidenceOccurrenceDto(occurrence: IngestionOccurrenceSummary): EvidenceOccurrenceDto {
  return {
    occurrenceId: occurrence.occurrenceId,
    sourceCollectionId: occurrence.sourceCollectionId,
    scanBatchId: occurrence.scanBatchId,
    sourcePath: occurrence.sourcePath,
    contentHash: occurrence.contentHash,
    sizeBytes: occurrence.sizeBytes,
    status: occurrence.status,
    ...(occurrence.adapter === undefined ? {} : { adapter: { ...occurrence.adapter } }),
    ...(occurrence.containerPath === undefined ||
      occurrence.containerHash === undefined ||
      occurrence.internalPath === undefined ||
      occurrence.archiveAdapter === undefined
      ? {}
      : {
          archive: {
            containerPath: occurrence.containerPath,
            containerHash: occurrence.containerHash,
            internalPath: occurrence.internalPath,
            adapter: { ...occurrence.archiveAdapter }
          }
        })
  };
}

function linkedReferences(
  events: readonly KnowledgeEvent[],
  evidenceId: string,
  provenanceEventIds: readonly string[],
  contentHash: string | undefined
): EvidenceLinkedReferenceDto[] {
  const references = new Map<string, { kind: "prr" | "investigation"; id: string; eventIds: string[] }>();
  for (const event of events) {
    if (!payloadReferencesEvidence(event.payload, evidenceId)) {
      continue;
    }
    const payload = event.payload as unknown as Record<string, unknown>;
    rememberLinkedReference(references, "prr", payload.prrRequestId, event.id);
    rememberLinkedReference(references, "investigation", payload.investigationId, event.id);
  }
  const provenanceIds = new Set(provenanceEventIds);
  for (const event of events) {
    if (event.type !== "agent.specialist-run.started" || event.payload.investigationId === undefined) {
      continue;
    }
    const referencesProvenance = event.payload.sourceEventIds?.some((eventId) => provenanceIds.has(eventId)) === true;
    const referencesArtifact = contentHash !== undefined &&
      event.payload.inputArtifactHashes?.includes(contentHash as `sha256:${string}`) === true;
    if (referencesProvenance || referencesArtifact) {
      rememberLinkedReference(references, "investigation", event.payload.investigationId, event.id);
    }
  }

  return [...references.values()]
    .sort((left, right) => compareCodeUnits(`${left.kind}:${left.id}`, `${right.kind}:${right.id}`))
    .map((reference) => ({
      kind: reference.kind,
      id: reference.id,
      eventIds: sortedUnique(reference.eventIds)
    }));
}

function quarantineLockLevelsForEvidence(
  events: readonly KnowledgeEvent[],
  evidenceId: string
): Array<"workflow" | "export" | "all"> {
  return [...new Set(events
    .filter((event): event is KnowledgeEventOf<"evidence.quarantined"> =>
      event.type === "evidence.quarantined" && event.payload.evidenceId === evidenceId
    )
    .map((event) => event.payload.lockLevel))]
    .sort(compareCodeUnits);
}

function containsCredentialShapedValue(value: unknown): boolean {
  if (typeof value === "string") {
    return containsCredentialShapedEvidenceText(value);
  }
  if (Array.isArray(value)) {
    return value.some(containsCredentialShapedValue);
  }
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return Object.values(value as Record<string, unknown>).some(containsCredentialShapedValue);
}

function payloadReferencesEvidence(payload: unknown, evidenceId: string): boolean {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return false;
  }
  const record = payload as Record<string, unknown>;
  if (["evidenceId", "sourceEvidenceId"].some((field) => record[field] === evidenceId)) {
    return true;
  }

  return ["evidenceIds", "attachmentEvidenceIds", "relatedEvidenceIds"].some((field) =>
    Array.isArray(record[field]) && (record[field] as unknown[]).includes(evidenceId)
  );
}

function rememberLinkedReference(
  references: Map<string, { kind: "prr" | "investigation"; id: string; eventIds: string[] }>,
  kind: "prr" | "investigation",
  rawId: unknown,
  eventId: string
): void {
  if (typeof rawId !== "string") {
    return;
  }
  const key = `${kind}:${rawId}`;
  const reference = references.get(key);
  if (reference === undefined) {
    references.set(key, { kind, id: rawId, eventIds: [eventId] });
  } else if (!reference.eventIds.includes(eventId)) {
    reference.eventIds.push(eventId);
  }
}

function assertionCandidates(
  events: readonly KnowledgeEvent[],
  projection: IngestionProjection
): EvidenceAssertionCandidateDto[] {
  return events
    .filter((event): event is KnowledgeEventOf<"assertion.proposed"> => event.type === "assertion.proposed")
    .filter((event) => projection.evidenceById.has(event.payload.evidenceId))
    .map((event) => {
      const evidence = projection.evidenceById.get(event.payload.evidenceId);
      const eligibility = evaluateEvidenceProposalEligibility(events, event.payload.evidenceId);
      return {
        assertionId: event.payload.assertionId,
        evidenceReferences: evidence === undefined
          ? []
          : [{
              evidenceId: evidence.evidenceId,
              contentHash: evidence.contentHash,
              eventIds: [...eligibility.provenanceEventIds]
            }],
        predicate: event.payload.predicate,
        confidence: event.payload.confidence,
        reviewState: "proposed" as const,
        reviewRequired: true as const,
        eventId: event.id
      };
    })
    .sort((left, right) => compareCodeUnits(left.assertionId, right.assertionId));
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareCodeUnits);
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
