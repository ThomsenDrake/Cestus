import { z } from "zod";
import { credentialKindSchema } from "./credential-reference.js";
import { isAgentSecretSafeText } from "./secret-safety.js";

const embeddedCredentialCompoundMarkerPattern =
  /(?:^|[^a-z0-9])(?:[a-z0-9]+[._-])*(?:api[._-]?key|access[._-]?token|refresh[._-]?token|session[._-]?token|client[._-]?secret|private[._-]?key|secret[._-]?access[._-]?key|access[._-]?key)(?:$|[^a-z0-9])/i;
const embeddedCredentialSegmentMarkerPattern =
  /(?:^|[._-])(?:token|secret|password|credentials?)(?:$|[._-])/i;

const allowedCredentialNamedDiagnosticCodes = new Set([
  "auth-rejected",
  "credential-binding-missing",
  "credential-expired",
  "credential-revoked",
  "health-unverified",
  "insufficient-scope",
  "needs-api-key",
  "needs-device-sign-in",
  "needs-mtls-binding",
  "needs-oauth-sign-in",
  "needs-workload-identity",
  "provider-ready",
  "requires-byte-transfer-approval"
]);

const providerIdSchema = z.string()
  .regex(/^provider_[a-zA-Z0-9_-]+$/)
  .refine(isProviderStructuralSecretSafeText, { message: "providerId must be secret-safe" });

const secretSafeTextSchema = z.string().min(1).refine(isProviderStructuralSecretSafeText, {
  message: "must be secret-safe"
});

const diagnosticCodeSchema = z.string()
  .regex(/^[a-z][a-z0-9_-]*$/)
  .refine(isProviderDiagnosticCodeSecretSafeText, { message: "diagnostic code must be secret-safe" });

export const providerBackendKindSchema = z.enum([
  "openai-api",
  "openai-codex-harness",
  "xai-api",
  "xai-harness",
  "openai-compatible-api",
  "local-engine",
  "enterprise-gateway",
  "custom-adapter"
]);

export const providerModalitySchema = z.enum([
  "text",
  "image",
  "audio",
  "file",
  "code",
  "embedding"
]);

export const providerToolSupportSchema = z.enum([
  "none",
  "function-calling",
  "hosted-tools",
  "harness-tools"
]);

export const providerStructuredOutputSupportSchema = z.enum([
  "unsupported",
  "json-mode",
  "schema-strict",
  "harness-mediated"
]);

export const providerContextLimitsSchema = z.object({
  maxInputTokens: z.number().int().positive(),
  maxOutputTokens: z.number().int().positive()
}).strict();

export const providerCredentialRequirementSchema = z.object({
  credentialKind: credentialKindSchema,
  required: z.boolean()
}).strict();

export const providerCostPolicySchema = z.enum([
  "local-compute",
  "metered-api",
  "subscription-entitlement",
  "org-managed",
  "unknown-until-configured"
]);

export const providerWorkspaceScopeSchema = z.enum([
  "local-only",
  "workspace",
  "user",
  "org",
  "team",
  "enterprise"
]);

export const providerApprovalProfileSchema = z.enum([
  "local-only",
  "remote-prompt-only",
  "remote-byte-transfer-gated",
  "harness-workspace-gated"
]);

export const providerCapabilityDescriptorSchema = z.object({
  providerId: providerIdSchema,
  label: secretSafeTextSchema,
  adapterVersion: secretSafeTextSchema,
  backendKind: providerBackendKindSchema,
  modelFamilies: z.array(secretSafeTextSchema).min(1),
  modalities: z.array(providerModalitySchema).min(1),
  toolSupport: providerToolSupportSchema,
  structuredOutputSupport: providerStructuredOutputSupportSchema,
  contextLimits: providerContextLimitsSchema,
  credentialRequirements: z.array(providerCredentialRequirementSchema).min(1),
  dataHandlingNotes: secretSafeTextSchema,
  costPolicy: providerCostPolicySchema,
  workspaceScopes: z.array(providerWorkspaceScopeSchema).min(1),
  approvalProfile: providerApprovalProfileSchema,
  diagnosticContract: z.array(diagnosticCodeSchema).min(1),
  fakeSupport: z.boolean()
}).strict();

export const providerRegistryMatchInputSchema = z.object({
  modality: providerModalitySchema,
  structuredOutputRequired: z.boolean(),
  credentialKinds: z.array(credentialKindSchema).min(1),
  allowRemoteByteTransfer: z.boolean()
}).strict();

export type ProviderBackendKind = z.infer<typeof providerBackendKindSchema>;
export type ProviderModality = z.infer<typeof providerModalitySchema>;
export type ProviderToolSupport = z.infer<typeof providerToolSupportSchema>;
export type ProviderStructuredOutputSupport = z.infer<typeof providerStructuredOutputSupportSchema>;
export type ProviderContextLimits = z.infer<typeof providerContextLimitsSchema>;
export type ProviderCredentialRequirement = z.infer<typeof providerCredentialRequirementSchema>;
export type ProviderCostPolicy = z.infer<typeof providerCostPolicySchema>;
export type ProviderWorkspaceScope = z.infer<typeof providerWorkspaceScopeSchema>;
export type ProviderApprovalProfile = z.infer<typeof providerApprovalProfileSchema>;
export type ProviderCapabilityDescriptor = z.infer<typeof providerCapabilityDescriptorSchema>;
export type ProviderCapabilityDescriptorInput = z.input<typeof providerCapabilityDescriptorSchema>;
export type ProviderRegistryMatchInput = z.infer<typeof providerRegistryMatchInputSchema>;

export interface ProviderCapabilityRegistry {
  register(descriptor: unknown): ProviderCapabilityDescriptor;
  require(providerId: string): ProviderCapabilityDescriptor;
  list(): readonly ProviderCapabilityDescriptor[];
  match(input: ProviderRegistryMatchInput): readonly ProviderCapabilityDescriptor[];
}

export function createProviderCapabilityDescriptor(
  input: unknown
): ProviderCapabilityDescriptor {
  return freezeProviderCapabilityDescriptor(providerCapabilityDescriptorSchema.parse(input));
}

export function createProviderRegistry(): ProviderCapabilityRegistry {
  return new InMemoryProviderCapabilityRegistry();
}

export namespace createProviderRegistry {
  export function withDefaultsForTest(): ProviderCapabilityRegistry {
    const registry = createProviderRegistry();
    for (const descriptor of defaultTestProviderDescriptors()) {
      registry.register(descriptor);
    }
    return registry;
  }
}

class InMemoryProviderCapabilityRegistry implements ProviderCapabilityRegistry {
  private readonly providers = new Map<string, ProviderCapabilityDescriptor>();

  register(descriptor: unknown): ProviderCapabilityDescriptor {
    const parsed = createProviderCapabilityDescriptor(descriptor);
    if (this.providers.has(parsed.providerId)) {
      throw new Error("Provider descriptor is already registered");
    }
    this.providers.set(parsed.providerId, parsed);
    return parsed;
  }

  require(providerId: string): ProviderCapabilityDescriptor {
    const parsedProviderId = providerIdSchema.parse(providerId);
    const descriptor = this.providers.get(parsedProviderId);
    if (descriptor === undefined) {
      throw new Error("Provider descriptor was not found");
    }
    return descriptor;
  }

  list(): readonly ProviderCapabilityDescriptor[] {
    return freezeDescriptorList([...this.providers.values()]);
  }

  match(input: ProviderRegistryMatchInput): readonly ProviderCapabilityDescriptor[] {
    const parsed = providerRegistryMatchInputSchema.parse(input);
    return freezeDescriptorList(
      [...this.providers.values()]
        .filter((descriptor) => providerMatches(descriptor, parsed))
    );
  }
}

function providerMatches(
  descriptor: ProviderCapabilityDescriptor,
  input: ProviderRegistryMatchInput
): boolean {
  if (!descriptor.modalities.includes(input.modality)) {
    return false;
  }

  if (input.structuredOutputRequired && descriptor.structuredOutputSupport !== "schema-strict") {
    return false;
  }

  if (!credentialRequirementsSatisfied(descriptor, input)) {
    return false;
  }

  if (!input.allowRemoteByteTransfer && (
    descriptor.approvalProfile === "remote-byte-transfer-gated" ||
    descriptor.approvalProfile === "harness-workspace-gated"
  )) {
    return false;
  }

  return true;
}

function credentialRequirementsSatisfied(
  descriptor: ProviderCapabilityDescriptor,
  input: ProviderRegistryMatchInput
): boolean {
  const availableKinds = new Set(input.credentialKinds);
  const requiredKinds = descriptor.credentialRequirements
    .filter((requirement) => requirement.required)
    .map((requirement) => requirement.credentialKind);
  const alternativeKinds = descriptor.credentialRequirements
    .filter((requirement) => !requirement.required)
    .map((requirement) => requirement.credentialKind);

  if (!requiredKinds.every((credentialKind) => availableKinds.has(credentialKind))) {
    return false;
  }

  if (alternativeKinds.length > 0) {
    return alternativeKinds.some((credentialKind) => availableKinds.has(credentialKind));
  }

  return requiredKinds.length > 0;
}

function defaultTestProviderDescriptors(): readonly ProviderCapabilityDescriptorInput[] {
  return Object.freeze([
    {
      providerId: "provider_fake_local",
      label: "Fake local provider",
      adapterVersion: "agent-provider-auth.v1",
      backendKind: "local-engine",
      modelFamilies: ["fake-local"],
      modalities: ["text"],
      toolSupport: "none",
      structuredOutputSupport: "schema-strict",
      contextLimits: { maxInputTokens: 4096, maxOutputTokens: 1024 },
      credentialRequirements: [{ credentialKind: "local-no-secret", required: true }],
      dataHandlingNotes: "Runs on this machine with deterministic fake output.",
      costPolicy: "local-compute",
      workspaceScopes: ["workspace"],
      approvalProfile: "local-only",
      diagnosticContract: ["provider-ready", "model-output-invalid"],
      fakeSupport: true
    },
    {
      providerId: "provider_fake_remote",
      label: "Fake remote provider",
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
      diagnosticContract: ["needs-api-key", "provider-ready"],
      fakeSupport: true
    },
    {
      providerId: "provider_fake_subscription_harness",
      label: "Fake subscription harness provider",
      adapterVersion: "agent-provider-auth.v1",
      backendKind: "xai-harness",
      modelFamilies: ["fake-subscription-harness"],
      modalities: ["text", "code"],
      toolSupport: "harness-tools",
      structuredOutputSupport: "harness-mediated",
      contextLimits: { maxInputTokens: 16384, maxOutputTokens: 4096 },
      credentialRequirements: [{ credentialKind: "subscription-oauth", required: true }],
      dataHandlingNotes: "Simulates an official harness with workspace approval requirements.",
      costPolicy: "subscription-entitlement",
      workspaceScopes: ["workspace", "user"],
      approvalProfile: "harness-workspace-gated",
      diagnosticContract: ["needs-oauth-sign-in", "harness-not-installed"],
      fakeSupport: true
    }
  ]);
}

function freezeProviderCapabilityDescriptor(
  descriptor: ProviderCapabilityDescriptor
): ProviderCapabilityDescriptor {
  return Object.freeze({
    ...descriptor,
    modelFamilies: Object.freeze([...descriptor.modelFamilies]),
    modalities: Object.freeze([...descriptor.modalities]),
    contextLimits: Object.freeze({ ...descriptor.contextLimits }),
    credentialRequirements: Object.freeze(
      descriptor.credentialRequirements.map((requirement) => Object.freeze({ ...requirement }))
    ),
    workspaceScopes: Object.freeze([...descriptor.workspaceScopes]),
    diagnosticContract: Object.freeze([...descriptor.diagnosticContract])
  }) as ProviderCapabilityDescriptor;
}

function freezeDescriptorList(
  descriptors: readonly ProviderCapabilityDescriptor[]
): readonly ProviderCapabilityDescriptor[] {
  return Object.freeze(
    [...descriptors].sort(compareProviderDescriptorIds)
  );
}

function compareProviderDescriptorIds(
  left: ProviderCapabilityDescriptor,
  right: ProviderCapabilityDescriptor
): number {
  if (left.providerId < right.providerId) {
    return -1;
  }
  if (left.providerId > right.providerId) {
    return 1;
  }
  return 0;
}

function isProviderStructuralSecretSafeText(value: string): boolean {
  return isAgentSecretSafeText(value) && !hasEmbeddedCredentialMarker(value);
}

function isProviderDiagnosticCodeSecretSafeText(value: string): boolean {
  return isAgentSecretSafeText(value) &&
    (allowedCredentialNamedDiagnosticCodes.has(value) || !hasEmbeddedCredentialMarker(value));
}

function hasEmbeddedCredentialMarker(value: string): boolean {
  return embeddedCredentialCompoundMarkerPattern.test(value) ||
    embeddedCredentialSegmentMarkerPattern.test(value);
}
