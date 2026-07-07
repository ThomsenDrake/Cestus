import { describe, expect, it } from "vitest";
import { createCredentialReference, FakeSecretStore, SecretMaterial } from "../src/index.js";
import {
  buildProviderReadiness,
  providerReadinessDtoSchema
} from "../src/provider-readiness.js";
import { createProviderRegistry } from "../src/provider-registry.js";

describe("provider readiness DTOs", () => {
  it("reports setup cards without raw secret locations", async () => {
    const dto = await buildProviderReadiness({
      registry: createProviderRegistry.withDefaultsForTest(),
      credentialReferences: [
        createCredentialReference({
          credentialRefId: "agent_credref_missing_api",
          providerId: "provider_fake_remote",
          credentialKind: "api-key-bearer",
          scopeKind: "workspace",
          capabilityScopes: ["model-inference"],
          safeLabel: "Remote API key",
          authorizedBy: "actor_case_owner",
          authorizedAt: "2026-07-07T22:00:00.000Z",
          policyVersion: "agent-provider-auth.v1",
          status: "linked"
        })
      ],
      secretStore: new FakeSecretStore(),
      now: () => "2026-07-07T22:15:00.000Z"
    });

    expect(providerReadinessDtoSchema.parse(dto)).toEqual(dto);
    expect(JSON.stringify(dto)).not.toMatch(/remote-provider-material|authorization:\s*bearer|password=|private key|secret=/i);
    expect(dto.cards.map((card) => card.state)).toContain("needs-api-key");
  });

  it("marks local fake provider as working without credentials", async () => {
    const dto = await buildProviderReadiness({
      registry: createProviderRegistry.withDefaultsForTest(),
      credentialReferences: [],
      secretStore: new FakeSecretStore(),
      now: () => "2026-07-07T22:15:00.000Z"
    });

    expect(dto.cards.find((card) => card.providerId === "provider_fake_local")).toMatchObject({
      state: "works-locally",
      requiredApprovalClass: "none"
    });
  });

  it("treats non-required credential requirements as alternatives", async () => {
    const registry = createProviderRegistry();
    registry.register({
      providerId: "provider_fake_alt_remote",
      label: "Alternative remote provider",
      adapterVersion: "agent-provider-auth.v1",
      backendKind: "openai-compatible-api",
      modelFamilies: ["fake-alt-remote"],
      modalities: ["text"],
      toolSupport: "function-calling",
      structuredOutputSupport: "schema-strict",
      contextLimits: { maxInputTokens: 8192, maxOutputTokens: 2048 },
      credentialRequirements: [
        { credentialKind: "api-key-bearer", required: false },
        { credentialKind: "workload-identity-token", required: false }
      ],
      dataHandlingNotes: "Simulates a remote API provider with alternative auth modes.",
      costPolicy: "metered-api",
      workspaceScopes: ["workspace"],
      approvalProfile: "remote-prompt-only",
      diagnosticContract: ["provider-ready"],
      fakeSupport: true
    });
    const store = new FakeSecretStore();
    await store.putForTest("agent_credref_alt_api", SecretMaterial.fromTestValue("remote-provider-material"));

    const dto = await buildProviderReadiness({
      registry,
      credentialReferences: [
        createCredentialReference({
          credentialRefId: "agent_credref_alt_api",
          providerId: "provider_fake_alt_remote",
          credentialKind: "api-key-bearer",
          scopeKind: "workspace",
          capabilityScopes: ["model-inference"],
          safeLabel: "Alternative remote key",
          authorizedBy: "actor_case_owner",
          authorizedAt: "2026-07-07T22:00:00.000Z",
          policyVersion: "agent-provider-auth.v1",
          status: "linked"
        })
      ],
      secretStore: store,
      now: () => "2026-07-07T22:15:00.000Z"
    });

    expect(dto.cards.find((card) => card.providerId === "provider_fake_alt_remote")).toMatchObject({
      state: "ready",
      requiredApprovalClass: "none"
    });
  });

  it("marks remote byte transfer as approval-gated even when credentials are linked", async () => {
    const store = new FakeSecretStore();
    await store.putForTest("agent_credref_fake_remote", SecretMaterial.fromTestValue("remote-provider-material"));
    const dto = await buildProviderReadiness({
      registry: createProviderRegistry.withDefaultsForTest(),
      credentialReferences: [
        createCredentialReference({
          credentialRefId: "agent_credref_fake_remote",
          providerId: "provider_fake_remote",
          credentialKind: "api-key-bearer",
          scopeKind: "workspace",
          capabilityScopes: ["model-inference"],
          safeLabel: "Remote API key",
          authorizedBy: "actor_case_owner",
          authorizedAt: "2026-07-07T22:00:00.000Z",
          policyVersion: "agent-provider-auth.v1",
          status: "linked"
        })
      ],
      secretStore: store,
      now: () => "2026-07-07T22:15:00.000Z"
    });

    expect(dto.cards.find((card) => card.providerId === "provider_fake_remote")).toMatchObject({
      state: "requires-byte-transfer-approval",
      requiredApprovalClass: "provider-byte-transfer"
    });
  });
});
