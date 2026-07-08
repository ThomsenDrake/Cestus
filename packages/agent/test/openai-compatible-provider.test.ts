import { describe, expect, it } from "vitest";
import {
  createNousPortalProvider,
  OpenAICompatibleChatProvider
} from "../src/openai-compatible-provider.js";
import {
  SecretMaterial,
  StaticSecretStore
} from "../src/secret-store.js";

const inputArtifactHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("OpenAI-compatible chat provider", () => {
  it("invokes a chat completions endpoint with bearer auth from the secret store", async () => {
    const calls: CapturedFetchCall[] = [];
    const provider = new OpenAICompatibleChatProvider({
      providerId: "provider_nous_portal",
      label: "Nous Portal",
      endpointUrl: "https://inference-api.nousresearch.com/v1/chat/completions",
      modelId: "tencent/hy3:free",
      credentialRefId: "agent_credref_nous_portal",
      secretStore: secretStoreWithNousKey(),
      fetch: captureFetch(calls, {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: "A careful answer." } }],
          usage: { prompt_tokens: 7, completion_tokens: 4 }
        })
      }),
      resolveInputText: async () => "Explain the public record."
    });

    const result = await provider.invoke({
      invocationId: "inv_nous_001",
      runId: "run_nous_001",
      modelFamily: "tencent/hy3:free",
      inputArtifactHash,
      credentialRef: {
        credentialRefId: "agent_credref_nous_portal",
        providerId: "provider_nous_portal",
        kind: "api-key-bearer"
      }
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://inference-api.nousresearch.com/v1/chat/completions");
    expect(calls[0]?.headers).toMatchObject({
      authorization: "Bearer test-provider-key",
      "content-type": "application/json"
    });
    expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({
      model: "tencent/hy3:free",
      messages: [
        { role: "system", content: "You are the resident Cestus Agent. Answer with concise, evidence-aware reasoning." },
        { role: "user", content: "Explain the public record." }
      ],
      max_tokens: 512
    });
    expect(result).toMatchObject({
      outputText: "A careful answer.",
      outputArtifactHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      usage: { inputUnits: 7, outputUnits: 4 }
    });
    expect(JSON.stringify(provider.describe())).not.toMatch(/test-provider-key/i);
    expect(JSON.stringify(result)).not.toMatch(/test-provider-key|authorization|bearer/i);
  });

  it("describes Nous Portal as an OpenAI-compatible backend, not an agent identity", () => {
    const provider = createNousPortalProvider({
      secretStore: secretStoreWithNousKey(),
      fetch: captureFetch([], successfulResponse()),
      resolveInputText: async () => "hello"
    });

    expect(provider.describe()).toMatchObject({
      providerId: "provider_nous_portal",
      label: "Nous Portal",
      endpointKind: "openai-compatible-api",
      modelFamilies: ["tencent/hy3:free"],
      credentialKinds: ["api-key-bearer"]
    });
    expect(provider.describe()).not.toHaveProperty("residentAgentId");
    expect(JSON.stringify(provider.describe())).not.toMatch(/test-provider-key/i);
  });

  it("fails closed without exposing provider secrets or raw response bodies", async () => {
    const provider = new OpenAICompatibleChatProvider({
      providerId: "provider_nous_portal",
      label: "Nous Portal",
      endpointUrl: "https://inference-api.nousresearch.com/v1/chat/completions",
      modelId: "tencent/hy3:free",
      credentialRefId: "agent_credref_nous_portal",
      secretStore: secretStoreWithNousKey(),
      fetch: captureFetch([], {
        ok: false,
        status: 401,
        json: async () => ({ error: { message: "Authorization: Bearer test-provider-key rejected" } })
      }),
      resolveInputText: async () => "Explain the public record."
    });

    await expect(provider.invoke({
      invocationId: "inv_nous_401",
      runId: "run_nous_001",
      modelFamily: "tencent/hy3:free",
      inputArtifactHash,
      credentialRef: {
        credentialRefId: "agent_credref_nous_portal",
        providerId: "provider_nous_portal",
        kind: "api-key-bearer"
      }
    })).rejects.toThrow("Provider request failed.");
  });

  it("rejects malformed OpenAI-compatible responses", async () => {
    const provider = createNousPortalProvider({
      secretStore: secretStoreWithNousKey(),
      fetch: captureFetch([], {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: "" } }] })
      }),
      resolveInputText: async () => "Explain the public record."
    });

    await expect(provider.invoke({
      invocationId: "inv_nous_bad_response",
      runId: "run_nous_001",
      modelFamily: "tencent/hy3:free",
      inputArtifactHash,
      credentialRef: {
        credentialRefId: "agent_credref_nous_portal",
        providerId: "provider_nous_portal",
        kind: "api-key-bearer"
      }
    })).rejects.toThrow("Provider returned invalid output.");
  });
});

interface CapturedFetchCall {
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly body: string;
}

interface FakeFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

function secretStoreWithNousKey(): StaticSecretStore {
  return new StaticSecretStore({
    agent_credref_nous_portal: SecretMaterial.fromRuntimeValue("test-provider-key")
  });
}

function successfulResponse(): FakeFetchResponse {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: "Hello from Nous." } }],
      usage: { prompt_tokens: 3, completion_tokens: 4 }
    })
  };
}

function captureFetch(calls: CapturedFetchCall[], response: FakeFetchResponse) {
  return async (url: string | URL, init?: RequestInit): Promise<Response> => {
    const headers = normalizeHeaders(init?.headers);
    calls.push({
      url: String(url),
      headers,
      body: String(init?.body ?? "")
    });
    return response as Response;
  };
}

function normalizeHeaders(headers: HeadersInit | undefined): Record<string, string> {
  if (headers === undefined) {
    return {};
  }
  if (headers instanceof Headers) {
    return Object.fromEntries([...headers.entries()].map(([key, value]) => [key.toLowerCase(), value]));
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers.map(([key, value]) => [key.toLowerCase(), value]));
  }
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)]));
}
