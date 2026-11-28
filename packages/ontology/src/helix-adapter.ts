import {
  AppendOnlyHelixWriter,
  EndpointAllowlist,
  sha256ContentHash,
  type ContentHash,
  type HelixGraphTransport,
  type RebuildFingerprint,
  type ReplayLogEntry,
  type ScalarPropertyValue,
  type StoredHelixNode,
  type WatermarkRecordInput
} from "../../helix-contrib/src/index.js";
import {
  validateKnowledgeEvent,
  type KnowledgeEvent,
  type KnowledgeEventOf
} from "./contracts.js";
import type { EventLedger } from "./event-ledger.js";
import {
  extractionArtifactSchema,
  extractionMediaType,
  type ExtractionArtifact
} from "./extraction-contracts.js";
import { buildGovernanceProjection } from "./governance-projection.js";
import {
  buildOntologyWorkspaceReadDto,
  type OntologyAssertionReadDto,
  type OntologyDocumentReadDto,
  type OntologyEntityReadDto,
  type OntologyPackVersionDto,
  type OntologyPassageReadDto,
  type OntologyRelationshipReadDto,
  type OntologyWorkspaceReadDto
} from "./ontology-workspace-read.js";

export interface ReadOnlyBlobStore {
  get(contentHash: ContentHash): Promise<Buffer>;
}

export const CESTUS_HELIX_ALLOWLIST = new EndpointAllowlist([
  { fromLabel: "Agency", edgeLabel: "PRODUCED", toLabel: "Production" },
  { fromLabel: "Production", edgeLabel: "INCLUDES", toLabel: "Document" },
  { fromLabel: "Document", edgeLabel: "HAS_PASSAGE", toLabel: "Passage" },
  { fromLabel: "Document", edgeLabel: "HAS_EXTRACTION", toLabel: "ExtractionRecord" },
  { fromLabel: "Mention", edgeLabel: "BOUND_TO", toLabel: "Entity" },
  { fromLabel: "Entity", edgeLabel: "paid", toLabel: "Entity" },
  { fromLabel: "Entity", edgeLabel: "awarded", toLabel: "Entity" },
  { fromLabel: "Entity", edgeLabel: "employed_by", toLabel: "Entity" },
  { fromLabel: "Entity", edgeLabel: "owns", toLabel: "Entity" },
  { fromLabel: "Entity", edgeLabel: "associated_with", toLabel: "Entity" },
  { fromLabel: "Entity", edgeLabel: "RELATES_TO", toLabel: "Entity" }
]);

export class HelixUnavailableError extends Error {
  readonly code = "HELIX_UNAVAILABLE";

  constructor(message: string) {
    super(message);
    this.name = "HelixUnavailableError";
  }
}

export class HelixProjectionLagError extends Error {
  readonly code = "HELIX_PROJECTION_LAG";

  constructor(
    message: string,
    readonly ledgerHighWaterMark: number,
    readonly helixHighWaterMark: number
  ) {
    super(message);
    this.name = "HelixProjectionLagError";
  }
}

export interface HelixDocumentSummary {
  readonly evidenceId: string;
  readonly contentHash: ContentHash;
  readonly mediaType: string;
  readonly extractionStatus: "extracted" | "partial" | "unextracted" | "parse-failed";
  readonly unextracted: boolean;
  readonly passageCount: number;
  readonly authorityEventId: string;
  readonly sourceCollectionId?: string;
  readonly agencyName?: string;
  readonly importBatchId?: string;
  readonly parseFailureMessage?: string;
}

export interface HelixReplayPlan {
  readonly entries: readonly ReplayLogEntry[];
  readonly watermark: WatermarkRecordInput;
  readonly ledgerEventCount: number;
  readonly lastEventId: string | null;
  readonly documents: readonly HelixDocumentSummary[];
  readonly hiddenEvidenceIds: readonly string[];
}

export interface HelixSyncResult {
  readonly databaseName: string;
  readonly endpoint: string;
  readonly ledgerEventCount: number;
  readonly lastEventId: string | null;
  readonly nodesInserted: number;
  readonly nodesSuperseded: number;
  readonly edgesInserted: number;
  readonly documents: readonly HelixDocumentSummary[];
}

export interface HelixRebuildResult {
  readonly databaseName: string;
  readonly endpoint: string;
  readonly ledgerEventCount: number;
  readonly lastEventId: string | null;
  readonly fingerprint: RebuildFingerprint;
  readonly documents: readonly HelixDocumentSummary[];
  readonly hiddenEvidenceIds: readonly string[];
}

export interface PlanHelixReplayInput {
  readonly events: readonly unknown[];
  readonly databaseName: string;
  readonly blobStore?: ReadOnlyBlobStore;
  readonly derivativeStore?: ReadOnlyBlobStore;
}

export interface SyncHelixInput extends PlanHelixReplayInput {
  readonly transport: HelixGraphTransport;
}

export interface ReadOntologyFromHelixInput {
  readonly transport: HelixGraphTransport;
  readonly databaseName: string;
  readonly ledger: EventLedger;
}

export function createCestusHelixWriter(
  transport: HelixGraphTransport,
  databaseName: string
): AppendOnlyHelixWriter {
  return new AppendOnlyHelixWriter({
    transport,
    databaseName,
    allowlist: CESTUS_HELIX_ALLOWLIST
  });
}

export function computeLedgerLogDigest(events: readonly KnowledgeEvent[]): ContentHash {
  return sha256ContentHash(events.map((event) => event.id).join("\n"));
}

export async function planHelixReplayFromLedger(
  input: PlanHelixReplayInput
): Promise<HelixReplayPlan> {
  const events: KnowledgeEvent[] = [];
  for (const candidate of input.events) {
    const parsed = validateKnowledgeEvent(candidate);
    if (!parsed.success) {
      throw new Error("Stored knowledge event failed contract validation during Helix replay planning.");
    }
    events.push(parsed.data);
  }

  const governance = buildGovernanceProjection(events);
  const hiddenEvidenceIds = new Set<string>();
  for (const [evidenceId, state] of governance.evidenceGovernance.entries()) {
    if (state.tombstoned || state.quarantined) {
      hiddenEvidenceIds.add(evidenceId);
    }
  }

  const sourceChainsById = new Map<
    string,
    {
      readonly registered: KnowledgeEventOf<"ingestion.source.registered">;
      readonly labelUpdates: KnowledgeEventOf<"ingestion.source.label.updated">[];
    }
  >();
  const importApprovalByBatchKey = new Map<string, KnowledgeEventOf<"ingestion.import.approved">>();
  const firstLinkByBatchKey = new Map<string, KnowledgeEventOf<"ingestion.evidence.linked">>();
  const firstLinkBySourceId = new Map<string, KnowledgeEventOf<"ingestion.evidence.linked">>();
  const linkByEvidenceId = new Map<string, KnowledgeEventOf<"ingestion.evidence.linked">>();
  const ingestedByEvidenceId = new Map<string, KnowledgeEventOf<"evidence.ingested">>();
  const latestParseCompletedByEvidenceId = new Map<
    string,
    { readonly ordinal: number; readonly event: KnowledgeEventOf<"ingestion.parse.completed"> }
  >();
  const latestParseFailedByEvidenceId = new Map<
    string,
    { readonly ordinal: number; readonly event: KnowledgeEventOf<"ingestion.parse.failed"> }
  >();

  for (let ordinal = 0; ordinal < events.length; ordinal += 1) {
    const event = events[ordinal]!;
    if (event.type === "ingestion.source.registered") {
      sourceChainsById.set(event.payload.sourceCollectionId, {
        registered: event,
        labelUpdates: []
      });
    } else if (event.type === "ingestion.source.label.updated") {
      sourceChainsById.get(event.payload.sourceCollectionId)?.labelUpdates.push(event);
    } else if (event.type === "ingestion.import.approved") {
      const batchKey = `${event.payload.sourceCollectionId}\u0000${event.payload.importBatchId}`;
      if (!importApprovalByBatchKey.has(batchKey)) {
        importApprovalByBatchKey.set(batchKey, event);
      }
    } else if (event.type === "ingestion.evidence.linked") {
      if (!linkByEvidenceId.has(event.payload.evidenceId)) {
        linkByEvidenceId.set(event.payload.evidenceId, event);
      }
      const batchKey = `${event.payload.sourceCollectionId}\u0000${event.payload.importBatchId}`;
      if (!firstLinkByBatchKey.has(batchKey)) {
        firstLinkByBatchKey.set(batchKey, event);
      }
      if (!firstLinkBySourceId.has(event.payload.sourceCollectionId)) {
        firstLinkBySourceId.set(event.payload.sourceCollectionId, event);
      }
    } else if (event.type === "evidence.ingested") {
      ingestedByEvidenceId.set(event.payload.evidenceId, event);
    } else if (event.type === "ingestion.parse.completed") {
      latestParseCompletedByEvidenceId.set(event.payload.evidenceId, { ordinal, event });
    } else if (event.type === "ingestion.parse.failed") {
      latestParseFailedByEvidenceId.set(event.payload.evidenceId, { ordinal, event });
    }
  }

  const entries: ReplayLogEntry[] = [];
  const documents: HelixDocumentSummary[] = [];
  const emittedAgencies = new Set<string>();
  const emittedProductions = new Set<string>();
  const agencyNameBySourceId = new Map<string, string>();

  // Agency is authoritative for the producing agency label; provenance is deterministic
  // per sourceCollectionId and advances via provenance-chained supersession on label updates.
  const orderedSourceIds = [...sourceChainsById.keys()].sort((a, b) => a.localeCompare(b));
  for (const sourceCollectionId of orderedSourceIds) {
    const chain = sourceChainsById.get(sourceCollectionId)!;
    const latestUpdate = chain.labelUpdates.at(-1);
    const latestEvent = latestUpdate ?? chain.registered;
    const currentLabel = latestEvent.payload.label;
    const agencyStableKey = `agency:${sourceCollectionId}`;
    const supersedesAuthorityIds =
      latestUpdate === undefined
        ? undefined
        : [chain.registered.id, ...chain.labelUpdates.slice(0, -1).map((update) => update.id)];

    emittedAgencies.add(agencyStableKey);
    agencyNameBySourceId.set(sourceCollectionId, currentLabel);
    entries.push({
      kind: "node",
      label: "Agency",
      stableKey: agencyStableKey,
      provenance: {
        sourceId: sourceCollectionId,
        contentHash: sha256ContentHash(
          JSON.stringify({
            sourceCollectionId,
            label: currentLabel,
            authorityId: latestEvent.id
          })
        ),
        authorityId: latestEvent.id
      },
      ...(supersedesAuthorityIds === undefined ? {} : { supersedesAuthorityIds }),
      properties: {
        role: "producer",
        sourceCollectionId,
        name: currentLabel,
        labelRevision: 1 + chain.labelUpdates.length,
        registeredEventId: chain.registered.id,
        ...(latestUpdate === undefined
          ? {}
          : {
              previousName: latestUpdate.payload.previousLabel,
              ...(latestUpdate.payload.rationale === undefined
                ? {}
                : { labelUpdateRationale: latestUpdate.payload.rationale })
            })
      }
    });
  }

  const orderedEvidenceIds = [...ingestedByEvidenceId.keys()].sort((a, b) => a.localeCompare(b));
  for (const evidenceId of orderedEvidenceIds) {
    if (hiddenEvidenceIds.has(evidenceId)) {
      continue;
    }
    const ingested = ingestedByEvidenceId.get(evidenceId)!;
    const contentHash = ingested.payload.contentHash as ContentHash;

    // Verify canonical evidence bytes match the ledger contentHash when blobStore is provided.
    if (input.blobStore !== undefined) {
      await input.blobStore.get(contentHash);
    }

    const link = linkByEvidenceId.get(evidenceId);
    const sourceCollectionId = link?.payload.sourceCollectionId;
    const importBatchId = link?.payload.importBatchId;

    const docStableKey = `doc:${evidenceId}`;
    const docProvenance = {
      sourceId: evidenceId,
      contentHash,
      authorityId: ingested.id
    };

    // Document.sourceLabel preserves the immutable ingest-time snapshot from evidence.ingested;
    // queries must resolve the authoritative producing agency label via the Agency node.
    const docProps: Record<string, ScalarPropertyValue> = {
      evidenceId,
      mediaType: ingested.payload.mediaType,
      sizeBytes: ingested.payload.sizeBytes,
      sourceLabel: ingested.payload.source.label
    };
    if (sourceCollectionId !== undefined) {
      docProps.sourceCollectionId = sourceCollectionId;
    }
    if (importBatchId !== undefined) {
      docProps.importBatchId = importBatchId;
    }

    entries.push({
      kind: "node",
      label: "Document",
      stableKey: docStableKey,
      provenance: docProvenance,
      properties: docProps
    });

    if (sourceCollectionId !== undefined && importBatchId !== undefined && link !== undefined) {
      const agencyStableKey = `agency:${sourceCollectionId}`;
      if (!emittedAgencies.has(agencyStableKey)) {
        const fallbackLink = firstLinkBySourceId.get(sourceCollectionId) ?? link;
        const fallbackIngested = ingestedByEvidenceId.get(fallbackLink.payload.evidenceId) ?? ingested;
        const fallbackLabel = fallbackIngested.payload.source.label;
        emittedAgencies.add(agencyStableKey);
        agencyNameBySourceId.set(sourceCollectionId, fallbackLabel);
        entries.push({
          kind: "node",
          label: "Agency",
          stableKey: agencyStableKey,
          provenance: {
            sourceId: sourceCollectionId,
            contentHash: sha256ContentHash(
              JSON.stringify({
                sourceCollectionId,
                label: fallbackLabel,
                authorityId: fallbackLink.id
              })
            ),
            authorityId: fallbackLink.id
          },
          properties: {
            role: "producer",
            sourceCollectionId,
            name: fallbackLabel,
            labelRevision: 1
          }
        });
      }

      const productionStableKey = `production:${importBatchId}`;
      if (!emittedProductions.has(productionStableKey)) {
        emittedProductions.add(productionStableKey);
        const batchKey = `${sourceCollectionId}\u0000${importBatchId}`;
        const batchAuthorityId =
          importApprovalByBatchKey.get(batchKey)?.id ??
          (firstLinkByBatchKey.get(batchKey) ?? link).id;
        const batchProvenance = {
          sourceId: importBatchId,
          contentHash: sha256ContentHash(
            JSON.stringify({
              sourceCollectionId,
              importBatchId,
              authorityId: batchAuthorityId
            })
          ),
          authorityId: batchAuthorityId
        };
        entries.push({
          kind: "node",
          label: "Production",
          stableKey: productionStableKey,
          provenance: batchProvenance,
          properties: {
            importBatchId,
            sourceCollectionId
          }
        });
        entries.push({
          kind: "edge",
          edgeLabel: "PRODUCED",
          stableKey: `produced:${sourceCollectionId}:${importBatchId}`,
          from: { label: "Agency", stableKey: agencyStableKey },
          to: { label: "Production", stableKey: productionStableKey },
          provenance: batchProvenance
        });
      }

      entries.push({
        kind: "edge",
        edgeLabel: "INCLUDES",
        stableKey: `includes:${importBatchId}:${evidenceId}`,
        from: { label: "Production", stableKey: productionStableKey },
        to: { label: "Document", stableKey: docStableKey },
        provenance: {
          sourceId: evidenceId,
          contentHash,
          authorityId: link.id
        }
      });
    }

    const completed = latestParseCompletedByEvidenceId.get(evidenceId);
    const failed = latestParseFailedByEvidenceId.get(evidenceId);

    let extractionStatus: HelixDocumentSummary["extractionStatus"] = "unextracted";
    let unextracted = true;
    let passageCount = 0;
    let parseFailureMessage: string | undefined;

    if (
      completed !== undefined &&
      (failed === undefined || completed.ordinal >= failed.ordinal)
    ) {
      let artifact: ExtractionArtifact | undefined;
      if (
        completed.event.payload.outputMediaType === extractionMediaType &&
        input.derivativeStore !== undefined
      ) {
        const rawBytes = await input.derivativeStore.get(
          completed.event.payload.outputHash as ContentHash
        );
        artifact = extractionArtifactSchema.parse(JSON.parse(rawBytes.toString("utf8")));
        if (
          artifact.evidenceId !== evidenceId ||
          artifact.sourceContentHash !== contentHash ||
          artifact.extractionId !== completed.event.payload.parseJobId
        ) {
          throw new Error(
            `Extraction derivative provenance mismatch for evidence ${evidenceId}.`
          );
        }
      }

      const passages = artifact?.passages ?? [];
      passageCount = passages.length;
      if (passageCount > 0) {
        extractionStatus =
          artifact?.pdfCoverage?.status === "partial" ? "partial" : "extracted";
        unextracted = false;
      } else {
        extractionStatus = "unextracted";
        unextracted = true;
      }

      const extractionStableKey = `extraction:${evidenceId}:${completed.event.payload.parseJobId}`;
      entries.push({
        kind: "node",
        label: "ExtractionRecord",
        stableKey: extractionStableKey,
        provenance: {
          sourceId: evidenceId,
          contentHash,
          authorityId: completed.event.id
        },
        properties: {
          evidenceId,
          extractionId: completed.event.payload.parseJobId,
          extractionHash: completed.event.payload.outputHash,
          extractionStatus,
          unextracted,
          passageCount,
          ordinal: completed.ordinal
        }
      });
      entries.push({
        kind: "edge",
        edgeLabel: "HAS_EXTRACTION",
        stableKey: `has_extraction:${evidenceId}:${completed.event.payload.parseJobId}`,
        from: { label: "Document", stableKey: docStableKey },
        to: { label: "ExtractionRecord", stableKey: extractionStableKey },
        provenance: {
          sourceId: evidenceId,
          contentHash,
          authorityId: completed.event.id
        }
      });

      for (let passageIndex = 0; passageIndex < passages.length; passageIndex += 1) {
        const passage = passages[passageIndex]!;
        const locatorText = JSON.stringify(passage.locator);
        const passageStableKey = `passage:${evidenceId}:${completed.event.payload.parseJobId}:${passageIndex}`;
        const passageProvenance = {
          sourceId: evidenceId,
          contentHash,
          locator: locatorText,
          authorityId: completed.event.id
        };
        entries.push({
          kind: "text-span",
          label: "Passage",
          stableKey: passageStableKey,
          locator: locatorText,
          text: passage.text,
          provenance: passageProvenance,
          properties: {
            evidenceId,
            extractionId: completed.event.payload.parseJobId,
            extractionContentHash: completed.event.payload.outputHash,
            passageIndex,
            locatorKind: passage.locator.kind
          }
        });
        entries.push({
          kind: "edge",
          edgeLabel: "HAS_PASSAGE",
          stableKey: `has_passage:${evidenceId}:${completed.event.payload.parseJobId}:${passageIndex}`,
          from: { label: "Document", stableKey: docStableKey },
          to: { label: "Passage", stableKey: passageStableKey },
          provenance: passageProvenance
        });
      }
    } else if (failed !== undefined) {
      extractionStatus = "parse-failed";
      unextracted = true;
      passageCount = 0;
      parseFailureMessage = failed.event.payload.message;
      const extractionStableKey = `extraction_failed:${evidenceId}:${failed.event.payload.parseJobId}:${failed.ordinal}`;
      entries.push({
        kind: "node",
        label: "ExtractionRecord",
        stableKey: extractionStableKey,
        provenance: {
          sourceId: evidenceId,
          contentHash,
          authorityId: failed.event.id
        },
        properties: {
          evidenceId,
          extractionId: failed.event.payload.parseJobId,
          extractionStatus: "parse-failed",
          unextracted: true,
          passageCount: 0,
          parseFailureMessage: failed.event.payload.message,
          ordinal: failed.ordinal
        }
      });
      entries.push({
        kind: "edge",
        edgeLabel: "HAS_EXTRACTION",
        stableKey: `has_extraction_failed:${evidenceId}:${failed.event.payload.parseJobId}:${failed.ordinal}`,
        from: { label: "Document", stableKey: docStableKey },
        to: { label: "ExtractionRecord", stableKey: extractionStableKey },
        provenance: {
          sourceId: evidenceId,
          contentHash,
          authorityId: failed.event.id
        }
      });
    }

    const agencyName =
      sourceCollectionId === undefined ? undefined : agencyNameBySourceId.get(sourceCollectionId);
    documents.push(
      Object.freeze({
        evidenceId,
        contentHash,
        mediaType: ingested.payload.mediaType,
        extractionStatus,
        unextracted,
        passageCount,
        authorityEventId: ingested.id,
        ...(sourceCollectionId === undefined ? {} : { sourceCollectionId }),
        ...(agencyName === undefined ? {} : { agencyName }),
        ...(importBatchId === undefined ? {} : { importBatchId }),
        ...(parseFailureMessage === undefined ? {} : { parseFailureMessage })
      })
    );
  }

  // Project v1/v2 entities, assertions, and relationships from the pure specification
  // so Helix-backed reads preserve ontology DTO parity for non-hidden evidence.
  const pureDto = buildOntologyWorkspaceReadDto(events);
  if (pureDto.status === "ready") {
    for (const assertion of pureDto.assertions) {
      if (hiddenEvidenceIds.has(assertion.evidenceId)) {
        continue;
      }
      const evidenceEvent = ingestedByEvidenceId.get(assertion.evidenceId);
      if (evidenceEvent === undefined) {
        continue;
      }
      entries.push({
        kind: "node",
        label: "Assertion",
        stableKey: `assertion:${assertion.assertionId}:${assertion.reviewState}:${assertion.eventIds.join(",")}`,
        provenance: {
          sourceId: assertion.evidenceId,
          contentHash: evidenceEvent.payload.contentHash as ContentHash,
          authorityId: assertion.eventIds.at(-1) ?? evidenceEvent.id
        },
        properties: {
          assertionId: assertion.assertionId,
          reviewState: assertion.reviewState,
          ...(assertion.subjectRef === undefined ? {} : { subjectRef: assertion.subjectRef }),
          predicate: assertion.predicate,
          confidence: assertion.confidence,
          objectJson: JSON.stringify(assertion.object ?? null),
          ...(assertion.citationScope === undefined ? {} : { citationScope: assertion.citationScope }),
          evidenceId: assertion.evidenceId,
          eventIdsJson: JSON.stringify(assertion.eventIds),
          packVersionsJson: JSON.stringify(assertion.packVersions)
        }
      });
    }

    for (const entity of pureDto.entities) {
      if (entity.evidenceIds.some((id) => hiddenEvidenceIds.has(id))) {
        continue;
      }
      const primaryEvidenceId = entity.evidenceIds[0];
      const evidenceEvent =
        primaryEvidenceId === undefined ? undefined : ingestedByEvidenceId.get(primaryEvidenceId);
      if (evidenceEvent === undefined || primaryEvidenceId === undefined) {
        continue;
      }
      entries.push({
        kind: "node",
        label: "Entity",
        stableKey: `entity:${entity.entityId}`,
        provenance: {
          sourceId: primaryEvidenceId,
          contentHash: evidenceEvent.payload.contentHash as ContentHash,
          authorityId: entity.eventIds.at(-1) ?? evidenceEvent.id
        },
        properties: {
          entityId: entity.entityId,
          canonicalLabel: entity.canonicalLabel,
          entityType: entity.entityType,
          reviewState: entity.reviewState,
          supportingAssertionIdsJson: JSON.stringify(entity.supportingAssertionIds),
          evidenceIdsJson: JSON.stringify(entity.evidenceIds),
          eventIdsJson: JSON.stringify(entity.eventIds),
          packVersionsJson: JSON.stringify(entity.packVersions)
        }
      });
    }

    for (const relationship of pureDto.relationships) {
      if (relationship.evidenceIds.some((id) => hiddenEvidenceIds.has(id))) {
        continue;
      }
      const primaryEvidenceId = relationship.evidenceIds[0];
      const evidenceEvent =
        primaryEvidenceId === undefined ? undefined : ingestedByEvidenceId.get(primaryEvidenceId);
      if (evidenceEvent === undefined || primaryEvidenceId === undefined) {
        continue;
      }
      entries.push({
        kind: "edge",
        edgeLabel: "RELATES_TO",
        stableKey: `relationship:${relationship.relationshipId}`,
        from: { label: "Entity", stableKey: `entity:${relationship.fromEntityId}` },
        to: { label: "Entity", stableKey: `entity:${relationship.toEntityId}` },
        provenance: {
          sourceId: primaryEvidenceId,
          contentHash: evidenceEvent.payload.contentHash as ContentHash,
          authorityId: relationship.eventIds.at(-1) ?? evidenceEvent.id
        },
        properties: {
          relationshipId: relationship.relationshipId,
          fromEntityId: relationship.fromEntityId,
          toEntityId: relationship.toEntityId,
          relationshipType: relationship.relationshipType,
          reviewState: relationship.reviewState,
          supportingAssertionIdsJson: JSON.stringify(relationship.supportingAssertionIds),
          contradictingAssertionIdsJson: JSON.stringify(relationship.contradictingAssertionIds),
          evidenceIdsJson: JSON.stringify(relationship.evidenceIds),
          eventIdsJson: JSON.stringify(relationship.eventIds),
          packVersionsJson: JSON.stringify(relationship.packVersions)
        }
      });
    }
  }

  const lastEventId = events.at(-1)?.id ?? null;
  const logDigest = computeLedgerLogDigest(events);
  const watermark: WatermarkRecordInput = {
    revision: events.length,
    lastAuthorityId: lastEventId ?? "empty",
    logDigest,
    provenance: {
      sourceId: input.databaseName,
      contentHash: logDigest,
      authorityId: lastEventId ?? "empty"
    }
  };

  return Object.freeze({
    entries: Object.freeze(entries),
    watermark,
    ledgerEventCount: events.length,
    lastEventId,
    documents: Object.freeze(documents),
    hiddenEvidenceIds: Object.freeze([...hiddenEvidenceIds].sort((a, b) => a.localeCompare(b)))
  });
}

export async function syncLedgerToHelix(input: SyncHelixInput): Promise<HelixSyncResult> {
  const plan = await planHelixReplayFromLedger(input);
  const writer = createCestusHelixWriter(input.transport, input.databaseName);

  // If any evidence is tombstoned/quarantined, perform a full rebuild so hidden
  // nodes can never remain visible in Helix.
  if (plan.hiddenEvidenceIds.length > 0) {
    const rebuilt = await writer.rebuild(input.databaseName, plan.entries, plan.watermark);
    return Object.freeze({
      databaseName: input.databaseName,
      endpoint: input.transport.endpoint,
      ledgerEventCount: plan.ledgerEventCount,
      lastEventId: plan.lastEventId,
      nodesInserted: rebuilt.nodeCount,
      nodesSuperseded: 0,
      edgesInserted: rebuilt.edgeCount,
      documents: plan.documents
    });
  }

  let nodesInserted = 0;
  let nodesSuperseded = 0;
  let edgesInserted = 0;
  for (const entry of plan.entries) {
    if (entry.kind === "node") {
      const res = await writer.appendNode(entry);
      if (res.inserted) nodesInserted += 1;
      if (res.superseded) nodesSuperseded += 1;
    } else if (entry.kind === "text-span") {
      const res = await writer.appendTextSpan(entry);
      if (res.inserted) nodesInserted += 1;
      if (res.superseded) nodesSuperseded += 1;
    } else {
      const res = await writer.appendEdge(entry);
      if (res.inserted) edgesInserted += 1;
    }
  }
  await writer.appendWatermark(plan.watermark);

  return Object.freeze({
    databaseName: input.databaseName,
    endpoint: input.transport.endpoint,
    ledgerEventCount: plan.ledgerEventCount,
    lastEventId: plan.lastEventId,
    nodesInserted,
    nodesSuperseded,
    edgesInserted,
    documents: plan.documents
  });
}

export async function rebuildHelixFromLedger(input: SyncHelixInput): Promise<HelixRebuildResult> {
  const plan = await planHelixReplayFromLedger(input);
  const writer = createCestusHelixWriter(input.transport, input.databaseName);
  const fingerprint = await writer.rebuild(input.databaseName, plan.entries, plan.watermark);

  return Object.freeze({
    databaseName: input.databaseName,
    endpoint: input.transport.endpoint,
    ledgerEventCount: plan.ledgerEventCount,
    lastEventId: plan.lastEventId,
    fingerprint,
    documents: plan.documents,
    hiddenEvidenceIds: plan.hiddenEvidenceIds
  });
}

export async function readOntologyWorkspaceFromHelix(
  input: ReadOntologyFromHelixInput
): Promise<OntologyWorkspaceReadDto> {
  const health = await input.transport.healthCheck();
  if (!health.ok || !health.ready) {
    throw new HelixUnavailableError(
      `HelixDB at ${input.transport.endpoint} is unavailable (${health.detail ?? `status=${health.statusCode}`}).`
    );
  }

  const ledgerEvents = await input.ledger.readAll();
  const ledgerRevision = ledgerEvents.length;
  const ledgerLastId = ledgerEvents.at(-1)?.id ?? "empty";
  const ledgerDigest = computeLedgerLogDigest(ledgerEvents);

  const writer = createCestusHelixWriter(input.transport, input.databaseName);
  const watermark = await writer.readLatestWatermark();

  if (ledgerRevision > 0) {
    if (
      watermark === undefined ||
      watermark.revision < ledgerRevision ||
      watermark.lastAuthorityId !== ledgerLastId ||
      watermark.logDigest !== ledgerDigest
    ) {
      throw new HelixProjectionLagError(
        `Helix projection for "${input.databaseName}" is behind the ledger (helix=${watermark?.revision ?? 0}, ledger=${ledgerRevision}).`,
        ledgerRevision,
        watermark?.revision ?? 0
      );
    }
  }

  const [agencyNodes, documentNodes, extractionNodes, passageNodes, entityNodes, assertionNodes, relationshipEdges] =
    await Promise.all([
      writer.findNodesByLabel("Agency"),
      writer.findNodesByLabel("Document"),
      writer.findNodesByLabel("ExtractionRecord"),
      writer.findNodesByLabel("Passage"),
      writer.findNodesByLabel("Entity"),
      writer.findNodesByLabel("Assertion"),
      writer.findEdgesByLabel("RELATES_TO")
    ]);

  const agencyNameBySourceId = new Map<string, string>();
  for (const agencyNode of agencyNodes) {
    const sourceCollectionId = stringProp(agencyNode.properties.sourceCollectionId);
    const name = stringProp(agencyNode.properties.name);
    if (sourceCollectionId !== undefined && name !== undefined) {
      agencyNameBySourceId.set(sourceCollectionId, name);
    }
  }

  const latestExtractionByEvidence = new Map<string, StoredHelixNode>();
  for (const extractionNode of extractionNodes) {
    const evidenceId = stringProp(extractionNode.properties.evidenceId);
    if (evidenceId === undefined) continue;
    const ordinal = numberProp(extractionNode.properties.ordinal) ?? 0;
    const prev = latestExtractionByEvidence.get(evidenceId);
    const prevOrdinal = prev === undefined ? -1 : (numberProp(prev.properties.ordinal) ?? 0);
    if (prev === undefined || ordinal >= prevOrdinal) {
      latestExtractionByEvidence.set(evidenceId, extractionNode);
    }
  }

  const passagesByEvidence = new Map<string, OntologyPassageReadDto[]>();
  for (const passageNode of passageNodes) {
    const evidenceId = stringProp(passageNode.properties.evidenceId) ?? stringProp(passageNode.properties.sourceId);
    const contentHash = hashProp(passageNode.properties.contentHash);
    const locator = stringProp(passageNode.properties.locator);
    const text = stringProp(passageNode.properties.text);
    const spanHash = hashProp(passageNode.properties.spanHash);
    const extractionId = stringProp(passageNode.properties.extractionId);
    const authorityEventId = stringProp(passageNode.properties.authorityId);
    const passageIndex = numberProp(passageNode.properties.passageIndex) ?? 0;

    if (
      evidenceId === undefined ||
      contentHash === undefined ||
      locator === undefined ||
      text === undefined ||
      spanHash === undefined ||
      extractionId === undefined ||
      authorityEventId === undefined
    ) {
      continue;
    }

    const list = passagesByEvidence.get(evidenceId) ?? [];
    list.push({
      evidenceId,
      contentHash,
      locator,
      text,
      spanHash,
      passageIndex,
      extractionId,
      authorityEventId
    });
    passagesByEvidence.set(evidenceId, list);
  }

  const documents: OntologyDocumentReadDto[] = [];
  for (const docNode of documentNodes) {
    const evidenceId = stringProp(docNode.properties.evidenceId) ?? stringProp(docNode.properties.sourceId);
    const contentHash = hashProp(docNode.properties.contentHash);
    const mediaType = stringProp(docNode.properties.mediaType) ?? "application/octet-stream";
    const authorityEventId = stringProp(docNode.properties.authorityId);
    if (evidenceId === undefined || contentHash === undefined || authorityEventId === undefined) {
      continue;
    }

    const latestExtraction = latestExtractionByEvidence.get(evidenceId);
    const latestExtractionId = latestExtraction === undefined ? undefined : stringProp(latestExtraction.properties.extractionId);
    const rawPassages = (passagesByEvidence.get(evidenceId) ?? [])
      .filter((p) => latestExtractionId === undefined || p.extractionId === latestExtractionId)
      .sort((a, b) => a.passageIndex - b.passageIndex);

    const statusFromNode = latestExtraction === undefined
      ? undefined
      : stringProp(latestExtraction.properties.extractionStatus);
    const extractionStatus: OntologyDocumentReadDto["extractionStatus"] =
      statusFromNode === "extracted" ||
      statusFromNode === "partial" ||
      statusFromNode === "unextracted" ||
      statusFromNode === "parse-failed"
        ? statusFromNode
        : rawPassages.length > 0
          ? "extracted"
          : "unextracted";
    const unextracted =
      latestExtraction !== undefined && typeof latestExtraction.properties.unextracted === "boolean"
        ? latestExtraction.properties.unextracted
        : rawPassages.length === 0;
    const sourceCollectionId = stringProp(docNode.properties.sourceCollectionId);
    const agencyName =
      sourceCollectionId === undefined ? undefined : agencyNameBySourceId.get(sourceCollectionId);
    const importBatchId = stringProp(docNode.properties.importBatchId);
    const parseFailureMessage =
      latestExtraction === undefined ? undefined : stringProp(latestExtraction.properties.parseFailureMessage);

    documents.push({
      evidenceId,
      contentHash,
      mediaType,
      extractionStatus,
      unextracted,
      passageCount: rawPassages.length,
      passages: rawPassages,
      authorityEventId,
      ...(sourceCollectionId === undefined ? {} : { sourceCollectionId }),
      ...(agencyName === undefined ? {} : { agencyName }),
      ...(importBatchId === undefined ? {} : { importBatchId }),
      ...(parseFailureMessage === undefined ? {} : { parseFailureMessage })
    });
  }
  documents.sort((left, right) => left.evidenceId.localeCompare(right.evidenceId));

  const entities: OntologyEntityReadDto[] = [];
  for (const node of entityNodes) {
    const entityId = stringProp(node.properties.entityId);
    const canonicalLabel = stringProp(node.properties.canonicalLabel);
    const entityType = stringProp(node.properties.entityType);
    if (entityId === undefined || canonicalLabel === undefined || entityType === undefined) {
      continue;
    }
    entities.push({
      entityId,
      canonicalLabel,
      entityType,
      reviewState: "accepted",
      supportingAssertionIds: jsonStringArrayProp(node.properties.supportingAssertionIdsJson),
      evidenceIds: jsonStringArrayProp(node.properties.evidenceIdsJson),
      eventIds: jsonStringArrayProp(node.properties.eventIdsJson),
      packVersions: jsonPackVersionsProp(node.properties.packVersionsJson)
    });
  }
  entities.sort((left, right) => left.entityId.localeCompare(right.entityId));

  const assertionsById = new Map<string, OntologyAssertionReadDto>();
  for (const node of assertionNodes) {
    const assertionId = stringProp(node.properties.assertionId);
    const reviewState = stringProp(node.properties.reviewState);
    const predicate = stringProp(node.properties.predicate);
    const evidenceId = stringProp(node.properties.evidenceId);
    const confidence = numberProp(node.properties.confidence) ?? 0;
    if (
      assertionId === undefined ||
      (reviewState !== "proposed" && reviewState !== "accepted") ||
      predicate === undefined ||
      evidenceId === undefined
    ) {
      continue;
    }
    const subjectRef = stringProp(node.properties.subjectRef);
    const citationScope = stringProp(node.properties.citationScope);
    const objectRaw = stringProp(node.properties.objectJson);
    let parsedObject: string | number | boolean | null | undefined;
    if (objectRaw !== undefined) {
      try {
        parsedObject = JSON.parse(objectRaw) as string | number | boolean | null;
      } catch {
        parsedObject = undefined;
      }
    }
    const dto: OntologyAssertionReadDto = {
      assertionId,
      reviewState,
      ...(subjectRef === undefined ? {} : { subjectRef }),
      predicate,
      confidence,
      ...(parsedObject === undefined ? {} : { object: parsedObject }),
      ...(citationScope === "whole-document" || citationScope === "passage"
        ? { citationScope }
        : {}),
      evidenceId,
      eventIds: jsonStringArrayProp(node.properties.eventIdsJson),
      packVersions: jsonPackVersionsProp(node.properties.packVersionsJson)
    };
    const existing = assertionsById.get(assertionId);
    if (existing === undefined || (existing.reviewState === "proposed" && dto.reviewState === "accepted")) {
      assertionsById.set(assertionId, dto);
    }
  }
  const assertions = [...assertionsById.values()].sort((left, right) =>
    left.assertionId.localeCompare(right.assertionId)
  );

  const relationships: OntologyRelationshipReadDto[] = [];
  for (const edge of relationshipEdges) {
    const relationshipId = stringProp(edge.properties.relationshipId);
    const fromEntityId = stringProp(edge.properties.fromEntityId);
    const toEntityId = stringProp(edge.properties.toEntityId);
    const relationshipType = stringProp(edge.properties.relationshipType);
    if (
      relationshipId === undefined ||
      fromEntityId === undefined ||
      toEntityId === undefined ||
      relationshipType === undefined
    ) {
      continue;
    }
    relationships.push({
      relationshipId,
      fromEntityId,
      toEntityId,
      relationshipType,
      reviewState: "accepted",
      supportingAssertionIds: jsonStringArrayProp(edge.properties.supportingAssertionIdsJson),
      contradictingAssertionIds: jsonStringArrayProp(edge.properties.contradictingAssertionIdsJson),
      evidenceIds: jsonStringArrayProp(edge.properties.evidenceIdsJson),
      eventIds: jsonStringArrayProp(edge.properties.eventIdsJson),
      packVersions: jsonPackVersionsProp(edge.properties.packVersionsJson)
    });
  }
  relationships.sort((left, right) => left.relationshipId.localeCompare(right.relationshipId));

  return {
    schemaVersion: "ontology-workspace.v1",
    status: "ready",
    sourceHighWaterMark: watermark?.revision ?? 0,
    entities,
    relationships,
    assertions,
    documents,
    diagnostics: []
  };
}

function stringProp(value: ScalarPropertyValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberProp(value: ScalarPropertyValue | undefined): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function hashProp(value: ScalarPropertyValue | undefined): ContentHash | undefined {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value)
    ? (value as ContentHash)
    : undefined;
}

function jsonStringArrayProp(value: ScalarPropertyValue | undefined): string[] {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function jsonPackVersionsProp(value: ScalarPropertyValue | undefined): OntologyPackVersionDto[] {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is OntologyPackVersionDto =>
          item !== null &&
          typeof item === "object" &&
          typeof (item as { name?: unknown }).name === "string" &&
          typeof (item as { version?: unknown }).version === "string"
      )
      .map((item) => ({ name: item.name, version: item.version }));
  } catch {
    return [];
  }
}
