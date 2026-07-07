import { describe, expect, it } from "vitest";
import {
  createCredentialReference,
  credentialReferenceSchema,
  credentialReferenceStatusSchema
} from "../src/credential-reference.js";
import {
  FakeSecretStore,
  SecretMaterial,
  secretStoreHealthSchema
} from "../src/secret-store.js";
import type {
  AgentCredentialReference,
  CredentialReference as FoundationCredentialReference
} from "../src/index.js";

describe("agent credential references", () => {
  it("creates secret-free credential references for provider backends", () => {
    const ref = createCredentialReference(validCredentialReferenceInput());

    expect(credentialReferenceSchema.parse(ref)).toEqual(ref);
    expect(JSON.stringify(ref)).not.toMatch(/sk-|live-secret-value|authorization:\s*bearer|password=|private key/i);
  });

  it("rejects secret-shaped labels, identifiers, and raw environment names", () => {
    expect(() =>
      createCredentialReference(validCredentialReferenceInput({
        safeLabel: "paste api key here",
        credentialRefId: "agent_credref_bad"
      }))
    ).toThrow(/secret-safe/i);
  });

  it("rejects raw environment names embedded in credential and provider identifiers", () => {
    expect(() =>
      createCredentialReference(validCredentialReferenceInput({
        credentialRefId: "agent_credref_OPENAI_API_KEY"
      }))
    ).toThrow(/secret-safe/i);

    expect(() =>
      createCredentialReference(validCredentialReferenceInput({
        providerId: "provider_OPENAI_API_KEY"
      }))
    ).toThrow(/secret-safe/i);
  });

  it("rejects too-short credential authorizers", () => {
    expect(() =>
      createCredentialReference(validCredentialReferenceInput({
        authorizedBy: "a"
      }))
    ).toThrow();
  });

  it("keeps secret material non-serializable", async () => {
    const store = new FakeSecretStore();
    await store.putForTest("agent_credref_openai_api_default", SecretMaterial.fromTestValue("live-secret-value"));
    const material = await store.resolve("agent_credref_openai_api_default");

    expect(material?.exposeForProviderAdapter()).toBe("live-secret-value");
    expect(JSON.stringify(material)).toBe("{}");
    expect(String(material)).toBe("[SecretMaterial]");
  });

  it("keeps the package root provider credential reference type intact", () => {
    const foundationCredentialRef: FoundationCredentialReference = {
      credentialRefId: "agent_credref_fake_local",
      providerId: "provider_fake_local",
      kind: "local-no-secret"
    };
    const agentCredentialRef: AgentCredentialReference = createCredentialReference(validCredentialReferenceInput());

    expect(foundationCredentialRef.kind).toBe("local-no-secret");
    expect(agentCredentialRef.credentialKind).toBe("api-key-bearer");
  });

  it("reports secret-store health without exposing binding details", async () => {
    const store = new FakeSecretStore();
    const missing = await store.health("agent_credref_missing");

    expect(secretStoreHealthSchema.parse(missing)).toMatchObject({
      credentialRefId: "agent_credref_missing",
      status: "missing-binding"
    });
    expect(JSON.stringify(missing)).not.toMatch(/live-secret-value|authorization:\s*bearer|password=|private key|secret=/i);
    expect(credentialReferenceStatusSchema.options).toContain("missing-binding");
  });

  it("rejects raw environment names before fake secret-store health serialization", async () => {
    const store = new FakeSecretStore();

    await expect(store.health("agent_credref_OPENAI_API_KEY")).rejects.toThrow(/secret-safe/i);
  });
});

function validCredentialReferenceInput(overrides: Partial<Parameters<typeof createCredentialReference>[0]> = {}) {
  return {
    credentialRefId: "agent_credref_openai_api_default",
    providerId: "provider_openai_api_default",
    credentialKind: "api-key-bearer",
    scopeKind: "workspace",
    capabilityScopes: ["model-inference"],
    safeLabel: "OpenAI API reference",
    authorizedBy: "actor_case_owner",
    authorizedAt: "2026-07-07T22:00:00.000Z",
    policyVersion: "agent-provider-auth.v1",
    status: "linked",
    ...overrides
  } satisfies Parameters<typeof createCredentialReference>[0];
}
