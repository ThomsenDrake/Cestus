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
import { createContextPackRegistry, serializeContextPackPayload, type BuildContextPackRefInput, type ResolvedContextPack } from "../src/context-packs.js";

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
        tasks: [],
        runs: [],
        modelInvocations: [],
        toolRequests: [],
        aggregateCounts: { tasks: 0 },
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
        activeMemory: [],
        aggregateCounts: { active: 0 },
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
    expect(() => operationalContextPackPayloadParsers["task-run-history.v1@1"]({ schemaVersion: "agent-memory-summary.v1", memory: {} })).toThrow(/task-run-history/i);
    expect(() => operationalContextPackPayloadParsers["task-run-history.v1@1"]({ schemaVersion: "task-run-history.v1", history: null })).toThrow(/task-run-history/i);
    expect(() => operationalContextPackPayloadParsers["task-run-history.v1@1"]({ schemaVersion: "task-run-history.v1", history: { tasks: [] } })).toThrow(/task-run-history/i);

    expect(operationalContextPackPayloadParsers["agent-memory-summary.v1@1"](validMemoryPayload)).toEqual(validMemoryPayload);
    expect(() => operationalContextPackPayloadParsers["agent-memory-summary.v1@1"]({
      schemaVersion: "agent-memory-summary.v1",
      memory: { ...validMemoryPayload.memory, truthBoundary: { authoritativeForOntology: true } }
    })).toThrow(/agent-memory-summary/i);
    expect(() => operationalContextPackPayloadParsers["agent-memory-summary.v1@1"]({ schemaVersion: "workspace-runtime-status.v1", runtime: {} })).toThrow(/agent-memory-summary/i);
    expect(() => operationalContextPackPayloadParsers["agent-memory-summary.v1@1"]({ schemaVersion: "agent-memory-summary.v1", memory: null })).toThrow(/agent-memory-summary/i);
    expect(() => operationalContextPackPayloadParsers["agent-memory-summary.v1@1"]({ schemaVersion: "agent-memory-summary.v1", memory: { activeMemory: [] } })).toThrow(/agent-memory-summary/i);
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
    runtimeHighWaterMark: 9,
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
        { taskId: "task_completed", state: "completed", sourceEventIds: ["evt_agent_task_completed"] },
        { taskId: "task_blocked", state: "blocked", sourceEventIds: ["evt_agent_task_blocked"] },
        { taskId: "task_pending", state: "pending", sourceEventIds: ["evt_agent_task_pending"] }
      ],
      runs: [{ runId: "run_executing", state: "executing", sourceEventIds: ["evt_agent_run_executing"] }],
      modelInvocations: [
        { invocationId: "model_failed", state: "failed", sourceEventIds: ["evt_agent_model_failed"], artifactHashes: [hash("a")] },
        { invocationId: "model_requested", state: "requested", sourceEventIds: ["evt_agent_model_requested"] }
      ],
      toolRequests: [
        { requestId: "tool_denied", state: "denied", sourceEventIds: ["evt_agent_tool_denied"], artifactHashes: [hash("b")] },
        { requestId: "tool_failed", state: "failed", sourceEventIds: ["evt_agent_tool_failed"] },
        { requestId: "tool_approved", state: "approved", sourceEventIds: ["evt_agent_tool_approved"] },
        { requestId: "tool_queued", state: "queued", sourceEventIds: ["evt_agent_tool_queued"] },
        { requestId: "tool_running", state: "running", sourceEventIds: ["evt_agent_tool_running"] }
      ],
      aggregateCounts: { total: 10 },
      sourceEventIds: [
        "evt_agent_task_completed",
        "evt_agent_task_blocked",
        "evt_agent_tool_denied",
        "evt_agent_tool_failed",
        "evt_agent_model_failed"
      ],
      artifactHashes: [hash("a"), hash("b")],
      window: { order: "updatedAt:desc", limit: 25, cursor: "cursor_001", hasMore: false, totalCount: 10, omissionCodes: [] },
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
        { kind: "runtime-high-water-mark", ref: "runtime.status", value: "9" },
        { kind: "omission-code", ref: "runtime.status", value: "omitted.raw-paths" },
        { kind: "omission-code", ref: "runtime.status", value: "omitted.raw-provider-errors" }
      ])
    });
    expect(first.ref.sizeBytes).toBe(serializeContextPackPayload(first.payload).byteLength);
    expect(first.payload).toMatchObject({ schemaVersion: "workspace-runtime-status.v1", runtime: runtimeSource });
    expect(first.ref.provenanceRefs).toEqual(["diag_runtime_001", "operational-source-proof:workspace-runtime-status.v1:event", "runtime.status:hwm:9"]);
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
      tasks: [{ taskId: "task_one", state: "completed" }],
      runs: [{ runId: "run_one", state: "running" }],
      modelInvocations: [{ invocationId: "model_one", state: "requested" }],
      toolRequests: [{ requestId: "tool_one", state: "approved" }],
      window: { order: "updatedAt:desc", limit: 1, hasMore: true, totalCount: 4, omissionCodes: [] }
    });

    expect(() => buildTaskRunHistoryContextPack({ ...sharedInput, taskRunHistorySnapshot: snapshot })).toThrow("blocked.unbounded-source");
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
      historySnapshot({ tasks: [{ taskId: "task_one", state: "completed", rawValue: "raw model output" }], runs: [], modelInvocations: [], toolRequests: [] }),
      historySnapshot({ tasks: [], runs: [{ runId: "run_one", state: "running", credentials: "opaque" }], modelInvocations: [], toolRequests: [] }),
      historySnapshot({ tasks: [], runs: [], modelInvocations: [{ invocationId: "model_one", state: "failed", output: "neutral raw output" }], toolRequests: [] }),
      historySnapshot({ tasks: [], runs: [], modelInvocations: [], toolRequests: [{ requestId: "tool_one", state: "failed", result: "raw tool output" }] })
    ];
    for (const taskRunHistorySnapshot of unsafeSnapshots) {
      expect(() => buildTaskRunHistoryContextPack({ ...sharedInput, taskRunHistorySnapshot })).toThrow("blocked.invalid-payload-shape");
    }

    const proseCategorySnapshots = [
      historySnapshot({ tasks: [{ taskId: "task_one", state: "completed", category: "human readable task failure" }], runs: [], modelInvocations: [], toolRequests: [] }),
      historySnapshot({ tasks: [], runs: [{ runId: "run_one", state: "running", category: "human readable run failure" }], modelInvocations: [], toolRequests: [] }),
      historySnapshot({ tasks: [], runs: [], modelInvocations: [{ invocationId: "model_one", state: "failed", category: "human readable model failure" }], toolRequests: [] }),
      historySnapshot({ tasks: [], runs: [], modelInvocations: [], toolRequests: [{ requestId: "tool_one", state: "failed", category: "human readable tool failure" }] })
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
  });

  it("keeps bounded snapshot output independent of unrelated historical total growth", () => {
    const window = { order: "updatedAt:desc", limit: 3, cursor: "cursor_50k", hasMore: true, totalCount: 50_000, omissionCodes: ["omitted.out-of-scope"] as const };
    const snapshot = historySnapshot({
      tasks: [{ taskId: "task_recent", state: "completed" }], runs: [], modelInvocations: [], toolRequests: [],
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
        { taskId: `task_completed_${"x".repeat(1_000)}`, state: "completed" },
        { taskId: "task_blocked", state: "blocked" },
        { taskId: "task_pending", state: "pending" }
      ],
      runs: [], modelInvocations: [], toolRequests: []
    });
    const trimmed = buildTaskRunHistoryContextPack({ ...sharedInput, sizeBudgetBytes: 1_200, taskRunHistorySnapshot: snapshot });
    const tasks = (trimmed.payload as { history: { tasks: readonly { state: string }[] } }).history.tasks;
    expect(tasks.map((task) => task.state)).toEqual(expect.arrayContaining(["blocked", "pending"]));
    expect(tasks.map((task) => task.state)).not.toContain("completed");
    expect(() => buildTaskRunHistoryContextPack({ ...sharedInput, sizeBudgetBytes: 1, taskRunHistorySnapshot: snapshot })).toThrow("blocked.size-budget");
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
          runtimeHighWaterMark: 9,
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
          tasks: [{ taskId: "task_blocked", state: "blocked", sourceEventIds: ["evt_agent_task_blocked"] }],
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
            memoryId: "mem_current", scope: "workspace", memoryKind: "working-note", summary: "Current bounded memory.",
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
        runtimeSource: { runtimeHighWaterMark: 9, workspaceMounted: true, storageStrategy: "repo-local", bindPosture: "loopback", authPosture: "local-disabled", providerStates: [], diagnostics: [], projectionHighWaterMarks: {}, omissionCodes: [] }
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
      "workspace-runtime-status.v1": 9,
      "task-run-history.v1": 42,
      "agent-memory-summary.v1": 42
    });

    await expect(buildOperationalContextPackReadinessInputs(provider({ capabilities: ["workspace-runtime-status"] }))).resolves.toMatchObject({
      resolvedContextPacks: [], contextPackRefs: [], blockingReasons: ["blocked.missing-capability"]
    });
  });
});
