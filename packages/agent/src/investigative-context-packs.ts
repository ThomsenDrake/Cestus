import {
  hashAgentContextPack,
  type AgentContextPackJsonValue,
  type ContextPackDescriptor
} from "./context-packs.js";

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
  parsePayload(payload: unknown): Payload;
}

export interface AcceptedGraphProjectionPayload extends InvestigativeContextPackPayloadBase {
  readonly schemaVersion: "accepted-graph-projection.context.v1";
  readonly contextPackId: "accepted-graph-projection.v1";
  readonly truthBoundary: {
    readonly authoritativeForAcceptedGraph: true;
    readonly readOnlyProjectionTruth: true;
    readonly canInferNewAcceptedEdges: false;
    readonly graphMutationRequiresReviewedOntologyEvent: true;
  };
  readonly items: {
    readonly assertions: readonly AgentContextPackJsonValue[];
    readonly entities: readonly AgentContextPackJsonValue[];
    readonly relationships: readonly AgentContextPackJsonValue[];
  };
}

export interface EvidenceSummaryPayload extends InvestigativeContextPackPayloadBase {
  readonly schemaVersion: "evidence-summary.context.v1";
  readonly contextPackId: "evidence-summary.v1";
  readonly items: readonly AgentContextPackJsonValue[];
}

export interface GovernanceLocksPayload extends InvestigativeContextPackPayloadBase {
  readonly schemaVersion: "governance-locks.context.v1";
  readonly contextPackId: "governance-locks.v1";
  readonly truthBoundary: {
    readonly authoritativeForApproval: false;
    readonly grantsApproval: false;
    readonly clearsApprovalOrLocks: false;
    readonly mutatesEvidenceOrGraph: false;
    readonly postureKind: "non-authoritative-safety-posture";
  };
  readonly items: {
    readonly activeLocks: readonly AgentContextPackJsonValue[];
    readonly governanceRestrictions: readonly AgentContextPackJsonValue[];
  };
}

export const investigativePayloadParserIdentities = Object.freeze({
  "accepted-graph-projection.v1": parserIdentity("accepted-graph-projection.v1", ["assertions", "entities", "relationships"]),
  "evidence-summary.v1": parserIdentity("evidence-summary.v1", ["evidence", "sourcePosture", "governanceTags"]),
  "governance-locks.v1": parserIdentity("governance-locks.v1", ["activeLocks", "governanceRestrictions", "truthBoundary"])
} satisfies Readonly<Record<InvestigativeContextPackId, InvestigativePayloadParserIdentity>>);

export const acceptedGraphProjectionPayloadParser = createPayloadParser<AcceptedGraphProjectionPayload>(
  "accepted-graph-projection.v1",
  "accepted-graph-projection.context.v1"
);
export const evidenceSummaryPayloadParser = createPayloadParser<EvidenceSummaryPayload>(
  "evidence-summary.v1",
  "evidence-summary.context.v1"
);
export const governanceLocksPayloadParser = createPayloadParser<GovernanceLocksPayload>(
  "governance-locks.v1",
  "governance-locks.context.v1"
);
export const investigativeContextPackPayloadParsers = Object.freeze([
  acceptedGraphProjectionPayloadParser,
  evidenceSummaryPayloadParser,
  governanceLocksPayloadParser
] as const);

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
  schemaVersion: Payload["schemaVersion"]
): InvestigativeContextPackPayloadParser<Payload> {
  return Object.freeze({
    contextPackId,
    version: 1,
    parserIdentity: investigativePayloadParserIdentities[contextPackId],
    parsePayload(payload: unknown): Payload {
      if (!isPayloadWithIdentity(payload, contextPackId, schemaVersion)) {
        throw new InvestigativeContextPackError("context-payload-missing", "investigative-context-payload-invalid");
      }
      return payload as Payload;
    }
  });
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
