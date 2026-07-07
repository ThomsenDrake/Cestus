import { describe, expect, it, vi } from "vitest";
import {
  agentStatusFromJson,
  createHttpAgentAdapter,
  createStaticAgentAdapter,
  runtimeUnavailableAgentStatus
} from "../src/agent/agent-adapter.js";
import type { AgentStatusDto } from "../src/agent/agent-types.js";

describe("agent UI adapter", () => {
  it("parses agent-status.v1 and freezes browser DTOs", async () => {
    const status = agentStatusFromJson(agentStatus({
      diagnostics: [
        {
          diagnosticId: "diag_provider_unavailable",
          severity: "error",
          category: "provider",
          message: "Provider returned bearer raw-value from /tmp/secret-agent",
          allowedRepairActions: ["reload agent status"]
        }
      ]
    }));

    expect(Object.isFrozen(status)).toBe(true);
    expect(Object.isFrozen(status.providers[0])).toBe(true);
    expect(JSON.stringify(status)).not.toMatch(/raw-value|\/tmp\/secret-agent/);
    await expect(createStaticAgentAdapter(status).loadStatus()).resolves.toMatchObject({
      schemaVersion: "agent-status.v1"
    });
  });

  it("loads status from the local runtime API with a browser-safe GET request", async () => {
    const payload = agentStatus();
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    const adapter = createHttpAgentAdapter({
      baseUrl: "http://127.0.0.1:8787",
      authToken: "local-runtime-token",
      credentials: "include",
      fetcher
    });

    await expect(adapter.loadStatus()).resolves.toEqual(payload);
    expect(fetcher).toHaveBeenCalledWith("http://127.0.0.1:8787/api/agent/status", {
      credentials: "include",
      headers: { authorization: "Bearer local-runtime-token" },
      method: "GET"
    });
  });

  it("redacts unsafe runtime text", () => {
    const status = runtimeUnavailableAgentStatus({ message: "provider failed with bearer raw-value" });
    const serialized = JSON.stringify(status);

    expect(status.schemaVersion).toBe("agent-status.v1");
    expect(status.diagnostics[0]?.category).toBe("runtime");
    expect(serialized).not.toMatch(/raw-value|bearer/i);
  });

  it("maps non-2xx runtime JSON into a safe unavailable DTO", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: "provider token=abc123 at /Volumes/Cestus" } }), {
        status: 503,
        headers: { "content-type": "application/json" }
      })
    );
    const adapter = createHttpAgentAdapter({ fetcher });

    const status = await adapter.loadStatus();

    expect(status.diagnostics[0]?.severity).toBe("error");
    expect(JSON.stringify(status)).not.toMatch(/token=abc123|\/Volumes\/Cestus/);
  });
});

function agentStatus(overrides: Partial<AgentStatusDto> = {}): AgentStatusDto {
  return {
    schemaVersion: "agent-status.v1",
    generatedAt: "2026-07-07T21:00:00.000Z",
    residentAgentId: "agent_default",
    identity: {
      residentAgentId: "agent_default",
      workspaceId: "ws_case_001",
      label: "Cestus Agent",
      policyId: "agent_policy_default",
      initializedBy: "actor_case_owner",
      allowedRunTypes: ["evidence-triage"],
      memoryProjectionVersion: "0.1.0",
      eventIds: ["evt_agent_identity"],
      causationIds: []
    },
    tasks: [],
    runs: [],
    toolRequests: [],
    activeMemory: [],
    permissions: [],
    locks: [],
    providers: [
      {
        providerId: "provider_fake_local",
        label: "Fake Local Model Provider",
        adapterVersion: "fake-provider.v1",
        endpointKind: "local-engine",
        modelFamilies: ["fake-local"],
        credentialKinds: ["local-no-secret"],
        supportsStructuredOutput: false,
        supportsToolCalling: false,
        safeDataNotes: "Deterministic local fake provider for UI tests."
      }
    ],
    pendingApprovalCount: 0,
    activeLockCount: 0,
    diagnostics: [],
    ...overrides
  };
}
