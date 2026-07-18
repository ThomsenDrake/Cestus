import { describe, expect, it } from "vitest";
import { createAgentProviderConfiguration } from "../src/agent-provider-configuration.js";

const hash = (character: string): `sha256:${string}` => `sha256:${character.repeat(64)}`;

describe("agent provider configuration", () => {
  it("normalizes exact capability, credential, policy, and current feasibility facts into immutable data", () => {
    const input = validConfiguration();

    const configuration = createAgentProviderConfiguration(input);

    expect(configuration).toMatchObject({
      version: "agent-provider-configuration.v1",
      capabilities: [{
        capability: {
          providerId: "provider_openai_compatible",
          modelFamilies: ["model_text_1"]
        },
        capabilityHash: hash("a"),
        capabilitySourceEventId: "evt_capability_1",
        capabilityRevision: "capability_revision_1"
      }],
      credentialReferences: [{
        credentialRefId: "agent_credref_openai_compatible",
        providerId: "provider_openai_compatible"
      }],
      endpointPolicies: [{
        endpointPolicyId: "endpoint_policy_openai_compatible",
        scope: "exact-provider-model",
        status: "approved"
      }],
      feasibility: [{
        feasibilityId: "provider_feasibility_openai_compatible",
        state: "current",
        lane: "byok",
        providerId: "provider_openai_compatible",
        modelId: "model_text_1"
      }]
    });
    expect(Object.isFrozen(configuration)).toBe(true);
    expect(Object.isFrozen(configuration.capabilities)).toBe(true);
    expect(Object.isFrozen(configuration.capabilities[0])).toBe(true);
    expect(Object.isFrozen(configuration.capabilities[0].capability)).toBe(true);
    expect(Object.isFrozen(configuration.credentialReferences[0])).toBe(true);
    expect(Object.isFrozen(configuration.feasibility[0].sourceEventIds)).toBe(true);
    expect(() => (configuration.capabilities as unknown[]).push({})).toThrow();
    expect(() => ((configuration.capabilities[0].capability.modelFamilies as string[]).push("model_mutated"))).toThrow();
    expect(input.capabilities[0].capability.modelFamilies).toEqual(["model_text_1"]);
  });

  it("admits only the exact local-engine and official-harness exceptions; every API lane remains BYOK", () => {
    const configuration = validConfiguration();
    configuration.capabilities.push(localCapability(), officialHarnessCapability());
    configuration.credentialReferences.push(localCredentialReference(), officialHarnessCredentialReference());
    configuration.endpointPolicies.push(localEndpointPolicy(), officialHarnessEndpointPolicy());
    configuration.feasibility.push(localFeasibility(), officialHarnessFeasibility());

    const normalized = createAgentProviderConfiguration(configuration);

    expect(normalized.feasibility.map((record) => [record.providerId, record.lane])).toEqual([
      ["provider_local_engine", "local-engine"],
      ["provider_official_harness", "official-harness"],
      ["provider_openai_compatible", "byok"]
    ]);

    const remoteAsLocal = validConfiguration();
    remoteAsLocal.feasibility[0].lane = "local-engine";
    expect(() => createAgentProviderConfiguration(remoteAsLocal)).toThrow("invalid provider configuration");

    const harnessWithoutEvidence = validConfiguration();
    harnessWithoutEvidence.capabilities[0] = officialHarnessCapability();
    harnessWithoutEvidence.credentialReferences[0] = officialHarnessCredentialReference();
    harnessWithoutEvidence.endpointPolicies[0] = officialHarnessEndpointPolicy();
    harnessWithoutEvidence.feasibility[0] = officialHarnessFeasibility();
    delete harnessWithoutEvidence.feasibility[0].officialEvidence;
    expect(() => createAgentProviderConfiguration(harnessWithoutEvidence)).toThrow("invalid provider configuration");
  });

  it("rejects duplicate, stale, mismatched, unapproved, fallback, and secret-or-host-bearing configuration facts", () => {
    const duplicateCapability = validConfiguration();
    duplicateCapability.capabilities.push(structuredClone(duplicateCapability.capabilities[0]));

    const staleFeasibility = validConfiguration();
    staleFeasibility.feasibility[0].state = "superseded";

    const modelMismatch = validConfiguration();
    modelMismatch.feasibility[0].modelId = "model_not_assessed";

    const referenceMismatch = validConfiguration();
    referenceMismatch.feasibility[0].credentialRefId = "agent_credref_different";

    const unapprovedPolicy = validConfiguration();
    unapprovedPolicy.endpointPolicies[0].status = "unapproved";

    const fallback = validConfiguration();
    Object.assign(fallback, { fallbackProviderId: "provider_other" });

    const hostMaterial = validConfiguration();
    hostMaterial.endpointPolicies[0].policyLabel = "https://api.example.invalid";

    const secretMaterial = validConfiguration();
    secretMaterial.credentialReferences[0].safeLabel = "Bearer secret value";

    for (const input of [
      duplicateCapability,
      staleFeasibility,
      modelMismatch,
      referenceMismatch,
      unapprovedPolicy,
      fallback,
      hostMaterial,
      secretMaterial
    ]) {
      expect(() => createAgentProviderConfiguration(input)).toThrow("invalid provider configuration");
    }
  });

  it("fails closed for hostile own-data shapes without invoking accessors", () => {
    const withAccessor = validConfiguration();
    let accessorRead = false;
    Object.defineProperty(withAccessor, "alternateStorage", {
      enumerable: true,
      get() {
        accessorRead = true;
        return "unexpected";
      }
    });

    const withSymbol = validConfiguration();
    Object.defineProperty(withSymbol.capabilities[0], Symbol("unexpected"), {
      value: "unexpected",
      enumerable: true
    });

    const withPrototype = Object.assign(Object.create({ inherited: true }), validConfiguration());

    const sparseCapabilities = validConfiguration();
    sparseCapabilities.capabilities = [];
    sparseCapabilities.capabilities[1] = capability();

    for (const input of [withAccessor, withSymbol, withPrototype, sparseCapabilities]) {
      expect(() => createAgentProviderConfiguration(input)).toThrow("invalid provider configuration");
    }
    expect(accessorRead).toBe(false);
  });
});

function validConfiguration() {
  return {
    capabilities: [capability()],
    credentialReferences: [credentialReference()],
    endpointPolicies: [endpointPolicy()],
    feasibility: [feasibility()]
  };
}

function capability() {
  return {
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
    capabilityHash: hash("a"),
    capabilitySourceEventId: "evt_capability_1",
    capabilityRevision: "capability_revision_1"
  };
}

function credentialReference() {
  return {
    credentialRefId: "agent_credref_openai_compatible",
    providerId: "provider_openai_compatible",
    credentialKind: "api-key-bearer",
    scopeKind: "workspace",
    capabilityScopes: ["model-inference"],
    safeLabel: "OpenAI compatible credential reference",
    authorizedBy: "human_operator",
    authorizedAt: "2026-07-18T12:00:00.000Z",
    status: "healthy",
    policyVersion: "policy_provider_v1",
    sourceEventIds: ["evt_credential_1"]
  };
}

function endpointPolicy() {
  return {
    endpointPolicyId: "endpoint_policy_openai_compatible",
    providerId: "provider_openai_compatible",
    modelId: "model_text_1",
    adapterVersion: "adapter_provider_v1",
    policyVersion: "policy_provider_v1",
    scope: "exact-provider-model",
    status: "approved",
    sourceEventIds: ["evt_endpoint_policy_1"]
  };
}

function feasibility() {
  return {
    feasibilityId: "provider_feasibility_openai_compatible",
    state: "current",
    lane: "byok",
    providerId: "provider_openai_compatible",
    modelId: "model_text_1",
    capabilityHash: hash("a"),
    capabilitySourceEventId: "evt_capability_1",
    capabilityRevision: "capability_revision_1",
    credentialRefId: "agent_credref_openai_compatible",
    credentialKind: "api-key-bearer",
    endpointPolicyId: "endpoint_policy_openai_compatible",
    policyVersion: "policy_provider_v1",
    assessedAt: "2026-07-18T12:00:00.000Z",
    sourceEventIds: ["evt_feasibility_1"]
  };
}

function localCapability() {
  return {
    capability: {
      ...capability().capability,
      providerId: "provider_local_engine",
      label: "Local engine",
      backendKind: "local-engine",
      modelFamilies: ["model_local_1"],
      toolSupport: "none",
      credentialRequirements: [{ credentialKind: "local-no-secret", required: true }],
      dataHandlingNotes: "Local engine runs without a secret.",
      costPolicy: "local-compute",
      approvalProfile: "local-only",
      diagnosticContract: ["provider-ready"]
    },
    capabilityHash: hash("b"),
    capabilitySourceEventId: "evt_capability_local_1",
    capabilityRevision: "capability_revision_local_1"
  };
}

function localCredentialReference() {
  return {
    ...credentialReference(),
    credentialRefId: "agent_credref_local_engine",
    providerId: "provider_local_engine",
    credentialKind: "local-no-secret",
    safeLabel: "Local engine no secret reference",
    sourceEventIds: ["evt_credential_local_1"]
  };
}

function localEndpointPolicy() {
  return {
    ...endpointPolicy(),
    endpointPolicyId: "endpoint_policy_local_engine",
    providerId: "provider_local_engine",
    modelId: "model_local_1",
    sourceEventIds: ["evt_endpoint_policy_local_1"]
  };
}

function localFeasibility() {
  return {
    ...feasibility(),
    feasibilityId: "provider_feasibility_local_engine",
    lane: "local-engine",
    providerId: "provider_local_engine",
    modelId: "model_local_1",
    capabilityHash: hash("b"),
    capabilitySourceEventId: "evt_capability_local_1",
    capabilityRevision: "capability_revision_local_1",
    credentialRefId: "agent_credref_local_engine",
    credentialKind: "local-no-secret",
    endpointPolicyId: "endpoint_policy_local_engine",
    sourceEventIds: ["evt_feasibility_local_1"]
  };
}

function officialHarnessCapability() {
  return {
    capability: {
      ...capability().capability,
      providerId: "provider_official_harness",
      label: "Official subscription harness",
      backendKind: "openai-codex-harness",
      modelFamilies: ["model_harness_1"],
      toolSupport: "harness-tools",
      structuredOutputSupport: "harness-mediated",
      credentialRequirements: [{ credentialKind: "subscription-oauth", required: true }],
      dataHandlingNotes: "Official harness uses subscription approval.",
      costPolicy: "subscription-entitlement",
      approvalProfile: "harness-workspace-gated",
      diagnosticContract: ["needs-device-sign-in"]
    },
    capabilityHash: hash("c"),
    capabilitySourceEventId: "evt_capability_harness_1",
    capabilityRevision: "capability_revision_harness_1"
  };
}

function officialHarnessCredentialReference() {
  return {
    ...credentialReference(),
    credentialRefId: "agent_credref_official_harness",
    providerId: "provider_official_harness",
    credentialKind: "subscription-oauth",
    safeLabel: "Official harness subscription reference",
    sourceEventIds: ["evt_credential_harness_1"]
  };
}

function officialHarnessEndpointPolicy() {
  return {
    ...endpointPolicy(),
    endpointPolicyId: "endpoint_policy_official_harness",
    providerId: "provider_official_harness",
    modelId: "model_harness_1",
    sourceEventIds: ["evt_endpoint_policy_harness_1"]
  };
}

function officialHarnessFeasibility() {
  return {
    ...feasibility(),
    feasibilityId: "provider_feasibility_official_harness",
    lane: "official-harness",
    providerId: "provider_official_harness",
    modelId: "model_harness_1",
    capabilityHash: hash("c"),
    capabilitySourceEventId: "evt_capability_harness_1",
    capabilityRevision: "capability_revision_harness_1",
    credentialRefId: "agent_credref_official_harness",
    credentialKind: "subscription-oauth",
    endpointPolicyId: "endpoint_policy_official_harness",
    sourceEventIds: ["evt_feasibility_harness_1"],
    officialEvidence: {
      evidenceId: "evidence_official_harness_1",
      evidenceHash: hash("d"),
      officialFlow: "subscription-device-oauth",
      approvedScope: "model-inference",
      approvedCostPolicy: "subscription-entitlement",
      officialSourceEventIds: ["evt_official_harness_1"]
    }
  };
}
