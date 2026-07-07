import { describe, expect, it } from "vitest";
import {
  FakeModelProvider,
  assertCredentialReferenceIsSafe,
  providerDescriptorSchema
} from "../src/provider.js";

describe("agent provider abstraction", () => {
  it("describes a fake provider without becoming an agent identity", async () => {
    const provider = new FakeModelProvider({
      providerId: "provider_fake_local",
      modelFamilies: ["fake-local"],
      responseText: "deterministic response"
    });

    expect(providerDescriptorSchema.parse(provider.describe())).toMatchObject({
      providerId: "provider_fake_local",
      endpointKind: "local-engine",
      credentialKinds: ["local-no-secret"]
    });
    expect(provider.describe()).not.toHaveProperty("residentAgentId");
  });

  it("returns deterministic fake output without live credentials", async () => {
    const provider = new FakeModelProvider({
      providerId: "provider_fake_local",
      modelFamilies: ["fake-local"],
      responseText: "review complete"
    });

    await expect(
      provider.invoke({
        invocationId: "inv_fake_001",
        runId: "run_fake_001",
        modelFamily: "fake-local",
        inputArtifactHash: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
        credentialRef: { credentialRefId: "agent_credref_local", providerId: "provider_fake_local", kind: "local-no-secret" }
      })
    ).resolves.toMatchObject({
      outputText: "review complete",
      outputArtifactHash: expect.stringMatching(/^sha256:/)
    });
  });

  it("rejects secret-shaped credential reference values", () => {
    expect(() =>
      assertCredentialReferenceIsSafe({
        credentialRefId: "agent_credref_safe",
        providerId: "provider_fake_local",
        kind: "api-key-bearer",
        safeLabel: "api key sk-live-value"
      })
    ).toThrow(/secret/i);
  });
});
