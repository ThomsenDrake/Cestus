import { z } from "zod";
import {
  buildResolvedContextPack,
  contextPackDescriptorSchema,
  hashAgentContextPack,
  registerContextPackPayloadParserAuthority,
  serializeContextPackPayload,
  verifyResolvedContextPack,
  type AgentContextPackJsonValue,
  type ContextPackBuilder,
  type ContextPackDescriptor,
  type ContextPackRegistry,
  type ContextPackRef,
  type ContextPackPayloadParser,
  type ResolvedContextPack
} from "./context-packs.js";
import type { PrrRequestReadModel, PrrTimelineEntry } from "../../prr/src/projection.js";
import { jurisdictionPackSchema, type JurisdictionPack } from "../../prr/src/jurisdiction-packs.js";

export interface PrrSelectedRequestScope {
  readonly kind: "prr-request";
  readonly id: string;
}

export interface PrrSelectedRequestStreamProof {
  readonly requestCreatedEventId: string;
  readonly streamHeadEventId: string;
  readonly streamHighWaterMark: number;
  readonly sourceEventIds: readonly string[];
}

export interface PrrOtherRequestsOmissionProof {
  readonly kind: "all-other-prr-requests";
  readonly reason: "out-of-scope-selected-request";
  readonly omittedCount: number;
  readonly projectionHighWaterMark: number;
}

export interface PrrWorkspaceOmissionMetadata {
  readonly totalPrrRequestCount?: number;
  readonly otherRequests?: PrrOtherRequestsOmissionProof;
}

export interface PrrContextPackHashRef {
  readonly id: string;
  readonly contentHash: `sha256:${string}`;
  readonly sourceEventId: string;
}

export interface PrrContextGateSnapshot {
  readonly gateId: string;
  readonly kind: "send" | "legal-escalation" | "governance";
  readonly ready: boolean;
  readonly locked: boolean;
  readonly checks: readonly {
    readonly id: string;
    readonly ready: boolean;
    readonly locked: boolean;
    readonly detail: string;
    readonly sourceEventIds?: readonly string[];
    readonly evidenceHashes?: readonly `sha256:${string}`[];
  }[];
}

export interface BuildPrrReadModelContextPackInput {
  readonly generatedAt: string;
  readonly policyVersion?: string;
  readonly scope: PrrSelectedRequestScope;
  readonly request: PrrRequestReadModel;
  readonly timeline: readonly PrrTimelineEntry[];
  readonly requestStream: PrrSelectedRequestStreamProof;
  readonly projectionHighWaterMark: number;
  readonly workspace?: PrrWorkspaceOmissionMetadata;
  readonly correspondenceHashes?: readonly PrrContextPackHashRef[];
  readonly evidenceHashes?: readonly PrrContextPackHashRef[];
  readonly gates: readonly PrrContextGateSnapshot[];
  readonly sizeBudgetBytes?: number;
}

export interface PrrReadModelContextPackPayload {
  readonly schemaVersion: "prr-read-model-context.v1";
  readonly scope: PrrSelectedRequestScope;
  readonly lifecycle: AgentContextPackJsonValue;
  readonly requestStream: AgentContextPackJsonValue;
  readonly deadline: AgentContextPackJsonValue;
  readonly fee: AgentContextPackJsonValue;
  readonly narrowing: AgentContextPackJsonValue;
  readonly correspondence: AgentContextPackJsonValue;
  readonly production: AgentContextPackJsonValue;
  readonly diagnostics: readonly AgentContextPackJsonValue[];
  readonly gates: readonly AgentContextPackJsonValue[];
  readonly sourceRefs: AgentContextPackJsonValue;
  readonly omissions: readonly AgentContextPackJsonValue[];
}

export interface BuildJurisdictionPackSummaryContextPackInput {
  readonly generatedAt: string;
  readonly policyVersion?: string;
  readonly scope: PrrSelectedRequestScope;
  readonly selectedRequestEventId: string;
  readonly selectedRequestJurisdictionPack: { readonly name: string; readonly version: string };
  readonly jurisdictionPack: JurisdictionPack;
  readonly jurisdictionArtifactHash: `sha256:${string}`;
  readonly projectionHighWaterMark?: number;
  readonly sizeBudgetBytes?: number;
}

export interface JurisdictionPackSummaryContextPackPayload {
  readonly schemaVersion: "jurisdiction-pack-summary-context.v1";
  readonly scope: PrrSelectedRequestScope;
  readonly selectedRequestEventId: string;
  readonly packName: string;
  readonly packVersion: string;
  readonly jurisdiction: string;
  readonly jurisdictionArtifactHash: `sha256:${string}`;
  readonly citedRules: readonly AgentContextPackJsonValue[];
  readonly advisoryPosture: AgentContextPackJsonValue;
  readonly omissions: readonly AgentContextPackJsonValue[];
}

export interface PrrContextPackRegistrationEntry {
  readonly descriptor: ContextPackDescriptor;
  readonly payloadParser: ContextPackPayloadParser;
  readonly registrationIdentity: string;
  readonly builder: Omit<ContextPackBuilder, "parsePayload">;
}

export interface RegisterPrrContextPackBuildersInput {
  readonly registry: ContextPackRegistry;
  readonly prrReadModel: PrrContextPackRegistrationEntry;
  readonly jurisdictionPackSummary: PrrContextPackRegistrationEntry;
}

interface RegisteredPrrContextPackIdentity {
  readonly descriptorHash: string;
  readonly parserId: string;
  readonly registrationIdentity: string;
}

const prrContextPackRegistrations = new WeakMap<ContextPackRegistry, Map<string, RegisteredPrrContextPackIdentity>>();
const parserIdentityProperty = "cestusContextPackParserId";
const prrReadModelContextPackId = "prr-read-model.v1";
const jurisdictionPackSummaryContextPackId = "jurisdiction-pack-summary.v1";

const hashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const eventIdSchema = z.string().regex(/^evt_[A-Za-z0-9_-]+$/);
const scopeSchema = z.object({ kind: z.literal("prr-request"), id: z.string().min(1) }).strict();
const hashRefSchema = z.object({
  id: z.string().min(1),
  contentHash: hashSchema,
  sourceEventId: eventIdSchema
}).strict();
const citedRuleSchema = z.object({
  label: z.string(),
  citation: z.string(),
  jurisdictionPack: z.object({ name: z.string(), version: z.string() }).strict()
}).strict();
const gateCheckSchema = z.object({
  id: z.string().min(1),
  ready: z.boolean(),
  locked: z.boolean(),
  detail: z.string().min(1),
  sourceEventIds: z.array(eventIdSchema).optional(),
  evidenceHashes: z.array(hashSchema).optional()
}).strict();
const gateSchema = z.object({
  gateId: z.string().min(1),
  kind: z.enum(["send", "legal-escalation", "governance"]),
  ready: z.boolean(),
  locked: z.boolean(),
  checks: z.array(gateCheckSchema)
}).strict();
const payloadSchema = z.object({
  schemaVersion: z.literal("prr-read-model-context.v1"),
  scope: scopeSchema,
  lifecycle: z.object({
    status: z.string().min(1),
    agencyName: z.string().min(1),
    jurisdictionPack: z.object({ name: z.string().min(1), version: z.string().min(1) }).strict()
  }).strict(),
  requestStream: z.object({
    requestCreatedEventId: eventIdSchema,
    streamHeadEventId: eventIdSchema,
    streamHighWaterMark: z.number().int().nonnegative(),
    sourceEventIds: z.array(eventIdSchema).min(1)
  }).strict(),
  deadline: z.object({
    deadlineDate: z.string().min(1), source: z.enum(["estimated", "confirmed"]),
    confidence: z.string().optional(), explanation: z.string().optional(),
    confirmedBy: z.string().optional(), rationale: z.string().optional(),
    citedRules: z.array(citedRuleSchema).min(1)
  }).strict().nullable(),
  fee: z.object({ amountCents: z.number().int(), currency: z.string(), challenged: z.boolean() }).strict().nullable(),
  narrowing: z.object({ narrowingId: z.string(), proposedScope: z.string(), proposedBy: z.string(), acceptedScope: z.string().optional(), acceptedBy: z.string().optional() }).strict().nullable(),
  correspondence: z.object({ outbound: z.array(z.object({ correspondenceId: z.string(), subject: z.string(), occurredAt: z.string(), bodyHash: hashSchema.optional(), evidenceIds: z.array(z.string()), attachmentEvidenceIds: z.array(z.string()), approvedBy: z.string().optional() }).strict()), inbound: z.array(z.object({ correspondenceId: z.string(), subject: z.string(), occurredAt: z.string(), bodyHash: hashSchema.optional(), evidenceIds: z.array(z.string()), attachmentEvidenceIds: z.array(z.string()), approvedBy: z.string().optional() }).strict()) }).strict(),
  production: z.object({ batches: z.array(z.object({ productionId: z.string(), label: z.string(), receivedAt: z.string(), evidenceIds: z.array(z.string()) }).strict()), evidenceIds: z.array(z.string()), exemptions: z.array(z.object({ exemptionId: z.string(), claimedBy: z.string(), citedRules: z.array(citedRuleSchema).min(1) }).strict()), denial: z.object({ denialId: z.string(), receivedAt: z.string(), reason: z.string() }).strict().nullable(), appeal: z.object({ appealId: z.string(), correspondenceId: z.string(), filedAt: z.string(), approvedBy: z.string() }).strict().nullable(), stalling: z.object({ possible: z.boolean(), confirmed: z.boolean(), signals: z.array(z.object({ kind: z.string(), explanation: z.string() }).strict()) }).strict(), escalation: z.object({ confirmedBy: z.string(), rationale: z.string(), citedRules: z.array(citedRuleSchema).min(1), evidenceIds: z.array(z.string()) }).strict().nullable() }).strict(),
  diagnostics: z.array(z.object({ eventId: eventIdSchema, type: z.string(), occurredAt: z.string() }).strict()),
  gates: z.array(gateSchema),
  sourceRefs: z.object({ correspondence: z.array(hashRefSchema), evidence: z.array(hashRefSchema) }).strict(),
  omissions: z.array(z.object({ kind: z.literal("all-other-prr-requests"), reason: z.literal("out-of-scope-selected-request"), omittedCount: z.number().int().positive(), projectionHighWaterMark: z.number().int().nonnegative() }).strict())
}).strict();

const jurisdictionRuleCategoryOrder = ["deadline", "fee", "exemption", "appeal", "enforcement"] as const;
const jurisdictionRuleKindSchema = z.enum(jurisdictionRuleCategoryOrder);
const jurisdictionCitationSchema = z.object({
  label: z.string().min(1),
  citation: z.string().min(1),
  url: z.string().url()
}).strict();
const jurisdictionSummaryRuleSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: jurisdictionRuleKindSchema,
  description: z.string().min(1),
  citations: z.array(jurisdictionCitationSchema).min(1),
  agentWarning: z.string().min(1)
}).strict();
const jurisdictionOmissionSchema = z.object({
  kind: z.literal("jurisdiction-rule-category"),
  reason: z.literal("absent-from-selected-pack"),
  category: jurisdictionRuleKindSchema
}).strict();
const jurisdictionSummaryPayloadSchema = z.object({
  schemaVersion: z.literal("jurisdiction-pack-summary-context.v1"),
  scope: scopeSchema,
  selectedRequestEventId: eventIdSchema,
  packName: z.string().min(1),
  packVersion: z.string().min(1),
  jurisdiction: z.string().min(1),
  jurisdictionArtifactHash: hashSchema,
  citedRules: z.array(jurisdictionSummaryRuleSchema).min(1),
  advisoryPosture: z.object({
    kind: z.literal("advisory-only"),
    jurisdictionArtifactHash: hashSchema,
    ruleIds: z.array(z.string().min(1)).min(1),
    note: z.literal("Cited rule summaries are advisory workflow guidance only.")
  }).strict(),
  omissions: z.array(jurisdictionOmissionSchema)
}).strict();

export const prrReadModelPayloadParser = withContextPackParserIdentity("prr-read-model.v1", (payload, ref) => {
  const parsed = payloadSchema.parse(payload);
  if (ref !== undefined && (ref.contextPackId !== "prr-read-model.v1" || ref.version !== 1 || ref.scope?.kind !== "prr-request" || ref.scope.id !== parsed.scope.id)) {
    throw new Error("invalid prr-read-model payload ref");
  }
  assertPayloadProvenanceBindings(parsed, ref);
  return parsed as unknown as AgentContextPackJsonValue;
});

export const jurisdictionPackSummaryPayloadParser = withContextPackParserIdentity("jurisdiction-pack-summary.v1", (payload, ref) => {
  const parsed = jurisdictionSummaryPayloadSchema.parse(payload);
  const expectedPackRef = `${parsed.packName}@${parsed.packVersion}`;
  const expectedRuleRefs = parsed.citedRules.map((rule) =>
    `jurisdiction-rule:${expectedPackRef}:${rule.id}`
  ).sort();
  const ruleIds = parsed.citedRules.map((rule) => rule.id);

  if (new Set(ruleIds).size !== ruleIds.length || !isJurisdictionRuleOrder(parsed.citedRules)) {
    throw new Error("invalid jurisdiction-pack-summary rule ordering or IDs");
  }
  if (!sameStringSet(parsed.advisoryPosture.ruleIds, ruleIds) ||
    parsed.advisoryPosture.jurisdictionArtifactHash !== parsed.jurisdictionArtifactHash) {
    throw new Error("invalid jurisdiction-pack-summary advisory binding");
  }
  if (!hasExpectedJurisdictionOmissions(parsed.citedRules, parsed.omissions)) {
    throw new Error("invalid jurisdiction-pack-summary omissions");
  }
  if (ref !== undefined) {
    if (ref.contextPackId !== "jurisdiction-pack-summary.v1" || ref.version !== 1 ||
      ref.scope?.kind !== "prr-request" || ref.scope.id !== parsed.scope.id) {
      throw new Error("invalid jurisdiction-pack-summary payload ref");
    }
    if (!sameStringSet(ref.sourceEventIds, [parsed.selectedRequestEventId]) ||
      !sameStringSet(ref.artifactHashes, [parsed.jurisdictionArtifactHash]) ||
      !sameStringSet(ref.provenanceRefs, [parsed.selectedRequestEventId, parsed.jurisdictionArtifactHash, ...expectedRuleRefs])) {
      throw new Error("invalid jurisdiction-pack-summary provenance binding");
    }
    const expectedStalenessInputs = [
      { kind: "jurisdiction-pack-artifact-hash", ref: expectedPackRef, value: parsed.jurisdictionArtifactHash },
      { kind: "selected-request-jurisdiction-pack", ref: parsed.scope.id, value: expectedPackRef }
    ];
    if (!sameStalenessInputs(ref.stalenessInputs, expectedStalenessInputs)) {
      throw new Error("invalid jurisdiction-pack-summary staleness binding");
    }
  }
  return parsed as unknown as AgentContextPackJsonValue;
});

export function registerPrrContextPackBuilders(input: RegisterPrrContextPackBuildersInput): void {
  if (typeof (input.registry as unknown as { readonly buildResolved?: unknown }).buildResolved !== "function") {
    throw new Error("schema-conflict: context pack registry must expose buildResolved(contextPackId)");
  }

  const registrations = prrContextPackRegistrations.get(input.registry) ?? new Map<string, RegisteredPrrContextPackIdentity>();
  prrContextPackRegistrations.set(input.registry, registrations);
  registerPrrContextPackBuilder(input.registry, registrations, input.prrReadModel, prrReadModelContextPackId);
  registerPrrContextPackBuilder(
    input.registry,
    registrations,
    input.jurisdictionPackSummary,
    jurisdictionPackSummaryContextPackId
  );
}

function registerPrrContextPackBuilder(
  registry: ContextPackRegistry,
  registrations: Map<string, RegisteredPrrContextPackIdentity>,
  entry: PrrContextPackRegistrationEntry,
  expectedContextPackId: string
): void {
  const descriptor = contextPackDescriptorSchema.parse(entry.descriptor);
  if (descriptor.contextPackId !== expectedContextPackId || descriptor.version !== 1) {
    throw new Error(`schema-conflict: expected ${expectedContextPackId}@1 registration`);
  }
  const descriptorHash = canonicalDescriptorHash(descriptor);
  if (canonicalDescriptorHash(contextPackDescriptorSchema.parse(entry.builder.descriptor)) !== descriptorHash) {
    throw new Error(`schema-conflict: builder descriptor does not match ${descriptor.contextPackId}`);
  }
  const key = `${descriptor.contextPackId}@${descriptor.version}`;
  const identity = Object.freeze({
    descriptorHash,
    parserId: contextPackParserIdentity(entry.payloadParser),
    registrationIdentity: requireRegistrationIdentity(entry.registrationIdentity)
  });
  const prior = registrations.get(key);
  if (prior !== undefined) {
    if (sameRegistrationIdentity(prior, identity)) {
      return;
    }
    throw new Error(`context pack registration conflict for ${key}`);
  }
  if (registry.getDescriptor(descriptor.contextPackId) !== undefined) {
    throw new Error(`context pack registration conflict for ${key}: registry already has no stable helper identity`);
  }

  registry.register({
    descriptor,
    parsePayload: entry.payloadParser,
    build: entry.builder.build.bind(entry.builder)
  });
  registrations.set(key, identity);
}

function canonicalDescriptorHash(descriptor: ContextPackDescriptor): string {
  return hashAgentContextPack({
    contextPackId: descriptor.contextPackId,
    version: descriptor.version,
    label: descriptor.label,
    maxBytes: descriptor.maxBytes,
    requiredProvenanceKinds: [...descriptor.requiredProvenanceKinds].sort(),
    redactionPolicy: descriptor.redactionPolicy,
    sourceProjection: descriptor.sourceProjection
  });
}

function contextPackParserIdentity(parser: ContextPackPayloadParser): string {
  const metadata = Object.getOwnPropertyDescriptor(parser, parserIdentityProperty);
  if (metadata === undefined || !("value" in metadata) || typeof metadata.value !== "string" || metadata.value.length === 0) {
    throw new Error("schema-conflict: context pack payload parser requires stable own identity metadata");
  }
  return metadata.value;
}

function requireRegistrationIdentity(value: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("schema-conflict: context pack registration requires a stable identity");
  }
  return value;
}

function sameRegistrationIdentity(
  left: RegisteredPrrContextPackIdentity,
  right: RegisteredPrrContextPackIdentity
): boolean {
  return left.descriptorHash === right.descriptorHash &&
    left.parserId === right.parserId &&
    left.registrationIdentity === right.registrationIdentity;
}

function withContextPackParserIdentity(
  parserId: string,
  parser: ContextPackPayloadParser
): ContextPackPayloadParser {
  Object.defineProperty(parser, parserIdentityProperty, {
    value: parserId,
    enumerable: false,
    writable: false,
    configurable: false
  });
  registerContextPackPayloadParserAuthority(parser);
  return parser;
}

export function buildJurisdictionPackSummaryContextPack(
  input: BuildJurisdictionPackSummaryContextPackInput
): ResolvedContextPack {
  assertOwnKeys(input, ["generatedAt", "policyVersion", "scope", "selectedRequestEventId", "selectedRequestJurisdictionPack", "jurisdictionPack", "jurisdictionArtifactHash", "projectionHighWaterMark", "sizeBudgetBytes"], "jurisdiction context pack input");
  const scope = scopeSchema.parse(input.scope);
  const selectedRequestEventId = eventIdSchema.parse(input.selectedRequestEventId);
  const selectedPack = z.object({ name: z.string().min(1), version: z.string().min(1) }).strict()
    .parse(input.selectedRequestJurisdictionPack);
  if (typeof input.jurisdictionArtifactHash !== "string" || !hashSchema.safeParse(input.jurisdictionArtifactHash).success) {
    throw new Error("missing-provenance: jurisdiction artifact hash is required");
  }
  const jurisdictionPack = jurisdictionPackSchema.parse(input.jurisdictionPack);
  if (selectedPack.name !== jurisdictionPack.name || selectedPack.version !== jurisdictionPack.version) {
    throw new Error("selected request jurisdiction pack must match supplied jurisdiction pack");
  }
  const payload = buildJurisdictionPackSummaryPayload(scope, selectedRequestEventId, jurisdictionPack, input.jurisdictionArtifactHash);
  if (input.sizeBudgetBytes !== undefined && serializeContextPackPayload(payload).byteLength > input.sizeBudgetBytes) {
    throw new Error("context-budget-exceeded: jurisdiction summary payload exceeds size budget");
  }
  const packRef = `${jurisdictionPack.name}@${jurisdictionPack.version}`;
  const ruleRefs = payload.citedRules.map((rule) =>
    `jurisdiction-rule:${packRef}:${(rule as { readonly id: string }).id}`
  );
  const resolved = buildResolvedContextPack({
    contextPackId: "jurisdiction-pack-summary.v1",
    version: 1,
    generatedAt: input.generatedAt,
    payload,
    safeSummary: `Advisory jurisdiction summary for ${jurisdictionPack.jurisdiction}.`,
    provenanceRefs: [selectedRequestEventId, input.jurisdictionArtifactHash, ...ruleRefs].sort(),
    sourceEventIds: [selectedRequestEventId],
    artifactHashes: [input.jurisdictionArtifactHash],
    ...(input.projectionHighWaterMark === undefined ? {} : { projectionHighWaterMark: input.projectionHighWaterMark }),
    ...(input.policyVersion === undefined ? {} : { policyVersion: input.policyVersion }),
    scope,
    ...(input.sizeBudgetBytes === undefined ? {} : { sizeBudgetBytes: input.sizeBudgetBytes }),
    stalenessInputs: [
      { kind: "jurisdiction-pack-artifact-hash", ref: packRef, value: input.jurisdictionArtifactHash },
      { kind: "selected-request-jurisdiction-pack", ref: scope.id, value: packRef }
    ]
  });
  return verifyResolvedContextPack(resolved, jurisdictionPackSummaryPayloadParser);
}

function buildJurisdictionPackSummaryPayload(
  scope: PrrSelectedRequestScope,
  selectedRequestEventId: string,
  jurisdictionPack: JurisdictionPack,
  jurisdictionArtifactHash: `sha256:${string}`
): JurisdictionPackSummaryContextPackPayload {
  const citedRules = [...jurisdictionPack.rules].map((rule) => {
    if (rule.citations.length === 0) throw new Error("jurisdiction rule citation is required");
    return {
      id: rule.id,
      label: rule.label,
      kind: rule.kind,
      description: rule.description,
      citations: [...rule.citations].sort(byJson),
      agentWarning: rule.agentWarning
    };
  }).sort(compareJurisdictionRules);
  const ruleIds = citedRules.map((rule) => rule.id);
  const includedCategories = new Set(citedRules.map((rule) => rule.kind));
  return {
    schemaVersion: "jurisdiction-pack-summary-context.v1",
    scope,
    selectedRequestEventId,
    packName: jurisdictionPack.name,
    packVersion: jurisdictionPack.version,
    jurisdiction: jurisdictionPack.jurisdiction,
    jurisdictionArtifactHash,
    citedRules,
    advisoryPosture: {
      kind: "advisory-only",
      jurisdictionArtifactHash,
      ruleIds,
      note: "Cited rule summaries are advisory workflow guidance only."
    },
    omissions: jurisdictionRuleCategoryOrder.filter((category) => !includedCategories.has(category)).map((category) => ({
      kind: "jurisdiction-rule-category" as const,
      reason: "absent-from-selected-pack" as const,
      category
    }))
  };
}

function compareJurisdictionRules(
  left: { readonly kind: string; readonly id: string },
  right: { readonly kind: string; readonly id: string }
): number {
  return jurisdictionRuleCategoryOrder.indexOf(left.kind as typeof jurisdictionRuleCategoryOrder[number]) -
    jurisdictionRuleCategoryOrder.indexOf(right.kind as typeof jurisdictionRuleCategoryOrder[number]) ||
    left.id.localeCompare(right.id);
}

function isJurisdictionRuleOrder(rules: readonly { readonly kind: string; readonly id: string }[]): boolean {
  return rules.every((rule, index) => index === 0 || compareJurisdictionRules(rules[index - 1]!, rule) < 0);
}

function hasExpectedJurisdictionOmissions(
  rules: readonly { readonly kind: string }[],
  omissions: readonly { readonly kind: string; readonly reason: string; readonly category: string }[]
): boolean {
  const categories = new Set(rules.map((rule) => rule.kind));
  const expected = jurisdictionRuleCategoryOrder.filter((category) => !categories.has(category));
  return omissions.length === expected.length && omissions.every((omission, index) =>
    omission.kind === "jurisdiction-rule-category" && omission.reason === "absent-from-selected-pack" && omission.category === expected[index]
  );
}

function assertPayloadProvenanceBindings(
  payload: z.infer<typeof payloadSchema>,
  ref: ContextPackRef | undefined
): void {
  const sourceEventIds = new Set(payload.requestStream.sourceEventIds);
  if (sourceEventIds.size !== payload.requestStream.sourceEventIds.length) {
    throw new Error("duplicate selected request stream source event IDs");
  }
  const assertSelectedSourceEvent = (eventId: string): void => {
    if (!sourceEventIds.has(eventId)) throw new Error("unrelated selected request provenance event");
  };
  for (const diagnostic of payload.diagnostics) assertSelectedSourceEvent(diagnostic.eventId);
  for (const sourceRef of [...payload.sourceRefs.correspondence, ...payload.sourceRefs.evidence]) {
    assertSelectedSourceEvent(sourceRef.sourceEventId);
  }
  for (const gate of payload.gates) for (const check of gate.checks) {
    for (const eventId of check.sourceEventIds ?? []) assertSelectedSourceEvent(eventId);
  }

  const correspondenceIds = [...payload.correspondence.outbound, ...payload.correspondence.inbound]
    .map((correspondence) => correspondence.correspondenceId);
  for (const sourceRef of payload.sourceRefs.correspondence) {
    if (!correspondenceIds.some((id) => sourceRef.id === id || sourceRef.id.startsWith(`${id}_`))) {
      throw new Error("unrelated correspondence reference");
    }
  }
  for (const correspondence of [...payload.correspondence.outbound, ...payload.correspondence.inbound]) {
    if (correspondence.bodyHash !== undefined && !payload.sourceRefs.correspondence.some((sourceRef) =>
      sourceRef.contentHash === correspondence.bodyHash && (sourceRef.id === correspondence.correspondenceId || sourceRef.id.startsWith(`${correspondence.correspondenceId}_`))
    )) {
      throw new Error("unbound correspondence body hash");
    }
  }
  const evidenceIds = new Set([
    ...payload.correspondence.outbound.flatMap((correspondence) => [...correspondence.evidenceIds, ...correspondence.attachmentEvidenceIds]),
    ...payload.correspondence.inbound.flatMap((correspondence) => [...correspondence.evidenceIds, ...correspondence.attachmentEvidenceIds]),
    ...payload.production.evidenceIds,
    ...payload.production.batches.flatMap((batch) => batch.evidenceIds),
    ...(payload.production.escalation?.evidenceIds ?? [])
  ]);
  for (const sourceRef of payload.sourceRefs.evidence) {
    if (!evidenceIds.has(sourceRef.id)) throw new Error("unrelated evidence reference");
  }
  for (const evidenceId of evidenceIds) {
    if (!payload.sourceRefs.evidence.some((sourceRef) => sourceRef.id === evidenceId)) {
      throw new Error("unbound evidence reference");
    }
  }
  const evidenceHashes = new Set(payload.sourceRefs.evidence.map((sourceRef) => sourceRef.contentHash));
  for (const gate of payload.gates) for (const check of gate.checks) {
    for (const evidenceHash of check.evidenceHashes ?? []) {
      if (!evidenceHashes.has(evidenceHash)) throw new Error("unbound gate evidence hash");
    }
  }

  if (ref !== undefined) {
    if (!sameStringSet(ref.sourceEventIds, payload.requestStream.sourceEventIds)) {
      throw new Error("resolved context pack source-event provenance mismatch");
    }
    const expectedProvenanceRefs = trustedPrrProvenanceRefs(
      payload.requestStream.sourceEventIds,
      payload.sourceRefs.correspondence,
      payload.sourceRefs.evidence,
      [...payload.correspondence.outbound, ...payload.correspondence.inbound]
    );
    if (!sameStringSet(ref.provenanceRefs, expectedProvenanceRefs)) {
      throw new Error("resolved context pack source-ref provenance mismatch");
    }
    const artifactHashes = [...payload.sourceRefs.correspondence, ...payload.sourceRefs.evidence]
      .map((sourceRef) => sourceRef.contentHash);
    if (!sameStringSet(ref.artifactHashes, artifactHashes)) {
      throw new Error("resolved context pack artifact provenance mismatch");
    }
  }
}

function sameStringSet(left: readonly string[] | undefined, right: readonly string[]): boolean {
  return left !== undefined && left.length === new Set(left).size && left.length === right.length && left.every((value) => right.includes(value));
}

function sameStalenessInputs(
  left: ContextPackRef["stalenessInputs"],
  right: readonly { readonly kind: string; readonly ref: string; readonly value: string }[]
): boolean {
  return left !== undefined && left.length === right.length && left.every((input, index) =>
    input.kind === right[index]!.kind && input.ref === right[index]!.ref && input.value === right[index]!.value
  );
}

function trustedPrrProvenanceRefs(
  sourceEventIds: readonly string[],
  correspondenceRefs: readonly { readonly id: string; readonly contentHash: string; readonly sourceEventId: string }[],
  evidenceRefs: readonly { readonly id: string; readonly contentHash: string; readonly sourceEventId: string }[],
  correspondences: readonly { readonly correspondenceId: string; readonly bodyHash?: string | undefined }[]
): readonly string[] {
  return [...new Set([
    ...sourceEventIds,
    ...correspondenceRefs.map((ref) => ref.contentHash),
    ...evidenceRefs.map((ref) => ref.contentHash),
    ...correspondenceRefs.map((ref) => canonicalSourceRefProvenance("correspondence", ref)),
    ...evidenceRefs.map((ref) => canonicalSourceRefProvenance("evidence", ref)),
    ...correspondences.flatMap((correspondence) => correspondence.bodyHash === undefined ? [] : [
      JSON.stringify(["prr-context-correspondence-body.v1", correspondence.correspondenceId, correspondence.bodyHash])
    ])
  ])].sort();
}

function canonicalSourceRefProvenance(
  kind: "correspondence" | "evidence",
  ref: { readonly id: string; readonly contentHash: string; readonly sourceEventId: string }
): string {
  return JSON.stringify(["prr-context-source-ref.v1", kind, ref.id, ref.contentHash, ref.sourceEventId]);
}

export function buildPrrReadModelContextPack(input: BuildPrrReadModelContextPackInput): ResolvedContextPack {
  assertOwnKeys(input, ["generatedAt", "policyVersion", "scope", "request", "timeline", "requestStream", "projectionHighWaterMark", "workspace", "correspondenceHashes", "evidenceHashes", "gates", "sizeBudgetBytes"], "input");
  if (input.scope.kind !== "prr-request" || input.scope.id !== input.request.prrRequestId) {
    throw new Error("selected PRR context pack requires a matching prr-request scope");
  }
  assertOwnKeys(input.workspace, ["totalPrrRequestCount", "otherRequests"], "workspace");
  assertNoRawProviderMetadata(input.request);

  const stream = normalizeStream(input.requestStream, input.timeline, input.scope.id);
  const workspace = normalizeWorkspace(input.workspace, input.projectionHighWaterMark);
  const correspondence = normalizeHashRefs(input.correspondenceHashes ?? [], stream.sourceEventIds, "correspondence");
  const evidence = normalizeHashRefs(input.evidenceHashes ?? [], stream.sourceEventIds, "evidence");
  const gates = normalizeGates(input.gates, stream.sourceEventIds, evidence.map((ref) => ref.contentHash));
  const payload = buildPayload(input, stream, correspondence, evidence, gates, workspace);
  const provenanceRefs = trustedPrrProvenanceRefs(
    stream.sourceEventIds,
    correspondence,
    evidence,
    [
      ...(input.request.latestOutboundCorrespondence === undefined ? [] : [input.request.latestOutboundCorrespondence]),
      ...(input.request.latestInboundCorrespondence === undefined ? [] : [input.request.latestInboundCorrespondence])
    ]
  );
  const budget = input.sizeBudgetBytes;
  if (budget !== undefined && serializeContextPackPayload(buildGateOnlyPayload(payload)).byteLength > budget) {
    throw new Error("context-budget-exceeded: non-truncatable gates exceed size budget");
  }
  if (budget !== undefined && serializeContextPackPayload(payload).byteLength > budget) {
    throw new Error("context-budget-exceeded: selected PRR payload exceeds size budget");
  }

  const artifactHashes = [...new Set([...correspondence, ...evidence].map((ref) => ref.contentHash))].sort();
  const resolved = buildResolvedContextPack({
    contextPackId: "prr-read-model.v1",
    version: 1,
    generatedAt: input.generatedAt,
    payload,
    safeSummary: `Selected PRR ${input.scope.id} status ${input.request.status}.`,
    provenanceRefs,
    sourceEventIds: stream.sourceEventIds,
    artifactHashes,
    projectionHighWaterMark: input.projectionHighWaterMark,
    ...(input.policyVersion === undefined ? {} : { policyVersion: input.policyVersion }),
    scope: input.scope,
    ...(budget === undefined ? {} : { sizeBudgetBytes: budget }),
    stalenessInputs: [
      { kind: "prr-request-stream-head", ref: input.scope.id, value: stream.streamHeadEventId },
      { kind: "prr-request-stream-high-water-mark", ref: input.scope.id, value: String(stream.streamHighWaterMark) },
      { kind: "prr-projection-high-water-mark", ref: "prr.projection", value: String(input.projectionHighWaterMark) }
    ]
  });
  return verifyResolvedContextPack(resolved, prrReadModelPayloadParser);
}

function buildPayload(input: BuildPrrReadModelContextPackInput, stream: PrrSelectedRequestStreamProof, correspondence: readonly PrrContextPackHashRef[], evidence: readonly PrrContextPackHashRef[], gates: readonly PrrContextGateSnapshot[], omissions: readonly PrrOtherRequestsOmissionProof[]): PrrReadModelContextPackPayload {
  const request = input.request;
  return {
    schemaVersion: "prr-read-model-context.v1",
    scope: input.scope,
    lifecycle: { status: request.status, agencyName: request.agencyName, jurisdictionPack: request.jurisdictionPack },
    requestStream: stream,
    gates,
    deadline: request.activeDeadline === undefined ? null : { ...request.activeDeadline, citedRules: request.activeDeadline.citedRules.map(safeRule) },
    fee: request.feeEstimate === undefined ? null : { amountCents: request.feeEstimate.amountCents, currency: request.feeEstimate.currency, challenged: request.feeEstimate.challenged },
    narrowing: request.scopeNarrowing === undefined ? null : pick(request.scopeNarrowing, ["narrowingId", "proposedScope", "proposedBy", "acceptedScope", "acceptedBy"]),
    correspondence: { outbound: request.latestOutboundCorrespondence === undefined ? [] : [safeCorrespondence(request.latestOutboundCorrespondence)], inbound: request.latestInboundCorrespondence === undefined ? [] : [safeCorrespondence(request.latestInboundCorrespondence)] },
    production: { batches: request.productionBatches.map((batch) => ({ ...batch, evidenceIds: [...batch.evidenceIds].sort() })), evidenceIds: [...request.productionEvidenceIds].sort(), exemptions: request.exemptions.map((item) => ({ exemptionId: item.exemptionId, claimedBy: item.claimedBy, citedRules: item.citedRules.map(safeRule) })), denial: request.denial === undefined ? null : pick(request.denial, ["denialId", "receivedAt", "reason"]), appeal: request.appeal === undefined ? null : pick(request.appeal, ["appealId", "correspondenceId", "filedAt", "approvedBy"]), stalling: { possible: request.possibleStalling, confirmed: request.confirmedStalling, signals: request.stallingSignals.map((signal) => ({ ...signal })) }, escalation: request.legalEscalation === undefined ? null : { confirmedBy: request.legalEscalation.confirmedBy, rationale: request.legalEscalation.rationale, citedRules: request.legalEscalation.citedRules.map(safeRule), evidenceIds: [...request.legalEscalation.evidenceIds].sort() } },
    diagnostics: input.timeline.map((entry) => ({ eventId: entry.eventId, type: entry.type, occurredAt: entry.occurredAt })).sort(byJson),
    sourceRefs: { correspondence, evidence },
    omissions
  } as unknown as PrrReadModelContextPackPayload;
}

function normalizeStream(stream: PrrSelectedRequestStreamProof, timeline: readonly PrrTimelineEntry[], requestId: string): PrrSelectedRequestStreamProof {
  assertOwnKeys(stream, ["requestCreatedEventId", "streamHeadEventId", "streamHighWaterMark", "sourceEventIds"], "request stream");
  const sourceEventIds = [...new Set(stream.sourceEventIds)].sort();
  if (!sourceEventIds.length || !sourceEventIds.includes(stream.requestCreatedEventId) || !sourceEventIds.includes(stream.streamHeadEventId) || !Number.isInteger(stream.streamHighWaterMark) || stream.streamHighWaterMark < 0) throw new Error("missing-provenance: invalid selected request stream proof");
  const timelineIds = timeline.map((entry) => {
    const payload = entry.payload as Record<string, unknown>;
    if (!payload || payload.prrRequestId !== requestId) throw new Error("unrelated PRR request timeline entry");
    return entry.eventId;
  }).sort();
  if (JSON.stringify(timelineIds) !== JSON.stringify(sourceEventIds)) throw new Error("missing-provenance: source event IDs must exactly match selected request timeline");
  return { requestCreatedEventId: stream.requestCreatedEventId, streamHeadEventId: stream.streamHeadEventId, streamHighWaterMark: stream.streamHighWaterMark, sourceEventIds };
}

function normalizeWorkspace(workspace: PrrWorkspaceOmissionMetadata | undefined, projectionHighWaterMark: number): readonly PrrOtherRequestsOmissionProof[] {
  const total = workspace?.totalPrrRequestCount ?? 1;
  if (!Number.isInteger(total) || total < 1) throw new Error("invalid PRR request count");
  if (total === 1) return [];
  const proof = workspace?.otherRequests;
  if (!proof || proof.kind !== "all-other-prr-requests" || proof.reason !== "out-of-scope-selected-request" || proof.omittedCount !== total - 1 || proof.projectionHighWaterMark !== projectionHighWaterMark) throw new Error("missing-provenance: other PRR requests require aggregate omission proof");
  return [{ ...proof }];
}

function normalizeHashRefs(refs: readonly PrrContextPackHashRef[], sourceEventIds: readonly string[], label: string): readonly PrrContextPackHashRef[] {
  return refs.map((ref) => {
    const parsed = hashRefSchema.parse(ref);
    if (!sourceEventIds.includes(parsed.sourceEventId)) throw new Error(`unrelated ${label} source event`);
    return {
      id: parsed.id,
      contentHash: parsed.contentHash as `sha256:${string}`,
      sourceEventId: parsed.sourceEventId
    };
  }).sort(byJson);
}

function normalizeGates(
  gates: readonly PrrContextGateSnapshot[],
  sourceEventIds: readonly string[],
  evidenceHashes: readonly string[]
): readonly PrrContextGateSnapshot[] {
  return gates.map((gate) => {
    const parsed = gateSchema.parse(gate);
    for (const check of parsed.checks) {
      for (const eventId of check.sourceEventIds ?? []) if (!sourceEventIds.includes(eventId)) throw new Error("unrelated gate source event");
      for (const evidenceHash of check.evidenceHashes ?? []) if (!evidenceHashes.includes(evidenceHash)) throw new Error("unbound gate evidence hash");
    }
    return {
      gateId: parsed.gateId,
      kind: parsed.kind,
      ready: parsed.ready,
      locked: parsed.locked,
      checks: parsed.checks.map((check) => ({
        id: check.id,
        ready: check.ready,
        locked: check.locked,
        detail: check.detail,
        ...(check.sourceEventIds === undefined ? {} : { sourceEventIds: check.sourceEventIds }),
        ...(check.evidenceHashes === undefined ? {} : { evidenceHashes: check.evidenceHashes as readonly `sha256:${string}`[] })
      })).sort(byJson)
    };
  }).sort(byJson);
}

function safeCorrespondence(value: NonNullable<PrrRequestReadModel["latestOutboundCorrespondence"]>): AgentContextPackJsonValue {
  return { correspondenceId: value.correspondenceId, subject: value.subject, occurredAt: value.occurredAt, ...(value.bodyHash === undefined ? {} : { bodyHash: value.bodyHash }), evidenceIds: [...value.evidenceIds].sort(), attachmentEvidenceIds: [...(value.attachmentEvidenceIds ?? [])].sort(), ...(value.approvedBy === undefined ? {} : { approvedBy: value.approvedBy }) };
}

function safeRule(rule: { readonly label: string; readonly citation: string; readonly jurisdictionPack: { readonly name: string; readonly version: string } }): AgentContextPackJsonValue {
  return { label: rule.label, citation: rule.citation, jurisdictionPack: rule.jurisdictionPack };
}

function assertNoRawProviderMetadata(request: PrrRequestReadModel): void {
  for (const correspondence of [request.latestOutboundCorrespondence, request.latestInboundCorrespondence]) if (correspondence?.rawMetadata !== undefined) throw new Error("raw metadata or provider references are not allowed in PRR context packs");
}

function assertOwnKeys(value: unknown, allowed: readonly string[], label: string): void {
  if (value === undefined) return;
  if (typeof value !== "object" || value === null || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error(`invalid ${label}`);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`unsupported or unrelated ${label} field: ${key}`);
}

function buildGateOnlyPayload(payload: PrrReadModelContextPackPayload): PrrReadModelContextPackPayload {
  return { ...payload, deadline: null, fee: null, narrowing: null, correspondence: { outbound: [], inbound: [] }, production: { batches: [], evidenceIds: [], exemptions: [], denial: null, appeal: null, stalling: { possible: false, confirmed: false, signals: [] }, escalation: null }, diagnostics: [], sourceRefs: { correspondence: [], evidence: [] }, omissions: [] } as unknown as PrrReadModelContextPackPayload;
}

function pick<T extends object, K extends keyof T>(value: T, keys: readonly K[]): Pick<T, K> {
  return Object.fromEntries(keys.filter((key) => value[key] !== undefined).map((key) => [key, value[key]])) as Pick<T, K>;
}

function byJson<T>(left: T, right: T): number {
  const leftJson = JSON.stringify(left);
  const rightJson = JSON.stringify(right);
  return leftJson < rightJson ? -1 : leftJson > rightJson ? 1 : 0;
}
