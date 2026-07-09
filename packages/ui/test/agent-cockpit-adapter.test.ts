import { describe, expect, it, vi } from "vitest";
import { createHttpAgentAdapter } from "../src/agent/agent-adapter.js";

describe("agent cockpit adapter", () => {
  it("loads cockpit from the local runtime API", async () => {
    const payload = cockpitDto();
    const fetcher = vi.fn(async () =>
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
    const loadCockpit = requireMethod(adapter, "loadCockpit");

    await expect(loadCockpit()).resolves.toEqual(payload);
    expect(fetcher).toHaveBeenCalledWith("http://127.0.0.1:8787/api/agent/cockpit", {
      credentials: "include",
      headers: { authorization: "Bearer local-runtime-token" },
      method: "GET"
    });
  });

  it("loads ontology bootstrap routes through the configured runtime transport", async () => {
    const payload = ontologyBootstrapRouteDto();
    const fetcher = vi.fn(async () =>
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
    const loadOntologyBootstrapRoute = requireMethod(adapter, "loadOntologyBootstrapRoute");

    await expect(loadOntologyBootstrapRoute("run_ontology_bootstrap_route")).resolves.toEqual(payload);
    expect(fetcher).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/api/agent/specialists/ontology-bootstrap/runs/run_ontology_bootstrap_route",
      {
        credentials: "include",
        headers: { authorization: "Bearer local-runtime-token" },
        method: "GET"
      }
    );
  });

  it("creates tasks and starts runs through the safe runtime routes only", async () => {
    const fetchCalls: Array<{ readonly path: string; readonly init: RequestInit | undefined }> = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), "http://localhost").pathname;
      fetchCalls.push({ path, init });

      if (path === "/api/agent/tasks") {
        return new Response(JSON.stringify({
          ok: true,
          taskId: "task_adapter_review",
          eventIds: ["evt_task_created", "evt_task_queued"]
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      return new Response(JSON.stringify({
        ok: true,
        schemaVersion: "agent-run-start-result.v1",
        runId: "run_adapter_review",
        eventIds: ["evt_run_started"]
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });
    const adapter = createHttpAgentAdapter({ fetcher });
    const createTask = requireMethod(adapter, "createTask");
    const startRun = requireMethod(adapter, "startRun");

    await expect(createTask({
      taskId: "task_adapter_review",
      title: "Review the adapter cockpit flow",
      priority: "high",
      description: "Carry the investigator task note through the route."
    })).resolves.toEqual({
      ok: true,
      taskId: "task_adapter_review",
      eventIds: ["evt_task_created", "evt_task_queued"]
    });

    await expect(startRun({
      runId: "run_adapter_review",
      taskId: "task_adapter_review",
      runType: "evidence-triage",
      scope: { kind: "workspace", refs: ["ws_case_001"] },
      sourceEventIds: ["evt_task_created"],
      inputArtifactHashes: ["sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]
    })).resolves.toEqual({
      ok: true,
      schemaVersion: "agent-run-start-result.v1",
      runId: "run_adapter_review",
      eventIds: ["evt_run_started"]
    });

    expect(fetchCalls.map((call) => call.path)).toEqual([
      "/api/agent/tasks",
      "/api/agent/runs"
    ]);
    expect(JSON.parse(String(fetchCalls[0]?.init?.body))).toEqual({
      taskId: "task_adapter_review",
      title: "Review the adapter cockpit flow",
      priority: "high",
      description: "Carry the investigator task note through the route."
    });
    expect(JSON.parse(String(fetchCalls[1]?.init?.body))).toEqual({
      runId: "run_adapter_review",
      taskId: "task_adapter_review",
      runType: "evidence-triage",
      scope: { kind: "workspace", refs: ["ws_case_001"] },
      sourceEventIds: ["evt_task_created"],
      inputArtifactHashes: ["sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]
    });
    expect(fetchCalls.map((call) => call.path).join(" ")).not.toMatch(
      /scheduler\/wake|provider-transfer|prr|export|repair|legal|accepted-graph|legacy.*import|staging/i
    );
  });

  it("redacts unsafe runtime failures for cockpit and run routes", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input), "http://localhost").pathname;
      if (path === "/api/agent/cockpit") {
        return new Response(JSON.stringify({
          schemaVersion: "agent-cockpit.v0 sk_live_invalid",
          generatedAt: "2026-07-09T02:00:00.000Z"
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      return new Response(JSON.stringify({
        error: {
          message: "scheduler wake failed with bearer raw-value at /tmp/run-secrets and sk_live_route"
        }
      }), {
        status: 500,
        headers: { "content-type": "application/json" }
      });
    });
    const adapter = createHttpAgentAdapter({ fetcher });
    const loadCockpit = requireMethod(adapter, "loadCockpit");
    const startRun = requireMethod(adapter, "startRun");

    await expect(loadCockpit()).rejects.toThrow("Agent cockpit route returned an invalid DTO.");
    await expect(startRun({
      runId: "run_adapter_invalid",
      taskId: "task_adapter_invalid",
      runType: "evidence-triage",
      scope: { kind: "workspace", refs: ["ws_case_001"] }
    })).rejects.toThrow("[path redacted]");

    await startRun({
      runId: "run_adapter_invalid",
      taskId: "task_adapter_invalid",
      runType: "evidence-triage",
      scope: { kind: "workspace", refs: ["ws_case_001"] }
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toMatch(/bearer|raw-value|sk_live|\/tmp\/run-secrets/i);
    });
  });

  it("rejects malformed cockpit ids and safe actions instead of accepting them", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify(cockpitDto({
        taskQueue: [{
          taskId: "not_task",
          title: "Review the adapter cockpit flow",
          priority: "high",
          status: "running",
          createdAt: "2026-07-09T01:59:00.000Z",
          runId: "bad"
        }],
        needsNext: [{
          kind: "approval",
          severity: "action-required",
          label: "Review provider approval queue",
          relatedTaskId: "not_task",
          relatedRunId: "bad",
          relatedToolRequestId: "toolreq_adapter_review",
          safeAction: "Review Now"
        }]
      })), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    const adapter = createHttpAgentAdapter({ fetcher });
    const loadCockpit = requireMethod(adapter, "loadCockpit");

    await expect(loadCockpit()).rejects.toThrow("Agent cockpit route returned an invalid DTO.");
  });

  it("rejects unsafe cockpit secret-shaped text without leaking raw values", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify(cockpitDto({
        selectedRun: {
          ...cockpitDto().selectedRun,
          summary: "bearer raw-value at /tmp/cockpit-secret",
          blockedReasons: ["sk_live_blocked_reason"]
        },
        memorySnippets: [{
          memoryId: "mem_adapter_review",
          scope: "workspace",
          summary: "OPENAI_API_KEY copied into notes",
          createdAt: "2026-07-09T01:57:00.000Z",
          sourceEventIds: ["evt_memory_recorded"],
          artifactHashes: ["sha256:1111111111111111111111111111111111111111111111111111111111111111"],
          confidence: 0.6
        }]
      })), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    const adapter = createHttpAgentAdapter({ fetcher });
    const loadCockpit = requireMethod(adapter, "loadCockpit");

    await expect(loadCockpit()).rejects.toThrow("Agent cockpit route returned an invalid DTO.");
    await loadCockpit().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toMatch(/bearer|raw-value|sk_live|OPENAI_API_KEY|\/tmp\/cockpit-secret/i);
    });
  });
});

function requireMethod<T extends string>(
  adapter: object,
  methodName: T
): (...args: readonly unknown[]) => Promise<unknown> {
  const method = (adapter as Record<string, unknown>)[methodName];
  if (typeof method !== "function") {
    throw new Error(`Agent adapter does not expose ${methodName}.`);
  }

  return method.bind(adapter) as (...args: readonly unknown[]) => Promise<unknown>;
}

function cockpitDto(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    schemaVersion: "agent-cockpit.v1",
    generatedAt: "2026-07-09T02:00:00.000Z",
    summary: {
      activeTaskCount: 1,
      activeRunCount: 1,
      pendingApprovalCount: 1,
      activeLockCount: 0,
      mergeAfterScheduler: false
    },
    taskQueue: [{
      taskId: "task_adapter_review",
      title: "Review the adapter cockpit flow",
      priority: "high",
      status: "running",
      createdAt: "2026-07-09T01:59:00.000Z",
      runId: "run_adapter_review"
    }],
    runQueue: [{
      runId: "run_adapter_review",
      taskId: "task_adapter_review",
      runType: "evidence-triage",
      state: "running",
      startedAt: "2026-07-09T02:00:00.000Z",
      summary: "Processing safe evidence.",
      currentStepCount: 2,
      modelInvocationCount: 1,
      pendingApprovalCount: 1,
      blockedReasonCount: 0
    }],
    selectedRun: {
      runId: "run_adapter_review",
      taskId: "task_adapter_review",
      runType: "evidence-triage",
      state: "running",
      startedAt: "2026-07-09T02:00:00.000Z",
      summary: "Processing safe evidence.",
      currentStepCount: 2,
      modelInvocationCount: 1,
      pendingApprovalCount: 1,
      blockedReasonCount: 0,
      stepIds: ["step_review_queue"],
      pendingApprovalIds: ["toolreq_adapter_review"],
      blockedReasons: [],
      modelInvocations: [{
        invocationId: "inv_adapter_review",
        providerId: "provider_fake_local",
        modelFamily: "fake-local",
        status: "completed",
        inputArtifactHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        outputArtifactHash: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        usageSummary: "1 prompt, 1 completion",
        retryable: false
      }],
      contextPacks: [{
        contextPackId: "ctx_adapter_review",
        contentHash: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
        safeSummary: "Workspace evidence context pack.",
        generatedAt: "2026-07-09T01:58:00.000Z",
        provenanceRefs: ["evt_task_created"],
        sourceEventIds: ["evt_task_created"],
        artifactHashes: ["sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"]
      }],
      handoff: {
        state: "ready-for-human-review",
        summary: "Ready for operator review.",
        artifactHashes: ["sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"],
        relatedEventIds: ["evt_run_started"]
      }
    },
    needsNext: [{
      kind: "approval",
      severity: "action-required",
      label: "Review provider approval queue",
      relatedTaskId: "task_adapter_review",
      relatedRunId: "run_adapter_review",
      relatedToolRequestId: "toolreq_adapter_review",
      safeAction: "review"
    }],
    memorySnippets: [{
      memoryId: "mem_adapter_review",
      scope: "workspace",
      summary: "Prior operator approved the same provider preview class.",
      createdAt: "2026-07-09T01:57:00.000Z",
      sourceEventIds: ["evt_memory_recorded"],
      artifactHashes: ["sha256:1111111111111111111111111111111111111111111111111111111111111111"],
      confidence: 0.6
    }],
    forbiddenDirectEffects: [
      "provider-byte-transfer",
      "prr-send-followup",
      "export-publication",
      "destructive-repair",
      "legal-escalation",
      "lock-clearing",
      "accepted-graph-review",
      "legacy-raw-import",
      "legacy-staging-execution"
    ],
    ...overrides
  };
}

function ontologyBootstrapRouteDto() {
  return {
    schemaVersion: "agent-ontology-bootstrap-route.v1",
    generatedAt: "2026-07-09T02:05:00.000Z",
    runId: "run_ontology_bootstrap_route",
    taskId: "task_ontology_bootstrap_route",
    phase: "staging-review",
    legacyReportId: "legacy_report_001",
    reportHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    candidateSetHash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    reviewBundleHash: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
    candidateBundleCount: 2,
    candidateCount: 4,
    selectedCandidateIds: ["legacy_candidate_001"],
    blockedRequestedCandidateIds: ["legacy_candidate_missing"],
    pendingApprovalToolRequestIds: ["toolreq_ontology_bootstrap_staging_approval"],
    nextCursor: {
      currentOffset: 0,
      limit: 2,
      totalCandidates: 4,
      nextOffset: 2
    },
    nextSafeAction: {
      actionId: "bootstrap_action_approve_staging",
      label: "Review staging approval preview",
      kind: "request-tool",
      effect: "ledger-review"
    },
    runState: "running",
    outputArtifactHashes: ["sha256:3333333333333333333333333333333333333333333333333333333333333333"],
    stepIds: ["step_ontology_bootstrap_dossier"]
  };
}
