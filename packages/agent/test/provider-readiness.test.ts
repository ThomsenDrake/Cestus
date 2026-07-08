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

  it("requires companion required credentials and one alternative credential", async () => {
    const registry = createProviderRegistry();
    registry.register({
      providerId: "provider_fake_companion_auth",
      label: "Companion auth provider",
      adapterVersion: "agent-provider-auth.v1",
      backendKind: "xai-api",
      modelFamilies: ["fake-companion-auth"],
      modalities: ["text"],
      toolSupport: "function-calling",
      structuredOutputSupport: "schema-strict",
      contextLimits: { maxInputTokens: 8192, maxOutputTokens: 2048 },
      credentialRequirements: [
        { credentialKind: "mtls-certificate", required: true },
        { credentialKind: "api-key-bearer", required: false },
        { credentialKind: "workload-identity-token", required: false }
      ],
      dataHandlingNotes: "Simulates a remote API provider with companion mTLS.",
      costPolicy: "metered-api",
      workspaceScopes: ["workspace"],
      approvalProfile: "remote-prompt-only",
      diagnosticContract: ["needs-api-key", "needs-workload-identity", "needs-mtls-binding"],
      fakeSupport: true
    });
    const store = new FakeSecretStore();
    await store.putForTest("agent_credref_companion_mtls", SecretMaterial.fromTestValue("mtls-provider-material"));

    const dto = await buildProviderReadiness({
      registry,
      credentialReferences: [
        createCredentialReference({
          credentialRefId: "agent_credref_companion_mtls",
          providerId: "provider_fake_companion_auth",
          credentialKind: "mtls-certificate",
          scopeKind: "workspace",
          capabilityScopes: ["model-inference"],
          safeLabel: "Companion mTLS binding",
          authorizedBy: "actor_case_owner",
          authorizedAt: "2026-07-07T22:00:00.000Z",
          policyVersion: "agent-provider-auth.v1",
          status: "linked"
        })
      ],
      secretStore: store,
      now: () => "2026-07-07T22:15:00.000Z"
    });

    expect(dto.cards.find((card) => card.providerId === "provider_fake_companion_auth")).toMatchObject({
      state: "needs-api-key",
      requiredApprovalClass: "none"
    });
  });

  it("returns diagnostics for mixed-case hyphenated provider IDs", async () => {
    const registry = createProviderRegistry();
    registry.register({
      providerId: "provider_Fake-remote",
      label: "Hyphenated remote provider",
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
      diagnosticContract: ["needs-api-key"],
      fakeSupport: true
    });

    const dto = await buildProviderReadiness({
      registry,
      credentialReferences: [],
      secretStore: new FakeSecretStore(),
      now: () => "2026-07-07T22:15:00.000Z"
    });

    expect(providerReadinessDtoSchema.parse(dto)).toEqual(dto);
    expect(dto.cards.find((card) => card.providerId === "provider_Fake-remote")).toMatchObject({
      state: "needs-api-key"
    });
    expect(dto.diagnostics.find((diagnostic) => diagnostic.providerId === "provider_Fake-remote")?.diagnosticId)
      .toMatch(/^diag_fake_remote_needs_api_key$/);
  });

  it("uses a healthy rotated credential when an older same-kind reference is expired", async () => {
    const registry = createProviderRegistry();
    registry.register({
      providerId: "provider_fake_rotated_remote",
      label: "Rotated remote provider",
      adapterVersion: "agent-provider-auth.v1",
      backendKind: "openai-compatible-api",
      modelFamilies: ["fake-rotated-remote"],
      modalities: ["text"],
      toolSupport: "function-calling",
      structuredOutputSupport: "schema-strict",
      contextLimits: { maxInputTokens: 8192, maxOutputTokens: 2048 },
      credentialRequirements: [{ credentialKind: "api-key-bearer", required: true }],
      dataHandlingNotes: "Simulates a remote API provider with rotated credentials.",
      costPolicy: "metered-api",
      workspaceScopes: ["workspace"],
      approvalProfile: "remote-byte-transfer-gated",
      diagnosticContract: ["provider-ready"],
      fakeSupport: true
    });
    const store = new FakeSecretStore();
    await store.putForTest("agent_credref_api_rotated", SecretMaterial.fromTestValue("remote-provider-material"));

    const dto = await buildProviderReadiness({
      registry,
      credentialReferences: [
        createCredentialReference({
          credentialRefId: "agent_credref_api_expired",
          providerId: "provider_fake_rotated_remote",
          credentialKind: "api-key-bearer",
          scopeKind: "workspace",
          capabilityScopes: ["model-inference"],
          safeLabel: "Expired remote key",
          authorizedBy: "actor_case_owner",
          authorizedAt: "2026-07-07T21:00:00.000Z",
          expiresAt: "2026-07-07T22:00:00.000Z",
          policyVersion: "agent-provider-auth.v1",
          status: "expired"
        }),
        createCredentialReference({
          credentialRefId: "agent_credref_api_rotated",
          providerId: "provider_fake_rotated_remote",
          credentialKind: "api-key-bearer",
          scopeKind: "workspace",
          capabilityScopes: ["model-inference"],
          safeLabel: "Rotated remote key",
          authorizedBy: "actor_case_owner",
          authorizedAt: "2026-07-07T22:00:00.000Z",
          policyVersion: "agent-provider-auth.v1",
          status: "linked"
        })
      ],
      secretStore: store,
      now: () => "2026-07-07T22:15:00.000Z"
    });

    expect(dto.cards.find((card) => card.providerId === "provider_fake_rotated_remote")).toMatchObject({
      state: "requires-byte-transfer-approval",
      requiredApprovalClass: "provider-byte-transfer"
    });
  });

  it("fails closed when a linked credential reference expires before secret-store health is trusted", async () => {
    const registry = createProviderRegistry();
    registry.register({
      providerId: "provider_fake_expiring_remote",
      label: "Expiring remote provider",
      adapterVersion: "agent-provider-auth.v1",
      backendKind: "openai-compatible-api",
      modelFamilies: ["fake-expiring-remote"],
      modalities: ["text"],
      toolSupport: "function-calling",
      structuredOutputSupport: "schema-strict",
      contextLimits: { maxInputTokens: 8192, maxOutputTokens: 2048 },
      credentialRequirements: [{ credentialKind: "api-key-bearer", required: true }],
      dataHandlingNotes: "Simulates a remote API provider with expiring credentials.",
      costPolicy: "metered-api",
      workspaceScopes: ["workspace"],
      approvalProfile: "remote-byte-transfer-gated",
      diagnosticContract: ["credential-expired"],
      fakeSupport: true
    });
    const store = new FakeSecretStore();
    await store.putForTest("agent_credref_api_expiring", SecretMaterial.fromTestValue("remote-provider-material"));

    const dto = await buildProviderReadiness({
      registry,
      credentialReferences: [
        createCredentialReference({
          credentialRefId: "agent_credref_api_expiring",
          providerId: "provider_fake_expiring_remote",
          credentialKind: "api-key-bearer",
          scopeKind: "workspace",
          capabilityScopes: ["model-inference"],
          safeLabel: "Expiring remote key",
          authorizedBy: "actor_case_owner",
          authorizedAt: "2026-07-07T21:00:00.000Z",
          expiresAt: "2026-07-07T22:00:00.000Z",
          policyVersion: "agent-provider-auth.v1",
          status: "linked"
        })
      ],
      secretStore: store,
      now: () => "2026-07-07T22:15:00.000Z"
    });

    expect(providerReadinessDtoSchema.parse(dto)).toEqual(dto);
    expect(JSON.stringify(dto)).not.toMatch(/remote-provider-material|authorization:\s*bearer|password=|private key|secret=/i);
    expect(dto.cards.find((card) => card.providerId === "provider_fake_expiring_remote")).toMatchObject({
      state: "credential-expired"
    });
    expect(dto.diagnostics.find((diagnostic) => diagnostic.providerId === "provider_fake_expiring_remote"))
      .toMatchObject({
        category: "credential-expired",
        credentialRefId: "agent_credref_api_expiring"
      });
  });

  it("fails closed when a linked credential reference has a malformed expiration timestamp", async () => {
    const registry = createProviderRegistry();
    registry.register({
      providerId: "provider_fake_malformed_expiry_remote",
      label: "Malformed expiry remote provider",
      adapterVersion: "agent-provider-auth.v1",
      backendKind: "openai-compatible-api",
      modelFamilies: ["fake-malformed-expiry-remote"],
      modalities: ["text"],
      toolSupport: "function-calling",
      structuredOutputSupport: "schema-strict",
      contextLimits: { maxInputTokens: 8192, maxOutputTokens: 2048 },
      credentialRequirements: [{ credentialKind: "api-key-bearer", required: true }],
      dataHandlingNotes: "Simulates a remote API provider with malformed expiry metadata.",
      costPolicy: "metered-api",
      workspaceScopes: ["workspace"],
      approvalProfile: "remote-byte-transfer-gated",
      diagnosticContract: ["credential-expired"],
      fakeSupport: true
    });
    const store = new FakeSecretStore();
    await store.putForTest("agent_credref_api_malformed_expiry", SecretMaterial.fromTestValue("remote-provider-material"));
    const validReference = createCredentialReference({
      credentialRefId: "agent_credref_api_malformed_expiry",
      providerId: "provider_fake_malformed_expiry_remote",
      credentialKind: "api-key-bearer",
      scopeKind: "workspace",
      capabilityScopes: ["model-inference"],
      safeLabel: "Malformed expiry remote key",
      authorizedBy: "actor_case_owner",
      authorizedAt: "2026-07-07T21:00:00.000Z",
      policyVersion: "agent-provider-auth.v1",
      status: "linked"
    });

    const dto = await buildProviderReadiness({
      registry,
      credentialReferences: [
        {
          ...validReference,
          expiresAt: "not-a-date"
        }
      ],
      secretStore: store,
      now: () => "2026-07-07T22:15:00.000Z"
    });

    expect(providerReadinessDtoSchema.parse(dto)).toEqual(dto);
    expect(JSON.stringify(dto)).not.toMatch(/remote-provider-material|authorization:\s*bearer|password=|private key|secret=/i);
    expect(dto.cards.find((card) => card.providerId === "provider_fake_malformed_expiry_remote")).toMatchObject({
      state: "credential-expired"
    });
    expect(dto.diagnostics.find((diagnostic) => diagnostic.providerId === "provider_fake_malformed_expiry_remote"))
      .toMatchObject({
        category: "credential-expired",
        credentialRefId: "agent_credref_api_malformed_expiry"
      });
  });

  it("reports harness workspace approval for harness-gated providers", async () => {
    const registry = createProviderRegistry();
    registry.register({
      providerId: "provider_fake_harness_ready",
      label: "Ready harness provider",
      adapterVersion: "agent-provider-auth.v1",
      backendKind: "xai-harness",
      modelFamilies: ["fake-harness"],
      modalities: ["text"],
      toolSupport: "harness-tools",
      structuredOutputSupport: "harness-mediated",
      contextLimits: { maxInputTokens: 8192, maxOutputTokens: 2048 },
      credentialRequirements: [{ credentialKind: "subscription-oauth", required: true }],
      dataHandlingNotes: "Simulates an official harness with workspace approval requirements.",
      costPolicy: "subscription-entitlement",
      workspaceScopes: ["workspace"],
      approvalProfile: "harness-workspace-gated",
      diagnosticContract: ["provider-ready"],
      fakeSupport: true
    });
    const store = new FakeSecretStore();
    await store.putForTest("agent_credref_harness_ready", SecretMaterial.fromTestValue("harness-provider-material"));

    const dto = await buildProviderReadiness({
      registry,
      credentialReferences: [
        createCredentialReference({
          credentialRefId: "agent_credref_harness_ready",
          providerId: "provider_fake_harness_ready",
          credentialKind: "subscription-oauth",
          scopeKind: "workspace",
          capabilityScopes: ["harness-execution"],
          safeLabel: "Harness sign-in",
          authorizedBy: "actor_case_owner",
          authorizedAt: "2026-07-07T22:00:00.000Z",
          policyVersion: "agent-provider-auth.v1",
          status: "linked"
        })
      ],
      secretStore: store,
      now: () => "2026-07-07T22:15:00.000Z"
    });

    expect(dto.cards.find((card) => card.providerId === "provider_fake_harness_ready")).toMatchObject({
      state: "requires-byte-transfer-approval",
      requiredApprovalClass: "harness-workspace"
    });
  });

  it("freezes readiness DTOs and nested arrays", async () => {
    const dto = await buildProviderReadiness({
      registry: createProviderRegistry.withDefaultsForTest(),
      credentialReferences: [],
      secretStore: new FakeSecretStore(),
      now: () => "2026-07-07T22:15:00.000Z"
    });

    const localCard = dto.cards.find((card) => card.providerId === "provider_fake_local");
    expect(localCard).toBeDefined();
    expect(() => dto.cards.push(localCard!)).toThrow();
    expect(() => localCard!.capabilitySummary.push("mutated")).toThrow();
    expect(() => localCard!.credentialKindSummary.push("api-key-bearer")).toThrow();
    expect(() => localCard!.safeActionIds.push("action_mutate")).toThrow();
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
