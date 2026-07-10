import {
  buildResolvedContextPack,
  hashAgentContextPack,
  type AgentContextPackJsonValue,
  type ContextPackDescriptor,
  type ResolvedContextPack
} from "./context-packs.js";
import { assertAgentSecretSafeText } from "./secret-safety.js";

export type InvestigativeContextPackId =
  | "evidence-summary.v1"
  | "accepted-graph-projection.v1"
  | "governance-locks.v1";

export type InvestigativeContextPackFailureCode =
  | "missing-provenance"
  | "projection-lag"
  | "stale-source"
  | "source-byte-hash-mismatch"
  | "archive-container-hash-mismatch"
  | "archive-child-hash-mismatch"
  | "source-posture-unavailable"
  | "context-budget-exceeded"
  | "secret-detected"
  | "raw-content-forbidden"
  | "provider-payload-forbidden"
  | "accepted-truth-mutation-forbidden"
  | "accepted-relationship-not-authoritative"
  | "selection-window-required"
  | "selection-manifest-stale"
  | "selection-manifest-hash-mismatch"
  | "selection-row-mismatch"
  | "selection-cursor-invalid"
  | "context-payload-missing"
  | "context-payload-hash-mismatch"
  | "context-payload-size-mismatch"
  | "duplicate-context-pack-registration"
  | "conflicting-context-pack-registration"
  | "invalid-context-pack-scope";

export class InvestigativeContextPackError extends Error {
  readonly code: InvestigativeContextPackFailureCode;

  constructor(code: InvestigativeContextPackFailureCode, message: string) {
    super(message);
    this.name = "InvestigativeContextPackError";
    this.code = code;
  }
}

export interface InvestigativeRegistrationIdentity {
  readonly moduleId: "packages/agent/src/investigative-context-packs";
  readonly descriptorSchemaVersion: "investigative-context-pack-descriptor.v1";
  readonly parserSchemaVersion: "investigative-context-pack-payload-parser.v1";
  readonly limitsVersion: "investigative-context-pack-limits.v1";
  readonly builderDescriptorHash: `sha256:${string}`;
  readonly payloadParserHash: `sha256:${string}`;
  readonly limitsHash: `sha256:${string}`;
}

export interface InvestigativeContextPackDefaultLimits {
  readonly limitsVersion: "investigative-context-pack-limits.v1";
  readonly descriptorSchemaVersion: "investigative-context-pack-descriptor.v1";
  readonly packBudgets: Readonly<Record<InvestigativeContextPackId, number>>;
  readonly selectionWindowLimit: 100;
  readonly readerBatchSize: 50;
  readonly omissionSampleLimit: 3;
}

export const INVESTIGATIVE_CONTEXT_PACK_IDS = Object.freeze([
  "accepted-graph-projection.v1",
  "evidence-summary.v1",
  "governance-locks.v1"
] as const);

export const investigativeContextPackDefaultLimits = Object.freeze({
  limitsVersion: "investigative-context-pack-limits.v1",
  descriptorSchemaVersion: "investigative-context-pack-descriptor.v1",
  packBudgets: Object.freeze({
    "accepted-graph-projection.v1": 65_536,
    "evidence-summary.v1": 65_536,
    "governance-locks.v1": 32_768
  }),
  selectionWindowLimit: 100,
  readerBatchSize: 50,
  omissionSampleLimit: 3
} satisfies InvestigativeContextPackDefaultLimits);

export const investigativeContextPackDescriptors = Object.freeze([
  Object.freeze({
    contextPackId: "accepted-graph-projection.v1",
    version: 1,
    label: "Accepted graph projection",
    maxBytes: investigativeContextPackDefaultLimits.packBudgets["accepted-graph-projection.v1"],
    requiredProvenanceKinds: Object.freeze(["event-id", "content-hash"]),
    redactionPolicy: "provider-safe-resolved-payload",
    sourceProjection: "ontology.accepted-graph"
  }),
  Object.freeze({
    contextPackId: "evidence-summary.v1",
    version: 1,
    label: "Evidence summary",
    maxBytes: investigativeContextPackDefaultLimits.packBudgets["evidence-summary.v1"],
    requiredProvenanceKinds: Object.freeze(["event-id", "content-hash", "evidence-id"]),
    redactionPolicy: "provider-safe-resolved-payload",
    sourceProjection: "ingestion.evidence"
  }),
  Object.freeze({
    contextPackId: "governance-locks.v1",
    version: 1,
    label: "Governance locks",
    maxBytes: investigativeContextPackDefaultLimits.packBudgets["governance-locks.v1"],
    requiredProvenanceKinds: Object.freeze(["event-id"]),
    redactionPolicy: "provider-safe-resolved-payload",
    sourceProjection: "governance-and-agent-locks"
  })
] satisfies readonly ContextPackDescriptor[]);

export interface InvestigativeContextPackScope {
  readonly kind: "workspace" | "investigation" | "task" | "selection";
  readonly id: string;
}

export interface InvestigativeProjectionHighWaterMarks {
  readonly graph?: number;
  readonly ingestion?: number;
  readonly governance?: number;
  readonly agent?: number;
}

export interface InvestigativeSelectionWindow {
  readonly cursor: string;
  readonly offset: number;
  readonly limit: number;
  readonly stableSort: "ref-kind-ref-id-content-hash-v1";
}

export interface InvestigativeSelectionIncludedRef {
  readonly refKind: "evidence" | "assertion" | "entity" | "relationship" | "governance-restriction" | "resident-agent-lock";
  readonly refId: string;
  readonly sortKey: string;
  readonly contentHash?: `sha256:${string}`;
  readonly rowHash?: `sha256:${string}`;
  readonly sourceEventIds: readonly string[];
  readonly mandatory: boolean;
}

export interface InvestigativeOmissionSampleRef {
  readonly refKind: string;
  readonly refId: string;
  readonly contentHash?: `sha256:${string}`;
}

export interface InvestigativeContextOmissionAggregate {
  readonly reasonCode: string;
  readonly refKind: string;
  readonly aggregateKey: string;
  readonly count: number;
  readonly sampleRefs?: readonly InvestigativeOmissionSampleRef[];
}

export interface InvestigativeSelectionManifestBody {
  readonly manifestVersion: "investigative-selection-manifest.v1";
  readonly scope: InvestigativeContextPackScope;
  readonly sourceProjectionHighWaterMarks: InvestigativeProjectionHighWaterMarks;
  readonly ordering: "ref-kind-ref-id-content-hash-v1";
  readonly window: InvestigativeSelectionWindow;
  readonly totalEligibleCount: number;
  readonly includedRefs: readonly InvestigativeSelectionIncludedRef[];
  readonly aggregateOmissions: readonly InvestigativeContextOmissionAggregate[];
}

export interface InvestigativeSelectionManifest extends InvestigativeSelectionManifestBody {
  readonly manifestHash: `sha256:${string}`;
}

export interface InvestigativeContextPackBuildRequest {
  readonly scope: InvestigativeContextPackScope;
  readonly window?: InvestigativeSelectionWindow;
  readonly sizeBudgetBytes?: number;
}

export interface InvestigativeSelectionCapability {
  readonly capabilityVersion: "investigative-selection.v1";
  select(input: {
    readonly contextPackId: InvestigativeContextPackId;
    readonly scope: InvestigativeContextPackScope;
    readonly sizeBudgetBytes: number;
    readonly window?: InvestigativeSelectionWindow;
  }): Promise<InvestigativeSelectionManifest> | InvestigativeSelectionManifest;
}

export interface InvestigativeEvidenceRow {
  readonly evidenceId: string;
  readonly ingestionEventId: string;
  readonly contentHash: `sha256:${string}`;
  readonly mediaType?: string;
  readonly sizeBytes?: number;
  readonly sourceCollectionId?: string;
  readonly scanBatchId?: string;
  readonly importBatchId?: string;
  readonly occurrenceIds: readonly string[];
  readonly parseJobs: readonly {
    readonly parseJobId: string;
    readonly lane: string;
    readonly parserName: string;
    readonly parserVersion: string;
    readonly state: string;
    readonly outputHash?: `sha256:${string}`;
    readonly outputMediaType?: string;
    readonly terminalEventId?: string;
    readonly retryable?: boolean;
  }[];
  readonly governanceTags: readonly {
    readonly tag: string;
    readonly source: "ai" | "human";
    readonly state: "active" | "removed";
    readonly confidence?: number;
    readonly safeRationale?: string;
    readonly eventId: string;
  }[];
  readonly duplicateGroup?: { readonly groupId: string; readonly memberCount: number };
  readonly safeNarrative?: string;
  readonly rawActionField?: string;
}

export interface InvestigativeEvidenceReader {
  readEvidenceByIds(input: {
    readonly evidenceIds: readonly string[];
    readonly contentHashes: readonly `sha256:${string}`[];
    readonly highWaterMarks: InvestigativeProjectionHighWaterMarks;
    readonly limit: number;
  }): Promise<readonly InvestigativeEvidenceRow[]> | readonly InvestigativeEvidenceRow[];
}

export interface EvidenceSourcePostureCheckInput {
  readonly evidenceId: string;
  readonly contentHash: `sha256:${string}`;
}

export type EvidenceSourcePostureResult =
  | {
      readonly ok: true;
      readonly stalenessInputs: readonly { readonly kind: string; readonly ref: string; readonly value: string }[];
    }
  | {
      readonly ok: false;
      readonly code:
        | "source-posture-unavailable"
        | "stale-source"
        | "source-byte-hash-mismatch"
        | "archive-container-hash-mismatch"
        | "archive-child-hash-mismatch";
      readonly stalenessInputs: readonly { readonly kind: string; readonly ref: string; readonly value: string }[];
    };

export interface EvidenceSourcePostureCapability {
  readonly postureVersion: "ingestion-current-source-posture.v1";
  checkEvidence(input: EvidenceSourcePostureCheckInput): Promise<EvidenceSourcePostureResult> | EvidenceSourcePostureResult;
}

export interface InvestigativeContextPackDependencies {
  readonly selection: InvestigativeSelectionCapability;
  readonly evidenceReader: InvestigativeEvidenceReader;
  readonly evidenceSourcePosture: EvidenceSourcePostureCapability;
  readonly now: () => string;
  readonly budgets?: Partial<Record<InvestigativeContextPackId, number>>;
}

export interface BuildInvestigativeContextPackInput extends InvestigativeContextPackBuildRequest {
  readonly deps: InvestigativeContextPackDependencies;
}

export interface RegisterInvestigativeContextPacksInput extends InvestigativeContextPackBuildRequest {
  readonly deps: InvestigativeContextPackDependencies;
}

export interface InvestigativeContextPackPayloadBase {
  readonly schemaVersion: string;
  readonly contextPackId: InvestigativeContextPackId;
  readonly scope: InvestigativeContextPackScope;
  readonly truthBoundary: Readonly<Record<string, AgentContextPackJsonValue>>;
  readonly selectionManifest: InvestigativeSelectionManifest;
  readonly projectionHighWaterMarks: InvestigativeProjectionHighWaterMarks;
  readonly packVersions: Readonly<Record<string, string>>;
  readonly items: AgentContextPackJsonValue;
  readonly omissions: readonly InvestigativeContextOmissionAggregate[];
  readonly stalenessInputs: readonly { readonly kind: string; readonly ref: string; readonly value: string }[];
}

export interface InvestigativePayloadParserIdentity {
  readonly contextPackId: InvestigativeContextPackId;
  readonly version: 1;
  readonly parserSchemaVersion: "investigative-context-pack-payload-parser.v1";
  readonly parserHash: `sha256:${string}`;
}

export interface InvestigativeContextPackPayloadParser<Payload extends InvestigativeContextPackPayloadBase> {
  readonly contextPackId: Payload["contextPackId"];
  readonly version: 1;
  readonly parserIdentity: InvestigativePayloadParserIdentity;
  parsePayload(payload: unknown): Payload;
}

export interface AcceptedGraphProjectionPayload extends InvestigativeContextPackPayloadBase {
  readonly schemaVersion: "accepted-graph-projection.context.v1";
  readonly contextPackId: "accepted-graph-projection.v1";
  readonly truthBoundary: {
    readonly authoritativeForAcceptedGraph: true;
    readonly readOnlyProjectionTruth: true;
    readonly canInferNewAcceptedEdges: false;
    readonly graphMutationRequiresReviewedOntologyEvent: true;
  };
  readonly items: {
    readonly assertions: readonly AgentContextPackJsonValue[];
    readonly entities: readonly AgentContextPackJsonValue[];
    readonly relationships: readonly AgentContextPackJsonValue[];
  };
}

export interface EvidenceSummaryPayload extends InvestigativeContextPackPayloadBase {
  readonly schemaVersion: "evidence-summary.context.v1";
  readonly contextPackId: "evidence-summary.v1";
  readonly version: 1;
  readonly truthBoundary: {
    readonly evidenceIsReadOnly: true;
    readonly rawContentExcluded: true;
  };
  readonly items: readonly EvidenceSummaryItem[] & readonly AgentContextPackJsonValue[];
}

export interface EvidenceSummaryItem {
  readonly evidenceId: string;
  readonly ingestionEventId: string;
  readonly contentHash: `sha256:${string}`;
  readonly mediaType?: string;
  readonly sizeBytes?: number;
  readonly sourceCollectionId?: string;
  readonly scanBatchId?: string;
  readonly importBatchId?: string;
  readonly occurrenceIds: readonly string[];
  readonly parseJobs: InvestigativeEvidenceRow["parseJobs"];
  readonly governanceTags: InvestigativeEvidenceRow["governanceTags"];
  readonly duplicateGroup?: InvestigativeEvidenceRow["duplicateGroup"];
  readonly safeNarrative?: string;
}

export interface ResolvedEvidenceSummaryContextPack {
  readonly ref: ResolvedContextPack["ref"];
  readonly payload: EvidenceSummaryPayload;
}

export interface GovernanceLocksPayload extends InvestigativeContextPackPayloadBase {
  readonly schemaVersion: "governance-locks.context.v1";
  readonly contextPackId: "governance-locks.v1";
  readonly truthBoundary: {
    readonly authoritativeForApproval: false;
    readonly grantsApproval: false;
    readonly clearsApprovalOrLocks: false;
    readonly mutatesEvidenceOrGraph: false;
    readonly postureKind: "non-authoritative-safety-posture";
  };
  readonly items: {
    readonly activeLocks: readonly AgentContextPackJsonValue[];
    readonly governanceRestrictions: readonly AgentContextPackJsonValue[];
  };
}

export const investigativePayloadParserIdentities = Object.freeze({
  "accepted-graph-projection.v1": parserIdentity("accepted-graph-projection.v1", ["assertions", "entities", "relationships"]),
  "evidence-summary.v1": parserIdentity("evidence-summary.v1", ["evidence", "sourcePosture", "governanceTags"]),
  "governance-locks.v1": parserIdentity("governance-locks.v1", ["activeLocks", "governanceRestrictions", "truthBoundary"])
} satisfies Readonly<Record<InvestigativeContextPackId, InvestigativePayloadParserIdentity>>);

export const acceptedGraphProjectionPayloadParser = createPayloadParser<AcceptedGraphProjectionPayload>(
  "accepted-graph-projection.v1",
  "accepted-graph-projection.context.v1"
);
export const evidenceSummaryPayloadParser = createPayloadParser<EvidenceSummaryPayload>(
  "evidence-summary.v1",
  "evidence-summary.context.v1",
  parseEvidenceSummaryPayload
);
export const governanceLocksPayloadParser = createPayloadParser<GovernanceLocksPayload>(
  "governance-locks.v1",
  "governance-locks.context.v1"
);
export const investigativeContextPackPayloadParsers = Object.freeze([
  acceptedGraphProjectionPayloadParser,
  evidenceSummaryPayloadParser,
  governanceLocksPayloadParser
] as const);

export function buildSelectionManifestHash(
  body: InvestigativeSelectionManifestBody | InvestigativeSelectionManifest
): `sha256:${string}` {
  return hashAgentContextPack(canonicalSelectionManifestBody(body)) as `sha256:${string}`;
}

export function assertSelectionManifestHash(manifest: InvestigativeSelectionManifest): void {
  const expected = buildSelectionManifestHash(manifest);
  if (manifest.manifestHash !== expected) {
    throw new InvestigativeContextPackError("selection-manifest-hash-mismatch", "selection-manifest-hash-mismatch");
  }
}

const readerBatchSize = investigativeContextPackDefaultLimits.readerBatchSize;

async function selectForPack(
  contextPackId: InvestigativeContextPackId,
  input: BuildInvestigativeContextPackInput
): Promise<InvestigativeSelectionManifest> {
  if (input.scope.kind === "workspace" && input.window === undefined) {
    throw new InvestigativeContextPackError("selection-window-required", "selection-window-required");
  }
  const sizeBudgetBytes = input.sizeBudgetBytes
    ?? input.deps.budgets?.[contextPackId]
    ?? investigativeContextPackDefaultLimits.packBudgets[contextPackId];
  const manifest = await input.deps.selection.select({
    contextPackId,
    scope: input.scope,
    sizeBudgetBytes,
    ...(input.window === undefined ? {} : { window: input.window })
  });
  assertSelectionManifestHash(manifest);
  if (manifest.scope.kind !== input.scope.kind || manifest.scope.id !== input.scope.id) {
    throw new InvestigativeContextPackError("invalid-context-pack-scope", "invalid-context-pack-scope");
  }
  return manifest;
}

function includedIds(
  manifest: InvestigativeSelectionManifest,
  refKind: InvestigativeSelectionIncludedRef["refKind"]
): readonly string[] {
  return Object.freeze(manifest.includedRefs.filter((ref) => ref.refKind === refKind).map((ref) => ref.refId));
}

export async function __testOnlyResolveInvestigativeSelection(
  input: BuildInvestigativeContextPackInput & { readonly contextPackId: InvestigativeContextPackId }
): Promise<InvestigativeSelectionManifest> {
  return selectForPack(input.contextPackId, input);
}

export async function __testOnlyReadEvidenceSelectionProbe(
  input: BuildInvestigativeContextPackInput
): Promise<{ readonly manifest: InvestigativeSelectionManifest; readonly rows: readonly InvestigativeEvidenceRow[] }> {
  const manifest = await selectForPack("evidence-summary.v1", input);
  const evidenceRefs = manifest.includedRefs.filter((ref) => ref.refKind === "evidence");
  const rowOrder = new Map(evidenceRefs.map((ref, index) => [ref.refId, index]));
  const rows: InvestigativeEvidenceRow[] = [];

  for (let offset = 0; offset < evidenceRefs.length; offset += readerBatchSize) {
    const batch = evidenceRefs.slice(offset, offset + readerBatchSize);
    const batchRows = await input.deps.evidenceReader.readEvidenceByIds({
      evidenceIds: batch.map((ref) => ref.refId),
      contentHashes: batch
        .map((ref) => ref.contentHash)
        .filter((hash): hash is `sha256:${string}` => hash !== undefined),
      highWaterMarks: manifest.sourceProjectionHighWaterMarks,
      limit: readerBatchSize
    });
    rows.push(...batchRows);
  }

  rows.sort((left, right) => compareEvidenceRowsBySelectionOrder(left, right, rowOrder));
  return Object.freeze({ manifest, rows: Object.freeze(rows) });
}

export async function buildEvidenceSummaryContextPack(
  input: BuildInvestigativeContextPackInput
): Promise<ResolvedEvidenceSummaryContextPack> {
  const manifest = await selectForPack("evidence-summary.v1", input);
  const evidenceRefs = manifest.includedRefs.filter((ref) => ref.refKind === "evidence");
  const rows = await readSelectedEvidenceRows(input.deps.evidenceReader, manifest, evidenceRefs);
  const stalenessInputs: { kind: string; ref: string; value: string }[] = [];
  const items: EvidenceSummaryItem[] = [];

  for (const ref of evidenceRefs) {
    const row = rows.get(ref.refId);
    if (row === undefined || ref.contentHash === undefined || row.contentHash !== ref.contentHash) {
      throw new InvestigativeContextPackError("selection-row-mismatch", "selection-row-mismatch");
    }
    if (row.rawActionField !== undefined) {
      throw new InvestigativeContextPackError("raw-content-forbidden", "raw-content-forbidden");
    }
    assertEvidenceNarrativeSafety(row);
    const posture = await input.deps.evidenceSourcePosture.checkEvidence({
      evidenceId: row.evidenceId,
      contentHash: row.contentHash
    });
    stalenessInputs.push(...posture.stalenessInputs);
    if (!posture.ok) {
      throw new InvestigativeContextPackError(posture.code, posture.code);
    }
    items.push(toEvidenceSummaryItem(row));
  }

  const provenanceRefs = new Set<string>();
  for (const ref of evidenceRefs) {
    provenanceRefs.add(ref.refId);
    if (ref.contentHash !== undefined) {
      provenanceRefs.add(ref.contentHash);
    }
    for (const eventId of ref.sourceEventIds) {
      provenanceRefs.add(eventId);
    }
    const row = rows.get(ref.refId);
    if (row !== undefined) {
      provenanceRefs.add(row.ingestionEventId);
    }
  }

  const payload: EvidenceSummaryPayload = {
    schemaVersion: "evidence-summary.context.v1",
    contextPackId: "evidence-summary.v1",
    version: 1,
    scope: manifest.scope,
    truthBoundary: {
      evidenceIsReadOnly: true,
      rawContentExcluded: true
    },
    selectionManifest: manifest,
    projectionHighWaterMarks: manifest.sourceProjectionHighWaterMarks,
    packVersions: {},
    items: items as unknown as EvidenceSummaryPayload["items"],
    omissions: manifest.aggregateOmissions,
    stalenessInputs
  };
  const parsedPayload = evidenceSummaryPayloadParser.parsePayload(payload);
  const resolved = buildResolvedContextPack({
    contextPackId: "evidence-summary.v1",
    version: 1,
    generatedAt: input.deps.now(),
    payload: parsedPayload,
    safeSummary: "Provider-safe evidence summary",
    provenanceRefs: [...provenanceRefs].sort(compareText),
    sourceEventIds: [...provenanceRefs].filter((ref) => ref.startsWith("evt_")).sort(compareText),
    artifactHashes: [...provenanceRefs].filter((ref) => ref.startsWith("sha256:")).sort(compareText),
    scope: manifest.scope,
    stalenessInputs
  });
  const budget = input.sizeBudgetBytes
    ?? input.deps.budgets?.["evidence-summary.v1"]
    ?? investigativeContextPackDefaultLimits.packBudgets["evidence-summary.v1"];
  if (resolved.ref.sizeBytes > budget) {
    throw new InvestigativeContextPackError("context-budget-exceeded", "context-budget-exceeded");
  }
  return resolved as unknown as ResolvedEvidenceSummaryContextPack;
}

async function readSelectedEvidenceRows(
  reader: InvestigativeEvidenceReader,
  manifest: InvestigativeSelectionManifest,
  evidenceRefs: readonly InvestigativeSelectionIncludedRef[]
): Promise<ReadonlyMap<string, InvestigativeEvidenceRow>> {
  const rows = new Map<string, InvestigativeEvidenceRow>();
  for (let offset = 0; offset < evidenceRefs.length; offset += readerBatchSize) {
    const batch = evidenceRefs.slice(offset, offset + readerBatchSize);
    const batchRows = await reader.readEvidenceByIds({
      evidenceIds: batch.map((ref) => ref.refId),
      contentHashes: batch.map((ref) => ref.contentHash).filter((hash): hash is `sha256:${string}` => hash !== undefined),
      highWaterMarks: manifest.sourceProjectionHighWaterMarks,
      limit: readerBatchSize
    });
    for (const row of batchRows) {
      if (rows.has(row.evidenceId)) {
        throw new InvestigativeContextPackError("selection-row-mismatch", "selection-row-mismatch");
      }
      rows.set(row.evidenceId, row);
    }
  }
  if (rows.size !== evidenceRefs.length || [...rows.keys()].some((id) => !evidenceRefs.some((ref) => ref.refId === id))) {
    throw new InvestigativeContextPackError("selection-row-mismatch", "selection-row-mismatch");
  }
  return rows;
}

function assertEvidenceNarrativeSafety(row: InvestigativeEvidenceRow): void {
  try {
    if (row.safeNarrative !== undefined) {
      assertAgentSecretSafeText(row.safeNarrative, "safeNarrative");
    }
    for (const tag of row.governanceTags) {
      if (tag.safeRationale !== undefined) {
        assertAgentSecretSafeText(tag.safeRationale, "safeRationale");
      }
    }
  } catch {
    throw new InvestigativeContextPackError("secret-detected", "secret-detected");
  }
}

function toEvidenceSummaryItem(row: InvestigativeEvidenceRow): EvidenceSummaryItem {
  return {
    evidenceId: row.evidenceId,
    ingestionEventId: row.ingestionEventId,
    contentHash: row.contentHash,
    ...(row.mediaType === undefined ? {} : { mediaType: row.mediaType }),
    ...(row.sizeBytes === undefined ? {} : { sizeBytes: row.sizeBytes }),
    ...(row.sourceCollectionId === undefined ? {} : { sourceCollectionId: row.sourceCollectionId }),
    ...(row.scanBatchId === undefined ? {} : { scanBatchId: row.scanBatchId }),
    ...(row.importBatchId === undefined ? {} : { importBatchId: row.importBatchId }),
    occurrenceIds: row.occurrenceIds,
    parseJobs: row.parseJobs,
    governanceTags: row.governanceTags,
    ...(row.duplicateGroup === undefined ? {} : { duplicateGroup: row.duplicateGroup }),
    ...(row.safeNarrative === undefined ? {} : { safeNarrative: row.safeNarrative })
  };
}

function compareEvidenceRowsBySelectionOrder(
  left: InvestigativeEvidenceRow,
  right: InvestigativeEvidenceRow,
  rowOrder: ReadonlyMap<string, number>
): number {
  const orderDifference = (rowOrder.get(left.evidenceId) ?? Number.MAX_SAFE_INTEGER)
    - (rowOrder.get(right.evidenceId) ?? Number.MAX_SAFE_INTEGER);
  return orderDifference === 0 ? compareText(left.evidenceId, right.evidenceId) : orderDifference;
}

function parserIdentity(
  contextPackId: InvestigativeContextPackId,
  requiredPayloadSections: readonly string[]
): InvestigativePayloadParserIdentity {
  const parserSchemaVersion = "investigative-context-pack-payload-parser.v1";
  return Object.freeze({
    contextPackId,
    version: 1,
    parserSchemaVersion,
    parserHash: hashAgentContextPack({
      contextPackId,
      version: 1,
      parserSchemaVersion,
      requiredPayloadSections
    }) as `sha256:${string}`
  });
}

function createPayloadParser<Payload extends InvestigativeContextPackPayloadBase>(
  contextPackId: Payload["contextPackId"],
  schemaVersion: Payload["schemaVersion"],
  parseStrictPayload?: (payload: unknown) => Payload
): InvestigativeContextPackPayloadParser<Payload> {
  return Object.freeze({
    contextPackId,
    version: 1,
    parserIdentity: investigativePayloadParserIdentities[contextPackId],
    parsePayload(payload: unknown): Payload {
      if (!isPayloadWithIdentity(payload, contextPackId, schemaVersion)) {
        throw new InvestigativeContextPackError("context-payload-missing", "investigative-context-payload-invalid");
      }
      return parseStrictPayload === undefined ? payload as Payload : parseStrictPayload(payload);
    }
  });
}

function parseEvidenceSummaryPayload(payload: unknown): EvidenceSummaryPayload {
  if (!isPayloadWithExactKeys(payload, [
    "schemaVersion",
    "contextPackId",
    "version",
    "scope",
    "truthBoundary",
    "selectionManifest",
    "projectionHighWaterMarks",
    "packVersions",
    "items",
    "omissions",
    "stalenessInputs"
  ])) {
    throw new InvestigativeContextPackError("context-payload-missing", "evidence-summary payload invalid");
  }
  const value = payload as Record<string, unknown>;
  if (value.schemaVersion !== "evidence-summary.context.v1" || value.contextPackId !== "evidence-summary.v1" || value.version !== 1
    || !isPlainObject(value.scope) || !isPlainObject(value.truthBoundary) || !isPlainObject(value.selectionManifest)
    || !isPlainObject(value.projectionHighWaterMarks) || !isPlainObject(value.packVersions)
    || !Array.isArray(value.items) || !Array.isArray(value.omissions) || !Array.isArray(value.stalenessInputs)) {
    throw new InvestigativeContextPackError("context-payload-missing", "evidence-summary payload invalid");
  }
  return payload as unknown as EvidenceSummaryPayload;
}

function isPayloadWithExactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return isPlainObject(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isPayloadWithIdentity(
  value: unknown,
  contextPackId: InvestigativeContextPackId,
  schemaVersion: string
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
    && !Array.isArray(value)
    && (value as Record<string, unknown>).contextPackId === contextPackId
    && (value as Record<string, unknown>).schemaVersion === schemaVersion;
}

function canonicalSelectionManifestBody(
  manifest: InvestigativeSelectionManifestBody | InvestigativeSelectionManifest
): InvestigativeSelectionManifestBody {
  return Object.freeze({
    manifestVersion: manifest.manifestVersion,
    scope: Object.freeze({ ...manifest.scope }),
    sourceProjectionHighWaterMarks: Object.freeze({ ...manifest.sourceProjectionHighWaterMarks }),
    ordering: manifest.ordering,
    window: Object.freeze({ ...manifest.window }),
    totalEligibleCount: manifest.totalEligibleCount,
    includedRefs: Object.freeze([...manifest.includedRefs]
      .sort(compareIncludedRefs)
      .map((ref) => Object.freeze({
      refKind: ref.refKind,
      refId: ref.refId,
      sortKey: ref.sortKey,
      ...(ref.contentHash === undefined ? {} : { contentHash: ref.contentHash }),
      ...(ref.rowHash === undefined ? {} : { rowHash: ref.rowHash }),
      sourceEventIds: Object.freeze([...ref.sourceEventIds].sort(compareText)),
      mandatory: ref.mandatory
    }))),
    aggregateOmissions: Object.freeze([...manifest.aggregateOmissions]
      .sort(compareOmissionAggregates)
      .map((omission) => Object.freeze({
      reasonCode: omission.reasonCode,
      refKind: omission.refKind,
      aggregateKey: omission.aggregateKey,
      count: omission.count,
      ...(omission.sampleRefs === undefined
        ? {}
        : {
            sampleRefs: Object.freeze([...omission.sampleRefs]
              .sort(compareOmissionSampleRefs)
              .map((sample) => Object.freeze({ ...sample })))
          })
    })))
  });
}

function compareIncludedRefs(left: InvestigativeSelectionIncludedRef, right: InvestigativeSelectionIncludedRef): number {
  return compareByFields(
    [left.sortKey, left.refKind, left.refId, left.contentHash ?? "", left.rowHash ?? ""],
    [right.sortKey, right.refKind, right.refId, right.contentHash ?? "", right.rowHash ?? ""]
  );
}

function compareOmissionAggregates(
  left: InvestigativeContextOmissionAggregate,
  right: InvestigativeContextOmissionAggregate
): number {
  return compareByFields(
    [left.reasonCode, left.refKind, left.aggregateKey],
    [right.reasonCode, right.refKind, right.aggregateKey]
  );
}

function compareOmissionSampleRefs(left: InvestigativeOmissionSampleRef, right: InvestigativeOmissionSampleRef): number {
  return compareByFields(
    [left.refKind, left.refId, left.contentHash ?? ""],
    [right.refKind, right.refId, right.contentHash ?? ""]
  );
}

function compareByFields(left: readonly string[], right: readonly string[]): number {
  for (let index = 0; index < left.length; index += 1) {
    const comparison = compareText(left[index]!, right[index]!);
    if (comparison !== 0) {
      return comparison;
    }
  }
  return 0;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
