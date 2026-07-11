import { createHash } from "node:crypto";
import { z } from "zod";
import { assertAgentSecretSafeText } from "./secret-safety.js";

export type AgentContextPackJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly AgentContextPackJsonValue[]
  | { readonly [key: string]: AgentContextPackJsonValue };

export interface ContextPackDescriptor {
  readonly contextPackId: string;
  readonly version: number;
  readonly label: string;
  readonly maxBytes: number;
  readonly requiredProvenanceKinds: readonly string[];
  readonly redactionPolicy: string;
  readonly sourceProjection: string;
}

export interface ContextPackRef {
  readonly contextPackId: string;
  readonly version: number;
  readonly contentHash: string;
  readonly sizeBytes: number;
  readonly generatedAt: string;
  readonly safeSummary: string;
  readonly provenanceRefs: readonly string[];
  readonly projectionHighWaterMark?: number;
  readonly sourceEventIds?: readonly string[];
  readonly artifactHashes?: readonly string[];
  readonly policyVersion?: string;
  readonly scope?: ContextPackScope;
  readonly sizeBudgetBytes?: number;
  readonly stalenessInputs?: readonly ContextPackStalenessInput[];
}

export interface BuildContextPackRefInput {
  readonly contextPackId: string;
  readonly version: number;
  readonly generatedAt: string;
  readonly payload: unknown;
  readonly safeSummary: string;
  readonly provenanceRefs: readonly string[];
  readonly projectionHighWaterMark?: number;
  readonly sourceEventIds?: readonly string[];
  readonly artifactHashes?: readonly string[];
  readonly policyVersion?: string;
  readonly scope?: ContextPackScope;
  readonly sizeBudgetBytes?: number;
  readonly stalenessInputs?: readonly ContextPackStalenessInput[];
}

export interface ResolvedContextPack {
  readonly ref: ContextPackRef;
  readonly payload: AgentContextPackJsonValue;
}

declare const verifiedResolvedContextPackBrand: unique symbol;

export type VerifiedResolvedContextPack = ResolvedContextPack & {
  readonly [verifiedResolvedContextPackBrand]: true;
};

export interface AssertResolvedContextPacksForExecutionOptions {
  /** Rehydrates persisted, hash-bound payload envelopes after byte verification. */
  readonly reverifyPersistedUntrustedPacks?: boolean;
}

export type ContextPackPayloadParser = (
  payload: AgentContextPackJsonValue,
  ref?: ContextPackRef
) => AgentContextPackJsonValue;

export type ContextPackPayloadResolver = (ref: ContextPackRef) =>
  | AgentContextPackJsonValue
  | ResolvedContextPack
  | Promise<AgentContextPackJsonValue | ResolvedContextPack>;

export interface ContextPackScope {
  readonly kind: string;
  readonly id: string;
}

export interface ContextPackStalenessInput {
  readonly kind: string;
  readonly ref: string;
  readonly value: string;
}

export type ContextPackBuilderResult = ContextPackRef | ResolvedContextPack | BuildContextPackRefInput;

export interface ContextPackBuilder {
  readonly descriptor: ContextPackDescriptor;
  readonly parsePayload?: ContextPackPayloadParser;
  build(): ContextPackBuilderResult | Promise<ContextPackBuilderResult>;
}

export interface ContextPackRegistrySnapshot {
  readonly contextPackIds: readonly string[];
  readonly descriptors: readonly ContextPackDescriptor[];
}

export interface ContextPackRegistry {
  register(builder: ContextPackBuilder): void;
  build(contextPackId: string): Promise<ContextPackRef>;
  buildResolved(contextPackId: string): Promise<VerifiedResolvedContextPack>;
  getDescriptor(contextPackId: string): ContextPackDescriptor | undefined;
  listDescriptors(): readonly ContextPackDescriptor[];
  snapshot(): ContextPackRegistrySnapshot;
}

export interface CreateContextPackRegistryOptions {
  readonly payloadResolver?: ContextPackPayloadResolver;
}

const contentHashPattern = /^sha256:[a-f0-9]{64}$/;
const contextPackIdPattern = /^[a-z][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)*\.v[1-9][0-9]*$/;
const contextPackVersionSuffixPattern = /\.v([1-9][0-9]*)$/;
const eventIdPattern = /^evt_[a-zA-Z0-9_-]+$/;
const evidenceIdPattern = /^ev_[a-zA-Z0-9_-]+$/;
const contentHashSchema = z.string().regex(contentHashPattern);
const contextPackIdSchema = z.string()
  .regex(contextPackIdPattern)
  .superRefine((value, ctx) => addSecretSafeIssue(value, "contextPackId", ctx));
const agentSecretSafeTextSchema = (label: string) => z.string().min(1)
  .superRefine((value, ctx) => addSecretSafeIssue(value, label, ctx));
const provenanceRefsSchema = z.array(agentSecretSafeTextSchema("provenanceRef"))
  .min(1, { message: "provenanceRefs must not be empty" });
const sourceEventIdsSchema = z.array(z.string().regex(eventIdPattern)
  .superRefine((value, ctx) => addSecretSafeIssue(value, "sourceEventId", ctx)));
const artifactHashesSchema = z.array(contentHashSchema);
const contextPackScopeSchema = z.object({
  kind: agentSecretSafeTextSchema("scope.kind"),
  id: agentSecretSafeTextSchema("scope.id")
}).strict();
const contextPackStalenessInputSchema = z.object({
  kind: agentSecretSafeTextSchema("stalenessInput.kind"),
  ref: agentSecretSafeTextSchema("stalenessInput.ref"),
  value: agentSecretSafeTextSchema("stalenessInput.value")
}).strict();
const builtContextPackRefs = new WeakSet<object>();
const verifiedResolvedContextPacks = new WeakSet<object>();

const contextPackDescriptorObjectSchema = z.object({
  contextPackId: contextPackIdSchema,
  version: z.number().int().positive(),
  label: agentSecretSafeTextSchema("label"),
  maxBytes: z.number().int().positive(),
  requiredProvenanceKinds: z.array(agentSecretSafeTextSchema("requiredProvenanceKind")).min(1),
  redactionPolicy: agentSecretSafeTextSchema("redactionPolicy"),
  sourceProjection: agentSecretSafeTextSchema("sourceProjection")
}).strict().superRefine((value, ctx) => addContextPackVersionMatchIssue(value, ctx));

const contextPackRefObjectSchema = z.object({
  contextPackId: contextPackIdSchema,
  version: z.number().int().positive(),
  contentHash: contentHashSchema,
  sizeBytes: z.number().int().nonnegative(),
  generatedAt: z.string().datetime(),
  safeSummary: agentSecretSafeTextSchema("safeSummary"),
  provenanceRefs: provenanceRefsSchema,
  projectionHighWaterMark: z.number().int().nonnegative().optional(),
  sourceEventIds: sourceEventIdsSchema.optional(),
  artifactHashes: artifactHashesSchema.optional(),
  policyVersion: agentSecretSafeTextSchema("policyVersion").optional(),
  scope: contextPackScopeSchema.optional(),
  sizeBudgetBytes: z.number().int().positive().optional(),
  stalenessInputs: z.array(contextPackStalenessInputSchema).optional()
}).strict().superRefine((value, ctx) => {
  addContextPackVersionMatchIssue(value, ctx);
  addContextPackSizeBudgetIssue(value, ctx);
});

const buildContextPackRefInputObjectSchema = z.object({
  contextPackId: contextPackIdSchema,
  version: z.number().int().positive(),
  generatedAt: z.string().datetime(),
  payload: z.custom<AgentContextPackJsonValue>((value) => value !== undefined, { message: "payload is required" }),
  safeSummary: agentSecretSafeTextSchema("safeSummary"),
  provenanceRefs: provenanceRefsSchema,
  projectionHighWaterMark: z.number().int().nonnegative().optional(),
  sourceEventIds: sourceEventIdsSchema.optional(),
  artifactHashes: artifactHashesSchema.optional(),
  policyVersion: agentSecretSafeTextSchema("policyVersion").optional(),
  scope: contextPackScopeSchema.optional(),
  sizeBudgetBytes: z.number().int().positive().optional(),
  stalenessInputs: z.array(contextPackStalenessInputSchema).optional()
}).strict().superRefine((value, ctx) => addContextPackVersionMatchIssue(value, ctx));

export const contextPackDescriptorSchema = z.unknown()
  .transform((value, ctx): ContextPackDescriptor => {
    const descriptor = parseNormalizedDto(value, contextPackDescriptorObjectSchema, "$", ctx);
    if (descriptor === z.NEVER) {
      return z.NEVER;
    }

    return freezeContextPackDescriptor(descriptor);
  });

export const contextPackRefSchema = z.unknown()
  .transform((value, ctx): ContextPackRef => {
    const ref = parseNormalizedDto(value, contextPackRefObjectSchema, "$", ctx);
    if (ref === z.NEVER) {
      return z.NEVER;
    }

    const parsedRef = freezeContextPackRef(ref);
    builtContextPackRefs.add(parsedRef);
    return parsedRef;
  });

export function hashAgentContextPack(value: unknown): string {
  return hashStableJson(serializeContextPackPayload(value));
}

export function serializeContextPackPayload(value: unknown): Uint8Array {
  return Buffer.from(stableJsonForAgentContextPack(value), "utf8");
}

export function buildResolvedContextPack(input: BuildContextPackRefInput): ResolvedContextPack {
  const parsed = parseNormalizedDtoOrThrow(input, buildContextPackRefInputObjectSchema, "$");
  const payload = normalizeJsonDtoValue(parsed.payload, "$.payload");
  const payloadBytes = serializeContextPackPayload(payload);
  const contentHash = hashStableJson(payloadBytes);
  const sizeBytes = payloadBytes.byteLength;
  if (parsed.sizeBudgetBytes !== undefined && parsed.sizeBudgetBytes < sizeBytes) {
    throw new Error("sizeBudgetBytes must be at least the derived context pack size");
  }
  const ref = {
    contextPackId: parsed.contextPackId,
    version: parsed.version,
    contentHash,
    sizeBytes,
    generatedAt: parsed.generatedAt,
    safeSummary: parsed.safeSummary,
    provenanceRefs: parsed.provenanceRefs,
    ...(parsed.projectionHighWaterMark === undefined ? {} : { projectionHighWaterMark: parsed.projectionHighWaterMark }),
    ...(parsed.sourceEventIds === undefined ? {} : { sourceEventIds: parsed.sourceEventIds }),
    ...(parsed.artifactHashes === undefined ? {} : { artifactHashes: parsed.artifactHashes }),
    ...(parsed.policyVersion === undefined ? {} : { policyVersion: parsed.policyVersion }),
    ...(parsed.scope === undefined ? {} : { scope: parsed.scope }),
    ...(parsed.sizeBudgetBytes === undefined ? {} : { sizeBudgetBytes: parsed.sizeBudgetBytes }),
    ...(parsed.stalenessInputs === undefined ? {} : { stalenessInputs: parsed.stalenessInputs })
  };

  const parsedRef = contextPackRefSchema.parse(ref);
  return freezeResolvedContextPack({ ref: parsedRef, payload });
}

export function buildContextPackRef(input: BuildContextPackRefInput): ContextPackRef {
  return buildResolvedContextPack(input).ref;
}

export function verifyResolvedContextPack(
  value: unknown,
  parser?: ContextPackPayloadParser
): ResolvedContextPack {
  const resolved = normalizeResolvedContextPack(value);
  const payloadBytes = serializeContextPackPayload(resolved.payload);
  const contentHash = hashStableJson(payloadBytes);
  if (contentHash !== resolved.ref.contentHash) {
    throw new Error("blocked.payload-hash-mismatch: resolved payload hash does not match ref");
  }
  const sizeBytes = payloadBytes.byteLength;
  if (sizeBytes !== resolved.ref.sizeBytes) {
    throw new Error("blocked.payload-size-mismatch: resolved payload size does not match ref");
  }
  if (parser === undefined) {
    return resolved;
  }

  let parsedPayload: AgentContextPackJsonValue;
  try {
    parsedPayload = normalizeJsonDtoValue(parser(resolved.payload, resolved.ref), "$.parsedPayload");
  } catch {
    throw new Error("blocked.payload-schema-mismatch");
  }
  const parsedPayloadBytes = serializeContextPackPayload(parsedPayload);
  if (hashStableJson(parsedPayloadBytes) !== resolved.ref.contentHash || parsedPayloadBytes.byteLength !== resolved.ref.sizeBytes) {
    throw new Error("blocked.payload-hash-mismatch: parser-normalized payload does not match ref");
  }

  return freezeResolvedContextPack({ ref: resolved.ref, payload: parsedPayload });
}

export function assertResolvedContextPacksForExecution(
  refs: readonly ContextPackRef[],
  resolvedPacks: readonly ResolvedContextPack[],
  options: AssertResolvedContextPacksForExecutionOptions = {}
): readonly VerifiedResolvedContextPack[] {
  const expected = new Map<string, ContextPackRef>();
  for (const ref of refs) {
    const parsedRef = contextPackRefSchema.parse(ref);
    const key = contextPackRefKey(parsedRef);
    if (expected.has(key)) {
      throw new Error("blocked.duplicate-context-pack-ref");
    }
    expected.set(key, parsedRef);
  }

  const matched = new Map<string, VerifiedResolvedContextPack>();
  for (const resolved of resolvedPacks) {
    const verified = isVerifiedResolvedContextPack(resolved)
      ? resolved
      : options.reverifyPersistedUntrustedPacks
        ? verifyResolvedContextPackForRegistry(resolved, (payload) => payload)
        : undefined;
    if (verified === undefined) {
      throw new Error("blocked.unverified-resolved-context-pack");
    }
    const key = contextPackRefKey(verified.ref);
    if (!expected.has(key)) {
      throw new Error("blocked.extra-resolved-context-pack");
    }
    if (matched.has(key)) {
      throw new Error("blocked.duplicate-resolved-context-pack");
    }
    matched.set(key, verified);
  }

  if (matched.size !== expected.size) {
    throw new Error("blocked.missing-resolved-context-pack");
  }
  return Object.freeze([...expected.keys()].map((key) => matched.get(key) as VerifiedResolvedContextPack));
}

export function createContextPackRegistry(options: CreateContextPackRegistryOptions = {}): ContextPackRegistry {
  const payloadResolver = options.payloadResolver;
  const builders = new Map<string, {
    readonly descriptor: ContextPackDescriptor;
    readonly build: () => ContextPackBuilderResult | Promise<ContextPackBuilderResult>;
    readonly parsePayload?: ContextPackPayloadParser;
  }>();

  return Object.freeze({
    register(builder: ContextPackBuilder): void {
      const descriptorInput = builder.descriptor;
      const duplicateContextPackId = extractContextPackIdForDuplicateCheck(descriptorInput);
      if (duplicateContextPackId !== undefined && builders.has(duplicateContextPackId)) {
        throw new Error(`Context pack ${duplicateContextPackId} is already registered`);
      }

      const descriptor = contextPackDescriptorSchema.parse(descriptorInput);
      if (builders.has(descriptor.contextPackId)) {
        throw new Error(`Context pack ${descriptor.contextPackId} is already registered`);
      }
      const build = builder.build.bind(builder);
      const parsePayload = builder.parsePayload;
      builders.set(descriptor.contextPackId, Object.freeze({
        descriptor,
        build,
        ...(parsePayload === undefined ? {} : { parsePayload })
      }));
    },

    async build(contextPackId: string): Promise<ContextPackRef> {
      assertSafeContextPackLookupId(contextPackId);
      const builder = builders.get(contextPackId);
      if (builder === undefined) {
        throw new Error(`Context pack ${contextPackId} is not registered`);
      }

      return assertRegistryContextPackRef(contextPackId, builder.descriptor, normalizeContextPackBuilderResultForRef(await builder.build()));
    },

    async buildResolved(contextPackId: string): Promise<VerifiedResolvedContextPack> {
      assertSafeContextPackLookupId(contextPackId);
      const builder = builders.get(contextPackId);
      if (builder === undefined) {
        throw new Error(`Context pack ${contextPackId} is not registered`);
      }

      const result = await builder.build();
      const ref = assertRegistryContextPackRef(contextPackId, builder.descriptor, normalizeContextPackBuilderResultForRef(result));
      let resolved: ResolvedContextPack;
      if (isBuildContextPackRefInput(result)) {
        resolved = buildResolvedContextPack(result);
      } else if (looksLikeResolvedContextPack(result)) {
        resolved = normalizeResolvedContextPack(result);
      } else {
        if (payloadResolver === undefined) {
          throw new Error("blocked.missing-payload");
        }
        let resolvedOrPayload: AgentContextPackJsonValue | ResolvedContextPack;
        try {
          resolvedOrPayload = await payloadResolver(ref);
        } catch {
          throw new Error("blocked.payload-resolution-failed");
        }
        if (resolvedOrPayload === undefined || resolvedOrPayload === null) {
          throw new Error("blocked.missing-payload");
        }
        resolved = looksLikeResolvedContextPack(resolvedOrPayload)
          ? normalizeResolvedContextPack(resolvedOrPayload)
          : freezeResolvedContextPack({ ref, payload: normalizeRawResolvedPayload(resolvedOrPayload) });
      }
      if (!contextPackRefsEqual(ref, resolved.ref)) {
        throw new Error("blocked.payload-ref-mismatch");
      }
      if (builder.parsePayload === undefined) {
        throw new Error("blocked.missing-payload-parser");
      }
      return verifyResolvedContextPackForRegistry(resolved, builder.parsePayload);
    },

    getDescriptor(contextPackId: string): ContextPackDescriptor | undefined {
      assertSafeContextPackLookupId(contextPackId);
      return builders.get(contextPackId)?.descriptor;
    },

    listDescriptors(): readonly ContextPackDescriptor[] {
      return Object.freeze([...builders.values()].map((builder) => builder.descriptor));
    },

    snapshot(): ContextPackRegistrySnapshot {
      const descriptors = Object.freeze([...builders.values()].map((builder) => builder.descriptor));
      const contextPackIds = Object.freeze(descriptors.map((descriptor) => descriptor.contextPackId));

      return Object.freeze({
        contextPackIds,
        descriptors
      });
    }
  });
}

function verifyResolvedContextPackForRegistry(
  value: ResolvedContextPack,
  parser: ContextPackPayloadParser
): VerifiedResolvedContextPack {
  const verified = verifyResolvedContextPack(value, parser) as VerifiedResolvedContextPack;
  verifiedResolvedContextPacks.add(verified);
  return verified;
}

function extractContextPackIdForDuplicateCheck(descriptor: unknown): string | undefined {
  if (typeof descriptor !== "object" || descriptor === null) {
    return undefined;
  }

  const contextPackIdDescriptor = Object.getOwnPropertyDescriptor(descriptor, "contextPackId");
  if (
    contextPackIdDescriptor === undefined ||
    !contextPackIdDescriptor.enumerable ||
    !("value" in contextPackIdDescriptor) ||
    typeof contextPackIdDescriptor.value !== "string"
  ) {
    return undefined;
  }

  return contextPackIdDescriptor.value;
}

function assertRegistryContextPackRef(
  contextPackId: string,
  descriptor: ContextPackDescriptor,
  ref: ContextPackRef
): ContextPackRef {
  if (ref.contextPackId !== descriptor.contextPackId) {
    throw new Error(`Context pack ${contextPackId} builder returned ref for ${ref.contextPackId}`);
  }
  if (ref.version !== descriptor.version) {
    throw new Error(`Context pack ${contextPackId} builder returned version ${ref.version}`);
  }
  if (ref.provenanceRefs.length === 0) {
    throw new Error(`Context pack ${contextPackId} returned no provenanceRefs`);
  }
  if (ref.sizeBytes > descriptor.maxBytes) {
    throw new Error(`Context pack ${contextPackId} exceeds maxBytes ${descriptor.maxBytes}: ${ref.sizeBytes} bytes`);
  }
  assertRequiredProvenanceKinds(contextPackId, descriptor, ref);
  return ref;
}

function normalizeContextPackBuilderResultForRef(result: ContextPackBuilderResult): ContextPackRef {
  if (isBuiltContextPackRef(result)) {
    return result;
  }
  if (looksLikeResolvedContextPack(result)) {
    return normalizeResolvedContextPack(result).ref;
  }
  if (looksLikeUntrustedContextPackRef(result)) {
    throw new Error("Context pack builder returned an untrusted context pack ref; use contextPackRefSchema.parse(...), buildContextPackRef(...), or return raw build input");
  }
  return buildContextPackRef(result);
}

function isBuiltContextPackRef(value: unknown): value is ContextPackRef {
  return typeof value === "object" && value !== null && builtContextPackRefs.has(value);
}

function looksLikeUntrustedContextPackRef(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return Object.getOwnPropertyDescriptor(value, "contentHash") !== undefined ||
    Object.getOwnPropertyDescriptor(value, "sizeBytes") !== undefined;
}

function isBuildContextPackRefInput(value: unknown): value is BuildContextPackRefInput {
  if (typeof value !== "object" || value === null || looksLikeResolvedContextPack(value)) {
    return false;
  }
  return Object.getOwnPropertyDescriptor(value, "payload") !== undefined &&
    Object.getOwnPropertyDescriptor(value, "ref") === undefined;
}

function looksLikeResolvedContextPack(value: unknown): value is ResolvedContextPack {
  return typeof value === "object" && value !== null &&
    Object.getOwnPropertyDescriptor(value, "ref") !== undefined &&
    Object.getOwnPropertyDescriptor(value, "payload") !== undefined;
}

function normalizeResolvedContextPack(value: unknown): ResolvedContextPack {
  if (!looksLikeResolvedContextPack(value)) {
    throw new Error("blocked.missing-payload");
  }
  let normalized: AgentContextPackJsonValue;
  try {
    normalized = normalizeJsonDtoValue(value, "$");
  } catch {
    throw new Error("blocked.invalid-payload-shape");
  }
  if (typeof normalized !== "object" || normalized === null || Array.isArray(normalized)) {
    throw new Error("blocked.invalid-resolved-context-pack");
  }
  const normalizedEnvelope = normalized as { readonly [key: string]: AgentContextPackJsonValue };
  const refValue = normalizedEnvelope.ref;
  const payload = normalizedEnvelope.payload;
  if (refValue === undefined || payload === undefined) {
    throw new Error("blocked.missing-payload");
  }
  const ref = contextPackRefSchema.parse(refValue);
  return freezeResolvedContextPack({ ref, payload });
}

function normalizeRawResolvedPayload(value: unknown): AgentContextPackJsonValue {
  try {
    return normalizeJsonDtoValue(value, "$.payload");
  } catch {
    throw new Error("blocked.invalid-payload-shape");
  }
}

function freezeResolvedContextPack(resolved: ResolvedContextPack): ResolvedContextPack {
  return Object.freeze({
    ref: resolved.ref,
    payload: freezeJsonDtoValue(resolved.payload)
  });
}

function freezeJsonDtoValue(value: AgentContextPackJsonValue): AgentContextPackJsonValue {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(freezeJsonDtoValue));
  }
  if (typeof value === "object" && value !== null) {
    const frozen = Object.create(null) as Record<string, AgentContextPackJsonValue>;
    for (const [key, child] of Object.entries(value)) {
      frozen[key] = freezeJsonDtoValue(child);
    }
    return Object.freeze(frozen);
  }
  return value;
}

function isVerifiedResolvedContextPack(value: unknown): value is VerifiedResolvedContextPack {
  return typeof value === "object" && value !== null && verifiedResolvedContextPacks.has(value);
}

function contextPackRefKey(ref: ContextPackRef): string {
  return stringifyJsonDtoValue(normalizeJsonDtoValue(ref, "$.ref"));
}

function contextPackRefsEqual(left: ContextPackRef, right: ContextPackRef): boolean {
  return stringifyJsonDtoValue(normalizeJsonDtoValue(left, "$.left")) ===
    stringifyJsonDtoValue(normalizeJsonDtoValue(right, "$.right"));
}

function assertSafeContextPackLookupId(contextPackId: unknown): asserts contextPackId is string {
  if (typeof contextPackId !== "string") {
    throw new Error("contextPackId must be a string");
  }
  assertAgentSecretSafeText(contextPackId, "contextPackId");
  if (!contextPackIdPattern.test(contextPackId)) {
    throw new Error("contextPackId must be a valid context pack ID");
  }
}

function addContextPackVersionMatchIssue(
  value: { readonly contextPackId: string; readonly version: number },
  ctx: z.RefinementCtx
): void {
  const suffixVersion = contextPackVersionFromId(value.contextPackId);
  if (suffixVersion !== undefined && suffixVersion !== value.version) {
    ctx.addIssue({
      code: "custom",
      path: ["version"],
      message: "contextPackId version suffix must match version"
    });
  }
}

function addContextPackSizeBudgetIssue(
  value: { readonly sizeBytes: number; readonly sizeBudgetBytes?: number | undefined },
  ctx: z.RefinementCtx
): void {
  if (value.sizeBudgetBytes !== undefined && value.sizeBudgetBytes < value.sizeBytes) {
    ctx.addIssue({
      code: "custom",
      path: ["sizeBudgetBytes"],
      message: "sizeBudgetBytes must be at least the derived context pack size"
    });
  }
}

function contextPackVersionFromId(contextPackId: string): number | undefined {
  const match = contextPackVersionSuffixPattern.exec(contextPackId);
  if (match?.[1] === undefined) {
    return undefined;
  }

  return Number(match[1]);
}

function assertRequiredProvenanceKinds(
  contextPackId: string,
  descriptor: ContextPackDescriptor,
  ref: ContextPackRef
): void {
  for (const kind of descriptor.requiredProvenanceKinds) {
    if (!ref.provenanceRefs.some((provenanceRef) => satisfiesRequiredProvenanceKind(kind, provenanceRef))) {
      throw new Error(`Context pack ${contextPackId} is missing required provenance kind ${kind}`);
    }
  }
}

function satisfiesRequiredProvenanceKind(kind: string, provenanceRef: string): boolean {
  switch (kind) {
    case "event-id":
      return eventIdPattern.test(provenanceRef);
    case "content-hash":
    case "artifact-hash":
      return contentHashPattern.test(provenanceRef);
    case "evidence-id":
      return evidenceIdPattern.test(provenanceRef);
    default:
      return provenanceRef.startsWith(`${kind}:`) && provenanceRef.length > kind.length + 1;
  }
}

function stableJsonForAgentContextPack(value: unknown): string {
  return stringifyJsonDtoValue(normalizeJsonDtoValue(value, "$"));
}

function stringifyJsonDtoValue(value: AgentContextPackJsonValue): string {
  const json = JSON.stringify(value);
  if (json === undefined) {
    throw new Error("$ must be JSON DTO-safe");
  }

  return json;
}

function hashStableJson(bytes: Uint8Array): string {
  const digest = createHash("sha256").update(bytes).digest("hex");

  return `sha256:${digest}`;
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

function isCanonicalArrayIndexKey(key: string): boolean {
  if (!/^(0|[1-9][0-9]*)$/.test(key)) {
    return false;
  }

  const index = Number(key);
  return Number.isInteger(index) && index >= 0 && index < 2 ** 32 - 1;
}

function freezeContextPackDescriptor(descriptor: z.infer<typeof contextPackDescriptorObjectSchema>): ContextPackDescriptor {
  return Object.freeze({
    ...descriptor,
    requiredProvenanceKinds: Object.freeze([...descriptor.requiredProvenanceKinds])
  });
}

function freezeContextPackRef(ref: z.infer<typeof contextPackRefObjectSchema>): ContextPackRef {
  const frozenRef: ContextPackRef = {
    contextPackId: ref.contextPackId,
    version: ref.version,
    contentHash: ref.contentHash,
    sizeBytes: ref.sizeBytes,
    generatedAt: ref.generatedAt,
    safeSummary: ref.safeSummary,
    provenanceRefs: Object.freeze([...ref.provenanceRefs]),
    ...(ref.projectionHighWaterMark === undefined ? {} : { projectionHighWaterMark: ref.projectionHighWaterMark }),
    ...(ref.sourceEventIds === undefined ? {} : { sourceEventIds: Object.freeze([...ref.sourceEventIds]) }),
    ...(ref.artifactHashes === undefined ? {} : { artifactHashes: Object.freeze([...ref.artifactHashes]) }),
    ...(ref.policyVersion === undefined ? {} : { policyVersion: ref.policyVersion }),
    ...(ref.scope === undefined ? {} : { scope: Object.freeze({ ...ref.scope }) }),
    ...(ref.sizeBudgetBytes === undefined ? {} : { sizeBudgetBytes: ref.sizeBudgetBytes }),
    ...(ref.stalenessInputs === undefined ? {} : {
      stalenessInputs: Object.freeze(ref.stalenessInputs.map((input) => Object.freeze({ ...input })))
    })
  };

  return Object.freeze(frozenRef);
}
