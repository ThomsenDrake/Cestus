import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import {
  serializeContextPackPayload,
  verifyResolvedContextPack,
  type ContextPackRef,
  type ResolvedContextPack
} from "./context-packs.js";
import {
  buildSpecialistHandoffMaterial,
  canonicalSpecialistHandoffMaterialBytes,
  type SpecialistHandoffMaterial
} from "./specialist-handoff-manifest.js";
import {
  validateProductionSpecialistProviderOutput,
  type ContradictionFinderCandidatesOutput,
  type TimelineBuilderSourcedTimelineOutput
} from "./production-specialist-output-contracts.js";
import {
  normalizeSpecialistJsonValue,
  serializeSpecialistLocalArtifact
} from "./specialist-runner-kernel.js";

type SourcedInvestigationRunType = "timeline-builder" | "contradiction-finder";
type ContentHash = `sha256:${string}`;

export interface SourcedInvestigationArtifactStore {
  put(content: Buffer): Promise<{ readonly contentHash: ContentHash; readonly sizeBytes: number }>;
  get(contentHash: ContentHash): Promise<Buffer>;
}

export type SourcedInvestigationExecution =
  | {
      readonly mode: "local" | "fake";
      invoke(): Promise<unknown> | unknown;
    }
  | {
      readonly mode: "remote";
      invoke(): Promise<unknown> | unknown;
    };

export interface ExecuteSourcedInvestigationWorkflowInput {
  readonly runType: SourcedInvestigationRunType;
  readonly runId: string;
  readonly taskId: string;
  readonly contextPacks: readonly ResolvedContextPack[];
  readonly promptArtifactHash: ContentHash;
  readonly promptArtifactBytes: Buffer;
  readonly artifactStore: SourcedInvestigationArtifactStore;
  readonly execution: SourcedInvestigationExecution;
}

export interface SourcedTimelineArtifact {
  readonly schemaVersion: "sourced-timeline-artifact.v1";
  readonly runId: string;
  readonly taskId: string;
  readonly truthBoundary: {
    readonly advisoryOnly: true;
    readonly acceptedGraphMutationAllowed: false;
    readonly publicationAllowed: false;
  };
  readonly items: readonly SourcedTimelineArtifactItem[];
  readonly omittedSources: readonly {
    readonly sourceRef: string;
    readonly reason: string;
  }[];
  readonly omissionReasons: readonly string[];
  readonly unresolvedPrompts: readonly string[];
  readonly contextPackRefs: readonly ContextPackRef[];
}

export interface SourcedTimelineArtifactItem {
  readonly itemId: string;
  readonly date?: string;
  readonly dateRange?: { readonly start: string; readonly end: string };
  readonly precision: "year" | "month" | "day" | "range" | "unknown";
  readonly summary: string;
  readonly evidence: readonly EvidenceCitation[];
  readonly assertions: readonly AssertionCitation[];
  readonly prrEvents: readonly PrrEventCitation[];
  readonly contentHashRefs: readonly ContentHash[];
  readonly uncertainty: {
    readonly categories: readonly string[];
    readonly notes: readonly string[];
    readonly sourceRefs: readonly string[];
  };
}

export interface ContradictionCandidateDossier {
  readonly schemaVersion: "contradiction-candidate-dossier.v1";
  readonly runId: string;
  readonly taskId: string;
  readonly truthBoundary: {
    readonly advisoryOnly: true;
    readonly canRejectAssertion: false;
    readonly canContestAssertion: false;
    readonly canSupersedeAssertion: false;
    readonly canRelinkClaim: false;
    readonly acceptedGraphMutationAllowed: false;
    readonly publicationAllowed: false;
  };
  readonly candidates: readonly ContradictionCandidateArtifact[];
  readonly contextPackRefs: readonly ContextPackRef[];
}

export interface ContradictionCandidateArtifact {
  readonly candidateId: string;
  readonly comparedSourceRefs: readonly string[];
  readonly evidence: readonly EvidenceCitation[];
  readonly assertions: readonly AssertionCitation[];
  readonly prrEvents: readonly PrrEventCitation[];
  readonly timelineItemIds: readonly string[];
  readonly evidenceContentHashes: readonly ContentHash[];
  readonly category: string;
  readonly rationale: string;
  readonly confidence: number;
  readonly confidenceCaveat: string;
  readonly uncertaintyRefs: readonly string[];
  readonly alternativeExplanations: readonly string[];
  readonly requestedFollowupEvidence: readonly string[];
  readonly requiredReviewerAction: "review" | "request-evidence" | "request-claim-link-review";
}

export type SourcedInvestigationArtifact = SourcedTimelineArtifact | ContradictionCandidateDossier;

export interface ExecuteSourcedInvestigationWorkflowResult {
  readonly artifact: SourcedInvestigationArtifact;
  readonly artifactHash: ContentHash;
  readonly artifactBytes: Buffer;
  readonly handoffMaterial: SpecialistHandoffMaterial;
  readonly handoffMaterialBytes: Buffer;
}

interface EvidenceCitation {
  readonly evidenceId: string;
  readonly contentHash: ContentHash;
  readonly ingestionEventId: string;
}

interface AssertionCitation {
  readonly assertionId: string;
  readonly evidenceId: string;
  readonly evidenceContentHash: ContentHash;
  readonly proposedByEventId: string;
  readonly acceptedByEventId: string;
  readonly sourceEventIds: readonly string[];
  readonly rowHash?: ContentHash;
}

interface PrrEventCitation {
  readonly eventId: string;
  readonly type?: string;
  readonly occurredAt?: string;
  readonly contentHashes: readonly ContentHash[];
}

interface TimelineCitation {
  readonly itemId: string;
  readonly artifactHashes: readonly ContentHash[];
}

interface SourceCatalog {
  readonly evidence: ReadonlyMap<string, EvidenceCitation>;
  readonly assertions: ReadonlyMap<string, AssertionCitation>;
  readonly prrEvents: ReadonlyMap<string, PrrEventCitation>;
  readonly timelineItems: ReadonlyMap<string, TimelineCitation>;
  readonly sourceEventIds: readonly string[];
  readonly allRefs: ReadonlySet<string>;
}

export async function executeSourcedInvestigationWorkflow(
  rawInput: ExecuteSourcedInvestigationWorkflowInput
): Promise<ExecuteSourcedInvestigationWorkflowResult> {
  const input = normalizeInput(rawInput);
  if (input.execution.mode === "remote") {
    throw new Error(
      "Remote context transfer is blocked until exact provider byte-transfer approval is validated by the authority-bound specialist runner."
    );
  }

  const contextPacks = Object.freeze(input.contextPacks.map((pack) => verifyResolvedContextPack(pack)));
  const contextPackRefs = Object.freeze(contextPacks.map((pack) => pack.ref));
  assertExactContextPackIdentities(input.runType, contextPackRefs);
  const catalog = buildSourceCatalog(contextPacks);
  if (catalog.sourceEventIds.length === 0) {
    throw new Error("Sourced investigation context requires exact source-event provenance.");
  }

  const rawOutput = await input.execution.invoke();
  const artifact = input.runType === "timeline-builder"
    ? buildTimelineArtifact(input, contextPackRefs, catalog, rawOutput)
    : buildContradictionDossier(input, contextPackRefs, catalog, rawOutput);
  const artifactBytes = serializeSpecialistLocalArtifact(artifact);
  const artifactHash = hashBytes(artifactBytes);
  for (const pack of contextPacks) {
    await putAndReadExact(
      input.artifactStore,
      pack.ref.contentHash as ContentHash,
      Buffer.from(serializeContextPackPayload(pack.payload))
    );
  }
  await putAndReadExact(input.artifactStore, input.promptArtifactHash, input.promptArtifactBytes);
  await putAndReadExact(input.artifactStore, artifactHash, artifactBytes);

  const outputArtifact = input.runType === "timeline-builder"
    ? Object.freeze({
        artifactId: `artifact_${input.runId}_timeline`,
        artifactKind: "timeline-artifact",
        schemaId: "timeline-builder-handoff.v1",
        artifactHash,
        safeSummary: "Local sourced timeline artifact is ready for human review."
      })
    : Object.freeze({
        artifactId: `artifact_${input.runId}_contradictions`,
        artifactKind: "contradiction-candidate-dossier",
        schemaId: "contradiction-finder-handoff.v1",
        artifactHash,
        safeSummary: "Local contradiction candidates are advisory and ready for human review."
      });
  const handoffMaterial = buildSpecialistHandoffMaterial({
    status: "ready-for-review",
    safeSummary: input.runType === "timeline-builder"
      ? "A sourced local timeline is ready for human review."
      : "A local contradiction-candidate dossier is ready for human review.",
    contextPackRefs,
    promptArtifactHash: input.promptArtifactHash,
    outputArtifacts: [outputArtifact],
    toolRequestIds: [],
    approvalRequirements: [],
    nextSafeActions: [{
      actionId: `action_${input.runId}_review`,
      label: input.runType === "timeline-builder"
        ? "Review the sourced timeline"
        : "Review the contradiction candidates",
      kind: "review",
      effect: "none",
      artifactId: outputArtifact.artifactId
    }],
    sourceEventIds: catalog.sourceEventIds,
    relatedEventIds: catalog.sourceEventIds
  });
  const handoffMaterialBytes = canonicalSpecialistHandoffMaterialBytes(handoffMaterial);

  return Object.freeze({
    artifact,
    artifactHash,
    artifactBytes: Buffer.from(artifactBytes),
    handoffMaterial,
    handoffMaterialBytes: Buffer.from(handoffMaterialBytes)
  });
}

function normalizeInput(input: ExecuteSourcedInvestigationWorkflowInput): ExecuteSourcedInvestigationWorkflowInput {
  const normalized = normalizeSpecialistJsonValue({
    runType: input.runType,
    runId: input.runId,
    taskId: input.taskId,
    promptArtifactHash: input.promptArtifactHash
  }, "Sourced investigation identity") as Record<string, unknown>;
  if (
    (normalized.runType !== "timeline-builder" && normalized.runType !== "contradiction-finder") ||
    typeof normalized.runId !== "string" || normalized.runId.length === 0 ||
    typeof normalized.taskId !== "string" || normalized.taskId.length === 0 ||
    typeof normalized.promptArtifactHash !== "string" || !isHash(normalized.promptArtifactHash)
  ) {
    throw new Error("Sourced investigation workflow identity is invalid.");
  }
  if (!Buffer.isBuffer(input.promptArtifactBytes) || hashBytes(input.promptArtifactBytes) !== normalized.promptArtifactHash) {
    throw new Error("Sourced investigation prompt bytes do not match the exact prompt artifact hash.");
  }
  if (!Array.isArray(input.contextPacks) || input.contextPacks.length === 0) {
    throw new Error("Sourced investigation workflow requires resolved context packs.");
  }
  if (typeof input.artifactStore?.put !== "function" || typeof input.artifactStore?.get !== "function") {
    throw new Error("Sourced investigation workflow requires exact content-addressed artifact storage.");
  }
  if (
    input.execution === undefined ||
    !["local", "fake", "remote"].includes(input.execution.mode) ||
    typeof input.execution.invoke !== "function"
  ) {
    throw new Error("Sourced investigation workflow execution mode is invalid.");
  }
  return Object.freeze({
    runType: normalized.runType,
    runId: normalized.runId,
    taskId: normalized.taskId,
    promptArtifactHash: normalized.promptArtifactHash,
    promptArtifactBytes: Buffer.from(input.promptArtifactBytes),
    contextPacks: Object.freeze([...input.contextPacks]),
    artifactStore: input.artifactStore,
    execution: input.execution
  }) as ExecuteSourcedInvestigationWorkflowInput;
}

function assertExactContextPackIdentities(
  runType: SourcedInvestigationRunType,
  refs: readonly ContextPackRef[]
): void {
  const ids = refs.map((ref) => ref.contextPackId);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Sourced investigation context contains a duplicate context-pack identity.");
  }
  for (const required of ["evidence-summary.v1", "accepted-graph-projection.v1"] as const) {
    if (!ids.includes(required)) {
      throw new Error(`Sourced investigation context is missing ${required}.`);
    }
  }
  if (runType === "contradiction-finder" && !ids.includes("timeline-draft-summary.v1")) {
    throw new Error("Contradiction context is missing timeline-draft-summary.v1.");
  }
}

function buildSourceCatalog(contextPacks: readonly ResolvedContextPack[]): SourceCatalog {
  const evidence = new Map<string, EvidenceCitation>();
  const assertions = new Map<string, AssertionCitation>();
  const prrEvents = new Map<string, PrrEventCitation>();
  const timelineItems = new Map<string, TimelineCitation>();
  const sourceEventIds = new Set<string>();

  for (const pack of contextPacks) {
    for (const eventId of pack.ref.sourceEventIds ?? []) addEventId(sourceEventIds, eventId);
    const payload = record(pack.payload, `${pack.ref.contextPackId} payload`);
    if (pack.ref.contextPackId === "evidence-summary.v1") {
      for (const value of array(payload.items, "evidence-summary items")) {
        const item = record(value, "evidence-summary item");
        const citation = Object.freeze({
          evidenceId: text(item.evidenceId, "evidenceId"),
          contentHash: contentHash(item.contentHash, "evidence contentHash"),
          ingestionEventId: eventId(item.ingestionEventId, "evidence ingestionEventId")
        });
        addUnique(evidence, citation.evidenceId, citation, "evidence");
        sourceEventIds.add(citation.ingestionEventId);
      }
    }
    if (pack.ref.contextPackId === "accepted-graph-projection.v1") {
      const items = record(payload.items, "accepted graph items");
      for (const value of array(items.assertions, "accepted graph assertions")) {
        const item = record(value, "accepted graph assertion");
        const citation = Object.freeze({
          assertionId: text(item.assertionId, "assertionId"),
          evidenceId: text(item.evidenceId, "assertion evidenceId"),
          evidenceContentHash: contentHash(item.evidenceContentHash, "assertion evidenceContentHash"),
          proposedByEventId: eventId(item.proposedByEventId, "assertion proposedByEventId"),
          acceptedByEventId: eventId(item.acceptedByEventId, "assertion acceptedByEventId"),
          sourceEventIds: Object.freeze(array(item.sourceEventIds, "assertion sourceEventIds").map((id) => eventId(id, "assertion sourceEventId"))),
          ...(item.rowHash === undefined ? {} : { rowHash: contentHash(item.rowHash, "assertion rowHash") })
        });
        addUnique(assertions, citation.assertionId, citation, "assertion");
        sourceEventIds.add(citation.proposedByEventId);
        sourceEventIds.add(citation.acceptedByEventId);
        for (const id of citation.sourceEventIds) sourceEventIds.add(id);
      }
    }
    if (pack.ref.contextPackId === "prr-read-model.v1") {
      for (const value of optionalArray(payload.diagnostics, "PRR diagnostics")) {
        const item = record(value, "PRR diagnostic");
        mergePrrEvent(prrEvents, {
          eventId: eventId(item.eventId, "PRR eventId"),
          ...(item.type === undefined ? {} : { type: text(item.type, "PRR event type") }),
          ...(item.occurredAt === undefined ? {} : { occurredAt: text(item.occurredAt, "PRR event occurredAt") }),
          contentHashes: Object.freeze([])
        });
      }
      const requestStream = payload.requestStream === undefined ? undefined : record(payload.requestStream, "PRR requestStream");
      for (const value of optionalArray(requestStream?.sourceEventIds, "PRR sourceEventIds")) {
        mergePrrEvent(prrEvents, { eventId: eventId(value, "PRR sourceEventId"), contentHashes: Object.freeze([]) });
      }
      if (payload.sourceRefs !== undefined) {
        const refs = record(payload.sourceRefs, "PRR sourceRefs");
        for (const value of [...optionalArray(refs.evidence, "PRR evidence refs"), ...optionalArray(refs.correspondence, "PRR correspondence refs")]) {
          const item = record(value, "PRR hash ref");
          mergePrrEvent(prrEvents, {
            eventId: eventId(item.sourceEventId, "PRR hash sourceEventId"),
            contentHashes: Object.freeze([contentHash(item.contentHash, "PRR contentHash")])
          });
        }
      }
      for (const id of prrEvents.keys()) sourceEventIds.add(id);
    }
    if (pack.ref.contextPackId === "timeline-draft-summary.v1") {
      for (const value of optionalArray(payload.items, "timeline summary items")) {
        const item = record(value, "timeline summary item");
        const hashes = [
          ...(item.artifactHash === undefined ? [] : [contentHash(item.artifactHash, "timeline artifactHash")]),
          ...(pack.ref.artifactHashes ?? [])
        ];
        const citation = Object.freeze({
          itemId: text(item.itemId, "timeline itemId"),
          artifactHashes: uniqueSorted(hashes)
        });
        addUnique(timelineItems, citation.itemId, citation, "timeline item");
      }
    }
  }

  const allRefs = new Set<string>([
    ...evidence.keys(),
    ...assertions.keys(),
    ...prrEvents.keys(),
    ...timelineItems.keys()
  ]);
  return Object.freeze({
    evidence,
    assertions,
    prrEvents,
    timelineItems,
    sourceEventIds: Object.freeze([...sourceEventIds].sort()),
    allRefs
  });
}

function buildTimelineArtifact(
  input: ExecuteSourcedInvestigationWorkflowInput,
  contextPackRefs: readonly ContextPackRef[],
  catalog: SourceCatalog,
  rawOutput: unknown
): SourcedTimelineArtifact {
  const envelope = validateProductionSpecialistProviderOutput({ runType: "timeline-builder", value: rawOutput });
  if (envelope.runType !== "timeline-builder") throw new Error("Timeline output type is invalid.");
  const output: TimelineBuilderSourcedTimelineOutput = envelope.value;
  const itemIds = new Set<string>();
  const items = output.timelineItems.map((item): SourcedTimelineArtifactItem => {
    if (itemIds.has(item.itemId)) throw new Error("Timeline item IDs must be stable and unique.");
    itemIds.add(item.itemId);
    const evidence = item.evidenceRefs.map((ref) => requiredCatalogRef(catalog.evidence, ref, "timeline evidence"));
    const assertions = item.assertionRefs.map((ref) => requiredCatalogRef(catalog.assertions, ref, "timeline assertion"));
    const prrEvents = item.prrEventRefs.map((ref) => requiredCatalogRef(catalog.prrEvents, ref, "timeline PRR event"));
    const citedRefs = new Set([...item.evidenceRefs, ...item.assertionRefs, ...item.prrEventRefs]);
    if (citedRefs.size === 0) throw new Error("Timeline item requires at least one exact source ref; unsourced items are rejected.");
    const expectedHashes = uniqueSorted([
      ...evidence.map((citation) => citation.contentHash),
      ...assertions.map((citation) => citation.evidenceContentHash),
      ...prrEvents.flatMap((citation) => citation.contentHashes)
    ]);
    if (expectedHashes.length === 0 || !sameStringSet(item.contentHashRefs, expectedHashes)) {
      throw new Error("Timeline content-hash refs must exactly match cited source provenance.");
    }
    if (
      item.uncertaintyCategories.length > 0 &&
      (item.uncertaintyNotes.length === 0 || item.uncertaintySourceRefs.length === 0)
    ) {
      throw new Error("Timeline uncertainty requires exact notes and source refs.");
    }
    for (const ref of item.uncertaintySourceRefs) {
      if (!citedRefs.has(ref)) throw new Error("Timeline uncertainty source ref is not an exact item citation.");
    }
    return deepFreeze({
      itemId: item.itemId,
      ...(item.date === undefined ? {} : { date: item.date }),
      ...(item.dateRange === undefined ? {} : { dateRange: { ...item.dateRange } }),
      precision: item.precision,
      summary: item.summary,
      evidence,
      assertions,
      prrEvents,
      contentHashRefs: expectedHashes,
      uncertainty: {
        categories: [...item.uncertaintyCategories],
        notes: [...item.uncertaintyNotes],
        sourceRefs: [...item.uncertaintySourceRefs]
      }
    }) as SourcedTimelineArtifactItem;
  });
  const omittedSources = output.omittedSources.map((omission) => {
    if (!catalog.allRefs.has(omission.sourceRef)) {
      throw new Error("Timeline omitted-source reason references an unknown source.");
    }
    return Object.freeze({ ...omission });
  });
  return deepFreeze({
    schemaVersion: "sourced-timeline-artifact.v1",
    runId: input.runId,
    taskId: input.taskId,
    truthBoundary: {
      advisoryOnly: true,
      acceptedGraphMutationAllowed: false,
      publicationAllowed: false
    },
    items,
    omittedSources,
    omissionReasons: [...output.omissionReasons],
    unresolvedPrompts: [...output.unresolvedPrompts],
    contextPackRefs
  }) as SourcedTimelineArtifact;
}

function buildContradictionDossier(
  input: ExecuteSourcedInvestigationWorkflowInput,
  contextPackRefs: readonly ContextPackRef[],
  catalog: SourceCatalog,
  rawOutput: unknown
): ContradictionCandidateDossier {
  const envelope = validateProductionSpecialistProviderOutput({ runType: "contradiction-finder", value: rawOutput });
  if (envelope.runType !== "contradiction-finder") throw new Error("Contradiction output type is invalid.");
  const output: ContradictionFinderCandidatesOutput = envelope.value;
  const candidateIds = new Set<string>();
  const candidates = output.candidates.map((candidate): ContradictionCandidateArtifact => {
    if (candidateIds.has(candidate.candidateId)) throw new Error("Contradiction candidate IDs must be stable and unique.");
    candidateIds.add(candidate.candidateId);
    const comparedSourceRefs = [...candidate.comparedSourceRefs];
    if (new Set(comparedSourceRefs).size < 2) {
      throw new Error("Contradiction comparison requires at least two distinct exact source refs.");
    }
    for (const ref of comparedSourceRefs) {
      if (!catalog.allRefs.has(ref)) throw new Error("Contradiction comparison references an unknown exact source.");
    }
    const compared = new Set(comparedSourceRefs);
    const evidence = candidate.evidenceIds.map((ref) => requiredComparedRef(catalog.evidence, compared, ref, "contradiction evidence"));
    const assertions = candidate.assertionIds.map((ref) => requiredComparedRef(catalog.assertions, compared, ref, "contradiction assertion"));
    const prrEvents = candidate.prrEventRefs.map((ref) => requiredComparedRef(catalog.prrEvents, compared, ref, "contradiction PRR event"));
    const timelineItems = candidate.timelineItemIds.map((ref) => requiredComparedRef(catalog.timelineItems, compared, ref, "contradiction timeline item"));
    const expectedEvidenceHashes = uniqueSorted(evidence.map((citation) => citation.contentHash));
    if (!sameStringSet(candidate.evidenceContentHashes, expectedEvidenceHashes)) {
      throw new Error("Contradiction evidence content hashes must exactly match cited evidence.");
    }
    for (const ref of candidate.uncertaintyRefs) {
      if (!compared.has(ref)) throw new Error("Contradiction uncertainty ref is not one of the exact compared sources.");
    }
    if (candidate.alternativeExplanations.length === 0 || candidate.requestedFollowupEvidence.length === 0) {
      throw new Error("Contradiction candidates require alternative explanations and requested follow-up evidence.");
    }
    return deepFreeze({
      candidateId: candidate.candidateId,
      comparedSourceRefs,
      evidence,
      assertions,
      prrEvents,
      timelineItemIds: timelineItems.map((item) => item.itemId),
      evidenceContentHashes: expectedEvidenceHashes,
      category: candidate.category,
      rationale: candidate.rationale,
      confidence: candidate.confidence,
      confidenceCaveat: candidate.confidenceCaveat,
      uncertaintyRefs: [...candidate.uncertaintyRefs],
      alternativeExplanations: [...candidate.alternativeExplanations],
      requestedFollowupEvidence: [...candidate.requestedFollowupEvidence],
      requiredReviewerAction: candidate.requiredReviewerAction
    }) as ContradictionCandidateArtifact;
  });
  return deepFreeze({
    schemaVersion: "contradiction-candidate-dossier.v1",
    runId: input.runId,
    taskId: input.taskId,
    truthBoundary: {
      advisoryOnly: true,
      canRejectAssertion: false,
      canContestAssertion: false,
      canSupersedeAssertion: false,
      canRelinkClaim: false,
      acceptedGraphMutationAllowed: false,
      publicationAllowed: false
    },
    candidates,
    contextPackRefs
  }) as ContradictionCandidateDossier;
}

async function putAndReadExact(
  store: SourcedInvestigationArtifactStore,
  expectedHash: ContentHash,
  bytes: Buffer
): Promise<void> {
  const receipt = normalizeSpecialistJsonValue(
    await store.put(Buffer.from(bytes)),
    "Sourced investigation artifact receipt"
  ) as Record<string, unknown>;
  if (
    Object.keys(receipt).sort().join(",") !== "contentHash,sizeBytes" ||
    receipt.contentHash !== expectedHash ||
    receipt.sizeBytes !== bytes.byteLength
  ) {
    throw new Error("Sourced investigation artifact store returned a mismatched receipt.");
  }
  const readback = await store.get(expectedHash);
  if (!Buffer.isBuffer(readback) || !readback.equals(bytes)) {
    throw new Error("Sourced investigation artifact exact-byte readback failed.");
  }
}

function mergePrrEvent(map: Map<string, PrrEventCitation>, value: PrrEventCitation): void {
  const existing = map.get(value.eventId);
  if (existing === undefined) {
    map.set(value.eventId, Object.freeze({
      ...value,
      contentHashes: uniqueSorted(value.contentHashes)
    }));
    return;
  }
  if (
    existing.type !== undefined && value.type !== undefined && existing.type !== value.type ||
    existing.occurredAt !== undefined && value.occurredAt !== undefined && existing.occurredAt !== value.occurredAt
  ) {
    throw new Error("PRR source event provenance conflicts across context rows.");
  }
  map.set(value.eventId, Object.freeze({
    eventId: value.eventId,
    ...((existing.type ?? value.type) === undefined ? {} : { type: existing.type ?? value.type }),
    ...((existing.occurredAt ?? value.occurredAt) === undefined
      ? {}
      : { occurredAt: existing.occurredAt ?? value.occurredAt }),
    contentHashes: uniqueSorted([...existing.contentHashes, ...value.contentHashes])
  }));
}

function addUnique<T>(map: Map<string, T>, id: string, value: T, label: string): void {
  if (map.has(id)) throw new Error(`Duplicate ${label} source identity.`);
  map.set(id, value);
}

function requiredCatalogRef<T>(map: ReadonlyMap<string, T>, ref: string, label: string): T {
  const value = map.get(ref);
  if (value === undefined) throw new Error(`${label} ref is not grounded in verified context.`);
  return value;
}

function requiredComparedRef<T>(
  map: ReadonlyMap<string, T>,
  compared: ReadonlySet<string>,
  ref: string,
  label: string
): T {
  if (!compared.has(ref)) throw new Error(`${label} must be included in comparedSourceRefs.`);
  return requiredCatalogRef(map, ref, label);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a plain object.`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}

function optionalArray(value: unknown, label: string): readonly unknown[] {
  return value === undefined ? Object.freeze([]) : array(value, label);
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be non-empty text.`);
  return value;
}

function eventId(value: unknown, label: string): string {
  const id = text(value, label);
  if (!/^evt_[a-zA-Z0-9_-]+$/.test(id)) throw new Error(`${label} must be an event ID.`);
  return id;
}

function addEventId(target: Set<string>, value: unknown): void {
  target.add(eventId(value, "context sourceEventId"));
}

function contentHash(value: unknown, label: string): ContentHash {
  if (typeof value !== "string" || !isHash(value)) throw new Error(`${label} must be a SHA-256 hash.`);
  return value;
}

function isHash(value: string): value is ContentHash {
  return /^sha256:[a-f0-9]{64}$/.test(value);
}

function hashBytes(bytes: Buffer): ContentHash {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function uniqueSorted<T extends string>(values: readonly T[]): readonly T[] {
  return Object.freeze([...new Set(values)].sort()) as readonly T[];
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return leftSet.size === left.length && rightSet.size === right.length &&
    leftSet.size === rightSet.size && [...leftSet].every((value) => rightSet.has(value));
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
