import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAgentProviderConfiguration } from "../src/agent-provider-configuration.js";
import { issueMountedArtifactAuthorityOperationForFactory } from "../src/mounted-artifact-authority-operation.js";
import { issueMountedProviderAuthority } from "../src/mounted-provider-authority.js";
import { createPortableMountedAgentArtifactStoreProducer } from "../src/portable-mounted-agent-artifact-stores.js";
import { createResidentLoopFactoryComposition } from "../src/resident-loop-factory-composition.js";
import { resolveLocalRuntimeConfig } from "../src/config.js";
import { createSqlitePrrRuntime, type LocalRuntimeHandle } from "../src/runtime-factory.js";
import { createPortableWorkspace } from "../../workspace/src/index.js";

type Hash = `sha256:${string}`;

type ResidentLoopProviderPostureApi = {
  readonly createResidentLoopProviderPosture: (input: unknown) => {
    read(input: unknown): Promise<ResidentLoopProviderPosture>;
  };
};

type ResidentLoopProviderPosture = {
  readonly schemaVersion: "resident-loop-provider-posture.v1";
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
  readonly selection: {
    readonly providerId: string;
    readonly modelId: string;
    readonly adapterVersion: string;
    readonly selectionPolicyVersion: string;
    readonly endpointPolicyId: string;
  };
  readonly capability: {
    readonly capabilityId: string;
    readonly capabilityVersion: "agent-provider-capability.v2";
    readonly capabilityHash: Hash;
    readonly capabilitySourceEventId: string;
    readonly capabilityRevision: string;
  };
  readonly credentialReference: {
    readonly credentialRefId: string;
    readonly credentialKind: "api-key-bearer";
    readonly sourceEventIds: readonly string[];
  };
  readonly feasibility: {
    readonly feasibilityId: string;
    readonly lane: "byok";
    readonly assessedAt: string;
    readonly sourceEventIds: readonly string[];
  };
  readonly approval: {
    readonly required: true;
    readonly approvalProfile: "remote-byte-transfer-gated";
    readonly requiredApprovalClass: "provider-byte-transfer";
  };
};

const directories: string[] = [];
const handles: LocalRuntimeHandle[] = [];
const policy = Object.freeze({
  policyVersion: "policy_provider_posture_v1",
  policyDigest: `sha256:${"a".repeat(64)}`,
  lockStateDigest: `sha256:${"b".repeat(64)}`
});

afterEach(() => {
  for (const handle of handles.splice(0)) handle.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("resident loop provider posture", () => {
  it("derives immutable secret-safe BYOK posture from one P1 configuration, binding data, and current PM authority", async () => {
    const api = await postureApi();
    expectNoTask126ReaderCoupling();
    const fixture = await mountedFixture("current");
    const configuration = createAgentProviderConfiguration(configurationInput());
    let appendCalls = 0;
    const append = fixture.handle.ledger.append.bind(fixture.handle.ledger);
    Reflect.set(fixture.handle.ledger, "append", async (...args: Parameters<typeof append>) => {
      appendCalls += 1;
      return append(...args);
    });

    const posture = api.createResidentLoopProviderPosture(Object.freeze({
      configuration,
      authority: fixture.authority
    }));
    const result = await posture.read(requestedUse(fixture));

    expect(result).toEqual({
      schemaVersion: "resident-loop-provider-posture.v1",
      residentAgentId: "agent_default",
      workspace: {
        workspaceId: fixture.readback.workspaceId,
        mountInstanceId: fixture.readback.mountInstanceId,
        admissionGenerationId: fixture.readback.admissionGenerationId,
        policyVersion: policy.policyVersion,
        policyDigest: policy.policyDigest,
        lockStateDigest: policy.lockStateDigest,
        highWaterMark: fixture.readback.highWaterMark,
        highWaterOrdinal: fixture.readback.highWaterOrdinal
      },
      run: { taskId: "task_provider_posture", attemptId: "attempt_provider_posture", runId: "run_provider_posture" },
      selection: {
        providerId: "provider_openai_compatible",
        modelId: "model_text_1",
        adapterVersion: "adapter_provider_v1",
        selectionPolicyVersion: policy.policyVersion,
        endpointPolicyId: "endpoint_policy_openai_compatible"
      },
      capability: {
        capabilityId: "provider_openai_compatible",
        capabilityVersion: "agent-provider-capability.v2",
        capabilityHash: hash("c"),
        capabilitySourceEventId: "evt_capability_1",
        capabilityRevision: "capability_revision_1"
      },
      credentialReference: {
        credentialRefId: "agent_credref_openai_compatible",
        credentialKind: "api-key-bearer",
        sourceEventIds: ["evt_binding_1"]
      },
      feasibility: {
        feasibilityId: "provider_feasibility_openai_compatible",
        lane: "byok",
        assessedAt: "2026-07-18T12:00:00.000Z",
        sourceEventIds: ["evt_binding_1", "evt_capability_1", "evt_endpoint_policy_1"]
      },
      approval: {
        required: true,
        approvalProfile: "remote-byte-transfer-gated",
        requiredApprovalClass: "provider-byte-transfer"
      }
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.workspace)).toBe(true);
    expect(Object.isFrozen(result.capability)).toBe(true);
    expect(Object.isFrozen(result.credentialReference.sourceEventIds)).toBe(true);
    expect(appendCalls).toBe(0);
    const serialized = JSON.stringify(result);
    expect(serialized).toContain('"credentialKind":"api-key-bearer"');
    expect(serialized).not.toMatch(/"(?:credentialValue|secret|token|authorization|endpoint|url|host)"\s*:/i);
    expect(serialized).not.toMatch(/(?:api[ _-]?key|token|secret|password)\s*[:=]\s*[a-z0-9._~+\/=:-]{3,}/i);
    expect(serialized).not.toMatch(/\b(?:authorization|proxy-authorization)"?\s*[:=]\s*(?:bearer|basic|token)\b/i);
    expect(serialized).not.toMatch(/\b(?:bearer|basic)\s+[a-z0-9._~+\/=:-]{8,}\b/i);
    expect(serialized).not.toMatch(/\b(?:https?|wss?|file):\/\//i);
    expect(serialized).not.toMatch(/\b(?:localhost|(?:[a-z0-9-]+\.)+(?:com|net|org|io|dev|local|test))\b/i);
    expect(serialized).not.toMatch(/\b\d{1,3}(?:\.\d{1,3}){3}\b/);
  });

  it("rejects hostile, copied, provisional, swapped, or mismatched P1/currentness inputs without invoking getters or minting posture", async () => {
    const api = await postureApi();
    const fixture = await mountedFixture("hostile");
    const swappedFixture = await mountedFixture("swapped");
    const configuration = createAgentProviderConfiguration(configurationInput());
    let getterCalls = 0;
    let proxyCalls = 0;
    const accessor = Object.create(Object.prototype, {
      configuration: {
        enumerable: true,
        get() {
          getterCalls += 1;
          return configuration;
        }
      },
      authority: { enumerable: true, value: fixture.authority }
    });
    const proxy = new Proxy({ configuration, authority: fixture.authority }, {
      get(target, property, receiver) {
        proxyCalls += 1;
        return Reflect.get(target, property, receiver);
      }
    });
    const copiedConfiguration = {
      ...configuration,
      feasibility: [{ ...configuration.feasibility[0], policyVersion: "policy_other_v1" }]
    };
    const copiedAuthority = { ...fixture.authority };
    const customPrototype = Object.assign(Object.create({ inherited: true }), {
      configuration,
      authority: fixture.authority
    });
    const withSymbol = Object.assign({ configuration, authority: fixture.authority }, { [Symbol("provider-posture")]: true });
    const withExtraKey = { configuration, authority: fixture.authority, extra: undefined };
    const sparseArray: unknown[] = [];
    sparseArray[1] = fixture.authority;
    const extraIndexArray = [configuration, fixture.authority];
    Object.assign(extraIndexArray, { 2: "extra" });

    expect(() => api.createResidentLoopProviderPosture(accessor)).toThrow(/provider posture/i);
    expect(() => api.createResidentLoopProviderPosture(proxy)).toThrow(/provider posture/i);
    expect(() => api.createResidentLoopProviderPosture(customPrototype)).toThrow(/provider posture/i);
    expect(() => api.createResidentLoopProviderPosture(withSymbol)).toThrow(/provider posture/i);
    expect(() => api.createResidentLoopProviderPosture(withExtraKey)).toThrow(/provider posture/i);
    expect(() => api.createResidentLoopProviderPosture(sparseArray)).toThrow(/provider posture/i);
    expect(() => api.createResidentLoopProviderPosture(extraIndexArray)).toThrow(/provider posture/i);
    expect(() => api.createResidentLoopProviderPosture({ configuration: copiedConfiguration, authority: fixture.authority }))
      .toThrow(/provider posture/i);
    expect(getterCalls).toBe(0);
    expect(proxyCalls).toBe(0);

    const copied = api.createResidentLoopProviderPosture({ configuration, authority: copiedAuthority });
    await expect(copied.read(requestedUse(fixture))).rejects.toThrow(/provider posture/i);

    const swapped = api.createResidentLoopProviderPosture({ configuration, authority: swappedFixture.authority });
    await expect(swapped.read(requestedUse(fixture))).rejects.toThrow(/provider posture/i);

    const posture = api.createResidentLoopProviderPosture({ configuration, authority: fixture.authority });
    for (const [field, value] of [
      ["workspaceId", "workspace_provider_posture_provisional"],
      ["workspaceId", "ws_other"],
      ["mountInstanceId", "mount_other"],
      ["admissionGenerationId", "admission_generation_other"],
      ["taskId", "task_other"],
      ["attemptId", "attempt_other"],
      ["runId", "run_other"],
      ["policyVersion", "policy_other_v1"],
      ["policyDigest", hash("d")],
      ["lockStateDigest", hash("e")],
      ["highWaterMark", "high_water_other"],
      ["highWaterOrdinal", 999],
      ["promptArtifactHash", hash("d")],
      ["approvalPreviewHash", hash("e")]
    ] as const) {
      await expect(posture.read({ ...requestedUse(fixture), [field]: value })).rejects.toThrow(/provider posture/i);
    }
  });

  it("rereads and burns PM authority when the mounted runtime becomes stale across posture read boundaries", async () => {
    const api = await postureApi();
    const fixture = await mountedFixture("stale");
    const posture = api.createResidentLoopProviderPosture({
      configuration: createAgentProviderConfiguration(configurationInput()),
      authority: fixture.authority
    });

    fixture.handle.close();

    await expect(posture.read(requestedUse(fixture))).rejects.toThrow(/provider posture/i);
    await expect(posture.read(requestedUse(fixture))).rejects.toThrow(/provider posture/i);
  });
});

async function postureApi(): Promise<ResidentLoopProviderPostureApi> {
  const sourceModule = ["..", "src", "resident-loop-provider-posture.js"].join("/");
  const imported: unknown = await import(sourceModule).catch(() => undefined);
  expect(isPostureApi(imported)).toBe(true);
  if (!isPostureApi(imported)) throw new Error("resident loop provider posture module is unavailable");
  return imported;
}

function expectNoTask126ReaderCoupling(): void {
  const source = readFileSync(join(process.cwd(), "packages/local-runtime/src/resident-loop-provider-posture.ts"), "utf8");
  expect(source).not.toContain("byok-provider");
  expect(source).not.toContain("createByokProviderAuthorityReader");
  expect(source).not.toContain("createByokProviderBoundary");
}

function isPostureApi(value: unknown): value is ResidentLoopProviderPostureApi {
  return value !== null && typeof value === "object" &&
    typeof Reflect.get(value, "createResidentLoopProviderPosture") === "function";
}

async function mountedFixture(suffix: string): Promise<{
  readonly handle: LocalRuntimeHandle;
  readonly authority: object;
  readonly readback: {
    readonly workspaceId: string;
    readonly mountInstanceId: string;
    readonly admissionGenerationId: string;
    readonly highWaterMark: string;
    readonly highWaterOrdinal: number;
  };
}> {
  const root = mkdtempSync(join(tmpdir(), "cestus-provider-posture-"));
  directories.push(root);
  const workspaceId = `ws_provider_posture_${suffix}`;
  const workspaceRoot = join(root, workspaceId);
  createPortableWorkspace({
    rootDir: workspaceRoot,
    workspaceId,
    label: "Provider posture",
    createdAt: "2026-07-19T00:00:00.000Z",
    createdBy: "resident-loop-provider-posture-test"
  });
  const handle = createSqlitePrrRuntime({
    config: resolveLocalRuntimeConfig({
      cwd: root,
      env: { CESTUS_LOCAL_STORAGE: "portable-workspace", CESTUS_WORKSPACE_ROOT: workspaceRoot }
    }),
    actor: { id: "actor_resident_posture", kind: "human", label: "Resident posture" },
    now: () => "2026-07-19T00:00:00.000Z"
  });
  handles.push(handle);
  await handle.residentIdentity.ready();

  const composition = createResidentLoopFactoryComposition(Object.freeze({
    runtimeHandle: handle,
    actor: { id: "agent_resident_posture", kind: "agent", label: "Resident posture" },
    supervisorEpoch: `epoch_provider_posture_${suffix}`,
    policy,
    now: () => "2026-07-19T00:00:00.000Z",
    createSafeId: (kind: "lease" | "diagnostic" | "reconciliation") => `${kind}_provider_posture_${suffix}`
  }));
  await composition.start();
  const operation = issueMountedArtifactAuthorityOperationForFactory(composition.wakeRuntime);
  const authority = issueMountedProviderAuthority(Object.freeze({ operation }));
  const handoff = await createPortableMountedAgentArtifactStoreProducer(operation).bind({
    taskId: "task_provider_posture",
    attemptId: "attempt_provider_posture",
    approvedRunId: "run_provider_posture",
    runType: "evidence-triage",
    retryGeneration: 0
  });
  const binding = await composition.bind(Object.freeze({
    providerAuthority: authority,
    handoffAuthorityWitness: handoff.binding.authorityWitness
  }));

  return {
    handle,
    authority,
    readback: {
      workspaceId: binding.provider.workspaceId,
      mountInstanceId: binding.provider.mountInstanceId,
      admissionGenerationId: binding.provider.admissionGenerationId,
      highWaterMark: binding.provider.highWaterMark,
      highWaterOrdinal: binding.provider.highWaterOrdinal
    }
  };
}

function requestedUse(fixture: Awaited<ReturnType<typeof mountedFixture>>) {
  return {
    workspaceId: fixture.readback.workspaceId,
    mountInstanceId: fixture.readback.mountInstanceId,
    admissionGenerationId: fixture.readback.admissionGenerationId,
    taskId: "task_provider_posture",
    attemptId: "attempt_provider_posture",
    runId: "run_provider_posture",
    promptArtifactHash: hash("a"),
    approvalPreviewHash: hash("b"),
    policyVersion: policy.policyVersion,
    policyDigest: policy.policyDigest,
    lockStateDigest: policy.lockStateDigest,
    highWaterMark: fixture.readback.highWaterMark,
    highWaterOrdinal: fixture.readback.highWaterOrdinal
  };
}

function configurationInput() {
  return {
    capabilities: [{
      capability: {
        providerId: "provider_openai_compatible",
        label: "OpenAI compatible provider",
        adapterVersion: "adapter_provider_v1",
        backendKind: "openai-compatible-api",
        modelFamilies: ["model_text_1"],
        modalities: ["text"],
        toolSupport: "function-calling",
        structuredOutputSupport: "schema-strict",
        contextLimits: { maxInputTokens: 8192, maxOutputTokens: 2048 },
        credentialRequirements: [{ credentialKind: "api-key-bearer", required: true }],
        dataHandlingNotes: "Remote provider requires approved byte transfer.",
        costPolicy: "metered-api",
        workspaceScopes: ["workspace"],
        approvalProfile: "remote-byte-transfer-gated",
        diagnosticContract: ["needs-api-key", "requires-byte-transfer-approval"],
        fakeSupport: false
      },
      capabilityHash: hash("c"),
      capabilitySourceEventId: "evt_capability_1",
      capabilityRevision: "capability_revision_1"
    }],
    credentialReferences: [{
      credentialRefId: "agent_credref_openai_compatible",
      providerId: "provider_openai_compatible",
      credentialKind: "api-key-bearer",
      scopeKind: "workspace",
      capabilityScopes: ["model-inference"],
      safeLabel: "OpenAI compatible account reference",
      authorizedBy: "human_operator",
      authorizedAt: "2026-07-18T12:00:00.000Z",
      status: "healthy",
      policyVersion: policy.policyVersion,
      sourceEventIds: ["evt_binding_1"]
    }],
    endpointPolicies: [{
      endpointPolicyId: "endpoint_policy_openai_compatible",
      providerId: "provider_openai_compatible",
      modelId: "model_text_1",
      adapterVersion: "adapter_provider_v1",
      policyVersion: policy.policyVersion,
      scope: "exact-provider-model",
      status: "approved",
      sourceEventIds: ["evt_endpoint_policy_1"]
    }],
    feasibility: [{
      feasibilityId: "provider_feasibility_openai_compatible",
      state: "current",
      lane: "byok",
      providerId: "provider_openai_compatible",
      modelId: "model_text_1",
      capabilityHash: hash("c"),
      capabilitySourceEventId: "evt_capability_1",
      capabilityRevision: "capability_revision_1",
      credentialRefId: "agent_credref_openai_compatible",
      credentialKind: "api-key-bearer",
      endpointPolicyId: "endpoint_policy_openai_compatible",
      policyVersion: policy.policyVersion,
      assessedAt: "2026-07-18T12:00:00.000Z",
      sourceEventIds: ["evt_binding_1", "evt_capability_1", "evt_endpoint_policy_1"]
    }]
  };
}

function hash(character: string): Hash {
  return `sha256:${character.repeat(64)}`;
}
