import { describe, expect, it } from "vitest";
import {
  FakeModelProvider,
  assertCredentialReferenceIsSafe,
  providerDescriptorSchema
} from "../src/provider.js";
import { isAgentSecretSafeText } from "../src/secret-safety.js";

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

    const request = {
      invocationId: "inv_fake_001",
      runId: "run_fake_001",
      modelFamily: "fake-local",
      inputArtifactHash: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
      credentialRef: { credentialRefId: "agent_credref_local", providerId: "provider_fake_local", kind: "local-no-secret" as const }
    };

    await expect(provider.invoke(request)).resolves.toMatchObject({
      outputText: "review complete",
      outputArtifactHash: expect.stringMatching(/^sha256:/)
    });

    const first = await provider.invoke(request);
    const second = await provider.invoke(request);
    const changedInvocation = await provider.invoke({ ...request, invocationId: "inv_fake_002" });
    const changedRun = await provider.invoke({ ...request, runId: "run_fake_002" });
    const changedInput = await provider.invoke({
      ...request,
      inputArtifactHash: "sha256:4444444444444444444444444444444444444444444444444444444444444444"
    });
    const changedResponse = await new FakeModelProvider({
      providerId: "provider_fake_local",
      modelFamilies: ["fake-local"],
      responseText: "different response"
    }).invoke(request);

    expect(second.outputArtifactHash).toBe(first.outputArtifactHash);
    expect(changedInvocation.outputArtifactHash).not.toBe(first.outputArtifactHash);
    expect(changedRun.outputArtifactHash).not.toBe(first.outputArtifactHash);
    expect(changedInput.outputArtifactHash).not.toBe(first.outputArtifactHash);
    expect(changedResponse.outputArtifactHash).not.toBe(first.outputArtifactHash);
  });

  it("validates optional provider input text without echoing it in fake provider results", async () => {
    const provider = new FakeModelProvider({
      providerId: "provider_fake_local",
      modelFamilies: ["fake-local"],
      responseText: "review complete"
    });
    const request = {
      invocationId: "inv_fake_001",
      runId: "run_fake_001",
      modelFamily: "fake-local",
      inputArtifactHash: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
      credentialRef: { credentialRefId: "agent_credref_local", providerId: "provider_fake_local", kind: "local-no-secret" as const },
      inputText: "Use safe context pack summaries only."
    };

    const result = await provider.invoke(request);

    expect(JSON.stringify(result)).not.toContain(request.inputText);
    await expect(provider.invoke({ ...request, inputText: "" })).rejects.toThrow();
    await expect(provider.invoke({ ...request, inputText: unsafeInputText() })).rejects.toThrow(/safe/i);
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

  it("rejects credential environment variable names in credential safe labels", () => {
    for (const safeLabel of ["OPENAI_API_KEY", "AWS_SECRET_ACCESS_KEY", "GOOGLE_APPLICATION_CREDENTIALS", "GITHUB_TOKEN"]) {
      expect(() =>
        assertCredentialReferenceIsSafe({
          credentialRefId: "agent_credref_safe",
          providerId: "provider_fake_local",
          kind: "api-key-bearer",
          safeLabel
        })
      ).toThrow(/secret/i);
    }

    expect(isAgentSecretSafeText("Local fake provider")).toBe(true);
  });

  it("rejects credential environment variable names in provider descriptors", () => {
    expect(() =>
      new FakeModelProvider({
        providerId: "provider_fake_local",
        modelFamilies: ["fake-local"],
        responseText: "review complete",
        label: "OPENAI_API_KEY"
      })
    ).toThrow(/secret|safe/i);

    expect(() =>
      new FakeModelProvider({
        providerId: "provider_fake_local",
        modelFamilies: ["fake-local"],
        responseText: "review complete",
        safeDataNotes: "Use GOOGLE_APPLICATION_CREDENTIALS for live setup"
      })
    ).toThrow(/secret|safe/i);
  });

  it("rejects unsupported model families and mismatched credential providers", async () => {
    const provider = new FakeModelProvider({
      providerId: "provider_fake_local",
      modelFamilies: ["fake-local"],
      responseText: "review complete"
    });

    const request = {
      invocationId: "inv_fake_001",
      runId: "run_fake_001",
      modelFamily: "fake-local",
      inputArtifactHash: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
      credentialRef: { credentialRefId: "agent_credref_local", providerId: "provider_fake_local", kind: "local-no-secret" as const }
    };

    await expect(provider.invoke({ ...request, modelFamily: "other-local" })).rejects.toThrow(/model family/i);
    await expect(
      provider.invoke({
        ...request,
        credentialRef: { ...request.credentialRef, providerId: "provider_other_local" }
      })
    ).rejects.toThrow(/provider/i);
  });
});

function unsafeInputText(): string {
  return ["Author", "ization", ": ", "Bear", "er", " raw-provider-material"].join("");
}
