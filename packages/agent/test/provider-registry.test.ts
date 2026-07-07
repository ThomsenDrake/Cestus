import { describe, expect, it } from "vitest";
import { providerDescriptorToCapabilityDescriptor } from "../src/provider.js";
import {
  createProviderRegistry,
  providerCapabilityDescriptorSchema
} from "../src/provider-registry.js";

describe("provider capability registry", () => {
  it("registers provider backends without resident identity", () => {
    const registry = createProviderRegistry();
    registry.register({
      providerId: "provider_fake_local",
      label: "Fake local provider",
      adapterVersion: "agent-provider-auth.v1",
      backendKind: "local-engine",
      modelFamilies: ["fake-local"],
      modalities: ["text"],
      toolSupport: "none",
      structuredOutputSupport: "schema-strict",
      contextLimits: { maxInputTokens: 4096, maxOutputTokens: 1024 },
      credentialRequirements: [{ credentialKind: "local-no-secret", required: true }],
      dataHandlingNotes: "Runs locally with deterministic fake output.",
      costPolicy: "local-compute",
      workspaceScopes: ["workspace"],
      approvalProfile: "local-only",
      diagnosticContract: ["provider-ready", "model-output-invalid"],
      fakeSupport: true
    });

    const descriptor = registry.require("provider_fake_local");
    expect(providerCapabilityDescriptorSchema.parse(descriptor)).toEqual(descriptor);
    expect(descriptor).not.toHaveProperty("residentAgentId");
  });

  it("rejects secret-shaped descriptor fields", () => {
    const registry = createProviderRegistry();
    expect(() =>
      registry.register({
        providerId: "provider_bad",
        label: "Bearer secret provider",
        adapterVersion: "agent-provider-auth.v1",
        backendKind: "openai-api",
        modelFamilies: ["text"],
        modalities: ["text"],
        toolSupport: "function-calling",
        structuredOutputSupport: "schema-strict",
        credentialRequirements: [{ credentialKind: "api-key-bearer", required: true }],
        dataHandlingNotes: "Remote API provider.",
        costPolicy: "metered-api",
        workspaceScopes: ["workspace"],
        approvalProfile: "remote-byte-transfer-gated",
        diagnosticContract: ["needs-api-key"],
        fakeSupport: true
      })
    ).toThrow(/secret-safe/i);
  });

  it("rejects lower-case credential markers in structural descriptor fields", () => {
    const unsafeOverrides = [
      { providerId: "provider_openai_api_key" },
      { label: "openai_api_key" },
      { adapterVersion: "adapter_client_secret_v1" },
      { modelFamilies: ["openai_api_key"] },
      { dataHandlingNotes: "Uses client_secret_marker." },
      { diagnosticContract: ["provider_token"] }
    ];

    for (const override of unsafeOverrides) {
      const registry = createProviderRegistry();
      expect(() => registry.register(validProviderCapabilityDescriptor(override))).toThrow(/secret-safe/i);
    }
  });

  it("matches providers by task capability and credential kind", () => {
    const registry = createProviderRegistry.withDefaultsForTest();
    expect(
      registry.match({
        modality: "text",
        structuredOutputRequired: true,
        credentialKinds: ["local-no-secret"],
        allowRemoteByteTransfer: false
      }).map((provider) => provider.providerId)
    ).toEqual(["provider_fake_local"]);
  });

  it("preserves provider descriptor credential alternatives during matching", () => {
    const registry = createProviderRegistry();
    registry.register(providerDescriptorToCapabilityDescriptor({
      providerId: "provider_alt_auth",
      label: "Alternative auth provider",
      adapterVersion: "agent-provider-auth.v1",
      endpointKind: "openai-api",
      modelFamilies: ["alternative-model"],
      credentialKinds: ["api-key-bearer", "workload-identity-token"],
      supportsStructuredOutput: true,
      supportsToolCalling: false,
      safeDataNotes: "Remote API provider with alternative auth modes."
    }));

    const apiKeyMatch = registry.match({
      modality: "text",
      structuredOutputRequired: true,
      credentialKinds: ["api-key-bearer"],
      allowRemoteByteTransfer: true
    });
    const workloadIdentityMatch = registry.match({
      modality: "text",
      structuredOutputRequired: true,
      credentialKinds: ["workload-identity-token"],
      allowRemoteByteTransfer: true
    });

    expect(apiKeyMatch.map((provider) => provider.providerId)).toEqual(["provider_alt_auth"]);
    expect(workloadIdentityMatch.map((provider) => provider.providerId)).toEqual(["provider_alt_auth"]);
  });

  it("returns providers in deterministic provider ID order", () => {
    const registry = createProviderRegistry();
    registry.register(validProviderCapabilityDescriptor({ providerId: "provider_order_c", label: "Order C" }));
    registry.register(validProviderCapabilityDescriptor({ providerId: "provider_order_a", label: "Order A" }));
    registry.register(validProviderCapabilityDescriptor({ providerId: "provider_order_b", label: "Order B" }));

    expect(registry.list().map((provider) => provider.providerId)).toEqual([
      "provider_order_a",
      "provider_order_b",
      "provider_order_c"
    ]);
    expect(registry.match({
      modality: "text",
      structuredOutputRequired: true,
      credentialKinds: ["local-no-secret"],
      allowRemoteByteTransfer: false
    }).map((provider) => provider.providerId)).toEqual([
      "provider_order_a",
      "provider_order_b",
      "provider_order_c"
    ]);
  });

  it("rejects duplicate registrations safely", () => {
    const registry = createProviderRegistry();
    registry.register(validProviderCapabilityDescriptor());

    expect(() => registry.register(validProviderCapabilityDescriptor())).toThrow(/already registered/i);
  });

  it("freezes descriptors and returned provider lists", () => {
    const registry = createProviderRegistry();
    registry.register(validProviderCapabilityDescriptor());

    const descriptor = registry.require("provider_safe_local");
    const listed = registry.list();

    expect(() => (descriptor.modelFamilies as string[]).push("mutated-model")).toThrow();
    expect(() => ((descriptor.contextLimits as { maxInputTokens: number }).maxInputTokens = 1)).toThrow();
    expect(() => ((descriptor.credentialRequirements[0] as { required: boolean }).required = false)).toThrow();
    expect(() => (listed as unknown[]).push(descriptor)).toThrow();
  });

  it("excludes remote byte-transfer-gated providers unless explicitly allowed", () => {
    const registry = createProviderRegistry.withDefaultsForTest();

    expect(registry.match({
      modality: "text",
      structuredOutputRequired: true,
      credentialKinds: ["api-key-bearer"],
      allowRemoteByteTransfer: false
    }).map((provider) => provider.providerId)).toEqual([]);

    expect(registry.match({
      modality: "text",
      structuredOutputRequired: true,
      credentialKinds: ["api-key-bearer"],
      allowRemoteByteTransfer: true
    }).map((provider) => provider.providerId)).toEqual(["provider_fake_remote"]);
  });
});

function validProviderCapabilityDescriptor(overrides: Record<string, unknown> = {}) {
  return {
    providerId: "provider_safe_local",
    label: "Safe local provider",
    adapterVersion: "agent-provider-auth.v1",
    backendKind: "local-engine",
    modelFamilies: ["safe-local"],
    modalities: ["text"],
    toolSupport: "none",
    structuredOutputSupport: "schema-strict",
    contextLimits: { maxInputTokens: 4096, maxOutputTokens: 1024 },
    credentialRequirements: [{ credentialKind: "local-no-secret", required: true }],
    dataHandlingNotes: "Runs locally with deterministic fake output.",
    costPolicy: "local-compute",
    workspaceScopes: ["workspace"],
    approvalProfile: "local-only",
    diagnosticContract: ["provider-ready", "model-output-invalid"],
    fakeSupport: true,
    ...overrides
  };
}
