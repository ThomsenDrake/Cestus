import { describe, expect, it } from "vitest";
import {
  assertOperationalContextPackProviderMetadata,
  operationalContextPackDescriptors,
  operationalContextPackPayloadParsers,
  operationalContextPackProviderRegistrationKey,
  type OperationalAgentMemorySnapshot,
  type OperationalContextPackBuilderResult,
  type OperationalContextPackProvider,
  type OperationalTaskRunHistorySnapshot,
  type OperationalWorkspaceRuntimeSource
} from "../src/operational-context-packs.js";
import type { BuildContextPackRefInput, ResolvedContextPack } from "../src/context-packs.js";

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
    expect(operationalContextPackDescriptors.find((descriptor) => descriptor.contextPackId === "workspace-runtime-status.v1")?.requiredProvenanceKinds).toContain("event-id");
    for (const descriptor of operationalContextPackDescriptors.slice(1)) {
      expect(descriptor.requiredProvenanceKinds).toEqual(expect.arrayContaining(["event-id", "empty-projection"]));
    }
  });

  it("derives a deterministic, secret-safe registration key independent of capability order", () => {
    const reversed = { ...providerMetadata, capabilities: [...providerMetadata.capabilities].reverse() };
    const expected = "operational-context-packs:local_workspace_provider:operational-policy.v1:workspace:ws_case_001:agent-memory-summary,task-run-history,workspace-runtime-status";

    expect(operationalContextPackProviderRegistrationKey(providerMetadata)).toBe(expected);
    expect(operationalContextPackProviderRegistrationKey(reversed)).toBe(expected);
  });

  it("rejects unsafe provider metadata, empty capabilities, and unknown capabilities", () => {
    expect(() => assertOperationalContextPackProviderMetadata({ ...providerMetadata, scope: { kind: "workspace", id: "/home/drake/private/workspace" } })).toThrow(/safe|scope/i);
    expect(() => assertOperationalContextPackProviderMetadata({ ...providerMetadata, providerId: "provider failed with raw provider error" })).toThrow(/safe/i);
    expect(() => assertOperationalContextPackProviderMetadata({ ...providerMetadata, policyVersion: "Bearer secret-value" })).toThrow(/safe/i);
    expect(() => assertOperationalContextPackProviderMetadata({ ...providerMetadata, capabilities: [] })).toThrow(/capabilit/i);
    expect(() => assertOperationalContextPackProviderMetadata({ ...providerMetadata, capabilities: ["unknown-capability"] as never })).toThrow(/capabilit/i);
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
    expect(Object.keys(operationalContextPackPayloadParsers).sort()).toEqual([
      "agent-memory-summary.v1@1",
      "task-run-history.v1@1",
      "workspace-runtime-status.v1@1"
    ]);
    expect(JSON.stringify(operationalContextPackDescriptors)).not.toContain("parsePayload");

    expect(operationalContextPackPayloadParsers["workspace-runtime-status.v1@1"]({ schemaVersion: "workspace-runtime-status.v1", runtime: {} })).toEqual({ schemaVersion: "workspace-runtime-status.v1", runtime: {} });
    expect(() => operationalContextPackPayloadParsers["workspace-runtime-status.v1@1"]({ schemaVersion: "task-run-history.v1", history: {} })).toThrow(/workspace-runtime-status/i);
    expect(operationalContextPackPayloadParsers["task-run-history.v1@1"]({ schemaVersion: "task-run-history.v1", history: {} })).toEqual({ schemaVersion: "task-run-history.v1", history: {} });
    expect(() => operationalContextPackPayloadParsers["task-run-history.v1@1"]({ schemaVersion: "agent-memory-summary.v1", memory: {} })).toThrow(/task-run-history/i);
    expect(operationalContextPackPayloadParsers["agent-memory-summary.v1@1"]({ schemaVersion: "agent-memory-summary.v1", memory: {} })).toEqual({ schemaVersion: "agent-memory-summary.v1", memory: {} });
    expect(() => operationalContextPackPayloadParsers["agent-memory-summary.v1@1"]({ schemaVersion: "workspace-runtime-status.v1", runtime: {} })).toThrow(/agent-memory-summary/i);
  });
});
