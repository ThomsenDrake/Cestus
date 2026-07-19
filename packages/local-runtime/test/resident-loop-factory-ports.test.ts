import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAgentProviderConfiguration } from "../src/agent-provider-configuration.js";
import { issueMountedArtifactAuthorityOperationForFactory } from "../src/mounted-artifact-authority-operation.js";
import { issueMountedProviderAuthority } from "../src/mounted-provider-authority.js";
import { createPortableMountedAgentArtifactStoreProducer } from "../src/portable-mounted-agent-artifact-stores.js";
import { createResidentLoopFactoryComposition } from "../src/resident-loop-factory-composition.js";
import { createResidentLoopProviderPosture } from "../src/resident-loop-provider-posture.js";
import { resolveLocalRuntimeConfig } from "../src/config.js";
import { createSqlitePrrRuntime, type LocalRuntimeHandle } from "../src/runtime-factory.js";
import { createPortableWorkspace } from "../../workspace/src/index.js";

type FactoryPortsApi = {
  readonly createResidentLoopFactoryPorts: (input: unknown) => {
    readonly schemaVersion: "resident-loop-factory-ports.v1";
    readonly residentAgentId: "agent_default";
    readonly workspace: {
      readonly workspaceId: string;
      readonly mountInstanceId: string;
      readonly admissionGenerationId: string;
      readonly policyVersion: string;
      readonly policyDigest: string;
      readonly lockStateDigest: string;
      readonly highWaterMark: string;
      readonly highWaterOrdinal: number;
    };
    readonly run: {
      readonly taskId: string;
      readonly attemptId: string;
      readonly runId: string;
    };
    readonly providerPosture: {
      readonly selection: { readonly providerId: string; readonly modelId: string };
      readonly approval: { readonly required: true; readonly approvalProfile: string; readonly requiredApprovalClass: string };
    };
  };
};

type Hash = `sha256:${string}`;

const directories: string[] = [];
const handles: LocalRuntimeHandle[] = [];
const policy = Object.freeze({
  policyVersion: "policy_factory_ports_v1",
  policyDigest: hash("a"),
  lockStateDigest: hash("b")
});

afterEach(() => {
  for (const handle of handles.splice(0)) handle.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("resident loop factory ports", () => {
  it("admits only an exact Core/P2 data pairing and returns no mounted authority", async () => {
    const fixture = await mountedFixture("current");
    const api = await factoryPortsApi();

    let getterCalls = 0;
    let proxyCalls = 0;
    const output = api.createResidentLoopFactoryPorts(Object.freeze({
      authorityReadback: fixture.authorityReadback,
      providerPosture: fixture.providerPosture
    }));

    expect(output).toMatchObject({
      schemaVersion: "resident-loop-factory-ports.v1",
      residentAgentId: "agent_default",
      workspace: fixture.providerPosture.workspace,
      run: fixture.providerPosture.run,
      providerPosture: {
        selection: { providerId: "provider_openai_compatible", modelId: "model_text_1" },
        approval: {
          required: true,
          approvalProfile: "remote-byte-transfer-gated",
          requiredApprovalClass: "provider-byte-transfer"
        }
      }
    });
    expect(Object.isFrozen(output)).toBe(true);
    expect(Object.isFrozen(output.workspace)).toBe(true);
    expect(Object.isFrozen(output.run)).toBe(true);
    expect(Object.isFrozen(output.providerPosture)).toBe(true);
    expect(JSON.stringify(output)).not.toMatch(/(?:runtimeHandle|ledger|witness|authority|credentialValue|secret|token|endpoint|url|host)/i);
    expect(Object.values(output).some((value) => typeof value === "function")).toBe(false);

    const accessor = Object.create(Object.prototype, {
      authorityReadback: { enumerable: true, get() { getterCalls += 1; return fixture.authorityReadback; } },
      providerPosture: { enumerable: true, value: fixture.providerPosture }
    });
    const proxy = new Proxy({ authorityReadback: fixture.authorityReadback, providerPosture: fixture.providerPosture }, {
      get(target, property, receiver) {
        proxyCalls += 1;
        return Reflect.get(target, property, receiver);
      }
    });
    const copiedReadback = Object.freeze({
      ...fixture.authorityReadback,
      provider: Object.freeze({ ...fixture.authorityReadback.provider, workspaceId: "ws_factory_ports_other" })
    });
    const copiedPosture = Object.freeze({
      ...fixture.providerPosture,
      run: Object.freeze({ ...fixture.providerPosture.run, runId: "run_factory_ports_other" })
    });

    expect(() => api.createResidentLoopFactoryPorts(accessor)).toThrow(/factory ports/i);
    expect(() => api.createResidentLoopFactoryPorts(proxy)).toThrow(/factory ports/i);
    expect(() => api.createResidentLoopFactoryPorts({
      authorityReadback: fixture.authorityReadback,
      providerPosture: fixture.providerPosture,
      extra: undefined
    })).toThrow(/factory ports/i);
    expect(() => api.createResidentLoopFactoryPorts(Object.freeze({
      authorityReadback: copiedReadback,
      providerPosture: fixture.providerPosture
    }))).toThrow(/factory ports/i);
    expect(() => api.createResidentLoopFactoryPorts(Object.freeze({
      authorityReadback: fixture.authorityReadback,
      providerPosture: copiedPosture
    }))).toThrow(/factory ports/i);
    expect(getterCalls).toBe(0);
    expect(proxyCalls).toBe(0);
  });
});

async function factoryPortsApi(): Promise<FactoryPortsApi> {
  const sourceModule = ["..", "src", "resident-loop-factory-ports.js"].join("/");
  const imported: unknown = await import(sourceModule).catch(() => undefined);
  expect(isFactoryPortsApi(imported)).toBe(true);
  if (!isFactoryPortsApi(imported)) throw new Error("resident loop factory ports module is unavailable");
  return imported;
}

function isFactoryPortsApi(value: unknown): value is FactoryPortsApi {
  return value !== null && typeof value === "object" &&
    typeof Reflect.get(value, "createResidentLoopFactoryPorts") === "function";
}

async function mountedFixture(suffix: string): Promise<{
  readonly authorityReadback: Awaited<ReturnType<ReturnType<typeof createResidentLoopFactoryComposition>["bind"]>>;
  readonly providerPosture: Awaited<ReturnType<ReturnType<typeof createResidentLoopProviderPosture>["read"]>>;
}> {
  const root = mkdtempSync(join(tmpdir(), "cestus-factory-ports-"));
  directories.push(root);
  const workspaceId = `ws_factory_ports_${suffix}`;
  const workspaceRoot = join(root, workspaceId);
  createPortableWorkspace({
    rootDir: workspaceRoot,
    workspaceId,
    label: "Factory ports",
    createdAt: "2026-07-19T00:00:00.000Z",
    createdBy: "resident-loop-factory-ports-test"
  });
  const handle = createSqlitePrrRuntime({
    config: resolveLocalRuntimeConfig({
      cwd: root,
      env: { CESTUS_LOCAL_STORAGE: "portable-workspace", CESTUS_WORKSPACE_ROOT: workspaceRoot }
    }),
    actor: { id: "actor_factory_ports", kind: "human", label: "Factory ports" },
    now: () => "2026-07-19T00:00:00.000Z"
  });
  handles.push(handle);
  await handle.residentIdentity.ready();

  const composition = createResidentLoopFactoryComposition(Object.freeze({
    runtimeHandle: handle,
    actor: { id: "agent_factory_ports", kind: "agent", label: "Factory ports" },
    supervisorEpoch: `epoch_factory_ports_${suffix}`,
    policy,
    now: () => "2026-07-19T00:00:00.000Z",
    createSafeId: (kind: "lease" | "diagnostic" | "reconciliation") => `${kind}_factory_ports_${suffix}`
  }));
  await composition.start();
  const operation = issueMountedArtifactAuthorityOperationForFactory(composition.wakeRuntime);
  const authority = issueMountedProviderAuthority(Object.freeze({ operation }));
  const handoff = await createPortableMountedAgentArtifactStoreProducer(operation).bind({
    taskId: "task_factory_ports",
    attemptId: "attempt_factory_ports",
    approvedRunId: "run_factory_ports",
    runType: "evidence-triage",
    retryGeneration: 0
  });
  const authorityReadback = await composition.bind(Object.freeze({
    providerAuthority: authority,
    handoffAuthorityWitness: handoff.binding.authorityWitness
  }));
  const providerPosture = await createResidentLoopProviderPosture(Object.freeze({
    configuration: createAgentProviderConfiguration(configurationInput()),
    authority
  })).read({
    workspaceId: authorityReadback.provider.workspaceId,
    mountInstanceId: authorityReadback.provider.mountInstanceId,
    admissionGenerationId: authorityReadback.provider.admissionGenerationId,
    taskId: authorityReadback.handoff.taskId,
    attemptId: authorityReadback.handoff.attemptId,
    runId: authorityReadback.handoff.runId,
    promptArtifactHash: hash("c"),
    approvalPreviewHash: hash("d"),
    policyVersion: authorityReadback.provider.policyVersion,
    policyDigest: authorityReadback.provider.policyDigest,
    lockStateDigest: authorityReadback.provider.lockStateDigest,
    highWaterMark: authorityReadback.provider.highWaterMark,
    highWaterOrdinal: authorityReadback.provider.highWaterOrdinal
  });
  return { authorityReadback, providerPosture };
}

function configurationInput() {
  return {
    capabilities: [{
      capability: {
        providerId: "provider_openai_compatible", label: "OpenAI compatible provider", adapterVersion: "adapter_provider_v1",
        backendKind: "openai-compatible-api", modelFamilies: ["model_text_1"], modalities: ["text"],
        toolSupport: "function-calling", structuredOutputSupport: "schema-strict",
        contextLimits: { maxInputTokens: 8192, maxOutputTokens: 2048 },
        credentialRequirements: [{ credentialKind: "api-key-bearer", required: true }],
        dataHandlingNotes: "Remote provider requires approved byte transfer.", costPolicy: "metered-api",
        workspaceScopes: ["workspace"], approvalProfile: "remote-byte-transfer-gated",
        diagnosticContract: ["needs-api-key", "requires-byte-transfer-approval"], fakeSupport: false
      },
      capabilityHash: hash("e"), capabilitySourceEventId: "evt_capability_factory_ports", capabilityRevision: "capability_revision_factory_ports"
    }],
    credentialReferences: [{
      credentialRefId: "agent_credref_factory_ports", providerId: "provider_openai_compatible", credentialKind: "api-key-bearer",
      scopeKind: "workspace", capabilityScopes: ["model-inference"], safeLabel: "OpenAI compatible account reference",
      authorizedBy: "human_operator", authorizedAt: "2026-07-18T12:00:00.000Z", status: "healthy",
      policyVersion: policy.policyVersion, sourceEventIds: ["evt_binding_factory_ports"]
    }],
    endpointPolicies: [{
      endpointPolicyId: "endpoint_policy_factory_ports", providerId: "provider_openai_compatible", modelId: "model_text_1",
      adapterVersion: "adapter_provider_v1", policyVersion: policy.policyVersion, scope: "exact-provider-model",
      status: "approved", sourceEventIds: ["evt_endpoint_factory_ports"]
    }],
    feasibility: [{
      feasibilityId: "provider_feasibility_factory_ports", state: "current", lane: "byok", providerId: "provider_openai_compatible",
      modelId: "model_text_1", capabilityHash: hash("e"), capabilitySourceEventId: "evt_capability_factory_ports",
      capabilityRevision: "capability_revision_factory_ports", credentialRefId: "agent_credref_factory_ports",
      credentialKind: "api-key-bearer", endpointPolicyId: "endpoint_policy_factory_ports", policyVersion: policy.policyVersion,
      assessedAt: "2026-07-18T12:00:00.000Z",
      sourceEventIds: ["evt_binding_factory_ports", "evt_capability_factory_ports", "evt_endpoint_factory_ports"]
    }]
  };
}

function hash(character: string): Hash {
  return `sha256:${character.repeat(64)}`;
}
