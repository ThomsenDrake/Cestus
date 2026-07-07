import { describe, expect, it } from "vitest";
import { createProviderRegistry } from "../src/provider-registry.js";
import { selectProviderForTask } from "../src/provider-selection.js";

describe("provider selection policy", () => {
  it("prefers local providers for sensitive evidence when capable", () => {
    const selected = selectProviderForTask({
      registry: createProviderRegistry.withDefaultsForTest(),
      task: {
        modality: "text",
        structuredOutputRequired: true,
        sensitivity: "sensitive-evidence",
        requiresRemoteHarness: false
      },
      readinessByProviderId: {
        provider_fake_local: "works-locally",
        provider_fake_remote: "requires-byte-transfer-approval"
      },
      policy: {
        allowRemoteByteTransfer: false,
        preferredCostPolicy: "local-compute"
      }
    });

    expect(selected).toMatchObject({
      ok: true,
      providerId: "provider_fake_local",
      approvalClass: "none"
    });
  });

  it("returns approval-required when only remote provider can satisfy the task", () => {
    const selected = selectProviderForTask({
      registry: createProviderRegistry.withDefaultsForTest(),
      task: {
        modality: "text",
        structuredOutputRequired: true,
        sensitivity: "workspace-safe",
        requiresRemoteHarness: false
      },
      readinessByProviderId: {
        provider_fake_remote: "requires-byte-transfer-approval"
      },
      policy: {
        allowRemoteByteTransfer: true,
        preferredCostPolicy: "metered-api"
      }
    });

    expect(selected).toMatchObject({
      ok: true,
      providerId: "provider_fake_remote",
      approvalClass: "provider-byte-transfer"
    });
  });

  it("fails closed when subscription OAuth is not officially supported for the task", () => {
    const selected = selectProviderForTask({
      registry: createProviderRegistry.withDefaultsForTest(),
      task: {
        modality: "text",
        structuredOutputRequired: false,
        sensitivity: "workspace-safe",
        requiresRemoteHarness: true
      },
      readinessByProviderId: {
        provider_fake_subscription_harness: "needs-oauth-sign-in"
      },
      policy: {
        allowRemoteByteTransfer: true,
        preferredCostPolicy: "subscription-entitlement"
      }
    });

    expect(selected).toMatchObject({
      ok: false,
      category: "provider-not-ready"
    });
  });

  it("does not select a remote byte-transfer provider when transfer is not allowed", () => {
    const registry = createProviderRegistry();
    registry.register(remoteProviderDescriptor("provider_remote_only", "Remote only provider"));

    const selected = selectProviderForTask({
      registry,
      task: {
        modality: "text",
        structuredOutputRequired: true,
        sensitivity: "sensitive-evidence",
        requiresRemoteHarness: false
      },
      readinessByProviderId: {
        provider_remote_only: "requires-byte-transfer-approval"
      },
      policy: {
        allowRemoteByteTransfer: false,
        preferredCostPolicy: "metered-api"
      }
    });

    expect(selected).toMatchObject({
      ok: false,
      category: "provider-policy-blocked"
    });
  });

  it("breaks equivalent provider ties by provider ID", () => {
    const registry = createProviderRegistry();
    registry.register(localProviderDescriptor("provider_order_b", "Order B provider"));
    registry.register(localProviderDescriptor("provider_order_a", "Order A provider"));

    const selected = selectProviderForTask({
      registry,
      task: {
        modality: "text",
        structuredOutputRequired: true,
        sensitivity: "workspace-safe",
        requiresRemoteHarness: false
      },
      readinessByProviderId: {
        provider_order_a: "works-locally",
        provider_order_b: "works-locally"
      },
      policy: {
        allowRemoteByteTransfer: false,
        preferredCostPolicy: "local-compute"
      }
    });

    expect(selected).toMatchObject({
      ok: true,
      providerId: "provider_order_a",
      approvalClass: "none"
    });
  });

  it("does not mutate descriptors returned by the registry", () => {
    const registry = createProviderRegistry.withDefaultsForTest();
    const beforeSelection = JSON.stringify(registry.list());

    selectProviderForTask({
      registry,
      task: {
        modality: "text",
        structuredOutputRequired: true,
        sensitivity: "workspace-safe",
        requiresRemoteHarness: false
      },
      readinessByProviderId: {
        provider_fake_local: "works-locally"
      },
      policy: {
        allowRemoteByteTransfer: false,
        preferredCostPolicy: "local-compute"
      }
    });

    expect(JSON.stringify(registry.list())).toBe(beforeSelection);
  });
});

function localProviderDescriptor(providerId: string, label: string) {
  return {
    providerId,
    label,
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
    diagnosticContract: ["provider-ready"],
    fakeSupport: true
  };
}

function remoteProviderDescriptor(providerId: string, label: string) {
  return {
    providerId,
    label,
    adapterVersion: "agent-provider-auth.v1",
    backendKind: "openai-compatible-api",
    modelFamilies: ["fake-remote"],
    modalities: ["text"],
    toolSupport: "function-calling",
    structuredOutputSupport: "schema-strict",
    contextLimits: { maxInputTokens: 8192, maxOutputTokens: 2048 },
    credentialRequirements: [{ credentialKind: "api-key-bearer", required: true }],
    dataHandlingNotes: "Simulates a remote API provider for readiness tests.",
    costPolicy: "metered-api",
    workspaceScopes: ["workspace"],
    approvalProfile: "remote-byte-transfer-gated",
    diagnosticContract: ["provider-ready"],
    fakeSupport: true
  };
}
