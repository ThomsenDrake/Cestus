import { describe, expect, it } from "vitest";
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
});
