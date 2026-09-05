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
  ProviderInvocationError,
  assertCredentialReferenceIsSafe,
  providerDescriptorSchema
} from "./provider.js";
import type { SecretStore } from "./secret-store.js";
import { assertAgentSecretSafeText } from "./secret-safety.js";

type FetchLike = (url: string, init: RequestInit) => Promise<Pick<Response, "ok" | "status" | "json"> & Partial<Pick<Response, "body">>>;

export interface OpenAICompatibleChatProviderOptions {
  readonly providerId: string;
  readonly label: string;
  readonly endpointUrl: string;
  readonly modelId: string;
  readonly credentialRefId: string;
  readonly secretStore: SecretStore;
  readonly fetch?: FetchLike;
  readonly systemPrompt?: string;
  readonly maxTokens?: number;
  readonly adapterVersion?: string;
  readonly safeDataNotes?: string;
  readonly requestTags?: readonly string[];
  readonly includeReasoning?: boolean;
  readonly reasoningEffort?: NousReasoningEffort;
  readonly temperature?: number;
  readonly maxResponseBytes?: number;
  readonly requireUsage?: boolean;
}

export interface CreateNousPortalProviderInput {
  readonly secretStore: SecretStore;
  readonly fetch?: FetchLike;
  readonly endpointUrl?: string;
  readonly modelId?: string;
  readonly requestTags?: readonly string[];
  readonly includeReasoning?: boolean;
  readonly reasoningEffort?: NousReasoningEffort;
  readonly temperature?: number;
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

// Explicit request rejection semantics only. In particular 408, 409 and 5xx
// cannot prove that upstream generation did not occur. Do not infer billing.
const rejectedRequestStatuses = new Set([400, 401, 403, 404, 405, 406, 410, 413, 415, 422, 429]);

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
const temperatureSchema = z.number().finite().min(0).max(2);

export class OpenAICompatibleChatProvider implements ModelProviderAdapter {
  private readonly descriptor: ProviderDescriptor;
  private readonly endpointUrl: string;
  private readonly modelId: string;
  private readonly credentialRefId: string;
  private readonly secretStore: SecretStore;
  private readonly fetchImpl: FetchLike;
  private readonly systemPrompt: string;
  private readonly maxTokens: number;
  private readonly requestTags: readonly string[];
  private readonly includeReasoning: boolean | undefined;
  private readonly reasoningEffort: NousReasoningEffort | undefined;
  private readonly temperature: number | undefined;
  private readonly maxResponseBytes: number | undefined;
  private readonly requireUsage: boolean;

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
    this.systemPrompt = systemPrompt;
    this.maxTokens = maxTokens;
    this.requestTags = Object.freeze([...requestTagsSchema.parse(options.requestTags ?? [])]);
    this.includeReasoning = options.includeReasoning;
    this.reasoningEffort = options.reasoningEffort === undefined
      ? undefined
      : reasoningEffortSchema.parse(options.reasoningEffort);
    this.temperature = parseTemperature(options.temperature);
    this.maxResponseBytes = options.maxResponseBytes;
    this.requireUsage = options.requireUsage ?? false;
    if (this.maxResponseBytes !== undefined && (!Number.isInteger(this.maxResponseBytes) || this.maxResponseBytes < 1)) {
      throw new Error("maxResponseBytes must be a positive integer.");
    }
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

    const inputText = requireInputText(parsed);
    const secret = await this.secretStore.resolve(this.credentialRefId);
    if (secret === undefined) {
      throw new Error("Credential binding is missing.");
    }
    await parsed.beforeTransfer?.();
    parsed.signal?.throwIfAborted();

    const response = await this.fetchImpl(this.endpointUrl, {
      method: "POST",
      redirect: "error",
      ...(parsed.signal === undefined ? {} : { signal: parsed.signal }),
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
        ...(this.reasoningEffort === undefined ? {} : { reasoning: { effort: this.reasoningEffort } }),
        ...(this.temperature === undefined ? {} : { temperature: this.temperature })
      })
    });

    // This synchronous chat contract requires a completed 200 response. Other
    // statuses can describe deferred work, partial content or a gateway failure
    // after upstream submission; receiving headers alone does not settle that.
    if (response.status !== 200) {
      await response.body?.cancel().catch(() => undefined);
      throw new ProviderInvocationError(rejectedRequestStatuses.has(response.status) ? "rejected" : "completion-unknown");
    }

    let responseJson: unknown;
    try {
      responseJson = this.maxResponseBytes === undefined
        ? await response.json()
        : await readBoundedResponse(response, this.maxResponseBytes);
    } catch (error) {
      if (error instanceof ProviderInvocationError) throw error;
      // Response.json() reports SyntaxError only after a complete body was read;
      // network/abort/decompression errors do not establish remote completion.
      throw new ProviderInvocationError(error instanceof SyntaxError ? "invalid-response" : "completion-unknown");
    }

    const parsedResponse = chatCompletionResponseSchema.safeParse(responseJson);
    if (!parsedResponse.success) {
      throw new ProviderInvocationError("invalid-response");
    }

    const outputText = parsedResponse.data.choices[0]?.message.content;
    if (outputText === undefined) {
      throw new ProviderInvocationError("invalid-response");
    }
    const usage = parsedResponse.data.usage;
    if (this.requireUsage && (!Number.isSafeInteger(usage?.prompt_tokens) || !Number.isSafeInteger(usage?.completion_tokens) ||
      usage!.prompt_tokens! < 0 || usage!.completion_tokens! < 0)) {
      throw new ProviderInvocationError("invalid-response");
    }

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
    requestTags: input.requestTags ?? defaultNousPortalRequestTags,
    includeReasoning: input.includeReasoning ?? false,
    reasoningEffort: input.reasoningEffort ?? "none",
    temperature: input.temperature ?? 0,
    safeDataNotes: "Remote OpenAI-compatible Nous Portal chat provider. Prompts leave this machine only after provider policy allows it."
  });
}

function parseInvocationRequest(request: ModelInvocationRequest): ModelInvocationRequest {
  if (!contentHashPattern.test(request.inputArtifactHash)) {
    throw new Error("inputArtifactHash must be a sha256 content hash.");
  }
  return request;
}

function requireInputText(request: ModelInvocationRequest): string {
  if (request.inputText === undefined) {
    throw new Error("inputText is required for remote provider invocation.");
  }
  const parsed = nonEmptySecretSafeTextSchema.safeParse(request.inputText);
  if (!parsed.success) {
    throw new Error("inputText must be non-empty and secret-safe.");
  }
  return parsed.data;
}

function parseTemperature(value: number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = temperatureSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("temperature must be a finite number between 0 and 2.");
  }
  return parsed.data;
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

async function readBoundedResponse(
  response: Pick<Response, "json"> & Partial<Pick<Response, "body">>,
  maximumBytes: number
): Promise<unknown> {
  if (response.body === undefined || response.body === null) {
    throw new ProviderInvocationError("completion-unknown");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maximumBytes) throw new ProviderInvocationError("completion-unknown");
      chunks.push(next.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
