import { describe, expect, it } from "vitest";
import {
  assertOperationalContextPackProviderMetadata,
  buildOperationalAgentMemorySummaryContextPack,
  buildTaskRunHistoryContextPack,
  buildWorkspaceRuntimeStatusContextPack,
  buildOperationalContextPackReadinessInputs,
  operationalContextPackDescriptors,
  operationalContextPackPayloadParsers,
  operationalContextPackProviderRegistrationKey,
  registerOperationalContextPackBuilders,
  type OperationalAgentMemorySnapshot,
  type OperationalContextPackBuilderResult,
  type OperationalContextPackProvider,
  type OperationalTaskRunHistorySnapshot,
  type OperationalWorkspaceRuntimeSource
} from "../src/operational-context-packs.js";
import { buildResolvedContextPack, createContextPackRegistry, serializeContextPackPayload, type BuildContextPackRefInput, type ResolvedContextPack } from "../src/context-packs.js";

describe("operational context pack contracts", () => {
  const providerMetadata = {
    providerId: "local_workspace_provider",
    capabilities: ["agent-memory-summary", "workspace-runtime-status", "task-run-history"],
    policyVersion: "operational-policy.v1",
    generatedAt: "2026-07-10T12:00:00.000Z",
    scope: { kind: "workspace", id: "ws_case_001" },
    sizeBudgets: {
      workspaceRuntimeStatus: 16_384,
      taskRunHistory: 32_768,
      agentMemorySummary: 16_384
    }
  } as const;

  it("exposes exactly the three package-owned version-one descriptors with projection provenance", () => {
    expect(operationalContextPackDescriptors.map((descriptor) => [descriptor.contextPackId, descriptor.version])).toEqual([
      ["workspace-runtime-status.v1", 1],
      ["task-run-history.v1", 1],
      ["agent-memory-summary.v1", 1]
    ]);
    for (const descriptor of operationalContextPackDescriptors) {
      expect(descriptor.requiredProvenanceKinds).toEqual(["operational-source-proof"]);
    }
  });

  it("derives a deterministic, secret-safe registration key independent of capability order", () => {
    const reversed = { ...providerMetadata, capabilities: [...providerMetadata.capabilities].reverse() };
    const expected = "operational-context-packs:local_workspace_provider:operational-policy.v1:workspace:ws_case_001:agent-memory-summary,task-run-history,workspace-runtime-status";

    expect(operationalContextPackProviderRegistrationKey(providerMetadata)).toBe(expected);
    expect(operationalContextPackProviderRegistrationKey(reversed)).toBe(expected);
  });

  it("rejects unsafe provider metadata, unsafe extras, empty capabilities, and unknown capabilities without invoking getters", () => {
    expect(() => assertOperationalContextPackProviderMetadata({ ...providerMetadata, scope: { kind: "workspace", id: "/home/drake/private/workspace" } })).toThrow(/safe|scope/i);
    expect(() => assertOperationalContextPackProviderMetadata({ ...providerMetadata, providerId: "provider failed with raw provider error" })).toThrow(/safe/i);
    expect(() => assertOperationalContextPackProviderMetadata({ ...providerMetadata, policyVersion: "Bearer secret-value" })).toThrow(/safe/i);
    expect(() => assertOperationalContextPackProviderMetadata({ ...providerMetadata, rawProviderError: "Bearer secret-value" } as never)).toThrow(/unexpected|secret|safe/i);
    expect(() =>
      assertOperationalContextPackProviderMetadata({
        ...providerMetadata,
        scope: { kind: "workspace", id: "ws_case_001", rawPath: "/home/drake/private/workspace" }
      } as never)
    ).toThrow(/unexpected|secret|safe|scope/i);
    expect(() =>
      assertOperationalContextPackProviderMetadata({
        ...providerMetadata,
        sizeBudgets: {
          ...providerMetadata.sizeBudgets,
          credentialHint: "api key sk-live-value"
        }
      } as never)
    ).toThrow(/unexpected|secret|safe|sizeBudgets/i);
    expect(() => assertOperationalContextPackProviderMetadata({ ...providerMetadata, capabilities: [] })).toThrow(/capabilit/i);
    expect(() => assertOperationalContextPackProviderMetadata({ ...providerMetadata, capabilities: ["unknown-capability"] as never })).toThrow(/capabilit/i);

    let getterInvoked = false;
    const metadataWithAccessor = { ...providerMetadata } as Record<string, unknown>;
    Object.defineProperty(metadataWithAccessor, "rawProviderError", {
      enumerable: true,
      get() {
        getterInvoked = true;
        return "Bearer secret-value";
      }
    });

    expect(() => assertOperationalContextPackProviderMetadata(metadataWithAccessor as never)).toThrow(/accessor|unexpected|safe/i);
    expect(getterInvoked).toBe(false);
  });

  it("uses bounded operational provider methods rather than a full projection method", async () => {
    const provider: OperationalContextPackProvider = {
      ...providerMetadata,
      async workspaceRuntimeStatus(): Promise<OperationalWorkspaceRuntimeSource> {
        return {} as OperationalWorkspaceRuntimeSource;
      },
      async taskRunHistorySnapshot(): Promise<OperationalTaskRunHistorySnapshot> {
        return {} as OperationalTaskRunHistorySnapshot;
      },
      async agentMemorySnapshot(): Promise<OperationalAgentMemorySnapshot> {
        return {} as OperationalAgentMemorySnapshot;
      }
    };

    await expect(provider.workspaceRuntimeStatus()).resolves.toBeDefined();
    await expect(provider.taskRunHistorySnapshot()).resolves.toBeDefined();
    await expect(provider.agentMemorySnapshot()).resolves.toBeDefined();
  });

  it("keeps operational builder results normalizable to resolved envelopes", () => {
    const raw: BuildContextPackRefInput = {
      contextPackId: "workspace-runtime-status.v1",
      version: 1,
      generatedAt: providerMetadata.generatedAt,
      payload: { schemaVersion: "workspace-runtime-status.v1", runtime: {} },
      safeSummary: "Workspace runtime status is available.",
      provenanceRefs: ["evt_runtime_status_001"]
    };
    const rawResult: OperationalContextPackBuilderResult = raw;
    const resolvedResult: OperationalContextPackBuilderResult = {} as ResolvedContextPack;

    expect(rawResult.contextPackId).toBe("workspace-runtime-status.v1");
    expect(resolvedResult).toBeDefined();
  });

  it("provides exact non-serialized parsers for all package-owned pack identities", () => {
    const validWindow = {
      order: "updated-desc",
      limit: 25,
      hasMore: false,
      totalCount: 1,
      omissionCodes: []
    };
    const validWorkspacePayload = {
      schemaVersion: "workspace-runtime-status.v1",
      runtime: {
        runtimeHighWaterMark: 7,
        workspaceMounted: true,
        workspaceId: "ws_case_001",
        storageStrategy: "repo-local",
        bindPosture: "loopback",
        authPosture: "local-disabled",
        providerStates: [],
        diagnostics: [],
        projectionHighWaterMarks: { agent: 42 },
        omissionCodes: []
      }
    };
    const validHistoryPayload = {
      schemaVersion: "task-run-history.v1",
      history: {
        projectionHighWaterMark: 42,
        projectionSourceRef: "agent.projection.task-run-history",
        tasks: [{ taskId: "task_created", status: "queued", sourceEventIds: ["evt_agent_task_created"] }],
        runs: [],
        modelInvocations: [],
        toolRequests: [],
        aggregateCounts: { tasks: 1 },
        sourceEventIds: ["evt_agent_task_created"],
        artifactHashes: [],
        window: validWindow
      }
    };
    const validMemoryPayload = {
      schemaVersion: "agent-memory-summary.v1",
      memory: {
        truthBoundary: { authoritativeForOntology: false },
        projectionHighWaterMark: 42,
        projectionSourceRef: "agent.projection.memory",
        activeMemory: [{
          memoryId: "mem_created",
          scope: "workspace",
          memoryKind: "agent-observation",
          summary: "Current bounded memory.",
          confidence: 0.8,
          sourceEventIds: ["evt_agent_memory_created"],
          artifactHashes: []
        }],
        aggregateCounts: { active: 1, totalCount: 1 },
        sourceEventIds: ["evt_agent_memory_created"],
        artifactHashes: [],
        window: validWindow
      }
    };

    expect(Object.keys(operationalContextPackPayloadParsers).sort()).toEqual([
      "agent-memory-summary.v1@1",
      "task-run-history.v1@1",
      "workspace-runtime-status.v1@1"
    ]);
    expect(JSON.stringify(operationalContextPackDescriptors)).not.toContain("parsePayload");

    expect(operationalContextPackPayloadParsers["workspace-runtime-status.v1@1"](validWorkspacePayload)).toEqual(validWorkspacePayload);
    expect(() => operationalContextPackPayloadParsers["workspace-runtime-status.v1@1"]({ schemaVersion: "task-run-history.v1", history: {} })).toThrow(/workspace-runtime-status/i);
    expect(() => operationalContextPackPayloadParsers["workspace-runtime-status.v1@1"]({ schemaVersion: "workspace-runtime-status.v1", runtime: null })).toThrow(/workspace-runtime-status/i);
    expect(() => operationalContextPackPayloadParsers["workspace-runtime-status.v1@1"]({ schemaVersion: "workspace-runtime-status.v1", runtime: { workspaceMounted: true } })).toThrow(/workspace-runtime-status/i);

    expect(operationalContextPackPayloadParsers["task-run-history.v1@1"](validHistoryPayload)).toEqual(validHistoryPayload);
    expect(() => operationalContextPackPayloadParsers["task-run-history.v1@1"]({
      ...validHistoryPayload,
      history: {
        ...validHistoryPayload.history,
        emptyProof: {
          projectionName: "agent.projection.task-run-history",
          scope: providerMetadata.scope,
          projectionHighWaterMark: 42,
          sourceEventCount: 0,
          generatedAt: providerMetadata.generatedAt,
          emptyReasonCode: "empty.task-run-history"
        }
      }
    })).toThrow(/task-run-history/i);
    expect(() => operationalContextPackPayloadParsers["task-run-history.v1@1"]({ schemaVersion: "agent-memory-summary.v1", memory: {} })).toThrow(/task-run-history/i);
    expect(() => operationalContextPackPayloadParsers["task-run-history.v1@1"]({ schemaVersion: "task-run-history.v1", history: null })).toThrow(/task-run-history/i);
    expect(() => operationalContextPackPayloadParsers["task-run-history.v1@1"]({ schemaVersion: "task-run-history.v1", history: { tasks: [] } })).toThrow(/task-run-history/i);

    expect(operationalContextPackPayloadParsers["agent-memory-summary.v1@1"](validMemoryPayload)).toEqual(validMemoryPayload);
    expect(() => operationalContextPackPayloadParsers["agent-memory-summary.v1@1"]({
      ...validMemoryPayload,
      memory: {
        ...validMemoryPayload.memory,
        emptyProof: {
          projectionName: "agent.projection.memory",
          scope: providerMetadata.scope,
          projectionHighWaterMark: 42,
          sourceEventCount: 0,
          generatedAt: providerMetadata.generatedAt,
          emptyReasonCode: "empty.active-memory"
        }
      }
    })).toThrow(/agent-memory-summary/i);
    expect(() => operationalContextPackPayloadParsers["agent-memory-summary.v1@1"]({
      schemaVersion: "agent-memory-summary.v1",
      memory: { ...validMemoryPayload.memory, truthBoundary: { authoritativeForOntology: true } }
    })).toThrow(/agent-memory-summary/i);
    expect(() => operationalContextPackPayloadParsers["agent-memory-summary.v1@1"]({ schemaVersion: "workspace-runtime-status.v1", runtime: {} })).toThrow(/agent-memory-summary/i);
    expect(() => operationalContextPackPayloadParsers["agent-memory-summary.v1@1"]({ schemaVersion: "agent-memory-summary.v1", memory: null })).toThrow(/agent-memory-summary/i);
    expect(() => operationalContextPackPayloadParsers["agent-memory-summary.v1@1"]({ schemaVersion: "agent-memory-summary.v1", memory: { activeMemory: [] } })).toThrow(/agent-memory-summary/i);
  });

  it("rejects nested operational payload fields and malformed nested refs in the exact parsers", () => {
    const validWindow = { order: "updated-desc", limit: 25, hasMore: false, totalCount: 1, omissionCodes: [] };
    const validWorkspacePayload = {
      schemaVersion: "workspace-runtime-status.v1",
      runtime: {
        runtimeHighWaterMark: 42,
        workspaceMounted: true,
        workspaceId: "ws_case_001",
        storageStrategy: "repo-local",
        bindPosture: "loopback",
        authPosture: "local-disabled",
        providerStates: [{ providerId: "provider_local", state: "ready", category: "provider-ready" }],
        diagnostics: [{ diagnosticId: "diag_runtime_001", category: "runtime-ready" }],
        projectionHighWaterMarks: { agent: 42 },
        omissionCodes: []
      }
    };
    const validHistoryPayload = {
      schemaVersion: "task-run-history.v1",
      history: {
        projectionHighWaterMark: 42,
        projectionSourceRef: "agent.projection.task-run-history",
        tasks: [{ taskId: "task_one", status: "completed", sourceEventIds: ["evt_agent_task_one"] }],
        runs: [{ runId: "run_one", state: "running", outputArtifactHashes: [hash("c")] }],
        modelInvocations: [{ invocationId: "model_one", status: "failed", sourceEventIds: ["evt_agent_model_one"] }],
        toolRequests: [{ toolRequestId: "tool_one", state: "approved", artifactHashes: [hash("d")] }],
        aggregateCounts: { total: 4 },
        sourceEventIds: ["evt_agent_task_one", "evt_agent_model_one"],
        artifactHashes: [hash("c"), hash("d")],
        window: validWindow
      }
    };
    const validMemoryPayload = {
      schemaVersion: "agent-memory-summary.v1",
      memory: {
        truthBoundary: { authoritativeForOntology: false },
        projectionHighWaterMark: 42,
        projectionSourceRef: "agent.projection.memory",
        activeMemory: [{
          memoryId: "mem_current",
          scope: "workspace",
          memoryKind: "agent-observation",
          summary: "Current bounded memory.",
          confidence: 0.8,
          sourceEventIds: ["evt_agent_memory_recorded"],
          artifactHashes: [hash("e")]
        }],
        aggregateCounts: { active: 1, totalCount: 1 },
        sourceEventIds: ["evt_agent_memory_recorded"],
        artifactHashes: [hash("e")],
        window: validWindow
      }
    };

    const parserRejectCases = [
      ["workspace-runtime-status.v1@1", { ...validWorkspacePayload, runtime: { ...validWorkspacePayload.runtime, providerStates: [{ providerId: "provider_local", state: "ready", providerBody: "opaque-json" }] } }],
      ["workspace-runtime-status.v1@1", { ...validWorkspacePayload, runtime: { ...validWorkspacePayload.runtime, providerStates: [{ providerId: "provider_local", state: "ready", rawProviderMaterial: "opaque-json" }] } }],
      ["workspace-runtime-status.v1@1", { ...validWorkspacePayload, runtime: { ...validWorkspacePayload.runtime, providerStates: [{ providerId: "provider_local", state: "maybe-ready" }] } }],
      ["workspace-runtime-status.v1@1", { ...validWorkspacePayload, runtime: { ...validWorkspacePayload.runtime, diagnostics: [{ diagnosticId: "diag_runtime_001", category: "runtime-ready", rawProviderError: "opaque-json" }] } }],
      ["workspace-runtime-status.v1@1", { ...validWorkspacePayload, runtime: { ...validWorkspacePayload.runtime, providerStates: [{ providerId: "provider_local", state: "ready", category: "human readable provider status" }] } }],
      ["task-run-history.v1@1", { ...validHistoryPayload, history: { ...validHistoryPayload.history, tasks: [{ taskId: "task_one", state: "completed", promptText: "opaque" }] } }],
      ["task-run-history.v1@1", { ...validHistoryPayload, history: { ...validHistoryPayload.history, modelInvocations: [{ invocationId: "model_one", state: "failed", modelOutput: "opaque" }] } }],
      ["task-run-history.v1@1", { ...validHistoryPayload, history: { ...validHistoryPayload.history, toolRequests: [{ requestId: "tool_one", state: "failed", output: "opaque" }] } }],
      ["task-run-history.v1@1", { ...validHistoryPayload, history: { ...validHistoryPayload.history, runs: [{ runId: "run_one", state: "unknown", sourceEventIds: ["evt_agent_run_one"] }] } }],
      ["task-run-history.v1@1", { ...validHistoryPayload, history: { ...validHistoryPayload.history, tasks: [{ taskId: "task_one", state: "completed", sourceEventIds: ["not_an_event"] }] } }],
      ["task-run-history.v1@1", { ...validHistoryPayload, history: { ...validHistoryPayload.history, toolRequests: [{ requestId: "tool_one", state: "approved", artifactHashes: ["sha256:not-a-real-hash"] }] } }],
      ["agent-memory-summary.v1@1", { ...validMemoryPayload, memory: { ...validMemoryPayload.memory, activeMemory: [{ ...validMemoryPayload.memory.activeMemory[0], arbitraryField: "opaque" }] } }],
      ["agent-memory-summary.v1@1", { ...validMemoryPayload, memory: { ...validMemoryPayload.memory, activeMemory: [{ ...validMemoryPayload.memory.activeMemory[0], raw: "opaque" }] } }],
      ["agent-memory-summary.v1@1", { ...validMemoryPayload, memory: { ...validMemoryPayload.memory, activeMemory: [{ ...validMemoryPayload.memory.activeMemory[0], sourceEventIds: ["not_an_event"] }] } }],
      ["agent-memory-summary.v1@1", { ...validMemoryPayload, memory: { ...validMemoryPayload.memory, activeMemory: [{ ...validMemoryPayload.memory.activeMemory[0], artifactHashes: ["sha256:not-a-real-hash"] }] } }]
    ] as const;

    for (const [parserKey, payload] of parserRejectCases) {
      expect(() => operationalContextPackPayloadParsers[parserKey](payload)).toThrow(/payload|shape|status|source/i);
    }
  });

  it("rejects matching-hash nested invalid payloads after resolver readback", async () => {
    const invalidPayloads = [
      {
        contextPackId: "workspace-runtime-status.v1" as const,
        descriptorIndex: 0,
        payload: {
          schemaVersion: "workspace-runtime-status.v1",
          runtime: {
            runtimeHighWaterMark: 42,
            workspaceMounted: true,
            workspaceId: "ws_case_001",
            storageStrategy: "repo-local",
            bindPosture: "loopback",
            authPosture: "local-disabled",
            providerStates: [{ providerId: "provider_local", state: "ready", providerBody: "opaque-json" }],
            diagnostics: [{ diagnosticId: "diag_runtime_001", category: "runtime-ready", rawProviderError: "opaque-json" }],
            projectionHighWaterMarks: { agent: 42 },
            omissionCodes: []
          }
        }
      },
      {
        contextPackId: "task-run-history.v1" as const,
        descriptorIndex: 1,
        payload: {
          schemaVersion: "task-run-history.v1",
          history: {
            projectionHighWaterMark: 42,
            projectionSourceRef: "agent.projection.task-run-history",
            tasks: [{ taskId: "task_one", state: "completed", promptText: "opaque", sourceEventIds: ["evt_agent_task_one"] }],
            runs: [],
            modelInvocations: [{ invocationId: "model_one", state: "failed", modelOutput: "opaque" }],
            toolRequests: [{ requestId: "tool_one", state: "failed", output: "opaque" }],
            aggregateCounts: { total: 3 },
            sourceEventIds: ["evt_agent_task_one"],
            artifactHashes: [],
            window: { order: "updated-desc", limit: 25, hasMore: false, totalCount: 3, omissionCodes: [] }
          }
        }
      },
      {
        contextPackId: "agent-memory-summary.v1" as const,
        descriptorIndex: 2,
        payload: {
          schemaVersion: "agent-memory-summary.v1",
          memory: {
            truthBoundary: { authoritativeForOntology: false },
            projectionHighWaterMark: 42,
            projectionSourceRef: "agent.projection.memory",
            activeMemory: [{
              memoryId: "mem_current",
              scope: "workspace",
              memoryKind: "agent-observation",
              summary: "Current bounded memory.",
              confidence: 0.8,
              sourceEventIds: ["evt_agent_memory_recorded"],
              artifactHashes: [],
              raw: "opaque"
            }],
            aggregateCounts: { active: 1, totalCount: 1 },
            sourceEventIds: ["evt_agent_memory_recorded"],
            artifactHashes: [],
            window: { order: "createdAt:asc", limit: 25, hasMore: false, totalCount: 1, omissionCodes: [] }
          }
        }
      }
    ];

    for (const { contextPackId, descriptorIndex, payload } of invalidPayloads) {
      const resolved = buildResolvedContextPack({
        contextPackId,
        version: 1,
        generatedAt: providerMetadata.generatedAt,
        payload,
        safeSummary: "Resolved operational payload fixture.",
        provenanceRefs: [`operational-source-proof:${contextPackId}:event`],
        projectionHighWaterMark: 42,
        policyVersion: providerMetadata.policyVersion,
        scope: providerMetadata.scope,
        sizeBudgetBytes: 32_768,
        stalenessInputs: [{ kind: "projection-high-water-mark", ref: contextPackId, value: "42" }]
      });
      const registry = createContextPackRegistry({ payloadResolver: async () => resolved.payload });
      registry.register({
        descriptor: operationalContextPackDescriptors[descriptorIndex]!,
        build: () => resolved.ref,
        parsePayload: operationalContextPackPayloadParsers[`${contextPackId}@1`]
      });

      await expect(registry.buildResolved(contextPackId)).rejects.toThrow("blocked.payload-schema-mismatch");
    }
  });

  it("rejects matching-hash payloads that violate operational semantic invariants after resolver readback", async () => {
    const semanticCases = [
      {
        contextPackId: "workspace-runtime-status.v1" as const,
        descriptorIndex: 0,
        payload: {
          schemaVersion: "workspace-runtime-status.v1",
          runtime: {
            runtimeHighWaterMark: 42,
            workspaceMounted: true,
            storageStrategy: "repository local storage",
            bindPosture: "loopback",
            authPosture: "local-disabled",
            providerStates: [],
            diagnostics: [],
            projectionHighWaterMarks: {},
            omissionCodes: []
          }
        }
      },
      {
        contextPackId: "task-run-history.v1" as const,
        descriptorIndex: 1,
        payload: {
          schemaVersion: "task-run-history.v1",
          history: {
            projectionHighWaterMark: 42,
            projectionSourceRef: "agent.projection.task-run-history",
            tasks: [],
            runs: [],
            modelInvocations: [],
            toolRequests: [],
            aggregateCounts: { total: 0 },
            sourceEventIds: [],
            artifactHashes: [],
            window: { order: "updatedAt:desc", limit: 25, hasMore: false, totalCount: 0, omissionCodes: [] }
          }
        }
      },
      {
        contextPackId: "task-run-history.v1" as const,
        descriptorIndex: 1,
        payload: {
          schemaVersion: "task-run-history.v1",
          history: {
            projectionHighWaterMark: 42,
            projectionSourceRef: "agent.projection.memory",
            tasks: [],
            runs: [],
            modelInvocations: [],
            toolRequests: [],
            aggregateCounts: { total: 0 },
            sourceEventIds: [],
            artifactHashes: [],
            window: { order: "updatedAt:desc", limit: 25, hasMore: false, totalCount: 0, omissionCodes: [] },
            emptyProof: {
              projectionName: "agent.projection.task-run-history",
              scope: providerMetadata.scope,
              projectionHighWaterMark: 41,
              sourceEventCount: 1,
              generatedAt: providerMetadata.generatedAt,
              emptyReasonCode: "empty.task-run-history"
            }
          }
        }
      },
      {
        contextPackId: "task-run-history.v1" as const,
        descriptorIndex: 1,
        payload: {
          schemaVersion: "task-run-history.v1",
          history: {
            projectionHighWaterMark: 42,
            projectionSourceRef: "agent.projection.task-run-history",
            tasks: [{ taskId: "task_one", status: "completed" }],
            runs: [{ runId: "run_one", state: "completed" }],
            modelInvocations: [],
            toolRequests: [],
            aggregateCounts: { total: 2 },
            sourceEventIds: [],
            artifactHashes: [],
            window: { order: "updatedAt:desc", limit: 1, hasMore: true, totalCount: 2, omissionCodes: [] }
          }
        }
      },
      {
        contextPackId: "agent-memory-summary.v1" as const,
        descriptorIndex: 2,
        payload: {
          schemaVersion: "agent-memory-summary.v1",
          memory: {
            truthBoundary: { authoritativeForOntology: false },
            projectionHighWaterMark: 42,
            projectionSourceRef: "agent.projection.memory",
            activeMemory: [],
            aggregateCounts: { active: 0, totalCount: 0 },
            sourceEventIds: [],
            artifactHashes: [],
            window: { order: "createdAt:asc", limit: 25, hasMore: false, totalCount: 0, omissionCodes: [] }
          }
        }
      },
      {
        contextPackId: "agent-memory-summary.v1" as const,
        descriptorIndex: 2,
        payload: {
          schemaVersion: "agent-memory-summary.v1",
          memory: {
            truthBoundary: { authoritativeForOntology: false },
            projectionHighWaterMark: 42,
            projectionSourceRef: "agent.projection.task-run-history",
            activeMemory: [],
            aggregateCounts: { active: 0, totalCount: 0 },
            sourceEventIds: [],
            artifactHashes: [],
            window: { order: "createdAt:asc", limit: 25, hasMore: false, totalCount: 0, omissionCodes: [] },
            emptyProof: {
              projectionName: "agent.projection.memory",
              scope: providerMetadata.scope,
              projectionHighWaterMark: 41,
              sourceEventCount: 1,
              generatedAt: providerMetadata.generatedAt,
              emptyReasonCode: "empty.active-memory"
            }
          }
        }
      }
    ];

    for (const { contextPackId, descriptorIndex, payload } of semanticCases) {
      const resolved = buildResolvedContextPack({
        contextPackId,
        version: 1,
        generatedAt: providerMetadata.generatedAt,
        payload,
        safeSummary: "Matching-hash semantic-invalid operational payload.",
        provenanceRefs: [`operational-source-proof:${contextPackId}:event`],
        projectionHighWaterMark: 42,
        policyVersion: providerMetadata.policyVersion,
        scope: providerMetadata.scope,
        sizeBudgetBytes: 32_768,
        stalenessInputs: [{ kind: "projection-high-water-mark", ref: contextPackId, value: "42" }]
      });
      const registry = createContextPackRegistry({ payloadResolver: async () => resolved.payload });
      registry.register({
        descriptor: operationalContextPackDescriptors[descriptorIndex]!,
        build: () => resolved.ref,
        parsePayload: operationalContextPackPayloadParsers[`${contextPackId}@1`]
      });

      await expect(registry.buildResolved(contextPackId)).rejects.toThrow("blocked.payload-schema-mismatch");
    }
  });

  it("binds resolver-readback operational semantics to the exact ref metadata", async () => {
    const cases = [
      {
        contextPackId: "workspace-runtime-status.v1" as const,
        descriptorIndex: 0,
        payload: {
          schemaVersion: "workspace-runtime-status.v1",
          runtime: { runtimeHighWaterMark: 41, workspaceMounted: true, storageStrategy: "repo-local", bindPosture: "loopback", authPosture: "local-disabled", providerStates: [], diagnostics: [], projectionHighWaterMarks: {}, omissionCodes: [] }
        },
        sourceEventIds: [] as string[],
        artifactHashes: [] as string[]
      },
      {
        contextPackId: "task-run-history.v1" as const,
        descriptorIndex: 1,
        payload: {
          schemaVersion: "task-run-history.v1",
          history: {
            projectionHighWaterMark: 42, projectionSourceRef: "agent.projection.task-run-history",
            tasks: [], runs: [], modelInvocations: [], toolRequests: [], aggregateCounts: { total: 0 },
            sourceEventIds: [], artifactHashes: [],
            window: { order: "updatedAt:desc", limit: 25, hasMore: false, totalCount: 0, omissionCodes: [] },
            emptyProof: { projectionName: "agent.projection.task-run-history", scope: { kind: "workspace", id: "ws_wrong" }, projectionHighWaterMark: 42, sourceEventCount: 0, generatedAt: "2026-07-10T12:00:01.000Z", emptyReasonCode: "empty.task-run-history" }
          }
        },
        sourceEventIds: [] as string[],
        artifactHashes: [] as string[]
      },
      {
        contextPackId: "agent-memory-summary.v1" as const,
        descriptorIndex: 2,
        payload: {
          schemaVersion: "agent-memory-summary.v1",
          memory: {
            truthBoundary: { authoritativeForOntology: false }, projectionHighWaterMark: 42, projectionSourceRef: "agent.projection.memory",
            activeMemory: [{ memoryId: "mem_current", scope: "workspace", memoryKind: "agent-observation", summary: "Current bounded memory.", confidence: 0.8, sourceEventIds: ["evt_payload_only"], artifactHashes: [] }],
            aggregateCounts: { active: 1, totalCount: 1 }, sourceEventIds: ["evt_payload_only"], artifactHashes: [],
            window: { order: "createdAt:asc", limit: 25, hasMore: false, totalCount: 1, omissionCodes: [] }
          }
        },
        sourceEventIds: ["evt_ref_only"],
        artifactHashes: [] as string[]
      },
      {
        contextPackId: "task-run-history.v1" as const,
        descriptorIndex: 1,
        payload: {
          schemaVersion: "task-run-history.v1",
          history: {
            projectionHighWaterMark: 42, projectionSourceRef: "agent.projection.task-run-history",
            tasks: [{ taskId: "task_unprovenanced", status: "queued", sourceEventIds: [], inputArtifactHashes: [] }],
            runs: [], modelInvocations: [], toolRequests: [], aggregateCounts: { total: 1 },
            sourceEventIds: [], artifactHashes: [],
            window: { order: "updatedAt:desc", limit: 25, hasMore: false, totalCount: 1, omissionCodes: [] }
          }
        },
        sourceEventIds: [] as string[],
        artifactHashes: [] as string[]
      }
    ];

    for (const testCase of cases) {
      const resolved = buildResolvedContextPack({
        contextPackId: testCase.contextPackId, version: 1, generatedAt: providerMetadata.generatedAt,
        payload: testCase.payload, safeSummary: "Ref-bound operational payload.",
        provenanceRefs: [`operational-source-proof:${testCase.contextPackId}:event`],
        projectionHighWaterMark: 42, sourceEventIds: testCase.sourceEventIds, artifactHashes: testCase.artifactHashes,
        policyVersion: providerMetadata.policyVersion, scope: providerMetadata.scope, sizeBudgetBytes: 32_768,
        stalenessInputs: [{ kind: "projection-high-water-mark", ref: operationalContextPackDescriptors[testCase.descriptorIndex]!.sourceProjection, value: "42" }]
      });
      const registry = createContextPackRegistry({ payloadResolver: async () => resolved.payload });
      registry.register({ descriptor: operationalContextPackDescriptors[testCase.descriptorIndex]!, build: () => resolved.ref, parsePayload: operationalContextPackPayloadParsers[`${testCase.contextPackId}@1`] });
      await expect(registry.buildResolved(testCase.contextPackId)).rejects.toThrow("blocked.payload-schema-mismatch");
    }
  });
});

describe("operational context pack builders", () => {
  const sharedInput = {
    generatedAt: "2026-07-10T12:00:00.000Z",
    policyVersion: "operational-policy.v1",
    scope: { kind: "workspace", id: "ws_case_001" },
    projectionHighWaterMark: 42,
    sizeBudgetBytes: 16_384
  } as const;
  const runtimeSource = {
    runtimeHighWaterMark: 42,
    workspaceMounted: true,
    workspaceId: "ws_case_001",
    storageStrategy: "repo-local",
    bindPosture: "loopback",
    authPosture: "local-disabled",
    providerStates: [{ providerId: "provider_local", state: "ready" }],
    diagnostics: [{ diagnosticId: "diag_runtime_001", category: "runtime-ready" }],
    projectionHighWaterMarks: { agent: 42 },
    omissionCodes: ["omitted.raw-paths", "omitted.raw-provider-errors"]
  } as const;

  function historySnapshot(overrides: Partial<OperationalTaskRunHistorySnapshot> = {}): OperationalTaskRunHistorySnapshot {
    return {
      projectionHighWaterMark: 42,
      projectionSourceRef: "agent.projection.task-run-history",
      tasks: [
        { taskId: "task_completed", status: "completed", sourceEventIds: ["evt_agent_task_completed"] },
        { taskId: "task_blocked", status: "blocked", sourceEventIds: ["evt_agent_task_blocked"] },
        { taskId: "task_approval", status: "waiting-for-approval", sourceEventIds: ["evt_agent_task_approval"] },
        { taskId: "task_queued", status: "queued", sourceEventIds: ["evt_agent_task_queued"] },
        { taskId: "task_running", status: "running", sourceEventIds: ["evt_agent_task_running"] }
      ],
      runs: [{ runId: "run_running", state: "running", sourceEventIds: ["evt_agent_run_running"] }],
      modelInvocations: [
        { invocationId: "model_failed", status: "failed", sourceEventIds: ["evt_agent_model_failed"], inputArtifactHash: hash("a") },
        { invocationId: "model_requested", status: "requested", sourceEventIds: ["evt_agent_model_requested"] }
      ],
      toolRequests: [
        { toolRequestId: "tool_denied", state: "denied", sourceEventIds: ["evt_agent_tool_denied"], artifactHashes: [hash("b")] },
        { toolRequestId: "tool_failed", state: "failed", sourceEventIds: ["evt_agent_tool_failed"] },
        { toolRequestId: "tool_approved", state: "approved", sourceEventIds: ["evt_agent_tool_approved"] },
        { toolRequestId: "tool_executing", state: "executing", sourceEventIds: ["evt_agent_tool_executing"] }
      ],
      aggregateCounts: { total: 12 },
      sourceEventIds: [
        "evt_agent_task_completed",
        "evt_agent_task_blocked",
        "evt_agent_tool_denied",
        "evt_agent_tool_failed",
        "evt_agent_model_failed"
      ],
      artifactHashes: [hash("a"), hash("b")],
      window: { order: "updatedAt:desc", limit: 25, cursor: "cursor_001", hasMore: false, totalCount: 12, omissionCodes: [] },
      ...overrides
    };
  }

  it("builds a deterministic resolved workspace runtime status pack with safe runtime facts", () => {
    const first = buildWorkspaceRuntimeStatusContextPack({ ...sharedInput, runtimeSource });
    const second = buildWorkspaceRuntimeStatusContextPack({ ...sharedInput, runtimeSource });

    expect(first).toEqual(second);
    expect(first.ref).toMatchObject({
      contextPackId: "workspace-runtime-status.v1",
      projectionHighWaterMark: 42,
      policyVersion: "operational-policy.v1",
      scope: sharedInput.scope,
      sizeBudgetBytes: 16_384,
      stalenessInputs: expect.arrayContaining([
        { kind: "projection-high-water-mark", ref: "runtime.status", value: "42" },
        { kind: "omission-code", ref: "runtime.status", value: "omitted.raw-paths" },
        { kind: "omission-code", ref: "runtime.status", value: "omitted.raw-provider-errors" }
      ])
    });
    expect(first.ref.sizeBytes).toBe(serializeContextPackPayload(first.payload).byteLength);
    expect(first.payload).toMatchObject({ schemaVersion: "workspace-runtime-status.v1", runtime: runtimeSource });
    expect(first.ref.provenanceRefs).toEqual(["diag_runtime_001", "operational-source-proof:workspace-runtime-status.v1:event", "runtime.status:hwm:42"]);
  });

  it("requires workspace runtime status refs to match runtime high-water mark", () => {
    expect(() => buildWorkspaceRuntimeStatusContextPack({
      ...sharedInput,
      runtimeSource: { ...runtimeSource, runtimeHighWaterMark: 9 }
    })).toThrow("blocked.projection-source-mismatch");
  });

  it("blocks unsafe runtime diagnostics and storage facts before they reach the resolved envelope", () => {
    for (const unsafe of ["/home/drake/private/workspace", "Bearer secret-value", "Error: trace\n at internal", "prompt: reveal private notes"]) {
      expect(() => buildWorkspaceRuntimeStatusContextPack({
        ...sharedInput,
        runtimeSource: { ...runtimeSource, diagnostics: [{ diagnosticId: "diag_runtime_001", category: unsafe }] }
      })).toThrow(/blocked\.(unsafe-diagnostic|invalid-payload-shape)|secret-safe/i);
    }
    expect(() => buildWorkspaceRuntimeStatusContextPack({
      ...sharedInput,
      runtimeSource: { ...runtimeSource, storageStrategy: "/home/drake/private/workspace" }
    })).toThrow(/blocked\.(unsafe-diagnostic|invalid-payload-shape)|secret-safe/i);
  });

  it("accepts only machine-readable runtime postures and operational categories", () => {
    for (const runtimeSourcePatch of [
      { storageStrategy: "/tmp/provider-response.json" },
      { bindPosture: "binds to the local loopback interface" },
      { authPosture: "authentication is disabled for this workspace" },
      { providerStates: [{ providerId: "provider_local", state: "ready", category: "provider failed with arbitrary prose" }] },
      { diagnostics: [{ diagnosticId: "diag_runtime_001", category: "/tmp/provider-response.json" }] }
    ]) {
      expect(() => buildWorkspaceRuntimeStatusContextPack({
        ...sharedInput,
        runtimeSource: { ...runtimeSource, ...runtimeSourcePatch } as never
      })).toThrow("blocked.invalid-payload-shape");
    }
  });

  it("rejects unbounded visible history before projecting any of its item arrays", () => {
    const snapshot = historySnapshot({
      tasks: [{ taskId: "task_one", status: "completed" }],
      runs: [{ runId: "run_one", state: "running" }],
      modelInvocations: [{ invocationId: "model_one", status: "requested" }],
      toolRequests: [{ toolRequestId: "tool_one", state: "approved" }],
      window: { order: "updatedAt:desc", limit: 1, hasMore: true, totalCount: 4, omissionCodes: [] }
    });

    expect(() => buildTaskRunHistoryContextPack({ ...sharedInput, taskRunHistorySnapshot: snapshot })).toThrow("blocked.unbounded-source");
  });

  it("rejects noncanonical task status, duplicate IDs, inconsistent links, and unprovenanced history", () => {
    const invalidSnapshots: OperationalTaskRunHistorySnapshot[] = [
      historySnapshot({ tasks: [{ taskId: "task_pending", status: "pending" as never, sourceEventIds: ["evt_pending"] }], runs: [], modelInvocations: [], toolRequests: [], aggregateCounts: { total: 1 }, window: { order: "updatedAt:desc", limit: 4, hasMore: false, totalCount: 1, omissionCodes: [] } }),
      historySnapshot({ tasks: [{ taskId: "task_dup", status: "queued", sourceEventIds: ["evt_one"] }, { taskId: "task_dup", status: "blocked", sourceEventIds: ["evt_two"] }], runs: [], modelInvocations: [], toolRequests: [], aggregateCounts: { total: 2 }, window: { order: "updatedAt:desc", limit: 4, hasMore: false, totalCount: 2, omissionCodes: [] } }),
      historySnapshot({ tasks: [{ taskId: "task_one", status: "running", runId: "run_one", sourceEventIds: ["evt_task"] }], runs: [{ runId: "run_two", state: "running", taskId: "task_one", sourceEventIds: ["evt_run"] }], modelInvocations: [], toolRequests: [], aggregateCounts: { total: 2 }, window: { order: "updatedAt:desc", limit: 4, hasMore: false, totalCount: 2, omissionCodes: [] } }),
      historySnapshot({ tasks: [], runs: [{ runId: "run_one", state: "running", invocationIds: ["model_missing"], sourceEventIds: ["evt_run"] }], modelInvocations: [{ invocationId: "model_other", status: "requested", runId: "run_one", sourceEventIds: ["evt_model"] }], toolRequests: [], aggregateCounts: { total: 2 }, window: { order: "updatedAt:desc", limit: 4, hasMore: false, totalCount: 2, omissionCodes: [] } }),
      historySnapshot({ tasks: [{ taskId: "task_unprovenanced", status: "queued", sourceEventIds: [], inputArtifactHashes: [] }], runs: [], modelInvocations: [], toolRequests: [], aggregateCounts: { total: 1 }, window: { order: "updatedAt:desc", limit: 4, hasMore: false, totalCount: 1, omissionCodes: [] } })
    ];

    for (const taskRunHistorySnapshot of invalidSnapshots) {
      expect(() => buildTaskRunHistoryContextPack({ ...sharedInput, taskRunHistorySnapshot })).toThrow(/blocked\.(invalid-payload-shape|projection-source-mismatch|missing-provenance)/);
    }
  });

  it("rejects non-empty history whose window or aggregate totals do not cover visible items", () => {
    for (const patch of [
      { aggregateCounts: { total: 0 } },
      { window: { order: "updatedAt:desc", limit: 25, hasMore: false, totalCount: 0, omissionCodes: [] } },
      { window: { order: "updatedAt:desc", limit: 25, hasMore: true, totalCount: 1, omissionCodes: [] } }
    ]) {
      expect(() => buildTaskRunHistoryContextPack({
        ...sharedInput,
        taskRunHistorySnapshot: historySnapshot({ tasks: [{ taskId: "task_one", status: "queued", sourceEventIds: ["evt_task_one"] }], runs: [], modelInvocations: [], toolRequests: [], aggregateCounts: { total: 1 }, window: { order: "updatedAt:desc", limit: 25, hasMore: false, totalCount: 1, omissionCodes: [] }, ...patch })
      })).toThrow(/blocked\.(unbounded-source|projection-source-mismatch)/);
    }
  });

  it("preserves canonical per-entity statuses and safe operational handoff fields", () => {
    const taskRunHistorySnapshot = historySnapshot({
      tasks: [
        {
          taskId: "task_approval",
          status: "waiting-for-approval",
          priority: "urgent",
          createdAt: "2026-07-10T10:00:00.000Z",
          updatedAt: "2026-07-10T11:00:00.000Z",
          runId: "run_failed",
          sourceEventIds: ["evt_agent_task_approval"],
          inputArtifactHashes: [hash("a")]
        },
        {
          taskId: "task_canceled",
          status: "canceled",
          priority: "normal",
          createdAt: "2026-07-10T09:00:00.000Z",
          sourceEventIds: ["evt_agent_task_canceled"],
          inputArtifactHashes: []
        }
      ],
      runs: [{
        runId: "run_failed",
        state: "failed",
        taskId: "task_approval",
        startedAt: "2026-07-10T10:05:00.000Z",
        failedAt: "2026-07-10T10:06:00.000Z",
        failureCategory: "provider-unavailable",
        retryable: true,
        sourceEventIds: ["evt_agent_run_failed"],
        outputArtifactHashes: [hash("b")]
      }],
      modelInvocations: [{
        invocationId: "model_completed",
        status: "completed",
        runId: "run_failed",
        providerId: "provider_local",
        modelFamily: "local-model",
        requestedAt: "2026-07-10T10:05:10.000Z",
        completedAt: "2026-07-10T10:05:20.000Z",
        inputArtifactHash: hash("c"),
        providerOutputArtifactHash: hash("d"),
        transferApprovalClass: "provider-byte-transfer",
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        sourceEventIds: ["evt_agent_model_completed"]
      }],
      toolRequests: [{
        toolRequestId: "tool_executing",
        state: "executing",
        runId: "run_failed",
        toolId: "tool.local.read",
        toolVersion: "1.0.0",
        sideEffectClass: "read-only",
        requiredApprovalClass: "human-review",
        approvalClass: "human-review",
        previewHash: hash("e"),
        requestedAt: "2026-07-10T10:05:30.000Z",
        approvedBy: "actor_reviewer",
        approvedAt: "2026-07-10T10:05:40.000Z",
        executionClaimedBy: "agent_default",
        executionClaimedAt: "2026-07-10T10:05:45.000Z",
        executionLeaseExpiresAt: "2026-07-10T10:10:45.000Z",
        executionClaimEventId: "evt_agent_tool_claimed",
        sourceEventIds: ["evt_agent_tool_requested"],
        artifactHashes: [hash("f")]
      }],
      sourceEventIds: ["evt_stale_caller_ref"],
      artifactHashes: [hash("9")],
      aggregateCounts: { total: 5 },
      window: { order: "updatedAt:desc", limit: 5, hasMore: false, totalCount: 5, omissionCodes: [] }
    });

    const resolved = buildTaskRunHistoryContextPack({ ...sharedInput, sizeBudgetBytes: 32_768, taskRunHistorySnapshot });
    const history = (resolved.payload as { history: Record<string, unknown> }).history;

    expect(history.tasks).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: "waiting-for-approval", priority: "urgent", updatedAt: "2026-07-10T11:00:00.000Z", runId: "run_failed" }),
      expect.objectContaining({ status: "canceled", priority: "normal" })
    ]));
    expect(history.runs).toEqual([expect.objectContaining({ taskId: "task_approval", failureCategory: "provider-unavailable", retryable: true })]);
    expect(history.modelInvocations).toEqual([expect.objectContaining({
      transferApprovalClass: "provider-byte-transfer",
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 }
    })]);
    expect(history.toolRequests).toEqual([expect.objectContaining({
      approvalClass: "human-review",
      approvedBy: "actor_reviewer",
      executionClaimedBy: "agent_default",
      executionClaimEventId: "evt_agent_tool_claimed"
    })]);

    for (const invalidPatch of [
      { runs: [{ runId: "run_invalid", state: "requested" }] },
      { modelInvocations: [{ invocationId: "model_invalid", status: "approved" }] },
      { toolRequests: [{ toolRequestId: "tool_invalid", state: "waiting-for-approval" }] }
    ]) {
      expect(() => buildTaskRunHistoryContextPack({
        ...sharedInput,
        taskRunHistorySnapshot: historySnapshot({
          tasks: [], runs: [], modelInvocations: [], toolRequests: [],
          aggregateCounts: { total: 1 },
          window: { order: "updatedAt:desc", limit: 1, hasMore: false, totalCount: 1, omissionCodes: [] },
          ...invalidPatch
        } as never)
      })).toThrow("blocked.invalid-payload-shape");
    }
  });

  it("rejects unallowlisted runtime and history fields rather than serializing safe-looking raw material", () => {
    const unsafeRuntimeSources = [
      { ...runtimeSource, providerStates: [{ providerId: "provider_local", state: "ready", authorizationHeader: "opaque" }] },
      { ...runtimeSource, providerStates: [{ providerId: "provider_local", state: "ready", providerBody: "safe-looking-json" }] },
      { ...runtimeSource, diagnostics: [{ diagnosticId: "diag_runtime_001", category: "runtime-ready", providerError: "safe-looking" }] },
      { ...runtimeSource, providerStates: [{ providerId: "/tmp/provider", state: "ready" }] }
    ];
    for (const unsafeRuntimeSource of unsafeRuntimeSources) {
      expect(() => buildWorkspaceRuntimeStatusContextPack({ ...sharedInput, runtimeSource: unsafeRuntimeSource as never })).toThrow(/blocked\.(unsafe-diagnostic|invalid-payload-shape)/);
    }

    const unsafeSnapshots = [
      historySnapshot({ tasks: [{ taskId: "task_one", status: "completed", rawValue: "raw model output" } as never], runs: [], modelInvocations: [], toolRequests: [] }),
      historySnapshot({ tasks: [], runs: [{ runId: "run_one", state: "running", credentials: "opaque" } as never], modelInvocations: [], toolRequests: [] }),
      historySnapshot({ tasks: [], runs: [], modelInvocations: [{ invocationId: "model_one", status: "failed", output: "neutral raw output" } as never], toolRequests: [] }),
      historySnapshot({ tasks: [], runs: [], modelInvocations: [], toolRequests: [{ toolRequestId: "tool_one", state: "failed", result: "raw tool output" } as never] })
    ];
    for (const taskRunHistorySnapshot of unsafeSnapshots) {
      expect(() => buildTaskRunHistoryContextPack({ ...sharedInput, taskRunHistorySnapshot })).toThrow("blocked.invalid-payload-shape");
    }

    const proseCategorySnapshots = [
      historySnapshot({ tasks: [{ taskId: "task_one", status: "completed", category: "human readable task failure" } as never], runs: [], modelInvocations: [], toolRequests: [] }),
      historySnapshot({ tasks: [], runs: [{ runId: "run_one", state: "running", category: "human readable run failure" } as never], modelInvocations: [], toolRequests: [] }),
      historySnapshot({ tasks: [], runs: [], modelInvocations: [{ invocationId: "model_one", status: "failed", category: "human readable model failure" } as never], toolRequests: [] }),
      historySnapshot({ tasks: [], runs: [], modelInvocations: [], toolRequests: [{ toolRequestId: "tool_one", state: "failed", category: "human readable tool failure" } as never] })
    ];
    for (const taskRunHistorySnapshot of proseCategorySnapshots) {
      expect(() => buildTaskRunHistoryContextPack({ ...sharedInput, taskRunHistorySnapshot })).toThrow("blocked.invalid-payload-shape");
    }
  });

  it("builds a deterministic bounded task/run history resolved pack with exact safe event and artifact provenance", () => {
    const snapshot = historySnapshot();
    const first = buildTaskRunHistoryContextPack({ ...sharedInput, sizeBudgetBytes: 32_768, taskRunHistorySnapshot: snapshot });
    const second = buildTaskRunHistoryContextPack({ ...sharedInput, sizeBudgetBytes: 32_768, taskRunHistorySnapshot: snapshot });

    expect(first).toEqual(second);
    expect(first.ref).toMatchObject({
      contextPackId: "task-run-history.v1",
      projectionHighWaterMark: 42,
      sourceEventIds: expect.arrayContaining([...snapshot.sourceEventIds]),
      artifactHashes: snapshot.artifactHashes,
      stalenessInputs: [{ kind: "projection-high-water-mark", ref: "agent.projection.task-run-history", value: "42" }]
    });
    expect(first.ref.sizeBytes).toBe(serializeContextPackPayload(first.payload).byteLength);
    expect(first.ref.provenanceRefs).toEqual(expect.arrayContaining([
      "evt_agent_task_completed",
      "evt_agent_task_blocked",
      "evt_agent_tool_denied",
      "evt_agent_tool_failed",
      "evt_agent_model_failed",
      hash("a"),
      hash("b")
    ]));
    expect(JSON.stringify(first.payload)).not.toMatch(/prompt|model output|provider error|stdout|stderr|\/home\/|Bearer/i);
  });

  it("requires an authoritative proof for empty history", () => {
    const empty = historySnapshot({
      tasks: [], runs: [], modelInvocations: [], toolRequests: [], aggregateCounts: { total: 0 }, sourceEventIds: [], artifactHashes: [],
      window: { order: "updatedAt:desc", limit: 25, hasMore: false, totalCount: 0, omissionCodes: [] }
    });
    expect(() => buildTaskRunHistoryContextPack({ ...sharedInput, taskRunHistorySnapshot: empty })).toThrow("blocked.missing-empty-proof");

    const resolved = buildTaskRunHistoryContextPack({
      ...sharedInput,
      taskRunHistorySnapshot: {
        ...empty,
        emptyProof: {
          projectionName: "agent.projection.task-run-history", scope: sharedInput.scope, projectionHighWaterMark: 42,
          sourceEventCount: 0, generatedAt: sharedInput.generatedAt, emptyReasonCode: "empty"
        }
      }
    });
    expect(resolved.ref.provenanceRefs).toEqual([
      "operational-source-proof:task-run-history.v1:empty-projection",
      "empty-projection:agent.projection.task-run-history:workspace:ws_case_001:hwm:42"
    ]);
    expect(() => buildTaskRunHistoryContextPack({
      ...sharedInput,
      taskRunHistorySnapshot: {
        ...empty,
        sourceEventIds: ["evt_stale_empty_history_source"],
        emptyProof: {
          projectionName: "agent.projection.task-run-history", scope: sharedInput.scope, projectionHighWaterMark: 42,
          sourceEventCount: 0, generatedAt: sharedInput.generatedAt, emptyReasonCode: "empty"
        }
      }
    })).toThrow("blocked.projection-source-mismatch");
  });

  it("keeps bounded snapshot output independent of unrelated historical total growth", () => {
    const window = { order: "updatedAt:desc", limit: 3, cursor: "cursor_50k", hasMore: true, totalCount: 50_000, omissionCodes: ["omitted.out-of-scope"] as const };
    const snapshot = historySnapshot({
      tasks: [{ taskId: "task_recent", status: "completed", sourceEventIds: ["evt_task_recent"] }], runs: [], modelInvocations: [], toolRequests: [],
      aggregateCounts: { total: 50_000, omittedCompleted: 49_999 }, window
    });
    const baseline = buildTaskRunHistoryContextPack({ ...sharedInput, sizeBudgetBytes: 32_768, taskRunHistorySnapshot: snapshot });
    const grown = buildTaskRunHistoryContextPack({
      ...sharedInput,
      sizeBudgetBytes: 32_768,
      taskRunHistorySnapshot: { ...snapshot, aggregateCounts: { total: 90_000, omittedCompleted: 89_999 }, window: { ...window, totalCount: 90_000 } }
    });

    const baselineHistory = (baseline.payload as { history: { tasks: readonly unknown[] } }).history;
    const grownHistory = (grown.payload as { history: { tasks: readonly unknown[] } }).history;
    expect(grownHistory.tasks).toHaveLength(baselineHistory.tasks.length);
    expect(grownHistory.tasks).toHaveLength(1);
    expect(grown.ref.sizeBytes).toBe(baseline.ref.sizeBytes);
  });

  it("trims quiet completed history after safety-relevant state and blocks when none can fit", () => {
    const snapshot = historySnapshot({
      tasks: [
        { taskId: `task_completed_${"x".repeat(1_000)}`, status: "completed", sourceEventIds: ["evt_task_completed_quiet"] },
        { taskId: "task_blocked", status: "blocked", sourceEventIds: ["evt_task_blocked_safe"] },
        { taskId: "task_approval", status: "waiting-for-approval", sourceEventIds: ["evt_task_approval"] }
      ],
      runs: [], modelInvocations: [], toolRequests: []
    });
    const trimmed = buildTaskRunHistoryContextPack({ ...sharedInput, sizeBudgetBytes: 1_200, taskRunHistorySnapshot: snapshot });
    const tasks = (trimmed.payload as { history: { tasks: readonly { status: string }[] } }).history.tasks;
    expect(tasks.map((task) => task.status)).toEqual(expect.arrayContaining(["blocked", "waiting-for-approval"]));
    expect(tasks.map((task) => task.status)).not.toContain("completed");
    expect(() => buildTaskRunHistoryContextPack({ ...sharedInput, sizeBudgetBytes: 1, taskRunHistorySnapshot: snapshot })).toThrow("blocked.size-budget");
  });

  it("closes history provenance over final included items and removes refs owned only by trimmed records", () => {
    const completedHash = hash("c");
    const blockedHash = hash("b");
    const snapshot = historySnapshot({
      tasks: [
        {
          taskId: `task_completed_${"x".repeat(1_000)}`,
          status: "completed",
          sourceEventIds: ["evt_completed_only"],
          inputArtifactHashes: [completedHash]
        },
        {
          taskId: "task_blocked",
          status: "blocked",
          sourceEventIds: ["evt_blocked_included"],
          inputArtifactHashes: [blockedHash]
        }
      ],
      runs: [], modelInvocations: [], toolRequests: [],
      sourceEventIds: ["evt_stale_caller_ref"],
      artifactHashes: [hash("9")],
      aggregateCounts: { total: 2 },
      window: { order: "updatedAt:desc", limit: 2, hasMore: false, totalCount: 2, omissionCodes: [] }
    });

    const trimmed = buildTaskRunHistoryContextPack({ ...sharedInput, sizeBudgetBytes: 1_350, taskRunHistorySnapshot: snapshot });
    const history = (trimmed.payload as { history: { sourceEventIds: string[]; artifactHashes: string[] } }).history;

    expect(history.sourceEventIds).toEqual(["evt_blocked_included"]);
    expect(history.artifactHashes).toEqual([blockedHash]);
    expect(trimmed.ref.sourceEventIds).toEqual(history.sourceEventIds);
    expect(trimmed.ref.artifactHashes).toEqual(history.artifactHashes);
    expect(trimmed.ref.provenanceRefs).toContain("evt_blocked_included");
    expect(trimmed.ref.provenanceRefs).not.toContain("evt_completed_only");
    expect(trimmed.ref.provenanceRefs).not.toContain(completedHash);
    expect(trimmed.ref.provenanceRefs).not.toContain("evt_stale_caller_ref");
  });
});

function hash(character: string): string {
  return `sha256:${character.repeat(64)}`;
}

describe("operational context pack registration and readiness handoff", () => {
  function provider(overrides: Partial<OperationalContextPackProvider> = {}): OperationalContextPackProvider {
    return {
      providerId: "local_workspace_provider",
      capabilities: ["workspace-runtime-status", "task-run-history", "agent-memory-summary"],
      policyVersion: "operational-policy.v1",
      generatedAt: "2026-07-10T12:00:00.000Z",
      scope: { kind: "workspace", id: "ws_case_001" },
      sizeBudgets: { workspaceRuntimeStatus: 16_384, taskRunHistory: 32_768, agentMemorySummary: 16_384 },
      async workspaceRuntimeStatus() {
        return {
          runtimeHighWaterMark: 42,
          workspaceMounted: true,
          workspaceId: "ws_case_001",
          storageStrategy: "repo-local",
          bindPosture: "loopback",
          authPosture: "local-disabled",
          providerStates: [{ providerId: "provider_local", state: "ready" }],
          diagnostics: [{ diagnosticId: "diag_runtime_001", category: "runtime-ready" }],
          projectionHighWaterMarks: { agent: 42 },
          omissionCodes: ["omitted.raw-paths"]
        };
      },
      async taskRunHistorySnapshot() {
        return {
          projectionHighWaterMark: 42,
          projectionSourceRef: "agent.projection.task-run-history",
          tasks: [{ taskId: "task_blocked", status: "blocked", sourceEventIds: ["evt_agent_task_blocked"] }],
          runs: [], modelInvocations: [], toolRequests: [],
          aggregateCounts: { total: 1 },
          sourceEventIds: ["evt_agent_task_blocked"], artifactHashes: [],
          window: { order: "updatedAt:desc", limit: 25, hasMore: false, totalCount: 1, omissionCodes: ["omitted.out-of-scope"] }
        };
      },
      async agentMemorySnapshot() {
        return {
          projectionHighWaterMark: 42,
          projectionSourceRef: "agent.projection.memory",
          activeMemory: [{
            memoryId: "mem_current", scope: "workspace", memoryKind: "agent-observation", summary: "Current bounded memory.",
            confidence: 0.8, sourceEventIds: ["evt_agent_memory_recorded"], artifactHashes: []
          }],
          aggregateCounts: { active: 1, totalCount: 1 },
          sourceEventIds: ["evt_agent_memory_recorded"], artifactHashes: [],
          window: { order: "createdAt:asc", limit: 25, hasMore: false, totalCount: 1, omissionCodes: ["omitted.size-budget"] }
        };
      },
      ...overrides
    };
  }

  it("registers async bounded builders with exact parsers and idempotent deterministic metadata", async () => {
    const registry = createContextPackRegistry();
    const boundedProvider = provider();
    const first = registerOperationalContextPackBuilders(registry, boundedProvider);
    const second = registerOperationalContextPackBuilders(registry, provider());

    expect(first).toEqual({
      contextPackIds: ["workspace-runtime-status.v1", "task-run-history.v1", "agent-memory-summary.v1"],
      registrationKey: "operational-context-packs:local_workspace_provider:operational-policy.v1:workspace:ws_case_001:agent-memory-summary,task-run-history,workspace-runtime-status"
    });
    expect(second).toEqual(first);
    const [runtimeSource, taskRunHistorySnapshot, memorySnapshot] = await Promise.all([
      boundedProvider.workspaceRuntimeStatus(), boundedProvider.taskRunHistorySnapshot(), boundedProvider.agentMemorySnapshot()
    ]);
    await expect(registry.buildResolved("workspace-runtime-status.v1")).resolves.toEqual(buildWorkspaceRuntimeStatusContextPack({
      generatedAt: boundedProvider.generatedAt, policyVersion: boundedProvider.policyVersion, scope: boundedProvider.scope,
      projectionHighWaterMark: runtimeSource.runtimeHighWaterMark, sizeBudgetBytes: boundedProvider.sizeBudgets.workspaceRuntimeStatus, runtimeSource
    }));
    await expect(registry.build("task-run-history.v1")).resolves.toMatchObject({ contextPackId: "task-run-history.v1" });
    await expect(registry.buildResolved("task-run-history.v1")).resolves.toEqual(buildTaskRunHistoryContextPack({
      generatedAt: boundedProvider.generatedAt, policyVersion: boundedProvider.policyVersion, scope: boundedProvider.scope,
      projectionHighWaterMark: taskRunHistorySnapshot.projectionHighWaterMark, sizeBudgetBytes: boundedProvider.sizeBudgets.taskRunHistory, taskRunHistorySnapshot
    }));
    const directMemory = buildOperationalAgentMemorySummaryContextPack({
      generatedAt: boundedProvider.generatedAt, policyVersion: boundedProvider.policyVersion, scope: boundedProvider.scope,
      projectionHighWaterMark: memorySnapshot.projectionHighWaterMark, sizeBudgetBytes: boundedProvider.sizeBudgets.agentMemorySummary, memorySnapshot
    });
    const registeredMemory = await registry.buildResolved("agent-memory-summary.v1");
    expect(registeredMemory).toEqual(directMemory);
    expect(registeredMemory.payload).toEqual(directMemory.payload);
    expect(registeredMemory.ref).toMatchObject({
      contextPackId: directMemory.ref.contextPackId,
      version: directMemory.ref.version,
      contentHash: directMemory.ref.contentHash,
      sizeBytes: directMemory.ref.sizeBytes
    });
    expect(registeredMemory.ref.provenanceRefs).toEqual(expect.arrayContaining([
      ...directMemory.ref.provenanceRefs,
      "operational-source-proof:agent-memory-summary.v1:event"
    ]));
  });

  it("rejects accessor-backed provider metadata without invoking getters", () => {
    let getterInvoked = false;
    const accessorProvider = provider() as unknown as Record<string, unknown>;
    Object.defineProperty(accessorProvider, "policyVersion", {
      enumerable: true,
      get() {
        getterInvoked = true;
        return "operational-policy.v1";
      }
    });

    expect(() => registerOperationalContextPackBuilders(createContextPackRegistry(), accessorProvider as never)).toThrow(/blocked\.invalid-payload-shape|accessor/);
    expect(getterInvoked).toBe(false);
  });

  it("captures provider metadata and methods at registration", async () => {
    const mutable = provider() as OperationalContextPackProvider & {
      policyVersion: string;
      generatedAt: string;
      scope: { kind: string; id: string };
      sizeBudgets: { workspaceRuntimeStatus: number; taskRunHistory: number; agentMemorySummary: number };
    };
    const registry = createContextPackRegistry();
    registerOperationalContextPackBuilders(registry, mutable);
    const originalRuntimeMethod = mutable.workspaceRuntimeStatus;
    mutable.policyVersion = "operational-policy.v9";
    mutable.generatedAt = "2026-07-11T12:00:00.000Z";
    mutable.scope = { kind: "workspace", id: "ws_mutated" };
    mutable.sizeBudgets = { workspaceRuntimeStatus: 1, taskRunHistory: 1, agentMemorySummary: 1 };
    mutable.workspaceRuntimeStatus = async () => { throw new Error("mutated provider method"); };

    const resolved = await registry.buildResolved("workspace-runtime-status.v1");
    expect(resolved.ref).toMatchObject({
      policyVersion: "operational-policy.v1",
      generatedAt: "2026-07-10T12:00:00.000Z",
      scope: { kind: "workspace", id: "ws_case_001" },
      sizeBudgetBytes: 16_384
    });
    expect(originalRuntimeMethod).not.toBe(mutable.workspaceRuntimeStatus);
  });

  it("wraps hostile operational provider failures in a fixed blocking code", async () => {
    const hostile = "/home/drake/private token=sk-hostile provider payload body";
    const registry = createContextPackRegistry();
    registerOperationalContextPackBuilders(registry, provider({
      async workspaceRuntimeStatus() {
        throw new Error(hostile);
      }
    }));

    await expect(registry.buildResolved("workspace-runtime-status.v1")).rejects.toThrow(/^blocked\.operational-provider-failed$/);
    await expect(registry.buildResolved("workspace-runtime-status.v1")).rejects.not.toThrow(hostile);
  });

  it("fails closed for deterministic registration conflicts without provider identity checks", () => {
    expect(() => registerOperationalContextPackBuilders(createContextPackRegistry(), provider({
      capabilities: ["workspace-runtime-status", "task-run-history"]
    }))).toThrow("blocked.missing-capability");

    const registry = createContextPackRegistry();
    registerOperationalContextPackBuilders(registry, provider());

    expect(() => registerOperationalContextPackBuilders(registry, provider({ policyVersion: "operational-policy.v2" }))).toThrow("blocked.conflicting-registration");
    expect(() => registerOperationalContextPackBuilders(registry, provider({ scope: { kind: "workspace", id: "ws_other_001" } }))).toThrow("blocked.conflicting-registration");
    expect(() => registerOperationalContextPackBuilders(registry, provider({ capabilities: ["workspace-runtime-status", "task-run-history"] }))).toThrow("blocked.conflicting-registration");

    const conflictingRegistry = createContextPackRegistry();
    conflictingRegistry.register({
      descriptor: { ...operationalContextPackDescriptors[0]!, label: "Altered runtime status" },
      build: () => buildWorkspaceRuntimeStatusContextPack({
        generatedAt: "2026-07-10T12:00:00.000Z", policyVersion: "operational-policy.v1", scope: { kind: "workspace", id: "ws_case_001" },
        projectionHighWaterMark: 42, sizeBudgetBytes: 16_384,
        runtimeSource: { runtimeHighWaterMark: 42, workspaceMounted: true, storageStrategy: "repo-local", bindPosture: "loopback", authPosture: "local-disabled", providerStates: [], diagnostics: [], projectionHighWaterMarks: {}, omissionCodes: [] }
      }),
      parsePayload: operationalContextPackPayloadParsers["workspace-runtime-status.v1@1"]
    });
    expect(() => registerOperationalContextPackBuilders(conflictingRegistry, provider())).toThrow("blocked.conflicting-registration");
  });

  it("registers non-empty and authoritative-empty history and memory with source proof markers and real provenance", async () => {
    const emptyProvider = provider({
      async taskRunHistorySnapshot() {
        return {
          projectionHighWaterMark: 42, projectionSourceRef: "agent.projection.task-run-history",
          tasks: [], runs: [], modelInvocations: [], toolRequests: [], aggregateCounts: { total: 0 }, sourceEventIds: [], artifactHashes: [],
          window: { order: "updatedAt:desc", limit: 25, hasMore: false, totalCount: 0, omissionCodes: [] },
          emptyProof: { projectionName: "agent.projection.task-run-history", scope: { kind: "workspace", id: "ws_case_001" }, projectionHighWaterMark: 42, sourceEventCount: 0, generatedAt: "2026-07-10T12:00:00.000Z", emptyReasonCode: "empty" }
        };
      },
      async agentMemorySnapshot() {
        return {
          projectionHighWaterMark: 42, projectionSourceRef: "agent.projection.memory", activeMemory: [], aggregateCounts: { active: 0, totalCount: 0 }, sourceEventIds: [], artifactHashes: [],
          window: { order: "createdAt:asc", limit: 25, hasMore: false, totalCount: 0, omissionCodes: [] },
          emptyProof: { projectionName: "agent.projection.memory", scope: { kind: "workspace", id: "ws_case_001" }, projectionHighWaterMark: 42, sourceEventCount: 0, generatedAt: "2026-07-10T12:00:00.000Z", emptyReasonCode: "empty" }
        };
      }
    });
    const registry = createContextPackRegistry();
    registerOperationalContextPackBuilders(registry, emptyProvider);

    const nonEmptyRegistry = createContextPackRegistry();
    registerOperationalContextPackBuilders(nonEmptyRegistry, provider());
    const nonEmptyHistory = await nonEmptyRegistry.buildResolved("task-run-history.v1");
    const nonEmptyMemory = await nonEmptyRegistry.build("agent-memory-summary.v1");
    expect(nonEmptyHistory.ref.provenanceRefs).toEqual(expect.arrayContaining(["evt_agent_task_blocked", "operational-source-proof:task-run-history.v1:event"]));
    expect(nonEmptyMemory.provenanceRefs).toEqual(expect.arrayContaining(["evt_agent_memory_recorded", "operational-source-proof:agent-memory-summary.v1:event"]));

    const emptyHistory = await registry.buildResolved("task-run-history.v1");
    const emptyMemory = await registry.build("agent-memory-summary.v1");
    expect(emptyHistory.ref.provenanceRefs).toEqual(expect.arrayContaining([
      "empty-projection:agent.projection.task-run-history:workspace:ws_case_001:hwm:42",
      "operational-source-proof:task-run-history.v1:empty-projection"
    ]));
    expect(emptyMemory.provenanceRefs).toEqual(expect.arrayContaining([
      "empty-projection:agent.projection.memory:workspace:ws_case_001:hwm:42",
      "operational-source-proof:agent-memory-summary.v1:empty-projection"
    ]));
  });

  it("builds readiness inputs from bounded async snapshots and reports a missing capability stably", async () => {
    const inputs = await buildOperationalContextPackReadinessInputs(provider());
    expect(inputs.resolvedContextPacks).toHaveLength(3);
    expect(inputs.contextPackRefs).toHaveLength(3);
    expect(inputs.descriptors).toEqual(operationalContextPackDescriptors);
    expect(inputs.blockingReasons).toEqual([]);
    expect(inputs.omissionCodes).toEqual(["omitted.out-of-scope", "omitted.raw-paths", "omitted.size-budget"]);
    expect(inputs.currentProjectionHighWaterMarks).toEqual({
      "workspace-runtime-status.v1": 42,
      "task-run-history.v1": 42,
      "agent-memory-summary.v1": 42
    });

    await expect(buildOperationalContextPackReadinessInputs(provider({ capabilities: ["workspace-runtime-status"] }))).resolves.toMatchObject({
      resolvedContextPacks: [], contextPackRefs: [], blockingReasons: ["blocked.missing-capability"]
    });
  });
});
