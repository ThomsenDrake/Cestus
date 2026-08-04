import { createHash } from "node:crypto";
import { z } from "zod";
import type { KnowledgeEvent, KnowledgeEventOf } from "../../ontology/src/contracts.js";
import {
  buildGovernanceExportPreview,
  governanceExportApprovalIds,
  type GovernanceExportApprovalId,
  type GovernanceExportExclusionCategory,
  type GovernanceExportPreviewDto
} from "../../ontology/src/governance-export-preview.js";
import type { ContextPackRef } from "./context-packs.js";
import {
  buildSpecialistHandoffMaterial,
  canonicalSpecialistHandoffJson,
  type SpecialistHandoffMaterial
} from "./specialist-handoff-manifest.js";
import type { SpecialistHandoffManifestStore } from "./specialist-runner-kernel.js";
import { assertAgentSecretSafeText } from "./secret-safety.js";

type ContentHash = `sha256:${string}`;

export interface ReportAcceptedAssertionInput {
  readonly assertionId: string;
  readonly evidenceId: string;
  readonly evidenceContentHash: ContentHash;
  readonly proposedByEventId: string;
  readonly acceptedByEventId: string;
  readonly sourceEventIds: readonly string[];
  readonly safeStatement: string;
}

export interface ReportReviewedClaimInput {
  readonly claimId: string;
  readonly evidenceId: string;
  readonly evidenceContentHash: ContentHash;
  readonly reviewedByEventId: string;
  readonly sourceEventIds: readonly string[];
  readonly safeStatement: string;
}

export interface ReportPassageInput {
  readonly passageId: string;
  readonly sectionId: string;
  readonly sectionTitle: string;
  readonly text: string;
  readonly sourceRefs: readonly string[];
}

export interface ReportUncertaintyNoteInput {
  readonly noteId: string;
  readonly summary: string;
  readonly sourceRefs: readonly string[];
}

export interface ReportContradictionCandidateInput {
  readonly candidateId: string;
  readonly rationale: string;
  readonly confidenceCaveat: string;
  readonly sourceRefs: readonly string[];
}

export interface AssembleLocalReportPacketInput {
  readonly runId: string;
  readonly taskId: string;
  readonly generatedAt: string;
  readonly governanceEvents: readonly KnowledgeEvent[];
  readonly requestedEvidenceIds: readonly string[];
  readonly acceptedAssertions: readonly ReportAcceptedAssertionInput[];
  readonly reviewedClaims: readonly ReportReviewedClaimInput[];
  readonly passages: readonly ReportPassageInput[];
  readonly uncertaintyNotes: readonly ReportUncertaintyNoteInput[];
  readonly contradictionCandidates: readonly ReportContradictionCandidateInput[];
}

export interface ReportCitationMapEntry {
  readonly passageId: string;
  readonly acceptedAssertionRefs: readonly string[];
  readonly reviewedClaimRefs: readonly string[];
  readonly evidenceCitations: readonly {
    readonly evidenceId: string;
    readonly contentHash: ContentHash;
  }[];
  readonly sourceEventIds: readonly string[];
}

export interface ReportRiskNote {
  readonly riskNoteId: string;
  readonly kind: "contradiction" | "uncertainty";
  readonly summary: string;
  readonly caveat?: string;
  readonly sourceRefs: readonly string[];
}

export interface ReportSensitiveOptInRequirement {
  readonly evidenceRef: string;
  readonly category: GovernanceExportExclusionCategory;
  readonly approvalId: GovernanceExportApprovalId;
}

export interface LocalReportPacket {
  readonly schemaVersion: "local-report-packet.v1";
  readonly runId: string;
  readonly taskId: string;
  readonly generatedAt: string;
  readonly truthBoundary: {
    readonly localDerivativeOnly: true;
    readonly advisoryOnly: true;
    readonly exportAllowed: false;
    readonly publicationAllowed: false;
    readonly sensitiveOptInConsumed: false;
  };
  readonly outline: readonly { readonly sectionId: string; readonly title: string }[];
  readonly draftSections: readonly {
    readonly sectionId: string;
    readonly title: string;
    readonly passages: readonly {
      readonly passageId: string;
      readonly text: string;
      readonly sourceRefs: readonly string[];
    }[];
  }[];
  readonly citationMap: readonly ReportCitationMapEntry[];
  readonly riskNotes: readonly ReportRiskNote[];
  readonly excludedEvidenceList: readonly {
    readonly evidenceRef: string;
    readonly categories: readonly GovernanceExportExclusionCategory[];
    readonly approvalIds: readonly GovernanceExportApprovalId[];
  }[];
  readonly publicSafePreview: GovernanceExportPreviewDto;
  readonly sensitiveOptInRequirements: readonly ReportSensitiveOptInRequirement[];
}

export interface AgentReportPublicSafePreviewDto {
  readonly schemaVersion: "agent-report-public-safe-preview.v1";
  readonly mode: "preview-only";
  readonly includedEvidenceRefs: readonly string[];
  readonly excludedEvidence: readonly {
    readonly evidenceRef: string;
    readonly categories: readonly GovernanceExportExclusionCategory[];
    readonly approvalIds: readonly GovernanceExportApprovalId[];
  }[];
  readonly sensitiveOptInRequirements: readonly ReportSensitiveOptInRequirement[];
}

export interface ExecuteLocalReportBuilderWorkflowInput extends AssembleLocalReportPacketInput {
  readonly contextPackRefs: readonly ContextPackRef[];
  readonly promptArtifactHash?: ContentHash;
  readonly artifactStore: SpecialistHandoffManifestStore;
}

export interface ExecuteLocalReportBuilderWorkflowResult {
  readonly packet: LocalReportPacket;
  readonly packetBytes: Buffer;
  readonly packetHash: ContentHash;
  readonly handoffMaterial: SpecialistHandoffMaterial;
}

const safeId = z.string().min(1).regex(/^[a-zA-Z][a-zA-Z0-9._:-]*$/);
const evidenceId = z.string().regex(/^ev_[a-zA-Z0-9_-]+$/);
const contentHash = z.string().regex(/^sha256:[a-f0-9]{64}$/).transform((value) => value as ContentHash);
const eventId = z.string().regex(/^evt_[a-zA-Z0-9_-]+$/);
const exclusionCategory = z.enum([
  "private",
  "source-identity",
  "credential-risk",
  "export-restricted",
  "other-unsafe",
  "quarantine",
  "tombstoned"
]);
const approvalId = z.enum(governanceExportApprovalIds);
const previewApprovalSchema = z.object({
  category: exclusionCategory,
  approvalId,
  optInAvailableInPreview: z.boolean()
}).strict();
const governancePreviewSchema = z.object({
  schemaVersion: z.literal("governance-export-preview.v1"),
  mode: z.literal("preview-only"),
  includedEvidence: z.array(z.object({
    evidenceRef: evidenceId,
    governanceEventRefs: z.array(eventId)
  }).strict()),
  excludedEvidence: z.array(z.object({
    evidenceRef: evidenceId,
    governanceEventRefs: z.array(eventId),
    requiredApprovals: z.array(previewApprovalSchema)
  }).strict()),
  diagnostics: z.array(z.object({
    code: z.enum(["classification-missing", "evidence-state-missing"]),
    evidenceRef: evidenceId,
    repairHint: z.enum(["record-governance-classification", "verify-evidence-reference"])
  }).strict())
}).strict();
const sensitiveRequirementSchema = z.object({
  evidenceRef: evidenceId,
  category: exclusionCategory,
  approvalId
}).strict();
const packetSchema = z.object({
  schemaVersion: z.literal("local-report-packet.v1"),
  runId: z.string().regex(/^run_[a-zA-Z0-9_-]+$/),
  taskId: z.string().regex(/^task_[a-zA-Z0-9_-]+$/),
  generatedAt: z.string().datetime(),
  truthBoundary: z.object({
    localDerivativeOnly: z.literal(true),
    advisoryOnly: z.literal(true),
    exportAllowed: z.literal(false),
    publicationAllowed: z.literal(false),
    sensitiveOptInConsumed: z.literal(false)
  }).strict(),
  outline: z.array(z.object({ sectionId: safeId, title: z.string().min(1) }).strict()),
  draftSections: z.array(z.object({
    sectionId: safeId,
    title: z.string().min(1),
    passages: z.array(z.object({
      passageId: safeId,
      text: z.string().min(1),
      sourceRefs: z.array(safeId).min(1)
    }).strict())
  }).strict()),
  citationMap: z.array(z.object({
    passageId: safeId,
    acceptedAssertionRefs: z.array(safeId),
    reviewedClaimRefs: z.array(safeId),
    evidenceCitations: z.array(z.object({ evidenceId, contentHash }).strict()).min(1),
    sourceEventIds: z.array(eventId).min(1)
  }).strict()),
  riskNotes: z.array(z.object({
    riskNoteId: safeId,
    kind: z.enum(["contradiction", "uncertainty"]),
    summary: z.string().min(1),
    caveat: z.string().min(1).optional(),
    sourceRefs: z.array(safeId)
  }).strict()),
  excludedEvidenceList: z.array(z.object({
    evidenceRef: evidenceId,
    categories: z.array(exclusionCategory).min(1),
    approvalIds: z.array(approvalId).min(1)
  }).strict()),
  publicSafePreview: governancePreviewSchema,
  sensitiveOptInRequirements: z.array(sensitiveRequirementSchema)
}).strict();

export function assembleLocalReportPacket(input: AssembleLocalReportPacketInput): LocalReportPacket {
  validateIdentity(input.runId, /^run_[a-zA-Z0-9_-]+$/, "runId");
  validateIdentity(input.taskId, /^task_[a-zA-Z0-9_-]+$/, "taskId");
  if (!Number.isFinite(Date.parse(input.generatedAt))) throw new Error("Report packet generatedAt must be an ISO timestamp.");
  const requestedEvidenceIds = unique(input.requestedEvidenceIds.map((value) =>
    validateIdentity(value, /^ev_[a-zA-Z0-9_-]+$/, "evidenceId")
  )).sort();
  const sources = new Map<string, {
    readonly kind: "accepted-assertion" | "reviewed-claim";
    readonly evidenceId: string;
    readonly contentHash: ContentHash;
    readonly sourceEventIds: readonly string[];
  }>();
  for (const source of input.acceptedAssertions) {
    registerSource(sources, {
      ref: validateIdentity(source.assertionId, /^[a-zA-Z][a-zA-Z0-9._:-]*$/, "assertionId"),
      kind: "accepted-assertion",
      evidenceId: validateIdentity(source.evidenceId, /^ev_[a-zA-Z0-9_-]+$/, "evidenceId"),
      contentHash: validateHash(source.evidenceContentHash),
      sourceEventIds: validateEventIds([
        source.proposedByEventId,
        source.acceptedByEventId,
        ...source.sourceEventIds
      ]),
      statement: source.safeStatement
    });
  }
  for (const source of input.reviewedClaims) {
    registerSource(sources, {
      ref: validateIdentity(source.claimId, /^[a-zA-Z][a-zA-Z0-9._:-]*$/, "claimId"),
      kind: "reviewed-claim",
      evidenceId: validateIdentity(source.evidenceId, /^ev_[a-zA-Z0-9_-]+$/, "evidenceId"),
      contentHash: validateHash(source.evidenceContentHash),
      sourceEventIds: validateEventIds([source.reviewedByEventId, ...source.sourceEventIds]),
      statement: source.safeStatement
    });
  }
  const requestedEvidenceSet = new Set(requestedEvidenceIds);
  for (const source of sources.values()) {
    if (!requestedEvidenceSet.has(source.evidenceId)) {
      throw new Error("Report citations must remain within the exact governed evidence selection.");
    }
    const ingested = input.governanceEvents.filter((event): event is KnowledgeEventOf<"evidence.ingested"> =>
      event.type === "evidence.ingested" && event.payload.evidenceId === source.evidenceId
    );
    if (ingested.length !== 1 || ingested[0]!.payload.contentHash !== source.contentHash) {
      throw new Error("Report citation content hashes must match exact ingested evidence provenance.");
    }
  }

  const sectionOrder: string[] = [];
  const sections = new Map<string, { title: string; passages: Array<{ passageId: string; text: string; sourceRefs: readonly string[] }> }>();
  const citationMap: ReportCitationMapEntry[] = [];
  const passageIds = new Set<string>();
  for (const passage of input.passages) {
    const passageId = validateIdentity(passage.passageId, /^[a-zA-Z][a-zA-Z0-9._:-]*$/, "passageId");
    if (passageIds.has(passageId)) throw new Error("Report passage identities must be unique.");
    passageIds.add(passageId);
    const sectionId = validateIdentity(passage.sectionId, /^[a-zA-Z][a-zA-Z0-9._:-]*$/, "sectionId");
    assertSafeText(passage.sectionTitle, "report section title");
    assertSafeText(passage.text, "report passage");
    const sourceRefs = unique(passage.sourceRefs.map((value) =>
      validateIdentity(value, /^[a-zA-Z][a-zA-Z0-9._:-]*$/, "sourceRef")
    ));
    const resolved = sourceRefs.map((ref) => sources.get(ref));
    if (sourceRefs.length === 0 || resolved.some((value) => value === undefined)) {
      throw new Error("Every factual report passage requires an exact accepted-assertion or reviewed-claim citation.");
    }
    const exactSources = resolved as Array<NonNullable<(typeof resolved)[number]>>;
    const section = sections.get(sectionId);
    if (section === undefined) {
      sectionOrder.push(sectionId);
      sections.set(sectionId, { title: passage.sectionTitle, passages: [{ passageId, text: passage.text, sourceRefs }] });
    } else {
      if (section.title !== passage.sectionTitle) throw new Error("Report section identity has conflicting titles.");
      section.passages.push({ passageId, text: passage.text, sourceRefs });
    }
    citationMap.push(Object.freeze({
      passageId,
      acceptedAssertionRefs: Object.freeze(sourceRefs.filter((ref) => sources.get(ref)?.kind === "accepted-assertion")),
      reviewedClaimRefs: Object.freeze(sourceRefs.filter((ref) => sources.get(ref)?.kind === "reviewed-claim")),
      evidenceCitations: Object.freeze(uniqueBy(
        exactSources.map((source) => ({ evidenceId: source.evidenceId, contentHash: source.contentHash })),
        (item) => `${item.evidenceId}:${item.contentHash}`
      ).map((item) => Object.freeze(item))),
      sourceEventIds: Object.freeze(unique(exactSources.flatMap((source) => source.sourceEventIds)).sort())
    }));
  }

  const riskNotes: ReportRiskNote[] = [];
  for (const candidate of [...input.contradictionCandidates].sort((a, b) => a.candidateId.localeCompare(b.candidateId))) {
    assertSafeText(candidate.rationale, "report contradiction rationale");
    assertSafeText(candidate.confidenceCaveat, "report contradiction caveat");
    riskNotes.push(Object.freeze({
      riskNoteId: validateIdentity(candidate.candidateId, /^[a-zA-Z][a-zA-Z0-9._:-]*$/, "candidateId"),
      kind: "contradiction",
      summary: candidate.rationale,
      caveat: candidate.confidenceCaveat,
      sourceRefs: Object.freeze(validateRiskSourceRefs(candidate.sourceRefs, sources))
    }));
  }
  for (const note of [...input.uncertaintyNotes].sort((a, b) => a.noteId.localeCompare(b.noteId))) {
    assertSafeText(note.summary, "report uncertainty note");
    riskNotes.push(Object.freeze({
      riskNoteId: validateIdentity(note.noteId, /^[a-zA-Z][a-zA-Z0-9._:-]*$/, "noteId"),
      kind: "uncertainty",
      summary: note.summary,
      sourceRefs: Object.freeze(validateRiskSourceRefs(note.sourceRefs, sources))
    }));
  }
  if (new Set(riskNotes.map((item) => item.riskNoteId)).size !== riskNotes.length) {
    throw new Error("Report risk note identities must be unique.");
  }

  const publicSafePreview = buildGovernanceExportPreview(input.governanceEvents, requestedEvidenceIds);
  const excludedEvidenceList = publicSafePreview.excludedEvidence.map((item) => Object.freeze({
    evidenceRef: item.evidenceRef,
    categories: Object.freeze(unique(item.requiredApprovals.map((approval) => approval.category)).sort()),
    approvalIds: Object.freeze(unique(item.requiredApprovals.map((approval) => approval.approvalId)).sort())
  }));
  const sensitiveOptInRequirements = publicSafePreview.excludedEvidence.flatMap((item) =>
    item.requiredApprovals
      .filter((approval) => approval.optInAvailableInPreview)
      .map((approval) => Object.freeze({
        evidenceRef: item.evidenceRef,
        category: approval.category,
        approvalId: approval.approvalId
      }))
  );
  const packet = {
    schemaVersion: "local-report-packet.v1" as const,
    runId: input.runId,
    taskId: input.taskId,
    generatedAt: input.generatedAt,
    truthBoundary: Object.freeze({
      localDerivativeOnly: true as const,
      advisoryOnly: true as const,
      exportAllowed: false as const,
      publicationAllowed: false as const,
      sensitiveOptInConsumed: false as const
    }),
    outline: Object.freeze(sectionOrder.map((sectionId) => Object.freeze({
      sectionId,
      title: sections.get(sectionId)!.title
    }))),
    draftSections: Object.freeze(sectionOrder.map((sectionId) => {
      const section = sections.get(sectionId)!;
      return Object.freeze({
        sectionId,
        title: section.title,
        passages: Object.freeze(section.passages.map((passage) => Object.freeze({
          ...passage,
          sourceRefs: Object.freeze([...passage.sourceRefs])
        })))
      });
    })),
    citationMap: Object.freeze(citationMap),
    riskNotes: Object.freeze(riskNotes),
    excludedEvidenceList: Object.freeze(excludedEvidenceList),
    publicSafePreview,
    sensitiveOptInRequirements: Object.freeze(sensitiveOptInRequirements)
  };
  return parseLocalReportPacket(packet);
}

export function parseLocalReportPacket(value: unknown): LocalReportPacket {
  const parsed = packetSchema.parse(value);
  for (const text of collectNarrativeText(parsed)) assertSafeText(text, "local report packet");
  validatePacketSemantics(parsed);
  return deepFreeze(parsed) as LocalReportPacket;
}

export function serializeLocalReportPacket(value: LocalReportPacket): Buffer {
  return canonicalSpecialistHandoffJson(parseLocalReportPacket(value));
}

export function publicSafeReportPreviewFromPacket(value: LocalReportPacket): AgentReportPublicSafePreviewDto {
  const packet = parseLocalReportPacket(value);
  return deepFreeze({
    schemaVersion: "agent-report-public-safe-preview.v1",
    mode: "preview-only",
    includedEvidenceRefs: packet.publicSafePreview.includedEvidence.map((item) => item.evidenceRef),
    excludedEvidence: packet.excludedEvidenceList.map((item) => ({
      evidenceRef: item.evidenceRef,
      categories: [...item.categories],
      approvalIds: [...item.approvalIds]
    })),
    sensitiveOptInRequirements: packet.sensitiveOptInRequirements.map((item) => ({ ...item }))
  });
}

export async function executeLocalReportBuilderWorkflow(
  input: ExecuteLocalReportBuilderWorkflowInput
): Promise<ExecuteLocalReportBuilderWorkflowResult> {
  const packet = assembleLocalReportPacket(input);
  const packetBytes = serializeLocalReportPacket(packet);
  const packetHash = hashBytes(packetBytes);
  const stored = await input.artifactStore.put(Buffer.from(packetBytes));
  if (stored.contentHash !== packetHash || stored.sizeBytes !== packetBytes.byteLength) {
    throw new Error("Local report packet could not be stored exactly.");
  }
  const readback = await input.artifactStore.get(packetHash);
  if (!Buffer.isBuffer(readback) || !readback.equals(packetBytes)) {
    throw new Error("Local report packet exact-byte readback failed.");
  }
  const artifactKinds = [
    "report-outline",
    "draft-sections",
    "citation-map",
    "unresolved-risk-note",
    "excluded-evidence-list",
    "export-preview",
    "pending-export-publication-approval-request"
  ] as const;
  const sourceEventIds = unique([
    ...packet.citationMap.flatMap((entry) => entry.sourceEventIds),
    ...packet.publicSafePreview.includedEvidence.flatMap((item) => item.governanceEventRefs),
    ...packet.publicSafePreview.excludedEvidence.flatMap((item) => item.governanceEventRefs),
    ...input.contextPackRefs.flatMap((ref) => ref.sourceEventIds ?? [])
  ]).sort();
  if (sourceEventIds.length === 0) throw new Error("Local report packet requires exact source-event provenance.");
  const outputArtifacts = artifactKinds.map((artifactKind) => Object.freeze({
    artifactId: `artifact_${input.runId}_${artifactKind.replaceAll("-", "_")}`,
    artifactKind,
    schemaId: "report-builder-handoff.v1",
    artifactHash: packetHash,
    safeSummary: `Local ${artifactKind} view of the report packet; no export or publication occurred.`
  }));
  const approvalRequirements = [
    {
      approvalClass: "export-or-publication" as const,
      reason: "A separate exact human approval is required before any export or publication."
    },
    ...packet.sensitiveOptInRequirements.length === 0 ? [] : [{
      approvalClass: "human-review" as const,
      reason: `Sensitive evidence remains excluded pending ${packet.sensitiveOptInRequirements.map((item) => item.approvalId).join(", ")}.`
    }]
  ];
  const handoffMaterial = buildSpecialistHandoffMaterial({
    status: "ready-for-review",
    safeSummary: "A citation-complete local report packet and public-safe preview are ready for human review.",
    contextPackRefs: input.contextPackRefs,
    ...(input.promptArtifactHash === undefined ? {} : { promptArtifactHash: input.promptArtifactHash }),
    outputArtifacts,
    toolRequestIds: [],
    approvalRequirements,
    nextSafeActions: [{
      actionId: `action_${input.runId}_review_report_packet`,
      label: "Review the local report packet and unresolved risks",
      kind: "review",
      effect: "none",
      artifactId: outputArtifacts[0]!.artifactId
    }],
    sourceEventIds,
    relatedEventIds: sourceEventIds
  });
  return Object.freeze({ packet, packetBytes, packetHash, handoffMaterial });
}

function registerSource(
  sources: Map<string, { readonly kind: "accepted-assertion" | "reviewed-claim"; readonly evidenceId: string; readonly contentHash: ContentHash; readonly sourceEventIds: readonly string[] }>,
  source: { readonly ref: string; readonly kind: "accepted-assertion" | "reviewed-claim"; readonly evidenceId: string; readonly contentHash: ContentHash; readonly sourceEventIds: readonly string[]; readonly statement: string }
): void {
  assertSafeText(source.statement, "report source statement");
  if (sources.has(source.ref)) throw new Error("Report source identities must be unique.");
  sources.set(source.ref, Object.freeze({
    kind: source.kind,
    evidenceId: source.evidenceId,
    contentHash: source.contentHash,
    sourceEventIds: Object.freeze(unique(source.sourceEventIds).sort())
  }));
}

function validateRiskSourceRefs(
  values: readonly string[],
  sources: ReadonlyMap<string, unknown>
): string[] {
  const refs = unique(values.map((value) => validateIdentity(value, /^[a-zA-Z][a-zA-Z0-9._:-]*$/, "risk sourceRef")));
  if (refs.some((ref) => !sources.has(ref))) {
    throw new Error("Report risk notes require exact accepted-assertion or reviewed-claim references.");
  }
  return refs;
}

function validateIdentity(value: string, pattern: RegExp, label: string): string {
  if (!pattern.test(value)) throw new Error(`Report ${label} is invalid.`);
  assertSafeText(value, `report ${label}`);
  return value;
}

function validateHash(value: string): ContentHash {
  if (!/^sha256:[a-f0-9]{64}$/.test(value)) throw new Error("Report citation content hash is invalid.");
  return value as ContentHash;
}

function validateEventIds(values: readonly string[]): readonly string[] {
  const ids = unique(values.map((value) => validateIdentity(value, /^evt_[a-zA-Z0-9_-]+$/, "eventId"))).sort();
  if (ids.length === 0) throw new Error("Report citations require exact source events.");
  return Object.freeze(ids);
}

function assertSafeText(value: string, label: string): void {
  if (value.length === 0) throw new Error(`${label} must not be empty.`);
  assertAgentSecretSafeText(value, label);
}

function collectNarrativeText(packet: z.infer<typeof packetSchema>): string[] {
  return [
    ...packet.outline.map((item) => item.title),
    ...packet.draftSections.flatMap((section) => [section.title, ...section.passages.map((passage) => passage.text)]),
    ...packet.riskNotes.flatMap((note) => [note.summary, ...(note.caveat === undefined ? [] : [note.caveat])])
  ];
}

function validatePacketSemantics(packet: z.infer<typeof packetSchema>): void {
  const outlineIds = packet.outline.map((item) => item.sectionId);
  const sectionIds = packet.draftSections.map((item) => item.sectionId);
  if (new Set(outlineIds).size !== outlineIds.length || new Set(sectionIds).size !== sectionIds.length ||
    !sameStrings(outlineIds, sectionIds) || packet.outline.some((item) =>
      packet.draftSections.find((section) => section.sectionId === item.sectionId)?.title !== item.title
    )) {
    throw new Error("Local report outline and draft sections must match exactly.");
  }
  const passages = packet.draftSections.flatMap((section) => section.passages);
  const citationByPassage = new Map(packet.citationMap.map((citation) => [citation.passageId, citation] as const));
  if (citationByPassage.size !== packet.citationMap.length || passages.length !== packet.citationMap.length ||
    new Set(passages.map((passage) => passage.passageId)).size !== passages.length) {
    throw new Error("Local report citation map must contain exactly one entry per factual passage.");
  }
  for (const passage of passages) {
    const citation = citationByPassage.get(passage.passageId);
    if (citation === undefined ||
      !sameStrings(passage.sourceRefs, [...citation.acceptedAssertionRefs, ...citation.reviewedClaimRefs]) ||
      citation.acceptedAssertionRefs.length + citation.reviewedClaimRefs.length === 0) {
      throw new Error("Every factual report passage requires an exact accepted-assertion or reviewed-claim citation.");
    }
  }
  const included = packet.publicSafePreview.includedEvidence.map((item) => item.evidenceRef);
  const excluded = packet.publicSafePreview.excludedEvidence.map((item) => item.evidenceRef);
  if (new Set(included).size !== included.length || new Set(excluded).size !== excluded.length ||
    included.some((evidenceRef) => excluded.includes(evidenceRef))) {
    throw new Error("Local report public-safe preview evidence partitions must be unique and disjoint.");
  }
  const expectedExcluded = packet.publicSafePreview.excludedEvidence.map((item) => ({
    evidenceRef: item.evidenceRef,
    categories: unique(item.requiredApprovals.map((approval) => approval.category)).sort(),
    approvalIds: unique(item.requiredApprovals.map((approval) => approval.approvalId)).sort()
  }));
  if (JSON.stringify(packet.excludedEvidenceList) !== JSON.stringify(expectedExcluded)) {
    throw new Error("Local report excluded evidence list must match the public-safe preview exactly.");
  }
  const expectedOptIns = packet.publicSafePreview.excludedEvidence.flatMap((item) =>
    item.requiredApprovals.filter((approval) => approval.optInAvailableInPreview).map((approval) => ({
      evidenceRef: item.evidenceRef,
      category: approval.category,
      approvalId: approval.approvalId
    }))
  );
  if (JSON.stringify(packet.sensitiveOptInRequirements) !== JSON.stringify(expectedOptIns)) {
    throw new Error("Local report sensitive opt-in requirements must match the unchanged preview exactly.");
  }
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value)) &&
    right.every((value) => left.includes(value));
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function uniqueBy<T>(values: readonly T[], key: (value: T) => string): T[] {
  return [...new Map(values.map((value) => [key(value), value])).values()];
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function hashBytes(bytes: Buffer): ContentHash {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
