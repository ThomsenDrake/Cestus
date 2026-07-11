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

export const specialistHandoffManifestSchemaVersion = "agent-specialist-handoff-manifest.v1" as const;

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

function assertManifestHandoffAgreement(manifest: z.infer<typeof manifestSchema>, handoff: SpecialistWorkflowHandoffDto): void {
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
