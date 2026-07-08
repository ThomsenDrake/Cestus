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
    const status = runtimeUnavailableAgentStatus({
      message: "provider failed with bearer raw-value, sk-live-runtime, sk_live_runtime, ghp_runtime, OPENAI_API_KEY, DATABASE_PASSWORD, and GOOGLE_APPLICATION_CREDENTIALS"
    });
    const serialized = JSON.stringify(status);

    expect(status.schemaVersion).toBe("agent-status.v1");
    expect(status.diagnostics[0]?.category).toBe("runtime");
    expect(serialized).not.toMatch(
      /raw-value|bearer|sk-live|sk_live|ghp_|OPENAI_API_KEY|DATABASE_PASSWORD|GOOGLE_APPLICATION_CREDENTIALS/i
    );
  });

  it("recursively redacts credential-shaped provider diagnostics and memory text before parsing", async () => {
    const unsafeStatus = agentStatus({
      providers: [
        {
          providerId: "provider_openai",
          label: "OpenAI fallback sk-live-provider",
          adapterVersion: "openai-adapter.v1",
          endpointKind: "openai-api",
          modelFamilies: ["gpt-4.1 sk_live_model", "github ghp_model"],
          credentialKinds: ["api-key-bearer"],
          supportsStructuredOutput: true,
          supportsToolCalling: true,
          safeDataNotes: "Loaded through OPENAI_API_KEY, DATABASE_PASSWORD, GOOGLE_APPLICATION_CREDENTIALS, and ghp_notes."
        }
      ],
      tasks: [
        {
          taskId: "task_database_password",
          residentAgentId: "agent_default",
          title: "Review DATABASE_PASSWORD and GOOGLE_APPLICATION_CREDENTIALS exposure",
          requestedBy: "actor_case_owner",
          priority: "normal",
          status: "queued",
          createdAt: "2026-07-07T21:03:00.000Z",
          sourceEventIds: ["evt_database_password"],
          inputArtifactHashes: [],
          eventIds: ["evt_google_application_credentials"],
          causationIds: []
        }
      ],
      diagnostics: [
        {
          diagnosticId: "diag_provider_secret",
          severity: "error",
          category: "credential",
          message: "Provider echoed sk-live-diagnostic, sk_live_diagnostic, ghp_diagnostic, OPENAI_API_KEY, DATABASE_PASSWORD, and GOOGLE_APPLICATION_CREDENTIALS.",
          allowedRepairActions: ["rotate OPENAI_API_KEY", "rotate DATABASE_PASSWORD", "remove GOOGLE_APPLICATION_CREDENTIALS", "remove ghp_repair"]
        }
      ],
      activeMemory: [
        {
          memoryId: "mem_provider_secret",
          residentAgentId: "agent_default",
          scope: "provider",
          summary: "Do not remember sk-live-memory, sk_live_memory, ghp_memory, OPENAI_API_KEY, DATABASE_PASSWORD, or GOOGLE_APPLICATION_CREDENTIALS.",
          sourceEventIds: ["evt_memory_secret"],
          artifactHashes: [],
          confidence: 0.8,
          createdAt: "2026-07-07T21:02:00.000Z",
          state: "active",
          eventIds: ["evt_memory_recorded"],
          causationIds: []
        }
      ]
    });

    const parsed = agentStatusFromJson(unsafeStatus);
    const loaded = await createStaticAgentAdapter(unsafeStatus).loadStatus();

    expect(JSON.stringify(parsed)).not.toMatch(
      /sk-live|sk_live|ghp_|OPENAI_API_KEY|DATABASE_PASSWORD|GOOGLE_APPLICATION_CREDENTIALS/i
    );
    expect(JSON.stringify(loaded)).not.toMatch(
      /sk-live|sk_live|ghp_|OPENAI_API_KEY|DATABASE_PASSWORD|GOOGLE_APPLICATION_CREDENTIALS/i
    );
    expect(loaded.providers[0]?.credentialKinds).toStrictEqual(["api-key-bearer"]);
  });

  it("rejects non-canonical failure and approval enum values", () => {
    expect(() =>
      agentStatusFromJson({
        ...agentStatus(),
        runs: [
          {
            ...agentRun(),
            failureCategory: "network-timeout"
          }
        ]
      })
    ).toThrow();

    expect(() =>
      agentStatusFromJson({
        ...agentStatus(),
        toolRequests: [
          {
            ...agentToolRequest(),
            failureCategory: "runtime-crash"
          }
        ]
      })
    ).toThrow();
  });

  it("accepts future approval identifiers in status tool requests", () => {
    const futureApprovalStatus: AgentStatusDto = {
      ...agentStatus(),
      toolRequests: [
        {
          ...agentToolRequest(),
          requiredApprovalClass: "evidence-retention-review",
          approvalClass: "evidence-retention-review"
        }
      ]
    };

    const parsed = agentStatusFromJson(futureApprovalStatus);

    expect(parsed.toolRequests[0]?.requiredApprovalClass).toBe("evidence-retention-review");
    expect(parsed.toolRequests[0]?.approvalClass).toBe("evidence-retention-review");
  });

  it.each(["none", "human-review"])(
    "rejects sentinel approval identifiers in status tool requests: %s",
    (approvalClass) => {
      expect(() =>
        agentStatusFromJson({
          ...agentStatus(),
          toolRequests: [
            {
              ...agentToolRequest(),
              requiredApprovalClass: approvalClass
            }
          ]
        })
      ).toThrow();

      expect(() =>
        agentStatusFromJson({
          ...agentStatus(),
          toolRequests: [
            {
              ...agentToolRequest(),
              approvalClass
            }
          ]
        })
      ).toThrow();
    }
  );

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

function agentRun() {
  return {
    runId: "run_provider_review",
    residentAgentId: "agent_default",
    runType: "evidence-triage",
    state: "failed",
    startedBy: "actor_case_owner",
    startedAt: "2026-07-07T21:00:10.000Z",
    sourceEventIds: ["evt_task_created"],
    inputArtifactHashes: [],
    relatedEventIds: [],
    outputArtifactHashes: [],
    stepIds: [],
    invocationIds: [],
    toolRequestIds: [],
    failedAt: "2026-07-07T21:01:00.000Z",
    failureCategory: "provider-unavailable",
    failureMessage: "Provider unavailable.",
    retryable: true,
    allowedActions: [],
    eventIds: ["evt_run_failed"],
    causationIds: ["evt_run_started"]
  };
}

function agentToolRequest(): AgentStatusDto["toolRequests"][number] {
  return {
    toolRequestId: "toolreq_provider_preview",
    runId: "run_provider_review",
    toolId: "provider.parse.preview",
    toolVersion: "1",
    requestedBy: "actor_cestus_agent",
    sideEffectClass: "external-byte-transfer",
    requiredApprovalClass: "provider-byte-transfer",
    previewHash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    scope: "workspace",
    estimatedEffect: "Provider byte transfer preview.",
    state: "failed",
    requestedAt: "2026-07-07T21:01:00.000Z",
    sourceEventIds: ["evt_task_created"],
    inputArtifactHashes: [],
    approvedBy: "actor_case_owner",
    approvedPreviewHash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    approvalClass: "provider-byte-transfer",
    approvalRationale: "Approved preview.",
    approvedAt: "2026-07-07T21:02:00.000Z",
    resultEventIds: [],
    artifactHashes: [],
    readModelChanges: [],
    failedAt: "2026-07-07T21:03:00.000Z",
    failureCategory: "external-effect-failed",
    failureMessage: "Provider transfer failed.",
    retryable: false,
    allowedActions: [],
    eventIds: ["evt_tool_failed"],
    causationIds: ["evt_tool_requested"]
  };
}
