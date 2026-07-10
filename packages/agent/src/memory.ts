import {
  buildResolvedContextPack,
  type ContextPackRef,
  type ContextPackScope,
  type ResolvedContextPack
} from "./context-packs.js";
import type { OperationalAgentMemorySnapshot, OperationalEmptyProjectionProof } from "./operational-context-packs.js";
import type { AgentProjection } from "./projection.js";
import type {
  AgentMemoryEventType,
  AgentMemoryKind,
  AgentMemoryScope,
  AgentMemoryState,
  ProjectedAgentMemory
} from "./projection-types.js";
import { assertAgentSecretSafeText } from "./secret-safety.js";

export interface AgentMemoryTruthBoundaryDto {
  readonly authoritativeForOntology: false;
  readonly label: "working-memory-not-ontology-truth";
  readonly graphEffectRequires: "evidence-backed-proposed-assertion-or-reviewed-reasoning";
}

export interface AgentMemoryListDto {
  readonly schemaVersion: "agent-memory-list.v1";
  readonly generatedAt: string;
  readonly filters: AgentMemoryFiltersDto;
  readonly truthBoundary: AgentMemoryTruthBoundaryDto;
  readonly items: readonly ProjectedAgentMemory[];
}

export interface AgentMemoryDetailDto {
  readonly schemaVersion: "agent-memory-detail.v1";
  readonly generatedAt: string;
  readonly truthBoundary: AgentMemoryTruthBoundaryDto;
  readonly memory: ProjectedAgentMemory;
  readonly history: readonly AgentMemoryHistoryEntryDto[];
}

export interface AgentMemoryFiltersDto {
  readonly scope?: AgentMemoryScope | "all";
  readonly state?: AgentMemoryState | "all";
}

export interface AgentMemoryHistoryEntryDto {
  readonly eventId: string;
  readonly eventType: AgentMemoryEventType;
  readonly occurredAt?: string;
}

export interface BuildAgentMemoryListInput {
  readonly projection: AgentProjection;
  readonly generatedAt: string;
  readonly filters?: AgentMemoryFiltersDto;
}

export interface BuildAgentMemorySummaryContextPackInput {
  readonly generatedAt: string;
  readonly policyVersion: string;
  readonly scope: ContextPackScope;
  readonly projectionHighWaterMark: number;
  readonly sizeBudgetBytes: number;
  readonly memorySnapshot?: OperationalAgentMemorySnapshot;
  /** Compatibility adapter input. It is immediately reduced to a bounded snapshot. */
  readonly projection?: AgentProjection;
  readonly emptyMemoryProof?: OperationalEmptyProjectionProof;
  readonly maxItems?: number;
}

interface AgentMemorySummaryItemDto {
  readonly memoryId: string;
  readonly scope: AgentMemoryScope;
  readonly memoryKind: AgentMemoryKind;
  readonly summary: string;
  readonly confidence: number;
  readonly sourceEventIds: readonly string[];
  readonly artifactHashes: readonly string[];
  readonly expiresAt?: string | undefined;
}

const maximumProjectionMemoryWindowItems = 25;
const memoryScopes = new Set<AgentMemoryScope>(["workspace", "investigation", "task", "provider", "policy"]);
const memoryKinds = new Set<AgentMemoryKind>(["operator-preference", "agent-observation", "policy-caveat", "provider-note"]);
const memoryOmissionCodes = new Set([
  "omitted.raw-paths", "omitted.raw-provider-errors", "omitted.prompts", "omitted.model-output", "omitted.credentials",
  "omitted.raw-source-content", "omitted.out-of-scope", "omitted.size-budget"
]);

export function buildAgentMemoryList(input: BuildAgentMemoryListInput): AgentMemoryListDto {
  const filters = deepFreeze({
    scope: input.filters?.scope ?? "all",
    state: input.filters?.state ?? "active"
  });
  const allMemory = [...input.projection.memoryHistory.values()];
  const items = allMemory
    .filter((memory) => filters.scope === "all" || memory.scope === filters.scope)
    .filter((memory) => filters.state === "all" || memory.state === filters.state)
    .sort(compareMemory);

  return deepFreeze({
    schemaVersion: "agent-memory-list.v1",
    generatedAt: input.generatedAt,
    filters,
    truthBoundary: memoryTruthBoundary(),
    items
  });
}

export function buildAgentMemoryDetail(input: {
  readonly projection: AgentProjection;
  readonly memoryId: string;
  readonly generatedAt: string;
}): AgentMemoryDetailDto | undefined {
  assertAgentSecretSafeText(input.memoryId, "memoryId");
  const memory = input.projection.memoryHistory.get(input.memoryId);
  if (memory === undefined) {
    return undefined;
  }

  return deepFreeze({
    schemaVersion: "agent-memory-detail.v1",
    generatedAt: input.generatedAt,
    truthBoundary: memoryTruthBoundary(),
    memory,
    history: historyFor(memory)
  });
}

export function buildAgentMemorySummaryContextPack(input: BuildAgentMemorySummaryContextPackInput): ContextPackRef {
  return buildAgentMemorySummaryResolvedContextPack(input).ref;
}

export function buildAgentMemorySummaryResolvedContextPack(
  input: BuildAgentMemorySummaryContextPackInput
): ResolvedContextPack {
  const snapshot = normalizeMemorySnapshot(input);
  if (snapshot.projectionHighWaterMark !== input.projectionHighWaterMark ||
    snapshot.projectionSourceRef !== "agent.projection.memory") {
    throw new Error("blocked.projection-source-mismatch: memory snapshot does not match its projection source");
  }
  const items = snapshot.activeMemory
    .map(toMemorySummaryItem);
  if (items.some((memory) => memory.sourceEventIds.length === 0 && memory.artifactHashes.length === 0)) {
    throw new Error("blocked.missing-provenance: active memory items require source event IDs or artifact hashes");
  }
  const isEmpty = items.length === 0;
  const emptyProof = input.emptyMemoryProof ?? snapshot.emptyProof;
  if (!isEmpty && emptyProof !== undefined) {
    throw new Error("blocked.projection-source-mismatch: non-empty memory must not include empty proof");
  }
  const normalizedEmptyProof = isEmpty ? assertEmptyMemoryProof(emptyProof, input, snapshot) : undefined;
  const provenanceRefs = isEmpty
    ? [emptyProjectionProvenanceRef(normalizedEmptyProof!)]
    : unique([
      ...snapshot.lifecycleProvenanceRefs,
      ...snapshot.sourceEventIds,
      ...snapshot.artifactHashes
    ]);
  const payload = {
    schemaVersion: "agent-memory-summary.v1",
    memory: {
      truthBoundary: { authoritativeForOntology: false as const },
      projectionHighWaterMark: snapshot.projectionHighWaterMark,
      projectionSourceRef: snapshot.projectionSourceRef,
      activeMemory: items,
      aggregateCounts: snapshot.aggregateCounts,
      sourceEventIds: snapshot.sourceEventIds,
      artifactHashes: snapshot.artifactHashes,
      window: snapshot.window,
      ...(normalizedEmptyProof === undefined ? {} : { emptyProof: normalizedEmptyProof })
    }
  };

  try {
    return buildResolvedContextPack({
    contextPackId: "agent-memory-summary.v1",
    version: 1,
    generatedAt: input.generatedAt,
    payload,
    safeSummary: `${items.length} active working memory item${items.length === 1 ? "" : "s"}; not ontology truth.`,
    provenanceRefs,
    projectionHighWaterMark: input.projectionHighWaterMark,
    sourceEventIds: snapshot.sourceEventIds,
    artifactHashes: snapshot.artifactHashes,
    policyVersion: input.policyVersion,
    scope: input.scope,
    sizeBudgetBytes: input.sizeBudgetBytes,
    stalenessInputs: [{
      kind: "projection-high-water-mark",
      ref: "agent.projection.memory",
      value: String(input.projectionHighWaterMark)
    }]
    });
  } catch (error) {
    if (error instanceof Error && /sizeBudgetBytes must be at least/.test(error.message)) {
      throw new Error("blocked.size-budget: no bounded safe memory payload fits the size budget");
    }
    throw error;
  }
}

interface NormalizedMemorySnapshot extends OperationalAgentMemorySnapshot {
  readonly lifecycleProvenanceRefs: readonly string[];
}

function normalizeMemorySnapshot(input: BuildAgentMemorySummaryContextPackInput): NormalizedMemorySnapshot {
  if (input.memorySnapshot !== undefined) {
    return normalizeDirectMemorySnapshot(input.memorySnapshot);
  }
  if (input.projection === undefined) {
    throw new Error("blocked.unbounded-source: memorySnapshot is required when no projection compatibility input is provided");
  }

  const totalActiveMemoryCount = input.projection.activeMemory.length;
  const effectiveWindowLimit = Math.min(
    Math.max(1, Math.floor(input.maxItems ?? maximumProjectionMemoryWindowItems)),
    maximumProjectionMemoryWindowItems
  );
  const activeMemory = selectTopMemory(input.projection.activeMemory, effectiveWindowLimit);
  const sourceEventIds = unique(activeMemory.flatMap((memory) => memory.sourceEventIds)).slice().sort();
  const artifactHashes = unique(activeMemory.flatMap((memory) => memory.artifactHashes)).slice().sort();
  return {
    projectionHighWaterMark: input.projectionHighWaterMark,
    projectionSourceRef: "agent.projection.memory",
    activeMemory: activeMemory.map((memory) => ({
      memoryId: memory.memoryId,
      scope: memory.scope,
      memoryKind: memory.memoryKind,
      summary: memory.summary,
      confidence: memory.confidence,
      sourceEventIds: memory.sourceEventIds,
      artifactHashes: memory.artifactHashes,
      ...(memory.expiresAt === undefined ? {} : { expiresAt: memory.expiresAt })
    })),
    aggregateCounts: { active: totalActiveMemoryCount, totalCount: totalActiveMemoryCount },
    sourceEventIds,
    artifactHashes,
    window: {
      order: "createdAt:asc",
      limit: effectiveWindowLimit,
      hasMore: totalActiveMemoryCount > activeMemory.length,
      totalCount: totalActiveMemoryCount,
      omissionCodes: []
    },
    lifecycleProvenanceRefs: unique(activeMemory.flatMap((memory) => memory.eventIds))
  };
}

function normalizeDirectMemorySnapshot(value: OperationalAgentMemorySnapshot): NormalizedMemorySnapshot {
  assertPlainOwnDataObject(value, "memory snapshot", [
    "projectionHighWaterMark", "projectionSourceRef", "activeMemory", "aggregateCounts", "sourceEventIds",
    "artifactHashes", "window", "emptyProof"
  ]);
  if (!Number.isInteger(value.projectionHighWaterMark) || value.projectionHighWaterMark < 0) {
    throw new Error("blocked.invalid-payload-shape: memory snapshot projectionHighWaterMark is invalid");
  }
  if (value.projectionSourceRef !== "agent.projection.memory") {
    throw new Error("blocked.projection-source-mismatch: memory snapshot does not match its projection source");
  }
  assertPlainOwnDataArray(value.activeMemory, "memory snapshot activeMemory");
  const activeMemory = value.activeMemory.map(toMemorySummaryItem);
  const aggregateCounts = normalizeMemoryAggregateCounts(value.aggregateCounts);
  const sourceEventIds = normalizeMemoryEventIds(value.sourceEventIds, "memory snapshot sourceEventIds");
  const artifactHashes = normalizeMemoryArtifactHashes(value.artifactHashes, "memory snapshot artifactHashes");
  const window = normalizeMemoryWindow(value.window);
  if (activeMemory.length > window.limit) {
    throw new Error("blocked.unbounded-source: active memory exceeds the bounded window limit");
  }
  if (window.totalCount < activeMemory.length || (window.hasMore && window.totalCount <= activeMemory.length)) {
    throw new Error("blocked.unbounded-source: memory window does not cover visible active memory");
  }
  if (aggregateCounts.active! < activeMemory.length || aggregateCounts.totalCount! < activeMemory.length) {
    throw new Error("blocked.projection-source-mismatch: memory aggregate counts do not cover visible active memory");
  }
  const derivedSourceEventIds = unique(activeMemory.flatMap((item) => item.sourceEventIds)).slice().sort();
  const derivedArtifactHashes = unique(activeMemory.flatMap((item) => item.artifactHashes)).slice().sort();
  if (!sameStringSet(sourceEventIds, derivedSourceEventIds) || !sameStringSet(artifactHashes, derivedArtifactHashes)) {
    throw new Error("blocked.projection-source-mismatch: memory snapshot provenance does not match included memory items");
  }
  const emptyProof = value.emptyProof === undefined ? undefined : normalizeMemoryEmptyProof(value.emptyProof);
  return {
    projectionHighWaterMark: value.projectionHighWaterMark,
    projectionSourceRef: "agent.projection.memory",
    activeMemory: activeMemory as unknown as OperationalAgentMemorySnapshot["activeMemory"],
    aggregateCounts,
    sourceEventIds: derivedSourceEventIds,
    artifactHashes: derivedArtifactHashes,
    window,
    ...(emptyProof === undefined ? {} : { emptyProof }),
    lifecycleProvenanceRefs: []
  };
}

function normalizeMemoryAggregateCounts(value: Readonly<Record<string, number>>): Readonly<Record<string, number>> {
  assertPlainOwnDataObject(value, "memory snapshot aggregateCounts");
  const normalized: Record<string, number> = {};
  for (const [key, count] of Object.entries(value)) {
    assertSafeIdentifier(key, "memory aggregate count key");
    if (!Number.isInteger(count) || count < 0) {
      throw new Error("blocked.invalid-payload-shape: memory aggregate count is invalid");
    }
    normalized[key] = count;
  }
  if (!Number.isInteger(normalized.active) || !Number.isInteger(normalized.totalCount)) {
    throw new Error("blocked.invalid-payload-shape: memory aggregate counts require active and totalCount");
  }
  return normalized;
}

function normalizeMemoryWindow(value: OperationalAgentMemorySnapshot["window"]): OperationalAgentMemorySnapshot["window"] {
  assertPlainOwnDataObject(value, "memory snapshot window", ["order", "limit", "cursor", "hasMore", "totalCount", "omissionCodes"]);
  if (typeof value.order !== "string" || !/^[A-Za-z][A-Za-z0-9._-]*:(?:asc|desc)$/.test(value.order)) {
    throw new Error("blocked.unbounded-source: memory window order is invalid");
  }
  if (!Number.isInteger(value.limit) || value.limit <= 0 || typeof value.hasMore !== "boolean" ||
    !Number.isInteger(value.totalCount) || value.totalCount < 0) {
    throw new Error("blocked.unbounded-source: memory window metadata is invalid");
  }
  if (value.cursor !== undefined) assertSafeIdentifier(value.cursor, "memory window cursor");
  assertPlainOwnDataArray(value.omissionCodes, "memory window omissionCodes");
  const omissionCodes = value.omissionCodes.map((code) => {
    if (typeof code !== "string" || !memoryOmissionCodes.has(code)) {
      throw new Error("blocked.invalid-payload-shape: memory window omission code is invalid");
    }
    return code;
  });
  return {
    order: value.order,
    limit: value.limit,
    ...(value.cursor === undefined ? {} : { cursor: value.cursor }),
    hasMore: value.hasMore,
    totalCount: value.totalCount,
    omissionCodes: [...new Set(omissionCodes)].sort() as OperationalAgentMemorySnapshot["window"]["omissionCodes"]
  };
}

function normalizeMemoryEmptyProof(value: OperationalEmptyProjectionProof): OperationalEmptyProjectionProof {
  assertPlainOwnDataObject(value, "memory empty proof", [
    "projectionName", "scope", "projectionHighWaterMark", "sourceEventCount", "generatedAt", "emptyReasonCode"
  ]);
  assertPlainOwnDataObject(value.scope, "memory empty proof scope", ["kind", "id"]);
  assertSafeIdentifier(value.scope.kind, "memory empty proof scope kind");
  assertSafeIdentifier(value.scope.id, "memory empty proof scope id");
  if (!Number.isInteger(value.projectionHighWaterMark) || value.projectionHighWaterMark < 0 ||
    !Number.isInteger(value.sourceEventCount) || value.sourceEventCount < 0) {
    throw new Error("blocked.projection-source-mismatch: memory empty proof counts are invalid");
  }
  assertUtcTimestamp(value.generatedAt, "memory empty proof generatedAt");
  assertSafeIdentifier(value.emptyReasonCode, "memory empty proof reason");
  if (typeof value.projectionName !== "string") {
    throw new Error("blocked.projection-source-mismatch: memory empty proof projection is invalid");
  }
  assertAgentSecretSafeText(value.projectionName, "memory empty proof projection");
  return {
    projectionName: value.projectionName,
    scope: { kind: value.scope.kind, id: value.scope.id },
    projectionHighWaterMark: value.projectionHighWaterMark,
    sourceEventCount: value.sourceEventCount,
    generatedAt: value.generatedAt,
    emptyReasonCode: value.emptyReasonCode
  };
}

function toMemorySummaryItem(value: unknown): AgentMemorySummaryItemDto {
  assertPlainOwnDataObject(value, "active memory item", [
    "memoryId", "scope", "memoryKind", "summary", "confidence", "sourceEventIds", "artifactHashes", "expiresAt"
  ]);
  const item = value;
  assertSafeIdentifier(item.memoryId, "active memory item memoryId");
  if (typeof item.scope !== "string" || !memoryScopes.has(item.scope as AgentMemoryScope)) {
    throw new Error("blocked.invalid-payload-shape: active memory item scope is invalid");
  }
  if (typeof item.memoryKind !== "string" || !memoryKinds.has(item.memoryKind as AgentMemoryKind)) {
    throw new Error("blocked.invalid-payload-shape: active memory item memoryKind is invalid");
  }
  if (typeof item.summary !== "string" || item.summary.length === 0) {
    throw new Error("blocked.invalid-payload-shape: active memory item summary is invalid");
  }
  assertAgentSecretSafeText(item.summary, "active memory item summary");
  if (typeof item.confidence !== "number" || !Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1) {
    throw new Error("blocked.invalid-payload-shape: active memory item confidence must be between zero and one");
  }
  const sourceEventIds = normalizeMemoryEventIds(item.sourceEventIds, "active memory item sourceEventIds");
  const artifactHashes = normalizeMemoryArtifactHashes(item.artifactHashes, "active memory item artifactHashes");
  if (item.expiresAt !== undefined) assertUtcTimestamp(item.expiresAt, "active memory item expiresAt");
  return {
    memoryId: item.memoryId,
    scope: item.scope as AgentMemoryScope,
    memoryKind: item.memoryKind as AgentMemoryKind,
    summary: item.summary,
    confidence: item.confidence,
    sourceEventIds,
    artifactHashes,
    ...(item.expiresAt === undefined ? {} : { expiresAt: item.expiresAt as string })
  };
}

function assertEmptyMemoryProof(
  proof: OperationalEmptyProjectionProof | undefined,
  input: BuildAgentMemorySummaryContextPackInput,
  snapshot: NormalizedMemorySnapshot
): OperationalEmptyProjectionProof {
  if (proof === undefined) {
    throw new Error("blocked.missing-empty-proof: empty memory projection requires proof");
  }
  const normalizedProof = normalizeMemoryEmptyProof(proof);
  if (normalizedProof.projectionName !== "agent.projection.memory" ||
    normalizedProof.scope.kind !== input.scope.kind || normalizedProof.scope.id !== input.scope.id ||
    normalizedProof.projectionHighWaterMark !== input.projectionHighWaterMark ||
    snapshot.aggregateCounts.active !== 0 || snapshot.aggregateCounts.totalCount !== 0 ||
    snapshot.window.totalCount !== 0 || snapshot.window.hasMore ||
    snapshot.sourceEventIds.length !== 0 || snapshot.artifactHashes.length !== 0 || normalizedProof.sourceEventCount !== 0 ||
    normalizedProof.sourceEventCount !== snapshot.sourceEventIds.length || normalizedProof.generatedAt !== input.generatedAt) {
    throw new Error("blocked.projection-source-mismatch: empty memory proof does not match the memory projection");
  }
  return normalizedProof;
}

function emptyProjectionProvenanceRef(proof: OperationalEmptyProjectionProof): string {
  return `empty-projection:${proof.projectionName}:${proof.scope.kind}:${proof.scope.id}:hwm:${proof.projectionHighWaterMark}`;
}

function memoryTruthBoundary(): AgentMemoryTruthBoundaryDto {
  return deepFreeze({
    authoritativeForOntology: false,
    label: "working-memory-not-ontology-truth",
    graphEffectRequires: "evidence-backed-proposed-assertion-or-reviewed-reasoning"
  });
}

function compareMemory(left: ProjectedAgentMemory, right: ProjectedAgentMemory): number {
  const byCreatedAt = left.createdAt.localeCompare(right.createdAt);
  return byCreatedAt === 0 ? left.memoryId.localeCompare(right.memoryId) : byCreatedAt;
}

function selectTopMemory(
  memories: readonly ProjectedAgentMemory[],
  limit: number
): readonly ProjectedAgentMemory[] {
  const selected: ProjectedAgentMemory[] = [];
  for (const memory of memories) {
    let low = 0;
    let high = selected.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (compareMemory(memory, selected[middle]!) < 0) high = middle;
      else low = middle + 1;
    }
    if (low < limit) {
      selected.splice(low, 0, memory);
      if (selected.length > limit) selected.pop();
    }
  }
  return selected;
}

function historyFor(memory: ProjectedAgentMemory): readonly AgentMemoryHistoryEntryDto[] {
  return deepFreeze(memory.memoryHistoryEntries.map((entry) => ({
    eventId: entry.eventId,
    eventType: entry.eventType,
    occurredAt: entry.occurredAt
  })));
}

function unique(values: readonly string[]): readonly string[] {
  return deepFreeze([...new Set(values)]);
}

function normalizeMemoryEventIds(value: unknown, label: string): readonly string[] {
  assertPlainOwnDataArray(value, label);
  const normalized = value.map((eventId) => {
    if (typeof eventId !== "string" || !/^evt_[A-Za-z0-9_-]+$/.test(eventId)) {
      throw new Error(`blocked.invalid-payload-shape: ${label} contains an invalid event ID`);
    }
    assertAgentSecretSafeText(eventId, label);
    return eventId;
  });
  return [...new Set(normalized)].sort();
}

function normalizeMemoryArtifactHashes(value: unknown, label: string): readonly string[] {
  assertPlainOwnDataArray(value, label);
  const normalized = value.map((hash) => {
    if (typeof hash !== "string" || !/^sha256:[a-f0-9]{64}$/.test(hash)) {
      throw new Error(`blocked.invalid-payload-shape: ${label} contains an invalid artifact hash`);
    }
    return hash;
  });
  return [...new Set(normalized)].sort();
}

function assertPlainOwnDataObject(
  value: unknown,
  label: string,
  allowedKeys?: readonly string[]
): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`blocked.invalid-payload-shape: ${label} must be a plain object`);
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new Error(`blocked.invalid-payload-shape: ${label} must not contain symbols`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const allowed = allowedKeys === undefined ? undefined : new Set(allowedKeys);
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (allowed !== undefined && !allowed.has(key)) {
      throw new Error(`blocked.invalid-payload-shape: ${label} contains an unexpected field`);
    }
    if (!descriptor.enumerable || !("value" in descriptor)) {
      throw new Error(`blocked.invalid-payload-shape: ${label} must not contain accessors`);
    }
  }
}

function assertPlainOwnDataArray(value: unknown, label: string): asserts value is unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length > 0) {
    throw new Error(`blocked.invalid-payload-shape: ${label} must be a plain array`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const indexes = Object.keys(descriptors).filter((key) => key !== "length");
  if (indexes.length !== value.length) {
    throw new Error(`blocked.invalid-payload-shape: ${label} must be dense`);
  }
  for (const key of indexes) {
    const descriptor = descriptors[key];
    if (!/^(0|[1-9][0-9]*)$/.test(key) || descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      throw new Error(`blocked.invalid-payload-shape: ${label} must contain only own data items`);
    }
  }
}

function assertSafeIdentifier(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)) {
    throw new Error(`blocked.invalid-payload-shape: ${label} must be a safe identifier`);
  }
  assertAgentSecretSafeText(value, label);
}

function assertUtcTimestamp(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value)) || !value.endsWith("Z")) {
    throw new Error(`blocked.invalid-payload-shape: ${label} must be a UTC timestamp`);
  }
  assertAgentSecretSafeText(value, label);
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  const normalizedLeft = [...new Set(left)].sort();
  const normalizedRight = [...new Set(right)].sort();
  return normalizedLeft.length === normalizedRight.length && normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

function deepFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
    return Object.freeze(value);
  }

  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const nested of Object.values(record)) {
      deepFreeze(nested);
    }
    return Object.freeze(value);
  }

  return value;
}
