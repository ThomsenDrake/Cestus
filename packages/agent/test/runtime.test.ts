import { describe, expect, it } from "vitest";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import {
  FakeModelProvider,
  buildContextPackRef,
  buildPromptArtifact,
  createAgentRuntime,
  type ModelInvocationRequest,
  type ModelInvocationResult,
  type ModelProviderAdapter,
  type PromptArtifactEnvelope,
  type ProviderDescriptor
} from "../src/index.js";

const humanActor = { id: "actor_case_owner", kind: "human" as const, label: "Case Owner" };
const fixedNow = () => "2026-07-07T19:00:00.000Z";
const inputArtifactHash = "sha256:4444444444444444444444444444444444444444444444444444444444444444";
const providerOutputArtifactHash = "sha256:7777777777777777777777777777777777777777777777777777777777777777";

describe("agent runtime core", () => {
  it("initializes a default resident identity and creates durable tasks", async () => {
    const ledger = new InMemoryEventLedger();
    const runtime = createAgentRuntime({ ledger, actor: humanActor, now: fixedNow });

    await runtime.initializeDefaultIdentity({ workspaceId: "ws_case_001" });
    const task = await runtime.createTask({
      taskId: "task_foundation_status",
      title: "Summarize resident status",
      requestedBy: humanActor.id,
      priority: "normal"
    });

    expect(task.ok).toBe(true);
    expect((await runtime.status()).identity?.residentAgentId).toBe("agent_default");
    expect((await runtime.status()).tasks.map((item) => item.taskId)).toContain("task_foundation_status");
  });

  it("does not append a second default identity", async () => {
    const ledger = new InMemoryEventLedger();
    const runtime = createAgentRuntime({ ledger, actor: humanActor, now: fixedNow });

    await runtime.initializeDefaultIdentity({ workspaceId: "ws_case_001" });
    await runtime.initializeDefaultIdentity({ workspaceId: "ws_case_001" });

    expect((await ledger.readAll()).filter((event) => event.type === "agent.identity.initialized")).toHaveLength(1);
  });

  it("keeps status read-only and rebuilt from ledger events", async () => {
    const ledger = new InMemoryEventLedger();
    const runtime = createAgentRuntime({ ledger, actor: humanActor, now: fixedNow });

    await runtime.initializeDefaultIdentity({ workspaceId: "ws_case_001" });
    const beforeStatus = await ledger.readAll();
    const status = await runtime.status();
    const afterStatus = await ledger.readAll();

    expect(status.schemaVersion).toBe("agent-status.v1");
    expect(afterStatus).toHaveLength(beforeStatus.length);
    expect(status.identity?.workspaceId).toBe("ws_case_001");
  });

  it("keeps memory reads read-only and rebuilt from ledger events", async () => {
    const ledger = new InMemoryEventLedger();
    const runtime = createAgentRuntime({ ledger, actor: humanActor, now: fixedNow });

    await runtime.initializeDefaultIdentity({ workspaceId: "ws_case_001" });
    await runtime.recordMemory({
      memoryId: "mem_runtime_read_only",
      scope: "workspace",
      memoryKind: "agent-observation",
      summary: "Working memory must stay a read-only projection surface.",
      sourceEventIds: ["evt_agent_task_created_runtime"],
      confidence: 0.75
    });
    const beforeReads = await ledger.readAll();
    const list = await runtime.listMemory({ state: "active" });
    const detail = await runtime.memoryDetail("mem_runtime_read_only");
    const afterReads = await ledger.readAll();

    expect(afterReads).toHaveLength(beforeReads.length);
    expect(list.items.map((item) => item.memoryId)).toEqual(["mem_runtime_read_only"]);
    expect(detail?.memory.memoryId).toBe("mem_runtime_read_only");
  });

  it("invokes fake providers through resident-agent events only", async () => {
    const ledger = new InMemoryEventLedger();
    const runtime = createAgentRuntime({
      ledger,
      actor: humanActor,
      now: fixedNow,
      providers: [
        new FakeModelProvider({
          providerId: "provider_fake_local",
          modelFamilies: ["fake-local"],
          responseText: "fake response"
        })
      ]
    });

    await runtime.initializeDefaultIdentity({ workspaceId: "ws_case_001" });
    await runtime.createTask({ taskId: "task_fake_model", title: "Run fake model", requestedBy: humanActor.id, priority: "normal" });
    await runtime.startRun({
      runId: "run_fake_model",
      taskId: "task_fake_model",
      runType: "evidence-triage",
      scope: { kind: "workspace", refs: ["ws_case_001"] }
    });
    const result = await runtime.invokeModel({
      invocationId: "inv_fake_model",
      runId: "run_fake_model",
      providerId: "provider_fake_local",
      modelFamily: "fake-local",
      inputArtifactHash,
      credentialRef: { credentialRefId: "agent_credref_local", providerId: "provider_fake_local", kind: "local-no-secret" }
    });

    expect(result.ok).toBe(true);
    expect((await ledger.readAll()).map((event) => event.type)).toContain("agent.model-invocation.completed");
    expect((await ledger.readAll()).some((event) => event.type === "assertion.accepted")).toBe(false);
  });

  it("records inspectable model failures for missing providers", async () => {
    const ledger = new InMemoryEventLedger();
    const runtime = await createPreparedRuntime(ledger);

    const result = await runtime.invokeModel({
      invocationId: "inv_missing_provider",
      runId: "run_fake_model",
      providerId: "provider_missing",
      modelFamily: "fake-local",
      inputArtifactHash,
      credentialRef: { credentialRefId: "agent_credref_local", providerId: "provider_missing", kind: "local-no-secret" }
    });

    expect(result).toMatchObject({ ok: false, error: { category: "provider", severity: "error" } });
    expect((await ledger.readAll()).map((event) => event.type)).toContain("agent.model-invocation.failed");
  });

  it("records unsupported model families as safe provider failures", async () => {
    const ledger = new InMemoryEventLedger();
    const runtime = await createPreparedRuntime(ledger, [
      new FakeModelProvider({ providerId: "provider_fake_local", modelFamilies: ["fake-local"], responseText: "fake response" })
    ]);

    const result = await runtime.invokeModel({
      invocationId: "inv_unsupported_model",
      runId: "run_fake_model",
      providerId: "provider_fake_local",
      modelFamily: "other-local",
      inputArtifactHash,
      credentialRef: { credentialRefId: "agent_credref_local", providerId: "provider_fake_local", kind: "local-no-secret" }
    });

    expect(result).toMatchObject({ ok: false, error: { category: "provider", severity: "error" } });
    expect((await ledger.readAll()).map((event) => event.type)).toContain("agent.model-invocation.failed");
  });

  it("records unsafe credential references as redacted credential failures", async () => {
    const ledger = new InMemoryEventLedger();
    const runtime = await createPreparedRuntime(ledger, [
      new FakeModelProvider({ providerId: "provider_fake_local", modelFamilies: ["fake-local"], responseText: "fake response" })
    ]);

    const result = await runtime.invokeModel({
      invocationId: "inv_unsafe_auth",
      runId: "run_fake_model",
      providerId: "provider_fake_local",
      modelFamily: "fake-local",
      inputArtifactHash,
      credentialRef: {
        credentialRefId: "agent_credref_local",
        providerId: "provider_fake_local",
        kind: "local-no-secret",
        safeLabel: "api key sk-live-value"
      }
    });

    const ledgerJson = JSON.stringify(await ledger.readAll());
    expect(result).toMatchObject({ ok: false, error: { category: "credential", severity: "error" } });
    expect(ledgerJson).toContain("agent.model-invocation.failed");
    expect(ledgerJson).not.toContain("sk-live-value");
  });

  it("redacts raw provider failures before returning or appending diagnostics", async () => {
    const ledger = new InMemoryEventLedger();
    const runtime = await createPreparedRuntime(ledger, [new ThrowingProvider()]);

    const result = await runtime.invokeModel({
      invocationId: "inv_provider_failure",
      runId: "run_fake_model",
      providerId: "provider_throwing_local",
      modelFamily: "fake-local",
      inputArtifactHash,
      credentialRef: { credentialRefId: "agent_credref_local", providerId: "provider_throwing_local", kind: "local-no-secret" }
    });

    const resultJson = JSON.stringify(result);
    const ledgerJson = JSON.stringify(await ledger.readAll());
    expect(result).toMatchObject({ ok: false, error: { category: "provider", severity: "error" } });
    expect(resultJson).not.toContain("sk-live-value");
    expect(ledgerJson).toContain("agent.model-invocation.failed");
    expect(ledgerJson).not.toContain("sk-live-value");
  });

  it("omits unsafe provider descriptors from status without leaking descriptor text", async () => {
    const ledger = new InMemoryEventLedger();
    const runtime = createAgentRuntime({
      ledger,
      actor: humanActor,
      now: fixedNow,
      providers: [new UnsafeDescriptorProvider()]
    });

    const status = await runtime.status();
    const statusJson = JSON.stringify(status);

    expect(status.providers).toEqual([]);
    expect(status.diagnostics).toEqual([
      expect.objectContaining({
        severity: "error",
        category: "provider",
        message: "Provider descriptor was rejected."
      })
    ]);
    expect(statusJson).not.toContain("OPENAI_API_KEY");
    expect(statusJson).not.toContain("sk-live-value");
  });

  it("records malformed provider output as a safe model failure", async () => {
    const ledger = new InMemoryEventLedger();
    const runtime = await createPreparedRuntime(ledger, [new MalformedOutputProvider()]);

    const result = await runtime.invokeModel({
      invocationId: "inv_malformed_output",
      runId: "run_fake_model",
      providerId: "provider_malformed_local",
      modelFamily: "fake-local",
      inputArtifactHash,
      credentialRef: { credentialRefId: "agent_credref_local", providerId: "provider_malformed_local", kind: "local-no-secret" }
    });

    const ledgerJson = JSON.stringify(await ledger.readAll());
    expect(result).toMatchObject({ ok: false, error: { category: "provider", severity: "error" } });
    expect((await ledger.readAll()).map((event) => event.type)).toContain("agent.model-invocation.failed");
    expect((await ledger.readAll()).map((event) => event.type)).not.toContain("agent.model-invocation.completed");
    expect(ledgerJson).not.toContain("sk-live-value");
  });

  it("sanitizes successful provider usage before returning result payloads", async () => {
    const ledger = new InMemoryEventLedger();
    const runtime = await createPreparedRuntime(ledger, [new UsageMetadataProvider()]);

    const result = await runtime.invokeModel({
      invocationId: "inv_usage_metadata",
      runId: "run_fake_model",
      providerId: "provider_usage_local",
      modelFamily: "fake-local",
      inputArtifactHash,
      credentialRef: { credentialRefId: "agent_credref_local", providerId: "provider_usage_local", kind: "local-no-secret" }
    });

    const resultJson = JSON.stringify(result);
    const ledgerJson = JSON.stringify(await ledger.readAll());
    expect(result).toMatchObject({ ok: true, usage: { inputUnits: 7, outputUnits: 11 } });
    expect(result.ok && Object.keys(result.usage ?? {})).toEqual(["inputUnits", "outputUnits"]);
    expect(resultJson).not.toContain("sk-live-value");
    expect(ledgerJson).toContain("agent.model-invocation.completed");
    expect(ledgerJson).not.toContain("sk-live-value");
  });

  it("can return safe provider output text for local structured workflow parsing without appending it", async () => {
    const ledger = new InMemoryEventLedger();
    const runtime = await createPreparedRuntime(ledger, [
      new FakeModelProvider({
        providerId: "provider_fake_local",
        modelFamilies: ["fake-local"],
        responseText: "{\"summary\":\"safe structured output\"}"
      })
    ]);

    const result = await runtime.invokeModel({
      invocationId: "inv_structured_output",
      runId: "run_fake_model",
      providerId: "provider_fake_local",
      modelFamily: "fake-local",
      inputArtifactHash,
      credentialRef: { credentialRefId: "agent_credref_local", providerId: "provider_fake_local", kind: "local-no-secret" },
      returnOutputText: true
    });

    const ledgerJson = JSON.stringify(await ledger.readAll());
    expect(result).toMatchObject({ ok: true, outputText: "{\"summary\":\"safe structured output\"}" });
    expect(ledgerJson).toContain("agent.model-invocation.completed");
    expect(ledgerJson).not.toContain("safe structured output");
  });

  it("refuses captured provider output text that is not secret-safe", async () => {
    const ledger = new InMemoryEventLedger();
    const runtime = await createPreparedRuntime(ledger, [
      new FakeModelProvider({
        providerId: "provider_fake_local",
        modelFamilies: ["fake-local"],
        responseText: "api key sk-live-value"
      })
    ]);

    const result = await runtime.invokeModel({
      invocationId: "inv_unsafe_structured_output",
      runId: "run_fake_model",
      providerId: "provider_fake_local",
      modelFamily: "fake-local",
      inputArtifactHash,
      credentialRef: { credentialRefId: "agent_credref_local", providerId: "provider_fake_local", kind: "local-no-secret" },
      returnOutputText: true
    });

    const events = await ledger.readAll();
    const ledgerJson = JSON.stringify(events);
    expect(result).toMatchObject({ ok: false, error: { category: "provider", severity: "error" } });
    expect(events.map((event) => event.type)).toContain("agent.model-invocation.failed");
    expect(events.map((event) => event.type)).not.toContain("agent.model-invocation.completed");
    expect(JSON.stringify(result)).not.toContain("sk-live-value");
    expect(ledgerJson).not.toContain("sk-live-value");
  });

  it("records accessor-backed provider result validation failures safely", async () => {
    const ledger = new InMemoryEventLedger();
    const runtime = await createPreparedRuntime(ledger, [new AccessorThrowingResultProvider()]);

    const result = await runtime.invokeModel({
      invocationId: "inv_accessor_result",
      runId: "run_fake_model",
      providerId: "provider_accessor_local",
      modelFamily: "fake-local",
      inputArtifactHash,
      credentialRef: { credentialRefId: "agent_credref_local", providerId: "provider_accessor_local", kind: "local-no-secret" }
    });

    const resultJson = JSON.stringify(result);
    const ledgerJson = JSON.stringify(await ledger.readAll());
    expect(result).toMatchObject({ ok: false, error: { category: "provider", severity: "error" } });
    expect(resultJson).not.toContain("OPENAI_API_KEY");
    expect(resultJson).not.toContain("raw-secret");
    expect(ledgerJson).toContain("agent.model-invocation.failed");
    expect(ledgerJson).not.toContain("OPENAI_API_KEY");
    expect(ledgerJson).not.toContain("raw-secret");
  });

  it("refuses remote provider invocation without a prompt artifact before calling the provider", async () => {
    const ledger = new InMemoryEventLedger();
    const remoteProvider = new CountingRemoteProvider();
    const runtime = await createPreparedRuntime(ledger, [remoteProvider]);

    const result = await runtime.invokeModel({
      invocationId: "inv_remote_no_prompt_artifact",
      runId: "run_fake_model",
      providerId: "provider_remote_model",
      modelFamily: "remote-safe",
      inputArtifactHash,
      safetyClass: "provider-approved",
      credentialRef: remoteCredentialRef()
    });

    expect(result).toMatchObject({ ok: false, error: { category: "runtime", severity: "error" } });
    expect(remoteProvider.calls).toHaveLength(0);
    expect(modelFailurePayloads(await ledger.readAll())).toContainEqual(
      expect.objectContaining({ category: "provenance-missing" })
    );
  });

  it("refuses remote provider invocation with a mismatched prompt artifact hash", async () => {
    const ledger = new InMemoryEventLedger();
    const remoteProvider = new CountingRemoteProvider();
    const runtime = await createPreparedRuntime(ledger, [remoteProvider]);
    const promptArtifact = providerApprovedPromptArtifact();

    const result = await runtime.invokeModel({
      invocationId: "inv_remote_hash_mismatch",
      runId: "run_fake_model",
      providerId: "provider_remote_model",
      modelFamily: "remote-safe",
      inputArtifactHash,
      safetyClass: "provider-approved",
      credentialRef: remoteCredentialRef(),
      promptArtifact
    } as Parameters<typeof runtime.invokeModel>[0]);

    expect(promptArtifact.manifest.inputArtifactHash).not.toBe(inputArtifactHash);
    expect(result).toMatchObject({ ok: false, error: { category: "runtime", severity: "error" } });
    expect(remoteProvider.calls).toHaveLength(0);
    expect(modelFailurePayloads(await ledger.readAll())).toContainEqual(
      expect.objectContaining({ category: "provenance-missing" })
    );
  });

  it("refuses remote provider invocation with a local-only prompt artifact", async () => {
    const ledger = new InMemoryEventLedger();
    const remoteProvider = new CountingRemoteProvider();
    const runtime = await createPreparedRuntime(ledger, [remoteProvider]);
    const promptArtifact = localOnlyPromptArtifact();

    const result = await runtime.invokeModel({
      invocationId: "inv_remote_local_only_artifact",
      runId: "run_fake_model",
      providerId: "provider_remote_model",
      modelFamily: "remote-safe",
      inputArtifactHash: promptArtifact.manifest.inputArtifactHash,
      safetyClass: "sensitive-local-only",
      credentialRef: remoteCredentialRef(),
      promptArtifact
    } as Parameters<typeof runtime.invokeModel>[0]);

    expect(result).toMatchObject({ ok: false, error: { category: "policy", severity: "error" } });
    expect(remoteProvider.calls).toHaveLength(0);
    expect(modelFailurePayloads(await ledger.readAll())).toContainEqual(
      expect.objectContaining({ category: "permission-denied" })
    );
  });

  it("refuses unsafe prompt artifacts with secret-detected before calling the provider", async () => {
    const ledger = new InMemoryEventLedger();
    const remoteProvider = new CountingRemoteProvider();
    const runtime = await createPreparedRuntime(ledger, [remoteProvider]);
    const promptArtifact = unsafePromptArtifact();

    const result = await runtime.invokeModel({
      invocationId: "inv_remote_unsafe_artifact",
      runId: "run_fake_model",
      providerId: "provider_remote_model",
      modelFamily: "remote-safe",
      inputArtifactHash: promptArtifact.manifest.inputArtifactHash,
      safetyClass: "provider-approved",
      credentialRef: remoteCredentialRef(),
      promptArtifact
    });

    expect(result).toMatchObject({ ok: false, error: { category: "runtime", severity: "error" } });
    expect(remoteProvider.calls).toHaveLength(0);
    expect(modelFailurePayloads(await ledger.readAll())).toContainEqual(
      expect.objectContaining({ category: "secret-detected" })
    );
  });

  it("records prompt artifact audit metadata and passes validated artifact text to remote providers", async () => {
    const ledger = new InMemoryEventLedger();
    const remoteProvider = new CountingRemoteProvider();
    const runtime = await createPreparedRuntime(ledger, [remoteProvider]);
    const promptArtifact = providerApprovedPromptArtifact();

    const result = await runtime.invokeModel({
      invocationId: "inv_remote_prompt_audit",
      runId: "run_fake_model",
      providerId: "provider_remote_model",
      modelFamily: "remote-safe",
      inputArtifactHash: promptArtifact.manifest.inputArtifactHash,
      safetyClass: "provider-approved",
      credentialRef: remoteCredentialRef(),
      promptArtifact
    } as Parameters<typeof runtime.invokeModel>[0]);

    const events = await ledger.readAll();
    const requestedPayload = modelRequestedPayloads(events).find((payload) => payload.invocationId === "inv_remote_prompt_audit");
    const ledgerJson = JSON.stringify(events);

    expect(result).toMatchObject({ ok: true, outputArtifactHash: providerOutputArtifactHash });
    expect(remoteProvider.calls).toHaveLength(1);
    expect((remoteProvider.calls[0] as ModelInvocationRequest & { inputText?: string }).inputText).toBe(promptArtifact.text);
    expect(requestedPayload).toMatchObject({
      inputArtifactHash: promptArtifact.manifest.inputArtifactHash,
      contextPackRefs: promptArtifact.manifest.contextPackRefs,
      promptTemplateId: promptArtifact.manifest.promptTemplateId,
      promptTemplateVersion: promptArtifact.manifest.promptTemplateVersion,
      runType: promptArtifact.manifest.runType,
      safePromptSummary: promptArtifact.manifest.safeSummary,
      omissions: promptArtifact.manifest.omissions,
      transferApprovalClass: "provider-byte-transfer"
    });
    expect(ledgerJson).not.toContain(promptArtifact.text);
    expect(requestedPayload?.inputArtifactHash).not.toBe(providerOutputArtifactHash);
  });
});

async function createPreparedRuntime(
  ledger: InMemoryEventLedger,
  providers: readonly ModelProviderAdapter[] = []
): Promise<ReturnType<typeof createAgentRuntime>> {
  const runtime = createAgentRuntime({ ledger, actor: humanActor, now: fixedNow, providers });
  await beforePreparedInvoke(runtime);
  return runtime;
}

async function beforePreparedInvoke(runtime: ReturnType<typeof createAgentRuntime>): Promise<void> {
  await runtime.initializeDefaultIdentity({ workspaceId: "ws_case_001" });
  await runtime.createTask({ taskId: "task_fake_model", title: "Run fake model", requestedBy: humanActor.id, priority: "normal" });
  await runtime.startRun({
    runId: "run_fake_model",
    taskId: "task_fake_model",
    runType: "evidence-triage",
    scope: { kind: "workspace", refs: ["ws_case_001"] }
  });
}

function remoteCredentialRef() {
  return {
    credentialRefId: "agent_credref_remote_model",
    providerId: "provider_remote_model",
    kind: "api-key-bearer" as const,
    safeLabel: "Remote model reference"
  };
}

function providerApprovedPromptArtifact(): PromptArtifactEnvelope {
  return promptArtifact("provider-approved", "provider-byte-transfer");
}

function localOnlyPromptArtifact(): PromptArtifactEnvelope {
  return promptArtifact("sensitive-local-only", "none");
}

function unsafePromptArtifact(): PromptArtifactEnvelope {
  const envelope = providerApprovedPromptArtifact();
  return {
    manifest: envelope.manifest,
    text: unsafeInputText()
  };
}

function promptArtifact(
  safetyClass: "sensitive-local-only" | "provider-approved",
  transferApprovalClass: "none" | "provider-byte-transfer"
): PromptArtifactEnvelope {
  const contextPackRef = buildContextPackRef({
    contextPackId: "task-run-history.v1",
    version: 1,
    generatedAt: "2026-07-08T12:00:00.000Z",
    payload: { events: ["evt_agent_task_created"] },
    safeSummary: "One resident-agent task event.",
    provenanceRefs: ["evt_agent_task_created"],
    sourceEventIds: ["evt_agent_task_created"],
    artifactHashes: [inputArtifactHash],
    policyVersion: "agent-policy-v1",
    scope: { kind: "workspace", id: "ws_case_001" },
    sizeBudgetBytes: 16384,
    stalenessInputs: [
      {
        kind: "projection-high-water-mark",
        ref: "agent.projection",
        value: "42"
      }
    ]
  });

  return buildPromptArtifact({
    promptTemplateId: "resident-agent-context-pack.v1",
    promptTemplateVersion: 1,
    generatedAt: "2026-07-08T12:01:00.000Z",
    runType: "evidence-triage",
    safetyClass,
    transferApprovalClass,
    contextPackRefs: [contextPackRef],
    text: "Use the listed context pack summaries to answer with provenance.",
    safeSummary: "Prompt artifact assembled from safe context pack summaries.",
    omissions: [
      {
        reason: "budget",
        sourceRef: "evidence-summary.v1",
        safeSummary: "One evidence pack was omitted because the size budget was reached."
      }
    ]
  });
}

function unsafeInputText(): string {
  return ["Author", "ization", ": ", "Bear", "er", " raw-provider-material"].join("");
}

function modelRequestedPayloads(events: Awaited<ReturnType<InMemoryEventLedger["readAll"]>>): Record<string, unknown>[] {
  return events
    .filter((event) => event.type === "agent.model-invocation.requested")
    .map((event) => event.payload as Record<string, unknown>);
}

function modelFailurePayloads(events: Awaited<ReturnType<InMemoryEventLedger["readAll"]>>): Record<string, unknown>[] {
  return events
    .filter((event) => event.type === "agent.model-invocation.failed")
    .map((event) => event.payload as Record<string, unknown>);
}

class CountingRemoteProvider implements ModelProviderAdapter {
  readonly calls: ModelInvocationRequest[] = [];

  describe(): ProviderDescriptor {
    return {
      providerId: "provider_remote_model",
      label: "Remote Model Provider",
      adapterVersion: "remote-provider.v1",
      endpointKind: "openai-compatible-api",
      modelFamilies: ["remote-safe"],
      credentialKinds: ["api-key-bearer"],
      supportsStructuredOutput: false,
      supportsToolCalling: false,
      safeDataNotes: "Remote provider used only with approved prompt artifacts."
    };
  }

  async invoke(request: ModelInvocationRequest): Promise<ModelInvocationResult> {
    this.calls.push(request);
    return {
      outputText: "safe remote output",
      outputArtifactHash: providerOutputArtifactHash,
      usage: { inputUnits: 13, outputUnits: 17 }
    };
  }
}

class ThrowingProvider implements ModelProviderAdapter {
  describe(): ProviderDescriptor {
    return {
      providerId: "provider_throwing_local",
      label: "Throwing Local Provider",
      adapterVersion: "throwing-provider.v1",
      endpointKind: "local-engine",
      modelFamilies: ["fake-local"],
      credentialKinds: ["local-no-secret"],
      supportsStructuredOutput: false,
      supportsToolCalling: false,
      safeDataNotes: "Local throwing provider for safe failure tests."
    };
  }

  async invoke(_request: ModelInvocationRequest): Promise<ModelInvocationResult> {
    throw new Error("provider failed with api key sk-live-value");
  }
}

class UnsafeDescriptorProvider implements ModelProviderAdapter {
  describe(): ProviderDescriptor {
    return {
      providerId: "provider_unsafe_local",
      label: "OPENAI_API_KEY",
      adapterVersion: "unsafe-provider.v1",
      endpointKind: "local-engine",
      modelFamilies: ["fake-local"],
      credentialKinds: ["local-no-secret"],
      supportsStructuredOutput: false,
      supportsToolCalling: false,
      safeDataNotes: "provider failed with api key sk-live-value"
    };
  }

  async invoke(_request: ModelInvocationRequest): Promise<ModelInvocationResult> {
    throw new Error("Unsafe descriptor provider should not be invoked.");
  }
}

class MalformedOutputProvider implements ModelProviderAdapter {
  describe(): ProviderDescriptor {
    return {
      providerId: "provider_malformed_local",
      label: "Malformed Local Provider",
      adapterVersion: "malformed-provider.v1",
      endpointKind: "local-engine",
      modelFamilies: ["fake-local"],
      credentialKinds: ["local-no-secret"],
      supportsStructuredOutput: false,
      supportsToolCalling: false,
      safeDataNotes: "Local malformed provider for safe failure tests."
    };
  }

  async invoke(_request: ModelInvocationRequest): Promise<ModelInvocationResult> {
    return {
      outputText: "provider output with api key sk-live-value",
      outputArtifactHash: "not-a-sha256",
      usage: { inputUnits: -1, outputUnits: 1 }
    };
  }
}

class UsageMetadataProvider implements ModelProviderAdapter {
  describe(): ProviderDescriptor {
    return {
      providerId: "provider_usage_local",
      label: "Usage Metadata Local Provider",
      adapterVersion: "usage-provider.v1",
      endpointKind: "local-engine",
      modelFamilies: ["fake-local"],
      credentialKinds: ["local-no-secret"],
      supportsStructuredOutput: false,
      supportsToolCalling: false,
      safeDataNotes: "Local usage metadata provider for safe result tests."
    };
  }

  async invoke(_request: ModelInvocationRequest): Promise<ModelInvocationResult> {
    return {
      outputText: "safe provider output",
      outputArtifactHash: "sha256:7777777777777777777777777777777777777777777777777777777777777777",
      usage: {
        inputUnits: 7,
        outputUnits: 11,
        rawMetadata: "api key sk-live-value"
      } as ModelInvocationResult["usage"]
    };
  }
}

class AccessorThrowingResultProvider implements ModelProviderAdapter {
  describe(): ProviderDescriptor {
    return {
      providerId: "provider_accessor_local",
      label: "Accessor Local Provider",
      adapterVersion: "accessor-provider.v1",
      endpointKind: "local-engine",
      modelFamilies: ["fake-local"],
      credentialKinds: ["local-no-secret"],
      supportsStructuredOutput: false,
      supportsToolCalling: false,
      safeDataNotes: "Local accessor provider for safe failure tests."
    };
  }

  async invoke(_request: ModelInvocationRequest): Promise<ModelInvocationResult> {
    return {
      outputText: "safe provider output",
      get outputArtifactHash() {
        throw new Error("OPENAI_API_KEY=raw-secret");
      },
      usage: { inputUnits: 7, outputUnits: 11 }
    } as unknown as ModelInvocationResult;
  }
}
