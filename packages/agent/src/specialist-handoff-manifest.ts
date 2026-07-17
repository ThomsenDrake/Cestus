import { createHash } from "node:crypto";
import { z } from "zod";
import type { AgentContextPackJsonValue, ContextPackRef } from "./context-packs.js";
import {
  parseSpecialistWorkflowHandoff,
  specialistApprovalRequirementSchema,
  specialistFailureDtoSchema,
  specialistNextActionSchema,
  specialistOutputArtifactRefSchema,
  specialistWorkflowHandoffSchema,
  type SpecialistWorkflowApprovalRequirementDto,
  type SpecialistWorkflowFailureDto,
  type SpecialistWorkflowHandoffDto,
  type SpecialistWorkflowNextSafeActionDto,
  type SpecialistWorkflowOutputArtifactDto
} from "./specialist-handoffs.js";
import { hashSpecialistWorkflowHandoff } from "./specialist-handoff-hash.js";
import { assertAgentSecretSafeText } from "./secret-safety.js";
import type { HandoffAuthorityBinding } from "./specialist-handoff-authority.js";

export const specialistHandoffManifestSchemaVersion = "agent-specialist-handoff-manifest.v1" as const;
export const specialistHandoffManifestV2SchemaVersion = "agent-specialist-handoff-manifest.v2" as const;
export const specialistHandoffMaterialSchemaVersion = "agent-specialist-handoff-material.v1" as const;

type SpecialistHandoffStatus = "ready-for-review" | "waiting-for-approval" | "blocked" | "failed";

export interface SpecialistHandoffIdentitySeed {
  readonly runId: string;
  readonly taskId?: string;
  readonly runType: string;
  readonly status: SpecialistHandoffStatus;
  readonly finalOutputEventId: string;
  readonly outputArtifactHashes: readonly `sha256:${string}`[];
  readonly handoffRevision: number;
  readonly supersedesHandoffId?: string;
}

export interface BuildSpecialistHandoffManifestInput {
  readonly handoffId: string;
  readonly handoffRevision: number;
  readonly runId: string;
  readonly taskId?: string;
  readonly runType: string;
  readonly residentAgentId: "agent_default";
  readonly generatedAt: string;
  readonly status: SpecialistHandoffStatus;
  readonly safeSummary: string;
  readonly stateKind: "completed" | "failed" | "resumable";
  readonly finalOutputStepId: string;
  readonly finalOutputEventId: string;
  readonly handoffMaterialArtifactHash: `sha256:${string}`;
  readonly contextPackRefs: readonly ContextPackRef[];
  readonly promptArtifactHash?: `sha256:${string}`;
  readonly outputArtifacts: readonly SpecialistWorkflowOutputArtifactDto[];
  readonly toolRequestIds: readonly string[];
  readonly approvalRequirements: readonly SpecialistWorkflowApprovalRequirementDto[];
  readonly nextSafeActions: readonly SpecialistWorkflowNextSafeActionDto[];
  readonly failure?: SpecialistWorkflowFailureDto;
  readonly sourceEventIds: readonly string[];
  readonly relatedEventIds: readonly string[];
  readonly supersedesHandoffId?: string;
  readonly supersedesEventId?: string;
}

export interface VerifySpecialistHandoffManifestInput {
  readonly manifest: unknown;
  readonly handoffManifestHash: `sha256:${string}`;
  readonly verifiedAt?: string;
}

export interface SpecialistHandoffManifest {
  readonly schemaVersion: typeof specialistHandoffManifestSchemaVersion;
  readonly handoffId: string;
  readonly handoffRevision: number;
  readonly handoffDtoHash: `sha256:${string}`;
  readonly runId: string;
  readonly taskId?: string;
  readonly runType: string;
  readonly residentAgentId: "agent_default";
  readonly status: SpecialistHandoffStatus;
  readonly safeSummary: string;
  readonly stateKind: "completed" | "failed" | "resumable";
  readonly finalOutputStepId: string;
  readonly finalOutputEventId: string;
  readonly handoffMaterialArtifactHash: `sha256:${string}`;
  readonly contextPackRefs: readonly ContextPackRef[];
  readonly promptArtifactHash?: `sha256:${string}`;
  readonly outputArtifacts: readonly SpecialistWorkflowOutputArtifactDto[];
  readonly toolRequestIds: readonly string[];
  readonly approvalRequirements: readonly SpecialistWorkflowApprovalRequirementDto[];
  readonly nextSafeActions: readonly SpecialistWorkflowNextSafeActionDto[];
  readonly failure?: SpecialistWorkflowFailureDto;
  readonly sourceEventIds: readonly string[];
  readonly relatedEventIds: readonly string[];
  readonly supersedesHandoffId?: string;
  readonly supersedesEventId?: string;
  readonly handoff: SpecialistWorkflowHandoffDto;
}

export interface AuthorityBoundSpecialistHandoffManifest extends Omit<SpecialistHandoffManifest, "schemaVersion"> {
  readonly schemaVersion: typeof specialistHandoffManifestV2SchemaVersion;
  readonly authorityBinding: HandoffAuthorityBinding;
}

export interface BuildSpecialistHandoffMaterialInput {
  readonly status: SpecialistHandoffStatus;
  readonly safeSummary: string;
  readonly contextPackRefs: readonly ContextPackRef[];
  readonly promptArtifactHash?: `sha256:${string}`;
  readonly outputArtifacts: readonly SpecialistWorkflowOutputArtifactDto[];
  readonly toolRequestIds: readonly string[];
  readonly approvalRequirements: readonly SpecialistWorkflowApprovalRequirementDto[];
  readonly nextSafeActions: readonly SpecialistWorkflowNextSafeActionDto[];
  readonly failure?: SpecialistWorkflowFailureDto;
  readonly sourceEventIds: readonly string[];
  readonly relatedEventIds: readonly string[];
  readonly supersedesHandoffId?: string;
  readonly supersedesEventId?: string;
}

export interface SpecialistHandoffMaterial extends BuildSpecialistHandoffMaterialInput {
  readonly schemaVersion: typeof specialistHandoffMaterialSchemaVersion;
}

const contentHashPattern = /^sha256:[a-f0-9]{64}$/;
const handoffIdPattern = /^handoff_[a-zA-Z0-9_-]+_[a-f0-9]{16}$/;
const eventIdPattern = /^evt_[a-zA-Z0-9_-]+$/;
const stateKindSchema = z.enum(["completed", "failed", "resumable"]);
const statusSchema = z.enum(["ready-for-review", "waiting-for-approval", "blocked", "failed"]);
const contentHashSchema = z.string().regex(contentHashPattern).transform((value) => value as `sha256:${string}`);
const handoffIdSchema = z.string().regex(handoffIdPattern);
const safeStringSchema = z.string().min(1);
const eventIdSchema = z.string().regex(eventIdPattern);

const buildInputSchema = z.object({
  handoffId: handoffIdSchema,
  handoffRevision: z.number().int().positive(),
  runId: safeStringSchema,
  taskId: safeStringSchema.optional(),
  runType: safeStringSchema,
  residentAgentId: z.literal("agent_default"),
  generatedAt: z.string().datetime(),
  status: statusSchema,
  safeSummary: safeStringSchema,
  stateKind: stateKindSchema,
  finalOutputStepId: safeStringSchema,
  finalOutputEventId: eventIdSchema,
  handoffMaterialArtifactHash: contentHashSchema,
  contextPackRefs: z.array(z.unknown()),
  promptArtifactHash: contentHashSchema.optional(),
  outputArtifacts: z.array(specialistOutputArtifactRefSchema),
  toolRequestIds: z.array(safeStringSchema),
  approvalRequirements: z.array(specialistApprovalRequirementSchema),
  nextSafeActions: z.array(specialistNextActionSchema),
  failure: specialistFailureDtoSchema.optional(),
  sourceEventIds: z.array(eventIdSchema),
  relatedEventIds: z.array(eventIdSchema),
  supersedesHandoffId: handoffIdSchema.optional(),
  supersedesEventId: eventIdSchema.optional()
}).strict().superRefine((value, ctx) => addStateKindIssue(value, ctx));

const manifestSchema = z.object({
  schemaVersion: z.literal(specialistHandoffManifestSchemaVersion),
  handoffId: handoffIdSchema,
  handoffRevision: z.number().int().positive(),
  handoffDtoHash: contentHashSchema,
  runId: safeStringSchema,
  taskId: safeStringSchema.optional(),
  runType: safeStringSchema,
  residentAgentId: z.literal("agent_default"),
  status: statusSchema,
  safeSummary: safeStringSchema,
  stateKind: stateKindSchema,
  finalOutputStepId: safeStringSchema,
  finalOutputEventId: eventIdSchema,
  handoffMaterialArtifactHash: contentHashSchema,
  contextPackRefs: z.array(z.unknown()),
  promptArtifactHash: contentHashSchema.optional(),
  outputArtifacts: z.array(specialistOutputArtifactRefSchema),
  toolRequestIds: z.array(safeStringSchema),
  approvalRequirements: z.array(specialistApprovalRequirementSchema),
  nextSafeActions: z.array(specialistNextActionSchema),
  failure: specialistFailureDtoSchema.optional(),
  sourceEventIds: z.array(eventIdSchema),
  relatedEventIds: z.array(eventIdSchema),
  supersedesHandoffId: handoffIdSchema.optional(),
  supersedesEventId: eventIdSchema.optional(),
  handoff: specialistWorkflowHandoffSchema
}).strict().superRefine((value, ctx) => addStateKindIssue(value, ctx));

const authorityBindingSchema = z.object({
  workspaceIdentityHash: contentHashSchema,
  mountGeneration: safeStringSchema,
  ledgerStoreIdentity: safeStringSchema,
  artifactStoreIdentity: safeStringSchema,
  ledgerHighWaterEventId: eventIdSchema,
  policyHash: contentHashSchema,
  activeLocksHash: contentHashSchema
}).strict();

const authorityBoundManifestSchema = z.object({
  schemaVersion: z.literal(specialistHandoffManifestV2SchemaVersion),
  handoffId: handoffIdSchema,
  handoffRevision: z.number().int().positive(),
  handoffDtoHash: contentHashSchema,
  runId: safeStringSchema,
  taskId: safeStringSchema.optional(),
  runType: safeStringSchema,
  residentAgentId: z.literal("agent_default"),
  status: statusSchema,
  safeSummary: safeStringSchema,
  stateKind: stateKindSchema,
  finalOutputStepId: safeStringSchema,
  finalOutputEventId: eventIdSchema,
  handoffMaterialArtifactHash: contentHashSchema,
  contextPackRefs: z.array(z.unknown()),
  promptArtifactHash: contentHashSchema.optional(),
  outputArtifacts: z.array(specialistOutputArtifactRefSchema),
  toolRequestIds: z.array(safeStringSchema),
  approvalRequirements: z.array(specialistApprovalRequirementSchema),
  nextSafeActions: z.array(specialistNextActionSchema),
  failure: specialistFailureDtoSchema.optional(),
  sourceEventIds: z.array(eventIdSchema),
  relatedEventIds: z.array(eventIdSchema),
  supersedesHandoffId: handoffIdSchema.optional(),
  supersedesEventId: eventIdSchema.optional(),
  handoff: specialistWorkflowHandoffSchema,
  authorityBinding: authorityBindingSchema
}).strict().superRefine((value, ctx) => addStateKindIssue(value, ctx));

const handoffMaterialInputSchema = z.object({
  status: statusSchema,
  safeSummary: safeStringSchema,
  contextPackRefs: z.array(z.unknown()),
  promptArtifactHash: contentHashSchema.optional(),
  outputArtifacts: z.array(specialistOutputArtifactRefSchema),
  toolRequestIds: z.array(safeStringSchema),
  approvalRequirements: z.array(specialistApprovalRequirementSchema),
  nextSafeActions: z.array(specialistNextActionSchema),
  failure: specialistFailureDtoSchema.optional(),
  sourceEventIds: z.array(eventIdSchema),
  relatedEventIds: z.array(eventIdSchema),
  supersedesHandoffId: handoffIdSchema.optional(),
  supersedesEventId: eventIdSchema.optional()
}).strict().superRefine((value, ctx) => {
  if ((value.status === "failed") !== (value.failure !== undefined)) {
    ctx.addIssue({ code: "custom", path: ["failure"], message: "failure must match failed status" });
  }
  if ((value.supersedesHandoffId === undefined) !== (value.supersedesEventId === undefined)) {
    ctx.addIssue({ code: "custom", path: ["supersedesHandoffId"], message: "supersession anchors must appear together" });
  }
});

const handoffMaterialSchema = handoffMaterialInputSchema.extend({
  schemaVersion: z.literal(specialistHandoffMaterialSchemaVersion)
}).strict();

export function computeSpecialistHandoffId(seed: SpecialistHandoffIdentitySeed): string {
  const normalized = normalizeJsonValue(seed, "$") as Record<string, AgentContextPackJsonValue>;
  const canonicalSeed = {
    runId: normalized.runId,
    taskIdOrNone: normalized.taskId ?? null,
    runType: normalized.runType,
    status: normalized.status,
    finalOutputEventId: normalized.finalOutputEventId,
    outputArtifactHashes: sortedUniqueHashes(normalized.outputArtifactHashes),
    handoffRevision: normalized.handoffRevision,
    supersedesHandoffIdOrNone: normalized.supersedesHandoffId ?? null
  };
  const digest = hashCanonicalSpecialistHandoffJson(canonicalSeed).slice("sha256:".length, "sha256:".length + 16);
  return `handoff_${seed.runId}_${digest}`;
}

export function canonicalSpecialistHandoffJson(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(normalizeJsonValue(value, "$")), "utf8");
}

export function hashCanonicalSpecialistHandoffJson(value: unknown): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(canonicalSpecialistHandoffJson(value)).digest("hex")}`;
}

export function hashSpecialistHandoffManifest(manifest: unknown): `sha256:${string}` {
  return hashCanonicalSpecialistHandoffJson(manifest);
}

export function buildSpecialistHandoffMaterial(input: BuildSpecialistHandoffMaterialInput): SpecialistHandoffMaterial {
  const parsed = handoffMaterialInputSchema.parse(normalizeJsonValue(input, "$"));
  assertHandoffMaterialSemanticSafety(parsed);
  return freezeHandoffMaterial({
    schemaVersion: specialistHandoffMaterialSchemaVersion,
    status: parsed.status,
    safeSummary: parsed.safeSummary,
    contextPackRefs: parsed.contextPackRefs.map((ref) => parseContextPackRef(ref)),
    ...(parsed.promptArtifactHash === undefined ? {} : { promptArtifactHash: parsed.promptArtifactHash }),
    outputArtifacts: parsed.outputArtifacts,
    toolRequestIds: parsed.toolRequestIds,
    approvalRequirements: parsed.approvalRequirements,
    nextSafeActions: parsed.nextSafeActions,
    ...(parsed.failure === undefined ? {} : { failure: parsed.failure }),
    sourceEventIds: parsed.sourceEventIds,
    relatedEventIds: parsed.relatedEventIds,
    ...(parsed.supersedesHandoffId === undefined ? {} : { supersedesHandoffId: parsed.supersedesHandoffId }),
    ...(parsed.supersedesEventId === undefined ? {} : { supersedesEventId: parsed.supersedesEventId })
  });
}

export function parseSpecialistHandoffMaterial(value: unknown): SpecialistHandoffMaterial {
  const parsed = handoffMaterialSchema.parse(normalizeJsonValue(value, "$"));
  assertHandoffMaterialSemanticSafety(parsed);
  return freezeHandoffMaterial({
    schemaVersion: parsed.schemaVersion,
    status: parsed.status,
    safeSummary: parsed.safeSummary,
    contextPackRefs: parsed.contextPackRefs.map((ref) => parseContextPackRef(ref)),
    ...(parsed.promptArtifactHash === undefined ? {} : { promptArtifactHash: parsed.promptArtifactHash }),
    outputArtifacts: parsed.outputArtifacts,
    toolRequestIds: parsed.toolRequestIds,
    approvalRequirements: parsed.approvalRequirements,
    nextSafeActions: parsed.nextSafeActions,
    ...(parsed.failure === undefined ? {} : { failure: parsed.failure }),
    sourceEventIds: parsed.sourceEventIds,
    relatedEventIds: parsed.relatedEventIds,
    ...(parsed.supersedesHandoffId === undefined ? {} : { supersedesHandoffId: parsed.supersedesHandoffId }),
    ...(parsed.supersedesEventId === undefined ? {} : { supersedesEventId: parsed.supersedesEventId })
  });
}

function assertHandoffMaterialSemanticSafety(value: unknown): void {
  const strings: string[] = [];
  collectMaterialStrings(value, strings);
  for (const item of strings) {
    assertAgentSecretSafeText(item, "specialist handoff material");
    if (
      /(?:^|[\s("'])\/(?:home|Users|var|tmp|etc)\//i.test(item) ||
      /\bfile:\/\//i.test(item) ||
      /(?:^|\s)(?:sudo\s+|rm\s+-rf\b|curl\s+[^ ]+\s*\||bash\s+-c\b|sh\s+-c\b)/i.test(item) ||
      /\b(?:assertion|relationship|entity|graph (?:fact|state))\b.{0,40}\b(?:accepted|resolved)\b/i.test(item)
    ) {
      throw new Error("Specialist handoff material must not contain paths, commands, or accepted-state claims.");
    }
  }
}

function collectMaterialStrings(value: unknown, output: string[]): void {
  if (typeof value === "string") {
    output.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectMaterialStrings(item, output);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) collectMaterialStrings(item, output);
  }
}

export function canonicalSpecialistHandoffMaterialBytes(value: unknown): Buffer {
  return canonicalSpecialistHandoffJson(parseSpecialistHandoffMaterial(value));
}

export function hashSpecialistHandoffMaterial(value: unknown): `sha256:${string}` {
  return hashCanonicalSpecialistHandoffJson(parseSpecialistHandoffMaterial(value));
}

export function buildSpecialistHandoffManifest(input: BuildSpecialistHandoffManifestInput): SpecialistHandoffManifest {
  const parsed = buildInputSchema.parse(normalizeJsonValue(input, "$"));
  const contextPackRefs = parsed.contextPackRefs.map((ref) => parseContextPackRef(ref));
  const expectedHandoffId = computeSpecialistHandoffId({
    runId: parsed.runId,
    ...(parsed.taskId === undefined ? {} : { taskId: parsed.taskId }),
    runType: parsed.runType,
    status: parsed.status,
    finalOutputEventId: parsed.finalOutputEventId,
    outputArtifactHashes: parsed.outputArtifacts.map((artifact) => artifact.artifactHash),
    handoffRevision: parsed.handoffRevision,
    ...(parsed.supersedesHandoffId === undefined ? {} : { supersedesHandoffId: parsed.supersedesHandoffId })
  });
  if (parsed.handoffId !== expectedHandoffId) {
    throw new Error("handoffId does not match the pre-manifest identity seed");
  }

  const handoff = parseSpecialistWorkflowHandoff({
    schemaVersion: "agent-specialist-handoff.v1",
    handoffId: parsed.handoffId,
    handoffRevision: parsed.handoffRevision,
    runType: parsed.runType,
    runId: parsed.runId,
    ...(parsed.taskId === undefined ? {} : { taskId: parsed.taskId }),
    residentAgentId: parsed.residentAgentId,
    generatedAt: parsed.generatedAt,
    status: parsed.status,
    safeSummary: parsed.safeSummary,
    contextPackRefs,
    ...(parsed.promptArtifactHash === undefined ? {} : { promptArtifactHash: parsed.promptArtifactHash }),
    outputArtifacts: parsed.outputArtifacts,
    toolRequestIds: parsed.toolRequestIds,
    approvalRequirements: parsed.approvalRequirements,
    nextSafeActions: parsed.nextSafeActions,
    ...(parsed.failure === undefined ? {} : { failure: parsed.failure })
  });
  const manifest: SpecialistHandoffManifest = {
    schemaVersion: specialistHandoffManifestSchemaVersion,
    handoffId: handoff.handoffId,
    handoffRevision: handoff.handoffRevision,
    handoffDtoHash: hashSpecialistWorkflowHandoff(handoff),
    runId: handoff.runId,
    ...(handoff.taskId === undefined ? {} : { taskId: handoff.taskId }),
    runType: handoff.runType,
    residentAgentId: handoff.residentAgentId,
    status: handoff.status,
    safeSummary: handoff.safeSummary,
    stateKind: parsed.stateKind,
    finalOutputStepId: parsed.finalOutputStepId,
    finalOutputEventId: parsed.finalOutputEventId,
    handoffMaterialArtifactHash: parsed.handoffMaterialArtifactHash,
    contextPackRefs: handoff.contextPackRefs,
    ...(handoff.promptArtifactHash === undefined ? {} : { promptArtifactHash: handoff.promptArtifactHash }),
    outputArtifacts: handoff.outputArtifacts,
    toolRequestIds: handoff.toolRequestIds,
    approvalRequirements: handoff.approvalRequirements,
    nextSafeActions: handoff.nextSafeActions,
    ...(handoff.failure === undefined ? {} : { failure: handoff.failure }),
    sourceEventIds: Object.freeze([...parsed.sourceEventIds]),
    relatedEventIds: Object.freeze([...parsed.relatedEventIds]),
    ...(parsed.supersedesHandoffId === undefined ? {} : { supersedesHandoffId: parsed.supersedesHandoffId }),
    ...(parsed.supersedesEventId === undefined ? {} : { supersedesEventId: parsed.supersedesEventId }),
    handoff
  };
  return Object.freeze(manifest);
}

/** Builds the additive, authority-bound V2 family without altering V1 bytes. */
export function buildAuthorityBoundSpecialistHandoffManifest(
  input: BuildSpecialistHandoffManifestInput & { readonly authorityBinding: HandoffAuthorityBinding }
): AuthorityBoundSpecialistHandoffManifest {
  const values = normalizeJsonValue(input, "$") as Record<string, AgentContextPackJsonValue>;
  const authorityBinding = authorityBindingSchema.parse(values.authorityBinding) as HandoffAuthorityBinding;
  const { authorityBinding: _authorityBinding, ...v1Input } = values;
  const v1 = buildSpecialistHandoffManifest(v1Input as BuildSpecialistHandoffManifestInput);
  return Object.freeze({
    ...v1,
    schemaVersion: specialistHandoffManifestV2SchemaVersion,
    authorityBinding: Object.freeze({ ...authorityBinding })
  });
}

export function verifySpecialistHandoffManifest(input: VerifySpecialistHandoffManifestInput): SpecialistWorkflowHandoffDto {
  const parsedInput = z.object({
    manifest: z.unknown(),
    handoffManifestHash: contentHashSchema,
    verifiedAt: z.string().datetime().optional()
  }).strict().parse(normalizeJsonValue(input, "$"));
  const manifest = manifestSchema.parse(normalizeJsonValue(parsedInput.manifest, "$.manifest"));
  const handoff = parseSpecialistWorkflowHandoff(manifest.handoff);
  const expectedManifestHash = hashSpecialistHandoffManifest(manifest);
  if (expectedManifestHash !== parsedInput.handoffManifestHash) {
    throw new Error("handoff manifest hash does not match canonical manifest bytes");
  }
  if (hashSpecialistWorkflowHandoff(handoff) !== manifest.handoffDtoHash) {
    throw new Error("handoff DTO hash does not match canonical handoff bytes");
  }
  const expectedHandoffId = computeSpecialistHandoffId({
    runId: manifest.runId,
    ...(manifest.taskId === undefined ? {} : { taskId: manifest.taskId }),
    runType: manifest.runType,
    status: manifest.status,
    finalOutputEventId: manifest.finalOutputEventId,
    outputArtifactHashes: manifest.outputArtifacts.map((artifact) => artifact.artifactHash),
    handoffRevision: manifest.handoffRevision,
    ...(manifest.supersedesHandoffId === undefined ? {} : { supersedesHandoffId: manifest.supersedesHandoffId })
  });
  if (manifest.handoffId !== expectedHandoffId) {
    throw new Error("handoffId does not match the pre-manifest identity seed");
  }
  assertManifestHandoffAgreement(manifest, handoff);
  return handoff;
}

/** Strict V2 parser: V1 is intentionally not accepted as a compatibility path. */
export function parseAuthorityBoundSpecialistHandoffManifest(value: unknown): AuthorityBoundSpecialistHandoffManifest {
  const manifest = authorityBoundManifestSchema.parse(normalizeJsonValue(value, "$.manifest"));
  const handoff = parseSpecialistWorkflowHandoff(manifest.handoff);
  const result: AuthorityBoundSpecialistHandoffManifest = Object.freeze({
    schemaVersion: specialistHandoffManifestV2SchemaVersion,
    handoffId: manifest.handoffId,
    handoffRevision: manifest.handoffRevision,
    handoffDtoHash: manifest.handoffDtoHash,
    runId: manifest.runId,
    ...(manifest.taskId === undefined ? {} : { taskId: manifest.taskId }),
    runType: manifest.runType,
    residentAgentId: manifest.residentAgentId,
    status: manifest.status,
    safeSummary: manifest.safeSummary,
    stateKind: manifest.stateKind,
    finalOutputStepId: manifest.finalOutputStepId,
    finalOutputEventId: manifest.finalOutputEventId,
    handoffMaterialArtifactHash: manifest.handoffMaterialArtifactHash,
    contextPackRefs: Object.freeze(manifest.contextPackRefs.map((ref) => parseContextPackRef(ref))),
    ...(manifest.promptArtifactHash === undefined ? {} : { promptArtifactHash: manifest.promptArtifactHash }),
    outputArtifacts: Object.freeze(manifest.outputArtifacts.map((item) => Object.freeze({ ...item }))),
    toolRequestIds: Object.freeze([...manifest.toolRequestIds]),
    approvalRequirements: Object.freeze(manifest.approvalRequirements.map((item) => Object.freeze({ ...item }))),
    nextSafeActions: Object.freeze(manifest.nextSafeActions.map((item) => Object.freeze({ ...item }))),
    ...(manifest.failure === undefined ? {} : { failure: Object.freeze({ ...manifest.failure }) }),
    sourceEventIds: Object.freeze([...manifest.sourceEventIds]),
    relatedEventIds: Object.freeze([...manifest.relatedEventIds]),
    ...(manifest.supersedesHandoffId === undefined ? {} : { supersedesHandoffId: manifest.supersedesHandoffId }),
    ...(manifest.supersedesEventId === undefined ? {} : { supersedesEventId: manifest.supersedesEventId }),
    handoff,
    authorityBinding: Object.freeze({ ...manifest.authorityBinding })
  });
  assertVerifiedManifest(result, handoff);
  return result;
}

export function verifyAuthorityBoundSpecialistHandoffManifest(
  input: VerifySpecialistHandoffManifestInput
): SpecialistWorkflowHandoffDto {
  const parsedInput = z.object({
    manifest: z.unknown(),
    handoffManifestHash: contentHashSchema,
    verifiedAt: z.string().datetime().optional()
  }).strict().parse(normalizeJsonValue(input, "$"));
  const manifest = parseAuthorityBoundSpecialistHandoffManifest(parsedInput.manifest);
  if (hashSpecialistHandoffManifest(manifest) !== parsedInput.handoffManifestHash) {
    throw new Error("authority-bound handoff manifest hash does not match canonical manifest bytes");
  }
  return manifest.handoff;
}

function assertVerifiedManifest(
  manifest: SpecialistHandoffManifest | AuthorityBoundSpecialistHandoffManifest,
  handoff: SpecialistWorkflowHandoffDto
): void {
  if (hashSpecialistWorkflowHandoff(handoff) !== manifest.handoffDtoHash) {
    throw new Error("handoff DTO hash does not match canonical handoff bytes");
  }
  const expectedHandoffId = computeSpecialistHandoffId({
    runId: manifest.runId,
    ...(manifest.taskId === undefined ? {} : { taskId: manifest.taskId }),
    runType: manifest.runType,
    status: manifest.status,
    finalOutputEventId: manifest.finalOutputEventId,
    outputArtifactHashes: manifest.outputArtifacts.map((artifact) => artifact.artifactHash),
    handoffRevision: manifest.handoffRevision,
    ...(manifest.supersedesHandoffId === undefined ? {} : { supersedesHandoffId: manifest.supersedesHandoffId })
  });
  if (manifest.handoffId !== expectedHandoffId) {
    throw new Error("handoffId does not match the pre-manifest identity seed");
  }
  assertManifestHandoffAgreement(manifest, handoff);
}

function addStateKindIssue(
  value: { readonly status: SpecialistHandoffStatus; readonly stateKind: "completed" | "failed" | "resumable"; readonly failure?: unknown },
  ctx: z.RefinementCtx
): void {
  const expectedStateKind = value.status === "failed" ? "failed" : value.status === "ready-for-review" ? "completed" : "resumable";
  if (value.stateKind !== expectedStateKind) {
    ctx.addIssue({ code: "custom", path: ["stateKind"], message: "stateKind must match handoff status" });
  }
  if ((value.status === "failed") !== (value.failure !== undefined)) {
    ctx.addIssue({ code: "custom", path: ["failure"], message: "failure must match failed status" });
  }
}

function assertManifestHandoffAgreement(
  manifest: Pick<
    SpecialistHandoffManifest,
    | "handoffId"
    | "handoffRevision"
    | "runId"
    | "taskId"
    | "runType"
    | "residentAgentId"
    | "status"
    | "safeSummary"
    | "contextPackRefs"
    | "promptArtifactHash"
    | "outputArtifacts"
    | "toolRequestIds"
    | "approvalRequirements"
    | "nextSafeActions"
    | "failure"
  >,
  handoff: SpecialistWorkflowHandoffDto
): void {
  const comparisons: Array<readonly [string, unknown, unknown]> = [
    ["handoffId", manifest.handoffId, handoff.handoffId],
    ["handoffRevision", manifest.handoffRevision, handoff.handoffRevision],
    ["runId", manifest.runId, handoff.runId],
    ["taskId", manifest.taskId, handoff.taskId],
    ["runType", manifest.runType, handoff.runType],
    ["residentAgentId", manifest.residentAgentId, handoff.residentAgentId],
    ["status", manifest.status, handoff.status],
    ["safeSummary", manifest.safeSummary, handoff.safeSummary],
    ["contextPackRefs", manifest.contextPackRefs, handoff.contextPackRefs],
    ["promptArtifactHash", manifest.promptArtifactHash, handoff.promptArtifactHash],
    ["outputArtifacts", manifest.outputArtifacts, handoff.outputArtifacts],
    ["toolRequestIds", manifest.toolRequestIds, handoff.toolRequestIds],
    ["approvalRequirements", manifest.approvalRequirements, handoff.approvalRequirements],
    ["nextSafeActions", manifest.nextSafeActions, handoff.nextSafeActions],
    ["failure", manifest.failure, handoff.failure]
  ];
  for (const [field, left, right] of comparisons) {
    if (left === undefined && right === undefined) {
      continue;
    }
    if (left === undefined || right === undefined) {
      throw new Error(`manifest and handoff ${field} must agree exactly`);
    }
    if (!canonicalSpecialistHandoffJson(left).equals(canonicalSpecialistHandoffJson(right))) {
      throw new Error(`manifest and handoff ${field} must agree exactly`);
    }
  }
}

function parseContextPackRef(value: unknown): ContextPackRef {
  const parsed = z.object({
    contextPackId: safeStringSchema,
    version: z.number().int().positive(),
    contentHash: contentHashSchema,
    sizeBytes: z.number().int().nonnegative(),
    generatedAt: z.string().datetime(),
    safeSummary: safeStringSchema,
    provenanceRefs: z.array(safeStringSchema).min(1),
    projectionHighWaterMark: z.number().int().nonnegative().optional(),
    sourceEventIds: z.array(eventIdSchema).optional(),
    artifactHashes: z.array(contentHashSchema).optional(),
    policyVersion: safeStringSchema.optional(),
    scope: z.object({ kind: safeStringSchema, id: safeStringSchema }).strict().optional(),
    sizeBudgetBytes: z.number().int().positive().optional(),
    stalenessInputs: z.array(z.object({ kind: safeStringSchema, ref: safeStringSchema, value: safeStringSchema }).strict()).optional()
  }).strict().parse(value);
  return Object.freeze({
    contextPackId: parsed.contextPackId,
    version: parsed.version,
    contentHash: parsed.contentHash,
    sizeBytes: parsed.sizeBytes,
    generatedAt: parsed.generatedAt,
    safeSummary: parsed.safeSummary,
    provenanceRefs: Object.freeze([...parsed.provenanceRefs]),
    ...(parsed.projectionHighWaterMark === undefined ? {} : { projectionHighWaterMark: parsed.projectionHighWaterMark }),
    ...(parsed.sourceEventIds === undefined ? {} : { sourceEventIds: Object.freeze([...parsed.sourceEventIds]) }),
    ...(parsed.artifactHashes === undefined ? {} : { artifactHashes: Object.freeze([...parsed.artifactHashes]) }),
    ...(parsed.policyVersion === undefined ? {} : { policyVersion: parsed.policyVersion }),
    ...(parsed.scope === undefined ? {} : { scope: Object.freeze({ ...parsed.scope }) }),
    ...(parsed.sizeBudgetBytes === undefined ? {} : { sizeBudgetBytes: parsed.sizeBudgetBytes }),
    ...(parsed.stalenessInputs === undefined ? {} : { stalenessInputs: Object.freeze(parsed.stalenessInputs.map((item) => Object.freeze({ ...item }))) })
  });
}

function freezeHandoffMaterial(value: {
  readonly schemaVersion: typeof specialistHandoffMaterialSchemaVersion;
  readonly status: SpecialistHandoffStatus;
  readonly safeSummary: string;
  readonly contextPackRefs: readonly ContextPackRef[];
  readonly promptArtifactHash?: `sha256:${string}`;
  readonly outputArtifacts: readonly SpecialistWorkflowOutputArtifactDto[];
  readonly toolRequestIds: readonly string[];
  readonly approvalRequirements: readonly SpecialistWorkflowApprovalRequirementDto[];
  readonly nextSafeActions: readonly SpecialistWorkflowNextSafeActionDto[];
  readonly failure?: SpecialistWorkflowFailureDto;
  readonly sourceEventIds: readonly string[];
  readonly relatedEventIds: readonly string[];
  readonly supersedesHandoffId?: string;
  readonly supersedesEventId?: string;
}): SpecialistHandoffMaterial {
  return Object.freeze({
    ...value,
    contextPackRefs: Object.freeze([...value.contextPackRefs]),
    outputArtifacts: Object.freeze(value.outputArtifacts.map((item) => Object.freeze({ ...item }))),
    toolRequestIds: Object.freeze([...value.toolRequestIds]),
    approvalRequirements: Object.freeze(value.approvalRequirements.map((item) => Object.freeze({ ...item }))),
    nextSafeActions: Object.freeze(value.nextSafeActions.map((item) => Object.freeze({ ...item }))),
    sourceEventIds: Object.freeze([...value.sourceEventIds]),
    relatedEventIds: Object.freeze([...value.relatedEventIds]),
    ...(value.failure === undefined ? {} : { failure: Object.freeze({ ...value.failure }) })
  });
}

function sortedUniqueHashes(value: AgentContextPackJsonValue | undefined): readonly AgentContextPackJsonValue[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && contentHashPattern.test(item))) {
    throw new Error("outputArtifactHashes must be a SHA-256 hash array");
  }
  return Object.freeze([...new Set(value)].sort());
}

function normalizeJsonValue(value: unknown, path: string): AgentContextPackJsonValue {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${path} must be JSON DTO-safe`);
    return value;
  }
  if (Array.isArray(value)) return normalizeArray(value, path);
  if (typeof value === "object") return normalizeObject(value, path);
  throw new Error(`${path} must be JSON DTO-safe`);
}

function normalizeArray(value: readonly unknown[], path: string): AgentContextPackJsonValue {
  if (Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length > 0) {
    throw new Error(`${path} must be JSON DTO-safe`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const entries = Object.keys(descriptors).filter((key) => key !== "length").map((key) => {
    if (!/^(0|[1-9][0-9]*)$/.test(key)) throw new Error(`${path} must be JSON DTO-safe`);
    const descriptor = descriptors[key];
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) throw new Error(`${path} must be JSON DTO-safe`);
    return [Number(key), descriptor.value] as const;
  }).sort(([left], [right]) => left - right);
  if (entries.length !== value.length) throw new Error(`${path} must be JSON DTO-safe`);
  return entries.map(([index, item]) => normalizeJsonValue(item, `${path}[${index}]`));
}

function normalizeObject(value: object, path: string): AgentContextPackJsonValue {
  const prototype = Object.getPrototypeOf(value);
  if ((prototype !== Object.prototype && prototype !== null) || Object.getOwnPropertySymbols(value).length > 0) {
    throw new Error(`${path} must be JSON DTO-safe`);
  }
  const normalized = Object.create(null) as Record<string, AgentContextPackJsonValue>;
  for (const key of Object.keys(Object.getOwnPropertyDescriptors(value)).sort()) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) throw new Error(`${path} must be JSON DTO-safe`);
    normalized[key] = normalizeJsonValue(descriptor.value, `${path}.${key}`);
  }
  return normalized;
}
