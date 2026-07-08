import { createHash } from "node:crypto";
import { z } from "zod";
import type {
  CredentialReference,
  ModelInvocationRequest,
  ModelInvocationResult,
  ModelProviderAdapter,
  ProviderDescriptor
} from "./provider.js";
import {
  assertCredentialReferenceIsSafe,
  providerDescriptorSchema
} from "./provider.js";
import type { SecretStore } from "./secret-store.js";
import { assertAgentSecretSafeText } from "./secret-safety.js";

type FetchLike = (url: string, init: RequestInit) => Promise<Pick<Response, "ok" | "status" | "json">>;

export interface OpenAICompatibleChatProviderOptions {
  readonly providerId: string;
  readonly label: string;
  readonly endpointUrl: string;
  readonly modelId: string;
  readonly credentialRefId: string;
  readonly secretStore: SecretStore;
  readonly fetch?: FetchLike;
  readonly resolveInputText: (inputArtifactHash: string) => string | Promise<string>;
  readonly systemPrompt?: string;
  readonly maxTokens?: number;
  readonly adapterVersion?: string;
  readonly safeDataNotes?: string;
  readonly requestTags?: readonly string[];
  readonly includeReasoning?: boolean;
  readonly reasoningEffort?: NousReasoningEffort;
}

export interface CreateNousPortalProviderInput {
  readonly secretStore: SecretStore;
  readonly fetch?: FetchLike;
  readonly resolveInputText: (inputArtifactHash: string) => string | Promise<string>;
  readonly endpointUrl?: string;
  readonly modelId?: string;
  readonly requestTags?: readonly string[];
  readonly includeReasoning?: boolean;
  readonly reasoningEffort?: NousReasoningEffort;
}

export type NousReasoningEffort = "none" | "low" | "high";

const defaultNousEndpointUrl = "https://inference-api.nousresearch.com/v1/chat/completions";
const defaultNousModelId = "tencent/hy3:free";
const defaultSystemPrompt = "You are the resident Cestus Agent. Answer with concise, evidence-aware reasoning.";
const defaultMaxTokens = 512;
const defaultNousPortalRequestTags = Object.freeze([
  "user=cestus-local",
  "product=cestus",
  "client=cestus-agent-v0.1.0"
]);

const contentHashPattern = /^sha256:[a-f0-9]{64}$/;
const endpointSchema = z.string().url();
const nonEmptySecretSafeTextSchema = z.string().min(1).superRefine((value, ctx) => {
  try {
    assertAgentSecretSafeText(value, "value");
  } catch (error) {
    ctx.addIssue({
      code: "custom",
      message: error instanceof Error ? error.message : "value must be secret-safe"
    });
  }
});

const chatCompletionResponseSchema = z.object({
  choices: z.array(z.object({
    message: z.object({
      content: nonEmptySecretSafeTextSchema
    }).passthrough()
  }).passthrough()).min(1),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative().optional(),
    completion_tokens: z.number().int().nonnegative().optional()
  }).passthrough().optional()
}).passthrough();
const requestTagsSchema = z.array(nonEmptySecretSafeTextSchema).max(20);
const reasoningEffortSchema = z.enum(["none", "low", "high"]);

export class OpenAICompatibleChatProvider implements ModelProviderAdapter {
  private readonly descriptor: ProviderDescriptor;
  private readonly endpointUrl: string;
  private readonly modelId: string;
  private readonly credentialRefId: string;
  private readonly secretStore: SecretStore;
  private readonly fetchImpl: FetchLike;
  private readonly resolveInputText: (inputArtifactHash: string) => string | Promise<string>;
  private readonly systemPrompt: string;
  private readonly maxTokens: number;
  private readonly requestTags: readonly string[];
  private readonly includeReasoning: boolean | undefined;
  private readonly reasoningEffort: NousReasoningEffort | undefined;

  constructor(options: OpenAICompatibleChatProviderOptions) {
    const endpointUrl = endpointSchema.parse(options.endpointUrl);
    const modelId = nonEmptySecretSafeTextSchema.parse(options.modelId);
    const systemPrompt = nonEmptySecretSafeTextSchema.parse(options.systemPrompt ?? defaultSystemPrompt);
    const maxTokens = options.maxTokens ?? defaultMaxTokens;
    if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 8192) {
      throw new Error("maxTokens must be a positive integer within the supported range.");
    }

    this.endpointUrl = endpointUrl;
    this.modelId = modelId;
    this.credentialRefId = options.credentialRefId;
    this.secretStore = options.secretStore;
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.resolveInputText = options.resolveInputText;
    this.systemPrompt = systemPrompt;
    this.maxTokens = maxTokens;
    this.requestTags = Object.freeze([...requestTagsSchema.parse(options.requestTags ?? [])]);
    this.includeReasoning = options.includeReasoning;
    this.reasoningEffort = options.reasoningEffort === undefined
      ? undefined
      : reasoningEffortSchema.parse(options.reasoningEffort);
    this.descriptor = freezeProviderDescriptor(providerDescriptorSchema.parse({
      providerId: options.providerId,
      label: options.label,
      adapterVersion: options.adapterVersion ?? "openai-compatible-chat.v1",
      endpointKind: "openai-compatible-api",
      modelFamilies: [modelId],
      credentialKinds: ["api-key-bearer"],
      supportsStructuredOutput: false,
      supportsToolCalling: false,
      safeDataNotes: options.safeDataNotes ?? "Remote OpenAI-compatible chat provider. Prompts leave this machine only after provider policy allows it."
    }));
  }

  describe(): ProviderDescriptor {
    return this.descriptor;
  }

  async invoke(request: ModelInvocationRequest): Promise<ModelInvocationResult> {
    const parsed = parseInvocationRequest(request);
    assertCredentialReferenceIsSafe(parsed.credentialRef);
    this.assertCredentialSupported(parsed.credentialRef, parsed.modelFamily);

    const inputText = nonEmptySecretSafeTextSchema.parse(await this.resolveInputText(parsed.inputArtifactHash));
    const secret = await this.secretStore.resolve(this.credentialRefId);
    if (secret === undefined) {
      throw new Error("Credential binding is missing.");
    }

    const response = await this.fetchImpl(this.endpointUrl, {
      method: "POST",
      headers: {
        "authorization": `Bearer ${secret.exposeForProviderAdapter()}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: this.modelId,
        messages: [
          { role: "system", content: this.systemPrompt },
          { role: "user", content: inputText }
        ],
        max_tokens: this.maxTokens,
        ...(this.requestTags.length === 0 ? {} : { tags: [...this.requestTags] }),
        ...(this.includeReasoning === undefined ? {} : { include_reasoning: this.includeReasoning }),
        ...(this.reasoningEffort === undefined ? {} : { reasoning: { effort: this.reasoningEffort } })
      })
    });

    if (!response.ok) {
      throw new Error("Provider request failed.");
    }

    let responseJson: unknown;
    try {
      responseJson = await response.json();
    } catch {
      throw new Error("Provider returned invalid output.");
    }

    const parsedResponse = chatCompletionResponseSchema.safeParse(responseJson);
    if (!parsedResponse.success) {
      throw new Error("Provider returned invalid output.");
    }

    const outputText = parsedResponse.data.choices[0]?.message.content;
    if (outputText === undefined) {
      throw new Error("Provider returned invalid output.");
    }
    const usage = parsedResponse.data.usage;

    return Object.freeze({
      outputText,
      outputArtifactHash: hashProviderOutput({
        invocationId: parsed.invocationId,
        runId: parsed.runId,
        inputArtifactHash: parsed.inputArtifactHash,
        modelId: this.modelId,
        outputText
      }),
      usage: Object.freeze({
        inputUnits: usage?.prompt_tokens ?? inputText.length,
        outputUnits: usage?.completion_tokens ?? outputText.length
      })
    });
  }

  private assertCredentialSupported(credentialRef: CredentialReference, modelFamily: string): void {
    if (credentialRef.credentialRefId !== this.credentialRefId) {
      throw new Error("Credential reference does not match the selected provider binding.");
    }
    if (credentialRef.providerId !== this.descriptor.providerId) {
      throw new Error("Credential reference provider does not match the selected model provider.");
    }
    if (credentialRef.kind !== "api-key-bearer") {
      throw new Error("Credential kind is not supported by this provider.");
    }
    if (!this.descriptor.modelFamilies.includes(modelFamily)) {
      throw new Error("Model family is not supported by this provider.");
    }
  }
}

export function createNousPortalProvider(input: CreateNousPortalProviderInput): OpenAICompatibleChatProvider {
  return new OpenAICompatibleChatProvider({
    providerId: "provider_nous_portal",
    label: "Nous Portal",
    endpointUrl: input.endpointUrl ?? defaultNousEndpointUrl,
    modelId: input.modelId ?? defaultNousModelId,
    credentialRefId: "agent_credref_nous_portal",
    secretStore: input.secretStore,
    ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
    resolveInputText: input.resolveInputText,
    requestTags: input.requestTags ?? defaultNousPortalRequestTags,
    includeReasoning: input.includeReasoning ?? false,
    reasoningEffort: input.reasoningEffort ?? "none",
    safeDataNotes: "Remote OpenAI-compatible Nous Portal chat provider. Prompts leave this machine only after provider policy allows it."
  });
}

function parseInvocationRequest(request: ModelInvocationRequest): ModelInvocationRequest {
  if (!contentHashPattern.test(request.inputArtifactHash)) {
    throw new Error("inputArtifactHash must be a sha256 content hash.");
  }
  return request;
}

function hashProviderOutput(input: {
  readonly invocationId: string;
  readonly runId: string;
  readonly inputArtifactHash: string;
  readonly modelId: string;
  readonly outputText: string;
}): string {
  const digest = createHash("sha256")
    .update(input.invocationId)
    .update("\0")
    .update(input.runId)
    .update("\0")
    .update(input.inputArtifactHash)
    .update("\0")
    .update(input.modelId)
    .update("\0")
    .update(input.outputText)
    .digest("hex");
  return `sha256:${digest}`;
}

function freezeProviderDescriptor(descriptor: ProviderDescriptor): ProviderDescriptor {
  return Object.freeze({
    ...descriptor,
    modelFamilies: Object.freeze([...descriptor.modelFamilies]),
    credentialKinds: Object.freeze([...descriptor.credentialKinds])
  }) as ProviderDescriptor;
}
