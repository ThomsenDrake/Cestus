import { Buffer } from "node:buffer";
import { z } from "zod";
import {
  contextPackRefSchema,
  hashAgentContextPack,
  type AgentContextPackJsonValue,
  type ContextPackRef,
  type ContextPackStalenessInput
} from "./context-packs.js";
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
}

export interface PromptArtifactEnvelope {
  readonly manifest: PromptArtifactManifest;
  readonly text: string;
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
  omissions: z.array(promptArtifactOmissionObjectSchema).optional()
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
  safeSummary: agentSecretSafeTextSchema("safeSummary")
}).strict();

const promptArtifactEnvelopeObjectSchema = z.object({
  manifest: promptArtifactManifestObjectSchema,
  text: agentSecretSafeTextSchema("promptArtifact.text")
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
  const manifestWithoutHash = {
    promptTemplateId: parsed.promptTemplateId,
    promptTemplateVersion: parsed.promptTemplateVersion,
    runType: parsed.runType,
    generatedAt: parsed.generatedAt,
    safetyClass: parsed.safetyClass,
    transferApprovalClass: parsed.transferApprovalClass,
    contextPackRefs: parsed.contextPackRefs,
    omissions,
    safeSummary: parsed.safeSummary
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
    text: parsed.text
  });
}

export function serializePromptArtifactEnvelope(envelope: PromptArtifactEnvelope): Uint8Array {
  const parsed = normalizePromptArtifactEnvelope(envelope);

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
    safeSummary: parsed.manifest.safeSummary
  });
}

function normalizePromptArtifactEnvelope(envelope: unknown): PromptArtifactEnvelope {
  const parsed = parseNormalizedDtoOrThrow(envelope, promptArtifactEnvelopeObjectSchema, "$");
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
      safeSummary: parsed.manifest.safeSummary
    },
    text: parsed.text
  });
  if (expectedHash !== parsed.manifest.inputArtifactHash) {
    throw new Error("Prompt artifact hash mismatch");
  }

  return freezePromptArtifactEnvelope(parsed);
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

function freezePromptArtifactEnvelope(envelope: z.infer<typeof promptArtifactEnvelopeObjectSchema>): PromptArtifactEnvelope {
  return Object.freeze({
    manifest: freezePromptArtifactManifest(envelope.manifest),
    text: envelope.text
  });
}

function freezePromptArtifactManifest(manifest: z.infer<typeof promptArtifactManifestObjectSchema>): PromptArtifactManifest {
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
    safeSummary: manifest.safeSummary
  });
}

function freezePromptArtifactOmission(omission: z.infer<typeof promptArtifactOmissionObjectSchema>): PromptArtifactOmission {
  return Object.freeze({
    reason: omission.reason,
    sourceRef: omission.sourceRef,
    safeSummary: omission.safeSummary
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
