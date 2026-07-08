import { createHash } from "node:crypto";
import { z } from "zod";
import {
  createProviderCapabilityDescriptor,
  type ProviderCapabilityDescriptor
} from "./provider-registry.js";
import { assertAgentSecretSafeText, isAgentSecretSafeText } from "./secret-safety.js";

const providerIdSchema = z.string()
  .regex(/^provider_[a-zA-Z0-9_-]+$/)
  .refine(isAgentSecretSafeText, { message: "providerId must be secret-safe" });
const credentialRefIdSchema = z.string()
  .regex(/^agent_credref_[a-zA-Z0-9_-]+$/)
  .refine(isAgentSecretSafeText, { message: "credentialRefId must be secret-safe" });
const invocationIdSchema = z.string()
  .regex(/^inv_[a-zA-Z0-9_-]+$/)
  .refine(isAgentSecretSafeText, { message: "invocationId must be secret-safe" });
const runIdSchema = z.string()
  .regex(/^run_[a-zA-Z0-9_-]+$/)
  .refine(isAgentSecretSafeText, { message: "runId must be secret-safe" });
const contentHashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const agentSecretSafeTextSchema = z.string().min(1).refine(isAgentSecretSafeText, {
  message: "must be secret-safe"
});

export const credentialKindSchema = z.enum([
  "api-key-bearer",
  "workload-identity-token",
  "subscription-oauth",
  "device-code-oauth",
  "local-no-secret",
  "mtls-certificate",
  "enterprise-gateway"
]);

export const providerDescriptorSchema = z.object({
  providerId: providerIdSchema,
  label: agentSecretSafeTextSchema,
  adapterVersion: agentSecretSafeTextSchema,
  endpointKind: z.enum(["openai-api", "openai-compatible-api", "local-engine", "enterprise-gateway", "custom-adapter"]),
  modelFamilies: z.array(agentSecretSafeTextSchema).min(1),
  credentialKinds: z.array(credentialKindSchema).min(1),
  supportsStructuredOutput: z.boolean(),
  supportsToolCalling: z.boolean(),
  safeDataNotes: agentSecretSafeTextSchema
}).strict();

export type CredentialKind = z.infer<typeof credentialKindSchema>;
export type ProviderDescriptor = z.infer<typeof providerDescriptorSchema>;

export interface CredentialReference {
  readonly credentialRefId: string;
  readonly providerId: string;
  readonly kind: CredentialKind;
  readonly safeLabel?: string;
}

export interface ModelInvocationRequest {
  readonly invocationId: string;
  readonly runId: string;
  readonly modelFamily: string;
  readonly inputArtifactHash: string;
  readonly credentialRef: CredentialReference;
}

export interface ModelInvocationResult {
  readonly outputText: string;
  readonly outputArtifactHash: string;
  readonly usage: { readonly inputUnits: number; readonly outputUnits: number };
}

export interface ModelProviderAdapter {
  describe(): ProviderDescriptor;
  invoke(request: ModelInvocationRequest): Promise<ModelInvocationResult>;
}

const credentialReferenceSchema = z.object({
  credentialRefId: credentialRefIdSchema,
  providerId: providerIdSchema,
  kind: credentialKindSchema,
  safeLabel: agentSecretSafeTextSchema.optional()
}).strict();

const modelInvocationRequestSchema = z.object({
  invocationId: invocationIdSchema,
  runId: runIdSchema,
  modelFamily: agentSecretSafeTextSchema,
  inputArtifactHash: contentHashSchema,
  credentialRef: credentialReferenceSchema
}).strict();

export function assertCredentialReferenceIsSafe(credentialRef: unknown): asserts credentialRef is CredentialReference {
  const parsed = credentialReferenceSchema.parse(credentialRef);
  assertAgentSecretSafeText(parsed.credentialRefId, "credentialRefId");
  assertAgentSecretSafeText(parsed.providerId, "providerId");
  if (parsed.safeLabel !== undefined) {
    assertAgentSecretSafeText(parsed.safeLabel, "safeLabel");
  }
}

export interface FakeModelProviderOptions {
  readonly providerId: string;
  readonly modelFamilies: readonly string[];
  readonly responseText: string;
  readonly label?: string;
  readonly adapterVersion?: string;
  readonly supportsStructuredOutput?: boolean;
  readonly supportsToolCalling?: boolean;
  readonly safeDataNotes?: string;
}

export class FakeModelProvider implements ModelProviderAdapter {
  private readonly descriptor: ProviderDescriptor;
  private readonly responseText: string;

  constructor(options: FakeModelProviderOptions) {
    this.responseText = options.responseText;
    this.descriptor = freezeProviderDescriptor(providerDescriptorSchema.parse({
      providerId: options.providerId,
      label: options.label ?? "Fake Local Model Provider",
      adapterVersion: options.adapterVersion ?? "fake-provider.v1",
      endpointKind: "local-engine",
      modelFamilies: [...options.modelFamilies],
      credentialKinds: ["local-no-secret"],
      supportsStructuredOutput: options.supportsStructuredOutput ?? false,
      supportsToolCalling: options.supportsToolCalling ?? false,
      safeDataNotes: options.safeDataNotes ?? "Deterministic local fake provider. No network calls or secret material are used."
    }));
  }

  describe(): ProviderDescriptor {
    return this.descriptor;
  }

  async invoke(request: ModelInvocationRequest): Promise<ModelInvocationResult> {
    const parsed = modelInvocationRequestSchema.parse(request);
    assertCredentialReferenceIsSafe(parsed.credentialRef);

    if (parsed.credentialRef.providerId !== this.descriptor.providerId) {
      throw new Error("Credential reference provider does not match the selected model provider");
    }

    if (!this.descriptor.credentialKinds.includes(parsed.credentialRef.kind)) {
      throw new Error(`Credential kind ${parsed.credentialRef.kind} is not supported by ${this.descriptor.providerId}`);
    }

    if (!this.descriptor.modelFamilies.includes(parsed.modelFamily)) {
      throw new Error(`Model family ${parsed.modelFamily} is not supported by ${this.descriptor.providerId}`);
    }

    return Object.freeze({
      outputText: this.responseText,
      outputArtifactHash: hashInvocationOutput({
        invocationId: parsed.invocationId,
        runId: parsed.runId,
        inputArtifactHash: parsed.inputArtifactHash,
        responseText: this.responseText
      }),
      usage: Object.freeze({
        inputUnits: parsed.inputArtifactHash.length + parsed.modelFamily.length,
        outputUnits: this.responseText.length
      })
    });
  }
}

export function providerDescriptorToCapabilityDescriptor(
  descriptor: ProviderDescriptor
): ProviderCapabilityDescriptor {
  const parsed = providerDescriptorSchema.parse(descriptor);
  return createProviderCapabilityDescriptor({
    providerId: parsed.providerId,
    label: parsed.label,
    adapterVersion: parsed.adapterVersion,
    backendKind: parsed.endpointKind,
    modelFamilies: parsed.modelFamilies,
    modalities: ["text"],
    toolSupport: parsed.supportsToolCalling ? "function-calling" : "none",
    structuredOutputSupport: parsed.supportsStructuredOutput ? "schema-strict" : "unsupported",
    contextLimits: { maxInputTokens: 4096, maxOutputTokens: 1024 },
    credentialRequirements: parsed.credentialKinds.map((credentialKind) => ({
      credentialKind,
      required: false
    })),
    dataHandlingNotes: parsed.safeDataNotes,
    costPolicy: costPolicyForEndpointKind(parsed.endpointKind),
    workspaceScopes: ["workspace"],
    approvalProfile: parsed.endpointKind === "local-engine" ? "local-only" : "remote-byte-transfer-gated",
    diagnosticContract: ["provider-ready", "model-output-invalid"],
    fakeSupport: parsed.endpointKind === "local-engine"
  });
}

function hashInvocationOutput(input: {
  readonly invocationId: string;
  readonly runId: string;
  readonly inputArtifactHash: string;
  readonly responseText: string;
}): string {
  const digest = createHash("sha256")
    .update(input.invocationId)
    .update("\0")
    .update(input.runId)
    .update("\0")
    .update(input.inputArtifactHash)
    .update("\0")
    .update(input.responseText)
    .digest("hex");

  return `sha256:${digest}`;
}

function costPolicyForEndpointKind(endpointKind: ProviderDescriptor["endpointKind"]) {
  switch (endpointKind) {
    case "local-engine":
      return "local-compute";
    case "enterprise-gateway":
      return "org-managed";
    case "custom-adapter":
      return "unknown-until-configured";
    case "openai-api":
    case "openai-compatible-api":
      return "metered-api";
  }
}

function freezeProviderDescriptor(descriptor: ProviderDescriptor): ProviderDescriptor {
  return Object.freeze({
    ...descriptor,
    modelFamilies: Object.freeze([...descriptor.modelFamilies]),
    credentialKinds: Object.freeze([...descriptor.credentialKinds])
  }) as ProviderDescriptor;
}
