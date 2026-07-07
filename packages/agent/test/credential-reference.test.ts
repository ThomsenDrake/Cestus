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

describe("agent credential references", () => {
  it("creates secret-free credential references for provider backends", () => {
    const ref = createCredentialReference({
      credentialRefId: "agent_credref_openai_api_default",
      providerId: "provider_openai_api_default",
      credentialKind: "api-key-bearer",
      scopeKind: "workspace",
      capabilityScopes: ["model-inference"],
      safeLabel: "OpenAI API reference",
      authorizedBy: "actor_case_owner",
      authorizedAt: "2026-07-07T22:00:00.000Z",
      policyVersion: "agent-provider-auth.v1",
      status: "linked"
    });

    expect(credentialReferenceSchema.parse(ref)).toEqual(ref);
    expect(JSON.stringify(ref)).not.toMatch(/sk-|live-secret-value|authorization:\s*bearer|password=|private key/i);
  });

  it("rejects secret-shaped labels, identifiers, and raw environment names", () => {
    expect(() =>
      createCredentialReference({
        credentialRefId: "agent_credref_bad",
        providerId: "provider_openai_api_default",
        credentialKind: "api-key-bearer",
        scopeKind: "workspace",
        capabilityScopes: ["model-inference"],
        safeLabel: "paste api key here",
        authorizedBy: "actor_case_owner",
        authorizedAt: "2026-07-07T22:00:00.000Z",
        policyVersion: "agent-provider-auth.v1",
        status: "linked"
      })
    ).toThrow(/secret-safe/i);
  });

  it("keeps secret material non-serializable", async () => {
    const store = new FakeSecretStore();
    await store.putForTest("agent_credref_openai_api_default", SecretMaterial.fromTestValue("live-secret-value"));
    const material = await store.resolve("agent_credref_openai_api_default");

    expect(material?.exposeForProviderAdapter()).toBe("live-secret-value");
    expect(JSON.stringify(material)).toBe("{}");
    expect(String(material)).toBe("[SecretMaterial]");
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
});
