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
const providerInputText = "Use the audited prompt artifact context to answer with provenance.";
const placeholderInputText = `Cestus local runtime prompt artifact ${inputArtifactHash}`;
const fixtureProviderMaterial = "fixture-material-for-adapter-tests";

describe("OpenAI-compatible chat provider", () => {
  it("invokes a chat completions endpoint with credential material from the fixture store", async () => {
    const calls: CapturedFetchCall[] = [];
    const provider = new OpenAICompatibleChatProvider({
      providerId: "provider_nous_portal",
      label: "Nous Portal",
      endpointUrl: "https://inference-api.nousresearch.com/v1/chat/completions",
      modelId: "tencent/hy3:free",
      credentialRefId: "agent_credref_nous_portal",
      secretStore: fixtureStoreForNous(),
      fetch: captureFetch(calls, {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{
            finish_reason: "stop",
            message: { role: "assistant", content: "A careful answer.", refusal: null }
          }],
          usage: { prompt_tokens: 7, completion_tokens: 4 }
        })
      })
    });

    const result = await provider.invoke({
      invocationId: "inv_nous_001",
      runId: "run_nous_001",
      modelFamily: "tencent/hy3:free",
      inputArtifactHash,
      inputText: providerInputText,
      credentialRef: {
        credentialRefId: "agent_credref_nous_portal",
        providerId: "provider_nous_portal",
        kind: "api-key-bearer"
      }
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://inference-api.nousresearch.com/v1/chat/completions");
    expect(calls[0]?.headers).toMatchObject({
      "content-type": "application/json"
    });
    expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({
      model: "tencent/hy3:free",
      messages: [
        { role: "system", content: "You are the resident Cestus Agent. Answer with concise, evidence-aware reasoning." },
        { role: "user", content: providerInputText }
      ],
      max_tokens: 512
    });
    expect(result).toMatchObject({
      outputText: "A careful answer.",
      outputArtifactHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      usage: { inputUnits: 7, outputUnits: 4 }
    });
    expect(JSON.stringify(provider.describe())).not.toContain(fixtureProviderMaterial);
    expect(JSON.stringify(result)).not.toContain(fixtureProviderMaterial);
  });

  it("describes Nous Portal as an OpenAI-compatible backend, not an agent identity", () => {
    const provider = createNousPortalProvider({
      secretStore: fixtureStoreForNous(),
      fetch: captureFetch([], successfulResponse())
    });

    expect(provider.describe()).toMatchObject({
      providerId: "provider_nous_portal",
      label: "Nous Portal",
      endpointKind: "openai-compatible-api",
      modelFamilies: ["tencent/hy3:free"],
      credentialKinds: ["api-key-bearer"]
    });
    expect(provider.describe()).not.toHaveProperty("residentAgentId");
    expect(JSON.stringify(provider.describe())).not.toContain(fixtureProviderMaterial);
  });

  it("adds required secret-safe Nous Portal request tags", async () => {
    const calls: CapturedFetchCall[] = [];
    const provider = createNousPortalProvider({
      secretStore: fixtureStoreForNous(),
      fetch: captureFetch(calls, successfulResponse())
    });

    await provider.invoke({
      invocationId: "inv_nous_tags",
      runId: "run_nous_001",
      modelFamily: "tencent/hy3:free",
      inputArtifactHash,
      inputText: providerInputText,
      credentialRef: {
        credentialRefId: "agent_credref_nous_portal",
        providerId: "provider_nous_portal",
        kind: "api-key-bearer"
      }
    });

    expect(JSON.parse(calls[0]?.body ?? "{}")).toMatchObject({
      include_reasoning: false,
      reasoning: { effort: "none" },
      tags: [
        "user=cestus-local",
        "product=cestus",
        "client=cestus-agent-v0.1.0"
      ]
    });
    expect(calls[0]?.body).not.toContain(fixtureProviderMaterial);
  });

  it("sends deterministic Nous sampling without claiming structured output support", async () => {
    const calls: CapturedFetchCall[] = [];
    const provider = createNousPortalProvider({
      secretStore: fixtureStoreForNous(),
      fetch: captureFetch(calls, successfulResponse())
    });

    await provider.invoke({
      invocationId: "inv_nous_temperature_zero",
      runId: "run_nous_001",
      modelFamily: "tencent/hy3:free",
      inputArtifactHash,
      inputText: providerInputText,
      credentialRef: {
        credentialRefId: "agent_credref_nous_portal",
        providerId: "provider_nous_portal",
        kind: "api-key-bearer"
      }
    });

    const body = JSON.parse(calls[0]?.body ?? "{}") as Record<string, unknown>;
    expect(body.temperature).toBe(0);
    expect(body).not.toHaveProperty("response_format");
    expect(provider.describe()).toMatchObject({
      supportsStructuredOutput: false,
      supportsToolCalling: false
    });
  });

  it("validates configured sampling temperature while preserving zero", () => {
    expect(() => new OpenAICompatibleChatProvider({
      providerId: "provider_nous_portal",
      label: "Nous Portal",
      endpointUrl: "https://inference-api.nousresearch.com/v1/chat/completions",
      modelId: "tencent/hy3:free",
      credentialRefId: "agent_credref_nous_portal",
      secretStore: fixtureStoreForNous(),
      fetch: captureFetch([], successfulResponse()),
      temperature: 0
    })).not.toThrow();

    for (const temperature of [-0.1, 2.1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => new OpenAICompatibleChatProvider({
        providerId: "provider_nous_portal",
        label: "Nous Portal",
        endpointUrl: "https://inference-api.nousresearch.com/v1/chat/completions",
        modelId: "tencent/hy3:free",
        credentialRefId: "agent_credref_nous_portal",
        secretStore: fixtureStoreForNous(),
        fetch: captureFetch([], successfulResponse()),
        temperature
      })).toThrow(/temperature/i);
    }
  });

  it("requires runtime-supplied input text before any remote request", async () => {
    const calls: CapturedFetchCall[] = [];
    const provider = createNousPortalProvider({
      secretStore: fixtureStoreForNous(),
      fetch: captureFetch(calls, successfulResponse())
    });

    await expect(provider.invoke({
      invocationId: "inv_nous_missing_input_text",
      runId: "run_nous_001",
      modelFamily: "tencent/hy3:free",
      inputArtifactHash,
      credentialRef: {
        credentialRefId: "agent_credref_nous_portal",
        providerId: "provider_nous_portal",
        kind: "api-key-bearer"
      }
    })).rejects.toThrow(/inputText/i);

    expect(calls).toHaveLength(0);
  });

  it("sends exact audited artifact text instead of a hash placeholder", async () => {
    const calls: CapturedFetchCall[] = [];
    const provider = createNousPortalProvider({
      secretStore: fixtureStoreForNous(),
      fetch: captureFetch(calls, successfulResponse())
    });

    await provider.invoke({
      invocationId: "inv_nous_artifact_text",
      runId: "run_nous_001",
      modelFamily: "tencent/hy3:free",
      inputArtifactHash,
      inputText: providerInputText,
      credentialRef: {
        credentialRefId: "agent_credref_nous_portal",
        providerId: "provider_nous_portal",
        kind: "api-key-bearer"
      }
    });

    const body = JSON.parse(calls[0]?.body ?? "{}") as { messages?: Array<{ role: string; content: string }> };

    expect(body.messages?.find((message) => message.role === "user")?.content).toBe(providerInputText);
    expect(calls[0]?.body).toContain(providerInputText);
    expect(calls[0]?.body).not.toContain(placeholderInputText);
  });

  it("fails closed without exposing unsuccessful response bodies", async () => {
    const provider = new OpenAICompatibleChatProvider({
      providerId: "provider_nous_portal",
      label: "Nous Portal",
      endpointUrl: "https://inference-api.nousresearch.com/v1/chat/completions",
      modelId: "tencent/hy3:free",
      credentialRefId: "agent_credref_nous_portal",
      secretStore: fixtureStoreForNous(),
      fetch: captureFetch([], {
        ok: false,
        status: 401,
        json: async () => ({ status: "declined", code: "fixture_declined" })
      })
    });

    await expect(provider.invoke({
      invocationId: "inv_nous_401",
      runId: "run_nous_001",
      modelFamily: "tencent/hy3:free",
      inputArtifactHash,
      inputText: providerInputText,
      credentialRef: {
        credentialRefId: "agent_credref_nous_portal",
        providerId: "provider_nous_portal",
        kind: "api-key-bearer"
      }
    })).rejects.toThrow("Provider request failed.");
  });

  it("rejects malformed OpenAI-compatible responses", async () => {
    const provider = createNousPortalProvider({
      secretStore: fixtureStoreForNous(),
      fetch: captureFetch([], {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: "" } }] })
      })
    });

    await expect(provider.invoke({
      invocationId: "inv_nous_bad_response",
      runId: "run_nous_001",
      modelFamily: "tencent/hy3:free",
      inputArtifactHash,
      inputText: providerInputText,
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

function fixtureStoreForNous(): StaticSecretStore {
  return new StaticSecretStore({
    agent_credref_nous_portal: SecretMaterial.fromRuntimeValue(fixtureProviderMaterial)
  });
}

function successfulResponse(): FakeFetchResponse {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{
        finish_reason: "stop",
        message: { role: "assistant", content: "Hello from Nous.", refusal: null }
      }],
      usage: { prompt_tokens: 3, completion_tokens: 4 }
    })
  };
}

function captureFetch(calls: CapturedFetchCall[], response: FakeFetchResponse) {
  return async (url: string | URL, init?: RequestInit): Promise<Response> => {
    const headers = normalizeSafeHeaders(init?.headers);
    calls.push({
      url: String(url),
      headers,
      body: String(init?.body ?? "")
    });
    return response as Response;
  };
}

function normalizeSafeHeaders(headers: HeadersInit | undefined): Record<string, string> {
  if (headers === undefined) {
    return {};
  }
  return Object.fromEntries(
    headerEntries(headers)
      .map(([key, value]) => [key.toLowerCase(), value] as const)
      .filter(([key]) => key === "content-type")
  );
}

function headerEntries(headers: HeadersInit): Array<readonly [string, string]> {
  if (headers instanceof Headers) {
    return [...headers.entries()];
  }
  if (Array.isArray(headers)) {
    return headers.map(([key, value]) => [key, value]);
  }
  return Object.entries(headers).map(([key, value]) => [key, String(value)]);
}

describe("bounded document provider transport", () => {
  const request = {
    invocationId: "inv_transport_001", runId: "run_transport_001", modelFamily: "fixture-model",
    inputArtifactHash, inputText: providerInputText,
    credentialRef: { credentialRefId: "agent_credref_nous_portal", providerId: "provider_nous_portal", kind: "api-key-bearer" as const }
  };
  it("resolves credentials before the last authority gate and performs zero calls when it rejects", async () => {
    const sequence: string[] = [];
    const provider = new OpenAICompatibleChatProvider({
      providerId: "provider_nous_portal", label: "Fixture", endpointUrl: "https://example.test/v1/chat/completions",
      modelId: "fixture-model", credentialRefId: "agent_credref_nous_portal",
      secretStore: { resolve: async () => { sequence.push("resolve"); return SecretMaterial.fromTestValue(fixtureProviderMaterial); }, health: fixtureStoreForNous().health.bind(fixtureStoreForNous()) },
      fetch: async () => { sequence.push("fetch"); return new Response("{}"); }
    });
    await expect(provider.invoke({ ...request, beforeTransfer: async () => { sequence.push("revalidate"); throw new Error("Changed"); } })).rejects.toThrow("Changed");
    expect(sequence).toEqual(["resolve", "revalidate"]);
  });
  it("passes cancellation and forbids redirect forwarding; oversized response streams fail closed", async () => {
    const controller = new AbortController();
    let init: RequestInit | undefined;
    const provider = new OpenAICompatibleChatProvider({
      providerId: "provider_nous_portal", label: "Fixture", endpointUrl: "https://example.test/v1/chat/completions",
      modelId: "fixture-model", credentialRefId: "agent_credref_nous_portal", secretStore: fixtureStoreForNous(),
      maxResponseBytes: 8,
      fetch: async (_url, options) => { init = options; return new Response("a".repeat(100)); }
    });
    await expect(provider.invoke({ ...request, signal: controller.signal })).rejects.toMatchObject({ outcome: "completion-unknown" });
    expect(init?.redirect).toBe("error");
    expect(init?.signal).toBe(controller.signal);
  });
  it("requires real usage accounting when requested by the bounded processing path", async () => {
    const provider = new OpenAICompatibleChatProvider({
      providerId: "provider_nous_portal", label: "Fixture", endpointUrl: "https://example.test/v1/chat/completions",
      modelId: "fixture-model", credentialRefId: "agent_credref_nous_portal", secretStore: fixtureStoreForNous(),
      maxResponseBytes: 1000, requireUsage: true,
      fetch: async () => new Response(JSON.stringify({ choices: [{ message: { content: "A summary." } }] }))
    });
    await expect(provider.invoke(request)).rejects.toThrow("Provider returned invalid output.");
  });
});
