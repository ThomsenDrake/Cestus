import { describe, expect, it } from "vitest";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import {
  FakeModelProvider,
  createAgentRuntime,
  type ModelInvocationRequest,
  type ModelInvocationResult,
  type ModelProviderAdapter,
  type ProviderDescriptor
} from "../src/index.js";

const humanActor = { id: "actor_case_owner", kind: "human" as const, label: "Case Owner" };
const fixedNow = () => "2026-07-07T19:00:00.000Z";
const inputArtifactHash = "sha256:4444444444444444444444444444444444444444444444444444444444444444";

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
