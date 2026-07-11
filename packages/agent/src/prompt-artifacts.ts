import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  assertResolvedContextPacksForExecution,
  contextPackRefSchema,
  hashAgentContextPack,
  type AgentContextPackJsonValue,
  type ContextPackRef,
  type ContextPackStalenessInput,
  type VerifiedResolvedContextPack
} from "./context-packs.js";
import {
  productionSpecialistPromptRegistrationFor,
  productionSpecialistPromptRegistrations
} from "./production-specialist-prompts.js";
import { assertAgentSecretSafeText } from "./secret-safety.js";
import { approvedAgentSpecialistRunTypes, type AgentSpecialistRunType } from "./specialists.js";

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

export interface PromptArtifactProductionBinding {
  readonly rendererId: string;
  readonly rendererVersion: number;
  readonly rendererHash: string;
  readonly renderedPromptHash: string;
  readonly providerOutputSchemaId: string;
  readonly providerOutputSchemaVersion: number;
  readonly handoffSchemaId: string;
  readonly handoffSchemaVersion: number;
  readonly scopeApplicabilityHash: string;
  readonly evaluatedContextRequirements: readonly PromptArtifactEvaluatedContextRequirement[];
  readonly resolvedPayloadAudits: readonly PromptArtifactResolvedPayloadAudit[];
}

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
  readonly production?: PromptArtifactProductionBinding;
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

const promptArtifactProductionBindingObjectSchema = z.object({
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
}).strict();

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
  production: promptArtifactProductionBindingObjectSchema.optional(),
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

const promptArtifactTemplateRegistrationObjectSchema = z.object({
  runType: runTypeSchema,
  promptTemplateId: agentSecretSafeTextSchema("promptTemplateId"),
  promptTemplateVersion: z.number().int().positive(),
  label: agentSecretSafeTextSchema("template.label")
}).strict();

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
  const parsed = normalizePromptArtifactEnvelope(envelope, { preserveVerifiedResolvedContextPacks: true });

  return Buffer.from(stableJsonForPromptArtifact(parsed), "utf8");
}

export function parsePromptArtifactEnvelope(bytes: string | Uint8Array): PromptArtifactEnvelope {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(typeof bytes === "string" ? bytes : Buffer.from(bytes).toString("utf8"));
  } catch {
    throw new Error("Prompt artifact envelope must be valid JSON");
  }

  return normalizePromptArtifactEnvelope(parsedJson);
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

function normalizePromptArtifactEnvelope(
  envelope: unknown,
  options: { readonly preserveVerifiedResolvedContextPacks?: boolean } = {}
): PromptArtifactEnvelope {
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

  const resolvedContextPacks = options.preserveVerifiedResolvedContextPacks
    ? resolveAuthoritativeContextPacks(envelope, parsed.manifest.contextPackRefs)
    : undefined;
  const { production: _production, ...manifestWithoutProduction } = parsed.manifest;
  return freezePromptArtifactEnvelope({
    manifest: {
      ...manifestWithoutProduction,
      ...(production === undefined ? {} : { production })
    },
    text: parsed.text,
    ...(resolvedContextPacks === undefined ? {} : { resolvedContextPacks })
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
  production: z.infer<typeof promptArtifactProductionBindingObjectSchema>,
  manifest: Pick<PromptArtifactManifest, "runType" | "promptTemplateId" | "promptTemplateVersion" | "contextPackRefs">,
  text: string,
  verifiedResolvedContextPacks?: readonly VerifiedResolvedContextPack[],
  options: { readonly deriveHashes?: boolean } = {}
): PromptArtifactProductionBinding {
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
  const expectedScopeApplicabilityHash = hashAgentContextPack({
    evaluatedContextRequirements: production.evaluatedContextRequirements
  });
  if (
    !options.deriveHashes &&
    (production.renderedPromptHash !== expectedRenderedPromptHash ||
      production.scopeApplicabilityHash !== expectedScopeApplicabilityHash)
  ) {
    throw new Error("Production prompt binding hash mismatch");
  }

  return freezePromptArtifactProductionBinding({
    ...production,
    renderedPromptHash: expectedRenderedPromptHash,
    scopeApplicabilityHash: expectedScopeApplicabilityHash,
    resolvedPayloadAudits: expectedAudits
  });
}

function assertEvaluatedContextRequirements(
  evaluated: readonly PromptArtifactEvaluatedContextRequirement[],
  registered: readonly { readonly contextPackId: string; readonly requirementMode: "always" | "when-scope-associated-prr" }[],
  refs: readonly ContextPackRef[]
): void {
  const refsById = new Map(refs.map((ref) => [ref.contextPackId, ref]));
  const registeredById = new Map(registered.map((requirement) => [requirement.contextPackId, requirement]));
  const evaluatedIds = new Set<string>();
  for (const requirement of evaluated) {
    if (evaluatedIds.has(requirement.contextPackId)) {
      throw new Error("Production context requirements must not duplicate a context pack ID");
    }
    evaluatedIds.add(requirement.contextPackId);
    const registeredRequirement = registeredById.get(requirement.contextPackId);
    if (registeredRequirement === undefined || registeredRequirement.requirementMode !== requirement.requirementMode) {
      throw new Error("Production context requirement does not match the registered specialist renderer");
    }
    const ref = refsById.get(requirement.contextPackId);
    if (requirement.status === "applicable") {
      if (ref === undefined || requirement.contentHash !== ref.contentHash) {
        throw new Error("Applicable production context requirement does not match a context pack ref");
      }
    } else if (requirement.requirementMode !== "when-scope-associated-prr" || ref !== undefined) {
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

function hashPromptText(text: string): string {
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
  return assertResolvedContextPacksForExecution(refs, descriptor.value as readonly VerifiedResolvedContextPack[]);
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
  return Object.freeze({
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
