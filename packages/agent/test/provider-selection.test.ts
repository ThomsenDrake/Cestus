import { describe, expect, it } from "vitest";
import { createProviderRegistry } from "../src/provider-registry.js";
import { selectProviderForTask } from "../src/provider-selection.js";

describe("provider selection policy", () => {
  it("selects provider and model from policy and capability registry", () => {
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
      modelId: "fake-remote",
      capabilityIds: [
        "capability_provider_provider_fake_remote",
        "capability_model_fake-remote",
        "capability_adapter_agent-provider-auth.v1"
      ]
    });
  });

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

  it("requires approval for ready remote prompt-only providers handling sensitive evidence", () => {
    const registry = createProviderRegistry();
    registry.register(remotePromptOnlyProviderDescriptor("provider_remote_prompt_only", "Remote prompt-only provider"));

    const approvedTransfer = selectProviderForTask({
      registry,
      task: {
        modality: "text",
        structuredOutputRequired: true,
        sensitivity: "sensitive-evidence",
        requiresRemoteHarness: false
      },
      readinessByProviderId: {
        provider_remote_prompt_only: "ready"
      },
      policy: {
        allowRemoteByteTransfer: true,
        preferredCostPolicy: "metered-api"
      }
    });

    expect(approvedTransfer).toMatchObject({
      ok: true,
      providerId: "provider_remote_prompt_only",
      approvalClass: "provider-byte-transfer",
      safeReason: "approval-required"
    });

    const blockedTransfer = selectProviderForTask({
      registry,
      task: {
        modality: "text",
        structuredOutputRequired: true,
        sensitivity: "sensitive-evidence",
        requiresRemoteHarness: false
      },
      readinessByProviderId: {
        provider_remote_prompt_only: "ready"
      },
      policy: {
        allowRemoteByteTransfer: false,
        preferredCostPolicy: "metered-api"
      }
    });

    expect(blockedTransfer).toMatchObject({
      ok: false,
      category: "provider-policy-blocked"
    });
  });

  it("prefers local providers for sensitive local-only tasks even when remote transfer is allowed", () => {
    const selected = selectProviderForTask({
      registry: createProviderRegistry.withDefaultsForTest(),
      task: {
        modality: "text",
        structuredOutputRequired: true,
        sensitivity: "sensitive-local-only",
        requiresRemoteHarness: false
      },
      readinessByProviderId: {
        provider_fake_local: "works-locally",
        provider_fake_remote: "requires-byte-transfer-approval"
      },
      policy: {
        allowRemoteByteTransfer: true,
        preferredCostPolicy: "metered-api"
      }
    });

    expect(selected).toMatchObject({
      ok: true,
      providerId: "provider_fake_local",
      approvalClass: "none"
    });
  });

  it("blocks remote providers for sensitive local-only tasks when no local provider is ready", () => {
    const registry = createProviderRegistry();
    registry.register(remoteProviderDescriptor("provider_remote_only", "Remote only provider"));

    const selected = selectProviderForTask({
      registry,
      task: {
        modality: "text",
        structuredOutputRequired: true,
        sensitivity: "sensitive-local-only",
        requiresRemoteHarness: false
      },
      readinessByProviderId: {
        provider_remote_only: "requires-byte-transfer-approval"
      },
      policy: {
        allowRemoteByteTransfer: true,
        preferredCostPolicy: "metered-api"
      }
    });

    expect(selected).toMatchObject({
      ok: false,
      category: "provider-policy-blocked"
    });
  });

  it("ranks provider byte-transfer approval ahead of harness workspace approval", () => {
    const registry = createProviderRegistry();
    registry.register(remoteProviderDescriptor("provider_z_remote_api", "Remote API provider"));
    registry.register(harnessProviderDescriptor("provider_a_remote_harness", "Remote harness provider"));

    const selected = selectProviderForTask({
      registry,
      task: {
        modality: "text",
        structuredOutputRequired: false,
        sensitivity: "workspace-safe",
        requiresRemoteHarness: false
      },
      readinessByProviderId: {
        provider_z_remote_api: "requires-byte-transfer-approval",
        provider_a_remote_harness: "requires-byte-transfer-approval"
      },
      policy: {
        allowRemoteByteTransfer: true,
        preferredCostPolicy: "metered-api"
      }
    });

    expect(selected).toMatchObject({
      ok: true,
      providerId: "provider_z_remote_api",
      approvalClass: "provider-byte-transfer"
    });
  });

  it("rejects unknown task sensitivity values", () => {
    expect(() =>
      selectProviderForTask({
        registry: createProviderRegistry.withDefaultsForTest(),
        task: {
          modality: "text",
          structuredOutputRequired: true,
          sensitivity: "sensitive-ish" as never,
          requiresRemoteHarness: false
        },
        readinessByProviderId: {
          provider_fake_local: "works-locally"
        },
        policy: {
          allowRemoteByteTransfer: false,
          preferredCostPolicy: "local-compute"
        }
      })
    ).toThrow();
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

function remotePromptOnlyProviderDescriptor(providerId: string, label: string) {
  return {
    ...remoteProviderDescriptor(providerId, label),
    approvalProfile: "remote-prompt-only",
    diagnosticContract: ["provider-ready"]
  };
}

function harnessProviderDescriptor(providerId: string, label: string) {
  return {
    providerId,
    label,
    adapterVersion: "agent-provider-auth.v1",
    backendKind: "xai-harness",
    modelFamilies: ["fake-harness"],
    modalities: ["text"],
    toolSupport: "harness-tools",
    structuredOutputSupport: "harness-mediated",
    contextLimits: { maxInputTokens: 8192, maxOutputTokens: 2048 },
    credentialRequirements: [{ credentialKind: "subscription-oauth", required: true }],
    dataHandlingNotes: "Simulates an official harness with workspace approval requirements.",
    costPolicy: "metered-api",
    workspaceScopes: ["workspace"],
    approvalProfile: "harness-workspace-gated",
    diagnosticContract: ["provider-ready"],
    fakeSupport: true
  };
}
