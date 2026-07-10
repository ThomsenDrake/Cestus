import { buildContextPackRef, type ContextPackRef, type ContextPackScope } from "./context-packs.js";
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
  readonly projection: AgentProjection;
  readonly generatedAt: string;
  readonly policyVersion?: string;
  readonly scope?: ContextPackScope;
  readonly sizeBudgetBytes?: number;
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
  const active = [...input.projection.activeMemory].sort(compareMemory).slice(0, input.maxItems ?? 25);
  const activeWithRealProvenance = active.filter(
    (memory) => memory.sourceEventIds.length > 0 || memory.artifactHashes.length > 0
  );
  const payload = {
    truthBoundary: memoryTruthBoundary(),
    items: activeWithRealProvenance.map<AgentMemorySummaryItemDto>((memory) => ({
      memoryId: memory.memoryId,
      scope: memory.scope,
      memoryKind: memory.memoryKind,
      summary: memory.summary,
      confidence: memory.confidence,
      sourceEventIds: memory.sourceEventIds,
      artifactHashes: memory.artifactHashes,
      ...(memory.expiresAt === undefined ? {} : { expiresAt: memory.expiresAt })
    }))
  };
  const sourceEventIds = unique(activeWithRealProvenance.flatMap((memory) => memory.sourceEventIds));
  const artifactHashes = unique(activeWithRealProvenance.flatMap((memory) => memory.artifactHashes));
  const provenanceRefs = unique(
    activeWithRealProvenance.length === 0
      ? ["agent.projection.memory.empty"]
      : activeWithRealProvenance.flatMap((memory) => [...memory.eventIds, ...memory.sourceEventIds, ...memory.artifactHashes])
  );

  return buildContextPackRef({
    contextPackId: "agent-memory-summary.v1",
    version: 1,
    generatedAt: input.generatedAt,
    payload,
    safeSummary: `${activeWithRealProvenance.length} active working memory item${activeWithRealProvenance.length === 1 ? "" : "s"}; not ontology truth.`,
    provenanceRefs,
    sourceEventIds,
    artifactHashes,
    ...(input.policyVersion === undefined ? {} : { policyVersion: input.policyVersion }),
    ...(input.scope === undefined ? {} : { scope: input.scope }),
    ...(input.sizeBudgetBytes === undefined ? {} : { sizeBudgetBytes: input.sizeBudgetBytes }),
    stalenessInputs: [{
      kind: "projection-high-water-mark",
      ref: "agent.projection.memory",
      value: String(sourceEventIds.length)
    }]
  });
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
