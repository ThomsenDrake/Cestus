import { createHash } from "node:crypto";
import { z } from "zod";
import {
  actorRefSchema,
  validateKnowledgeEvent,
  type AppendableKnowledgeEvent,
  type KnowledgeEvent,
  type KnowledgeEventOf
} from "../../ontology/src/contracts.js";
import type { FileBlobStore } from "../../ontology/src/blob-store.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";
import type { LegacyInspectedFile } from "./legacy-inspector.js";
import type { WorkspaceBlobStore } from "./mount-contract.js";
import type {
  LegacyDetection,
  LegacyProposedAssertionCandidate,
  LegacyQuarantineEntry
} from "./legacy-types.js";
import {
  legacyConfidenceSchema,
  legacySecretSafeDiagnosticTextSchema
} from "./legacy-types.js";

type ActorRef = z.infer<typeof actorRefSchema>;

export interface LegacyReportDetectionRecord extends LegacyDetection {
  sourcePath: string;
  contentHash: `sha256:${string}`;
}

export interface BuildLegacyMigrationReportInput {
  sourceCollectionId: string;
  scanBatchId: string;
  files: LegacyInspectedFile[];
  detections: LegacyReportDetectionRecord[];
  proposedAssertionCandidates: LegacyProposedAssertionCandidate[];
  quarantineEntries: LegacyQuarantineEntry[];
}

export interface LegacyReportTotals {
  inspectedFiles: number;
  candidateMetadataFiles: number;
  proposedAssertionCandidates: number;
  quarantineEntries: number;
  unresolvedReferences: number;
}

export interface LegacyMigrationReport extends BuildLegacyMigrationReportInput {
  legacyReportId: string;
  reportHash: `sha256:${string}`;
  candidateSetHash: `sha256:${string}`;
  generatedAt: string;
  generator: { name: "legacy-cestus-inspector"; version: "0.1.0" };
  totals: LegacyReportTotals;
  recommendedNextActions: string[];
}

export interface LegacyMigrationReportServiceDependencies {
  ledger: EventLedger;
  reportStore: FileBlobStore;
  actor: ActorRef;
}

export interface ReadCanonicalStagedLegacyReportInput {
  readonly ledger: Pick<EventLedger, "readAll">;
  readonly derivativeStore: Pick<WorkspaceBlobStore, "get">;
  readonly reportEventId: string;
  readonly sourceCollectionId: string;
  readonly scanBatchId: string;
  readonly legacyReportId: string;
  readonly reportHash: `sha256:${string}`;
}

export type ReadCanonicalStagedLegacyReportResult =
  | {
      readonly ok: true;
      readonly report: LegacyMigrationReport;
      readonly reportEvent: KnowledgeEventOf<"legacy.import.report.generated">;
    }
  | {
      readonly ok: false;
      readonly code: "LEGACY_STAGED_REPORT_EVENT_MISMATCH" | "LEGACY_STAGED_REPORT_ARTIFACT_MISMATCH";
    };

const generatedAt = "2026-07-06T00:00:00.000Z";
const generator = { name: "legacy-cestus-inspector", version: "0.1.0" } as const;

export class LegacyMigrationReportService {
  constructor(private readonly dependencies: LegacyMigrationReportServiceDependencies) {
    const actor = actorRefSchema.safeParse(dependencies.actor);

    if (!actor.success) {
      throw new Error(`Invalid legacy report actor: ${actor.error.issues[0]?.message ?? actor.error.message}`);
    }
  }

  async recordReport(report: LegacyMigrationReport): Promise<KnowledgeEventOf<"legacy.import.report.generated">> {
    const reportArtifact = reportArtifactJson(report);
    const stored = await this.dependencies.reportStore.put(Buffer.from(reportArtifact, "utf8"));

    if (stored.contentHash !== report.reportHash) {
      throw new Error(`Report hash mismatch for ${report.legacyReportId}`);
    }

    const event: AppendableKnowledgeEvent<"legacy.import.report.generated"> = {
      type: "legacy.import.report.generated",
      version: 1,
      streamId: legacyReportStreamId(report),
      context: {
        actor: this.dependencies.actor,
        occurredAt: new Date().toISOString(),
        correlationId: `corr_${report.legacyReportId}`,
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0", ingestion: "0.1.0", legacy: "0.1.0" }
      },
      payload: {
        legacyReportId: report.legacyReportId,
        sourceCollectionId: report.sourceCollectionId,
        scanBatchId: report.scanBatchId,
        reportHash: report.reportHash,
        candidateSetHash: report.candidateSetHash,
        generatedAt: report.generatedAt,
        generator: report.generator,
        totals: report.totals
      }
    };
    const appended = await this.dependencies.ledger.append(event, { expectedNextSequence: 1 });

    if (appended.type !== "legacy.import.report.generated") {
      throw new Error(`Unexpected event type appended for legacy report: ${appended.type}`);
    }

    return appended;
  }
}

/**
 * Reads a report only through its immutable `legacy.import.report.generated`
 * ledger record and the named derivative artifact. This is deliberately a
 * capability-injected read boundary: it never accepts report bytes, appends an
 * event, writes a blob, or delegates to an ingestion runtime.
 */
export async function readCanonicalStagedLegacyReport(
  input: ReadCanonicalStagedLegacyReportInput
): Promise<ReadCanonicalStagedLegacyReportResult> {
  const normalized = normalizeStagedReportReadInput(input);

  if (normalized === undefined) {
    return stagedReportReadFailure("LEGACY_STAGED_REPORT_EVENT_MISMATCH");
  }

  let readback: unknown;
  try {
    readback = await normalized.readAll();
  } catch {
    return stagedReportReadFailure("LEGACY_STAGED_REPORT_EVENT_MISMATCH");
  }

  const normalizedReadback = normalizePlainOwnData(readback);
  if (!normalizedReadback.success || !Array.isArray(normalizedReadback.data)) {
    return stagedReportReadFailure("LEGACY_STAGED_REPORT_EVENT_MISMATCH");
  }

  const events: KnowledgeEvent[] = [];
  for (const rawEvent of normalizedReadback.data) {
    const parsed = validateKnowledgeEvent(rawEvent);
    if (!parsed.success) {
      return stagedReportReadFailure("LEGACY_STAGED_REPORT_EVENT_MISMATCH");
    }
    events.push(parsed.data);
  }

  const matches = events.filter((event) => event.id === normalized.reference.reportEventId);
  const reportEvent = matches[0];
  if (
    matches.length !== 1 ||
    reportEvent === undefined ||
    reportEvent.type !== "legacy.import.report.generated" ||
    !matchesCanonicalReportReference(reportEvent, normalized.reference)
  ) {
    return stagedReportReadFailure("LEGACY_STAGED_REPORT_EVENT_MISMATCH");
  }

  let artifact: unknown;
  try {
    artifact = await normalized.get(normalized.reference.reportHash);
  } catch {
    return stagedReportReadFailure("LEGACY_STAGED_REPORT_ARTIFACT_MISMATCH");
  }

  const report = parseCanonicalStagedReportArtifact(artifact, normalized.reference, reportEvent);
  if (report === undefined) {
    return stagedReportReadFailure("LEGACY_STAGED_REPORT_ARTIFACT_MISMATCH");
  }
  if (!matchesCanonicalReportEvent(report, reportEvent)) {
    return stagedReportReadFailure("LEGACY_STAGED_REPORT_EVENT_MISMATCH");
  }
  return Object.freeze({ ok: true, report, reportEvent });
}

export function buildLegacyMigrationReport(input: BuildLegacyMigrationReportInput): LegacyMigrationReport {
  const sortedFiles = sortFiles(input.files);
  const sortedDetections = sortDetections(input.detections);
  const sortedCandidates = sortProposedAssertionCandidates(input.proposedAssertionCandidates);
  const sortedQuarantineEntries = sortQuarantineEntries(input.quarantineEntries);
  const candidateSetHash = sha256(stableJson(sortedCandidates));
  const reportMaterial = {
    sourceCollectionId: input.sourceCollectionId,
    scanBatchId: input.scanBatchId,
    files: sortedFiles,
    detections: sortedDetections,
    proposedAssertionCandidates: sortedCandidates,
    quarantineEntries: sortedQuarantineEntries,
    candidateSetHash,
    generatedAt,
    generator,
    totals: {
      inspectedFiles: input.files.length,
      candidateMetadataFiles: candidateMetadataFileCount(input.detections),
      proposedAssertionCandidates: input.proposedAssertionCandidates.length,
      quarantineEntries: input.quarantineEntries.length,
      unresolvedReferences: input.quarantineEntries.filter((entry) => entry.issueCategory === "stale-reference").length
    },
    recommendedNextActions: [
      "Review raw import summary before evidence import",
      "Review proposed assertion candidates before ontology staging",
      "Keep candidate entity resolution and relationship material in the report"
    ]
  };
  const legacyReportId = `legacy_report_${sha256Hex(stableJson(reportMaterial))}`;
  const reportWithoutHash = {
    ...reportMaterial,
    legacyReportId
  } satisfies Omit<LegacyMigrationReport, "reportHash">;

  return {
    ...reportWithoutHash,
    reportHash: sha256(stableJson(reportWithoutHash))
  };
}

type CanonicalContentHash = `sha256:${string}`;

type CanonicalStagedReportReference = {
  readonly reportEventId: string;
  readonly sourceCollectionId: string;
  readonly scanBatchId: string;
  readonly legacyReportId: string;
  readonly reportHash: CanonicalContentHash;
};

const contentHashSchema = z.string()
  .regex(/^sha256:[a-f0-9]{64}$/)
  .transform((value): CanonicalContentHash => value as CanonicalContentHash);
const stagedReportReferenceSchema = z.object({
  reportEventId: z.string().regex(/^evt_[a-zA-Z0-9_-]+$/),
  sourceCollectionId: z.string().regex(/^src_[a-zA-Z0-9_-]+$/),
  scanBatchId: z.string().regex(/^scan_[a-zA-Z0-9_-]+$/),
  legacyReportId: z.string().regex(/^legacy_report_[a-zA-Z0-9_-]+$/),
  reportHash: contentHashSchema
}).strict();

const legacyPluginRefSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1)
}).strict();

const legacyInspectedFileSchema = z.object({
  sourcePath: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  contentHash: contentHashSchema,
  mediaType: z.string().min(1),
  sourceCollectionId: z.string().regex(/^src_[a-zA-Z0-9_-]+$/),
  scanBatchId: z.string().regex(/^scan_[a-zA-Z0-9_-]+$/),
  occurrenceId: z.string().regex(/^occ_[a-zA-Z0-9_-]+$/),
  status: z.enum(["new", "duplicate", "changed", "missing", "skipped"]),
  internalPath: z.string().min(1).optional(),
  containerPath: z.string().min(1).optional(),
  containerHash: contentHashSchema.optional(),
  archiveAdapter: legacyPluginRefSchema.optional()
}).strict();

const legacyDetectionRecordSchema = z.object({
  sourcePath: z.string().min(1),
  contentHash: contentHashSchema,
  plugin: legacyPluginRefSchema,
  shape: z.string().min(1),
  confidence: legacyConfidenceSchema,
  parserEligible: z.boolean(),
  reasonCodes: z.array(z.string().min(1)),
  warnings: z.array(legacySecretSafeDiagnosticTextSchema).optional()
}).strict();

const legacyCandidateSchema = z.object({
  candidateId: z.string().regex(/^legacy_candidate_[a-zA-Z0-9_-]+$/),
  observationId: z.string().min(1),
  evidenceContentHash: contentHashSchema,
  sourcePath: z.string().min(1),
  predicate: z.string().min(1),
  object: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  subjectRef: z.string().min(1).optional(),
  confidence: legacyConfidenceSchema
}).strict();

const legacyQuarantineEntrySchema = z.object({
  quarantineId: z.string().min(1),
  sourcePath: z.string().min(1),
  contentHash: contentHashSchema,
  plugin: legacyPluginRefSchema,
  issueCategory: z.enum(["malformed", "ambiguous", "unsupported", "stale-reference", "unsafe", "conflict"]),
  message: legacySecretSafeDiagnosticTextSchema,
  legacyIds: z.array(z.string().min(1)),
  repairActions: z.array(legacySecretSafeDiagnosticTextSchema)
}).strict();

const legacyReportArtifactSchema = z.object({
  sourceCollectionId: z.string().regex(/^src_[a-zA-Z0-9_-]+$/),
  scanBatchId: z.string().regex(/^scan_[a-zA-Z0-9_-]+$/),
  files: z.array(legacyInspectedFileSchema),
  detections: z.array(legacyDetectionRecordSchema),
  proposedAssertionCandidates: z.array(legacyCandidateSchema),
  quarantineEntries: z.array(legacyQuarantineEntrySchema),
  legacyReportId: z.string().regex(/^legacy_report_[a-zA-Z0-9_-]+$/),
  candidateSetHash: contentHashSchema,
  generatedAt: z.string().datetime(),
  generator: z.object({
    name: z.literal("legacy-cestus-inspector"),
    version: z.literal("0.1.0")
  }).strict(),
  totals: z.object({
    inspectedFiles: z.number().int().nonnegative(),
    candidateMetadataFiles: z.number().int().nonnegative(),
    proposedAssertionCandidates: z.number().int().nonnegative(),
    quarantineEntries: z.number().int().nonnegative(),
    unresolvedReferences: z.number().int().nonnegative()
  }).strict(),
  recommendedNextActions: z.array(z.string().min(1))
}).strict();

function normalizeStagedReportReadInput(input: ReadCanonicalStagedLegacyReportInput): {
  readonly reference: CanonicalStagedReportReference;
  readonly readAll: () => Promise<unknown>;
  readonly get: (contentHash: `sha256:${string}`) => Promise<unknown>;
} | undefined {
  if (typeof input !== "object" || input === null ||
    (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null)) {
    return undefined;
  }

  try {
    const expectedKeys = [
      "ledger",
      "derivativeStore",
      "reportEventId",
      "sourceCollectionId",
      "scanBatchId",
      "legacyReportId",
      "reportHash"
    ];
    const keys = Reflect.ownKeys(input);
    if (keys.length !== expectedKeys.length || keys.some((key) => typeof key !== "string" || !expectedKeys.includes(key))) {
      return undefined;
    }
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const values: Record<string, unknown> = {};
    for (const key of expectedKeys) {
      const descriptor = descriptors[key];
      if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
        return undefined;
      }
      values[key] = descriptor.value;
    }
    const reference = stagedReportReferenceSchema.safeParse({
      reportEventId: values.reportEventId,
      sourceCollectionId: values.sourceCollectionId,
      scanBatchId: values.scanBatchId,
      legacyReportId: values.legacyReportId,
      reportHash: values.reportHash
    });
    const readAll = readCapabilityMethod(values.ledger, "readAll");
    const get = readCapabilityMethod(values.derivativeStore, "get");
    if (!reference.success || readAll === undefined || get === undefined) {
      return undefined;
    }
    const canonicalReference: CanonicalStagedReportReference = Object.freeze(reference.data);
    return Object.freeze({
      reference: canonicalReference,
      readAll: (): Promise<unknown> => Promise.resolve(readAll()),
      get: (contentHash: CanonicalContentHash): Promise<unknown> => Promise.resolve(get(contentHash))
    });
  } catch {
    return undefined;
  }
}

type StagedReportReadCapabilities = {
  readonly readAll: () => unknown;
  readonly get: (contentHash: CanonicalContentHash) => unknown;
};

function readCapabilityMethod<TKey extends keyof StagedReportReadCapabilities>(
  value: unknown,
  key: TKey
): StagedReportReadCapabilities[TKey] | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  let prototype: object | null = value;
  while (prototype !== null) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, key);
    if (descriptor !== undefined) {
      if (!("value" in descriptor) || typeof descriptor.value !== "function") {
        return undefined;
      }
      return descriptor.value.bind(value) as StagedReportReadCapabilities[TKey];
    }
    prototype = Object.getPrototypeOf(prototype);
  }
  return undefined;
}

function matchesCanonicalReportReference(
  event: KnowledgeEventOf<"legacy.import.report.generated">,
  reference: CanonicalStagedReportReference
): boolean {
  return event.streamId === legacyReportStreamId(reference) &&
    event.payload.legacyReportId === reference.legacyReportId &&
    event.payload.sourceCollectionId === reference.sourceCollectionId &&
    event.payload.scanBatchId === reference.scanBatchId &&
    event.payload.reportHash === reference.reportHash;
}

function parseCanonicalStagedReportArtifact(
  artifact: unknown,
  reference: CanonicalStagedReportReference,
  reportEvent: KnowledgeEventOf<"legacy.import.report.generated">
): LegacyMigrationReport | undefined {
  const bytes = copyCanonicalArtifactBytes(artifact);
  if (bytes === undefined) {
    return undefined;
  }
  const text = bytes.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(bytes) || sha256(text) !== reference.reportHash) {
    return undefined;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return undefined;
  }

  const normalized = normalizePlainOwnData(raw);
  if (!normalized.success) {
    return undefined;
  }
  const parsed = legacyReportArtifactSchema.safeParse(normalized.data);
  if (!parsed.success ||
    parsed.data.sourceCollectionId !== reference.sourceCollectionId ||
    parsed.data.scanBatchId !== reference.scanBatchId ||
    parsed.data.legacyReportId !== reference.legacyReportId ||
    parsed.data.candidateSetHash !== reportEvent.payload.candidateSetHash ||
    !parsed.data.files.every((file) =>
      file.sourceCollectionId === reference.sourceCollectionId && file.scanBatchId === reference.scanBatchId
    )) {
    return undefined;
  }

  let report: LegacyMigrationReport;
  try {
    report = buildLegacyMigrationReport({
      sourceCollectionId: parsed.data.sourceCollectionId,
      scanBatchId: parsed.data.scanBatchId,
      files: parsed.data.files as LegacyInspectedFile[],
      detections: parsed.data.detections as LegacyReportDetectionRecord[],
      proposedAssertionCandidates: parsed.data.proposedAssertionCandidates as LegacyProposedAssertionCandidate[],
      quarantineEntries: parsed.data.quarantineEntries as LegacyQuarantineEntry[]
    });
  } catch {
    return undefined;
  }

  return report.reportHash === reference.reportHash &&
    report.candidateSetHash === reportEvent.payload.candidateSetHash &&
    report.legacyReportId === reference.legacyReportId &&
    reportArtifactJson(report) === text
    ? report
    : undefined;
}

function matchesCanonicalReportEvent(
  report: LegacyMigrationReport,
  event: KnowledgeEventOf<"legacy.import.report.generated">
): boolean {
  const totals = event.payload.totals;
  return event.streamId === legacyReportStreamId(report) &&
    event.payload.legacyReportId === report.legacyReportId &&
    event.payload.sourceCollectionId === report.sourceCollectionId &&
    event.payload.scanBatchId === report.scanBatchId &&
    event.payload.reportHash === report.reportHash &&
    event.payload.candidateSetHash === report.candidateSetHash &&
    event.payload.generatedAt === report.generatedAt &&
    event.payload.generator.name === report.generator.name &&
    event.payload.generator.version === report.generator.version &&
    totals.inspectedFiles === report.totals.inspectedFiles &&
    totals.candidateMetadataFiles === report.totals.candidateMetadataFiles &&
    totals.proposedAssertionCandidates === report.totals.proposedAssertionCandidates &&
    totals.quarantineEntries === report.totals.quarantineEntries &&
    totals.unresolvedReferences === report.totals.unresolvedReferences;
}

function copyCanonicalArtifactBytes(artifact: unknown): Buffer | undefined {
  try {
    // The native iterator is the first operation: it proves native typed-array
    // internal slots without walking Proxy or subclass shape. Only then
    // inspect the canonical Buffer's direct prototype and own byte indices.
    const valuesIterator = Uint8Array.prototype.values.call(artifact);
    if (typeof artifact !== "object" || artifact === null) {
      return undefined;
    }
    if (Object.getPrototypeOf(artifact) !== Buffer.prototype) {
      return undefined;
    }
    const ownKeys = Reflect.ownKeys(artifact);
    if (ownKeys.some((key) => typeof key !== "string" || !isCanonicalBufferByteIndex(key))) {
      return undefined;
    }
    const values = Array.from(valuesIterator);
    if (ownKeys.length !== values.length) {
      return undefined;
    }
    for (let index = 0; index < values.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(artifact, String(index));
      if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
        return undefined;
      }
    }
    return Buffer.from(values);
  } catch {
    return undefined;
  }
}

function isCanonicalBufferByteIndex(key: string): boolean {
  return key === "0" || /^[1-9][0-9]*$/.test(key);
}

function stagedReportReadFailure(
  code: "LEGACY_STAGED_REPORT_EVENT_MISMATCH" | "LEGACY_STAGED_REPORT_ARTIFACT_MISMATCH"
): ReadCanonicalStagedLegacyReportResult {
  return Object.freeze({ ok: false, code });
}

type PlainOwnDataNormalization =
  | { readonly success: true; readonly data: unknown }
  | { readonly success: false };

function normalizePlainOwnData(value: unknown): PlainOwnDataNormalization {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return { success: true, data: value };
  }
  if (typeof value !== "object") {
    return { success: false };
  }
  try {
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key === "symbol")) {
      return { success: false };
    }
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) {
        return { success: false };
      }
      const length = Object.getOwnPropertyDescriptor(value, "length");
      if (length === undefined || !("value" in length) ||
        typeof length.value !== "number" || !Number.isSafeInteger(length.value) || length.value < 0 ||
        keys.length !== length.value + 1) {
        return { success: false };
      }
      const normalized: unknown[] = [];
      for (let index = 0; index < length.value; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
          return { success: false };
        }
        const child = normalizePlainOwnData(descriptor.value);
        if (!child.success) {
          return child;
        }
        normalized.push(child.data);
      }
      return { success: true, data: Object.freeze(normalized) };
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return { success: false };
    }
    const normalized: Record<string, unknown> = {};
    for (const key of keys) {
      if (typeof key !== "string" || key.length === 0) {
        return { success: false };
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
        return { success: false };
      }
      const child = normalizePlainOwnData(descriptor.value);
      if (!child.success) {
        return child;
      }
      Object.defineProperty(normalized, key, {
        value: child.data,
        enumerable: true,
        writable: false,
        configurable: false
      });
    }
    return { success: true, data: Object.freeze(normalized) };
  } catch {
    return { success: false };
  }
}

export function legacyReportStreamId(
  report: Pick<LegacyMigrationReport, "sourceCollectionId" | "scanBatchId" | "legacyReportId">
): string {
  return `legacy_report_${report.sourceCollectionId}_${report.scanBatchId}_${report.legacyReportId}`;
}

export function reportArtifactJson(report: LegacyMigrationReport): string {
  const { reportHash: _reportHash, ...reportWithoutHash } = report;
  return stableJson(reportWithoutHash);
}

export function stableJson(value: unknown): string {
  return JSON.stringify(sortStableJsonValue(value));
}

export function sha256(text: string): `sha256:${string}` {
  return `sha256:${sha256Hex(text)}`;
}

export function sortStableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortStableJsonValue);
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => compareCodeUnits(left, right))
        .map(([key, item]) => [key, sortStableJsonValue(item)])
    );
  }

  return value;
}

function sortFiles(files: readonly LegacyInspectedFile[]): LegacyInspectedFile[] {
  return [...files].sort((left, right) => compareTuple(fileIdentityTuple(left), fileIdentityTuple(right)));
}

function sortDetections(detections: readonly LegacyReportDetectionRecord[]): LegacyReportDetectionRecord[] {
  return [...detections].sort((left, right) =>
    compareTuple([
      left.sourcePath,
      left.contentHash,
      left.plugin.name,
      left.plugin.version,
      left.shape
    ], [
      right.sourcePath,
      right.contentHash,
      right.plugin.name,
      right.plugin.version,
      right.shape
    ])
  );
}

function sortProposedAssertionCandidates(
  candidates: readonly LegacyProposedAssertionCandidate[]
): LegacyProposedAssertionCandidate[] {
  return [...candidates].sort((left, right) =>
    compareTuple([
      left.candidateId,
      left.observationId,
      left.sourcePath,
      left.evidenceContentHash,
      left.predicate
    ], [
      right.candidateId,
      right.observationId,
      right.sourcePath,
      right.evidenceContentHash,
      right.predicate
    ])
  );
}

function sortQuarantineEntries(entries: readonly LegacyQuarantineEntry[]): LegacyQuarantineEntry[] {
  return [...entries].sort((left, right) =>
    compareTuple([
      left.sourcePath,
      left.quarantineId,
      left.contentHash,
      left.plugin.name,
      left.plugin.version
    ], [
      right.sourcePath,
      right.quarantineId,
      right.contentHash,
      right.plugin.name,
      right.plugin.version
    ])
  );
}

function fileIdentityTuple(file: LegacyInspectedFile): string[] {
  return [
    file.sourcePath,
    file.internalPath ?? "",
    file.occurrenceId,
    file.containerHash ?? ""
  ];
}

function candidateMetadataFileCount(detections: readonly LegacyReportDetectionRecord[]): number {
  return new Set(detections.map((detection) => `${detection.sourcePath}\u0000${detection.contentHash}`)).size;
}

function sha256Hex(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function compareTuple(left: readonly string[], right: readonly string[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const result = compareCodeUnits(left[index] ?? "", right[index] ?? "");

    if (result !== 0) {
      return result;
    }
  }

  return 0;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
