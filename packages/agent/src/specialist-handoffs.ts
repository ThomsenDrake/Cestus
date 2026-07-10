import { z } from "zod";
import {
  contextPackRefSchema,
  hashAgentContextPack,
  type AgentContextPackJsonValue,
  type ContextPackRef
} from "./context-packs.js";
import { assertAgentSecretSafeText } from "./secret-safety.js";
import { approvedAgentSpecialistRunTypes, type AgentSpecialistRunType } from "./specialists.js";

const specialistWorkflowHandoffSchemaVersion = "agent-specialist-handoff.v1";
const residentAgentIdValue = "agent_default";
const contentHashPattern = /^sha256:[a-f0-9]{64}$/;
const approvedRunTypeSet = new Set<string>(approvedAgentSpecialistRunTypes);
const forbiddenAuthorityOrEffectPattern =
  /\b(?:assertion\.accepted|entity\.resolved|relationship\.accepted|accepted graph|prr sent|prr followup sent|prr follow-up sent|followup sent|follow-up sent|legal escalation (?:confirmed|completed)|export (?:generated|completed)|report generated|publication completed|provider transfer completed|destructive repair completed|approval consumed)\b/i;

const approvalClassValues = [
  "none",
  "human-review",
  "provider-byte-transfer",
  "external-message-send",
  "export-or-publication",
  "destructive-or-repair",
  "legal-escalation",
  "ledger-review"
] as const;

const failureCategoryValues = [
  "provider-unavailable",
  "provider-rate-limited",
  "credential-missing",
  "credential-revoked",
  "approval-required",
  "approval-denied",
  "approval-stale",
  "permission-denied",
  "secret-detected",
  "legal-lock-active",
  "lock-active",
  "projection-lag",
  "context-budget-exceeded",
  "missing-provenance",
  "provenance-missing",
  "model-output-invalid",
  "domain-gate-failed",
  "stale-source",
  "external-effect-failed",
  "data-loss-risk",
  "prr-request-missing",
  "jurisdiction-pack-missing",
  "deadline-conflict",
  "evidence-missing",
  "evidence-quarantined",
  "parse-unavailable",
  "timeline-source-missing",
  "date-parse-conflict",
  "citation-missing",
  "source-pair-missing",
  "claim-scope-missing"
] as const;

const handoffStatusValues = [
  "ready-for-review",
  "waiting-for-approval",
  "blocked",
  "failed"
] as const;

const nextSafeActionKindValues = [
  "review",
  "inspect",
  "open-artifact",
  "open-context",
  "request-approval",
  "retry"
] as const;

const nextSafeActionEffectValues = [
  "none",
  "local-only",
  "request-approval"
] as const;

export interface SpecialistOutputArtifactRef {
  readonly artifactId: string;
  readonly artifactKind: string;
  readonly schemaId: string;
  readonly artifactHash: `sha256:${string}`;
  readonly safeSummary: string;
}

export interface SpecialistApprovalRequirement {
  readonly approvalClass: typeof approvalClassValues[number];
  readonly reason: string;
  readonly toolRequestId?: string;
}

export interface SpecialistNextAction {
  readonly actionId: string;
  readonly label: string;
  readonly kind: typeof nextSafeActionKindValues[number];
  readonly effect: typeof nextSafeActionEffectValues[number];
  readonly artifactId?: string;
  readonly toolRequestId?: string;
  readonly contextPackId?: string;
}

export interface SpecialistFailureDto {
  readonly category: typeof failureCategoryValues[number];
  readonly code: string;
  readonly safeSummary: string;
  readonly retryable: boolean;
  readonly toolRequestId?: string;
}

export interface SpecialistWorkflowHandoffDto {
  readonly schemaVersion: typeof specialistWorkflowHandoffSchemaVersion;
  readonly handoffId: string;
  readonly handoffRevision: number;
  readonly runType: AgentSpecialistRunType;
  readonly runId: string;
  readonly taskId?: string;
  readonly residentAgentId: typeof residentAgentIdValue;
  readonly generatedAt: string;
  readonly status: typeof handoffStatusValues[number];
  readonly safeSummary: string;
  readonly contextPackRefs: readonly ContextPackRef[];
  readonly promptArtifactHash?: `sha256:${string}`;
  readonly outputArtifacts: readonly SpecialistOutputArtifactRef[];
  readonly toolRequestIds: readonly string[];
  readonly approvalRequirements: readonly SpecialistApprovalRequirement[];
  readonly nextSafeActions: readonly SpecialistNextAction[];
  readonly failure?: SpecialistFailureDto;
}

export type LegacySpecialistWorkflowHandoffDto = Omit<
  SpecialistWorkflowHandoffDto,
  "handoffId" | "handoffRevision"
> & {
  readonly durability: "legacy-non-durable";
};

export type SpecialistWorkflowOutputArtifactDto = SpecialistOutputArtifactRef;
export type SpecialistWorkflowApprovalRequirementDto = SpecialistApprovalRequirement;
export type SpecialistWorkflowNextSafeActionDto = SpecialistNextAction;
export type SpecialistWorkflowFailureDto = SpecialistFailureDto;

const contentHashSchema = z.string().regex(contentHashPattern)
  .transform((value) => value as `sha256:${string}`);
const secretSafeTextSchema = (label: string) => z.string().min(1)
  .superRefine((value, ctx) => addSafeTextIssue(value, label, ctx));
const safeIdentifierSchema = (label: string) => z.string().min(1)
  .superRefine((value, ctx) => addSafeTextIssue(value, label, ctx));
const approvedRunTypeSchema = z.string()
  .refine((value) => approvedRunTypeSet.has(value), { message: "run type must be an approved specialist run type" })
  .transform((value) => value as AgentSpecialistRunType);
const approvalClassSchema = z.enum(approvalClassValues);
const failureCategorySchema = z.enum(failureCategoryValues);
const handoffStatusSchema = z.enum(handoffStatusValues);
const nextSafeActionKindSchema = z.enum(nextSafeActionKindValues);
const nextSafeActionEffectSchema = z.enum(nextSafeActionEffectValues);

const specialistOutputArtifactRefObjectSchema = z.object({
  artifactId: safeIdentifierSchema("artifactId"),
  artifactKind: safeIdentifierSchema("artifactKind"),
  schemaId: safeIdentifierSchema("schemaId"),
  artifactHash: contentHashSchema,
  safeSummary: secretSafeTextSchema("outputArtifact.safeSummary")
}).strict();

const specialistApprovalRequirementObjectSchema = z.object({
  approvalClass: approvalClassSchema,
  reason: secretSafeTextSchema("approvalRequirement.reason"),
  toolRequestId: safeIdentifierSchema("approvalRequirement.toolRequestId").optional()
}).strict();

const specialistNextActionObjectSchema = z.object({
  actionId: safeIdentifierSchema("nextSafeAction.actionId"),
  label: secretSafeTextSchema("nextSafeAction.label"),
  kind: nextSafeActionKindSchema,
  effect: nextSafeActionEffectSchema,
  artifactId: safeIdentifierSchema("nextSafeAction.artifactId").optional(),
  toolRequestId: safeIdentifierSchema("nextSafeAction.toolRequestId").optional(),
  contextPackId: safeIdentifierSchema("nextSafeAction.contextPackId").optional()
}).strict();

const specialistFailureDtoObjectSchema = z.object({
  category: failureCategorySchema,
  code: safeIdentifierSchema("failure.code"),
  safeSummary: secretSafeTextSchema("failure.safeSummary"),
  retryable: z.boolean(),
  toolRequestId: safeIdentifierSchema("failure.toolRequestId").optional()
}).strict();

const specialistWorkflowHandoffCommonObjectShape = {
  runType: approvedRunTypeSchema,
  runId: safeIdentifierSchema("runId"),
  taskId: safeIdentifierSchema("taskId").optional(),
  residentAgentId: z.literal(residentAgentIdValue),
  generatedAt: z.string().datetime(),
  status: handoffStatusSchema,
  safeSummary: secretSafeTextSchema("safeSummary"),
  contextPackRefs: z.array(contextPackRefSchema),
  promptArtifactHash: contentHashSchema.optional(),
  outputArtifacts: z.array(specialistOutputArtifactRefObjectSchema),
  toolRequestIds: z.array(safeIdentifierSchema("toolRequestId")),
  approvalRequirements: z.array(specialistApprovalRequirementObjectSchema),
  nextSafeActions: z.array(specialistNextActionObjectSchema),
  failure: specialistFailureDtoObjectSchema.optional()
} as const;

function addHandoffStatusIssues(
  value: { readonly status: typeof handoffStatusValues[number]; readonly failure?: unknown },
  ctx: z.RefinementCtx
): void {
  if (value.status !== "failed" && value.failure !== undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["failure"],
      message: "failure is only allowed when status is failed"
    });
  }

  if (value.status === "failed" && value.failure === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["failure"],
      message: "failure is required when status is failed"
    });
  }
}

const specialistWorkflowHandoffObjectSchema = z.object({
  schemaVersion: z.literal(specialistWorkflowHandoffSchemaVersion),
  handoffId: z.string().regex(/^handoff_[a-zA-Z0-9_-]+_[a-f0-9]{16}$/),
  handoffRevision: z.number().int().positive(),
  ...specialistWorkflowHandoffCommonObjectShape
}).strict().superRefine((value, ctx) => {
  addHandoffStatusIssues(value, ctx);
});

const legacySpecialistWorkflowHandoffObjectSchema = z.object({
  schemaVersion: z.literal(specialistWorkflowHandoffSchemaVersion),
  durability: z.literal("legacy-non-durable").optional(),
  ...specialistWorkflowHandoffCommonObjectShape
}).strict().superRefine((value, ctx) => {
  addHandoffStatusIssues(value, ctx);
});

export const specialistOutputArtifactRefSchema = z.unknown()
  .transform((value, ctx): SpecialistOutputArtifactRef => {
    const parsed = parseNormalizedDto(value, specialistOutputArtifactRefObjectSchema, "$", ctx);
    if (parsed === z.NEVER) {
      return z.NEVER;
    }

    return freezeOutputArtifactRef(parsed);
  });

export const specialistApprovalRequirementSchema = z.unknown()
  .transform((value, ctx): SpecialistApprovalRequirement => {
    const parsed = parseNormalizedDto(value, specialistApprovalRequirementObjectSchema, "$", ctx);
    if (parsed === z.NEVER) {
      return z.NEVER;
    }

    return freezeApprovalRequirement(parsed);
  });

export const specialistNextActionSchema = z.unknown()
  .transform((value, ctx): SpecialistNextAction => {
    const parsed = parseNormalizedDto(value, specialistNextActionObjectSchema, "$", ctx);
    if (parsed === z.NEVER) {
      return z.NEVER;
    }

    return freezeNextAction(parsed);
  });

export const specialistFailureDtoSchema = z.unknown()
  .transform((value, ctx): SpecialistFailureDto => {
    const parsed = parseNormalizedDto(value, specialistFailureDtoObjectSchema, "$", ctx);
    if (parsed === z.NEVER) {
      return z.NEVER;
    }

    return freezeFailureDto(parsed);
  });

export const specialistWorkflowHandoffSchema = z.unknown()
  .transform((value, ctx): SpecialistWorkflowHandoffDto => {
    const parsed = parseNormalizedDto(value, specialistWorkflowHandoffObjectSchema, "$", ctx);
    if (parsed === z.NEVER) {
      return z.NEVER;
    }

    return freezeSpecialistWorkflowHandoff(parsed);
  });

export const legacySpecialistWorkflowHandoffSchema = z.unknown()
  .transform((value, ctx): LegacySpecialistWorkflowHandoffDto => {
    const parsed = parseNormalizedDto(value, legacySpecialistWorkflowHandoffObjectSchema, "$", ctx);
    if (parsed === z.NEVER) {
      return z.NEVER;
    }

    return freezeLegacySpecialistWorkflowHandoff(parsed);
  });

export function parseSpecialistWorkflowHandoff(value: unknown): SpecialistWorkflowHandoffDto {
  return specialistWorkflowHandoffSchema.parse(value);
}

export function parseLegacySpecialistWorkflowHandoff(value: unknown): LegacySpecialistWorkflowHandoffDto {
  return legacySpecialistWorkflowHandoffSchema.parse(value);
}

export function hashSpecialistWorkflowHandoff(dto: SpecialistWorkflowHandoffDto): `sha256:${string}` {
  const parsed = parseSpecialistWorkflowHandoff(dto);
  return hashAgentContextPack(parsed) as `sha256:${string}`;
}

function addSafeTextIssue(value: string, label: string, ctx: z.RefinementCtx): void {
  try {
    assertAgentSecretSafeText(value, label);
    assertNoForbiddenAuthorityOrEffectClaim(value, label);
  } catch (error) {
    ctx.addIssue({
      code: "custom",
      message: error instanceof Error ? error.message : `${label} must be secret-safe`
    });
  }
}

function assertNoForbiddenAuthorityOrEffectClaim(value: string, label: string): void {
  if (forbiddenAuthorityOrEffectPattern.test(value)) {
    throw new Error(`${label} must not claim accepted authority or completed external effects`);
  }
}

function parseNormalizedDto<T>(
  value: unknown,
  schema: z.ZodType<T>,
  path: string,
  ctx: z.RefinementCtx
): T | typeof z.NEVER {
  let normalized: AgentContextPackJsonValue;
  try {
    normalized = normalizeJsonDtoValue(value, path);
  } catch (error) {
    ctx.addIssue({
      code: "custom",
      message: error instanceof Error ? error.message : `${path} must be JSON DTO-safe`
    });
    return z.NEVER;
  }

  const result = schema.safeParse(normalized);
  if (!result.success) {
    for (const issue of result.error.issues) {
      ctx.addIssue({
        code: "custom",
        path: issue.path,
        message: issue.message
      });
    }
    return z.NEVER;
  }

  return result.data;
}

function normalizeJsonDtoValue(value: unknown, path: string): AgentContextPackJsonValue {
  if (value === null) {
    return null;
  }

  if (typeof value === "string") {
    assertAgentSecretSafeText(value, path);
    assertNoForbiddenAuthorityOrEffectClaim(value, path);
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

  return indexedDescriptors.map(({ index, descriptor }) => normalizeJsonDtoValue(descriptor.value, `${path}[${index}]`));
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

function isCanonicalArrayIndexKey(key: string): boolean {
  if (!/^(0|[1-9][0-9]*)$/.test(key)) {
    return false;
  }

  const index = Number(key);
  return Number.isInteger(index) && index >= 0 && index < 2 ** 32 - 1;
}

function freezeOutputArtifactRef(
  value: z.infer<typeof specialistOutputArtifactRefObjectSchema>
): SpecialistOutputArtifactRef {
  return Object.freeze({
    artifactId: value.artifactId,
    artifactKind: value.artifactKind,
    schemaId: value.schemaId,
    artifactHash: value.artifactHash,
    safeSummary: value.safeSummary
  });
}

function freezeApprovalRequirement(
  value: z.infer<typeof specialistApprovalRequirementObjectSchema>
): SpecialistApprovalRequirement {
  return Object.freeze({
    approvalClass: value.approvalClass,
    reason: value.reason,
    ...(value.toolRequestId === undefined ? {} : { toolRequestId: value.toolRequestId })
  });
}

function freezeNextAction(value: z.infer<typeof specialistNextActionObjectSchema>): SpecialistNextAction {
  return Object.freeze({
    actionId: value.actionId,
    label: value.label,
    kind: value.kind,
    effect: value.effect,
    ...(value.artifactId === undefined ? {} : { artifactId: value.artifactId }),
    ...(value.toolRequestId === undefined ? {} : { toolRequestId: value.toolRequestId }),
    ...(value.contextPackId === undefined ? {} : { contextPackId: value.contextPackId })
  });
}

function freezeFailureDto(value: z.infer<typeof specialistFailureDtoObjectSchema>): SpecialistFailureDto {
  return Object.freeze({
    category: value.category,
    code: value.code,
    safeSummary: value.safeSummary,
    retryable: value.retryable,
    ...(value.toolRequestId === undefined ? {} : { toolRequestId: value.toolRequestId })
  });
}

function freezeSpecialistWorkflowHandoff(
  value: z.infer<typeof specialistWorkflowHandoffObjectSchema>
): SpecialistWorkflowHandoffDto {
  const handoff: SpecialistWorkflowHandoffDto = {
    schemaVersion: value.schemaVersion,
    handoffId: value.handoffId,
    handoffRevision: value.handoffRevision,
    runType: value.runType,
    runId: value.runId,
    residentAgentId: value.residentAgentId,
    generatedAt: value.generatedAt,
    status: value.status,
    safeSummary: value.safeSummary,
    contextPackRefs: Object.freeze([...value.contextPackRefs]),
    outputArtifacts: Object.freeze(value.outputArtifacts.map((artifact) => freezeOutputArtifactRef(artifact))),
    toolRequestIds: Object.freeze([...value.toolRequestIds]),
    approvalRequirements: Object.freeze(
      value.approvalRequirements.map((requirement) => freezeApprovalRequirement(requirement))
    ),
    nextSafeActions: Object.freeze(value.nextSafeActions.map((action) => freezeNextAction(action))),
    ...(value.taskId === undefined ? {} : { taskId: value.taskId }),
    ...(value.promptArtifactHash === undefined ? {} : { promptArtifactHash: value.promptArtifactHash }),
    ...(value.failure === undefined ? {} : { failure: freezeFailureDto(value.failure) })
  };

  return Object.freeze(handoff);
}

function freezeLegacySpecialistWorkflowHandoff(
  value: z.infer<typeof legacySpecialistWorkflowHandoffObjectSchema>
): LegacySpecialistWorkflowHandoffDto {
  const handoff: LegacySpecialistWorkflowHandoffDto = {
    durability: "legacy-non-durable",
    schemaVersion: value.schemaVersion,
    runType: value.runType,
    runId: value.runId,
    residentAgentId: value.residentAgentId,
    generatedAt: value.generatedAt,
    status: value.status,
    safeSummary: value.safeSummary,
    contextPackRefs: Object.freeze([...value.contextPackRefs]),
    outputArtifacts: Object.freeze(value.outputArtifacts.map((artifact) => freezeOutputArtifactRef(artifact))),
    toolRequestIds: Object.freeze([...value.toolRequestIds]),
    approvalRequirements: Object.freeze(
      value.approvalRequirements.map((requirement) => freezeApprovalRequirement(requirement))
    ),
    nextSafeActions: Object.freeze(value.nextSafeActions.map((action) => freezeNextAction(action))),
    ...(value.taskId === undefined ? {} : { taskId: value.taskId }),
    ...(value.promptArtifactHash === undefined ? {} : { promptArtifactHash: value.promptArtifactHash }),
    ...(value.failure === undefined ? {} : { failure: freezeFailureDto(value.failure) })
  };

  return Object.freeze(handoff);
}
