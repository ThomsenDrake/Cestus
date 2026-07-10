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
    .map(toMemorySummaryItem)
    .filter((memory) => memory.sourceEventIds.length > 0 || memory.artifactHashes.length > 0)
    .sort((left, right) => left.memoryId.localeCompare(right.memoryId));
  const isEmpty = items.length === 0;
  const emptyProof = input.emptyMemoryProof ?? snapshot.emptyProof;
  const provenanceRefs = isEmpty
    ? [emptyProjectionProvenanceRef(assertEmptyMemoryProof(emptyProof, input, snapshot))]
    : unique([
      ...projectionLifecycleProvenanceRefs(input.projection),
      ...snapshot.sourceEventIds,
      ...snapshot.artifactHashes
    ]);
  const payload = {
    schemaVersion: "agent-memory-summary.v1",
    memory: {
      truthBoundary: memoryTruthBoundary(),
      projectionHighWaterMark: snapshot.projectionHighWaterMark,
      projectionSourceRef: snapshot.projectionSourceRef,
      activeMemory: items,
      aggregateCounts: snapshot.aggregateCounts,
      sourceEventIds: snapshot.sourceEventIds,
      artifactHashes: snapshot.artifactHashes,
      window: snapshot.window
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

function normalizeMemorySnapshot(input: BuildAgentMemorySummaryContextPackInput): OperationalAgentMemorySnapshot {
  if (input.memorySnapshot !== undefined) {
    return input.memorySnapshot;
  }
  if (input.projection === undefined) {
    throw new Error("blocked.unbounded-source: memorySnapshot is required when no projection compatibility input is provided");
  }

  const activeMemory = [...input.projection.activeMemory]
    .sort(compareMemory)
    .slice(0, input.maxItems ?? 25);
  const sourceEventIds = unique(activeMemory.flatMap((memory) => memory.sourceEventIds));
  const artifactHashes = unique(activeMemory.flatMap((memory) => memory.artifactHashes));
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
    aggregateCounts: { active: activeMemory.length, totalCount: input.projection.activeMemory.length },
    sourceEventIds,
    artifactHashes,
    window: {
      order: "createdAt:asc",
      limit: input.maxItems ?? 25,
      hasMore: input.projection.activeMemory.length > activeMemory.length,
      totalCount: input.projection.activeMemory.length,
      omissionCodes: []
    }
  };
}

function toMemorySummaryItem(value: unknown): AgentMemorySummaryItemDto {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("blocked.invalid-payload-shape: active memory item must be an object");
  }
  const item = value as Record<string, unknown>;
  if (typeof item.memoryId !== "string" || typeof item.scope !== "string" || typeof item.memoryKind !== "string" ||
    typeof item.summary !== "string" || typeof item.confidence !== "number" ||
    !Array.isArray(item.sourceEventIds) || !Array.isArray(item.artifactHashes)) {
    throw new Error("blocked.invalid-payload-shape: active memory item is incomplete");
  }
  return {
    memoryId: item.memoryId,
    scope: item.scope as AgentMemoryScope,
    memoryKind: item.memoryKind as AgentMemoryKind,
    summary: item.summary,
    confidence: item.confidence,
    sourceEventIds: item.sourceEventIds as readonly string[],
    artifactHashes: item.artifactHashes as readonly string[],
    ...(typeof item.expiresAt === "string" ? { expiresAt: item.expiresAt } : {})
  };
}

function assertEmptyMemoryProof(
  proof: OperationalEmptyProjectionProof | undefined,
  input: BuildAgentMemorySummaryContextPackInput,
  snapshot: OperationalAgentMemorySnapshot
): OperationalEmptyProjectionProof {
  if (proof === undefined) {
    throw new Error("blocked.missing-empty-proof: empty memory projection requires proof");
  }
  if (proof.projectionName !== "agent.projection.memory" ||
    proof.scope.kind !== input.scope.kind || proof.scope.id !== input.scope.id ||
    proof.projectionHighWaterMark !== input.projectionHighWaterMark ||
    proof.sourceEventCount !== snapshot.sourceEventIds.length || proof.generatedAt !== input.generatedAt) {
    throw new Error("blocked.projection-source-mismatch: empty memory proof does not match the memory projection");
  }
  return proof;
}

function emptyProjectionProvenanceRef(proof: OperationalEmptyProjectionProof): string {
  return `empty-projection:${proof.projectionName}:${proof.scope.kind}:${proof.scope.id}:hwm:${proof.projectionHighWaterMark}`;
}

function projectionLifecycleProvenanceRefs(projection: AgentProjection | undefined): readonly string[] {
  if (projection === undefined) {
    return [];
  }
  return projection.activeMemory.flatMap((memory) => memory.eventIds);
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
