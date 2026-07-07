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
  readonly generatedAt: string;
  readonly safeSummary: string;
  readonly provenanceRefs: readonly string[];
  readonly projectionHighWaterMark?: number;
}

export interface BuildContextPackRefInput {
  readonly contextPackId: string;
  readonly version: number;
  readonly generatedAt: string;
  readonly payload: unknown;
  readonly safeSummary: string;
  readonly provenanceRefs: readonly string[];
  readonly projectionHighWaterMark?: number;
}

export interface ContextPackBuilder {
  readonly descriptor: ContextPackDescriptor;
  build(): ContextPackRef | Promise<ContextPackRef>;
}

export interface ContextPackRegistrySnapshot {
  readonly contextPackIds: readonly string[];
  readonly descriptors: readonly ContextPackDescriptor[];
}

export interface ContextPackRegistry {
  register(builder: ContextPackBuilder): void;
  build(contextPackId: string): Promise<ContextPackRef>;
  getDescriptor(contextPackId: string): ContextPackDescriptor | undefined;
  listDescriptors(): readonly ContextPackDescriptor[];
  snapshot(): ContextPackRegistrySnapshot;
}

const contentHashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const contextPackIdSchema = z.string()
  .regex(/^[a-z][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)*\.v[1-9][0-9]*$/)
  .superRefine((value, ctx) => addSecretSafeIssue(value, "contextPackId", ctx));
const agentSecretSafeTextSchema = (label: string) => z.string().min(1)
  .superRefine((value, ctx) => addSecretSafeIssue(value, label, ctx));

const contextPackDescriptorObjectSchema = z.object({
  contextPackId: contextPackIdSchema,
  version: z.number().int().positive(),
  label: agentSecretSafeTextSchema("label"),
  maxBytes: z.number().int().positive(),
  requiredProvenanceKinds: z.array(agentSecretSafeTextSchema("requiredProvenanceKind")).min(1),
  redactionPolicy: agentSecretSafeTextSchema("redactionPolicy"),
  sourceProjection: agentSecretSafeTextSchema("sourceProjection")
}).strict();

const contextPackRefObjectSchema = z.object({
  contextPackId: contextPackIdSchema,
  version: z.number().int().positive(),
  contentHash: contentHashSchema,
  generatedAt: z.string().datetime(),
  safeSummary: agentSecretSafeTextSchema("safeSummary"),
  provenanceRefs: z.array(agentSecretSafeTextSchema("provenanceRef")),
  projectionHighWaterMark: z.number().int().nonnegative().optional()
}).strict();

const buildContextPackRefInputObjectSchema = z.object({
  contextPackId: contextPackIdSchema,
  version: z.number().int().positive(),
  generatedAt: z.string().datetime(),
  payload: z.custom<AgentContextPackJsonValue>((value) => value !== undefined, { message: "payload is required" }),
  safeSummary: agentSecretSafeTextSchema("safeSummary"),
  provenanceRefs: z.array(agentSecretSafeTextSchema("provenanceRef")),
  projectionHighWaterMark: z.number().int().nonnegative().optional()
}).strict();

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

    return freezeContextPackRef(ref);
  });

export function hashAgentContextPack(value: unknown): string {
  const normalized = normalizeJsonDtoValue(value, "$");
  const json = JSON.stringify(normalized);
  const digest = createHash("sha256").update(json).digest("hex");

  return `sha256:${digest}`;
}

export function buildContextPackRef(input: BuildContextPackRefInput): ContextPackRef {
  const parsed = parseNormalizedDtoOrThrow(input, buildContextPackRefInputObjectSchema, "$");
  const contentHash = hashAgentContextPack(parsed.payload);
  const ref = {
    contextPackId: parsed.contextPackId,
    version: parsed.version,
    contentHash,
    generatedAt: parsed.generatedAt,
    safeSummary: parsed.safeSummary,
    provenanceRefs: parsed.provenanceRefs,
    ...(parsed.projectionHighWaterMark === undefined ? {} : { projectionHighWaterMark: parsed.projectionHighWaterMark })
  };

  return contextPackRefSchema.parse(ref);
}

export function createContextPackRegistry(): ContextPackRegistry {
  const builders = new Map<string, {
    readonly descriptor: ContextPackDescriptor;
    readonly build: () => ContextPackRef | Promise<ContextPackRef>;
  }>();

  return Object.freeze({
    register(builder: ContextPackBuilder): void {
      const descriptor = contextPackDescriptorSchema.parse(builder.descriptor);
      if (builders.has(descriptor.contextPackId)) {
        throw new Error(`Context pack ${descriptor.contextPackId} is already registered`);
      }
      const build = builder.build.bind(builder);
      builders.set(descriptor.contextPackId, Object.freeze({
        descriptor,
        build
      }));
    },

    async build(contextPackId: string): Promise<ContextPackRef> {
      if (typeof contextPackId !== "string") {
        throw new Error("contextPackId must be a string");
      }
      assertAgentSecretSafeText(contextPackId, "contextPackId");
      const builder = builders.get(contextPackId);
      if (builder === undefined) {
        throw new Error(`Context pack ${contextPackId} is not registered`);
      }

      const ref = contextPackRefSchema.parse(await builder.build());
      if (ref.contextPackId !== builder.descriptor.contextPackId) {
        throw new Error(`Context pack ${contextPackId} builder returned ref for ${ref.contextPackId}`);
      }
      if (ref.version !== builder.descriptor.version) {
        throw new Error(`Context pack ${contextPackId} builder returned version ${ref.version}`);
      }

      return ref;
    },

    getDescriptor(contextPackId: string): ContextPackDescriptor | undefined {
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
  const frozenRef = {
    contextPackId: ref.contextPackId,
    version: ref.version,
    contentHash: ref.contentHash,
    generatedAt: ref.generatedAt,
    safeSummary: ref.safeSummary,
    provenanceRefs: Object.freeze([...ref.provenanceRefs])
  };

  if (ref.projectionHighWaterMark !== undefined) {
    return Object.freeze({
      ...frozenRef,
      projectionHighWaterMark: ref.projectionHighWaterMark
    });
  }

  return Object.freeze(frozenRef);
}
