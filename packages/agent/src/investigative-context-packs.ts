import {
  buildResolvedContextPack,
  hashAgentContextPack,
  registerContextPackPayloadParserAuthority,
  type AgentContextPackJsonValue,
  type ContextPackDescriptor,
  type ContextPackPayloadParser,
  type ContextPackRef,
  type ContextPackRegistry,
  type ResolvedContextPack
} from "./context-packs.js";
import { assertAgentSecretSafeText } from "./secret-safety.js";

export type InvestigativeContextPackId =
  | "evidence-summary.v1"
  | "accepted-graph-projection.v1"
  | "governance-locks.v1";

export type InvestigativeContextPackFailureCode =
  | "missing-provenance"
  | "projection-lag"
  | "stale-source"
  | "source-byte-hash-mismatch"
  | "archive-container-hash-mismatch"
  | "archive-child-hash-mismatch"
  | "source-posture-unavailable"
  | "context-budget-exceeded"
  | "secret-detected"
  | "raw-content-forbidden"
  | "provider-payload-forbidden"
  | "accepted-truth-mutation-forbidden"
  | "accepted-relationship-not-authoritative"
  | "selection-window-required"
  | "selection-window-limit-exceeded"
  | "selection-manifest-stale"
  | "selection-manifest-hash-mismatch"
  | "selection-row-mismatch"
  | "selection-cursor-invalid"
  | "context-payload-missing"
  | "context-payload-hash-mismatch"
  | "context-payload-size-mismatch"
  | "duplicate-context-pack-registration"
  | "conflicting-context-pack-registration"
  | "invalid-context-pack-scope";

export class InvestigativeContextPackError extends Error {
  readonly code: InvestigativeContextPackFailureCode;

  constructor(code: InvestigativeContextPackFailureCode, message: string) {
    super(message);
    this.name = "InvestigativeContextPackError";
    this.code = code;
  }
}

export interface InvestigativeRegistrationIdentity {
  readonly moduleId: "packages/agent/src/investigative-context-packs";
  readonly descriptorSchemaVersion: "investigative-context-pack-descriptor.v1";
  readonly parserSchemaVersion: "investigative-context-pack-payload-parser.v1";
  readonly limitsVersion: "investigative-context-pack-limits.v1";
  readonly builderDescriptorHash: `sha256:${string}`;
  readonly payloadParserHash: `sha256:${string}`;
  readonly limitsHash: `sha256:${string}`;
}

export interface InvestigativeContextPackRegistrarEvidence {
  readonly descriptorHash: string;
  readonly parserIdentity: string;
  readonly producerIdentity: "packages/agent/src/investigative-context-packs";
  readonly registrationIdentity: string;
}

export interface InvestigativeContextPackDefaultLimits {
  readonly limitsVersion: "investigative-context-pack-limits.v1";
  readonly descriptorSchemaVersion: "investigative-context-pack-descriptor.v1";
  readonly packBudgets: Readonly<Record<InvestigativeContextPackId, number>>;
  readonly selectionWindowLimit: 100;
  readonly readerBatchSize: 50;
  readonly omissionSampleLimit: 3;
}

export const INVESTIGATIVE_CONTEXT_PACK_IDS = Object.freeze([
  "accepted-graph-projection.v1",
  "evidence-summary.v1",
  "governance-locks.v1"
] as const);

export const investigativeContextPackDefaultLimits = Object.freeze({
  limitsVersion: "investigative-context-pack-limits.v1",
  descriptorSchemaVersion: "investigative-context-pack-descriptor.v1",
  packBudgets: Object.freeze({
    "accepted-graph-projection.v1": 65_536,
    "evidence-summary.v1": 65_536,
    "governance-locks.v1": 32_768
  }),
  selectionWindowLimit: 100,
  readerBatchSize: 50,
  omissionSampleLimit: 3
} satisfies InvestigativeContextPackDefaultLimits);

export const investigativeContextPackDescriptors = Object.freeze([
  Object.freeze({
    contextPackId: "accepted-graph-projection.v1",
    version: 1,
    label: "Accepted graph projection",
    maxBytes: investigativeContextPackDefaultLimits.packBudgets["accepted-graph-projection.v1"],
    requiredProvenanceKinds: Object.freeze(["event-id", "content-hash"]),
    redactionPolicy: "provider-safe-resolved-payload",
    sourceProjection: "ontology.accepted-graph"
  }),
  Object.freeze({
    contextPackId: "evidence-summary.v1",
    version: 1,
    label: "Evidence summary",
    maxBytes: investigativeContextPackDefaultLimits.packBudgets["evidence-summary.v1"],
    requiredProvenanceKinds: Object.freeze(["event-id", "content-hash", "evidence-id"]),
    redactionPolicy: "provider-safe-resolved-payload",
    sourceProjection: "ingestion.evidence"
  }),
  Object.freeze({
    contextPackId: "governance-locks.v1",
    version: 1,
    label: "Governance locks",
    maxBytes: investigativeContextPackDefaultLimits.packBudgets["governance-locks.v1"],
    requiredProvenanceKinds: Object.freeze(["event-id"]),
    redactionPolicy: "provider-safe-resolved-payload",
    sourceProjection: "governance-and-agent-locks"
  })
] satisfies readonly ContextPackDescriptor[]);

export interface InvestigativeContextPackScope {
  readonly kind: "workspace" | "investigation" | "task" | "selection";
  readonly id: string;
}

export interface InvestigativeProjectionHighWaterMarks {
  readonly graph?: number;
  readonly ingestion?: number;
  readonly governance?: number;
  readonly agent?: number;
}

export interface InvestigativeSelectionWindow {
  readonly cursor: string;
  readonly offset: number;
  readonly limit: number;
  readonly stableSort: "ref-kind-ref-id-content-hash-v1";
}

export interface InvestigativeSelectionIncludedRef {
  readonly refKind: "evidence" | "assertion" | "entity" | "relationship" | "governance-restriction" | "resident-agent-lock";
  readonly refId: string;
  readonly sortKey: string;
  readonly contentHash?: `sha256:${string}`;
  readonly rowHash?: `sha256:${string}`;
  readonly sourceEventIds: readonly string[];
  readonly mandatory: boolean;
}

export interface InvestigativeOmissionSampleRef {
  readonly refKind: string;
  readonly refId: string;
  readonly contentHash?: `sha256:${string}`;
}

export interface InvestigativeContextOmissionAggregate {
  readonly reasonCode: string;
  readonly refKind: string;
  readonly aggregateKey: string;
  readonly count: number;
  readonly sampleRefs?: readonly InvestigativeOmissionSampleRef[];
}

export interface InvestigativeSelectionManifestBody {
  readonly manifestVersion: "investigative-selection-manifest.v1";
  readonly scope: InvestigativeContextPackScope;
  readonly sourceProjectionHighWaterMarks: InvestigativeProjectionHighWaterMarks;
  readonly ordering: "ref-kind-ref-id-content-hash-v1";
  readonly window: InvestigativeSelectionWindow;
  readonly totalEligibleCount: number;
  readonly includedRefs: readonly InvestigativeSelectionIncludedRef[];
  readonly aggregateOmissions: readonly InvestigativeContextOmissionAggregate[];
}

export interface InvestigativeSelectionManifest extends InvestigativeSelectionManifestBody {
  readonly manifestHash: `sha256:${string}`;
}

export interface InvestigativeContextPackBuildRequest {
  readonly scope: InvestigativeContextPackScope;
  readonly window?: InvestigativeSelectionWindow;
  readonly sizeBudgetBytes?: number;
}

export interface InvestigativeSelectionCapability {
  readonly capabilityVersion: "investigative-selection.v1";
  select(input: {
    readonly contextPackId: InvestigativeContextPackId;
    readonly scope: InvestigativeContextPackScope;
    readonly sizeBudgetBytes: number;
    readonly window?: InvestigativeSelectionWindow;
  }): Promise<InvestigativeSelectionManifest> | InvestigativeSelectionManifest;
}

export interface InvestigativeEvidenceRow {
  readonly evidenceId: string;
  readonly ingestionEventId: string;
  readonly contentHash: `sha256:${string}`;
  readonly mediaType?: string;
  readonly sizeBytes?: number;
  readonly sourceCollectionId?: string;
  readonly scanBatchId?: string;
  readonly importBatchId?: string;
  readonly occurrenceIds: readonly string[];
  readonly parseJobs: readonly {
    readonly parseJobId: string;
    readonly lane: string;
    readonly parserName: string;
    readonly parserVersion: string;
    readonly state: string;
    readonly outputHash?: `sha256:${string}`;
    readonly outputMediaType?: string;
    readonly terminalEventId?: string;
    readonly retryable?: boolean;
  }[];
  readonly governanceTags: readonly {
    readonly tag: string;
    readonly source: "ai" | "human";
    readonly state: "active" | "removed";
    readonly confidence?: number;
    readonly safeRationale?: string;
    readonly eventId: string;
  }[];
  readonly duplicateGroup?: { readonly groupId: string; readonly memberCount: number };
  readonly safeNarrative?: string;
  readonly rawActionField?: string;
}

export interface InvestigativeEvidenceReader {
  readEvidenceByIds(input: {
    readonly evidenceIds: readonly string[];
    readonly contentHashes: readonly `sha256:${string}`[];
    readonly highWaterMarks: InvestigativeProjectionHighWaterMarks;
    readonly limit: number;
  }): Promise<readonly InvestigativeEvidenceRow[]> | readonly InvestigativeEvidenceRow[];
}

export interface AcceptedGraphAssertionRow {
  readonly assertionId: string;
  readonly evidenceId: string;
  readonly evidenceContentHash: `sha256:${string}`;
  readonly proposedByEventId: string;
  readonly acceptedByEventId: string;
  readonly sourceEventIds: readonly string[];
  readonly rowHash: `sha256:${string}`;
  readonly safeStatement: string;
}

export interface AcceptedGraphEntityRow {
  readonly entityId: string;
  readonly rowHash: `sha256:${string}`;
  readonly safeLabel: string;
  readonly sourceEventIds: readonly string[];
}

export interface AcceptedGraphRelationshipRow {
  readonly relationshipId: string;
  readonly acceptedByEventId: string;
  readonly evidenceId: string;
  readonly evidenceContentHash: `sha256:${string}`;
  readonly sourceEventIds: readonly string[];
  readonly rowHash: `sha256:${string}`;
  readonly sourceEntityId: string;
  readonly targetEntityId: string;
  readonly relationshipType: string;
}

export interface AcceptedGraphProjectionReader {
  readAcceptedGraphByIds(input: {
    readonly assertionIds: readonly string[];
    readonly entityIds: readonly string[];
    readonly relationshipIds: readonly string[];
    readonly highWaterMarks: InvestigativeProjectionHighWaterMarks;
    readonly limit: number;
  }): Promise<{
    readonly assertions: readonly AcceptedGraphAssertionRow[];
    readonly entities: readonly AcceptedGraphEntityRow[];
    readonly relationships: readonly AcceptedGraphRelationshipRow[];
    readonly relationshipProjectionAvailable: boolean;
  }> | {
    readonly assertions: readonly AcceptedGraphAssertionRow[];
    readonly entities: readonly AcceptedGraphEntityRow[];
    readonly relationships: readonly AcceptedGraphRelationshipRow[];
    readonly relationshipProjectionAvailable: boolean;
  };
}

export interface ResidentAgentLockReader {
  readActiveLocksByIds(input: {
    readonly lockIds: readonly string[];
    readonly highWaterMarks: InvestigativeProjectionHighWaterMarks;
    readonly limit: number;
  }): Promise<readonly ResidentAgentLockRow[]> | readonly ResidentAgentLockRow[];
}

export interface ResidentAgentLockRow {
  readonly sourceLabel: "resident-agent-lock";
  readonly lockId: string;
  readonly lockKind: string;
  readonly safeReason: string;
  readonly activatedBy: string;
  readonly activatedAt: string;
  readonly relatedEventIds: readonly string[];
  readonly projectionEventIds: readonly string[];
}

export interface GovernancePostureReader {
  readActiveRestrictionsByIds(input: {
    readonly restrictionIds: readonly string[];
    readonly highWaterMarks: InvestigativeProjectionHighWaterMarks;
    readonly limit: number;
  }): Promise<readonly GovernanceRestrictionRow[]> | readonly GovernanceRestrictionRow[];
}

export interface GovernanceRestrictionRow {
  readonly sourceLabel: "governance-derived-restriction";
  readonly restrictionId: string;
  readonly restrictionKind: string;
  readonly affectedRef: string;
  readonly sourceEventIds: readonly string[];
  readonly projectionProvenanceRefs: readonly string[];
  readonly policyVersion: string;
  readonly safeReasonCode: string;
}

export interface KnowledgeEventSummary {
  readonly eventId: string;
  readonly type: string;
  readonly contentHash?: `sha256:${string}`;
  readonly ontologyCoreVersion?: string;
  readonly packVersions?: Readonly<Record<string, string>>;
}

export interface KnowledgeEventReader {
  readEventsByIds(input: {
    readonly eventIds: readonly string[];
    readonly limit: number;
  }): Promise<readonly KnowledgeEventSummary[]> | readonly KnowledgeEventSummary[];
}

export interface EvidenceSourcePostureCheckInput {
  readonly evidenceId: string;
  readonly contentHash: `sha256:${string}`;
}

export type EvidenceSourcePostureResult =
  | {
      readonly ok: true;
      readonly stalenessInputs: readonly { readonly kind: string; readonly ref: string; readonly value: string }[];
    }
  | {
      readonly ok: false;
      readonly code:
        | "source-posture-unavailable"
        | "stale-source"
        | "source-byte-hash-mismatch"
        | "archive-container-hash-mismatch"
        | "archive-child-hash-mismatch";
      readonly stalenessInputs: readonly { readonly kind: string; readonly ref: string; readonly value: string }[];
    };

export interface EvidenceSourcePostureCapability {
  readonly postureVersion: "ingestion-current-source-posture.v1";
  checkEvidence(input: EvidenceSourcePostureCheckInput): Promise<EvidenceSourcePostureResult> | EvidenceSourcePostureResult;
}

export interface InvestigativeContextPackMetadata {
  readonly policyVersion: string;
  readonly ontologyCoreVersion: string;
  readonly packVersions: Readonly<Record<string, string>>;
}

export interface InvestigativeContextPackDependencies {
  readonly now: () => string;
  readonly policyVersion: string;
  readonly ontologyCoreVersion: string;
  readonly packVersions: Readonly<Record<string, string>>;
  readonly registrationIdentity: InvestigativeRegistrationIdentity;
  readonly selection: InvestigativeSelectionCapability;
  readonly evidenceReader: InvestigativeEvidenceReader;
  readonly graphReader: AcceptedGraphProjectionReader;
  readonly governanceReader: GovernancePostureReader;
  readonly agentLockReader: ResidentAgentLockReader;
  readonly eventReader: KnowledgeEventReader;
  readonly evidenceSourcePosture: EvidenceSourcePostureCapability;
  readonly budgets?: Partial<Record<InvestigativeContextPackId, number>>;
}

export interface BuildInvestigativeContextPackInput extends InvestigativeContextPackBuildRequest {
  readonly deps: InvestigativeContextPackDependencies;
}

export interface RegisterInvestigativeContextPacksInput extends InvestigativeContextPackBuildRequest {
  readonly deps: InvestigativeContextPackDependencies;
}

export interface InvestigativeContextPackPayloadBase {
  readonly schemaVersion: string;
  readonly contextPackId: InvestigativeContextPackId;
  readonly scope: InvestigativeContextPackScope;
  readonly truthBoundary: Readonly<Record<string, AgentContextPackJsonValue>>;
  readonly selectionManifest: InvestigativeSelectionManifest;
  readonly projectionHighWaterMarks: InvestigativeProjectionHighWaterMarks;
  readonly packVersions: Readonly<Record<string, string>>;
  readonly items: AgentContextPackJsonValue;
  readonly omissions: readonly InvestigativeContextOmissionAggregate[];
  readonly stalenessInputs: readonly { readonly kind: string; readonly ref: string; readonly value: string }[];
}

export interface InvestigativePayloadParserIdentity {
  readonly contextPackId: InvestigativeContextPackId;
  readonly version: 1;
  readonly parserSchemaVersion: "investigative-context-pack-payload-parser.v1";
  readonly parserHash: `sha256:${string}`;
}

export interface InvestigativeContextPackPayloadParser<Payload extends InvestigativeContextPackPayloadBase> {
  readonly contextPackId: Payload["contextPackId"];
  readonly version: 1;
  readonly parserIdentity: InvestigativePayloadParserIdentity;
  parsePayload(payload: unknown, ref?: ContextPackRef): Payload;
}

export interface AcceptedGraphProjectionPayload extends InvestigativeContextPackPayloadBase {
  readonly schemaVersion: "accepted-graph-projection.context.v1";
  readonly contextPackId: "accepted-graph-projection.v1";
  readonly version: 1;
  readonly ontologyCoreVersion: string;
  readonly truthBoundary: {
    readonly authoritativeForAcceptedGraph: true;
    readonly readOnlyProjectionTruth: true;
    readonly canInferNewAcceptedEdges: false;
    readonly graphMutationRequiresReviewedOntologyEvent: true;
  };
  readonly items: {
    readonly assertions: readonly AcceptedGraphAssertionItem[] & readonly AgentContextPackJsonValue[];
    readonly entities: readonly AcceptedGraphEntityItem[] & readonly AgentContextPackJsonValue[];
    readonly relationships: readonly AcceptedGraphRelationshipItem[] & readonly AgentContextPackJsonValue[];
  };
}

export interface AcceptedGraphAssertionItem {
  readonly assertionId: string;
  readonly evidenceId: string;
  readonly evidenceContentHash: `sha256:${string}`;
  readonly proposedByEventId: string;
  readonly acceptedByEventId: string;
  readonly sourceEventIds: readonly string[];
  readonly rowHash: `sha256:${string}`;
  readonly safeStatement: string;
}

export interface AcceptedGraphEntityItem {
  readonly entityId: string;
  readonly rowHash: `sha256:${string}`;
  readonly safeLabel: string;
  readonly sourceEventIds: readonly string[];
}

export interface AcceptedGraphRelationshipItem {
  readonly relationshipId: string;
  readonly acceptedByEventId: string;
  readonly evidenceId: string;
  readonly evidenceContentHash: `sha256:${string}`;
  readonly sourceEventIds: readonly string[];
  readonly rowHash: `sha256:${string}`;
  readonly sourceEntityId: string;
  readonly targetEntityId: string;
  readonly relationshipType: string;
}

export interface ResolvedAcceptedGraphProjectionContextPack {
  readonly ref: ResolvedContextPack["ref"];
  readonly payload: AcceptedGraphProjectionPayload;
}

export interface EvidenceSummaryPayload extends InvestigativeContextPackPayloadBase {
  readonly schemaVersion: "evidence-summary.context.v1";
  readonly contextPackId: "evidence-summary.v1";
  readonly version: 1;
  readonly ontologyCoreVersion: string;
  readonly truthBoundary: {
    readonly evidenceIsReadOnly: true;
    readonly rawContentExcluded: true;
  };
  readonly items: readonly EvidenceSummaryItem[] & readonly AgentContextPackJsonValue[];
}

export interface EvidenceSummaryItem {
  readonly evidenceId: string;
  readonly ingestionEventId: string;
  readonly contentHash: `sha256:${string}`;
  readonly mediaType?: string;
  readonly sizeBytes?: number;
  readonly sourceCollectionId?: string;
  readonly scanBatchId?: string;
  readonly importBatchId?: string;
  readonly occurrenceIds: readonly string[];
  readonly parseJobs: InvestigativeEvidenceRow["parseJobs"];
  readonly governanceTags: InvestigativeEvidenceRow["governanceTags"];
  readonly duplicateGroup?: InvestigativeEvidenceRow["duplicateGroup"];
  readonly safeNarrative?: string;
}

export interface ResolvedEvidenceSummaryContextPack {
  readonly ref: ResolvedContextPack["ref"];
  readonly payload: EvidenceSummaryPayload;
}

export interface GovernanceLocksPayload extends InvestigativeContextPackPayloadBase {
  readonly schemaVersion: "governance-locks.context.v1";
  readonly contextPackId: "governance-locks.v1";
  readonly version: 1;
  readonly ontologyCoreVersion: string;
  readonly truthBoundary: {
    readonly authoritativeForApproval: false;
    readonly grantsApproval: false;
    readonly clearsApprovalOrLocks: false;
    readonly mutatesEvidenceOrGraph: false;
    readonly postureKind: "non-authoritative-safety-posture";
  };
  readonly items: {
    readonly activeLocks: readonly ResidentAgentLockItem[] & readonly AgentContextPackJsonValue[];
    readonly governanceRestrictions: readonly GovernanceRestrictionItem[] & readonly AgentContextPackJsonValue[];
  };
}

export interface ResidentAgentLockItem extends ResidentAgentLockRow {}

export interface GovernanceRestrictionItem extends GovernanceRestrictionRow {}

export interface ResolvedGovernanceLocksContextPack {
  readonly ref: ResolvedContextPack["ref"];
  readonly payload: GovernanceLocksPayload;
}

export const investigativePayloadParserIdentities = Object.freeze({
  "accepted-graph-projection.v1": parserIdentity("accepted-graph-projection.v1", ["assertions", "entities", "relationships"]),
  "evidence-summary.v1": parserIdentity("evidence-summary.v1", ["evidence", "sourcePosture", "governanceTags"]),
  "governance-locks.v1": parserIdentity("governance-locks.v1", ["activeLocks", "governanceRestrictions", "truthBoundary"])
} satisfies Readonly<Record<InvestigativeContextPackId, InvestigativePayloadParserIdentity>>);

export const acceptedGraphProjectionPayloadParser = createPayloadParser<AcceptedGraphProjectionPayload>(
  "accepted-graph-projection.v1",
  "accepted-graph-projection.context.v1",
  parseAcceptedGraphProjectionPayload
);
export const evidenceSummaryPayloadParser = createPayloadParser<EvidenceSummaryPayload>(
  "evidence-summary.v1",
  "evidence-summary.context.v1",
  parseEvidenceSummaryPayload
);
export const governanceLocksPayloadParser = createPayloadParser<GovernanceLocksPayload>(
  "governance-locks.v1",
  "governance-locks.context.v1",
  parseGovernanceLocksPayload
);
export const investigativeContextPackPayloadParsers = Object.freeze([
  acceptedGraphProjectionPayloadParser,
  evidenceSummaryPayloadParser,
  governanceLocksPayloadParser
] as const);

export const investigativeRegistrationIdentity = Object.freeze({
  moduleId: "packages/agent/src/investigative-context-packs",
  descriptorSchemaVersion: "investigative-context-pack-descriptor.v1",
  parserSchemaVersion: "investigative-context-pack-payload-parser.v1",
  limitsVersion: "investigative-context-pack-limits.v1",
  builderDescriptorHash: hashAgentContextPack({
    descriptorSchemaVersion: "investigative-context-pack-descriptor.v1",
    descriptors: investigativeContextPackDescriptors
  }) as `sha256:${string}`,
  payloadParserHash: hashAgentContextPack({
    parserSchemaVersion: "investigative-context-pack-payload-parser.v1",
    parsers: investigativeContextPackPayloadParsers.map((parser) => parser.parserIdentity)
  }) as `sha256:${string}`,
  limitsHash: hashAgentContextPack(investigativeContextPackDefaultLimits) as `sha256:${string}`
} satisfies InvestigativeRegistrationIdentity);

const registeredRegistries = new WeakMap<object, string>();
const parserIdentityProperty = "cestusContextPackParserId";

attachRegistryParserIdentity(parseAcceptedGraphPayloadForRegistry, "accepted-graph-projection.v1");
attachRegistryParserIdentity(parseEvidenceSummaryPayloadForRegistry, "evidence-summary.v1");
attachRegistryParserIdentity(parseGovernanceLocksPayloadForRegistry, "governance-locks.v1");

export function registerInvestigativeContextPacks(
  registry: ContextPackRegistry,
  input: RegisterInvestigativeContextPacksInput
): void {
  const { deps, scope, window, sizeBudgetBytes } = input;
  const identityKey = hashAgentContextPack({
    registrationIdentity: deps.registrationIdentity,
    capturedBuildRequest: {
      scope,
      window: window ?? null,
      sizeBudgetBytes: sizeBudgetBytes ?? null
    },
    registeredContextPackIds: investigativeContextPackDescriptors.map((descriptor) =>
      `${descriptor.contextPackId}@${descriptor.version}`
    )
  });
  const existing = registeredRegistries.get(registry);
  if (existing !== undefined) {
    if (existing !== identityKey) {
      throw new InvestigativeContextPackError("conflicting-context-pack-registration", "conflicting-context-pack-registration");
    }
    return;
  }

  for (const descriptor of investigativeContextPackDescriptors) {
    if (registry.getDescriptor(descriptor.contextPackId) !== undefined) {
      throw new InvestigativeContextPackError("duplicate-context-pack-registration", "duplicate-context-pack-registration");
    }
  }

  registry.register({
    descriptor: investigativeContextPackDescriptors[0] as ContextPackDescriptor,
    parsePayload: parseAcceptedGraphPayloadForRegistry,
    build: async () => asResolvedContextPack(await buildAcceptedGraphProjectionContextPack(registrationBuildInput(input)))
  });
  registry.register({
    descriptor: investigativeContextPackDescriptors[1] as ContextPackDescriptor,
    parsePayload: parseEvidenceSummaryPayloadForRegistry,
    build: async () => asResolvedContextPack(await buildEvidenceSummaryContextPack(registrationBuildInput(input)))
  });
  registry.register({
    descriptor: investigativeContextPackDescriptors[2] as ContextPackDescriptor,
    parsePayload: parseGovernanceLocksPayloadForRegistry,
    build: async () => asResolvedContextPack(await buildGovernanceLocksContextPack(registrationBuildInput(input)))
  });
  registeredRegistries.set(registry, identityKey);
}

/**
 * Read-only identity facts for registrations this module made in its private
 * WeakMap. This cannot attest a manually registered or foreign registry.
 */
export function lookupInvestigativeContextPackRegistrarEvidence(
  registry: ContextPackRegistry,
  contextPackId: string
): InvestigativeContextPackRegistrarEvidence | undefined {
  const registrationIdentity = registeredRegistries.get(registry);
  const expectedDescriptor = investigativeContextPackDescriptors.find((descriptor) => descriptor.contextPackId === contextPackId);
  const actualDescriptor = registry.getDescriptor(contextPackId);
  if (registrationIdentity === undefined || expectedDescriptor === undefined || actualDescriptor === undefined ||
    hashAgentContextPack(actualDescriptor) !== hashAgentContextPack(expectedDescriptor)) {
    return undefined;
  }
  const parser = investigativeContextPackPayloadParsers.find((candidate) => candidate.contextPackId === contextPackId);
  if (parser === undefined) {
    return undefined;
  }
  return Object.freeze({
    descriptorHash: hashAgentContextPack(actualDescriptor),
    parserIdentity: parser.parserIdentity.contextPackId,
    producerIdentity: "packages/agent/src/investigative-context-packs" as const,
    registrationIdentity
  });
}

function registrationBuildInput(input: RegisterInvestigativeContextPacksInput): BuildInvestigativeContextPackInput {
  return {
    deps: input.deps,
    scope: input.scope,
    ...(input.window === undefined ? {} : { window: input.window }),
    ...(input.sizeBudgetBytes === undefined ? {} : { sizeBudgetBytes: input.sizeBudgetBytes })
  };
}

function parseAcceptedGraphPayloadForRegistry(payload: AgentContextPackJsonValue, ref?: ContextPackRef): AgentContextPackJsonValue {
  return acceptedGraphProjectionPayloadParser.parsePayload(payload, ref) as unknown as AgentContextPackJsonValue;
}

function parseEvidenceSummaryPayloadForRegistry(payload: AgentContextPackJsonValue, ref?: ContextPackRef): AgentContextPackJsonValue {
  return evidenceSummaryPayloadParser.parsePayload(payload, ref) as unknown as AgentContextPackJsonValue;
}

function parseGovernanceLocksPayloadForRegistry(payload: AgentContextPackJsonValue, ref?: ContextPackRef): AgentContextPackJsonValue {
  return governanceLocksPayloadParser.parsePayload(payload, ref) as unknown as AgentContextPackJsonValue;
}

function attachRegistryParserIdentity(parser: ContextPackPayloadParser, parserIdentity: string): void {
  Object.defineProperty(parser, parserIdentityProperty, {
    value: parserIdentity,
    enumerable: false,
    writable: false,
    configurable: false
  });
  registerContextPackPayloadParserAuthority(parser);
}

function asResolvedContextPack(
  resolved: ResolvedAcceptedGraphProjectionContextPack | ResolvedEvidenceSummaryContextPack | ResolvedGovernanceLocksContextPack
): ResolvedContextPack {
  return resolved as unknown as ResolvedContextPack;
}

export function buildSelectionManifestHash(
  body: InvestigativeSelectionManifestBody | InvestigativeSelectionManifest
): `sha256:${string}` {
  return hashAgentContextPack(canonicalSelectionManifestBody(body)) as `sha256:${string}`;
}

export function assertSelectionManifestHash(manifest: InvestigativeSelectionManifest): void {
  const expected = buildSelectionManifestHash(manifest);
  if (manifest.manifestHash !== expected) {
    throw new InvestigativeContextPackError("selection-manifest-hash-mismatch", "selection-manifest-hash-mismatch");
  }
}

const readerBatchSize = investigativeContextPackDefaultLimits.readerBatchSize;

async function selectForPack(
  contextPackId: InvestigativeContextPackId,
  input: BuildInvestigativeContextPackInput
): Promise<InvestigativeSelectionManifest> {
  if (input.scope.kind === "workspace" && input.window === undefined) {
    throw new InvestigativeContextPackError("selection-window-required", "selection-window-required");
  }
  const sizeBudgetBytes = input.sizeBudgetBytes
    ?? input.deps.budgets?.[contextPackId]
    ?? investigativeContextPackDefaultLimits.packBudgets[contextPackId];
  const manifest = await input.deps.selection.select({
    contextPackId,
    scope: input.scope,
    sizeBudgetBytes,
    ...(input.window === undefined ? {} : { window: input.window })
  });
  assertSelectionManifestHash(manifest);
  if (manifest.includedRefs.length > investigativeContextPackDefaultLimits.selectionWindowLimit) {
    throw new InvestigativeContextPackError("selection-window-limit-exceeded", "selection-window-limit-exceeded");
  }
  if (manifest.scope.kind !== input.scope.kind || manifest.scope.id !== input.scope.id) {
    throw new InvestigativeContextPackError("invalid-context-pack-scope", "invalid-context-pack-scope");
  }
  return manifest;
}

function includedIds(
  manifest: InvestigativeSelectionManifest,
  refKind: InvestigativeSelectionIncludedRef["refKind"]
): readonly string[] {
  return Object.freeze(manifest.includedRefs.filter((ref) => ref.refKind === refKind).map((ref) => ref.refId));
}

export async function __testOnlyResolveInvestigativeSelection(
  input: BuildInvestigativeContextPackInput & { readonly contextPackId: InvestigativeContextPackId }
): Promise<InvestigativeSelectionManifest> {
  return selectForPack(input.contextPackId, input);
}

export async function __testOnlyReadEvidenceSelectionProbe(
  input: BuildInvestigativeContextPackInput
): Promise<{ readonly manifest: InvestigativeSelectionManifest; readonly rows: readonly InvestigativeEvidenceRow[] }> {
  const manifest = await selectForPack("evidence-summary.v1", input);
  const evidenceRefs = manifest.includedRefs.filter((ref) => ref.refKind === "evidence");
  const rowOrder = new Map(evidenceRefs.map((ref, index) => [ref.refId, index]));
  const rows: InvestigativeEvidenceRow[] = [];

  for (let offset = 0; offset < evidenceRefs.length; offset += readerBatchSize) {
    const batch = evidenceRefs.slice(offset, offset + readerBatchSize);
    const batchRows = await input.deps.evidenceReader.readEvidenceByIds({
      evidenceIds: batch.map((ref) => ref.refId),
      contentHashes: batch
        .map((ref) => ref.contentHash)
        .filter((hash): hash is `sha256:${string}` => hash !== undefined),
      highWaterMarks: manifest.sourceProjectionHighWaterMarks,
      limit: readerBatchSize
    });
    rows.push(...batchRows);
  }

  rows.sort((left, right) => compareEvidenceRowsBySelectionOrder(left, right, rowOrder));
  return Object.freeze({ manifest, rows: Object.freeze(rows) });
}

export async function buildEvidenceSummaryContextPack(
  input: BuildInvestigativeContextPackInput
): Promise<ResolvedEvidenceSummaryContextPack> {
  const selectedManifest = await selectForPack("evidence-summary.v1", input);
  const manifest = canonicalSelectionManifest(selectedManifest);
  if (manifest.sourceProjectionHighWaterMarks.ingestion === undefined) {
    throw new InvestigativeContextPackError("projection-lag", "projection-lag");
  }
  const evidenceRefs = manifest.includedRefs.filter((ref) => ref.refKind === "evidence");
  const rows = await readSelectedEvidenceRows(input.deps.evidenceReader, manifest, evidenceRefs);
  const stalenessInputs: { kind: string; ref: string; value: string }[] = [];
  const items: EvidenceSummaryItem[] = [];

  for (const ref of evidenceRefs) {
    const row = rows.get(ref.refId);
    if (row === undefined || ref.contentHash === undefined || row.contentHash !== ref.contentHash) {
      throw new InvestigativeContextPackError("selection-row-mismatch", "selection-row-mismatch");
    }
    if (row.rawActionField !== undefined) {
      throw new InvestigativeContextPackError("raw-content-forbidden", "raw-content-forbidden");
    }
    if (!ref.sourceEventIds.includes(row.ingestionEventId)) {
      throw new InvestigativeContextPackError("selection-row-mismatch", "selection-row-mismatch");
    }
    assertEvidenceNarrativeSafety(row);
    assertEvidenceOptionalDetailProvenance(row);
    const posture = await input.deps.evidenceSourcePosture.checkEvidence({
      evidenceId: row.evidenceId,
      contentHash: row.contentHash
    });
    stalenessInputs.push(...posture.stalenessInputs);
    if (!posture.ok) {
      throw new InvestigativeContextPackError(posture.code, posture.code);
    }
    items.push(toEvidenceSummaryItem(row));
  }

  const provenanceRefs = new Set<string>();
  for (const ref of evidenceRefs) {
    provenanceRefs.add(ref.refId);
    if (ref.contentHash !== undefined) {
      provenanceRefs.add(ref.contentHash);
    }
    for (const eventId of ref.sourceEventIds) {
      provenanceRefs.add(eventId);
    }
    const row = rows.get(ref.refId);
    if (row !== undefined) {
      provenanceRefs.add(row.ingestionEventId);
    }
  }

  const budget = input.sizeBudgetBytes
    ?? input.deps.budgets?.["evidence-summary.v1"]
    ?? investigativeContextPackDefaultLimits.packBudgets["evidence-summary.v1"];
  const metadata = canonicalMetadata(input.deps);
  const normalizedStalenessInputs = canonicalStalenessInputs(stalenessInputs);
  const normalizedItems = [...items].sort((left, right) => compareText(left.evidenceId, right.evidenceId));
  const fitted = fitEvidenceSummaryBudget({
    manifest,
    metadata,
    items: normalizedItems,
    omissions: canonicalOmissions(manifest.aggregateOmissions),
    stalenessInputs: normalizedStalenessInputs,
    budget
  });
  if (fitted === undefined) {
    throw new InvestigativeContextPackError("context-budget-exceeded", "context-budget-exceeded");
  }
  for (const item of fitted.payload.items) {
    for (const parseJob of item.parseJobs) {
      if (parseJob.outputHash !== undefined) {
        provenanceRefs.add(parseJob.outputHash);
      }
      if (parseJob.terminalEventId !== undefined) {
        provenanceRefs.add(parseJob.terminalEventId);
      }
    }
    for (const governanceTag of item.governanceTags) {
      provenanceRefs.add(governanceTag.eventId);
    }
  }
  provenanceRefs.add(`policy:${metadata.policyVersion}`);
  provenanceRefs.add(`ontology-core:${metadata.ontologyCoreVersion}`);
  for (const [packId, version] of Object.entries(metadata.packVersions)) {
    provenanceRefs.add(`pack:${packId}@${version}`);
  }
  return buildEvidenceSummaryResolvedPack({
    payload: fitted.payload,
    manifest,
    now: input.deps.now,
    provenanceRefs: [...provenanceRefs].sort(compareText),
    stalenessInputs: normalizedStalenessInputs,
    policyVersion: metadata.policyVersion,
    sizeBudgetBytes: budget
  });
}

export async function buildAcceptedGraphProjectionContextPack(
  input: BuildInvestigativeContextPackInput
): Promise<ResolvedAcceptedGraphProjectionContextPack> {
  const selectedManifest = await selectForPack("accepted-graph-projection.v1", input);
  const manifest = canonicalSelectionManifest(selectedManifest);
  if (manifest.sourceProjectionHighWaterMarks.graph === undefined) {
    throw new InvestigativeContextPackError("projection-lag", "projection-lag");
  }
  const assertionRefs = manifest.includedRefs.filter((ref) => ref.refKind === "assertion");
  const entityRefs = manifest.includedRefs.filter((ref) => ref.refKind === "entity");
  const relationshipRefs = manifest.includedRefs.filter((ref) => ref.refKind === "relationship");
  const graphRows = await readSelectedAcceptedGraphRows(input.deps.graphReader, manifest);
  const metadata = canonicalMetadata(input.deps);
  const assertions = validateAcceptedGraphAssertions(assertionRefs, graphRows.assertions);
  const entities = validateAcceptedGraphEntities(entityRefs, graphRows.entities);
  const relationshipValidation = validateAcceptedGraphRelationships({
    relationshipRefs,
    relationshipRows: graphRows.relationships,
    relationshipProjectionAvailable: graphRows.relationshipProjectionAvailable
  });
  const omissions = canonicalOmissions([
    ...manifest.aggregateOmissions,
    ...relationshipValidation.omissions
  ]);
  const stalenessInputs = canonicalStalenessInputs([
    ...acceptedGraphHighWaterStalenessInputs(manifest.sourceProjectionHighWaterMarks),
    ...assertions.map((row) => ({
      kind: "accepted-assertion-evidence-hash",
      ref: row.assertionId,
      value: row.evidenceContentHash
    })),
    ...relationshipValidation.relationships.map((row) => ({
      kind: "accepted-relationship-evidence-hash",
      ref: row.relationshipId,
      value: row.evidenceContentHash
    }))
  ]);
  const payload = acceptedGraphProjectionPayloadParser.parsePayload({
    schemaVersion: "accepted-graph-projection.context.v1",
    contextPackId: "accepted-graph-projection.v1",
    version: 1,
    ontologyCoreVersion: metadata.ontologyCoreVersion,
    scope: manifest.scope,
    truthBoundary: {
      authoritativeForAcceptedGraph: true,
      readOnlyProjectionTruth: true,
      canInferNewAcceptedEdges: false,
      graphMutationRequiresReviewedOntologyEvent: true
    },
    selectionManifest: manifest,
    projectionHighWaterMarks: manifest.sourceProjectionHighWaterMarks,
    packVersions: metadata.packVersions,
    items: {
      assertions: assertions.map(toAcceptedGraphAssertionItem).sort(compareAcceptedGraphAssertionItems),
      entities: entities.map(toAcceptedGraphEntityItem).sort(compareAcceptedGraphEntityItems),
      relationships: relationshipValidation.relationships
        .map(toAcceptedGraphRelationshipItem)
        .sort(compareAcceptedGraphRelationshipItems)
    },
    omissions,
    stalenessInputs
  });
  const provenanceRefs = acceptedGraphProvenanceRefs({
    manifest,
    assertions,
    entities,
    relationships: relationshipValidation.relationships,
    metadata
  });
  const budget = input.sizeBudgetBytes
    ?? input.deps.budgets?.["accepted-graph-projection.v1"]
    ?? investigativeContextPackDefaultLimits.packBudgets["accepted-graph-projection.v1"];
  const resolved = buildAcceptedGraphResolvedPack({
    payload,
    manifest,
    now: input.deps.now,
    provenanceRefs,
    stalenessInputs,
    policyVersion: metadata.policyVersion
  });
  if (resolved.ref.sizeBytes > budget) {
    throw new InvestigativeContextPackError("context-budget-exceeded", "context-budget-exceeded");
  }
  return buildAcceptedGraphResolvedPack({
    payload,
    manifest,
    now: input.deps.now,
    provenanceRefs,
    stalenessInputs,
    policyVersion: metadata.policyVersion,
    sizeBudgetBytes: budget
  });
}

export async function buildGovernanceLocksContextPack(
  input: BuildInvestigativeContextPackInput
): Promise<ResolvedGovernanceLocksContextPack> {
  const selectedManifest = await selectForPack("governance-locks.v1", input);
  const manifest = canonicalSelectionManifest(selectedManifest);
  if (manifest.sourceProjectionHighWaterMarks.governance === undefined
    || manifest.sourceProjectionHighWaterMarks.agent === undefined) {
    throw new InvestigativeContextPackError("projection-lag", "projection-lag");
  }
  const lockRefs = manifest.includedRefs.filter((ref) => ref.refKind === "resident-agent-lock");
  const restrictionRefs = manifest.includedRefs.filter((ref) => ref.refKind === "governance-restriction");
  if (![...lockRefs, ...restrictionRefs].every((ref) => ref.mandatory)) {
    throw new InvestigativeContextPackError("selection-row-mismatch", "selection-row-mismatch");
  }
  const locks = validateResidentAgentLocks(lockRefs, await readSelectedResidentAgentLocks(input.deps.agentLockReader, manifest, lockRefs));
  const restrictions = validateGovernanceRestrictions(
    restrictionRefs,
    await readSelectedGovernanceRestrictions(input.deps.governanceReader, manifest, restrictionRefs)
  );
  const events = await readGovernanceProvenanceEvents(input.deps.eventReader, collectGovernanceEventIds(locks, restrictions));
  const metadata = canonicalMetadata(input.deps);
  const stalenessInputs = canonicalStalenessInputs([
    ...governanceHighWaterStalenessInputs(manifest.sourceProjectionHighWaterMarks),
    ...events.map((event) => ({
      kind: "governance-provenance-event-hash",
      ref: event.eventId,
      value: event.contentHash
    })),
    ...locks.flatMap((row) => row.projectionEventIds.map((eventId) => ({
      kind: "resident-agent-lock-projection-event",
      ref: row.lockId,
      value: eventId
    }))),
    ...restrictions.flatMap((row) => row.projectionProvenanceRefs.map((provenanceRef) => ({
      kind: "governance-restriction-projection-provenance",
      ref: row.restrictionId,
      value: provenanceRef
    })))
  ]);
  const payload = governanceLocksPayloadParser.parsePayload({
    schemaVersion: "governance-locks.context.v1",
    contextPackId: "governance-locks.v1",
    version: 1,
    ontologyCoreVersion: metadata.ontologyCoreVersion,
    scope: manifest.scope,
    truthBoundary: {
      authoritativeForApproval: false,
      grantsApproval: false,
      clearsApprovalOrLocks: false,
      mutatesEvidenceOrGraph: false,
      postureKind: "non-authoritative-safety-posture"
    },
    selectionManifest: manifest,
    projectionHighWaterMarks: manifest.sourceProjectionHighWaterMarks,
    packVersions: metadata.packVersions,
    items: {
      activeLocks: locks.map(toResidentAgentLockItem).sort(compareResidentAgentLockItems),
      governanceRestrictions: restrictions.map(toGovernanceRestrictionItem).sort(compareGovernanceRestrictionItems)
    },
    omissions: canonicalOmissions(manifest.aggregateOmissions),
    stalenessInputs
  });
  const provenanceRefs = governanceProvenanceRefs({ manifest, locks, restrictions, events, metadata });
  const budget = input.sizeBudgetBytes
    ?? input.deps.budgets?.["governance-locks.v1"]
    ?? investigativeContextPackDefaultLimits.packBudgets["governance-locks.v1"];
  const resolved = buildGovernanceLocksResolvedPack({
    payload,
    manifest,
    now: input.deps.now,
    provenanceRefs,
    stalenessInputs,
    policyVersion: metadata.policyVersion
  });
  if (resolved.ref.sizeBytes > budget) {
    throw new InvestigativeContextPackError("context-budget-exceeded", "context-budget-exceeded");
  }
  return buildGovernanceLocksResolvedPack({
    payload,
    manifest,
    now: input.deps.now,
    provenanceRefs,
    stalenessInputs,
    policyVersion: metadata.policyVersion,
    sizeBudgetBytes: budget
  });
}

function collectGovernanceEventIds(
  locks: readonly ResidentAgentLockRow[],
  restrictions: readonly GovernanceRestrictionRow[]
): readonly string[] {
  const ids = new Set<string>();
  for (const row of locks) {
    for (const eventId of row.relatedEventIds) {
      ids.add(eventId);
    }
    for (const eventId of row.projectionEventIds) {
      ids.add(eventId);
    }
  }
  for (const row of restrictions) {
    for (const eventId of row.sourceEventIds) {
      ids.add(eventId);
    }
    for (const provenanceRef of row.projectionProvenanceRefs) {
      if (isEventId(provenanceRef)) {
        ids.add(provenanceRef);
      }
    }
  }
  return Object.freeze([...ids].sort(compareText));
}

async function readGovernanceProvenanceEvents(
  reader: KnowledgeEventReader,
  eventIds: readonly string[]
): Promise<readonly Required<KnowledgeEventSummary>[]> {
  const rows: KnowledgeEventSummary[] = [];
  for (let offset = 0; offset < eventIds.length; offset += readerBatchSize) {
    const batch = eventIds.slice(offset, offset + readerBatchSize);
    const batchRows = await reader.readEventsByIds({
      eventIds: batch,
      limit: readerBatchSize
    });
    rows.push(...batchRows);
  }
  return validateKnowledgeEventSummaries(eventIds, rows);
}

function validateKnowledgeEventSummaries(
  eventIds: readonly string[],
  rows: readonly KnowledgeEventSummary[]
): readonly Required<KnowledgeEventSummary>[] {
  const rowsById = mapUniqueRows(rows, (row) => row.eventId);
  if (rowsById.size !== eventIds.length) {
    throw new InvestigativeContextPackError("missing-provenance", "missing-provenance");
  }
  return Object.freeze(eventIds.map((eventId) => {
    const row = rowsById.get(eventId);
    if (row === undefined || row.eventId !== eventId || !isEventId(row.eventId) || !isSafeNonEmptyText(row.type)
      || !isContentHash(row.contentHash) || !isSafeNonEmptyText(row.ontologyCoreVersion)
      || !isPackVersions(row.packVersions)) {
      throw new InvestigativeContextPackError("missing-provenance", "missing-provenance");
    }
    return row as Required<KnowledgeEventSummary>;
  }));
}

async function readSelectedResidentAgentLocks(
  reader: ResidentAgentLockReader,
  manifest: InvestigativeSelectionManifest,
  lockRefs: readonly InvestigativeSelectionIncludedRef[]
): Promise<readonly ResidentAgentLockRow[]> {
  const rows: ResidentAgentLockRow[] = [];
  for (let offset = 0; offset < lockRefs.length; offset += readerBatchSize) {
    const batch = lockRefs.slice(offset, offset + readerBatchSize);
    const batchRows = await reader.readActiveLocksByIds({
      lockIds: batch.map((ref) => ref.refId),
      highWaterMarks: manifest.sourceProjectionHighWaterMarks,
      limit: readerBatchSize
    });
    rows.push(...batchRows);
  }
  return Object.freeze(rows);
}

async function readSelectedGovernanceRestrictions(
  reader: GovernancePostureReader,
  manifest: InvestigativeSelectionManifest,
  restrictionRefs: readonly InvestigativeSelectionIncludedRef[]
): Promise<readonly GovernanceRestrictionRow[]> {
  const rows: GovernanceRestrictionRow[] = [];
  for (let offset = 0; offset < restrictionRefs.length; offset += readerBatchSize) {
    const batch = restrictionRefs.slice(offset, offset + readerBatchSize);
    const batchRows = await reader.readActiveRestrictionsByIds({
      restrictionIds: batch.map((ref) => ref.refId),
      highWaterMarks: manifest.sourceProjectionHighWaterMarks,
      limit: readerBatchSize
    });
    rows.push(...batchRows);
  }
  return Object.freeze(rows);
}

function validateResidentAgentLocks(
  lockRefs: readonly InvestigativeSelectionIncludedRef[],
  lockRows: readonly ResidentAgentLockRow[]
): readonly ResidentAgentLockRow[] {
  const rowsById = mapUniqueRows(lockRows, (row) => row.lockId);
  if (rowsById.size !== lockRefs.length) {
    throw new InvestigativeContextPackError("selection-row-mismatch", "selection-row-mismatch");
  }
  return Object.freeze(lockRefs.map((ref) => {
    const row = rowsById.get(ref.refId);
    if (row === undefined) {
      throw new InvestigativeContextPackError("selection-row-mismatch", "selection-row-mismatch");
    }
    assertResidentAgentLockRow(row, ref);
    return row;
  }));
}

function validateGovernanceRestrictions(
  restrictionRefs: readonly InvestigativeSelectionIncludedRef[],
  restrictionRows: readonly GovernanceRestrictionRow[]
): readonly GovernanceRestrictionRow[] {
  const rowsById = mapUniqueRows(restrictionRows, (row) => row.restrictionId);
  if (rowsById.size !== restrictionRefs.length) {
    throw new InvestigativeContextPackError("selection-row-mismatch", "selection-row-mismatch");
  }
  return Object.freeze(restrictionRefs.map((ref) => {
    const row = rowsById.get(ref.refId);
    if (row === undefined) {
      throw new InvestigativeContextPackError("selection-row-mismatch", "selection-row-mismatch");
    }
    assertGovernanceRestrictionRow(row, ref);
    return row;
  }));
}

function assertResidentAgentLockRow(row: ResidentAgentLockRow, ref: InvestigativeSelectionIncludedRef): void {
  if (row.sourceLabel !== "resident-agent-lock" || row.lockId !== ref.refId || !isSafeNonEmptyText(row.lockKind)
    || !isSafeNonEmptyText(row.safeReason) || !isSafeNonEmptyText(row.activatedBy) || !isSafeNonEmptyText(row.activatedAt)
    || row.relatedEventIds.length === 0 || row.projectionEventIds.length === 0
    || !row.relatedEventIds.every(isEventId) || !row.projectionEventIds.every(isEventId)) {
    throw new InvestigativeContextPackError("missing-provenance", "missing-provenance");
  }
  if (!sameStringSet(row.relatedEventIds, ref.sourceEventIds)) {
    throw new InvestigativeContextPackError("selection-row-mismatch", "selection-row-mismatch");
  }
}

function assertGovernanceRestrictionRow(row: GovernanceRestrictionRow, ref: InvestigativeSelectionIncludedRef): void {
  if (row.sourceLabel !== "governance-derived-restriction" || row.restrictionId !== ref.refId
    || !isSafeNonEmptyText(row.restrictionKind) || !isSafeNonEmptyText(row.affectedRef)
    || row.sourceEventIds.length === 0 || row.projectionProvenanceRefs.length === 0
    || !row.sourceEventIds.every(isEventId) || !row.projectionProvenanceRefs.every(isSafeNonEmptyText)
    || !isSafeNonEmptyText(row.policyVersion) || !isSafeNonEmptyText(row.safeReasonCode)) {
    throw new InvestigativeContextPackError("missing-provenance", "missing-provenance");
  }
  if (!sameStringSet(row.sourceEventIds, ref.sourceEventIds)) {
    throw new InvestigativeContextPackError("selection-row-mismatch", "selection-row-mismatch");
  }
}

function toResidentAgentLockItem(row: ResidentAgentLockRow): ResidentAgentLockItem {
  return {
    sourceLabel: "resident-agent-lock",
    lockId: row.lockId,
    lockKind: row.lockKind,
    safeReason: row.safeReason,
    activatedBy: row.activatedBy,
    activatedAt: row.activatedAt,
    relatedEventIds: Object.freeze([...row.relatedEventIds].sort(compareText)),
    projectionEventIds: Object.freeze([...row.projectionEventIds].sort(compareText))
  };
}

function toGovernanceRestrictionItem(row: GovernanceRestrictionRow): GovernanceRestrictionItem {
  return {
    sourceLabel: "governance-derived-restriction",
    restrictionId: row.restrictionId,
    restrictionKind: row.restrictionKind,
    affectedRef: row.affectedRef,
    sourceEventIds: Object.freeze([...row.sourceEventIds].sort(compareText)),
    projectionProvenanceRefs: Object.freeze([...row.projectionProvenanceRefs].sort(compareText)),
    policyVersion: row.policyVersion,
    safeReasonCode: row.safeReasonCode
  };
}

function compareResidentAgentLockItems(left: ResidentAgentLockItem, right: ResidentAgentLockItem): number {
  return compareText(left.lockId, right.lockId);
}

function compareGovernanceRestrictionItems(left: GovernanceRestrictionItem, right: GovernanceRestrictionItem): number {
  return compareText(left.restrictionId, right.restrictionId);
}

function governanceHighWaterStalenessInputs(
  marks: InvestigativeProjectionHighWaterMarks
): readonly { readonly kind: string; readonly ref: string; readonly value: string }[] {
  return Object.freeze(Object.entries(marks)
    .filter(([kind]) => kind === "governance" || kind === "agent")
    .map(([kind, value]) => ({ kind: "projection-high-water-mark", ref: kind, value: String(value) }))
    .sort((left, right) => compareByFields([left.kind, left.ref, left.value], [right.kind, right.ref, right.value])));
}

function governanceProvenanceRefs(input: {
  readonly manifest: InvestigativeSelectionManifest;
  readonly locks: readonly ResidentAgentLockRow[];
  readonly restrictions: readonly GovernanceRestrictionRow[];
  readonly events: readonly Required<KnowledgeEventSummary>[];
  readonly metadata: InvestigativeContextPackMetadata;
}): readonly string[] {
  const refs = new Set<string>([input.manifest.manifestHash]);
  for (const ref of input.manifest.includedRefs) {
    refs.add(ref.refId);
    for (const eventId of ref.sourceEventIds) {
      refs.add(eventId);
    }
  }
  for (const row of input.locks) {
    refs.add(row.lockId);
    for (const eventId of row.relatedEventIds) {
      refs.add(eventId);
    }
    for (const eventId of row.projectionEventIds) {
      refs.add(eventId);
    }
  }
  for (const row of input.restrictions) {
    refs.add(row.restrictionId);
    for (const eventId of row.sourceEventIds) {
      refs.add(eventId);
    }
    for (const provenanceRef of row.projectionProvenanceRefs) {
      refs.add(provenanceRef);
    }
    refs.add(`policy:${row.policyVersion}`);
  }
  for (const row of input.events) {
    refs.add(row.eventId);
    refs.add(row.contentHash);
    refs.add(`ontology-core:${row.ontologyCoreVersion}`);
    for (const [packId, version] of Object.entries(row.packVersions)) {
      refs.add(`pack:${packId}@${version}`);
    }
  }
  refs.add(`policy:${input.metadata.policyVersion}`);
  refs.add(`ontology-core:${input.metadata.ontologyCoreVersion}`);
  for (const [packId, version] of Object.entries(input.metadata.packVersions)) {
    refs.add(`pack:${packId}@${version}`);
  }
  return Object.freeze([...refs].sort(compareText));
}

function buildGovernanceLocksResolvedPack(input: {
  readonly payload: GovernanceLocksPayload;
  readonly manifest: InvestigativeSelectionManifest;
  readonly now: () => string;
  readonly provenanceRefs: readonly string[];
  readonly stalenessInputs: readonly { readonly kind: string; readonly ref: string; readonly value: string }[];
  readonly policyVersion: string;
  readonly sizeBudgetBytes?: number;
}): ResolvedGovernanceLocksContextPack {
  return buildResolvedContextPack({
    contextPackId: "governance-locks.v1",
    version: 1,
    generatedAt: input.now(),
    payload: input.payload,
    safeSummary: "Provider-safe governance lock posture",
    provenanceRefs: input.provenanceRefs,
    projectionHighWaterMark: Math.max(
      input.manifest.sourceProjectionHighWaterMarks.governance ?? 0,
      input.manifest.sourceProjectionHighWaterMarks.agent ?? 0
    ),
    sourceEventIds: input.provenanceRefs.filter((ref) => ref.startsWith("evt_")),
    artifactHashes: input.provenanceRefs.filter((ref) => ref.startsWith("sha256:")),
    policyVersion: input.policyVersion,
    scope: input.manifest.scope,
    ...(input.sizeBudgetBytes === undefined ? {} : { sizeBudgetBytes: input.sizeBudgetBytes }),
    stalenessInputs: input.stalenessInputs
  }) as unknown as ResolvedGovernanceLocksContextPack;
}

async function readSelectedAcceptedGraphRows(
  reader: AcceptedGraphProjectionReader,
  manifest: InvestigativeSelectionManifest
): Promise<{
  readonly assertions: readonly AcceptedGraphAssertionRow[];
  readonly entities: readonly AcceptedGraphEntityRow[];
  readonly relationships: readonly AcceptedGraphRelationshipRow[];
  readonly relationshipProjectionAvailable: boolean;
}> {
  const graphRefs = manifest.includedRefs.filter((ref) => ref.refKind === "assertion"
    || ref.refKind === "entity" || ref.refKind === "relationship");
  const assertions: AcceptedGraphAssertionRow[] = [];
  const entities: AcceptedGraphEntityRow[] = [];
  const relationships: AcceptedGraphRelationshipRow[] = [];
  let relationshipProjectionAvailable = true;

  for (let offset = 0; offset < graphRefs.length; offset += readerBatchSize) {
    const batch = graphRefs.slice(offset, offset + readerBatchSize);
    const batchRows = await reader.readAcceptedGraphByIds({
      assertionIds: batch.filter((ref) => ref.refKind === "assertion").map((ref) => ref.refId),
      entityIds: batch.filter((ref) => ref.refKind === "entity").map((ref) => ref.refId),
      relationshipIds: batch.filter((ref) => ref.refKind === "relationship").map((ref) => ref.refId),
      highWaterMarks: manifest.sourceProjectionHighWaterMarks,
      limit: readerBatchSize
    });
    assertions.push(...batchRows.assertions);
    entities.push(...batchRows.entities);
    relationships.push(...batchRows.relationships);
    relationshipProjectionAvailable = relationshipProjectionAvailable && batchRows.relationshipProjectionAvailable;
  }

  return Object.freeze({
    assertions: Object.freeze(assertions),
    entities: Object.freeze(entities),
    relationships: Object.freeze(relationships),
    relationshipProjectionAvailable
  });
}

function validateAcceptedGraphAssertions(
  assertionRefs: readonly InvestigativeSelectionIncludedRef[],
  assertionRows: readonly AcceptedGraphAssertionRow[]
): readonly AcceptedGraphAssertionRow[] {
  const rowsById = mapUniqueRows(assertionRows, (row) => row.assertionId);
  if (rowsById.size !== assertionRefs.length) {
    throw new InvestigativeContextPackError("selection-row-mismatch", "selection-row-mismatch");
  }
  return Object.freeze(assertionRefs.map((ref) => {
    const row = rowsById.get(ref.refId);
    if (row === undefined) {
      throw new InvestigativeContextPackError("selection-row-mismatch", "selection-row-mismatch");
    }
    assertAcceptedAssertionRow(row, ref);
    return row;
  }));
}

function validateAcceptedGraphEntities(
  entityRefs: readonly InvestigativeSelectionIncludedRef[],
  entityRows: readonly AcceptedGraphEntityRow[]
): readonly AcceptedGraphEntityRow[] {
  const rowsById = mapUniqueRows(entityRows, (row) => row.entityId);
  if (rowsById.size !== entityRefs.length) {
    throw new InvestigativeContextPackError("selection-row-mismatch", "selection-row-mismatch");
  }
  return Object.freeze(entityRefs.map((ref) => {
    const row = rowsById.get(ref.refId);
    if (row === undefined) {
      throw new InvestigativeContextPackError("selection-row-mismatch", "selection-row-mismatch");
    }
    assertAcceptedEntityRow(row, ref);
    return row;
  }));
}

function validateAcceptedGraphRelationships(input: {
  readonly relationshipRefs: readonly InvestigativeSelectionIncludedRef[];
  readonly relationshipRows: readonly AcceptedGraphRelationshipRow[];
  readonly relationshipProjectionAvailable: boolean;
}): {
  readonly relationships: readonly AcceptedGraphRelationshipRow[];
  readonly omissions: readonly InvestigativeContextOmissionAggregate[];
} {
  if (!input.relationshipProjectionAvailable) {
    return {
      relationships: Object.freeze([]),
      omissions: Object.freeze([{
        reasonCode: "relationship-projection-unavailable",
        refKind: "relationship",
        aggregateKey: "ontology.accepted-relationship",
        count: Math.max(1, input.relationshipRefs.length),
        sampleRefs: canonicalSampleRefs(input.relationshipRefs.map((ref) => ({
          refKind: "relationship",
          refId: ref.refId,
          ...(ref.rowHash === undefined ? {} : { contentHash: ref.rowHash })
        })))
      }])
    };
  }

  const rowsById = mapUniqueRows(input.relationshipRows, (row) => row.relationshipId);
  if (rowsById.size !== input.relationshipRefs.length) {
    throw new InvestigativeContextPackError("selection-row-mismatch", "selection-row-mismatch");
  }
  const relationships = input.relationshipRefs.map((ref) => {
    const row = rowsById.get(ref.refId);
    if (row === undefined) {
      throw new InvestigativeContextPackError("selection-row-mismatch", "selection-row-mismatch");
    }
    assertAcceptedRelationshipRow(row, ref);
    return row;
  });
  return { relationships: Object.freeze(relationships), omissions: Object.freeze([]) };
}

function mapUniqueRows<Row>(rows: readonly Row[], getId: (row: Row) => string): Map<string, Row> {
  const rowsById = new Map<string, Row>();
  for (const row of rows) {
    const id = getId(row);
    if (rowsById.has(id)) {
      throw new InvestigativeContextPackError("selection-row-mismatch", "selection-row-mismatch");
    }
    rowsById.set(id, row);
  }
  return rowsById;
}

function assertAcceptedAssertionRow(row: AcceptedGraphAssertionRow, ref: InvestigativeSelectionIncludedRef): void {
  if (!isSafeNonEmptyText(row.assertionId) || row.assertionId !== ref.refId
    || !isSafeNonEmptyText(row.evidenceId) || !isContentHash(row.evidenceContentHash)
    || !isSafeNonEmptyText(row.proposedByEventId) || !isSafeNonEmptyText(row.acceptedByEventId)
    || !isEventId(row.proposedByEventId) || !isEventId(row.acceptedByEventId)
    || !isContentHash(row.rowHash) || !isSafeNonEmptyText(row.safeStatement)
    || !row.sourceEventIds.every(isEventId)) {
    throw new InvestigativeContextPackError("missing-provenance", "missing-provenance");
  }
  if (ref.rowHash !== row.rowHash) {
    throw new InvestigativeContextPackError("selection-row-mismatch", "selection-row-mismatch");
  }
  if (!ref.sourceEventIds.includes(row.proposedByEventId) || !ref.sourceEventIds.includes(row.acceptedByEventId)
    || !row.sourceEventIds.includes(row.proposedByEventId) || !row.sourceEventIds.includes(row.acceptedByEventId)) {
    throw new InvestigativeContextPackError("missing-provenance", "missing-provenance");
  }
  if (!sameStringSet(row.sourceEventIds, ref.sourceEventIds)) {
    throw new InvestigativeContextPackError("selection-row-mismatch", "selection-row-mismatch");
  }
}

function assertAcceptedEntityRow(row: AcceptedGraphEntityRow, ref: InvestigativeSelectionIncludedRef): void {
  if (!isSafeNonEmptyText(row.entityId) || row.entityId !== ref.refId || !isContentHash(row.rowHash)
    || ref.rowHash !== row.rowHash || !isSafeNonEmptyText(row.safeLabel)
    || row.sourceEventIds.length === 0 || !row.sourceEventIds.every(isEventId)
    || !sameStringSet(row.sourceEventIds, ref.sourceEventIds)) {
    throw new InvestigativeContextPackError("selection-row-mismatch", "selection-row-mismatch");
  }
}

function assertAcceptedRelationshipRow(row: AcceptedGraphRelationshipRow, ref: InvestigativeSelectionIncludedRef): void {
  if (!isSafeNonEmptyText(row.relationshipId) || row.relationshipId !== ref.refId
    || !isSafeNonEmptyText(row.acceptedByEventId) || !isSafeNonEmptyText(row.evidenceId)
    || !isEventId(row.acceptedByEventId)
    || !isContentHash(row.evidenceContentHash) || !isContentHash(row.rowHash) || ref.rowHash !== row.rowHash
    || !isSafeNonEmptyText(row.sourceEntityId) || !isSafeNonEmptyText(row.targetEntityId)
    || !isSafeNonEmptyText(row.relationshipType) || !row.sourceEventIds.every(isEventId)) {
    throw new InvestigativeContextPackError("accepted-relationship-not-authoritative", "accepted-relationship-not-authoritative");
  }
  if (!sameStringSet(row.sourceEventIds, ref.sourceEventIds)) {
    throw new InvestigativeContextPackError("selection-row-mismatch", "selection-row-mismatch");
  }
  if (!ref.sourceEventIds.includes(row.acceptedByEventId) || !row.sourceEventIds.includes(row.acceptedByEventId)) {
    throw new InvestigativeContextPackError("accepted-relationship-not-authoritative", "accepted-relationship-not-authoritative");
  }
}

function toAcceptedGraphAssertionItem(row: AcceptedGraphAssertionRow): AcceptedGraphAssertionItem {
  return {
    assertionId: row.assertionId,
    evidenceId: row.evidenceId,
    evidenceContentHash: row.evidenceContentHash,
    proposedByEventId: row.proposedByEventId,
    acceptedByEventId: row.acceptedByEventId,
    sourceEventIds: Object.freeze([...row.sourceEventIds].sort(compareText)),
    rowHash: row.rowHash,
    safeStatement: row.safeStatement
  };
}

function toAcceptedGraphEntityItem(row: AcceptedGraphEntityRow): AcceptedGraphEntityItem {
  return {
    entityId: row.entityId,
    rowHash: row.rowHash,
    safeLabel: row.safeLabel,
    sourceEventIds: Object.freeze([...row.sourceEventIds].sort(compareText))
  };
}

function toAcceptedGraphRelationshipItem(row: AcceptedGraphRelationshipRow): AcceptedGraphRelationshipItem {
  return {
    relationshipId: row.relationshipId,
    acceptedByEventId: row.acceptedByEventId,
    evidenceId: row.evidenceId,
    evidenceContentHash: row.evidenceContentHash,
    sourceEventIds: Object.freeze([...row.sourceEventIds].sort(compareText)),
    rowHash: row.rowHash,
    sourceEntityId: row.sourceEntityId,
    targetEntityId: row.targetEntityId,
    relationshipType: row.relationshipType
  };
}

function compareAcceptedGraphAssertionItems(left: AcceptedGraphAssertionItem, right: AcceptedGraphAssertionItem): number {
  return compareText(left.assertionId, right.assertionId);
}

function compareAcceptedGraphEntityItems(left: AcceptedGraphEntityItem, right: AcceptedGraphEntityItem): number {
  return compareText(left.entityId, right.entityId);
}

function compareAcceptedGraphRelationshipItems(left: AcceptedGraphRelationshipItem, right: AcceptedGraphRelationshipItem): number {
  return compareText(left.relationshipId, right.relationshipId);
}

function acceptedGraphHighWaterStalenessInputs(
  marks: InvestigativeProjectionHighWaterMarks
): readonly { readonly kind: string; readonly ref: string; readonly value: string }[] {
  return Object.freeze(Object.entries(marks)
    .map(([kind, value]) => ({ kind: "projection-high-water-mark", ref: kind, value: String(value) }))
    .sort((left, right) => compareByFields([left.kind, left.ref, left.value], [right.kind, right.ref, right.value])));
}

function acceptedGraphProvenanceRefs(input: {
  readonly manifest: InvestigativeSelectionManifest;
  readonly assertions: readonly AcceptedGraphAssertionRow[];
  readonly entities: readonly AcceptedGraphEntityRow[];
  readonly relationships: readonly AcceptedGraphRelationshipRow[];
  readonly metadata: InvestigativeContextPackMetadata;
}): readonly string[] {
  const refs = new Set<string>([input.manifest.manifestHash]);
  for (const ref of input.manifest.includedRefs) {
    refs.add(ref.refId);
    if (ref.contentHash !== undefined) {
      refs.add(ref.contentHash);
    }
    if (ref.rowHash !== undefined) {
      refs.add(ref.rowHash);
    }
    for (const eventId of ref.sourceEventIds) {
      refs.add(eventId);
    }
  }
  for (const row of input.assertions) {
    refs.add(row.assertionId);
    refs.add(row.evidenceId);
    refs.add(row.evidenceContentHash);
    refs.add(row.proposedByEventId);
    refs.add(row.acceptedByEventId);
    refs.add(row.rowHash);
    for (const eventId of row.sourceEventIds) {
      refs.add(eventId);
    }
  }
  for (const row of input.entities) {
    refs.add(row.entityId);
    refs.add(row.rowHash);
    for (const eventId of row.sourceEventIds) {
      refs.add(eventId);
    }
  }
  for (const row of input.relationships) {
    refs.add(row.relationshipId);
    refs.add(row.acceptedByEventId);
    refs.add(row.evidenceId);
    refs.add(row.evidenceContentHash);
    refs.add(row.rowHash);
    for (const eventId of row.sourceEventIds) {
      refs.add(eventId);
    }
  }
  refs.add(`policy:${input.metadata.policyVersion}`);
  refs.add(`ontology-core:${input.metadata.ontologyCoreVersion}`);
  for (const [packId, version] of Object.entries(input.metadata.packVersions)) {
    refs.add(`pack:${packId}@${version}`);
  }
  return Object.freeze([...refs].sort(compareText));
}

function buildAcceptedGraphResolvedPack(input: {
  readonly payload: AcceptedGraphProjectionPayload;
  readonly manifest: InvestigativeSelectionManifest;
  readonly now: () => string;
  readonly provenanceRefs: readonly string[];
  readonly stalenessInputs: readonly { readonly kind: string; readonly ref: string; readonly value: string }[];
  readonly policyVersion: string;
  readonly sizeBudgetBytes?: number;
}): ResolvedAcceptedGraphProjectionContextPack {
  return buildResolvedContextPack({
    contextPackId: "accepted-graph-projection.v1",
    version: 1,
    generatedAt: input.now(),
    payload: input.payload,
    safeSummary: "Provider-safe read-only graph projection",
    provenanceRefs: input.provenanceRefs,
    ...(input.manifest.sourceProjectionHighWaterMarks.graph === undefined
      ? {}
      : { projectionHighWaterMark: input.manifest.sourceProjectionHighWaterMarks.graph }),
    sourceEventIds: input.provenanceRefs.filter((ref) => ref.startsWith("evt_")),
    artifactHashes: input.provenanceRefs.filter((ref) => ref.startsWith("sha256:")),
    policyVersion: input.policyVersion,
    scope: input.manifest.scope,
    ...(input.sizeBudgetBytes === undefined ? {} : { sizeBudgetBytes: input.sizeBudgetBytes }),
    stalenessInputs: input.stalenessInputs
  }) as unknown as ResolvedAcceptedGraphProjectionContextPack;
}

interface EvidenceSummaryBudgetInput {
  readonly manifest: InvestigativeSelectionManifest;
  readonly metadata: InvestigativeContextPackMetadata;
  readonly items: readonly EvidenceSummaryItem[];
  readonly omissions: readonly InvestigativeContextOmissionAggregate[];
  readonly stalenessInputs: readonly { readonly kind: string; readonly ref: string; readonly value: string }[];
  readonly budget: number;
}

function fitEvidenceSummaryBudget(input: EvidenceSummaryBudgetInput): { readonly payload: EvidenceSummaryPayload } | undefined {
  let items = input.items;
  let omissions = input.omissions;
  while (true) {
    const payload = createEvidenceSummaryPayload({ ...input, items, omissions });
    const size = buildResolvedContextPack({
      contextPackId: "evidence-summary.v1",
      version: 1,
      generatedAt: "1970-01-01T00:00:00.000Z",
      payload,
      safeSummary: "Provider-safe evidence summary",
      provenanceRefs: ["evidence-summary-budget-probe"]
    }).ref.sizeBytes;
    if (size <= input.budget) {
      return { payload };
    }
    const trimmed = trimOneOptionalEvidenceDetail(items);
    if (trimmed === undefined) {
      return undefined;
    }
    items = trimmed.items;
    omissions = appendBudgetOmission(omissions, trimmed.omission);
  }
}

function createEvidenceSummaryPayload(input: Omit<EvidenceSummaryBudgetInput, "budget">): EvidenceSummaryPayload {
  return evidenceSummaryPayloadParser.parsePayload({
    schemaVersion: "evidence-summary.context.v1",
    contextPackId: "evidence-summary.v1",
    version: 1,
    ontologyCoreVersion: input.metadata.ontologyCoreVersion,
    scope: input.manifest.scope,
    truthBoundary: { evidenceIsReadOnly: true, rawContentExcluded: true },
    selectionManifest: input.manifest,
    projectionHighWaterMarks: input.manifest.sourceProjectionHighWaterMarks,
    packVersions: input.metadata.packVersions,
    items: input.items,
    omissions: input.omissions,
    stalenessInputs: input.stalenessInputs
  });
}

function buildEvidenceSummaryResolvedPack(input: {
  readonly payload: EvidenceSummaryPayload;
  readonly manifest: InvestigativeSelectionManifest;
  readonly now: () => string;
  readonly provenanceRefs: readonly string[];
  readonly stalenessInputs: readonly { readonly kind: string; readonly ref: string; readonly value: string }[];
  readonly policyVersion: string;
  readonly sizeBudgetBytes: number;
}): ResolvedEvidenceSummaryContextPack {
  return buildResolvedContextPack({
    contextPackId: "evidence-summary.v1",
    version: 1,
    generatedAt: input.now(),
    payload: input.payload,
    safeSummary: "Provider-safe evidence summary",
    provenanceRefs: input.provenanceRefs,
    projectionHighWaterMark: input.manifest.sourceProjectionHighWaterMarks.ingestion as number,
    sourceEventIds: input.provenanceRefs.filter((ref) => ref.startsWith("evt_")),
    artifactHashes: input.provenanceRefs.filter((ref) => ref.startsWith("sha256:")),
    policyVersion: input.policyVersion,
    scope: input.manifest.scope,
    sizeBudgetBytes: input.sizeBudgetBytes,
    stalenessInputs: input.stalenessInputs
  }) as unknown as ResolvedEvidenceSummaryContextPack;
}

function canonicalSelectionManifest(manifest: InvestigativeSelectionManifest): InvestigativeSelectionManifest {
  const body = canonicalSelectionManifestBody(manifest);
  return Object.freeze({ ...body, manifestHash: buildSelectionManifestHash(body) });
}

function canonicalMetadata(metadata: InvestigativeContextPackMetadata): InvestigativeContextPackMetadata {
  assertSafeNonEmptyText(metadata.policyVersion, "policyVersion");
  assertSafeNonEmptyText(metadata.ontologyCoreVersion, "ontologyCoreVersion");
  const entries = Object.entries(metadata.packVersions);
  if (entries.length === 0) {
    throw new InvestigativeContextPackError("missing-provenance", "packVersions must not be empty");
  }
  const packVersions = Object.fromEntries(entries
    .map(([packId, version]) => {
      assertSafeNonEmptyText(packId, "packVersions key");
      assertSafeNonEmptyText(version, "packVersions value");
      return [packId, version] as const;
    })
    .sort(([left], [right]) => compareText(left, right)));
  return Object.freeze({
    policyVersion: metadata.policyVersion,
    ontologyCoreVersion: metadata.ontologyCoreVersion,
    packVersions: Object.freeze(packVersions)
  });
}

function canonicalStalenessInputs(
  inputs: readonly { readonly kind: string; readonly ref: string; readonly value: string }[]
): readonly { readonly kind: string; readonly ref: string; readonly value: string }[] {
  return Object.freeze([...inputs]
    .map((input) => Object.freeze({ ...input }))
    .sort((left, right) => compareByFields([left.kind, left.ref, left.value], [right.kind, right.ref, right.value])));
}

function canonicalOmissions(
  omissions: readonly InvestigativeContextOmissionAggregate[]
): readonly InvestigativeContextOmissionAggregate[] {
  return canonicalSelectionManifestBody({
    manifestVersion: "investigative-selection-manifest.v1",
    scope: { kind: "selection", id: "omissions" },
    sourceProjectionHighWaterMarks: {},
    ordering: "ref-kind-ref-id-content-hash-v1",
    window: { cursor: "omissions", offset: 0, limit: 1, stableSort: "ref-kind-ref-id-content-hash-v1" },
    totalEligibleCount: 0,
    includedRefs: [],
    aggregateOmissions: omissions
  }).aggregateOmissions;
}

function trimOneOptionalEvidenceDetail(items: readonly EvidenceSummaryItem[]): {
  readonly items: readonly EvidenceSummaryItem[];
  readonly omission: InvestigativeContextOmissionAggregate;
} | undefined {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index]!;
    if (item.parseJobs.length > 0) {
      const parseJob = item.parseJobs[item.parseJobs.length - 1]!;
      return {
        items: Object.freeze(items.map((candidate, candidateIndex) => candidateIndex === index
          ? { ...candidate, parseJobs: candidate.parseJobs.slice(0, -1) }
          : candidate)),
        omission: {
          reasonCode: "budget-row-omitted",
          refKind: "parse-job",
          aggregateKey: "evidence-summary-optional-parse-detail",
          count: 1,
          sampleRefs: [{ refKind: "parse-job", refId: parseJob.parseJobId }]
        }
      };
    }
    const removedTagIndex = item.governanceTags.findIndex((tag) => tag.state === "removed");
    if (removedTagIndex >= 0) {
      const tag = item.governanceTags[removedTagIndex]!;
      return {
        items: Object.freeze(items.map((candidate, candidateIndex) => candidateIndex === index
          ? { ...candidate, governanceTags: candidate.governanceTags.filter((_, tagIndex) => tagIndex !== removedTagIndex) }
          : candidate)),
        omission: {
          reasonCode: "budget-row-omitted",
          refKind: "governance-tag",
          aggregateKey: "evidence-summary-optional-governance-detail",
          count: 1,
          sampleRefs: [{ refKind: "governance-tag", refId: `${item.evidenceId}:${tag.tag}` }]
        }
      };
    }
  }
  return undefined;
}

function appendBudgetOmission(
  omissions: readonly InvestigativeContextOmissionAggregate[],
  omission: InvestigativeContextOmissionAggregate
): readonly InvestigativeContextOmissionAggregate[] {
  const existing = omissions.find((candidate) => candidate.reasonCode === omission.reasonCode
    && candidate.refKind === omission.refKind && candidate.aggregateKey === omission.aggregateKey);
  if (existing === undefined) {
    return canonicalOmissions([...omissions, omission]);
  }
  return canonicalOmissions(omissions.map((candidate) => candidate === existing
    ? {
        ...candidate,
        count: candidate.count + omission.count,
        sampleRefs: canonicalSampleRefs([...(candidate.sampleRefs ?? []), ...(omission.sampleRefs ?? [])])
      }
    : candidate));
}

function canonicalSampleRefs(samples: readonly InvestigativeOmissionSampleRef[]): readonly InvestigativeOmissionSampleRef[] {
  return Object.freeze([...samples].sort(compareOmissionSampleRefs)
    .slice(0, investigativeContextPackDefaultLimits.omissionSampleLimit));
}

async function readSelectedEvidenceRows(
  reader: InvestigativeEvidenceReader,
  manifest: InvestigativeSelectionManifest,
  evidenceRefs: readonly InvestigativeSelectionIncludedRef[]
): Promise<ReadonlyMap<string, InvestigativeEvidenceRow>> {
  const rows = new Map<string, InvestigativeEvidenceRow>();
  for (let offset = 0; offset < evidenceRefs.length; offset += readerBatchSize) {
    const batch = evidenceRefs.slice(offset, offset + readerBatchSize);
    const batchRows = await reader.readEvidenceByIds({
      evidenceIds: batch.map((ref) => ref.refId),
      contentHashes: batch.map((ref) => ref.contentHash).filter((hash): hash is `sha256:${string}` => hash !== undefined),
      highWaterMarks: manifest.sourceProjectionHighWaterMarks,
      limit: readerBatchSize
    });
    for (const row of batchRows) {
      if (rows.has(row.evidenceId)) {
        throw new InvestigativeContextPackError("selection-row-mismatch", "selection-row-mismatch");
      }
      rows.set(row.evidenceId, row);
    }
  }
  if (rows.size !== evidenceRefs.length || [...rows.keys()].some((id) => !evidenceRefs.some((ref) => ref.refId === id))) {
    throw new InvestigativeContextPackError("selection-row-mismatch", "selection-row-mismatch");
  }
  return rows;
}

function assertEvidenceNarrativeSafety(row: InvestigativeEvidenceRow): void {
  try {
    if (row.safeNarrative !== undefined) {
      assertAgentSecretSafeText(row.safeNarrative, "safeNarrative");
    }
    for (const tag of row.governanceTags) {
      if (tag.safeRationale !== undefined) {
        assertAgentSecretSafeText(tag.safeRationale, "safeRationale");
      }
    }
  } catch {
    throw new InvestigativeContextPackError("secret-detected", "secret-detected");
  }
}

function assertEvidenceOptionalDetailProvenance(row: InvestigativeEvidenceRow): void {
  for (const parseJob of row.parseJobs) {
    if (parseJob.outputHash !== undefined && !isContentHash(parseJob.outputHash)) {
      throw new InvestigativeContextPackError("missing-provenance", "missing-provenance");
    }
    if (parseJob.terminalEventId !== undefined && !isEventId(parseJob.terminalEventId)) {
      throw new InvestigativeContextPackError("missing-provenance", "missing-provenance");
    }
  }
  for (const tag of row.governanceTags) {
    if (!isEventId(tag.eventId)) {
      throw new InvestigativeContextPackError("missing-provenance", "missing-provenance");
    }
  }
}

function toEvidenceSummaryItem(row: InvestigativeEvidenceRow): EvidenceSummaryItem {
  return {
    evidenceId: row.evidenceId,
    ingestionEventId: row.ingestionEventId,
    contentHash: row.contentHash,
    ...(row.mediaType === undefined ? {} : { mediaType: row.mediaType }),
    ...(row.sizeBytes === undefined ? {} : { sizeBytes: row.sizeBytes }),
    ...(row.sourceCollectionId === undefined ? {} : { sourceCollectionId: row.sourceCollectionId }),
    ...(row.scanBatchId === undefined ? {} : { scanBatchId: row.scanBatchId }),
    ...(row.importBatchId === undefined ? {} : { importBatchId: row.importBatchId }),
    occurrenceIds: Object.freeze([...row.occurrenceIds].sort(compareText)),
    parseJobs: Object.freeze([...row.parseJobs]
      .map((parseJob) => Object.freeze({ ...parseJob }))
      .sort(compareParseJobs)),
    governanceTags: Object.freeze([...row.governanceTags]
      .map((tag) => Object.freeze({ ...tag }))
      .sort(compareGovernanceTags)),
    ...(row.duplicateGroup === undefined ? {} : { duplicateGroup: row.duplicateGroup }),
    ...(row.safeNarrative === undefined ? {} : { safeNarrative: row.safeNarrative })
  };
}

function compareParseJobs(
  left: InvestigativeEvidenceRow["parseJobs"][number],
  right: InvestigativeEvidenceRow["parseJobs"][number]
): number {
  return compareByFields(
    [
      left.parseJobId,
      left.lane,
      left.parserName,
      left.parserVersion,
      left.state,
      left.outputHash ?? "",
      left.outputMediaType ?? "",
      left.terminalEventId ?? "",
      left.retryable === undefined ? "" : String(left.retryable)
    ],
    [
      right.parseJobId,
      right.lane,
      right.parserName,
      right.parserVersion,
      right.state,
      right.outputHash ?? "",
      right.outputMediaType ?? "",
      right.terminalEventId ?? "",
      right.retryable === undefined ? "" : String(right.retryable)
    ]
  );
}

function compareGovernanceTags(
  left: InvestigativeEvidenceRow["governanceTags"][number],
  right: InvestigativeEvidenceRow["governanceTags"][number]
): number {
  return compareByFields(
    [left.tag, left.source, left.state, left.eventId, left.confidence === undefined ? "" : String(left.confidence), left.safeRationale ?? ""],
    [right.tag, right.source, right.state, right.eventId, right.confidence === undefined ? "" : String(right.confidence), right.safeRationale ?? ""]
  );
}

function compareEvidenceRowsBySelectionOrder(
  left: InvestigativeEvidenceRow,
  right: InvestigativeEvidenceRow,
  rowOrder: ReadonlyMap<string, number>
): number {
  const orderDifference = (rowOrder.get(left.evidenceId) ?? Number.MAX_SAFE_INTEGER)
    - (rowOrder.get(right.evidenceId) ?? Number.MAX_SAFE_INTEGER);
  return orderDifference === 0 ? compareText(left.evidenceId, right.evidenceId) : orderDifference;
}

function parserIdentity(
  contextPackId: InvestigativeContextPackId,
  requiredPayloadSections: readonly string[]
): InvestigativePayloadParserIdentity {
  const parserSchemaVersion = "investigative-context-pack-payload-parser.v1";
  return Object.freeze({
    contextPackId,
    version: 1,
    parserSchemaVersion,
    parserHash: hashAgentContextPack({
      contextPackId,
      version: 1,
      parserSchemaVersion,
      requiredPayloadSections
    }) as `sha256:${string}`
  });
}

function createPayloadParser<Payload extends InvestigativeContextPackPayloadBase>(
  contextPackId: Payload["contextPackId"],
  schemaVersion: Payload["schemaVersion"],
  parseStrictPayload?: (payload: unknown) => Payload
): InvestigativeContextPackPayloadParser<Payload> {
  return Object.freeze({
    contextPackId,
    version: 1,
    parserIdentity: investigativePayloadParserIdentities[contextPackId],
    parsePayload(payload: unknown, ref?: ContextPackRef): Payload {
      if (!isPayloadWithIdentity(payload, contextPackId, schemaVersion)) {
        throw new InvestigativeContextPackError("context-payload-missing", "investigative-context-payload-invalid");
      }
      const parsedPayload = parseStrictPayload === undefined ? payload as Payload : parseStrictPayload(payload);
      assertPayloadMatchesContextPackRef(parsedPayload, ref);
      return parsedPayload;
    }
  });
}

function parseAcceptedGraphProjectionPayload(payload: unknown): AcceptedGraphProjectionPayload {
  if (!isPayloadWithExactKeys(payload, [
    "schemaVersion",
    "contextPackId",
    "version",
    "ontologyCoreVersion",
    "scope",
    "truthBoundary",
    "selectionManifest",
    "projectionHighWaterMarks",
    "packVersions",
    "items",
    "omissions",
    "stalenessInputs"
  ])) {
    throw new InvestigativeContextPackError("context-payload-missing", "accepted-graph payload invalid");
  }
  const value = payload as Record<string, unknown>;
  if (value.schemaVersion !== "accepted-graph-projection.context.v1"
    || value.contextPackId !== "accepted-graph-projection.v1" || value.version !== 1
    || !isSafeNonEmptyText(value.ontologyCoreVersion) || !isScope(value.scope)
    || !isAcceptedGraphTruthBoundary(value.truthBoundary) || !isSelectionManifest(value.selectionManifest)
    || !hasGraphHighWaterMark(value.projectionHighWaterMarks)
    || !hasGraphHighWaterMark((value.selectionManifest as Record<string, unknown>).sourceProjectionHighWaterMarks)
    || !sameScope(value.scope, (value.selectionManifest as Record<string, unknown>).scope)
    || !sameHighWaterMarks(value.projectionHighWaterMarks, (value.selectionManifest as Record<string, unknown>).sourceProjectionHighWaterMarks)
    || !isPackVersions(value.packVersions)
    || !isAcceptedGraphItems(value.items) || !Array.isArray(value.omissions) || !value.omissions.every(isOmission)
    || !Array.isArray(value.stalenessInputs) || value.stalenessInputs.length === 0
    || !value.stalenessInputs.every(isStalenessInput) || !hasGraphHighWaterStaleness(value.stalenessInputs)) {
    throw new InvestigativeContextPackError("context-payload-missing", "accepted-graph payload invalid");
  }
  return payload as unknown as AcceptedGraphProjectionPayload;
}

function parseEvidenceSummaryPayload(payload: unknown): EvidenceSummaryPayload {
  if (!isPayloadWithExactKeys(payload, [
    "schemaVersion",
    "contextPackId",
    "version",
    "ontologyCoreVersion",
    "scope",
    "truthBoundary",
    "selectionManifest",
    "projectionHighWaterMarks",
    "packVersions",
    "items",
    "omissions",
    "stalenessInputs"
  ])) {
    throw new InvestigativeContextPackError("context-payload-missing", "evidence-summary payload invalid");
  }
  const value = payload as Record<string, unknown>;
  if (value.schemaVersion !== "evidence-summary.context.v1" || value.contextPackId !== "evidence-summary.v1" || value.version !== 1
    || !isSafeNonEmptyText(value.ontologyCoreVersion) || !isScope(value.scope) || !isEvidenceTruthBoundary(value.truthBoundary)
    || !isSelectionManifest(value.selectionManifest) || !hasEvidenceHighWaterMark(value.projectionHighWaterMarks)
    || !hasEvidenceHighWaterMark((value.selectionManifest as Record<string, unknown>).sourceProjectionHighWaterMarks)
    || !sameScope(value.scope, (value.selectionManifest as Record<string, unknown>).scope)
    || !sameHighWaterMarks(value.projectionHighWaterMarks, (value.selectionManifest as Record<string, unknown>).sourceProjectionHighWaterMarks)
    || !isPackVersions(value.packVersions) || !Array.isArray(value.items) || !value.items.every(isEvidenceSummaryItem)
    || !Array.isArray(value.omissions) || !value.omissions.every(isOmission) || !Array.isArray(value.stalenessInputs)
    || value.stalenessInputs.length === 0 || !value.stalenessInputs.every(isStalenessInput)) {
    throw new InvestigativeContextPackError("context-payload-missing", "evidence-summary payload invalid");
  }
  return payload as unknown as EvidenceSummaryPayload;
}

function parseGovernanceLocksPayload(payload: unknown): GovernanceLocksPayload {
  if (!isPayloadWithExactKeys(payload, [
    "schemaVersion",
    "contextPackId",
    "version",
    "ontologyCoreVersion",
    "scope",
    "truthBoundary",
    "selectionManifest",
    "projectionHighWaterMarks",
    "packVersions",
    "items",
    "omissions",
    "stalenessInputs"
  ])) {
    throw new InvestigativeContextPackError("context-payload-missing", "governance-locks payload invalid");
  }
  const value = payload as Record<string, unknown>;
  if (value.schemaVersion !== "governance-locks.context.v1" || value.contextPackId !== "governance-locks.v1" || value.version !== 1
    || !isSafeNonEmptyText(value.ontologyCoreVersion) || !isScope(value.scope) || !isGovernanceTruthBoundary(value.truthBoundary)
    || !isSelectionManifest(value.selectionManifest) || !hasGovernanceHighWaterMarks(value.projectionHighWaterMarks)
    || !hasGovernanceHighWaterMarks((value.selectionManifest as Record<string, unknown>).sourceProjectionHighWaterMarks)
    || !sameScope(value.scope, (value.selectionManifest as Record<string, unknown>).scope)
    || !sameHighWaterMarks(value.projectionHighWaterMarks, (value.selectionManifest as Record<string, unknown>).sourceProjectionHighWaterMarks)
    || !isPackVersions(value.packVersions) || !isGovernanceLocksItems(value.items)
    || !Array.isArray(value.omissions) || !value.omissions.every(isOmission)
    || !Array.isArray(value.stalenessInputs) || value.stalenessInputs.length === 0
    || !value.stalenessInputs.every(isStalenessInput) || !hasGovernanceHighWaterStaleness(value.stalenessInputs)) {
    throw new InvestigativeContextPackError("context-payload-missing", "governance-locks payload invalid");
  }
  return payload as unknown as GovernanceLocksPayload;
}

function assertPayloadMatchesContextPackRef(payload: InvestigativeContextPackPayloadBase, ref: ContextPackRef | undefined): void {
  if (ref === undefined) {
    return;
  }
  if (ref.contextPackId !== payload.contextPackId || ref.version !== 1
    || ref.scope === undefined || !sameScope(ref.scope, payload.scope)) {
    throw new InvestigativeContextPackError("context-payload-missing", `${payload.contextPackId} payload invalid`);
  }
  const expectedHighWaterMark = refProjectionHighWaterMarkForPayload(payload);
  if (expectedHighWaterMark === undefined || ref.projectionHighWaterMark !== expectedHighWaterMark) {
    throw new InvestigativeContextPackError("context-payload-missing", `${payload.contextPackId} payload invalid`);
  }
}

function refProjectionHighWaterMarkForPayload(payload: InvestigativeContextPackPayloadBase): number | undefined {
  if (payload.contextPackId === "accepted-graph-projection.v1") {
    return payload.projectionHighWaterMarks.graph;
  }
  if (payload.contextPackId === "evidence-summary.v1") {
    return payload.projectionHighWaterMarks.ingestion;
  }
  if (payload.projectionHighWaterMarks.governance === undefined || payload.projectionHighWaterMarks.agent === undefined) {
    return undefined;
  }
  return Math.max(payload.projectionHighWaterMarks.governance, payload.projectionHighWaterMarks.agent);
}

function isAcceptedGraphTruthBoundary(value: unknown): boolean {
  return isExactRecord(value, [
    "authoritativeForAcceptedGraph",
    "readOnlyProjectionTruth",
    "canInferNewAcceptedEdges",
    "graphMutationRequiresReviewedOntologyEvent"
  ]) && value.authoritativeForAcceptedGraph === true && value.readOnlyProjectionTruth === true
    && value.canInferNewAcceptedEdges === false && value.graphMutationRequiresReviewedOntologyEvent === true;
}

function isGovernanceTruthBoundary(value: unknown): boolean {
  return isExactRecord(value, [
    "authoritativeForApproval",
    "grantsApproval",
    "clearsApprovalOrLocks",
    "mutatesEvidenceOrGraph",
    "postureKind"
  ]) && value.authoritativeForApproval === false && value.grantsApproval === false
    && value.clearsApprovalOrLocks === false && value.mutatesEvidenceOrGraph === false
    && value.postureKind === "non-authoritative-safety-posture";
}

function isGovernanceLocksItems(value: unknown): boolean {
  return isExactRecord(value, ["activeLocks", "governanceRestrictions"])
    && Array.isArray(value.activeLocks) && value.activeLocks.every(isResidentAgentLockItem)
    && Array.isArray(value.governanceRestrictions) && value.governanceRestrictions.every(isGovernanceRestrictionItem);
}

function isResidentAgentLockItem(value: unknown): boolean {
  return isExactRecord(value, [
    "sourceLabel",
    "lockId",
    "lockKind",
    "safeReason",
    "activatedBy",
    "activatedAt",
    "relatedEventIds",
    "projectionEventIds"
  ]) && value.sourceLabel === "resident-agent-lock" && isSafeNonEmptyText(value.lockId)
    && isSafeNonEmptyText(value.lockKind) && isSafeNonEmptyText(value.safeReason)
    && isSafeNonEmptyText(value.activatedBy) && isSafeNonEmptyText(value.activatedAt)
    && Array.isArray(value.relatedEventIds) && value.relatedEventIds.length > 0
    && value.relatedEventIds.every(isEventId) && Array.isArray(value.projectionEventIds)
    && value.projectionEventIds.length > 0 && value.projectionEventIds.every(isEventId);
}

function isGovernanceRestrictionItem(value: unknown): boolean {
  return isExactRecord(value, [
    "sourceLabel",
    "restrictionId",
    "restrictionKind",
    "affectedRef",
    "sourceEventIds",
    "projectionProvenanceRefs",
    "policyVersion",
    "safeReasonCode"
  ]) && value.sourceLabel === "governance-derived-restriction" && isSafeNonEmptyText(value.restrictionId)
    && isSafeNonEmptyText(value.restrictionKind) && isSafeNonEmptyText(value.affectedRef)
    && Array.isArray(value.sourceEventIds) && value.sourceEventIds.length > 0 && value.sourceEventIds.every(isEventId)
    && Array.isArray(value.projectionProvenanceRefs) && value.projectionProvenanceRefs.length > 0
    && value.projectionProvenanceRefs.every(isSafeNonEmptyText) && isSafeNonEmptyText(value.policyVersion)
    && isSafeNonEmptyText(value.safeReasonCode);
}

function isAcceptedGraphItems(value: unknown): boolean {
  return isExactRecord(value, ["assertions", "entities", "relationships"])
    && Array.isArray(value.assertions) && value.assertions.every(isAcceptedGraphAssertionItem)
    && Array.isArray(value.entities) && value.entities.every(isAcceptedGraphEntityItem)
    && Array.isArray(value.relationships) && value.relationships.every(isAcceptedGraphRelationshipItem);
}

function isAcceptedGraphAssertionItem(value: unknown): boolean {
  return isExactRecord(value, [
    "assertionId",
    "evidenceId",
    "evidenceContentHash",
    "proposedByEventId",
    "acceptedByEventId",
    "sourceEventIds",
    "rowHash",
    "safeStatement"
  ]) && isSafeNonEmptyText(value.assertionId) && isSafeNonEmptyText(value.evidenceId)
    && isContentHash(value.evidenceContentHash) && isEventId(value.proposedByEventId)
    && isEventId(value.acceptedByEventId) && Array.isArray(value.sourceEventIds)
    && value.sourceEventIds.length > 0 && value.sourceEventIds.every(isEventId)
    && value.sourceEventIds.includes(value.proposedByEventId) && value.sourceEventIds.includes(value.acceptedByEventId)
    && isContentHash(value.rowHash) && isSafeNonEmptyText(value.safeStatement);
}

function isAcceptedGraphEntityItem(value: unknown): boolean {
  return isExactRecord(value, ["entityId", "rowHash", "safeLabel", "sourceEventIds"])
    && isSafeNonEmptyText(value.entityId) && isContentHash(value.rowHash) && isSafeNonEmptyText(value.safeLabel)
    && Array.isArray(value.sourceEventIds) && value.sourceEventIds.length > 0
    && value.sourceEventIds.every(isEventId);
}

function isAcceptedGraphRelationshipItem(value: unknown): boolean {
  return isExactRecord(value, [
    "relationshipId",
    "acceptedByEventId",
    "evidenceId",
    "evidenceContentHash",
    "sourceEventIds",
    "rowHash",
    "sourceEntityId",
    "targetEntityId",
    "relationshipType"
  ]) && isSafeNonEmptyText(value.relationshipId) && isEventId(value.acceptedByEventId)
    && isSafeNonEmptyText(value.evidenceId) && isContentHash(value.evidenceContentHash)
    && Array.isArray(value.sourceEventIds) && value.sourceEventIds.length > 0
    && value.sourceEventIds.every(isEventId) && value.sourceEventIds.includes(value.acceptedByEventId) && isContentHash(value.rowHash)
    && isSafeNonEmptyText(value.sourceEntityId) && isSafeNonEmptyText(value.targetEntityId)
    && isSafeNonEmptyText(value.relationshipType);
}

function hasGraphHighWaterMark(value: unknown): boolean {
  return isHighWaterMarks(value) && isNonnegativeInteger((value as Record<string, unknown>).graph);
}

function hasEvidenceHighWaterMark(value: unknown): boolean {
  return isHighWaterMarks(value) && isNonnegativeInteger((value as Record<string, unknown>).ingestion);
}

function hasGovernanceHighWaterMarks(value: unknown): boolean {
  return isHighWaterMarks(value) && isNonnegativeInteger((value as Record<string, unknown>).governance)
    && isNonnegativeInteger((value as Record<string, unknown>).agent);
}

function hasGraphHighWaterStaleness(value: readonly unknown[]): boolean {
  return value.some((input) => isExactRecord(input, ["kind", "ref", "value"])
    && input.kind === "projection-high-water-mark" && input.ref === "graph" && isSafeNonEmptyText(input.value));
}

function hasGovernanceHighWaterStaleness(value: readonly unknown[]): boolean {
  const highWaterRefs = new Set(value
    .filter(isProjectionHighWaterStalenessInput)
    .map((input) => input.ref));
  return highWaterRefs.has("governance") && highWaterRefs.has("agent");
}

function isProjectionHighWaterStalenessInput(value: unknown): value is { readonly kind: string; readonly ref: string; readonly value: string } {
  return isExactRecord(value, ["kind", "ref", "value"])
    && value.kind === "projection-high-water-mark" && isSafeNonEmptyText(value.ref) && isSafeNonEmptyText(value.value);
}

function isScope(value: unknown): value is InvestigativeContextPackScope {
  return isExactRecord(value, ["kind", "id"]) && isSafeNonEmptyText(value.kind) && isSafeNonEmptyText(value.id);
}

function sameScope(left: unknown, right: unknown): boolean {
  return isScope(left) && isScope(right) && left.kind === right.kind && left.id === right.id;
}

function sameHighWaterMarks(left: unknown, right: unknown): boolean {
  if (!isHighWaterMarks(left) || !isHighWaterMarks(right)) {
    return false;
  }
  const leftEntries = Object.entries(left).sort(([leftKey], [rightKey]) => compareText(leftKey, rightKey));
  const rightEntries = Object.entries(right).sort(([leftKey], [rightKey]) => compareText(leftKey, rightKey));
  return leftEntries.length === rightEntries.length
    && leftEntries.every(([key, value], index) => key === rightEntries[index]![0] && value === rightEntries[index]![1]);
}

function isEvidenceTruthBoundary(value: unknown): boolean {
  return isExactRecord(value, ["evidenceIsReadOnly", "rawContentExcluded"])
    && value.evidenceIsReadOnly === true && value.rawContentExcluded === true;
}

function isHighWaterMarks(value: unknown): value is Record<string, number> {
  return isPlainObject(value) && Object.values(value).every(isNonnegativeInteger);
}

function isPackVersions(value: unknown): boolean {
  return isPlainObject(value) && Object.keys(value).length > 0
    && Object.entries(value).every(([packId, version]) => isSafeNonEmptyText(packId) && isSafeNonEmptyText(version));
}

function isStalenessInput(value: unknown): boolean {
  return isExactRecord(value, ["kind", "ref", "value"])
    && isSafeNonEmptyText(value.kind) && isSafeNonEmptyText(value.ref) && isSafeNonEmptyText(value.value);
}

function isOmission(value: unknown): boolean {
  if (!isPlainObject(value) || !hasOnlyKeys(value, ["reasonCode", "refKind", "aggregateKey", "count", "sampleRefs"])
    || !hasRequiredKeys(value, ["reasonCode", "refKind", "aggregateKey", "count"])
    || !isSafeNonEmptyText(value.reasonCode) || !isSafeNonEmptyText(value.refKind)
    || !isSafeNonEmptyText(value.aggregateKey) || !isPositiveInteger(value.count)) {
    return false;
  }
  return value.sampleRefs === undefined || (Array.isArray(value.sampleRefs) && value.sampleRefs.every(isOmissionSampleRef));
}

function isOmissionSampleRef(value: unknown): boolean {
  return isPlainObject(value) && hasOnlyKeys(value, ["refKind", "refId", "contentHash"])
    && hasRequiredKeys(value, ["refKind", "refId"])
    && isSafeNonEmptyText(value.refKind) && isSafeNonEmptyText(value.refId)
    && (value.contentHash === undefined || isContentHash(value.contentHash));
}

function isEvidenceSummaryItem(value: unknown): boolean {
  if (!isPlainObject(value) || !hasOnlyKeys(value, [
    "evidenceId", "ingestionEventId", "contentHash", "mediaType", "sizeBytes", "sourceCollectionId", "scanBatchId", "importBatchId",
    "occurrenceIds", "parseJobs", "governanceTags", "duplicateGroup", "safeNarrative"
  ]) || !hasRequiredKeys(value, ["evidenceId", "ingestionEventId", "contentHash", "occurrenceIds", "parseJobs", "governanceTags"])
    || !isSafeNonEmptyText(value.evidenceId) || !isSafeNonEmptyText(value.ingestionEventId) || !isContentHash(value.contentHash)
    || !Array.isArray(value.occurrenceIds) || !value.occurrenceIds.every(isSafeNonEmptyText)
    || !Array.isArray(value.parseJobs) || !value.parseJobs.every(isParseJob)
    || !Array.isArray(value.governanceTags) || !value.governanceTags.every(isGovernanceTag)) {
    return false;
  }
  return (value.mediaType === undefined || isSafeNonEmptyText(value.mediaType))
    && (value.sizeBytes === undefined || isNonnegativeInteger(value.sizeBytes))
    && (value.sourceCollectionId === undefined || isSafeNonEmptyText(value.sourceCollectionId))
    && (value.scanBatchId === undefined || isSafeNonEmptyText(value.scanBatchId))
    && (value.importBatchId === undefined || isSafeNonEmptyText(value.importBatchId))
    && (value.safeNarrative === undefined || isSafeNonEmptyText(value.safeNarrative))
    && (value.duplicateGroup === undefined || (isExactRecord(value.duplicateGroup, ["groupId", "memberCount"])
      && isSafeNonEmptyText(value.duplicateGroup.groupId) && isPositiveInteger(value.duplicateGroup.memberCount)));
}

function isParseJob(value: unknown): boolean {
  return isPlainObject(value) && hasOnlyKeys(value, ["parseJobId", "lane", "parserName", "parserVersion", "state", "outputHash", "outputMediaType", "terminalEventId", "retryable"])
    && hasRequiredKeys(value, ["parseJobId", "lane", "parserName", "parserVersion", "state"])
    && isSafeNonEmptyText(value.parseJobId) && isSafeNonEmptyText(value.lane) && isSafeNonEmptyText(value.parserName)
    && isSafeNonEmptyText(value.parserVersion) && isSafeNonEmptyText(value.state)
    && (value.outputHash === undefined || isContentHash(value.outputHash))
    && (value.outputMediaType === undefined || isSafeNonEmptyText(value.outputMediaType))
    && (value.terminalEventId === undefined || isEventId(value.terminalEventId))
    && (value.retryable === undefined || typeof value.retryable === "boolean");
}

function isGovernanceTag(value: unknown): boolean {
  return isPlainObject(value) && hasOnlyKeys(value, ["tag", "source", "state", "confidence", "safeRationale", "eventId"])
    && hasRequiredKeys(value, ["tag", "source", "state", "eventId"])
    && isSafeNonEmptyText(value.tag) && (value.source === "ai" || value.source === "human")
    && (value.state === "active" || value.state === "removed") && isEventId(value.eventId)
    && (value.confidence === undefined || (typeof value.confidence === "number" && value.confidence >= 0 && value.confidence <= 1))
    && (value.safeRationale === undefined || isSafeNonEmptyText(value.safeRationale));
}

function isSelectionManifest(value: unknown): boolean {
  if (!isExactRecord(value, ["manifestVersion", "scope", "sourceProjectionHighWaterMarks", "ordering", "window", "totalEligibleCount", "includedRefs", "aggregateOmissions", "manifestHash"])
    || value.manifestVersion !== "investigative-selection-manifest.v1" || value.ordering !== "ref-kind-ref-id-content-hash-v1"
    || !isScope(value.scope) || !isHighWaterMarks(value.sourceProjectionHighWaterMarks) || !isSelectionWindow(value.window)
    || !isNonnegativeInteger(value.totalEligibleCount) || !Array.isArray(value.includedRefs)
    || !value.includedRefs.every(isIncludedRef) || !Array.isArray(value.aggregateOmissions) || !value.aggregateOmissions.every(isOmission)
    || !isContentHash(value.manifestHash)) {
    return false;
  }
  try {
    assertSelectionManifestHash(value as unknown as InvestigativeSelectionManifest);
    return true;
  } catch {
    return false;
  }
}

function isSelectionWindow(value: unknown): boolean {
  return isExactRecord(value, ["cursor", "offset", "limit", "stableSort"]) && isSafeNonEmptyText(value.cursor)
    && isNonnegativeInteger(value.offset) && isPositiveInteger(value.limit)
    && value.stableSort === "ref-kind-ref-id-content-hash-v1";
}

function isIncludedRef(value: unknown): boolean {
  return isPlainObject(value) && hasOnlyKeys(value, ["refKind", "refId", "sortKey", "contentHash", "rowHash", "sourceEventIds", "mandatory"])
    && hasRequiredKeys(value, ["refKind", "refId", "sortKey", "sourceEventIds", "mandatory"])
    && isSafeNonEmptyText(value.refKind) && isSafeNonEmptyText(value.refId) && isSafeNonEmptyText(value.sortKey)
    && Array.isArray(value.sourceEventIds) && value.sourceEventIds.every(isSafeNonEmptyText) && typeof value.mandatory === "boolean"
    && (value.contentHash === undefined || isContentHash(value.contentHash)) && (value.rowHash === undefined || isContentHash(value.rowHash));
}

function isExactRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return isPlainObject(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function hasRequiredKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => Object.hasOwn(value, key));
}

function isSafeNonEmptyText(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) {
    return false;
  }
  try {
    assertAgentSecretSafeText(value, "evidence-summary payload");
    return true;
  } catch {
    return false;
  }
}

function isNonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return isNonnegativeInteger(value) && value > 0;
}

function assertSafeNonEmptyText(value: string, label: string): void {
  if (!isSafeNonEmptyText(value)) {
    throw new InvestigativeContextPackError("secret-detected", `${label} must be non-empty and secret-safe`);
  }
}

function isContentHash(value: unknown): value is `sha256:${string}` {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
}

function isEventId(value: unknown): value is string {
  return typeof value === "string" && /^evt_[a-zA-Z0-9_-]+$/.test(value) && isSafeNonEmptyText(value);
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  if (leftSet.size !== rightSet.size) {
    return false;
  }
  for (const value of leftSet) {
    if (!rightSet.has(value)) {
      return false;
    }
  }
  return true;
}

function isPayloadWithExactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return isPlainObject(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isPayloadWithIdentity(
  value: unknown,
  contextPackId: InvestigativeContextPackId,
  schemaVersion: string
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
    && !Array.isArray(value)
    && (value as Record<string, unknown>).contextPackId === contextPackId
    && (value as Record<string, unknown>).schemaVersion === schemaVersion;
}

function canonicalSelectionManifestBody(
  manifest: InvestigativeSelectionManifestBody | InvestigativeSelectionManifest
): InvestigativeSelectionManifestBody {
  return Object.freeze({
    manifestVersion: manifest.manifestVersion,
    scope: Object.freeze({ ...manifest.scope }),
    sourceProjectionHighWaterMarks: Object.freeze({ ...manifest.sourceProjectionHighWaterMarks }),
    ordering: manifest.ordering,
    window: Object.freeze({ ...manifest.window }),
    totalEligibleCount: manifest.totalEligibleCount,
    includedRefs: Object.freeze([...manifest.includedRefs]
      .sort(compareIncludedRefs)
      .map((ref) => Object.freeze({
      refKind: ref.refKind,
      refId: ref.refId,
      sortKey: ref.sortKey,
      ...(ref.contentHash === undefined ? {} : { contentHash: ref.contentHash }),
      ...(ref.rowHash === undefined ? {} : { rowHash: ref.rowHash }),
      sourceEventIds: Object.freeze([...ref.sourceEventIds].sort(compareText)),
      mandatory: ref.mandatory
    }))),
    aggregateOmissions: Object.freeze([...manifest.aggregateOmissions]
      .sort(compareOmissionAggregates)
      .map((omission) => Object.freeze({
      reasonCode: omission.reasonCode,
      refKind: omission.refKind,
      aggregateKey: omission.aggregateKey,
      count: omission.count,
      ...(omission.sampleRefs === undefined
        ? {}
        : {
            sampleRefs: Object.freeze([...omission.sampleRefs]
              .sort(compareOmissionSampleRefs)
              .map((sample) => Object.freeze({ ...sample })))
          })
    })))
  });
}

function compareIncludedRefs(left: InvestigativeSelectionIncludedRef, right: InvestigativeSelectionIncludedRef): number {
  return compareByFields(
    [left.sortKey, left.refKind, left.refId, left.contentHash ?? "", left.rowHash ?? ""],
    [right.sortKey, right.refKind, right.refId, right.contentHash ?? "", right.rowHash ?? ""]
  );
}

function compareOmissionAggregates(
  left: InvestigativeContextOmissionAggregate,
  right: InvestigativeContextOmissionAggregate
): number {
  return compareByFields(
    [left.reasonCode, left.refKind, left.aggregateKey],
    [right.reasonCode, right.refKind, right.aggregateKey]
  );
}

function compareOmissionSampleRefs(left: InvestigativeOmissionSampleRef, right: InvestigativeOmissionSampleRef): number {
  return compareByFields(
    [left.refKind, left.refId, left.contentHash ?? ""],
    [right.refKind, right.refId, right.contentHash ?? ""]
  );
}

function compareByFields(left: readonly string[], right: readonly string[]): number {
  for (let index = 0; index < left.length; index += 1) {
    const comparison = compareText(left[index]!, right[index]!);
    if (comparison !== 0) {
      return comparison;
    }
  }
  return 0;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
