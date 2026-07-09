import type { AgentMemoryDetailDto, AgentMemoryListDto } from "../../src/agent/agent-types.js";

export function agentMemoryList(
  overrides: Partial<AgentMemoryListDto> & {
    readonly items?: AgentMemoryListDto["items"];
    readonly filters?: AgentMemoryListDto["filters"];
  } = {}
): AgentMemoryListDto {
  return {
    schemaVersion: "agent-memory-list.v1",
    generatedAt: "2026-07-09T15:00:00.000Z",
    filters: {
      scope: "all",
      state: "all"
    },
    truthBoundary: {
      authoritativeForOntology: false,
      label: "working-memory-not-ontology-truth",
      graphEffectRequires: "evidence-backed-proposed-assertion-or-reviewed-reasoning"
    },
    items: [
      {
        memoryId: "mem_workspace_preference",
        residentAgentId: "agent_default",
        scope: "workspace",
        memoryKind: "operator-preference",
        summary: "Use concise source-linked memory summaries.",
        recordedBy: "actor_case_owner",
        recordedByKind: "human",
        sourceEventIds: ["evt_memory_recorded"],
        artifactHashes: ["sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
        confidence: 0.9,
        createdAt: "2026-07-09T14:55:00.000Z",
        expiresAt: "2026-07-10T14:55:00.000Z",
        state: "active",
        memoryHistoryEntries: [
          {
            eventId: "evt_memory_recorded",
            eventType: "agent.memory.recorded",
            occurredAt: "2026-07-09T14:55:00.000Z"
          }
        ],
        eventIds: ["evt_memory_recorded"],
        causationIds: []
      },
      {
        memoryId: "mem_provider_note",
        residentAgentId: "agent_default",
        scope: "provider",
        memoryKind: "provider-note",
        summary: "Provider previews stay display-only until human review.",
        recordedBy: "actor_cestus_agent",
        recordedByKind: "agent",
        sourceEventIds: ["evt_provider_preview"],
        artifactHashes: [],
        confidence: 0.6,
        createdAt: "2026-07-09T13:55:00.000Z",
        state: "superseded",
        memoryHistoryEntries: [
          {
            eventId: "evt_provider_memory_recorded",
            eventType: "agent.memory.recorded",
            occurredAt: "2026-07-09T13:55:00.000Z"
          },
          {
            eventId: "evt_provider_memory_superseded",
            eventType: "agent.memory.superseded",
            occurredAt: "2026-07-09T14:25:00.000Z"
          }
        ],
        supersededByMemoryId: "mem_provider_note_v2",
        supersededBy: "actor_case_owner",
        supersededAt: "2026-07-09T14:25:00.000Z",
        supersessionRationale: "Human clarified the current provider posture.",
        eventIds: ["evt_provider_memory_recorded", "evt_provider_memory_superseded"],
        causationIds: []
      }
    ],
    ...overrides
  };
}

export function agentMemoryDetail(
  overrides: Partial<AgentMemoryDetailDto> & {
    readonly memory?: AgentMemoryDetailDto["memory"];
    readonly history?: AgentMemoryDetailDto["history"];
  } = {}
): AgentMemoryDetailDto {
  const baseMemory = agentMemoryList().items[0]!;
  return {
    schemaVersion: "agent-memory-detail.v1",
    generatedAt: "2026-07-09T15:00:00.000Z",
    truthBoundary: {
      authoritativeForOntology: false,
      label: "working-memory-not-ontology-truth",
      graphEffectRequires: "evidence-backed-proposed-assertion-or-reviewed-reasoning"
    },
    memory: baseMemory,
    history: [
      {
        eventId: "evt_memory_recorded",
        eventType: "agent.memory.recorded",
        occurredAt: "2026-07-09T14:55:00.000Z"
      }
    ],
    ...overrides
  };
}
