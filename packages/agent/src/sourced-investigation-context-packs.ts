import { z } from "zod";
import {
  buildResolvedContextPack,
  hashAgentContextPack,
  registerContextPackPayloadParserAuthority,
  type AgentContextPackJsonValue,
  type ContextPackDescriptor,
  type ContextPackPayloadParser,
  type ContextPackRef,
  type ContextPackRegistry
} from "./context-packs.js";
import { assertAgentSecretSafeText } from "./secret-safety.js";

type ContentHash = `sha256:${string}`;

export interface TimelineDraftSummaryItem {
  readonly itemId: string;
  readonly artifactHash: ContentHash;
  readonly summary: string;
  readonly uncertaintyCategories: readonly string[];
  readonly sourceEventIds: readonly string[];
}

export interface TimelineDraftSummaryPayload {
  readonly schemaVersion: "timeline-draft-summary.context.v1";
  readonly contextPackId: "timeline-draft-summary.v1";
  readonly version: 1;
  readonly scope: { readonly kind: string; readonly id: string };
  readonly truthBoundary: {
    readonly advisoryOnly: true;
    readonly acceptedGraphMutationAllowed: false;
    readonly publicationAllowed: false;
  };
  readonly items: readonly TimelineDraftSummaryItem[];
  readonly omissions: readonly string[];
  readonly emptyProof?: {
    readonly artifactHash: ContentHash;
    readonly sourceEventIds: readonly string[];
  } | undefined;
}

export interface RegisterTimelineDraftSummaryContextPackInput {
  readonly scope: { readonly kind: string; readonly id: string };
  readonly generatedAt: string;
  readonly safeSummary: string;
  readonly sourceEventIds: readonly string[];
  readonly items: readonly TimelineDraftSummaryItem[];
  readonly omissions: readonly string[];
  readonly emptyProof?: {
    readonly artifactHash: ContentHash;
    readonly sourceEventIds: readonly string[];
  } | undefined;
}

export interface SourcedInvestigationContextPackRegistrarEvidence {
  readonly descriptorHash: string;
  readonly parserIdentity: "timeline-draft-summary.v1";
  readonly producerIdentity: "packages/agent/src/sourced-investigation-context-packs";
  readonly registrationIdentity: string;
}

const hashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const eventIdSchema = z.string().regex(/^evt_[a-zA-Z0-9_-]+$/);
const safeTextSchema = (label: string) => z.string().min(1).max(500).superRefine((value, ctx) => {
  try {
    assertAgentSecretSafeText(value, label);
  } catch {
    ctx.addIssue({ code: "custom", message: `${label} must be secret-safe` });
  }
});
const scopeSchema = z.object({
  kind: safeTextSchema("timeline scope kind"),
  id: safeTextSchema("timeline scope id")
}).strict();
const itemSchema = z.object({
  itemId: z.string().regex(/^timeline_[a-zA-Z0-9_-]+$/),
  artifactHash: hashSchema,
  summary: safeTextSchema("timeline summary"),
  uncertaintyCategories: z.array(safeTextSchema("timeline uncertainty category")).max(12),
  sourceEventIds: z.array(eventIdSchema).min(1).max(64)
}).strict().superRefine((value, ctx) => {
  if (new Set(value.sourceEventIds).size !== value.sourceEventIds.length) {
    ctx.addIssue({ code: "custom", path: ["sourceEventIds"], message: "timeline item source event ids must be unique" });
  }
});
const emptyProofSchema = z.object({
  artifactHash: hashSchema,
  sourceEventIds: z.array(eventIdSchema).min(1).max(64)
}).strict().superRefine((value, ctx) => {
  if (new Set(value.sourceEventIds).size !== value.sourceEventIds.length) {
    ctx.addIssue({ code: "custom", path: ["sourceEventIds"], message: "empty timeline proof event ids must be unique" });
  }
});
const payloadSchema = z.object({
  schemaVersion: z.literal("timeline-draft-summary.context.v1"),
  contextPackId: z.literal("timeline-draft-summary.v1"),
  version: z.literal(1),
  scope: scopeSchema,
  truthBoundary: z.object({
    advisoryOnly: z.literal(true),
    acceptedGraphMutationAllowed: z.literal(false),
    publicationAllowed: z.literal(false)
  }).strict(),
  items: z.array(itemSchema).max(100),
  omissions: z.array(safeTextSchema("timeline omission")).max(100),
  emptyProof: emptyProofSchema.optional()
}).strict().superRefine((value, ctx) => {
  const itemIds = value.items.map((item) => item.itemId);
  if (new Set(itemIds).size !== itemIds.length) {
    ctx.addIssue({ code: "custom", path: ["items"], message: "timeline item ids must be unique" });
  }
  if ((value.items.length === 0) !== (value.emptyProof !== undefined)) {
    ctx.addIssue({ code: "custom", path: ["emptyProof"], message: "empty timeline proof must exist exactly for a zero-item timeline" });
  }
  if (value.emptyProof !== undefined && value.omissions.length === 0) {
    ctx.addIssue({ code: "custom", path: ["omissions"], message: "empty timeline proof requires an explicit omission" });
  }
});

export const timelineDraftSummaryContextPackDescriptor = Object.freeze({
  contextPackId: "timeline-draft-summary.v1",
  version: 1,
  label: "Timeline draft summary",
  maxBytes: 65_536,
  requiredProvenanceKinds: Object.freeze(["event-id", "content-hash"]),
  redactionPolicy: "provider-safe-advisory-summary",
  sourceProjection: "agent.specialist-handoff.timeline-builder"
} satisfies ContextPackDescriptor);

const parserIdentityProperty = "cestusContextPackParserId";
const registeredRegistries = new WeakMap<object, string>();

const timelineDraftSummaryPayloadParser: ContextPackPayloadParser = (payload, ref) => {
  const parsed = payloadSchema.parse(payload);
  if (
    ref !== undefined &&
    (
      ref.contextPackId !== "timeline-draft-summary.v1" ||
      ref.version !== 1 ||
      ref.scope?.kind !== parsed.scope.kind ||
      ref.scope.id !== parsed.scope.id ||
      !sameStringSet(ref.artifactHashes ?? [], [
        ...parsed.items.map((item) => item.artifactHash),
        ...(parsed.emptyProof === undefined ? [] : [parsed.emptyProof.artifactHash])
      ]) ||
      !sameStringSet(ref.sourceEventIds ?? [], [
        ...parsed.items.flatMap((item) => item.sourceEventIds),
        ...(parsed.emptyProof?.sourceEventIds ?? [])
      ])
    )
  ) {
    throw new Error("timeline-draft-summary ref does not match its exact payload bindings");
  }
  return parsed as unknown as AgentContextPackJsonValue;
};

Object.defineProperty(timelineDraftSummaryPayloadParser, parserIdentityProperty, {
  value: "timeline-draft-summary.v1",
  enumerable: false,
  configurable: false,
  writable: false
});
registerContextPackPayloadParserAuthority(timelineDraftSummaryPayloadParser);

export function registerTimelineDraftSummaryContextPack(
  registry: ContextPackRegistry,
  rawInput: RegisterTimelineDraftSummaryContextPackInput
): void {
  const input = normalizeRegistrationInput(rawInput);
  if (registeredRegistries.has(registry) || registry.getDescriptor("timeline-draft-summary.v1") !== undefined) {
    throw new Error("timeline-draft-summary context pack is already registered");
  }
  const registrationIdentity = hashAgentContextPack({
    producerIdentity: "packages/agent/src/sourced-investigation-context-packs",
    descriptor: timelineDraftSummaryContextPackDescriptor,
    scope: input.scope,
    sourceEventIds: input.sourceEventIds,
    itemBindings: input.items.map((item) => ({
      itemId: item.itemId,
      artifactHash: item.artifactHash,
      sourceEventIds: item.sourceEventIds
    })),
    ...(input.emptyProof === undefined ? {} : { emptyProof: input.emptyProof })
  });
  registry.register({
    descriptor: timelineDraftSummaryContextPackDescriptor,
    parsePayload: timelineDraftSummaryPayloadParser,
    build: () => buildResolvedContextPack({
      contextPackId: "timeline-draft-summary.v1",
      version: 1,
      generatedAt: input.generatedAt,
      payload: timelinePayload(input),
      safeSummary: input.safeSummary,
      provenanceRefs: uniqueSorted([
        ...input.sourceEventIds,
        ...input.items.map((item) => item.artifactHash),
        ...(input.emptyProof === undefined ? [] : [input.emptyProof.artifactHash])
      ]),
      sourceEventIds: input.sourceEventIds,
      artifactHashes: uniqueSorted([
        ...input.items.map((item) => item.artifactHash),
        ...(input.emptyProof === undefined ? [] : [input.emptyProof.artifactHash])
      ]) as readonly ContentHash[],
      scope: input.scope,
      sizeBudgetBytes: timelineDraftSummaryContextPackDescriptor.maxBytes
    })
  });
  registeredRegistries.set(registry, registrationIdentity);
}

export function lookupSourcedInvestigationContextPackRegistrarEvidence(
  registry: ContextPackRegistry,
  contextPackId: string
): SourcedInvestigationContextPackRegistrarEvidence | undefined {
  const registrationIdentity = registeredRegistries.get(registry);
  const descriptor = registry.getDescriptor(contextPackId);
  if (
    contextPackId !== "timeline-draft-summary.v1" ||
    registrationIdentity === undefined ||
    descriptor === undefined ||
    hashAgentContextPack(descriptor) !== hashAgentContextPack(timelineDraftSummaryContextPackDescriptor)
  ) {
    return undefined;
  }
  return Object.freeze({
    descriptorHash: hashAgentContextPack(descriptor),
    parserIdentity: "timeline-draft-summary.v1",
    producerIdentity: "packages/agent/src/sourced-investigation-context-packs",
    registrationIdentity
  });
}

function normalizeRegistrationInput(
  input: RegisterTimelineDraftSummaryContextPackInput
): RegisterTimelineDraftSummaryContextPackInput {
  const payload = payloadSchema.parse(timelinePayload(input));
  const sourceEventIds = uniqueSorted(input.sourceEventIds);
  const emptyTimeline = payload.items.length === 0;
  if (emptyTimeline
    ? payload.emptyProof === undefined || sourceEventIds.length === 0 ||
      !sameStringSet(sourceEventIds, payload.emptyProof.sourceEventIds)
    : sourceEventIds.length === 0 ||
      !sameStringSet(sourceEventIds, payload.items.flatMap((item) => item.sourceEventIds))) {
    throw new Error("timeline-draft-summary source events must exactly match its item provenance");
  }
  return Object.freeze({
    scope: Object.freeze({ ...payload.scope }),
    generatedAt: z.string().datetime().parse(input.generatedAt),
    safeSummary: safeTextSchema("timeline context safe summary").parse(input.safeSummary),
    sourceEventIds,
    items: Object.freeze(payload.items.map((item) => Object.freeze({
      ...item,
      artifactHash: item.artifactHash as ContentHash,
      uncertaintyCategories: Object.freeze([...item.uncertaintyCategories]),
      sourceEventIds: Object.freeze([...item.sourceEventIds])
    }))),
    omissions: Object.freeze([...payload.omissions]),
    ...(payload.emptyProof === undefined ? {} : {
      emptyProof: Object.freeze({
        artifactHash: payload.emptyProof.artifactHash as ContentHash,
        sourceEventIds: Object.freeze([...payload.emptyProof.sourceEventIds])
      })
    })
  });
}

function timelinePayload(input: RegisterTimelineDraftSummaryContextPackInput): TimelineDraftSummaryPayload {
  return {
    schemaVersion: "timeline-draft-summary.context.v1",
    contextPackId: "timeline-draft-summary.v1",
    version: 1,
    scope: { ...input.scope },
    truthBoundary: {
      advisoryOnly: true,
      acceptedGraphMutationAllowed: false,
      publicationAllowed: false
    },
    items: input.items.map((item) => ({
      ...item,
      uncertaintyCategories: [...item.uncertaintyCategories],
      sourceEventIds: [...item.sourceEventIds]
    })),
    omissions: [...input.omissions],
    ...(input.emptyProof === undefined ? {} : {
      emptyProof: {
        artifactHash: input.emptyProof.artifactHash,
        sourceEventIds: [...input.emptyProof.sourceEventIds]
      }
    })
  };
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort());
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return leftSet.size === left.length && leftSet.size === rightSet.size &&
    [...leftSet].every((value) => rightSet.has(value));
}
