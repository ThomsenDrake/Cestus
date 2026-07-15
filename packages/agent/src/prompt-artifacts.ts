import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  assertResolvedContextPacksForExecution,
  contextPackRefSchema,
  hashAgentContextPack,
  serializeContextPackPayload,
  type AgentContextPackJsonValue,
  type ContextPackRef,
  type ContextPackStalenessInput,
  type VerifiedResolvedContextPack
} from "./context-packs.js";
import {
  isProductionSpecialistPromptArtifactRendererVerified,
  productionSpecialistPromptRegistrationFor,
  productionSpecialistPromptRegistrations
} from "./production-specialist-prompts.js";
import type { ProductionRunScope } from "./production-specialist-registration-metadata.js";
import { assertAgentSecretSafeText } from "./secret-safety.js";
import { approvedAgentSpecialistRunTypes, type AgentSpecialistRunType } from "./specialists.js";
import { specialistWorkflowDescriptorFor, type SpecialistWorkflowDescriptor } from "./specialist-workflows.js";

export type PromptArtifactSafetyClass =
  | "workspace-safe"
  | "public-safe"
  | "sensitive-local-only"
  | "provider-approved";

export type PromptArtifactTransferApprovalClass = "none" | "provider-byte-transfer";

export type PromptArtifactStalenessInput = ContextPackStalenessInput;

export interface PromptArtifactOmission {
  readonly reason: string;
  readonly sourceRef: string;
  readonly safeSummary: string;
}

export interface PromptArtifactResolvedPayloadAudit {
  readonly contextPackId: string;
  readonly contentHash: string;
  readonly sizeBytes: number;
  readonly schemaId: string;
}

export interface PromptArtifactEvaluatedContextRequirement {
  readonly contextPackId: string;
  readonly requirementMode: "always" | "when-scope-associated-prr";
  readonly status: "applicable" | "not-applicable";
  readonly contentHash?: string | undefined;
  readonly omissionReason?: "no-associated-prr" | undefined;
}

export interface PromptArtifactProductionBindingV1 {
  readonly schemaVersion: "agent-production-prompt-binding.v1";
  readonly rendererId: string;
  readonly rendererVersion: number;
  readonly rendererHash: `sha256:${string}`;
  readonly renderedPromptHash: `sha256:${string}`;
  readonly providerOutputSchemaId: string;
  readonly providerOutputSchemaVersion: number;
  readonly handoffSchemaId: string;
  readonly handoffSchemaVersion: number;
  readonly scopeApplicabilityHash: `sha256:${string}`;
  readonly evaluatedContextRequirements: readonly PromptArtifactEvaluatedContextRequirement[];
  readonly resolvedPayloadAudits: readonly PromptArtifactResolvedPayloadAudit[];
}

export interface PromptArtifactProviderPostureV2 {
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilityIds: readonly string[];
  readonly selectionPolicyVersion: string;
  readonly readinessState: "ready";
  readonly approvalRequirementId: string;
}

export interface PromptArtifactExactRunBindingV2 {
  readonly taskId: string;
  readonly attemptId: string;
  readonly approvedRunId: string;
  readonly runId: string;
  readonly runType: Exclude<AgentSpecialistRunType, "ontology-bootstrap">;
  readonly residentAgentId: "agent_default";
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  readonly workflowDescriptorHash: `sha256:${string}`;
  readonly policyVersion: string;
  readonly providerPosture: PromptArtifactProviderPostureV2;
}

export interface PromptArtifactProductionBindingV2 {
  readonly schemaVersion: "agent-production-prompt-binding.v2";
  readonly rendererId: string;
  readonly rendererVersion: number;
  readonly rendererHash: `sha256:${string}`;
  readonly renderedPromptHash: `sha256:${string}`;
  readonly providerOutputSchemaId: string;
  readonly providerOutputSchemaVersion: number;
  readonly handoffSchemaId: string;
  readonly handoffSchemaVersion: number;
  readonly scopeApplicabilityHash: `sha256:${string}`;
  readonly evaluatedContextRequirements: readonly PromptArtifactEvaluatedContextRequirement[];
  readonly resolvedPayloadAudits: readonly PromptArtifactResolvedPayloadAudit[];
  readonly sourceApprovedPromptArtifactHash: `sha256:${string}`;
  readonly exactRunBinding: PromptArtifactExactRunBindingV2;
  readonly providerPostureHash: `sha256:${string}`;
  readonly exactRunBindingHash: `sha256:${string}`;
}

export interface CreatePromptArtifactExactRunBindingV2Input {
  readonly taskId: string;
  readonly attemptId: string;
  readonly approvedRunId: string;
  readonly runId: string;
  readonly runType: Exclude<AgentSpecialistRunType, "ontology-bootstrap">;
  readonly residentAgentId: "agent_default";
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  readonly workflowDescriptor: SpecialistWorkflowDescriptor;
  readonly policyVersion: string;
  readonly providerPosture: PromptArtifactProviderPostureV2;
}

export interface BuildPromptArtifactProductionBindingV2 {
  readonly schemaVersion: "agent-production-prompt-binding.v2";
  readonly sourceApprovedPromptArtifact: PromptArtifactEnvelope;
  readonly scope: ProductionRunScope;
  readonly exactRun: CreatePromptArtifactExactRunBindingV2Input;
}

export type PromptArtifactProductionBinding =
  | PromptArtifactProductionBindingV1
  | PromptArtifactProductionBindingV2;

export type BuildPromptArtifactProductionBinding =
  | PromptArtifactProductionBindingV1
  | BuildPromptArtifactProductionBindingV2;

export interface PromptArtifactManifest {
  readonly inputArtifactHash: string;
  readonly promptTemplateId: string;
  readonly promptTemplateVersion: number;
  readonly runType: AgentSpecialistRunType;
  readonly generatedAt: string;
  readonly safetyClass: PromptArtifactSafetyClass;
  readonly transferApprovalClass: PromptArtifactTransferApprovalClass;
  readonly contextPackRefs: readonly ContextPackRef[];
  readonly omissions: readonly PromptArtifactOmission[];
  readonly safeSummary: string;
  readonly production?: PromptArtifactProductionBinding;
}

export interface PromptArtifactEnvelope {
  readonly manifest: PromptArtifactManifest;
  readonly text: string;
  readonly resolvedContextPacks?: readonly VerifiedResolvedContextPack[];
}

export interface ParsePromptArtifactEnvelopeOptions {
  readonly authoritativeResolvedContextPacks?: readonly VerifiedResolvedContextPack[];
}

export interface PromptArtifactAuditMetadata {
  readonly inputArtifactHash: string;
  readonly promptTemplateId: string;
  readonly promptTemplateVersion: number;
  readonly runType: AgentSpecialistRunType;
  readonly safetyClass: PromptArtifactSafetyClass;
  readonly transferApprovalClass: PromptArtifactTransferApprovalClass;
  readonly contextPackRefs: readonly ContextPackRef[];
  readonly omissions: readonly PromptArtifactOmission[];
  readonly safeSummary: string;
  /** Durable artifact audit: v2 build-only inputs are never exposed here. */
  readonly production?: PromptArtifactProductionBinding;
}

export interface BuildPromptArtifactInput {
  readonly promptTemplateId: string;
  readonly promptTemplateVersion: number;
  readonly generatedAt: string;
  readonly runType: AgentSpecialistRunType;
  readonly safetyClass: PromptArtifactSafetyClass;
  readonly transferApprovalClass: PromptArtifactTransferApprovalClass;
  readonly contextPackRefs: readonly ContextPackRef[];
  readonly text: string;
  readonly safeSummary: string;
  readonly omissions?: readonly PromptArtifactOmission[];
  readonly production?: BuildPromptArtifactProductionBinding;
  readonly resolvedContextPacks?: readonly VerifiedResolvedContextPack[];
}

export interface PromptArtifactResolver {
  resolve(inputArtifactHash: string): Promise<PromptArtifactEnvelope>;
}

export interface PromptArtifactTemplateRegistration {
  readonly runType: AgentSpecialistRunType;
  readonly promptTemplateId: string;
  readonly promptTemplateVersion: number;
  readonly label: string;
}

export interface PromptArtifactTemplateRegistrySnapshot {
  readonly templates: readonly PromptArtifactTemplateRegistration[];
}

export interface PromptArtifactTemplateRegistry {
  register(template: PromptArtifactTemplateRegistration): void;
  snapshot(): PromptArtifactTemplateRegistrySnapshot;
}

const contentHashPattern = /^sha256:[a-f0-9]{64}$/;
const agentSecretSafeTextSchema = (label: string) => z.string().min(1)
  .superRefine((value, ctx) => addSecretSafeIssue(value, label, ctx));
const approvedRunTypeSet = new Set<string>(approvedAgentSpecialistRunTypes);
const runTypeSchema = z.string()
  .refine((value) => approvedRunTypeSet.has(value), { message: "run type must be an approved specialist run type" })
  .transform((value) => value as AgentSpecialistRunType);
const safetyClassSchema = z.enum([
  "workspace-safe",
  "public-safe",
  "sensitive-local-only",
  "provider-approved"
]);
const transferApprovalClassSchema = z.enum(["none", "provider-byte-transfer"]);

const promptArtifactOmissionObjectSchema = z.object({
  reason: agentSecretSafeTextSchema("omission.reason"),
  sourceRef: agentSecretSafeTextSchema("omission.sourceRef"),
  safeSummary: agentSecretSafeTextSchema("omission.safeSummary")
}).strict();

const promptArtifactResolvedPayloadAuditObjectSchema = z.object({
  contextPackId: agentSecretSafeTextSchema("production.resolvedPayloadAudit.contextPackId"),
  contentHash: z.string().regex(contentHashPattern),
  sizeBytes: z.number().int().nonnegative(),
  schemaId: agentSecretSafeTextSchema("production.resolvedPayloadAudit.schemaId")
}).strict();

const promptArtifactEvaluatedContextRequirementObjectSchema = z.object({
  contextPackId: agentSecretSafeTextSchema("production.evaluatedContextRequirement.contextPackId"),
  requirementMode: z.enum(["always", "when-scope-associated-prr"]),
  status: z.enum(["applicable", "not-applicable"]),
  contentHash: z.string().regex(contentHashPattern).optional(),
  omissionReason: z.enum(["no-associated-prr"]).optional()
}).strict().superRefine((value, ctx) => {
  if (value.status === "applicable" && (value.contentHash === undefined || value.omissionReason !== undefined)) {
    ctx.addIssue({ code: "custom", message: "Applicable context requirements require contentHash and no omissionReason" });
  }
  if (value.status === "not-applicable" && (value.contentHash !== undefined || value.omissionReason !== "no-associated-prr")) {
    ctx.addIssue({ code: "custom", message: "Non-applicable context requirements require no-associated-prr and no contentHash" });
  }
});

const promptArtifactProductionBindingFieldsSchema = z.object({
  rendererId: agentSecretSafeTextSchema("production.rendererId"),
  rendererVersion: z.number().int().positive(),
  rendererHash: z.string().regex(contentHashPattern),
  renderedPromptHash: z.string().regex(contentHashPattern),
  providerOutputSchemaId: agentSecretSafeTextSchema("production.providerOutputSchemaId"),
  providerOutputSchemaVersion: z.number().int().positive(),
  handoffSchemaId: agentSecretSafeTextSchema("production.handoffSchemaId"),
  handoffSchemaVersion: z.number().int().positive(),
  scopeApplicabilityHash: z.string().regex(contentHashPattern),
  evaluatedContextRequirements: z.array(promptArtifactEvaluatedContextRequirementObjectSchema),
  resolvedPayloadAudits: z.array(promptArtifactResolvedPayloadAuditObjectSchema)
});

const promptArtifactProviderPostureV2ObjectSchema = z.object({
  providerId: agentSecretSafeTextSchema("production.providerPosture.providerId"),
  modelId: agentSecretSafeTextSchema("production.providerPosture.modelId"),
  capabilityIds: z.array(agentSecretSafeTextSchema("production.providerPosture.capabilityIds")).min(1),
  selectionPolicyVersion: agentSecretSafeTextSchema("production.providerPosture.selectionPolicyVersion"),
  readinessState: z.literal("ready"),
  approvalRequirementId: agentSecretSafeTextSchema("production.providerPosture.approvalRequirementId")
}).strict();

const promptArtifactExactRunBindingV2ObjectSchema = z.object({
  taskId: agentSecretSafeTextSchema("production.exactRunBinding.taskId"),
  attemptId: agentSecretSafeTextSchema("production.exactRunBinding.attemptId"),
  approvedRunId: agentSecretSafeTextSchema("production.exactRunBinding.approvedRunId"),
  runId: agentSecretSafeTextSchema("production.exactRunBinding.runId"),
  runType: runTypeSchema.refine((value) => value !== "ontology-bootstrap", { message: "production exact run must be a production run type" }),
  residentAgentId: z.literal("agent_default"),
  workspaceId: agentSecretSafeTextSchema("production.exactRunBinding.workspaceId"),
  mountInstanceId: agentSecretSafeTextSchema("production.exactRunBinding.mountInstanceId"),
  workflowDescriptorHash: z.string().regex(contentHashPattern),
  policyVersion: agentSecretSafeTextSchema("production.exactRunBinding.policyVersion"),
  providerPosture: promptArtifactProviderPostureV2ObjectSchema
}).strict();

const promptArtifactProductionBindingV1ObjectSchema = promptArtifactProductionBindingFieldsSchema.extend({
  schemaVersion: z.literal("agent-production-prompt-binding.v1")
}).strict();

const promptArtifactProductionBindingV2ObjectSchema = promptArtifactProductionBindingFieldsSchema.extend({
  schemaVersion: z.literal("agent-production-prompt-binding.v2"),
  sourceApprovedPromptArtifactHash: z.string().regex(contentHashPattern),
  exactRunBinding: promptArtifactExactRunBindingV2ObjectSchema,
  providerPostureHash: z.string().regex(contentHashPattern),
  exactRunBindingHash: z.string().regex(contentHashPattern)
}).strict();

const promptArtifactProductionBindingObjectSchema = z.discriminatedUnion("schemaVersion", [
  promptArtifactProductionBindingV1ObjectSchema,
  promptArtifactProductionBindingV2ObjectSchema
]);

const createPromptArtifactExactRunBindingV2InputObjectSchema = z.object({
  taskId: agentSecretSafeTextSchema("production.exactRun.taskId"),
  attemptId: agentSecretSafeTextSchema("production.exactRun.attemptId"),
  approvedRunId: agentSecretSafeTextSchema("production.exactRun.approvedRunId"),
  runId: agentSecretSafeTextSchema("production.exactRun.runId"),
  runType: runTypeSchema.refine((value) => value !== "ontology-bootstrap", { message: "production exact run must be a production run type" }),
  residentAgentId: z.literal("agent_default"),
  workspaceId: agentSecretSafeTextSchema("production.exactRun.workspaceId"),
  mountInstanceId: agentSecretSafeTextSchema("production.exactRun.mountInstanceId"),
  workflowDescriptor: z.unknown(),
  policyVersion: agentSecretSafeTextSchema("production.exactRun.policyVersion"),
  providerPosture: promptArtifactProviderPostureV2ObjectSchema
}).strict();

const buildPromptArtifactProductionBindingV2ObjectSchema = z.object({
  schemaVersion: z.literal("agent-production-prompt-binding.v2"),
  sourceApprovedPromptArtifact: z.unknown(),
  scope: z.unknown(),
  exactRun: createPromptArtifactExactRunBindingV2InputObjectSchema
}).strict();

const buildPromptArtifactProductionBindingObjectSchema = z.discriminatedUnion("schemaVersion", [
  promptArtifactProductionBindingV1ObjectSchema,
  buildPromptArtifactProductionBindingV2ObjectSchema
]);

const buildPromptArtifactInputObjectSchema = z.object({
  promptTemplateId: agentSecretSafeTextSchema("promptTemplateId"),
  promptTemplateVersion: z.number().int().positive(),
  generatedAt: z.string().datetime(),
  runType: runTypeSchema,
  safetyClass: safetyClassSchema,
  transferApprovalClass: transferApprovalClassSchema,
  contextPackRefs: z.array(contextPackRefSchema).min(1),
  text: agentSecretSafeTextSchema("promptArtifact.text"),
  safeSummary: agentSecretSafeTextSchema("safeSummary"),
  omissions: z.array(promptArtifactOmissionObjectSchema).optional(),
  production: buildPromptArtifactProductionBindingObjectSchema.optional(),
  resolvedContextPacks: z.array(z.unknown()).optional()
}).strict();

const promptArtifactManifestObjectSchema = z.object({
  inputArtifactHash: z.string().regex(contentHashPattern),
  promptTemplateId: agentSecretSafeTextSchema("promptTemplateId"),
  promptTemplateVersion: z.number().int().positive(),
  runType: runTypeSchema,
  generatedAt: z.string().datetime(),
  safetyClass: safetyClassSchema,
  transferApprovalClass: transferApprovalClassSchema,
  contextPackRefs: z.array(contextPackRefSchema).min(1),
  omissions: z.array(promptArtifactOmissionObjectSchema),
  safeSummary: agentSecretSafeTextSchema("safeSummary"),
  production: promptArtifactProductionBindingObjectSchema.optional()
}).strict();

const promptArtifactEnvelopeObjectSchema = z.object({
  manifest: promptArtifactManifestObjectSchema,
  text: agentSecretSafeTextSchema("promptArtifact.text"),
  resolvedContextPacks: z.array(z.unknown()).optional()
}).strict();
const promptArtifactAuditMetadataObjectSchema = z.object({
  inputArtifactHash: z.string().regex(contentHashPattern),
  promptTemplateId: agentSecretSafeTextSchema("promptTemplateId"),
  promptTemplateVersion: z.number().int().positive(),
  runType: runTypeSchema,
  safetyClass: safetyClassSchema,
  transferApprovalClass: transferApprovalClassSchema,
  contextPackRefs: z.array(contextPackRefSchema).min(1),
  omissions: z.array(promptArtifactOmissionObjectSchema),
  safeSummary: agentSecretSafeTextSchema("safeSummary"),
  production: promptArtifactProductionBindingObjectSchema.optional()
}).strict();
const promptArtifactTemplateRegistrationObjectSchema = z.object({
  runType: runTypeSchema,
  promptTemplateId: agentSecretSafeTextSchema("promptTemplateId"),
  promptTemplateVersion: z.number().int().positive(),
  label: agentSecretSafeTextSchema("template.label")
}).strict();

export function createPromptArtifactExactRunBindingV2(
  input: CreatePromptArtifactExactRunBindingV2Input
): PromptArtifactExactRunBindingV2 {
  const parsed = parseNormalizedDtoOrThrow(input, createPromptArtifactExactRunBindingV2InputObjectSchema, "$");
  const canonicalDescriptor = specialistWorkflowDescriptorFor(parsed.runType);
  if (stableJsonForPromptArtifact(parsed.workflowDescriptor) !== stableJsonForPromptArtifact(canonicalDescriptor)) {
    throw new Error("Production exact run workflow descriptor does not match the registered specialist workflow");
  }
  const providerPosture = freezePromptArtifactProviderPostureV2(parsed.providerPosture);
  return freezePromptArtifactExactRunBindingV2({
    taskId: parsed.taskId,
    attemptId: parsed.attemptId,
    approvedRunId: parsed.approvedRunId,
    runId: parsed.runId,
    runType: parsed.runType as Exclude<AgentSpecialistRunType, "ontology-bootstrap">,
    residentAgentId: parsed.residentAgentId,
    workspaceId: parsed.workspaceId,
    mountInstanceId: parsed.mountInstanceId,
    workflowDescriptorHash: hashAgentContextPack(canonicalDescriptor) as `sha256:${string}`,
    policyVersion: parsed.policyVersion,
    providerPosture
  });
}

export function hashPromptArtifactProviderPostureV2(
  posture: PromptArtifactProviderPostureV2
): `sha256:${string}` {
  return hashAgentContextPack(freezePromptArtifactProviderPostureV2(
    parseNormalizedDtoOrThrow(posture, promptArtifactProviderPostureV2ObjectSchema, "$")
  )) as `sha256:${string}`;
}

export function hashPromptArtifactExactRunBindingV2(
  binding: PromptArtifactExactRunBindingV2
): `sha256:${string}` {
  // The schema verifies the content-hash strings; this restores their branded
  // TypeScript form after Zod's plain-string inference.
  const parsed = parseNormalizedDtoOrThrow(
    binding,
    promptArtifactExactRunBindingV2ObjectSchema,
    "$"
  ) as PromptArtifactExactRunBindingV2;
  return hashAgentContextPack(freezePromptArtifactExactRunBindingV2(
    parsed
  )) as `sha256:${string}`;
}

export function buildPromptArtifact(input: BuildPromptArtifactInput): PromptArtifactEnvelope {
  const parsed = parseNormalizedDtoOrThrow(input, buildPromptArtifactInputObjectSchema, "$");
  const omissions = parsed.omissions ?? [];
  const resolvedContextPacks = resolveAuthoritativeContextPacks(input, parsed.contextPackRefs);
  if (parsed.production !== undefined && resolvedContextPacks === undefined) {
    throw new Error("Production prompt artifacts require resolved context packs");
  }
  const production = parsed.production === undefined
    ? undefined
    : normalizeProductionBinding(parsed.production, parsed, parsed.text, resolvedContextPacks, { deriveHashes: true });
  const manifestWithoutHash = {
    promptTemplateId: parsed.promptTemplateId,
    promptTemplateVersion: parsed.promptTemplateVersion,
    runType: parsed.runType,
    generatedAt: parsed.generatedAt,
    safetyClass: parsed.safetyClass,
    transferApprovalClass: parsed.transferApprovalClass,
    contextPackRefs: parsed.contextPackRefs,
    omissions,
    safeSummary: parsed.safeSummary,
    ...(production === undefined ? {} : { production })
  };
  const inputArtifactHash = computePromptArtifactHash({
    manifest: manifestWithoutHash,
    text: parsed.text
  });

  return freezePromptArtifactEnvelope({
    manifest: {
      inputArtifactHash,
      ...manifestWithoutHash
    },
    text: parsed.text,
    ...(resolvedContextPacks === undefined ? {} : { resolvedContextPacks })
  });
}

export function serializePromptArtifactEnvelope(envelope: PromptArtifactEnvelope): Uint8Array {
  const parsed = normalizePromptArtifactEnvelope(envelope);
  const resolvedContextPacks = resolveAuthoritativeContextPacks(envelope, parsed.manifest.contextPackRefs);
  if (parsed.manifest.production !== undefined && resolvedContextPacks === undefined) {
    throw new Error("Production prompt artifacts require resolved context packs");
  }
  const production = parsed.manifest.production === undefined
    ? undefined
    : normalizeProductionBinding(parsed.manifest.production, parsed.manifest, parsed.text, resolvedContextPacks);
  const serializable = freezePromptArtifactEnvelope({
    manifest: {
      ...parsed.manifest,
      ...(production === undefined ? {} : { production })
    },
    text: parsed.text,
    ...(resolvedContextPacks === undefined ? {} : { resolvedContextPacks })
  });

  return Buffer.from(stableJsonForPromptArtifact(serializable), "utf8");
}

export function parsePromptArtifactEnvelope(
  bytes: string | Uint8Array,
  options: ParsePromptArtifactEnvelopeOptions = {}
): PromptArtifactEnvelope {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(typeof bytes === "string" ? bytes : Buffer.from(bytes).toString("utf8"));
  } catch {
    throw new Error("Prompt artifact envelope must be valid JSON");
  }

  const parsed = normalizePromptArtifactEnvelope(parsedJson);
  if (options.authoritativeResolvedContextPacks === undefined || parsed.manifest.production === undefined) {
    return parsed;
  }

  const resolvedContextPacks = rehydrateProductionResolvedContextPacks(
    parsedJson,
    parsed.manifest.contextPackRefs,
    options.authoritativeResolvedContextPacks
  );
  const production = normalizeProductionBinding(
    parsed.manifest.production,
    parsed.manifest,
    parsed.text,
    resolvedContextPacks
  );
  return freezePromptArtifactEnvelope({
    manifest: { ...parsed.manifest, production },
    text: parsed.text,
    resolvedContextPacks
  });
}

export function assertPromptArtifactCanTransferToRemoteProvider(envelope: PromptArtifactEnvelope): void {
  const parsed = normalizePromptArtifactEnvelope(envelope);
  if (
    parsed.manifest.safetyClass !== "provider-approved" ||
    parsed.manifest.transferApprovalClass !== "provider-byte-transfer"
  ) {
    throw new Error("Prompt artifact is not approved for provider transfer");
  }
  if (isProductionRunType(parsed.manifest.runType) && parsed.manifest.production === undefined) {
    throw new Error("Production prompt artifact requires a complete production binding");
  }
  if (isProductionRunType(parsed.manifest.runType)) {
    assertProductionPromptTransferBoundary(envelope, parsed);
  }
}

function assertProductionPromptTransferBoundary(
  envelope: PromptArtifactEnvelope,
  parsed: PromptArtifactEnvelope
): void {
  if (parsed.manifest.production === undefined) {
    throw new Error("Production prompt artifact requires a complete production binding");
  }
  if (!isProductionSpecialistPromptArtifactRendererVerified(envelope)) {
    throw new Error("Production prompt artifacts require production renderer verification before provider transfer");
  }
}

export function createPromptArtifactResolver(envelopes: readonly PromptArtifactEnvelope[]): PromptArtifactResolver {
  const byHash = new Map<string, PromptArtifactEnvelope>();
  for (const envelopeInput of envelopes) {
    const envelope = normalizePromptArtifactEnvelope(envelopeInput);
    const hash = envelope.manifest.inputArtifactHash;
    if (byHash.has(hash)) {
      throw new Error(`Duplicate prompt artifact hash ${hash}`);
    }
    byHash.set(hash, envelope);
  }

  return Object.freeze({
    async resolve(inputArtifactHash: string): Promise<PromptArtifactEnvelope> {
      assertSafeContentHash(inputArtifactHash, "inputArtifactHash");
      const envelope = byHash.get(inputArtifactHash);
      if (envelope === undefined) {
        throw new Error(`Prompt artifact ${inputArtifactHash} not found`);
      }

      return envelope;
    }
  });
}

export function createPromptArtifactTemplateRegistry(): PromptArtifactTemplateRegistry {
  const templates = new Map<string, PromptArtifactTemplateRegistration>();

  return Object.freeze({
    register(templateInput: PromptArtifactTemplateRegistration): void {
      const template = freezePromptArtifactTemplateRegistration(
        parseNormalizedDtoOrThrow(templateInput, promptArtifactTemplateRegistrationObjectSchema, "$")
      );
      if (templates.has(template.promptTemplateId)) {
        throw new Error(`Prompt artifact template ${template.promptTemplateId} is already registered`);
      }

      templates.set(template.promptTemplateId, template);
    },

    snapshot(): PromptArtifactTemplateRegistrySnapshot {
      return Object.freeze({
        templates: Object.freeze([...templates.values()])
      });
    }
  });
}

export function promptArtifactAuditMetadata(envelope: PromptArtifactEnvelope): PromptArtifactAuditMetadata {
  const parsed = normalizePromptArtifactEnvelope(envelope);

  return Object.freeze({
    inputArtifactHash: parsed.manifest.inputArtifactHash,
    promptTemplateId: parsed.manifest.promptTemplateId,
    promptTemplateVersion: parsed.manifest.promptTemplateVersion,
    runType: parsed.manifest.runType,
    safetyClass: parsed.manifest.safetyClass,
    transferApprovalClass: parsed.manifest.transferApprovalClass,
    contextPackRefs: parsed.manifest.contextPackRefs,
    omissions: parsed.manifest.omissions,
    safeSummary: parsed.manifest.safeSummary,
    ...(parsed.manifest.production === undefined ? {} : { production: parsed.manifest.production })
  });
}

export function parsePromptArtifactAuditMetadata(value: unknown): PromptArtifactAuditMetadata {
  const parsed = parseNormalizedDtoOrThrow(value, promptArtifactAuditMetadataObjectSchema, "$");
  return Object.freeze({
    inputArtifactHash: parsed.inputArtifactHash,
    promptTemplateId: parsed.promptTemplateId,
    promptTemplateVersion: parsed.promptTemplateVersion,
    runType: parsed.runType,
    safetyClass: parsed.safetyClass,
    transferApprovalClass: parsed.transferApprovalClass,
    contextPackRefs: Object.freeze([...parsed.contextPackRefs]),
    omissions: Object.freeze(parsed.omissions.map(freezePromptArtifactOmission)),
    safeSummary: parsed.safeSummary,
    ...(parsed.production === undefined
      ? {}
      : { production: freezePromptArtifactProductionBinding(parsed.production as PromptArtifactProductionBinding) })
  });
}

function normalizePromptArtifactEnvelope(envelope: unknown): PromptArtifactEnvelope {
  const parsed = parseNormalizedDtoOrThrow(envelope, promptArtifactEnvelopeObjectSchema, "$");
  const production = parsed.manifest.production === undefined
    ? undefined
    : normalizeProductionBinding(parsed.manifest.production, parsed.manifest, parsed.text);
  const expectedHash = computePromptArtifactHash({
    manifest: {
      promptTemplateId: parsed.manifest.promptTemplateId,
      promptTemplateVersion: parsed.manifest.promptTemplateVersion,
      runType: parsed.manifest.runType,
      generatedAt: parsed.manifest.generatedAt,
      safetyClass: parsed.manifest.safetyClass,
      transferApprovalClass: parsed.manifest.transferApprovalClass,
      contextPackRefs: parsed.manifest.contextPackRefs,
      omissions: parsed.manifest.omissions,
      safeSummary: parsed.manifest.safeSummary,
      ...(production === undefined ? {} : { production })
    },
    text: parsed.text
  });
  if (expectedHash !== parsed.manifest.inputArtifactHash) {
    throw new Error("Prompt artifact hash mismatch");
  }

  const { production: _production, ...manifestWithoutProduction } = parsed.manifest;
  return freezePromptArtifactEnvelope({
    manifest: {
      ...manifestWithoutProduction,
      ...(production === undefined ? {} : { production })
    },
    text: parsed.text
  });
}

function computePromptArtifactHash(input: {
  readonly manifest: Omit<PromptArtifactManifest, "inputArtifactHash">;
  readonly text: string;
}): string {
  return hashAgentContextPack({
    manifest: input.manifest,
    text: input.text
  });
}

function normalizeProductionBinding(
  production: PromptArtifactProductionBinding | BuildPromptArtifactProductionBinding | z.infer<typeof promptArtifactProductionBindingObjectSchema> | z.infer<typeof buildPromptArtifactProductionBindingObjectSchema>,
  manifest: Pick<PromptArtifactManifest, "runType" | "promptTemplateId" | "promptTemplateVersion" | "contextPackRefs">,
  text: string,
  verifiedResolvedContextPacks?: readonly VerifiedResolvedContextPack[],
  options: { readonly deriveHashes?: boolean } = {}
): PromptArtifactProductionBinding {
  if (production.schemaVersion === "agent-production-prompt-binding.v2" && "sourceApprovedPromptArtifact" in production) {
    return bindProductionBindingV2(production, manifest, text, verifiedResolvedContextPacks);
  }

  if (production.schemaVersion === "agent-production-prompt-binding.v2") {
    return normalizePersistedProductionBindingV2(production, manifest, text, verifiedResolvedContextPacks);
  }

  return normalizeProductionBindingV1(production, manifest, text, verifiedResolvedContextPacks, options);
}

function normalizeProductionBindingV1(
  production: PromptArtifactProductionBindingV1 | z.infer<typeof promptArtifactProductionBindingV1ObjectSchema>,
  manifest: Pick<PromptArtifactManifest, "runType" | "promptTemplateId" | "promptTemplateVersion" | "contextPackRefs">,
  text: string,
  verifiedResolvedContextPacks?: readonly VerifiedResolvedContextPack[],
  options: { readonly deriveHashes?: boolean } = {}
): PromptArtifactProductionBindingV1 {
  if (!isProductionRunType(manifest.runType)) {
    throw new Error("Production prompt binding is not supported for this run type");
  }
  const registration = productionSpecialistPromptRegistrationFor(manifest.runType);
  if (
    manifest.promptTemplateId !== registration.promptTemplateId ||
    manifest.promptTemplateVersion !== registration.promptTemplateVersion ||
    production.rendererId !== registration.rendererId ||
    production.rendererVersion !== registration.rendererVersion ||
    production.rendererHash !== registration.rendererHash ||
    production.providerOutputSchemaId !== registration.providerOutputSchemaId ||
    production.providerOutputSchemaVersion !== registration.providerOutputSchemaVersion ||
    production.handoffSchemaId !== registration.handoffSchemaId ||
    production.handoffSchemaVersion !== registration.handoffSchemaVersion
  ) {
    throw new Error("Production prompt binding does not match the registered specialist renderer");
  }

  assertEvaluatedContextRequirements(production.evaluatedContextRequirements, registration.contextRequirements, manifest.contextPackRefs);
  const expectedAudits = verifiedResolvedContextPacks === undefined
    ? auditsFromContextPackRefs(manifest.contextPackRefs)
    : auditsFromVerifiedResolvedContextPacks(verifiedResolvedContextPacks);
  if (hashAgentContextPack(production.resolvedPayloadAudits) !== hashAgentContextPack(expectedAudits)) {
    throw new Error("Production resolved payload audits do not match authoritative context packs");
  }
  const expectedRenderedPromptHash = hashPromptText(text);
  if (!options.deriveHashes && production.renderedPromptHash !== expectedRenderedPromptHash) {
    throw new Error("Production prompt binding hash mismatch");
  }

  return freezePromptArtifactProductionBinding({
    ...production,
    renderedPromptHash: expectedRenderedPromptHash,
    resolvedPayloadAudits: expectedAudits
  } as PromptArtifactProductionBindingV1) as PromptArtifactProductionBindingV1;
}

function bindProductionBindingV2(
  production: BuildPromptArtifactProductionBindingV2 | z.infer<typeof buildPromptArtifactProductionBindingV2ObjectSchema>,
  manifest: Pick<PromptArtifactManifest, "runType" | "promptTemplateId" | "promptTemplateVersion" | "contextPackRefs">,
  text: string,
  verifiedResolvedContextPacks?: readonly VerifiedResolvedContextPack[]
): PromptArtifactProductionBindingV2 {
  if (verifiedResolvedContextPacks === undefined) {
    throw new Error("Production v2 binding requires resolved context packs");
  }
  if (typeof production.scope !== "object" || production.scope === null || Array.isArray(production.scope)) {
    throw new Error("Production v2 binding requires a raw production scope");
  }
  const source = normalizePromptArtifactEnvelope(production.sourceApprovedPromptArtifact);
  const sourceProduction = source.manifest.production;
  if (sourceProduction === undefined || sourceProduction.schemaVersion !== "agent-production-prompt-binding.v1") {
    throw new Error("Production v2 binding requires an explicit approved v1 source artifact");
  }
  if (
    source.manifest.runType !== manifest.runType ||
    source.manifest.promptTemplateId !== manifest.promptTemplateId ||
    source.manifest.promptTemplateVersion !== manifest.promptTemplateVersion ||
    source.text !== text ||
    stableJsonForPromptArtifact(source.manifest.contextPackRefs) !== stableJsonForPromptArtifact(manifest.contextPackRefs)
  ) {
    throw new Error("Production v2 binding must preserve the exact approved v1 bytes and template facts");
  }

  const normalizedSource = normalizeProductionBindingV1(
    sourceProduction,
    source.manifest,
    source.text,
    verifiedResolvedContextPacks
  );
  const exactRunBinding = createPromptArtifactExactRunBindingV2(production.exactRun as CreatePromptArtifactExactRunBindingV2Input);
  if (exactRunBinding.runType !== manifest.runType) {
    throw new Error("Production v2 exact run does not match the approved v1 run type");
  }
  const registration = productionSpecialistPromptRegistrationFor(exactRunBinding.runType);
  const expectedAudits = auditsFromVerifiedResolvedContextPacks(verifiedResolvedContextPacks);
  if (stableJsonForPromptArtifact(normalizedSource.resolvedPayloadAudits) !== stableJsonForPromptArtifact(expectedAudits)) {
    throw new Error("Production v2 binding resolved context packs do not match the approved v1 source");
  }

  return freezePromptArtifactProductionBinding({
    schemaVersion: "agent-production-prompt-binding.v2",
    rendererId: registration.rendererId,
    rendererVersion: registration.rendererVersion,
    rendererHash: registration.rendererHash,
    renderedPromptHash: hashPromptText(text) as `sha256:${string}`,
    providerOutputSchemaId: registration.providerOutputSchemaId,
    providerOutputSchemaVersion: registration.providerOutputSchemaVersion,
    handoffSchemaId: registration.handoffSchemaId,
    handoffSchemaVersion: registration.handoffSchemaVersion,
    scopeApplicabilityHash: normalizedSource.scopeApplicabilityHash,
    evaluatedContextRequirements: normalizedSource.evaluatedContextRequirements,
    resolvedPayloadAudits: expectedAudits,
    sourceApprovedPromptArtifactHash: source.manifest.inputArtifactHash as `sha256:${string}`,
    exactRunBinding,
    providerPostureHash: hashPromptArtifactProviderPostureV2(exactRunBinding.providerPosture),
    exactRunBindingHash: hashPromptArtifactExactRunBindingV2(exactRunBinding)
  }) as PromptArtifactProductionBindingV2;
}

function normalizePersistedProductionBindingV2(
  production: PromptArtifactProductionBindingV2 | z.infer<typeof promptArtifactProductionBindingV2ObjectSchema>,
  manifest: Pick<PromptArtifactManifest, "runType" | "promptTemplateId" | "promptTemplateVersion" | "contextPackRefs">,
  text: string,
  verifiedResolvedContextPacks?: readonly VerifiedResolvedContextPack[]
): PromptArtifactProductionBindingV2 {
  // Both callers have already parsed this DTO against the strict durable-v2
  // schema. Keep build-v2 input fields out of the persisted branch.
  const persisted = production as PromptArtifactProductionBindingV2;
  if (!isProductionRunType(manifest.runType)) {
    throw new Error("Production prompt binding is not supported for this run type");
  }
  const registration = productionSpecialistPromptRegistrationFor(manifest.runType);
  if (
    manifest.promptTemplateId !== registration.promptTemplateId ||
    manifest.promptTemplateVersion !== registration.promptTemplateVersion ||
    persisted.rendererId !== registration.rendererId ||
    persisted.rendererVersion !== registration.rendererVersion ||
    persisted.rendererHash !== registration.rendererHash ||
    persisted.providerOutputSchemaId !== registration.providerOutputSchemaId ||
    persisted.providerOutputSchemaVersion !== registration.providerOutputSchemaVersion ||
    persisted.handoffSchemaId !== registration.handoffSchemaId ||
    persisted.handoffSchemaVersion !== registration.handoffSchemaVersion
  ) {
    throw new Error("Production prompt binding does not match the registered specialist renderer");
  }
  const exactRunBinding = normalizePersistedPromptArtifactExactRunBindingV2(persisted.exactRunBinding);
  if (exactRunBinding.runType !== manifest.runType) {
    throw new Error("Production v2 exact run does not match the artifact run type");
  }
  if (
    persisted.providerPostureHash !== hashPromptArtifactProviderPostureV2(exactRunBinding.providerPosture) ||
    persisted.exactRunBindingHash !== hashPromptArtifactExactRunBindingV2(exactRunBinding)
  ) {
    throw new Error("Production v2 binding derived hash mismatch");
  }
  assertEvaluatedContextRequirements(persisted.evaluatedContextRequirements, registration.contextRequirements, manifest.contextPackRefs);
  const expectedAudits = verifiedResolvedContextPacks === undefined
    ? auditsFromContextPackRefs(manifest.contextPackRefs)
    : auditsFromVerifiedResolvedContextPacks(verifiedResolvedContextPacks);
  if (stableJsonForPromptArtifact(persisted.resolvedPayloadAudits) !== stableJsonForPromptArtifact(expectedAudits)) {
    throw new Error("Production resolved payload audits do not match authoritative context packs");
  }
  if (persisted.renderedPromptHash !== hashPromptText(text)) {
    throw new Error("Production prompt binding hash mismatch");
  }
  return freezePromptArtifactProductionBinding({
    ...persisted,
    exactRunBinding,
    resolvedPayloadAudits: expectedAudits
  }) as PromptArtifactProductionBindingV2;
}

function assertEvaluatedContextRequirements(
  evaluated: readonly PromptArtifactEvaluatedContextRequirement[],
  registered: readonly {
    readonly contextPackId: string;
    readonly order: number;
    readonly requirementMode: "always" | "when-scope-associated-prr";
    readonly omissionWhenNotApplicable?: "no-associated-prr";
  }[],
  refs: readonly ContextPackRef[]
): void {
  if (evaluated.length !== registered.length) {
    throw new Error("Production context requirements must include the complete registered requirement list");
  }

  const applicable = evaluated.filter((requirement) => requirement.status === "applicable");
  if (refs.length !== applicable.length) {
    throw new Error("Production context pack refs must exactly match applicable registered requirements");
  }

  for (let index = 0; index < registered.length; index += 1) {
    const registeredRequirement = registered[index];
    const evaluatedRequirement = evaluated[index];
    if (registeredRequirement === undefined || evaluatedRequirement === undefined) {
      throw new Error("Production context requirements must include the complete registered requirement list");
    }
    if (
      registeredRequirement.order !== index ||
      evaluatedRequirement.contextPackId !== registeredRequirement.contextPackId ||
      evaluatedRequirement.requirementMode !== registeredRequirement.requirementMode
    ) {
      throw new Error("Production context requirement does not match the registered specialist renderer");
    }

    if (evaluatedRequirement.status === "applicable") {
      const ref = refs[applicable.indexOf(evaluatedRequirement)];
      if (
        ref === undefined ||
        ref.contextPackId !== evaluatedRequirement.contextPackId ||
        evaluatedRequirement.contentHash !== ref.contentHash
      ) {
        throw new Error("Applicable production context requirement does not match a context pack ref");
      }
    } else if (
      registeredRequirement.contextPackId !== "prr-read-model.v1" ||
      registeredRequirement.requirementMode !== "when-scope-associated-prr" ||
      registeredRequirement.omissionWhenNotApplicable !== "no-associated-prr" ||
      evaluatedRequirement.omissionReason !== "no-associated-prr"
    ) {
      throw new Error("Production context requirement is not validly omitted");
    }
  }
}

function auditsFromVerifiedResolvedContextPacks(
  resolvedContextPacks: readonly VerifiedResolvedContextPack[]
): readonly PromptArtifactResolvedPayloadAudit[] {
  return Object.freeze(resolvedContextPacks.map((resolved) => Object.freeze({
    contextPackId: resolved.ref.contextPackId,
    contentHash: resolved.ref.contentHash,
    sizeBytes: resolved.ref.sizeBytes,
    schemaId: resolved.ref.contextPackId
  })));
}

function auditsFromContextPackRefs(refs: readonly ContextPackRef[]): readonly PromptArtifactResolvedPayloadAudit[] {
  return Object.freeze(refs.map((ref) => Object.freeze({
    contextPackId: ref.contextPackId,
    contentHash: ref.contentHash,
    sizeBytes: ref.sizeBytes,
    schemaId: ref.contextPackId
  })));
}

function hashPromptText(text: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex")}`;
}

function isProductionRunType(runType: AgentSpecialistRunType): runType is Exclude<AgentSpecialistRunType, "ontology-bootstrap"> {
  return productionSpecialistPromptRegistrations.some((registration) => registration.runType === runType);
}

function resolveAuthoritativeContextPacks(
  input: unknown,
  refs: readonly ContextPackRef[]
): readonly VerifiedResolvedContextPack[] | undefined {
  if (typeof input !== "object" || input === null) {
    return undefined;
  }
  const descriptor = Object.getOwnPropertyDescriptor(input, "resolvedContextPacks");
  if (descriptor === undefined) {
    return undefined;
  }
  if (!descriptor.enumerable || !("value" in descriptor) || !Array.isArray(descriptor.value)) {
    throw new Error("resolvedContextPacks must be JSON DTO-safe");
  }
  return assertResolvedContextPacksForExecution(
    refs,
    descriptor.value as readonly VerifiedResolvedContextPack[]
  );
}

function rehydrateProductionResolvedContextPacks(
  input: unknown,
  refs: readonly ContextPackRef[],
  authoritativeResolvedContextPacks: readonly VerifiedResolvedContextPack[]
): readonly VerifiedResolvedContextPack[] {
  const authoritative = assertResolvedContextPacksForExecution(refs, authoritativeResolvedContextPacks);
  const persisted = persistedResolvedContextPacks(input);
  if (persisted.length !== authoritative.length) {
    throw new Error("Persisted resolvedContextPacks do not match authoritative context packs");
  }

  for (let index = 0; index < authoritative.length; index += 1) {
    const persistedPack = persisted[index];
    const verifiedPack = authoritative[index];
    if (persistedPack === undefined || verifiedPack === undefined) {
      throw new Error("Persisted resolvedContextPacks do not match authoritative context packs");
    }
    const persistedRecord = jsonRecord(persistedPack);
    if (persistedRecord === undefined || persistedRecord.ref === undefined || persistedRecord.payload === undefined) {
      throw new Error("Persisted resolvedContextPacks must contain ref and payload");
    }

    const persistedRef = contextPackRefSchema.parse(persistedRecord.ref);
    if (!sameContextPackBytes(persistedRef, verifiedPack.ref) || !sameContextPackBytes(persistedRecord.payload, verifiedPack.payload)) {
      throw new Error("Persisted resolvedContextPacks do not match authoritative context packs");
    }
  }

  return authoritative;
}

function persistedResolvedContextPacks(input: unknown): readonly AgentContextPackJsonValue[] {
  if (typeof input !== "object" || input === null) {
    throw new Error("Persisted production prompt artifact requires resolvedContextPacks");
  }
  const descriptor = Object.getOwnPropertyDescriptor(input, "resolvedContextPacks");
  if (descriptor === undefined) {
    throw new Error("Persisted production prompt artifact requires resolvedContextPacks");
  }
  if (!descriptor.enumerable || !("value" in descriptor)) {
    throw new Error("resolvedContextPacks must be JSON DTO-safe");
  }
  const normalized = normalizeJsonDtoValue(descriptor.value, "$.resolvedContextPacks");
  if (!Array.isArray(normalized)) {
    throw new Error("resolvedContextPacks must be JSON DTO-safe");
  }
  return normalized;
}

function jsonRecord(value: AgentContextPackJsonValue): Readonly<Record<string, AgentContextPackJsonValue>> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Readonly<Record<string, AgentContextPackJsonValue>>
    : undefined;
}

function sameContextPackBytes(left: unknown, right: unknown): boolean {
  return Buffer.from(serializeContextPackPayload(left)).equals(Buffer.from(serializeContextPackPayload(right)));
}

function addSecretSafeIssue(value: string, label: string, ctx: z.RefinementCtx): void {
  try {
    assertAgentSecretSafeText(value, label);
  } catch (error) {
    ctx.addIssue({
      code: "custom",
      message: error instanceof Error ? error.message : `${label} must be secret-safe`
    });
  }
}

function parseNormalizedDtoOrThrow<T>(value: unknown, schema: z.ZodType<T>, path: string): T {
  return schema.parse(normalizeJsonDtoValue(value, path));
}

function normalizeJsonDtoValue(value: unknown, path: string): AgentContextPackJsonValue {
  if (value === null) {
    return null;
  }

  if (typeof value === "string") {
    assertAgentSecretSafeText(value, path);
    return value;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`${path} must be JSON DTO-safe`);
    }
    return value;
  }

  if (Array.isArray(value)) {
    return normalizeJsonDtoArray(value, path);
  }

  if (typeof value === "object") {
    return normalizeJsonDtoObject(value, path);
  }

  throw new Error(`${path} must be JSON DTO-safe`);
}

function normalizeJsonDtoArray(value: readonly unknown[], path: string): AgentContextPackJsonValue {
  if (Object.getPrototypeOf(value) !== Array.prototype) {
    throw new Error(`${path} must be JSON DTO-safe`);
  }

  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new Error(`${path} must be JSON DTO-safe`);
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  const indexedDescriptors: Array<{
    readonly index: number;
    readonly descriptor: PropertyDescriptor;
  }> = [];

  for (const key of Object.keys(descriptors)) {
    if (key === "length") {
      continue;
    }

    if (!isCanonicalArrayIndexKey(key)) {
      throw new Error(`${path} must be JSON DTO-safe`);
    }

    const descriptor = descriptors[key];
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      throw new Error(`${path} must be JSON DTO-safe`);
    }

    indexedDescriptors.push({
      index: Number(key),
      descriptor
    });
  }

  indexedDescriptors.sort((left, right) => left.index - right.index);
  if (indexedDescriptors.length !== value.length) {
    throw new Error(`${path} must be JSON DTO-safe`);
  }

  return indexedDescriptors.map(({ index, descriptor }) => {
    if (index >= value.length) {
      throw new Error(`${path} must be JSON DTO-safe`);
    }
    return normalizeJsonDtoValue(descriptor.value, `${path}[${index}]`);
  });
}

function normalizeJsonDtoObject(value: object, path: string): AgentContextPackJsonValue {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${path} must be JSON DTO-safe`);
  }

  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new Error(`${path} must be JSON DTO-safe`);
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  const normalized = Object.create(null) as Record<string, AgentContextPackJsonValue>;

  for (const key of Object.keys(descriptors).sort()) {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      throw new Error(`${path} must be JSON DTO-safe`);
    }

    assertAgentSecretSafeText(key, `${path} key`);
    normalized[key] = normalizeJsonDtoValue(descriptor.value, `${path}.${key}`);
  }

  return normalized;
}

function stableJsonForPromptArtifact(value: unknown): string {
  const json = JSON.stringify(normalizeJsonDtoValue(value, "$"));
  if (json === undefined) {
    throw new Error("$ must be JSON DTO-safe");
  }

  return json;
}

function isCanonicalArrayIndexKey(key: string): boolean {
  if (!/^(0|[1-9][0-9]*)$/.test(key)) {
    return false;
  }

  const index = Number(key);
  return Number.isInteger(index) && index >= 0 && index < 2 ** 32 - 1;
}

function assertSafeContentHash(value: string, label: string): void {
  assertAgentSecretSafeText(value, label);
  if (!contentHashPattern.test(value)) {
    throw new Error(`${label} must be a sha256 content hash`);
  }
}

function freezePromptArtifactEnvelope(envelope: {
  readonly manifest: PromptArtifactManifest;
  readonly text: string;
  readonly resolvedContextPacks?: readonly VerifiedResolvedContextPack[];
}): PromptArtifactEnvelope {
  return Object.freeze({
    manifest: freezePromptArtifactManifest(envelope.manifest),
    text: envelope.text,
    ...(envelope.resolvedContextPacks === undefined
      ? {}
      : { resolvedContextPacks: Object.freeze([...envelope.resolvedContextPacks]) })
  });
}

function freezePromptArtifactManifest(manifest: PromptArtifactManifest): PromptArtifactManifest {
  return Object.freeze({
    inputArtifactHash: manifest.inputArtifactHash,
    promptTemplateId: manifest.promptTemplateId,
    promptTemplateVersion: manifest.promptTemplateVersion,
    runType: manifest.runType,
    generatedAt: manifest.generatedAt,
    safetyClass: manifest.safetyClass,
    transferApprovalClass: manifest.transferApprovalClass,
    contextPackRefs: Object.freeze([...manifest.contextPackRefs]),
    omissions: Object.freeze(manifest.omissions.map(freezePromptArtifactOmission)),
    safeSummary: manifest.safeSummary,
    ...(manifest.production === undefined ? {} : { production: freezePromptArtifactProductionBinding(manifest.production) })
  });
}

function freezePromptArtifactOmission(omission: z.infer<typeof promptArtifactOmissionObjectSchema>): PromptArtifactOmission {
  return Object.freeze({
    reason: omission.reason,
    sourceRef: omission.sourceRef,
    safeSummary: omission.safeSummary
  });
}

function freezePromptArtifactProductionBinding(
  production: PromptArtifactProductionBinding
): PromptArtifactProductionBinding {
  const common = {
    rendererId: production.rendererId,
    rendererVersion: production.rendererVersion,
    rendererHash: production.rendererHash,
    renderedPromptHash: production.renderedPromptHash,
    providerOutputSchemaId: production.providerOutputSchemaId,
    providerOutputSchemaVersion: production.providerOutputSchemaVersion,
    handoffSchemaId: production.handoffSchemaId,
    handoffSchemaVersion: production.handoffSchemaVersion,
    scopeApplicabilityHash: production.scopeApplicabilityHash,
    evaluatedContextRequirements: Object.freeze(production.evaluatedContextRequirements.map((requirement) => Object.freeze({
      contextPackId: requirement.contextPackId,
      requirementMode: requirement.requirementMode,
      status: requirement.status,
      ...(requirement.contentHash === undefined ? {} : { contentHash: requirement.contentHash }),
      ...(requirement.omissionReason === undefined ? {} : { omissionReason: requirement.omissionReason })
    }))),
    resolvedPayloadAudits: Object.freeze(production.resolvedPayloadAudits.map((audit) => Object.freeze({
      contextPackId: audit.contextPackId,
      contentHash: audit.contentHash,
      sizeBytes: audit.sizeBytes,
      schemaId: audit.schemaId
    })))
  };
  if (production.schemaVersion === "agent-production-prompt-binding.v2") {
    return Object.freeze({
      schemaVersion: production.schemaVersion,
      ...common,
      sourceApprovedPromptArtifactHash: production.sourceApprovedPromptArtifactHash,
      exactRunBinding: freezePromptArtifactExactRunBindingV2(production.exactRunBinding),
      providerPostureHash: production.providerPostureHash,
      exactRunBindingHash: production.exactRunBindingHash
    });
  }
  return Object.freeze({
    schemaVersion: production.schemaVersion,
    ...common
  });
}

function normalizePersistedPromptArtifactExactRunBindingV2(
  binding: PromptArtifactExactRunBindingV2 | z.infer<typeof promptArtifactExactRunBindingV2ObjectSchema>
): PromptArtifactExactRunBindingV2 {
  const parsed = parseNormalizedDtoOrThrow(binding, promptArtifactExactRunBindingV2ObjectSchema, "$");
  const canonicalDescriptor = specialistWorkflowDescriptorFor(parsed.runType);
  if (parsed.workflowDescriptorHash !== hashAgentContextPack(canonicalDescriptor)) {
    throw new Error("Production v2 workflow descriptor hash mismatch");
  }
  return freezePromptArtifactExactRunBindingV2({
    taskId: parsed.taskId,
    attemptId: parsed.attemptId,
    approvedRunId: parsed.approvedRunId,
    runId: parsed.runId,
    runType: parsed.runType as Exclude<AgentSpecialistRunType, "ontology-bootstrap">,
    residentAgentId: parsed.residentAgentId,
    workspaceId: parsed.workspaceId,
    mountInstanceId: parsed.mountInstanceId,
    workflowDescriptorHash: parsed.workflowDescriptorHash as `sha256:${string}`,
    policyVersion: parsed.policyVersion,
    providerPosture: freezePromptArtifactProviderPostureV2(parsed.providerPosture)
  });
}

function freezePromptArtifactExactRunBindingV2(
  binding: PromptArtifactExactRunBindingV2
): PromptArtifactExactRunBindingV2 {
  return Object.freeze({
    taskId: binding.taskId,
    attemptId: binding.attemptId,
    approvedRunId: binding.approvedRunId,
    runId: binding.runId,
    runType: binding.runType,
    residentAgentId: binding.residentAgentId,
    workspaceId: binding.workspaceId,
    mountInstanceId: binding.mountInstanceId,
    workflowDescriptorHash: binding.workflowDescriptorHash,
    policyVersion: binding.policyVersion,
    providerPosture: freezePromptArtifactProviderPostureV2(binding.providerPosture)
  });
}

function freezePromptArtifactProviderPostureV2(
  posture: PromptArtifactProviderPostureV2
): PromptArtifactProviderPostureV2 {
  const capabilityIds = [...posture.capabilityIds];
  if (
    capabilityIds.some((capabilityId, index) => index > 0 && capabilityIds[index - 1]! >= capabilityId) ||
    new Set(capabilityIds).size !== capabilityIds.length
  ) {
    throw new Error("Production v2 provider capability IDs must be unique and lexically sorted");
  }
  return Object.freeze({
    providerId: posture.providerId,
    modelId: posture.modelId,
    capabilityIds: Object.freeze(capabilityIds),
    selectionPolicyVersion: posture.selectionPolicyVersion,
    readinessState: posture.readinessState,
    approvalRequirementId: posture.approvalRequirementId
  });
}

function freezePromptArtifactTemplateRegistration(
  template: z.infer<typeof promptArtifactTemplateRegistrationObjectSchema>
): PromptArtifactTemplateRegistration {
  return Object.freeze({
    runType: template.runType,
    promptTemplateId: template.promptTemplateId,
    promptTemplateVersion: template.promptTemplateVersion,
    label: template.label
  });
}
