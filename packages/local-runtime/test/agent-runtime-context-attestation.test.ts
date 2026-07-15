import { describe, expect, it, vi } from "vitest";
import {
  createContextPackRegistry,
  lookupOperationalContextPackRegistrarEvidence,
  registerOperationalContextPackBuilders,
  type ContextPackRegistry,
  type OperationalContextPackProvider
} from "../../agent/src/index.js";
import {
  createFactoryAttestedRuntimeCapabilities,
  type FactoryAttestedRuntimeCapabilities
} from "../src/agent-runtime-factory.js";
import {
  createMountedAgentContextCapability,
  type ContextRegistrationBinding,
  type MountedWorkspaceRuntimeAuthority,
  type RuntimeAuthorityReverificationInput
} from "../src/agent-runtime-context-packs.js";

const workspaceId = "workspace_a";
const mountInstanceId = "mount_a";
const workspaceIdentityEventId = "evt_workspace_identity_a";
const policyVersion = "policy.v1";
const zeroHash = `sha256:${"0".repeat(64)}`;
type BuildSpy = ReturnType<typeof vi.fn> & (() => void);

describe("factory-held context registrar attestation", () => {
  it.each([
    ["producerIdentity", "forged-producer.v1"],
    ["registrationIdentity", "forged-registration.v1"],
    ["parserIdentity", "forged-parser.v1"]
  ] as const)("rejects a swapped %s from a real private registrar before build", (field, value) => {
    const fixture = factoryWithRealOperationalRegistrar();
    const registrations = fixture.registrations.map((registration) =>
      registration.contextPackId === "workspace-runtime-status.v1"
        ? Object.freeze({ ...registration, [field]: value })
        : registration
    );

    expect(() => fixture.factory.createMountedContextCapability({
      authority: mountedAuthority(),
      registrations
    })).toThrow("blocked.factory-context-attestation-required");
    expect(fixture.build).not.toHaveBeenCalled();
  });

  it("rejects direct structural registrar tuples before builder activity", () => {
    const build = vi.fn() as BuildSpy;
    expect(() => createFactoryAttestedRuntimeCapabilities({
      registrar: {
        producerIdentity: "forged-producer.v1",
        registrationIdentity: "forged-registration.v1",
        parserIdentity: "forged-parser.v1",
        build
      }
    } as never)).toThrow("blocked.factory-context-attestation-required");
    expect(build).not.toHaveBeenCalled();
  });

  it("rejects the legacy public callback constructor before builder activity", () => {
    const build = vi.fn() as BuildSpy;
    expect(() => createMountedAgentContextCapability({
      authority: mountedAuthority(),
      registrations: [],
      registerBuilders: build
    })).toThrow("blocked.factory-context-attestation-required");
    expect(build).not.toHaveBeenCalled();
  });

  it("fails closed for manually registered or empty registries without package-owned lookup evidence", () => {
    expect(() => createFactoryAttestedRuntimeCapabilities()).not.toThrow();

    const foreignRegistry = createContextPackRegistry();
    foreignRegistry.register({
      descriptor: {
        contextPackId: "workspace-runtime-status.v1",
        version: 1,
        label: "Foreign context pack",
        maxBytes: 16_384,
        requiredProvenanceKinds: ["event-id"],
        redactionPolicy: "safe-summary",
        sourceProjection: "runtime.workspace-status"
      },
      parsePayload: (payload) => payload,
      build: () => {
        throw new Error("must not build");
      }
    });
    expect(lookupOperationalContextPackRegistrarEvidence(foreignRegistry, "workspace-runtime-status.v1")).toBeUndefined();
    expect(() => createFactoryAttestedRuntimeCapabilities({ contextRegistry: foreignRegistry }))
      .toThrow("blocked.factory-context-attestation-required");
  });

  it("rechecks captured private registrar evidence before resolution", async () => {
    const build = vi.fn() as BuildSpy;
    const backing = createContextPackRegistry();
    let tampered = false;
    const registry: ContextPackRegistry = {
      register: (builder) => backing.register(builder),
      build: (contextPackId) => backing.build(contextPackId),
      buildResolved: (contextPackId) => backing.buildResolved(contextPackId),
      getDescriptor(contextPackId) {
        const descriptor = backing.getDescriptor(contextPackId);
        return tampered && contextPackId === "workspace-runtime-status.v1" && descriptor !== undefined
          ? { ...descriptor, label: "tampered after capture" }
          : descriptor;
      },
      listDescriptors: () => backing.listDescriptors(),
      snapshot: () => backing.snapshot()
    };
    registerOperationalContextPackBuilders(registry, operationalProvider(build));
    const factory = createFactoryAttestedRuntimeCapabilities({ contextRegistry: registry });
    const registrations = registry.listDescriptors().map((descriptor) => {
      const evidence = lookupOperationalContextPackRegistrarEvidence(registry, descriptor.contextPackId);
      if (evidence === undefined) {
        throw new Error("test fixture requires private operational registrar evidence");
      }
      return Object.freeze({
        schemaVersion: "context-registration-binding.v1" as const,
        workspaceId,
        contextPackId: descriptor.contextPackId,
        version: descriptor.version,
        descriptorHash: evidence.descriptorHash,
        parserIdentity: evidence.parserIdentity,
        producerIdentity: evidence.producerIdentity,
        registrationIdentity: evidence.registrationIdentity,
        sourceProjection: descriptor.sourceProjection,
        scope: { kind: "workspace", id: workspaceId },
        sourceHighWaterMark: 0,
        selectionProof: { kind: "operational-ref.v1" as const },
        contentHash: zeroHash,
        sizeBytes: 1,
        policyVersion,
        provenanceRefs: ["evt_context_fixture"]
      });
    });
    const capability = factory.createMountedContextCapability({ authority: mountedAuthority(), registrations });
    tampered = true;

    await expect(capability.verifyForRun({
      schemaVersion: "verify-mounted-context-for-run.v1",
      workspaceId,
      mountInstanceId,
      workspaceIdentityEventId,
      policyVersion,
      sourceHighWaterMark: 42,
      runId: "run_a",
      requiredContextPackIds: ["workspace-runtime-status.v1"]
    })).rejects.toThrow("blocked.factory-context-attestation-required");
    expect(build).not.toHaveBeenCalled();
  });
});

function factoryWithRealOperationalRegistrar(): {
  readonly factory: FactoryAttestedRuntimeCapabilities;
  readonly registrations: readonly ContextRegistrationBinding[];
  readonly build: BuildSpy;
} {
  const build = vi.fn() as BuildSpy;
  const registry = createContextPackRegistry();
  registerOperationalContextPackBuilders(registry, operationalProvider(build));
  const factory = createFactoryAttestedRuntimeCapabilities({ contextRegistry: registry });
  const registrations = Object.freeze(registry.listDescriptors().map((descriptor) => {
    const evidence = lookupOperationalContextPackRegistrarEvidence(registry, descriptor.contextPackId);
    if (evidence === undefined) {
      throw new Error("test fixture requires private operational registrar evidence");
    }
    return Object.freeze({
      schemaVersion: "context-registration-binding.v1" as const,
      workspaceId,
      contextPackId: descriptor.contextPackId,
      version: descriptor.version,
      descriptorHash: evidence.descriptorHash,
      parserIdentity: evidence.parserIdentity,
      producerIdentity: evidence.producerIdentity,
      registrationIdentity: evidence.registrationIdentity,
      sourceProjection: descriptor.sourceProjection,
      scope: { kind: "workspace", id: workspaceId },
      sourceHighWaterMark: 0,
      selectionProof: { kind: "operational-ref.v1" as const },
      contentHash: zeroHash,
      sizeBytes: 1,
      policyVersion,
      provenanceRefs: ["evt_context_fixture"]
    });
  }));
  return Object.freeze({ factory, registrations, build });
}

function mountedAuthority(): MountedWorkspaceRuntimeAuthority {
  return Object.freeze({
    authorityVersion: "mounted-workspace-runtime-authority.v1" as const,
    workspaceId,
    mountInstanceId,
    workspaceIdentityEventId,
    policyVersion,
    sourceHighWaterMark: 42,
    async reverify(input: RuntimeAuthorityReverificationInput) {
      return Object.freeze({
        schemaVersion: "mounted-runtime-authority-reverification.v1" as const,
        ok: true as const,
        workspaceId,
        mountInstanceId,
        workspaceIdentityEventId,
        policyVersion,
        sourceHighWaterMark: 42,
        runId: input.runId
      });
    }
  });
}

function operationalProvider(build: BuildSpy): OperationalContextPackProvider {
  return {
    providerId: "attestation_test_provider",
    capabilities: ["workspace-runtime-status", "task-run-history", "agent-memory-summary"],
    policyVersion,
    generatedAt: "2026-07-15T02:20:00.000Z",
    scope: { kind: "workspace", id: workspaceId },
    sizeBudgets: { workspaceRuntimeStatus: 16_384, taskRunHistory: 32_768, agentMemorySummary: 16_384 },
    async workspaceRuntimeStatus() {
      build();
      return {
        runtimeHighWaterMark: 42,
        workspaceMounted: true,
        workspaceId,
        storageStrategy: "repo-local",
        bindPosture: "loopback",
        authPosture: "local-disabled",
        providerStates: [],
        diagnostics: [],
        projectionHighWaterMarks: {},
        omissionCodes: []
      };
    },
    async taskRunHistorySnapshot() {
      return {
        projectionHighWaterMark: 42,
        projectionSourceRef: "agent.projection.task-run-history",
        tasks: [], runs: [], modelInvocations: [], toolRequests: [],
        aggregateCounts: { total: 0 }, sourceEventIds: [], artifactHashes: [],
        window: { order: "updatedAt:desc", limit: 25, hasMore: false, totalCount: 0, omissionCodes: [] },
        emptyProof: {
          projectionName: "agent.projection.task-run-history",
          scope: { kind: "workspace", id: workspaceId },
          projectionHighWaterMark: 42,
          sourceEventCount: 0,
          generatedAt: "2026-07-15T02:20:00.000Z",
          emptyReasonCode: "empty"
        }
      };
    },
    async agentMemorySnapshot() {
      return {
        projectionHighWaterMark: 42,
        projectionSourceRef: "agent.projection.memory",
        activeMemory: [], aggregateCounts: { total: 0 }, sourceEventIds: [], artifactHashes: [],
        window: { order: "createdAt:asc", limit: 25, hasMore: false, totalCount: 0, omissionCodes: [] },
        emptyProof: {
          projectionName: "agent.projection.memory",
          scope: { kind: "workspace", id: workspaceId },
          projectionHighWaterMark: 42,
          sourceEventCount: 0,
          generatedAt: "2026-07-15T02:20:00.000Z",
          emptyReasonCode: "empty"
        }
      };
    }
  };
}
